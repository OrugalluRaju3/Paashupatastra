import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

@Entity({ name: "seva_offerings" })
export class SevaOfferingEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Index()
  @Column({ name: "provider_id", type: "int" })
  providerId!: number;

  @Column({ type: "varchar", length: 40 })
  category!: string;

  @Column({ type: "varchar", length: 120 })
  title!: string;

  @Column({ type: "text", nullable: true })
  description!: string | null;

  @Column({ name: "duration_minutes", type: "int", default: 60 })
  durationMinutes!: number;

  @Column({ name: "amount_in_paise", type: "int", default: 0 })
  amountInPaise!: number;

  @Column({ name: "is_active", type: "boolean", default: true })
  isActive!: boolean;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt!: Date;
}
