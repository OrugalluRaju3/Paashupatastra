import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

@Entity({ name: "community_notices" })
export class CommunityNoticeEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Index()
  @Column({ name: "apartment_id", type: "int" })
  apartmentId!: number;

  @Column({ name: "created_by_user_id", type: "int" })
  createdByUserId!: number;

  @Column({ type: "varchar", length: 200 })
  title!: string;

  @Column({ type: "text" })
  body!: string;

  @Column({ name: "is_active", type: "boolean", default: true })
  isActive!: boolean;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt!: Date;
}
