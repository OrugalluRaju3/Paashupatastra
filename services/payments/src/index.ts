import "reflect-metadata";
import {
  BankAccountEntity,
  CommissionConfigEntity,
  CommunityDueEntity,
  ParkingBookingEntity,
  SevaBookingEntity,
  SevaProviderEntity,
  TankerOrderEntity,
  TankerSupplierEntity,
  TankerUserEntity,
  UserEntity,
  WalletEntity,
  WalletTransactionEntity,
  getDataSource,
  toIsoRequired,
} from "@paashupatastra/database";
import { createService, envInt, getRolesFromHeaders, getUserIdFromHeaders, loadEnv, parseEntityId, parseUserIdFromHeaders } from "@paashupatastra/service-kit";
import {
  BookingStatus,
  PaymentStatus,
  SevaBookingStatus,
  TankerOrderStatus,
  UserRole,
  WalletTxnType,
  paginationQuerySchema,
  withdrawWalletSchema,
} from "@paashupatastra/shared-models";
import { In, Repository } from "typeorm";
import { z } from "zod";
import {
  appPublicUrl,
  bookingIdFromCashfreeOrderId,
  cashfreeConfig,
  communityDueIdFromCashfreeOrderId,
  createCashfreeOrder,
  gatewayPublicUrl,
  getCashfreeOrder,
  isCashfreePaid,
  sevaBookingIdFromCashfreeOrderId,
  tankerOrderIdFromCashfreeOrderId,
  toCashfreeCommunityDueId,
  toCashfreeOrderId,
  toCashfreeSevaBookingId,
  toCashfreeTankerOrderId,
  verifyCashfreeWebhookSignature,
} from "./cashfree";

const paymentOrderTargetBaseSchema = z.object({
  bookingId: z.coerce.number().int().positive().optional(),
  tankerOrderId: z.coerce.number().int().positive().optional(),
  sevaBookingId: z.coerce.number().int().positive().optional(),
  communityDueId: z.coerce.number().int().positive().optional(),
});

function exactlyOnePaymentTarget(d: {
  bookingId?: number;
  tankerOrderId?: number;
  sevaBookingId?: number;
  communityDueId?: number;
}) {
  return [d.bookingId, d.tankerOrderId, d.sevaBookingId, d.communityDueId].filter((v) => v != null)
    .length === 1;
}

const paymentOrderTargetSchema = paymentOrderTargetBaseSchema.refine(exactlyOnePaymentTarget, {
  message: "Provide exactly one of bookingId, tankerOrderId, sevaBookingId, or communityDueId",
});

const paymentOrderVerifySchema = paymentOrderTargetBaseSchema
  .extend({
    orderId: z.string().min(3).optional(),
  })
  .refine(exactlyOnePaymentTarget, {
    message: "Provide exactly one of bookingId, tankerOrderId, sevaBookingId, or communityDueId",
  });

function tankerOrderAmountInPaise(order: TankerOrderEntity) {
  return (
    order.totalAmountInPaise ||
    order.amountInPaise + order.platformFeeInPaise + order.taxInPaise - order.discountInPaise ||
    order.amountInPaise
  );
}

function tankerServiceUrl() {
  return (process.env.TANKER_URL ?? "http://localhost:3007").replace(/\/$/, "");
}

function sevaServiceUrl() {
  return (process.env.SEVA_URL ?? "http://localhost:3009").replace(/\/$/, "");
}

function communitiesServiceUrl() {
  return (process.env.COMMUNITIES_URL ?? "http://localhost:3003").replace(/\/$/, "");
}

type TankerCustomerLike = Pick<TankerUserEntity, "id" | "phone" | "email" | "name">;

async function findTankerCustomer(
  tankerUserRepo: Repository<TankerUserEntity>,
  userRepo: Repository<UserEntity>,
  customerUserId: number,
): Promise<TankerCustomerLike | null> {
  return (
    (await tankerUserRepo.findOne({ where: { id: customerUserId } })) ??
    (await userRepo.findOne({ where: { id: customerUserId } }))
  );
}

async function confirmTankerPayment(
  tankerOrderId: number,
  customerUserId: number,
  orderId: string,
  source: string,
) {
  const res = await fetch(`${tankerServiceUrl()}/v1/tanker/orders/${tankerOrderId}/confirm-payment`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-user-id": String(customerUserId),
    },
    body: JSON.stringify({ orderId, source }),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
    throw new Error(data?.error?.message ?? `Tanker confirm failed (${res.status})`);
  }
  return res.json();
}

async function confirmSevaPayment(
  sevaBookingId: number,
  customerUserId: number,
  orderId: string,
  source: string,
) {
  const res = await fetch(`${sevaServiceUrl()}/v1/seva/bookings/${sevaBookingId}/confirm-payment`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-user-id": String(customerUserId),
    },
    body: JSON.stringify({ orderId, source }),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
    throw new Error(data?.error?.message ?? `Seva confirm failed (${res.status})`);
  }
  return res.json();
}

async function confirmCommunityDuePayment(
  communityDueId: number,
  residentUserId: number,
  orderId: string,
  source: string,
) {
  const res = await fetch(
    `${communitiesServiceUrl()}/v1/community/dues/${communityDueId}/confirm-payment`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-user-id": String(residentUserId),
      },
      body: JSON.stringify({ orderId, source }),
    },
  );
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
    throw new Error(data?.error?.message ?? `Community confirm failed (${res.status})`);
  }
  return res.json();
}

/**
 * Platform escrow wallet is NOT tied to a real user account.
 * Using userId=1 conflated admin/platform holdings with whoever got id=1 (often an owner).
 */
const PLATFORM_WALLET_USER_ID = 0;

async function getPlatformWallet(repo: Repository<WalletEntity>) {
  let wallet = await repo.findOne({ where: { type: "platform" } });
  if (!wallet) {
    // Legacy: funds may sit on userId=1 typed as platform
    const legacy = await repo.findOne({ where: { userId: 1, type: "platform" } });
    if (legacy) {
      legacy.userId = PLATFORM_WALLET_USER_ID;
      wallet = await repo.save(legacy);
      return wallet;
    }
    wallet = await repo.save(
      repo.create({
        userId: PLATFORM_WALLET_USER_ID,
        type: "platform",
        balanceInPaise: "0",
        currency: "INR",
      }),
    );
    return wallet;
  }

  if (wallet.userId !== PLATFORM_WALLET_USER_ID) {
    // Detach platform balance from a real user so /wallets/me never shows escrow
    const previousUserId = wallet.userId;
    wallet.userId = PLATFORM_WALLET_USER_ID;
    wallet = await repo.save(wallet);

    // Give that user a fresh empty personal wallet if they no longer have one
    const personal = await repo.findOne({ where: { userId: previousUserId } });
    if (!personal) {
      await repo.save(
        repo.create({
          userId: previousUserId,
          type: "owner",
          balanceInPaise: "0",
          currency: "INR",
        }),
      );
    }
  }

  return wallet;
}

async function getOrCreateWallet(repo: Repository<WalletEntity>, userId: number, type: string) {
  if (type === "platform") {
    return getPlatformWallet(repo);
  }

  // Never return the platform escrow wallet for a real user
  let wallet = await repo.findOne({ where: { userId } });
  if (wallet && wallet.type === "platform") {
    await getPlatformWallet(repo);
    wallet = await repo.findOne({ where: { userId } });
  }

  if (!wallet) {
    wallet = await repo.save(
      repo.create({
        userId,
        type: type === "owner" ? "owner" : "customer",
        balanceInPaise: "0",
        currency: "INR",
      }),
    );
  } else if (type === "owner" && wallet.type === "customer") {
    wallet.type = "owner";
    await repo.save(wallet);
  }
  return wallet;
}

function walletTypeForUser(headers: Record<string, unknown>) {
  const roles = getRolesFromHeaders(headers);
  if (
    roles.includes(UserRole.PARKING_OWNER) ||
    roles.includes(UserRole.TANKER_SUPPLIER) ||
    roles.includes(UserRole.SEVA_PROVIDER)
  ) {
    return "owner";
  }
  return "customer";
}

function ownerShareFromBooking(booking: ParkingBookingEntity) {
  const total = booking.totalAmountInPaise || booking.amountInPaise;
  const platformFee = booking.platformFeeInPaise || 0;
  const tax = booking.taxInPaise || 0;
  return {
    total,
    platformFee,
    tax,
    ownerShare: Math.max(0, total - platformFee - tax),
  };
}

function supplierShareFromTankerOrder(order: TankerOrderEntity) {
  const total = tankerOrderAmountInPaise(order);
  const platformFee = order.platformFeeInPaise || 0;
  const tax = order.taxInPaise || 0;
  return {
    total,
    platformFee,
    tax,
    supplierShare: Math.max(0, total - platformFee - tax),
  };
}

function sevaBookingAmountInPaise(booking: SevaBookingEntity) {
  return (
    booking.totalAmountInPaise ||
    booking.amountInPaise + booking.platformFeeInPaise + booking.taxInPaise ||
    booking.amountInPaise
  );
}

