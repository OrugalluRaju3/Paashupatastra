import { z } from "zod";
import { uploadedFileRefSchema } from "./common";
import {
  bookingStatusSchema,
  listingStatusSchema,
  parkingRentTypeSchema,
  paymentStatusSchema,
} from "./enums";

export const parkingSlotSchema = z.object({
  id: z.string().uuid(),
  apartmentId: z.string().uuid(),
  ownerUserId: z.string().uuid(),
  title: z.string().min(2).max(120),
  description: z.string().max(1000).nullable(),
  blockName: z.string().min(1).max(40).nullable(),
  spotCode: z.string().min(1).max(40),
  rentType: parkingRentTypeSchema,
  priceInPaise: z.number().int().positive(),
  vehicleSize: z.enum(["two_wheeler", "four_wheeler", "any"]).default("four_wheeler"),
  imageUrls: z.array(uploadedFileRefSchema).default([]),
  status: listingStatusSchema,
  latitude: z.number().nullable(),
  longitude: z.number().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type ParkingSlot = z.infer<typeof parkingSlotSchema>;

export const createParkingSlotSchema = z.object({
  apartmentId: z.string().uuid(),
  title: z.string().min(2).max(120),
  description: z.string().max(1000).optional(),
  blockName: z.string().min(1).max(40).optional(),
  spotCode: z.string().min(1).max(40),
  rentType: parkingRentTypeSchema,
  priceInPaise: z.number().int().positive(),
  vehicleSize: z.enum(["two_wheeler", "four_wheeler", "any"]).default("four_wheeler"),
  imageUrls: z.array(uploadedFileRefSchema).optional(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
});

export type CreateParkingSlotInput = z.infer<typeof createParkingSlotSchema>;

export const updateParkingSlotSchema = createParkingSlotSchema.partial().extend({
  status: listingStatusSchema.optional(),
});

export type UpdateParkingSlotInput = z.infer<typeof updateParkingSlotSchema>;

export const parkingBookingSchema = z.object({
  id: z.string().uuid(),
  slotId: z.string().uuid(),
  apartmentId: z.string().uuid(),
  renterUserId: z.string().uuid(),
  status: bookingStatusSchema,
  startAt: z.string().datetime(),
  endAt: z.string().datetime(),
  amountInPaise: z.number().int().nonnegative(),
  paymentStatus: paymentStatusSchema,
  checkInCode: z.string().min(4).max(32),
  checkedInAt: z.string().datetime().nullable(),
  checkedOutAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type ParkingBooking = z.infer<typeof parkingBookingSchema>;

export const createParkingBookingSchema = z.object({
  slotId: z.string().uuid(),
  startAt: z.string().datetime(),
  endAt: z.string().datetime(),
});

export type CreateParkingBookingInput = z.infer<typeof createParkingBookingSchema>;

export const parkingCheckInSchema = z.object({
  bookingId: z.string().uuid(),
  code: z.string().min(4).max(32),
});

export type ParkingCheckInInput = z.infer<typeof parkingCheckInSchema>;
