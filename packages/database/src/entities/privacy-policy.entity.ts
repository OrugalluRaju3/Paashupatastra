import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

@Entity({ name: "privacy_policies" })
export class PrivacyPolicyEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Index()
  @Column({ type: "varchar", length: 20 })
  module!: string;

  @Column({ type: "varchar", length: 40 })
  version!: string;

  @Column({ type: "varchar", length: 200, default: "Privacy Policy" })
  title!: string;

  @Column({ type: "text" })
  body!: string;

  @Column({ name: "is_published", type: "boolean", default: false })
  isPublished!: boolean;

  @Column({ name: "published_at", type: "timestamptz", nullable: true })
  publishedAt!: Date | null;

  @Column({ name: "created_by_user_id", type: "int", nullable: true })
  createdByUserId!: number | null;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt!: Date;
}
