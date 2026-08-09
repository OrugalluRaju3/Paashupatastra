import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, downloadAuthenticatedFile, formatInrFromPaise, openAuthenticatedHtml, qs } from "../api";
import { useAuth } from "../auth/AuthContext";
import { Modal } from "../components/Modal";
import { Pagination } from "../components/Pagination";
import { StatusBadge } from "../components/StatusBadge";
import { ThreadChatModal } from "../components/BookingChatModal";
import { useToast } from "../components/Toast";
import { openCashfreeCheckout } from "../lib/cashfree";
import { createTankerSocket } from "../lib/tankerSocket";
import { DEFAULT_TANKER_WATER_TYPE, TANKER_WATER_TYPE_OPTIONS } from "../lib/tankerWaterTypes";
import type { Paginated } from "../types";

export type TankerCustomerSection = "search" | "requests" | "orders" | "invoices";

type Supplier = {
  id: number | string;
  fullName: string;
  city: string;
  pinCode: string;
  isOnline: boolean;
  address: string;
  availabilityStartTime?: string;
  availabilityEndTime?: string;
};

type MatchingVehicle = {
  id: number | string;
  vehicleNumber: string;
  capacityLitres: number;
  amountInPaise: number;
  waterType: string;
  driverFullName: string;
  status: string;
};

type SearchHit = {
  supplier: Supplier;
  matchingVehicles: MatchingVehicle[];
  distanceKm: number | null;
};

type TankerRequest = {
  id: string;
  supplierId: string | null;
  waterType: string;
  quantityLitres: number;
  deliveryAddress: string;
  preferredDeliveryAt?: string | null;
  comments: string | null;
  status: string;
  createdAt: string;
};

type TankerOrder = {
  id: string;
  waterType: string;
  capacityLitres: number;
  vehicleNumber: string | null;
  driverName: string | null;
  driverMobile: string | null;
  amountInPaise: number;
  totalAmountInPaise?: number;
  platformFeeInPaise?: number;
  taxInPaise?: number;
  discountInPaise?: number;
  driverLatitude?: number | null;
  driverLongitude?: number | null;
  driverLocationUpdatedAt?: string | null;
  deliveryAddress: string;
  status: string;
  paymentStatus: string;
  paymentDueAt?: string | null;
  paymentSecondsRemaining?: number | null;
  deliveryOtp: string | null;
  createdAt: string;
};

type DriverLocation = {
  latitude: number | null;
  longitude: number | null;
  updatedAt: string | null;
};

