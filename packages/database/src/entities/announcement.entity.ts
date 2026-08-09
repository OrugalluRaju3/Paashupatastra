import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

@Entity({ name: "announcements" })
export class AnnouncementEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Index()
  @Column({ type: "varchar", length: 20 })
  module!: string;

  @Column({ type: "varchar", length: 200 })
  title!: string;

  @Column({ type: "text" })
  body!: string;

  /** customers | parking_owners | tanker_suppliers | tanker_drivers */
  @Column({ type: "text", array: true, default: "{}" })
  audiences!: string[];

  @Column({ name: "start_at", type: "timestamptz" })
  startAt!: Date;

  @Column({ name: "end_at", type: "timestamptz" })
  endAt!: Date;

  @Column({ name: "is_active", type: "boolean", default: true })
  isActive!: boolean;

  @Column({ name: "created_by_user_id", type: "int", nullable: true })
  createdByUserId!: number | null;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt!: Date;
}
