import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

@Entity({ name: "seva_invoices" })
export class SevaInvoiceEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Index()
  @Column({ name: "booking_id", type: "int" })
  bookingId!: number;

  @Index()
  @Column({ name: "customer_user_id", type: "int" })
  customerUserId!: number;

  @Index()
  @Column({ name: "provider_id", type: "int" })
  providerId!: number;

  @Column({ name: "amount_in_paise", type: "int", default: 0 })
  amountInPaise!: number;

  @Column({ type: "varchar", length: 32, default: "pending" })
  status!: string;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt!: Date;
}
