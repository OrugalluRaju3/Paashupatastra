import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

@Entity({ name: "users" })
export class UserEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Index({ unique: true })
  @Column({ type: "varchar", length: 10 })
  phone!: string;

  @Column({ type: "varchar", length: 120, nullable: true })
  name!: string | null;

  @Column({ type: "varchar", length: 160, nullable: true })
  email!: string | null;

  @Column({ name: "email_verified", type: "boolean", default: false })
  emailVerified!: boolean;

  @Column({ name: "date_of_birth", type: "date", nullable: true })
  dateOfBirth!: string | null;

  @Column({ name: "profile_photo_url", type: "varchar", length: 500, nullable: true })
  profilePhotoUrl!: string | null;

  @Column({ type: "varchar", length: 80, nullable: true })
  city!: string | null;

  @Column({ type: "varchar", length: 80, nullable: true })
  state!: string | null;

  @Column({ type: "varchar", length: 80, nullable: true, default: "IN" })
  country!: string | null;

  @Column({ name: "pin_code", type: "varchar", length: 10, nullable: true })
  pinCode!: string | null;

  @Column({ name: "preferred_location", type: "varchar", length: 200, nullable: true })
  preferredLocation!: string | null;

  @Column({ type: "text", array: true, default: "{customer}" })
  roles!: string[];

  @Column({ name: "is_active", type: "boolean", default: true })
  isActive!: boolean;

  @Column({ name: "deactivation_reason", type: "text", nullable: true })
  deactivationReason!: string | null;

  @Column({ name: "deactivated_at", type: "timestamptz", nullable: true })
  deactivatedAt!: Date | null;

  /** system | admin user id as string */
  @Column({ name: "deactivated_by", type: "varchar", length: 40, nullable: true })
  deactivatedBy!: string | null;

  @Index()
  @Column({ name: "reporting_manager_id", type: "int", nullable: true })
  reportingManagerId!: number | null;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt!: Date;
}