function providerShareFromSevaBooking(booking: SevaBookingEntity) {
  const total = sevaBookingAmountInPaise(booking);
  const platformFee = booking.platformFeeInPaise || 0;
  const tax = booking.taxInPaise || 0;
  return {
    total,
    platformFee,
    tax,
    providerShare: Math.max(0, total - platformFee - tax),
  };
}

function serializeTxn(row: WalletTransactionEntity) {
  return {
    id: row.id,
    walletId: row.walletId,
    type: row.type,
    amountInPaise: Number(row.amountInPaise),
    balanceAfterInPaise: Number(row.balanceAfterInPaise),
    purpose: row.purpose,
    referenceId: row.referenceId,
    notes: row.notes,
    createdAt: toIsoRequired(row.createdAt),
  };
}

async function creditPlatformFromBooking(
  booking: ParkingBookingEntity,
  walletRepo: Repository<WalletEntity>,
  txnRepo: Repository<WalletTransactionEntity>,
  bookingRepo: Repository<ParkingBookingEntity>,
  notes: string,
) {
  if (booking.paymentStatus === "paid" && booking.status !== BookingStatus.PENDING) {
    const platformWallet = await getPlatformWallet(walletRepo);
    return {
      ok: true as const,
      alreadyPaid: true,
      platformBalanceInPaise: Number(platformWallet.balanceInPaise),
      bookingId: booking.id,
      amountInPaise: booking.totalAmountInPaise || booking.amountInPaise,
    };
  }

  if (booking.status !== BookingStatus.PENDING && booking.paymentStatus !== "pending") {
    throw Object.assign(new Error("Only pending bookings can be paid"), { statusCode: 400 });
  }

  const amount = booking.totalAmountInPaise || booking.amountInPaise;
  const platformWallet = await getPlatformWallet(walletRepo);
  const newBalance = Number(platformWallet.balanceInPaise) + amount;
  platformWallet.balanceInPaise = String(newBalance);
  await walletRepo.save(platformWallet);
  await txnRepo.save(
    txnRepo.create({
      walletId: platformWallet.id,
      type: WalletTxnType.CREDIT,
      amountInPaise: String(amount),
      balanceAfterInPaise: String(newBalance),
      purpose: "booking_payment",
      referenceId: booking.id,
      notes,
    }),
  );

  // Customer ledger entry only (does not change customer balance; cash collected via Cashfree)
  const customerWallet = await getOrCreateWallet(walletRepo, booking.renterUserId, "customer");
  const customerBal = Number(customerWallet.balanceInPaise);
  await txnRepo.save(
    txnRepo.create({
      walletId: customerWallet.id,
      type: WalletTxnType.DEBIT,
      amountInPaise: String(amount),
      balanceAfterInPaise: String(customerBal),
      purpose: "booking_payment",
      referenceId: booking.id,
      notes: "Paid for parking booking via Cashfree (held in platform wallet until check-out)",
    }),
  );

  booking.paymentStatus = "paid";
  booking.status = BookingStatus.CONFIRMED;
  booking.paymentProvider = "cashfree";
  await bookingRepo.save(booking);

  return {
    ok: true as const,
    alreadyPaid: false,
    platformBalanceInPaise: newBalance,
    bookingId: booking.id,
    amountInPaise: amount,
  };
}

async function creditPlatformFromTankerOrder(
  order: TankerOrderEntity,
  walletRepo: Repository<WalletEntity>,
  txnRepo: Repository<WalletTransactionEntity>,
  notes: string,
) {
  const existing = await txnRepo.findOne({
    where: {
      referenceId: order.id,
      purpose: "tanker_order_payment",
      type: WalletTxnType.CREDIT,
    },
  });
  if (existing) {
    const platformWallet = await getPlatformWallet(walletRepo);
    return {
      ok: true as const,
      alreadyPaid: true,
      platformBalanceInPaise: Number(platformWallet.balanceInPaise),
      tankerOrderId: order.id,
      amountInPaise: Number(existing.amountInPaise),
    };
  }

  const amount = tankerOrderAmountInPaise(order);
  const platformWallet = await getPlatformWallet(walletRepo);
  const newBalance = Number(platformWallet.balanceInPaise) + amount;
  platformWallet.balanceInPaise = String(newBalance);
  await walletRepo.save(platformWallet);
  await txnRepo.save(
    txnRepo.create({
      walletId: platformWallet.id,
      type: WalletTxnType.CREDIT,
      amountInPaise: String(amount),
      balanceAfterInPaise: String(newBalance),
      purpose: "tanker_order_payment",
      referenceId: order.id,
      notes,
    }),
  );

  const customerWallet = await getOrCreateWallet(walletRepo, order.customerUserId, "customer");
  const customerBal = Number(customerWallet.balanceInPaise);
  await txnRepo.save(
    txnRepo.create({
      walletId: customerWallet.id,
      type: WalletTxnType.DEBIT,
      amountInPaise: String(amount),
      balanceAfterInPaise: String(customerBal),
      purpose: "tanker_order_payment",
      referenceId: order.id,
      notes: "Paid for tanker order via Cashfree (held in platform wallet until delivery)",
    }),
  );

  return {
    ok: true as const,
    alreadyPaid: false,
    platformBalanceInPaise: newBalance,
    tankerOrderId: order.id,
    amountInPaise: amount,
  };
}

async function settleTankerOrderToSupplier(
  order: TankerOrderEntity,
  supplierUserId: number,
  walletRepo: Repository<WalletEntity>,
  txnRepo: Repository<WalletTransactionEntity>,
) {
  const alreadySettled = await txnRepo.findOne({
    where: {
      referenceId: order.id,
      purpose: "tanker_settlement",
      type: WalletTxnType.CREDIT,
    },
  });
  if (alreadySettled) {
    const supplierWallet = await getOrCreateWallet(walletRepo, supplierUserId, "owner");
    const platformWallet = await getPlatformWallet(walletRepo);
    return {
      ok: true as const,
      alreadySettled: true,
      supplierShareInPaise: Number(alreadySettled.amountInPaise),
      platformFeeInPaise: order.platformFeeInPaise || 0,
      taxInPaise: order.taxInPaise || 0,
      supplierBalanceInPaise: Number(supplierWallet.balanceInPaise),
      platformBalanceInPaise: Number(platformWallet.balanceInPaise),
    };
  }

  const { platformFee, tax, supplierShare } = supplierShareFromTankerOrder(order);
  const platformWallet = await getPlatformWallet(walletRepo);
  const supplierWallet = await getOrCreateWallet(walletRepo, supplierUserId, "owner");

  const platformBal = Number(platformWallet.balanceInPaise) - supplierShare;
  if (platformBal < 0) {
    throw Object.assign(new Error("Platform wallet does not hold enough to settle this tanker order"), {
      statusCode: 409,
      code: "INSUFFICIENT_PLATFORM_BALANCE",
    });
  }

  platformWallet.balanceInPaise = String(platformBal);
  await walletRepo.save(platformWallet);
  await txnRepo.save(
    txnRepo.create({
      walletId: platformWallet.id,
      type: WalletTxnType.DEBIT,
      amountInPaise: String(supplierShare),
      balanceAfterInPaise: String(platformBal),
      purpose: "tanker_settlement",
      referenceId: order.id,
      notes: "Release supplier share from platform escrow after delivery",
    }),
  );

  const supplierBal = Number(supplierWallet.balanceInPaise) + supplierShare;
  supplierWallet.balanceInPaise = String(supplierBal);
  await walletRepo.save(supplierWallet);
  await txnRepo.save(
    txnRepo.create({
      walletId: supplierWallet.id,
      type: WalletTxnType.CREDIT,
      amountInPaise: String(supplierShare),
      balanceAfterInPaise: String(supplierBal),
      purpose: "tanker_settlement",
      referenceId: order.id,
      notes: `Supplier credit after delivery (platform fee ${platformFee} paise, tax ${tax} paise retained)`,
    }),
  );

  return {
    ok: true as const,
    alreadySettled: false,
    supplierShareInPaise: supplierShare,
    platformFeeInPaise: platformFee,
    taxInPaise: tax,
    supplierBalanceInPaise: supplierBal,
    platformBalanceInPaise: platformBal,
  };
}

