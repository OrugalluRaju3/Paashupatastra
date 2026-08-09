import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

@Entity({ name: "terms_documents" })
export class TermsDocumentEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  /** customer | parking_owner | tanker_supplier | tanker_driver */
  @Index()
  @Column({ type: "varchar", length: 40 })
  audience!: string;

  @Index()
  @Column({ type: "varchar", length: 20 })
  module!: string;

  @Column({ type: "varchar", length: 40 })
  version!: string;

  @Column({ type: "varchar", length: 200, default: "Terms & Conditions" })
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
