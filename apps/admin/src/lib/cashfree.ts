type CashfreeCheckoutResult = {
  error?: { message?: string };
  redirect?: boolean;
  paymentDetails?: unknown;
};

type CashfreeInstance = {
  checkout: (options: {
    paymentSessionId: string;
    redirectTarget?: "_self" | "_blank" | "_modal" | string;
  }) => Promise<CashfreeCheckoutResult>;
};

declare global {
  interface Window {
    Cashfree?: (opts: { mode: "sandbox" | "production" }) => CashfreeInstance;
  }
}

let sdkPromise: Promise<void> | null = null;

export function loadCashfreeSdk(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.Cashfree) return Promise.resolve();
  if (sdkPromise) return sdkPromise;
  sdkPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://sdk.cashfree.com/js/v3/cashfree.js";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Cashfree SDK"));
    document.head.appendChild(script);
  });
  return sdkPromise;
}

export async function openCashfreeCheckout(input: {
  paymentSessionId: string;
  mode?: "sandbox" | "production";
}): Promise<CashfreeCheckoutResult> {
  await loadCashfreeSdk();
  if (!window.Cashfree) throw new Error("Cashfree SDK unavailable");
  const cashfree = window.Cashfree({ mode: input.mode ?? "sandbox" });
  return cashfree.checkout({
    paymentSessionId: input.paymentSessionId,
    redirectTarget: "_modal",
  });
}
