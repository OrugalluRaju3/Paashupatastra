import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

@Entity({ name: "wallets" })
export class WalletEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Index({ unique: true })
  @Column({ name: "user_id", type: "uuid" })
  userId!: string;

  /** platform | owner | customer */
  @Column({ type: "varchar", length: 20, default: "owner" })
  type!: string;

  @Column({ name: "balance_in_paise", type: "bigint", default: 0 })
  balanceInPaise!: string;

  @Column({ type: "varchar", length: 10, default: "INR" })
  currency!: string;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt!: Date;
}
