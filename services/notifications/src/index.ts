import "reflect-metadata";
import fs from "node:fs/promises";
import path from "node:path";
import {
  NotificationLogEntity,
  getDataSource,
  toIso,
  toIsoRequired,
} from "@paashupatastra/database";
import { createService, envInt, getUserIdFromHeaders, loadEnv, parseEntityId, parseUserIdFromHeaders } from "@paashupatastra/service-kit";
import { paginationQuerySchema, sendEmailNotificationSchema } from "@paashupatastra/shared-models";
import { z } from "zod";

const sendNotificationSchema = z.object({
  userId: z.coerce.number().int().positive().optional().nullable(),
  title: z.string().min(1).max(160),
  body: z.string().min(1).max(8000),
  channel: z.enum(["push", "sms", "email", "in_app"]).default("push"),
  toEmail: z.string().email().optional(),
  toPhone: z.string().optional(),
  data: z.record(z.string()).optional(),
  referenceType: z.string().max(40).optional().nullable(),
  referenceId: z.coerce.number().int().positive().optional().nullable(),
  skipLog: z.boolean().optional().default(false),
});

function serializeNotification(row: NotificationLogEntity) {
  return {
    id: row.id,
    userId: row.userId,
    channel: row.channel,
    title: row.title,
    body: row.body,
    status: row.status,
    referenceType: row.referenceType,
    referenceId: row.referenceId,
    readAt: toIso(row.readAt),
    createdAt: toIsoRequired(row.createdAt),
    isRead: Boolean(row.readAt),
  };
}

async function ensureOutboxDir(dir: string) {
  await fs.mkdir(dir, { recursive: true });
}

async function writeOutbox(dir: string, to: string, title: string, body: string) {
  await ensureOutboxDir(dir);
  const safe = to.replace(/[^a-zA-Z0-9._@+-]/g, "_");
  const file = path.join(dir, `${Date.now()}-${safe}.txt`);
  const content = [
    `To: ${to}`,
    `Subject: ${title}`,
    `At: ${new Date().toISOString()}`,
    "",
    body,
  ].join("\n");
  await fs.writeFile(file, content, "utf8");
  return file;
}

function mailCredentials() {
  const user = (process.env.FROM_MAIL ?? process.env.SMTP_USER ?? "").trim();
  const passRaw = process.env.FROM_MAIL_PASSWORD ?? process.env.SMTP_PASS ?? "";
  const pass = passRaw.replace(/\s+/g, "");
  return { user, pass };
}

async function trySmtpSend(to: string, title: string, body: string): Promise<boolean> {
  const { user, pass } = mailCredentials();
  if (!user || !pass) return false;

  const host = (process.env.SMTP_HOST ?? "smtp.gmail.com").trim();
  const port = Number(process.env.SMTP_PORT ?? 587);
  const secure = process.env.SMTP_SECURE === "true" || port === 465;

  const nodemailer = await import("nodemailer");
  const transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
  });

  await transporter.sendMail({
    from: process.env.SMTP_FROM?.trim() || `Paashupatastra <${user}>`,
    to,
    subject: title,
    text: body,
  });
  return true;
}

