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
  @PrimaryGeneratedColumn()
  id!: number;

  @Index()
  @Column({ name: "listing_id", type: "int" })
  listingId!: number;

  @Index()
  @Column({ name: "executive_user_id", type: "int" })
  executiveUserId!: number;

  @Column({ name: "assigned_by_user_id", type: "int" })
  assignedByUserId!: number;

  @Column({ type: "varchar", length: 32, default: "assigned" })
  status!: string; // assigned | in_progress | completed | needs_info | rejected | cancelled

  @Column({ name: "due_at", type: "timestamptz", nullable: true })
  dueAt!: Date | null;

  @Column({ name: "completed_at", type: "timestamptz", nullable: true })
  completedAt!: Date | null;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt!: Date;
}
