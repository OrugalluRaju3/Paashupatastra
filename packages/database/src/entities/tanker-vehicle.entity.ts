import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

@Entity({ name: "tanker_vehicles" })
export class TankerVehicleEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Index()
  @Column({ name: "supplier_id", type: "int" })
  supplierId!: number;

  @Column({ name: "driver_full_name", type: "varchar", length: 120 })
  driverFullName!: string;

  @Column({ name: "driver_mobile", type: "varchar", length: 15 })
  driverMobile!: string;

  @Column({ name: "driver_email", type: "varchar", length: 160, nullable: true })
  driverEmail!: string | null;

  @Index({ unique: true })
  @Column({ name: "vehicle_number", type: "varchar", length: 20 })
  vehicleNumber!: string;

  @Column({ name: "capacity_litres", type: "int" })
  capacityLitres!: number;

  @Column({ name: "amount_in_paise", type: "int", default: 0 })
  amountInPaise!: number;

  @Column({ name: "water_type", type: "varchar", length: 40, default: "drinking" })
  waterType!: string;

  @Column({ type: "varchar", length: 32, default: "available" })
  status!: string;

  @Column({ name: "licence_front_url", type: "varchar", length: 500, nullable: true })
  licenceFrontUrl!: string | null;

  @Column({ name: "licence_back_url", type: "varchar", length: 500, nullable: true })
  licenceBackUrl!: string | null;

  @Column({ name: "tanker_image_url", type: "varchar", length: 500, nullable: true })
  tankerImageUrl!: string | null;

  @Column({ type: "float8", nullable: true })
  latitude!: number | null;

  @Column({ type: "float8", nullable: true })
  longitude!: number | null;

  @Column({ name: "is_active", type: "boolean", default: true })
  isActive!: boolean;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt!: Date;
}
