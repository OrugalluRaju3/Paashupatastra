import { z } from "zod";
import {
  tankerOrderStatusSchema,
  tankerRequestStatusSchema,
  tankerVehicleStatusSchema,
} from "./enums";

export const createTankerSupplierSchema = z.object({
  fullName: z.string().min(2).max(120),
  email: z.string().email().optional().nullable(),
  alternateMobile: z.string().min(10).max(15).optional().nullable(),
  address: z.string().min(3).max(240),
  landmark: z.string().max(120).optional().nullable(),
  city: z.string().min(2).max(80),
  state: z.string().min(2).max(80),
  country: z.string().min(2).max(80).default("IN"),
  pinCode: z.string().min(4).max(12),
  availabilityStartTime: z.string().regex(/^\d{2}:\d{2}$/).default("06:00"),
  availabilityEndTime: z.string().regex(/^\d{2}:\d{2}$/).default("22:00"),
  latitude: z.number().min(-90).max(90).optional().nullable(),
  longitude: z.number().min(-180).max(180).optional().nullable(),
  proofUrl: z.string().max(500).optional().nullable(),
});

export type CreateTankerSupplierInput = z.infer<typeof createTankerSupplierSchema>;

export const createTankerVehicleSchema = z.object({
  driverFullName: z.string().min(2).max(120),
  driverMobile: z.string().min(10).max(15),
  driverEmail: z.string().email().optional().nullable(),
  vehicleNumber: z.string().min(4).max(20),
  capacityLitres: z.number().int().positive(),
  amountInPaise: z.number().int().nonnegative(),
  waterType: z.string().min(2).max(40).default("drinking"),
  licenceFrontUrl: z.string().max(500).optional().nullable(),
  licenceBackUrl: z.string().max(500).optional().nullable(),
  tankerImageUrl: z.string().max(500).optional().nullable(),
  status: tankerVehicleStatusSchema.optional(),
});

export type CreateTankerVehicleInput = z.infer<typeof createTankerVehicleSchema>;

/** Full supplier registration (profile + at least one tanker/driver), matching old Tanker_Web signup. */
export const registerTankerSupplierSchema = createTankerSupplierSchema.extend({
  vehicles: z
    .array(
      createTankerVehicleSchema.extend({
        licenceFrontUrl: z.string().min(1).max(500),
        licenceBackUrl: z.string().min(1).max(500),
      }),
    )
    .min(1),
});

export type RegisterTankerSupplierInput = z.infer<typeof registerTankerSupplierSchema>;

export const createTankerRequestSchema = z.object({
  supplierId: z.coerce.number().int().positive().optional(),
  waterType: z.string().min(2).max(40).default("drinking"),
  quantityLitres: z.number().int().positive(),
  comments: z.string().max(500).optional().nullable(),
  deliveryAddress: z.string().min(3).max(240),
  latitude: z.number().min(-90).max(90).optional().nullable(),
  longitude: z.number().min(-180).max(180).optional().nullable(),
  /** Preferred delivery datetime (ISO). Used for supplier availability matching. */
  preferredDeliveryAt: z.string().datetime().optional().nullable(),
});

export type CreateTankerRequestInput = z.infer<typeof createTankerRequestSchema>;

export const searchTankerSuppliersSchema = z.object({
  waterType: z.string().min(2).max(40).default("drinking"),
  quantityLitres: z.coerce.number().int().positive(),
  /** YYYY-MM-DD */
  deliveryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  /** HH:mm (24h) */
  deliveryTime: z.string().regex(/^\d{2}:\d{2}$/),
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
  radiusKm: z.coerce.number().positive().default(15),
});

export type SearchTankerSuppliersInput = z.infer<typeof searchTankerSuppliersSchema>;

export const decideTankerRequestSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("accepted"),
    vehicleId: z.coerce.number().int().positive({
      message: "Select a vehicle to accept this request",
    }),
    comments: z.string().max(500).optional().nullable(),
  }),
  z.object({
    status: z.literal("rejected"),
    vehicleId: z.coerce.number().int().positive().optional(),
    comments: z.string().max(500).optional().nullable(),
  }),
]);

export type DecideTankerRequestInput = z.infer<typeof decideTankerRequestSchema>;

