import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

@Entity({ name: "apartment_flats" })
export class ApartmentFlatEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Index()
  @Column({ name: "block_id", type: "int" })
  blockId!: number;

  @Index()
  @Column({ name: "apartment_id", type: "int" })
  apartmentId!: number;

  @Column({ type: "varchar", length: 20 })
  number!: string;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt!: Date;
}
