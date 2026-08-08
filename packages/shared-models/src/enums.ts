import { z } from "zod";

export const UserRole = {
  SUPER_ADMIN: "super_admin",
  PARKING_SUPER_ADMIN: "parking_super_admin",
  TANKER_SUPER_ADMIN: "tanker_super_admin",
  VERIFICATION_MANAGER: "verification_manager",
  FIELD_EXECUTIVE: "field_executive",
  PARKING_OWNER: "parking_owner",
  TANKER_SUPPLIER: "tanker_supplier",
  TANKER_DRIVER: "tanker_driver",
  CUSTOMER: "customer",
  APARTMENT_ADMIN: "apartment_admin",
  RESIDENT: "resident",
  VISITOR: "visitor",
} as const;

export const userRoleSchema = z.enum([
  UserRole.SUPER_ADMIN,
  UserRole.PARKING_SUPER_ADMIN,
  UserRole.TANKER_SUPER_ADMIN,
  UserRole.VERIFICATION_MANAGER,
  UserRole.FIELD_EXECUTIVE,
  UserRole.PARKING_OWNER,
  UserRole.TANKER_SUPPLIER,
  UserRole.TANKER_DRIVER,
  UserRole.CUSTOMER,
  UserRole.APARTMENT_ADMIN,
  UserRole.RESIDENT,
  UserRole.VISITOR,
]);

export type UserRole = z.infer<typeof userRoleSchema>;

export const BookingStatus = {
  PENDING: "pending",
  CONFIRMED: "confirmed",
  CHECKED_IN: "checked_in",
  COMPLETED: "completed",
  CANCELLED: "cancelled",
  EXPIRED: "expired",
} as const;

export const bookingStatusSchema = z.enum([
  BookingStatus.PENDING,
  BookingStatus.CONFIRMED,
  BookingStatus.CHECKED_IN,
  BookingStatus.COMPLETED,
  BookingStatus.CANCELLED,
  BookingStatus.EXPIRED,
]);

export type BookingStatus = z.infer<typeof bookingStatusSchema>;

export const PaymentStatus = {
  CREATED: "created",
  PENDING: "pending",
  PAID: "paid",
  FAILED: "failed",
  REFUNDED: "refunded",
} as const;

export const paymentStatusSchema = z.enum([
  PaymentStatus.CREATED,
  PaymentStatus.PENDING,
  PaymentStatus.PAID,
  PaymentStatus.FAILED,
  PaymentStatus.REFUNDED,
]);

export type PaymentStatus = z.infer<typeof paymentStatusSchema>;

export const ParkingRentType = {
  HOURLY: "hourly",
  DAILY: "daily",
  MONTHLY: "monthly",
} as const;

export const parkingRentTypeSchema = z.enum([
  ParkingRentType.HOURLY,
  ParkingRentType.DAILY,
  ParkingRentType.MONTHLY,
]);

export type ParkingRentType = z.infer<typeof parkingRentTypeSchema>;

/** Full listing verification workflow */
export const ListingStatus = {
  DRAFT: "draft",
  PENDING_VERIFICATION: "pending_verification",
  FIELD_IN_PROGRESS: "field_in_progress",
  MANAGER_REVIEW: "manager_review",
  NEEDS_INFO: "needs_info",
  APPROVED: "approved",
  REJECTED: "rejected",
  INACTIVE: "inactive",
  /** @deprecated use PENDING_VERIFICATION */
  PENDING_APPROVAL: "pending_approval",
} as const;

export const listingStatusSchema = z.enum([
  ListingStatus.DRAFT,
  ListingStatus.PENDING_VERIFICATION,
  ListingStatus.FIELD_IN_PROGRESS,
  ListingStatus.MANAGER_REVIEW,
  ListingStatus.NEEDS_INFO,
  ListingStatus.APPROVED,
  ListingStatus.REJECTED,
  ListingStatus.INACTIVE,
  ListingStatus.PENDING_APPROVAL,
]);

export type ListingStatus = z.infer<typeof listingStatusSchema>;

export const ParkingType = {
  COVERED: "covered",
  OPEN: "open",
  BASEMENT: "basement",
} as const;

export const parkingTypeSchema = z.enum([
  ParkingType.COVERED,
  ParkingType.OPEN,
  ParkingType.BASEMENT,
]);

export type ParkingType = z.infer<typeof parkingTypeSchema>;

