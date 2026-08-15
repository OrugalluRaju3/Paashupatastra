import "reflect-metadata";
import {
  BankAccountEntity,
  CommissionConfigEntity,
  NotificationLogEntity,
  ParkingBookingEntity,
  ParkingBookingMessageEntity,
  ParkingInvoiceEntity,
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
import { createService, envInt, getRolesFromHeaders, getUserIdFromHeaders, loadEnv, parseEntityId, parseUserIdFromHeaders } from "@paashupatastra/service-kit";
import {
  BookingStatus,
  DocumentType,
  ListingStatus,
  PaymentStatus,
  UserRole,
  assignVerificationSchema,
  bookingChatMessageSchema,
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
import { checkListingAvailability, listingFitsAvailability } from "./availability";

function requireUserId(headers: Record<string, unknown>) {
  const id = parseUserIdFromHeaders(headers);
  if (id == null) throw Object.assign(new Error("Unauthorized"), { statusCode: 401 });
  return id;
}

function normalizeName(value: string) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function canManageVerification(headers: Record<string, unknown>) {
  const roles = getRolesFromHeaders(headers);
  return (
    roles.includes(UserRole.SUPER_ADMIN) ||
    roles.includes(UserRole.PARKING_SUPER_ADMIN) ||
    roles.includes(UserRole.VERIFICATION_MANAGER)
  );
}

function isFieldExecutiveOnly(headers: Record<string, unknown>) {
  const roles = getRolesFromHeaders(headers);
  const currentUserId = parseUserIdFromHeaders(headers);
  return (
    Boolean(currentUserId) &&
    roles.includes(UserRole.FIELD_EXECUTIVE) &&
    !canManageVerification(headers)
  );
}

/** Field executives only see listings they were assigned to or personally rejected. */
function executiveListingScopeSql(alias = "l") {
  return `(
    EXISTS (
      SELECT 1 FROM verification_assignments va
      WHERE va.listing_id = ${alias}.id AND va.executive_user_id = :execId
    )
    OR ${alias}.rejected_by_user_id = :execId
  )`;
}

function rejectorRoleLabel(roles: string[]) {
  if (roles.includes(UserRole.PARKING_SUPER_ADMIN) || roles.includes(UserRole.SUPER_ADMIN)) {
    return "parking_super_admin";
  }
  if (roles.includes(UserRole.VERIFICATION_MANAGER)) {
    return "verification_manager";
  }
  if (roles.includes(UserRole.FIELD_EXECUTIVE)) {
    return "field_executive";
  }
  return roles[0] ?? "staff";
}

function applyListingRejection(
  listing: ParkingListingEntity,
  opts: { reason: string; rejectedByUserId: number; rejectedByRole: string },
) {
  listing.status = ListingStatus.REJECTED;
  listing.isActive = false;
  listing.rejectionReason = opts.reason;
  listing.needsInfoNotes = null;
  listing.rejectedByUserId = opts.rejectedByUserId;
  listing.rejectedByRole = opts.rejectedByRole;
  listing.rejectedAt = new Date();
}

function clearListingRejection(listing: ParkingListingEntity) {
  listing.rejectionReason = null;
  listing.rejectedByUserId = null;
  listing.rejectedByRole = null;
  listing.rejectedAt = null;
}

function formatRejectionNotice(input: {
  reason: string;
  rejectedAt: Date | null | undefined;
  rejectedByLabel?: string | null;
}) {
  const when = input.rejectedAt
    ? toIsoRequired(input.rejectedAt)
    : toIsoRequired(new Date());
  return [
    `Rejection reason: ${input.reason.trim()}`,
    `Rejected at: ${when}`,
    input.rejectedByLabel ? `Rejected by: ${input.rejectedByLabel}` : null,
  ]
    .filter(Boolean)
    .join("\n");
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
    rejectedByUserId: row.rejectedByUserId,
    rejectedByRole: row.rejectedByRole,
    rejectedAt: toIso(row.rejectedAt),
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

function serializeInvoice(row: ParkingInvoiceEntity) {
  return {
    id: row.id,
    invoiceNumber: `INV-PK-${row.id}`,
    bookingId: row.bookingId,
    renterUserId: row.renterUserId,
    ownerUserId: row.ownerUserId,
    amountInPaise: row.amountInPaise,
    status: row.status,
    createdAt: toIsoRequired(row.createdAt),
    updatedAt: toIsoRequired(row.updatedAt),
  };
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function canChatOnBooking(status: string) {
  return status === BookingStatus.CONFIRMED || status === BookingStatus.CHECKED_IN;
}

function serializeBookingMessage(
  row: ParkingBookingMessageEntity,
  senderName: string | null,
  currentUserId: number,
) {
  return {
    id: row.id,
    bookingId: row.bookingId,
    senderUserId: row.senderUserId,
    senderName,
    body: row.body,
    mine: row.senderUserId === currentUserId,
    createdAt: toIsoRequired(row.createdAt),
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
  flatNumber?: string | null;
  blockTower?: string | null;
  floorNumber?: string | null;
  addressLine?: string | null;
  city?: string | null;
  state?: string | null;
  pinCode?: string | null;
  parkingType?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  mapsUrl?: string | null;
} | null) {
  if (!listing) {
    return {
      slotLabel: "your parking slot",
      addressBlock: "—",
      locationExtra: null as string | null,
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
  const locationExtra = [
    listing.blockTower ? `Block ${listing.blockTower}` : null,
    listing.flatNumber ? `Flat ${listing.flatNumber}` : null,
    listing.floorNumber ? `Floor ${listing.floorNumber}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  return {
    slotLabel: `${listing.apartmentName}, Slot ${listing.parkingSlotNumber}${listing.parkingType ? ` (${listing.parkingType})` : ""}`,
    addressBlock: addressBlock || "—",
    locationExtra: locationExtra || null,
    navUrl: navigationUrl(listing),
  };
}

async function notify(
  ds: Awaited<ReturnType<typeof getDataSource>>,
  input: {
    userId?: number | null;
    title: string;
    body: string;
    referenceType?: string;
    referenceId?: number;
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
        module: "parking",
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

async function hasBookingNotify(
  ds: Awaited<ReturnType<typeof getDataSource>>,
  opts: { userId: number; referenceId: number; titlePrefix: string },
) {
  const repo = ds.getRepository(NotificationLogEntity);
  const row = await repo
    .createQueryBuilder("n")
    .where("n.user_id = :userId", { userId: opts.userId })
    .andWhere("n.reference_type = :refType", { refType: "parking_booking" })
    .andWhere("n.reference_id = :refId", { refId: opts.referenceId })
    .andWhere("n.title ILIKE :title", { title: `${opts.titlePrefix}%` })
    .getOne();
  return Boolean(row);
}

async function notifyBookingConfirmed(
  ds: Awaited<ReturnType<typeof getDataSource>>,
  deps: {
    booking: ParkingBookingEntity;
    listing: ParkingListingEntity | null;
    customer: UserEntity | null;
    owner: UserEntity | null;
  },
) {
  const { booking, listing, customer, owner } = deps;
  const { slotLabel, addressBlock, locationExtra, navUrl } = listingSummary(listing);
  const startLabel = new Date(booking.startAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
  const endLabel = new Date(booking.endAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
  const amountLabel = formatInr(booking.totalAmountInPaise || booking.amountInPaise);
  const durationLabel =
    booking.durationMinutes != null && booking.durationMinutes > 0
      ? `${booking.durationMinutes} minutes`
      : null;
  const vehicleLabel = [
    booking.vehicleType ? booking.vehicleType.replaceAll("_", " ") : null,
    booking.vehicleNumber,
  ]
    .filter(Boolean)
    .join(" · ") || "—";
  const coords =
    listing?.latitude != null && listing?.longitude != null
      ? `${listing.latitude}, ${listing.longitude}`
      : null;

  if (customer) {
    const already = await hasBookingNotify(ds, {
      userId: customer.id,
      referenceId: booking.id,
      titlePrefix: "Booking confirmed",
    });
    if (!already) {
      const customerBody = [
        `Hello ${customer.name ?? "Customer"},`,
        "",
        "Your parking booking is confirmed. Payment received successfully.",
        "",
        "Booking details",
        `• Booking ID: ${booking.id}`,
        `• Parking: ${slotLabel}`,
        locationExtra ? `• Location: ${locationExtra}` : null,
        `• Address: ${addressBlock}`,
        coords ? `• Coordinates: ${coords}` : null,
        `• Check-in: ${startLabel}`,
        `• Check-out: ${endLabel}`,
        durationLabel ? `• Duration: ${durationLabel}` : null,
        `• Amount paid: ${amountLabel}`,
        `• Vehicle: ${vehicleLabel}`,
        navUrl ? `• Navigate: ${navUrl}` : null,
        "",
        "Next steps",
        "1. Open My bookings for live map navigation to the slot.",
        "2. On arrival, ask the owner for the check-in OTP.",
        "3. Enter the OTP to start your parking session.",
        "4. You will get a reminder before check-out.",
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
  }

  if (owner && booking.ownerUserId) {
    const already = await hasBookingNotify(ds, {
      userId: owner.id,
      referenceId: booking.id,
      titlePrefix: "New paid booking",
    });
    if (!already) {
      const customerName = customer?.name ?? "Customer";
      const customerPhone = customer?.phone ?? "—";
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
        locationExtra ? `• Location: ${locationExtra}` : null,
        `• Address: ${addressBlock}`,
        `• Check-in: ${startLabel}`,
        `• Check-out: ${endLabel}`,
        durationLabel ? `• Duration: ${durationLabel}` : null,
        "",
        "Customer",
        `• Name: ${customerName}`,
        `• Mobile: ${customerPhone}`,
        `• Vehicle: ${vehicleLabel}`,
        `• Booking ID: ${booking.id}`,
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
      ]
        .filter((line) => line !== null)
        .join("\n");
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
  }
}

async function collectPayment(bookingId: number, orderId?: string) {
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

async function settlePayment(bookingId: number) {
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
  const invoiceRepo = ds.getRepository(ParkingInvoiceEntity);
  const messageRepo = ds.getRepository(ParkingBookingMessageEntity);
  const slotRepo = ds.getRepository(ParkingSlotEntity);
  const docRepo = ds.getRepository(UserDocumentEntity);
  const bankRepo = ds.getRepository(BankAccountEntity);
  const userRepo = ds.getRepository(UserEntity);

  function isParkingInvoiceStaff(roles: string[]) {
    return roles.includes(UserRole.PARKING_SUPER_ADMIN) || roles.includes(UserRole.SUPER_ADMIN);
  }

  async function ensureInvoiceForBooking(booking: ParkingBookingEntity) {
    if (booking.paymentStatus !== PaymentStatus.PAID) return null;

    let invoice = await invoiceRepo.findOne({ where: { bookingId: booking.id } });
    const amount = booking.totalAmountInPaise || booking.amountInPaise;
    if (invoice) {
      if (invoice.amountInPaise !== amount || invoice.status !== PaymentStatus.PAID) {
        invoice.amountInPaise = amount;
        invoice.status = PaymentStatus.PAID;
        invoice = await invoiceRepo.save(invoice);
      }
      return invoice;
    }

    return invoiceRepo.save(
      invoiceRepo.create({
        bookingId: booking.id,
        renterUserId: booking.renterUserId,
        ownerUserId: booking.ownerUserId,
        amountInPaise: amount,
        status: PaymentStatus.PAID,
      }),
    );
  }

  async function userCanAccessInvoice(
    userId: number | null,
    roles: string[],
    invoice: ParkingInvoiceEntity,
  ) {
    if (!userId) return false;
    if (isParkingInvoiceStaff(roles)) return true;
    if (invoice.renterUserId === userId) return true;
    return invoice.ownerUserId != null && invoice.ownerUserId === userId;
  }

  async function buildInvoiceDetail(invoice: ParkingInvoiceEntity) {
    const booking = await bookingRepo.findOne({ where: { id: invoice.bookingId } });
    const listing = booking?.listingId
      ? await listingRepo.findOne({ where: { id: booking.listingId } })
      : null;
    const customer = await userRepo.findOne({ where: { id: invoice.renterUserId } });
    const owner = invoice.ownerUserId
      ? await userRepo.findOne({ where: { id: invoice.ownerUserId } })
      : null;
    const { slotLabel, addressBlock, locationExtra } = listingSummary(listing);

    return {
      ...serializeInvoice(invoice),
      booking: booking
        ? {
            id: booking.id,
            status: booking.status,
            startAt: toIsoRequired(booking.startAt),
            endAt: toIsoRequired(booking.endAt),
            durationMinutes: booking.durationMinutes,
            baseAmountInPaise: booking.baseAmountInPaise,
            platformFeeInPaise: booking.platformFeeInPaise,
            taxInPaise: booking.taxInPaise,
            totalAmountInPaise: booking.totalAmountInPaise || booking.amountInPaise,
            paymentStatus: booking.paymentStatus,
            paymentProviderOrderId: booking.paymentProviderOrderId,
            vehicleNumber: booking.vehicleNumber,
            vehicleType: booking.vehicleType,
            slotLabel,
            addressBlock,
            locationExtra,
          }
        : null,
      customer: customer
        ? {
            id: customer.id,
            name: customer.name,
            phone: customer.phone,
            email: customer.email,
          }
        : null,
      owner: owner
        ? {
            id: owner.id,
            name: owner.name,
            phone: owner.phone,
            email: owner.email,
          }
        : null,
    };
  }

  function renderInvoiceHtml(detail: Awaited<ReturnType<typeof buildInvoiceDetail>>) {
    const booking = detail.booking;
    const issued = new Date(detail.createdAt).toLocaleString("en-IN");
    const vehicle =
      [booking?.vehicleType?.replaceAll("_", " "), booking?.vehicleNumber].filter(Boolean).join(" · ") ||
      "—";
    const rows = [
      ["Parking", booking?.slotLabel ?? "—"],
      ["Address", booking?.addressBlock ?? "—"],
      ["Location", booking?.locationExtra ?? "—"],
      ["Vehicle", vehicle],
      ["Start", booking ? new Date(booking.startAt).toLocaleString("en-IN") : "—"],
      ["End", booking ? new Date(booking.endAt).toLocaleString("en-IN") : "—"],
      ["Duration", booking ? `${booking.durationMinutes} min` : "—"],
      ["Base amount", formatInr(booking?.baseAmountInPaise ?? detail.amountInPaise)],
      ["Platform fee", formatInr(booking?.platformFeeInPaise ?? 0)],
      ["Tax", formatInr(booking?.taxInPaise ?? 0)],
      ["Total paid", formatInr(booking?.totalAmountInPaise ?? detail.amountInPaise)],
      ["Payment status", detail.status],
      ["Booking status", booking?.status?.replaceAll("_", " ") ?? "—"],
      ["Payment ref", booking?.paymentProviderOrderId ?? "—"],
    ];

    const tableRows = rows
      .map(
        ([label, value]) =>
          `<tr><th style="text-align:left;padding:8px;border-bottom:1px solid #e5e7eb;color:#64748b;width:38%">${escapeHtml(String(label))}</th><td style="padding:8px;border-bottom:1px solid #e5e7eb">${escapeHtml(String(value))}</td></tr>`,
      )
      .join("");

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(detail.invoiceNumber)}</title>
  <style>
    body { font-family: Georgia, "Times New Roman", serif; color: #0f172a; margin: 0; background: #f8fafc; }
    .sheet { max-width: 800px; margin: 24px auto; background: #fff; padding: 32px; border: 1px solid #e2e8f0; }
    h1 { margin: 0 0 4px; font-size: 28px; }
    .muted { color: #64748b; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin: 24px 0; }
    .box { background: #f8fafc; padding: 12px 14px; border-radius: 8px; }
    .total { font-size: 22px; font-weight: 700; margin-top: 16px; }
    @media print { body { background: #fff; } .sheet { border: none; margin: 0; } .no-print { display: none; } }
  </style>
</head>
<body>
  <div class="sheet">
    <p class="muted no-print"><button onclick="window.print()">Print / Save as PDF</button></p>
    <h1>Paashupatastra</h1>
    <p class="muted">Parking invoice</p>
    <p><strong>${escapeHtml(detail.invoiceNumber)}</strong><br/>Issued ${escapeHtml(issued)}<br/>Booking #${escapeHtml(String(detail.bookingId))}</p>
    <div class="grid">
      <div class="box">
        <div class="muted">Billed to (customer)</div>
        <strong>${escapeHtml(detail.customer?.name ?? "Customer")}</strong><br/>
        ${escapeHtml(detail.customer?.phone ?? "—")}<br/>
        ${escapeHtml(detail.customer?.email ?? "")}
      </div>
      <div class="box">
        <div class="muted">Parking owner</div>
        <strong>${escapeHtml(detail.owner?.name ?? "Owner")}</strong><br/>
        ${escapeHtml(detail.owner?.phone ?? "—")}<br/>
        ${escapeHtml(detail.owner?.email ?? "")}
      </div>
    </div>
    <table style="width:100%;border-collapse:collapse">${tableRows}</table>
    <p class="total">Amount paid: ${escapeHtml(formatInr(detail.amountInPaise))}</p>
    <p class="muted">This is a computer-generated invoice for your parking booking.</p>
  </div>
</body>
</html>`;
  }

  await ds.query(`
    CREATE TABLE IF NOT EXISTS parking_booking_messages (
      id SERIAL PRIMARY KEY,
      booking_id INT NOT NULL,
      sender_user_id INT NOT NULL,
      body TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await ds.query(`
    CREATE INDEX IF NOT EXISTS idx_parking_booking_messages_booking_id
    ON parking_booking_messages (booking_id)
  `);
  await ds.query(`
    CREATE INDEX IF NOT EXISTS idx_parking_booking_messages_sender_user_id
    ON parking_booking_messages (sender_user_id)
  `);

  await createService({
    name: "parking",
    port: envInt("PARKING_PORT", 3004),
    registerRoutes: async (app) => {
      // -------- Stats --------
      app.get("/v1/parking/stats", async (request) => {
        const headers = request.headers as Record<string, unknown>;
        const execOnly = isFieldExecutiveOnly(headers);
        const execId = parseUserIdFromHeaders(headers);

        const countByStatus = async (status: ListingStatus) => {
          const qb = listingRepo.createQueryBuilder("l").where("l.status = :status", { status });
          if (execOnly && execId != null) {
            qb.andWhere(executiveListingScopeSql("l"), { execId });
          }
          return qb.getCount();
        };

        const countAllListings = async () => {
          const qb = listingRepo.createQueryBuilder("l");
          if (execOnly && execId != null) {
            qb.where(executiveListingScopeSql("l"), { execId });
          }
          return qb.getCount();
        };

        const [
          listingsTotal,
          pendingVerification,
          fieldInProgress,
          managerReview,
          needsInfo,
          rejected,
          approved,
          bookingsTotal,
          bookingsActive,
          bookingsCompleted,
          slotsTotal,
          slotsPending,
          slotsApproved,
        ] = await Promise.all([
          countAllListings(),
          countByStatus(ListingStatus.PENDING_VERIFICATION),
          countByStatus(ListingStatus.FIELD_IN_PROGRESS),
          countByStatus(ListingStatus.MANAGER_REVIEW),
          countByStatus(ListingStatus.NEEDS_INFO),
          countByStatus(ListingStatus.REJECTED),
          countByStatus(ListingStatus.APPROVED),
          bookingRepo.count(),
          bookingRepo.count({
            where: {
              status: In([BookingStatus.PENDING, BookingStatus.CONFIRMED, BookingStatus.CHECKED_IN]),
            },
          }),
          bookingRepo.count({ where: { status: BookingStatus.COMPLETED } }),
          slotRepo.count(),
          slotRepo.count({ where: { status: In([ListingStatus.PENDING_APPROVAL, ListingStatus.PENDING_VERIFICATION]) } }),
          slotRepo.count({ where: { status: ListingStatus.APPROVED } }),
        ]);

        return {
          listingsTotal,
          pendingVerification,
          fieldInProgress,
          managerReview,
          needsInfo,
          rejected,
          approved,
          bookingsTotal,
          bookingsActive,
          bookingsCompleted,
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
        const ownerUserId = parseUserIdFromHeaders(request.headers as Record<string, unknown>);
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
          toEmail: user.email,
          toPhone: user.phone,
          title: "Application submitted",
          body: [
            `Hello ${user.name ?? "Owner"},`,
            "",
            "Your parking registration is Pending Verification.",
            "",
            `• Apartment: ${listing.apartmentName}`,
            `• Slot: ${listing.parkingSlotNumber}`,
            `• City: ${listing.city}${listing.pinCode ? ` · PIN ${listing.pinCode}` : ""}`,
            `• Address: ${listing.addressLine}`,
            "",
            "A field executive will be assigned within 24 hours.",
            "",
            "— Paashupatastra",
          ].join("\n"),
          referenceType: "parking_listing",
          referenceId: listing.id,
        });

        const staffRecipients = await userRepo
          .createQueryBuilder("u")
          .where("u.is_active = true")
          .andWhere(
            `(:psa = ANY(u.roles) OR :sa = ANY(u.roles) OR :vm = ANY(u.roles))`,
            {
              psa: UserRole.PARKING_SUPER_ADMIN,
              sa: UserRole.SUPER_ADMIN,
              vm: UserRole.VERIFICATION_MANAGER,
            },
          )
          .getMany();

        const staffTitle = "New parking request submitted";
        const staffBody = [
          "An owner submitted a new parking request for verification.",
          "",
          `• Request ID: ${listing.id}`,
          `• Apartment: ${listing.apartmentName}`,
          `• Flat: ${listing.flatNumber}${listing.blockTower ? ` · Block ${listing.blockTower}` : ""}`,
          `• Slot: ${listing.parkingSlotNumber}`,
          `• City: ${listing.city}${listing.pinCode ? ` · PIN ${listing.pinCode}` : ""}`,
          `• Address: ${listing.addressLine}`,
          `• Owner: ${user.name ?? "—"} · ${user.phone}${user.email ? ` · ${user.email}` : ""}`,
          `• Status: ${ListingStatus.PENDING_VERIFICATION}`,
          "",
          "Open Verification to assign a field executive.",
          "",
          "— Paashupatastra",
        ].join("\n");

        await Promise.allSettled(
          staffRecipients.map((staff) =>
            notify(ds, {
              userId: staff.id,
              toEmail: staff.email,
              toPhone: staff.phone,
              title: staffTitle,
              body: `Hello ${staff.name ?? "Team"},\n\n${staffBody}`,
              referenceType: "parking_listing",
              referenceId: listing.id,
            }),
          ),
        );

        return reply.code(201).send({
          listing: serializeListing(listing),
          message: "Registration submitted. Status: Pending Verification",
        });
      });

      app.get("/v1/parking/listings", async (request) => {
        const query = paginationQuerySchema.parse(request.query);
        const raw = request.query as { status?: string; ownerUserId?: string };
        const headers = request.headers as Record<string, unknown>;
        const currentUserId = parseUserIdFromHeaders(headers);
        const execOnly = isFieldExecutiveOnly(headers);

        const qb = listingRepo.createQueryBuilder("l").orderBy("l.created_at", "DESC");
        if (raw.status) qb.andWhere("l.status = :status", { status: raw.status });
        if (raw.ownerUserId) qb.andWhere("l.owner_user_id = :ownerUserId", { ownerUserId: parseEntityId(raw.ownerUserId) });

        // Field executives only see listings tied to their assignments (or rejected by them)
        if (execOnly && currentUserId != null) {
          qb.andWhere(executiveListingScopeSql("l"), { execId: currentUserId });
        }

        if (query.q) {
          qb.andWhere(
            `(l.apartment_name ILIKE :q OR l.city ILIKE :q OR l.pin_code ILIKE :q OR l.parking_slot_number ILIKE :q OR l.address_line ILIKE :q OR CAST(l.owner_user_id AS text) ILIKE :q)`,
            { q: `%${query.q}%` },
          );
        }
        const total = await qb.getCount();
        const rows = await qb.skip((query.page - 1) * query.limit).take(query.limit).getMany();
        const ownerIds = [...new Set(rows.map((r) => r.ownerUserId))];
        const rejectorIds = [
          ...new Set(
            rows
              .map((r) => r.rejectedByUserId)
              .filter((id): id is number => id != null && id > 0),
          ),
        ];
        const relatedIds = [...new Set([...ownerIds, ...rejectorIds])];
        const relatedUsers =
          relatedIds.length > 0
            ? await userRepo.find({ where: { id: In(relatedIds) } })
            : [];
        const userById = new Map(relatedUsers.map((u) => [u.id, u]));
        return {
          items: rows.map((row) => {
            const owner = userById.get(row.ownerUserId);
            const rejector =
              row.rejectedByUserId != null ? userById.get(row.rejectedByUserId) : null;
            return {
              ...serializeListing(row),
              ownerName: owner?.name ?? null,
              ownerPhone: owner?.phone ?? null,
              ownerEmail: owner?.email ?? null,
              rejectedByName: rejector?.name ?? null,
              rejectedByPhone: rejector?.phone ?? null,
            };
          }),
          page: query.page,
          limit: query.limit,
          total,
          totalPages: Math.max(1, Math.ceil(total / query.limit)),
        };
      });

      app.get("/v1/parking/listings/:id", async (request, reply) => {
        const id = parseEntityId((request.params as { id: string }).id);
        const headers = request.headers as Record<string, unknown>;
        const row = await listingRepo.findOne({ where: { id } });
        if (!row) {
          return reply.code(404).send({ error: { code: "NOT_FOUND", message: "Listing not found" } });
        }

        if (isFieldExecutiveOnly(headers)) {
          const execId = parseUserIdFromHeaders(headers);
          const mine =
            execId != null &&
            (row.rejectedByUserId === execId ||
              (await assignmentRepo.exist({
                where: { listingId: id, executiveUserId: execId },
              })));
          if (!mine) {
            return reply.code(403).send({
              error: {
                code: "FORBIDDEN",
                message: "You can only view listings assigned to you",
              },
            });
          }
        }

        const owner = await userRepo.findOne({ where: { id: row.ownerUserId } });
        const rejector =
          row.rejectedByUserId != null
            ? await userRepo.findOne({ where: { id: row.rejectedByUserId } })
            : null;
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
            rejectedByName: rejector?.name ?? null,
            rejectedByPhone: rejector?.phone ?? null,
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

        const [executive, owner, assignedByUser] = await Promise.all([
          userRepo.findOne({ where: { id: body.executiveUserId } }),
          userRepo.findOne({ where: { id: listing.ownerUserId } }),
          userRepo.findOne({ where: { id: assignedBy } }),
        ]);

        let managerUser: UserEntity | null = null;
        if (executive?.reportingManagerId) {
          managerUser = await userRepo.findOne({ where: { id: executive.reportingManagerId } });
        }
        if (!managerUser) {
          managerUser = assignedByUser;
        }

        const { slotLabel, addressBlock } = listingSummary(listing);
        const dueLabel = toIsoRequired(dueAt);
        const cityPin = [listing.city, listing.pinCode ? `PIN ${listing.pinCode}` : null]
          .filter(Boolean)
          .join(", ");

        const executiveContact = [
          executive?.name ? `Name: ${executive.name}` : null,
          executive?.phone ? `Phone: ${executive.phone}` : null,
          executive?.email ? `Email: ${executive.email}` : null,
        ]
          .filter(Boolean)
          .join("\n");

        const ownerContact = [
          owner?.name ? `Name: ${owner.name}` : null,
          owner?.phone ? `Phone: ${owner.phone}` : null,
          owner?.email ? `Email: ${owner.email}` : null,
        ]
          .filter(Boolean)
          .join("\n");

        const assignedByLabel = assignedByUser?.name ?? `User #${assignedBy}`;

        const ownerBody = [
          "A field verification visit has been scheduled for your parking request.",
          "",
          `Apartment: ${listing.apartmentName}`,
          `Slot: ${slotLabel}`,
          `Location: ${cityPin || listing.city}`,
          `Address: ${addressBlock}`,
          `Status: ${ListingStatus.FIELD_IN_PROGRESS}`,
          "",
          "Assigned field executive:",
          executiveContact || "—",
          "",
          `Due by: ${dueLabel}`,
          "",
          "A field executive will visit to verify your parking slot.",
        ].join("\n");

        const executiveBody = [
          "You have been assigned a field verification.",
          "",
          `Apartment: ${listing.apartmentName}`,
          `Slot: ${listing.parkingSlotNumber}${listing.parkingType ? ` (${listing.parkingType})` : ""}`,
          `Address: ${addressBlock}`,
          `City: ${listing.city ?? "—"}`,
          "",
          ownerContact ? `Owner contact:\n${ownerContact}` : null,
          "",
          `Due by: ${dueLabel}`,
          `Assigned by: ${assignedByLabel}`,
        ]
          .filter(Boolean)
          .join("\n");

        const managerBody = [
          "Your field executive has been assigned to verify a request.",
          "",
          `Apartment: ${listing.apartmentName}`,
          `Slot: ${listing.parkingSlotNumber}`,
          `City: ${listing.city ?? "—"}`,
          "",
          "Field executive:",
          executiveContact || "—",
          "",
          ownerContact ? `Owner contact:\n${ownerContact}` : null,
          "",
          `Due by: ${dueLabel}`,
        ]
          .filter(Boolean)
          .join("\n");

        await Promise.allSettled([
          owner
            ? notify(ds, {
                userId: owner.id,
                toEmail: owner.email,
                toPhone: owner.phone,
                title: "Field verification scheduled",
                body: ownerBody,
                referenceType: "verification_assignment",
                referenceId: assignment.id,
              })
            : Promise.resolve(),
          executive
            ? notify(ds, {
                userId: executive.id,
                toEmail: executive.email,
                toPhone: executive.phone,
                title: "New field verification assigned",
                body: executiveBody,
                referenceType: "verification_assignment",
                referenceId: assignment.id,
              })
            : Promise.resolve(),
          managerUser
            ? notify(ds, {
                userId: managerUser.id,
                toEmail: managerUser.email,
                toPhone: managerUser.phone,
                title: "Field executive assigned to request",
                body: managerBody,
                referenceType: "verification_assignment",
                referenceId: assignment.id,
              })
            : Promise.resolve(),
        ]);

        return reply.code(201).send(assignment);
      });

      app.get("/v1/parking/verification/assignments", async (request) => {
        const query = paginationQuerySchema.parse(request.query);
        const raw = request.query as { executiveUserId?: string; status?: string };
        const headers = request.headers as Record<string, unknown>;
        const currentUserId = parseUserIdFromHeaders(headers);
        const execOnly = isFieldExecutiveOnly(headers);

        const qb = assignmentRepo.createQueryBuilder("a").orderBy("a.created_at", "DESC");

        // Field executives only see their own assignments
        if (execOnly && currentUserId != null) {
          qb.andWhere("a.executive_user_id = :executiveUserId", {
            executiveUserId: currentUserId,
          });
        } else if (raw.executiveUserId) {
          qb.andWhere("a.executive_user_id = :executiveUserId", {
            executiveUserId: parseEntityId(raw.executiveUserId),
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

        if (
          assignment.executiveUserId !== executiveUserId &&
          !canManageVerification(request.headers as Record<string, unknown>)
        ) {
          return reply.code(403).send({
            error: {
              code: "FORBIDDEN",
              message: "Only the assigned field executive can submit this report",
            },
          });
        }

        if (["completed", "rejected", "needs_info"].includes(assignment.status)) {
          return reply.code(400).send({
            error: {
              code: "ALREADY_REPORTED",
              message: `This assignment is already ${assignment.status.replaceAll("_", " ")}`,
            },
          });
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

        if (body.decision === "reject") {
          applyListingRejection(listing, {
            reason: body.comments,
            rejectedByUserId: executiveUserId,
            rejectedByRole: UserRole.FIELD_EXECUTIVE,
          });
          assignment.status = "rejected";
          assignment.completedAt = new Date();
        } else {
          // approve → send to manager review (need_info is manager/admin only)
          assignment.status = "completed";
          assignment.completedAt = new Date();
          listing.status = ListingStatus.MANAGER_REVIEW;
          listing.needsInfoNotes = null;
          clearListingRejection(listing);
        }
        await assignmentRepo.save(assignment);
        await listingRepo.save(listing);

        const [executive, owner, assignedByUser] = await Promise.all([
          userRepo.findOne({ where: { id: assignment.executiveUserId } }),
          userRepo.findOne({ where: { id: listing.ownerUserId } }),
          userRepo.findOne({ where: { id: assignment.assignedByUserId } }),
        ]);

        let reportingManager: UserEntity | null = null;
        if (executive?.reportingManagerId) {
          reportingManager = await userRepo.findOne({ where: { id: executive.reportingManagerId } });
        }
        if (!reportingManager) {
          reportingManager = assignedByUser;
        }

        const parkingAdmins = await userRepo
          .createQueryBuilder("u")
          .where(`(:psa = ANY(u.roles) OR :sa = ANY(u.roles))`, {
            psa: UserRole.PARKING_SUPER_ADMIN,
            sa: UserRole.SUPER_ADMIN,
          })
          .andWhere("u.is_active = true")
          .getMany();

        const { slotLabel, addressBlock } = listingSummary(listing);
        const executiveLabel = executive?.name
          ? `${executive.name} (${executive.phone})`
          : `Executive #${assignment.executiveUserId}`;

        const decisionLabel = body.decision === "reject" ? "Rejected" : "Sent for manager review";
        const rejectorLabel = executive?.name
          ? `${executive.name} (field executive)`
          : "Field executive";
        const rejectionNotice =
          body.decision === "reject"
            ? formatRejectionNotice({
                reason: body.comments,
                rejectedAt: listing.rejectedAt,
                rejectedByLabel: rejectorLabel,
              })
            : null;

        const sharedDetails = [
          `Decision: ${decisionLabel}`,
          `Request: ${listing.apartmentName} · Slot ${listing.parkingSlotNumber}`,
          `Location: ${listing.city}${listing.pinCode ? ` · PIN ${listing.pinCode}` : ""}`,
          `Address: ${addressBlock}`,
          `Field executive: ${executiveLabel}`,
          "",
          rejectionNotice ?? `Notes: ${body.comments}`,
        ].join("\n");

        const ownerTitle =
          body.decision === "reject"
            ? "Parking verification rejected"
            : "Field verification completed — awaiting manager review";

        const ownerBody =
          body.decision === "reject"
            ? [
                "Your parking request was rejected after field verification.",
                "",
                sharedDetails,
                "",
                "You can submit a new parking application with corrected documents if needed.",
              ].join("\n")
            : [
                "Field verification is complete. Your request is now with the verification manager for final approval.",
                "",
                sharedDetails,
              ].join("\n");

        const staffTitle =
          body.decision === "reject"
            ? "Field executive rejected a request"
            : "Field report ready for manager review";

        const staffBody = [
          `A field executive took action on ${slotLabel}.`,
          "",
          sharedDetails,
          owner
            ? `\nOwner: ${owner.name ?? "—"} · ${owner.phone}${owner.email ? ` · ${owner.email}` : ""}`
            : "",
        ]
          .filter(Boolean)
          .join("\n");

        const recipients = new Map<number, UserEntity>();
        if (owner) recipients.set(owner.id, owner);
        if (executive) recipients.set(executive.id, executive);
        if (reportingManager) recipients.set(reportingManager.id, reportingManager);
        for (const admin of parkingAdmins) {
          recipients.set(admin.id, admin);
        }

        const notifyJobs: Array<Promise<unknown>> = [];
        for (const recipient of recipients.values()) {
          const isOwner = owner != null && recipient.id === owner.id;
          notifyJobs.push(
            notify(ds, {
              userId: recipient.id,
              toEmail: recipient.email,
              toPhone: recipient.phone,
              title: isOwner ? ownerTitle : staffTitle,
              body: isOwner ? ownerBody : staffBody,
              referenceType: "parking_listing",
              referenceId: listing.id,
            }),
          );
        }
        await Promise.allSettled(notifyJobs);

        return reply.code(201).send({
          report,
          assignment: {
            id: assignment.id,
            status: assignment.status,
            completedAt: assignment.completedAt ? toIsoRequired(assignment.completedAt) : null,
          },
          listing: serializeListing(listing),
        });
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

        if (
          listing.status !== ListingStatus.MANAGER_REVIEW &&
          listing.status !== ListingStatus.NEEDS_INFO
        ) {
          return reply.code(400).send({
            error: {
              code: "INVALID_STATUS",
              message: "Listing is not awaiting manager review or needs-info follow-up",
            },
          });
        }

        const managerUserId = requireUserId(request.headers as Record<string, unknown>);
        const managerRoles = getRolesFromHeaders(request.headers as Record<string, unknown>);

        if (body.decision === "approve") {
          if (listing.status === ListingStatus.NEEDS_INFO) {
            return reply.code(400).send({
              error: {
                code: "INVALID_STATUS",
                message: "Cannot approve while listing still needs information. Re-assign field verification first.",
              },
            });
          }
          listing.status = ListingStatus.APPROVED;
          listing.isActive = true;
          listing.activatedAt = new Date();
          listing.needsInfoNotes = null;
          clearListingRejection(listing);
        } else if (body.decision === "reject") {
          applyListingRejection(listing, {
            reason: body.comments,
            rejectedByUserId: managerUserId,
            rejectedByRole: rejectorRoleLabel(managerRoles),
          });

          const latestAssignment = await assignmentRepo.findOne({
            where: { listingId: listing.id },
            order: { createdAt: "DESC" },
          });
          if (latestAssignment) {
            latestAssignment.status = "rejected";
            latestAssignment.completedAt = new Date();
            await assignmentRepo.save(latestAssignment);
          }
        } else if (body.decision === "need_info") {
          listing.status = ListingStatus.NEEDS_INFO;
          listing.isActive = false;
          listing.needsInfoNotes = body.comments;
          clearListingRejection(listing);

          const latestAssignment = await assignmentRepo.findOne({
            where: { listingId: listing.id },
            order: { createdAt: "DESC" },
          });
          if (latestAssignment && latestAssignment.status !== "rejected") {
            latestAssignment.status = "needs_info";
            latestAssignment.completedAt = null;
            await assignmentRepo.save(latestAssignment);
          }
        } else {
          // send_back → reopen field verification
          listing.status = ListingStatus.FIELD_IN_PROGRESS;
          listing.needsInfoNotes = body.comments;
          clearListingRejection(listing);
          listing.isActive = false;

          const latestAssignment = await assignmentRepo.findOne({
            where: { listingId: listing.id },
            order: { createdAt: "DESC" },
          });
          if (latestAssignment && latestAssignment.status !== "rejected") {
            latestAssignment.status = "assigned";
            latestAssignment.completedAt = null;
            latestAssignment.dueAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
            await assignmentRepo.save(latestAssignment);
          }
        }
        await listingRepo.save(listing);

        const latestAssignment = await assignmentRepo.findOne({
          where: { listingId: listing.id },
          order: { createdAt: "DESC" },
        });

        const [owner, executive, assignedByUser] = await Promise.all([
          userRepo.findOne({ where: { id: listing.ownerUserId } }),
          latestAssignment
            ? userRepo.findOne({ where: { id: latestAssignment.executiveUserId } })
            : Promise.resolve(null),
          latestAssignment
            ? userRepo.findOne({ where: { id: latestAssignment.assignedByUserId } })
            : Promise.resolve(null),
        ]);

        let reportingManager: UserEntity | null = null;
        if (executive?.reportingManagerId) {
          reportingManager = await userRepo.findOne({ where: { id: executive.reportingManagerId } });
        }
        if (!reportingManager) {
          reportingManager = assignedByUser;
        }

        const parkingAdmins = await userRepo
          .createQueryBuilder("u")
          .where(`(:psa = ANY(u.roles) OR :sa = ANY(u.roles))`, {
            psa: UserRole.PARKING_SUPER_ADMIN,
            sa: UserRole.SUPER_ADMIN,
          })
          .andWhere("u.is_active = true")
          .getMany();

        const decisionLabel = body.decision.replaceAll("_", " ");
        const managerUser = await userRepo.findOne({ where: { id: managerUserId } });
        const rejectorLabel = managerUser?.name
          ? `${managerUser.name} (${(listing.rejectedByRole ?? "manager").replaceAll("_", " ")})`
          : (listing.rejectedByRole ?? "manager").replaceAll("_", " ");
        const rejectionNotice =
          body.decision === "reject"
            ? formatRejectionNotice({
                reason: body.comments,
                rejectedAt: listing.rejectedAt,
                rejectedByLabel: rejectorLabel,
              })
            : null;

        const ownerTitle =
          body.decision === "approve"
            ? "Parking Slot Successfully Activated"
            : body.decision === "reject"
              ? "Parking verification rejected"
              : body.decision === "need_info"
                ? "More information needed for your parking request"
                : "Parking request sent back for re-verification";
        const ownerBody =
          body.decision === "approve"
            ? "Congratulations! Your parking slot has been successfully verified and activated. Your parking space is now available for customers to book through the application."
            : [
                body.decision === "reject"
                  ? "Your parking request was rejected by the verification manager."
                  : body.decision === "need_info"
                    ? "The verification team requested more information for your parking request."
                    : "Your request was sent back for another field verification visit.",
                "",
                rejectionNotice ?? `Notes: ${body.comments}`,
                "",
                `Apartment: ${listing.apartmentName}`,
                `Slot: ${listing.parkingSlotNumber}`,
                `City: ${listing.city}`,
                body.decision === "need_info"
                  ? "\nPlease update your documents / details so verification can continue."
                  : body.decision === "reject"
                    ? "\nYou can submit a new parking application with corrected documents if needed."
                    : "",
              ]
                .filter(Boolean)
                .join("\n");

        const staffTitle =
          body.decision === "need_info"
            ? "Manager requested more info on a request"
            : body.decision === "reject"
              ? "Manager rejected a request"
              : body.decision === "approve"
                ? "Request approved by manager"
                : "Request sent back for re-verification";
        const staffBody = [
          `Manager decision: ${decisionLabel}`,
          `Apartment: ${listing.apartmentName}`,
          `Slot: ${listing.parkingSlotNumber}`,
          `City: ${listing.city}`,
          owner ? `Owner: ${owner.name ?? "—"} · ${owner.phone}` : null,
          executive ? `Field executive: ${executive.name ?? "—"} · ${executive.phone}` : null,
          "",
          rejectionNotice ?? `Notes: ${body.comments}`,
        ]
          .filter(Boolean)
          .join("\n");

        const executiveTitle =
          body.decision === "reject"
            ? "Request you verified was rejected"
            : body.decision === "approve"
              ? "Request you verified was approved"
              : body.decision === "need_info"
                ? "Manager requested more info on your assignment"
                : "Request sent back for re-verification";
        const executiveBody = [
          `Manager decision on your field assignment: ${decisionLabel}`,
          "",
          `Apartment: ${listing.apartmentName}`,
          `Slot: ${listing.parkingSlotNumber}`,
          `City: ${listing.city}`,
          "",
          rejectionNotice ?? `Notes: ${body.comments}`,
        ].join("\n");

        const recipients = new Map<
          number,
          { user: UserEntity; title: string; body: string }
        >();
        if (owner) {
          recipients.set(owner.id, { user: owner, title: ownerTitle, body: ownerBody });
        }
        if (executive) {
          recipients.set(executive.id, {
            user: executive,
            title: executiveTitle,
            body: executiveBody,
          });
        }
        if (reportingManager) {
          recipients.set(reportingManager.id, {
            user: reportingManager,
            title: staffTitle,
            body: staffBody,
          });
        }
        for (const admin of parkingAdmins) {
          if (!recipients.has(admin.id)) {
            recipients.set(admin.id, { user: admin, title: staffTitle, body: staffBody });
          }
        }

        await Promise.allSettled(
          [...recipients.values()].map(({ user, title, body }) =>
            notify(ds, {
              userId: user.id,
              toEmail: user.email,
              toPhone: user.phone,
              title,
              body,
              referenceType: "parking_listing",
              referenceId: listing.id,
            }),
          ),
        );

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

        // Hide slots with overlapping bookings, and require owner availability hours/days
        if (query.startAt && query.endAt) {
          const startAt = new Date(query.startAt);
          const endAt = new Date(query.endAt);
          if (endAt.getTime() <= startAt.getTime()) {
            return {
              items: [],
              page: query.page,
              limit: query.limit,
              total: 0,
              totalPages: 1,
            };
          }

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
          const busyIds = new Set(busy.map((b) => b.listingId).filter(Boolean) as number[]);
          rows = rows.filter(
            (r) =>
              !busyIds.has(r.id) &&
              listingFitsAvailability(r, startAt, endAt),
          );
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

        const availability = checkListingAvailability(
          listing,
          new Date(body.startAt),
          new Date(body.endAt),
        );
        if (!availability.ok) {
          return reply.code(400).send({
            error: { code: availability.code, message: availability.message },
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

        const availability = checkListingAvailability(
          listing,
          new Date(body.startAt),
          new Date(body.endAt),
        );
        if (!availability.ok) {
          return reply.code(400).send({
            error: { code: availability.code, message: availability.message },
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

        const customer = await userRepo.findOne({ where: { id: renterUserId } });
        const owner = await userRepo.findOne({ where: { id: listing.ownerUserId } });
        const { slotLabel, addressBlock, locationExtra } = listingSummary(listing);
        const startLabel = new Date(booking.startAt).toLocaleString("en-IN", {
          timeZone: "Asia/Kolkata",
        });
        const endLabel = new Date(booking.endAt).toLocaleString("en-IN", {
          timeZone: "Asia/Kolkata",
        });
        const amountLabel = formatInr(booking.totalAmountInPaise);
        const vehicleLabel = [
          booking.vehicleType ? booking.vehicleType.replaceAll("_", " ") : null,
          booking.vehicleNumber,
        ]
          .filter(Boolean)
          .join(" · ") || "—";

        if (customer) {
          await notify(ds, {
            userId: customer.id,
            toEmail: customer.email,
            toPhone: customer.phone,
            title: "Booking created — complete payment",
            body: [
              `Hello ${customer.name ?? "Customer"},`,
              "",
              "Your parking booking was created and is awaiting payment.",
              "",
              `• Booking ID: ${booking.id}`,
              `• Parking: ${slotLabel}`,
              locationExtra ? `• Location: ${locationExtra}` : null,
              `• Address: ${addressBlock}`,
              `• Check-in: ${startLabel}`,
              `• Check-out: ${endLabel}`,
              `• Amount due: ${amountLabel}`,
              `• Vehicle: ${vehicleLabel}`,
              "",
              "Complete payment within 15 minutes to confirm the slot.",
              "",
              "— Paashupatastra",
            ]
              .filter((line) => line !== null)
              .join("\n"),
            referenceType: "parking_booking",
            referenceId: booking.id,
          });
        }

        if (owner) {
          await notify(ds, {
            userId: owner.id,
            toEmail: owner.email,
            toPhone: owner.phone,
            title: "New booking pending payment",
            body: [
              `Hello ${owner.name ?? "Owner"},`,
              "",
              "A customer started a booking for your parking slot (payment pending).",
              "",
              `• Booking ID: ${booking.id}`,
              `• Parking: ${slotLabel}`,
              locationExtra ? `• Location: ${locationExtra}` : null,
              `• Address: ${addressBlock}`,
              `• Check-in: ${startLabel}`,
              `• Check-out: ${endLabel}`,
              `• Amount: ${amountLabel}`,
              `• Customer: ${customer?.name ?? "—"} · ${customer?.phone ?? "—"}`,
              `• Vehicle: ${vehicleLabel}`,
              "",
              "You will get another notification with the check-in OTP once payment succeeds.",
              "",
              "— Paashupatastra",
            ]
              .filter((line) => line !== null)
              .join("\n"),
            referenceType: "parking_booking",
            referenceId: booking.id,
          });
        }

        return reply.code(201).send({
          booking: serializeBooking(booking),
          paymentRequired: true,
          message: "Complete payment to confirm booking. Funds will credit platform wallet.",
        });
      });

      app.post("/v1/parking/bookings/:id/confirm-payment", async (request, reply) => {
        const id = parseEntityId((request.params as { id: string }).id);
        const actorId = parseUserIdFromHeaders(request.headers as Record<string, unknown>);
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

        // Payment may already be marked paid by /payments/orders/verify or webhook —
        // still collect if needed, then always ensure owner/customer notifications.
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

        const listing = booking.listingId
          ? await listingRepo.findOne({ where: { id: booking.listingId } })
          : null;
        const customer = await userRepo.findOne({ where: { id: booking.renterUserId } });
        const owner = booking.ownerUserId
          ? await userRepo.findOne({ where: { id: booking.ownerUserId } })
          : null;

        await notifyBookingConfirmed(ds, { booking, listing, customer, owner });

        try {
          await ensureInvoiceForBooking(booking);
        } catch (err) {
          app.log.error({ err, bookingId: booking.id }, "Failed to create parking invoice after payment");
        }

        const { navUrl } = listingSummary(listing);
        return {
          booking: serializeBooking(booking),
          listing: listing ? serializeListing(listing) : null,
          navigationUrl: navUrl,
          alreadyConfirmed: wasPaid,
          message: wasPaid
            ? "Booking already paid and confirmed. Notifications ensured."
            : "Payment successful. Funds credited to platform wallet. Emails/notifications sent.",
        };
      });

      app.post("/v1/parking/bookings/:id/check-in", async (request, reply) => {
        const id = parseEntityId((request.params as { id: string }).id);
        const actorId = parseUserIdFromHeaders(request.headers as Record<string, unknown>);
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

        const listing = booking.listingId
          ? await listingRepo.findOne({ where: { id: booking.listingId } })
          : null;
        const { slotLabel, addressBlock, locationExtra } = listingSummary(listing);
        const customer = await userRepo.findOne({ where: { id: booking.renterUserId } });
        const owner = booking.ownerUserId
          ? await userRepo.findOne({ where: { id: booking.ownerUserId } })
          : null;
        const checkedInLabel = new Date(booking.checkedInAt).toLocaleString("en-IN", {
          timeZone: "Asia/Kolkata",
        });
        const plannedOutLabel = new Date(booking.endAt).toLocaleString("en-IN", {
          timeZone: "Asia/Kolkata",
        });
        const vehicleLabel = [
          booking.vehicleType ? booking.vehicleType.replaceAll("_", " ") : null,
          booking.vehicleNumber,
        ]
          .filter(Boolean)
          .join(" · ") || "—";

        if (customer) {
          await notify(ds, {
            userId: customer.id,
            toEmail: customer.email,
            toPhone: customer.phone,
            title: "Check-in successful",
            body: [
              `Hello ${customer.name ?? "Customer"},`,
              "",
              "You have checked in successfully. Your parking session has started.",
              "",
              `• Booking ID: ${booking.id}`,
              `• Parking: ${slotLabel}`,
              locationExtra ? `• Location: ${locationExtra}` : null,
              `• Address: ${addressBlock}`,
              `• Checked in at: ${checkedInLabel}`,
              `• Planned check-out: ${plannedOutLabel}`,
              `• Vehicle: ${vehicleLabel}`,
              "",
              "Remember to check out in the app when you leave.",
              "",
              "— Paashupatastra",
            ]
              .filter((line) => line !== null)
              .join("\n"),
            referenceType: "parking_booking",
            referenceId: booking.id,
          });
        }

        if (owner) {
          await notify(ds, {
            userId: owner.id,
            toEmail: owner.email,
            toPhone: owner.phone,
            title: "Customer checked in",
            body: [
              `Hello ${owner.name ?? "Owner"},`,
              "",
              "A customer has checked in at your parking slot.",
              "",
              `• Booking ID: ${booking.id}`,
              `• Parking: ${slotLabel}`,
              locationExtra ? `• Location: ${locationExtra}` : null,
              `• Customer: ${customer?.name ?? "—"} · ${customer?.phone ?? "—"}`,
              `• Vehicle: ${vehicleLabel}`,
              `• Checked in at: ${checkedInLabel}`,
              `• Planned check-out: ${plannedOutLabel}`,
              "",
              "You will be notified again when they check out and your wallet is credited.",
              "",
              "— Paashupatastra",
            ]
              .filter((line) => line !== null)
              .join("\n"),
            referenceType: "parking_booking",
            referenceId: booking.id,
          });
        }

        return serializeBooking(booking);
      });

      app.post("/v1/parking/bookings/:id/check-out", async (request, reply) => {
        const id = parseEntityId((request.params as { id: string }).id);
        const actorId = parseUserIdFromHeaders(request.headers as Record<string, unknown>);
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

        try {
          await ensureInvoiceForBooking(booking);
        } catch (err) {
          app.log.error({ err, bookingId: booking.id }, "Failed to ensure parking invoice on check-out");
        }

        let settlement: Awaited<ReturnType<typeof settlePayment>> | null = null;
        let settlementError: string | null = null;
        try {
          settlement = await settlePayment(booking.id);
        } catch (err) {
          settlementError = err instanceof Error ? err.message : "Settlement failed";
          app.log.error({ err, bookingId: booking.id }, "Auto settlement failed");
        }

        const listing = booking.listingId
          ? await listingRepo.findOne({ where: { id: booking.listingId } })
          : null;
        const { slotLabel, addressBlock, locationExtra } = listingSummary(listing);
        const owner = booking.ownerUserId
          ? await userRepo.findOne({ where: { id: booking.ownerUserId } })
          : null;
        const customer = await userRepo.findOne({ where: { id: booking.renterUserId } });
        const ownerShare = settlement?.ownerShareInPaise ?? 0;
        const platformFee = settlement?.platformFeeInPaise ?? booking.platformFeeInPaise ?? 0;
        const checkedOutLabel = new Date(booking.checkedOutAt).toLocaleString("en-IN", {
          timeZone: "Asia/Kolkata",
        });
        const checkedInLabel = booking.checkedInAt
          ? new Date(booking.checkedInAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })
          : "—";
        const vehicleLabel = [
          booking.vehicleType ? booking.vehicleType.replaceAll("_", " ") : null,
          booking.vehicleNumber,
        ]
          .filter(Boolean)
          .join(" · ") || "—";
        const grossLabel = formatInr(booking.totalAmountInPaise || booking.amountInPaise);

        if (owner) {
          await notify(ds, {
            userId: owner.id,
            toEmail: owner.email,
            toPhone: owner.phone,
            title: "Customer checked out",
            body: [
              `Hello ${owner.name ?? "Owner"},`,
              "",
              "The customer has checked out of your parking slot.",
              "",
              `• Booking ID: ${booking.id}`,
              `• Parking: ${slotLabel}`,
              locationExtra ? `• Location: ${locationExtra}` : null,
              `• Address: ${addressBlock}`,
              `• Customer: ${customer?.name ?? "—"} · ${customer?.phone ?? "—"}`,
              `• Vehicle: ${vehicleLabel}`,
              `• Checked in: ${checkedInLabel}`,
              `• Checked out: ${checkedOutLabel}`,
              `• Gross paid: ${grossLabel}`,
              `• Platform fee: ${formatInr(platformFee)}`,
              "",
              "— Paashupatastra",
            ]
              .filter((line) => line !== null)
              .join("\n"),
            referenceType: "parking_booking",
            referenceId: booking.id,
          });

          if (settlement && !settlement.alreadySettled) {
            await notify(ds, {
              userId: owner.id,
              toEmail: owner.email,
              toPhone: owner.phone,
              title: `Wallet credited — ${formatInr(ownerShare)}`,
              body: [
                `Hello ${owner.name ?? "Owner"},`,
                "",
                "Your parking owner wallet has been credited after customer check-out.",
                "",
                `• Booking ID: ${booking.id}`,
                `• Parking: ${slotLabel}`,
                `• Gross paid: ${grossLabel}`,
                `• Platform fee deducted: ${formatInr(platformFee)}`,
                `• Amount added to wallet: ${formatInr(ownerShare)}`,
                settlement.ownerBalanceInPaise != null
                  ? `• New wallet balance: ${formatInr(settlement.ownerBalanceInPaise)}`
                  : null,
                "",
                "You can withdraw available balance from Owner wallet.",
                "",
                "— Paashupatastra",
              ]
                .filter((line) => line !== null)
                .join("\n"),
              referenceType: "parking_booking",
              referenceId: booking.id,
            });
          } else if (settlementError) {
            await notify(ds, {
              userId: owner.id,
              toEmail: owner.email,
              toPhone: owner.phone,
              title: "Wallet credit pending",
              body: [
                `Hello ${owner.name ?? "Owner"},`,
                "",
                "Customer checked out, but wallet credit could not be completed yet.",
                `• Booking ID: ${booking.id}`,
                `• Reason: ${settlementError}`,
                "",
                "We will retry settlement. Contact support if this persists.",
                "",
                "— Paashupatastra",
              ].join("\n"),
              referenceType: "parking_booking",
              referenceId: booking.id,
            });
          } else if (settlement?.alreadySettled) {
            // Already credited earlier — still confirm wallet state briefly
            await notify(ds, {
              userId: owner.id,
              toEmail: owner.email,
              toPhone: owner.phone,
              title: `Wallet already credited — ${formatInr(ownerShare)}`,
              body: [
                `Hello ${owner.name ?? "Owner"},`,
                "",
                "This booking was already settled to your wallet.",
                `• Booking ID: ${booking.id}`,
                `• Amount: ${formatInr(ownerShare)}`,
                settlement.ownerBalanceInPaise != null
                  ? `• Wallet balance: ${formatInr(settlement.ownerBalanceInPaise)}`
                  : null,
                "",
                "— Paashupatastra",
              ]
                .filter((line) => line !== null)
                .join("\n"),
              referenceType: "parking_booking",
              referenceId: booking.id,
            });
          }
        }

        if (customer) {
          await notify(ds, {
            userId: customer.id,
            toEmail: customer.email,
            toPhone: customer.phone,
            title: "Check-out successful",
            body: [
              `Hello ${customer.name ?? "Customer"},`,
              "",
              "You have checked out successfully. Thanks for using Paashupatastra.",
              "",
              `• Booking ID: ${booking.id}`,
              `• Parking: ${slotLabel}`,
              locationExtra ? `• Location: ${locationExtra}` : null,
              `• Address: ${addressBlock}`,
              `• Checked in: ${checkedInLabel}`,
              `• Checked out: ${checkedOutLabel}`,
              `• Amount paid: ${grossLabel}`,
              `• Vehicle: ${vehicleLabel}`,
              "",
              "— Paashupatastra",
            ]
              .filter((line) => line !== null)
              .join("\n"),
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

      app.get("/v1/parking/bookings/:id/messages", async (request, reply) => {
        const id = parseEntityId((request.params as { id: string }).id);
        const actorId = parseUserIdFromHeaders(request.headers as Record<string, unknown>);
        if (!actorId) {
          return reply.code(401).send({ error: { code: "UNAUTHORIZED", message: "Unauthorized" } });
        }
        const booking = await bookingRepo.findOne({ where: { id } });
        if (!booking) {
          return reply.code(404).send({ error: { code: "NOT_FOUND", message: "Booking not found" } });
        }
        if (booking.renterUserId !== actorId && booking.ownerUserId !== actorId) {
          return reply.code(403).send({ error: { code: "FORBIDDEN", message: "Not allowed" } });
        }
        if (
          !canChatOnBooking(booking.status) &&
          booking.status !== BookingStatus.COMPLETED
        ) {
          return reply.code(400).send({
            error: {
              code: "CHAT_UNAVAILABLE",
              message: "Chat is available after the booking is confirmed",
            },
          });
        }

        const rows = await messageRepo.find({
          where: { bookingId: booking.id },
          order: { createdAt: "ASC", id: "ASC" },
          take: 200,
        });
        const senderIds = [...new Set(rows.map((r) => r.senderUserId))];
        const senders =
          senderIds.length > 0
            ? await userRepo.find({ where: { id: In(senderIds) } })
            : [];
        const nameById = new Map(senders.map((u) => [u.id, u.name ?? null]));

        return {
          bookingId: booking.id,
          canSend: canChatOnBooking(booking.status),
          items: rows.map((row) =>
            serializeBookingMessage(row, nameById.get(row.senderUserId) ?? null, actorId),
          ),
        };
      });

      app.post("/v1/parking/bookings/:id/messages", async (request, reply) => {
        const id = parseEntityId((request.params as { id: string }).id);
        const actorId = parseUserIdFromHeaders(request.headers as Record<string, unknown>);
        if (!actorId) {
          return reply.code(401).send({ error: { code: "UNAUTHORIZED", message: "Unauthorized" } });
        }
        const body = bookingChatMessageSchema.parse(request.body);
        const booking = await bookingRepo.findOne({ where: { id } });
        if (!booking) {
          return reply.code(404).send({ error: { code: "NOT_FOUND", message: "Booking not found" } });
        }
        if (booking.renterUserId !== actorId && booking.ownerUserId !== actorId) {
          return reply.code(403).send({ error: { code: "FORBIDDEN", message: "Not allowed" } });
        }
        if (!canChatOnBooking(booking.status)) {
          return reply.code(400).send({
            error: {
              code: "CHAT_CLOSED",
              message: "Chat is only open while the booking is confirmed or checked in",
            },
          });
        }

        const saved = await messageRepo.save(
          messageRepo.create({
            bookingId: booking.id,
            senderUserId: actorId,
            body: body.body,
          }),
        );

        const sender = await userRepo.findOne({ where: { id: actorId } });
        const peerId =
          actorId === booking.renterUserId ? booking.ownerUserId : booking.renterUserId;
        if (peerId) {
          const peer = await userRepo.findOne({ where: { id: peerId } });
          if (peer) {
            const preview =
              body.body.length > 140 ? `${body.body.slice(0, 140)}…` : body.body;
            await notify(ds, {
              userId: peer.id,
              toEmail: peer.email,
              toPhone: peer.phone,
              title: `New chat message — booking #${booking.id}`,
              body: [
                `Hello ${peer.name ?? "there"},`,
                "",
                `${sender?.name ?? "Someone"} sent a message about booking #${booking.id}:`,
                "",
                preview,
                "",
                "Open the booking Chat in the app to reply.",
                "",
                "— Paashupatastra",
              ].join("\n"),
              referenceType: "parking_booking_message",
              referenceId: saved.id,
            });
          }
        }

        return reply.code(201).send(
          serializeBookingMessage(saved, sender?.name ?? null, actorId),
        );
      });

      app.get("/v1/parking/bookings", async (request, reply) => {
        const parsed = paginationQuerySchema.parse(request.query);
        const raw = request.query as {
          renterUserId?: string;
          ownerUserId?: string;
          status?: string;
          mine?: string;
        };
        const headers = request.headers as Record<string, unknown>;
        const currentUserId = parseUserIdFromHeaders(headers);
        const roles = getRolesFromHeaders(headers);
        const isStaffViewer =
          roles.includes(UserRole.SUPER_ADMIN) ||
          roles.includes(UserRole.PARKING_SUPER_ADMIN) ||
          roles.includes(UserRole.VERIFICATION_MANAGER);

        let renterFilter: number | null = null;
        let ownerFilter: number | null = null;
        try {
          if (raw.renterUserId) renterFilter = parseEntityId(raw.renterUserId);
          if (raw.ownerUserId) ownerFilter = parseEntityId(raw.ownerUserId);
        } catch {
          return reply.code(400).send({
            error: { code: "INVALID_ID", message: "Invalid user id filter" },
          });
        }

        // Customers/owners must only see their own bookings (bound to JWT / x-user-id)
        if (!isStaffViewer) {
          if (currentUserId == null) {
            return reply.code(401).send({
              error: { code: "UNAUTHORIZED", message: "Sign in to view bookings" },
            });
          }
          const wantOwner =
            raw.mine === "owner" || (ownerFilter != null && renterFilter == null);
          if (wantOwner) {
            ownerFilter = currentUserId;
            renterFilter = null;
          } else {
            renterFilter = currentUserId;
            ownerFilter = null;
          }
        }

        const qb = bookingRepo.createQueryBuilder("b").orderBy("b.created_at", "DESC");
        if (renterFilter != null) {
          qb.andWhere("b.renter_user_id = :renterUserId", { renterUserId: renterFilter });
        }
        if (ownerFilter != null) {
          qb.andWhere("b.owner_user_id = :ownerUserId", { ownerUserId: ownerFilter });
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

        const listingIds = [...new Set(rows.map((r) => r.listingId).filter(Boolean) as number[])];
        const renterIds = [...new Set(rows.map((r) => r.renterUserId))];
        const ownerIds = [...new Set(rows.map((r) => r.ownerUserId).filter(Boolean) as number[])];
        const listings =
          listingIds.length > 0 ? await listingRepo.find({ where: { id: In(listingIds) } }) : [];
        const renters =
          renterIds.length > 0 ? await userRepo.find({ where: { id: In(renterIds) } }) : [];
        const owners =
          ownerIds.length > 0 ? await userRepo.find({ where: { id: In(ownerIds) } }) : [];
        const listingById = new Map(listings.map((l) => [l.id, l]));
        const renterById = new Map(renters.map((u) => [u.id, u]));
        const ownerById = new Map(owners.map((u) => [u.id, u]));

        const hideOwnerOtp = renterFilter != null && ownerFilter == null;
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
        const id = parseEntityId((request.params as { id: string }).id);
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
        const id = parseEntityId((request.params as { id: string }).id);
        const existing = await slotRepo.findOne({ where: { id } });
        if (!existing) {
          return reply.code(404).send({ error: { code: "NOT_FOUND", message: "Slot not found" } });
        }
        const body = updateParkingSlotSchema.parse(request.body);
        Object.assign(existing, body);
        return slotRepo.save(existing);
      });

      app.delete("/v1/parking/slots/:id", async (request, reply) => {
        const id = parseEntityId((request.params as { id: string }).id);
        const result = await slotRepo.delete({ id });
        if (!result.affected) {
          return reply.code(404).send({ error: { code: "NOT_FOUND", message: "Slot not found" } });
        }
        return reply.code(204).send();
      });

      app.post("/v1/parking/slots/:id/approve", async (request, reply) => {
        const id = parseEntityId((request.params as { id: string }).id);
        const slot = await slotRepo.findOne({ where: { id } });
        if (!slot) {
          return reply.code(404).send({ error: { code: "NOT_FOUND", message: "Slot not found" } });
        }
        slot.status = ListingStatus.APPROVED;
        return slotRepo.save(slot);
      });

      app.post("/v1/parking/slots/:id/reject", async (request, reply) => {
        const id = parseEntityId((request.params as { id: string }).id);
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

      app.get("/v1/parking/invoices", async (request) => {
        const query = paginationQuerySchema.parse(request.query);
        const raw = request.query as { renterUserId?: string; ownerUserId?: string };
        const userId = parseUserIdFromHeaders(request.headers as Record<string, unknown>);
        const roles = getRolesFromHeaders(request.headers as Record<string, unknown>);
        const isStaff = isParkingInvoiceStaff(roles);

        {
          const paidQb = bookingRepo
            .createQueryBuilder("b")
            .where("b.payment_status = :paid", { paid: PaymentStatus.PAID })
            .orderBy("b.created_at", "DESC")
            .take(50);
          if (raw.ownerUserId) {
            paidQb.andWhere("b.owner_user_id = :ownerUserId", { ownerUserId: raw.ownerUserId });
          }
          if (raw.renterUserId) {
            paidQb.andWhere("b.renter_user_id = :renterUserId", { renterUserId: raw.renterUserId });
          }
          if (userId && !isStaff && !raw.ownerUserId && !raw.renterUserId) {
            paidQb.andWhere("(b.renter_user_id = :selfId OR b.owner_user_id = :selfId)", {
              selfId: userId,
            });
          }
          const paidBookings = await paidQb.getMany();
          for (const paidBooking of paidBookings) {
            try {
              await ensureInvoiceForBooking(paidBooking);
            } catch {
              /* ignore backfill errors per booking */
            }
          }
        }

        const qb = invoiceRepo.createQueryBuilder("i").orderBy("i.created_at", "DESC");

        if (raw.renterUserId) {
          qb.andWhere("i.renter_user_id = :renterUserId", { renterUserId: raw.renterUserId });
        }
        if (raw.ownerUserId) {
          qb.andWhere("i.owner_user_id = :ownerUserId", { ownerUserId: raw.ownerUserId });
        }

        if (userId && !isStaff) {
          if (raw.ownerUserId && String(raw.ownerUserId) === String(userId)) {
            qb.andWhere("i.owner_user_id = :ownedOwnerId", { ownedOwnerId: userId });
          } else if (raw.renterUserId && String(raw.renterUserId) === String(userId)) {
            qb.andWhere("i.renter_user_id = :selfRenterId", { selfRenterId: userId });
          } else if (!raw.ownerUserId && !raw.renterUserId) {
            qb.andWhere("(i.renter_user_id = :selfId OR i.owner_user_id = :selfId)", {
              selfId: userId,
            });
          } else {
            qb.andWhere("1 = 0");
          }
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

      app.get("/v1/parking/invoices/:id", async (request, reply) => {
        const id = parseEntityId((request.params as { id: string }).id);
        const userId = parseUserIdFromHeaders(request.headers as Record<string, unknown>);
        const roles = getRolesFromHeaders(request.headers as Record<string, unknown>);
        const row = await invoiceRepo.findOne({ where: { id } });
        if (!row) {
          return reply.code(404).send({
            error: { code: "NOT_FOUND", message: "Invoice not found" },
          });
        }
        if (!(await userCanAccessInvoice(userId, roles, row))) {
          return reply.code(403).send({
            error: { code: "FORBIDDEN", message: "Not your invoice" },
          });
        }
        return buildInvoiceDetail(row);
      });

      app.get("/v1/parking/invoices/:id/download", async (request, reply) => {
        const id = parseEntityId((request.params as { id: string }).id);
        const userId = parseUserIdFromHeaders(request.headers as Record<string, unknown>);
        const roles = getRolesFromHeaders(request.headers as Record<string, unknown>);
        const row = await invoiceRepo.findOne({ where: { id } });
        if (!row) {
          return reply.code(404).send({
            error: { code: "NOT_FOUND", message: "Invoice not found" },
          });
        }
        if (!(await userCanAccessInvoice(userId, roles, row))) {
          return reply.code(403).send({
            error: { code: "FORBIDDEN", message: "Not your invoice" },
          });
        }

        const detail = await buildInvoiceDetail(row);
        const html = renderInvoiceHtml(detail);
        const filename = `${detail.invoiceNumber}.html`;
        return reply
          .header("Content-Type", "text/html; charset=utf-8")
          .header("Content-Disposition", `attachment; filename="${filename}"`)
          .send(html);
      });
    },
  });

  // Remind 5 minutes before check-out; awaiting check-in every 5 min; overdue every 5 min; expire unpaid
  setInterval(() => {
    void (async () => {
      const now = new Date();
      const inFive = new Date(now.getTime() + 5 * 60 * 1000);
      const fiveMinCutoff = new Date(now.getTime() - 5 * 60 * 1000);

      // Paid + confirmed, check-in window started, never checked in → remind customer every 5 minutes until end
      const awaitingCheckIn = await bookingRepo
        .createQueryBuilder("b")
        .where("b.status = :status", { status: BookingStatus.CONFIRMED })
        .andWhere("b.checked_in_at IS NULL")
        .andWhere("b.payment_status = :paid", { paid: "paid" })
        .andWhere("b.start_at <= :now", { now })
        .andWhere("b.end_at > :now", { now })
        .andWhere(
          "(b.last_check_in_reminder_at IS NULL OR b.last_check_in_reminder_at <= :cutoff)",
          { cutoff: fiveMinCutoff },
        )
        .getMany();

      for (const booking of awaitingCheckIn) {
        const customer = await userRepo.findOne({ where: { id: booking.renterUserId } });
        if (!customer) {
          booking.lastCheckInReminderAt = now;
          await bookingRepo.save(booking);
          continue;
        }
        const listing = booking.listingId
          ? await listingRepo.findOne({ where: { id: booking.listingId } })
          : null;
        const { slotLabel, addressBlock } = listingSummary(listing);
        const startLabel = new Date(booking.startAt).toLocaleString("en-IN", {
          timeZone: "Asia/Kolkata",
        });
        const endLabel = new Date(booking.endAt).toLocaleString("en-IN", {
          timeZone: "Asia/Kolkata",
        });
        const minsLeft = Math.max(
          1,
          Math.ceil((new Date(booking.endAt).getTime() - now.getTime()) / 60_000),
        );

        await notify(ds, {
          userId: customer.id,
          toEmail: customer.email,
          toPhone: customer.phone,
          title: "Check-in pending — please check in",
          body: [
            `Hello ${customer.name ?? "Customer"},`,
            "",
            "Your parking check-in time has started and you have not checked in yet.",
            "",
            `• Booking ID: ${booking.id}`,
            `• Parking: ${slotLabel}`,
            `• Address: ${addressBlock}`,
            `• Planned start: ${startLabel}`,
            `• Planned end: ${endLabel}`,
            `• Time left to check in: about ${minsLeft} min`,
            "",
            "Get the OTP from the owner and check in in the app.",
            "If you do not check in by the planned end time, the booking will be marked completed and payment will go to the owner.",
            "",
            "— Paashupatastra",
          ].join("\n"),
          referenceType: "parking_booking",
          referenceId: booking.id,
        });

        booking.lastCheckInReminderAt = now;
        await bookingRepo.save(booking);
      }

      // Checked-in sessions: remind 5 minutes before planned check-out
      const dueReminders = await bookingRepo
        .createQueryBuilder("b")
        .where("b.status = :status", { status: BookingStatus.CHECKED_IN })
        .andWhere("b.reminder_5_sent = false")
        .andWhere("b.end_at > :now", { now })
        .andWhere("b.end_at <= :inFive", { inFive })
        .getMany();

      for (const booking of dueReminders) {
        const customer = await userRepo.findOne({ where: { id: booking.renterUserId } });
        const owner = booking.ownerUserId
          ? await userRepo.findOne({ where: { id: booking.ownerUserId } })
          : null;
        const listing = booking.listingId
          ? await listingRepo.findOne({ where: { id: booking.listingId } })
          : null;
        const { slotLabel } = listingSummary(listing);
        const endLabel = new Date(booking.endAt).toLocaleString("en-IN", {
          timeZone: "Asia/Kolkata",
        });

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
              `• Booking ID: ${booking.id}`,
              `• Parking: ${slotLabel}`,
              `• Planned check-out: ${endLabel}`,
              "",
              "Please wrap up and complete check-out in the app.",
              "",
              "— Paashupatastra",
            ].join("\n"),
            referenceType: "parking_booking",
            referenceId: booking.id,
          });
        }
        if (owner) {
          await notify(ds, {
            userId: owner.id,
            toEmail: owner.email,
            toPhone: owner.phone,
            title: "Customer check-out due in 5 minutes",
            body: [
              `Hello ${owner.name ?? "Owner"},`,
              "",
              "A customer's planned check-out is in about 5 minutes.",
              `• Booking ID: ${booking.id}`,
              `• Parking: ${slotLabel}`,
              `• Customer: ${customer?.name ?? "—"} · ${customer?.phone ?? "—"}`,
              `• Planned check-out: ${endLabel}`,
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

      // Confirmed + never checked in + past planned end → auto-complete and settle to owner
      const noShowBookings = await bookingRepo
        .createQueryBuilder("b")
        .where("b.status = :status", { status: BookingStatus.CONFIRMED })
        .andWhere("b.checked_in_at IS NULL")
        .andWhere("b.end_at < :now", { now })
        .andWhere("b.payment_status = :paid", { paid: "paid" })
        .getMany();

      for (const booking of noShowBookings) {
        booking.status = BookingStatus.COMPLETED;
        booking.checkedOutAt = now;
        await bookingRepo.save(booking);

        let settlement: Awaited<ReturnType<typeof settlePayment>> | null = null;
        let settlementError: string | null = null;
        try {
          settlement = await settlePayment(booking.id);
        } catch (err) {
          settlementError = err instanceof Error ? err.message : "Settlement failed";
          // eslint-disable-next-line no-console
          console.error("no-show settlement failed", { err, bookingId: booking.id });
        }

        const customer = await userRepo.findOne({ where: { id: booking.renterUserId } });
        const owner = booking.ownerUserId
          ? await userRepo.findOne({ where: { id: booking.ownerUserId } })
          : null;
        const listing = booking.listingId
          ? await listingRepo.findOne({ where: { id: booking.listingId } })
          : null;
        const { slotLabel, addressBlock } = listingSummary(listing);
        const endLabel = new Date(booking.endAt).toLocaleString("en-IN", {
          timeZone: "Asia/Kolkata",
        });
        const startLabel = new Date(booking.startAt).toLocaleString("en-IN", {
          timeZone: "Asia/Kolkata",
        });
        const ownerShare = settlement?.ownerShareInPaise ?? 0;
        const platformFee = settlement?.platformFeeInPaise ?? booking.platformFeeInPaise ?? 0;
        const grossLabel = formatInr(booking.totalAmountInPaise || booking.amountInPaise);

        if (customer) {
          await notify(ds, {
            userId: customer.id,
            toEmail: customer.email,
            toPhone: customer.phone,
            title: "Booking completed — no check-in",
            body: [
              `Hello ${customer.name ?? "Customer"},`,
              "",
              "Your parking booking ended without check-in, so it was marked completed.",
              "",
              `• Booking ID: ${booking.id}`,
              `• Parking: ${slotLabel}`,
              `• Address: ${addressBlock}`,
              `• Planned start: ${startLabel}`,
              `• Planned end: ${endLabel}`,
              `• Amount paid: ${grossLabel}`,
              "",
              "Payment has been released to the parking owner as per booking rules.",
              "",
              "— Paashupatastra",
            ].join("\n"),
            referenceType: "parking_booking",
            referenceId: booking.id,
          });
        }

        if (owner) {
          await notify(ds, {
            userId: owner.id,
            toEmail: owner.email,
            toPhone: owner.phone,
            title: "Booking auto-completed — customer did not check in",
            body: [
              `Hello ${owner.name ?? "Owner"},`,
              "",
              "A customer paid but did not check in before the planned end time. The booking was marked completed.",
              "",
              `• Booking ID: ${booking.id}`,
              `• Parking: ${slotLabel}`,
              `• Address: ${addressBlock}`,
              `• Customer: ${customer?.name ?? "—"} · ${customer?.phone ?? "—"}`,
              `• Planned start: ${startLabel}`,
              `• Planned end: ${endLabel}`,
              `• Gross paid: ${grossLabel}`,
              `• Platform fee: ${formatInr(platformFee)}`,
              "",
              "— Paashupatastra",
            ].join("\n"),
            referenceType: "parking_booking",
            referenceId: booking.id,
          });

          if (settlement && !settlement.alreadySettled) {
            await notify(ds, {
              userId: owner.id,
              toEmail: owner.email,
              toPhone: owner.phone,
              title: `Wallet credited — ${formatInr(ownerShare)}`,
              body: [
                `Hello ${owner.name ?? "Owner"},`,
                "",
                "Your parking owner wallet has been credited after a no-show booking auto-completed.",
                "",
                `• Booking ID: ${booking.id}`,
                `• Parking: ${slotLabel}`,
                `• Gross paid: ${grossLabel}`,
                `• Platform fee deducted: ${formatInr(platformFee)}`,
                `• Amount added to wallet: ${formatInr(ownerShare)}`,
                settlement.ownerBalanceInPaise != null
                  ? `• New wallet balance: ${formatInr(settlement.ownerBalanceInPaise)}`
                  : null,
                "",
                "You can withdraw available balance from Owner wallet.",
                "",
                "— Paashupatastra",
              ]
                .filter((line) => line !== null)
                .join("\n"),
              referenceType: "parking_booking",
              referenceId: booking.id,
            });
          } else if (settlementError) {
            await notify(ds, {
              userId: owner.id,
              toEmail: owner.email,
              toPhone: owner.phone,
              title: "Wallet credit pending",
              body: [
                `Hello ${owner.name ?? "Owner"},`,
                "",
                "No-show booking was completed, but wallet credit could not be finished yet.",
                `• Booking ID: ${booking.id}`,
                `• Reason: ${settlementError}`,
                "",
                "We will retry settlement. Contact support if this persists.",
                "",
                "— Paashupatastra",
              ].join("\n"),
              referenceType: "parking_booking",
              referenceId: booking.id,
            });
          }
        }
      }

      // Past planned check-out after check-in → remind every 5 minutes until blocked
      const overdueBookings = await bookingRepo
        .createQueryBuilder("b")
        .where("b.status = :status", { status: BookingStatus.CHECKED_IN })
        .andWhere("b.end_at < :now", { now })
        .andWhere("b.overdue_accounts_blocked_at IS NULL")
        .andWhere(
          "(b.last_overdue_reminder_at IS NULL OR b.last_overdue_reminder_at <= :cutoff)",
          { cutoff: fiveMinCutoff },
        )
        .getMany();

      for (const booking of overdueBookings) {
        const customer = await userRepo.findOne({ where: { id: booking.renterUserId } });
        const owner = booking.ownerUserId
          ? await userRepo.findOne({ where: { id: booking.ownerUserId } })
          : null;
        const listing = booking.listingId
          ? await listingRepo.findOne({ where: { id: booking.listingId } })
          : null;
        const { slotLabel, addressBlock } = listingSummary(listing);
        const endLabel = new Date(booking.endAt).toLocaleString("en-IN", {
          timeZone: "Asia/Kolkata",
        });
        const overdueMins = Math.max(
          1,
          Math.floor((now.getTime() - new Date(booking.endAt).getTime()) / 60_000),
        );
        const overdueLabel =
          overdueMins >= 60
            ? `${Math.floor(overdueMins / 60)} hr ${overdueMins % 60} min`
            : `${overdueMins} min`;

        // After 1 hour overdue: deactivate customer + owner accounts
        if (overdueMins >= 60) {
          const blockReason = [
            "Account deactivated automatically: parking check-out overdue by more than 1 hour.",
            `Booking ID: ${booking.id}.`,
            `Parking: ${slotLabel}.`,
            `Planned check-out: ${endLabel}.`,
            `Overdue by: ${overdueLabel}.`,
            "Contact Parking Super Admin to reactivate your account.",
          ].join(" ");

          const deactivateUser = async (u: UserEntity, party: "customer" | "owner") => {
            if (!u.isActive && u.deactivationReason?.includes("check-out overdue")) {
              return;
            }
            u.isActive = false;
            u.deactivationReason = blockReason;
            u.deactivatedAt = now;
            u.deactivatedBy = "system:overdue_checkout";
            await userRepo.save(u);
            await notify(ds, {
              userId: u.id,
              toEmail: u.email,
              toPhone: u.phone,
              title: "Account deactivated — overdue check-out",
              body: [
                `Hello ${u.name ?? (party === "owner" ? "Owner" : "Customer")},`,
                "",
                "Your Paashupatastra parking account has been set to inactive.",
                "",
                `Reason: ${blockReason}`,
                "",
                party === "customer"
                  ? "You did not complete check-out within 1 hour after the planned end time."
                  : "A customer on your parking slot did not check out within 1 hour after the planned end time.",
                "",
                "Your parking account is marked inactive. You can still log in. Contact Parking Super Admin to clear this flag.",
                "",
                "— Paashupatastra",
              ].join("\n"),
              referenceType: "parking_booking",
              referenceId: booking.id,
            });
          };

          if (customer) await deactivateUser(customer, "customer");
          if (owner) await deactivateUser(owner, "owner");

          const admins = await userRepo
            .createQueryBuilder("u")
            .where("u.is_active = true")
            .andWhere(
              `(:sa = ANY(u.roles) OR :psa = ANY(u.roles))`,
              { sa: UserRole.SUPER_ADMIN, psa: UserRole.PARKING_SUPER_ADMIN },
            )
            .getMany();

          for (const admin of admins) {
            await notify(ds, {
              userId: admin.id,
              toEmail: admin.email,
              toPhone: admin.phone,
              title: `Accounts blocked — booking #${booking.id} overdue >1h`,
              body: [
                `Hello ${admin.name ?? "Admin"},`,
                "",
                "Customer and owner accounts were auto-deactivated after check-out overdue > 1 hour.",
                "",
                `• Booking ID: ${booking.id}`,
                `• Parking: ${slotLabel}`,
                `• Address: ${addressBlock}`,
                `• Customer: ${customer?.name ?? "—"} · ${customer?.phone ?? "—"} (id ${customer?.id ?? "—"})`,
                `• Owner: ${owner?.name ?? "—"} · ${owner?.phone ?? "—"} (id ${owner?.id ?? "—"})`,
                `• Planned check-out: ${endLabel}`,
                `• Overdue by: ${overdueLabel}`,
                "",
                "Reactivate accounts from Users & staff when the issue is resolved.",
                "",
                "— Paashupatastra",
              ].join("\n"),
              referenceType: "parking_booking",
              referenceId: booking.id,
            });
          }

          booking.overdueAccountsBlockedAt = now;
          booking.lastOverdueReminderAt = now;
          await bookingRepo.save(booking);
          continue;
        }

        if (customer) {
          await notify(ds, {
            userId: customer.id,
            toEmail: customer.email,
            toPhone: customer.phone,
            title: `Overdue check-out — ${overdueLabel} late`,
            body: [
              `Hello ${customer.name ?? "Customer"},`,
              "",
              "Your planned check-out time has passed and you have not checked out yet.",
              "",
              `• Booking ID: ${booking.id}`,
              `• Parking: ${slotLabel}`,
              `• Address: ${addressBlock}`,
              `• Planned check-out: ${endLabel}`,
              `• Overdue by: ${overdueLabel}`,
              "",
              "Please open My bookings and complete check-out now.",
              "If you exceed 1 hour overdue, both your account and the owner's account will be deactivated.",
              "",
              "— Paashupatastra",
            ].join("\n"),
            referenceType: "parking_booking",
            referenceId: booking.id,
          });
        }

        if (owner) {
          await notify(ds, {
            userId: owner.id,
            toEmail: owner.email,
            toPhone: owner.phone,
            title: `Customer overdue — ${overdueLabel} past check-out`,
            body: [
              `Hello ${owner.name ?? "Owner"},`,
              "",
              "A customer has not checked out after their planned end time.",
              "",
              `• Booking ID: ${booking.id}`,
              `• Parking: ${slotLabel}`,
              `• Address: ${addressBlock}`,
              `• Customer: ${customer?.name ?? "—"} · ${customer?.phone ?? "—"}`,
              `• Vehicle: ${
                [booking.vehicleType?.replaceAll("_", " "), booking.vehicleNumber]
                  .filter(Boolean)
                  .join(" · ") || "—"
              }`,
              `• Planned check-out: ${endLabel}`,
              `• Overdue by: ${overdueLabel}`,
              "",
              "Ask the customer to check out. If overdue exceeds 1 hour, both accounts will be deactivated automatically.",
              "",
              "— Paashupatastra",
            ].join("\n"),
            referenceType: "parking_booking",
            referenceId: booking.id,
          });
        }

        booking.lastOverdueReminderAt = now;
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
