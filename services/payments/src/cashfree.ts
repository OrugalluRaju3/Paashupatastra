import { createHmac, timingSafeEqual } from "node:crypto";
import { envString } from "@paashupatastra/service-kit";

export type CashfreeEnv = "sandbox" | "production";

export function cashfreeConfig() {
  const env = (process.env.CASHFREE_ENV ?? "sandbox").toLowerCase() as CashfreeEnv;
  const appId = (process.env.CASHFREE_APP_ID ?? "").trim();
  const secretKey = (process.env.CASHFREE_SECRET_KEY ?? "").trim();
  const apiVersion = (process.env.CASHFREE_API_VERSION ?? "2023-08-01").trim();
  const baseUrl =
    env === "production" ? "https://api.cashfree.com/pg" : "https://sandbox.cashfree.com/pg";
  return { env, appId, secretKey, apiVersion, baseUrl, configured: Boolean(appId && secretKey) };
}

export function toCashfreeOrderId(bookingId: string | number) {
  return `bk${bookingId}`;
}

export function toCashfreeTankerOrderId(tankerOrderId: string | number) {
  return `tk${tankerOrderId}`;
}

export function toCashfreeSevaBookingId(sevaBookingId: string | number) {
  return `sv${sevaBookingId}`;
}

export function bookingIdFromCashfreeOrderId(orderId: string): number | null {
  if (!orderId.startsWith("bk")) return null;
  const n = Number.parseInt(orderId.slice(2), 10);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

export function tankerOrderIdFromCashfreeOrderId(orderId: string): number | null {
  if (!orderId.startsWith("tk")) return null;
  const n = Number.parseInt(orderId.slice(2), 10);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

export function sevaBookingIdFromCashfreeOrderId(orderId: string): number | null {
  if (!orderId.startsWith("sv")) return null;
  const n = Number.parseInt(orderId.slice(2), 10);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

export function toCashfreeCommunityDueId(communityDueId: string | number) {
  return `cm${communityDueId}`;
}

export function communityDueIdFromCashfreeOrderId(orderId: string): number | null {
  if (!orderId.startsWith("cm")) return null;
  const n = Number.parseInt(orderId.slice(2), 10);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

type CashfreeOrder = {
  cf_order_id?: string | number;
  order_id: string;
  order_status?: string;
  order_amount?: number;
  payment_session_id?: string;
  order_token?: string;
};

async function cashfreeFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const cfg = cashfreeConfig();
  if (!cfg.configured) {
    throw new Error("Cashfree is not configured. Set CASHFREE_APP_ID and CASHFREE_SECRET_KEY.");
  }
  const res = await fetch(`${cfg.baseUrl}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "x-api-version": cfg.apiVersion,
      "x-client-id": cfg.appId,
      "x-client-secret": cfg.secretKey,
      ...(init?.headers ?? {}),
    },
  });
  const data = (await res.json().catch(() => ({}))) as T & {
    message?: string;
    code?: string;
    error?: { message?: string };
  };
  if (!res.ok) {
    const message =
      data?.message ?? data?.error?.message ?? `Cashfree request failed (${res.status})`;
    throw new Error(message);
  }
  return data as T;
}

export async function createCashfreeOrder(input: {
  orderId: string;
  amountInr: number;
  customerId: string;
  customerPhone: string;
  customerEmail?: string | null;
  customerName?: string | null;
  returnUrl: string;
  notifyUrl?: string;
  orderNote?: string;
}) {
  return cashfreeFetch<CashfreeOrder>("/orders", {
    method: "POST",
    body: JSON.stringify({
      order_id: input.orderId,
      order_amount: Number(input.amountInr.toFixed(2)),
      order_currency: "INR",
      customer_details: {
        customer_id: String(input.customerId).replace(/-/g, "").slice(0, 50),
        customer_phone: input.customerPhone,
        customer_email: input.customerEmail || undefined,
        customer_name: input.customerName || undefined,
      },
      order_meta: {
        return_url: input.returnUrl,
        notify_url: input.notifyUrl,
      },
      order_note: input.orderNote ?? "Paashupatastra payment",
    }),
  });
}

export async function getCashfreeOrder(orderId: string) {
  return cashfreeFetch<CashfreeOrder>(`/orders/${encodeURIComponent(orderId)}`);
}

export function isCashfreePaid(status?: string) {
  return (status ?? "").toUpperCase() === "PAID";
}

/** Verify Cashfree webhook signature when CASHFREE_WEBHOOK_SECRET is set. */
export function verifyCashfreeWebhookSignature(
  rawBody: string,
  timestamp: string | undefined,
  signature: string | undefined,
): boolean {
  const secret = (process.env.CASHFREE_WEBHOOK_SECRET ?? "").trim();
  if (!secret) return true; // allow in local/test if secret not configured
  if (!timestamp || !signature) return false;
  const signedPayload = `${timestamp}${rawBody}`;
  const expected = createHmac("sha256", secret).update(signedPayload).digest("base64");
  try {
    const a = Buffer.from(expected);
    const b = Buffer.from(signature);
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export function appPublicUrl() {
  try {
    return envString("APP_PUBLIC_URL", "http://localhost:5173").replace(/\/$/, "");
  } catch {
    return "http://localhost:5173";
  }
}

export function gatewayPublicUrl() {
  return (process.env.GATEWAY_PUBLIC_URL ?? process.env.GATEWAY_URL ?? "http://localhost:3000").replace(
    /\/$/,
    "",
  );
}