export const createTankerOrderSchema = z.object({
  supplierId: z.coerce.number().int().positive(),
  vehicleId: z.coerce.number().int().positive().optional(),
  waterType: z.string().min(2).max(40).default("drinking"),
  capacityLitres: z.number().int().positive(),
  amountInPaise: z.number().int().nonnegative(),
  deliveryAddress: z.string().min(3).max(240),
  deliveryAt: z.string().datetime().optional().nullable(),
  comments: z.string().max(500).optional().nullable(),
  paymentMethod: z.string().max(40).optional().nullable(),
  promoCode: z.string().max(40).optional().nullable(),
});

const tankerDiscountTypeSchema = z.enum(["percentage", "flat"]);
const tankerFeeTypeSchema = z.enum(["percentage", "flat", "both"]);

export const createTankerPromoSchema = z.object({
  code: z.string().min(2).max(40),
  description: z.string().max(240).optional().nullable(),
  discountType: tankerDiscountTypeSchema.default("percentage"),
  discountValue: z.number().int().nonnegative(),
  minOrderInPaise: z.number().int().nonnegative().default(0),
  maxUses: z.number().int().nonnegative().default(0),
  startsAt: z.string().datetime().optional().nullable(),
  endsAt: z.string().datetime().optional().nullable(),
  isActive: z.boolean().default(true),
});

export type CreateTankerPromoInput = z.infer<typeof createTankerPromoSchema>;

export const updateTankerPromoSchema = createTankerPromoSchema.partial();

export type UpdateTankerPromoInput = z.infer<typeof updateTankerPromoSchema>;

export const createTankerTaxSchema = z.object({
  taxName: z.string().min(2).max(80),
  taxBps: z.number().int().min(0).max(10000),
  country: z.string().min(2).max(80).default("IN"),
  state: z.string().min(2).max(80).optional().nullable(),
  isActive: z.boolean().default(true),
});

export type CreateTankerTaxInput = z.infer<typeof createTankerTaxSchema>;

export const updateTankerTaxSchema = createTankerTaxSchema.partial();

export type UpdateTankerTaxInput = z.infer<typeof updateTankerTaxSchema>;

export const createTankerPlatformFeeSchema = z.object({
  feeType: tankerFeeTypeSchema.default("percentage"),
  percentageBps: z.number().int().min(0).max(10000).default(1000),
  flatFeeInPaise: z.number().int().nonnegative().default(0),
  isActive: z.boolean().default(true),
});

export type CreateTankerPlatformFeeInput = z.infer<typeof createTankerPlatformFeeSchema>;

export const updateTankerPlatformFeeSchema = createTankerPlatformFeeSchema.partial();

export type UpdateTankerPlatformFeeInput = z.infer<typeof updateTankerPlatformFeeSchema>;

export const updateDriverLocationSchema = z.object({
  latitude: z.coerce.number().min(-90).max(90),
  longitude: z.coerce.number().min(-180).max(180),
});

export type UpdateDriverLocationInput = z.infer<typeof updateDriverLocationSchema>;

export const applyPromoSchema = z.object({
  code: z.string().min(2).max(40),
});

export type ApplyPromoInput = z.infer<typeof applyPromoSchema>;

export const confirmTankerPaymentSchema = z.object({
  orderId: z.string().max(64).optional(),
  source: z.string().max(64).optional(),
});

export type ConfirmTankerPaymentInput = z.infer<typeof confirmTankerPaymentSchema>;

export const tankerOrderChatMessageSchema = z.object({
  body: z.string().trim().min(1).max(2000),
});

export type TankerOrderChatMessageInput = z.infer<typeof tankerOrderChatMessageSchema>;

export type CreateTankerOrderInput = z.infer<typeof createTankerOrderSchema>;

export const updateTankerOrderStatusSchema = z.object({
  status: tankerOrderStatusSchema,
  /** Required when moving to delivering if OTP not yet verified. */
  otp: z.string().min(4).max(8).optional(),
});

export type UpdateTankerOrderStatusInput = z.infer<typeof updateTankerOrderStatusSchema>;

export const updateTankerSupplierOnlineSchema = z.object({
  isOnline: z.boolean(),
});

export { tankerRequestStatusSchema, tankerVehicleStatusSchema, tankerOrderStatusSchema };
