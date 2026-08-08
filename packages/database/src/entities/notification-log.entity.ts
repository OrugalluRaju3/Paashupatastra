import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from "typeorm";

@Entity({ name: "notifications" })
export class NotificationLogEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Index()
  @Column({ name: "user_id", type: "int", nullable: true })
  userId!: number | null;

  @Column({ type: "varchar", length: 20 })
  channel!: string;

  @Column({ type: "varchar", length: 160 })
  title!: string;

  @Column({ type: "text" })
  body!: string;

  @Column({ type: "varchar", length: 40, default: "queued" })
  status!: string;

  @Column({ name: "reference_type", type: "varchar", length: 40, nullable: true })
  referenceType!: string | null;

  @Column({ name: "reference_id", type: "int", nullable: true })
  referenceId!: number | null;

  @Column({ name: "read_at", type: "timestamptz", nullable: true })
  readAt!: Date | null;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;
}