type TankerInvoice = {
  id: string | number;
  invoiceNumber?: string;
  orderId: string | number;
  amountInPaise: number;
  status: string;
  createdAt: string;
};

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function todayLocalDate() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function defaultDeliveryTime() {
  const d = new Date();
  d.setHours(d.getHours() + 2, 0, 0, 0);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function isActiveOrder(status: string) {
  return !["delivered", "cancelled"].includes(status);
}

function formatCountdown(totalSeconds: number) {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function orderSecondsLeft(o: {
  paymentDueAt?: string | null;
  paymentSecondsRemaining?: number | null;
}, nowMs: number) {
  if (o.paymentDueAt != null) {
    return Math.max(0, Math.floor((new Date(o.paymentDueAt).getTime() - nowMs) / 1000));
  }
  return o.paymentSecondsRemaining ?? 0;
}

function payPromptStorageKey(orderId: string) {
  return `tanker_pay_prompt_dismissed_${orderId}`;
}

function toPreferredIso(date: string, time: string) {
  const local = new Date(`${date}T${time}:00`);
  if (Number.isNaN(local.getTime())) return null;
  return local.toISOString();
}

export function TankerCustomerPage({ section }: { section: TankerCustomerSection }) {
  const toast = useToast();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [search, setSearch] = useState<{
    waterType: string;
    quantityLitres: string;
    deliveryDate: string;
    deliveryTime: string;
    deliveryAddress: string;
    comments: string;
  }>({
    waterType: DEFAULT_TANKER_WATER_TYPE,
    quantityLitres: "5000",
    deliveryDate: todayLocalDate(),
    deliveryTime: defaultDeliveryTime(),
    deliveryAddress: "",
    comments: "",
  });
  const [results, setResults] = useState<SearchHit[]>([]);
  const [searchMessage, setSearchMessage] = useState("");
  const [geoHint, setGeoHint] = useState("");
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [searching, setSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [selectedSupplierId, setSelectedSupplierId] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [reqPage, setReqPage] = useState(1);
  const [ordPage, setOrdPage] = useState(1);
  const [invPage, setInvPage] = useState(1);
  const [requests, setRequests] = useState<Paginated<TankerRequest> | null>(null);
  const [orders, setOrders] = useState<Paginated<TankerOrder> | null>(null);
  const [invoices, setInvoices] = useState<Paginated<TankerInvoice> | null>(null);
  const [payingId, setPayingId] = useState<string | null>(null);
  const [downloadingInvoiceId, setDownloadingInvoiceId] = useState<string | null>(null);
  const [trackingOrderId, setTrackingOrderId] = useState<string | null>(null);
  const [chatOrder, setChatOrder] = useState<TankerOrder | null>(null);
  const [driverLocation, setDriverLocation] = useState<DriverLocation | null>(null);
  const [nowTick, setNowTick] = useState(() => Date.now());
  const [payPromptOrderId, setPayPromptOrderId] = useState<string | null>(null);
  const socketRef = useRef<ReturnType<typeof createTankerSocket> | null>(null);

  const selectedHit = useMemo(
    () => results.find((r) => String(r.supplier.id) === selectedSupplierId) ?? null,
    [results, selectedSupplierId],
  );

  const loadRequests = useCallback(async () => {
    if (!user?.id) return;
    try {
      const reqs = await api.get<Paginated<TankerRequest>>(
        `/tanker/requests${qs({ page: reqPage, limit: 10, customerUserId: user.id })}`,
      );
      setRequests(reqs);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load requests");
    }
  }, [reqPage, toast, user?.id]);

  const loadOrders = useCallback(async () => {
    if (!user?.id) return;
    try {
      const ords = await api.get<Paginated<TankerOrder>>(
        `/tanker/orders${qs({ page: ordPage, limit: 10, customerUserId: user.id })}`,
      );
      setOrders(ords);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load orders");
    }
  }, [ordPage, toast, user?.id]);

  const loadInvoices = useCallback(async () => {
    if (!user?.id) return;
    try {
      const list = await api.get<Paginated<TankerInvoice>>(
        `/tanker/invoices${qs({ page: invPage, limit: 10, customerUserId: user.id })}`,
      );
      setInvoices(list);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load invoices");
    }
  }, [invPage, toast, user?.id]);

  const refreshPayPrompt = useCallback(async () => {
    if (!user?.id) return;
    try {
      const ords = await api.get<Paginated<TankerOrder>>(
        `/tanker/orders${qs({ page: 1, limit: 10, customerUserId: user.id })}`,
      );
      if (ordPage === 1) setOrders(ords);
      const unpaid = ords.items
        .filter((o) => o.paymentStatus !== "paid" && isActiveOrder(o.status))
        .filter((o) => orderSecondsLeft(o, Date.now()) > 0)
        .find((o) => sessionStorage.getItem(payPromptStorageKey(o.id)) !== "1");
      if (unpaid) {
        setPayPromptOrderId((cur) => cur ?? unpaid.id);
        // Keep prompt order visible even if list is on another page.
        setOrders((prev) => {
          if (!prev) return ords;
          if (prev.items.some((o) => o.id === unpaid.id)) return prev;
          return { ...prev, items: [unpaid, ...prev.items.filter((o) => o.id !== unpaid.id)] };
        });
      }
    } catch {
      /* ignore background poll errors */
    }
  }, [ordPage, user?.id]);

  useEffect(() => {
    if (section === "requests") void loadRequests();
  }, [section, loadRequests]);

  useEffect(() => {
    if (section === "orders") void loadOrders();
  }, [section, loadOrders]);

  useEffect(() => {
    if (section === "invoices") void loadInvoices();
  }, [section, loadInvoices]);

  useEffect(() => {
    if (!user?.id) return;
    void refreshPayPrompt();
    const poll = window.setInterval(() => void refreshPayPrompt(), 12_000);
    return () => window.clearInterval(poll);
  }, [user?.id, refreshPayPrompt]);

  useEffect(() => {
    const unpaid = (orders?.items ?? [])
      .filter((o) => o.paymentStatus !== "paid" && isActiveOrder(o.status))
      .filter((o) => orderSecondsLeft(o, nowTick) > 0)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const next = unpaid.find((o) => sessionStorage.getItem(payPromptStorageKey(o.id)) !== "1");
    if (next) {
      setPayPromptOrderId((cur) => cur ?? next.id);
      return;
    }
    if (payPromptOrderId) {
      const stillOpen = unpaid.some((o) => o.id === payPromptOrderId);
      if (!stillOpen) setPayPromptOrderId(null);
    }
  }, [orders?.items, nowTick, payPromptOrderId]);

  useEffect(() => {
    const hasPendingPay = (orders?.items ?? []).some(
      (o) => o.paymentStatus !== "paid" && isActiveOrder(o.status),
    );
    if (!hasPendingPay && !payPromptOrderId) return;
    const tick = window.setInterval(() => setNowTick(Date.now()), 1000);
    return () => window.clearInterval(tick);
  }, [orders?.items, payPromptOrderId]);

  useEffect(() => {
    if (section !== "search") return;
    if (!navigator.geolocation) {
      setGeoHint("Location unavailable — search still works without distance sorting.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setGeoHint("Using your current location to sort nearby matches.");
      },
      () => {
        setGeoHint("Location permission denied — showing all matching suppliers.");
      },
      { timeout: 8000 },
    );
  }, [section]);

  useEffect(() => {
    if (!trackingOrderId) return;
    const socket = createTankerSocket();
    socketRef.current = socket;
    socket.connect();
    socket.emit("trackDriver", { orderId: String(trackingOrderId) });
    socket.on(
      "driverLocation",
      (data: { orderId?: string; latitude?: number; longitude?: number; updatedAt?: string }) => {
        if (data.orderId != null && String(data.orderId) !== String(trackingOrderId)) return;
        setDriverLocation({
          latitude: data.latitude ?? null,
          longitude: data.longitude ?? null,
          updatedAt: data.updatedAt ?? null,
        });
      },
    );
    const pollLocation = async () => {
      try {
        const loc = await api.get<DriverLocation & { orderId: string }>(
          `/tanker/orders/${trackingOrderId}/location`,
        );
        setDriverLocation({
          latitude: loc.latitude,
          longitude: loc.longitude,
          updatedAt: loc.updatedAt,
        });
      } catch {
        /* ignore transient poll errors */
      }
    };
    void pollLocation();
    const interval = setInterval(() => void pollLocation(), 3000);
    return () => {
      socket.emit("stopTracking", { orderId: String(trackingOrderId) });
      socket.disconnect();
      socketRef.current = null;
      clearInterval(interval);
    };
  }, [trackingOrderId]);

  async function runSearch(e?: FormEvent) {
    e?.preventDefault();
    const quantityLitres = Number.parseInt(search.quantityLitres, 10);
    if (!Number.isFinite(quantityLitres) || quantityLitres < 100) {
      toast.error("Enter a valid quantity (minimum 100 litres)");
      return;
    }
    setSearching(true);
    setHasSearched(true);
    setSelectedSupplierId("");
    try {
      const res = await api.get<{
        items: SearchHit[];
        message?: string;
      }>(
        `/tanker/suppliers/search${qs({
          waterType: search.waterType,
          quantityLitres,
          deliveryDate: search.deliveryDate,
          deliveryTime: search.deliveryTime,
          lat: coords?.lat,
          lng: coords?.lng,
          radiusKm: 25,
        })}`,
      );
      setResults(res.items ?? []);
      setSearchMessage(res.message ?? "");
      if ((res.items ?? []).length === 1) {
        setSelectedSupplierId(String(res.items[0].supplier.id));
      }
      if ((res.items ?? []).length === 0) {
        toast.error(res.message ?? "No matching tankers found");
      }
    } catch (err) {
      setResults([]);
      toast.error(err instanceof Error ? err.message : "Search failed");
    } finally {
      setSearching(false);
    }
  }

  async function onRequest(e: FormEvent) {
    e.preventDefault();
    if (!search.deliveryAddress.trim()) {
      toast.error("Enter a delivery address");
      return;
    }
    if (!selectedSupplierId) {
      toast.error("Select a matching tanker/supplier from the results");
      return;
    }
    const quantityLitres = Number.parseInt(search.quantityLitres, 10);
    const preferredDeliveryAt = toPreferredIso(search.deliveryDate, search.deliveryTime);
    setSubmitting(true);
    try {
      await api.post("/tanker/requests", {
        supplierId: Number(selectedSupplierId),
        waterType: search.waterType,
        quantityLitres,
        deliveryAddress: search.deliveryAddress.trim(),
        comments: search.comments.trim() || null,
        preferredDeliveryAt,
        latitude: coords?.lat ?? null,
        longitude: coords?.lng ?? null,
      });
      toast.success("Request sent to the selected supplier");
      setSearch((s) => ({ ...s, comments: "" }));
      setSelectedSupplierId("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create request");
    } finally {
      setSubmitting(false);
    }
  }

  function stopTracking() {
    setTrackingOrderId(null);
    setDriverLocation(null);
  }

  async function payOrder(id: string) {
    const current = orders?.items.find((o) => o.id === id);
    const secondsLeft = current ? orderSecondsLeft(current, nowTick) : null;
    if (secondsLeft != null && secondsLeft <= 0) {
      toast.error("Payment window expired. Please search for a tanker again.");
      setPayPromptOrderId(null);
      await loadOrders();
      return;
    }
    setPayingId(id);
    try {
      const order = await api.post<{
        orderId: string;
        paymentSessionId: string;
        env: "sandbox" | "production";
      }>("/payments/orders", { tankerOrderId: id });
      if (!order.paymentSessionId) {
        throw new Error("Cashfree did not return a payment session");
      }
      const checkout = await openCashfreeCheckout({
        paymentSessionId: order.paymentSessionId,
        mode: order.env === "production" ? "production" : "sandbox",
      });
      if (checkout.error) {
        throw new Error(checkout.error.message || "Cashfree checkout cancelled");
      }
      await api.post("/payments/orders/verify", { tankerOrderId: id, orderId: order.orderId });
      await api.post(`/tanker/orders/${id}/confirm-payment`, { orderId: order.orderId });
      toast.success("Payment successful");
      sessionStorage.setItem(payPromptStorageKey(id), "1");
      setPayPromptOrderId(null);
      await loadOrders();
      if (section !== "orders") navigate("/app/tanker/orders");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Payment failed");
    } finally {
      setPayingId(null);
    }
  }

  function dismissPayPrompt() {
    if (payPromptOrderId) {
      sessionStorage.setItem(payPromptStorageKey(payPromptOrderId), "1");
    }
    setPayPromptOrderId(null);
  }

  const payPromptOrder = useMemo(
    () => (orders?.items ?? []).find((o) => o.id === payPromptOrderId) ?? null,
    [orders?.items, payPromptOrderId],
  );

  const payPromptSeconds = payPromptOrder ? orderSecondsLeft(payPromptOrder, nowTick) : 0;

  const payPromptModal =
    payPromptOrder && payPromptSeconds > 0 ? (
      <Modal
        title="Complete payment now"
        onClose={dismissPayPrompt}
        footer={
          <>
            <button type="button" className="btn btn-ghost" onClick={dismissPayPrompt}>
              Later
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={payingId === payPromptOrder.id}
              onClick={() => void payOrder(payPromptOrder.id)}
            >
              {payingId === payPromptOrder.id ? "Paying…" : "Pay now"}
            </button>
          </>
        }
      >
        <p style={{ marginTop: 0 }}>
          Your request was accepted. Complete payment within{" "}
          <strong>{formatCountdown(payPromptSeconds)}</strong> or the tanker will be cancelled
          automatically and released.
        </p>
        <div className="kpi-grid kpi-grid-compact" style={{ marginBottom: "0.75rem" }}>
          <div>
            <div style={{ color: "var(--muted)", fontSize: "0.85rem" }}>Amount</div>
            <strong>
              {formatInrFromPaise(payPromptOrder.totalAmountInPaise ?? payPromptOrder.amountInPaise)}
            </strong>
          </div>
          <div>
            <div style={{ color: "var(--muted)", fontSize: "0.85rem" }}>Vehicle</div>
            <strong>{payPromptOrder.vehicleNumber ?? "—"}</strong>
          </div>
        </div>
        <p style={{ color: "var(--muted)", marginBottom: 0, fontSize: "0.9rem" }}>
          {payPromptOrder.waterType} · {payPromptOrder.capacityLitres.toLocaleString("en-IN")} L
          <br />
          {payPromptOrder.deliveryAddress}
        </p>
      </Modal>
    ) : null;

  async function downloadInvoice(inv: TankerInvoice, mode: "file" | "print") {
    const id = String(inv.id);
    setDownloadingInvoiceId(id);
    try {
      if (mode === "print") {
        await openAuthenticatedHtml(`/tanker/invoices/${id}/download`);
      } else {
        await downloadAuthenticatedFile(
          `/tanker/invoices/${id}/download`,
          `${inv.invoiceNumber ?? `INV-TK-${id}`}.html`,
        );
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to download invoice");
    } finally {
      setDownloadingInvoiceId(null);
    }
  }

  if (section === "invoices") {
    return (
      <>
        <div className="topbar">
          <div>
            <h2>My invoices</h2>
            <p>Download receipts for paid tanker deliveries.</p>
          </div>
          <Link className="btn btn-ghost" to="/app/tanker/orders">
            My orders
          </Link>
        </div>
        <section className="panel">
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Invoice</th>
                  <th>Date</th>
                  <th>Order</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {(invoices?.items ?? []).map((inv) => (
                  <tr key={String(inv.id)}>
                    <td>
                      <code>{inv.invoiceNumber ?? `INV-TK-${inv.id}`}</code>
                    </td>
                    <td>{new Date(inv.createdAt).toLocaleString("en-IN")}</td>
                    <td>
                      <code>#{inv.orderId}</code>
                    </td>
                    <td>{formatInrFromPaise(inv.amountInPaise)}</td>
                    <td>
                      <StatusBadge status={inv.status} />
                    </td>
                    <td>
                      <div className="action-stack">
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          disabled={downloadingInvoiceId === String(inv.id)}
                          onClick={() => void downloadInvoice(inv, "file")}
                        >
                          {downloadingInvoiceId === String(inv.id) ? "…" : "Download"}
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          disabled={downloadingInvoiceId === String(inv.id)}
                          onClick={() => void downloadInvoice(inv, "print")}
                        >
                          Print / PDF
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {(invoices?.items.length ?? 0) === 0 ? (
                  <tr>
                    <td colSpan={6} className="empty">
                      No invoices yet. They appear after you complete payment for an order.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
          {invoices ? (
            <Pagination
              page={invoices.page}
              totalPages={invoices.totalPages}
              total={invoices.total}
              onPageChange={setInvPage}
            />
          ) : null}
        </section>
        {payPromptModal}
      </>
    );
  }

  if (section === "requests") {
    return (
      <>
        <div className="topbar">
          <div>
            <h2>My requests</h2>
            <p>Track water tanker requests you have submitted.</p>
          </div>
          <Link className="btn btn-primary" to="/app/tanker">
            Search tankers
          </Link>
        </div>
        <section className="panel">
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Water</th>
                  <th>Qty</th>
                  <th>Preferred delivery</th>
                  <th>Address</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {(requests?.items ?? []).map((r) => (
                  <tr key={r.id}>
                    <td>{new Date(r.createdAt).toLocaleString("en-IN")}</td>
                    <td>{r.waterType}</td>
                    <td>{r.quantityLitres} L</td>
                    <td>
                      {r.preferredDeliveryAt
                        ? new Date(r.preferredDeliveryAt).toLocaleString("en-IN")
                        : "—"}
                    </td>
                    <td>{r.deliveryAddress}</td>
                    <td>
                      <StatusBadge status={r.status} />
                    </td>
                  </tr>
                ))}
                {(requests?.items ?? []).length === 0 ? (
                  <tr>
                    <td colSpan={6} className="empty">
                      No requests yet.{" "}
                      <Link to="/app/tanker">Search matching tankers</Link> to create one.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
          {requests ? (
            <Pagination
              page={requests.page}
              totalPages={requests.totalPages}
              total={requests.total}
              onPageChange={setReqPage}
            />
          ) : null}
        </section>
        {payPromptModal}
      </>
    );
  }

  if (section === "orders") {
    return (
      <>
        <div className="topbar">
          <div>
            <h2>My orders</h2>
            <p>Pay within 10 minutes after accept, then track your delivery.</p>
          </div>
          <Link className="btn btn-ghost" to="/app/tanker/requests">
            View requests
          </Link>
        </div>
        <section className="panel">
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Created</th>
                  <th>Vehicle / driver</th>
                  <th>Water</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th>Payment</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {(orders?.items ?? []).map((o) => (
                  <tr key={o.id}>
                    <td>{new Date(o.createdAt).toLocaleString("en-IN")}</td>
                    <td>
                      <strong>{o.vehicleNumber ?? "—"}</strong>
                      <div style={{ color: "var(--muted)", fontSize: "0.85rem" }}>
                        {o.driverName ?? "—"}
                        {o.driverMobile ? ` · ${o.driverMobile}` : ""}
                      </div>
                    </td>
                    <td>
                      {o.waterType} · {o.capacityLitres} L
                    </td>
                    <td className="mono">
                      {formatInrFromPaise(o.totalAmountInPaise ?? o.amountInPaise)}
                    </td>
                    <td>
                      <StatusBadge status={o.status} />
                    </td>
                    <td>
                      <StatusBadge status={o.paymentStatus} />
                      {o.paymentStatus === "paid" && o.deliveryOtp && isActiveOrder(o.status) ? (
                        <div style={{ marginTop: "0.35rem", fontSize: "0.85rem" }}>
                          OTP <span className="mono">{o.deliveryOtp}</span>
                        </div>
                      ) : null}
                      {o.paymentStatus !== "paid" && isActiveOrder(o.status) ? (
                        <div style={{ marginTop: "0.35rem", fontSize: "0.85rem", color: "var(--muted)" }}>
                          {(() => {
                            const secondsLeft = orderSecondsLeft(o, nowTick);
                            return secondsLeft > 0
                              ? `Pay within ${formatCountdown(secondsLeft)}`
                              : "Payment window expired — tanker released";
                          })()}
                        </div>
                      ) : null}
                    </td>
                    <td>
                      <div className="action-stack">
                        {o.paymentStatus !== "paid" && isActiveOrder(o.status) ? (
                          <button
                            type="button"
                            className="btn btn-primary btn-sm"
                            disabled={payingId === o.id || orderSecondsLeft(o, nowTick) <= 0}
                            onClick={() => void payOrder(o.id)}
                          >
                            {payingId === o.id ? "Paying…" : "Pay"}
                          </button>
                        ) : null}
                        {o.paymentStatus === "paid" && isActiveOrder(o.status) ? (
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            onClick={() =>
                              setTrackingOrderId((cur) => (cur === o.id ? null : o.id))
                            }
                          >
                            {trackingOrderId === o.id ? "Stop track" : "Track"}
                          </button>
                        ) : null}
                        {o.paymentStatus === "paid" ? (
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            onClick={() => setChatOrder(o)}
                          >
                            Chat
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
                {(orders?.items ?? []).length === 0 ? (
                  <tr>
                    <td colSpan={7} className="empty">
                      No orders yet. Accepted requests become orders here.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
          {trackingOrderId && driverLocation ? (
            <div className="panel-body">
              <strong>Live driver location</strong>
              <p style={{ margin: "0.35rem 0 0", color: "var(--muted)" }}>
                {driverLocation.latitude != null && driverLocation.longitude != null
                  ? `${driverLocation.latitude.toFixed(5)}, ${driverLocation.longitude.toFixed(5)}`
                  : "Waiting for location…"}
                {driverLocation.updatedAt
                  ? ` · updated ${new Date(driverLocation.updatedAt).toLocaleTimeString("en-IN")}`
                  : ""}
              </p>
              <button type="button" className="btn btn-ghost btn-sm" onClick={stopTracking}>
                Close tracking
              </button>
            </div>
          ) : null}
          {orders ? (
            <Pagination
              page={orders.page}
              totalPages={orders.totalPages}
              total={orders.total}
              onPageChange={setOrdPage}
            />
          ) : null}
        </section>
        {payPromptModal}
        {chatOrder ? (
          <ThreadChatModal
            messagesPath={`/tanker/orders/${chatOrder.id}/messages`}
            title={`Chat · Order #${chatOrder.id}`}
            peerLabel="driver"
            intro="Chat with your driver about arrival, access, and delivery. Available after payment."
            closedLabel="Chat is closed after delivery is completed."
            onClose={() => setChatOrder(null)}
          />
        ) : null}
      </>
    );
  }

  return (
    <>
      <div className="topbar">
        <div>
          <h2>Search water tankers</h2>
          <p>
            Enter water type, quantity, date and time. Only suppliers available in that window with
            a matching tanker are shown.
          </p>
        </div>
      </div>

      <section className="panel">
        <div className="panel-head">
          <h3>Delivery requirements</h3>
        </div>
        <form className="panel-body form-grid" onSubmit={(e) => void runSearch(e)}>
          <div className="field">
            <label htmlFor="tq-water">Water type</label>
            <select
              id="tq-water"
              value={search.waterType}
              onChange={(e) => setSearch({ ...search, waterType: e.target.value })}
            >
              {TANKER_WATER_TYPE_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="tq-qty">Quantity (litres)</label>
            <input
              id="tq-qty"
              type="number"
              min={100}
              step={100}
              required
              value={search.quantityLitres}
              onChange={(e) => setSearch({ ...search, quantityLitres: e.target.value })}
            />
          </div>
          <div className="field">
            <label htmlFor="tq-date">Delivery date</label>
            <input
              id="tq-date"
              type="date"
              required
              min={todayLocalDate()}
              value={search.deliveryDate}
              onChange={(e) => setSearch({ ...search, deliveryDate: e.target.value })}
            />
          </div>
          <div className="field">
            <label htmlFor="tq-time">Delivery time</label>
            <input
              id="tq-time"
              type="time"
              required
              value={search.deliveryTime}
              onChange={(e) => setSearch({ ...search, deliveryTime: e.target.value })}
            />
          </div>
          <div className="field" style={{ gridColumn: "1 / -1" }}>
            <label htmlFor="tq-address">Delivery address</label>
            <input
              id="tq-address"
              required
              value={search.deliveryAddress}
              onChange={(e) => setSearch({ ...search, deliveryAddress: e.target.value })}
              placeholder="Flat / street / landmark"
            />
          </div>
          <div className="field" style={{ gridColumn: "1 / -1" }}>
            <label htmlFor="tq-comments">Comments (optional)</label>
            <textarea
              id="tq-comments"
              rows={2}
              value={search.comments}
              onChange={(e) => setSearch({ ...search, comments: e.target.value })}
            />
          </div>
          {geoHint ? (
            <p className="auth-hint" style={{ gridColumn: "1 / -1", margin: 0 }}>
              {geoHint}
            </p>
          ) : null}
          <div className="form-actions" style={{ gridColumn: "1 / -1" }}>
            <button type="submit" className="btn btn-primary" disabled={searching}>
              {searching ? "Searching…" : "Find matching tankers"}
            </button>
          </div>
        </form>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h3>Matching tankers</h3>
          {hasSearched ? (
            <span style={{ color: "var(--muted)", fontSize: "0.9rem" }}>
              {results.length} match{results.length === 1 ? "" : "es"}
            </span>
          ) : null}
        </div>
        {!hasSearched ? (
          <p className="empty" style={{ padding: "1.25rem" }}>
            Search with your preferred date, time, water type, and quantity to see available
            tankers.
          </p>
        ) : results.length === 0 ? (
          <p className="empty" style={{ padding: "1.25rem" }}>
            {searchMessage || "No tankers match your criteria. Try another time or water type."}
          </p>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th />
                  <th>Supplier</th>
                  <th>Available hours</th>
                  <th>Matching tankers</th>
                  <th>From</th>
                  <th>Distance</th>
                </tr>
              </thead>
              <tbody>
                {results.map((hit) => {
                  const cheapest = hit.matchingVehicles[0];
                  const selected = String(hit.supplier.id) === selectedSupplierId;
                  return (
                    <tr key={String(hit.supplier.id)} className={selected ? "is-selected" : undefined}>
                      <td>
                        <input
                          type="radio"
                          name="supplier"
                          checked={selected}
                          onChange={() => setSelectedSupplierId(String(hit.supplier.id))}
                          aria-label={`Select ${hit.supplier.fullName}`}
                        />
                      </td>
                      <td>
                        <strong>{hit.supplier.fullName}</strong>
                        <div style={{ color: "var(--muted)", fontSize: "0.85rem" }}>
                          {hit.supplier.address}, {hit.supplier.city} {hit.supplier.pinCode}
                        </div>
                        <div style={{ marginTop: "0.25rem" }}>
                          <StatusBadge status={hit.supplier.isOnline ? "online" : "offline"} />
                        </div>
                      </td>
                      <td className="mono">
                        {hit.supplier.availabilityStartTime ?? "06:00"}–
                        {hit.supplier.availabilityEndTime ?? "22:00"}
                      </td>
                      <td>
                        {hit.matchingVehicles.map((v) => (
                          <div key={String(v.id)} style={{ marginBottom: "0.35rem" }}>
                            <strong>{v.vehicleNumber}</strong> · {v.capacityLitres} L · {v.waterType}
                            <div style={{ color: "var(--muted)", fontSize: "0.8rem" }}>
                              Driver {v.driverFullName}
                            </div>
                          </div>
                        ))}
                      </td>
                      <td className="mono">
                        {cheapest ? formatInrFromPaise(cheapest.amountInPaise) : "—"}
                      </td>
                      <td>
                        {hit.distanceKm != null ? `${hit.distanceKm.toFixed(1)} km` : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {selectedHit ? (
          <div className="panel-body" style={{ borderTop: "1px solid var(--line)" }}>
            <p style={{ margin: "0 0 0.75rem" }}>
              Selected <strong>{selectedHit.supplier.fullName}</strong> for{" "}
              {search.deliveryDate} at {search.deliveryTime}.
            </p>
            <form onSubmit={(e) => void onRequest(e)} className="form-actions">
              <button type="submit" className="btn btn-primary" disabled={submitting}>
                {submitting ? "Sending…" : "Request this tanker"}
              </button>
              <Link className="btn btn-ghost" to="/app/tanker/requests">
                My requests
              </Link>
            </form>
          </div>
        ) : null}
      </section>
      {payPromptModal}
    </>
  );
}
