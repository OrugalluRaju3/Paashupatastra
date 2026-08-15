import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from "typeorm";

@Entity({ name: "otps" })
export class OtpChallengeEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Index()
  @Column({ type: "varchar", length: 10 })
  phone!: string;

  @Column({ type: "varchar", length: 20, default: "parking" })
  module!: "parking" | "tanker" | "seva" | "community";

  @Column({ type: "varchar", length: 6 })
  otp!: string;

  @Column({ name: "expires_at", type: "timestamptz" })
  expiresAt!: Date;

  @Column({ name: "consumed_at", type: "timestamptz", nullable: true })
  consumedAt!: Date | null;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;
}
