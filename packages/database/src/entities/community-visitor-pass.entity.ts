import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

@Entity({ name: "community_visitor_passes" })
export class CommunityVisitorPassEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Index()
  @Column({ name: "apartment_id", type: "int" })
  apartmentId!: number;

  @Index()
  @Column({ name: "resident_user_id", type: "int" })
  residentUserId!: number;

  @Column({ name: "guest_name", type: "varchar", length: 120 })
  guestName!: string;

  @Column({ name: "guest_phone", type: "varchar", length: 15, nullable: true })
  guestPhone!: string | null;

  @Column({ name: "vehicle_number", type: "varchar", length: 20, nullable: true })
  vehicleNumber!: string | null;

  @Column({ type: "varchar", length: 160, nullable: true })
  purpose!: string | null;

  @Column({ name: "valid_from", type: "timestamptz" })
  validFrom!: Date;

  @Column({ name: "valid_to", type: "timestamptz" })
  validTo!: Date;

  @Column({ type: "varchar", length: 8 })
  otp!: string;

  @Index()
  @Column({ type: "varchar", length: 32, default: "scheduled" })
  status!: string;

  @Column({ name: "checked_in_at", type: "timestamptz", nullable: true })
  checkedInAt!: Date | null;

  @Column({ name: "checked_out_at", type: "timestamptz", nullable: true })
  checkedOutAt!: Date | null;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt!: Date;
}
