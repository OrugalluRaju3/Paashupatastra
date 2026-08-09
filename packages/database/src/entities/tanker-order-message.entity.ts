import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from "typeorm";

@Entity({ name: "tanker_order_messages" })
export class TankerOrderMessageEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Index()
  @Column({ name: "order_id", type: "int" })
  orderId!: number;

  @Index()
  @Column({ name: "sender_user_id", type: "int" })
  senderUserId!: number;

  @Column({ type: "text" })
  body!: string;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;
}
