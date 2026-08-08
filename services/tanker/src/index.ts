import "reflect-metadata";
import {
  TankerInvoiceEntity,
  TankerOrderEntity,
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
    latitude: row.latitude,
    longitude: row.longitude,
    status: row.status,
    createdAt: toIsoRequired(row.createdAt),
    updatedAt: toIsoRequired(row.updatedAt),
  };
}

function serializeOrder(row: TankerOrderEntity) {
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
    orderId: row.orderId,
    customerUserId: row.customerUserId,
    supplierId: row.supplierId,
    amountInPaise: row.amountInPaise,
    status: row.status,
    createdAt: toIsoRequired(row.createdAt),
    updatedAt: toIsoRequired(row.updatedAt),
  };
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

async function main() {
  loadEnv();
  const ds = await getDataSource();

  const supplierRepo = ds.getRepository(TankerSupplierEntity);
  const vehicleRepo = ds.getRepository(TankerVehicleEntity);
  const requestRepo = ds.getRepository(TankerRequestEntity);
  const orderRepo = ds.getRepository(TankerOrderEntity);
  const userRepo = ds.getRepository(TankerUserEntity);
  const invoiceRepo = ds.getRepository(TankerInvoiceEntity);
  const promoRepo = ds.getRepository(TankerPromoCodeEntity);
  const taxRepo = ds.getRepository(TankerTaxSettingEntity);
  const platformFeeRepo = ds.getRepository(TankerPlatformFeeSettingEntity);

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
      io.to(`order:${orderId}`).emit("driverLocation", {
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
      io = new Server(app.server, { cors: { origin: true } });
      io.on("connection", (socket) => {
        socket.on("trackDriver", (data: { orderId?: string }) => {
          if (data?.orderId) socket.join(`order:${data.orderId}`);
        });
        socket.on("stopTracking", (data: { orderId?: string }) => {
          if (data?.orderId) socket.leave(`order:${data.orderId}`);
        });
        socket.on(
          "driverLocationUpdate",
          async (data: { orderId?: string; latitude?: number; longitude?: number }) => {
            if (
              data?.orderId == null ||
              data.latitude == null ||
              data.longitude == null
            ) {
              return;
            }
            await updateOrderDriverLocation(parseEntityId(data.orderId), data.latitude, data.longitude);
          },
        );
      });
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

        if (raw.role === UserRole.TANKER_SUPPLIER || raw.role === UserRole.TANKER_DRIVER) {
          qb.andWhere(`:role = ANY(u.roles)`, { role: raw.role });
        } else {
          qb.andWhere(`(:supplier = ANY(u.roles) OR :driver = ANY(u.roles))`, {
            supplier: UserRole.TANKER_SUPPLIER,
            driver: UserRole.TANKER_DRIVER,
          });
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

        return serializeTankerUser(await userRepo.save(user));
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

        return serializeSupplier(await supplierRepo.save(row));
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
        const vehicleIds = new Set(vehicles.map((v) => v.id));
        const mobile = normalizePhone(user.phone);

        const recent = await orderRepo.find({
          order: { createdAt: "DESC" },
          take: 100,
        });
        const orders = recent.filter(
          (o) =>
            (o.vehicleId && vehicleIds.has(o.vehicleId)) ||
            normalizePhone(o.driverMobile) === mobile,
        );

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
        Object.assign(vehicle, body);
        const saved = await vehicleRepo.save(vehicle);

        if (body.driverMobile || body.driverFullName || body.driverEmail !== undefined) {
          await ensureDriverUser({
            mobile: saved.driverMobile,
            name: saved.driverFullName,
            email: saved.driverEmail,
          });
        }

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
        }

        const saved = await requestRepo.save(
          requestRepo.create({
            customerUserId: userId,
            supplierId: body.supplierId ?? null,
            waterType: body.waterType ?? "drinking",
            quantityLitres: body.quantityLitres,
            comments: body.comments ?? null,
            deliveryAddress: body.deliveryAddress,
            latitude: body.latitude ?? null,
            longitude: body.longitude ?? null,
            status: TankerRequestStatus.PENDING,
          }),
        );

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
          return { request: serializeRequest(saved), order: null };
        }

        let vehicle: TankerVehicleEntity | null = null;
        if (body.vehicleId) {
          vehicle = await vehicleRepo.findOne({ where: { id: body.vehicleId } });
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
        }

        const amountInPaise = vehicle?.amountInPaise ?? 0;
        const fees = await computeFees(amountInPaise);

        tankerRequest.status = TankerRequestStatus.ACCEPTED;
        tankerRequest.supplierId = supplier.id;
        if (body.comments) tankerRequest.comments = body.comments;
        await requestRepo.save(tankerRequest);

        const order = await orderRepo.save(
          orderRepo.create({
            customerUserId: tankerRequest.customerUserId,
            supplierId: supplier.id,
            vehicleId: vehicle?.id ?? null,
            requestId: tankerRequest.id,
            waterType: tankerRequest.waterType,
            capacityLitres: vehicle?.capacityLitres ?? tankerRequest.quantityLitres,
            vehicleNumber: vehicle?.vehicleNumber ?? null,
            driverName: vehicle?.driverFullName ?? null,
            driverMobile: vehicle?.driverMobile ?? null,
            amountInPaise,
            platformFeeInPaise: fees.platformFeeInPaise,
            taxInPaise: fees.taxInPaise,
            discountInPaise: fees.discountInPaise,
            totalAmountInPaise: fees.totalAmountInPaise,
            promoCode: fees.promoCode,
            deliveryAddress: tankerRequest.deliveryAddress,
            deliveryAt: null,
            comments: tankerRequest.comments,
            paymentMethod: null,
            paymentStatus: PaymentStatus.PENDING,
            status: TankerOrderStatus.SCHEDULED,
            deliveryOtp: null,
            otpVerified: false,
          }),
        );

        if (vehicle) {
          vehicle.status = TankerVehicleStatus.ON_DELIVERY;
          await vehicleRepo.save(vehicle);
        }

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
        }

        order.status = body.status;
        const saved = await orderRepo.save(order);

        if (body.status === TankerOrderStatus.DELIVERED && order.vehicleId) {
          const vehicle = await vehicleRepo.findOne({ where: { id: order.vehicleId } });
          if (vehicle) {
            vehicle.status = TankerVehicleStatus.AVAILABLE;
            await vehicleRepo.save(vehicle);
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
        const saved = await orderRepo.save(order);
        return serializeOrder(saved);
      });

      app.post("/v1/tanker/orders/:id/confirm-payment", async (request, reply) => {
        const id = parseEntityId((request.params as { id: string }).id);
        const body = confirmTankerPaymentSchema.parse(request.body ?? {});

        const order = await orderRepo.findOne({ where: { id } });
        if (!order) {
          return reply.code(404).send({
            error: { code: "NOT_FOUND", message: "Order not found" },
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

        const existingInvoice = await invoiceRepo.findOne({ where: { orderId: id } });
        if (!existingInvoice) {
          await invoiceRepo.save(
            invoiceRepo.create({
              orderId: id,
              customerUserId: order.customerUserId,
              supplierId: order.supplierId,
              amountInPaise: order.totalAmountInPaise || order.amountInPaise,
              status: PaymentStatus.PAID,
            }),
          );
        }

        if (!wasPaid && order.promoCode) {
          const promo = await promoRepo.findOne({ where: { code: order.promoCode } });
          if (promo) {
            promo.usedCount += 1;
            await promoRepo.save(promo);
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

      app.get("/v1/tanker/invoices", async (request) => {
        const query = paginationQuerySchema.parse(request.query);
        const raw = request.query as { customerUserId?: string; supplierId?: string };
        const qb = invoiceRepo.createQueryBuilder("i").orderBy("i.created_at", "DESC");

        if (raw.customerUserId) {
          qb.andWhere("i.customer_user_id = :customerUserId", {
            customerUserId: raw.customerUserId,
          });
        }
        if (raw.supplierId) {
          qb.andWhere("i.supplier_id = :supplierId", { supplierId: raw.supplierId });
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
        const row = await invoiceRepo.findOne({ where: { id } });
        if (!row) {
          return reply.code(404).send({
            error: { code: "NOT_FOUND", message: "Invoice not found" },
          });
        }
        return serializeInvoice(row);
      });

      app.get("/v1/tanker/reports/customers", async (request) => {
        const query = paginationQuerySchema.parse(request.query);

        const totalResult = await orderRepo
          .createQueryBuilder("o")
          .select("COUNT(DISTINCT o.customer_user_id)", "cnt")
          .getRawOne();
        const total = Number(totalResult?.cnt ?? 0);

        const rows = await orderRepo
          .createQueryBuilder("o")
          .select("o.customer_user_id", "customerUserId")
          .addSelect("COUNT(*)", "ordersCount")
          .addSelect("MAX(o.created_at)", "lastOrderAt")
          .addSelect(
            `COALESCE(SUM(CASE WHEN o.payment_status = :paid THEN o.total_amount_in_paise ELSE 0 END), 0)`,
            "totalPaidInPaise",
          )
          .setParameter("paid", PaymentStatus.PAID)
          .groupBy("o.customer_user_id")
          .orderBy("MAX(o.created_at)", "DESC")
          .offset((query.page - 1) * query.limit)
          .limit(query.limit)
          .getRawMany();

        return {
          items: rows.map((row) => ({
            customerUserId: row.customerUserId as string,
            ordersCount: Number(row.ordersCount),
            lastOrderAt: toIsoRequired(new Date(row.lastOrderAt as string)),
            totalPaidInPaise: Number(row.totalPaidInPaise),
          })),
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
