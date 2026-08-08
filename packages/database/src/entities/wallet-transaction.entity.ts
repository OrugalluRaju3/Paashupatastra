import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from "typeorm";

@Entity({ name: "wallet_transactions" })
export class WalletTransactionEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Index()
  @Column({ name: "wallet_id", type: "int" })
  walletId!: number;

  @Column({ type: "varchar", length: 16 })
  type!: string; // credit | debit

  @Column({ name: "amount_in_paise", type: "bigint" })
  amountInPaise!: string;

  @Column({ name: "balance_after_in_paise", type: "bigint" })
  balanceAfterInPaise!: string;

  @Column({ type: "varchar", length: 64 })
  purpose!: string; // booking_payment | commission | settlement | payout | refund

  @Column({ name: "reference_id", type: "int", nullable: true })
  referenceId!: number | null;

  @Column({ type: "text", nullable: true })
  notes!: string | null;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;
}
