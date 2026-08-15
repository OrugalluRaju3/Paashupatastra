import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

@Entity({ name: "seva_bookings" })
export class SevaBookingEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Index()
  @Column({ name: "customer_user_id", type: "int" })
  customerUserId!: number;

  @Index()
  @Column({ name: "provider_id", type: "int" })
  providerId!: number;

  @Column({ name: "offering_id", type: "int" })
  offeringId!: number;

  @Column({ name: "worker_id", type: "int", nullable: true })
  workerId!: number | null;

  @Column({ type: "varchar", length: 40 })
  category!: string;

  @Column({ type: "varchar", length: 120 })
  title!: string;

  @Column({ name: "service_address", type: "varchar", length: 240 })
  serviceAddress!: string;

  @Column({ type: "float8", nullable: true })
  latitude!: number | null;

  @Column({ type: "float8", nullable: true })
  longitude!: number | null;

  @Column({ name: "scheduled_at", type: "timestamptz" })
  scheduledAt!: Date;

  @Column({ type: "text", nullable: true })
  notes!: string | null;

  @Column({ name: "amount_in_paise", type: "int", default: 0 })
  amountInPaise!: number;

  @Column({ name: "platform_fee_in_paise", type: "int", default: 0 })
  platformFeeInPaise!: number;

  @Column({ name: "tax_in_paise", type: "int", default: 0 })
  taxInPaise!: number;

  @Column({ name: "total_amount_in_paise", type: "int", default: 0 })
  totalAmountInPaise!: number;

  @Column({ name: "payment_status", type: "varchar", length: 32, default: "pending" })
  paymentStatus!: string;

  @Column({ name: "payment_provider", type: "varchar", length: 32, nullable: true })
  paymentProvider!: string | null;

  @Index()
  @Column({ name: "payment_provider_order_id", type: "varchar", length: 64, nullable: true })
  paymentProviderOrderId!: string | null;

  @Column({ type: "varchar", length: 32, default: "requested" })
  status!: string;

  @Column({ name: "service_otp", type: "varchar", length: 8, nullable: true })
  serviceOtp!: string | null;

  @Column({ name: "otp_verified", type: "boolean", default: false })
  otpVerified!: boolean;

  @Column({ name: "worker_name", type: "varchar", length: 120, nullable: true })
  workerName!: string | null;

  @Column({ name: "worker_mobile", type: "varchar", length: 15, nullable: true })
  workerMobile!: string | null;

  /** Customer must pay before this instant or the assigned worker is released. */
  @Column({ name: "payment_due_at", type: "timestamptz", nullable: true })
  paymentDueAt!: Date | null;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt!: Date;
}
