import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

@Entity({ name: "apartments" })
export class ApartmentEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "varchar", length: 160 })
  name!: string;

  @Index({ unique: true })
  @Column({ name: "invite_code", type: "varchar", length: 16 })
  inviteCode!: string;

  @Index()
  @Column({ type: "varchar", length: 80 })
  city!: string;

  @Column({ type: "varchar", length: 80 })
  state!: string;

  @Column({ name: "address_line", type: "varchar", length: 240 })
  addressLine!: string;

  @Column({ name: "is_active", type: "boolean", default: true })
  isActive!: boolean;

  @Column({ type: "double precision", nullable: true })
  latitude!: number | null;

  @Column({ type: "double precision", nullable: true })
  longitude!: number | null;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt!: Date;
}
