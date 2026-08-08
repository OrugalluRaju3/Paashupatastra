import "reflect-metadata";
import multipart from "@fastify/multipart";
import fastifyStatic from "@fastify/static";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  BankAccountEntity,
  UserDocumentEntity,
  UserEntity,
  getDataSource,
  toIsoRequired,
} from "@paashupatastra/database";
import { createService, envInt, getRolesFromHeaders, getUserIdFromHeaders, loadEnv, parseEntityId, parseUserIdFromHeaders } from "@paashupatastra/service-kit";
import {
  DocumentType,
  UserRole,
  createStaffInviteSchema,
  customerProfileSchema,
  documentUploadMetaSchema,
  paginationQuerySchema,
  publicSignupSchema,
  updateUserAdminSchema,
  updateUserStatusSchema,
  userRoleSchema,
  bankAccountInputSchema,
} from "@paashupatastra/shared-models";
import { In, type Repository } from "typeorm";
import { z } from "zod";

const UPLOADS_DIR = path.resolve(process.cwd(), "uploads");
const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "application/pdf",
]);
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

const ROLE_LABEL: Record<string, string> = {
  [UserRole.VERIFICATION_MANAGER]: "Verification Manager",
  [UserRole.FIELD_EXECUTIVE]: "Field Executive",
  [UserRole.PARKING_SUPER_ADMIN]: "Parking Super Admin",
  [UserRole.SUPER_ADMIN]: "Super Admin",
};

const MANAGER_ROLES = new Set<string>([
  UserRole.VERIFICATION_MANAGER,
  UserRole.PARKING_SUPER_ADMIN,
  UserRole.SUPER_ADMIN,
]);

function notificationsBaseUrl() {
  return (process.env.NOTIFICATIONS_URL ?? "http://localhost:3006").replace(/\/$/, "");
}

async function notifyUser(input: {
  userId?: number | null;
  toEmail?: string | null;
  toPhone?: string | null;
  title: string;
  body: string;
  referenceType?: string;
  referenceId?: number;
}) {
  const base = notificationsBaseUrl();

  if (input.userId) {
    try {
      await fetch(`${base}/v1/notifications/send`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          userId: input.userId,
          channel: "in_app",
          title: input.title,
          body: input.body,
          referenceType: input.referenceType,
          referenceId: input.referenceId,
        }),
      });
    } catch {
      // best-effort in-app
    }
  }

  if (input.toEmail) {
    try {
      await fetch(`${base}/v1/notifications/email`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          userId: input.userId ?? undefined,
          toEmail: input.toEmail,
          toPhone: input.toPhone ?? undefined,
          title: input.title,
          body: input.body,
          referenceType: input.referenceType,
          referenceId: input.referenceId,
          skipLog: true,
        }),
      });
    } catch {
      // best-effort email
    }
  }
}

async function validateReportingManager(userRepo: Repository<UserEntity>, managerId: number) {
  const manager = await userRepo.findOne({ where: { id: managerId } });
  if (!manager) {
    return { ok: false as const, message: "Reporting manager not found" };
  }
  if (!manager.isActive) {
    return { ok: false as const, message: "Reporting manager is inactive" };
  }
  if (!manager.roles.some((r) => MANAGER_ROLES.has(r))) {
    return {
      ok: false as const,
      message: "Reporting manager must be a verification manager or super admin",
    };
  }
  return { ok: true as const, manager };
}

