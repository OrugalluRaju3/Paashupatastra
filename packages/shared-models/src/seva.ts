import { z } from "zod";
import {
  sevaBookingStatusSchema,
  sevaServiceCategorySchema,
} from "./enums";
import { optionalPhoneSchema, phoneSchema } from "./user";

export const createSevaProviderSchema = z.object({
  fullName: z.string().min(2).max(120),
  email: z.string().email().optional().nullable(),
  alternateMobile: optionalPhoneSchema,
  address: z.string().min(3).max(240),
  city: z.string().min(2).max(80),
  state: z.string().min(2).max(80),
  country: z.string().min(2).max(80).default("IN"),
  pinCode: z.string().min(4).max(12),
  latitude: z.number().min(-90).max(90).optional().nullable(),
  longitude: z.number().min(-180).max(180).optional().nullable(),
  serviceRadiusKm: z.number().int().positive().max(100).default(10),
  proofUrl: z.string().max(500).optional().nullable(),
});

export type CreateSevaProviderInput = z.infer<typeof createSevaProviderSchema>;

export const updateSevaProviderOnlineSchema = z.object({
  isOnline: z.boolean(),
});

export const createSevaWorkerSchema = z.object({
  fullName: z.string().min(2).max(120),
  mobile: phoneSchema,
  email: z.string().email().optional().nullable(),
  skills: z.string().min(2).max(240).default("cleaning"),
});

export type CreateSevaWorkerInput = z.infer<typeof createSevaWorkerSchema>;

export const createSevaOfferingSchema = z.object({
  category: sevaServiceCategorySchema,
  title: z.string().min(2).max(120),
  description: z.string().max(1000).optional().nullable(),
  durationMinutes: z.number().int().positive().max(8 * 60).default(60),
  amountInPaise: z.number().int().nonnegative(),
});

export type CreateSevaOfferingInput = z.infer<typeof createSevaOfferingSchema>;

export const updateSevaOfferingSchema = createSevaOfferingSchema.partial().extend({
  isActive: z.boolean().optional(),
});

export const searchSevaOfferingsSchema = z.object({
  category: sevaServiceCategorySchema.optional(),
  q: z.string().max(80).optional(),
  latitude: z.coerce.number().min(-90).max(90).optional(),
  longitude: z.coerce.number().min(-180).max(180).optional(),
  radiusKm: z.coerce.number().positive().max(100).optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(50).default(20),
});

export const createSevaBookingSchema = z.object({
  offeringId: z.coerce.number().int().positive(),
  serviceAddress: z.string().min(3).max(240),
  scheduledAt: z.string().datetime(),
  notes: z.string().max(500).optional().nullable(),
  latitude: z.number().min(-90).max(90).optional().nullable(),
  longitude: z.number().min(-180).max(180).optional().nullable(),
});

export type CreateSevaBookingInput = z.infer<typeof createSevaBookingSchema>;

export const decideSevaBookingSchema = z
  .object({
    decision: z.enum(["accept", "reject"]),
    workerId: z.coerce.number().int().positive().optional(),
  })
  .superRefine((val, ctx) => {
    if (val.decision === "accept" && !val.workerId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Assign a worker before accepting this request",
        path: ["workerId"],
      });
    }
  });

export const updateSevaBookingStatusSchema = z.object({
  status: sevaBookingStatusSchema,
  otp: z.string().min(4).max(8).optional(),
});

export const confirmSevaPaymentSchema = z.object({
  orderId: z.string().max(64).optional(),
  source: z.string().max(64).optional(),
});

export const sevaBookingChatMessageSchema = z.object({
  body: z.string().trim().min(1).max(2000),
});

export const assignSevaWorkerSchema = z.object({
  workerId: z.coerce.number().int().positive(),
});

const sevaFeeTypeSchema = z.enum(["percentage", "flat", "both"]);

export const createSevaPlatformFeeSchema = z.object({
  feeType: sevaFeeTypeSchema.default("percentage"),
  percentageBps: z.number().int().min(0).max(10000).default(1000),
  flatFeeInPaise: z.number().int().nonnegative().default(0),
  isActive: z.boolean().default(true),
});

export type CreateSevaPlatformFeeInput = z.infer<typeof createSevaPlatformFeeSchema>;

export const updateSevaPlatformFeeSchema = createSevaPlatformFeeSchema.partial();

export type UpdateSevaPlatformFeeInput = z.infer<typeof updateSevaPlatformFeeSchema>;
