import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from "typeorm";

@Entity({ name: "parking_booking_messages" })
export class ParkingBookingMessageEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Index()
  @Column({ name: "booking_id", type: "int" })
  bookingId!: number;

  @Index()
  @Column({ name: "sender_user_id", type: "int" })
  senderUserId!: number;

  @Column({ type: "text" })
  body!: string;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;
}
