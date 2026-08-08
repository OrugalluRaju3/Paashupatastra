import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

@Entity({ name: "tanker_invoices" })
export class TankerInvoiceEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Index()
  @Column({ name: "order_id", type: "int" })
  orderId!: number;

  @Index()
  @Column({ name: "customer_user_id", type: "int" })
  customerUserId!: number;

  @Index()
  @Column({ name: "supplier_id", type: "int" })
  supplierId!: number;

  @Column({ name: "amount_in_paise", type: "int", default: 0 })
  amountInPaise!: number;

  @Column({ type: "varchar", length: 32, default: "pending" })
  status!: string;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt!: Date;
}
