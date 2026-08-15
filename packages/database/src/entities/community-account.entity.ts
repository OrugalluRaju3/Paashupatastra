import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

@Entity({ name: "community_accounts" })
export class CommunityAccountEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Index({ unique: true })
  @Column({ name: "apartment_id", type: "int" })
  apartmentId!: number;

  @Column({ name: "balance_in_paise", type: "int", default: 0 })
  balanceInPaise!: number;

  @Column({ name: "monthly_maintenance_in_paise", type: "int", default: 0 })
  monthlyMaintenanceInPaise!: number;

  @Column({ name: "due_day", type: "int", default: 5 })
  dueDay!: number;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt!: Date;
}
