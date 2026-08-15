import { z } from "zod";
import { paginationQuerySchema } from "./common";
import {
  communityComplaintCategorySchema,
  communityComplaintStatusSchema,
  communityMembershipRoleSchema,
} from "./enums";
import { optionalPhoneSchema, phoneSchema } from "./user";

export const communitySchema = z.object({
  id: z.coerce.number().int().positive(),
  name: z.string().min(2).max(160),
  slug: z.string().min(2).max(80),
  city: z.string().min(2).max(80),
  state: z.string().min(2).max(80),
  country: z.string().default("IN"),
  latitude: z.number().nullable(),
  longitude: z.number().nullable(),
  isActive: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type Community = z.infer<typeof communitySchema>;

export const apartmentSchema = z.object({
  id: z.coerce.number().int().positive(),
  communityId: z.coerce.number().int().positive(),
  name: z.string().min(2).max(160),
  inviteCode: z.string().min(4).max(16),
  addressLine: z.string().min(2).max(240),
  isActive: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type Apartment = z.infer<typeof apartmentSchema>;

export const blockSchema = z.object({
  id: z.coerce.number().int().positive(),
  apartmentId: z.coerce.number().int().positive(),
  name: z.string().min(1).max(40),
});

export type Block = z.infer<typeof blockSchema>;

export const flatSchema = z.object({
  id: z.coerce.number().int().positive(),
  blockId: z.coerce.number().int().positive(),
  number: z.string().min(1).max(20),
});

export type Flat = z.infer<typeof flatSchema>;

export const createApartmentSchema = z.object({
  communityId: z.coerce.number().int().positive().optional(),
  communityName: z.string().min(2).max(160).optional(),
  name: z.string().min(2).max(160),
  city: z.string().min(2).max(80),
  state: z.string().min(2).max(80),
  addressLine: z.string().min(2).max(240),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
});

export type CreateApartmentInput = z.infer<typeof createApartmentSchema>;

export const updateApartmentSchema = createApartmentSchema
  .omit({ communityId: true, communityName: true })
  .partial()
  .extend({
    isActive: z.boolean().optional(),
  });

export type UpdateApartmentInput = z.infer<typeof updateApartmentSchema>;

export const joinApartmentSchema = z.object({
  inviteCode: z.string().min(4).max(16),
  flatNumber: z.string().min(1).max(20).optional(),
  blockName: z.string().min(1).max(40).optional(),
});

export type JoinApartmentInput = z.infer<typeof joinApartmentSchema>;

export const createCommunityBlockSchema = z.object({
  apartmentId: z.coerce.number().int().positive(),
  name: z.string().trim().min(1).max(40),
});

export const createCommunityFlatSchema = z.object({
  blockId: z.coerce.number().int().positive(),
  number: z.string().trim().min(1).max(20),
});

export const joinCommunitySchema = z.object({
  inviteCode: z.string().trim().min(4).max(16),
  flatId: z.coerce.number().int().positive(),
  role: communityMembershipRoleSchema.default("resident"),
});

export type JoinCommunityInput = z.infer<typeof joinCommunitySchema>;

export const registerCommunityMemberSchema = z
  .object({
    phone: phoneSchema,
    name: z.string().trim().min(2).max(120),
    email: z.string().email(),
    city: z.string().trim().min(2).max(80),
    state: z.string().trim().min(2).max(80),
    country: z.string().trim().min(2).max(80).default("IN"),
    pinCode: z.string().regex(/^\d{6}$/, "PIN must be 6 digits"),
    role: communityMembershipRoleSchema,
    apartmentId: z.coerce.number().int().positive(),
    flatId: z.coerce.number().int().positive().optional().nullable(),
  })
  .refine((data) => data.role !== "resident" || (data.flatId != null && data.flatId > 0), {
    message: "Select a flat when registering a resident",
    path: ["flatId"],
  });

export type RegisterCommunityMemberInput = z.infer<typeof registerCommunityMemberSchema>;

export const decideCommunityMembershipSchema = z.object({
  decision: z.enum(["approve", "reject", "suspend"]),
});

export const createCommunityNoticeSchema = z.object({
  apartmentId: z.coerce.number().int().positive().optional(),
  title: z.string().trim().min(3).max(200),
  body: z.string().trim().min(3).max(10_000),
  isActive: z.boolean().optional().default(true),
});

export const createCommunityComplaintSchema = z.object({
  apartmentId: z.coerce.number().int().positive().optional(),
  category: communityComplaintCategorySchema,
  title: z.string().trim().min(3).max(160),
  body: z.string().trim().min(3).max(4000),
});

export const updateCommunityComplaintSchema = z.object({
  status: communityComplaintStatusSchema,
  adminNotes: z.string().trim().max(2000).optional().nullable(),
});

export const createCommunityVisitorPassSchema = z.object({
  apartmentId: z.coerce.number().int().positive().optional(),
  guestName: z.string().trim().min(2).max(120),
  guestPhone: optionalPhoneSchema,
  vehicleNumber: z.string().trim().max(20).optional().nullable(),
  purpose: z.string().trim().max(160).optional().nullable(),
  validFrom: z.string().datetime(),
  validTo: z.string().datetime(),
});

export const verifyCommunityVisitorSchema = z.object({
  otp: z.string().min(4).max(8),
  action: z.enum(["check_in", "check_out"]).default("check_in"),
});

export const updateCommunityAccountSchema = z.object({
  monthlyMaintenanceInPaise: z.number().int().nonnegative().optional(),
  dueDay: z.number().int().min(1).max(28).optional(),
});

export const postCommunityDuesSchema = z.object({
  apartmentId: z.coerce.number().int().positive().optional(),
  period: z.string().regex(/^\d{4}-\d{2}$/, "Use YYYY-MM"),
  amountInPaise: z.number().int().positive().optional(),
});

export const confirmCommunityDuePaymentSchema = z.object({
  orderId: z.string().min(3).optional(),
  source: z.string().optional(),
});

export const createCommunityExpenseSchema = z.object({
  apartmentId: z.coerce.number().int().positive().optional(),
  category: z.string().trim().min(2).max(80),
  vendor: z.string().trim().min(2).max(160),
  amountInPaise: z.number().int().positive(),
  notes: z.string().trim().max(2000).optional().nullable(),
  receiptUrl: z.string().max(500).optional().nullable(),
});

const expenseDateQuerySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
  .optional();

export const listCommunityExpensesQuerySchema = paginationQuerySchema.extend({
  apartmentId: z.coerce.number().int().positive().optional(),
  category: z.string().trim().min(1).max(80).optional(),
  fromDate: expenseDateQuerySchema,
  toDate: expenseDateQuerySchema,
});

export const exportCommunityExpensesQuerySchema = z.object({
  apartmentId: z.coerce.number().int().positive().optional(),
  category: z.string().trim().min(1).max(80).optional(),
  q: z.string().trim().optional(),
  fromDate: expenseDateQuerySchema,
  toDate: expenseDateQuerySchema,
  format: z.enum(["pdf", "excel"]),
});

