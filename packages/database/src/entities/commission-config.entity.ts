import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

@Entity({ name: "commission_configs" })
export class CommissionConfigEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: "module_name", type: "varchar", length: 40, default: "parking" })
  moduleName!: string;

  /** percent in basis points: 1000 = 10% */
  @Column({ name: "commission_bps", type: "int", default: 1000 })
  commissionBps!: number;

  @Column({ name: "platform_fee_flat_paise", type: "int", default: 0 })
  platformFeeFlatPaise!: number;

  @Column({ name: "tax_bps", type: "int", default: 0 })
  taxBps!: number;

  @Column({ name: "is_active", type: "boolean", default: true })
  isActive!: boolean;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt!: Date;
}
