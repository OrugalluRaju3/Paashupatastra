import "reflect-metadata";
import {
  NotificationLogEntity,
  SevaBookingEntity,
  SevaBookingMessageEntity,
  SevaInvoiceEntity,
  SevaOfferingEntity,
  SevaPlatformFeeSettingEntity,
  SevaProviderEntity,
  SevaWorkerEntity,
  UserEntity,
  getDataSource,
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
  PaymentStatus,
  SevaBookingStatus,
  UserRole,
  assignSevaWorkerSchema,
  confirmSevaPaymentSchema,
  createSevaBookingSchema,
  createSevaOfferingSchema,
  createSevaPlatformFeeSchema,
  createSevaProviderSchema,
  createSevaWorkerSchema,
  decideSevaBookingSchema,
  paginationQuerySchema,
  searchSevaOfferingsSchema,
  sevaBookingChatMessageSchema,
  updateSevaBookingStatusSchema,
  updateSevaOfferingSchema,
  updateSevaPlatformFeeSchema,
  updateSevaProviderOnlineSchema,
} from "@paashupatastra/shared-models";
import { In } from "typeorm";
import { z } from "zod";

const DEFAULT_PLATFORM_FEE_BPS = 1000; // 10% fallback when no active setting

const verifySevaOtpBodySchema = z.object({
  otp: z.string().min(4).max(8),
});

function notificationsBaseUrl() {
  return (process.env.NOTIFICATIONS_URL ?? "http://localhost:3006").replace(/\/$/, "");
}

function paymentsBaseUrl() {
  return (process.env.PAYMENTS_URL ?? "http://localhost:3005").replace(/\/$/, "");
}

function formatInr(paise: number) {
  return `₹${(paise / 100).toFixed(2)}`;
}