export const VehicleType = {
  CAR: "car",
  BIKE: "bike",
  EV: "ev",
} as const;

export const vehicleTypeSchema = z.enum([VehicleType.CAR, VehicleType.BIKE, VehicleType.EV]);

export type VehicleType = z.infer<typeof vehicleTypeSchema>;

export const DocumentType = {
  GOVERNMENT_ID: "government_id",
  SELFIE_WITH_ID: "selfie_with_id",
  OWNERSHIP_PROOF: "ownership_proof",
  PARKING_ALLOCATION_PROOF: "parking_allocation_proof",
  ASSOCIATION_APPROVAL: "association_approval",
  PARKING_PHOTO: "parking_photo",
  ENTRANCE_PHOTO: "entrance_photo",
  PROFILE_PHOTO: "profile_photo",
  VERIFICATION_PHOTO: "verification_photo",
  OTHER: "other",
} as const;

export const documentTypeSchema = z.enum([
  DocumentType.GOVERNMENT_ID,
  DocumentType.SELFIE_WITH_ID,
  DocumentType.OWNERSHIP_PROOF,
  DocumentType.PARKING_ALLOCATION_PROOF,
  DocumentType.ASSOCIATION_APPROVAL,
  DocumentType.PARKING_PHOTO,
  DocumentType.ENTRANCE_PHOTO,
  DocumentType.PROFILE_PHOTO,
  DocumentType.VERIFICATION_PHOTO,
  DocumentType.OTHER,
]);

export type DocumentType = z.infer<typeof documentTypeSchema>;

export const VerificationDecision = {
  APPROVE: "approve",
  REJECT: "reject",
  NEED_INFO: "need_info",
  SEND_BACK: "send_back",
} as const;

export const verificationDecisionSchema = z.enum([
  VerificationDecision.APPROVE,
  VerificationDecision.REJECT,
  VerificationDecision.NEED_INFO,
  VerificationDecision.SEND_BACK,
]);

export type VerificationDecision = z.infer<typeof verificationDecisionSchema>;

export const WalletTxnType = {
  CREDIT: "credit",
  DEBIT: "debit",
} as const;

export const walletTxnTypeSchema = z.enum([WalletTxnType.CREDIT, WalletTxnType.DEBIT]);

export type WalletTxnType = z.infer<typeof walletTxnTypeSchema>;

/** Water tanker module (ported from Tanker_Backend) */
export const TankerVehicleStatus = {
  AVAILABLE: "available",
  ON_DELIVERY: "on_delivery",
  MAINTENANCE: "maintenance",
} as const;

export const tankerVehicleStatusSchema = z.enum([
  TankerVehicleStatus.AVAILABLE,
  TankerVehicleStatus.ON_DELIVERY,
  TankerVehicleStatus.MAINTENANCE,
]);

export type TankerVehicleStatus = z.infer<typeof tankerVehicleStatusSchema>;

export const TankerRequestStatus = {
  PENDING: "pending",
  ACCEPTED: "accepted",
  REJECTED: "rejected",
  CANCELLED: "cancelled",
} as const;

export const tankerRequestStatusSchema = z.enum([
  TankerRequestStatus.PENDING,
  TankerRequestStatus.ACCEPTED,
  TankerRequestStatus.REJECTED,
  TankerRequestStatus.CANCELLED,
]);

export type TankerRequestStatus = z.infer<typeof tankerRequestStatusSchema>;

export const TankerOrderStatus = {
  SCHEDULED: "scheduled",
  EN_ROUTE: "en_route",
  WATER_FILLED: "water_filled",
  ON_THE_WAY: "on_the_way",
  AT_LOCATION: "at_location",
  DELIVERING: "delivering",
  DELIVERED: "delivered",
  CANCELLED: "cancelled",
} as const;

export const tankerOrderStatusSchema = z.enum([
  TankerOrderStatus.SCHEDULED,
  TankerOrderStatus.EN_ROUTE,
  TankerOrderStatus.WATER_FILLED,
  TankerOrderStatus.ON_THE_WAY,
  TankerOrderStatus.AT_LOCATION,
  TankerOrderStatus.DELIVERING,
  TankerOrderStatus.DELIVERED,
  TankerOrderStatus.CANCELLED,
]);

export type TankerOrderStatus = z.infer<typeof tankerOrderStatusSchema>;
