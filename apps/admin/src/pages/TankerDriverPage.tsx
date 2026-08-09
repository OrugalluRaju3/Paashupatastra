import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { api, formatInrFromPaise } from "../api";
import { KpiCard } from "../components/KpiCard";
import { StatusBadge } from "../components/StatusBadge";
import { ThreadChatModal } from "../components/BookingChatModal";
import { useToast } from "../components/Toast";
import {
  startTankerLocationShare,
  type ShareLocationHandle,
} from "../lib/shareTankerLocation";

type Vehicle = {
  id: string;
  vehicleNumber: string;
  capacityLitres: number;
  waterType: string;
  status: string;
  amountInPaise: number;
};

type TankerOrder = {
  id: string;
  waterType: string;
  capacityLitres: number;
  vehicleNumber: string | null;
  deliveryAddress: string;
  amountInPaise: number;
  totalAmountInPaise?: number;
  status: string;
  paymentStatus: string;
  otpVerified?: boolean;
  comments: string | null;
  createdAt: string;
};

type DriverMe = {
  phone: string;
  name: string | null;
  vehicles: Vehicle[];
  orders: TankerOrder[];
};

const PRE_OTP_STATUSES = [
  "scheduled",
  "en_route",
  "water_filled",
  "on_the_way",
  "at_location",
] as const;

const POST_OTP_STATUSES = ["delivering", "delivered"] as const;

