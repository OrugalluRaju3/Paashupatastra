import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from "typeorm";

@Entity({ name: "community_expenses" })
export class CommunityExpenseEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Index()
  @Column({ name: "apartment_id", type: "int" })
  apartmentId!: number;

  @Column({ name: "created_by_user_id", type: "int" })
  createdByUserId!: number;

  @Column({ type: "varchar", length: 80 })
  category!: string;

  @Column({ type: "varchar", length: 160 })
  vendor!: string;

  @Column({ name: "amount_in_paise", type: "int" })
  amountInPaise!: number;

  @Column({ type: "text", nullable: true })
  notes!: string | null;

  @Column({ name: "receipt_url", type: "varchar", length: 500, nullable: true })
  receiptUrl!: string | null;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;
}
