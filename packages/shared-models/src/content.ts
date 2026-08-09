import { z } from "zod";

export const contentModuleSchema = z.enum(["parking", "tanker"]);
export type ContentModule = z.infer<typeof contentModuleSchema>;

export const termsAudienceSchema = z.enum([
  "customer",
  "parking_owner",
  "tanker_supplier",
  "tanker_driver",
]);
export type TermsAudience = z.infer<typeof termsAudienceSchema>;

export const announcementAudienceSchema = z.enum([
  "customers",
  "parking_owners",
  "tanker_suppliers",
  "tanker_drivers",
  "tanker_admins",
]);
export type AnnouncementAudience = z.infer<typeof announcementAudienceSchema>;

export const upsertPrivacyPolicySchema = z.object({
  module: contentModuleSchema,
  version: z.string().trim().min(1).max(40),
  title: z.string().trim().min(2).max(200).default("Privacy Policy"),
  body: z.string().trim().min(10).max(100_000),
  isPublished: z.boolean().optional().default(false),
});

export const upsertTermsSchema = z.object({
  audience: termsAudienceSchema,
  module: contentModuleSchema,
  version: z.string().trim().min(1).max(40),
  title: z.string().trim().min(2).max(200).default("Terms & Conditions"),
  body: z.string().trim().min(10).max(100_000),
  isPublished: z.boolean().optional().default(false),
});

export const acceptTermsSchema = z.object({
  termsId: z.coerce.number().int().positive(),
  context: z.enum(["registration", "booking", "manual"]).default("registration"),
  referenceId: z.coerce.number().int().positive().optional().nullable(),
});

export const upsertFaqSchema = z.object({
  module: contentModuleSchema,
  category: z.string().trim().min(1).max(80).default("general"),
  question: z.string().trim().min(3).max(500),
  answer: z.string().trim().min(3).max(20_000),
  displayOrder: z.coerce.number().int().min(0).default(0),
  isActive: z.boolean().optional().default(true),
});

export const updateFaqSchema = upsertFaqSchema.partial().extend({
  module: contentModuleSchema.optional(),
});

export const upsertSupportContactSchema = z.object({
  module: contentModuleSchema,
  supportEmail: z.string().trim().email().optional().nullable(),
  supportPhone: z.string().trim().max(40).optional().nullable(),
  whatsappNumber: z.string().trim().max(40).optional().nullable(),
  workingHours: z.string().trim().max(200).optional().nullable(),
  emergencyContact: z.string().trim().max(120).optional().nullable(),
  officeAddress: z.string().trim().max(2000).optional().nullable(),
  socialLinks: z.record(z.string().trim()).optional().default({}),
});

export const upsertAnnouncementSchema = z.object({
  module: contentModuleSchema,
  title: z.string().trim().min(3).max(200),
  body: z.string().trim().min(3).max(10_000),
  audiences: z.array(announcementAudienceSchema).min(1),
  startAt: z.string().datetime({ offset: true }).or(z.string().min(8)),
  endAt: z.string().datetime({ offset: true }).or(z.string().min(8)),
  isActive: z.boolean().optional().default(true),
});

export const updateAnnouncementSchema = upsertAnnouncementSchema.partial().extend({
  module: contentModuleSchema.optional(),
  audiences: z.array(announcementAudienceSchema).min(1).optional(),
});
