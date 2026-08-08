import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

@Entity({ name: "bank_accounts" })
export class BankAccountEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Index()
  @Column({ name: "user_id", type: "int" })
  userId!: number;

  @Column({ name: "account_holder_name", type: "varchar", length: 120 })
  accountHolderName!: string;

  @Column({ name: "bank_name", type: "varchar", length: 120 })
  bankName!: string;

  @Column({ name: "account_number", type: "varchar", length: 30 })
  accountNumber!: string;

  @Column({ name: "ifsc_code", type: "varchar", length: 20 })
  ifscCode!: string;

  @Column({ name: "upi_id", type: "varchar", length: 80, nullable: true })
  upiId!: string | null;

  @Column({ name: "is_primary", type: "boolean", default: true })
  isPrimary!: boolean;

  @Column({ name: "is_verified", type: "boolean", default: false })
  isVerified!: boolean;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt!: Date;
}
