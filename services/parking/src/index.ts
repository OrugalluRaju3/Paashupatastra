import "reflect-metadata";
import { randomUUID } from "node:crypto";
import {
  BankAccountEntity,
  CommissionConfigEntity,
  NotificationLogEntity,
  ParkingBookingEntity,
  ParkingListingEntity,
  ParkingSlotEntity,
  UserDocumentEntity,
  UserEntity,
  VerificationAssignmentEntity,
  VerificationReportEntity,
  getDataSource,
  toIso,
  toIsoRequired,
} from "@paashupatastra/database";
import {
  createService,
  envInt,
  getRolesFromHeaders,
  getUserIdFromHeaders,
  loadEnv,
} from "@paashupatastra/service-kit";
import {
  BookingStatus,
  DocumentType,
  ListingStatus,
  PaymentStatus,
  UserRole,
  assignVerificationSchema,
  createBookingV2Schema,
  createParkingBookingSchema,
  createParkingSlotSchema,
  fieldVerificationReportSchema,
  managerDecisionSchema,
  ownerApplicationSchema,
  paginationQuerySchema,
  parkingCheckInSchema,
  parkingSearchSchema,
  quoteBookingSchema,
  updateParkingSlotSchema,
} from "@paashupatastra/shared-models";
import { In } from "typeorm";
import { z } from "zod";
import { calcParkingQuote } from "./pricing";

function requireUserId(headers: Record<string, unknown>) {
  return getUserIdFromHeaders(headers) ?? randomUUID();
}

function normalizeName(value: string) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function canManageVerification(headers: Record<string, unknown>) {
  const roles = getRolesFromHeaders(headers);
  return (
    roles.includes(UserRole.SUPER_ADMIN) || roles.includes(UserRole.VERIFICATION_MANAGER)
  );
}

function serializeListing(row: ParkingListingEntity) {
  return {
    id: row.id,
    ownerUserId: row.ownerUserId,
    status: row.status,
    apartmentName: row.apartmentName,
    flatNumber: row.flatNumber,
    blockTower: row.blockTower,
    floorNumber: row.floorNumber,
    city: row.city,
    state: row.state,
    country: row.country,
    pinCode: row.pinCode,
    addressLine: row.addressLine,
    latitude: row.latitude,
    longitude: row.longitude,
    mapsUrl: row.mapsUrl,
    parkingSlotNumber: row.parkingSlotNumber,
    parkingType: row.parkingType,
    vehicleTypesAllowed: row.vehicleTypesAllowed,
    parkingDimensions: row.parkingDimensions,
    numberOfSlots: row.numberOfSlots,
    availabilityStartTime: row.availabilityStartTime,
    availabilityEndTime: row.availabilityEndTime,
    availableDays: row.availableDays,
    rentType: row.rentType,
    priceInPaise: row.priceInPaise,
    isActive: row.isActive,
    rejectionReason: row.rejectionReason,
    needsInfoNotes: row.needsInfoNotes,
    activatedAt: toIso(row.activatedAt),
    createdAt: toIsoRequired(row.createdAt),
    updatedAt: toIsoRequired(row.updatedAt),
  };
}

