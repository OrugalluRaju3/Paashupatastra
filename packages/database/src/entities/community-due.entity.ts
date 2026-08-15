import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

@Entity({ name: "community_dues" })
@Index(["apartmentId", "membershipId", "period"], { unique: true })
export class CommunityDueEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Index()
  @Column({ name: "apartment_id", type: "int" })
  apartmentId!: number;

  @Index()
  @Column({ name: "membership_id", type: "int" })
  membershipId!: number;

  @Index()
  @Column({ name: "resident_user_id", type: "int" })
  residentUserId!: number;

  @Column({ name: "flat_id", type: "int", nullable: true })
  flatId!: number | null;

  @Column({ type: "varchar", length: 7 })
  period!: string;

  @Column({ name: "amount_in_paise", type: "int", default: 0 })
  amountInPaise!: number;

  @Index()
  @Column({ type: "varchar", length: 32, default: "due" })
  status!: string;

  @Column({ name: "payment_status", type: "varchar", length: 32, default: "pending" })
  paymentStatus!: string;

  @Column({ name: "payment_provider", type: "varchar", length: 32, nullable: true })
  paymentProvider!: string | null;

  @Index()
  @Column({ name: "payment_provider_order_id", type: "varchar", length: 64, nullable: true })
  paymentProviderOrderId!: string | null;

  @Column({ name: "paid_at", type: "timestamptz", nullable: true })
  paidAt!: Date | null;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt!: Date;
}
