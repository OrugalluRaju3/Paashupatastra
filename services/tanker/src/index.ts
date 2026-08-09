import "reflect-metadata";
import {
  NotificationLogEntity,
  TankerInvoiceEntity,
  TankerOrderEntity,
  TankerOrderMessageEntity,
  TankerPlatformFeeSettingEntity,
  TankerPromoCodeEntity,
  TankerRequestEntity,
  TankerSupplierEntity,
  TankerTaxSettingEntity,
  TankerUserEntity,
  TankerVehicleEntity,
  getDataSource,
  toIso,
  toIsoRequired,
} from "@paashupatastra/database";
import { createService, envInt, getRolesFromHeaders, getUserIdFromHeaders, loadEnv, parseEntityId, parseUserIdFromHeaders } from "@paashupatastra/service-kit";
import {
  PaymentStatus,
  TankerOrderStatus,
  TankerRequestStatus,
  TankerVehicleStatus,
  UserRole,
  confirmTankerPaymentSchema,
  createTankerOrderSchema,
  createTankerPlatformFeeSchema,
  createTankerPromoSchema,
  createTankerRequestSchema,
  createTankerSupplierSchema,
  createTankerTaxSchema,
  createTankerVehicleSchema,
  customerProfileSchema,
  decideTankerRequestSchema,
  paginationQuerySchema,
  phoneSchema,
  registerTankerSupplierSchema,
  searchTankerSuppliersSchema,
  tankerOrderChatMessageSchema,
  updateUserStatusSchema,
  updateDriverLocationSchema,
  updateTankerOrderStatusSchema,
  updateTankerPlatformFeeSchema,
  updateTankerPromoSchema,
  updateTankerSupplierOnlineSchema,
  updateTankerTaxSchema,
} from "@paashupatastra/shared-models";
import { Server } from "socket.io";
import { In, Not, type Repository } from "typeorm";
import { z } from "zod";

let io: Server | null = null;

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

function makeDeliveryOtp() {
  return String(Math.floor(1000 + Math.random() * 9000));
}

/** Compare HH:mm strings as minutes from midnight. */
function timeToMinutes(hhmm: string) {
  const [h, m] = hhmm.split(":").map((x) => Number.parseInt(x, 10));
  if (!Number.isFinite(h) || !Number.isFinite(m)) return 0;
  return h * 60 + m;
}

function isTimeWithinAvailability(deliveryTime: string, start: string, end: string) {
  const t = timeToMinutes(deliveryTime);
  const s = timeToMinutes(start || "06:00");
  const e = timeToMinutes(end || "22:00");
  if (s === e) return true;
  if (s < e) return t >= s && t <= e;
  // Overnight window (e.g. 22:00–06:00)
  return t >= s || t <= e;
}

/** Normalize water type labels so "drinking" matches "Drinking Water", etc. */
function normalizeWaterTypeKey(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/\bwater\b/g, "")
    .replace(/\bwell\b/g, "")
    .trim();
}

function waterTypesMatch(requested: string, vehicleType: string) {
  const a = normalizeWaterTypeKey(requested);
  const b = normalizeWaterTypeKey(vehicleType);
  if (!a || !b) return false;
  if (a === b) return true;
  return a.includes(b) || b.includes(a);
}

function serializeSupplier(row: TankerSupplierEntity) {
  return {
    id: row.id,
    userId: row.userId,
    fullName: row.fullName,
    email: row.email,
    alternateMobile: row.alternateMobile,
    address: row.address,
    landmark: row.landmark,
    city: row.city,
    state: row.state,
    country: row.country,
    pinCode: row.pinCode,
    availabilityStartTime: row.availabilityStartTime,
    availabilityEndTime: row.availabilityEndTime,
    latitude: row.latitude,
    longitude: row.longitude,
    proofUrl: row.proofUrl,
    isOnline: row.isOnline,
    isActive: row.isActive,
    createdAt: toIsoRequired(row.createdAt),
    updatedAt: toIsoRequired(row.updatedAt),
  };
}

function serializeVehicle(row: TankerVehicleEntity) {
  return {
    id: row.id,
    supplierId: row.supplierId,
    driverFullName: row.driverFullName,
    driverMobile: row.driverMobile,
    driverEmail: row.driverEmail,
    vehicleNumber: row.vehicleNumber,
    capacityLitres: row.capacityLitres,
    amountInPaise: row.amountInPaise,
    waterType: row.waterType,
    status: row.status,
    licenceFrontUrl: row.licenceFrontUrl,
    licenceBackUrl: row.licenceBackUrl,
    tankerImageUrl: row.tankerImageUrl,
    latitude: row.latitude,
    longitude: row.longitude,
    isActive: row.isActive,
    createdAt: toIsoRequired(row.createdAt),
    updatedAt: toIsoRequired(row.updatedAt),
  };
}

function serializeRequest(row: TankerRequestEntity) {
  return {
    id: row.id,
    customerUserId: row.customerUserId,
    supplierId: row.supplierId,
    waterType: row.waterType,
    quantityLitres: row.quantityLitres,
    comments: row.comments,
    deliveryAddress: row.deliveryAddress,
    preferredDeliveryAt: toIso(row.preferredDeliveryAt),
    latitude: row.latitude,
    longitude: row.longitude,
    status: row.status,
    createdAt: toIsoRequired(row.createdAt),
    updatedAt: toIsoRequired(row.updatedAt),
  };
}

function serializeOrder(row: TankerOrderEntity) {
  const dueAt = resolvePaymentDueAt(row);
  const paymentSecondsRemaining =
    row.paymentStatus === PaymentStatus.PAID || !dueAt
      ? null
      : Math.max(0, Math.floor((dueAt.getTime() - Date.now()) / 1000));

  const base = {
    id: row.id,
    customerUserId: row.customerUserId,
    supplierId: row.supplierId,
    vehicleId: row.vehicleId,
    requestId: row.requestId,
    waterType: row.waterType,
    capacityLitres: row.capacityLitres,
    vehicleNumber: row.vehicleNumber,
    driverName: row.driverName,
    driverMobile: row.driverMobile,
    amountInPaise: row.amountInPaise,
    platformFeeInPaise: row.platformFeeInPaise,
    taxInPaise: row.taxInPaise,
    totalAmountInPaise: row.totalAmountInPaise,
    discountInPaise: row.discountInPaise,
    promoCode: row.promoCode,
    deliveryAddress: row.deliveryAddress,
    deliveryAt: toIso(row.deliveryAt),
    comments: row.comments,
    paymentMethod: row.paymentMethod,
    paymentStatus: row.paymentStatus,
    paymentProvider: row.paymentProvider,
    paymentProviderOrderId: row.paymentProviderOrderId,
    paymentDueAt: dueAt ? toIsoRequired(dueAt) : null,
    paymentSecondsRemaining,
    status: row.status,
    otpVerified: row.otpVerified,
    driverLatitude: row.driverLatitude,
    driverLongitude: row.driverLongitude,
    driverLocationUpdatedAt: toIso(row.driverLocationUpdatedAt),
    createdAt: toIsoRequired(row.createdAt),
    updatedAt: toIsoRequired(row.updatedAt),
  };

  if (row.paymentStatus === PaymentStatus.PAID) {
    return { ...base, deliveryOtp: row.deliveryOtp };
  }
  return base;
}

function serializeInvoice(row: TankerInvoiceEntity) {
  return {
    id: row.id,
    invoiceNumber: `INV-TK-${row.id}`,
    orderId: row.orderId,
    customerUserId: row.customerUserId,
    supplierId: row.supplierId,
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

function serializePromo(row: TankerPromoCodeEntity) {
  return {
    id: row.id,
    code: row.code,
    description: row.description,
    discountType: row.discountType,
    discountValue: row.discountValue,
    minOrderInPaise: row.minOrderInPaise,
    maxUses: row.maxUses,
    usedCount: row.usedCount,
    startsAt: toIso(row.startsAt),
    endsAt: toIso(row.endsAt),
    isActive: row.isActive,
    createdAt: toIsoRequired(row.createdAt),
    updatedAt: toIsoRequired(row.updatedAt),
  };
}

function serializeTax(row: TankerTaxSettingEntity) {
  return {
    id: row.id,
    taxName: row.taxName,
    taxBps: row.taxBps,
    country: row.country,
    state: row.state,
    isActive: row.isActive,
    createdAt: toIsoRequired(row.createdAt),
    updatedAt: toIsoRequired(row.updatedAt),
  };
}

function serializePlatformFee(row: TankerPlatformFeeSettingEntity) {
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

function serializeTankerUser(user: TankerUserEntity) {
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
    createdAt: toIsoRequired(user.createdAt),
    updatedAt: toIsoRequired(user.updatedAt),
  };
}

async function findTankerUserConflict(
  tankerUserRepo: Repository<TankerUserEntity>,
  opts: { phone?: string; email?: string | null; excludeId?: number },
) {
  if (opts.phone) {
    const byPhone = await tankerUserRepo.findOne({ where: { phone: opts.phone } });
    if (byPhone && byPhone.id !== opts.excludeId) {
      return { field: "phone" as const, message: "A user with this mobile number already exists" };
    }
  }
  if (opts.email) {
    const normalized = opts.email.trim().toLowerCase();
    const qb = tankerUserRepo
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

const tankerUserSignupSchema = customerProfileSchema.extend({
  intent: z.enum(["customer", "supplier"]).default("customer"),
});

const updateTankerUserAdminSchema = z.object({
  phone: phoneSchema.optional(),
  name: z.string().min(2).max(120).optional(),
  email: z.string().email().optional().nullable(),
  city: z.string().min(2).max(80).optional().nullable(),
  state: z.string().min(2).max(80).optional().nullable(),
  country: z.string().min(2).max(80).optional().nullable(),
  pinCode: z
    .string()
    .regex(/^\d{6}$/, "PIN must be 6 digits")
    .optional()
    .nullable(),
  dateOfBirth: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
    .optional()
    .nullable(),
  preferredLocation: z.string().max(200).optional().nullable(),
  roles: z
    .array(z.enum([UserRole.TANKER_SUPPLIER, UserRole.TANKER_DRIVER]))
    .min(1)
    .optional(),
});

function isPromoValid(promo: TankerPromoCodeEntity, amountInPaise: number): boolean {
  const now = new Date();
  if (!promo.isActive) return false;
  if (promo.startsAt && now < promo.startsAt) return false;
  if (promo.endsAt && now > promo.endsAt) return false;
  if (promo.maxUses > 0 && promo.usedCount >= promo.maxUses) return false;
  if (amountInPaise < promo.minOrderInPaise) return false;
  return true;
}

function computePromoDiscount(promo: TankerPromoCodeEntity, amountInPaise: number): number {
  let discountInPaise =
    promo.discountType === "percentage"
      ? Math.round((amountInPaise * promo.discountValue) / 100)
      : promo.discountValue;
  return Math.min(discountInPaise, amountInPaise);
}

const updateTankerVehicleSchema = z.object({
  driverFullName: z.string().min(2).max(120).optional(),
  driverMobile: z.string().min(10).max(15).optional(),
  driverEmail: z.string().email().optional().nullable(),
  capacityLitres: z.number().int().positive().optional(),
  amountInPaise: z.number().int().nonnegative().optional(),
  waterType: z.string().min(2).max(40).optional(),
  status: z
    .enum([
      TankerVehicleStatus.AVAILABLE,
      TankerVehicleStatus.ON_DELIVERY,
      TankerVehicleStatus.MAINTENANCE,
    ])
    .optional(),
  licenceFrontUrl: z.string().max(500).optional().nullable(),
  licenceBackUrl: z.string().max(500).optional().nullable(),
  tankerImageUrl: z.string().max(500).optional().nullable(),
  latitude: z.number().min(-90).max(90).optional().nullable(),
  longitude: z.number().min(-180).max(180).optional().nullable(),
  isActive: z.boolean().optional(),
});

const nearbyQuerySchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  radiusKm: z.coerce.number().positive().default(15),
});

const verifyOtpSchema = z.object({
  otp: z.string().min(4).max(8),
});

function notificationsBaseUrl() {
  return (process.env.NOTIFICATIONS_URL ?? "http://localhost:3006").replace(/\/$/, "");
}

function paymentsBaseUrl() {
  return (process.env.PAYMENTS_URL ?? "http://localhost:3005").replace(/\/$/, "");
}

async function collectTankerPaymentToPlatform(orderId: number) {
  const res = await fetch(`${paymentsBaseUrl()}/v1/payments/tanker-orders/${orderId}/collect`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
  });
  const data = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    error?: { message?: string };
    amountInPaise?: number;
    alreadyPaid?: boolean;
  };
  if (!res.ok) {
    throw new Error(data?.error?.message ?? `Platform wallet collect failed (${res.status})`);
  }
  return data;
}

async function settleTankerPaymentToSupplier(orderId: number) {
  const res = await fetch(`${paymentsBaseUrl()}/v1/payments/tanker-orders/${orderId}/settle`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
  });
  const data = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    error?: { message?: string };
    supplierShareInPaise?: number;
    platformFeeInPaise?: number;
    alreadySettled?: boolean;
  };
  if (!res.ok) {
    throw new Error(data?.error?.message ?? `Supplier wallet settlement failed (${res.status})`);
  }
  return data;
}

/** After supplier accept, customer must pay within this window or tanker is released. */
const PAYMENT_WINDOW_MS = 10 * 60 * 1000;

function paymentDueAtFrom(from = new Date()) {
  return new Date(from.getTime() + PAYMENT_WINDOW_MS);
}

function resolvePaymentDueAt(row: TankerOrderEntity) {
  if (row.paymentDueAt) return new Date(row.paymentDueAt);
  if (row.createdAt) return paymentDueAtFrom(new Date(row.createdAt));
  return null;
}

function formatInr(paise: number) {
  return `₹${(paise / 100).toFixed(2)}`;
}

function canChatOnTankerOrder(order: { paymentStatus: string; status: string }) {
  if (order.paymentStatus !== PaymentStatus.PAID) return false;
  if (order.status === TankerOrderStatus.CANCELLED) return false;
  return true;
}

function canSendTankerChat(order: { paymentStatus: string; status: string }) {
  return (
    canChatOnTankerOrder(order) &&
    order.status !== TankerOrderStatus.DELIVERED
  );
}

function serializeOrderMessage(
  row: TankerOrderMessageEntity,
  senderName: string | null,
  currentUserId: number,
) {
  return {
    id: row.id,
    orderId: row.orderId,
    senderUserId: row.senderUserId,
    senderName,
    body: row.body,
    mine: row.senderUserId === currentUserId,
    createdAt: toIsoRequired(row.createdAt),
  };
}

function formatVehicleSummary(v: {
  vehicleNumber: string;
  driverFullName: string;
  driverMobile: string;
  driverEmail?: string | null;
  capacityLitres: number;
  amountInPaise: number;
  waterType: string;
  status?: string;
}) {
  return [
    `Vehicle: ${v.vehicleNumber}`,
    `Water: ${v.waterType}`,
    `Capacity: ${v.capacityLitres} L`,
    `Rate: ${formatInr(v.amountInPaise)}`,
    v.status ? `Status: ${v.status.replaceAll("_", " ")}` : null,
    `Driver: ${v.driverFullName} · ${v.driverMobile}${v.driverEmail ? ` · ${v.driverEmail}` : ""}`,
  ]
    .filter(Boolean)
    .join("\n");
}