function makeServiceOtp() {
  return String(Math.floor(1000 + Math.random() * 9000));
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

function normalizePhone(phone: string | null | undefined) {
  const digits = String(phone ?? "").replace(/\D/g, "");
  return digits.length > 10 ? digits.slice(-10) : digits;
}

/** After provider accept, customer must pay within this window or the worker is released. */
const PAYMENT_WINDOW_MS = 10 * 60 * 1000;

function paymentDueAtFrom(from = new Date()) {
  return new Date(from.getTime() + PAYMENT_WINDOW_MS);
}

function resolvePaymentDueAt(row: SevaBookingEntity) {
  if (row.paymentDueAt) return new Date(row.paymentDueAt);
  return null;
}

function serializeProvider(row: SevaProviderEntity) {
  return {
    id: row.id,
    userId: row.userId,
    fullName: row.fullName,
    email: row.email,
    alternateMobile: row.alternateMobile,
    address: row.address,
    city: row.city,
    state: row.state,
    country: row.country,
    pinCode: row.pinCode,
    latitude: row.latitude,
    longitude: row.longitude,
    serviceRadiusKm: row.serviceRadiusKm,
    isOnline: row.isOnline,
    isApproved: row.isApproved,
    proofUrl: row.proofUrl,
    isActive: row.isActive,
    createdAt: toIsoRequired(row.createdAt),
    updatedAt: toIsoRequired(row.updatedAt),
  };
}

function serializeWorker(row: SevaWorkerEntity) {
  return {
    id: row.id,
    providerId: row.providerId,
    userId: row.userId,
    fullName: row.fullName,
    mobile: row.mobile,
    email: row.email,
    skills: row.skills,
    isAvailable: row.isAvailable,
    isActive: row.isActive,
    createdAt: toIsoRequired(row.createdAt),
    updatedAt: toIsoRequired(row.updatedAt),
  };
}

function serializeOffering(row: SevaOfferingEntity) {
  return {
    id: row.id,
    providerId: row.providerId,
    category: row.category,
    title: row.title,
    description: row.description,
    durationMinutes: row.durationMinutes,
    amountInPaise: row.amountInPaise,
    isActive: row.isActive,
    createdAt: toIsoRequired(row.createdAt),
    updatedAt: toIsoRequired(row.updatedAt),
  };
}

function serializePlatformFee(row: SevaPlatformFeeSettingEntity) {
  return {
    id: row.id,
    feeType: row.feeType,
    percentageBps: row.percentageBps,
    flatFeeInPaise: row.flatFeeInPaise,
    isActive: row.isActive,
    createdAt: toIsoRequired(row.createdAt),
    updatedAt: toIsoRequired(row.updatedAt),
  };
}

function serializeBooking(row: SevaBookingEntity) {
  const dueAt = resolvePaymentDueAt(row);
  const paymentSecondsRemaining =
    row.paymentStatus === PaymentStatus.PAID || !dueAt
      ? null
      : Math.max(0, Math.floor((dueAt.getTime() - Date.now()) / 1000));
  const base = {
    id: row.id,
    customerUserId: row.customerUserId,
    providerId: row.providerId,
    offeringId: row.offeringId,
    workerId: row.workerId,
    category: row.category,
    title: row.title,
    serviceAddress: row.serviceAddress,
    latitude: row.latitude,
    longitude: row.longitude,
    scheduledAt: toIsoRequired(row.scheduledAt),
    notes: row.notes,
    amountInPaise: row.amountInPaise,
    platformFeeInPaise: row.platformFeeInPaise,
    taxInPaise: row.taxInPaise,
    totalAmountInPaise: row.totalAmountInPaise,
    paymentStatus: row.paymentStatus,
    paymentProvider: row.paymentProvider,
    paymentProviderOrderId: row.paymentProviderOrderId,
    status: row.status,
    otpVerified: row.otpVerified,
    workerName: row.workerName,
    workerMobile: row.workerMobile,
    paymentDueAt: dueAt ? toIsoRequired(dueAt) : null,
    paymentSecondsRemaining,
    createdAt: toIsoRequired(row.createdAt),
    updatedAt: toIsoRequired(row.updatedAt),
  };
  if (row.paymentStatus === PaymentStatus.PAID) {
    return { ...base, serviceOtp: row.serviceOtp };
  }
  return base;
}

function serializeInvoice(row: SevaInvoiceEntity) {
  return {
    id: row.id,
    invoiceNumber: `INV-SV-${row.id}`,
    bookingId: row.bookingId,
    customerUserId: row.customerUserId,
    providerId: row.providerId,
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

async function notify(
  ds: Awaited<ReturnType<typeof getDataSource>>,
  input: {
    userId?: number | null;
    audience: "customer" | "provider" | "worker" | "admin";
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
        module: "seva",
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

function formatBookingStatusLabel(status: string) {
  return status.replaceAll("_", " ");
}

function customerStatusUpdateCopy(status: string): { title: string; detail: string } {
  switch (status) {
    case SevaBookingStatus.ACCEPTED:
      return {
        title: "Seva booking accepted — pay within 10 minutes",
        detail:
          "Your provider accepted the request. Complete payment within 10 minutes or the worker will be released and this booking cancelled.",
      };
    case SevaBookingStatus.SCHEDULED:
      return {
        title: "Service scheduled",
        detail: "Payment received. Your housekeeping / maintenance visit is scheduled.",
      };
    case SevaBookingStatus.ON_THE_WAY:
      return {
        title: "Worker is on the way",
        detail: "Your assigned worker is heading to the service address.",
      };
    case SevaBookingStatus.IN_PROGRESS:
      return {
        title: "Service in progress",
        detail: "OTP verified — work has started at your location.",
      };
    case SevaBookingStatus.COMPLETED:
      return {
        title: "Service completed",
        detail: "Your Seva booking is complete. Thank you!",
      };
    case SevaBookingStatus.CANCELLED:
      return {
        title: "Booking cancelled",
        detail: "Your Seva booking has been cancelled.",
      };
    case SevaBookingStatus.REJECTED:
      return {
        title: "Booking rejected",
        detail: "The provider could not take this request. Please search again.",
      };
    default:
      return {
        title: `Seva update: ${formatBookingStatusLabel(status)}`,
        detail: `Your booking status is now ${formatBookingStatusLabel(status)}.`,
      };
  }
}

async function notifySevaAdmins(
  ds: Awaited<ReturnType<typeof getDataSource>>,
  input: {
    title: string;
    body: string;
    referenceType?: string;
    referenceId?: number;
  },
) {
  const admins = await ds.getRepository(UserEntity).find({
    where: { isActive: true },
  });
  const targets = admins.filter((u) => (u.roles ?? []).includes(UserRole.SEVA_SUPER_ADMIN));
  await Promise.all(
    targets.map((admin) =>
      notify(ds, {
        userId: admin.id,
        audience: "admin",
        toEmail: admin.email,
        toPhone: admin.phone,
        title: input.title,
        body: input.body,
        referenceType: input.referenceType,
        referenceId: input.referenceId,
      }),
    ),
  );
}

async function notifyCustomerBookingStatus(
  ds: Awaited<ReturnType<typeof getDataSource>>,
  booking: SevaBookingEntity,
  previousStatus: string | null,
) {
  if (previousStatus != null && previousStatus === booking.status) return;
  const customer = await ds.getRepository(UserEntity).findOne({
    where: { id: booking.customerUserId },
  });
  if (!customer) return;
  const copy = customerStatusUpdateCopy(booking.status);
  await notify(ds, {
    userId: customer.id,
    audience: "customer",
    toEmail: customer.email,
    toPhone: customer.phone,
    title: copy.title,
    body: [
      `Hello ${customer.name ?? "Customer"},`,
      "",
      copy.detail,
      `Booking #${booking.id} · ${booking.title}`,
      `Address: ${booking.serviceAddress}`,
      booking.workerName ? `Worker: ${booking.workerName}` : null,
      booking.status === SevaBookingStatus.ACCEPTED
        ? "Open My Seva bookings now and tap Pay. The payment popup includes a 10-minute timer."
        : "Open My Seva bookings for details.",
    ]
      .filter(Boolean)
      .join("\n"),
    referenceType: "seva_booking",
    referenceId: booking.id,
  });
}

async function collectSevaPaymentToPlatform(bookingId: number) {
  const res = await fetch(`${paymentsBaseUrl()}/v1/payments/seva-bookings/${bookingId}/collect`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
    throw new Error(data?.error?.message ?? `Collect failed (${res.status})`);
  }
  return res.json();
}

async function settleSevaPaymentToProvider(bookingId: number) {
  const res = await fetch(`${paymentsBaseUrl()}/v1/payments/seva-bookings/${bookingId}/settle`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
    throw new Error(data?.error?.message ?? `Settle failed (${res.status})`);
  }
  return res.json() as Promise<{
    alreadySettled?: boolean;
    providerShareInPaise?: number;
    platformFeeInPaise?: number;
  }>;
}

async function main() {
  loadEnv();
  const ds = await getDataSource();
  const providerRepo = ds.getRepository(SevaProviderEntity);
  const workerRepo = ds.getRepository(SevaWorkerEntity);
  const offeringRepo = ds.getRepository(SevaOfferingEntity);
  const bookingRepo = ds.getRepository(SevaBookingEntity);
  const invoiceRepo = ds.getRepository(SevaInvoiceEntity);
  const messageRepo = ds.getRepository(SevaBookingMessageEntity);
  const platformFeeRepo = ds.getRepository(SevaPlatformFeeSettingEntity);
  const userRepo = ds.getRepository(UserEntity);

  async function computePlatformFeeInPaise(amountInPaise: number) {
    const setting = await platformFeeRepo.findOne({
      where: { isActive: true },
      order: { createdAt: "DESC" },
    });
    if (!setting) {
      return Math.round((amountInPaise * DEFAULT_PLATFORM_FEE_BPS) / 10000);
    }
    let fee = 0;
    if (setting.feeType === "percentage" || setting.feeType === "both") {
      fee += Math.round((amountInPaise * setting.percentageBps) / 10000);
    }
    if (setting.feeType === "flat" || setting.feeType === "both") {
      fee += setting.flatFeeInPaise;
    }
    return fee;
  }

  async function activePlatformFeeBps() {
    const setting = await platformFeeRepo.findOne({
      where: { isActive: true },
      order: { createdAt: "DESC" },
    });
    if (!setting) return DEFAULT_PLATFORM_FEE_BPS;
    if (setting.feeType === "flat") return 0;
    return setting.percentageBps;
  }

  async function ensureWorkerUser(input: {
    mobile: string;
    name?: string | null;
    email?: string | null;
  }) {
    const phone = normalizePhone(input.mobile);
    if (phone.length !== 10) return null;
    let user = await userRepo.findOne({ where: { phone } });
    if (!user) {
      return userRepo.save(
        userRepo.create({
          phone,
          name: input.name?.trim() || null,
          email: input.email?.trim() || null,
          roles: [UserRole.SEVA_WORKER],
          isActive: true,
        }),
      );
    }
    const roles = new Set(user.roles);
    roles.add(UserRole.SEVA_WORKER);
    user.roles = [...roles];
    if (!user.name && input.name?.trim()) user.name = input.name.trim();
    if (!user.email && input.email?.trim()) user.email = input.email.trim();
    return userRepo.save(user);
  }

  async function providerForUser(userId: number) {
    return providerRepo.findOne({ where: { userId, isActive: true } });
  }

  async function ensureInvoiceForBooking(booking: SevaBookingEntity) {
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
        customerUserId: booking.customerUserId,
        providerId: booking.providerId,
        amountInPaise: amount,
        status: PaymentStatus.PAID,
      }),
    );
  }

  async function userCanAccessInvoice(
    userId: number | null,
    roles: string[],
    invoice: SevaInvoiceEntity,
  ) {
    if (!userId) return false;
    if (roles.includes(UserRole.SEVA_SUPER_ADMIN)) return true;
    if (invoice.customerUserId === userId) return true;
    const provider = await providerRepo.findOne({ where: { id: invoice.providerId } });
    return provider?.userId === userId;
  }

  async function buildInvoiceDetail(invoice: SevaInvoiceEntity) {
    const booking = await bookingRepo.findOne({ where: { id: invoice.bookingId } });
    const customer = await userRepo.findOne({ where: { id: invoice.customerUserId } });
    const provider = await providerRepo.findOne({ where: { id: invoice.providerId } });

    return {
      ...serializeInvoice(invoice),
      booking: booking
        ? {
            id: booking.id,
            category: booking.category,
            title: booking.title,
            serviceAddress: booking.serviceAddress,
            scheduledAt: toIsoRequired(booking.scheduledAt),
            notes: booking.notes,
            amountInPaise: booking.amountInPaise,
            platformFeeInPaise: booking.platformFeeInPaise,
            taxInPaise: booking.taxInPaise,
            totalAmountInPaise: booking.totalAmountInPaise || booking.amountInPaise,
            paymentStatus: booking.paymentStatus,
            paymentProviderOrderId: booking.paymentProviderOrderId,
            status: booking.status,
            workerName: booking.workerName,
            workerMobile: booking.workerMobile,
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
      provider: provider
        ? {
            id: provider.id,
            fullName: provider.fullName,
            phone: provider.alternateMobile,
            email: provider.email,
            address: provider.address,
            city: provider.city,
            state: provider.state,
          }
        : null,
    };
  }

  function renderInvoiceHtml(detail: Awaited<ReturnType<typeof buildInvoiceDetail>>) {
    const booking = detail.booking;
    const issued = new Date(detail.createdAt).toLocaleString("en-IN");
    const worker = booking?.workerName
      ? `${booking.workerName}${booking.workerMobile ? ` · ${booking.workerMobile}` : ""}`
      : "—";
    const rows = [
      ["Service", booking?.title ?? "—"],
      ["Category", booking?.category?.replaceAll("_", " ") ?? "—"],
      ["Address", booking?.serviceAddress ?? "—"],
      ["Scheduled", booking ? new Date(booking.scheduledAt).toLocaleString("en-IN") : "—"],
      ["Worker", worker],
      ["Base amount", formatInr(booking?.amountInPaise ?? detail.amountInPaise)],
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
    <p class="muted">Seva invoice</p>
    <p><strong>${escapeHtml(detail.invoiceNumber)}</strong><br/>Issued ${escapeHtml(issued)}<br/>Booking #${escapeHtml(String(detail.bookingId))}</p>
    <div class="grid">
      <div class="box">
        <div class="muted">Billed to (customer)</div>
        <strong>${escapeHtml(detail.customer?.name ?? "Customer")}</strong><br/>
        ${escapeHtml(detail.customer?.phone ?? "—")}<br/>
        ${escapeHtml(detail.customer?.email ?? "")}
      </div>
      <div class="box">
        <div class="muted">Provider</div>
        <strong>${escapeHtml(detail.provider?.fullName ?? "Provider")}</strong><br/>
        ${escapeHtml(detail.provider?.phone ?? "—")}<br/>
        ${escapeHtml([detail.provider?.address, detail.provider?.city, detail.provider?.state].filter(Boolean).join(", "))}
      </div>
    </div>
    <table style="width:100%;border-collapse:collapse">${tableRows}</table>
    <p class="total">Amount paid: ${escapeHtml(formatInr(detail.amountInPaise))}</p>
    <p class="muted">This is a computer-generated invoice for your Seva booking.</p>
  </div>
</body>
</html>`;
  }

  async function setWorkerAvailable(workerId: number | null | undefined, isAvailable: boolean) {
    if (!workerId) return;
    const worker = await workerRepo.findOne({ where: { id: workerId } });
    if (!worker) return;
    worker.isAvailable = isAvailable;
    await workerRepo.save(worker);
  }

  async function releaseExpiredUnpaidBookings(log?: { info: (obj: object, msg: string) => void; error: (obj: object, msg: string) => void }) {
    const candidates = await bookingRepo.find({
      where: {
        paymentStatus: PaymentStatus.PENDING,
        status: SevaBookingStatus.ACCEPTED,
      },
      take: 100,
      order: { createdAt: "ASC" },
    });

    const now = Date.now();
    let released = 0;

    for (const booking of candidates) {
      const dueAt = resolvePaymentDueAt(booking);
      if (!dueAt || dueAt.getTime() > now) continue;

      const workerId = booking.workerId;
      booking.status = SevaBookingStatus.CANCELLED;
      booking.paymentStatus = PaymentStatus.FAILED;
      if (!booking.paymentDueAt) booking.paymentDueAt = dueAt;
      await bookingRepo.save(booking);
      await setWorkerAvailable(workerId, true);

      const customer = await userRepo.findOne({ where: { id: booking.customerUserId } });
      const provider = await providerRepo.findOne({ where: { id: booking.providerId } });
      const providerUser = provider ? await userRepo.findOne({ where: { id: provider.userId } }) : null;
      const worker = workerId ? await workerRepo.findOne({ where: { id: workerId } }) : null;

      const detail = [
        `Booking #${booking.id} · ${booking.title}`,
        `Amount: ${formatInr(booking.totalAmountInPaise || booking.amountInPaise)}`,
        `Address: ${booking.serviceAddress}`,
        "",
        "Payment was not completed within 10 minutes, so the worker was released.",
      ].join("\n");

      const jobs: Array<Promise<unknown>> = [];
      if (customer) {
        jobs.push(
          notify(ds, {
            userId: customer.id,
            audience: "customer",
            toEmail: customer.email,
            toPhone: customer.phone,
            title: "Payment window expired — booking cancelled",
            body: [
              `Hello ${customer.name ?? "Customer"},`,
              "",
              detail,
              "",
              "Please search again if you still need this service.",
            ].join("\n"),
            referenceType: "seva_booking",
            referenceId: booking.id,
          }),
        );
      }
      if (provider && providerUser) {
        jobs.push(
          notify(ds, {
            userId: providerUser.id,
            audience: "provider",
            toEmail: provider.email ?? providerUser.email,
            toPhone: provider.alternateMobile ?? providerUser.phone,
            title: "Worker released — customer payment timed out",
            body: [
              `Hello ${provider.fullName},`,
              "",
              detail,
              "",
              "The worker is available again for new requests.",
            ].join("\n"),
            referenceType: "seva_booking",
            referenceId: booking.id,
          }),
        );
      }
      if (worker?.userId) {
        jobs.push(
          notify(ds, {
            userId: worker.userId,
            audience: "worker",
            toEmail: worker.email,
            toPhone: worker.mobile,
            title: "Job cancelled — payment timed out",
            body: [
              `Hello ${worker.fullName},`,
              "",
              detail,
              "",
              "This assignment is cancelled. Wait for the next job.",
            ].join("\n"),
            referenceType: "seva_booking",
            referenceId: booking.id,
          }),
        );
      }
      await Promise.allSettled(jobs);
      released += 1;
    }

    if (released > 0) {
      log?.info({ released }, "Released Seva workers after unpaid payment timeout");
    }
    return released;
  }

  await createService({
    name: "seva",
    port: envInt("SEVA_PORT", 3009),
    afterReady: async (app) => {
      await ds.query(`
        CREATE TABLE IF NOT EXISTS seva_booking_messages (
          id SERIAL PRIMARY KEY,
          booking_id INT NOT NULL,
          sender_user_id INT NOT NULL,
          body TEXT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await ds.query(`
        CREATE INDEX IF NOT EXISTS idx_seva_booking_messages_booking_id
        ON seva_booking_messages (booking_id)
      `);
      await ds.query(`
        ALTER TABLE seva_bookings
        ADD COLUMN IF NOT EXISTS payment_due_at TIMESTAMPTZ
      `);
      const paymentWatch = setInterval(() => {
        void releaseExpiredUnpaidBookings(app.log).catch((err) => {
          app.log.error({ err }, "Failed to release unpaid Seva bookings");
        });
      }, 30_000);
      paymentWatch.unref?.();
      void releaseExpiredUnpaidBookings(app.log);
    },
    registerRoutes: async (app) => {
      app.get("/v1/seva/stats", async () => {
        const [providers, workers, offerings, bookingsActive, bookingsCompleted] = await Promise.all([
          providerRepo.count({ where: { isActive: true } }),
          workerRepo.count({ where: { isActive: true } }),
          offeringRepo.count({ where: { isActive: true } }),
          bookingRepo.count({
            where: {
              status: In([
                SevaBookingStatus.REQUESTED,
                SevaBookingStatus.ACCEPTED,
                SevaBookingStatus.SCHEDULED,
                SevaBookingStatus.ON_THE_WAY,
                SevaBookingStatus.IN_PROGRESS,
              ]),
            },
          }),
          bookingRepo.count({ where: { status: SevaBookingStatus.COMPLETED } }),
        ]);
        return { providers, workers, offerings, bookingsActive, bookingsCompleted };
      });

      app.get("/v1/seva/reports/summary", async () => {
        const [
          providers,
          workers,
          offerings,
          bookingsRequested,
          bookingsActive,
          bookingsCompleted,
          bookingsCancelled,
          revenuePaidResult,
          revenuePendingResult,
          invoicesCount,
          invoicesPaidCount,
        ] = await Promise.all([
          providerRepo.count(),
          workerRepo.count(),
          offeringRepo.count(),
          bookingRepo.count({ where: { status: SevaBookingStatus.REQUESTED } }),
          bookingRepo.count({
            where: {
              status: In([
                SevaBookingStatus.ACCEPTED,
                SevaBookingStatus.SCHEDULED,
                SevaBookingStatus.ON_THE_WAY,
                SevaBookingStatus.IN_PROGRESS,
              ]),
            },
          }),
          bookingRepo.count({ where: { status: SevaBookingStatus.COMPLETED } }),
          bookingRepo.count({
            where: {
              status: In([SevaBookingStatus.CANCELLED, SevaBookingStatus.REJECTED]),
            },
          }),
          bookingRepo
            .createQueryBuilder("b")
            .select("COALESCE(SUM(b.total_amount_in_paise), 0)", "sum")
            .where("b.payment_status = :paid", { paid: PaymentStatus.PAID })
            .getRawOne<{ sum: string }>(),
          bookingRepo
            .createQueryBuilder("b")
            .select("COALESCE(SUM(b.total_amount_in_paise), 0)", "sum")
            .where("b.payment_status = :pending", { pending: PaymentStatus.PENDING })
            .andWhere("b.status NOT IN (:...closed)", {
              closed: [
                SevaBookingStatus.CANCELLED,
                SevaBookingStatus.REJECTED,
                SevaBookingStatus.COMPLETED,
              ],
            })
            .getRawOne<{ sum: string }>(),
          invoiceRepo.count(),
          invoiceRepo.count({ where: { status: PaymentStatus.PAID } }),
        ]);

        return {
          providers,
          workers,
          offerings,
          bookingsRequested,
          bookingsActive,
          bookingsCompleted,
          bookingsCancelled,
          revenuePaidInPaise: Number(revenuePaidResult?.sum ?? 0),
          revenuePendingInPaise: Number(revenuePendingResult?.sum ?? 0),
          invoicesCount,
          invoicesPaidCount,
          platformFeeBps: await activePlatformFeeBps(),
        };
      });

      app.get("/v1/seva/reports/customers", async (request) => {
        const query = paginationQuerySchema.parse(request.query);

        // Only customers who have placed at least one Seva booking (not parking/tanker users).
        const statsQb = bookingRepo
          .createQueryBuilder("b")
          .innerJoin(UserEntity, "u", "u.id = b.customer_user_id")
          .select("b.customer_user_id", "customerUserId")
          .addSelect("COUNT(*)", "bookingsCount")
          .addSelect("MAX(b.created_at)", "lastBookingAt")
          .addSelect(
            `COALESCE(SUM(CASE WHEN b.payment_status = :paid THEN b.total_amount_in_paise ELSE 0 END), 0)`,
            "totalPaidInPaise",
          )
          .setParameter("paid", PaymentStatus.PAID)
          .groupBy("b.customer_user_id")
          .orderBy("MAX(b.created_at)", "DESC");

        if (query.q) {
          statsQb.andWhere(
            `(u.phone ILIKE :q OR COALESCE(u.name,'') ILIKE :q OR COALESCE(u.email,'') ILIKE :q)`,
            { q: `%${query.q}%` },
          );
        }

        const totalRows = await bookingRepo
          .createQueryBuilder("b")
          .innerJoin(UserEntity, "u", "u.id = b.customer_user_id")
          .select("COUNT(DISTINCT b.customer_user_id)", "cnt")
          .where(
            query.q
              ? `(u.phone ILIKE :q OR COALESCE(u.name,'') ILIKE :q OR COALESCE(u.email,'') ILIKE :q)`
              : "1=1",
            query.q ? { q: `%${query.q}%` } : {},
          )
          .getRawOne<{ cnt: string }>();
        const total = Number(totalRows?.cnt ?? 0);

        const statsRows = await statsQb
          .offset((query.page - 1) * query.limit)
          .limit(query.limit)
          .getRawMany();

        const ids = statsRows.map((row) => Number(row.customerUserId)).filter((id) => id > 0);
        const users = ids.length
          ? await userRepo.find({ where: { id: In(ids) } })
          : [];
        const userById = new Map(users.map((u) => [u.id, u]));

        return {
          items: statsRows.map((row) => {
            const id = Number(row.customerUserId);
            const u = userById.get(id);
            return {
              customerUserId: id,
              name: u?.name ?? null,
              phone: u?.phone ?? "",
              email: u?.email ?? null,
              isActive: u?.isActive ?? false,
              city: u?.city ?? null,
              createdAt: u ? toIsoRequired(u.createdAt) : null,
              bookingsCount: Number(row.bookingsCount),
              lastBookingAt: row.lastBookingAt
                ? toIsoRequired(new Date(row.lastBookingAt as string))
                : null,
              totalPaidInPaise: Number(row.totalPaidInPaise),
            };
          }),
          page: query.page,
          limit: query.limit,
          total,
          totalPages: Math.max(1, Math.ceil(total / query.limit)),
        };
      });

      app.patch("/v1/seva/providers/:id", async (request, reply) => {
        const roles = getRolesFromHeaders(request.headers as Record<string, unknown>);
        if (!roles.includes(UserRole.SEVA_SUPER_ADMIN)) {
          return reply.code(403).send({ error: { code: "FORBIDDEN", message: "Seva admin required" } });
        }
        const id = parseEntityId((request.params as { id: string }).id);
        const body = z
          .object({
            isApproved: z.boolean().optional(),
            isActive: z.boolean().optional(),
            isOnline: z.boolean().optional(),
          })
          .parse(request.body);
        const provider = await providerRepo.findOne({ where: { id } });
        if (!provider) {
          return reply.code(404).send({ error: { code: "NOT_FOUND", message: "Provider not found" } });
        }
        if (body.isApproved != null) provider.isApproved = body.isApproved;
        if (body.isActive != null) provider.isActive = body.isActive;
        if (body.isOnline != null) provider.isOnline = body.isOnline;
        const saved = await providerRepo.save(provider);
        const providerUser = await userRepo.findOne({ where: { id: provider.userId } });
        if (providerUser) {
          const approvedChanged = body.isApproved != null;
          const activeChanged = body.isActive != null;
          if (approvedChanged || activeChanged) {
            void notify(ds, {
              userId: providerUser.id,
              audience: "provider",
              toEmail: provider.email ?? providerUser.email,
              toPhone: provider.alternateMobile ?? providerUser.phone,
              title: approvedChanged
                ? body.isApproved
                  ? "Provider profile approved"
                  : "Provider approval revoked"
                : body.isActive
                  ? "Provider profile activated"
                  : "Provider profile deactivated",
              body: [
                `Hello ${provider.fullName},`,
                "",
                approvedChanged
                  ? body.isApproved
                    ? "Seva staff approved your provider profile. You can go online and receive bookings."
                    : "Seva staff revoked approval on your provider profile."
                  : body.isActive
                    ? "Your Seva provider profile is active again."
                    : "Your Seva provider profile was deactivated by staff.",
              ].join("\n"),
              referenceType: "seva_provider",
              referenceId: saved.id,
            });
          }
        }
        return serializeProvider(saved);
      });

      app.get("/v1/seva/categories", async () => ({
        items: [
          { id: "housekeeping_regular", label: "Regular housekeeping" },
          { id: "housekeeping_deep", label: "Deep cleaning" },
          { id: "kitchen_bathroom", label: "Kitchen & bathroom" },
          { id: "electrical_minor", label: "Minor electrical" },
          { id: "plumbing_minor", label: "Minor plumbing" },
          { id: "ac_service", label: "AC basic service" },
        ],
      }));

      app.post("/v1/seva/providers/register", async (request, reply) => {
        const userId = parseUserIdFromHeaders(request.headers as Record<string, unknown>);
        if (!userId) {
          return reply.code(401).send({ error: { code: "UNAUTHORIZED", message: "Login required" } });
        }
        const body = createSevaProviderSchema.parse(request.body);
        const existing = await providerRepo.findOne({ where: { userId } });
        if (existing) {
          return reply.code(409).send({
            error: { code: "EXISTS", message: "Provider profile already exists" },
          });
        }
        const user = await userRepo.findOne({ where: { id: userId } });
        if (!user) {
          return reply.code(404).send({ error: { code: "NOT_FOUND", message: "User not found" } });
        }
        const roles = new Set(user.roles);
        roles.add(UserRole.SEVA_PROVIDER);
        user.roles = [...roles];
        if (!user.name) user.name = body.fullName;
        if (!user.email && body.email) user.email = body.email;
        await userRepo.save(user);

        const saved = await providerRepo.save(
          providerRepo.create({
            userId,
            fullName: body.fullName,
            email: body.email ?? null,
            alternateMobile: body.alternateMobile ?? null,
            address: body.address,
            city: body.city,
            state: body.state,
            country: body.country ?? "IN",
            pinCode: body.pinCode,
            latitude: body.latitude ?? null,
            longitude: body.longitude ?? null,
            serviceRadiusKm: body.serviceRadiusKm ?? 10,
            proofUrl: body.proofUrl ?? null,
            isOnline: false,
            isApproved: true,
            isActive: true,
          }),
        );

        void notify(ds, {
          userId: user.id,
          audience: "provider",
          toEmail: saved.email ?? user.email,
          toPhone: saved.alternateMobile ?? user.phone,
          title: "Seva provider profile created",
          body: [
            `Hello ${saved.fullName},`,
            "",
            "Your housekeeping & maintenance provider profile is ready.",
            "Go online, add offerings and workers, then start receiving booking requests.",
          ].join("\n"),
          referenceType: "seva_provider",
          referenceId: saved.id,
        });
        void notifySevaAdmins(ds, {
          title: "New Seva provider registered",
          body: [
            `${saved.fullName} registered as a Seva provider.`,
            `City: ${saved.city}, ${saved.state} · PIN ${saved.pinCode}`,
            `Email: ${saved.email ?? user.email ?? "—"}`,
            "",
            "Open Seva staff → Providers to review.",
          ].join("\n"),
          referenceType: "seva_provider",
          referenceId: saved.id,
        });

        return serializeProvider(saved);
      });

      app.get("/v1/seva/providers/me", async (request, reply) => {
        const userId = parseUserIdFromHeaders(request.headers as Record<string, unknown>);
        if (!userId) {
          return reply.code(401).send({ error: { code: "UNAUTHORIZED", message: "Login required" } });
        }
        const provider = await providerForUser(userId);
        if (!provider) {
          return reply.code(404).send({ error: { code: "NOT_FOUND", message: "Provider profile not found" } });
        }
        return serializeProvider(provider);
      });

      app.patch("/v1/seva/providers/me/online", async (request, reply) => {
        const userId = parseUserIdFromHeaders(request.headers as Record<string, unknown>);
        if (!userId) {
          return reply.code(401).send({ error: { code: "UNAUTHORIZED", message: "Login required" } });
        }
        const body = updateSevaProviderOnlineSchema.parse(request.body);
        const provider = await providerForUser(userId);
        if (!provider) {
          return reply.code(404).send({ error: { code: "NOT_FOUND", message: "Provider profile not found" } });
        }
        provider.isOnline = body.isOnline;
        return serializeProvider(await providerRepo.save(provider));
      });

      app.get("/v1/seva/providers", async (request) => {
        const query = paginationQuerySchema.parse(request.query);
        const roles = getRolesFromHeaders(request.headers as Record<string, unknown>);
        const isAdmin = roles.includes(UserRole.SEVA_SUPER_ADMIN);
        const [rows, total] = await providerRepo.findAndCount({
          where: isAdmin ? {} : { isActive: true },
          order: { createdAt: "DESC" },
          skip: (query.page - 1) * query.limit,
          take: query.limit,
        });
        return {
          items: rows.map(serializeProvider),
          page: query.page,
          limit: query.limit,
          total,
          totalPages: Math.max(1, Math.ceil(total / query.limit)),
        };
      });

      app.post("/v1/seva/workers", async (request, reply) => {
        const userId = parseUserIdFromHeaders(request.headers as Record<string, unknown>);
        if (!userId) {
          return reply.code(401).send({ error: { code: "UNAUTHORIZED", message: "Login required" } });
        }
        const provider = await providerForUser(userId);
        if (!provider) {
          return reply.code(403).send({ error: { code: "FORBIDDEN", message: "Provider profile required" } });
        }
        const body = createSevaWorkerSchema.parse(request.body);
        const workerUser = await ensureWorkerUser({
          mobile: body.mobile,
          name: body.fullName,
          email: body.email,
        });
        const saved = await workerRepo.save(
          workerRepo.create({
            providerId: provider.id,
            userId: workerUser?.id ?? null,
            fullName: body.fullName,
            mobile: normalizePhone(body.mobile),
            email: body.email ?? null,
            skills: body.skills,
            isAvailable: true,
            isActive: true,
          }),
        );
        if (workerUser) {
          void notify(ds, {
            userId: workerUser.id,
            audience: "worker",
            toEmail: saved.email ?? workerUser.email,
            toPhone: saved.mobile,
            title: "Added as Seva worker",
            body: [
              `Hello ${saved.fullName},`,
              "",
              `${provider.fullName} added you as a Seva worker.`,
              `Skills: ${saved.skills}`,
              "",
              "Login with Worker intent under Seva to view assigned jobs.",
            ].join("\n"),
            referenceType: "seva_worker",
            referenceId: saved.id,
          });
        }
        return serializeWorker(saved);
      });

      app.get("/v1/seva/workers", async (request, reply) => {
        const userId = parseUserIdFromHeaders(request.headers as Record<string, unknown>);
        const roles = getRolesFromHeaders(request.headers as Record<string, unknown>);
        const query = paginationQuerySchema.parse(request.query);
        const raw = request.query as { providerId?: string };
        const isAdmin = roles.includes(UserRole.SEVA_SUPER_ADMIN);
        let providerId = raw.providerId ? parseEntityId(raw.providerId) : null;
        if (!providerId && userId && !isAdmin) {
          const provider = await providerForUser(userId);
          providerId = provider?.id ?? null;
        }
        if (!providerId && !isAdmin) {
          return reply.code(400).send({
            error: { code: "PROVIDER_REQUIRED", message: "providerId required" },
          });
        }
        const qb = workerRepo.createQueryBuilder("w").orderBy("w.created_at", "DESC");
        if (!isAdmin) {
          qb.andWhere("w.is_active = true");
        }
        if (providerId) {
          qb.andWhere("w.provider_id = :providerId", { providerId });
        }
        const total = await qb.getCount();
        const rows = await qb.skip((query.page - 1) * query.limit).take(query.limit).getMany();
        return {
          items: rows.map(serializeWorker),
          page: query.page,
          limit: query.limit,
          total,
          totalPages: Math.max(1, Math.ceil(total / query.limit)),
        };
      });

      app.get("/v1/seva/worker/me", async (request, reply) => {
        const userId = parseUserIdFromHeaders(request.headers as Record<string, unknown>);
        if (!userId) {
          return reply.code(401).send({ error: { code: "UNAUTHORIZED", message: "Login required" } });
        }
        const user = await userRepo.findOne({ where: { id: userId } });
        if (!user) {
          return reply.code(404).send({ error: { code: "NOT_FOUND", message: "User not found" } });
        }
        const workers = await workerRepo.find({
          where: [{ userId }, { mobile: normalizePhone(user.phone) }],
          order: { createdAt: "DESC" },
        });
        const unique = new Map(workers.map((w) => [w.id, w]));
        const workerList = [...unique.values()].filter((w) => w.isActive);
        const bookings = await bookingRepo.find({
          where: workerList.length
            ? { workerId: In(workerList.map((w) => w.id)) }
            : { workerMobile: normalizePhone(user.phone) },
          order: { createdAt: "DESC" },
          take: 50,
        });
        return {
          phone: user.phone,
          name: user.name,
          workers: workerList.map(serializeWorker),
          bookings: bookings.map(serializeBooking),
        };
      });

      app.post("/v1/seva/offerings", async (request, reply) => {
        const userId = parseUserIdFromHeaders(request.headers as Record<string, unknown>);
        if (!userId) {
          return reply.code(401).send({ error: { code: "UNAUTHORIZED", message: "Login required" } });
        }
        const provider = await providerForUser(userId);
        if (!provider) {
          return reply.code(403).send({ error: { code: "FORBIDDEN", message: "Provider profile required" } });
        }
        const body = createSevaOfferingSchema.parse(request.body);
        const saved = await offeringRepo.save(
          offeringRepo.create({
            providerId: provider.id,
            category: body.category,
            title: body.title,
            description: body.description ?? null,
            durationMinutes: body.durationMinutes,
            amountInPaise: body.amountInPaise,
            isActive: true,
          }),
        );
        return serializeOffering(saved);
      });

      app.patch("/v1/seva/offerings/:id", async (request, reply) => {
        const id = parseEntityId((request.params as { id: string }).id);
        const userId = parseUserIdFromHeaders(request.headers as Record<string, unknown>);
        if (!userId) {
          return reply.code(401).send({ error: { code: "UNAUTHORIZED", message: "Login required" } });
        }
        const provider = await providerForUser(userId);
        const offering = await offeringRepo.findOne({ where: { id } });
        if (!offering || !provider || offering.providerId !== provider.id) {
          return reply.code(404).send({ error: { code: "NOT_FOUND", message: "Offering not found" } });
        }
        const body = updateSevaOfferingSchema.parse(request.body);
        Object.assign(offering, body);
        return serializeOffering(await offeringRepo.save(offering));
      });

      app.get("/v1/seva/offerings", async (request) => {
        const query = paginationQuerySchema.parse(request.query);
        const raw = request.query as { providerId?: string; category?: string };
        const roles = getRolesFromHeaders(request.headers as Record<string, unknown>);
        const isAdmin = roles.includes(UserRole.SEVA_SUPER_ADMIN);
        const qb = offeringRepo.createQueryBuilder("o").orderBy("o.created_at", "DESC");
        if (!isAdmin) {
          qb.where("o.is_active = true");
        }
        if (raw.providerId) {
          qb.andWhere("o.provider_id = :providerId", { providerId: raw.providerId });
        }
        if (raw.category) {
          qb.andWhere("o.category = :category", { category: raw.category });
        }
        const total = await qb.getCount();
        const rows = await qb.skip((query.page - 1) * query.limit).take(query.limit).getMany();
        return {
          items: rows.map(serializeOffering),
          page: query.page,
          limit: query.limit,
          total,
          totalPages: Math.max(1, Math.ceil(total / query.limit)),
        };
      });

      app.get("/v1/seva/search", async (request) => {
        const query = searchSevaOfferingsSchema.parse(request.query);
        const providers = await providerRepo.find({
          where: { isActive: true, isApproved: true, isOnline: true },
        });
        let providerIds = providers.map((p) => p.id);
        if (query.latitude != null && query.longitude != null) {
          const radius = query.radiusKm ?? 15;
          providerIds = providers
            .filter((p) => {
              if (p.latitude == null || p.longitude == null) return true;
              const km = haversineKm(query.latitude!, query.longitude!, p.latitude, p.longitude);
              return km <= Math.min(radius, p.serviceRadiusKm || radius);
            })
            .map((p) => p.id);
        }
        if (providerIds.length === 0) {
          return { items: [], page: query.page, limit: query.limit, total: 0, totalPages: 1 };
        }
        const qb = offeringRepo
          .createQueryBuilder("o")
          .where("o.is_active = true")
          .andWhere("o.provider_id IN (:...providerIds)", { providerIds })
          .orderBy("o.amount_in_paise", "ASC");
        if (query.category) qb.andWhere("o.category = :category", { category: query.category });
        if (query.q) {
          qb.andWhere("(o.title ILIKE :q OR o.description ILIKE :q)", { q: `%${query.q}%` });
        }
        const total = await qb.getCount();
        const rows = await qb.skip((query.page - 1) * query.limit).take(query.limit).getMany();
        const providerById = new Map(providers.map((p) => [p.id, p]));
        return {
          items: rows.map((o) => ({
            ...serializeOffering(o),
            provider: providerById.get(o.providerId)
              ? serializeProvider(providerById.get(o.providerId)!)
              : null,
          })),
          page: query.page,
          limit: query.limit,
          total,
          totalPages: Math.max(1, Math.ceil(total / query.limit)),
        };
      });

      app.post("/v1/seva/bookings", async (request, reply) => {
        const userId = parseUserIdFromHeaders(request.headers as Record<string, unknown>);
        if (!userId) {
          return reply.code(401).send({ error: { code: "UNAUTHORIZED", message: "Login required" } });
        }
        const body = createSevaBookingSchema.parse(request.body);
        const offering = await offeringRepo.findOne({ where: { id: body.offeringId, isActive: true } });
        if (!offering) {
          return reply.code(404).send({ error: { code: "NOT_FOUND", message: "Offering not found" } });
        }
        const provider = await providerRepo.findOne({ where: { id: offering.providerId } });
        if (!provider?.isOnline || !provider.isApproved) {
          return reply.code(400).send({
            error: { code: "PROVIDER_UNAVAILABLE", message: "Provider is not available right now" },
          });
        }
        const platformFeeInPaise = await computePlatformFeeInPaise(offering.amountInPaise);
        const taxInPaise = 0;
        const totalAmountInPaise = offering.amountInPaise + platformFeeInPaise + taxInPaise;
        const saved = await bookingRepo.save(
          bookingRepo.create({
            customerUserId: userId,
            providerId: offering.providerId,
            offeringId: offering.id,
            category: offering.category,
            title: offering.title,
            serviceAddress: body.serviceAddress,
            scheduledAt: new Date(body.scheduledAt),
            notes: body.notes ?? null,
            latitude: body.latitude ?? null,
            longitude: body.longitude ?? null,
            amountInPaise: offering.amountInPaise,
            platformFeeInPaise,
            taxInPaise,
            totalAmountInPaise,
            paymentStatus: PaymentStatus.PENDING,
            status: SevaBookingStatus.REQUESTED,
          }),
        );

        const providerUser = await userRepo.findOne({ where: { id: provider.userId } });
        const customer = await userRepo.findOne({ where: { id: userId } });
        if (customer) {
          void notify(ds, {
            userId: customer.id,
            audience: "customer",
            toEmail: customer.email,
            toPhone: customer.phone,
            title: "Seva booking requested",
            body: [
              `Hello ${customer.name ?? "Customer"},`,
              "",
              `Your request for ${offering.title} was sent to ${provider.fullName}.`,
              `When: ${new Date(body.scheduledAt).toLocaleString("en-IN")}`,
              `Address: ${body.serviceAddress}`,
              `Amount: ${formatInr(totalAmountInPaise)}`,
              "",
              "You will be notified when the provider accepts.",
            ].join("\n"),
            referenceType: "seva_booking",
            referenceId: saved.id,
          });
        }
        if (providerUser) {
          void notify(ds, {
            userId: providerUser.id,
            audience: "provider",
            toEmail: provider.email ?? providerUser.email,
            toPhone: provider.alternateMobile ?? providerUser.phone,
            title: "New Seva booking request",
            body: [
              `Hello ${provider.fullName},`,
              "",
              `New request for ${offering.title}.`,
              `When: ${new Date(body.scheduledAt).toLocaleString("en-IN")}`,
              `Address: ${body.serviceAddress}`,
              `Amount: ${formatInr(totalAmountInPaise)}`,
              "",
              "Open Provider → Requests to accept or reject.",
            ].join("\n"),
            referenceType: "seva_booking",
            referenceId: saved.id,
          });
        }
        return serializeBooking(saved);
      });

      app.get("/v1/seva/bookings", async (request) => {
        await releaseExpiredUnpaidBookings(app.log);
        const query = paginationQuerySchema.parse(request.query);
        const raw = request.query as {
          customerUserId?: string;
          providerId?: string;
          workerId?: string;
        };
        const qb = bookingRepo.createQueryBuilder("b").orderBy("b.created_at", "DESC");
        if (raw.customerUserId) {
          qb.andWhere("b.customer_user_id = :customerUserId", {
            customerUserId: raw.customerUserId,
          });
        }
        if (raw.providerId) {
          qb.andWhere("b.provider_id = :providerId", { providerId: raw.providerId });
        }
        if (raw.workerId) {
          qb.andWhere("b.worker_id = :workerId", { workerId: raw.workerId });
        }
        const total = await qb.getCount();
        const rows = await qb.skip((query.page - 1) * query.limit).take(query.limit).getMany();
        return {
          items: rows.map(serializeBooking),
          page: query.page,
          limit: query.limit,
          total,
          totalPages: Math.max(1, Math.ceil(total / query.limit)),
        };
      });

      app.post("/v1/seva/bookings/:id/decide", async (request, reply) => {
        const id = parseEntityId((request.params as { id: string }).id);
        const userId = parseUserIdFromHeaders(request.headers as Record<string, unknown>);
        if (!userId) {
          return reply.code(401).send({ error: { code: "UNAUTHORIZED", message: "Login required" } });
        }
        const body = decideSevaBookingSchema.parse(request.body);
        const booking = await bookingRepo.findOne({ where: { id } });
        if (!booking) {
          return reply.code(404).send({ error: { code: "NOT_FOUND", message: "Booking not found" } });
        }
        const provider = await providerForUser(userId);
        if (!provider || provider.id !== booking.providerId) {
          return reply.code(403).send({ error: { code: "FORBIDDEN", message: "Not your booking" } });
        }
        if (booking.status !== SevaBookingStatus.REQUESTED) {
          return reply.code(400).send({
            error: { code: "INVALID_STATE", message: "Booking already decided" },
          });
        }
        if (body.decision === "reject") {
          booking.status = SevaBookingStatus.REJECTED;
          booking.paymentStatus = PaymentStatus.FAILED;
          const saved = await bookingRepo.save(booking);
          void notifyCustomerBookingStatus(ds, saved, SevaBookingStatus.REQUESTED).catch(() => undefined);
          return serializeBooking(saved);
        }

        if (!body.workerId) {
          return reply.code(400).send({
            error: { code: "WORKER_REQUIRED", message: "Assign a worker before accepting this request" },
          });
        }
        const worker = await workerRepo.findOne({
          where: { id: body.workerId, providerId: provider.id, isActive: true },
        });
        if (!worker) {
          return reply.code(400).send({
            error: { code: "WORKER_NOT_FOUND", message: "Worker not found for this provider" },
          });
        }
        if (!worker.isAvailable) {
          return reply.code(400).send({
            error: { code: "WORKER_BUSY", message: "This worker is already assigned to another job" },
          });
        }
        booking.workerId = worker.id;
        booking.workerName = worker.fullName;
        booking.workerMobile = worker.mobile;
        booking.status = SevaBookingStatus.ACCEPTED;
        booking.paymentDueAt = paymentDueAtFrom();
        const saved = await bookingRepo.save(booking);
        await setWorkerAvailable(worker.id, false);
        void notifyCustomerBookingStatus(ds, saved, SevaBookingStatus.REQUESTED).catch(() => undefined);
        if (worker.userId) {
          void notify(ds, {
            userId: worker.userId,
            audience: "worker",
            toEmail: worker.email,
            toPhone: worker.mobile,
            title: "New Seva job assigned",
            body: [
              `Hello ${worker.fullName},`,
              "",
              `You were assigned to ${booking.title}.`,
              `Address: ${booking.serviceAddress}`,
              `When: ${new Date(booking.scheduledAt).toLocaleString("en-IN")}`,
              "",
              "The customer must pay within 10 minutes. Open Worker console for job details.",
            ].join("\n"),
            referenceType: "seva_booking",
            referenceId: saved.id,
          });
        }
        return serializeBooking(saved);
      });

      app.post("/v1/seva/bookings/:id/assign-worker", async (request, reply) => {
        const id = parseEntityId((request.params as { id: string }).id);
        const userId = parseUserIdFromHeaders(request.headers as Record<string, unknown>);
        if (!userId) {
          return reply.code(401).send({ error: { code: "UNAUTHORIZED", message: "Login required" } });
        }
        const body = assignSevaWorkerSchema.parse(request.body);
        const booking = await bookingRepo.findOne({ where: { id } });
        const provider = await providerForUser(userId);
        if (!booking || !provider || booking.providerId !== provider.id) {
          return reply.code(404).send({ error: { code: "NOT_FOUND", message: "Booking not found" } });
        }
        const worker = await workerRepo.findOne({
          where: { id: body.workerId, providerId: provider.id, isActive: true },
        });
        if (!worker) {
          return reply.code(400).send({
            error: { code: "WORKER_NOT_FOUND", message: "Worker not found" },
          });
        }
        if (!worker.isAvailable && worker.id !== booking.workerId) {
          return reply.code(400).send({
            error: { code: "WORKER_BUSY", message: "This worker is already assigned to another job" },
          });
        }
        const previousWorkerId = booking.workerId;
        booking.workerId = worker.id;
        booking.workerName = worker.fullName;
        booking.workerMobile = worker.mobile;
        const saved = await bookingRepo.save(booking);
        if (previousWorkerId && previousWorkerId !== worker.id) {
          await setWorkerAvailable(previousWorkerId, true);
        }
        await setWorkerAvailable(worker.id, false);
        if (worker.userId) {
          void notify(ds, {
            userId: worker.userId,
            audience: "worker",
            toEmail: worker.email,
            toPhone: worker.mobile,
            title: "New Seva job assigned",
            body: [
              `Hello ${worker.fullName},`,
              "",
              `You were assigned to ${booking.title}.`,
              `Address: ${booking.serviceAddress}`,
              `When: ${new Date(booking.scheduledAt).toLocaleString("en-IN")}`,
              "",
              "Open Worker console for job details.",
            ].join("\n"),
            referenceType: "seva_booking",
            referenceId: saved.id,
          });
        }
        const customer = await userRepo.findOne({ where: { id: booking.customerUserId } });
        if (customer) {
          void notify(ds, {
            userId: customer.id,
            audience: "customer",
            toEmail: customer.email,
            toPhone: customer.phone,
            title: "Worker assigned to your booking",
            body: [
              `Hello ${customer.name ?? "Customer"},`,
              "",
              `${worker.fullName} was assigned to ${booking.title}.`,
              worker.mobile ? `Worker mobile: ${worker.mobile}` : null,
              "",
              "You can chat after payment is completed.",
            ]
              .filter(Boolean)
              .join("\n"),
            referenceType: "seva_booking",
            referenceId: saved.id,
          });
        }
        return serializeBooking(saved);
      });

      app.post("/v1/seva/bookings/:id/confirm-payment", async (request, reply) => {
        const id = parseEntityId((request.params as { id: string }).id);
        const body = confirmSevaPaymentSchema.parse(request.body ?? {});

        await releaseExpiredUnpaidBookings(app.log);

        const booking = await bookingRepo.findOne({ where: { id } });
        if (!booking) {
          return reply.code(404).send({ error: { code: "NOT_FOUND", message: "Booking not found" } });
        }
        if (booking.status === SevaBookingStatus.CANCELLED || booking.status === SevaBookingStatus.REJECTED) {
          return reply.code(400).send({
            error: {
              code: "INVALID_STATE",
              message:
                booking.status === SevaBookingStatus.CANCELLED
                  ? "Payment window of 10 minutes has expired. The worker was released."
                  : "Cannot pay for this booking",
            },
          });
        }
        if (booking.status === SevaBookingStatus.REQUESTED) {
          return reply.code(400).send({
            error: { code: "NOT_ACCEPTED", message: "Wait until the provider accepts" },
          });
        }
        const dueAt = resolvePaymentDueAt(booking);
        if (
          booking.paymentStatus !== PaymentStatus.PAID &&
          dueAt &&
          dueAt.getTime() < Date.now()
        ) {
          await releaseExpiredUnpaidBookings(app.log);
          return reply.code(400).send({
            error: {
              code: "PAYMENT_WINDOW_EXPIRED",
              message: "Payment window of 10 minutes has expired. The worker was released.",
            },
          });
        }
        const wasPaid = booking.paymentStatus === PaymentStatus.PAID;
        booking.paymentStatus = PaymentStatus.PAID;
        booking.paymentProvider = "cashfree";
        if (body.orderId) booking.paymentProviderOrderId = body.orderId;
        if (!booking.serviceOtp) booking.serviceOtp = makeServiceOtp();
        if (booking.status === SevaBookingStatus.ACCEPTED) {
          booking.status = SevaBookingStatus.SCHEDULED;
        }
        const saved = await bookingRepo.save(booking);
        try {
          await ensureInvoiceForBooking(saved);
        } catch (err) {
          app.log.error({ err, bookingId: saved.id }, "Failed to create seva invoice after payment");
        }
        if (!wasPaid) {
          try {
            await collectSevaPaymentToPlatform(saved.id);
          } catch (err) {
            app.log.error({ err, bookingId: saved.id }, "Failed to collect seva payment to platform");
          }

          const customer = await userRepo.findOne({ where: { id: saved.customerUserId } });
          if (customer) {
            void notify(ds, {
              userId: customer.id,
              audience: "customer",
              toEmail: customer.email,
              toPhone: customer.phone,
              title: "Payment successful — service OTP ready",
              body: [
                `Hello ${customer.name ?? "Customer"},`,
                "",
                `Payment received for ${saved.title} (booking #${saved.id}).`,
                `Amount: ${formatInr(saved.totalAmountInPaise)}`,
                `Service OTP: ${saved.serviceOtp}`,
                "",
                "Share this OTP with the worker only when they arrive.",
              ].join("\n"),
              referenceType: "seva_booking",
              referenceId: saved.id,
            });
          }

          const provider = await providerRepo.findOne({ where: { id: saved.providerId } });
          const providerUser = provider
            ? await userRepo.findOne({ where: { id: provider.userId } })
            : null;
          if (provider && providerUser) {
            void notify(ds, {
              userId: providerUser.id,
              audience: "provider",
              toEmail: provider.email ?? providerUser.email,
              toPhone: provider.alternateMobile ?? providerUser.phone,
              title: "Customer paid — job confirmed",
              body: [
                `Hello ${provider.fullName},`,
                "",
                `Customer paid for booking #${saved.id} (${saved.title}).`,
                `Status: ${saved.status.replaceAll("_", " ")}`,
                `Amount: ${formatInr(saved.totalAmountInPaise)}`,
                "",
                "Assign a worker if needed and track the job under Provider → Jobs.",
              ].join("\n"),
              referenceType: "seva_booking",
              referenceId: saved.id,
            });
          }

          if (saved.workerId) {
            const worker = await workerRepo.findOne({ where: { id: saved.workerId } });
            if (worker?.userId) {
              void notify(ds, {
                userId: worker.userId,
                audience: "worker",
                toEmail: worker.email,
                toPhone: worker.mobile,
                title: "Paid job ready",
                body: [
                  `Hello ${worker.fullName},`,
                  "",
                  `Booking #${saved.id} (${saved.title}) is paid and confirmed.`,
                  `Address: ${saved.serviceAddress}`,
                  `When: ${new Date(saved.scheduledAt).toLocaleString("en-IN")}`,
                  "",
                  "Ask the customer for the service OTP when you arrive.",
                ].join("\n"),
                referenceType: "seva_booking",
                referenceId: saved.id,
              });
            }
          }
        }
        return serializeBooking(saved);
      });

      app.patch("/v1/seva/bookings/:id/status", async (request, reply) => {
        const id = parseEntityId((request.params as { id: string }).id);
        const userId = parseUserIdFromHeaders(request.headers as Record<string, unknown>);
        const body = updateSevaBookingStatusSchema.parse(request.body);
        const booking = await bookingRepo.findOne({ where: { id } });
        if (!booking) {
          return reply.code(404).send({ error: { code: "NOT_FOUND", message: "Booking not found" } });
        }
        if (userId) {
          const provider = await providerForUser(userId);
          const user = await userRepo.findOne({ where: { id: userId } });
          const isWorker =
            !!user &&
            (booking.workerId
              ? !!(await workerRepo.findOne({ where: { id: booking.workerId, userId } }))
              : normalizePhone(booking.workerMobile) === normalizePhone(user.phone));
          const roles = getRolesFromHeaders(request.headers as Record<string, unknown>);
          const isStaff = roles.includes(UserRole.SEVA_SUPER_ADMIN);
          if (!isStaff && provider?.id !== booking.providerId && !isWorker) {
            return reply.code(403).send({ error: { code: "FORBIDDEN", message: "Not your booking" } });
          }
        }
        if (booking.paymentStatus !== PaymentStatus.PAID) {
          return reply.code(402).send({
            error: { code: "PAYMENT_REQUIRED", message: "Customer payment required first" },
          });
        }

        if (
          body.status === SevaBookingStatus.IN_PROGRESS ||
          body.status === SevaBookingStatus.COMPLETED
        ) {
          if (!booking.otpVerified) {
            if (body.status === SevaBookingStatus.COMPLETED) {
              return reply.code(400).send({
                error: {
                  code: "OTP_REQUIRED",
                  message: "Verify OTP and set in progress before completing",
                },
              });
            }
            const otp = body.otp?.trim();
            if (!otp || otp !== booking.serviceOtp) {
              return reply.code(400).send({
                error: { code: "INVALID_OTP", message: "Invalid service OTP" },
              });
            }
            booking.otpVerified = true;
          }
        }

        const previous = booking.status;
        booking.status = body.status;
        const saved = await bookingRepo.save(booking);

        if (
          (saved.status === SevaBookingStatus.COMPLETED ||
            saved.status === SevaBookingStatus.CANCELLED) &&
          previous !== saved.status
        ) {
          await setWorkerAvailable(saved.workerId, true);
        }

        if (
          body.status === SevaBookingStatus.COMPLETED &&
          previous !== SevaBookingStatus.COMPLETED &&
          saved.paymentStatus === PaymentStatus.PAID
        ) {
          try {
            await ensureInvoiceForBooking(saved);
          } catch (err) {
            app.log.error({ err, bookingId: saved.id }, "Failed to ensure seva invoice on completion");
          }
          try {
            const settled = await settleSevaPaymentToProvider(saved.id);
            const provider = await providerRepo.findOne({ where: { id: saved.providerId } });
            const providerUser = provider
              ? await userRepo.findOne({ where: { id: provider.userId } })
              : null;
            if (provider && providerUser && !settled.alreadySettled) {
              void notify(ds, {
                userId: providerUser.id,
                audience: "provider",
                toEmail: provider.email ?? providerUser.email,
                toPhone: provider.alternateMobile ?? providerUser.phone,
                title: "Job completed — wallet credited",
                body: [
                  `Hello ${provider.fullName},`,
                  "",
                  `Booking #${saved.id} (${saved.title}) is completed.`,
                  `Credited to wallet: ${formatInr(settled.providerShareInPaise ?? 0)}`,
                  `Platform fee retained: ${formatInr(settled.platformFeeInPaise ?? 0)}`,
                  "",
                  "You can withdraw from Provider → Wallet.",
                ].join("\n"),
                referenceType: "seva_booking",
                referenceId: saved.id,
              });
            } else if (provider && providerUser && settled.alreadySettled) {
              void notify(ds, {
                userId: providerUser.id,
                audience: "provider",
                toEmail: provider.email ?? providerUser.email,
                toPhone: provider.alternateMobile ?? providerUser.phone,
                title: "Job completed — wallet already credited",
                body: `Booking #${saved.id} was already settled (${formatInr(settled.providerShareInPaise ?? 0)}).`,
                referenceType: "seva_booking",
                referenceId: saved.id,
              });
            }
          } catch (err) {
            app.log.error({ err, bookingId: saved.id }, "Failed to settle seva booking");
            const provider = await providerRepo.findOne({ where: { id: saved.providerId } });
            const providerUser = provider
              ? await userRepo.findOne({ where: { id: provider.userId } })
              : null;
            if (provider && providerUser) {
              void notify(ds, {
                userId: providerUser.id,
                audience: "provider",
                toEmail: provider.email ?? providerUser.email,
                toPhone: provider.alternateMobile ?? providerUser.phone,
                title: "Job completed — wallet credit pending",
                body: `Booking #${saved.id} completed but wallet settlement failed. Contact Seva staff.`,
                referenceType: "seva_booking",
                referenceId: saved.id,
              });
            }
          }
        }

        void notifyCustomerBookingStatus(ds, saved, previous).catch(() => undefined);

        if (previous !== saved.status && saved.workerId) {
          const worker = await workerRepo.findOne({ where: { id: saved.workerId } });
          if (worker?.userId) {
            void notify(ds, {
              userId: worker.userId,
              audience: "worker",
              toEmail: worker.email,
              toPhone: worker.mobile,
              title: `Job update: ${formatBookingStatusLabel(saved.status)}`,
              body: [
                `Hello ${worker.fullName},`,
                "",
                `Booking #${saved.id} (${saved.title}) is now ${formatBookingStatusLabel(saved.status)}.`,
                `Address: ${saved.serviceAddress}`,
              ].join("\n"),
              referenceType: "seva_booking",
              referenceId: saved.id,
            });
          }
        }

        return serializeBooking(saved);
      });

      app.post("/v1/seva/bookings/:id/verify-otp", async (request, reply) => {
        const id = parseEntityId((request.params as { id: string }).id);
        const body = verifySevaOtpBodySchema.parse(request.body);
        const booking = await bookingRepo.findOne({ where: { id } });
        if (!booking) {
          return reply.code(404).send({ error: { code: "NOT_FOUND", message: "Booking not found" } });
        }
        if (booking.paymentStatus !== PaymentStatus.PAID) {
          return reply.code(402).send({
            error: { code: "PAYMENT_REQUIRED", message: "Payment required" },
          });
        }
        if (!booking.serviceOtp || booking.serviceOtp !== body.otp) {
          return reply.code(400).send({ error: { code: "INVALID_OTP", message: "Invalid OTP" } });
        }
        booking.otpVerified = true;
        const previous = booking.status;
        booking.status = SevaBookingStatus.IN_PROGRESS;
        const saved = await bookingRepo.save(booking);
        void notifyCustomerBookingStatus(ds, saved, previous).catch(() => undefined);
        const provider = await providerRepo.findOne({ where: { id: saved.providerId } });
        const providerUser = provider
          ? await userRepo.findOne({ where: { id: provider.userId } })
          : null;
        if (provider && providerUser) {
          void notify(ds, {
            userId: providerUser.id,
            audience: "provider",
            toEmail: provider.email ?? providerUser.email,
            toPhone: provider.alternateMobile ?? providerUser.phone,
            title: "OTP verified — service started",
            body: `Booking #${saved.id} (${saved.title}) is now in progress.`,
            referenceType: "seva_booking",
            referenceId: saved.id,
          });
        }
        return serializeBooking(saved);
      });

      app.get("/v1/seva/bookings/:id/messages", async (request, reply) => {
        const id = parseEntityId((request.params as { id: string }).id);
        const actorId = parseUserIdFromHeaders(request.headers as Record<string, unknown>);
        if (!actorId) {
          return reply.code(401).send({ error: { code: "UNAUTHORIZED", message: "Login required" } });
        }
        const booking = await bookingRepo.findOne({ where: { id } });
        if (!booking) {
          return reply.code(404).send({ error: { code: "NOT_FOUND", message: "Booking not found" } });
        }
        const allowed = await canAccessSevaChat(actorId, booking);
        if (!allowed) {
          return reply.code(403).send({ error: { code: "FORBIDDEN", message: "Not allowed" } });
        }
        if (booking.paymentStatus !== PaymentStatus.PAID) {
          return reply.code(400).send({
            error: { code: "CHAT_UNAVAILABLE", message: "Chat opens after payment" },
          });
        }
        const rows = await messageRepo.find({
          where: { bookingId: booking.id },
          order: { createdAt: "ASC", id: "ASC" },
          take: 200,
        });
        const senders = rows.length
          ? await userRepo.find({ where: { id: In([...new Set(rows.map((r) => r.senderUserId))]) } })
          : [];
        const nameById = new Map(senders.map((u) => [u.id, u.name ?? null]));
        return {
          bookingId: booking.id,
          canSend: booking.status !== SevaBookingStatus.COMPLETED && booking.status !== SevaBookingStatus.CANCELLED,
          items: rows.map((row) => ({
            id: row.id,
            bookingId: row.bookingId,
            senderUserId: row.senderUserId,
            senderName: nameById.get(row.senderUserId) ?? null,
            body: row.body,
            mine: row.senderUserId === actorId,
            createdAt: toIsoRequired(row.createdAt),
          })),
        };
      });

      app.post("/v1/seva/bookings/:id/messages", async (request, reply) => {
        const id = parseEntityId((request.params as { id: string }).id);
        const actorId = parseUserIdFromHeaders(request.headers as Record<string, unknown>);
        if (!actorId) {
          return reply.code(401).send({ error: { code: "UNAUTHORIZED", message: "Login required" } });
        }
        const body = sevaBookingChatMessageSchema.parse(request.body);
        const booking = await bookingRepo.findOne({ where: { id } });
        if (!booking) {
          return reply.code(404).send({ error: { code: "NOT_FOUND", message: "Booking not found" } });
        }
        const allowed = await canAccessSevaChat(actorId, booking);
        if (!allowed) {
          return reply.code(403).send({ error: { code: "FORBIDDEN", message: "Not allowed" } });
        }
        if (
          booking.paymentStatus !== PaymentStatus.PAID ||
          booking.status === SevaBookingStatus.COMPLETED ||
          booking.status === SevaBookingStatus.CANCELLED
        ) {
          return reply.code(400).send({ error: { code: "CHAT_CLOSED", message: "Chat is closed" } });
        }
        const sender = await userRepo.findOne({ where: { id: actorId } });
        const saved = await messageRepo.save(
          messageRepo.create({
            bookingId: booking.id,
            senderUserId: actorId,
            body: body.body,
          }),
        );

        try {
          const preview = body.body.length > 120 ? `${body.body.slice(0, 117)}…` : body.body;
          const provider = await providerRepo.findOne({ where: { id: booking.providerId } });
          const worker = booking.workerId
            ? await workerRepo.findOne({ where: { id: booking.workerId } })
            : null;
          const recipients: Array<{
            userId: number;
            audience: "customer" | "provider" | "worker";
            email?: string | null;
            phone?: string | null;
            name?: string | null;
          }> = [];

          if (booking.customerUserId !== actorId) {
            const customer = await userRepo.findOne({ where: { id: booking.customerUserId } });
            if (customer) {
              recipients.push({
                userId: customer.id,
                audience: "customer",
                email: customer.email,
                phone: customer.phone,
                name: customer.name,
              });
            }
          }
          if (provider?.userId && provider.userId !== actorId) {
            const providerUser = await userRepo.findOne({ where: { id: provider.userId } });
            recipients.push({
              userId: provider.userId,
              audience: "provider",
              email: provider.email ?? providerUser?.email,
              phone: provider.alternateMobile ?? providerUser?.phone,
              name: provider.fullName,
            });
          }
          if (worker?.userId && worker.userId !== actorId) {
            recipients.push({
              userId: worker.userId,
              audience: "worker",
              email: worker.email,
              phone: worker.mobile,
              name: worker.fullName,
            });
          }

          for (const recipient of recipients) {
            void notify(ds, {
              userId: recipient.userId,
              audience: recipient.audience,
              toEmail: recipient.email,
              toPhone: recipient.phone,
              title: `New chat · Booking #${booking.id}`,
              body: [
                `Hello ${recipient.name ?? "there"},`,
                "",
                `${sender?.name ?? "Someone"} sent a message:`,
                preview,
                "",
                "Open the booking chat to reply.",
              ].join("\n"),
              referenceType: "seva_booking",
              referenceId: booking.id,
            });
          }
        } catch (err) {
          app.log.error({ err, bookingId: booking.id }, "Failed to notify Seva chat recipients");
        }

        return {
          id: saved.id,
          bookingId: saved.bookingId,
          senderUserId: saved.senderUserId,
          senderName: sender?.name ?? null,
          body: saved.body,
          mine: true,
          createdAt: toIsoRequired(saved.createdAt),
        };
      });

      async function canAccessSevaChat(userId: number, booking: SevaBookingEntity) {
        if (booking.customerUserId === userId) return true;
        const provider = await providerRepo.findOne({ where: { id: booking.providerId } });
        if (provider?.userId === userId) return true;
        if (booking.workerId) {
          const worker = await workerRepo.findOne({ where: { id: booking.workerId } });
          if (worker?.userId === userId) return true;
        }
        const user = await userRepo.findOne({ where: { id: userId } });
        if (user && normalizePhone(booking.workerMobile) === normalizePhone(user.phone)) return true;
        return false;
      }

      app.get("/v1/seva/settings/platform-fees", async (request, reply) => {
        const userId = parseUserIdFromHeaders(request.headers as Record<string, unknown>);
        if (!userId) {
          return reply.code(401).send({ error: { code: "UNAUTHORIZED", message: "Login required" } });
        }
        const roles = getRolesFromHeaders(request.headers as Record<string, unknown>);
        if (!roles.includes(UserRole.SEVA_SUPER_ADMIN)) {
          return reply.code(403).send({ error: { code: "FORBIDDEN", message: "Seva admin only" } });
        }
        const rows = await platformFeeRepo.find({ order: { createdAt: "DESC" } });
        return { items: rows.map(serializePlatformFee) };
      });

      app.post("/v1/seva/settings/platform-fees", async (request, reply) => {
        const userId = parseUserIdFromHeaders(request.headers as Record<string, unknown>);
        if (!userId) {
          return reply.code(401).send({ error: { code: "UNAUTHORIZED", message: "Login required" } });
        }
        const roles = getRolesFromHeaders(request.headers as Record<string, unknown>);
        if (!roles.includes(UserRole.SEVA_SUPER_ADMIN)) {
          return reply.code(403).send({ error: { code: "FORBIDDEN", message: "Seva admin only" } });
        }
        const body = createSevaPlatformFeeSchema.parse(request.body);
        const saved = await platformFeeRepo.save(
          platformFeeRepo.create({
            feeType: body.feeType ?? "percentage",
            percentageBps: body.percentageBps ?? DEFAULT_PLATFORM_FEE_BPS,
            flatFeeInPaise: body.flatFeeInPaise ?? 0,
            isActive: body.isActive ?? true,
          }),
        );
        return reply.code(201).send(serializePlatformFee(saved));
      });

      app.patch("/v1/seva/settings/platform-fees/:id", async (request, reply) => {
        const id = parseEntityId((request.params as { id: string }).id);
        const userId = parseUserIdFromHeaders(request.headers as Record<string, unknown>);
        if (!userId) {
          return reply.code(401).send({ error: { code: "UNAUTHORIZED", message: "Login required" } });
        }
        const roles = getRolesFromHeaders(request.headers as Record<string, unknown>);
        if (!roles.includes(UserRole.SEVA_SUPER_ADMIN)) {
          return reply.code(403).send({ error: { code: "FORBIDDEN", message: "Seva admin only" } });
        }
        const row = await platformFeeRepo.findOne({ where: { id } });
        if (!row) {
          return reply.code(404).send({
            error: { code: "NOT_FOUND", message: "Platform fee setting not found" },
          });
        }
        const body = updateSevaPlatformFeeSchema.parse(request.body);
        Object.assign(row, body);
        const saved = await platformFeeRepo.save(row);
        return serializePlatformFee(saved);
      });

      app.delete("/v1/seva/settings/platform-fees/:id", async (request, reply) => {
        const id = parseEntityId((request.params as { id: string }).id);
        const userId = parseUserIdFromHeaders(request.headers as Record<string, unknown>);
        if (!userId) {
          return reply.code(401).send({ error: { code: "UNAUTHORIZED", message: "Login required" } });
        }
        const roles = getRolesFromHeaders(request.headers as Record<string, unknown>);
        if (!roles.includes(UserRole.SEVA_SUPER_ADMIN)) {
          return reply.code(403).send({ error: { code: "FORBIDDEN", message: "Seva admin only" } });
        }
        const row = await platformFeeRepo.findOne({ where: { id } });
        if (!row) {
          return reply.code(404).send({
            error: { code: "NOT_FOUND", message: "Platform fee setting not found" },
          });
        }
        await platformFeeRepo.remove(row);
        return reply.code(204).send();
      });

      app.get("/v1/seva/invoices", async (request) => {
        const query = paginationQuerySchema.parse(request.query);
        const raw = request.query as { customerUserId?: string; providerId?: string };
        const userId = parseUserIdFromHeaders(request.headers as Record<string, unknown>);
        const roles = getRolesFromHeaders(request.headers as Record<string, unknown>);
        const isStaff = roles.includes(UserRole.SEVA_SUPER_ADMIN);

        {
          const paidQb = bookingRepo
            .createQueryBuilder("b")
            .where("b.payment_status = :paid", { paid: PaymentStatus.PAID })
            .orderBy("b.created_at", "DESC")
            .take(50);
          if (raw.providerId) {
            paidQb.andWhere("b.provider_id = :providerId", { providerId: raw.providerId });
          }
          if (raw.customerUserId) {
            paidQb.andWhere("b.customer_user_id = :customerUserId", {
              customerUserId: raw.customerUserId,
            });
          }
          if (userId && !isStaff && !raw.providerId && !raw.customerUserId) {
            const ownedProvider = await providerRepo.findOne({ where: { userId } });
            if (ownedProvider) {
              paidQb.andWhere("b.provider_id = :ownedProviderId", {
                ownedProviderId: ownedProvider.id,
              });
            } else {
              paidQb.andWhere("b.customer_user_id = :selfCustomerId", { selfCustomerId: userId });
            }
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

        if (raw.customerUserId) {
          qb.andWhere("i.customer_user_id = :customerUserId", {
            customerUserId: raw.customerUserId,
          });
        }
        if (raw.providerId) {
          qb.andWhere("i.provider_id = :providerId", { providerId: raw.providerId });
        }

        if (userId && !isStaff) {
          const ownedProvider = await providerRepo.findOne({ where: { userId } });
          if (ownedProvider && !raw.customerUserId) {
            qb.andWhere("i.provider_id = :ownedProviderId", { ownedProviderId: ownedProvider.id });
          } else if (!raw.providerId) {
            qb.andWhere("i.customer_user_id = :selfCustomerId", { selfCustomerId: userId });
          } else if (ownedProvider && String(ownedProvider.id) === String(raw.providerId)) {
            // allowed
          } else if (raw.customerUserId && String(raw.customerUserId) === String(userId)) {
            // allowed
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

      app.get("/v1/seva/invoices/:id", async (request, reply) => {
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

      app.get("/v1/seva/invoices/:id/download", async (request, reply) => {
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
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
