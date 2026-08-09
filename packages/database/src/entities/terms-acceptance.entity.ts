import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from "typeorm";

@Entity({ name: "terms_acceptances" })
export class TermsAcceptanceEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Index()
  @Column({ name: "user_id", type: "int" })
  userId!: number;

  @Index()
  @Column({ name: "terms_id", type: "int" })
  termsId!: number;

  @Column({ type: "varchar", length: 40 })
  audience!: string;

  /** registration | booking | manual */
  @Column({ type: "varchar", length: 40, default: "registration" })
  context!: string;

  @Column({ name: "reference_id", type: "int", nullable: true })
  referenceId!: number | null;

  @CreateDateColumn({ name: "accepted_at", type: "timestamptz" })
  acceptedAt!: Date;
}
