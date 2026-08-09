import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

@Entity({ name: "support_contact_settings" })
export class SupportContactSettingsEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Index({ unique: true })
  @Column({ type: "varchar", length: 20 })
  module!: string;

  @Column({ name: "support_email", type: "varchar", length: 200, nullable: true })
  supportEmail!: string | null;

  @Column({ name: "support_phone", type: "varchar", length: 40, nullable: true })
  supportPhone!: string | null;

  @Column({ name: "whatsapp_number", type: "varchar", length: 40, nullable: true })
  whatsappNumber!: string | null;

  @Column({ name: "working_hours", type: "varchar", length: 200, nullable: true })
  workingHours!: string | null;

  @Column({ name: "emergency_contact", type: "varchar", length: 120, nullable: true })
  emergencyContact!: string | null;

  @Column({ name: "office_address", type: "text", nullable: true })
  officeAddress!: string | null;

  @Column({ name: "social_links", type: "jsonb", default: {} })
  socialLinks!: Record<string, string>;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt!: Date;
}
