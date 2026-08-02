import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

@Entity({ name: "parking_listings" })
export class ParkingListingEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Index()
  @Column({ name: "owner_user_id", type: "uuid" })
  ownerUserId!: string;

  @Index()
  @Column({ type: "varchar", length: 40, default: "pending_verification" })
  status!: string;

  // Apartment
  @Column({ name: "apartment_name", type: "varchar", length: 160 })
  apartmentName!: string;

  @Column({ name: "flat_number", type: "varchar", length: 40 })
  flatNumber!: string;

  @Column({ name: "block_tower", type: "varchar", length: 40 })
  blockTower!: string;

  @Column({ name: "floor_number", type: "varchar", length: 20, nullable: true })
  floorNumber!: string | null;

  @Index()
  @Column({ type: "varchar", length: 80 })
  city!: string;

  @Column({ type: "varchar", length: 80 })
  state!: string;

  @Column({ type: "varchar", length: 80, default: "IN" })
  country!: string;

  @Index()
  @Column({ name: "pin_code", type: "varchar", length: 10 })
  pinCode!: string;

  @Column({ name: "address_line", type: "varchar", length: 300 })
  addressLine!: string;

  @Column({ type: "double precision" })
  latitude!: number;

  @Column({ type: "double precision" })
  longitude!: number;

  @Column({ name: "maps_url", type: "varchar", length: 500, nullable: true })
  mapsUrl!: string | null;

  // Parking
  @Column({ name: "parking_slot_number", type: "varchar", length: 40 })
  parkingSlotNumber!: string;

  @Column({ name: "parking_type", type: "varchar", length: 20 })
  parkingType!: string;

  @Column({ name: "vehicle_types_allowed", type: "text", array: true, default: "{}" })
  vehicleTypesAllowed!: string[];

  @Column({ name: "parking_dimensions", type: "varchar", length: 80, nullable: true })
  parkingDimensions!: string | null;

  @Column({ name: "number_of_slots", type: "int", default: 1 })
  numberOfSlots!: number;

  @Column({ name: "availability_start_time", type: "varchar", length: 5 })
  availabilityStartTime!: string;

  @Column({ name: "availability_end_time", type: "varchar", length: 5 })
  availabilityEndTime!: string;

  @Column({ name: "available_days", type: "varchar", length: 20, default: "all_days" })
  availableDays!: string;

  @Column({ name: "rent_type", type: "varchar", length: 20 })
  rentType!: string;

  @Column({ name: "price_in_paise", type: "int" })
  priceInPaise!: number;

  @Column({ name: "is_active", type: "boolean", default: false })
  isActive!: boolean;

  @Column({ name: "rejection_reason", type: "text", nullable: true })
  rejectionReason!: string | null;

  @Column({ name: "needs_info_notes", type: "text", nullable: true })
  needsInfoNotes!: string | null;

  @Column({ name: "activated_at", type: "timestamptz", nullable: true })
  activatedAt!: Date | null;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt!: Date;
}
