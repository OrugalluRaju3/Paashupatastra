import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

@Entity({ name: "parking_bookings" })
export class ParkingBookingEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  /** Legacy simple slots */
  @Index()
  @Column({ name: "slot_id", type: "int", nullable: true })
  slotId!: number | null;

  /** V1 workflow listings */
  @Index()
  @Column({ name: "listing_id", type: "int", nullable: true })
  listingId!: number | null;

  @Index()
  @Column({ name: "apartment_id", type: "int", nullable: true })
  apartmentId!: number | null;

  @Index()
  @Column({ name: "renter_user_id", type: "int" })
  renterUserId!: number;

  @Index()
  @Column({ name: "owner_user_id", type: "int", nullable: true })
  ownerUserId!: number | null;

  @Index()
  @Column({ type: "varchar", length: 32, default: "pending" })
  status!: string;

  @Column({ name: "start_at", type: "timestamptz" })
  startAt!: Date;

  @Column({ name: "end_at", type: "timestamptz" })
  endAt!: Date;

  @Column({ name: "duration_minutes", type: "int", default: 0 })
  durationMinutes!: number;

  @Column({ name: "base_amount_in_paise", type: "int", default: 0 })
  baseAmountInPaise!: number;

  @Column({ name: "platform_fee_in_paise", type: "int", default: 0 })
  platformFeeInPaise!: number;

  @Column({ name: "tax_in_paise", type: "int", default: 0 })
  taxInPaise!: number;

  @Column({ name: "total_amount_in_paise", type: "int", default: 0 })
  totalAmountInPaise!: number;

  /** keep for backward compat with older API */
  @Column({ name: "amount_in_paise", type: "int", default: 0 })
  amountInPaise!: number;

  @Column({ name: "payment_status", type: "varchar", length: 32, default: "pending" })
  paymentStatus!: string;

  @Column({ name: "payment_provider", type: "varchar", length: 32, nullable: true })
  paymentProvider!: string | null;

  @Index()
  @Column({ name: "payment_provider_order_id", type: "varchar", length: 64, nullable: true })
  paymentProviderOrderId!: string | null;

  @Column({ name: "vehicle_number", type: "varchar", length: 20, nullable: true })
  vehicleNumber!: string | null;

  @Column({ name: "vehicle_type", type: "varchar", length: 20, nullable: true })
  vehicleType!: string | null;

  @Column({ name: "check_in_code", type: "varchar", length: 32 })
  checkInCode!: string;

  @Column({ name: "owner_otp", type: "varchar", length: 8, nullable: true })
  ownerOtp!: string | null;

  @Column({ name: "checked_in_at", type: "timestamptz", nullable: true })
  checkedInAt!: Date | null;

  @Column({ name: "checked_out_at", type: "timestamptz", nullable: true })
  checkedOutAt!: Date | null;

  @Column({ name: "reminder_30_sent", type: "boolean", default: false })
  reminder30Sent!: boolean;

  @Column({ name: "reminder_15_sent", type: "boolean", default: false })
  reminder15Sent!: boolean;

  @Column({ name: "reminder_5_sent", type: "boolean", default: false })
  reminder5Sent!: boolean;

  /** Last overdue (past planned check-out) reminder — used to notify every 5 minutes. */
  @Column({ name: "last_overdue_reminder_at", type: "timestamptz", nullable: true })
  lastOverdueReminderAt!: Date | null;

  /** Last “please check in” reminder while confirmed and past start_at but not checked in. */
  @Column({ name: "last_check_in_reminder_at", type: "timestamptz", nullable: true })
  lastCheckInReminderAt!: Date | null;

  /** When customer+owner were auto-blocked for >1h overdue check-out. */
  @Column({ name: "overdue_accounts_blocked_at", type: "timestamptz", nullable: true })
  overdueAccountsBlockedAt!: Date | null;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt!: Date;
}
