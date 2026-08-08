import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

@Entity({ name: "tanker_requests" })
export class TankerRequestEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Index()
  @Column({ name: "customer_user_id", type: "int" })
  customerUserId!: number;

  @Index()
  @Column({ name: "supplier_id", type: "int", nullable: true })
  supplierId!: number | null;

  @Column({ name: "water_type", type: "varchar", length: 40, default: "drinking" })
  waterType!: string;

  @Column({ name: "quantity_litres", type: "int" })
  quantityLitres!: number;

  @Column({ type: "text", nullable: true })
  comments!: string | null;

  @Column({ name: "delivery_address", type: "varchar", length: 240 })
  deliveryAddress!: string;

  @Column({ type: "float8", nullable: true })
  latitude!: number | null;

  @Column({ type: "float8", nullable: true })
  longitude!: number | null;

  @Column({ type: "varchar", length: 32, default: "pending" })
  status!: string;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt!: Date;
}
