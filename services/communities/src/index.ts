import "reflect-metadata";
import {
  ApartmentBlockEntity,
  ApartmentEntity,
  ApartmentFlatEntity,
  CommunityAccountEntity,
  CommunityComplaintEntity,
  CommunityDueEntity,
  CommunityExpenseEntity,
  CommunityInvoiceEntity,
  CommunityLedgerEntity,
  CommunityMembershipEntity,
  CommunityNoticeEntity,
  CommunityVisitorPassEntity,
  NotificationLogEntity,
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
  CommunityComplaintStatus,
  CommunityDueStatus,
  CommunityMembershipRole,
  CommunityMembershipStatus,
  CommunityVisitorStatus,
  PaymentStatus,
  UserRole,
  confirmCommunityDuePaymentSchema,
  createApartmentSchema,
  createCommunityBlockSchema,
  createCommunityComplaintSchema,
  createCommunityExpenseSchema,
  createCommunityFlatSchema,
  createCommunityNoticeSchema,
  createCommunityVisitorPassSchema,
  decideCommunityMembershipSchema,
  joinApartmentSchema,
  exportCommunityExpensesQuerySchema,
  listCommunityExpensesQuerySchema,
  paginationQuerySchema,
  registerCommunityMemberSchema,
  postCommunityDuesSchema,
  updateApartmentSchema,
  updateCommunityAccountSchema,
  updateCommunityComplaintSchema,
  verifyCommunityVisitorSchema,
} from "@paashupatastra/shared-models";
import { In } from "typeorm";

function makeInviteCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

function makeVisitorOtp() {
  return String(Math.floor(1000 + Math.random() * 9000));
}

