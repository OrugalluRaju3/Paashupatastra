import "reflect-metadata";
import {
  BankAccountEntity,
  CommissionConfigEntity,
  ParkingBookingEntity,
  UserEntity,
  WalletEntity,
  WalletTransactionEntity,
  getDataSource,
  toIsoRequired,
} from "@paashupatastra/database";
import {
  createService,
  envInt,
  getRolesFromHeaders,
  getUserIdFromHeaders,
  loadEnv,
} from "@paashupatastra/service-kit";
import {
  BookingStatus,
  UserRole,
  WalletTxnType,
  paginationQuerySchema,
  withdrawWalletSchema,
} from "@paashupatastra/shared-models";
import { Repository } from "typeorm";
import { z } from "zod";
import {
  appPublicUrl,
  bookingIdFromCashfreeOrderId,
  cashfreeConfig,
  createCashfreeOrder,
  gatewayPublicUrl,
  getCashfreeOrder,
  isCashfreePaid,
  toCashfreeOrderId,
  verifyCashfreeWebhookSignature,
} from "./cashfree";

const PLATFORM_USER_ID = "00000000-0000-4000-8000-000000000001";

async function getOrCreateWallet(repo: Repository<WalletEntity>, userId: string, type: string) {
  let wallet = await repo.findOne({ where: { userId } });
  if (!wallet) {
    wallet = await repo.save(
      repo.create({
        userId,
        type,
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
  if (roles.includes(UserRole.PARKING_OWNER)) return "owner";
  return "customer";
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
    const platformWallet = await getOrCreateWallet(walletRepo, PLATFORM_USER_ID, "platform");
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
  const platformWallet = await getOrCreateWallet(walletRepo, PLATFORM_USER_ID, "platform");
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
      notes: "Paid for parking booking via Cashfree (held in platform wallet)",
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

async function main() {
  loadEnv();
  const ds = await getDataSource();
  const walletRepo = ds.getRepository(WalletEntity);
  const txnRepo = ds.getRepository(WalletTransactionEntity);
  const commissionRepo = ds.getRepository(CommissionConfigEntity);
  const bookingRepo = ds.getRepository(ParkingBookingEntity);
  const userRepo = ds.getRepository(UserEntity);
  const bankRepo = ds.getRepository(BankAccountEntity);

  await getOrCreateWallet(walletRepo, PLATFORM_USER_ID, "platform");

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
        const userId = getUserIdFromHeaders(headers);
        if (!userId) {
          return reply.code(401).send({ error: { code: "UNAUTHORIZED", message: "Unauthorized" } });
        }
        const wallet = await getOrCreateWallet(walletRepo, userId, walletTypeForUser(headers));
        return {
          id: wallet.id,
          userId: wallet.userId,
          type: wallet.type,
          balanceInPaise: Number(wallet.balanceInPaise),
          currency: wallet.currency,
          updatedAt: toIsoRequired(wallet.updatedAt),
        };
      });

      app.get("/v1/payments/wallets/me/transactions", async (request, reply) => {
        const headers = request.headers as Record<string, unknown>;
        const userId = getUserIdFromHeaders(headers);
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
        const userId = getUserIdFromHeaders(headers);
        if (!userId) {
          return reply.code(401).send({ error: { code: "UNAUTHORIZED", message: "Unauthorized" } });
        }
        const roles = getRolesFromHeaders(headers);
        if (!roles.includes(UserRole.PARKING_OWNER)) {
          return reply.code(403).send({
            error: { code: "FORBIDDEN", message: "Only parking owners can withdraw to bank" },
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
        const user = await userRepo.findOne({ where: { id: userId } });
        const title = "Wallet withdrawal initiated";
        const notifyBody = [
          `Hello ${user?.name ?? "Owner"},`,
          "",
          `Your withdrawal of ₹${(amount / 100).toFixed(2)} has been initiated.`,
          `Bank: ${bank.bankName}`,
          `Account: ${masked}`,
          `IFSC: ${bank.ifscCode}`,
          `Remaining wallet balance: ₹${(newBalance / 100).toFixed(2)}`,
          "",
          "Funds are typically credited within 1–2 business days (sandbox: simulated instantly).",
        ].join("\n");
        void fetch(`${notificationsUrl}/v1/notifications/send`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            userId,
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
        const wallet = await getOrCreateWallet(walletRepo, PLATFORM_USER_ID, "platform");
        return {
          id: wallet.id,
          userId: wallet.userId,
          type: wallet.type,
          balanceInPaise: Number(wallet.balanceInPaise),
          currency: wallet.currency,
        };
      });

      app.get("/v1/payments/wallets/:userId/transactions", async (request) => {
        const { userId } = request.params as { userId: string };
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

      /** Create Cashfree sandbox/production order for a booking */
      app.post("/v1/payments/orders", async (request, reply) => {
        const headers = request.headers as Record<string, unknown>;
        const userId = getUserIdFromHeaders(headers);
        if (!userId) {
          return reply.code(401).send({ error: { code: "UNAUTHORIZED", message: "Unauthorized" } });
        }

        const body = z
          .object({
            bookingId: z.string().uuid(),
          })
          .parse(request.body);

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

        const booking = await bookingRepo.findOne({ where: { id: body.bookingId } });
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
              customerId: customer.id,
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

      /** Verify Cashfree payment and credit platform wallet */
      app.post("/v1/payments/orders/verify", async (request, reply) => {
        const headers = request.headers as Record<string, unknown>;
        const userId = getUserIdFromHeaders(headers);
        if (!userId) {
          return reply.code(401).send({ error: { code: "UNAUTHORIZED", message: "Unauthorized" } });
        }

        const body = z
          .object({
            bookingId: z.string().uuid(),
            orderId: z.string().min(3).optional(),
          })
          .parse(request.body);

        const booking = await bookingRepo.findOne({ where: { id: body.bookingId } });
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
        const { bookingId } = request.params as { bookingId: string };
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
        const { bookingId } = request.params as { bookingId: string };
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

        const alreadySettled = await txnRepo.findOne({
          where: { referenceId: booking.id, purpose: "settlement", type: WalletTxnType.CREDIT },
        });
        if (alreadySettled) {
          const ownerWallet = await getOrCreateWallet(walletRepo, booking.ownerUserId, "owner");
          const platformWallet = await getOrCreateWallet(walletRepo, PLATFORM_USER_ID, "platform");
          return {
            ok: true,
            alreadySettled: true,
            ownerShareInPaise: Number(alreadySettled.amountInPaise),
            platformFeeInPaise: booking.platformFeeInPaise || 0,
            ownerBalanceInPaise: Number(ownerWallet.balanceInPaise),
            platformBalanceInPaise: Number(platformWallet.balanceInPaise),
          };
        }

        const total = booking.totalAmountInPaise || booking.amountInPaise;
        const platformFee = booking.platformFeeInPaise || 0;
        const ownerShare = Math.max(0, total - platformFee - (booking.taxInPaise || 0));

        const platformWallet = await getOrCreateWallet(walletRepo, PLATFORM_USER_ID, "platform");
        const ownerWallet = await getOrCreateWallet(walletRepo, booking.ownerUserId, "owner");

        const platformBal = Number(platformWallet.balanceInPaise) - ownerShare;
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
            notes: "Owner settlement debit from platform wallet",
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
            notes: `Owner credit after commission ${platformFee} paise`,
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

        if (!booking) return { received: true, matched: false };

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
                "x-user-id": booking.renterUserId,
              },
              body: JSON.stringify({ orderId, source: "cashfree_webhook" }),
            });
          } catch (err) {
            app.log.error({ err }, "Failed to confirm parking after Cashfree webhook");
          }
        }

        return { received: true, matched: true, bookingId: booking.id };
      });
    },
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
