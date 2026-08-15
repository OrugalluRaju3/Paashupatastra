import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

@Entity({ name: "community_invoices" })
export class CommunityInvoiceEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Index()
  @Column({ name: "due_id", type: "int" })
  dueId!: number;

  @Index()
  @Column({ name: "apartment_id", type: "int" })
  apartmentId!: number;

  @Index()
  @Column({ name: "resident_user_id", type: "int" })
  residentUserId!: number;

  @Column({ name: "amount_in_paise", type: "int", default: 0 })
  amountInPaise!: number;

  @Column({ type: "varchar", length: 32, default: "pending" })
  status!: string;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt!: Date;
}
