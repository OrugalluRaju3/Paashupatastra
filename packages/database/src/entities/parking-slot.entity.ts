import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

@Entity({ name: "parking_slots" })
export class ParkingSlotEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Index()
  @Column({ name: "apartment_id", type: "int" })
  apartmentId!: number;

  @Index()
  @Column({ name: "owner_user_id", type: "int" })
  ownerUserId!: number;

  @Column({ type: "varchar", length: 120 })
  title!: string;

  @Column({ type: "varchar", length: 1000, nullable: true })
  description!: string | null;

  @Column({ name: "block_name", type: "varchar", length: 40, nullable: true })
  blockName!: string | null;

  @Column({ name: "spot_code", type: "varchar", length: 40 })
  spotCode!: string;

  @Column({ name: "rent_type", type: "varchar", length: 20 })
  rentType!: string;

  @Column({ name: "price_in_paise", type: "int" })
  priceInPaise!: number;

  @Column({ name: "vehicle_size", type: "varchar", length: 20, default: "four_wheeler" })
  vehicleSize!: "two_wheeler" | "four_wheeler" | "any";

  @Column({ type: "text", array: true, default: "{}" })
  imageUrls!: string[];

  @Index()
  @Column({ type: "varchar", length: 32, default: "pending_approval" })
  status!: string;

  @Column({ type: "double precision", nullable: true })
  latitude!: number | null;

  @Column({ type: "double precision", nullable: true })
  longitude!: number | null;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt!: Date;
}
