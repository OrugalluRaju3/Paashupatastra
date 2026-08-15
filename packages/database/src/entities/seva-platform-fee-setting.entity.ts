import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

@Entity({ name: "seva_platform_fee_settings" })
export class SevaPlatformFeeSettingEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: "fee_type", type: "varchar", length: 20, default: "percentage" })
  feeType!: string; // percentage | flat | both

  @Column({ name: "percentage_bps", type: "int", default: 1000 })
  percentageBps!: number; // 1000 = 10%

  @Column({ name: "flat_fee_in_paise", type: "int", default: 0 })
  flatFeeInPaise!: number;

  @Column({ name: "is_active", type: "boolean", default: true })
  isActive!: boolean;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt!: Date;
}
