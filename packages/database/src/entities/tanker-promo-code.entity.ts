import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

@Entity({ name: "tanker_promo_codes" })
export class TankerPromoCodeEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Index({ unique: true })
  @Column({ type: "varchar", length: 40 })
  code!: string;

  @Column({ type: "varchar", length: 240, nullable: true })
  description!: string | null;

  @Column({ name: "discount_type", type: "varchar", length: 20, default: "percentage" })
  discountType!: string; // percentage | flat

  @Column({ name: "discount_value", type: "int", default: 0 })
  discountValue!: number; // percent or paise

  @Column({ name: "min_order_in_paise", type: "int", default: 0 })
  minOrderInPaise!: number;

  @Column({ name: "max_uses", type: "int", default: 0 })
  maxUses!: number;

  @Column({ name: "used_count", type: "int", default: 0 })
  usedCount!: number;

  @Column({ name: "starts_at", type: "timestamptz", nullable: true })
  startsAt!: Date | null;

  @Column({ name: "ends_at", type: "timestamptz", nullable: true })
  endsAt!: Date | null;

  @Column({ name: "is_active", type: "boolean", default: true })
  isActive!: boolean;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt!: Date;
}