async function sendStaffInviteEmail(user: UserEntity, role: string) {
  const notificationsUrl = notificationsBaseUrl();
  const appUrl = (process.env.APP_PUBLIC_URL ?? "http://localhost:5173").replace(/\/$/, "");
  const loginPath = `${appUrl}/staff/login/parking`;
  const roleLabel = ROLE_LABEL[role] ?? role;

  const body = [
    `Hello ${user.name ?? "there"},`,
    "",
    "You have been invited to Paashupatastra as a staff member.",
    "",
    `Role: ${roleLabel}`,
    `Staff login page: ${loginPath}`,
    "",
    "Login credentials",
    `• Registered mobile: ${user.phone}`,
    `• Registered email: ${user.email}`,
    "",
    "How to sign in",
    "1. Open the staff login page above.",
    `2. Select role: ${roleLabel}.`,
    "3. Enter your registered mobile number.",
    "4. Request OTP — a fresh OTP is emailed to you on every login.",
    "5. Enter the OTP to access the staff console.",
    "",
    "Do not share your OTP with anyone.",
    "",
    "— Paashupatastra Admin",
  ].join("\n");

  const res = await fetch(`${notificationsUrl}/v1/notifications/email`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      userId: user.id,
      toEmail: user.email,
      toPhone: user.phone,
      title: `Paashupatastra staff invite — ${roleLabel}`,
      body,
      referenceType: "staff_invite",
      referenceId: user.id,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Invite email failed (${res.status}): ${text}`);
  }

  return (await res.json()) as {
    accepted?: boolean;
    status?: string;
    smtpSent?: boolean;
    outboxPath?: string;
  };
}

function serializeUser(
  user: UserEntity,
  manager?: Pick<UserEntity, "name" | "phone"> | null,
) {
  return {
    id: user.id,
    phone: user.phone,
    name: user.name,
    email: user.email,
    emailVerified: user.emailVerified,
    dateOfBirth: user.dateOfBirth,
    profilePhotoUrl: user.profilePhotoUrl,
    city: user.city,
    state: user.state,
    country: user.country,
    pinCode: user.pinCode,
    preferredLocation: user.preferredLocation,
    roles: user.roles,
    isActive: user.isActive,
    deactivationReason: user.deactivationReason,
    deactivatedAt: user.deactivatedAt ? toIsoRequired(user.deactivatedAt) : null,
    deactivatedBy: user.deactivatedBy,
    reportingManagerId: user.reportingManagerId,
    reportingManagerName: manager?.name ?? null,
    reportingManagerPhone: manager?.phone ?? null,
    createdAt: toIsoRequired(user.createdAt),
    updatedAt: toIsoRequired(user.updatedAt),
  };
}

async function loadManagersById(
  userRepo: Repository<UserEntity>,
  managerIds: number[],
): Promise<Map<number, UserEntity>> {
  const unique = [...new Set(managerIds.filter((id) => id > 0))];
  if (unique.length === 0) return new Map();
  const managers = await userRepo.find({ where: { id: In(unique) } });
  return new Map(managers.map((m) => [m.id, m]));
}

async function findConflict(
  userRepo: Repository<UserEntity>,
  opts: { phone?: string; email?: string | null; excludeId?: number },
) {
  if (opts.phone) {
    const byPhone = await userRepo.findOne({ where: { phone: opts.phone } });
    if (byPhone && byPhone.id !== opts.excludeId) {
      return { field: "phone" as const, message: "A user with this mobile number already exists" };
    }
  }
  if (opts.email) {
    const normalized = opts.email.trim().toLowerCase();
    const qb = userRepo
      .createQueryBuilder("u")
      .where("LOWER(u.email) = :email", { email: normalized });
    if (opts.excludeId) qb.andWhere("u.id != :excludeId", { excludeId: opts.excludeId });
    const byEmail = await qb.getOne();
    if (byEmail) {
      return { field: "email" as const, message: "A user with this email already exists" };
    }
  }
  return null;
}

async function main() {
  loadEnv();
  await mkdir(UPLOADS_DIR, { recursive: true });
  const ds = await getDataSource();
  const userRepo = ds.getRepository(UserEntity);
  const docRepo = ds.getRepository(UserDocumentEntity);
  const bankRepo = ds.getRepository(BankAccountEntity);

  await createService({
    name: "users",
    port: envInt("USERS_PORT", 3002),
    registerRoutes: async (app) => {
      await app.register(multipart, {
        limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 },
      });
      await app.register(fastifyStatic, {
        root: UPLOADS_DIR,
        prefix: "/v1/users/files/",
        decorateReply: false,
      });

      app.post("/v1/users/uploads", async (request, reply) => {
        const file = await request.file();
        if (!file) {
          return reply.code(400).send({
            error: { code: "NO_FILE", message: "Choose a file to upload" },
          });
        }
        if (!ALLOWED_MIME.has(file.mimetype)) {
          return reply.code(400).send({
            error: {
              code: "INVALID_TYPE",
              message: "Only JPEG, PNG, WebP, GIF, or PDF files are allowed",
            },
          });
        }

        const buffer = await file.toBuffer();
        if (buffer.length === 0) {
          return reply.code(400).send({
            error: { code: "EMPTY_FILE", message: "Uploaded file is empty" },
          });
        }

        const originalExt = path.extname(file.filename || "").toLowerCase();
        const fallbackExt =
          file.mimetype === "application/pdf"
            ? ".pdf"
            : file.mimetype === "image/png"
              ? ".png"
              : file.mimetype === "image/webp"
                ? ".webp"
                : file.mimetype === "image/gif"
                  ? ".gif"
                  : ".jpg";
        const ext = originalExt && originalExt.length <= 8 ? originalExt : fallbackExt;
        const storedName = `${randomUUID()}${ext}`;
        await writeFile(path.join(UPLOADS_DIR, storedName), buffer);

        return {
          url: `/v1/users/files/${storedName}`,
          fileName: file.filename || storedName,
          mimeType: file.mimetype,
          size: buffer.length,
        };
      });

      app.get("/v1/users/stats", async () => {
        const total = await userRepo.count();
        const active = await userRepo.count({ where: { isActive: true } });
        const owners = await userRepo
          .createQueryBuilder("u")
          .where(`:role = ANY(u.roles)`, { role: UserRole.PARKING_OWNER })
          .getCount();
        const executives = await userRepo
          .createQueryBuilder("u")
          .where(`:role = ANY(u.roles)`, { role: UserRole.FIELD_EXECUTIVE })
          .getCount();
        return { total, active, inactive: total - active, owners, executives };
      });

      app.get("/v1/users", async (request) => {
        const query = paginationQuerySchema.parse(request.query);
        const raw = request.query as { role?: string; scope?: string };
        const qb = userRepo.createQueryBuilder("u").orderBy("u.created_at", "DESC");

        if (raw.scope === "staff") {
          qb.andWhere(
            `(:psa = ANY(u.roles) OR :sa = ANY(u.roles) OR :vm = ANY(u.roles) OR :fe = ANY(u.roles))`,
            {
              psa: UserRole.PARKING_SUPER_ADMIN,
              sa: UserRole.SUPER_ADMIN,
              vm: UserRole.VERIFICATION_MANAGER,
              fe: UserRole.FIELD_EXECUTIVE,
            },
          );
        } else if (raw.scope === "tanker") {
          return {
            items: [],
            page: query.page,
            limit: query.limit,
            total: 0,
            totalPages: 1,
          };
        } else if (raw.scope === "parking") {
          qb.andWhere(
            `(
              :owner = ANY(u.roles)
              OR (
                :customer = ANY(u.roles)
                AND NOT (:supplier = ANY(u.roles))
                AND NOT (:driver = ANY(u.roles))
                AND NOT (:psa = ANY(u.roles))
                AND NOT (:sa = ANY(u.roles))
                AND NOT (:vm = ANY(u.roles))
                AND NOT (:fe = ANY(u.roles))
              )
            )`,
            {
              owner: UserRole.PARKING_OWNER,
              customer: UserRole.CUSTOMER,
              supplier: UserRole.TANKER_SUPPLIER,
              driver: UserRole.TANKER_DRIVER,
              psa: UserRole.PARKING_SUPER_ADMIN,
              sa: UserRole.SUPER_ADMIN,
              vm: UserRole.VERIFICATION_MANAGER,
              fe: UserRole.FIELD_EXECUTIVE,
            },
          );
        }

        if (raw.role) qb.andWhere(`:role = ANY(u.roles)`, { role: raw.role });
        if (query.q) {
          qb.andWhere(
            `(u.phone ILIKE :q OR COALESCE(u.name,'') ILIKE :q OR COALESCE(u.email,'') ILIKE :q)`,
            { q: `%${query.q}%` },
          );
        }
        const total = await qb.getCount();
        const rows = await qb.skip((query.page - 1) * query.limit).take(query.limit).getMany();
        const managerById = await loadManagersById(
          userRepo,
          rows.map((u) => u.reportingManagerId).filter((id): id is number => id != null),
        );
        return {
          items: rows.map((u) =>
            serializeUser(u, u.reportingManagerId ? managerById.get(u.reportingManagerId) : null),
          ),
          page: query.page,
          limit: query.limit,
          total,
          totalPages: Math.max(1, Math.ceil(total / query.limit)),
        };
      });

      app.get("/v1/users/me", async (request, reply) => {
        const userId = parseUserIdFromHeaders(request.headers as Record<string, unknown>);
        if (!userId) {
          return reply.code(401).send({ error: { code: "UNAUTHORIZED", message: "Unauthorized" } });
        }
        const user = await userRepo.findOne({ where: { id: userId } });
        if (!user) {
          return reply.code(404).send({ error: { code: "NOT_FOUND", message: "User not found" } });
        }
        return serializeUser(user);
      });

      app.get("/v1/users/me/reportees", async (request, reply) => {
        const userId = parseUserIdFromHeaders(request.headers as Record<string, unknown>);
        if (!userId) {
          return reply.code(401).send({ error: { code: "UNAUTHORIZED", message: "Unauthorized" } });
        }

        const me = await userRepo.findOne({ where: { id: userId } });
        if (!me) {
          return reply.code(404).send({ error: { code: "NOT_FOUND", message: "User not found" } });
        }

        const canView =
          me.roles.includes(UserRole.VERIFICATION_MANAGER) ||
          me.roles.includes(UserRole.PARKING_SUPER_ADMIN) ||
          me.roles.includes(UserRole.SUPER_ADMIN);
        if (!canView) {
          return reply.code(403).send({
            error: {
              code: "FORBIDDEN",
              message: "Only verification managers can view reportees",
            },
          });
        }

        const query = paginationQuerySchema.parse(request.query);
        const qb = userRepo
          .createQueryBuilder("u")
          .where("u.reporting_manager_id = :managerId", { managerId: userId })
          .andWhere(`:fe = ANY(u.roles)`, { fe: UserRole.FIELD_EXECUTIVE })
          .orderBy("u.created_at", "DESC");

        if (query.q) {
          qb.andWhere(
            `(u.phone ILIKE :q OR COALESCE(u.name,'') ILIKE :q OR COALESCE(u.email,'') ILIKE :q OR COALESCE(u.city,'') ILIKE :q)`,
            { q: `%${query.q}%` },
          );
        }

        const total = await qb.getCount();
        const rows = await qb.skip((query.page - 1) * query.limit).take(query.limit).getMany();
        const managerById = await loadManagersById(
          userRepo,
          rows.map((u) => u.reportingManagerId).filter((id): id is number => id != null),
        );

        return {
          items: rows.map((u) =>
            serializeUser(u, u.reportingManagerId ? managerById.get(u.reportingManagerId) : null),
          ),
          page: query.page,
          limit: query.limit,
          total,
          totalPages: Math.max(1, Math.ceil(total / query.limit)),
        };
      });

      app.patch("/v1/users/me", async (request, reply) => {
        const userId = parseUserIdFromHeaders(request.headers as Record<string, unknown>);
        if (!userId) {
          return reply.code(401).send({ error: { code: "UNAUTHORIZED", message: "Unauthorized" } });
        }
        const user = await userRepo.findOne({ where: { id: userId } });
        if (!user) {
          return reply.code(404).send({ error: { code: "NOT_FOUND", message: "User not found" } });
        }
        const body = customerProfileSchema.partial().parse(request.body);
        if (body.fullName !== undefined) user.name = body.fullName;
        if (body.email !== undefined) user.email = body.email;
        if (body.city !== undefined) user.city = body.city;
        if (body.state !== undefined) user.state = body.state;
        if (body.country !== undefined) user.country = body.country;
        if (body.pinCode !== undefined) user.pinCode = body.pinCode;
        if (body.preferredLocation !== undefined) user.preferredLocation = body.preferredLocation;
        return serializeUser(await userRepo.save(user));
      });

      app.post("/v1/users/me/customer-profile", async (request, reply) => {
        const userId = parseUserIdFromHeaders(request.headers as Record<string, unknown>);
        if (!userId) {
          return reply.code(401).send({ error: { code: "UNAUTHORIZED", message: "Unauthorized" } });
        }
        const user = await userRepo.findOne({ where: { id: userId } });
        if (!user) {
          return reply.code(404).send({ error: { code: "NOT_FOUND", message: "User not found" } });
        }
        const body = customerProfileSchema.parse(request.body);
        user.name = body.fullName;
        user.email = body.email;
        user.city = body.city;
        user.state = body.state;
        user.country = body.country ?? "IN";
        user.pinCode = body.pinCode;
        user.preferredLocation = body.preferredLocation ?? null;
        if (!user.roles.includes(UserRole.CUSTOMER)) {
          user.roles = [...user.roles, UserRole.CUSTOMER];
        }
        user.isActive = true;
        return serializeUser(await userRepo.save(user));
      });

      /** Complete public signup after OTP login (customer or parking owner). */
      app.post("/v1/users/me/signup", async (request, reply) => {
        const userId = parseUserIdFromHeaders(request.headers as Record<string, unknown>);
        if (!userId) {
          return reply.code(401).send({ error: { code: "UNAUTHORIZED", message: "Unauthorized" } });
        }
        const user = await userRepo.findOne({ where: { id: userId } });
        if (!user) {
          return reply.code(404).send({ error: { code: "NOT_FOUND", message: "User not found" } });
        }

        const body = publicSignupSchema.parse(request.body);

        if (body.intent === "supplier") {
          return reply.code(400).send({
            error: {
              code: "INVALID_INTENT",
              message: "Supplier signup must use the tanker login flow.",
            },
          });
        }

        if (user.name && user.email) {
          return reply.code(409).send({
            error: {
              code: "ALREADY_REGISTERED",
              message: "This account is already registered. Please login instead.",
            },
          });
        }

        const conflict = await findConflict(userRepo, {
          email: body.email,
          excludeId: user.id,
        });
        if (conflict) {
          return reply.code(409).send({
            error: { code: "DUPLICATE_USER", message: conflict.message, field: conflict.field },
          });
        }

        user.name = body.fullName;
        user.email = body.email;
        user.city = body.city;
        user.state = body.state;
        user.country = body.country ?? "IN";
        user.pinCode = body.pinCode;
        user.preferredLocation = body.preferredLocation ?? null;
        user.isActive = true;

        const roles = new Set(user.roles);
        roles.add(UserRole.CUSTOMER);
        if (body.intent === "owner") roles.add(UserRole.PARKING_OWNER);
        user.roles = [...roles];

        return serializeUser(await userRepo.save(user));
      });

      app.patch("/v1/users/:id/roles", async (request, reply) => {
        const id = parseEntityId((request.params as { id: string }).id);
        const body = z.object({ roles: z.array(userRoleSchema).min(1) }).parse(request.body);
        const user = await userRepo.findOne({ where: { id } });
        if (!user) {
          return reply.code(404).send({ error: { code: "NOT_FOUND", message: "User not found" } });
        }
        user.roles = body.roles;
        return serializeUser(await userRepo.save(user));
      });

      function serializeBank(row: BankAccountEntity) {
        return {
          id: row.id,
          userId: row.userId,
          accountHolderName: row.accountHolderName,
          bankName: row.bankName,
          accountNumber: row.accountNumber,
          accountNumberMasked: row.accountNumber.replace(/\d(?=\d{4})/g, "X"),
          ifscCode: row.ifscCode,
          upiId: row.upiId,
          isPrimary: row.isPrimary,
          isVerified: row.isVerified,
          createdAt: toIsoRequired(row.createdAt),
          updatedAt: toIsoRequired(row.updatedAt),
        };
      }

      app.get("/v1/users/me/bank-accounts", async (request, reply) => {
        const userId = parseUserIdFromHeaders(request.headers as Record<string, unknown>);
        if (!userId) {
          return reply.code(401).send({ error: { code: "UNAUTHORIZED", message: "Unauthorized" } });
        }
        const items = await bankRepo.find({ where: { userId }, order: { createdAt: "DESC" } });
        return { items: items.map(serializeBank) };
      });

      app.post("/v1/users/me/bank-accounts", async (request, reply) => {
        const userId = parseUserIdFromHeaders(request.headers as Record<string, unknown>);
        if (!userId) {
          return reply.code(401).send({ error: { code: "UNAUTHORIZED", message: "Unauthorized" } });
        }
        const body = bankAccountInputSchema.parse(request.body);
        if (body.isPrimary !== false) {
          const existing = await bankRepo.find({ where: { userId } });
          for (const row of existing) {
            if (row.isPrimary) {
              row.isPrimary = false;
              await bankRepo.save(row);
            }
          }
        }
        const saved = await bankRepo.save(
          bankRepo.create({
            userId,
            accountHolderName: body.accountHolderName.trim(),
            bankName: body.bankName.trim(),
            accountNumber: body.accountNumber.trim(),
            ifscCode: body.ifscCode.trim().toUpperCase(),
            upiId: body.upiId?.trim() || null,
            isPrimary: body.isPrimary !== false,
            isVerified: false,
          }),
        );
        return reply.code(201).send(serializeBank(saved));
      });

      app.get("/v1/users/:id", async (request, reply) => {
        const id = parseEntityId((request.params as { id: string }).id);
        const user = await userRepo.findOne({ where: { id } });
        if (!user) {
          return reply.code(404).send({ error: { code: "NOT_FOUND", message: "User not found" } });
        }
        const manager = user.reportingManagerId
          ? await userRepo.findOne({ where: { id: user.reportingManagerId } })
          : null;
        return serializeUser(user, manager);
      });

      app.patch("/v1/users/:id", async (request, reply) => {
        const id = parseEntityId((request.params as { id: string }).id);
        const body = updateUserAdminSchema.parse(request.body);
        const user = await userRepo.findOne({ where: { id } });
        if (!user) {
          return reply.code(404).send({ error: { code: "NOT_FOUND", message: "User not found" } });
        }

        const conflict = await findConflict(userRepo, {
          phone: body.phone,
          email: body.email,
          excludeId: id,
        });
        if (conflict) {
          return reply.code(409).send({
            error: { code: "DUPLICATE_USER", message: conflict.message, field: conflict.field },
          });
        }

        if (body.phone !== undefined) user.phone = body.phone;
        if (body.name !== undefined) user.name = body.name;
        if (body.email !== undefined) user.email = body.email;
        if (body.city !== undefined) user.city = body.city;
        if (body.state !== undefined) user.state = body.state;
        if (body.country !== undefined) user.country = body.country;
        if (body.pinCode !== undefined) user.pinCode = body.pinCode;
        if (body.dateOfBirth !== undefined) user.dateOfBirth = body.dateOfBirth;
        if (body.preferredLocation !== undefined) user.preferredLocation = body.preferredLocation;
        if (body.roles !== undefined) user.roles = body.roles;

        const effectiveRoles = body.roles ?? user.roles;
        const isFieldExecutive = effectiveRoles.includes(UserRole.FIELD_EXECUTIVE);

        if (body.reportingManagerId !== undefined) {
          if (!isFieldExecutive) {
            return reply.code(400).send({
              error: {
                code: "INVALID_MANAGER",
                message: "Reporting manager can only be set for field executives",
              },
            });
          }
          if (body.reportingManagerId != null) {
            const check = await validateReportingManager(userRepo, body.reportingManagerId);
            if (!check.ok) {
              return reply.code(400).send({
                error: { code: "INVALID_MANAGER", message: check.message },
              });
            }
          }
          user.reportingManagerId = body.reportingManagerId;
        } else if (body.roles !== undefined && !isFieldExecutive) {
          user.reportingManagerId = null;
        }

        const saved = await userRepo.save(user);
        const manager = saved.reportingManagerId
          ? await userRepo.findOne({ where: { id: saved.reportingManagerId } })
          : null;
        return serializeUser(saved, manager);
      });

      app.patch("/v1/users/:id/status", async (request, reply) => {
        const headers = request.headers as Record<string, unknown>;
        const actorRoles = getRolesFromHeaders(headers);
        const isParkingAdmin =
          actorRoles.includes(UserRole.PARKING_SUPER_ADMIN) ||
          actorRoles.includes(UserRole.SUPER_ADMIN);
        if (!isParkingAdmin) {
          return reply.code(403).send({
            error: {
              code: "FORBIDDEN",
              message: "Only Parking Super Admin can activate or deactivate accounts",
            },
          });
        }

        const id = parseEntityId((request.params as { id: string }).id);
        const body = updateUserStatusSchema.parse(request.body);
        const user = await userRepo.findOne({ where: { id } });
        if (!user) {
          return reply.code(404).send({ error: { code: "NOT_FOUND", message: "User not found" } });
        }

        const wasActive = user.isActive;
        const previousReason = user.deactivationReason;
        user.isActive = body.isActive;
        if (body.isActive) {
          user.deactivationReason = null;
          user.deactivatedAt = null;
          user.deactivatedBy = null;
        } else {
          const actorId = parseUserIdFromHeaders(headers);
          user.deactivationReason =
            user.deactivationReason ?? "Deactivated by Parking Super Admin";
          user.deactivatedAt = new Date();
          user.deactivatedBy = actorId != null ? `admin:${actorId}` : "admin";
        }

        const saved = await userRepo.save(user);

        // Notify when Parking Super Admin reactivates an inactive account
        if (body.isActive && !wasActive) {
          void notifyUser({
            userId: saved.id,
            toEmail: saved.email,
            toPhone: saved.phone,
            title: "Account reactivated",
            body: [
              `Hello ${saved.name ?? "User"},`,
              "",
              "Your Paashupatastra parking account has been reactivated by Parking Super Admin.",
              ...(previousReason
                ? ["", `Previous deactivation reason: ${previousReason}`]
                : []),
              "",
              "You can log in again and use the application normally.",
              "",
              "— Paashupatastra",
            ].join("\n"),
            referenceType: "user_status",
            referenceId: saved.id,
          });
        }

        return serializeUser(saved);
      });

      app.delete("/v1/users/:id", async (request, reply) => {
        const id = parseEntityId((request.params as { id: string }).id);
        const user = await userRepo.findOne({ where: { id } });
        if (!user) {
          return reply.code(404).send({ error: { code: "NOT_FOUND", message: "User not found" } });
        }
        try {
          await userRepo.delete({ id });
        } catch (err) {
          app.log.error({ err, id }, "User delete failed");
          return reply.code(409).send({
            error: {
              code: "DELETE_BLOCKED",
              message: "Cannot delete this user because related records exist. Deactivate instead.",
            },
          });
        }
        return reply.code(204).send();
      });

      app.post("/v1/users/documents", async (request, reply) => {
        const userId = parseUserIdFromHeaders(request.headers as Record<string, unknown>);
        if (!userId) {
          return reply.code(401).send({ error: { code: "UNAUTHORIZED", message: "Unauthorized" } });
        }
        const body = documentUploadMetaSchema.parse(request.body);
        const doc = await docRepo.save(
          docRepo.create({
            userId,
            listingId: body.listingId ?? null,
            type: body.type,
            fileUrl: body.fileUrl,
            status: "uploaded",
          }),
        );
        return reply.code(201).send(doc);
      });

      app.get("/v1/users/:id/documents", async (request) => {
        const id = parseEntityId((request.params as { id: string }).id);
        const items = await docRepo.find({ where: { userId: id }, order: { createdAt: "DESC" } });
        return { items };
      });

      app.get("/v1/users/:id/bank-accounts", async (request) => {
        const id = parseEntityId((request.params as { id: string }).id);
        const items = await bankRepo.find({ where: { userId: id }, order: { createdAt: "DESC" } });
        return { items };
      });

      app.post("/v1/users/staff", async (request, reply) => {
        const body = createStaffInviteSchema.parse(request.body);
        const appUrl = (process.env.APP_PUBLIC_URL ?? "http://localhost:5173").replace(/\/$/, "");
        const loginPath = `${appUrl}/staff/login/parking`;

        const conflict = await findConflict(userRepo, {
          phone: body.phone,
          email: body.email,
        });
        if (conflict) {
          return reply.code(409).send({
            error: { code: "DUPLICATE_USER", message: conflict.message, field: conflict.field },
          });
        }

        let reportingManagerId: number | null = null;
        if (body.role === UserRole.FIELD_EXECUTIVE) {
          const managerId = body.reportingManagerId!;
          const check = await validateReportingManager(userRepo, managerId);
          if (!check.ok) {
            return reply.code(400).send({
              error: { code: "INVALID_MANAGER", message: check.message },
            });
          }
          reportingManagerId = managerId;
        }

        let user = await userRepo.save(
          userRepo.create({
            phone: body.phone,
            name: body.name,
            email: body.email,
            city: body.city,
            state: body.state,
            country: body.country ?? "IN",
            pinCode: body.pinCode,
            dateOfBirth: body.dateOfBirth ?? null,
            preferredLocation: body.preferredLocation ?? null,
            roles: [body.role],
            reportingManagerId,
            isActive: true,
          }),
        );

        let invite: Awaited<ReturnType<typeof sendStaffInviteEmail>> | null = null;
        let inviteError: string | undefined;
        try {
          invite = await sendStaffInviteEmail(user, body.role);
        } catch (err) {
          inviteError = err instanceof Error ? err.message : "Invite email failed";
          app.log.error({ err }, "Staff invite email failed");
        }

        if (body.role === UserRole.FIELD_EXECUTIVE && reportingManagerId) {
          const manager = await userRepo.findOne({ where: { id: reportingManagerId } });
          if (manager) {
            const managerBody = [
              `Hello ${manager.name ?? "there"},`,
              "",
              "A new field executive has been assigned to report to you.",
              "",
              `Name: ${user.name ?? "—"}`,
              `Mobile: ${user.phone}`,
              `Email: ${user.email ?? "—"}`,
              `City: ${user.city ?? "—"}`,
              "",
              "They can sign in at the staff login page:",
              loginPath,
              "",
              "— Paashupatastra Admin",
            ].join("\n");
            void notifyUser({
              userId: manager.id,
              toEmail: manager.email,
              toPhone: manager.phone,
              title: "New field executive assigned to you",
              body: managerBody,
              referenceType: "staff_invite",
              referenceId: user.id,
            });
          }
        }

        const manager = user.reportingManagerId
          ? await userRepo.findOne({ where: { id: user.reportingManagerId } })
          : null;

        return reply.code(201).send({
          ...serializeUser(user, manager),
          invite: {
            loginPath,
            phone: user.phone,
            email: user.email,
            role: body.role,
            emailStatus: invite?.status ?? "failed",
            smtpSent: invite?.smtpSent ?? false,
            outboxPath: invite?.outboxPath,
            error: inviteError,
          },
        });
      });
    },
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
