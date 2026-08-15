import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

@Entity({ name: "community_complaints" })
export class CommunityComplaintEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Index()
  @Column({ name: "apartment_id", type: "int" })
  apartmentId!: number;

  @Index()
  @Column({ name: "resident_user_id", type: "int" })
  residentUserId!: number;

  @Column({ name: "flat_id", type: "int", nullable: true })
  flatId!: number | null;

  @Column({ type: "varchar", length: 40 })
  category!: string;

  @Column({ type: "varchar", length: 160 })
  title!: string;

  @Column({ type: "text" })
  body!: string;

  @Index()
  @Column({ type: "varchar", length: 32, default: "open" })
  status!: string;

  @Column({ name: "admin_notes", type: "text", nullable: true })
  adminNotes!: string | null;

  @Column({ name: "closed_at", type: "timestamptz", nullable: true })
  closedAt!: Date | null;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt!: Date;
}
