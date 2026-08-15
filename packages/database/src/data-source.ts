import "reflect-metadata";
import { DataSource, type DataSourceOptions } from "typeorm";
import { ApartmentEntity } from "./entities/apartment.entity";
import { BankAccountEntity } from "./entities/bank-account.entity";
import { CommissionConfigEntity } from "./entities/commission-config.entity";
import { NotificationLogEntity } from "./entities/notification-log.entity";
import { OtpChallengeEntity } from "./entities/otp-challenge.entity";
import { ParkingBookingEntity } from "./entities/parking-booking.entity";
import { ParkingBookingMessageEntity } from "./entities/parking-booking-message.entity";
import { ParkingInvoiceEntity } from "./entities/parking-invoice.entity";
import { ParkingListingEntity } from "./entities/parking-listing.entity";
import { ParkingSlotEntity } from "./entities/parking-slot.entity";
import { UserDocumentEntity } from "./entities/user-document.entity";
import { TankerUserEntity } from "./entities/tanker-user.entity";
import { UserEntity } from "./entities/user.entity";
import { VerificationAssignmentEntity } from "./entities/verification-assignment.entity";
import { VerificationReportEntity } from "./entities/verification-report.entity";
import { WalletTransactionEntity } from "./entities/wallet-transaction.entity";
import { WalletEntity } from "./entities/wallet.entity";
import { TankerSupplierEntity } from "./entities/tanker-supplier.entity";
import { TankerVehicleEntity } from "./entities/tanker-vehicle.entity";
import { TankerRequestEntity } from "./entities/tanker-request.entity";
import { TankerOrderEntity } from "./entities/tanker-order.entity";
import { TankerInvoiceEntity } from "./entities/tanker-invoice.entity";
import { TankerOrderMessageEntity } from "./entities/tanker-order-message.entity";
import { TankerPromoCodeEntity } from "./entities/tanker-promo-code.entity";
import { TankerTaxSettingEntity } from "./entities/tanker-tax-setting.entity";
import { TankerPlatformFeeSettingEntity } from "./entities/tanker-platform-fee-setting.entity";
import { SevaProviderEntity } from "./entities/seva-provider.entity";
import { SevaWorkerEntity } from "./entities/seva-worker.entity";
import { SevaOfferingEntity } from "./entities/seva-offering.entity";
import { SevaBookingEntity } from "./entities/seva-booking.entity";
import { SevaBookingMessageEntity } from "./entities/seva-booking-message.entity";
import { SevaInvoiceEntity } from "./entities/seva-invoice.entity";
import { SevaPlatformFeeSettingEntity } from "./entities/seva-platform-fee-setting.entity";
import { PrivacyPolicyEntity } from "./entities/privacy-policy.entity";
import { TermsDocumentEntity } from "./entities/terms-document.entity";
import { TermsAcceptanceEntity } from "./entities/terms-acceptance.entity";
import { FaqEntity } from "./entities/faq.entity";
import { SupportContactSettingsEntity } from "./entities/support-contact-settings.entity";
import { AnnouncementEntity } from "./entities/announcement.entity";

export const allEntities = [
  UserEntity,
  TankerUserEntity,
  OtpChallengeEntity,
  UserDocumentEntity,
  BankAccountEntity,
  ApartmentEntity,
  ParkingSlotEntity,
  ParkingListingEntity,
  ParkingBookingEntity,
  ParkingBookingMessageEntity,
  ParkingInvoiceEntity,
  VerificationAssignmentEntity,
  VerificationReportEntity,
  WalletEntity,
  WalletTransactionEntity,
  CommissionConfigEntity,
  NotificationLogEntity,
  TankerSupplierEntity,
  TankerVehicleEntity,
  TankerRequestEntity,
  TankerOrderEntity,
  TankerInvoiceEntity,
  TankerOrderMessageEntity,
  TankerPromoCodeEntity,
  TankerTaxSettingEntity,
  TankerPlatformFeeSettingEntity,
  SevaProviderEntity,
  SevaWorkerEntity,
  SevaOfferingEntity,
  SevaBookingEntity,
  SevaBookingMessageEntity,
  SevaInvoiceEntity,
  SevaPlatformFeeSettingEntity,
  PrivacyPolicyEntity,
  TermsDocumentEntity,
  TermsAcceptanceEntity,
  FaqEntity,
  SupportContactSettingsEntity,
  AnnouncementEntity,
];

export function buildDataSourceOptions(overrides: Partial<DataSourceOptions> = {}): DataSourceOptions {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is required");
  }

  return {
    type: "postgres",
    url,
    entities: allEntities,
    synchronize: process.env.TYPEORM_SYNC === "true",
    logging: process.env.TYPEORM_LOGGING === "true",
    ...overrides,
  } as DataSourceOptions;
}

let sharedDataSource: DataSource | null = null;

export async function getDataSource(): Promise<DataSource> {
  if (sharedDataSource?.isInitialized) {
    return sharedDataSource;
  }

  sharedDataSource = new DataSource(buildDataSourceOptions());
  await sharedDataSource.initialize();
  return sharedDataSource;
}

export async function closeDataSource(): Promise<void> {
  if (sharedDataSource?.isInitialized) {
    await sharedDataSource.destroy();
    sharedDataSource = null;
  }
}
