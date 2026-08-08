import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

@Entity({ name: "tanker_tax_settings" })
export class TankerTaxSettingEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: "tax_name", type: "varchar", length: 80, default: "GST" })
  taxName!: string;

  @Column({ name: "tax_bps", type: "int", default: 0 })
  taxBps!: number; // basis points, 1800 = 18%

  @Column({ type: "varchar", length: 80, default: "IN" })
  country!: string;

  @Column({ type: "varchar", length: 80, nullable: true })
  state!: string | null;

  @Column({ name: "is_active", type: "boolean", default: true })
  isActive!: boolean;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt!: Date;
}