function formatSupplierSummary(s: {
  id: number;
  fullName: string;
  email?: string | null;
  alternateMobile?: string | null;
  address: string;
  city: string;
  state: string;
  pinCode: string;
}) {
  return [
    `Supplier #${s.id}: ${s.fullName}`,
    s.email ? `Email: ${s.email}` : null,
    s.alternateMobile ? `Alt mobile: ${s.alternateMobile}` : null,
    `Address: ${s.address}, ${s.city}, ${s.state} ${s.pinCode}`,
  ]
    .filter(Boolean)
    .join("\n");
}

async function notify(
  ds: Awaited<ReturnType<typeof getDataSource>>,
  input: {
    userId?: number | null;
    audience: "customer" | "supplier" | "driver" | "admin";
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
        module: "tanker",
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
      // inbox row already saved
    }
  }
}

function formatOrderStatusLabel(status: string) {
  return status.replaceAll("_", " ");
}

function customerStatusUpdateCopy(status: string): { title: string; detail: string } {
  switch (status) {
    case TankerOrderStatus.SCHEDULED:
      return {
        title: "Delivery scheduled",
        detail: "Your water tanker delivery has been scheduled.",
      };
    case TankerOrderStatus.EN_ROUTE:
      return {
        title: "Driver en route to fill water",
        detail: "Your driver is on the way to fill the tanker.",
      };
    case TankerOrderStatus.WATER_FILLED:
      return {
        title: "Tanker filled with water",
        detail: "The tanker has been filled and is preparing for delivery.",
      };
    case TankerOrderStatus.ON_THE_WAY:
      return {
        title: "Tanker is on the way",
        detail: "Your water tanker is on the way to your delivery address.",
      };
    case TankerOrderStatus.AT_LOCATION:
      return {
        title: "Tanker arrived at your location",
        detail: "The driver has arrived at your delivery address.",
      };
    case TankerOrderStatus.DELIVERING:
      return {
        title: "Water delivery in progress",
        detail: "OTP verified — water is being delivered now.",
      };
    case TankerOrderStatus.DELIVERED:
      return {
        title: "Water delivered",
        detail: "Your water tanker delivery is complete. Thank you!",
      };
    case TankerOrderStatus.CANCELLED:
      return {
        title: "Delivery cancelled",
        detail: "Your water tanker order has been cancelled.",
      };
    default:
      return {
        title: `Delivery update: ${formatOrderStatusLabel(status)}`,
        detail: `Your order status is now ${formatOrderStatusLabel(status)}.`,
      };
  }
}

async function notifyCustomerOrderStatus(
  ds: Awaited<ReturnType<typeof getDataSource>>,
  order: TankerOrderEntity,
  previousStatus: string | null,
) {
  if (previousStatus != null && previousStatus === order.status) return;

  const customer = await ds.getRepository(TankerUserEntity).findOne({
    where: { id: order.customerUserId },
  });
  if (!customer) return;

  const copy = customerStatusUpdateCopy(order.status);
  const lines = [
    `Hello ${customer.name ?? "Customer"},`,
    "",
    copy.detail,
    "",
    `Order #${order.id}`,
    `Status: ${formatOrderStatusLabel(order.status)}`,
    previousStatus
      ? `Previous: ${formatOrderStatusLabel(previousStatus)}`
      : null,
    order.vehicleNumber ? `Vehicle: ${order.vehicleNumber}` : null,
    order.driverName
      ? `Driver: ${order.driverName}${order.driverMobile ? ` · ${order.driverMobile}` : ""}`
      : null,
    `Delivery address: ${order.deliveryAddress}`,
    "",
    "Track progress under My orders.",
  ].filter(Boolean);

  await notify(ds, {
    userId: customer.id,
    audience: "customer",
    toEmail: customer.email,
    toPhone: customer.phone,
    title: copy.title,
    body: lines.join("\n"),
    referenceType: "tanker_order",
    referenceId: order.id,
  });
}

async function notifyTankerAdmins(
  ds: Awaited<ReturnType<typeof getDataSource>>,
  input: {
    title: string;
    body: string;
    referenceType?: string;
    referenceId?: number;
  },
) {
  const admins = await ds
    .getRepository(TankerUserEntity)
    .createQueryBuilder("u")
    .where("u.is_active = true")
    .andWhere(`:role = ANY(u.roles)`, { role: UserRole.TANKER_SUPER_ADMIN })
    .getMany();

  if (admins.length === 0) return;

  await Promise.allSettled(
    admins.map((admin) =>
      notify(ds, {
        userId: admin.id,
        audience: "admin",
        toEmail: admin.email,
        toPhone: admin.phone,
        title: input.title,
        body: `Hello ${admin.name ?? "Tanker Admin"},\n\n${input.body}`,
        referenceType: input.referenceType,
        referenceId: input.referenceId,
      }),
    ),
  );
}

