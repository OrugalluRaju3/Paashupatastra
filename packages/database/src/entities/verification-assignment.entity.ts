import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

@Entity({ name: "verification_assignments" })
export class VerificationAssignmentEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Index()
  @Column({ name: "listing_id", type: "uuid" })
  listingId!: string;

  @Index()
  @Column({ name: "executive_user_id", type: "uuid" })
  executiveUserId!: string;

  @Column({ name: "assigned_by_user_id", type: "uuid" })
  assignedByUserId!: string;

  @Column({ type: "varchar", length: 32, default: "assigned" })
  status!: string; // assigned | in_progress | completed | cancelled

  @Column({ name: "due_at", type: "timestamptz", nullable: true })
  dueAt!: Date | null;

  @Column({ name: "completed_at", type: "timestamptz", nullable: true })
  completedAt!: Date | null;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt!: Date;
}
