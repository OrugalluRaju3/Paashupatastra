import { z } from "zod";
import { uploadedFileRefSchema } from "./common";
import {
  documentTypeSchema,
  listingStatusSchema,
  parkingRentTypeSchema,
  parkingTypeSchema,
  vehicleTypeSchema,
} from "./enums";

export const ownerApplicationSchema = z.object({
  // Personal
  fullName: z.string().min(2).max(120),
  email: z.string().email(),
  dateOfBirth: z.string().optional().nullable(),
  profilePhotoUrl: uploadedFileRefSchema.optional().nullable(),

  // Apartment
  apartmentName: z.string().min(2).max(160),
  flatNumber: z.string().min(1).max(40),
  blockTower: z.string().min(1).max(40),
  floorNumber: z.string().max(20).optional().nullable(),
  city: z.string().min(2).max(80),
  state: z.string().min(2).max(80),
  country: z.string().default("IN"),
  pinCode: z.string().regex(/^\d{6}$/),
  addressLine: z.string().min(5).max(300),
  latitude: z.number(),
  longitude: z.number(),
  mapsUrl: z.string().min(1).optional().nullable(),

  // Parking
  parkingSlotNumber: z.string().min(1).max(40),
  parkingType: parkingTypeSchema,
  vehicleTypesAllowed: z.array(vehicleTypeSchema).min(1),
  parkingDimensions: z.string().max(80).optional().nullable(),
  numberOfSlots: z.number().int().positive().default(1),
  availabilityStartTime: z.string().regex(/^\d{2}:\d{2}$/),
  availabilityEndTime: z.string().regex(/^\d{2}:\d{2}$/),
  availableDays: z.enum(["weekdays", "weekends", "all_days"]).default("all_days"),
  rentType: parkingRentTypeSchema,
  priceInPaise: z.number().int().positive(),
  /** Preferred availability after verification (listing stays inactive until approved). */
  isActive: z.boolean().optional().default(true),

  // Bank
  accountHolderName: z.string().min(2).max(120),
  bankName: z.string().min(2).max(120),
  accountNumber: z.string().min(8).max(30),
  ifscCode: z.string().min(5).max(20),
  upiId: z.string().max(80).optional().nullable(),

  // Documents (uploaded files)
  governmentIdUrl: uploadedFileRefSchema,
  selfieWithIdUrl: uploadedFileRefSchema.optional().nullable(),
  ownershipProofUrl: uploadedFileRefSchema,
  parkingAllocationProofUrl: uploadedFileRefSchema,
  associationApprovalUrl: uploadedFileRefSchema.optional().nullable(),
  parkingPhotoUrls: z.array(uploadedFileRefSchema).min(3),
  entrancePhotoUrl: uploadedFileRefSchema,
}).superRefine((data, ctx) => {
  const normalize = (value: string) => value.trim().replace(/\s+/g, " ").toLowerCase();
  if (normalize(data.fullName) !== normalize(data.accountHolderName)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["accountHolderName"],
      message: "Account holder name must match full name",
    });
  }
});

export type OwnerApplicationInput = z.infer<typeof ownerApplicationSchema>;

export const assignVerificationSchema = z.object({
  listingId: z.coerce.number().int().positive(),
  executiveUserId: z.coerce.number().int().positive(),
  dueAt: z.string().datetime().optional(),
});

export type AssignVerificationInput = z.infer<typeof assignVerificationSchema>;

export const fieldVerificationReportSchema = z.object({
  assignmentId: z.coerce.number().int().positive(),
  decision: z.enum(["approve", "reject"]),
  comments: z.string().trim().min(5).max(2000),
  photoUrls: z.array(uploadedFileRefSchema).min(1),
  verifiedLatitude: z.number().optional(),
  verifiedLongitude: z.number().optional(),
  addressVerified: z.boolean(),
  ownershipVerified: z.boolean(),
  slotVerified: z.boolean(),
  documentsVerified: z.boolean(),
  gpsVerified: z.boolean(),
}).superRefine((data, ctx) => {
  if (data.decision === "reject" && data.comments.trim().length < 10) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["comments"],
      message: "Rejection reason is required (at least 10 characters)",
    });
  }
});

export type FieldVerificationReportInput = z.infer<typeof fieldVerificationReportSchema>;

export const managerDecisionSchema = z.object({
  listingId: z.coerce.number().int().positive(),
  decision: z.enum(["approve", "reject", "send_back", "need_info"]),
  comments: z.string().trim().min(3).max(2000),
}).superRefine((data, ctx) => {
  if (data.decision === "reject" && data.comments.trim().length < 10) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["comments"],
      message: "Rejection reason is required (at least 10 characters)",
    });
  }
});

export type ManagerDecisionInput = z.infer<typeof managerDecisionSchema>;

export const customerProfileSchema = z.object({
  fullName: z.string().min(2).max(120),
  email: z.string().email(),
  city: z.string().min(2).max(80),
  state: z.string().min(2).max(80),
  country: z.string().default("IN"),
  pinCode: z.string().regex(/^\d{6}$/),
  preferredLocation: z.string().max(200).optional().nullable(),
});

export type CustomerProfileInput = z.infer<typeof customerProfileSchema>;

export const publicSignupSchema = customerProfileSchema.extend({
  intent: z.enum(["customer", "owner", "supplier"]),
});

export type PublicSignupInput = z.infer<typeof publicSignupSchema>;

export const parkingSearchSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  q: z.string().trim().optional(),
  city: z.string().optional(),
  pinCode: z.string().optional(),
  latitude: z.coerce.number().optional(),
  longitude: z.coerce.number().optional(),
  radiusKm: z.coerce.number().positive().max(50).default(5),
  vehicleType: vehicleTypeSchema.optional(),
  parkingType: parkingTypeSchema.optional(),
  minPriceInPaise: z.coerce.number().int().optional(),
  maxPriceInPaise: z.coerce.number().int().optional(),
  startAt: z.string().datetime().optional(),
  endAt: z.string().datetime().optional(),
});

export type ParkingSearchInput = z.infer<typeof parkingSearchSchema>;

export const quoteBookingSchema = z.object({
  listingId: z.coerce.number().int().positive(),
  startAt: z.string().datetime(),
  endAt: z.string().datetime(),
});

export type QuoteBookingInput = z.infer<typeof quoteBookingSchema>;

export const createBookingV2Schema = z.object({
  listingId: z.coerce.number().int().positive(),
  startAt: z.string().datetime(),
  endAt: z.string().datetime(),
  vehicleNumber: z.string().min(4).max(20).optional(),
  vehicleType: vehicleTypeSchema.optional(),
});

export type CreateBookingV2Input = z.infer<typeof createBookingV2Schema>;

export const documentUploadMetaSchema = z.object({
  type: documentTypeSchema,
  fileUrl: uploadedFileRefSchema,
  listingId: z.coerce.number().int().positive().optional(),
});

export type DocumentUploadMeta = z.infer<typeof documentUploadMetaSchema>;

export { listingStatusSchema };