async function main() {
  loadEnv();
  const ds = await getDataSource();

  const supplierRepo = ds.getRepository(TankerSupplierEntity);
  const vehicleRepo = ds.getRepository(TankerVehicleEntity);
  const requestRepo = ds.getRepository(TankerRequestEntity);
  const orderRepo = ds.getRepository(TankerOrderEntity);
  const userRepo = ds.getRepository(TankerUserEntity);
  const invoiceRepo = ds.getRepository(TankerInvoiceEntity);
  const messageRepo = ds.getRepository(TankerOrderMessageEntity);
  const promoRepo = ds.getRepository(TankerPromoCodeEntity);
  const taxRepo = ds.getRepository(TankerTaxSettingEntity);
  const platformFeeRepo = ds.getRepository(TankerPlatformFeeSettingEntity);

  async function ensureInvoiceForOrder(order: TankerOrderEntity) {
    if (order.paymentStatus !== PaymentStatus.PAID) return null;

    let invoice = await invoiceRepo.findOne({ where: { orderId: order.id } });
    if (invoice) {
      const amount = order.totalAmountInPaise || order.amountInPaise;
      if (invoice.amountInPaise !== amount || invoice.status !== PaymentStatus.PAID) {
        invoice.amountInPaise = amount;
        invoice.status = PaymentStatus.PAID;
        invoice = await invoiceRepo.save(invoice);
      }
      return invoice;
    }

    return invoiceRepo.save(
      invoiceRepo.create({
        orderId: order.id,
        customerUserId: order.customerUserId,
        supplierId: order.supplierId,
        amountInPaise: order.totalAmountInPaise || order.amountInPaise,
        status: PaymentStatus.PAID,
      }),
    );
  }

  async function userCanAccessInvoice(userId: number | null, roles: string[], invoice: TankerInvoiceEntity) {
    if (!userId) return false;
    if (roles.includes(UserRole.TANKER_SUPER_ADMIN)) return true;
    if (invoice.customerUserId === userId) return true;
    const supplier = await supplierRepo.findOne({ where: { id: invoice.supplierId } });
    return supplier?.userId === userId;
  }

  async function buildInvoiceDetail(invoice: TankerInvoiceEntity) {
    const order = await orderRepo.findOne({ where: { id: invoice.orderId } });
    const customer = await userRepo.findOne({ where: { id: invoice.customerUserId } });
    const supplier = await supplierRepo.findOne({ where: { id: invoice.supplierId } });

    return {
      ...serializeInvoice(invoice),
      order: order
        ? {
            id: order.id,
            waterType: order.waterType,
            capacityLitres: order.capacityLitres,
            vehicleNumber: order.vehicleNumber,
            driverName: order.driverName,
            driverMobile: order.driverMobile,
            deliveryAddress: order.deliveryAddress,
            amountInPaise: order.amountInPaise,
            platformFeeInPaise: order.platformFeeInPaise,
            taxInPaise: order.taxInPaise,
            discountInPaise: order.discountInPaise,
            totalAmountInPaise: order.totalAmountInPaise || order.amountInPaise,
            promoCode: order.promoCode,
            paymentStatus: order.paymentStatus,
            status: order.status,
            paymentProviderOrderId: order.paymentProviderOrderId,
            createdAt: toIsoRequired(order.createdAt),
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
      supplier: supplier
        ? {
            id: supplier.id,
            fullName: supplier.fullName,
            phone: supplier.alternateMobile,
            email: supplier.email,
            address: supplier.address,
            city: supplier.city,
            state: supplier.state,
          }
        : null,
    };
  }

  function renderInvoiceHtml(detail: Awaited<ReturnType<typeof buildInvoiceDetail>>) {
    const order = detail.order;
    const issued = new Date(detail.createdAt).toLocaleString("en-IN");
    const rows = [
      ["Water type", order?.waterType ?? "—"],
      ["Capacity", order ? `${order.capacityLitres.toLocaleString("en-IN")} L` : "—"],
      ["Vehicle", order?.vehicleNumber ?? "—"],
      ["Driver", order?.driverName ? `${order.driverName}${order.driverMobile ? ` · ${order.driverMobile}` : ""}` : "—"],
      ["Delivery address", order?.deliveryAddress ?? "—"],
      ["Base amount", formatInr(order?.amountInPaise ?? detail.amountInPaise)],
      ["Platform fee", formatInr(order?.platformFeeInPaise ?? 0)],
      ["Tax", formatInr(order?.taxInPaise ?? 0)],
      ["Discount", formatInr(order?.discountInPaise ?? 0)],
      ["Promo", order?.promoCode ?? "—"],
      ["Total paid", formatInr(order?.totalAmountInPaise ?? detail.amountInPaise)],
      ["Payment status", detail.status],
      ["Order status", order?.status?.replaceAll("_", " ") ?? "—"],
      ["Payment ref", order?.paymentProviderOrderId ?? "—"],
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
    <p class="muted">Water tanker invoice</p>
    <p><strong>${escapeHtml(detail.invoiceNumber)}</strong><br/>Issued ${escapeHtml(issued)}<br/>Order #${escapeHtml(String(detail.orderId))}</p>
    <div class="grid">
      <div class="box">
        <div class="muted">Billed to (customer)</div>
        <strong>${escapeHtml(detail.customer?.name ?? "Customer")}</strong><br/>
        ${escapeHtml(detail.customer?.phone ?? "—")}<br/>
        ${escapeHtml(detail.customer?.email ?? "")}
      </div>
      <div class="box">
        <div class="muted">Supplier</div>
        <strong>${escapeHtml(detail.supplier?.fullName ?? "Supplier")}</strong><br/>
        ${escapeHtml(detail.supplier?.phone ?? "—")}<br/>
        ${escapeHtml([detail.supplier?.address, detail.supplier?.city, detail.supplier?.state].filter(Boolean).join(", "))}
      </div>
    </div>
    <table style="width:100%;border-collapse:collapse">${tableRows}</table>
    <p class="total">Amount paid: ${escapeHtml(formatInr(detail.amountInPaise))}</p>
    <p class="muted">This is a computer-generated invoice for your tanker booking.</p>
  </div>
</body>
</html>`;
  }

  function normalizePhone(phone: string | null | undefined) {
    const digits = String(phone ?? "").replace(/\D/g, "");
    return digits.length > 10 ? digits.slice(-10) : digits;
  }

  async function ensureDriverUser(input: {
    mobile: string;
    name?: string | null;
    email?: string | null;
  }) {
    const phone = normalizePhone(input.mobile);
    if (phone.length !== 10) return null;

    let user = await userRepo.findOne({ where: { phone } });
    if (!user) {
      user = await userRepo.save(
        userRepo.create({
          phone,
          name: input.name?.trim() || null,
          email: input.email?.trim() || null,
          roles: [UserRole.TANKER_DRIVER],
          isActive: true,
        }),
      );
      return user;
    }

    const roles = new Set(user.roles);
    roles.add(UserRole.TANKER_DRIVER);
    user.roles = [...roles];
    if (!user.name && input.name?.trim()) user.name = input.name.trim();
    if (!user.email && input.email?.trim()) user.email = input.email.trim();
    return userRepo.save(user);
  }

  async function vehiclesForDriverPhone(phone: string) {
    const mobile = normalizePhone(phone);
    const rows = await vehicleRepo.find({
      where: { isActive: true },
      order: { createdAt: "DESC" },
    });
    return rows.filter((v) => normalizePhone(v.driverMobile) === mobile);
  }

  async function userCanAccessOrderAsDriverOrSupplier(userId: number, order: TankerOrderEntity) {
    const supplier = await supplierRepo.findOne({ where: { id: order.supplierId } });
    if (supplier?.userId === userId) return true;

    const user = await userRepo.findOne({ where: { id: userId } });
    if (!user) return false;
    if (normalizePhone(order.driverMobile) === normalizePhone(user.phone)) return true;

    if (order.vehicleId) {
      const vehicle = await vehicleRepo.findOne({ where: { id: order.vehicleId } });
      if (vehicle && normalizePhone(vehicle.driverMobile) === normalizePhone(user.phone)) {
        return true;
      }
    }
    return false;
  }

  async function userIsOrderDriver(userId: number, order: TankerOrderEntity) {
    const user = await userRepo.findOne({ where: { id: userId } });
    if (!user) return false;
    if (normalizePhone(order.driverMobile) === normalizePhone(user.phone)) return true;
    if (order.vehicleId) {
      const vehicle = await vehicleRepo.findOne({ where: { id: order.vehicleId } });
      if (vehicle && normalizePhone(vehicle.driverMobile) === normalizePhone(user.phone)) {
        return true;
      }
    }
    return false;
  }

  async function userCanChatOnOrder(userId: number, order: TankerOrderEntity) {
    if (order.customerUserId === userId) return "customer" as const;
    if (await userIsOrderDriver(userId, order)) return "driver" as const;
    const supplier = await supplierRepo.findOne({ where: { id: order.supplierId } });
    if (supplier?.userId === userId) return "supplier" as const;
    return null;
  }

  async function releaseExpiredUnpaidOrders(log?: { info: (obj: object, msg: string) => void }) {
    const candidates = await orderRepo.find({
      where: {
        paymentStatus: PaymentStatus.PENDING,
        status: Not(In([TankerOrderStatus.DELIVERED, TankerOrderStatus.CANCELLED])),
      },
      take: 100,
      order: { createdAt: "ASC" },
    });

    const now = Date.now();
    let released = 0;

    for (const order of candidates) {
      const dueAt = resolvePaymentDueAt(order);
      if (!dueAt || dueAt.getTime() > now) continue;

      order.status = TankerOrderStatus.CANCELLED;
      order.paymentStatus = PaymentStatus.FAILED;
      if (!order.paymentDueAt) order.paymentDueAt = dueAt;
      await orderRepo.save(order);

      if (order.vehicleId) {
        const vehicle = await vehicleRepo.findOne({ where: { id: order.vehicleId } });
        if (vehicle && vehicle.status === TankerVehicleStatus.ON_DELIVERY) {
          vehicle.status = TankerVehicleStatus.AVAILABLE;
          await vehicleRepo.save(vehicle);
        }
      }

      if (order.requestId) {
        const req = await requestRepo.findOne({ where: { id: order.requestId } });
        if (req && req.status === TankerRequestStatus.ACCEPTED) {
          req.status = TankerRequestStatus.CANCELLED;
          await requestRepo.save(req);
        }
      }

      const customer = await userRepo.findOne({ where: { id: order.customerUserId } });
      const supplier = await supplierRepo.findOne({ where: { id: order.supplierId } });
      const supplierUser = supplier
        ? await userRepo.findOne({ where: { id: supplier.userId } })
        : null;
      const driverUser = order.driverMobile
        ? await ensureDriverUser({
            mobile: order.driverMobile,
            name: order.driverName,
          })
        : null;

      const detail = [
        `Order #${order.id}`,
        order.vehicleNumber ? `Vehicle: ${order.vehicleNumber}` : null,
        `Amount: ${formatInr(order.totalAmountInPaise || order.amountInPaise)}`,
        `Address: ${order.deliveryAddress}`,
        "",
        "Payment was not completed within 10 minutes, so the tanker was released.",
      ]
        .filter(Boolean)
        .join("\n");

      const jobs: Array<Promise<unknown>> = [];
      if (customer) {
        jobs.push(
          notify(ds, {
            userId: customer.id,
            audience: "customer",
            toEmail: customer.email,
            toPhone: customer.phone,
            title: "Payment window expired — order cancelled",
            body: [
              `Hello ${customer.name ?? "Customer"},`,
              "",
              detail,
              "",
              "Please search again if you still need a tanker.",
            ].join("\n"),
            referenceType: "tanker_order",
            referenceId: order.id,
          }),
        );
      }
      if (supplier && supplierUser) {
        jobs.push(
          notify(ds, {
            userId: supplierUser.id,
            audience: "supplier",
            toEmail: supplier.email ?? supplierUser.email,
            toPhone: supplier.alternateMobile ?? supplierUser.phone,
            title: "Tanker released — customer payment timed out",
            body: [
              `Hello ${supplier.fullName},`,
              "",
              detail,
              "",
              "The vehicle is available again for new requests.",
            ].join("\n"),
            referenceType: "tanker_order",
            referenceId: order.id,
          }),
        );
      }
      if (driverUser) {
        jobs.push(
          notify(ds, {
            userId: driverUser.id,
            audience: "driver",
            toEmail: driverUser.email,
            toPhone: driverUser.phone,
            title: "Delivery cancelled — payment timed out",
            body: [
              `Hello ${order.driverName || driverUser.name || "Driver"},`,
              "",
              detail,
              "",
              "This assignment is cancelled. Wait for the next job.",
            ].join("\n"),
            referenceType: "tanker_order",
            referenceId: order.id,
          }),
        );
      }
      await Promise.allSettled(jobs);
      released += 1;
    }

    if (released > 0) {
      log?.info({ released }, "Released tankers after unpaid payment timeout");
    }
    return released;
  }

  async function computeFees(amountInPaise: number, promoCode?: string | null) {
    const platformFeeSetting = await platformFeeRepo.findOne({
      where: { isActive: true },
      order: { createdAt: "DESC" },
    });

    let platformFeeInPaise = 0;
    if (platformFeeSetting) {
      if (
        platformFeeSetting.feeType === "percentage" ||
        platformFeeSetting.feeType === "both"
      ) {
        platformFeeInPaise += Math.round(
          (amountInPaise * platformFeeSetting.percentageBps) / 10000,
        );
      }
      if (platformFeeSetting.feeType === "flat" || platformFeeSetting.feeType === "both") {
        platformFeeInPaise += platformFeeSetting.flatFeeInPaise;
      }
    } else {
      platformFeeInPaise = Math.round(amountInPaise * 0.1);
    }

    const taxSetting = await taxRepo.findOne({
      where: { isActive: true },
      order: { createdAt: "DESC" },
    });
    const taxBps = taxSetting?.taxBps ?? 0;

    let discountInPaise = 0;
    let appliedPromoCode: string | null = null;

    if (promoCode) {
      const promo = await promoRepo.findOne({
        where: { code: promoCode.toUpperCase() },
      });
      if (promo && isPromoValid(promo, amountInPaise)) {
        discountInPaise = computePromoDiscount(promo, amountInPaise);
        appliedPromoCode = promo.code;
      }
    }

    const taxableBase = amountInPaise - discountInPaise;
    const taxInPaise = Math.round((taxableBase * taxBps) / 10000);
    const totalAmountInPaise = taxableBase + platformFeeInPaise + taxInPaise;

    return {
      platformFeeInPaise,
      taxInPaise,
      discountInPaise,
      totalAmountInPaise,
      promoCode: appliedPromoCode,
    };
  }

  async function updateOrderDriverLocation(
    orderId: number,
    latitude: number,
    longitude: number,
  ): Promise<TankerOrderEntity | null> {
    const order = await orderRepo.findOne({ where: { id: orderId } });
    if (!order) return null;

    order.driverLatitude = latitude;
    order.driverLongitude = longitude;
    order.driverLocationUpdatedAt = new Date();
    const saved = await orderRepo.save(order);

    if (io) {
      io.to(`order:${String(orderId)}`).emit("driverLocation", {
        orderId: String(orderId),
        latitude,
        longitude,
        updatedAt: toIsoRequired(saved.driverLocationUpdatedAt!),
      });
    }

    return saved;
  }

  function requireUserId(headers: Record<string, unknown>) {
    return parseUserIdFromHeaders(headers);
  }

  await createService({
    name: "tanker",
    port: envInt("TANKER_PORT", 3007),
    afterReady: async (app) => {
      await ds.query(`
        CREATE TABLE IF NOT EXISTS tanker_order_messages (
          id SERIAL PRIMARY KEY,
          order_id INT NOT NULL,
          sender_user_id INT NOT NULL,
          body TEXT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await ds.query(`
        CREATE INDEX IF NOT EXISTS idx_tanker_order_messages_order_id
        ON tanker_order_messages (order_id)
      `);
      await ds.query(`
        CREATE INDEX IF NOT EXISTS idx_tanker_order_messages_sender_user_id
        ON tanker_order_messages (sender_user_id)
      `);

      io = new Server(app.server, { cors: { origin: true } });
      io.on("connection", (socket) => {
        socket.on("trackDriver", (data: { orderId?: string | number }) => {
          if (data?.orderId != null && String(data.orderId)) {
            socket.join(`order:${String(data.orderId)}`);
          }
        });
        socket.on("stopTracking", (data: { orderId?: string | number }) => {
          if (data?.orderId != null && String(data.orderId)) {
            socket.leave(`order:${String(data.orderId)}`);
          }
        });
        socket.on(
          "driverLocationUpdate",
          async (data: { orderId?: string | number; latitude?: number; longitude?: number }) => {
            if (
              data?.orderId == null ||
              data.latitude == null ||
              data.longitude == null
            ) {
              return;
            }
            try {
              await updateOrderDriverLocation(
                parseEntityId(String(data.orderId)),
                Number(data.latitude),
                Number(data.longitude),
              );
            } catch (err) {
              app.log.warn({ err, data }, "driverLocationUpdate failed");
            }
          },
        );
      });

      const paymentWatch = setInterval(() => {
        void releaseExpiredUnpaidOrders(app.log).catch((err) => {
          app.log.error({ err }, "Failed to release unpaid tanker orders");
        });
      }, 30_000);
      paymentWatch.unref?.();
      void releaseExpiredUnpaidOrders(app.log);
    },
    registerRoutes: async (app) => {
      app.get("/v1/tanker/stats", async () => {
        const [suppliers, vehicles, requestsPending, ordersActive, ordersDelivered] =
          await Promise.all([
            supplierRepo.count(),
            vehicleRepo.count(),
            requestRepo.count({ where: { status: TankerRequestStatus.PENDING } }),
            orderRepo.count({
              where: {
                status: Not(
                  In([TankerOrderStatus.DELIVERED, TankerOrderStatus.CANCELLED]),
                ),
              },
            }),
            orderRepo.count({ where: { status: TankerOrderStatus.DELIVERED } }),
          ]);

        return {
          suppliers,
          vehicles,
          requestsPending,
          ordersActive,
          ordersDelivered,
        };
      });

      app.get("/v1/tanker/users/me", async (request, reply) => {
        const userId = parseUserIdFromHeaders(request.headers as Record<string, unknown>);
        if (!userId) {
          return reply.code(401).send({
            error: { code: "UNAUTHORIZED", message: "Login required" },
          });
        }
        const user = await userRepo.findOne({ where: { id: userId } });
        if (!user) {
          return reply.code(404).send({
            error: { code: "NOT_FOUND", message: "User not found" },
          });
        }
        return serializeTankerUser(user);
      });

      app.post("/v1/tanker/users/me/signup", async (request, reply) => {
        const userId = parseUserIdFromHeaders(request.headers as Record<string, unknown>);
        if (!userId) {
          return reply.code(401).send({
            error: { code: "UNAUTHORIZED", message: "Login required" },
          });
        }
        const user = await userRepo.findOne({ where: { id: userId } });
        if (!user) {
          return reply.code(404).send({
            error: { code: "NOT_FOUND", message: "User not found" },
          });
        }

        const body = tankerUserSignupSchema.parse(request.body);

        if (user.name && user.email) {
          return reply.code(409).send({
            error: {
              code: "ALREADY_REGISTERED",
              message: "This account is already registered. Please login instead.",
            },
          });
        }

        const conflict = await findTankerUserConflict(userRepo, {
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
        if (body.intent === "customer") {
          roles.add(UserRole.CUSTOMER);
        } else {
          roles.add(UserRole.TANKER_SUPPLIER);
          roles.add(UserRole.CUSTOMER);
        }
        user.roles = [...roles];

        return serializeTankerUser(await userRepo.save(user));
      });

      app.get("/v1/tanker/users", async (request) => {
        const query = paginationQuerySchema.parse(request.query);
        const raw = request.query as { role?: string };
        const qb = userRepo.createQueryBuilder("u").orderBy("u.created_at", "DESC");

        if (
          raw.role === UserRole.TANKER_SUPPLIER ||
          raw.role === UserRole.TANKER_DRIVER ||
          raw.role === UserRole.CUSTOMER ||
          raw.role === UserRole.TANKER_SUPER_ADMIN
        ) {
          qb.andWhere(`:role = ANY(u.roles)`, { role: raw.role });
        } else {
          qb.andWhere(
            `(:customer = ANY(u.roles) OR :supplier = ANY(u.roles) OR :driver = ANY(u.roles) OR :admin = ANY(u.roles))`,
            {
              customer: UserRole.CUSTOMER,
              supplier: UserRole.TANKER_SUPPLIER,
              driver: UserRole.TANKER_DRIVER,
              admin: UserRole.TANKER_SUPER_ADMIN,
            },
          );
        }

        if (query.q) {
          qb.andWhere(
            `(u.phone ILIKE :q OR COALESCE(u.name,'') ILIKE :q OR COALESCE(u.email,'') ILIKE :q)`,
            { q: `%${query.q}%` },
          );
        }

        const total = await qb.getCount();
        const rows = await qb.skip((query.page - 1) * query.limit).take(query.limit).getMany();
        return {
          items: rows.map(serializeTankerUser),
          page: query.page,
          limit: query.limit,
          total,
          totalPages: Math.max(1, Math.ceil(total / query.limit)),
        };
      });

      app.patch("/v1/tanker/users/:id", async (request, reply) => {
        const id = parseEntityId((request.params as { id: string }).id);
        const body = updateTankerUserAdminSchema.parse(request.body);
        const user = await userRepo.findOne({ where: { id } });
        if (!user) {
          return reply.code(404).send({ error: { code: "NOT_FOUND", message: "User not found" } });
        }

        const conflict = await findTankerUserConflict(userRepo, {
          phone: body.phone,
          email: body.email,
          excludeId: id,
        });
        if (conflict) {
          return reply.code(409).send({
            error: { code: "DUPLICATE_USER", message: conflict.message, field: conflict.field },
          });
        }

        const beforeRoles = [...(user.roles ?? [])];

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

        const saved = await userRepo.save(user);
        const isDriver =
          saved.roles.includes(UserRole.TANKER_DRIVER) ||
          beforeRoles.includes(UserRole.TANKER_DRIVER);

        if (isDriver) {
          const linked = await vehiclesForDriverPhone(saved.phone);
          void notifyTankerAdmins(ds, {
            title: "Driver details updated",
            body: [
              "A tanker driver's account details were updated.",
              "",
              `Driver #${saved.id}: ${saved.name ?? "—"}`,
              `Mobile: ${saved.phone}`,
              `Email: ${saved.email ?? "—"}`,
              `City: ${saved.city ?? "—"}, ${saved.state ?? "—"} ${saved.pinCode ?? ""}`.trim(),
              `Roles: ${saved.roles.join(", ")}`,
              `Status: ${saved.isActive ? "active" : "inactive"}`,
              linked.length > 0
                ? `\nLinked tankers:\n${linked
                    .map((v) => `• ${v.vehicleNumber} (supplier #${v.supplierId})`)
                    .join("\n")}`
                : "\nNo active tankers linked to this mobile.",
            ].join("\n"),
            referenceType: "tanker_driver",
            referenceId: saved.id,
          });
        }

        return serializeTankerUser(saved);
      });

      app.patch("/v1/tanker/users/:id/status", async (request, reply) => {
        const id = parseEntityId((request.params as { id: string }).id);
        const body = updateUserStatusSchema.parse(request.body);
        const user = await userRepo.findOne({ where: { id } });
        if (!user) {
          return reply.code(404).send({ error: { code: "NOT_FOUND", message: "User not found" } });
        }
        user.isActive = body.isActive;
        return serializeTankerUser(await userRepo.save(user));
      });

      app.delete("/v1/tanker/users/:id", async (request, reply) => {
        const id = parseEntityId((request.params as { id: string }).id);
        const user = await userRepo.findOne({ where: { id } });
        if (!user) {
          return reply.code(404).send({ error: { code: "NOT_FOUND", message: "User not found" } });
        }
        try {
          await userRepo.delete({ id });
        } catch (err) {
          app.log.error({ err, id }, "Tanker user delete failed");
          return reply.code(409).send({
            error: {
              code: "DELETE_BLOCKED",
              message: "Cannot delete this user because related records exist. Deactivate instead.",
            },
          });
        }
        return reply.code(204).send();
      });

      app.post("/v1/tanker/suppliers/me", async (request, reply) => {
        const userId = parseUserIdFromHeaders(request.headers as Record<string, unknown>);
        if (!userId) {
          return reply.code(401).send({
            error: { code: "UNAUTHORIZED", message: "Login required" },
          });
        }

        const user = await userRepo.findOne({ where: { id: userId } });
        if (!user) {
          return reply.code(401).send({
            error: { code: "UNAUTHORIZED", message: "User not found" },
          });
        }

        const existing = await supplierRepo.findOne({ where: { userId } });
        if (existing) {
          return reply.code(400).send({
            error: { code: "ALREADY_EXISTS", message: "Supplier profile already exists" },
          });
        }

        const body = createTankerSupplierSchema.parse(request.body);
        const saved = await supplierRepo.save(
          supplierRepo.create({
            userId,
            fullName: body.fullName,
            email: body.email ?? null,
            alternateMobile: body.alternateMobile ?? null,
            address: body.address,
            landmark: body.landmark ?? null,
            city: body.city,
            state: body.state,
            country: body.country ?? "IN",
            pinCode: body.pinCode,
            availabilityStartTime: body.availabilityStartTime ?? "06:00",
            availabilityEndTime: body.availabilityEndTime ?? "22:00",
            latitude: body.latitude ?? null,
            longitude: body.longitude ?? null,
            proofUrl: body.proofUrl ?? null,
            isOnline: true,
            isActive: true,
          }),
        );

        void notifyTankerAdmins(ds, {
          title: "New water tanker supplier registered",
          body: [
            "A supplier created their profile (without fleet yet).",
            "",
            formatSupplierSummary(saved),
            user.phone ? `Login mobile: ${user.phone}` : null,
          ]
            .filter(Boolean)
            .join("\n"),
          referenceType: "tanker_supplier",
          referenceId: saved.id,
        });

        // Profile only — role assignment is handled separately
        return reply.code(201).send(serializeSupplier(saved));
      });

      /** Full signup: supplier profile + tanker/driver fleet (old Tanker_Web parity). */
      app.post("/v1/tanker/suppliers/register", async (request, reply) => {
        const userId = parseUserIdFromHeaders(request.headers as Record<string, unknown>);
        if (!userId) {
          return reply.code(401).send({
            error: { code: "UNAUTHORIZED", message: "Login required" },
          });
        }

        const user = await userRepo.findOne({ where: { id: userId } });
        if (!user) {
          return reply.code(401).send({
            error: { code: "UNAUTHORIZED", message: "User not found" },
          });
        }

        const existing = await supplierRepo.findOne({ where: { userId } });
        if (existing) {
          return reply.code(400).send({
            error: { code: "ALREADY_EXISTS", message: "Supplier profile already exists" },
          });
        }

        const body = registerTankerSupplierSchema.parse(request.body);

        for (const v of body.vehicles) {
          const duplicate = await vehicleRepo.findOne({
            where: { vehicleNumber: v.vehicleNumber },
          });
          if (duplicate) {
            return reply.code(400).send({
              error: {
                code: "DUPLICATE_VEHICLE",
                message: `Vehicle number ${v.vehicleNumber} is already registered`,
              },
            });
          }
        }

        const supplier = await supplierRepo.save(
          supplierRepo.create({
            userId,
            fullName: body.fullName,
            email: body.email ?? null,
            alternateMobile: body.alternateMobile ?? null,
            address: body.address,
            landmark: body.landmark ?? null,
            city: body.city,
            state: body.state,
            country: body.country ?? "IN",
            pinCode: body.pinCode,
            availabilityStartTime: body.availabilityStartTime ?? "06:00",
            availabilityEndTime: body.availabilityEndTime ?? "22:00",
            latitude: body.latitude ?? null,
            longitude: body.longitude ?? null,
            proofUrl: body.proofUrl ?? null,
            isOnline: true,
            isActive: true,
          }),
        );

        const vehicles = [];
        for (const v of body.vehicles) {
          const savedVehicle = await vehicleRepo.save(
            vehicleRepo.create({
              supplierId: supplier.id,
              driverFullName: v.driverFullName,
              driverMobile: v.driverMobile,
              driverEmail: v.driverEmail ?? null,
              vehicleNumber: v.vehicleNumber,
              capacityLitres: v.capacityLitres,
              amountInPaise: v.amountInPaise,
              waterType: v.waterType ?? "drinking",
              status: TankerVehicleStatus.AVAILABLE,
              licenceFrontUrl: v.licenceFrontUrl,
              licenceBackUrl: v.licenceBackUrl,
              tankerImageUrl: v.tankerImageUrl ?? null,
              latitude: body.latitude ?? null,
              longitude: body.longitude ?? null,
              isActive: true,
            }),
          );
          await ensureDriverUser({
            mobile: v.driverMobile,
            name: v.driverFullName,
            email: v.driverEmail ?? null,
          });
          vehicles.push(serializeVehicle(savedVehicle));
        }

        const fleetLines = vehicles
          .map(
            (v, i) =>
              `${i + 1}. ${v.vehicleNumber} · ${v.capacityLitres} L · ${v.waterType} · driver ${v.driverFullName} (${v.driverMobile})`,
          )
          .join("\n");

        void notifyTankerAdmins(ds, {
          title: "New water tanker supplier registered",
          body: [
            "A supplier completed registration with fleet details.",
            "",
            formatSupplierSummary(supplier),
            user.phone ? `Login mobile: ${user.phone}` : null,
            "",
            `Tankers added (${vehicles.length}):`,
            fleetLines || "—",
          ]
            .filter(Boolean)
            .join("\n"),
          referenceType: "tanker_supplier",
          referenceId: supplier.id,
        });

        return reply.code(201).send({
          supplier: serializeSupplier(supplier),
          vehicles,
        });
      });

      app.get("/v1/tanker/suppliers/me", async (request, reply) => {
        const userId = parseUserIdFromHeaders(request.headers as Record<string, unknown>);
        if (!userId) {
          return reply.code(401).send({
            error: { code: "UNAUTHORIZED", message: "Login required" },
          });
        }

        const row = await supplierRepo.findOne({ where: { userId } });
        if (!row) {
          return reply.code(404).send({
            error: { code: "NOT_FOUND", message: "Supplier profile not found" },
          });
        }
        return serializeSupplier(row);
      });

      app.patch("/v1/tanker/suppliers/me", async (request, reply) => {
        const userId = parseUserIdFromHeaders(request.headers as Record<string, unknown>);
        if (!userId) {
          return reply.code(401).send({
            error: { code: "UNAUTHORIZED", message: "Login required" },
          });
        }

        const row = await supplierRepo.findOne({ where: { userId } });
        if (!row) {
          return reply.code(404).send({
            error: { code: "NOT_FOUND", message: "Supplier profile not found" },
          });
        }

        const body = createTankerSupplierSchema.partial().parse(request.body);
        if (body.fullName !== undefined) row.fullName = body.fullName;
        if (body.email !== undefined) row.email = body.email ?? null;
        if (body.alternateMobile !== undefined) row.alternateMobile = body.alternateMobile ?? null;
        if (body.address !== undefined) row.address = body.address;
        if (body.landmark !== undefined) row.landmark = body.landmark ?? null;
        if (body.city !== undefined) row.city = body.city;
        if (body.state !== undefined) row.state = body.state;
        if (body.country !== undefined) row.country = body.country;
        if (body.pinCode !== undefined) row.pinCode = body.pinCode;
        if (body.availabilityStartTime !== undefined) {
          row.availabilityStartTime = body.availabilityStartTime;
        }
        if (body.availabilityEndTime !== undefined) row.availabilityEndTime = body.availabilityEndTime;
        if (body.latitude !== undefined) row.latitude = body.latitude ?? null;
        if (body.longitude !== undefined) row.longitude = body.longitude ?? null;
        if (body.proofUrl !== undefined) row.proofUrl = body.proofUrl ?? null;

        const saved = await supplierRepo.save(row);

        void notifyTankerAdmins(ds, {
          title: "Supplier profile updated",
          body: [
            "A water tanker supplier updated their profile.",
            "",
            formatSupplierSummary(saved),
          ].join("\n"),
          referenceType: "tanker_supplier",
          referenceId: saved.id,
        });

        return serializeSupplier(saved);
      });

      app.patch("/v1/tanker/suppliers/me/online", async (request, reply) => {
        const userId = parseUserIdFromHeaders(request.headers as Record<string, unknown>);
        if (!userId) {
          return reply.code(401).send({
            error: { code: "UNAUTHORIZED", message: "Login required" },
          });
        }

        const body = updateTankerSupplierOnlineSchema.parse(request.body);
        const row = await supplierRepo.findOne({ where: { userId } });
        if (!row) {
          return reply.code(404).send({
            error: { code: "NOT_FOUND", message: "Supplier profile not found" },
          });
        }

        row.isOnline = body.isOnline;
        const saved = await supplierRepo.save(row);
        return serializeSupplier(saved);
      });

      app.get("/v1/tanker/suppliers", async (request) => {
        const query = paginationQuerySchema.parse(request.query);
        const raw = request.query as { online?: string };
        const qb = supplierRepo.createQueryBuilder("s").orderBy("s.created_at", "DESC");

        if (raw.online === "true") {
          qb.andWhere("s.is_online = true");
        } else if (raw.online === "false") {
          qb.andWhere("s.is_online = false");
        }

        if (query.q) {
          qb.andWhere(
            `(s.full_name ILIKE :q OR s.city ILIKE :q OR s.pin_code ILIKE :q OR s.address ILIKE :q OR COALESCE(s.email, '') ILIKE :q)`,
            { q: `%${query.q}%` },
          );
        }

        const total = await qb.getCount();
        const rows = await qb.skip((query.page - 1) * query.limit).take(query.limit).getMany();
        return {
          items: rows.map(serializeSupplier),
          page: query.page,
          limit: query.limit,
          total,
          totalPages: Math.max(1, Math.ceil(total / query.limit)),
        };
      });

      app.get("/v1/tanker/suppliers/nearby", async (request, reply) => {
        const parsed = nearbyQuerySchema.safeParse(request.query);
        if (!parsed.success) {
          return reply.code(400).send({
            error: {
              code: "INVALID_QUERY",
              message: "lat and lng are required",
              details: parsed.error.flatten(),
            },
          });
        }

        const { lat, lng, radiusKm } = parsed.data;
        const rows = await supplierRepo.find({
          where: { isActive: true, isOnline: true },
          order: { createdAt: "DESC" },
        });

        const items = rows
          .filter((s) => s.latitude != null && s.longitude != null)
          .map((s) => ({
            supplier: serializeSupplier(s),
            distanceKm: haversineKm(lat, lng, s.latitude!, s.longitude!),
          }))
          .filter((x) => x.distanceKm <= radiusKm)
          .sort((a, b) => a.distanceKm - b.distanceKm);

        return { items, lat, lng, radiusKm };
      });

      /**
       * Customer search: only suppliers whose availability window covers the
       * requested time and who have an available vehicle matching water type + capacity.
       */
      app.get("/v1/tanker/suppliers/search", async (request, reply) => {
        const parsed = searchTankerSuppliersSchema.safeParse(request.query);
        if (!parsed.success) {
          return reply.code(400).send({
            error: {
              code: "INVALID_QUERY",
              message:
                "waterType, quantityLitres, deliveryDate (YYYY-MM-DD), and deliveryTime (HH:mm) are required",
              details: parsed.error.flatten(),
            },
          });
        }

        const { waterType, quantityLitres, deliveryDate, deliveryTime, lat, lng, radiusKm } =
          parsed.data;

        const suppliers = await supplierRepo.find({
          where: { isActive: true },
          order: { createdAt: "DESC" },
        });

        const inWindow = suppliers.filter((s) =>
          isTimeWithinAvailability(deliveryTime, s.availabilityStartTime, s.availabilityEndTime),
        );

        if (inWindow.length === 0) {
          return {
            items: [],
            filters: { waterType, quantityLitres, deliveryDate, deliveryTime, lat, lng, radiusKm },
            message: "No suppliers are available at the selected date and time.",
          };
        }

        const supplierIds = inWindow.map((s) => s.id);
        const vehicles = await vehicleRepo.find({
          where: {
            supplierId: In(supplierIds),
            isActive: true,
            status: TankerVehicleStatus.AVAILABLE,
          },
        });

        const matchingBySupplier = new Map<number, TankerVehicleEntity[]>();
        for (const v of vehicles) {
          if (!waterTypesMatch(waterType, v.waterType)) continue;
          if (v.capacityLitres < quantityLitres) continue;
          const list = matchingBySupplier.get(v.supplierId) ?? [];
          list.push(v);
          matchingBySupplier.set(v.supplierId, list);
        }

        type SearchItem = {
          supplier: ReturnType<typeof serializeSupplier>;
          matchingVehicles: ReturnType<typeof serializeVehicle>[];
          distanceKm: number | null;
        };

        let items: SearchItem[] = inWindow
          .filter((s) => matchingBySupplier.has(s.id))
          .map((s) => {
            const matchVehicles = matchingBySupplier.get(s.id) ?? [];
            let distanceKm: number | null = null;
            if (lat != null && lng != null && s.latitude != null && s.longitude != null) {
              distanceKm = haversineKm(lat, lng, s.latitude, s.longitude);
            }
            return {
              supplier: serializeSupplier(s),
              matchingVehicles: matchVehicles
                .sort((a, b) => a.amountInPaise - b.amountInPaise)
                .map(serializeVehicle),
              distanceKm,
            };
          });

        if (lat != null && lng != null) {
          items = items
            .filter((x) => x.distanceKm == null || x.distanceKm <= radiusKm)
            .sort((a, b) => {
              if (a.distanceKm == null && b.distanceKm == null) return 0;
              if (a.distanceKm == null) return 1;
              if (b.distanceKm == null) return -1;
              return a.distanceKm - b.distanceKm;
            });
        } else {
          items.sort((a, b) => a.supplier.fullName.localeCompare(b.supplier.fullName));
        }

        return {
          items,
          filters: { waterType, quantityLitres, deliveryDate, deliveryTime, lat, lng, radiusKm },
          message:
            items.length === 0
              ? "No tankers match your water type, quantity, and availability window."
              : undefined,
        };
      });

      app.post("/v1/tanker/vehicles", async (request, reply) => {
        const userId = parseUserIdFromHeaders(request.headers as Record<string, unknown>);
        if (!userId) {
          return reply.code(401).send({
            error: { code: "UNAUTHORIZED", message: "Login required" },
          });
        }

        const supplier = await supplierRepo.findOne({ where: { userId } });
        if (!supplier) {
          return reply.code(403).send({
            error: { code: "FORBIDDEN", message: "Create a supplier profile first" },
          });
        }

        const body = createTankerVehicleSchema.parse(request.body);
        const duplicate = await vehicleRepo.findOne({
          where: { vehicleNumber: body.vehicleNumber },
        });
        if (duplicate) {
          return reply.code(400).send({
            error: { code: "DUPLICATE_VEHICLE", message: "Vehicle number already registered" },
          });
        }

        const saved = await vehicleRepo.save(
          vehicleRepo.create({
            supplierId: supplier.id,
            driverFullName: body.driverFullName,
            driverMobile: body.driverMobile,
            driverEmail: body.driverEmail ?? null,
            vehicleNumber: body.vehicleNumber,
            capacityLitres: body.capacityLitres,
            amountInPaise: body.amountInPaise,
            waterType: body.waterType ?? "drinking",
            status: body.status ?? TankerVehicleStatus.AVAILABLE,
            licenceFrontUrl: body.licenceFrontUrl ?? null,
            licenceBackUrl: body.licenceBackUrl ?? null,
            tankerImageUrl: body.tankerImageUrl ?? null,
            latitude: supplier.latitude,
            longitude: supplier.longitude,
            isActive: true,
          }),
        );

        await ensureDriverUser({
          mobile: body.driverMobile,
          name: body.driverFullName,
          email: body.driverEmail ?? null,
        });

        void notifyTankerAdmins(ds, {
          title: "New tanker added",
          body: [
            "A supplier added a new tanker to their fleet.",
            "",
            formatSupplierSummary(supplier),
            "",
            formatVehicleSummary(saved),
          ].join("\n"),
          referenceType: "tanker_vehicle",
          referenceId: saved.id,
        });

        return reply.code(201).send(serializeVehicle(saved));
      });

      app.post("/v1/tanker/driver/claim", async (request, reply) => {
        const userId = parseUserIdFromHeaders(request.headers as Record<string, unknown>);
        if (!userId) {
          return reply.code(401).send({
            error: { code: "UNAUTHORIZED", message: "Login required" },
          });
        }

        const user = await userRepo.findOne({ where: { id: userId } });
        if (!user) {
          return reply.code(404).send({
            error: { code: "NOT_FOUND", message: "User not found" },
          });
        }

        if (user.roles.includes(UserRole.TANKER_DRIVER)) {
          const vehicles = await vehiclesForDriverPhone(user.phone);
          return {
            ok: true,
            roleGranted: false,
            vehiclesLinked: vehicles.length,
            message: "Already a tanker driver",
          };
        }

        const vehicles = await vehiclesForDriverPhone(user.phone);
        if (vehicles.length === 0) {
          return reply.code(403).send({
            error: {
              code: "DRIVER_NOT_LINKED",
              message:
                "No tanker assigned to this mobile. Sign up as Driver, or ask your supplier to add this number on a vehicle.",
            },
          });
        }

        await ensureDriverUser({
          mobile: user.phone,
          name: user.name ?? vehicles[0]?.driverFullName,
          email: user.email ?? vehicles[0]?.driverEmail,
        });

        return {
          ok: true,
          roleGranted: true,
          vehiclesLinked: vehicles.length,
          message: "Driver role granted from assigned vehicle",
        };
      });

      app.get("/v1/tanker/driver/me", async (request, reply) => {
        await releaseExpiredUnpaidOrders(app.log);
        const userId = parseUserIdFromHeaders(request.headers as Record<string, unknown>);
        if (!userId) {
          return reply.code(401).send({
            error: { code: "UNAUTHORIZED", message: "Login required" },
          });
        }

        const user = await userRepo.findOne({ where: { id: userId } });
        if (!user) {
          return reply.code(404).send({
            error: { code: "NOT_FOUND", message: "User not found" },
          });
        }

        if (!user.roles.includes(UserRole.TANKER_DRIVER)) {
          const linked = await vehiclesForDriverPhone(user.phone);
          if (linked.length > 0) {
            await ensureDriverUser({
              mobile: user.phone,
              name: user.name ?? linked[0]?.driverFullName,
              email: user.email ?? linked[0]?.driverEmail,
            });
          } else {
            return reply.code(403).send({
              error: {
                code: "FORBIDDEN",
                message: "Driver role required",
              },
            });
          }
        }

        const vehicles = await vehiclesForDriverPhone(user.phone);
        const vehicleIds = vehicles.map((v) => v.id);
        const mobile = normalizePhone(user.phone);

        const qb = orderRepo
          .createQueryBuilder("o")
          .orderBy("o.created_at", "DESC")
          .take(100);

        if (vehicleIds.length > 0) {
          qb.where(
            "(o.vehicle_id IN (:...vehicleIds) OR regexp_replace(COALESCE(o.driver_mobile, ''), '\\D', '', 'g') LIKE :mobileSuffix)",
            {
              vehicleIds,
              mobileSuffix: `%${mobile}`,
            },
          );
        } else {
          qb.where("regexp_replace(COALESCE(o.driver_mobile, ''), '\\D', '', 'g') LIKE :mobileSuffix", {
            mobileSuffix: `%${mobile}`,
          });
        }

        const orders = await qb.getMany();

        return {
          phone: user.phone,
          name: user.name,
          vehicles: vehicles.map(serializeVehicle),
          orders: orders.map(serializeOrder),
        };
      });

      app.get("/v1/tanker/vehicles", async (request) => {
        const query = paginationQuerySchema.parse(request.query);
        const raw = request.query as { supplierId?: string };
        const userId = parseUserIdFromHeaders(request.headers as Record<string, unknown>);
        const roles = getRolesFromHeaders(request.headers as Record<string, unknown>);

        const qb = vehicleRepo.createQueryBuilder("v").orderBy("v.created_at", "DESC");

        if (raw.supplierId) {
          qb.andWhere("v.supplier_id = :supplierId", { supplierId: raw.supplierId });
        } else if (userId && roles.includes(UserRole.TANKER_SUPPLIER)) {
          const me = await supplierRepo.findOne({ where: { userId } });
          qb.andWhere("v.supplier_id = :supplierId", {
            supplierId: me?.id ?? 0,
          });
        }

        if (query.q) {
          qb.andWhere(
            `(v.vehicle_number ILIKE :q OR v.driver_full_name ILIKE :q OR v.driver_mobile ILIKE :q OR v.water_type ILIKE :q)`,
            { q: `%${query.q}%` },
          );
        }

        const total = await qb.getCount();
        const rows = await qb.skip((query.page - 1) * query.limit).take(query.limit).getMany();
        return {
          items: rows.map(serializeVehicle),
          page: query.page,
          limit: query.limit,
          total,
          totalPages: Math.max(1, Math.ceil(total / query.limit)),
        };
      });

      app.patch("/v1/tanker/vehicles/:id", async (request, reply) => {
        const id = parseEntityId((request.params as { id: string }).id);
        const userId = parseUserIdFromHeaders(request.headers as Record<string, unknown>);
        if (!userId) {
          return reply.code(401).send({
            error: { code: "UNAUTHORIZED", message: "Login required" },
          });
        }

        const vehicle = await vehicleRepo.findOne({ where: { id } });
        if (!vehicle) {
          return reply.code(404).send({
            error: { code: "NOT_FOUND", message: "Vehicle not found" },
          });
        }

        const supplier = await supplierRepo.findOne({ where: { id: vehicle.supplierId } });
        if (!supplier || supplier.userId !== userId) {
          return reply.code(403).send({
            error: { code: "FORBIDDEN", message: "Not your vehicle" },
          });
        }

        const body = updateTankerVehicleSchema.parse(request.body);
        const before = {
          driverFullName: vehicle.driverFullName,
          driverMobile: vehicle.driverMobile,
          driverEmail: vehicle.driverEmail,
          capacityLitres: vehicle.capacityLitres,
          amountInPaise: vehicle.amountInPaise,
          waterType: vehicle.waterType,
          status: vehicle.status,
          isActive: vehicle.isActive,
        };
        Object.assign(vehicle, body);
        const saved = await vehicleRepo.save(vehicle);

        const driverChanged = Boolean(
          body.driverMobile || body.driverFullName || body.driverEmail !== undefined,
        );
        if (driverChanged) {
          await ensureDriverUser({
            mobile: saved.driverMobile,
            name: saved.driverFullName,
            email: saved.driverEmail,
          });
        }

        const changeLines: string[] = [];
        if (body.driverFullName !== undefined && body.driverFullName !== before.driverFullName) {
          changeLines.push(`Driver name: ${before.driverFullName} → ${saved.driverFullName}`);
        }
        if (body.driverMobile !== undefined && body.driverMobile !== before.driverMobile) {
          changeLines.push(`Driver mobile: ${before.driverMobile} → ${saved.driverMobile}`);
        }
        if (body.driverEmail !== undefined && body.driverEmail !== before.driverEmail) {
          changeLines.push(
            `Driver email: ${before.driverEmail ?? "—"} → ${saved.driverEmail ?? "—"}`,
          );
        }
        if (body.capacityLitres !== undefined && body.capacityLitres !== before.capacityLitres) {
          changeLines.push(`Capacity: ${before.capacityLitres} L → ${saved.capacityLitres} L`);
        }
        if (body.amountInPaise !== undefined && body.amountInPaise !== before.amountInPaise) {
          changeLines.push(
            `Rate: ${formatInr(before.amountInPaise)} → ${formatInr(saved.amountInPaise)}`,
          );
        }
        if (body.waterType !== undefined && body.waterType !== before.waterType) {
          changeLines.push(`Water type: ${before.waterType} → ${saved.waterType}`);
        }
        if (body.status !== undefined && body.status !== before.status) {
          changeLines.push(
            `Status: ${before.status.replaceAll("_", " ")} → ${saved.status.replaceAll("_", " ")}`,
          );
        }
        if (body.isActive !== undefined && body.isActive !== before.isActive) {
          changeLines.push(`Active: ${before.isActive ? "yes" : "no"} → ${saved.isActive ? "yes" : "no"}`);
        }

        void notifyTankerAdmins(ds, {
          title: driverChanged ? "Driver details updated on tanker" : "Tanker updated",
          body: [
            driverChanged
              ? "Driver / tanker details were updated by a supplier."
              : "A tanker in the fleet was updated.",
            "",
            formatSupplierSummary(supplier),
            "",
            formatVehicleSummary(saved),
            changeLines.length > 0 ? `\nChanges:\n${changeLines.join("\n")}` : null,
          ]
            .filter(Boolean)
            .join("\n"),
          referenceType: "tanker_vehicle",
          referenceId: saved.id,
        });

        return serializeVehicle(saved);
      });

      app.post("/v1/tanker/requests", async (request, reply) => {
        const userId = parseUserIdFromHeaders(request.headers as Record<string, unknown>);
        if (!userId) {
          return reply.code(401).send({
            error: { code: "UNAUTHORIZED", message: "Login required" },
          });
        }

        const body = createTankerRequestSchema.parse(request.body);

        if (body.supplierId) {
          const supplier = await supplierRepo.findOne({ where: { id: body.supplierId } });
          if (!supplier) {
            return reply.code(404).send({
              error: { code: "NOT_FOUND", message: "Supplier not found" },
            });
          }
          if (body.preferredDeliveryAt) {
            const preferred = new Date(body.preferredDeliveryAt);
            const deliveryTime = preferred.toLocaleTimeString("en-GB", {
              hour: "2-digit",
              minute: "2-digit",
              hour12: false,
              timeZone: "Asia/Kolkata",
            });
            if (
              !isTimeWithinAvailability(
                deliveryTime,
                supplier.availabilityStartTime,
                supplier.availabilityEndTime,
              )
            ) {
              return reply.code(400).send({
                error: {
                  code: "OUTSIDE_AVAILABILITY",
                  message: `Selected time is outside this supplier's hours (${supplier.availabilityStartTime}–${supplier.availabilityEndTime}).`,
                },
              });
            }
          }
        }

        const saved = await requestRepo.save(
          requestRepo.create({
            customerUserId: userId,
            supplierId: body.supplierId ?? null,
            waterType: body.waterType ?? "drinking",
            quantityLitres: body.quantityLitres,
            comments: body.comments ?? null,
            deliveryAddress: body.deliveryAddress,
            preferredDeliveryAt: body.preferredDeliveryAt
              ? new Date(body.preferredDeliveryAt)
              : null,
            latitude: body.latitude ?? null,
            longitude: body.longitude ?? null,
            status: TankerRequestStatus.PENDING,
          }),
        );

        const customer = await userRepo.findOne({ where: { id: userId } });
        const supplier = body.supplierId
          ? await supplierRepo.findOne({ where: { id: body.supplierId } })
          : null;
        const supplierUser = supplier
          ? await userRepo.findOne({ where: { id: supplier.userId } })
          : null;

        const preferredLabel = saved.preferredDeliveryAt
          ? new Date(saved.preferredDeliveryAt).toLocaleString("en-IN", {
              timeZone: "Asia/Kolkata",
            })
          : "Not specified";

        const requestDetails = [
          `Request #${saved.id}`,
          `Water type: ${saved.waterType}`,
          `Quantity: ${saved.quantityLitres.toLocaleString("en-IN")} L`,
          `Preferred delivery: ${preferredLabel}`,
          `Delivery address: ${saved.deliveryAddress}`,
          saved.comments ? `Comments: ${saved.comments}` : null,
          `Status: ${saved.status}`,
        ]
          .filter(Boolean)
          .join("\n");

        const notifyJobs: Array<Promise<unknown>> = [];

        if (customer) {
          notifyJobs.push(
            notify(ds, {
              userId: customer.id,
              audience: "customer",
              toEmail: customer.email,
              toPhone: customer.phone,
              title: "Water tanker request submitted",
              body: [
                `Hello ${customer.name ?? "Customer"},`,
                "",
                "Your water tanker request has been submitted successfully.",
                "",
                requestDetails,
                supplier
                  ? `\nPreferred supplier: ${supplier.fullName}${supplier.email ? ` (${supplier.email})` : ""}`
                  : "\nNo preferred supplier — nearby suppliers may respond.",
                "",
                "Track it under My requests in the tanker customer portal.",
              ].join("\n"),
              referenceType: "tanker_request",
              referenceId: saved.id,
            }),
          );
        }

        if (supplier && supplierUser) {
          notifyJobs.push(
            notify(ds, {
              userId: supplierUser.id,
              audience: "supplier",
              toEmail: supplier.email ?? supplierUser.email,
              toPhone: supplier.alternateMobile ?? supplierUser.phone,
              title: "New water tanker request",
              body: [
                `Hello ${supplier.fullName},`,
                "",
                "A customer requested a water tanker from you.",
                "",
                requestDetails,
                "",
                `Customer: ${customer?.name ?? "—"}`,
                `Customer mobile: ${customer?.phone ?? "—"}`,
                customer?.email ? `Customer email: ${customer.email}` : null,
                "",
                "Open Supplier → Requests to accept or reject.",
              ]
                .filter(Boolean)
                .join("\n"),
              referenceType: "tanker_request",
              referenceId: saved.id,
            }),
          );
        } else if (!supplier) {
          notifyJobs.push(
            notifyTankerAdmins(ds, {
              title: "Open water tanker request (no preferred supplier)",
              body: [
                "A customer submitted a tanker request without selecting a supplier.",
                "",
                requestDetails,
                "",
                `Customer: ${customer?.name ?? "—"} · ${customer?.phone ?? "—"}`,
              ].join("\n"),
              referenceType: "tanker_request",
              referenceId: saved.id,
            }),
          );
        }

        void Promise.allSettled(notifyJobs);

        return reply.code(201).send(serializeRequest(saved));
      });

      app.get("/v1/tanker/requests", async (request) => {
        const query = paginationQuerySchema.parse(request.query);
        const raw = request.query as { customerUserId?: string; supplierId?: string; status?: string };
        const qb = requestRepo.createQueryBuilder("r").orderBy("r.created_at", "DESC");

        if (raw.customerUserId) {
          qb.andWhere("r.customer_user_id = :customerUserId", {
            customerUserId: raw.customerUserId,
          });
        }
        if (raw.supplierId) {
          qb.andWhere("r.supplier_id = :supplierId", { supplierId: raw.supplierId });
        }
        if (raw.status) {
          qb.andWhere("r.status = :status", { status: raw.status });
        }
        if (query.q) {
          qb.andWhere(
            `(r.delivery_address ILIKE :q OR r.water_type ILIKE :q OR COALESCE(r.comments, '') ILIKE :q OR CAST(r.id AS text) ILIKE :q)`,
            { q: `%${query.q}%` },
          );
        }

        const total = await qb.getCount();
        const rows = await qb.skip((query.page - 1) * query.limit).take(query.limit).getMany();
        return {
          items: rows.map(serializeRequest),
          page: query.page,
          limit: query.limit,
          total,
          totalPages: Math.max(1, Math.ceil(total / query.limit)),
        };
      });

      app.post("/v1/tanker/requests/:id/decide", async (request, reply) => {
        const id = parseEntityId((request.params as { id: string }).id);
        const userId = parseUserIdFromHeaders(request.headers as Record<string, unknown>);
        if (!userId) {
          return reply.code(401).send({
            error: { code: "UNAUTHORIZED", message: "Login required" },
          });
        }

        const supplier = await supplierRepo.findOne({ where: { userId } });
        if (!supplier) {
          return reply.code(403).send({
            error: { code: "FORBIDDEN", message: "Supplier profile required" },
          });
        }

        const tankerRequest = await requestRepo.findOne({ where: { id } });
        if (!tankerRequest) {
          return reply.code(404).send({
            error: { code: "NOT_FOUND", message: "Request not found" },
          });
        }

        if (tankerRequest.status !== TankerRequestStatus.PENDING) {
          return reply.code(400).send({
            error: { code: "INVALID_STATUS", message: "Request is not pending" },
          });
        }

        if (tankerRequest.supplierId && tankerRequest.supplierId !== supplier.id) {
          return reply.code(403).send({
            error: { code: "FORBIDDEN", message: "Request assigned to another supplier" },
          });
        }

        const body = decideTankerRequestSchema.parse(request.body);

        if (body.status === "rejected") {
          tankerRequest.status = TankerRequestStatus.REJECTED;
          tankerRequest.supplierId = supplier.id;
          if (body.comments) tankerRequest.comments = body.comments;
          const saved = await requestRepo.save(tankerRequest);

          const customer = await userRepo.findOne({ where: { id: tankerRequest.customerUserId } });
          if (customer) {
            void notify(ds, {
              userId: customer.id,
              audience: "customer",
              toEmail: customer.email,
              toPhone: customer.phone,
              title: "Water tanker request declined",
              body: [
                `Hello ${customer.name ?? "Customer"},`,
                "",
                `Your request #${saved.id} was declined by ${supplier.fullName}.`,
                body.comments ? `Reason: ${body.comments}` : null,
                "",
                `Water type: ${saved.waterType}`,
                `Quantity: ${saved.quantityLitres.toLocaleString("en-IN")} L`,
                `Address: ${saved.deliveryAddress}`,
                "",
                "You can search again under Search tankers.",
              ]
                .filter(Boolean)
                .join("\n"),
              referenceType: "tanker_request",
              referenceId: saved.id,
            });
          }

          return { request: serializeRequest(saved), order: null };
        }

        if (!body.vehicleId) {
          return reply.code(400).send({
            error: {
              code: "VEHICLE_REQUIRED",
              message: "Select a vehicle to accept this request so the driver is assigned",
            },
          });
        }

        const vehicle = await vehicleRepo.findOne({ where: { id: body.vehicleId } });
        if (!vehicle || vehicle.supplierId !== supplier.id) {
          return reply.code(400).send({
            error: { code: "INVALID_VEHICLE", message: "Vehicle not found in your fleet" },
          });
        }
        if (vehicle.status !== TankerVehicleStatus.AVAILABLE) {
          return reply.code(400).send({
            error: { code: "VEHICLE_UNAVAILABLE", message: "Vehicle is not available" },
          });
        }

        const amountInPaise = vehicle.amountInPaise ?? 0;
        const fees = await computeFees(amountInPaise);

        tankerRequest.status = TankerRequestStatus.ACCEPTED;
        tankerRequest.supplierId = supplier.id;
        if (body.comments) tankerRequest.comments = body.comments;
        await requestRepo.save(tankerRequest);

        const order = await orderRepo.save(
          orderRepo.create({
            customerUserId: tankerRequest.customerUserId,
            supplierId: supplier.id,
            vehicleId: vehicle.id,
            requestId: tankerRequest.id,
            waterType: tankerRequest.waterType,
            capacityLitres: vehicle.capacityLitres ?? tankerRequest.quantityLitres,
            vehicleNumber: vehicle.vehicleNumber,
            driverName: vehicle.driverFullName,
            driverMobile: vehicle.driverMobile,
            amountInPaise,
            platformFeeInPaise: fees.platformFeeInPaise,
            taxInPaise: fees.taxInPaise,
            discountInPaise: fees.discountInPaise,
            totalAmountInPaise: fees.totalAmountInPaise,
            promoCode: fees.promoCode,
            deliveryAddress: tankerRequest.deliveryAddress,
            deliveryAt: tankerRequest.preferredDeliveryAt ?? null,
            comments: tankerRequest.comments,
            paymentMethod: null,
            paymentStatus: PaymentStatus.PENDING,
            paymentDueAt: paymentDueAtFrom(),
            status: TankerOrderStatus.SCHEDULED,
            deliveryOtp: null,
            otpVerified: false,
          }),
        );

        vehicle.status = TankerVehicleStatus.ON_DELIVERY;
        await vehicleRepo.save(vehicle);

        const customer = await userRepo.findOne({ where: { id: tankerRequest.customerUserId } });
        const supplierUser = await userRepo.findOne({ where: { id: supplier.userId } });
        const driverUser = await ensureDriverUser({
          mobile: vehicle.driverMobile,
          name: vehicle.driverFullName,
          email: vehicle.driverEmail,
        });

        const preferredLabel = tankerRequest.preferredDeliveryAt
          ? new Date(tankerRequest.preferredDeliveryAt).toLocaleString("en-IN", {
              timeZone: "Asia/Kolkata",
            })
          : "Not specified";

        const acceptDetails = [
          `Request #${tankerRequest.id}`,
          `Order #${order.id}`,
          `Water type: ${tankerRequest.waterType}`,
          `Quantity / capacity: ${(vehicle.capacityLitres ?? tankerRequest.quantityLitres).toLocaleString("en-IN")} L`,
          `Preferred delivery: ${preferredLabel}`,
          `Delivery address: ${tankerRequest.deliveryAddress}`,
          `Amount: ${formatInr(order.totalAmountInPaise || order.amountInPaise)}`,
          `Vehicle: ${vehicle.vehicleNumber}`,
          `Driver: ${vehicle.driverFullName} · ${vehicle.driverMobile}${vehicle.driverEmail ? ` · ${vehicle.driverEmail}` : ""}`,
          `Supplier: ${supplier.fullName}`,
        ].join("\n");

        const notifyJobs: Array<Promise<unknown>> = [];

        if (customer) {
          notifyJobs.push(
            notify(ds, {
              userId: customer.id,
              audience: "customer",
              toEmail: customer.email,
              toPhone: customer.phone,
              title: "Request accepted — pay within 10 minutes",
              body: [
                `Hello ${customer.name ?? "Customer"},`,
                "",
                `${supplier.fullName} accepted your water tanker request.`,
                "",
                acceptDetails,
                "",
                "IMPORTANT: Complete payment within 10 minutes.",
                "If payment is not completed in time, this order will be cancelled automatically and the tanker will be released.",
                "",
                "Open My orders now and tap Pay to complete payment.",
              ].join("\n"),
              referenceType: "tanker_order",
              referenceId: order.id,
            }),
          );
        }

        if (supplierUser) {
          notifyJobs.push(
            notify(ds, {
              userId: supplierUser.id,
              audience: "supplier",
              toEmail: supplier.email ?? supplierUser.email,
              toPhone: supplier.alternateMobile ?? supplierUser.phone,
              title: "You accepted a water tanker request",
              body: [
                `Hello ${supplier.fullName},`,
                "",
                "You accepted a customer request and an order was created.",
                "",
                acceptDetails,
                "",
                `Customer: ${customer?.name ?? "—"} · ${customer?.phone ?? "—"}`,
                customer?.email ? `Customer email: ${customer.email}` : null,
                "",
                "Manage it under Supplier → Orders.",
              ]
                .filter(Boolean)
                .join("\n"),
              referenceType: "tanker_order",
              referenceId: order.id,
            }),
          );
        }

        if (driverUser) {
          notifyJobs.push(
            notify(ds, {
              userId: driverUser.id,
              audience: "driver",
              toEmail: vehicle.driverEmail ?? driverUser.email,
              toPhone: vehicle.driverMobile || driverUser.phone,
              title: "New tanker delivery assigned",
              body: [
                `Hello ${vehicle.driverFullName || driverUser.name || "Driver"},`,
                "",
                "You have been assigned a water tanker delivery.",
                "",
                acceptDetails,
                "",
                `Customer: ${customer?.name ?? "—"} · ${customer?.phone ?? "—"}`,
                "",
                "Open the Driver portal to view and update this delivery.",
              ].join("\n"),
              referenceType: "tanker_order",
              referenceId: order.id,
            }),
          );
        } else {
          app.log.warn(
            { orderId: order.id, vehicleId: vehicle.id, driverMobile: vehicle.driverMobile },
            "Accepted request but could not resolve driver user for notify",
          );
        }

        await Promise.allSettled(notifyJobs);

        return {
          request: serializeRequest(tankerRequest),
          order: serializeOrder(order),
        };
      });

      app.post("/v1/tanker/orders", async (request, reply) => {
        const userId = parseUserIdFromHeaders(request.headers as Record<string, unknown>);
        if (!userId) {
          return reply.code(401).send({
            error: { code: "UNAUTHORIZED", message: "Login required" },
          });
        }

        const body = createTankerOrderSchema.parse(request.body);
        const supplier = await supplierRepo.findOne({ where: { id: body.supplierId } });
        if (!supplier) {
          return reply.code(404).send({
            error: { code: "NOT_FOUND", message: "Supplier not found" },
          });
        }

        let vehicle: TankerVehicleEntity | null = null;
        if (body.vehicleId) {
          vehicle = await vehicleRepo.findOne({ where: { id: body.vehicleId } });
          if (!vehicle || vehicle.supplierId !== body.supplierId) {
            return reply.code(400).send({
              error: { code: "INVALID_VEHICLE", message: "Vehicle does not belong to supplier" },
            });
          }
          if (vehicle.status !== TankerVehicleStatus.AVAILABLE) {
            return reply.code(400).send({
              error: { code: "VEHICLE_UNAVAILABLE", message: "Vehicle is not available" },
            });
          }
        }

        const amountInPaise = body.amountInPaise;
        const fees = await computeFees(amountInPaise, body.promoCode);

        const order = await orderRepo.save(
          orderRepo.create({
            customerUserId: userId,
            supplierId: body.supplierId,
            vehicleId: vehicle?.id ?? null,
            requestId: null,
            waterType: body.waterType ?? "drinking",
            capacityLitres: body.capacityLitres,
            vehicleNumber: vehicle?.vehicleNumber ?? null,
            driverName: vehicle?.driverFullName ?? null,
            driverMobile: vehicle?.driverMobile ?? null,
            amountInPaise,
            platformFeeInPaise: fees.platformFeeInPaise,
            taxInPaise: fees.taxInPaise,
            discountInPaise: fees.discountInPaise,
            totalAmountInPaise: fees.totalAmountInPaise,
            promoCode: fees.promoCode,
            deliveryAddress: body.deliveryAddress,
            deliveryAt: body.deliveryAt ? new Date(body.deliveryAt) : null,
            comments: body.comments ?? null,
            paymentMethod: body.paymentMethod ?? null,
            paymentStatus: PaymentStatus.PENDING,
            paymentDueAt: paymentDueAtFrom(),
            status: TankerOrderStatus.SCHEDULED,
            deliveryOtp: null,
            otpVerified: false,
          }),
        );

        if (vehicle) {
          vehicle.status = TankerVehicleStatus.ON_DELIVERY;
          await vehicleRepo.save(vehicle);
        }

        return reply.code(201).send(serializeOrder(order));
      });

      app.get("/v1/tanker/orders", async (request) => {
        await releaseExpiredUnpaidOrders(app.log);
        const query = paginationQuerySchema.parse(request.query);
        const raw = request.query as {
          customerUserId?: string;
          supplierId?: string;
          status?: string;
        };
        const qb = orderRepo.createQueryBuilder("o").orderBy("o.created_at", "DESC");

        if (raw.customerUserId) {
          qb.andWhere("o.customer_user_id = :customerUserId", {
            customerUserId: raw.customerUserId,
          });
        }
        if (raw.supplierId) {
          qb.andWhere("o.supplier_id = :supplierId", { supplierId: raw.supplierId });
        }
        if (raw.status) {
          qb.andWhere("o.status = :status", { status: raw.status });
        }
        if (query.q) {
          qb.andWhere(
            `(o.delivery_address ILIKE :q OR COALESCE(o.vehicle_number, '') ILIKE :q OR COALESCE(o.driver_name, '') ILIKE :q OR CAST(o.id AS text) ILIKE :q)`,
            { q: `%${query.q}%` },
          );
        }

        const total = await qb.getCount();
        const rows = await qb.skip((query.page - 1) * query.limit).take(query.limit).getMany();
        return {
          items: rows.map(serializeOrder),
          page: query.page,
          limit: query.limit,
          total,
          totalPages: Math.max(1, Math.ceil(total / query.limit)),
        };
      });

      app.post("/v1/tanker/orders/:id/assign-vehicle", async (request, reply) => {
        const userId = parseUserIdFromHeaders(request.headers as Record<string, unknown>);
        if (!userId) {
          return reply.code(401).send({
            error: { code: "UNAUTHORIZED", message: "Login required" },
          });
        }

        const id = parseEntityId((request.params as { id: string }).id);
        const body = z
          .object({ vehicleId: z.coerce.number().int().positive() })
          .parse(request.body);

        const supplier = await supplierRepo.findOne({ where: { userId } });
        if (!supplier) {
          return reply.code(403).send({
            error: { code: "FORBIDDEN", message: "Supplier profile required" },
          });
        }

        const order = await orderRepo.findOne({ where: { id } });
        if (!order || order.supplierId !== supplier.id) {
          return reply.code(404).send({
            error: { code: "NOT_FOUND", message: "Order not found" },
          });
        }

        if (order.vehicleId) {
          return reply.code(400).send({
            error: { code: "ALREADY_ASSIGNED", message: "Order already has a vehicle" },
          });
        }

        if (
          order.status === TankerOrderStatus.DELIVERED ||
          order.status === TankerOrderStatus.CANCELLED
        ) {
          return reply.code(400).send({
            error: { code: "INVALID_STATUS", message: "Cannot assign vehicle to this order" },
          });
        }

        const vehicle = await vehicleRepo.findOne({ where: { id: body.vehicleId } });
        if (!vehicle || vehicle.supplierId !== supplier.id) {
          return reply.code(400).send({
            error: { code: "INVALID_VEHICLE", message: "Vehicle not found in your fleet" },
          });
        }
        if (vehicle.status !== TankerVehicleStatus.AVAILABLE) {
          return reply.code(400).send({
            error: { code: "VEHICLE_UNAVAILABLE", message: "Vehicle is not available" },
          });
        }

        order.vehicleId = vehicle.id;
        order.vehicleNumber = vehicle.vehicleNumber;
        order.driverName = vehicle.driverFullName;
        order.driverMobile = vehicle.driverMobile;
        order.capacityLitres = vehicle.capacityLitres || order.capacityLitres;
        order.waterType = vehicle.waterType || order.waterType;
        if (order.paymentStatus === PaymentStatus.PENDING) {
          order.paymentDueAt = paymentDueAtFrom();
        }
        if (!order.amountInPaise && vehicle.amountInPaise) {
          const fees = await computeFees(vehicle.amountInPaise);
          order.amountInPaise = vehicle.amountInPaise;
          order.platformFeeInPaise = fees.platformFeeInPaise;
          order.taxInPaise = fees.taxInPaise;
          order.discountInPaise = fees.discountInPaise;
          order.totalAmountInPaise = fees.totalAmountInPaise;
        }

        const saved = await orderRepo.save(order);
        vehicle.status = TankerVehicleStatus.ON_DELIVERY;
        await vehicleRepo.save(vehicle);

        const customer = await userRepo.findOne({ where: { id: order.customerUserId } });
        const driverUser = await ensureDriverUser({
          mobile: vehicle.driverMobile,
          name: vehicle.driverFullName,
          email: vehicle.driverEmail,
        });

        if (driverUser) {
          await notify(ds, {
            userId: driverUser.id,
            audience: "driver",
            toEmail: vehicle.driverEmail ?? driverUser.email,
            toPhone: vehicle.driverMobile || driverUser.phone,
            title: "New tanker delivery assigned",
            body: [
              `Hello ${vehicle.driverFullName || driverUser.name || "Driver"},`,
              "",
              "You have been assigned a water tanker delivery.",
              "",
              `Order #${saved.id}`,
              `Vehicle: ${vehicle.vehicleNumber}`,
              `Water type: ${saved.waterType}`,
              `Capacity: ${saved.capacityLitres.toLocaleString("en-IN")} L`,
              `Delivery address: ${saved.deliveryAddress}`,
              `Customer: ${customer?.name ?? "—"} · ${customer?.phone ?? "—"}`,
              "",
              "Open the Driver portal to view and update this delivery.",
            ].join("\n"),
            referenceType: "tanker_order",
            referenceId: saved.id,
          });
        }

        return serializeOrder(saved);
      });

      app.patch("/v1/tanker/orders/:id/status", async (request, reply) => {
        const id = parseEntityId((request.params as { id: string }).id);
        const userId = parseUserIdFromHeaders(request.headers as Record<string, unknown>);
        const body = updateTankerOrderStatusSchema.parse(request.body);

        const order = await orderRepo.findOne({ where: { id } });
        if (!order) {
          return reply.code(404).send({
            error: { code: "NOT_FOUND", message: "Order not found" },
          });
        }

        if (userId) {
          const allowed = await userCanAccessOrderAsDriverOrSupplier(userId, order);
          if (!allowed) {
            const roles = getRolesFromHeaders(request.headers as Record<string, unknown>);
            const isStaff = roles.includes(UserRole.TANKER_SUPER_ADMIN);
            if (!isStaff) {
              return reply.code(403).send({
                error: { code: "FORBIDDEN", message: "Not your order" },
              });
            }
          }

          // Drivers cannot progress delivery until the customer has paid.
          if (order.paymentStatus !== PaymentStatus.PAID) {
            const roles = getRolesFromHeaders(request.headers as Record<string, unknown>);
            const isStaff = roles.includes(UserRole.TANKER_SUPER_ADMIN);
            const supplier = await supplierRepo.findOne({ where: { id: order.supplierId } });
            const isSupplierOwner = supplier?.userId === userId;
            const isDriver = await userIsOrderDriver(userId, order);
            if (isDriver && !isSupplierOwner && !isStaff) {
              return reply.code(402).send({
                error: {
                  code: "PAYMENT_REQUIRED",
                  message: "Wait until the customer completes payment before updating delivery status",
                },
              });
            }
          }
        }

        const needsOtpGate =
          body.status === TankerOrderStatus.DELIVERING ||
          body.status === TankerOrderStatus.DELIVERED;

        if (needsOtpGate) {
          if (order.paymentStatus !== PaymentStatus.PAID) {
            return reply.code(402).send({
              error: {
                code: "PAYMENT_REQUIRED",
                message: "Customer payment must be completed before delivery OTP / delivering",
              },
            });
          }

          if (!order.otpVerified) {
            if (body.status === TankerOrderStatus.DELIVERED) {
              return reply.code(400).send({
                error: {
                  code: "OTP_REQUIRED",
                  message: "Verify customer OTP to set delivering first, then mark delivered",
                },
              });
            }
            const otp = body.otp?.trim();
            if (!otp) {
              return reply.code(400).send({
                error: {
                  code: "OTP_REQUIRED",
                  message: "Enter the customer delivery OTP to move to delivering",
                },
              });
            }
            if (!order.deliveryOtp || order.deliveryOtp !== otp) {
              return reply.code(400).send({
                error: { code: "INVALID_OTP", message: "Invalid delivery OTP" },
              });
            }
            order.otpVerified = true;
          }

          if (
            body.status === TankerOrderStatus.DELIVERED &&
            order.status !== TankerOrderStatus.DELIVERING
          ) {
            return reply.code(400).send({
              error: {
                code: "DELIVERING_REQUIRED",
                message: "Set status to delivering (with customer OTP) before marking delivered",
              },
            });
          }
        }

        const previousStatus = order.status;
        order.status = body.status;
        const saved = await orderRepo.save(order);

        if (previousStatus !== saved.status) {
          void notifyCustomerOrderStatus(ds, saved, previousStatus).catch((err) => {
            app.log.error({ err, orderId: saved.id }, "Failed to notify customer of status change");
          });
        }

        if (body.status === TankerOrderStatus.DELIVERED && order.vehicleId) {
          const vehicle = await vehicleRepo.findOne({ where: { id: order.vehicleId } });
          if (vehicle) {
            vehicle.status = TankerVehicleStatus.AVAILABLE;
            await vehicleRepo.save(vehicle);
          }
        }

        if (
          body.status === TankerOrderStatus.DELIVERED &&
          previousStatus !== TankerOrderStatus.DELIVERED &&
          saved.paymentStatus === PaymentStatus.PAID
        ) {
          try {
            await ensureInvoiceForOrder(saved);
          } catch (err) {
            app.log.error({ err, orderId: saved.id }, "Failed to ensure invoice on delivery");
          }

          try {
            const settled = await settleTankerPaymentToSupplier(saved.id);
            app.log.info(
              {
                orderId: saved.id,
                supplierShareInPaise: settled.supplierShareInPaise,
                platformFeeInPaise: settled.platformFeeInPaise,
                alreadySettled: settled.alreadySettled,
              },
              "Settled tanker order to supplier wallet",
            );

            const supplier = await supplierRepo.findOne({ where: { id: saved.supplierId } });
            const supplierUser = supplier
              ? await userRepo.findOne({ where: { id: supplier.userId } })
              : null;
            if (supplier && supplierUser && !settled.alreadySettled) {
              void notify(ds, {
                userId: supplierUser.id,
                audience: "supplier",
                toEmail: supplier.email ?? supplierUser.email,
                toPhone: supplier.alternateMobile ?? supplierUser.phone,
                title: "Delivery settled — wallet credited",
                body: [
                  `Hello ${supplier.fullName},`,
                  "",
                  `Order #${saved.id} was delivered.`,
                  `Credited to your wallet: ${formatInr(settled.supplierShareInPaise ?? 0)}`,
                  `Platform fee retained: ${formatInr(settled.platformFeeInPaise ?? 0)}`,
                  "",
                  "You can withdraw from Supplier → Wallet.",
                ].join("\n"),
                referenceType: "tanker_order",
                referenceId: saved.id,
              });
            }
          } catch (err) {
            app.log.error({ err, orderId: saved.id }, "Failed to settle tanker order to supplier wallet");
          }
        }

        return serializeOrder(saved);
      });

      app.post("/v1/tanker/orders/:id/verify-otp", async (request, reply) => {
        const id = parseEntityId((request.params as { id: string }).id);
        const body = verifyOtpSchema.parse(request.body);

        const order = await orderRepo.findOne({ where: { id } });
        if (!order) {
          return reply.code(404).send({
            error: { code: "NOT_FOUND", message: "Order not found" },
          });
        }

        if (order.paymentStatus !== PaymentStatus.PAID) {
          return reply.code(402).send({
            error: { code: "PAYMENT_REQUIRED", message: "Payment must be completed before OTP verification" },
          });
        }

        if (!order.deliveryOtp || order.deliveryOtp !== body.otp) {
          return reply.code(400).send({
            error: { code: "INVALID_OTP", message: "Invalid delivery OTP" },
          });
        }

        order.otpVerified = true;
        const previousStatus = order.status;
        order.status = TankerOrderStatus.DELIVERING;
        const saved = await orderRepo.save(order);

        if (previousStatus !== saved.status) {
          void notifyCustomerOrderStatus(ds, saved, previousStatus).catch((err) => {
            app.log.error({ err, orderId: saved.id }, "Failed to notify customer after OTP verify");
          });
        }

        return serializeOrder(saved);
      });

      app.post("/v1/tanker/orders/:id/confirm-payment", async (request, reply) => {
        const id = parseEntityId((request.params as { id: string }).id);
        const body = confirmTankerPaymentSchema.parse(request.body ?? {});

        await releaseExpiredUnpaidOrders(app.log);

        const order = await orderRepo.findOne({ where: { id } });
        if (!order) {
          return reply.code(404).send({
            error: { code: "NOT_FOUND", message: "Order not found" },
          });
        }

        if (order.status === TankerOrderStatus.CANCELLED) {
          return reply.code(400).send({
            error: {
              code: "ORDER_CANCELLED",
              message: "This order was cancelled because payment was not completed in time",
            },
          });
        }

        const dueAt = resolvePaymentDueAt(order);
        if (
          order.paymentStatus !== PaymentStatus.PAID &&
          dueAt &&
          dueAt.getTime() < Date.now()
        ) {
          await releaseExpiredUnpaidOrders(app.log);
          return reply.code(400).send({
            error: {
              code: "PAYMENT_WINDOW_EXPIRED",
              message: "Payment window of 10 minutes has expired. The tanker was released.",
            },
          });
        }

        const wasPaid = order.paymentStatus === PaymentStatus.PAID;

        order.paymentStatus = PaymentStatus.PAID;
        order.paymentProvider = "cashfree";
        if (body.orderId) {
          order.paymentProviderOrderId = body.orderId;
        }

        if (!order.deliveryOtp) {
          order.deliveryOtp = makeDeliveryOtp();
        }

        const saved = await orderRepo.save(order);

        try {
          await ensureInvoiceForOrder(saved);
        } catch (err) {
          app.log.error({ err, orderId: saved.id }, "Failed to create tanker invoice after payment");
        }

        if (!wasPaid && order.promoCode) {
          const promo = await promoRepo.findOne({ where: { code: order.promoCode } });
          if (promo) {
            promo.usedCount += 1;
            await promoRepo.save(promo);
          }
        }

        if (!wasPaid) {
          try {
            await collectTankerPaymentToPlatform(saved.id);
          } catch (err) {
            app.log.error({ err, orderId: saved.id }, "Failed to credit platform wallet after tanker payment");
          }
        }

        return serializeOrder(saved);
      });

      app.post("/v1/tanker/orders/:id/location", async (request, reply) => {
        const id = parseEntityId((request.params as { id: string }).id);
        const userId = requireUserId(request.headers as Record<string, unknown>);
        if (!userId) {
          return reply.code(401).send({
            error: { code: "UNAUTHORIZED", message: "Login required" },
          });
        }

        const order = await orderRepo.findOne({ where: { id } });
        if (!order) {
          return reply.code(404).send({
            error: { code: "NOT_FOUND", message: "Order not found" },
          });
        }

        const allowed = await userCanAccessOrderAsDriverOrSupplier(userId, order);
        if (!allowed) {
          return reply.code(403).send({
            error: { code: "FORBIDDEN", message: "Not your order" },
          });
        }

        const body = updateDriverLocationSchema.parse(request.body);
        const saved = await updateOrderDriverLocation(id, body.latitude, body.longitude);
        if (!saved) {
          return reply.code(404).send({
            error: { code: "NOT_FOUND", message: "Order not found" },
          });
        }

        return {
          orderId: id,
          latitude: saved.driverLatitude,
          longitude: saved.driverLongitude,
          updatedAt: toIsoRequired(saved.driverLocationUpdatedAt!),
        };
      });

      app.get("/v1/tanker/orders/:id/location", async (request, reply) => {
        const id = parseEntityId((request.params as { id: string }).id);

        const order = await orderRepo.findOne({ where: { id } });
        if (!order) {
          return reply.code(404).send({
            error: { code: "NOT_FOUND", message: "Order not found" },
          });
        }

        return {
          orderId: id,
          latitude: order.driverLatitude,
          longitude: order.driverLongitude,
          updatedAt: toIso(order.driverLocationUpdatedAt),
        };
      });

      app.get("/v1/tanker/orders/:id/messages", async (request, reply) => {
        const id = parseEntityId((request.params as { id: string }).id);
        const actorId = parseUserIdFromHeaders(request.headers as Record<string, unknown>);
        if (!actorId) {
          return reply.code(401).send({
            error: { code: "UNAUTHORIZED", message: "Login required" },
          });
        }

        const order = await orderRepo.findOne({ where: { id } });
        if (!order) {
          return reply.code(404).send({
            error: { code: "NOT_FOUND", message: "Order not found" },
          });
        }

        const roles = getRolesFromHeaders(request.headers as Record<string, unknown>);
        const isStaff = roles.includes(UserRole.TANKER_SUPER_ADMIN);
        const party = await userCanChatOnOrder(actorId, order);
        if (!party && !isStaff) {
          return reply.code(403).send({
            error: { code: "FORBIDDEN", message: "Not allowed to view this chat" },
          });
        }

        if (!canChatOnTankerOrder(order) && order.status !== TankerOrderStatus.DELIVERED) {
          return reply.code(400).send({
            error: {
              code: "CHAT_UNAVAILABLE",
              message: "Chat opens after the customer completes payment",
            },
          });
        }

        const rows = await messageRepo.find({
          where: { orderId: order.id },
          order: { createdAt: "ASC", id: "ASC" },
          take: 200,
        });
        const senderIds = [...new Set(rows.map((r) => r.senderUserId))];
        const senders =
          senderIds.length > 0 ? await userRepo.find({ where: { id: In(senderIds) } }) : [];
        const nameById = new Map(senders.map((u) => [u.id, u.name ?? null]));

        return {
          orderId: order.id,
          canSend: canSendTankerChat(order),
          items: rows.map((row) =>
            serializeOrderMessage(row, nameById.get(row.senderUserId) ?? null, actorId),
          ),
        };
      });

      app.post("/v1/tanker/orders/:id/messages", async (request, reply) => {
        const id = parseEntityId((request.params as { id: string }).id);
        const actorId = parseUserIdFromHeaders(request.headers as Record<string, unknown>);
        if (!actorId) {
          return reply.code(401).send({
            error: { code: "UNAUTHORIZED", message: "Login required" },
          });
        }

        const body = tankerOrderChatMessageSchema.parse(request.body);
        const order = await orderRepo.findOne({ where: { id } });
        if (!order) {
          return reply.code(404).send({
            error: { code: "NOT_FOUND", message: "Order not found" },
          });
        }

        const party = await userCanChatOnOrder(actorId, order);
        if (party !== "customer" && party !== "driver") {
          return reply.code(403).send({
            error: { code: "FORBIDDEN", message: "Only customer or driver can chat on this order" },
          });
        }

        if (!canSendTankerChat(order)) {
          return reply.code(400).send({
            error: {
              code: "CHAT_CLOSED",
              message:
                order.paymentStatus !== PaymentStatus.PAID
                  ? "Chat opens after payment is completed"
                  : "Chat is closed for this order",
            },
          });
        }

        const sender = await userRepo.findOne({ where: { id: actorId } });
        const saved = await messageRepo.save(
          messageRepo.create({
            orderId: order.id,
            senderUserId: actorId,
            body: body.body,
          }),
        );

        // Notify the other party (customer ↔ driver).
        try {
          const preview =
            body.body.length > 120 ? `${body.body.slice(0, 117)}…` : body.body;
          if (party === "customer") {
            const driverUser = order.driverMobile
              ? await ensureDriverUser({
                  mobile: order.driverMobile,
                  name: order.driverName,
                })
              : null;
            if (driverUser) {
              void notify(ds, {
                userId: driverUser.id,
                audience: "driver",
                toEmail: driverUser.email,
                toPhone: driverUser.phone,
                title: `New chat · Order #${order.id}`,
                body: [
                  `Hello ${driverUser.name ?? "Driver"},`,
                  "",
                  `${sender?.name ?? "Customer"} sent a message:`,
                  preview,
                  "",
                  "Open Driver console → Chat to reply.",
                ].join("\n"),
                referenceType: "tanker_order",
                referenceId: order.id,
              });
            }
          } else if (party === "driver" || party === "supplier") {
            const customer = await userRepo.findOne({ where: { id: order.customerUserId } });
            if (customer) {
              void notify(ds, {
                userId: customer.id,
                audience: "customer",
                toEmail: customer.email,
                toPhone: customer.phone,
                title: `New chat · Order #${order.id}`,
                body: [
                  `Hello ${customer.name ?? "Customer"},`,
                  "",
                  `${sender?.name ?? (party === "driver" ? "Driver" : "Supplier")} sent a message:`,
                  preview,
                  "",
                  "Open My orders → Chat to reply.",
                ].join("\n"),
                referenceType: "tanker_order",
                referenceId: order.id,
              });
            }
          }
        } catch (err) {
          app.log.warn({ err, orderId: order.id }, "Failed to notify chat recipient");
        }

        return serializeOrderMessage(saved, sender?.name ?? null, actorId);
      });

      app.get("/v1/tanker/invoices", async (request) => {
        const query = paginationQuerySchema.parse(request.query);
        const raw = request.query as { customerUserId?: string; supplierId?: string };
        const userId = parseUserIdFromHeaders(request.headers as Record<string, unknown>);
        const roles = getRolesFromHeaders(request.headers as Record<string, unknown>);
        const isStaff = roles.includes(UserRole.TANKER_SUPER_ADMIN);

        // Backfill invoices for paid orders that somehow missed creation.
        if (raw.supplierId || raw.customerUserId || (userId && !isStaff)) {
          const paidQb = orderRepo
            .createQueryBuilder("o")
            .where("o.payment_status = :paid", { paid: PaymentStatus.PAID })
            .orderBy("o.created_at", "DESC")
            .take(50);
          if (raw.supplierId) {
            paidQb.andWhere("o.supplier_id = :supplierId", { supplierId: raw.supplierId });
          }
          if (raw.customerUserId) {
            paidQb.andWhere("o.customer_user_id = :customerUserId", {
              customerUserId: raw.customerUserId,
            });
          }
          if (userId && !isStaff && !raw.supplierId && !raw.customerUserId) {
            const ownedSupplier = await supplierRepo.findOne({ where: { userId } });
            if (ownedSupplier) {
              paidQb.andWhere("o.supplier_id = :ownedSupplierId", {
                ownedSupplierId: ownedSupplier.id,
              });
            } else {
              paidQb.andWhere("o.customer_user_id = :selfCustomerId", { selfCustomerId: userId });
            }
          }
          const paidOrders = await paidQb.getMany();
          for (const paidOrder of paidOrders) {
            try {
              await ensureInvoiceForOrder(paidOrder);
            } catch {
              /* ignore backfill errors per order */
            }
          }
        }

        const qb = invoiceRepo.createQueryBuilder("i").orderBy("i.created_at", "DESC");

        if (raw.customerUserId) {
          qb.andWhere("i.customer_user_id = :customerUserId", {
            customerUserId: raw.customerUserId,
          });
        }
        if (raw.supplierId) {
          qb.andWhere("i.supplier_id = :supplierId", { supplierId: raw.supplierId });
        }

        // Non-staff callers can only see their own invoices unless staff.
        if (userId && !isStaff) {
          const ownedSupplier = await supplierRepo.findOne({ where: { userId } });
          if (ownedSupplier && !raw.customerUserId) {
            qb.andWhere("i.supplier_id = :ownedSupplierId", { ownedSupplierId: ownedSupplier.id });
          } else if (!raw.supplierId) {
            qb.andWhere("i.customer_user_id = :selfCustomerId", { selfCustomerId: userId });
          } else if (ownedSupplier && String(ownedSupplier.id) === String(raw.supplierId)) {
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

      app.get("/v1/tanker/invoices/:id", async (request, reply) => {
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

      app.get("/v1/tanker/invoices/:id/download", async (request, reply) => {
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

      app.get("/v1/tanker/reports/customers", async (request) => {
        const query = paginationQuerySchema.parse(request.query);

        // Prefer registered tanker customers; also include anyone who placed an order.
        const qb = userRepo
          .createQueryBuilder("u")
          .where(`:customer = ANY(u.roles)`, { customer: UserRole.CUSTOMER })
          .orderBy("u.created_at", "DESC");

        if (query.q) {
          qb.andWhere(
            `(u.phone ILIKE :q OR COALESCE(u.name,'') ILIKE :q OR COALESCE(u.email,'') ILIKE :q)`,
            { q: `%${query.q}%` },
          );
        }

        const total = await qb.getCount();
        const users = await qb.skip((query.page - 1) * query.limit).take(query.limit).getMany();

        const statsByUser = new Map<
          number,
          { ordersCount: number; totalPaidInPaise: number; lastOrderAt: string | null }
        >();

        if (users.length > 0) {
          const ids = users.map((u) => u.id);
          const rows = await orderRepo
            .createQueryBuilder("o")
            .select("o.customer_user_id", "customerUserId")
            .addSelect("COUNT(*)", "ordersCount")
            .addSelect("MAX(o.created_at)", "lastOrderAt")
            .addSelect(
              `COALESCE(SUM(CASE WHEN o.payment_status = :paid THEN o.total_amount_in_paise ELSE 0 END), 0)`,
              "totalPaidInPaise",
            )
            .where("o.customer_user_id IN (:...ids)", { ids })
            .setParameter("paid", PaymentStatus.PAID)
            .groupBy("o.customer_user_id")
            .getRawMany();

          for (const row of rows) {
            statsByUser.set(Number(row.customerUserId), {
              ordersCount: Number(row.ordersCount),
              totalPaidInPaise: Number(row.totalPaidInPaise),
              lastOrderAt: row.lastOrderAt
                ? toIsoRequired(new Date(row.lastOrderAt as string))
                : null,
            });
          }
        }

        return {
          items: users.map((u) => {
            const stats = statsByUser.get(u.id);
            return {
              customerUserId: u.id,
              name: u.name,
              phone: u.phone,
              email: u.email,
              isActive: u.isActive,
              city: u.city,
              createdAt: toIsoRequired(u.createdAt),
              ordersCount: stats?.ordersCount ?? 0,
              lastOrderAt: stats?.lastOrderAt ?? null,
              totalPaidInPaise: stats?.totalPaidInPaise ?? 0,
            };
          }),
          page: query.page,
          limit: query.limit,
          total,
          totalPages: Math.max(1, Math.ceil(total / query.limit)),
        };
      });

      app.get("/v1/tanker/reports/summary", async () => {
        const [
          suppliers,
          vehicles,
          requestsPending,
          ordersActive,
          ordersDelivered,
          ordersCancelled,
          revenuePaidResult,
          revenuePendingResult,
          invoicesCount,
          invoicesPaidCount,
        ] = await Promise.all([
          supplierRepo.count(),
          vehicleRepo.count(),
          requestRepo.count({ where: { status: TankerRequestStatus.PENDING } }),
          orderRepo.count({
            where: {
              status: Not(In([TankerOrderStatus.DELIVERED, TankerOrderStatus.CANCELLED])),
            },
          }),
          orderRepo.count({ where: { status: TankerOrderStatus.DELIVERED } }),
          orderRepo.count({ where: { status: TankerOrderStatus.CANCELLED } }),
          orderRepo
            .createQueryBuilder("o")
            .select("COALESCE(SUM(o.total_amount_in_paise), 0)", "sum")
            .where("o.payment_status = :status", { status: PaymentStatus.PAID })
            .getRawOne(),
          orderRepo
            .createQueryBuilder("o")
            .select("COALESCE(SUM(o.total_amount_in_paise), 0)", "sum")
            .where("o.payment_status = :status", { status: PaymentStatus.PENDING })
            .getRawOne(),
          invoiceRepo.count(),
          invoiceRepo.count({ where: { status: PaymentStatus.PAID } }),
        ]);

        return {
          suppliers,
          vehicles,
          requestsPending,
          ordersActive,
          ordersDelivered,
          ordersCancelled,
          revenuePaidInPaise: Number(revenuePaidResult?.sum ?? 0),
          revenuePendingInPaise: Number(revenuePendingResult?.sum ?? 0),
          invoicesCount,
          invoicesPaidCount,
        };
      });

      app.get("/v1/tanker/settings/platform-fees", async (request, reply) => {
        const userId = requireUserId(request.headers as Record<string, unknown>);
        if (!userId) {
          return reply.code(401).send({
            error: { code: "UNAUTHORIZED", message: "Login required" },
          });
        }
        const rows = await platformFeeRepo.find({ order: { createdAt: "DESC" } });
        return { items: rows.map(serializePlatformFee) };
      });

      app.post("/v1/tanker/settings/platform-fees", async (request, reply) => {
        const userId = requireUserId(request.headers as Record<string, unknown>);
        if (!userId) {
          return reply.code(401).send({
            error: { code: "UNAUTHORIZED", message: "Login required" },
          });
        }
        const body = createTankerPlatformFeeSchema.parse(request.body);
        const saved = await platformFeeRepo.save(
          platformFeeRepo.create({
            feeType: body.feeType ?? "percentage",
            percentageBps: body.percentageBps ?? 1000,
            flatFeeInPaise: body.flatFeeInPaise ?? 0,
            isActive: body.isActive ?? true,
          }),
        );
        return reply.code(201).send(serializePlatformFee(saved));
      });

      app.patch("/v1/tanker/settings/platform-fees/:id", async (request, reply) => {
        const id = parseEntityId((request.params as { id: string }).id);
        const userId = requireUserId(request.headers as Record<string, unknown>);
        if (!userId) {
          return reply.code(401).send({
            error: { code: "UNAUTHORIZED", message: "Login required" },
          });
        }
        const row = await platformFeeRepo.findOne({ where: { id } });
        if (!row) {
          return reply.code(404).send({
            error: { code: "NOT_FOUND", message: "Platform fee setting not found" },
          });
        }
        const body = updateTankerPlatformFeeSchema.parse(request.body);
        Object.assign(row, body);
        const saved = await platformFeeRepo.save(row);
        return serializePlatformFee(saved);
      });

      app.delete("/v1/tanker/settings/platform-fees/:id", async (request, reply) => {
        const id = parseEntityId((request.params as { id: string }).id);
        const userId = requireUserId(request.headers as Record<string, unknown>);
        if (!userId) {
          return reply.code(401).send({
            error: { code: "UNAUTHORIZED", message: "Login required" },
          });
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

      app.get("/v1/tanker/settings/taxes", async (request, reply) => {
        const userId = requireUserId(request.headers as Record<string, unknown>);
        if (!userId) {
          return reply.code(401).send({
            error: { code: "UNAUTHORIZED", message: "Login required" },
          });
        }
        const rows = await taxRepo.find({ order: { createdAt: "DESC" } });
        return { items: rows.map(serializeTax) };
      });

      app.post("/v1/tanker/settings/taxes", async (request, reply) => {
        const userId = requireUserId(request.headers as Record<string, unknown>);
        if (!userId) {
          return reply.code(401).send({
            error: { code: "UNAUTHORIZED", message: "Login required" },
          });
        }
        const body = createTankerTaxSchema.parse(request.body);
        const saved = await taxRepo.save(
          taxRepo.create({
            taxName: body.taxName,
            taxBps: body.taxBps,
            country: body.country ?? "IN",
            state: body.state ?? null,
            isActive: body.isActive ?? true,
          }),
        );
        return reply.code(201).send(serializeTax(saved));
      });

      app.patch("/v1/tanker/settings/taxes/:id", async (request, reply) => {
        const id = parseEntityId((request.params as { id: string }).id);
        const userId = requireUserId(request.headers as Record<string, unknown>);
        if (!userId) {
          return reply.code(401).send({
            error: { code: "UNAUTHORIZED", message: "Login required" },
          });
        }
        const row = await taxRepo.findOne({ where: { id } });
        if (!row) {
          return reply.code(404).send({
            error: { code: "NOT_FOUND", message: "Tax setting not found" },
          });
        }
        const body = updateTankerTaxSchema.parse(request.body);
        Object.assign(row, body);
        const saved = await taxRepo.save(row);
        return serializeTax(saved);
      });

      app.delete("/v1/tanker/settings/taxes/:id", async (request, reply) => {
        const id = parseEntityId((request.params as { id: string }).id);
        const userId = requireUserId(request.headers as Record<string, unknown>);
        if (!userId) {
          return reply.code(401).send({
            error: { code: "UNAUTHORIZED", message: "Login required" },
          });
        }
        const row = await taxRepo.findOne({ where: { id } });
        if (!row) {
          return reply.code(404).send({
            error: { code: "NOT_FOUND", message: "Tax setting not found" },
          });
        }
        await taxRepo.remove(row);
        return reply.code(204).send();
      });

      app.get("/v1/tanker/settings/promos/validate", async (request, reply) => {
        const userId = requireUserId(request.headers as Record<string, unknown>);
        if (!userId) {
          return reply.code(401).send({
            error: { code: "UNAUTHORIZED", message: "Login required" },
          });
        }
        const query = z
          .object({
            code: z.string().min(2).max(40),
            amountInPaise: z.coerce.number().int().nonnegative(),
          })
          .parse(request.query);

        const promo = await promoRepo.findOne({
          where: { code: query.code.toUpperCase() },
        });
        if (!promo || !isPromoValid(promo, query.amountInPaise)) {
          return { valid: false, promo: null, discountInPaise: 0 };
        }

        const discountInPaise = computePromoDiscount(promo, query.amountInPaise);
        return { valid: true, promo: serializePromo(promo), discountInPaise };
      });

      app.get("/v1/tanker/settings/promos", async (request, reply) => {
        const userId = requireUserId(request.headers as Record<string, unknown>);
        if (!userId) {
          return reply.code(401).send({
            error: { code: "UNAUTHORIZED", message: "Login required" },
          });
        }
        const rows = await promoRepo.find({ order: { createdAt: "DESC" } });
        return { items: rows.map(serializePromo) };
      });

      app.post("/v1/tanker/settings/promos", async (request, reply) => {
        const userId = requireUserId(request.headers as Record<string, unknown>);
        if (!userId) {
          return reply.code(401).send({
            error: { code: "UNAUTHORIZED", message: "Login required" },
          });
        }
        const body = createTankerPromoSchema.parse(request.body);
        const saved = await promoRepo.save(
          promoRepo.create({
            code: body.code.toUpperCase(),
            description: body.description ?? null,
            discountType: body.discountType ?? "percentage",
            discountValue: body.discountValue,
            minOrderInPaise: body.minOrderInPaise ?? 0,
            maxUses: body.maxUses ?? 0,
            startsAt: body.startsAt ? new Date(body.startsAt) : null,
            endsAt: body.endsAt ? new Date(body.endsAt) : null,
            isActive: body.isActive ?? true,
          }),
        );
        return reply.code(201).send(serializePromo(saved));
      });

      app.patch("/v1/tanker/settings/promos/:id", async (request, reply) => {
        const id = parseEntityId((request.params as { id: string }).id);
        const userId = requireUserId(request.headers as Record<string, unknown>);
        if (!userId) {
          return reply.code(401).send({
            error: { code: "UNAUTHORIZED", message: "Login required" },
          });
        }
        const row = await promoRepo.findOne({ where: { id } });
        if (!row) {
          return reply.code(404).send({
            error: { code: "NOT_FOUND", message: "Promo code not found" },
          });
        }
        const body = updateTankerPromoSchema.parse(request.body);
        if (body.code) row.code = body.code.toUpperCase();
        if (body.description !== undefined) row.description = body.description ?? null;
        if (body.discountType !== undefined) row.discountType = body.discountType;
        if (body.discountValue !== undefined) row.discountValue = body.discountValue;
        if (body.minOrderInPaise !== undefined) row.minOrderInPaise = body.minOrderInPaise;
        if (body.maxUses !== undefined) row.maxUses = body.maxUses;
        if (body.startsAt !== undefined) {
          row.startsAt = body.startsAt ? new Date(body.startsAt) : null;
        }
        if (body.endsAt !== undefined) {
          row.endsAt = body.endsAt ? new Date(body.endsAt) : null;
        }
        if (body.isActive !== undefined) row.isActive = body.isActive;
        const saved = await promoRepo.save(row);
        return serializePromo(saved);
      });

      app.delete("/v1/tanker/settings/promos/:id", async (request, reply) => {
        const id = parseEntityId((request.params as { id: string }).id);
        const userId = requireUserId(request.headers as Record<string, unknown>);
        if (!userId) {
          return reply.code(401).send({
            error: { code: "UNAUTHORIZED", message: "Login required" },
          });
        }
        const row = await promoRepo.findOne({ where: { id } });
        if (!row) {
          return reply.code(404).send({
            error: { code: "NOT_FOUND", message: "Promo code not found" },
          });
        }
        await promoRepo.remove(row);
        return reply.code(204).send();
      });
    },
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
