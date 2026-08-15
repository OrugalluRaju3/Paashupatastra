import "reflect-metadata";
import {
  AnnouncementEntity,
  FaqEntity,
  NotificationLogEntity,
  PrivacyPolicyEntity,
  SupportContactSettingsEntity,
  TermsAcceptanceEntity,
  TermsDocumentEntity,
  TankerUserEntity,
  UserEntity,
  getDataSource,
  toIso,
  toIsoRequired,
} from "@paashupatastra/database";
import {
  createService,
  envInt,
  getRolesFromHeaders,
  loadEnv,
  parseEntityId,
  parseUserIdFromHeaders,
} from "@paashupatastra/service-kit";
import {
  UserRole,
  acceptTermsSchema,
  announcementAudienceSchema,
  contentModuleSchema,
  termsAudienceSchema,
  updateAnnouncementSchema,
  updateFaqSchema,
  upsertAnnouncementSchema,
  upsertFaqSchema,
  upsertPrivacyPolicySchema,
  upsertSupportContactSchema,
  upsertTermsSchema,
} from "@paashupatastra/shared-models";
import { z } from "zod";

const ADMIN_ROLES = new Set<string>([
  UserRole.SUPER_ADMIN,
  UserRole.PARKING_SUPER_ADMIN,
  UserRole.TANKER_SUPER_ADMIN,
]);

function canManageContent(headers: Record<string, unknown>, module?: string) {
  const roles = getRolesFromHeaders(headers);
  if (roles.includes(UserRole.SUPER_ADMIN)) return true;
  if (module === "parking" && roles.includes(UserRole.PARKING_SUPER_ADMIN)) return true;
  if (module === "tanker" && roles.includes(UserRole.TANKER_SUPER_ADMIN)) return true;
  if (module === "seva" && roles.includes(UserRole.SEVA_SUPER_ADMIN)) return true;
  if (!module && roles.some((r) => ADMIN_ROLES.has(r))) return true;
  return false;
}

function requireAdmin(headers: Record<string, unknown>, module?: string) {
  if (!canManageContent(headers, module)) {
    const err = new Error("Only module admins can manage this content");
    (err as Error & { statusCode: number }).statusCode = 403;
    throw err;
  }
}

function serializePrivacy(row: PrivacyPolicyEntity) {
  return {
    id: row.id,
    module: row.module,
    version: row.version,
    title: row.title,
    body: row.body,
    isPublished: row.isPublished,
    publishedAt: row.publishedAt ? toIso(row.publishedAt) : null,
    createdByUserId: row.createdByUserId,
    createdAt: toIsoRequired(row.createdAt),
    updatedAt: toIsoRequired(row.updatedAt),
  };
}

function serializeTerms(row: TermsDocumentEntity) {
  return {
    id: row.id,
    audience: row.audience,
    module: row.module,
    version: row.version,
    title: row.title,
    body: row.body,
    isPublished: row.isPublished,
    publishedAt: row.publishedAt ? toIso(row.publishedAt) : null,
    createdByUserId: row.createdByUserId,
    createdAt: toIsoRequired(row.createdAt),
    updatedAt: toIsoRequired(row.updatedAt),
  };
}

function serializeFaq(row: FaqEntity) {
  return {
    id: row.id,
    module: row.module,
    category: row.category,
    question: row.question,
    answer: row.answer,
    displayOrder: row.displayOrder,
    isActive: row.isActive,
    createdAt: toIsoRequired(row.createdAt),
    updatedAt: toIsoRequired(row.updatedAt),
  };
}

function serializeSupport(row: SupportContactSettingsEntity) {
  return {
    id: row.id,
    module: row.module,
    supportEmail: row.supportEmail,
    supportPhone: row.supportPhone,
    whatsappNumber: row.whatsappNumber,
    workingHours: row.workingHours,
    emergencyContact: row.emergencyContact,
    officeAddress: row.officeAddress,
    socialLinks: row.socialLinks ?? {},
    createdAt: toIsoRequired(row.createdAt),
    updatedAt: toIsoRequired(row.updatedAt),
  };
}

