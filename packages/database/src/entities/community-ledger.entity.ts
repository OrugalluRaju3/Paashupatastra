import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from "typeorm";

@Entity({ name: "community_ledger" })
export class CommunityLedgerEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Index()
  @Column({ name: "apartment_id", type: "int" })
  apartmentId!: number;

  @Column({ type: "varchar", length: 16 })
  type!: string;

  @Column({ name: "amount_in_paise", type: "int" })
  amountInPaise!: number;

  @Column({ name: "balance_after_in_paise", type: "int" })
  balanceAfterInPaise!: number;

  @Column({ type: "varchar", length: 64 })
  purpose!: string;

  @Column({ type: "text", nullable: true })
  notes!: string | null;

  @Column({ name: "reference_type", type: "varchar", length: 40, nullable: true })
  referenceType!: string | null;

  @Column({ name: "reference_id", type: "int", nullable: true })
  referenceId!: number | null;

  @Column({ name: "created_by_user_id", type: "int", nullable: true })
  createdByUserId!: number | null;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;
}
