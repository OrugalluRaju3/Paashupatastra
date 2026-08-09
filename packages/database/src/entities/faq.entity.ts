import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

@Entity({ name: "faqs" })
export class FaqEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Index()
  @Column({ type: "varchar", length: 20 })
  module!: string;

  @Column({ type: "varchar", length: 80, default: "general" })
  category!: string;

  @Column({ type: "varchar", length: 500 })
  question!: string;

  @Column({ type: "text" })
  answer!: string;

  @Column({ name: "display_order", type: "int", default: 0 })
  displayOrder!: number;

  @Column({ name: "is_active", type: "boolean", default: true })
  isActive!: boolean;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt!: Date;
}