async function creditPlatformFromSevaBooking(
  booking: SevaBookingEntity,
  walletRepo: Repository<WalletEntity>,
  txnRepo: Repository<WalletTransactionEntity>,
  notes: string,
) {
  const existing = await txnRepo.findOne({
    where: {
      referenceId: booking.id,
      purpose: "seva_booking_payment",
      type: WalletTxnType.CREDIT,
    },
  });
  if (existing) {
    const platformWallet = await getPlatformWallet(walletRepo);
    return {
      ok: true as const,
      alreadyPaid: true,
      platformBalanceInPaise: Number(platformWallet.balanceInPaise),
      sevaBookingId: booking.id,
      amountInPaise: Number(existing.amountInPaise),
    };
  }

  const amount = sevaBookingAmountInPaise(booking);
  const platformWallet = await getPlatformWallet(walletRepo);
  const newBalance = Number(platformWallet.balanceInPaise) + amount;
  platformWallet.balanceInPaise = String(newBalance);
  await walletRepo.save(platformWallet);
  await txnRepo.save(
    txnRepo.create({
      walletId: platformWallet.id,
      type: WalletTxnType.CREDIT,
      amountInPaise: String(amount),
      balanceAfterInPaise: String(newBalance),
      purpose: "seva_booking_payment",
      referenceId: booking.id,
      notes,
    }),
  );

  const customerWallet = await getOrCreateWallet(walletRepo, booking.customerUserId, "customer");
  const customerBal = Number(customerWallet.balanceInPaise);
  await txnRepo.save(
    txnRepo.create({
      walletId: customerWallet.id,
      type: WalletTxnType.DEBIT,
      amountInPaise: String(amount),
      balanceAfterInPaise: String(customerBal),
      purpose: "seva_booking_payment",
      referenceId: booking.id,
      notes: "Paid for Seva booking via Cashfree (held in platform wallet until completion)",
    }),
  );

  return {
    ok: true as const,
    alreadyPaid: false,
    platformBalanceInPaise: newBalance,
    sevaBookingId: booking.id,
    amountInPaise: amount,
  };
}

async function settleSevaBookingToProvider(
  booking: SevaBookingEntity,
  providerUserId: number,
  walletRepo: Repository<WalletEntity>,
  txnRepo: Repository<WalletTransactionEntity>,
) {
  const alreadySettled = await txnRepo.findOne({
    where: {
      referenceId: booking.id,
      purpose: "seva_settlement",
      type: WalletTxnType.CREDIT,
    },
  });
  if (alreadySettled) {
    const providerWallet = await getOrCreateWallet(walletRepo, providerUserId, "owner");
    const platformWallet = await getPlatformWallet(walletRepo);
    return {
      ok: true as const,
      alreadySettled: true,
      providerShareInPaise: Number(alreadySettled.amountInPaise),
      platformFeeInPaise: booking.platformFeeInPaise || 0,
      taxInPaise: booking.taxInPaise || 0,
      providerBalanceInPaise: Number(providerWallet.balanceInPaise),
      platformBalanceInPaise: Number(platformWallet.balanceInPaise),
    };
  }

  const { platformFee, tax, providerShare } = providerShareFromSevaBooking(booking);
  const platformWallet = await getPlatformWallet(walletRepo);
  const providerWallet = await getOrCreateWallet(walletRepo, providerUserId, "owner");

  const platformBal = Number(platformWallet.balanceInPaise) - providerShare;
  if (platformBal < 0) {
    throw Object.assign(new Error("Platform wallet does not hold enough to settle this Seva booking"), {
      statusCode: 409,
      code: "INSUFFICIENT_PLATFORM_BALANCE",
    });
  }

  platformWallet.balanceInPaise = String(platformBal);
  await walletRepo.save(platformWallet);
  await txnRepo.save(
    txnRepo.create({
      walletId: platformWallet.id,
      type: WalletTxnType.DEBIT,
      amountInPaise: String(providerShare),
      balanceAfterInPaise: String(platformBal),
      purpose: "seva_settlement",
      referenceId: booking.id,
      notes: "Release provider share from platform escrow after job completion",
    }),
  );

  const providerBal = Number(providerWallet.balanceInPaise) + providerShare;
  providerWallet.balanceInPaise = String(providerBal);
  await walletRepo.save(providerWallet);
  await txnRepo.save(
    txnRepo.create({
      walletId: providerWallet.id,
      type: WalletTxnType.CREDIT,
      amountInPaise: String(providerShare),
      balanceAfterInPaise: String(providerBal),
      purpose: "seva_settlement",
      referenceId: booking.id,
      notes: `Provider credit after completion (platform fee ${platformFee} paise, tax ${tax} paise retained)`,
    }),
  );

  return {
    ok: true as const,
    alreadySettled: false,
    providerShareInPaise: providerShare,
    platformFeeInPaise: platformFee,
    taxInPaise: tax,
    providerBalanceInPaise: providerBal,
    platformBalanceInPaise: platformBal,
  };
}

