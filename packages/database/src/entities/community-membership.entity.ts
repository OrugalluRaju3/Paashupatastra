import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

@Entity({ name: "community_memberships" })
@Index(["apartmentId", "userId"], { unique: true })
export class CommunityMembershipEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Index()
  @Column({ name: "apartment_id", type: "int" })
  apartmentId!: number;

  @Index()
  @Column({ name: "user_id", type: "int" })
  userId!: number;

  @Index()
  @Column({ name: "flat_id", type: "int", nullable: true })
  flatId!: number | null;

  @Column({ type: "varchar", length: 32, default: "resident" })
  role!: string;

  @Index()
  @Column({ type: "varchar", length: 32, default: "pending" })
  status!: string;

  @Column({ name: "rejected_reason", type: "varchar", length: 240, nullable: true })
  rejectedReason!: string | null;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt!: Date;
}