function serializeAnnouncement(row: AnnouncementEntity) {
  return {
    id: row.id,
    module: row.module,
    title: row.title,
    body: row.body,
    audiences: row.audiences ?? [],
    startAt: toIsoRequired(row.startAt),
    endAt: toIsoRequired(row.endAt),
    isActive: row.isActive,
    createdByUserId: row.createdByUserId,
    createdAt: toIsoRequired(row.createdAt),
    updatedAt: toIsoRequired(row.updatedAt),
  };
}

function audienceForRoles(roles: string[]): string[] {
  const out: string[] = [];
  if (roles.includes(UserRole.CUSTOMER) || roles.includes(UserRole.RESIDENT) || roles.includes(UserRole.VISITOR)) {
    out.push("customers");
  }
  if (roles.includes(UserRole.PARKING_OWNER)) out.push("parking_owners");
  if (roles.includes(UserRole.TANKER_SUPPLIER)) out.push("tanker_suppliers");
  if (roles.includes(UserRole.TANKER_DRIVER)) out.push("tanker_drivers");
  if (roles.includes(UserRole.SEVA_PROVIDER)) out.push("seva_providers");
  if (roles.includes(UserRole.SEVA_WORKER)) out.push("seva_workers");
  return out;
}

async function main() {
  loadEnv();
  const ds = await getDataSource();
  const privacyRepo = ds.getRepository(PrivacyPolicyEntity);
  const termsRepo = ds.getRepository(TermsDocumentEntity);
  const acceptanceRepo = ds.getRepository(TermsAcceptanceEntity);
  const faqRepo = ds.getRepository(FaqEntity);
  const supportRepo = ds.getRepository(SupportContactSettingsEntity);
  const announcementRepo = ds.getRepository(AnnouncementEntity);
  const userRepo = ds.getRepository(UserEntity);
  const notifRepo = ds.getRepository(NotificationLogEntity);

  await createService({
    name: "content",
    port: envInt("CONTENT_PORT", 3008),
    registerRoutes: async (app) => {
      app.setErrorHandler((err, _req, reply) => {
        const status = (err as { statusCode?: number }).statusCode ?? 400;
        reply.code(status).send({
          error: {
            code: status === 403 ? "FORBIDDEN" : "BAD_REQUEST",
            message: err instanceof Error ? err.message : "Request failed",
          },
        });
      });

      // -------- Privacy --------
      app.get("/v1/content/privacy", async (request) => {
        const q = z
          .object({
            module: contentModuleSchema,
            all: z.coerce.boolean().optional(),
          })
          .parse(request.query);
        const headers = request.headers as Record<string, unknown>;
        if (q.all && canManageContent(headers, q.module)) {
          const rows = await privacyRepo.find({
            where: { module: q.module },
            order: { createdAt: "DESC" },
          });
          return { items: rows.map(serializePrivacy) };
        }
        const current = await privacyRepo.findOne({
          where: { module: q.module, isPublished: true },
          order: { publishedAt: "DESC", id: "DESC" },
        });
        return { item: current ? serializePrivacy(current) : null };
      });

      app.post("/v1/content/privacy", async (request, reply) => {
        const body = upsertPrivacyPolicySchema.parse(request.body);
        requireAdmin(request.headers as Record<string, unknown>, body.module);
        const actorId = parseUserIdFromHeaders(request.headers as Record<string, unknown>);
        if (body.isPublished) {
          await privacyRepo.update({ module: body.module, isPublished: true }, { isPublished: false });
        }
        const saved = await privacyRepo.save(
          privacyRepo.create({
            module: body.module,
            version: body.version,
            title: body.title,
            body: body.body,
            isPublished: body.isPublished ?? false,
            publishedAt: body.isPublished ? new Date() : null,
            createdByUserId: actorId,
          }),
        );
        return reply.code(201).send(serializePrivacy(saved));
      });

      app.patch("/v1/content/privacy/:id", async (request, reply) => {
        const id = parseEntityId((request.params as { id: string }).id);
        const existing = await privacyRepo.findOne({ where: { id } });
        if (!existing) {
          return reply.code(404).send({ error: { code: "NOT_FOUND", message: "Privacy policy not found" } });
        }
        requireAdmin(request.headers as Record<string, unknown>, existing.module);
        const body = upsertPrivacyPolicySchema.partial().parse(request.body);
        if (body.version != null) existing.version = body.version;
        if (body.title != null) existing.title = body.title;
        if (body.body != null) existing.body = body.body;
        if (body.isPublished === true) {
          await privacyRepo.update(
            { module: existing.module, isPublished: true },
            { isPublished: false },
          );
          existing.isPublished = true;
          existing.publishedAt = new Date();
        } else if (body.isPublished === false) {
          existing.isPublished = false;
        }
        return serializePrivacy(await privacyRepo.save(existing));
      });

      // -------- Terms --------
      app.get("/v1/content/terms", async (request) => {
        const q = z
          .object({
            module: contentModuleSchema.optional(),
            audience: termsAudienceSchema.optional(),
            all: z.coerce.boolean().optional(),
          })
          .parse(request.query);
        const headers = request.headers as Record<string, unknown>;
        if (q.all && canManageContent(headers, q.module)) {
          const where: Record<string, string> = {};
          if (q.module) where.module = q.module;
          if (q.audience) where.audience = q.audience;
          const rows = await termsRepo.find({
            where,
            order: { createdAt: "DESC" },
          });
          return { items: rows.map(serializeTerms) };
        }
        if (!q.audience) {
          return { item: null, error: "audience is required for public terms" };
        }
        const where: { audience: string; isPublished: boolean; module?: string } = {
          audience: q.audience,
          isPublished: true,
        };
        if (q.module) where.module = q.module;
        const current = await termsRepo.findOne({
          where,
          order: { publishedAt: "DESC", id: "DESC" },
        });
        return { item: current ? serializeTerms(current) : null };
      });

      app.post("/v1/content/terms", async (request, reply) => {
        const body = upsertTermsSchema.parse(request.body);
        requireAdmin(request.headers as Record<string, unknown>, body.module);
        const actorId = parseUserIdFromHeaders(request.headers as Record<string, unknown>);
        if (body.isPublished) {
          await termsRepo.update(
            { audience: body.audience, module: body.module, isPublished: true },
            { isPublished: false },
          );
        }
        const saved = await termsRepo.save(
          termsRepo.create({
            audience: body.audience,
            module: body.module,
            version: body.version,
            title: body.title,
            body: body.body,
            isPublished: body.isPublished ?? false,
            publishedAt: body.isPublished ? new Date() : null,
            createdByUserId: actorId,
          }),
        );
        return reply.code(201).send(serializeTerms(saved));
      });

      app.patch("/v1/content/terms/:id", async (request, reply) => {
        const id = parseEntityId((request.params as { id: string }).id);
        const existing = await termsRepo.findOne({ where: { id } });
        if (!existing) {
          return reply.code(404).send({ error: { code: "NOT_FOUND", message: "Terms not found" } });
        }
        requireAdmin(request.headers as Record<string, unknown>, existing.module);
        const body = upsertTermsSchema.partial().parse(request.body);
        if (body.version != null) existing.version = body.version;
        if (body.title != null) existing.title = body.title;
        if (body.body != null) existing.body = body.body;
        if (body.isPublished === true) {
          await termsRepo.update(
            { audience: existing.audience, module: existing.module, isPublished: true },
            { isPublished: false },
          );
          existing.isPublished = true;
          existing.publishedAt = new Date();
        } else if (body.isPublished === false) {
          existing.isPublished = false;
        }
        return serializeTerms(await termsRepo.save(existing));
      });

      app.post("/v1/content/terms/accept", async (request, reply) => {
        const userId = parseUserIdFromHeaders(request.headers as Record<string, unknown>);
        if (!userId) {
          return reply.code(401).send({ error: { code: "UNAUTHORIZED", message: "Login required" } });
        }
        const body = acceptTermsSchema.parse(request.body);
        const terms = await termsRepo.findOne({ where: { id: body.termsId } });
        if (!terms || !terms.isPublished) {
          return reply.code(404).send({ error: { code: "NOT_FOUND", message: "Published terms not found" } });
        }
        const existing = await acceptanceRepo.findOne({
          where: { userId, termsId: terms.id, context: body.context },
        });
        if (existing) {
          return {
            id: existing.id,
            termsId: existing.termsId,
            audience: existing.audience,
            context: existing.context,
            acceptedAt: toIsoRequired(existing.acceptedAt),
            alreadyAccepted: true,
          };
        }
        const saved = await acceptanceRepo.save(
          acceptanceRepo.create({
            userId,
            termsId: terms.id,
            audience: terms.audience,
            context: body.context,
            referenceId: body.referenceId ?? null,
          }),
        );
        return reply.code(201).send({
          id: saved.id,
          termsId: saved.termsId,
          audience: saved.audience,
          context: saved.context,
          acceptedAt: toIsoRequired(saved.acceptedAt),
          alreadyAccepted: false,
        });
      });

      app.get("/v1/content/terms/acceptance/me", async (request, reply) => {
        const userId = parseUserIdFromHeaders(request.headers as Record<string, unknown>);
        if (!userId) {
          return reply.code(401).send({ error: { code: "UNAUTHORIZED", message: "Login required" } });
        }
        const q = z
          .object({
            audience: termsAudienceSchema.optional(),
            context: z.enum(["registration", "booking", "manual"]).optional(),
          })
          .parse(request.query);
        const where: Record<string, string | number> = { userId };
        if (q.audience) where.audience = q.audience;
        if (q.context) where.context = q.context;
        const rows = await acceptanceRepo.find({ where, order: { acceptedAt: "DESC" } });
        return {
          items: rows.map((r) => ({
            id: r.id,
            termsId: r.termsId,
            audience: r.audience,
            context: r.context,
            referenceId: r.referenceId,
            acceptedAt: toIsoRequired(r.acceptedAt),
          })),
        };
      });

      // -------- FAQs --------
      app.get("/v1/content/faqs", async (request) => {
        const q = z
          .object({
            module: contentModuleSchema,
            category: z.string().optional(),
            all: z.coerce.boolean().optional(),
          })
          .parse(request.query);
        const headers = request.headers as Record<string, unknown>;
        const qb = faqRepo
          .createQueryBuilder("f")
          .where("f.module = :module", { module: q.module })
          .orderBy("f.display_order", "ASC")
          .addOrderBy("f.id", "ASC");
        if (q.category) qb.andWhere("f.category = :category", { category: q.category });
        if (!(q.all && canManageContent(headers, q.module))) {
          qb.andWhere("f.is_active = true");
        }
        const rows = await qb.getMany();
        return { items: rows.map(serializeFaq) };
      });

      app.post("/v1/content/faqs", async (request, reply) => {
        const body = upsertFaqSchema.parse(request.body);
        requireAdmin(request.headers as Record<string, unknown>, body.module);
        const saved = await faqRepo.save(
          faqRepo.create({
            module: body.module,
            category: body.category,
            question: body.question,
            answer: body.answer,
            displayOrder: body.displayOrder,
            isActive: body.isActive ?? true,
          }),
        );
        return reply.code(201).send(serializeFaq(saved));
      });

      app.patch("/v1/content/faqs/:id", async (request, reply) => {
        const id = parseEntityId((request.params as { id: string }).id);
        const existing = await faqRepo.findOne({ where: { id } });
        if (!existing) {
          return reply.code(404).send({ error: { code: "NOT_FOUND", message: "FAQ not found" } });
        }
        requireAdmin(request.headers as Record<string, unknown>, existing.module);
        const body = updateFaqSchema.parse(request.body);
        Object.assign(existing, {
          ...(body.category != null ? { category: body.category } : {}),
          ...(body.question != null ? { question: body.question } : {}),
          ...(body.answer != null ? { answer: body.answer } : {}),
          ...(body.displayOrder != null ? { displayOrder: body.displayOrder } : {}),
          ...(body.isActive != null ? { isActive: body.isActive } : {}),
        });
        return serializeFaq(await faqRepo.save(existing));
      });

      app.delete("/v1/content/faqs/:id", async (request, reply) => {
        const id = parseEntityId((request.params as { id: string }).id);
        const existing = await faqRepo.findOne({ where: { id } });
        if (!existing) {
          return reply.code(404).send({ error: { code: "NOT_FOUND", message: "FAQ not found" } });
        }
        requireAdmin(request.headers as Record<string, unknown>, existing.module);
        await faqRepo.delete({ id });
        return reply.code(204).send();
      });

      // -------- Support / Contact --------
      app.get("/v1/content/support", async (request) => {
        const q = z.object({ module: contentModuleSchema }).parse(request.query);
        let row = await supportRepo.findOne({ where: { module: q.module } });
        if (!row) {
          row = await supportRepo.save(
            supportRepo.create({
              module: q.module,
              supportEmail: null,
              supportPhone: null,
              whatsappNumber: null,
              workingHours: null,
              emergencyContact: null,
              officeAddress: null,
              socialLinks: {},
            }),
          );
        }
        return serializeSupport(row);
      });

      app.patch("/v1/content/support", async (request) => {
        const body = upsertSupportContactSchema.parse(request.body);
        requireAdmin(request.headers as Record<string, unknown>, body.module);
        let row = await supportRepo.findOne({ where: { module: body.module } });
        if (!row) {
          row = supportRepo.create({ module: body.module, socialLinks: {} });
        }
        row.supportEmail = body.supportEmail ?? null;
        row.supportPhone = body.supportPhone ?? null;
        row.whatsappNumber = body.whatsappNumber ?? null;
        row.workingHours = body.workingHours ?? null;
        row.emergencyContact = body.emergencyContact ?? null;
        row.officeAddress = body.officeAddress ?? null;
        row.socialLinks = body.socialLinks ?? {};
        return serializeSupport(await supportRepo.save(row));
      });

      // -------- Announcements --------
      app.get("/v1/content/announcements", async (request) => {
        const q = z
          .object({
            module: contentModuleSchema,
            all: z.coerce.boolean().optional(),
            audience: announcementAudienceSchema.optional(),
          })
          .parse(request.query);
        const headers = request.headers as Record<string, unknown>;
        const now = new Date();

        if (q.all && canManageContent(headers, q.module)) {
          const rows = await announcementRepo.find({
            where: { module: q.module },
            order: { startAt: "DESC" },
          });
          return { items: rows.map(serializeAnnouncement) };
        }

        const qb = announcementRepo
          .createQueryBuilder("a")
          .where("a.module = :module", { module: q.module })
          .andWhere("a.is_active = true")
          .andWhere("a.start_at <= :now", { now })
          .andWhere("a.end_at >= :now", { now })
          .orderBy("a.start_at", "DESC");

        let rows = await qb.getMany();
        if (q.audience) {
          rows = rows.filter((r) => (r.audiences ?? []).includes(q.audience!));
        } else {
          const roles = getRolesFromHeaders(headers);
          const mine = audienceForRoles(roles);
          if (mine.length) {
            rows = rows.filter((r) => (r.audiences ?? []).some((a) => mine.includes(a)));
          }
        }
        return { items: rows.map(serializeAnnouncement) };
      });

      app.post("/v1/content/announcements", async (request, reply) => {
        const body = upsertAnnouncementSchema.parse(request.body);
        requireAdmin(request.headers as Record<string, unknown>, body.module);
        const actorId = parseUserIdFromHeaders(request.headers as Record<string, unknown>);
        const saved = await announcementRepo.save(
          announcementRepo.create({
            module: body.module,
            title: body.title,
            body: body.body,
            audiences: body.audiences,
            startAt: new Date(body.startAt),
            endAt: new Date(body.endAt),
            isActive: body.isActive ?? true,
            createdByUserId: actorId,
          }),
        );

        // Best-effort in-app notify for matching active users
        if (saved.isActive) {
          const audienceToRoles: Record<string, { roles: string[]; inboxAudience: string }> = {
            customers: {
              roles: [UserRole.CUSTOMER, UserRole.RESIDENT, UserRole.VISITOR],
              inboxAudience: "customer",
            },
            parking_owners: {
              roles: [UserRole.PARKING_OWNER],
              inboxAudience: "owner",
            },
            tanker_suppliers: {
              roles: [UserRole.TANKER_SUPPLIER],
              inboxAudience: "supplier",
            },
            tanker_drivers: {
              roles: [UserRole.TANKER_DRIVER],
              inboxAudience: "driver",
            },
            tanker_admins: {
              roles: [UserRole.TANKER_SUPER_ADMIN],
              inboxAudience: "admin",
            },
            seva_providers: {
              roles: [UserRole.SEVA_PROVIDER],
              inboxAudience: "provider",
            },
            seva_workers: {
              roles: [UserRole.SEVA_WORKER],
              inboxAudience: "worker",
            },
            seva_admins: {
              roles: [UserRole.SEVA_SUPER_ADMIN],
              inboxAudience: "admin",
            },
          };

          const notifyJobs: Array<Promise<unknown>> = [];
          for (const audienceKey of saved.audiences) {
            const mapped = audienceToRoles[audienceKey];
            if (!mapped?.roles.length) continue;
            const targetRepo =
              saved.module === "tanker"
                ? ds.getRepository(TankerUserEntity)
                : userRepo;
            const users = await targetRepo
              .createQueryBuilder("u")
              .where("u.is_active = true")
              .andWhere("u.roles && :roles", { roles: mapped.roles })
              .take(500)
              .getMany();
            for (const u of users) {
              notifyJobs.push(
                notifRepo.save(
                  notifRepo.create({
                    userId: u.id,
                    module: saved.module,
                    audience: mapped.inboxAudience,
                    channel: "in_app",
                    title: `Announcement: ${saved.title}`,
                    body: saved.body,
                    status: "unread",
                    referenceType: "announcement",
                    referenceId: saved.id,
                    readAt: null,
                  }),
                ),
              );
            }
          }
          if (notifyJobs.length) {
            await Promise.allSettled(notifyJobs);
          }
        }

        return reply.code(201).send(serializeAnnouncement(saved));
      });

      app.patch("/v1/content/announcements/:id", async (request, reply) => {
        const id = parseEntityId((request.params as { id: string }).id);
        const existing = await announcementRepo.findOne({ where: { id } });
        if (!existing) {
          return reply
            .code(404)
            .send({ error: { code: "NOT_FOUND", message: "Announcement not found" } });
        }
        requireAdmin(request.headers as Record<string, unknown>, existing.module);
        const body = updateAnnouncementSchema.parse(request.body);
        if (body.title != null) existing.title = body.title;
        if (body.body != null) existing.body = body.body;
        if (body.audiences != null) existing.audiences = body.audiences;
        if (body.startAt != null) existing.startAt = new Date(body.startAt);
        if (body.endAt != null) existing.endAt = new Date(body.endAt);
        if (body.isActive != null) existing.isActive = body.isActive;
        return serializeAnnouncement(await announcementRepo.save(existing));
      });

      app.delete("/v1/content/announcements/:id", async (request, reply) => {
        const id = parseEntityId((request.params as { id: string }).id);
        const existing = await announcementRepo.findOne({ where: { id } });
        if (!existing) {
          return reply
            .code(404)
            .send({ error: { code: "NOT_FOUND", message: "Announcement not found" } });
        }
        requireAdmin(request.headers as Record<string, unknown>, existing.module);
        await announcementRepo.delete({ id });
        return reply.code(204).send();
      });
    },
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
