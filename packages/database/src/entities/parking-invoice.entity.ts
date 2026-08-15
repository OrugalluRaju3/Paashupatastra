import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

@Entity({ name: "parking_invoices" })
export class ParkingInvoiceEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Index()
  @Column({ name: "booking_id", type: "int" })
  bookingId!: number;

  @Index()
  @Column({ name: "renter_user_id", type: "int" })
  renterUserId!: number;

  @Index()
  @Column({ name: "owner_user_id", type: "int", nullable: true })
  ownerUserId!: number | null;

  @Column({ name: "amount_in_paise", type: "int", default: 0 })
  amountInPaise!: number;

  @Column({ type: "varchar", length: 32, default: "pending" })
  status!: string;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt!: Date;
}