function formatInr(paise: number) {
  return `₹${(paise / 100).toFixed(2)}`;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

type ExpenseListFilters = {
  category?: string;
  q?: string;
  fromDate?: string;
  toDate?: string;
};

function applyExpenseListFilters<T extends { andWhere: (sql: string, params?: object) => T }>(
  qb: T,
  query: ExpenseListFilters,
): T {
  if (query.category) {
    qb.andWhere("LOWER(e.category) = LOWER(:category)", { category: query.category });
  }
  if (query.q) {
    qb.andWhere("e.vendor ILIKE :vendor", { vendor: `%${query.q}%` });
  }
  if (query.fromDate) {
    qb.andWhere("e.created_at >= :fromDate", { fromDate: new Date(`${query.fromDate}T00:00:00.000+05:30`) });
  }
  if (query.toDate) {
    qb.andWhere("e.created_at <= :toDate", { toDate: new Date(`${query.toDate}T23:59:59.999+05:30`) });
  }
  return qb;
}

function expensePeriodLabel(query: ExpenseListFilters) {
  const parts: string[] = [];
  if (query.fromDate && query.toDate) parts.push(`${query.fromDate} to ${query.toDate}`);
  else if (query.fromDate) parts.push(`from ${query.fromDate}`);
  else if (query.toDate) parts.push(`until ${query.toDate}`);
  else parts.push("all dates");
  if (query.category) parts.push(`category ${query.category.replaceAll("_", " ")}`);
  if (query.q) parts.push(`vendor “${query.q}”`);
  return parts.join(" · ");
}

function notificationsBaseUrl() {
  return (process.env.NOTIFICATIONS_URL ?? "http://localhost:3006").replace(/\/$/, "");
}

function communityLoginUrl() {
  const appUrl = (process.env.APP_PUBLIC_URL ?? "http://localhost:5173").replace(/\/$/, "");
  return `${appUrl}/login/community`;
}

function membershipRoleLabel(role: string) {
  if (role === CommunityMembershipRole.APARTMENT_ADMIN) return "Apartment admin";
  if (role === CommunityMembershipRole.GUARD) return "Community guard";
  return "Resident";
}

function userRoleForMembership(role: string) {
  if (role === CommunityMembershipRole.APARTMENT_ADMIN) return UserRole.APARTMENT_ADMIN;
  if (role === CommunityMembershipRole.GUARD) return UserRole.COMMUNITY_GUARD;
  return UserRole.RESIDENT;
}

function audienceForMembership(role: string): "resident" | "apartment_admin" | "guard" {
  if (role === CommunityMembershipRole.APARTMENT_ADMIN) return "apartment_admin";
  if (role === CommunityMembershipRole.GUARD) return "guard";
  return "resident";
}

const COMMUNITY_IDENTITY_ROLES: string[] = [
  UserRole.COMMUNITY_SUPER_ADMIN,
  UserRole.APARTMENT_ADMIN,
  UserRole.RESIDENT,
  UserRole.COMMUNITY_GUARD,
];

function hasCommunityIdentityRole(roles: string[] | null | undefined) {
  return (roles ?? []).some((role) => COMMUNITY_IDENTITY_ROLES.includes(role));
}

function serializeApartment(row: ApartmentEntity) {
  return {
    id: row.id,
    name: row.name,
    inviteCode: row.inviteCode,
    city: row.city,
    state: row.state,
    addressLine: row.addressLine,
    isActive: row.isActive,
    latitude: row.latitude,
    longitude: row.longitude,
    createdAt: toIsoRequired(row.createdAt),
    updatedAt: toIsoRequired(row.updatedAt),
  };
}

function serializeBlock(row: ApartmentBlockEntity) {
  return {
    id: row.id,
    apartmentId: row.apartmentId,
    name: row.name,
    createdAt: toIsoRequired(row.createdAt),
  };
}

function serializeFlat(row: ApartmentFlatEntity, blockName?: string | null) {
  return {
    id: row.id,
    blockId: row.blockId,
    apartmentId: row.apartmentId,
    number: row.number,
    blockName: blockName ?? null,
    createdAt: toIsoRequired(row.createdAt),
  };
}

function serializeMembership(row: CommunityMembershipEntity) {
  return {
    id: row.id,
    apartmentId: row.apartmentId,
    userId: row.userId,
    flatId: row.flatId,
    role: row.role,
    status: row.status,
    rejectedReason: row.rejectedReason,
    createdAt: toIsoRequired(row.createdAt),
    updatedAt: toIsoRequired(row.updatedAt),
  };
}

function isComplaintClosedStatus(status: string) {
  return status === CommunityComplaintStatus.RESOLVED || status === CommunityComplaintStatus.CLOSED;
}

function serializeComplaint(row: CommunityComplaintEntity) {
  return {
    id: row.id,
    apartmentId: row.apartmentId,
    residentUserId: row.residentUserId,
    category: row.category,
    title: row.title,
    body: row.body,
    status: row.status,
    adminNotes: row.adminNotes,
    createdAt: toIsoRequired(row.createdAt),
    updatedAt: toIsoRequired(row.updatedAt),
    closedAt: toIso(row.closedAt) ?? (isComplaintClosedStatus(row.status) ? toIsoRequired(row.updatedAt) : null),
  };
}

function serializeInvoice(row: CommunityInvoiceEntity) {
  return {
    id: row.id,
    invoiceNumber: `INV-CM-${row.id}`,
    dueId: row.dueId,
    apartmentId: row.apartmentId,
    residentUserId: row.residentUserId,
    amountInPaise: row.amountInPaise,
    status: row.status,
    createdAt: toIsoRequired(row.createdAt),
    updatedAt: toIsoRequired(row.updatedAt),
  };
}

async function notify(
  ds: Awaited<ReturnType<typeof getDataSource>>,
  input: {
    userId?: number | null;
    audience: "resident" | "apartment_admin" | "guard" | "admin";
    title: string;
    body: string;
    referenceType?: string;
    referenceId?: number;
    toEmail?: string | null;
    toPhone?: string | null;
  },
) {
  const repo = ds.getRepository(NotificationLogEntity);
  if (input.userId) {
    await repo.save(
      repo.create({
        userId: input.userId,
        module: "community",
        audience: input.audience,
        channel: "in_app",
        title: input.title,
        body: input.body,
        status: "unread",
        referenceType: input.referenceType ?? null,
        referenceId: input.referenceId ?? null,
        readAt: null,
      }),
    );
  }
  if (input.toEmail) {
    try {
      await fetch(`${notificationsBaseUrl()}/v1/notifications/email`, {
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
      /* inbox already saved */
    }
  }
}

async function main() {
  loadEnv();
  const ds = await getDataSource();
  const apartmentRepo = ds.getRepository(ApartmentEntity);
  const blockRepo = ds.getRepository(ApartmentBlockEntity);
  const flatRepo = ds.getRepository(ApartmentFlatEntity);
  const membershipRepo = ds.getRepository(CommunityMembershipEntity);
  const noticeRepo = ds.getRepository(CommunityNoticeEntity);
  const complaintRepo = ds.getRepository(CommunityComplaintEntity);
  const visitorRepo = ds.getRepository(CommunityVisitorPassEntity);
  const accountRepo = ds.getRepository(CommunityAccountEntity);
  const dueRepo = ds.getRepository(CommunityDueEntity);
  const expenseRepo = ds.getRepository(CommunityExpenseEntity);
  const ledgerRepo = ds.getRepository(CommunityLedgerEntity);
  const invoiceRepo = ds.getRepository(CommunityInvoiceEntity);
  const userRepo = ds.getRepository(UserEntity);

  function isCommunityStaff(roles: string[]) {
    return roles.includes(UserRole.COMMUNITY_SUPER_ADMIN) || roles.includes(UserRole.SUPER_ADMIN);
  }

  async function isCommunityIdentity(user: UserEntity) {
    if (hasCommunityIdentityRole(user.roles)) return true;
    const membershipCount = await membershipRepo.count({ where: { userId: user.id } });
    return membershipCount > 0;
  }

  async function findCommunityEmailOwner(email: string, excludeId?: number) {
    const qb = userRepo
      .createQueryBuilder("u")
      .where("LOWER(u.email) = :email", { email });
    if (excludeId) qb.andWhere("u.id != :excludeId", { excludeId });
    const matches = await qb.getMany();
    for (const match of matches) {
      if (await isCommunityIdentity(match)) return match;
    }
    return null;
  }

  async function ensureAccount(apartmentId: number) {
    let account = await accountRepo.findOne({ where: { apartmentId } });
    if (!account) {
      account = await accountRepo.save(
        accountRepo.create({
          apartmentId,
          balanceInPaise: 0,
          monthlyMaintenanceInPaise: 0,
          dueDay: 5,
        }),
      );
    }
    return account;
  }

  async function membershipForUser(userId: number, apartmentId?: number | null) {
    if (apartmentId) {
      return membershipRepo.findOne({ where: { userId, apartmentId } });
    }
    return membershipRepo.findOne({
      where: { userId, status: CommunityMembershipStatus.APPROVED },
      order: { updatedAt: "DESC" },
    });
  }

  async function requireApprovedMembership(
    userId: number,
    apartmentId?: number | null,
    roles: string[] = [],
  ) {
    if (isCommunityStaff(roles)) {
      if (apartmentId) {
        const apt = await apartmentRepo.findOne({ where: { id: apartmentId } });
        if (!apt) return { error: "Apartment not found" as const, membership: null, apartment: null };
        return { error: null, membership: null, apartment: apt };
      }
      return { error: "Apartment required" as const, membership: null, apartment: null };
    }
    const membership = await membershipForUser(userId, apartmentId);
    if (!membership || membership.status !== CommunityMembershipStatus.APPROVED) {
      return {
        error: "Community Super Admin has not registered you for this apartment yet" as const,
        membership: null,
        apartment: null,
      };
    }
    const apartment = await apartmentRepo.findOne({ where: { id: membership.apartmentId } });
    if (!apartment?.isActive) {
      return { error: "Apartment is not active" as const, membership: null, apartment: null };
    }
    return { error: null, membership, apartment };
  }

  async function isApartmentAdmin(userId: number, apartmentId: number, roles: string[]) {
    if (isCommunityStaff(roles)) return true;
    const row = await membershipRepo.findOne({
      where: {
        userId,
        apartmentId,
        role: CommunityMembershipRole.APARTMENT_ADMIN,
        status: CommunityMembershipStatus.APPROVED,
      },
    });
    return Boolean(row);
  }

  async function isGuard(userId: number, apartmentId: number, roles: string[]) {
    if (isCommunityStaff(roles)) return true;
    if (await isApartmentAdmin(userId, apartmentId, roles)) return true;
    const row = await membershipRepo.findOne({
      where: {
        userId,
        apartmentId,
        role: CommunityMembershipRole.GUARD,
        status: CommunityMembershipStatus.APPROVED,
      },
    });
    return Boolean(row);
  }

  async function approvedMembers(apartmentId: number, role?: string) {
    const where = role
      ? { apartmentId, status: CommunityMembershipStatus.APPROVED, role }
      : { apartmentId, status: CommunityMembershipStatus.APPROVED };
    return membershipRepo.find({ where });
  }

  async function notifyMembers(
    apartmentId: number,
    audience: "resident" | "apartment_admin" | "guard",
    title: string,
    body: string,
    referenceType?: string,
    referenceId?: number,
    role?: string,
  ) {
    const members = await approvedMembers(apartmentId, role);
    const userIds = [...new Set(members.map((member) => member.userId))];
    if (userIds.length === 0) return;
    const users = await userRepo.find({
      where: { id: In(userIds) },
    });
    const userById = new Map(users.map((user) => [user.id, user]));
    const seen = new Set<number>();
    for (const member of members) {
      if (seen.has(member.userId)) continue;
      seen.add(member.userId);
      const user = userById.get(member.userId);
      try {
        await notify(ds, {
          userId: member.userId,
          audience,
          title,
          body,
          referenceType,
          referenceId,
          toEmail: user?.email,
          toPhone: user?.phone,
        });
      } catch {
        /* continue notifying remaining members */
      }
    }
  }

  async function postLedger(input: {
    apartmentId: number;
    type: "credit" | "debit";
    amountInPaise: number;
    purpose: string;
    notes?: string | null;
    referenceType?: string;
    referenceId?: number;
    createdByUserId?: number | null;
  }) {
    const account = await ensureAccount(input.apartmentId);
    if (input.type === "debit" && account.balanceInPaise < input.amountInPaise) {
      throw Object.assign(new Error("Society account does not have enough balance"), {
        statusCode: 400,
        code: "INSUFFICIENT_BALANCE",
      });
    }
    account.balanceInPaise =
      input.type === "credit"
        ? account.balanceInPaise + input.amountInPaise
        : account.balanceInPaise - input.amountInPaise;
    await accountRepo.save(account);
    return ledgerRepo.save(
      ledgerRepo.create({
        apartmentId: input.apartmentId,
        type: input.type,
        amountInPaise: input.amountInPaise,
        balanceAfterInPaise: account.balanceInPaise,
        purpose: input.purpose,
        notes: input.notes ?? null,
        referenceType: input.referenceType ?? null,
        referenceId: input.referenceId ?? null,
        createdByUserId: input.createdByUserId ?? null,
      }),
    );
  }

  async function ensureInvoiceForDue(due: CommunityDueEntity) {
    if (due.paymentStatus !== PaymentStatus.PAID) return null;
    let invoice = await invoiceRepo.findOne({ where: { dueId: due.id } });
    if (invoice) {
      if (invoice.amountInPaise !== due.amountInPaise || invoice.status !== PaymentStatus.PAID) {
        invoice.amountInPaise = due.amountInPaise;
        invoice.status = PaymentStatus.PAID;
        invoice = await invoiceRepo.save(invoice);
      }
      return invoice;
    }
    return invoiceRepo.save(
      invoiceRepo.create({
        dueId: due.id,
        apartmentId: due.apartmentId,
        residentUserId: due.residentUserId,
        amountInPaise: due.amountInPaise,
        status: PaymentStatus.PAID,
      }),
    );
  }

  async function markOverdueDues() {
    const now = new Date();
    const currentPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const dues = await dueRepo.find({
      where: { status: CommunityDueStatus.DUE, paymentStatus: PaymentStatus.PENDING },
      take: 100,
    });
    for (const due of dues) {
      if (due.period >= currentPeriod) continue;
      due.status = CommunityDueStatus.OVERDUE;
      await dueRepo.save(due);
      const user = await userRepo.findOne({ where: { id: due.residentUserId } });
      const apt = await apartmentRepo.findOne({ where: { id: due.apartmentId } });
      if (user) {
        void notify(ds, {
          userId: user.id,
          audience: "resident",
          title: "Maintenance overdue",
          body: [
            `Hello ${user.name ?? "Resident"},`,
            "",
            `Maintenance for ${due.period} at ${apt?.name ?? "your apartment"} is overdue.`,
            `Amount: ${formatInr(due.amountInPaise)}`,
            "",
            "Pay from Community → Dues to avoid further follow-up.",
          ].join("\n"),
          referenceType: "community_due",
          referenceId: due.id,
          toEmail: user.email,
          toPhone: user.phone,
        });
      }
    }
  }

  async function expireVisitorPasses() {
    const now = new Date();
    const rows = await visitorRepo.find({
      where: { status: CommunityVisitorStatus.SCHEDULED },
      take: 100,
    });
    for (const pass of rows) {
      if (pass.validTo.getTime() >= now.getTime()) continue;
      pass.status = CommunityVisitorStatus.EXPIRED;
      await visitorRepo.save(pass);
    }
  }

  await createService({
    name: "communities",
    port: envInt("COMMUNITIES_PORT", 3003),
    afterReady: async (app) => {
      const watch = setInterval(() => {
        void markOverdueDues().catch((err) => app.log.error({ err }, "Failed to mark overdue dues"));
        void expireVisitorPasses().catch((err) =>
          app.log.error({ err }, "Failed to expire visitor passes"),
        );
      }, 60_000);
      watch.unref?.();
    },
    registerRoutes: async (app) => {
      app.get("/v1/apartments/stats", async () => {
        const total = await apartmentRepo.count();
        const active = await apartmentRepo.count({ where: { isActive: true } });
        const inactive = await apartmentRepo.count({ where: { isActive: false } });
        const citiesRaw = await apartmentRepo
          .createQueryBuilder("a")
          .select("COUNT(DISTINCT a.city)", "cities")
          .getRawOne<{ cities: string }>();
        return {
          total,
          active,
          inactive,
          cities: Number(citiesRaw?.cities ?? 0),
        };
      });

      app.get("/v1/apartments", async (request) => {
        const query = paginationQuerySchema.parse(request.query);
        const qb = apartmentRepo.createQueryBuilder("a").orderBy("a.created_at", "DESC");
        if (query.q) {
          qb.andWhere(
            "(a.name ILIKE :q OR a.city ILIKE :q OR a.state ILIKE :q OR a.invite_code ILIKE :q OR a.address_line ILIKE :q)",
            { q: `%${query.q}%` },
          );
        }
        const total = await qb.getCount();
        const rows = await qb.skip((query.page - 1) * query.limit).take(query.limit).getMany();
        return {
          items: rows.map(serializeApartment),
          page: query.page,
          limit: query.limit,
          total,
          totalPages: Math.max(1, Math.ceil(total / query.limit)),
        };
      });

      app.get("/v1/apartments/:id", async (request, reply) => {
        const id = parseEntityId((request.params as { id: string }).id);
        const row = await apartmentRepo.findOne({ where: { id } });
        if (!row) {
          return reply.code(404).send({ error: { code: "NOT_FOUND", message: "Apartment not found" } });
        }
        return serializeApartment(row);
      });

      app.post("/v1/apartments", async (request, reply) => {
        const userId = parseUserIdFromHeaders(request.headers as Record<string, unknown>);
        const roles = getRolesFromHeaders(request.headers as Record<string, unknown>);
        if (!userId) {
          return reply.code(401).send({ error: { code: "UNAUTHORIZED", message: "Login required" } });
        }
        if (!isCommunityStaff(roles)) {
          return reply.code(403).send({
            error: { code: "FORBIDDEN", message: "Only Community Super Admin can create apartments" },
          });
        }
        const body = createApartmentSchema.parse(request.body);
        const row = apartmentRepo.create({
          name: body.name,
          inviteCode: makeInviteCode(),
          city: body.city,
          state: body.state,
          addressLine: body.addressLine,
          latitude: body.latitude ?? null,
          longitude: body.longitude ?? null,
          isActive: true,
        });
        const saved = await apartmentRepo.save(row);
        await ensureAccount(saved.id);
        return reply.code(201).send(serializeApartment(saved));
      });

      app.patch("/v1/apartments/:id", async (request, reply) => {
        const userId = parseUserIdFromHeaders(request.headers as Record<string, unknown>);
        const roles = getRolesFromHeaders(request.headers as Record<string, unknown>);
        if (!userId) {
          return reply.code(401).send({ error: { code: "UNAUTHORIZED", message: "Login required" } });
        }
        if (!isCommunityStaff(roles)) {
          return reply.code(403).send({
            error: { code: "FORBIDDEN", message: "Only Community Super Admin can update apartments" },
          });
        }
        const id = parseEntityId((request.params as { id: string }).id);
        const existing = await apartmentRepo.findOne({ where: { id } });
        if (!existing) {
          return reply.code(404).send({ error: { code: "NOT_FOUND", message: "Apartment not found" } });
        }
        const body = updateApartmentSchema.parse(request.body);
        Object.assign(existing, body);
        const saved = await apartmentRepo.save(existing);
        return serializeApartment(saved);
      });

      app.delete("/v1/apartments/:id", async (request, reply) => {
        const userId = parseUserIdFromHeaders(request.headers as Record<string, unknown>);
        const roles = getRolesFromHeaders(request.headers as Record<string, unknown>);
        if (!userId) {
          return reply.code(401).send({ error: { code: "UNAUTHORIZED", message: "Login required" } });
        }
        if (!isCommunityStaff(roles)) {
          return reply.code(403).send({
            error: { code: "FORBIDDEN", message: "Only Community Super Admin can delete apartments" },
          });
        }
        const id = parseEntityId((request.params as { id: string }).id);
        const result = await apartmentRepo.delete({ id });
        if (!result.affected) {
          return reply.code(404).send({ error: { code: "NOT_FOUND", message: "Apartment not found" } });
        }
        return reply.code(204).send();
      });

      app.post("/v1/apartments/join", async (request, reply) => {
        const body = joinApartmentSchema.parse(request.body);
        const match = await apartmentRepo.findOne({ where: { inviteCode: body.inviteCode } });
        if (!match) {
          return reply.code(404).send({
            error: { code: "INVALID_INVITE", message: "Invite code not found" },
          });
        }
        return {
          apartment: serializeApartment(match),
          membership: {
            status: "joined",
            blockName: body.blockName ?? null,
            flatNumber: body.flatNumber ?? null,
          },
        };
      });

      app.get("/v1/community/stats", async (request) => {
        const userId = parseUserIdFromHeaders(request.headers as Record<string, unknown>);
        const roles = getRolesFromHeaders(request.headers as Record<string, unknown>);
        const apartmentIdRaw = (request.query as { apartmentId?: string }).apartmentId;
        const apartmentId = apartmentIdRaw ? parseEntityId(apartmentIdRaw) : undefined;
        let scopeId: number | null = apartmentId ?? null;
        if (!isCommunityStaff(roles) && userId) {
          const membership = await membershipForUser(userId, apartmentId);
          scopeId = membership?.apartmentId ?? null;
        }
        if (!scopeId && isCommunityStaff(roles)) {
          const [apartments, membersPending, membersApproved, openComplaints, unpaidDues] =
            await Promise.all([
              apartmentRepo.count(),
              membershipRepo.count({ where: { status: CommunityMembershipStatus.PENDING } }),
              membershipRepo.count({ where: { status: CommunityMembershipStatus.APPROVED } }),
              complaintRepo.count({
                where: {
                  status: In([
                    CommunityComplaintStatus.OPEN,
                    CommunityComplaintStatus.ACKNOWLEDGED,
                    CommunityComplaintStatus.IN_PROGRESS,
                  ]),
                },
              }),
              dueRepo.count({
                where: { status: In([CommunityDueStatus.DUE, CommunityDueStatus.OVERDUE]) },
              }),
            ]);
          return { apartments, membersPending, membersApproved, openComplaints, unpaidDues, balanceInPaise: 0 };
        }
        if (!scopeId) {
          return {
            apartments: 0,
            membersPending: 0,
            membersApproved: 0,
            openComplaints: 0,
            unpaidDues: 0,
            balanceInPaise: 0,
          };
        }
        const account = await ensureAccount(scopeId);
        const [membersPending, membersApproved, openComplaints, unpaidDues] = await Promise.all([
          membershipRepo.count({
            where: { apartmentId: scopeId, status: CommunityMembershipStatus.PENDING },
          }),
          membershipRepo.count({
            where: { apartmentId: scopeId, status: CommunityMembershipStatus.APPROVED },
          }),
          complaintRepo.count({
            where: {
              apartmentId: scopeId,
              status: In([
                CommunityComplaintStatus.OPEN,
                CommunityComplaintStatus.ACKNOWLEDGED,
                CommunityComplaintStatus.IN_PROGRESS,
              ]),
            },
          }),
          dueRepo.count({
            where: {
              apartmentId: scopeId,
              status: In([CommunityDueStatus.DUE, CommunityDueStatus.OVERDUE]),
            },
          }),
        ]);
        return {
          apartments: 1,
          membersPending,
          membersApproved,
          openComplaints,
          unpaidDues,
          balanceInPaise: account.balanceInPaise,
        };
      });

      app.get("/v1/community/lookup", async (request, reply) => {
        const inviteCode = String((request.query as { inviteCode?: string }).inviteCode ?? "")
          .trim()
          .toUpperCase();
        if (inviteCode.length < 4) {
          return reply.code(400).send({
            error: { code: "INVALID_INVITE", message: "Enter a valid invite code" },
          });
        }
        const apartment = await apartmentRepo.findOne({ where: { inviteCode } });
        if (!apartment || !apartment.isActive) {
          return reply.code(404).send({
            error: { code: "INVALID_INVITE", message: "Invite code not found or apartment inactive" },
          });
        }
        const blocks = await blockRepo.find({ where: { apartmentId: apartment.id }, order: { name: "ASC" } });
        const flats = await flatRepo.find({ where: { apartmentId: apartment.id }, order: { number: "ASC" } });
        const blockMap = new Map(blocks.map((b) => [b.id, b.name]));
        return {
          apartment: serializeApartment(apartment),
          blocks: blocks.map(serializeBlock),
          flats: flats.map((f) => serializeFlat(f, blockMap.get(f.blockId) ?? null)),
        };
      });

      app.post("/v1/community/apartments", async (request, reply) => {
        const userId = parseUserIdFromHeaders(request.headers as Record<string, unknown>);
        const roles = getRolesFromHeaders(request.headers as Record<string, unknown>);
        if (!userId) {
          return reply.code(401).send({ error: { code: "UNAUTHORIZED", message: "Login required" } });
        }
        if (!isCommunityStaff(roles)) {
          return reply.code(403).send({
            error: { code: "FORBIDDEN", message: "Only Community Super Admin can create apartments" },
          });
        }
        const body = createApartmentSchema.parse(request.body);
        const saved = await apartmentRepo.save(
          apartmentRepo.create({
            name: body.name,
            inviteCode: makeInviteCode(),
            city: body.city,
            state: body.state,
            addressLine: body.addressLine,
            latitude: body.latitude ?? null,
            longitude: body.longitude ?? null,
            isActive: true,
          }),
        );
        await ensureAccount(saved.id);
        return reply.code(201).send(serializeApartment(saved));
      });

      app.get("/v1/community/blocks", async (request, reply) => {
        const apartmentId = parseEntityId((request.query as { apartmentId: string }).apartmentId);
        const apt = await apartmentRepo.findOne({ where: { id: apartmentId } });
        if (!apt) {
          return reply.code(404).send({ error: { code: "NOT_FOUND", message: "Apartment not found" } });
        }
        const rows = await blockRepo.find({ where: { apartmentId }, order: { name: "ASC" } });
        return { items: rows.map(serializeBlock) };
      });

      app.post("/v1/community/blocks", async (request, reply) => {
        const userId = parseUserIdFromHeaders(request.headers as Record<string, unknown>);
        const roles = getRolesFromHeaders(request.headers as Record<string, unknown>);
        if (!userId) {
          return reply.code(401).send({ error: { code: "UNAUTHORIZED", message: "Login required" } });
        }
        const body = createCommunityBlockSchema.parse(request.body);
        if (!(await isApartmentAdmin(userId, body.apartmentId, roles))) {
          return reply.code(403).send({ error: { code: "FORBIDDEN", message: "Apartment admin only" } });
        }
        const saved = await blockRepo.save(
          blockRepo.create({ apartmentId: body.apartmentId, name: body.name.trim() }),
        );
        return reply.code(201).send(serializeBlock(saved));
      });

      app.get("/v1/community/flats", async (request, reply) => {
        const query = request.query as { apartmentId?: string; blockId?: string };
        if (!query.apartmentId && !query.blockId) {
          return reply.code(400).send({ error: { code: "MISSING", message: "apartmentId or blockId required" } });
        }
        const where = query.blockId
          ? { blockId: parseEntityId(query.blockId) }
          : { apartmentId: parseEntityId(query.apartmentId!) };
        const rows = await flatRepo.find({ where, order: { number: "ASC" } });
        const blockIds = [...new Set(rows.map((r) => r.blockId))];
        const blocks = blockIds.length
          ? await blockRepo.find({ where: { id: In(blockIds) } })
          : [];
        const blockName = new Map(blocks.map((b) => [b.id, b.name]));
        return { items: rows.map((r) => serializeFlat(r, blockName.get(r.blockId) ?? null)) };
      });

      app.post("/v1/community/flats", async (request, reply) => {
        const userId = parseUserIdFromHeaders(request.headers as Record<string, unknown>);
        const roles = getRolesFromHeaders(request.headers as Record<string, unknown>);
        if (!userId) {
          return reply.code(401).send({ error: { code: "UNAUTHORIZED", message: "Login required" } });
        }
        const body = createCommunityFlatSchema.parse(request.body);
        const block = await blockRepo.findOne({ where: { id: body.blockId } });
        if (!block) {
          return reply.code(404).send({ error: { code: "NOT_FOUND", message: "Block not found" } });
        }
        if (!(await isApartmentAdmin(userId, block.apartmentId, roles))) {
          return reply.code(403).send({ error: { code: "FORBIDDEN", message: "Apartment admin only" } });
        }
        const saved = await flatRepo.save(
          flatRepo.create({
            blockId: block.id,
            apartmentId: block.apartmentId,
            number: body.number.trim(),
          }),
        );
        return reply.code(201).send(serializeFlat(saved, block.name));
      });

      app.post("/v1/community/members/register", async (request, reply) => {
        const actorId = parseUserIdFromHeaders(request.headers as Record<string, unknown>);
        const roles = getRolesFromHeaders(request.headers as Record<string, unknown>);
        if (!actorId) {
          return reply.code(401).send({ error: { code: "UNAUTHORIZED", message: "Login required" } });
        }
        const body = registerCommunityMemberSchema.parse(request.body);
        if (!isCommunityStaff(roles)) {
          if (!(await isApartmentAdmin(actorId, body.apartmentId, roles))) {
            return reply.code(403).send({
              error: {
                code: "FORBIDDEN",
                message: "Only apartment admin or Community Super Admin can register members",
              },
            });
          }
          if (body.role === CommunityMembershipRole.APARTMENT_ADMIN) {
            return reply.code(403).send({
              error: {
                code: "FORBIDDEN",
                message: "Only Community Super Admin can register apartment admins",
              },
            });
          }
        }

        const apartment = await apartmentRepo.findOne({ where: { id: body.apartmentId } });
        if (!apartment || !apartment.isActive) {
          return reply.code(404).send({
            error: { code: "NOT_FOUND", message: "Apartment not found or inactive" },
          });
        }

        let flat: ApartmentFlatEntity | null = null;
        if (body.flatId) {
          flat = await flatRepo.findOne({ where: { id: body.flatId, apartmentId: apartment.id } });
          if (!flat) {
            return reply.code(400).send({
              error: { code: "INVALID_FLAT", message: "Select a flat that belongs to this apartment" },
            });
          }
        }

        const assignedRole = userRoleForMembership(body.role);
        const roleLabel = membershipRoleLabel(body.role);
        const loginPath = communityLoginUrl();
        const email = body.email.trim().toLowerCase();

        let user = await userRepo.findOne({ where: { phone: body.phone } });
        if (user?.roles?.includes(UserRole.COMMUNITY_SUPER_ADMIN)) {
          return reply.code(409).send({
            error: {
              code: "DUPLICATE_USER",
              message: "This mobile belongs to Community Super Admin",
              field: "phone",
            },
          });
        }

        if (user && (await isCommunityIdentity(user))) {
          const existing = await membershipRepo.findOne({
            where: { apartmentId: apartment.id, userId: user.id },
          });
          if (existing?.status === CommunityMembershipStatus.APPROVED) {
            return reply.code(409).send({
              error: {
                code: "DUPLICATE_USER",
                message: "This mobile is already registered in Community for this apartment",
                field: "phone",
              },
            });
          }
        }

        const emailOwner = await findCommunityEmailOwner(email, user?.id);
        if (emailOwner) {
          return reply.code(409).send({
            error: {
              code: "DUPLICATE_USER",
              message: "This email is already registered in Community",
              field: "email",
            },
          });
        }

        if (!user) {
          user = await userRepo.save(
            userRepo.create({
              phone: body.phone,
              name: body.name,
              email,
              city: body.city,
              state: body.state,
              country: body.country ?? "IN",
              pinCode: body.pinCode,
              roles: [assignedRole],
              isActive: true,
            }),
          );
        } else {
          const existing = await membershipRepo.findOne({
            where: { apartmentId: apartment.id, userId: user.id },
          });
          if (existing?.status === CommunityMembershipStatus.APPROVED) {
            return reply.code(409).send({
              error: {
                code: "ALREADY_MEMBER",
                message: "This mobile is already registered for this apartment",
                field: "phone",
              },
            });
          }
          user.name = user.name || body.name;
          user.email = user.email || email;
          user.city = user.city || body.city;
          user.state = user.state || body.state;
          user.country = user.country || body.country || "IN";
          user.pinCode = user.pinCode || body.pinCode;
          if (!user.roles.includes(assignedRole)) {
            user.roles = [...user.roles, assignedRole];
          }
          user = await userRepo.save(user);
        }

        let membership = await membershipRepo.findOne({
          where: { apartmentId: apartment.id, userId: user.id },
        });
        if (membership) {
          membership.role = body.role;
          membership.flatId = flat?.id ?? null;
          membership.status = CommunityMembershipStatus.APPROVED;
          membership.rejectedReason = null;
          membership = await membershipRepo.save(membership);
        } else {
          membership = await membershipRepo.save(
            membershipRepo.create({
              apartmentId: apartment.id,
              userId: user.id,
              flatId: flat?.id ?? null,
              role: body.role,
              status: CommunityMembershipStatus.APPROVED,
            }),
          );
        }

        const inviteBody = [
          `Hello ${user.name ?? "there"},`,
          "",
          "You have been registered on Paashupatastra Community.",
          "",
          `Role: ${roleLabel}`,
          `Apartment: ${apartment.name}`,
          flat ? `Flat: ${flat.number}` : null,
          `Login page: ${loginPath}`,
          "",
          "Login credentials",
          `• Registered mobile: ${user.phone}`,
          `• Registered email: ${user.email}`,
          "",
          "How to sign in",
          "1. Open the Community login page above.",
          `2. Select role: ${roleLabel}.`,
          "3. Enter your registered mobile number.",
          "4. Request OTP — a fresh OTP is emailed to you on every login.",
          "5. Enter the OTP to access your Community portal.",
          "",
          "Do not share your OTP with anyone.",
          "",
          "— Paashupatastra Community",
        ]
          .filter((line) => line !== null)
          .join("\n");

        await notify(ds, {
          userId: user.id,
          audience: audienceForMembership(body.role),
          title: `You were registered as ${roleLabel}`,
          body: inviteBody,
          referenceType: "community_invite",
          referenceId: membership.id,
        });

        let invite: {
          accepted?: boolean;
          status?: string;
          smtpSent?: boolean;
          outboxPath?: string;
        } | null = null;
        let inviteError: string | undefined;
        try {
          const res = await fetch(`${notificationsBaseUrl()}/v1/notifications/email`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              userId: user.id,
              toEmail: user.email,
              toPhone: user.phone,
              title: `Paashupatastra Community invite — ${roleLabel}`,
              body: inviteBody,
              referenceType: "community_invite",
              referenceId: membership.id,
              skipLog: true,
            }),
          });
          if (!res.ok) {
            const text = await res.text();
            throw new Error(`Invite email failed (${res.status}): ${text}`);
          }
          invite = (await res.json()) as {
            accepted?: boolean;
            status?: string;
            smtpSent?: boolean;
            outboxPath?: string;
          };
        } catch (err) {
          inviteError = err instanceof Error ? err.message : "Invite email failed";
          app.log.error({ err }, "Community invite email failed");
        }

        if (body.role !== CommunityMembershipRole.APARTMENT_ADMIN) {
          void notifyMembers(
            apartment.id,
            "apartment_admin",
            `New ${roleLabel.toLowerCase()} registered`,
            [
              `${user.name ?? user.phone} was registered as ${roleLabel} for ${apartment.name}.`,
              flat ? `Flat: ${flat.number}` : null,
              `Mobile: ${user.phone}`,
            ]
              .filter((line): line is string => Boolean(line))
              .join("\n"),
            "community_invite",
            membership.id,
            CommunityMembershipRole.APARTMENT_ADMIN,
          );
        }

        return reply.code(201).send({
          membership: serializeMembership(membership),
          apartment: serializeApartment(apartment),
          user: {
            id: user.id,
            name: user.name,
            phone: user.phone,
            email: user.email,
            roles: user.roles,
          },
          invite: {
            loginPath,
            phone: user.phone,
            email: user.email,
            role: body.role,
            emailStatus: invite?.status ?? (inviteError ? "failed" : "unknown"),
            smtpSent: invite?.smtpSent ?? false,
            outboxPath: invite?.outboxPath,
            error: inviteError,
          },
        });
      });

      app.post("/v1/community/join", async (_request, reply) => {
        return reply.code(403).send({
          error: {
            code: "JOIN_DISABLED",
            message:
              "Community Super Admin registers apartment admins, residents, and guards. Self-join is not allowed.",
          },
        });
      });

      app.get("/v1/community/memberships/me", async (request, reply) => {
        const userId = parseUserIdFromHeaders(request.headers as Record<string, unknown>);
        if (!userId) {
          return reply.code(401).send({ error: { code: "UNAUTHORIZED", message: "Login required" } });
        }
        const rows = await membershipRepo.find({ where: { userId }, order: { createdAt: "DESC" } });
        const apartmentIds = rows.map((r) => r.apartmentId);
        const apartments = apartmentIds.length
          ? await apartmentRepo.find({ where: { id: In(apartmentIds) } })
          : [];
        const aptMap = new Map(apartments.map((a) => [a.id, a]));
        const flatIds = rows.map((r) => r.flatId).filter((id): id is number => id != null);
        const flats = flatIds.length ? await flatRepo.find({ where: { id: In(flatIds) } }) : [];
        const flatMap = new Map(flats.map((f) => [f.id, f]));
        return {
          items: rows.map((row) => ({
            ...serializeMembership(row),
            apartment: aptMap.get(row.apartmentId) ? serializeApartment(aptMap.get(row.apartmentId)!) : null,
            flat: row.flatId && flatMap.get(row.flatId) ? serializeFlat(flatMap.get(row.flatId)!) : null,
          })),
        };
      });

      app.get("/v1/community/memberships", async (request, reply) => {
        const userId = parseUserIdFromHeaders(request.headers as Record<string, unknown>);
        const roles = getRolesFromHeaders(request.headers as Record<string, unknown>);
        if (!userId) {
          return reply.code(401).send({ error: { code: "UNAUTHORIZED", message: "Login required" } });
        }
        const query = paginationQuerySchema.parse(request.query);
        const raw = request.query as { apartmentId?: string; status?: string; role?: string };
        const apartmentId = raw.apartmentId ? parseEntityId(raw.apartmentId) : undefined;
        if (!apartmentId && !isCommunityStaff(roles)) {
          return reply.code(400).send({ error: { code: "MISSING", message: "apartmentId required" } });
        }
        if (apartmentId && !(await isGuard(userId, apartmentId, roles))) {
          const access = await requireApprovedMembership(userId, apartmentId, roles);
          if (access.error || access.membership?.role !== CommunityMembershipRole.RESIDENT) {
            return reply.code(403).send({ error: { code: "FORBIDDEN", message: "Not allowed" } });
          }
        }
        const staff = isCommunityStaff(roles);
        const admin = apartmentId ? await isApartmentAdmin(userId, apartmentId, roles) : staff;
        const directory =
          staff || admin
            ? "open"
            : (await isGuard(userId, apartmentId!, roles))
              ? "residents"
              : "guards";
        const hideEmail = directory !== "open";
        const qb = membershipRepo.createQueryBuilder("m").orderBy("m.created_at", "DESC");
        if (apartmentId) qb.andWhere("m.apartment_id = :apartmentId", { apartmentId });
        if (directory === "residents") {
          qb.andWhere("m.role = :role", { role: CommunityMembershipRole.RESIDENT });
          qb.andWhere("m.status = :status", { status: CommunityMembershipStatus.APPROVED });
        } else if (directory === "guards") {
          qb.andWhere("m.role = :role", { role: CommunityMembershipRole.GUARD });
          qb.andWhere("m.status = :status", { status: CommunityMembershipStatus.APPROVED });
        } else {
          if (raw.status) qb.andWhere("m.status = :status", { status: raw.status });
          if (
            raw.role === CommunityMembershipRole.RESIDENT ||
            raw.role === CommunityMembershipRole.APARTMENT_ADMIN ||
            raw.role === CommunityMembershipRole.GUARD
          ) {
            qb.andWhere("m.role = :role", { role: raw.role });
          }
        }
        if (query.q) {
          const digits = query.q.replace(/\D/g, "");
          qb.leftJoin(UserEntity, "u", "u.id = m.user_id");
          if (digits) {
            qb.andWhere("(COALESCE(u.name, '') ILIKE :q OR u.phone ILIKE :q OR u.phone ILIKE :phone)", {
              q: `%${query.q}%`,
              phone: `%${digits}%`,
            });
          } else {
            qb.andWhere("COALESCE(u.name, '') ILIKE :q", { q: `%${query.q}%` });
          }
        }
        const total = await qb.getCount();
        const rows = await qb.skip((query.page - 1) * query.limit).take(query.limit).getMany();
        const userIds = rows.map((r) => r.userId);
        const users = userIds.length ? await userRepo.find({ where: { id: In(userIds) } }) : [];
        const userMap = new Map(users.map((u) => [u.id, u]));
        const apartmentIds = [...new Set(rows.map((r) => r.apartmentId))];
        const apartments = apartmentIds.length
          ? await apartmentRepo.find({ where: { id: In(apartmentIds) } })
          : [];
        const aptMap = new Map(apartments.map((a) => [a.id, a]));
        const flatIds = rows.map((r) => r.flatId).filter((id): id is number => id != null);
        const flats = flatIds.length ? await flatRepo.find({ where: { id: In(flatIds) } }) : [];
        const blocks = flats.length
          ? await blockRepo.find({ where: { id: In([...new Set(flats.map((f) => f.blockId))]) } })
          : [];
        const blockName = new Map(blocks.map((b) => [b.id, b.name]));
        const flatMap = new Map(flats.map((f) => [f.id, serializeFlat(f, blockName.get(f.blockId) ?? null)]));
        return {
          items: rows.map((row) => ({
            ...serializeMembership(row),
            apartment: aptMap.get(row.apartmentId) ? serializeApartment(aptMap.get(row.apartmentId)!) : null,
            flat: row.flatId ? flatMap.get(row.flatId) ?? null : null,
            user: userMap.get(row.userId)
              ? {
                  id: userMap.get(row.userId)!.id,
                  name: userMap.get(row.userId)!.name,
                  phone: userMap.get(row.userId)!.phone,
                  email: hideEmail ? null : userMap.get(row.userId)!.email,
                }
              : null,
          })),
          page: query.page,
          limit: query.limit,
          total,
          totalPages: Math.max(1, Math.ceil(total / query.limit)),
        };
      });

      app.post("/v1/community/memberships/:id/decide", async (request, reply) => {
        const userId = parseUserIdFromHeaders(request.headers as Record<string, unknown>);
        const roles = getRolesFromHeaders(request.headers as Record<string, unknown>);
        if (!userId) {
          return reply.code(401).send({ error: { code: "UNAUTHORIZED", message: "Login required" } });
        }
        const id = parseEntityId((request.params as { id: string }).id);
        const body = decideCommunityMembershipSchema.parse(request.body);
        const membership = await membershipRepo.findOne({ where: { id } });
        if (!membership) {
          return reply.code(404).send({ error: { code: "NOT_FOUND", message: "Membership not found" } });
        }
        if (!(await isApartmentAdmin(userId, membership.apartmentId, roles))) {
          return reply.code(403).send({ error: { code: "FORBIDDEN", message: "Apartment admin only" } });
        }
        if (
          membership.role === CommunityMembershipRole.APARTMENT_ADMIN &&
          body.decision !== "approve" &&
          !isCommunityStaff(roles)
        ) {
          return reply.code(403).send({
            error: {
              code: "FORBIDDEN",
              message: "Apartment admins cannot be deactivated from the society portal",
            },
          });
        }
        membership.status =
          body.decision === "approve"
            ? CommunityMembershipStatus.APPROVED
            : body.decision === "suspend"
              ? CommunityMembershipStatus.SUSPENDED
              : CommunityMembershipStatus.REJECTED;
        const saved = await membershipRepo.save(membership);
        const member = await userRepo.findOne({ where: { id: membership.userId } });
        const apt = await apartmentRepo.findOne({ where: { id: membership.apartmentId } });
        if (member) {
          const title =
            body.decision === "approve"
              ? "Community access activated"
              : body.decision === "suspend"
                ? "Community access deactivated"
                : "Apartment membership rejected";
          void notify(ds, {
            userId: member.id,
            audience: membership.role === CommunityMembershipRole.GUARD ? "guard" : "resident",
            title,
            body: [
              `Hello ${member.name ?? "there"},`,
              "",
              body.decision === "approve"
                ? `Your ${membership.role.replaceAll("_", " ")} access for ${apt?.name ?? "the apartment"} is active. You can log in at Community login.`
                : body.decision === "suspend"
                  ? `Your ${membership.role.replaceAll("_", " ")} access for ${apt?.name ?? "the apartment"} has been deactivated. Contact your apartment admin.`
                  : `Your ${membership.role.replaceAll("_", " ")} request for ${apt?.name ?? "the apartment"} was rejected.`,
            ].join("\n"),
            referenceType: "community_membership",
            referenceId: saved.id,
            toEmail: member.email,
            toPhone: member.phone,
          });
        }
        return serializeMembership(saved);
      });

      app.get("/v1/community/notices", async (request, reply) => {
        const userId = parseUserIdFromHeaders(request.headers as Record<string, unknown>);
        const roles = getRolesFromHeaders(request.headers as Record<string, unknown>);
        if (!userId) {
          return reply.code(401).send({ error: { code: "UNAUTHORIZED", message: "Login required" } });
        }
        const apartmentIdRaw = (request.query as { apartmentId?: string }).apartmentId;
        const apartmentId = apartmentIdRaw ? parseEntityId(apartmentIdRaw) : undefined;
        const access = await requireApprovedMembership(userId, apartmentId, roles);
        if (access.error || !access.apartment) {
          return reply.code(403).send({ error: { code: "FORBIDDEN", message: access.error } });
        }
        const rows = await noticeRepo.find({
          where: { apartmentId: access.apartment.id, isActive: true },
          order: { createdAt: "DESC" },
          take: 50,
        });
        return {
          items: rows.map((row) => ({
            id: row.id,
            apartmentId: row.apartmentId,
            title: row.title,
            body: row.body,
            createdAt: toIsoRequired(row.createdAt),
          })),
        };
      });

      app.post("/v1/community/notices", async (request, reply) => {
        const userId = parseUserIdFromHeaders(request.headers as Record<string, unknown>);
        const roles = getRolesFromHeaders(request.headers as Record<string, unknown>);
        if (!userId) {
          return reply.code(401).send({ error: { code: "UNAUTHORIZED", message: "Login required" } });
        }
        const body = createCommunityNoticeSchema.parse(request.body);
        const apartmentId = body.apartmentId;
        if (!apartmentId) {
          return reply.code(400).send({ error: { code: "MISSING", message: "apartmentId required" } });
        }
        if (!(await isApartmentAdmin(userId, apartmentId, roles))) {
          return reply.code(403).send({ error: { code: "FORBIDDEN", message: "Apartment admin only" } });
        }
        const saved = await noticeRepo.save(
          noticeRepo.create({
            apartmentId,
            createdByUserId: userId,
            title: body.title,
            body: body.body,
            isActive: body.isActive ?? true,
          }),
        );
        const apt = await apartmentRepo.findOne({ where: { id: apartmentId } });
        await notifyMembers(
          apartmentId,
          "resident",
          `Notice: ${saved.title}`,
          [`${apt?.name ?? "Your apartment"} posted a notice.`, "", saved.body].join("\n"),
          "community_notice",
          saved.id,
        );
        return reply.code(201).send({
          id: saved.id,
          title: saved.title,
          body: saved.body,
          createdAt: toIsoRequired(saved.createdAt),
        });
      });

      app.get("/v1/community/complaints", async (request, reply) => {
        const userId = parseUserIdFromHeaders(request.headers as Record<string, unknown>);
        const roles = getRolesFromHeaders(request.headers as Record<string, unknown>);
        if (!userId) {
          return reply.code(401).send({ error: { code: "UNAUTHORIZED", message: "Login required" } });
        }
        const query = paginationQuerySchema.parse(request.query);
        const raw = request.query as { apartmentId?: string };
        const apartmentId = raw.apartmentId ? parseEntityId(raw.apartmentId) : undefined;
        const access = await requireApprovedMembership(userId, apartmentId, roles);
        if (access.error || !access.apartment) {
          return reply.code(403).send({ error: { code: "FORBIDDEN", message: access.error } });
        }
        const admin = await isApartmentAdmin(userId, access.apartment.id, roles);
        const qb = complaintRepo
          .createQueryBuilder("c")
          .where("c.apartment_id = :apartmentId", { apartmentId: access.apartment.id })
          .orderBy("c.created_at", "DESC");
        if (!admin && !isCommunityStaff(roles)) {
          qb.andWhere("c.resident_user_id = :userId", { userId });
        }
        const total = await qb.getCount();
        const rows = await qb.skip((query.page - 1) * query.limit).take(query.limit).getMany();
        return {
          items: rows.map((row) => serializeComplaint(row)),
          page: query.page,
          limit: query.limit,
          total,
          totalPages: Math.max(1, Math.ceil(total / query.limit)),
        };
      });

      app.post("/v1/community/complaints", async (request, reply) => {
        const userId = parseUserIdFromHeaders(request.headers as Record<string, unknown>);
        const roles = getRolesFromHeaders(request.headers as Record<string, unknown>);
        if (!userId) {
          return reply.code(401).send({ error: { code: "UNAUTHORIZED", message: "Login required" } });
        }
        const body = createCommunityComplaintSchema.parse(request.body);
        const access = await requireApprovedMembership(userId, body.apartmentId, roles);
        if (access.error || !access.apartment || !access.membership) {
          return reply.code(403).send({ error: { code: "FORBIDDEN", message: access.error } });
        }
        const saved = await complaintRepo.save(
          complaintRepo.create({
            apartmentId: access.apartment.id,
            residentUserId: userId,
            flatId: access.membership.flatId,
            category: body.category,
            title: body.title,
            body: body.body,
            status: CommunityComplaintStatus.OPEN,
          }),
        );
        const user = await userRepo.findOne({ where: { id: userId } });
        await notifyMembers(
          access.apartment.id,
          "apartment_admin",
          "New complaint",
          [
            `${user?.name ?? "A resident"} raised: ${saved.title}`,
            `Category: ${saved.category.replaceAll("_", " ")}`,
            "",
            saved.body,
          ].join("\n"),
          "community_complaint",
          saved.id,
          CommunityMembershipRole.APARTMENT_ADMIN,
        );
        return reply.code(201).send(saved);
      });

      app.patch("/v1/community/complaints/:id", async (request, reply) => {
        const userId = parseUserIdFromHeaders(request.headers as Record<string, unknown>);
        const roles = getRolesFromHeaders(request.headers as Record<string, unknown>);
        if (!userId) {
          return reply.code(401).send({ error: { code: "UNAUTHORIZED", message: "Login required" } });
        }
        const id = parseEntityId((request.params as { id: string }).id);
        const body = updateCommunityComplaintSchema.parse(request.body);
        const complaint = await complaintRepo.findOne({ where: { id } });
        if (!complaint) {
          return reply.code(404).send({ error: { code: "NOT_FOUND", message: "Complaint not found" } });
        }
        if (!(await isApartmentAdmin(userId, complaint.apartmentId, roles))) {
          return reply.code(403).send({ error: { code: "FORBIDDEN", message: "Apartment admin only" } });
        }
        complaint.status = body.status;
        if (body.adminNotes !== undefined) complaint.adminNotes = body.adminNotes;
        if (isComplaintClosedStatus(body.status)) {
          complaint.closedAt = complaint.closedAt ?? new Date();
        } else {
          complaint.closedAt = null;
        }
        const saved = await complaintRepo.save(complaint);
        const resident = await userRepo.findOne({ where: { id: complaint.residentUserId } });
        if (resident) {
          void notify(ds, {
            userId: resident.id,
            audience: "resident",
            title: `Complaint ${saved.status.replaceAll("_", " ")}`,
            body: [
              `Hello ${resident.name ?? "Resident"},`,
              "",
              `Your complaint "${saved.title}" is now ${saved.status.replaceAll("_", " ")}.`,
              saved.adminNotes ? `Note: ${saved.adminNotes}` : "",
            ]
              .filter(Boolean)
              .join("\n"),
            referenceType: "community_complaint",
            referenceId: saved.id,
            toEmail: resident.email,
            toPhone: resident.phone,
          });
        }
        return serializeComplaint(saved);
      });

      app.get("/v1/community/visitors", async (request, reply) => {
        const userId = parseUserIdFromHeaders(request.headers as Record<string, unknown>);
        const roles = getRolesFromHeaders(request.headers as Record<string, unknown>);
        if (!userId) {
          return reply.code(401).send({ error: { code: "UNAUTHORIZED", message: "Login required" } });
        }
        const apartmentIdRaw = (request.query as { apartmentId?: string }).apartmentId;
        const apartmentId = apartmentIdRaw ? parseEntityId(apartmentIdRaw) : undefined;
        const access = await requireApprovedMembership(userId, apartmentId, roles);
        if (access.error || !access.apartment) {
          return reply.code(403).send({ error: { code: "FORBIDDEN", message: access.error } });
        }
        const guard = await isGuard(userId, access.apartment.id, roles);
        const admin = await isApartmentAdmin(userId, access.apartment.id, roles);
        const qb = visitorRepo
          .createQueryBuilder("v")
          .where("v.apartment_id = :apartmentId", { apartmentId: access.apartment.id })
          .orderBy("v.created_at", "DESC")
          .take(50);
        if (!guard && !admin && !isCommunityStaff(roles)) {
          qb.andWhere("v.resident_user_id = :userId", { userId });
        }
        const rows = await qb.getMany();
        return {
          items: rows.map((row) => ({
            id: row.id,
            guestName: row.guestName,
            guestPhone: row.guestPhone,
            vehicleNumber: row.vehicleNumber,
            purpose: row.purpose,
            validFrom: toIsoRequired(row.validFrom),
            validTo: toIsoRequired(row.validTo),
            otp: row.residentUserId === userId || guard || admin ? row.otp : undefined,
            status: row.status,
            checkedInAt: toIso(row.checkedInAt),
            checkedOutAt: toIso(row.checkedOutAt),
            createdAt: toIsoRequired(row.createdAt),
          })),
        };
      });

      app.post("/v1/community/visitors", async (request, reply) => {
        const userId = parseUserIdFromHeaders(request.headers as Record<string, unknown>);
        const roles = getRolesFromHeaders(request.headers as Record<string, unknown>);
        if (!userId) {
          return reply.code(401).send({ error: { code: "UNAUTHORIZED", message: "Login required" } });
        }
        const body = createCommunityVisitorPassSchema.parse(request.body);
        const access = await requireApprovedMembership(userId, body.apartmentId, roles);
        if (access.error || !access.apartment || !access.membership) {
          return reply.code(403).send({ error: { code: "FORBIDDEN", message: access.error } });
        }
        if (access.membership.role === CommunityMembershipRole.GUARD) {
          return reply.code(403).send({
            error: { code: "FORBIDDEN", message: "Guards verify passes; residents create them" },
          });
        }
        const validFrom = new Date(body.validFrom);
        const validTo = new Date(body.validTo);
        if (!(validFrom.getTime() < validTo.getTime())) {
          return reply.code(400).send({
            error: { code: "INVALID_WINDOW", message: "validTo must be after validFrom" },
          });
        }
        const saved = await visitorRepo.save(
          visitorRepo.create({
            apartmentId: access.apartment.id,
            residentUserId: userId,
            guestName: body.guestName,
            guestPhone: body.guestPhone,
            vehicleNumber: body.vehicleNumber ?? null,
            purpose: body.purpose ?? null,
            validFrom,
            validTo,
            otp: makeVisitorOtp(),
            status: CommunityVisitorStatus.SCHEDULED,
          }),
        );
        const resident = await userRepo.findOne({ where: { id: userId } });
        if (resident) {
          void notify(ds, {
            userId: resident.id,
            audience: "resident",
            title: "Visitor pass created",
            body: [
              `Guest: ${saved.guestName}`,
              `OTP: ${saved.otp}`,
              `Valid: ${validFrom.toLocaleString("en-IN")} – ${validTo.toLocaleString("en-IN")}`,
              "",
              "Share the OTP only with your guest. Guard will verify at the gate.",
            ].join("\n"),
            referenceType: "community_visitor",
            referenceId: saved.id,
            toEmail: resident.email,
            toPhone: resident.phone,
          });
        }
        await notifyMembers(
          access.apartment.id,
          "guard",
          "Upcoming visitor",
          [
            `Guest ${saved.guestName} for ${resident?.name ?? "a resident"}.`,
            `Window: ${validFrom.toLocaleString("en-IN")} – ${validTo.toLocaleString("en-IN")}`,
            "Verify OTP at the gate when they arrive.",
          ].join("\n"),
          "community_visitor",
          saved.id,
          CommunityMembershipRole.GUARD,
        );
        return reply.code(201).send({
          ...saved,
          validFrom: toIsoRequired(saved.validFrom),
          validTo: toIsoRequired(saved.validTo),
        });
      });

      app.post("/v1/community/visitors/:id/verify", async (request, reply) => {
        const userId = parseUserIdFromHeaders(request.headers as Record<string, unknown>);
        const roles = getRolesFromHeaders(request.headers as Record<string, unknown>);
        if (!userId) {
          return reply.code(401).send({ error: { code: "UNAUTHORIZED", message: "Login required" } });
        }
        const id = parseEntityId((request.params as { id: string }).id);
        const body = verifyCommunityVisitorSchema.parse(request.body);
        const pass = await visitorRepo.findOne({ where: { id } });
        if (!pass) {
          return reply.code(404).send({ error: { code: "NOT_FOUND", message: "Pass not found" } });
        }
        if (!(await isGuard(userId, pass.apartmentId, roles))) {
          return reply.code(403).send({ error: { code: "FORBIDDEN", message: "Guard or admin only" } });
        }
        if (pass.otp !== body.otp.trim()) {
          return reply.code(401).send({ error: { code: "INVALID_OTP", message: "Invalid visitor OTP" } });
        }
        const now = new Date();
        if (now < pass.validFrom || now > pass.validTo) {
          return reply.code(400).send({
            error: { code: "OUTSIDE_WINDOW", message: "Pass is outside its valid time window" },
          });
        }
        if (body.action === "check_out") {
          if (pass.status !== CommunityVisitorStatus.CHECKED_IN) {
            return reply.code(400).send({
              error: { code: "INVALID_STATUS", message: "Guest is not checked in" },
            });
          }
          pass.status = CommunityVisitorStatus.CHECKED_OUT;
          pass.checkedOutAt = now;
        } else {
          if (
            pass.status !== CommunityVisitorStatus.SCHEDULED &&
            pass.status !== CommunityVisitorStatus.CHECKED_IN
          ) {
            return reply.code(400).send({
              error: { code: "INVALID_STATUS", message: "Pass cannot be checked in" },
            });
          }
          pass.status = CommunityVisitorStatus.CHECKED_IN;
          pass.checkedInAt = pass.checkedInAt ?? now;
        }
        const saved = await visitorRepo.save(pass);
        const resident = await userRepo.findOne({ where: { id: pass.residentUserId } });
        if (resident) {
          void notify(ds, {
            userId: resident.id,
            audience: "resident",
            title: body.action === "check_out" ? "Guest checked out" : "Guest checked in",
            body: `${pass.guestName} was ${body.action === "check_out" ? "checked out" : "checked in"} at the gate.`,
            referenceType: "community_visitor",
            referenceId: saved.id,
            toEmail: resident.email,
            toPhone: resident.phone,
          });
        }
        return {
          id: saved.id,
          status: saved.status,
          checkedInAt: toIso(saved.checkedInAt),
          checkedOutAt: toIso(saved.checkedOutAt),
        };
      });

      app.get("/v1/community/account", async (request, reply) => {
        const userId = parseUserIdFromHeaders(request.headers as Record<string, unknown>);
        const roles = getRolesFromHeaders(request.headers as Record<string, unknown>);
        if (!userId) {
          return reply.code(401).send({ error: { code: "UNAUTHORIZED", message: "Login required" } });
        }
        const apartmentIdRaw = (request.query as { apartmentId?: string }).apartmentId;
        const apartmentId = apartmentIdRaw ? parseEntityId(apartmentIdRaw) : undefined;
        const access = await requireApprovedMembership(userId, apartmentId, roles);
        if (access.error || !access.apartment) {
          return reply.code(403).send({ error: { code: "FORBIDDEN", message: access.error } });
        }
        const account = await ensureAccount(access.apartment.id);
        return {
          apartmentId: account.apartmentId,
          balanceInPaise: account.balanceInPaise,
          monthlyMaintenanceInPaise: account.monthlyMaintenanceInPaise,
          dueDay: account.dueDay,
        };
      });

      app.patch("/v1/community/account", async (request, reply) => {
        const userId = parseUserIdFromHeaders(request.headers as Record<string, unknown>);
        const roles = getRolesFromHeaders(request.headers as Record<string, unknown>);
        if (!userId) {
          return reply.code(401).send({ error: { code: "UNAUTHORIZED", message: "Login required" } });
        }
        const body = updateCommunityAccountSchema.parse(request.body);
        const apartmentId = (request.query as { apartmentId?: string }).apartmentId
          ? parseEntityId((request.query as { apartmentId: string }).apartmentId)
          : undefined;
        if (!apartmentId) {
          return reply.code(400).send({ error: { code: "MISSING", message: "apartmentId required" } });
        }
        if (!(await isApartmentAdmin(userId, apartmentId, roles))) {
          return reply.code(403).send({ error: { code: "FORBIDDEN", message: "Apartment admin only" } });
        }
        const account = await ensureAccount(apartmentId);
        if (body.monthlyMaintenanceInPaise != null) {
          account.monthlyMaintenanceInPaise = body.monthlyMaintenanceInPaise;
        }
        if (body.dueDay != null) account.dueDay = body.dueDay;
        const saved = await accountRepo.save(account);
        return {
          apartmentId: saved.apartmentId,
          balanceInPaise: saved.balanceInPaise,
          monthlyMaintenanceInPaise: saved.monthlyMaintenanceInPaise,
          dueDay: saved.dueDay,
        };
      });

      app.get("/v1/community/ledger", async (request, reply) => {
        const userId = parseUserIdFromHeaders(request.headers as Record<string, unknown>);
        const roles = getRolesFromHeaders(request.headers as Record<string, unknown>);
        if (!userId) {
          return reply.code(401).send({ error: { code: "UNAUTHORIZED", message: "Login required" } });
        }
        const query = paginationQuerySchema.parse(request.query);
        const apartmentIdRaw = (request.query as { apartmentId?: string }).apartmentId;
        const apartmentId = apartmentIdRaw ? parseEntityId(apartmentIdRaw) : undefined;
        const access = await requireApprovedMembership(userId, apartmentId, roles);
        if (access.error || !access.apartment) {
          return reply.code(403).send({ error: { code: "FORBIDDEN", message: access.error } });
        }
        const qb = ledgerRepo
          .createQueryBuilder("l")
          .where("l.apartment_id = :apartmentId", { apartmentId: access.apartment.id })
          .orderBy("l.created_at", "DESC");
        const total = await qb.getCount();
        const rows = await qb.skip((query.page - 1) * query.limit).take(query.limit).getMany();
        return {
          items: rows.map((row) => ({
            id: row.id,
            type: row.type,
            amountInPaise: row.amountInPaise,
            balanceAfterInPaise: row.balanceAfterInPaise,
            purpose: row.purpose,
            notes: row.notes,
            createdAt: toIsoRequired(row.createdAt),
          })),
          page: query.page,
          limit: query.limit,
          total,
          totalPages: Math.max(1, Math.ceil(total / query.limit)),
        };
      });

      app.post("/v1/community/dues", async (request, reply) => {
        const userId = parseUserIdFromHeaders(request.headers as Record<string, unknown>);
        const roles = getRolesFromHeaders(request.headers as Record<string, unknown>);
        if (!userId) {
          return reply.code(401).send({ error: { code: "UNAUTHORIZED", message: "Login required" } });
        }
        const body = postCommunityDuesSchema.parse(request.body);
        if (!body.apartmentId) {
          return reply.code(400).send({ error: { code: "MISSING", message: "apartmentId required" } });
        }
        if (!(await isApartmentAdmin(userId, body.apartmentId, roles))) {
          return reply.code(403).send({ error: { code: "FORBIDDEN", message: "Apartment admin only" } });
        }
        const account = await ensureAccount(body.apartmentId);
        const amount = body.amountInPaise ?? account.monthlyMaintenanceInPaise;
        if (amount <= 0) {
          return reply.code(400).send({
            error: {
              code: "AMOUNT_REQUIRED",
              message: "Set monthly maintenance on the society account first",
            },
          });
        }
        const residents = await membershipRepo.find({
          where: {
            apartmentId: body.apartmentId,
            role: In([CommunityMembershipRole.RESIDENT, CommunityMembershipRole.APARTMENT_ADMIN]),
            status: CommunityMembershipStatus.APPROVED,
          },
        });
        const created: CommunityDueEntity[] = [];
        for (const member of residents) {
          const existing = await dueRepo.findOne({
            where: { apartmentId: body.apartmentId, membershipId: member.id, period: body.period },
          });
          if (existing) continue;
          const due = await dueRepo.save(
            dueRepo.create({
              apartmentId: body.apartmentId,
              membershipId: member.id,
              residentUserId: member.userId,
              flatId: member.flatId,
              period: body.period,
              amountInPaise: amount,
              status: CommunityDueStatus.DUE,
              paymentStatus: PaymentStatus.PENDING,
            }),
          );
          created.push(due);
          const user = await userRepo.findOne({ where: { id: member.userId } });
          const apt = await apartmentRepo.findOne({ where: { id: body.apartmentId } });
          if (user) {
            void notify(ds, {
              userId: user.id,
              audience: "resident",
              title: `Maintenance due for ${body.period}`,
              body: [
                `Hello ${user.name ?? "Resident"},`,
                "",
                `${apt?.name ?? "Your apartment"} posted maintenance for ${body.period}.`,
                `Amount: ${formatInr(amount)}`,
                "",
                "Pay from Community → Dues.",
              ].join("\n"),
              referenceType: "community_due",
              referenceId: due.id,
              toEmail: user.email,
              toPhone: user.phone,
            });
          }
        }
        return reply.code(201).send({ created: created.length, period: body.period, amountInPaise: amount });
      });

      app.get("/v1/community/dues", async (request, reply) => {
        const userId = parseUserIdFromHeaders(request.headers as Record<string, unknown>);
        const roles = getRolesFromHeaders(request.headers as Record<string, unknown>);
        if (!userId) {
          return reply.code(401).send({ error: { code: "UNAUTHORIZED", message: "Login required" } });
        }
        const query = paginationQuerySchema.parse(request.query);
        const apartmentIdRaw = (request.query as { apartmentId?: string }).apartmentId;
        const apartmentId = apartmentIdRaw ? parseEntityId(apartmentIdRaw) : undefined;
        const access = await requireApprovedMembership(userId, apartmentId, roles);
        if (access.error || !access.apartment) {
          return reply.code(403).send({ error: { code: "FORBIDDEN", message: access.error } });
        }
        const admin = await isApartmentAdmin(userId, access.apartment.id, roles);
        const qb = dueRepo
          .createQueryBuilder("d")
          .where("d.apartment_id = :apartmentId", { apartmentId: access.apartment.id })
          .orderBy("d.created_at", "DESC");
        if (!admin && !isCommunityStaff(roles)) {
          qb.andWhere("d.resident_user_id = :userId", { userId });
        }
        const total = await qb.getCount();
        const rows = await qb.skip((query.page - 1) * query.limit).take(query.limit).getMany();
        return {
          items: rows.map((row) => ({
            id: row.id,
            period: row.period,
            amountInPaise: row.amountInPaise,
            status: row.status,
            paymentStatus: row.paymentStatus,
            paidAt: toIso(row.paidAt),
            createdAt: toIsoRequired(row.createdAt),
          })),
          page: query.page,
          limit: query.limit,
          total,
          totalPages: Math.max(1, Math.ceil(total / query.limit)),
        };
      });

      app.post("/v1/community/dues/:id/confirm-payment", async (request, reply) => {
        const userId = parseUserIdFromHeaders(request.headers as Record<string, unknown>);
        const id = parseEntityId((request.params as { id: string }).id);
        const body = confirmCommunityDuePaymentSchema.parse(request.body ?? {});
        let due = await dueRepo.findOne({ where: { id } });
        if (!due) {
          return reply.code(404).send({ error: { code: "NOT_FOUND", message: "Due not found" } });
        }
        if (userId && due.residentUserId !== userId) {
          return reply.code(403).send({ error: { code: "FORBIDDEN", message: "Not your due" } });
        }
        if (due.status === CommunityDueStatus.CANCELLED) {
          return reply.code(400).send({ error: { code: "CANCELLED", message: "This due was cancelled" } });
        }
        const wasPaid = due.paymentStatus === PaymentStatus.PAID;
        due.paymentStatus = PaymentStatus.PAID;
        due.status = CommunityDueStatus.PAID;
        due.paymentProvider = "cashfree";
        if (body.orderId) due.paymentProviderOrderId = body.orderId;
        due.paidAt = due.paidAt ?? new Date();
        due = await dueRepo.save(due);
        await ensureInvoiceForDue(due);
        if (!wasPaid) {
          try {
            await postLedger({
              apartmentId: due.apartmentId,
              type: "credit",
              amountInPaise: due.amountInPaise,
              purpose: "maintenance_payment",
              notes: `Maintenance ${due.period}`,
              referenceType: "community_due",
              referenceId: due.id,
              createdByUserId: due.residentUserId,
            });
          } catch (err) {
            app.log.error({ err, dueId: due.id }, "Failed to credit society ledger");
          }
          const resident = await userRepo.findOne({ where: { id: due.residentUserId } });
          const apt = await apartmentRepo.findOne({ where: { id: due.apartmentId } });
          if (resident) {
            void notify(ds, {
              userId: resident.id,
              audience: "resident",
              title: "Maintenance paid",
              body: `Payment of ${formatInr(due.amountInPaise)} for ${due.period} at ${apt?.name ?? "your apartment"} is confirmed.`,
              referenceType: "community_due",
              referenceId: due.id,
              toEmail: resident.email,
              toPhone: resident.phone,
            });
          }
          await notifyMembers(
            due.apartmentId,
            "apartment_admin",
            "Maintenance received",
            `${resident?.name ?? "A resident"} paid ${formatInr(due.amountInPaise)} for ${due.period}.`,
            "community_due",
            due.id,
            CommunityMembershipRole.APARTMENT_ADMIN,
          );
        }
        return { due, alreadyPaid: wasPaid };
      });

      app.post("/v1/community/expenses", async (request, reply) => {
        const userId = parseUserIdFromHeaders(request.headers as Record<string, unknown>);
        const roles = getRolesFromHeaders(request.headers as Record<string, unknown>);
        if (!userId) {
          return reply.code(401).send({ error: { code: "UNAUTHORIZED", message: "Login required" } });
        }
        const body = createCommunityExpenseSchema.parse(request.body);
        if (!body.apartmentId) {
          return reply.code(400).send({ error: { code: "MISSING", message: "apartmentId required" } });
        }
        if (!(await isApartmentAdmin(userId, body.apartmentId, roles))) {
          return reply.code(403).send({ error: { code: "FORBIDDEN", message: "Apartment admin only" } });
        }
        try {
          const expense = await expenseRepo.save(
            expenseRepo.create({
              apartmentId: body.apartmentId,
              createdByUserId: userId,
              category: body.category,
              vendor: body.vendor,
              amountInPaise: body.amountInPaise,
              notes: body.notes ?? null,
              receiptUrl: body.receiptUrl ?? null,
            }),
          );
          await postLedger({
            apartmentId: body.apartmentId,
            type: "debit",
            amountInPaise: body.amountInPaise,
            purpose: "expense",
            notes: `${body.category} · ${body.vendor}`,
            referenceType: "community_expense",
            referenceId: expense.id,
            createdByUserId: userId,
          });
          const apt = await apartmentRepo.findOne({ where: { id: body.apartmentId } });
          const expenseBody = [
            `${apt?.name ?? "Your apartment"} recorded a society expense of ${formatInr(body.amountInPaise)}.`,
            `Vendor: ${body.vendor}`,
            `Category: ${body.category.replaceAll("_", " ")}`,
            body.notes ? `Notes: ${body.notes}` : null,
            "",
            "Open Community → Expenses to view the full list.",
          ]
            .filter((line): line is string => line !== null)
            .join("\n");
          await notifyMembers(
            body.apartmentId,
            "resident",
            "Society expense recorded",
            expenseBody,
            "community_expense",
            expense.id,
            CommunityMembershipRole.RESIDENT,
          );
          return reply.code(201).send(expense);
        } catch (err) {
          const statusCode = (err as { statusCode?: number }).statusCode ?? 500;
          return reply.code(statusCode).send({
            error: {
              code: (err as { code?: string }).code ?? "EXPENSE_FAILED",
              message: err instanceof Error ? err.message : "Failed to record expense",
            },
          });
        }
      });

      app.get("/v1/community/expenses", async (request, reply) => {
        const userId = parseUserIdFromHeaders(request.headers as Record<string, unknown>);
        const roles = getRolesFromHeaders(request.headers as Record<string, unknown>);
        if (!userId) {
          return reply.code(401).send({ error: { code: "UNAUTHORIZED", message: "Login required" } });
        }
        const query = listCommunityExpensesQuerySchema.parse(request.query);
        const apartmentId = query.apartmentId;
        const access = await requireApprovedMembership(userId, apartmentId, roles);
        if (access.error || !access.apartment) {
          return reply.code(403).send({ error: { code: "FORBIDDEN", message: access.error } });
        }
        const qb = applyExpenseListFilters(
          expenseRepo
            .createQueryBuilder("e")
            .where("e.apartment_id = :apartmentId", { apartmentId: access.apartment.id })
            .orderBy("e.created_at", "DESC"),
          query,
        );
        const total = await qb.getCount();
        const rows = await qb.skip((query.page - 1) * query.limit).take(query.limit).getMany();
        return {
          items: rows.map((row) => ({
            id: row.id,
            category: row.category,
            vendor: row.vendor,
            amountInPaise: row.amountInPaise,
            notes: row.notes,
            receiptUrl: row.receiptUrl,
            createdAt: toIsoRequired(row.createdAt),
          })),
          page: query.page,
          limit: query.limit,
          total,
          totalPages: Math.max(1, Math.ceil(total / query.limit)),
        };
      });

      app.get("/v1/community/expenses/export", async (request, reply) => {
        const userId = parseUserIdFromHeaders(request.headers as Record<string, unknown>);
        const roles = getRolesFromHeaders(request.headers as Record<string, unknown>);
        if (!userId) {
          return reply.code(401).send({ error: { code: "UNAUTHORIZED", message: "Login required" } });
        }
        const query = exportCommunityExpensesQuerySchema.parse(request.query);
        const access = await requireApprovedMembership(userId, query.apartmentId, roles);
        if (access.error || !access.apartment) {
          return reply.code(403).send({ error: { code: "FORBIDDEN", message: access.error } });
        }
        const rows = await applyExpenseListFilters(
          expenseRepo
            .createQueryBuilder("e")
            .where("e.apartment_id = :apartmentId", { apartmentId: access.apartment.id })
            .orderBy("e.created_at", "DESC")
            .take(10000),
          query,
        ).getMany();
        const totalPaise = rows.reduce((sum, row) => sum + row.amountInPaise, 0);
        const period = expensePeriodLabel(query);
        const stamp = new Date().toISOString().slice(0, 10);
        const generated = new Date().toLocaleString("en-IN");

        if (query.format === "excel") {
          const header = ["Recorded", "Vendor", "Category", "Amount (INR)", "Notes"]
            .map((cell) => `<Cell ss:StyleID="header"><Data ss:Type="String">${cell}</Data></Cell>`)
            .join("");
          const body = rows
            .map((row) => {
              const recorded = new Date(row.createdAt).toLocaleString("en-IN");
              return `<Row>
<Cell><Data ss:Type="String">${escapeXml(recorded)}</Data></Cell>
<Cell><Data ss:Type="String">${escapeXml(row.vendor)}</Data></Cell>
<Cell><Data ss:Type="String">${escapeXml(row.category.replaceAll("_", " "))}</Data></Cell>
<Cell ss:StyleID="currency"><Data ss:Type="Number">${(row.amountInPaise / 100).toFixed(2)}</Data></Cell>
<Cell><Data ss:Type="String">${escapeXml(row.notes ?? "")}</Data></Cell>
</Row>`;
            })
            .join("");
          const xml = `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
<Styles>
<Style ss:ID="header"><Font ss:Bold="1"/></Style>
<Style ss:ID="currency"><NumberFormat ss:Format="#,##0.00"/></Style>
</Styles>
<Worksheet ss:Name="Expenses">
<Table>
<Row><Cell ss:MergeAcross="4"><Data ss:Type="String">${escapeXml(access.apartment.name)} — society expenses</Data></Cell></Row>
<Row><Cell ss:MergeAcross="4"><Data ss:Type="String">${escapeXml(period)}</Data></Cell></Row>
<Row><Cell ss:MergeAcross="4"><Data ss:Type="String">${escapeXml(`Generated ${generated}`)}</Data></Cell></Row>
<Row></Row>
<Row>${header}</Row>
${body}
<Row>
<Cell ss:MergeAcross="2"><Data ss:Type="String">Total</Data></Cell>
<Cell ss:StyleID="currency"><Data ss:Type="Number">${(totalPaise / 100).toFixed(2)}</Data></Cell>
<Cell><Data ss:Type="String"></Data></Cell>
</Row>
</Table>
</Worksheet>
</Workbook>`;
          return reply
            .header("Content-Type", "application/vnd.ms-excel; charset=utf-8")
            .header("Content-Disposition", `attachment; filename="society-expenses-${stamp}.xls"`)
            .send(xml);
        }

        const tableRows = rows
          .map((row) => {
            const recorded = new Date(row.createdAt).toLocaleString("en-IN");
            return `<tr>
<td>${escapeHtml(recorded)}</td>
<td>${escapeHtml(row.vendor)}${row.notes ? `<div class="muted">${escapeHtml(row.notes)}</div>` : ""}</td>
<td>${escapeHtml(row.category.replaceAll("_", " "))}</td>
<td>${escapeHtml(formatInr(row.amountInPaise))}</td>
</tr>`;
          })
          .join("");
        const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"/><title>${escapeHtml(`${access.apartment.name} expenses`)}</title>
<style>
body{font-family:Georgia,serif;color:#0f172a;margin:0;background:#f8fafc}
.sheet{max-width:960px;margin:24px auto;background:#fff;padding:32px;border:1px solid #e2e8f0}
.muted{color:#64748b}
table{width:100%;border-collapse:collapse;margin-top:16px}
th,td{text-align:left;padding:8px 10px;border-bottom:1px solid #e2e8f0;vertical-align:top}
th{font-size:0.8rem;text-transform:uppercase;letter-spacing:0.04em;color:#64748b}
tfoot td{font-weight:700}
@media print{body{background:#fff}.no-print{display:none}.sheet{border:0;margin:0;padding:0}}
</style></head>
<body><div class="sheet">
<p class="muted no-print"><button onclick="window.print()">Print / Save as PDF</button></p>
<h1>Paashupatastra</h1>
<p class="muted">Society expense report</p>
<p><strong>${escapeHtml(access.apartment.name)}</strong><br/>${escapeHtml(period)}<br/>${rows.length} expense${rows.length === 1 ? "" : "s"}</p>
<table>
<thead><tr><th>Recorded</th><th>Vendor</th><th>Category</th><th>Amount</th></tr></thead>
<tbody>${tableRows || `<tr><td colspan="4" class="muted">No expenses in this range.</td></tr>`}</tbody>
<tfoot><tr><td colspan="3">Total</td><td>${escapeHtml(formatInr(totalPaise))}</td></tr></tfoot>
</table>
<p class="muted">Generated ${escapeHtml(generated)}. This is a computer-generated society expense report.</p>
</div></body></html>`;
        return reply
          .header("Content-Type", "text/html; charset=utf-8")
          .header("Content-Disposition", `inline; filename="society-expenses-${stamp}.html"`)
          .send(html);
      });

      app.get("/v1/community/expenses/:id/download", async (request, reply) => {
        const userId = parseUserIdFromHeaders(request.headers as Record<string, unknown>);
        const roles = getRolesFromHeaders(request.headers as Record<string, unknown>);
        if (!userId) {
          return reply.code(401).send({ error: { code: "UNAUTHORIZED", message: "Login required" } });
        }
        const id = parseEntityId((request.params as { id: string }).id);
        const expense = await expenseRepo.findOne({ where: { id } });
        if (!expense) {
          return reply.code(404).send({ error: { code: "NOT_FOUND", message: "Expense not found" } });
        }
        const access = await requireApprovedMembership(userId, expense.apartmentId, roles);
        if (access.error || !access.apartment) {
          return reply.code(403).send({ error: { code: "FORBIDDEN", message: access.error } });
        }
        const recorded = new Date(expense.createdAt).toLocaleString("en-IN");
        const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"/><title>${escapeHtml(`EXP-CM-${expense.id}`)}</title>
<style>body{font-family:Georgia,serif;color:#0f172a;margin:0;background:#f8fafc}.sheet{max-width:800px;margin:24px auto;background:#fff;padding:32px;border:1px solid #e2e8f0}.muted{color:#64748b}@media print{body{background:#fff}.no-print{display:none}}</style></head>
<body><div class="sheet">
<p class="muted no-print"><button onclick="window.print()">Print / Save as PDF</button></p>
<h1>Paashupatastra</h1>
<p class="muted">Society expense record</p>
<p><strong>EXP-CM-${expense.id}</strong><br/>Recorded ${escapeHtml(recorded)}</p>
<p><strong>Society:</strong> ${escapeHtml(access.apartment.name)}<br/>
<strong>Vendor:</strong> ${escapeHtml(expense.vendor)}<br/>
<strong>Category:</strong> ${escapeHtml(expense.category.replaceAll("_", " "))}</p>
<p>Amount: ${escapeHtml(formatInr(expense.amountInPaise))}</p>
${expense.notes ? `<p>Notes: ${escapeHtml(expense.notes)}</p>` : ""}
<p class="muted">This is a computer-generated record of a society expense.</p>
</div></body></html>`;
        return reply
          .header("Content-Type", "text/html; charset=utf-8")
          .header("Content-Disposition", `attachment; filename="EXP-CM-${expense.id}.html"`)
          .send(html);
      });

      app.get("/v1/community/invoices", async (request, reply) => {
        const userId = parseUserIdFromHeaders(request.headers as Record<string, unknown>);
        const roles = getRolesFromHeaders(request.headers as Record<string, unknown>);
        if (!userId) {
          return reply.code(401).send({ error: { code: "UNAUTHORIZED", message: "Login required" } });
        }
        const query = paginationQuerySchema.parse(request.query);
        const raw = request.query as { apartmentId?: string; residentUserId?: string };
        const apartmentId = raw.apartmentId ? parseEntityId(raw.apartmentId) : undefined;
        const isStaff = isCommunityStaff(roles);
        if (!isStaff) {
          const paid = dueRepo
            .createQueryBuilder("d")
            .where("d.payment_status = :paid", { paid: PaymentStatus.PAID })
            .orderBy("d.created_at", "DESC")
            .take(50);
          if (apartmentId) paid.andWhere("d.apartment_id = :apartmentId", { apartmentId });
          paid.andWhere("d.resident_user_id = :userId", { userId });
          const paidDues = await paid.getMany();
          for (const due of paidDues) {
            try {
              await ensureInvoiceForDue(due);
            } catch {
              /* ignore */
            }
          }
        }
        const qb = invoiceRepo.createQueryBuilder("i").orderBy("i.created_at", "DESC");
        if (apartmentId) qb.andWhere("i.apartment_id = :apartmentId", { apartmentId });
        if (!isStaff) {
          const adminApt = apartmentId && (await isApartmentAdmin(userId, apartmentId, roles));
          if (!adminApt) qb.andWhere("i.resident_user_id = :userId", { userId });
        }
        const total = await qb.getCount();
        const rows = await qb.skip((query.page - 1) * query.limit).take(query.limit).getMany();
        return {
          items: rows.map(serializeInvoice),
          page: query.page,
          limit: query.limit,
          total,
          totalPages: Math.max(1, Math.ceil(total / query.limit)),
        };
      });

      app.get("/v1/community/invoices/:id/download", async (request, reply) => {
        const userId = parseUserIdFromHeaders(request.headers as Record<string, unknown>);
        const roles = getRolesFromHeaders(request.headers as Record<string, unknown>);
        const id = parseEntityId((request.params as { id: string }).id);
        const invoice = await invoiceRepo.findOne({ where: { id } });
        if (!invoice) {
          return reply.code(404).send({ error: { code: "NOT_FOUND", message: "Invoice not found" } });
        }
        const admin = userId ? await isApartmentAdmin(userId, invoice.apartmentId, roles) : false;
        if (
          !userId ||
          (!isCommunityStaff(roles) && invoice.residentUserId !== userId && !admin)
        ) {
          return reply.code(403).send({ error: { code: "FORBIDDEN", message: "Not your invoice" } });
        }
        const due = await dueRepo.findOne({ where: { id: invoice.dueId } });
        const apt = await apartmentRepo.findOne({ where: { id: invoice.apartmentId } });
        const resident = await userRepo.findOne({ where: { id: invoice.residentUserId } });
        const issued = new Date(invoice.createdAt).toLocaleString("en-IN");
        const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"/><title>${escapeHtml(`INV-CM-${invoice.id}`)}</title>
<style>body{font-family:Georgia,serif;color:#0f172a;margin:0;background:#f8fafc}.sheet{max-width:800px;margin:24px auto;background:#fff;padding:32px;border:1px solid #e2e8f0}.muted{color:#64748b}@media print{body{background:#fff}.no-print{display:none}}</style></head>
<body><div class="sheet">
<p class="muted no-print"><button onclick="window.print()">Print / Save as PDF</button></p>
<h1>Paashupatastra</h1>
<p class="muted">Community maintenance invoice</p>
<p><strong>INV-CM-${invoice.id}</strong><br/>Issued ${escapeHtml(issued)}<br/>Due #${invoice.dueId}</p>
<p><strong>Society:</strong> ${escapeHtml(apt?.name ?? "Apartment")}<br/>
<strong>Billed to:</strong> ${escapeHtml(resident?.name ?? "Resident")} · ${escapeHtml(resident?.phone ?? "—")}</p>
<p>Period: ${escapeHtml(due?.period ?? "—")}<br/>Amount paid: ${escapeHtml(formatInr(invoice.amountInPaise))}</p>
<p class="muted">This is a computer-generated invoice for society maintenance.</p>
</div></body></html>`;
        return reply
          .header("Content-Type", "text/html; charset=utf-8")
          .header("Content-Disposition", `attachment; filename="INV-CM-${invoice.id}.html"`)
          .send(html);
      });
    },
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