export function TankerDriverPage() {
  const toast = useToast();
  const [me, setMe] = useState<DriverMe | null>(null);
  const [loading, setLoading] = useState(true);
  const [sharingOrderId, setSharingOrderId] = useState<string | null>(null);
  const [shareHint, setShareHint] = useState("");
  const [otpByOrder, setOtpByOrder] = useState<Record<string, string>>({});
  const [chatOrder, setChatOrder] = useState<TankerOrder | null>(null);
  const shareRef = useRef<ShareLocationHandle | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setMe(await api.get<DriverMe>("/tanker/driver/me"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load driver console");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    return () => {
      shareRef.current?.stop();
      shareRef.current = null;
    };
  }, []);

  function stopSharing() {
    shareRef.current?.stop();
    shareRef.current = null;
    setSharingOrderId(null);
    setShareHint("");
  }

  function startSharing(orderId: string) {
    stopSharing();
    setSharingOrderId(orderId);
    shareRef.current = startTankerLocationShare({
      orderId,
      onStatus: setShareHint,
      onError: (message) => toast.error(message),
      onFirstFix: () => toast.success("Location sharing started"),
    });
  }

  async function updateStatus(orderId: string, status: string) {
    const order = me?.orders.find((o) => o.id === orderId);
    if (order && order.paymentStatus !== "paid") {
      toast.error("Wait until the customer completes payment before updating status");
      return;
    }
    if (
      order &&
      (status === "delivering" || status === "delivered") &&
      !order.otpVerified
    ) {
      toast.error("Enter the customer OTP to start delivering");
      return;
    }
    if (order && status === "delivered" && order.status !== "delivering") {
      toast.error("Set status to delivering first (after OTP), then mark delivered");
      return;
    }
    try {
      await api.patch(`/tanker/orders/${orderId}/status`, { status });
      toast.success(
        status === "delivered"
          ? "Delivered — supplier wallet will be credited"
          : `Status → ${status.replaceAll("_", " ")}`,
      );
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update status");
    }
  }

  async function verifyOtp(e: FormEvent, orderId: string) {
    e.preventDefault();
    const otp = (otpByOrder[orderId] ?? "").trim();
    if (otp.length < 4) {
      toast.error("Enter the customer delivery OTP");
      return;
    }
    try {
      await api.post(`/tanker/orders/${orderId}/verify-otp`, { otp });
      toast.success("OTP verified — status set to delivering");
      setOtpByOrder((m) => ({ ...m, [orderId]: "" }));
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "OTP verification failed");
    }
  }

  const activeOrders = (me?.orders ?? []).filter(
    (o) => !["delivered", "cancelled"].includes(o.status),
  );
  const pastOrders = (me?.orders ?? []).filter((o) =>
    ["delivered", "cancelled"].includes(o.status),
  );

  return (
    <>
      <div className="topbar">
        <div>
          <h2>Driver console</h2>
          <p>
            {me?.name ? `${me.name} · ` : ""}
            {me?.phone ?? "—"} — assigned tankers and live deliveries.
          </p>
        </div>
        <button type="button" className="btn btn-ghost" onClick={() => void load()}>
          Refresh
        </button>
      </div>

      {loading && !me ? <p className="loading">Loading…</p> : null}

      {me ? (
        <div className="kpi-grid kpi-grid-compact" style={{ marginBottom: "1rem" }}>
          <KpiCard label="Assigned tankers" value={me.vehicles.length} />
          <KpiCard label="Active deliveries" value={activeOrders.length} />
          <KpiCard
            label="Completed"
            value={pastOrders.length}
            hint={`${me.orders.length} total orders`}
          />
        </div>
      ) : null}

      <section className="panel">
        <div className="panel-head">
          <h3>My tankers ({me?.vehicles.length ?? 0})</h3>
        </div>
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Vehicle</th>
                <th>Water</th>
                <th>Capacity</th>
                <th>Rate</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {(me?.vehicles ?? []).map((v) => (
                <tr key={v.id}>
                  <td>
                    <strong>{v.vehicleNumber}</strong>
                  </td>
                  <td>{v.waterType}</td>
                  <td>{v.capacityLitres.toLocaleString("en-IN")} L</td>
                  <td>{formatInrFromPaise(v.amountInPaise)}</td>
                  <td>
                    <StatusBadge status={v.status} />
                  </td>
                </tr>
              ))}
              {(me?.vehicles.length ?? 0) === 0 ? (
                <tr>
                  <td colSpan={5} className="empty">
                    No tanker linked yet. Ask your supplier to add this mobile on a vehicle.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h3>Active deliveries ({activeOrders.length})</h3>
        </div>
        {sharingOrderId ? (
          <p className="withdraw-hint" style={{ padding: "0 1rem" }}>
            Live share on order {sharingOrderId.slice(0, 8)}… — {shareHint}{" "}
            <button type="button" className="btn btn-ghost btn-sm" onClick={stopSharing}>
              Stop sharing
            </button>
          </p>
        ) : null}
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>When</th>
                <th>Delivery</th>
                <th>Payment</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {activeOrders.map((o) => (
                <tr key={o.id}>
                  <td>{new Date(o.createdAt).toLocaleString("en-IN")}</td>
                  <td>
                    {o.deliveryAddress}
                    <div style={{ color: "var(--muted)", fontSize: "0.85rem" }}>
                      {o.waterType} · {o.capacityLitres.toLocaleString("en-IN")} L
                      {o.vehicleNumber ? ` · ${o.vehicleNumber}` : ""}
                    </div>
                    {o.comments ? (
                      <div style={{ color: "var(--muted)", fontSize: "0.85rem" }}>{o.comments}</div>
                    ) : null}
                  </td>
                  <td>
                    {formatInrFromPaise(o.totalAmountInPaise ?? o.amountInPaise)}
                    <div style={{ color: "var(--muted)", fontSize: "0.85rem" }}>{o.paymentStatus}</div>
                  </td>
                  <td>
                    <StatusBadge status={o.status} />
                    <div className="field" style={{ marginTop: "0.35rem", minWidth: "9rem" }}>
                      <select
                        aria-label="Update delivery status"
                        value={o.status}
                        disabled={o.paymentStatus !== "paid"}
                        title={
                          o.paymentStatus !== "paid"
                            ? "Available after customer payment"
                            : !o.otpVerified
                              ? "Use customer OTP to move to delivering"
                              : "Update delivery status"
                        }
                        onChange={(e) => void updateStatus(o.id, e.target.value)}
                      >
                        {(o.otpVerified
                          ? [...PRE_OTP_STATUSES, ...POST_OTP_STATUSES]
                          : [...PRE_OTP_STATUSES]
                        )
                          .concat(
                            !o.otpVerified &&
                              (o.status === "delivering" || o.status === "delivered")
                              ? [o.status as (typeof PRE_OTP_STATUSES)[number]]
                              : [],
                          )
                          .filter((s, i, arr) => arr.indexOf(s) === i)
                          .map((s) => (
                          <option key={s} value={s}>
                            {s.replaceAll("_", " ")}
                          </option>
                        ))}
                      </select>
                      {o.paymentStatus !== "paid" ? (
                        <div style={{ color: "var(--muted)", fontSize: "0.8rem", marginTop: "0.25rem" }}>
                          Status locked until payment
                        </div>
                      ) : !o.otpVerified ? (
                        <div style={{ color: "var(--muted)", fontSize: "0.8rem", marginTop: "0.25rem" }}>
                          OTP required for delivering
                        </div>
                      ) : null}
                    </div>
                  </td>
                  <td>
                    <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                      {o.paymentStatus === "paid" ? (
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={() => setChatOrder(o)}
                        >
                          Chat
                        </button>
                      ) : null}
                      {sharingOrderId === o.id ? (
                        <button type="button" className="btn btn-ghost btn-sm" onClick={stopSharing}>
                          Stop share
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={() => startSharing(o.id)}
                        >
                          Share location
                        </button>
                      )}
                      {o.paymentStatus === "paid" && !o.otpVerified ? (
                        <form
                          onSubmit={(e) => void verifyOtp(e, o.id)}
                          style={{ display: "flex", gap: "0.35rem", alignItems: "center", flexWrap: "wrap" }}
                        >
                          <input
                            aria-label="Customer delivery OTP"
                            placeholder="Customer OTP"
                            maxLength={8}
                            value={otpByOrder[o.id] ?? ""}
                            onChange={(e) =>
                              setOtpByOrder((m) => ({
                                ...m,
                                [o.id]: e.target.value.replace(/\D/g, "").slice(0, 8),
                              }))
                            }
                            style={{ width: "6.5rem" }}
                          />
                          <button type="submit" className="btn btn-primary btn-sm">
                            Verify → Delivering
                          </button>
                        </form>
                      ) : o.paymentStatus === "paid" && o.otpVerified ? (
                        <span style={{ color: "var(--muted)", fontSize: "0.85rem" }}>
                          OTP verified · {o.status === "delivering" ? "Mark delivered when done" : "In progress"}
                        </span>
                      ) : (
                        <span style={{ color: "var(--muted)", fontSize: "0.85rem" }}>
                          Waiting for payment
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {activeOrders.length === 0 ? (
                <tr>
                  <td colSpan={5} className="empty">
                    No active deliveries. Orders appear when your supplier assigns this tanker.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      {pastOrders.length > 0 ? (
        <section className="panel">
          <div className="panel-head">
            <h3>Recent completed</h3>
          </div>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Address</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {pastOrders.slice(0, 10).map((o) => (
                  <tr key={o.id}>
                    <td>{new Date(o.createdAt).toLocaleString("en-IN")}</td>
                    <td>{o.deliveryAddress}</td>
                    <td>
                      <StatusBadge status={o.status} />
                    </td>
                    <td>
                      {o.paymentStatus === "paid" ? (
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={() => setChatOrder(o)}
                        >
                          Chat
                        </button>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {chatOrder ? (
        <ThreadChatModal
          messagesPath={`/tanker/orders/${chatOrder.id}/messages`}
          title={`Chat · Order #${chatOrder.id}`}
          peerLabel="customer"
          intro="Chat with the customer about access, landmarks, and delivery. Available after payment."
          closedLabel="Chat is closed after delivery is completed."
          onClose={() => setChatOrder(null)}
        />
      ) : null}
    </>
  );
}
