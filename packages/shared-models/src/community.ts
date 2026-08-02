import { z } from "zod";

export const communitySchema = z.object({
  id: z.string().uuid(),
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
  id: z.string().uuid(),
  communityId: z.string().uuid(),
  name: z.string().min(2).max(160),
  inviteCode: z.string().min(4).max(16),
  addressLine: z.string().min(2).max(240),
  isActive: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type Apartment = z.infer<typeof apartmentSchema>;

export const blockSchema = z.object({
  id: z.string().uuid(),
  apartmentId: z.string().uuid(),
  name: z.string().min(1).max(40),
});

export type Block = z.infer<typeof blockSchema>;

export const flatSchema = z.object({
  id: z.string().uuid(),
  blockId: z.string().uuid(),
  number: z.string().min(1).max(20),
});

export type Flat = z.infer<typeof flatSchema>;

export const createApartmentSchema = z.object({
  communityId: z.string().uuid().optional(),
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
