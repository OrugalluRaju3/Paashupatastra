import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

@Entity({ name: "tanker_orders" })
export class TankerOrderEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Index()
  @Column({ name: "customer_user_id", type: "int" })
  customerUserId!: number;

  @Index()
  @Column({ name: "supplier_id", type: "int" })
  supplierId!: number;

  @Column({ name: "vehicle_id", type: "int", nullable: true })
  vehicleId!: number | null;

  @Column({ name: "request_id", type: "int", nullable: true })
  requestId!: number | null;

  @Column({ name: "water_type", type: "varchar", length: 40, default: "drinking" })
  waterType!: string;

  @Column({ name: "capacity_litres", type: "int" })
  capacityLitres!: number;

  @Column({ name: "vehicle_number", type: "varchar", length: 20, nullable: true })
  vehicleNumber!: string | null;

  @Column({ name: "driver_name", type: "varchar", length: 120, nullable: true })
  driverName!: string | null;

  @Column({ name: "driver_mobile", type: "varchar", length: 15, nullable: true })
  driverMobile!: string | null;

  @Column({ name: "amount_in_paise", type: "int", default: 0 })
  amountInPaise!: number;

  @Column({ name: "platform_fee_in_paise", type: "int", default: 0 })
  platformFeeInPaise!: number;

  @Column({ name: "tax_in_paise", type: "int", default: 0 })
  taxInPaise!: number;

  @Column({ name: "delivery_address", type: "varchar", length: 240 })
  deliveryAddress!: string;

  @Column({ name: "delivery_at", type: "timestamptz", nullable: true })
  deliveryAt!: Date | null;

  @Column({ type: "text", nullable: true })
  comments!: string | null;

  @Column({ name: "payment_method", type: "varchar", length: 40, nullable: true })
  paymentMethod!: string | null;

  @Column({ name: "payment_status", type: "varchar", length: 32, default: "pending" })
  paymentStatus!: string;

  @Column({ name: "payment_provider", type: "varchar", length: 32, nullable: true })
  paymentProvider!: string | null;

  @Index()
  @Column({ name: "payment_provider_order_id", type: "varchar", length: 64, nullable: true })
  paymentProviderOrderId!: string | null;

  @Column({ name: "total_amount_in_paise", type: "int", default: 0 })
  totalAmountInPaise!: number;

  @Column({ name: "discount_in_paise", type: "int", default: 0 })
  discountInPaise!: number;

  @Column({ name: "promo_code", type: "varchar", length: 40, nullable: true })
  promoCode!: string | null;

  @Column({ type: "varchar", length: 32, default: "scheduled" })
  status!: string;

  @Column({ name: "delivery_otp", type: "varchar", length: 8, nullable: true })
  deliveryOtp!: string | null;

  @Column({ name: "otp_verified", type: "boolean", default: false })
  otpVerified!: boolean;

  @Column({ name: "driver_latitude", type: "float8", nullable: true })
  driverLatitude!: number | null;

  @Column({ name: "driver_longitude", type: "float8", nullable: true })
  driverLongitude!: number | null;

  @Column({ name: "driver_location_updated_at", type: "timestamptz", nullable: true })
  driverLocationUpdatedAt!: Date | null;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt!: Date;
}
