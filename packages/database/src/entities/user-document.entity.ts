import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

@Entity({ name: "user_documents" })
export class UserDocumentEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Index()
  @Column({ name: "user_id", type: "uuid" })
  userId!: string;

  @Index()
  @Column({ name: "listing_id", type: "uuid", nullable: true })
  listingId!: string | null;

  @Column({ type: "varchar", length: 64 })
  type!: string;

  @Column({ name: "file_url", type: "varchar", length: 500 })
  fileUrl!: string;

  @Column({ type: "varchar", length: 32, default: "uploaded" })
  status!: string;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt!: Date;
}