async function main() {
  loadEnv();
  const ds = await getDataSource();
  const walletRepo = ds.getRepository(WalletEntity);
  const txnRepo = ds.getRepository(WalletTransactionEntity);
  const commissionRepo = ds.getRepository(CommissionConfigEntity);
  const bookingRepo = ds.getRepository(ParkingBookingEntity);
  const tankerOrderRepo = ds.getRepository(TankerOrderEntity);
  const tankerUserRepo = ds.getRepository(TankerUserEntity);
  const tankerSupplierRepo = ds.getRepository(TankerSupplierEntity);
  const sevaBookingRepo = ds.getRepository(SevaBookingEntity);
  const communityDueRepo = ds.getRepository(CommunityDueEntity);
  const sevaProviderRepo = ds.getRepository(SevaProviderEntity);
  const userRepo = ds.getRepository(UserEntity);
  const bankRepo = ds.getRepository(BankAccountEntity);

  await getPlatformWallet(walletRepo);

  let commission = await commissionRepo.findOne({ where: { moduleName: "parking", isActive: true } });
  if (!commission) {
    commission = await commissionRepo.save(
      commissionRepo.create({
        moduleName: "parking",
        commissionBps: 1000,
        platformFeeFlatPaise: 500,
        taxBps: 0,
        isActive: true,
      }),
    );
  }

  await createService({
    name: "payments",
    port: envInt("PAYMENTS_PORT", 3005),
    registerRoutes: async (app) => {
      app.get("/v1/payments/commission", async () => commission);

      app.get("/v1/payments/cashfree/config", async () => {
        const cfg = cashfreeConfig();
        return {
          provider: "cashfree",
          env: cfg.env,
          configured: cfg.configured,
          apiVersion: cfg.apiVersion,
        };
      });

      app.patch("/v1/payments/commission", async (request) => {
        const body = z
          .object({
            commissionBps: z.number().int().min(0).max(5000).optional(),
            platformFeeFlatPaise: z.number().int().min(0).optional(),
            taxBps: z.number().int().min(0).max(5000).optional(),
          })
          .parse(request.body);
        Object.assign(commission!, body);
        commission = await commissionRepo.save(commission!);
        return commission;
      });

      app.get("/v1/payments/wallets/me", async (request, reply) => {
        const headers = request.headers as Record<string, unknown>;
        const userId = parseUserIdFromHeaders(headers);
        if (!userId) {
          return reply.code(401).send({ error: { code: "UNAUTHORIZED", message: "Unauthorized" } });
        }
        const walletType = walletTypeForUser(headers);
        const wallet = await getOrCreateWallet(walletRepo, userId, walletType);

        let pendingSettlementInPaise = 0;
        if (walletType === "owner") {
          const roles = getRolesFromHeaders(headers);
          if (roles.includes(UserRole.PARKING_OWNER)) {
            const held = await bookingRepo.find({
              where: {
                ownerUserId: userId,
                paymentStatus: "paid",
                status: In([BookingStatus.CONFIRMED, BookingStatus.CHECKED_IN]),
              },
            });
            for (const b of held) {
              const settled = await txnRepo.exist({
                where: {
                  referenceId: b.id,
                  purpose: "settlement",
                  type: WalletTxnType.CREDIT,
                },
              });
              if (!settled) {
                pendingSettlementInPaise += ownerShareFromBooking(b).ownerShare;
              }
            }
          }

          if (roles.includes(UserRole.TANKER_SUPPLIER)) {
            const supplier = await tankerSupplierRepo.findOne({ where: { userId } });
            if (supplier) {
              const heldOrders = await tankerOrderRepo.find({
                where: {
                  supplierId: supplier.id,
                  paymentStatus: PaymentStatus.PAID,
                  status: In([
                    TankerOrderStatus.SCHEDULED,
                    TankerOrderStatus.EN_ROUTE,
                    TankerOrderStatus.WATER_FILLED,
                    TankerOrderStatus.ON_THE_WAY,
                    TankerOrderStatus.AT_LOCATION,
                    TankerOrderStatus.DELIVERING,
                  ]),
                },
              });
              for (const o of heldOrders) {
                const settled = await txnRepo.exist({
                  where: {
                    referenceId: o.id,
                    purpose: "tanker_settlement",
                    type: WalletTxnType.CREDIT,
                  },
                });
                if (!settled) {
                  pendingSettlementInPaise += supplierShareFromTankerOrder(o).supplierShare;
                }
              }
            }
          }

          if (roles.includes(UserRole.SEVA_PROVIDER)) {
            const provider = await sevaProviderRepo.findOne({ where: { userId } });
            if (provider) {
              const heldBookings = await sevaBookingRepo.find({
                where: {
                  providerId: provider.id,
                  paymentStatus: PaymentStatus.PAID,
                  status: In([
                    SevaBookingStatus.ACCEPTED,
                    SevaBookingStatus.SCHEDULED,
                    SevaBookingStatus.ON_THE_WAY,
                    SevaBookingStatus.IN_PROGRESS,
                  ]),
                },
              });
              for (const b of heldBookings) {
                const settled = await txnRepo.exist({
                  where: {
                    referenceId: b.id,
                    purpose: "seva_settlement",
                    type: WalletTxnType.CREDIT,
                  },
                });
                if (!settled) {
                  pendingSettlementInPaise += providerShareFromSevaBooking(b).providerShare;
                }
              }
            }
          }
        }

        return {
          id: wallet.id,
          userId: wallet.userId,
          type: wallet.type,
          balanceInPaise: Number(wallet.balanceInPaise),
          pendingSettlementInPaise,
          currency: wallet.currency,
          updatedAt: toIsoRequired(wallet.updatedAt),
        };
      });

      app.get("/v1/payments/wallets/me/transactions", async (request, reply) => {
        const headers = request.headers as Record<string, unknown>;
        const userId = parseUserIdFromHeaders(headers);
        if (!userId) {
          return reply.code(401).send({ error: { code: "UNAUTHORIZED", message: "Unauthorized" } });
        }
        const query = paginationQuerySchema.parse(request.query);
        const wallet = await getOrCreateWallet(walletRepo, userId, walletTypeForUser(headers));
        const [items, total] = await txnRepo.findAndCount({
          where: { walletId: wallet.id },
          order: { createdAt: "DESC" },
          skip: (query.page - 1) * query.limit,
          take: query.limit,
        });
        return {
          wallet: {
            id: wallet.id,
            type: wallet.type,
            balanceInPaise: Number(wallet.balanceInPaise),
            currency: wallet.currency,
          },
          items: items.map(serializeTxn),
          page: query.page,
          limit: query.limit,
          total,
          totalPages: Math.max(1, Math.ceil(total / query.limit)),
        };
      });

      app.post("/v1/payments/wallets/me/withdraw", async (request, reply) => {
        const headers = request.headers as Record<string, unknown>;
        const userId = parseUserIdFromHeaders(headers);
        if (!userId) {
          return reply.code(401).send({ error: { code: "UNAUTHORIZED", message: "Unauthorized" } });
        }
        const roles = getRolesFromHeaders(headers);
        if (
          !roles.includes(UserRole.PARKING_OWNER) &&
          !roles.includes(UserRole.TANKER_SUPPLIER) &&
          !roles.includes(UserRole.SEVA_PROVIDER)
        ) {
          return reply.code(403).send({
            error: {
              code: "FORBIDDEN",
              message: "Only parking owners, tanker suppliers, or Seva providers can withdraw to bank",
            },
          });
        }

        const body = withdrawWalletSchema.parse(request.body);
        const amount = body.amountInPaise;

        let bank: BankAccountEntity | null = null;
        if (body.bankAccountId) {
          bank = await bankRepo.findOne({ where: { id: body.bankAccountId, userId } });
        } else {
          bank =
            (await bankRepo.findOne({ where: { userId, isPrimary: true } })) ??
            (await bankRepo.findOne({ where: { userId }, order: { createdAt: "DESC" } }));
        }
        if (!bank) {
          return reply.code(400).send({
            error: {
              code: "BANK_REQUIRED",
              message: "Add a bank account before withdrawing",
            },
          });
        }

        const wallet = await getOrCreateWallet(walletRepo, userId, "owner");
        const balance = Number(wallet.balanceInPaise);
        if (amount > balance) {
          return reply.code(400).send({
            error: {
              code: "INSUFFICIENT_BALANCE",
              message: "Withdrawal amount exceeds available wallet balance",
            },
          });
        }

        const newBalance = balance - amount;
        wallet.balanceInPaise = String(newBalance);
        await walletRepo.save(wallet);

        const masked = bank.accountNumber.replace(/\d(?=\d{4})/g, "X");
        const txn = await txnRepo.save(
          txnRepo.create({
            walletId: wallet.id,
            type: WalletTxnType.DEBIT,
            amountInPaise: String(amount),
            balanceAfterInPaise: String(newBalance),
            purpose: "payout",
            referenceId: bank.id,
            notes: `Withdrawn to ${bank.bankName} · A/c ${masked} · IFSC ${bank.ifscCode}`,
          }),
        );

        // Notify owner (best-effort)
        const notificationsUrl = (process.env.NOTIFICATIONS_URL ?? "http://localhost:3006").replace(
          /\/$/,
          "",
        );
        const user =
          (await userRepo.findOne({ where: { id: userId } })) ??
          (await tankerUserRepo.findOne({ where: { id: userId } }));
        const title = "Wallet withdrawal initiated";
        const notifyBody = [
          `Hello ${
            user?.name ??
            (roles.includes(UserRole.TANKER_SUPPLIER)
              ? "Supplier"
              : roles.includes(UserRole.SEVA_PROVIDER)
                ? "Provider"
                : "Owner")
          },`,
          "",
          `Your withdrawal of ₹${(amount / 100).toFixed(2)} has been initiated.`,
          `Bank: ${bank.bankName}`,
          `Account: ${masked}`,
          `IFSC: ${bank.ifscCode}`,
          `Remaining wallet balance: ₹${(newBalance / 100).toFixed(2)}`,
          "",
          "Funds are typically credited within 1–2 business days (sandbox: simulated instantly).",
        ].join("\n");
        const isTankerSupplier = roles.includes(UserRole.TANKER_SUPPLIER);
        const isSevaProvider = roles.includes(UserRole.SEVA_PROVIDER);
        void fetch(`${notificationsUrl}/v1/notifications/send`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            userId,
            module: isTankerSupplier ? "tanker" : isSevaProvider ? "seva" : "parking",
            audience: isTankerSupplier ? "supplier" : isSevaProvider ? "provider" : "owner",
            channel: "in_app",
            title,
            body: `₹${(amount / 100).toFixed(2)} withdrawn to ${bank.bankName} (${masked}).`,
            referenceType: "wallet_withdraw",
            referenceId: bank.id,
          }),
        }).catch(() => undefined);
        if (user?.email) {
          void fetch(`${notificationsUrl}/v1/notifications/send`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              userId,
              channel: "email",
              toEmail: user.email,
              title,
              body: notifyBody,
              skipLog: true,
              referenceType: "wallet_withdraw",
              referenceId: bank.id,
            }),
          }).catch(() => undefined);
        }

        return {
          ok: true,
          amountInPaise: amount,
          balanceInPaise: newBalance,
          bankAccount: {
            id: bank.id,
            bankName: bank.bankName,
            accountNumberMasked: masked,
            ifscCode: bank.ifscCode,
            accountHolderName: bank.accountHolderName,
          },
          transaction: serializeTxn(txn),
        };
      });

      app.get("/v1/payments/wallets/platform", async () => {
        const wallet = await getPlatformWallet(walletRepo);
        return {
          id: wallet.id,
          userId: wallet.userId,
          type: wallet.type,
          balanceInPaise: Number(wallet.balanceInPaise),
          currency: wallet.currency,
        };
      });

      app.get("/v1/payments/wallets/:userId/transactions", async (request) => {
        const userId = parseEntityId((request.params as { userId: string }).userId);
        const query = paginationQuerySchema.parse(request.query);
        const wallet = await getOrCreateWallet(walletRepo, userId, "owner");
        const [items, total] = await txnRepo.findAndCount({
          where: { walletId: wallet.id },
          order: { createdAt: "DESC" },
          skip: (query.page - 1) * query.limit,
          take: query.limit,
        });
        return {
          items: items.map(serializeTxn),
          page: query.page,
          limit: query.limit,
          total,
          totalPages: Math.max(1, Math.ceil(total / query.limit)),
        };
      });

      /** Create Cashfree sandbox/production order for a booking or tanker order */
      app.post("/v1/payments/orders", async (request, reply) => {
        const headers = request.headers as Record<string, unknown>;
        const userId = parseUserIdFromHeaders(headers);
        if (!userId) {
          return reply.code(401).send({ error: { code: "UNAUTHORIZED", message: "Unauthorized" } });
        }

        const body = paymentOrderTargetSchema.parse(request.body);

        const cfg = cashfreeConfig();
        if (!cfg.configured) {
          return reply.code(503).send({
            error: {
              code: "CASHFREE_NOT_CONFIGURED",
              message:
                "Set CASHFREE_APP_ID and CASHFREE_SECRET_KEY (sandbox test keys) in .env",
            },
          });
        }

        if (body.tankerOrderId) {
          const order = await tankerOrderRepo.findOne({ where: { id: body.tankerOrderId } });
          if (!order) {
            return reply.code(404).send({ error: { code: "NOT_FOUND", message: "Tanker order not found" } });
          }
          if (order.customerUserId !== userId) {
            return reply.code(403).send({ error: { code: "FORBIDDEN", message: "Not your tanker order" } });
          }
          if (order.paymentStatus === "paid") {
            return reply.code(400).send({
              error: { code: "ALREADY_PAID", message: "Tanker order is already paid" },
            });
          }

          const customer = await findTankerCustomer(tankerUserRepo, userRepo, order.customerUserId);
          if (!customer?.phone) {
            return reply.code(400).send({
              error: { code: "CUSTOMER_PHONE_REQUIRED", message: "Customer phone is required for Cashfree" },
            });
          }

          const orderId = toCashfreeTankerOrderId(order.id);
          const amountInPaise = tankerOrderAmountInPaise(order);
          const amountInr = amountInPaise / 100;
          const returnUrl = `${appPublicUrl()}/app/tanker/payment/return?tanker_order_id=${order.id}&order_id={order_id}`;
          const notifyUrl = `${gatewayPublicUrl()}/v1/payments/webhooks/cashfree`;

          try {
            let cashfreeOrder;
            try {
              cashfreeOrder = await createCashfreeOrder({
                orderId,
                amountInr,
                customerId: String(customer.id),
                customerPhone: customer.phone,
                customerEmail: customer.email,
                customerName: customer.name,
                returnUrl,
                notifyUrl,
                orderNote: "Paashupatastra tanker order",
              });
            } catch (createErr) {
              cashfreeOrder = await getCashfreeOrder(orderId);
              if (!cashfreeOrder.payment_session_id) throw createErr;
            }

            order.paymentProvider = "cashfree";
            order.paymentProviderOrderId = cashfreeOrder.order_id ?? orderId;
            await tankerOrderRepo.save(order);

            return reply.code(201).send({
              id: order.id,
              tankerOrderId: order.id,
              orderId: cashfreeOrder.order_id ?? orderId,
              paymentSessionId: cashfreeOrder.payment_session_id,
              amountInPaise,
              amountInr,
              currency: "INR",
              status: cashfreeOrder.order_status ?? "ACTIVE",
              provider: "cashfree",
              env: cfg.env,
              returnUrl,
            });
          } catch (err) {
            return reply.code(502).send({
              error: {
                code: "CASHFREE_ORDER_FAILED",
                message: err instanceof Error ? err.message : "Failed to create Cashfree order",
              },
            });
          }
        }

        if (body.sevaBookingId) {
          const booking = await sevaBookingRepo.findOne({ where: { id: body.sevaBookingId } });
          if (!booking) {
            return reply.code(404).send({ error: { code: "NOT_FOUND", message: "Seva booking not found" } });
          }
          if (booking.customerUserId !== userId) {
            return reply.code(403).send({ error: { code: "FORBIDDEN", message: "Not your Seva booking" } });
          }
          if (booking.paymentStatus === "paid") {
            return reply.code(400).send({
              error: { code: "ALREADY_PAID", message: "Seva booking is already paid" },
            });
          }
          if (
            booking.status === "cancelled" ||
            booking.status === "rejected"
          ) {
            return reply.code(400).send({
              error: {
                code: "INVALID_STATE",
                message:
                  booking.status === "cancelled"
                    ? "Payment window of 10 minutes has expired. The worker was released."
                    : "Cannot pay for this booking",
              },
            });
          }
          if (booking.paymentDueAt && new Date(booking.paymentDueAt).getTime() < Date.now()) {
            return reply.code(400).send({
              error: {
                code: "PAYMENT_WINDOW_EXPIRED",
                message: "Payment window of 10 minutes has expired. The worker was released.",
              },
            });
          }

          const customer = await userRepo.findOne({ where: { id: booking.customerUserId } });
          if (!customer?.phone) {
            return reply.code(400).send({
              error: { code: "CUSTOMER_PHONE_REQUIRED", message: "Customer phone is required for Cashfree" },
            });
          }

          const orderId = toCashfreeSevaBookingId(booking.id);
          const amountInPaise = sevaBookingAmountInPaise(booking);
          const amountInr = amountInPaise / 100;
          const returnUrl = `${appPublicUrl()}/app/seva/payment/return?seva_booking_id=${booking.id}&order_id={order_id}`;
          const notifyUrl = `${gatewayPublicUrl()}/v1/payments/webhooks/cashfree`;

          try {
            let cashfreeOrder;
            try {
              cashfreeOrder = await createCashfreeOrder({
                orderId,
                amountInr,
                customerId: String(customer.id),
                customerPhone: customer.phone,
                customerEmail: customer.email,
                customerName: customer.name,
                returnUrl,
                notifyUrl,
                orderNote: "Paashupatastra Seva booking",
              });
            } catch (createErr) {
              cashfreeOrder = await getCashfreeOrder(orderId);
              if (!cashfreeOrder.payment_session_id) throw createErr;
            }

            booking.paymentProvider = "cashfree";
            booking.paymentProviderOrderId = cashfreeOrder.order_id ?? orderId;
            await sevaBookingRepo.save(booking);

            return reply.code(201).send({
              id: booking.id,
              sevaBookingId: booking.id,
              orderId: cashfreeOrder.order_id ?? orderId,
              paymentSessionId: cashfreeOrder.payment_session_id,
              amountInPaise,
              amountInr,
              currency: "INR",
              status: cashfreeOrder.order_status ?? "ACTIVE",
              provider: "cashfree",
              env: cfg.env,
              returnUrl,
            });
          } catch (err) {
            return reply.code(502).send({
              error: {
                code: "CASHFREE_ORDER_FAILED",
                message: err instanceof Error ? err.message : "Failed to create Cashfree order",
              },
            });
          }
        }

        if (body.communityDueId) {
          const due = await communityDueRepo.findOne({ where: { id: body.communityDueId } });
          if (!due) {
            return reply.code(404).send({ error: { code: "NOT_FOUND", message: "Community due not found" } });
          }
          if (due.residentUserId !== userId) {
            return reply.code(403).send({ error: { code: "FORBIDDEN", message: "Not your maintenance due" } });
          }
          if (due.paymentStatus === "paid" || due.status === "paid") {
            return reply.code(400).send({
              error: { code: "ALREADY_PAID", message: "This maintenance due is already paid" },
            });
          }
          if (due.status === "cancelled") {
            return reply.code(400).send({
              error: { code: "CANCELLED", message: "This due was cancelled" },
            });
          }

          const customer = await userRepo.findOne({ where: { id: due.residentUserId } });
          if (!customer?.phone) {
            return reply.code(400).send({
              error: { code: "CUSTOMER_PHONE_REQUIRED", message: "Customer phone is required for Cashfree" },
            });
          }

          const orderId = toCashfreeCommunityDueId(due.id);
          const amountInPaise = due.amountInPaise;
          const amountInr = amountInPaise / 100;
          const returnUrl = `${appPublicUrl()}/app/community/payment/return?community_due_id=${due.id}&order_id={order_id}`;
          const notifyUrl = `${gatewayPublicUrl()}/v1/payments/webhooks/cashfree`;

          try {
            let cashfreeOrder;
            try {
              cashfreeOrder = await createCashfreeOrder({
                orderId,
                amountInr,
                customerId: String(customer.id),
                customerPhone: customer.phone,
                customerEmail: customer.email,
                customerName: customer.name,
                returnUrl,
                notifyUrl,
                orderNote: "Paashupatastra community maintenance",
              });
            } catch (createErr) {
              cashfreeOrder = await getCashfreeOrder(orderId);
              if (!cashfreeOrder.payment_session_id) throw createErr;
            }

            due.paymentProvider = "cashfree";
            due.paymentProviderOrderId = cashfreeOrder.order_id ?? orderId;
            await communityDueRepo.save(due);

            return reply.code(201).send({
              id: due.id,
              communityDueId: due.id,
              orderId: cashfreeOrder.order_id ?? orderId,
              paymentSessionId: cashfreeOrder.payment_session_id,
              amountInPaise,
              amountInr,
              currency: "INR",
              status: cashfreeOrder.order_status ?? "ACTIVE",
              provider: "cashfree",
              env: cfg.env,
              returnUrl,
            });
          } catch (err) {
            return reply.code(502).send({
              error: {
                code: "CASHFREE_ORDER_FAILED",
                message: err instanceof Error ? err.message : "Failed to create Cashfree order",
              },
            });
          }
        }

        const booking = await bookingRepo.findOne({ where: { id: body.bookingId! } });
        if (!booking) {
          return reply.code(404).send({ error: { code: "NOT_FOUND", message: "Booking not found" } });
        }
        if (booking.renterUserId !== userId) {
          return reply.code(403).send({ error: { code: "FORBIDDEN", message: "Not your booking" } });
        }
        if (booking.paymentStatus === "paid") {
          return reply.code(400).send({
            error: { code: "ALREADY_PAID", message: "Booking is already paid" },
          });
        }

        const customer = await userRepo.findOne({ where: { id: booking.renterUserId } });
        if (!customer?.phone) {
          return reply.code(400).send({
            error: { code: "CUSTOMER_PHONE_REQUIRED", message: "Customer phone is required for Cashfree" },
          });
        }

        const orderId = toCashfreeOrderId(booking.id);
        const amountInPaise = booking.totalAmountInPaise || booking.amountInPaise;
        const amountInr = amountInPaise / 100;
        const returnUrl = `${appPublicUrl()}/app/customer/payment/return?booking_id=${booking.id}&order_id={order_id}`;
        const notifyUrl = `${gatewayPublicUrl()}/v1/payments/webhooks/cashfree`;

        try {
          let order;
          try {
            order = await createCashfreeOrder({
              orderId,
              amountInr,
              customerId: String(customer.id),
              customerPhone: customer.phone,
              customerEmail: customer.email,
              customerName: customer.name,
              returnUrl,
              notifyUrl,
            });
          } catch (createErr) {
            // Reuse existing Cashfree order for this booking if already created
            order = await getCashfreeOrder(orderId);
            if (!order.payment_session_id) throw createErr;
          }

          booking.paymentProvider = "cashfree";
          booking.paymentProviderOrderId = order.order_id ?? orderId;
          await bookingRepo.save(booking);

          return reply.code(201).send({
            id: booking.id,
            bookingId: booking.id,
            orderId: order.order_id ?? orderId,
            paymentSessionId: order.payment_session_id,
            amountInPaise,
            amountInr,
            currency: "INR",
            status: order.order_status ?? "ACTIVE",
            provider: "cashfree",
            env: cfg.env,
            returnUrl,
          });
        } catch (err) {
          return reply.code(502).send({
            error: {
              code: "CASHFREE_ORDER_FAILED",
              message: err instanceof Error ? err.message : "Failed to create Cashfree order",
            },
          });
        }
      });

      /** Verify Cashfree payment and credit platform wallet (booking) or confirm tanker order */
      app.post("/v1/payments/orders/verify", async (request, reply) => {
        const headers = request.headers as Record<string, unknown>;
        const userId = parseUserIdFromHeaders(headers);
        if (!userId) {
          return reply.code(401).send({ error: { code: "UNAUTHORIZED", message: "Unauthorized" } });
        }

        const body = paymentOrderVerifySchema.parse(request.body);

        if (body.tankerOrderId) {
          const tankerOrder = await tankerOrderRepo.findOne({ where: { id: body.tankerOrderId } });
          if (!tankerOrder) {
            return reply.code(404).send({ error: { code: "NOT_FOUND", message: "Tanker order not found" } });
          }
          if (tankerOrder.customerUserId !== userId) {
            return reply.code(403).send({ error: { code: "FORBIDDEN", message: "Not your tanker order" } });
          }

          const orderId =
            body.orderId ?? tankerOrder.paymentProviderOrderId ?? toCashfreeTankerOrderId(tankerOrder.id);

          try {
            const order = await getCashfreeOrder(orderId);
            if (!isCashfreePaid(order.order_status)) {
              return reply.code(402).send({
                error: {
                  code: "PAYMENT_PENDING",
                  message: `Cashfree order status is ${order.order_status ?? "UNKNOWN"}. Complete payment first.`,
                },
                orderStatus: order.order_status,
                orderId,
              });
            }

            tankerOrder.paymentProviderOrderId = order.order_id ?? orderId;
            await tankerOrderRepo.save(tankerOrder);

            try {
              await confirmTankerPayment(
                tankerOrder.id,
                tankerOrder.customerUserId,
                order.order_id ?? orderId,
                "cashfree_verify",
              );
            } catch (err) {
              return reply.code(502).send({
                error: {
                  code: "TANKER_CONFIRM_FAILED",
                  message: err instanceof Error ? err.message : "Failed to confirm tanker payment",
                },
              });
            }

            const fresh = await tankerOrderRepo.findOne({ where: { id: tankerOrder.id } });
            const credited = await creditPlatformFromTankerOrder(
              fresh ?? tankerOrder,
              walletRepo,
              txnRepo,
              "Customer tanker payment collected via Cashfree to platform wallet",
            );

            return {
              ok: true,
              tankerOrderId: tankerOrder.id,
              orderId: order.order_id ?? orderId,
              orderStatus: order.order_status,
              provider: "cashfree",
              platformBalanceInPaise: credited.platformBalanceInPaise,
              amountInPaise: credited.amountInPaise,
            };
          } catch (err) {
            return reply.code(502).send({
              error: {
                code: "CASHFREE_VERIFY_FAILED",
                message: err instanceof Error ? err.message : "Payment verification failed",
              },
            });
          }
        }

        if (body.sevaBookingId) {
          const sevaBooking = await sevaBookingRepo.findOne({ where: { id: body.sevaBookingId } });
          if (!sevaBooking) {
            return reply.code(404).send({ error: { code: "NOT_FOUND", message: "Seva booking not found" } });
          }
          if (sevaBooking.customerUserId !== userId) {
            return reply.code(403).send({ error: { code: "FORBIDDEN", message: "Not your Seva booking" } });
          }

          const orderId =
            body.orderId ?? sevaBooking.paymentProviderOrderId ?? toCashfreeSevaBookingId(sevaBooking.id);

          try {
            const order = await getCashfreeOrder(orderId);
            if (!isCashfreePaid(order.order_status)) {
              return reply.code(402).send({
                error: {
                  code: "PAYMENT_PENDING",
                  message: `Cashfree order status is ${order.order_status ?? "UNKNOWN"}. Complete payment first.`,
                },
                orderStatus: order.order_status,
                orderId,
              });
            }

            sevaBooking.paymentProviderOrderId = order.order_id ?? orderId;
            await sevaBookingRepo.save(sevaBooking);

            try {
              await confirmSevaPayment(
                sevaBooking.id,
                sevaBooking.customerUserId,
                order.order_id ?? orderId,
                "cashfree_verify",
              );
            } catch (err) {
              return reply.code(502).send({
                error: {
                  code: "SEVA_CONFIRM_FAILED",
                  message: err instanceof Error ? err.message : "Failed to confirm Seva payment",
                },
              });
            }

            const fresh = await sevaBookingRepo.findOne({ where: { id: sevaBooking.id } });
            const credited = await creditPlatformFromSevaBooking(
              fresh ?? sevaBooking,
              walletRepo,
              txnRepo,
              "Customer Seva payment collected via Cashfree to platform wallet",
            );

            return {
              ok: true,
              sevaBookingId: sevaBooking.id,
              orderId: order.order_id ?? orderId,
              orderStatus: order.order_status,
              provider: "cashfree",
              platformBalanceInPaise: credited.platformBalanceInPaise,
              amountInPaise: credited.amountInPaise,
            };
          } catch (err) {
            return reply.code(502).send({
              error: {
                code: "CASHFREE_VERIFY_FAILED",
                message: err instanceof Error ? err.message : "Payment verification failed",
              },
            });
          }
        }

        if (body.communityDueId) {
          const due = await communityDueRepo.findOne({ where: { id: body.communityDueId } });
          if (!due) {
            return reply.code(404).send({ error: { code: "NOT_FOUND", message: "Community due not found" } });
          }
          if (due.residentUserId !== userId) {
            return reply.code(403).send({ error: { code: "FORBIDDEN", message: "Not your maintenance due" } });
          }

          const orderId =
            body.orderId ?? due.paymentProviderOrderId ?? toCashfreeCommunityDueId(due.id);

          try {
            const order = await getCashfreeOrder(orderId);
            if (!isCashfreePaid(order.order_status)) {
              return reply.code(402).send({
                error: {
                  code: "PAYMENT_PENDING",
                  message: `Cashfree order status is ${order.order_status ?? "UNKNOWN"}. Complete payment first.`,
                },
                orderStatus: order.order_status,
                orderId,
              });
            }

            due.paymentProviderOrderId = order.order_id ?? orderId;
            due.paymentProvider = "cashfree";
            await communityDueRepo.save(due);

            try {
              await confirmCommunityDuePayment(
                due.id,
                due.residentUserId,
                order.order_id ?? orderId,
                "cashfree_verify",
              );
            } catch (err) {
              return reply.code(502).send({
                error: {
                  code: "COMMUNITY_CONFIRM_FAILED",
                  message: err instanceof Error ? err.message : "Failed to confirm community payment",
                },
              });
            }

            return {
              ok: true,
              communityDueId: due.id,
              orderId: order.order_id ?? orderId,
              orderStatus: order.order_status,
              provider: "cashfree",
              amountInPaise: due.amountInPaise,
            };
          } catch (err) {
            return reply.code(502).send({
              error: {
                code: "CASHFREE_VERIFY_FAILED",
                message: err instanceof Error ? err.message : "Payment verification failed",
              },
            });
          }
        }

        const booking = await bookingRepo.findOne({ where: { id: body.bookingId! } });
        if (!booking) {
          return reply.code(404).send({ error: { code: "NOT_FOUND", message: "Booking not found" } });
        }
        if (booking.renterUserId !== userId) {
          return reply.code(403).send({ error: { code: "FORBIDDEN", message: "Not your booking" } });
        }

        const orderId = body.orderId ?? booking.paymentProviderOrderId ?? toCashfreeOrderId(booking.id);

        try {
          const order = await getCashfreeOrder(orderId);
          if (!isCashfreePaid(order.order_status)) {
            return reply.code(402).send({
              error: {
                code: "PAYMENT_PENDING",
                message: `Cashfree order status is ${order.order_status ?? "UNKNOWN"}. Complete payment first.`,
              },
              orderStatus: order.order_status,
              orderId,
            });
          }

          booking.paymentProviderOrderId = order.order_id ?? orderId;
          const result = await creditPlatformFromBooking(
            booking,
            walletRepo,
            txnRepo,
            bookingRepo,
            `Cashfree payment verified (${orderId})`,
          );

          // Ensure parking sends owner/customer email + in-app notifications
          try {
            const parkingUrl = (process.env.PARKING_URL ?? "http://localhost:3004").replace(/\/$/, "");
            await fetch(`${parkingUrl}/v1/parking/bookings/${booking.id}/confirm-payment`, {
              method: "POST",
              headers: {
                "content-type": "application/json",
                "x-user-id": String(booking.renterUserId),
              },
              body: JSON.stringify({
                orderId: order.order_id ?? orderId,
                source: "cashfree_verify",
              }),
            });
          } catch (err) {
            app.log.error({ err }, "Failed to notify parking after payment verify");
          }

          return { ...result, orderId, orderStatus: order.order_status, provider: "cashfree" };
        } catch (err) {
          return reply.code(502).send({
            error: {
              code: "CASHFREE_VERIFY_FAILED",
              message: err instanceof Error ? err.message : "Payment verification failed",
            },
          });
        }
      });

      /**
       * Collect after gateway success.
       * With Cashfree configured, verifies order is PAID before crediting wallets.
       */
      app.post("/v1/payments/bookings/:bookingId/collect", async (request, reply) => {
        const bookingId = parseEntityId((request.params as { bookingId: string }).bookingId);
        const body = z
          .object({
            orderId: z.string().min(3).optional(),
          })
          .parse(request.body ?? {});

        const booking = await bookingRepo.findOne({ where: { id: bookingId } });
        if (!booking) {
          return reply.code(404).send({ error: { code: "NOT_FOUND", message: "Booking not found" } });
        }

        const cfg = cashfreeConfig();
        if (cfg.configured) {
          const orderId =
            body.orderId ?? booking.paymentProviderOrderId ?? toCashfreeOrderId(booking.id);
          try {
            const order = await getCashfreeOrder(orderId);
            if (!isCashfreePaid(order.order_status)) {
              return reply.code(402).send({
                error: {
                  code: "PAYMENT_PENDING",
                  message: `Cashfree order is ${order.order_status ?? "UNKNOWN"}`,
                },
              });
            }
            booking.paymentProviderOrderId = order.order_id ?? orderId;
          } catch (err) {
            return reply.code(502).send({
              error: {
                code: "CASHFREE_VERIFY_FAILED",
                message: err instanceof Error ? err.message : "Could not verify Cashfree payment",
              },
            });
          }
        }

        try {
          const result = await creditPlatformFromBooking(
            booking,
            walletRepo,
            txnRepo,
            bookingRepo,
            cfg.configured
              ? "Customer payment collected via Cashfree to platform wallet"
              : "Customer payment collected to platform wallet",
          );
          return result;
        } catch (err) {
          const statusCode = (err as { statusCode?: number }).statusCode ?? 500;
          return reply.code(statusCode).send({
            error: {
              code: "COLLECT_FAILED",
              message: err instanceof Error ? err.message : "Collect failed",
            },
          });
        }
      });

      app.post("/v1/payments/bookings/:bookingId/settle", async (request, reply) => {
        const bookingId = parseEntityId((request.params as { bookingId: string }).bookingId);
        const booking = await bookingRepo.findOne({ where: { id: bookingId } });
        if (!booking) {
          return reply.code(404).send({ error: { code: "NOT_FOUND", message: "Booking not found" } });
        }
        if (!booking.ownerUserId) {
          return reply.code(400).send({ error: { code: "NO_OWNER", message: "Booking has no owner" } });
        }
        if (booking.status !== BookingStatus.COMPLETED) {
          return reply.code(400).send({
            error: { code: "NOT_COMPLETED", message: "Settle only after check-out/completed" },
          });
        }
        if (booking.paymentStatus !== "paid") {
          return reply.code(400).send({
            error: { code: "NOT_PAID", message: "Cannot settle an unpaid booking" },
          });
        }

        const alreadySettled = await txnRepo.findOne({
          where: { referenceId: booking.id, purpose: "settlement", type: WalletTxnType.CREDIT },
        });
        if (alreadySettled) {
          const ownerWallet = await getOrCreateWallet(walletRepo, booking.ownerUserId, "owner");
          const platformWallet = await getPlatformWallet(walletRepo);
          return {
            ok: true,
            alreadySettled: true,
            ownerShareInPaise: Number(alreadySettled.amountInPaise),
            platformFeeInPaise: booking.platformFeeInPaise || 0,
            ownerBalanceInPaise: Number(ownerWallet.balanceInPaise),
            platformBalanceInPaise: Number(platformWallet.balanceInPaise),
          };
        }

        const { platformFee, ownerShare } = ownerShareFromBooking(booking);

        const platformWallet = await getPlatformWallet(walletRepo);
        const ownerWallet = await getOrCreateWallet(walletRepo, booking.ownerUserId, "owner");

        const platformBal = Number(platformWallet.balanceInPaise) - ownerShare;
        if (platformBal < 0) {
          return reply.code(409).send({
            error: {
              code: "INSUFFICIENT_PLATFORM_BALANCE",
              message: "Platform wallet does not hold enough to settle this booking",
            },
          });
        }

        platformWallet.balanceInPaise = String(platformBal);
        await walletRepo.save(platformWallet);
        await txnRepo.save(
          txnRepo.create({
            walletId: platformWallet.id,
            type: WalletTxnType.DEBIT,
            amountInPaise: String(ownerShare),
            balanceAfterInPaise: String(platformBal),
            purpose: "settlement",
            referenceId: booking.id,
            notes: "Release owner share from platform escrow after check-out",
          }),
        );

        const ownerBal = Number(ownerWallet.balanceInPaise) + ownerShare;
        ownerWallet.balanceInPaise = String(ownerBal);
        await walletRepo.save(ownerWallet);
        await txnRepo.save(
          txnRepo.create({
            walletId: ownerWallet.id,
            type: WalletTxnType.CREDIT,
            amountInPaise: String(ownerShare),
            balanceAfterInPaise: String(ownerBal),
            purpose: "settlement",
            referenceId: booking.id,
            notes: `Owner credit after check-out (platform fee retained ${platformFee} paise)`,
          }),
        );

        return {
          ok: true,
          ownerShareInPaise: ownerShare,
          platformFeeInPaise: platformFee,
          ownerBalanceInPaise: ownerBal,
          platformBalanceInPaise: platformBal,
        };
      });

      app.post("/v1/payments/tanker-orders/:tankerOrderId/collect", async (request, reply) => {
        const tankerOrderId = parseEntityId(
          (request.params as { tankerOrderId: string }).tankerOrderId,
        );
        const order = await tankerOrderRepo.findOne({ where: { id: tankerOrderId } });
        if (!order) {
          return reply.code(404).send({
            error: { code: "NOT_FOUND", message: "Tanker order not found" },
          });
        }
        if (order.paymentStatus !== PaymentStatus.PAID) {
          return reply.code(400).send({
            error: {
              code: "NOT_PAID",
              message: "Confirm tanker payment before collecting into platform wallet",
            },
          });
        }

        try {
          const result = await creditPlatformFromTankerOrder(
            order,
            walletRepo,
            txnRepo,
            "Customer tanker payment collected to platform wallet",
          );
          return result;
        } catch (err) {
          const statusCode = (err as { statusCode?: number }).statusCode ?? 500;
          return reply.code(statusCode).send({
            error: {
              code: "COLLECT_FAILED",
              message: err instanceof Error ? err.message : "Collect failed",
            },
          });
        }
      });

      app.post("/v1/payments/tanker-orders/:tankerOrderId/settle", async (request, reply) => {
        const tankerOrderId = parseEntityId(
          (request.params as { tankerOrderId: string }).tankerOrderId,
        );
        const order = await tankerOrderRepo.findOne({ where: { id: tankerOrderId } });
        if (!order) {
          return reply.code(404).send({
            error: { code: "NOT_FOUND", message: "Tanker order not found" },
          });
        }
        if (order.status !== TankerOrderStatus.DELIVERED) {
          return reply.code(400).send({
            error: {
              code: "NOT_DELIVERED",
              message: "Settle only after delivery is completed",
            },
          });
        }
        if (order.paymentStatus !== PaymentStatus.PAID) {
          return reply.code(400).send({
            error: { code: "NOT_PAID", message: "Cannot settle an unpaid tanker order" },
          });
        }

        const supplier = await tankerSupplierRepo.findOne({ where: { id: order.supplierId } });
        if (!supplier?.userId) {
          return reply.code(400).send({
            error: { code: "NO_SUPPLIER", message: "Tanker order has no supplier user" },
          });
        }

        try {
          const result = await settleTankerOrderToSupplier(
            order,
            supplier.userId,
            walletRepo,
            txnRepo,
          );
          return result;
        } catch (err) {
          const statusCode = (err as { statusCode?: number }).statusCode ?? 500;
          return reply.code(statusCode).send({
            error: {
              code: (err as { code?: string }).code ?? "SETTLE_FAILED",
              message: err instanceof Error ? err.message : "Settlement failed",
            },
          });
        }
      });

      app.post("/v1/payments/seva-bookings/:sevaBookingId/collect", async (request, reply) => {
        const sevaBookingId = parseEntityId(
          (request.params as { sevaBookingId: string }).sevaBookingId,
        );
        const booking = await sevaBookingRepo.findOne({ where: { id: sevaBookingId } });
        if (!booking) {
          return reply.code(404).send({
            error: { code: "NOT_FOUND", message: "Seva booking not found" },
          });
        }
        if (booking.paymentStatus !== PaymentStatus.PAID) {
          return reply.code(400).send({
            error: {
              code: "NOT_PAID",
              message: "Confirm Seva payment before collecting into platform wallet",
            },
          });
        }

        try {
          const result = await creditPlatformFromSevaBooking(
            booking,
            walletRepo,
            txnRepo,
            "Customer Seva payment collected to platform wallet",
          );
          return result;
        } catch (err) {
          const statusCode = (err as { statusCode?: number }).statusCode ?? 500;
          return reply.code(statusCode).send({
            error: {
              code: "COLLECT_FAILED",
              message: err instanceof Error ? err.message : "Collect failed",
            },
          });
        }
      });

      app.post("/v1/payments/seva-bookings/:sevaBookingId/settle", async (request, reply) => {
        const sevaBookingId = parseEntityId(
          (request.params as { sevaBookingId: string }).sevaBookingId,
        );
        const booking = await sevaBookingRepo.findOne({ where: { id: sevaBookingId } });
        if (!booking) {
          return reply.code(404).send({
            error: { code: "NOT_FOUND", message: "Seva booking not found" },
          });
        }
        if (booking.status !== SevaBookingStatus.COMPLETED) {
          return reply.code(400).send({
            error: {
              code: "NOT_COMPLETED",
              message: "Settle only after the job is completed",
            },
          });
        }
        if (booking.paymentStatus !== PaymentStatus.PAID) {
          return reply.code(400).send({
            error: { code: "NOT_PAID", message: "Cannot settle an unpaid Seva booking" },
          });
        }

        const provider = await sevaProviderRepo.findOne({ where: { id: booking.providerId } });
        if (!provider?.userId) {
          return reply.code(400).send({
            error: { code: "NO_PROVIDER", message: "Seva booking has no provider user" },
          });
        }

        try {
          const result = await settleSevaBookingToProvider(
            booking,
            provider.userId,
            walletRepo,
            txnRepo,
          );
          return result;
        } catch (err) {
          const statusCode = (err as { statusCode?: number }).statusCode ?? 500;
          return reply.code(statusCode).send({
            error: {
              code: (err as { code?: string }).code ?? "SETTLE_FAILED",
              message: err instanceof Error ? err.message : "Settlement failed",
            },
          });
        }
      });

      app.post("/v1/payments/webhooks/cashfree", async (request, reply) => {
        const rawBody = JSON.stringify(request.body ?? {});
        const timestamp = String(request.headers["x-webhook-timestamp"] ?? "");
        const signature = String(request.headers["x-webhook-signature"] ?? "");
        if (!verifyCashfreeWebhookSignature(rawBody, timestamp, signature)) {
          return reply.code(401).send({ error: { code: "INVALID_SIGNATURE", message: "Invalid webhook signature" } });
        }

        const payload = request.body as {
          type?: string;
          data?: {
            order?: { order_id?: string; order_status?: string };
            payment?: { payment_status?: string };
          };
        };

        const orderId = payload?.data?.order?.order_id;
        const orderStatus = payload?.data?.order?.order_status;
        const paymentStatus = payload?.data?.payment?.payment_status;
        app.log.info({ type: payload?.type, orderId, orderStatus, paymentStatus }, "Cashfree webhook");

        if (!orderId) return { received: true };

        const bookingId = bookingIdFromCashfreeOrderId(orderId);
        const booking = bookingId
          ? await bookingRepo.findOne({ where: { id: bookingId } })
          : await bookingRepo.findOne({ where: { paymentProviderOrderId: orderId } });

        if (booking) {
          const paid =
            isCashfreePaid(orderStatus) ||
            (paymentStatus ?? "").toUpperCase() === "SUCCESS" ||
            payload?.type === "PAYMENT_SUCCESS_WEBHOOK";

          if (paid && booking.paymentStatus !== "paid") {
            booking.paymentProviderOrderId = orderId;
            booking.paymentProvider = "cashfree";
            await bookingRepo.save(booking);
            try {
              const parkingUrl = (process.env.PARKING_URL ?? "http://localhost:3004").replace(/\/$/, "");
              await fetch(`${parkingUrl}/v1/parking/bookings/${booking.id}/confirm-payment`, {
                method: "POST",
                headers: {
                  "content-type": "application/json",
                  "x-user-id": String(booking.renterUserId),
                },
                body: JSON.stringify({ orderId, source: "cashfree_webhook" }),
              });
            } catch (err) {
              app.log.error({ err }, "Failed to confirm parking after Cashfree webhook");
            }
          }

          return { received: true, matched: true, bookingId: booking.id };
        }

        const tankerOrderId = tankerOrderIdFromCashfreeOrderId(orderId);
        const tankerOrder = tankerOrderId
          ? await tankerOrderRepo.findOne({ where: { id: tankerOrderId } })
          : await tankerOrderRepo.findOne({ where: { paymentProviderOrderId: orderId } });

        if (tankerOrder) {
          const paid =
            isCashfreePaid(orderStatus) ||
            (paymentStatus ?? "").toUpperCase() === "SUCCESS" ||
            payload?.type === "PAYMENT_SUCCESS_WEBHOOK";

          if (paid && tankerOrder.paymentStatus !== "paid") {
            tankerOrder.paymentProviderOrderId = orderId;
            tankerOrder.paymentProvider = "cashfree";
            await tankerOrderRepo.save(tankerOrder);
            try {
              await confirmTankerPayment(
                tankerOrder.id,
                tankerOrder.customerUserId,
                orderId,
                "cashfree_webhook",
              );
            } catch (err) {
              app.log.error({ err }, "Failed to confirm tanker after Cashfree webhook");
            }
          }

          if (paid) {
            const fresh = await tankerOrderRepo.findOne({ where: { id: tankerOrder.id } });
            if (fresh && fresh.paymentStatus === PaymentStatus.PAID) {
              try {
                await creditPlatformFromTankerOrder(
                  fresh,
                  walletRepo,
                  txnRepo,
                  "Customer tanker payment collected via Cashfree webhook to platform wallet",
                );
              } catch (err) {
                app.log.error({ err }, "Failed to credit platform wallet for tanker order");
              }
            }
          }

          return { received: true, matched: true, tankerOrderId: tankerOrder.id };
        }

        const sevaBookingId = sevaBookingIdFromCashfreeOrderId(orderId);
        const sevaBooking = sevaBookingId
          ? await sevaBookingRepo.findOne({ where: { id: sevaBookingId } })
          : await sevaBookingRepo.findOne({ where: { paymentProviderOrderId: orderId } });

        if (!sevaBooking) {
          const communityDueId = communityDueIdFromCashfreeOrderId(orderId);
          const communityDue = communityDueId
            ? await communityDueRepo.findOne({ where: { id: communityDueId } })
            : await communityDueRepo.findOne({ where: { paymentProviderOrderId: orderId } });

          if (!communityDue) return { received: true, matched: false };

          const communityPaid =
            isCashfreePaid(orderStatus) ||
            (paymentStatus ?? "").toUpperCase() === "SUCCESS" ||
            payload?.type === "PAYMENT_SUCCESS_WEBHOOK";

          if (communityPaid && communityDue.paymentStatus !== "paid") {
            communityDue.paymentProviderOrderId = orderId;
            communityDue.paymentProvider = "cashfree";
            await communityDueRepo.save(communityDue);
            try {
              await confirmCommunityDuePayment(
                communityDue.id,
                communityDue.residentUserId,
                orderId,
                "cashfree_webhook",
              );
            } catch (err) {
              app.log.error({ err }, "Failed to confirm community due after Cashfree webhook");
            }
          }

          return { received: true, matched: true, communityDueId: communityDue.id };
        }

        const sevaPaid =
          isCashfreePaid(orderStatus) ||
          (paymentStatus ?? "").toUpperCase() === "SUCCESS" ||
          payload?.type === "PAYMENT_SUCCESS_WEBHOOK";

        if (sevaPaid && sevaBooking.paymentStatus !== "paid") {
          sevaBooking.paymentProviderOrderId = orderId;
          sevaBooking.paymentProvider = "cashfree";
          await sevaBookingRepo.save(sevaBooking);
          try {
            await confirmSevaPayment(
              sevaBooking.id,
              sevaBooking.customerUserId,
              orderId,
              "cashfree_webhook",
            );
          } catch (err) {
            app.log.error({ err }, "Failed to confirm Seva after Cashfree webhook");
          }
        }

        if (sevaPaid) {
          const fresh = await sevaBookingRepo.findOne({ where: { id: sevaBooking.id } });
          if (fresh && fresh.paymentStatus === PaymentStatus.PAID) {
            try {
              await creditPlatformFromSevaBooking(
                fresh,
                walletRepo,
                txnRepo,
                "Customer Seva payment collected via Cashfree webhook to platform wallet",
              );
            } catch (err) {
              app.log.error({ err }, "Failed to credit platform wallet for Seva booking");
            }
          }
        }

        return { received: true, matched: true, sevaBookingId: sevaBooking.id };
      });
    },
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
