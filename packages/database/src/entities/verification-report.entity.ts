import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from "typeorm";

@Entity({ name: "verification_reports" })
export class VerificationReportEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Index()
  @Column({ name: "assignment_id", type: "int" })
  assignmentId!: number;

  @Index()
  @Column({ name: "listing_id", type: "int" })
  listingId!: number;

  @Column({ name: "executive_user_id", type: "int" })
  executiveUserId!: number;

  @Column({ type: "varchar", length: 32 })
  decision!: string;

  @Column({ type: "text" })
  comments!: string;

  @Column({ name: "photo_urls", type: "text", array: true, default: "{}" })
  photoUrls!: string[];

  @Column({ name: "verified_latitude", type: "double precision", nullable: true })
  verifiedLatitude!: number | null;

  @Column({ name: "verified_longitude", type: "double precision", nullable: true })
  verifiedLongitude!: number | null;

  @Column({ name: "address_verified", type: "boolean", default: false })
  addressVerified!: boolean;

  @Column({ name: "ownership_verified", type: "boolean", default: false })
  ownershipVerified!: boolean;

  @Column({ name: "slot_verified", type: "boolean", default: false })
  slotVerified!: boolean;

  @Column({ name: "documents_verified", type: "boolean", default: false })
  documentsVerified!: boolean;

  @Column({ name: "gps_verified", type: "boolean", default: false })
  gpsVerified!: boolean;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;
}
