import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

@Entity({ name: "seva_workers" })
export class SevaWorkerEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Index()
  @Column({ name: "provider_id", type: "int" })
  providerId!: number;

  @Column({ name: "user_id", type: "int", nullable: true })
  userId!: number | null;

  @Column({ name: "full_name", type: "varchar", length: 120 })
  fullName!: string;

  @Column({ type: "varchar", length: 15 })
  mobile!: string;

  @Column({ type: "varchar", length: 120, nullable: true })
  email!: string | null;

  /** Comma-separated skill tags, e.g. cleaning,electrical */
  @Column({ type: "varchar", length: 240, default: "cleaning" })
  skills!: string;

  @Column({ name: "is_available", type: "boolean", default: true })
  isAvailable!: boolean;

  @Column({ name: "is_active", type: "boolean", default: true })
  isActive!: boolean;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt!: Date;
}
