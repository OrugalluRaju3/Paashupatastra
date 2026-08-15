import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

@Entity({ name: "seva_providers" })
export class SevaProviderEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Index({ unique: true })
  @Column({ name: "user_id", type: "int" })
  userId!: number;

  @Column({ name: "full_name", type: "varchar", length: 120 })
  fullName!: string;

  @Column({ type: "varchar", length: 120, nullable: true })
  email!: string | null;

  @Column({ name: "alternate_mobile", type: "varchar", length: 15, nullable: true })
  alternateMobile!: string | null;

  @Column({ type: "varchar", length: 240 })
  address!: string;

  @Column({ type: "varchar", length: 80 })
  city!: string;

  @Column({ type: "varchar", length: 80 })
  state!: string;

  @Column({ type: "varchar", length: 80, default: "IN" })
  country!: string;

  @Column({ name: "pin_code", type: "varchar", length: 12 })
  pinCode!: string;

  @Column({ type: "float8", nullable: true })
  latitude!: number | null;

  @Column({ type: "float8", nullable: true })
  longitude!: number | null;

  @Column({ name: "service_radius_km", type: "int", default: 10 })
  serviceRadiusKm!: number;

  @Column({ name: "is_online", type: "boolean", default: false })
  isOnline!: boolean;

  @Column({ name: "is_approved", type: "boolean", default: true })
  isApproved!: boolean;

  @Column({ name: "proof_url", type: "varchar", length: 500, nullable: true })
  proofUrl!: string | null;

  @Column({ name: "is_active", type: "boolean", default: true })
  isActive!: boolean;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt!: Date;
}
