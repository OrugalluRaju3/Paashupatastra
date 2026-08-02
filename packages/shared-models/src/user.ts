import { z } from "zod";
import { UserRole, userRoleSchema } from "./enums";

export const phoneSchema = z
  .string()
  .regex(/^[6-9]\d{9}$/, "Invalid Indian mobile number");

export const userSchema = z.object({
  id: z.string().uuid(),
  phone: phoneSchema,
  name: z.string().min(1).max(120).nullable(),
  email: z.string().email().nullable(),
  roles: z.array(userRoleSchema).min(1),
  isActive: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type User = z.infer<typeof userSchema>;

export const requestOtpSchema = z.object({
  phone: phoneSchema,
  /** Used to email OTP during signup before the user record exists. */
  email: z.string().email().optional(),
});

export type RequestOtpInput = z.infer<typeof requestOtpSchema>;

export const verifyOtpSchema = z.object({
  phone: phoneSchema,
  otp: z.string().length(6),
});

export type VerifyOtpInput = z.infer<typeof verifyOtpSchema>;

export const authTokensSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string().optional(),
  user: userSchema,
});

export type AuthTokens = z.infer<typeof authTokensSchema>;

/** Super Admin invites Manager or Field Executive with full profile. */
export const createStaffInviteSchema = z.object({
  phone: phoneSchema,
  name: z.string().min(2).max(120),
  email: z.string().email(),
  role: z.enum([UserRole.VERIFICATION_MANAGER, UserRole.FIELD_EXECUTIVE]),
  city: z.string().min(2).max(80),
  state: z.string().min(2).max(80),
  country: z.string().min(2).max(80).default("IN"),
  pinCode: z.string().regex(/^\d{6}$/, "PIN must be 6 digits"),
  dateOfBirth: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
    .optional()
    .nullable(),
  preferredLocation: z.string().max(200).optional().nullable(),
});

export type CreateStaffInviteInput = z.infer<typeof createStaffInviteSchema>;

/** Admin update of any user profile. */
export const updateUserAdminSchema = z.object({
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
    .array(
      z.enum([
        UserRole.SUPER_ADMIN,
        UserRole.VERIFICATION_MANAGER,
        UserRole.FIELD_EXECUTIVE,
        UserRole.PARKING_OWNER,
        UserRole.CUSTOMER,
      ]),
    )
    .min(1)
    .optional(),
});

export type UpdateUserAdminInput = z.infer<typeof updateUserAdminSchema>;

export const updateUserStatusSchema = z.object({
  isActive: z.boolean(),
});

export type UpdateUserStatusInput = z.infer<typeof updateUserStatusSchema>;

export const sendEmailNotificationSchema = z.object({
  userId: z.string().uuid().optional().nullable(),
  toEmail: z.string().email(),
  toPhone: phoneSchema.optional(),
  title: z.string().min(1).max(160),
  body: z.string().min(1).max(8000),
  referenceType: z.string().max(40).optional().nullable(),
  referenceId: z.string().uuid().optional().nullable(),
  /** When false, email is delivered without creating an inbox/log row (caller already logged). */
  skipLog: z.boolean().optional().default(false),
});

export type SendEmailNotificationInput = z.infer<typeof sendEmailNotificationSchema>;