function serializeBooking(row: ParkingBookingEntity) {
  return {
    id: row.id,
    slotId: row.slotId,
    listingId: row.listingId,
    apartmentId: row.apartmentId,
    renterUserId: row.renterUserId,
    ownerUserId: row.ownerUserId,
    status: row.status,
    startAt: toIsoRequired(row.startAt),
    endAt: toIsoRequired(row.endAt),
    durationMinutes: row.durationMinutes,
    baseAmountInPaise: row.baseAmountInPaise,
    platformFeeInPaise: row.platformFeeInPaise,
    taxInPaise: row.taxInPaise,
    totalAmountInPaise: row.totalAmountInPaise || row.amountInPaise,
    amountInPaise: row.amountInPaise,
    paymentStatus: row.paymentStatus,
    paymentProvider: row.paymentProvider,
    paymentProviderOrderId: row.paymentProviderOrderId,
    vehicleNumber: row.vehicleNumber,
    vehicleType: row.vehicleType,
    checkInCode: row.checkInCode,
    ownerOtp: row.ownerOtp,
    checkedInAt: toIso(row.checkedInAt),
    checkedOutAt: toIso(row.checkedOutAt),
    createdAt: toIsoRequired(row.createdAt),
    updatedAt: toIsoRequired(row.updatedAt),
  };
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function ensureCommission(ds: Awaited<ReturnType<typeof getDataSource>>) {
  const repo = ds.getRepository(CommissionConfigEntity);
  let cfg = await repo.findOne({ where: { moduleName: "parking", isActive: true } });
  if (!cfg) {
    cfg = await repo.save(
      repo.create({
        moduleName: "parking",
        commissionBps: 1000,
        platformFeeFlatPaise: 500,
        taxBps: 0,
        isActive: true,
      }),
    );
  }
  return cfg;
}

function notificationsBaseUrl() {
  return (process.env.NOTIFICATIONS_URL ?? "http://localhost:3006").replace(/\/$/, "");
}

function paymentsBaseUrl() {
  return (process.env.PAYMENTS_URL ?? "http://localhost:3005").replace(/\/$/, "");
}

function formatInr(paise: number) {
  return `₹${(paise / 100).toFixed(2)}`;
}

function navigationUrl(listing: {
  latitude?: number | null;
  longitude?: number | null;
  mapsUrl?: string | null;
  addressLine?: string | null;
  city?: string | null;
  pinCode?: string | null;
}) {
  if (listing.mapsUrl) return listing.mapsUrl;
  if (listing.latitude != null && listing.longitude != null) {
    return `https://www.google.com/maps/dir/?api=1&destination=${listing.latitude},${listing.longitude}&travelmode=driving`;
  }
  const q = [listing.addressLine, listing.city, listing.pinCode].filter(Boolean).join(", ");
  if (q) return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(q)}&travelmode=driving`;
  return null;
}

function listingSummary(listing: {
  apartmentName: string;
  parkingSlotNumber: string;
  addressLine?: string | null;
  city?: string | null;
  state?: string | null;
  pinCode?: string | null;
  parkingType?: string | null;
  latitude?: number | null;
  longitude?: number | null;
} | null) {
  if (!listing) {
    return {
      slotLabel: "your parking slot",
      addressBlock: "—",
      navUrl: null as string | null,
    };
  }
  const addressBlock = [
    listing.addressLine,
    listing.city,
    listing.state,
    listing.pinCode ? `PIN ${listing.pinCode}` : null,
  ]
    .filter(Boolean)
    .join(", ");
  return {
    slotLabel: `${listing.apartmentName}, Slot ${listing.parkingSlotNumber}${listing.parkingType ? ` (${listing.parkingType})` : ""}`,
    addressBlock: addressBlock || "—",
    navUrl: navigationUrl(listing),
  };
}

async function notify(
  ds: Awaited<ReturnType<typeof getDataSource>>,
  input: {
    userId?: string | null;
    title: string;
    body: string;
    referenceType?: string;
    referenceId?: string;
    channel?: string;
    toEmail?: string | null;
    toPhone?: string | null;
  },
) {
  const repo = ds.getRepository(NotificationLogEntity);

  // One in-app inbox row (shown in UI). Email is delivered separately without a second inbox item.
  if (input.userId) {
    await repo.save(
      repo.create({
        userId: input.userId,
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
      // inbox row already saved
    }
  } else if (input.userId) {
    // still surface in-app when email is missing on the profile
  }
}

async function collectPayment(bookingId: string, orderId?: string) {
  const res = await fetch(`${paymentsBaseUrl()}/v1/payments/bookings/${bookingId}/collect`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(orderId ? { orderId } : {}),
  });
  const data = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    error?: { message?: string };
    amountInPaise?: number;
    platformBalanceInPaise?: number;
  };
  if (!res.ok) {
    throw new Error(data?.error?.message ?? `Payment collection failed (${res.status})`);
  }
  return data;
}

async function settlePayment(bookingId: string) {
  const res = await fetch(`${paymentsBaseUrl()}/v1/payments/bookings/${bookingId}/settle`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
  });
  const data = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    error?: { message?: string };
    ownerShareInPaise?: number;
    platformFeeInPaise?: number;
    alreadySettled?: boolean;
    ownerBalanceInPaise?: number;
  };
  if (!res.ok) {
    throw new Error(data?.error?.message ?? `Settlement failed (${res.status})`);
  }
  return data;
}

async function main() {
  loadEnv();
  const ds = await getDataSource();
  await ensureCommission(ds);

  const listingRepo = ds.getRepository(ParkingListingEntity);
  const assignmentRepo = ds.getRepository(VerificationAssignmentEntity);
  const reportRepo = ds.getRepository(VerificationReportEntity);
  const bookingRepo = ds.getRepository(ParkingBookingEntity);
  const slotRepo = ds.getRepository(ParkingSlotEntity);
  const docRepo = ds.getRepository(UserDocumentEntity);
  const bankRepo = ds.getRepository(BankAccountEntity);
  const userRepo = ds.getRepository(UserEntity);

  await createService({
    name: "parking",
    port: envInt("PARKING_PORT", 3004),
    registerRoutes: async (app) => {
      // -------- Stats --------
      app.get("/v1/parking/stats", async () => {
        const [
          listingsTotal,
          pendingVerification,
          fieldInProgress,
          managerReview,
          approved,
          bookingsTotal,
          bookingsActive,
          slotsTotal,
          slotsPending,
          slotsApproved,
        ] = await Promise.all([
          listingRepo.count(),
          listingRepo.count({ where: { status: ListingStatus.PENDING_VERIFICATION } }),
          listingRepo.count({ where: { status: ListingStatus.FIELD_IN_PROGRESS } }),
          listingRepo.count({ where: { status: ListingStatus.MANAGER_REVIEW } }),
          listingRepo.count({ where: { status: ListingStatus.APPROVED } }),
          bookingRepo.count(),
          bookingRepo.count({
            where: {
              status: In([BookingStatus.PENDING, BookingStatus.CONFIRMED, BookingStatus.CHECKED_IN]),
            },
          }),
          slotRepo.count(),
          slotRepo.count({ where: { status: In([ListingStatus.PENDING_APPROVAL, ListingStatus.PENDING_VERIFICATION]) } }),
          slotRepo.count({ where: { status: ListingStatus.APPROVED } }),
        ]);

        return {
          listingsTotal,
          pendingVerification,
          fieldInProgress,
          managerReview,
          approved,
          bookingsTotal,
          bookingsActive,
          slotsTotal,
          slotsPending,
          slotsApproved,
        };
      });

      app.get("/v1/parking/analytics", async (request) => {
        const period = z
          .enum(["week", "month", "quarter", "year"])
          .default("month")
          .parse((request.query as { period?: string }).period ?? "month");

        const now = new Date();
        const start = new Date(now);
        start.setHours(0, 0, 0, 0);

        if (period === "week") {
          const day = start.getDay();
          const diff = day === 0 ? 6 : day - 1; // Monday start
          start.setDate(start.getDate() - diff);
        } else if (period === "month") {
          start.setDate(1);
        } else if (period === "quarter") {
          const q = Math.floor(start.getMonth() / 3) * 3;
          start.setMonth(q, 1);
        } else {
          start.setMonth(0, 1);
        }

        const bucket =
          period === "year" ? "month" : period === "quarter" ? "week" : "day";

        const bookingsInPeriod = await bookingRepo
          .createQueryBuilder("b")
          .where("b.created_at >= :start", { start: start.toISOString() })
          .getCount();

        const completedInPeriod = await bookingRepo
          .createQueryBuilder("b")
          .where("b.checked_out_at IS NOT NULL")
          .andWhere("b.checked_out_at >= :start", { start: start.toISOString() })
          .getCount();

        const paidAgg = await bookingRepo
          .createQueryBuilder("b")
          .select("COALESCE(SUM(b.total_amount_in_paise), 0)", "revenue")
          .addSelect("COALESCE(SUM(b.platform_fee_in_paise), 0)", "fees")
          .addSelect("COUNT(*)", "paidCount")
          .where("b.payment_status = :paid", { paid: "paid" })
          .andWhere("b.created_at >= :start", { start: start.toISOString() })
          .getRawOne<{ revenue: string; fees: string; paidCount: string }>();

        const listingsInPeriod = await listingRepo
          .createQueryBuilder("l")
          .where("l.created_at >= :start", { start: start.toISOString() })
          .getCount();

        const approvedInPeriod = await listingRepo
          .createQueryBuilder("l")
          .where("l.status = :status", { status: ListingStatus.APPROVED })
          .andWhere("l.activated_at IS NOT NULL")
          .andWhere("l.activated_at >= :start", { start: start.toISOString() })
          .getCount();

        const trunc = bucket === "month" ? "month" : bucket === "week" ? "week" : "day";
        const seriesRaw = await bookingRepo.query(
          `
          SELECT
            date_trunc($1, b.created_at) AS bucket,
            COUNT(*)::int AS bookings,
            COUNT(*) FILTER (WHERE b.payment_status = 'paid')::int AS paid,
            COALESCE(SUM(CASE WHEN b.payment_status = 'paid' THEN b.total_amount_in_paise ELSE 0 END), 0)::bigint AS revenue,
            COALESCE(SUM(CASE WHEN b.payment_status = 'paid' THEN b.platform_fee_in_paise ELSE 0 END), 0)::bigint AS fees
          FROM parking_bookings b
          WHERE b.created_at >= $2
          GROUP BY 1
          ORDER BY 1 ASC
          `,
          [trunc, start.toISOString()],
        );

        const series = (seriesRaw as Array<Record<string, unknown>>).map((row) => ({
          bucket: new Date(String(row.bucket)).toISOString(),
          bookings: Number(row.bookings ?? 0),
          paid: Number(row.paid ?? 0),
          revenueInPaise: Number(row.revenue ?? 0),
          platformFeeInPaise: Number(row.fees ?? 0),
        }));

        const statusBreakdown = await bookingRepo
          .createQueryBuilder("b")
          .select("b.status", "status")
          .addSelect("COUNT(*)", "count")
          .where("b.created_at >= :start", { start: start.toISOString() })
          .groupBy("b.status")
          .getRawMany<{ status: string; count: string }>();

        return {
          period,
          range: {
            start: start.toISOString(),
            end: now.toISOString(),
          },
          summary: {
            bookingsCreated: bookingsInPeriod,
            bookingsCompleted: completedInPeriod,
            bookingsPaid: Number(paidAgg?.paidCount ?? 0),
            revenueInPaise: Number(paidAgg?.revenue ?? 0),
            platformFeeInPaise: Number(paidAgg?.fees ?? 0),
            listingsCreated: listingsInPeriod,
            listingsApproved: approvedInPeriod,
          },
          series,
          statusBreakdown: statusBreakdown.map((r) => ({
            status: r.status,
            count: Number(r.count),
          })),
        };
      });

      // -------- Owner application (full V1 workflow) --------
      app.post("/v1/parking/owner-applications", async (request, reply) => {
        const body = ownerApplicationSchema.parse(request.body);
        const ownerUserId = getUserIdFromHeaders(request.headers as Record<string, unknown>);
        if (!ownerUserId) {
          return reply.code(401).send({
            error: { code: "UNAUTHORIZED", message: "Login required before owner registration" },
          });
        }

        const user = await userRepo.findOne({ where: { id: ownerUserId } });
        if (!user) {
          return reply.code(401).send({
            error: { code: "UNAUTHORIZED", message: "User not found. Complete OTP login first." },
          });
        }

        if (normalizeName(body.fullName) !== normalizeName(body.accountHolderName)) {
          return reply.code(400).send({
            error: {
              code: "NAME_MISMATCH",
              message: "Full name and bank account holder name must match",
            },
          });
        }

        const duplicate = await listingRepo
          .createQueryBuilder("l")
          .where("l.owner_user_id = :ownerUserId", { ownerUserId: user.id })
          .andWhere("LOWER(l.apartment_name) = LOWER(:apartmentName)", {
            apartmentName: body.apartmentName.trim(),
          })
          .andWhere("LOWER(l.flat_number) = LOWER(:flatNumber)", {
            flatNumber: body.flatNumber.trim(),
          })
          .andWhere("LOWER(l.parking_slot_number) = LOWER(:parkingSlotNumber)", {
            parkingSlotNumber: body.parkingSlotNumber.trim(),
          })
          .andWhere("l.status NOT IN (:...ignored)", {
            ignored: [ListingStatus.REJECTED],
          })
          .getOne();

        if (duplicate) {
          return reply.code(409).send({
            error: {
              code: "DUPLICATE_PARKING",
              message:
                "This parking slot is already registered. Submit a different parking slot only.",
            },
          });
        }

        user.name = body.fullName;
        user.email = body.email;
        user.dateOfBirth = body.dateOfBirth ? body.dateOfBirth.slice(0, 10) : user.dateOfBirth;
        user.profilePhotoUrl = body.profilePhotoUrl ?? user.profilePhotoUrl;
        user.city = body.city;
        user.state = body.state;
        user.country = body.country ?? "IN";
        user.pinCode = body.pinCode;
        if (!user.roles.includes(UserRole.PARKING_OWNER)) {
          user.roles = [...user.roles, UserRole.PARKING_OWNER];
        }
        await userRepo.save(user);

        const listing = await listingRepo.save(
          listingRepo.create({
            ownerUserId: user.id,
            status: ListingStatus.PENDING_VERIFICATION,
            apartmentName: body.apartmentName,
            flatNumber: body.flatNumber,
            blockTower: body.blockTower,
            floorNumber: body.floorNumber ?? null,
            city: body.city,
            state: body.state,
            country: body.country ?? "IN",
            pinCode: body.pinCode,
            addressLine: body.addressLine,
            latitude: body.latitude,
            longitude: body.longitude,
            mapsUrl: body.mapsUrl ?? null,
            parkingSlotNumber: body.parkingSlotNumber,
            parkingType: body.parkingType,
            vehicleTypesAllowed: body.vehicleTypesAllowed,
            parkingDimensions: body.parkingDimensions ?? null,
            numberOfSlots: body.numberOfSlots ?? 1,
            availabilityStartTime: body.availabilityStartTime,
            availabilityEndTime: body.availabilityEndTime,
            availableDays: body.availableDays ?? "all_days",
            rentType: body.rentType,
            priceInPaise: body.priceInPaise,
            isActive: false,
          }),
        );

        const docs: Array<{ type: string; fileUrl: string }> = [
          { type: DocumentType.GOVERNMENT_ID, fileUrl: body.governmentIdUrl },
          { type: DocumentType.OWNERSHIP_PROOF, fileUrl: body.ownershipProofUrl },
          { type: DocumentType.PARKING_ALLOCATION_PROOF, fileUrl: body.parkingAllocationProofUrl },
          { type: DocumentType.ENTRANCE_PHOTO, fileUrl: body.entrancePhotoUrl },
          ...body.parkingPhotoUrls.map((fileUrl) => ({
            type: DocumentType.PARKING_PHOTO,
            fileUrl,
          })),
        ];
        if (body.selfieWithIdUrl) {
          docs.push({ type: DocumentType.SELFIE_WITH_ID, fileUrl: body.selfieWithIdUrl });
        }
        if (body.associationApprovalUrl) {
          docs.push({ type: DocumentType.ASSOCIATION_APPROVAL, fileUrl: body.associationApprovalUrl });
        }
        if (body.profilePhotoUrl) {
          docs.push({ type: DocumentType.PROFILE_PHOTO, fileUrl: body.profilePhotoUrl });
        }

        await docRepo.save(
          docs.map((d) =>
            docRepo.create({
              userId: user!.id,
              listingId: listing.id,
              type: d.type,
              fileUrl: d.fileUrl,
              status: "uploaded",
            }),
          ),
        );

        await bankRepo.save(
          bankRepo.create({
            userId: user.id,
            accountHolderName: body.accountHolderName,
            bankName: body.bankName,
            accountNumber: body.accountNumber,
            ifscCode: body.ifscCode,
            upiId: body.upiId ?? null,
            isPrimary: true,
            isVerified: false,
          }),
        );

        await notify(ds, {
          userId: user.id,
          title: "Application submitted",
          body: "Your parking registration is Pending Verification. A field executive will be assigned within 24 hours.",
          referenceType: "parking_listing",
          referenceId: listing.id,
        });

        return reply.code(201).send({
          listing: serializeListing(listing),
          message: "Registration submitted. Status: Pending Verification",
        });
      });

      app.get("/v1/parking/listings", async (request) => {
        const query = paginationQuerySchema.parse(request.query);
        const raw = request.query as { status?: string; ownerUserId?: string };
        const qb = listingRepo.createQueryBuilder("l").orderBy("l.created_at", "DESC");
        if (raw.status) qb.andWhere("l.status = :status", { status: raw.status });
        if (raw.ownerUserId) qb.andWhere("l.owner_user_id = :ownerUserId", { ownerUserId: raw.ownerUserId });
        if (query.q) {
          qb.andWhere(
            `(l.apartment_name ILIKE :q OR l.city ILIKE :q OR l.pin_code ILIKE :q OR l.parking_slot_number ILIKE :q OR l.address_line ILIKE :q OR CAST(l.owner_user_id AS text) ILIKE :q)`,
            { q: `%${query.q}%` },
          );
        }
        const total = await qb.getCount();
        const rows = await qb.skip((query.page - 1) * query.limit).take(query.limit).getMany();
        const ownerIds = [...new Set(rows.map((r) => r.ownerUserId))];
        const owners =
          ownerIds.length > 0
            ? await userRepo.find({ where: { id: In(ownerIds) } })
            : [];
        const ownerById = new Map(owners.map((u) => [u.id, u]));
        return {
          items: rows.map((row) => {
            const owner = ownerById.get(row.ownerUserId);
            return {
              ...serializeListing(row),
              ownerName: owner?.name ?? null,
              ownerPhone: owner?.phone ?? null,
              ownerEmail: owner?.email ?? null,
            };
          }),
          page: query.page,
          limit: query.limit,
          total,
          totalPages: Math.max(1, Math.ceil(total / query.limit)),
        };
      });

      app.get("/v1/parking/listings/:id", async (request, reply) => {
        const { id } = request.params as { id: string };
        const row = await listingRepo.findOne({ where: { id } });
        if (!row) {
          return reply.code(404).send({ error: { code: "NOT_FOUND", message: "Listing not found" } });
        }
        const owner = await userRepo.findOne({ where: { id: row.ownerUserId } });
        const docs = await docRepo.find({ where: { listingId: id } });
        const assignments = await assignmentRepo.find({
          where: { listingId: id },
          order: { createdAt: "DESC" },
        });
        const reports = await reportRepo.find({
          where: { listingId: id },
          order: { createdAt: "DESC" },
        });
        return {
          listing: {
            ...serializeListing(row),
            ownerName: owner?.name ?? null,
            ownerPhone: owner?.phone ?? null,
            ownerEmail: owner?.email ?? null,
          },
          documents: docs,
          assignments,
          reports,
        };
      });

      // -------- Verification assignment --------
      app.post("/v1/parking/verification/assign", async (request, reply) => {
        if (!canManageVerification(request.headers as Record<string, unknown>)) {
          return reply.code(403).send({
            error: {
              code: "FORBIDDEN",
              message: "Only verification managers can assign field executives",
            },
          });
        }

        const body = assignVerificationSchema.parse(request.body);
        const assignedBy = requireUserId(request.headers as Record<string, unknown>);
        const listing = await listingRepo.findOne({ where: { id: body.listingId } });
        if (!listing) {
          return reply.code(404).send({ error: { code: "NOT_FOUND", message: "Listing not found" } });
        }

        const dueAt = body.dueAt
          ? new Date(body.dueAt)
          : new Date(Date.now() + 24 * 60 * 60 * 1000);

        const assignment = await assignmentRepo.save(
          assignmentRepo.create({
            listingId: listing.id,
            executiveUserId: body.executiveUserId,
            assignedByUserId: assignedBy,
            status: "assigned",
            dueAt,
          }),
        );

        listing.status = ListingStatus.FIELD_IN_PROGRESS;
        await listingRepo.save(listing);

        await notify(ds, {
          userId: body.executiveUserId,
          title: "New field verification assigned",
          body: `Verify parking at ${listing.apartmentName}, ${listing.city}. Due within 24 hours.`,
          referenceType: "verification_assignment",
          referenceId: assignment.id,
        });

        return reply.code(201).send(assignment);
      });

      app.get("/v1/parking/verification/assignments", async (request) => {
        const query = paginationQuerySchema.parse(request.query);
        const raw = request.query as { executiveUserId?: string; status?: string };
        const qb = assignmentRepo.createQueryBuilder("a").orderBy("a.created_at", "DESC");
        if (raw.executiveUserId) {
          qb.andWhere("a.executive_user_id = :executiveUserId", {
            executiveUserId: raw.executiveUserId,
          });
        }
        if (raw.status) qb.andWhere("a.status = :status", { status: raw.status });
        if (query.q) {
          qb.andWhere(
            `(CAST(a.id AS text) ILIKE :q OR CAST(a.listing_id AS text) ILIKE :q OR CAST(a.executive_user_id AS text) ILIKE :q OR a.status ILIKE :q)`,
            { q: `%${query.q}%` },
          );
        }
        const total = await qb.getCount();
        const rows = await qb.skip((query.page - 1) * query.limit).take(query.limit).getMany();
        const listingIds = [...new Set(rows.map((r) => r.listingId))];
        const execIds = [...new Set(rows.map((r) => r.executiveUserId))];
        const [listings, execs] = await Promise.all([
          listingIds.length
            ? listingRepo.find({ where: { id: In(listingIds) } })
            : Promise.resolve([]),
          execIds.length ? userRepo.find({ where: { id: In(execIds) } }) : Promise.resolve([]),
        ]);
        const listingById = new Map(listings.map((l) => [l.id, l]));
        const execById = new Map(execs.map((u) => [u.id, u]));
        return {
          items: rows.map((a) => {
            const listing = listingById.get(a.listingId);
            const exec = execById.get(a.executiveUserId);
            return {
              ...a,
              apartmentName: listing?.apartmentName ?? null,
              city: listing?.city ?? null,
              parkingSlotNumber: listing?.parkingSlotNumber ?? null,
              listingStatus: listing?.status ?? null,
              executiveName: exec?.name ?? null,
              executivePhone: exec?.phone ?? null,
            };
          }),
          page: query.page,
          limit: query.limit,
          total,
          totalPages: Math.max(1, Math.ceil(total / query.limit)),
        };
      });

      app.post("/v1/parking/verification/field-report", async (request, reply) => {
        const body = fieldVerificationReportSchema.parse(request.body);
        const executiveUserId = requireUserId(request.headers as Record<string, unknown>);
        const assignment = await assignmentRepo.findOne({ where: { id: body.assignmentId } });
        if (!assignment) {
          return reply.code(404).send({ error: { code: "NOT_FOUND", message: "Assignment not found" } });
        }

        const listing = await listingRepo.findOne({ where: { id: assignment.listingId } });
        if (!listing) {
          return reply.code(404).send({ error: { code: "NOT_FOUND", message: "Listing not found" } });
        }

        const report = await reportRepo.save(
          reportRepo.create({
            assignmentId: assignment.id,
            listingId: listing.id,
            executiveUserId,
            decision: body.decision,
            comments: body.comments,
            photoUrls: body.photoUrls,
            verifiedLatitude: body.verifiedLatitude ?? null,
            verifiedLongitude: body.verifiedLongitude ?? null,
            addressVerified: body.addressVerified,
            ownershipVerified: body.ownershipVerified,
            slotVerified: body.slotVerified,
            documentsVerified: body.documentsVerified,
            gpsVerified: body.gpsVerified,
          }),
        );

        assignment.status = "completed";
        assignment.completedAt = new Date();
        await assignmentRepo.save(assignment);

        if (body.decision === "reject") {
          listing.status = ListingStatus.REJECTED;
          listing.rejectionReason = body.comments;
          listing.isActive = false;
        } else if (body.decision === "need_info") {
          listing.status = ListingStatus.NEEDS_INFO;
          listing.needsInfoNotes = body.comments;
        } else {
          listing.status = ListingStatus.MANAGER_REVIEW;
        }
        await listingRepo.save(listing);

        await notify(ds, {
          userId: listing.ownerUserId,
          title: "Field verification update",
          body: `Your listing moved to ${listing.status}.`,
          referenceType: "parking_listing",
          referenceId: listing.id,
        });

        return reply.code(201).send({ report, listing: serializeListing(listing) });
      });

      app.post("/v1/parking/verification/manager-decision", async (request, reply) => {
        if (!canManageVerification(request.headers as Record<string, unknown>)) {
          return reply.code(403).send({
            error: {
              code: "FORBIDDEN",
              message: "Only verification managers can approve or reject listings",
            },
          });
        }

        const body = managerDecisionSchema.parse(request.body);
        const listing = await listingRepo.findOne({ where: { id: body.listingId } });
        if (!listing) {
          return reply.code(404).send({ error: { code: "NOT_FOUND", message: "Listing not found" } });
        }

        if (listing.status !== ListingStatus.MANAGER_REVIEW) {
          return reply.code(400).send({
            error: {
              code: "INVALID_STATUS",
              message: "Listing is not awaiting manager review",
            },
          });
        }

        if (body.decision === "approve") {
          listing.status = ListingStatus.APPROVED;
          listing.isActive = true;
          listing.activatedAt = new Date();
          listing.rejectionReason = null;
          listing.needsInfoNotes = null;
        } else if (body.decision === "reject") {
          listing.status = ListingStatus.REJECTED;
          listing.isActive = false;
          listing.rejectionReason = body.comments;
        } else {
          listing.status = ListingStatus.FIELD_IN_PROGRESS;
          listing.needsInfoNotes = body.comments;
        }
        await listingRepo.save(listing);

        await notify(ds, {
          userId: listing.ownerUserId,
          title:
            body.decision === "approve"
              ? "Parking Slot Successfully Activated"
              : "Verification decision update",
          body:
            body.decision === "approve"
              ? "Congratulations! Your parking slot has been successfully verified and activated. Your parking space is now available for customers to book through the application."
              : body.comments,
          referenceType: "parking_listing",
          referenceId: listing.id,
          channel: "email",
        });

        return { listing: serializeListing(listing) };
      });

      // -------- Customer search --------
      app.get("/v1/parking/search", async (request) => {
        const query = parkingSearchSchema.parse(request.query);
        const qb = listingRepo
          .createQueryBuilder("l")
          .where("l.status = :status", { status: ListingStatus.APPROVED })
          .andWhere("l.is_active = true");

        if (query.city) qb.andWhere("l.city ILIKE :city", { city: `%${query.city}%` });
        if (query.pinCode) qb.andWhere("l.pin_code = :pinCode", { pinCode: query.pinCode });
        if (query.parkingType) {
          qb.andWhere("l.parking_type = :parkingType", { parkingType: query.parkingType });
        }
        if (query.vehicleType) {
          qb.andWhere(`:vehicleType = ANY(l.vehicle_types_allowed)`, {
            vehicleType: query.vehicleType,
          });
        }
        if (query.minPriceInPaise != null) {
          qb.andWhere("l.price_in_paise >= :minPrice", { minPrice: query.minPriceInPaise });
        }
        if (query.maxPriceInPaise != null) {
          qb.andWhere("l.price_in_paise <= :maxPrice", { maxPrice: query.maxPriceInPaise });
        }
        if (query.q) {
          qb.andWhere(
            `(l.apartment_name ILIKE :q OR l.address_line ILIKE :q OR l.city ILIKE :q)`,
            { q: `%${query.q}%` },
          );
        }

        let rows = await qb.orderBy("l.created_at", "DESC").getMany();

        if (query.latitude != null && query.longitude != null) {
          rows = rows
            .map((r) => ({
              row: r,
              distanceKm: haversineKm(query.latitude!, query.longitude!, r.latitude, r.longitude),
            }))
            .filter((x) => x.distanceKm <= query.radiusKm)
            .sort((a, b) => a.distanceKm - b.distanceKm)
            .map((x) => x.row);
        }

        // Hide slots with overlapping confirmed bookings in requested window
        if (query.startAt && query.endAt) {
          const busy = await bookingRepo
            .createQueryBuilder("b")
            .where("b.listing_id IS NOT NULL")
            .andWhere("b.status NOT IN (:...ignored)", {
              ignored: [BookingStatus.CANCELLED, BookingStatus.EXPIRED, BookingStatus.COMPLETED],
            })
            .andWhere("b.start_at < :endAt AND b.end_at > :startAt", {
              startAt: query.startAt,
              endAt: query.endAt,
            })
            .getMany();
          const busyIds = new Set(busy.map((b) => b.listingId).filter(Boolean) as string[]);
          rows = rows.filter((r) => !busyIds.has(r.id));
        }

        const total = rows.length;
        const start = (query.page - 1) * query.limit;
        const pageRows = rows.slice(start, start + query.limit);

        return {
          items: pageRows.map(serializeListing),
          page: query.page,
          limit: query.limit,
          total,
          totalPages: Math.max(1, Math.ceil(total / query.limit)),
        };
      });

      // -------- Quote + book --------
      app.post("/v1/parking/bookings/quote", async (request, reply) => {
        const body = quoteBookingSchema.parse(request.body);
        const listing = await listingRepo.findOne({ where: { id: body.listingId, isActive: true } });
        if (!listing || listing.status !== ListingStatus.APPROVED) {
          return reply.code(400).send({
            error: { code: "UNAVAILABLE", message: "Listing not available" },
          });
        }
        const commission = await ensureCommission(ds);
        const quote = calcParkingQuote({
          rentType: listing.rentType,
          priceInPaise: listing.priceInPaise,
          startAt: new Date(body.startAt),
          endAt: new Date(body.endAt),
          commission,
        });
        return { listingId: listing.id, currency: "INR", ...quote };
      });

      app.post("/v1/parking/bookings/v2", async (request, reply) => {
        const body = createBookingV2Schema.parse(request.body);
        const renterUserId = requireUserId(request.headers as Record<string, unknown>);
        const listing = await listingRepo.findOne({ where: { id: body.listingId, isActive: true } });
        if (!listing || listing.status !== ListingStatus.APPROVED) {
          return reply.code(400).send({
            error: { code: "UNAVAILABLE", message: "Listing not available" },
          });
        }

        if (
          body.vehicleType &&
          Array.isArray(listing.vehicleTypesAllowed) &&
          listing.vehicleTypesAllowed.length > 0 &&
          !listing.vehicleTypesAllowed.includes(body.vehicleType)
        ) {
          return reply.code(400).send({
            error: {
              code: "VEHICLE_TYPE_NOT_ALLOWED",
              message: `This slot does not allow ${body.vehicleType}`,
            },
          });
        }

        const conflict = await bookingRepo
          .createQueryBuilder("b")
          .where("b.listing_id = :listingId", { listingId: listing.id })
          .andWhere("b.status NOT IN (:...ignored)", {
            ignored: [BookingStatus.CANCELLED, BookingStatus.EXPIRED, BookingStatus.COMPLETED],
          })
          .andWhere("b.start_at < :endAt AND b.end_at > :startAt", {
            startAt: body.startAt,
            endAt: body.endAt,
          })
          .getExists();

        if (conflict) {
          return reply.code(409).send({
            error: { code: "DOUBLE_BOOKING", message: "Slot already booked for this time range" },
          });
        }

        const commission = await ensureCommission(ds);
        const quote = calcParkingQuote({
          rentType: listing.rentType,
          priceInPaise: listing.priceInPaise,
          startAt: new Date(body.startAt),
          endAt: new Date(body.endAt),
          commission,
        });

        const booking = await bookingRepo.save(
          bookingRepo.create({
            listingId: listing.id,
            slotId: null,
            apartmentId: null,
            renterUserId,
            ownerUserId: listing.ownerUserId,
            status: BookingStatus.PENDING,
            startAt: new Date(body.startAt),
            endAt: new Date(body.endAt),
            durationMinutes: quote.durationMinutes,
            baseAmountInPaise: quote.baseAmountInPaise,
            platformFeeInPaise: quote.platformFeeInPaise,
            taxInPaise: quote.taxInPaise,
            totalAmountInPaise: quote.totalAmountInPaise,
            amountInPaise: quote.totalAmountInPaise,
            paymentStatus: PaymentStatus.PENDING,
            vehicleNumber: body.vehicleNumber ?? null,
            vehicleType: body.vehicleType ?? null,
            checkInCode: Math.random().toString().slice(2, 8),
            ownerOtp: Math.random().toString().slice(2, 6),
          }),
        );

        return reply.code(201).send({
          booking: serializeBooking(booking),
          paymentRequired: true,
          message: "Complete payment to confirm booking. Funds will credit platform wallet.",
        });
      });

      app.post("/v1/parking/bookings/:id/confirm-payment", async (request, reply) => {
        const { id } = request.params as { id: string };
        const actorId = getUserIdFromHeaders(request.headers as Record<string, unknown>);
        const body = z
          .object({
            orderId: z.string().min(3).optional(),
            source: z.string().optional(),
          })
          .parse(request.body ?? {});
        let booking = await bookingRepo.findOne({ where: { id } });
        if (!booking) {
          return reply.code(404).send({ error: { code: "NOT_FOUND", message: "Booking not found" } });
        }
        if (actorId && booking.renterUserId !== actorId) {
          return reply.code(403).send({ error: { code: "FORBIDDEN", message: "Not your booking" } });
        }

        // Already paid (e.g. Cashfree webhook) — skip duplicate notifications
        const wasPaid = booking.paymentStatus === "paid";
        if (!wasPaid) {
          try {
            await collectPayment(booking.id, body.orderId);
          } catch (err) {
            return reply.code(502).send({
              error: {
                code: "PAYMENT_FAILED",
                message: err instanceof Error ? err.message : "Payment failed",
              },
            });
          }
        }

        booking = (await bookingRepo.findOne({ where: { id } }))!;
        if (booking.paymentStatus !== "paid") {
          return reply.code(402).send({
            error: {
              code: "PAYMENT_PENDING",
              message: "Complete Cashfree checkout before confirming",
            },
          });
        }

        if (wasPaid) {
          const listingPaid = booking.listingId
            ? await listingRepo.findOne({ where: { id: booking.listingId } })
            : null;
          return {
            booking: serializeBooking(booking),
            listing: listingPaid ? serializeListing(listingPaid) : null,
            message: "Booking already paid and confirmed.",
            alreadyConfirmed: true,
          };
        }

        const listing = booking.listingId
          ? await listingRepo.findOne({ where: { id: booking.listingId } })
          : null;
        const customer = await userRepo.findOne({ where: { id: booking.renterUserId } });
        const owner = booking.ownerUserId
          ? await userRepo.findOne({ where: { id: booking.ownerUserId } })
          : null;

        const { slotLabel, addressBlock, navUrl } = listingSummary(listing);
        const startLabel = new Date(booking.startAt).toLocaleString("en-IN");
        const endLabel = new Date(booking.endAt).toLocaleString("en-IN");
        const amountLabel = formatInr(booking.totalAmountInPaise || booking.amountInPaise);
        const coords =
          listing?.latitude != null && listing?.longitude != null
            ? `${listing.latitude}, ${listing.longitude}`
            : null;

        if (customer) {
          const customerBody = [
            `Hello ${customer.name ?? "Customer"},`,
            "",
            "Your parking booking is confirmed. Payment received successfully.",
            "",
            "Booking details",
            `• Booking ID: ${booking.id}`,
            `• Parking: ${slotLabel}`,
            `• Address: ${addressBlock}`,
            coords ? `• Coordinates: ${coords}` : null,
            `• Check-in: ${startLabel}`,
            `• Check-out: ${endLabel}`,
            `• Amount paid: ${amountLabel}`,
            `• Vehicle: ${booking.vehicleNumber ?? "—"}`,
            navUrl ? `• Navigate: ${navUrl}` : null,
            "",
            "Next steps",
            "1. Open My bookings in the app for live map navigation to the slot.",
            "2. On arrival, ask the owner for the check-in OTP.",
            "3. Enter the OTP to start your parking session.",
            "4. You will get a reminder 5 minutes before check-out.",
            "",
            "— Paashupatastra",
          ]
            .filter((line) => line !== null)
            .join("\n");
          await notify(ds, {
            userId: customer.id,
            toEmail: customer.email,
            toPhone: customer.phone,
            title: "Booking confirmed — navigate to your parking slot",
            body: customerBody,
            referenceType: "parking_booking",
            referenceId: booking.id,
          });
        }

        if (owner && booking.ownerUserId) {
          const customerName = customer?.name ?? "Customer";
          const customerPhoneMasked = customer?.phone
            ? `${customer.phone.slice(0, 2)}******${customer.phone.slice(-2)}`
            : "—";
          const ownerShareHint = formatInr(
            Math.max(
              0,
              (booking.totalAmountInPaise || booking.amountInPaise) -
                (booking.platformFeeInPaise || 0) -
                (booking.taxInPaise || 0),
            ),
          );
          const ownerBody = [
            `Hello ${owner.name ?? "Owner"},`,
            "",
            "A customer has paid and confirmed a booking for your parking slot.",
            "",
            "Slot details",
            `• Parking: ${slotLabel}`,
            `• Address: ${addressBlock}`,
            `• Check-in window: ${startLabel} → ${endLabel}`,
            "",
            "Customer (minimal)",
            `• Name: ${customerName}`,
            `• Mobile (masked): ${customerPhoneMasked}`,
            `• Vehicle: ${booking.vehicleNumber ?? "—"}`,
            `• Booking ID: ${booking.id.slice(0, 8)}…`,
            "",
            "Check-in OTP",
            `• Share this OTP only when the customer arrives: ${booking.ownerOtp}`,
            "",
            "Payment",
            `• Gross paid: ${amountLabel} (held in platform wallet)`,
            `• Platform fee: ${formatInr(booking.platformFeeInPaise || 0)}`,
            `• Estimated credit after check-out: ${ownerShareHint}`,
            "",
            "After the customer checks out, settlement will credit your owner wallet.",
            "",
            "— Paashupatastra",
          ].join("\n");
          await notify(ds, {
            userId: owner.id,
            toEmail: owner.email,
            toPhone: owner.phone,
            title: `New paid booking — OTP ${booking.ownerOtp}`,
            body: ownerBody,
            referenceType: "parking_booking",
            referenceId: booking.id,
          });
        }

        return {
          booking: serializeBooking(booking),
          listing: listing ? serializeListing(listing) : null,
          navigationUrl: navUrl,
          message: "Payment successful. Funds credited to platform wallet. Emails/notifications sent.",
        };
      });

      app.post("/v1/parking/bookings/:id/check-in", async (request, reply) => {
        const { id } = request.params as { id: string };
        const actorId = getUserIdFromHeaders(request.headers as Record<string, unknown>);
        const body = (request.body ?? {}) as { code?: string; otp?: string };
        const code = (body.code ?? body.otp ?? "").trim();
        if (!code) {
          return reply.code(400).send({ error: { code: "MISSING_OTP", message: "OTP required" } });
        }
        const booking = await bookingRepo.findOne({ where: { id } });
        if (!booking) {
          return reply.code(404).send({ error: { code: "NOT_FOUND", message: "Booking not found" } });
        }
        if (actorId && booking.renterUserId !== actorId) {
          return reply.code(403).send({ error: { code: "FORBIDDEN", message: "Not your booking" } });
        }
        if (booking.status !== BookingStatus.CONFIRMED) {
          return reply.code(400).send({
            error: {
              code: "INVALID_STATUS",
              message: "Booking must be confirmed before check-in",
            },
          });
        }
        const valid = code === booking.ownerOtp || code === booking.checkInCode;
        if (!valid) {
          return reply.code(401).send({ error: { code: "INVALID_OTP", message: "Invalid OTP" } });
        }
        booking.status = BookingStatus.CHECKED_IN;
        booking.checkedInAt = new Date();
        await bookingRepo.save(booking);

        const customer = await userRepo.findOne({ where: { id: booking.renterUserId } });
        if (customer) {
          await notify(ds, {
            userId: customer.id,
            toEmail: customer.email,
            channel: "email",
            title: "Check-in successful",
            body: `Your parking session started at ${new Date(booking.checkedInAt).toLocaleString("en-IN")}. Planned check-out: ${new Date(booking.endAt).toLocaleString("en-IN")}.`,
            referenceType: "parking_booking",
            referenceId: booking.id,
          });
        }

        return serializeBooking(booking);
      });

      app.post("/v1/parking/bookings/:id/check-out", async (request, reply) => {
        const { id } = request.params as { id: string };
        const actorId = getUserIdFromHeaders(request.headers as Record<string, unknown>);
        let booking = await bookingRepo.findOne({ where: { id } });
        if (!booking) {
          return reply.code(404).send({ error: { code: "NOT_FOUND", message: "Booking not found" } });
        }
        if (
          actorId &&
          booking.renterUserId !== actorId &&
          booking.ownerUserId !== actorId
        ) {
          return reply.code(403).send({ error: { code: "FORBIDDEN", message: "Not allowed" } });
        }
        if (
          booking.status !== BookingStatus.CHECKED_IN &&
          booking.status !== BookingStatus.CONFIRMED
        ) {
          return reply.code(400).send({
            error: { code: "INVALID_STATUS", message: "Booking is not active for check-out" },
          });
        }

        booking.status = BookingStatus.COMPLETED;
        booking.checkedOutAt = new Date();
        await bookingRepo.save(booking);

        let settlement: Awaited<ReturnType<typeof settlePayment>> | null = null;
        let settlementError: string | null = null;
        try {
          settlement = await settlePayment(booking.id);
        } catch (err) {
          settlementError = err instanceof Error ? err.message : "Settlement failed";
          app.log.error({ err, bookingId: booking.id }, "Auto settlement failed");
        }

        const owner = booking.ownerUserId
          ? await userRepo.findOne({ where: { id: booking.ownerUserId } })
          : null;
        const customer = await userRepo.findOne({ where: { id: booking.renterUserId } });
        const ownerShare = settlement?.ownerShareInPaise ?? 0;
        const platformFee = settlement?.platformFeeInPaise ?? booking.platformFeeInPaise;

        if (owner) {
          await notify(ds, {
            userId: owner.id,
            toEmail: owner.email,
            toPhone: owner.phone,
            title: settlement
              ? "Customer checked out — payout credited"
              : "Customer checked out — payout pending",
            body: [
              `Hello ${owner.name ?? "Owner"},`,
              "",
              "The customer has checked out.",
              `• Booking: ${booking.id.slice(0, 8)}…`,
              `• Gross paid: ${formatInr(booking.totalAmountInPaise || booking.amountInPaise)}`,
              `• Platform fee: ${formatInr(platformFee)}`,
              settlement
                ? `• Credited to your wallet: ${formatInr(ownerShare)}`
                : `• Wallet credit pending: ${settlementError ?? "retry shortly"}`,
              "",
              "— Paashupatastra",
            ].join("\n"),
            referenceType: "parking_booking",
            referenceId: booking.id,
          });
        }

        if (customer) {
          await notify(ds, {
            userId: customer.id,
            toEmail: customer.email,
            title: "Parking check-out complete",
            body: `Thanks for using Paashupatastra. Your session ended at ${new Date(booking.checkedOutAt!).toLocaleString("en-IN")}.`,
            referenceType: "parking_booking",
            referenceId: booking.id,
          });
        }

        booking = (await bookingRepo.findOne({ where: { id } }))!;
        return {
          booking: serializeBooking(booking),
          settlement,
          settlementError,
        };
      });

      app.get("/v1/parking/bookings", async (request) => {
        const parsed = paginationQuerySchema.parse(request.query);
        const raw = request.query as {
          renterUserId?: string;
          ownerUserId?: string;
          status?: string;
        };
        const qb = bookingRepo.createQueryBuilder("b").orderBy("b.created_at", "DESC");
        if (raw.renterUserId) {
          qb.andWhere("b.renter_user_id = :renterUserId", { renterUserId: raw.renterUserId });
        }
        if (raw.ownerUserId) {
          qb.andWhere("b.owner_user_id = :ownerUserId", { ownerUserId: raw.ownerUserId });
        }
        if (raw.status) qb.andWhere("b.status = :status", { status: raw.status });
        if (parsed.q) {
          qb.andWhere(
            `(CAST(b.id AS text) ILIKE :q OR COALESCE(CAST(b.listing_id AS text),'') ILIKE :q OR b.status ILIKE :q)`,
            { q: `%${parsed.q}%` },
          );
        }
        const total = await qb.getCount();
        const rows = await qb.skip((parsed.page - 1) * parsed.limit).take(parsed.limit).getMany();

        const listingIds = [...new Set(rows.map((r) => r.listingId).filter(Boolean) as string[])];
        const renterIds = [...new Set(rows.map((r) => r.renterUserId))];
        const ownerIds = [...new Set(rows.map((r) => r.ownerUserId).filter(Boolean) as string[])];
        const listings =
          listingIds.length > 0 ? await listingRepo.find({ where: { id: In(listingIds) } }) : [];
        const renters =
          renterIds.length > 0 ? await userRepo.find({ where: { id: In(renterIds) } }) : [];
        const owners =
          ownerIds.length > 0 ? await userRepo.find({ where: { id: In(ownerIds) } }) : [];
        const listingById = new Map(listings.map((l) => [l.id, l]));
        const renterById = new Map(renters.map((u) => [u.id, u]));
        const ownerById = new Map(owners.map((u) => [u.id, u]));

        const hideOwnerOtp = Boolean(raw.renterUserId) && !raw.ownerUserId;
        const isCustomerView = hideOwnerOtp;

        return {
          items: rows.map((row) => {
            const listing = row.listingId ? listingById.get(row.listingId) : null;
            const renter = renterById.get(row.renterUserId);
            const owner = row.ownerUserId ? ownerById.get(row.ownerUserId) : null;
            const base = serializeBooking(row);
            return {
              ...base,
              ownerOtp: hideOwnerOtp ? null : base.ownerOtp,
              checkInCode: hideOwnerOtp ? null : base.checkInCode,
              listing: listing
                ? {
                    id: listing.id,
                    apartmentName: listing.apartmentName,
                    flatNumber: listing.flatNumber,
                    blockTower: listing.blockTower,
                    floorNumber: listing.floorNumber,
                    parkingSlotNumber: listing.parkingSlotNumber,
                    city: listing.city,
                    state: listing.state,
                    addressLine: listing.addressLine,
                    pinCode: listing.pinCode,
                    parkingType: listing.parkingType,
                    vehicleTypesAllowed: listing.vehicleTypesAllowed,
                    latitude: listing.latitude,
                    longitude: listing.longitude,
                    mapsUrl: listing.mapsUrl,
                    navigationUrl: navigationUrl(listing),
                  }
                : null,
              owner: owner
                ? {
                    name: owner.name,
                    // Full phone only for the customer who booked (to request check-in OTP)
                    phone: isCustomerView ? owner.phone : null,
                    phoneMasked: owner.phone
                      ? `${owner.phone.slice(0, 2)}******${owner.phone.slice(-2)}`
                      : null,
                  }
                : null,
              customer: renter
                ? {
                    name: renter.name,
                    phoneMasked: renter.phone
                      ? `${renter.phone.slice(0, 2)}******${renter.phone.slice(-2)}`
                      : null,
                  }
                : null,
            };
          }),
          page: parsed.page,
          limit: parsed.limit,
          total,
          totalPages: Math.max(1, Math.ceil(total / parsed.limit)),
        };
      });

      app.delete("/v1/parking/bookings/:id", async (request, reply) => {
        const { id } = request.params as { id: string };
        const booking = await bookingRepo.findOne({ where: { id } });
        if (!booking) {
          return reply.code(404).send({ error: { code: "NOT_FOUND", message: "Booking not found" } });
        }
        booking.status = BookingStatus.CANCELLED;
        await bookingRepo.save(booking);
        return serializeBooking(booking);
      });

      // -------- Legacy simple slots (kept for existing admin screens) --------
      app.get("/v1/parking/slots", async (request) => {
        const parsed = paginationQuerySchema.parse(request.query);
        const raw = request.query as { status?: string };
        const qb = slotRepo.createQueryBuilder("s").orderBy("s.created_at", "DESC");
        if (raw.status) qb.andWhere("s.status = :status", { status: raw.status });
        if (parsed.q) {
          qb.andWhere(`(s.title ILIKE :q OR s.spot_code ILIKE :q)`, { q: `%${parsed.q}%` });
        }
        const total = await qb.getCount();
        const rows = await qb.skip((parsed.page - 1) * parsed.limit).take(parsed.limit).getMany();
        return {
          items: rows,
          page: parsed.page,
          limit: parsed.limit,
          total,
          totalPages: Math.max(1, Math.ceil(total / parsed.limit)),
        };
      });

      app.post("/v1/parking/slots", async (request, reply) => {
        const body = createParkingSlotSchema.parse(request.body);
        const ownerUserId = requireUserId(request.headers as Record<string, unknown>);
        const row = slotRepo.create({
          ...body,
          ownerUserId,
          description: body.description ?? null,
          blockName: body.blockName ?? null,
          vehicleSize: body.vehicleSize ?? "four_wheeler",
          imageUrls: body.imageUrls ?? [],
          status: ListingStatus.PENDING_APPROVAL,
          latitude: body.latitude ?? null,
          longitude: body.longitude ?? null,
        });
        const saved = await slotRepo.save(row);
        return reply.code(201).send(saved);
      });

      app.patch("/v1/parking/slots/:id", async (request, reply) => {
        const { id } = request.params as { id: string };
        const existing = await slotRepo.findOne({ where: { id } });
        if (!existing) {
          return reply.code(404).send({ error: { code: "NOT_FOUND", message: "Slot not found" } });
        }
        const body = updateParkingSlotSchema.parse(request.body);
        Object.assign(existing, body);
        return slotRepo.save(existing);
      });

      app.delete("/v1/parking/slots/:id", async (request, reply) => {
        const { id } = request.params as { id: string };
        const result = await slotRepo.delete({ id });
        if (!result.affected) {
          return reply.code(404).send({ error: { code: "NOT_FOUND", message: "Slot not found" } });
        }
        return reply.code(204).send();
      });

      app.post("/v1/parking/slots/:id/approve", async (request, reply) => {
        const { id } = request.params as { id: string };
        const slot = await slotRepo.findOne({ where: { id } });
        if (!slot) {
          return reply.code(404).send({ error: { code: "NOT_FOUND", message: "Slot not found" } });
        }
        slot.status = ListingStatus.APPROVED;
        return slotRepo.save(slot);
      });

      app.post("/v1/parking/slots/:id/reject", async (request, reply) => {
        const { id } = request.params as { id: string };
        const slot = await slotRepo.findOne({ where: { id } });
        if (!slot) {
          return reply.code(404).send({ error: { code: "NOT_FOUND", message: "Slot not found" } });
        }
        slot.status = ListingStatus.REJECTED;
        return slotRepo.save(slot);
      });

      // legacy booking create
      app.post("/v1/parking/bookings", async (request, reply) => {
        const body = createParkingBookingSchema.parse(request.body);
        const slot = await slotRepo.findOne({ where: { id: body.slotId } });
        if (!slot || slot.status !== ListingStatus.APPROVED) {
          return reply.code(400).send({
            error: { code: "SLOT_UNAVAILABLE", message: "Slot not available" },
          });
        }
        const renterUserId = requireUserId(request.headers as Record<string, unknown>);
        const booking = await bookingRepo.save(
          bookingRepo.create({
            slotId: slot.id,
            listingId: null,
            apartmentId: slot.apartmentId,
            renterUserId,
            ownerUserId: slot.ownerUserId,
            status: BookingStatus.PENDING,
            startAt: new Date(body.startAt),
            endAt: new Date(body.endAt),
            amountInPaise: slot.priceInPaise,
            totalAmountInPaise: slot.priceInPaise,
            baseAmountInPaise: slot.priceInPaise,
            paymentStatus: PaymentStatus.PENDING,
            checkInCode: Math.random().toString().slice(2, 8),
            ownerOtp: Math.random().toString().slice(2, 6),
          }),
        );
        return reply.code(201).send(serializeBooking(booking));
      });

      app.post("/v1/parking/check-in", async (request, reply) => {
        const body = parkingCheckInSchema.parse(request.body);
        const booking = await bookingRepo.findOne({ where: { id: body.bookingId } });
        if (!booking) {
          return reply.code(404).send({ error: { code: "NOT_FOUND", message: "Booking not found" } });
        }
        if (booking.checkInCode !== body.code && booking.ownerOtp !== body.code) {
          return reply.code(401).send({ error: { code: "INVALID_CODE", message: "Invalid code" } });
        }
        booking.status = BookingStatus.CHECKED_IN;
        booking.checkedInAt = new Date();
        return serializeBooking(await bookingRepo.save(booking));
      });
    },
  });

  // Remind customers 5 minutes before planned check-out; expire unpaid holds
  setInterval(() => {
    void (async () => {
      const now = new Date();
      const inFive = new Date(now.getTime() + 5 * 60 * 1000);

      const dueReminders = await bookingRepo
        .createQueryBuilder("b")
        .where("b.status IN (:...statuses)", {
          statuses: [BookingStatus.CONFIRMED, BookingStatus.CHECKED_IN],
        })
        .andWhere("b.reminder_5_sent = false")
        .andWhere("b.end_at > :now", { now })
        .andWhere("b.end_at <= :inFive", { inFive })
        .getMany();

      for (const booking of dueReminders) {
        const customer = await userRepo.findOne({ where: { id: booking.renterUserId } });
        if (customer) {
          await notify(ds, {
            userId: customer.id,
            toEmail: customer.email,
            toPhone: customer.phone,
            title: "Check-out in 5 minutes",
            body: [
              `Hello ${customer.name ?? "Customer"},`,
              "",
              "Your parking session ends in about 5 minutes.",
              `• Booking: ${booking.id.slice(0, 8)}…`,
              `• Planned check-out: ${new Date(booking.endAt).toLocaleString("en-IN")}`,
              "",
              "Please wrap up and complete check-out in the app.",
              "",
              "— Paashupatastra",
            ].join("\n"),
            referenceType: "parking_booking",
            referenceId: booking.id,
          });
        }
        booking.reminder5Sent = true;
        await bookingRepo.save(booking);
      }

      const stalePending = await bookingRepo
        .createQueryBuilder("b")
        .where("b.status = :status", { status: BookingStatus.PENDING })
        .andWhere("b.created_at < :cutoff", {
          cutoff: new Date(now.getTime() - 15 * 60 * 1000),
        })
        .getMany();
      for (const booking of stalePending) {
        booking.status = BookingStatus.EXPIRED;
        await bookingRepo.save(booking);
      }
    })().catch((err) => {
      // eslint-disable-next-line no-console
      console.error("booking reminder job failed", err);
    });
  }, 60_000);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