async function main() {
  loadEnv();
  const ds = await getDataSource();
  const logRepo = ds.getRepository(NotificationLogEntity);
  const outboxDir =
    process.env.EMAIL_OUTBOX_DIR?.trim() ||
    path.resolve(process.cwd(), "../../data/email-outbox");

  await createService({
    name: "notifications",
    port: envInt("NOTIFICATIONS_PORT", 3006),
    registerRoutes: async (app) => {
      async function deliverEmail(input: {
        userId?: number | null;
        toEmail: string;
        title: string;
        body: string;
        referenceType?: string | null;
        referenceId?: number | null;
        skipLog?: boolean;
      }) {
        let status = "queued";
        let outboxPath: string | undefined;
        let smtpSent = false;

        try {
          smtpSent = await trySmtpSend(input.toEmail, input.title, input.body);
          if (smtpSent) status = "sent";
        } catch (err) {
          app.log.error({ err }, "SMTP send failed");
          status = "smtp_failed";
        }

        if (!smtpSent) {
          outboxPath = await writeOutbox(outboxDir, input.toEmail, input.title, input.body);
          if (status === "queued") status = "outbox";
          app.log.info({ to: input.toEmail, outboxPath }, "Email written to outbox");
        }

        if (input.skipLog) {
          return {
            id: null as number | null,
            status,
            smtpSent,
            outboxPath,
            createdAt: new Date().toISOString(),
          };
        }

        const row = await logRepo.save(
          logRepo.create({
            userId: input.userId ?? null,
            channel: "email",
            title: input.title,
            body: input.body,
            status,
            referenceType: input.referenceType ?? null,
            referenceId: input.referenceId ?? null,
            readAt: null,
          }),
        );

        return {
          id: row.id,
          status,
          smtpSent,
          outboxPath,
          createdAt: toIsoRequired(row.createdAt),
        };
      }

      app.get("/v1/notifications/me", async (request, reply) => {
        const userId = parseUserIdFromHeaders(request.headers as Record<string, unknown>);
        if (!userId) {
          return reply.code(401).send({ error: { code: "UNAUTHORIZED", message: "Unauthorized" } });
        }
        const query = paginationQuerySchema.parse(request.query);
        const unreadOnly = (request.query as { unreadOnly?: string }).unreadOnly === "true";

        const qb = logRepo
          .createQueryBuilder("n")
          .where("n.user_id = :userId", { userId })
          .andWhere("n.channel IN (:...channels)", { channels: ["in_app", "push", "sms"] })
          .orderBy("n.created_at", "DESC");

        if (unreadOnly) qb.andWhere("n.read_at IS NULL");

        const total = await qb.getCount();
        const rows = await qb.skip((query.page - 1) * query.limit).take(query.limit).getMany();
        const unreadCount = await logRepo
          .createQueryBuilder("n")
          .where("n.user_id = :userId", { userId })
          .andWhere("n.channel IN (:...channels)", { channels: ["in_app", "push", "sms"] })
          .andWhere("n.read_at IS NULL")
          .getCount();

        return {
          items: rows.map(serializeNotification),
          page: query.page,
          limit: query.limit,
          total,
          totalPages: Math.max(1, Math.ceil(total / query.limit)),
          unreadCount,
        };
      });

      app.post("/v1/notifications/:id/read", async (request, reply) => {
        const userId = parseUserIdFromHeaders(request.headers as Record<string, unknown>);
        if (!userId) {
          return reply.code(401).send({ error: { code: "UNAUTHORIZED", message: "Unauthorized" } });
        }
        const id = parseEntityId((request.params as { id: string }).id);
        const row = await logRepo.findOne({ where: { id, userId } });
        if (!row) {
          return reply.code(404).send({ error: { code: "NOT_FOUND", message: "Notification not found" } });
        }
        if (!row.readAt) {
          row.readAt = new Date();
          await logRepo.save(row);
        }
        return serializeNotification(row);
      });

      app.post("/v1/notifications/read-all", async (request, reply) => {
        const userId = parseUserIdFromHeaders(request.headers as Record<string, unknown>);
        if (!userId) {
          return reply.code(401).send({ error: { code: "UNAUTHORIZED", message: "Unauthorized" } });
        }
        await logRepo
          .createQueryBuilder()
          .update(NotificationLogEntity)
          .set({ readAt: new Date() })
          .where("user_id = :userId", { userId })
          .andWhere("read_at IS NULL")
          .andWhere("channel IN (:...channels)", { channels: ["in_app", "push", "sms"] })
          .execute();
        return { ok: true };
      });

      app.post("/v1/notifications/send", async (request, reply) => {
        const body = sendNotificationSchema.parse(request.body);

        if (body.channel === "email") {
          if (!body.toEmail) {
            return reply.code(400).send({
              error: { code: "EMAIL_REQUIRED", message: "toEmail is required for email channel" },
            });
          }
          const result = await deliverEmail({
            userId: body.userId,
            toEmail: body.toEmail,
            title: body.title,
            body: body.body,
            referenceType: body.referenceType,
            referenceId: body.referenceId,
            skipLog: body.skipLog,
          });
          return reply.code(202).send({
            accepted: true,
            channel: "email",
            ...result,
          });
        }

        if (body.skipLog) {
          return reply.code(202).send({
            accepted: true,
            channel: body.channel,
            id: null,
            status: "queued",
            message: "Delivered without inbox log",
          });
        }

        const row = await logRepo.save(
          logRepo.create({
            userId: body.userId ?? null,
            channel: body.channel,
            title: body.title,
            body: body.body,
            status: "queued",
            referenceType: body.referenceType ?? null,
            referenceId: body.referenceId ?? null,
            readAt: null,
          }),
        );

        app.log.info(
          { channel: body.channel, toPhone: body.toPhone, title: body.title },
          "Notification queued",
        );

        return reply.code(202).send({
          accepted: true,
          channel: body.channel,
          id: row.id,
          status: row.status,
          message:
            body.channel === "sms"
              ? "SMS provider stub — logged"
              : body.channel === "in_app"
                ? "In-app notification saved"
                : "Push provider stub — logged",
        });
      });

      app.post("/v1/notifications/email", async (request, reply) => {
        const body = sendEmailNotificationSchema.parse(request.body);
        const result = await deliverEmail({
          userId: body.userId,
          toEmail: body.toEmail,
          title: body.title,
          body: body.body,
          referenceType: body.referenceType,
          referenceId: body.referenceId,
          skipLog: body.skipLog,
        });
        return reply.code(202).send({ accepted: true, channel: "email", ...result });
      });
    },
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
