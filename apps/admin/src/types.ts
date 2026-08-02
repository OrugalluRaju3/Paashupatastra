export type Paginated<T> = {
  items: T[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

export type Apartment = {
  id: string;
  name: string;
  inviteCode: string;
  city: string;
  state: string;
  addressLine: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ApartmentStats = {
  total: number;
  active: number;
  inactive: number;
  cities: number;
};

export type ParkingSlot = {
  id: string;
  apartmentId: string;
  ownerUserId: string;
  title: string;
  description: string | null;
  blockName: string | null;
  spotCode: string;
  rentType: "daily" | "monthly";
  priceInPaise: number;
  vehicleSize: "two_wheeler" | "four_wheeler" | "any";
  status: string;
  createdAt: string;
  updatedAt: string;
};

export type ParkingStats = {
  slotsTotal?: number;
  slotsApproved?: number;
  slotsPending?: number;
  listingsTotal?: number;
  pendingVerification?: number;
  fieldInProgress?: number;
  managerReview?: number;
  approved?: number;
  bookingsTotal: number;
  bookingsActive: number;
};

export type ParkingBooking = {
  id: string;
  slotId: string | null;
  listingId?: string | null;
  apartmentId: string | null;
  renterUserId: string;
  ownerUserId?: string | null;
  status: string;
  startAt: string;
  endAt: string;
  amountInPaise: number;
  totalAmountInPaise?: number;
  paymentStatus: string;
  vehicleNumber?: string | null;
  checkInCode: string;
  createdAt: string;
};
