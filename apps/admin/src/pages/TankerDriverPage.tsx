import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { api, formatInrFromPaise } from "../api";
import { KpiCard } from "../components/KpiCard";
import { StatusBadge } from "../components/StatusBadge";
import { useToast } from "../components/Toast";
import { createTankerSocket } from "../lib/tankerSocket";
import type { Socket } from "socket.io-client";

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
  comments: string | null;
  createdAt: string;
};

type DriverMe = {
  phone: string;
  name: string | null;
  vehicles: Vehicle[];
  orders: TankerOrder[];
};

const ORDER_STATUSES = [
  "scheduled",
  "en_route",
  "water_filled",
  "on_the_way",
  "at_location",
  "delivering",
  "delivered",
  "cancelled",
] as const;

export function TankerDriverPage() {
  const toast = useToast();
  const [me, setMe] = useState<DriverMe | null>(null);
  const [loading, setLoading] = useState(true);
  const [sharingOrderId, setSharingOrderId] = useState<string | null>(null);
  const [shareHint, setShareHint] = useState("");
  const [otpByOrder, setOtpByOrder] = useState<Record<string, string>>({});
  const watchRef = useRef<number | null>(null);
  const socketRef = useRef<Socket | null>(null);

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
      if (watchRef.current != null) navigator.geolocation.clearWatch(watchRef.current);
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, []);

  function stopSharing() {
    if (watchRef.current != null) {
      navigator.geolocation.clearWatch(watchRef.current);
      watchRef.current = null;
    }
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }
    setSharingOrderId(null);
    setShareHint("");
  }

  function startSharing(orderId: string) {
    if (!navigator.geolocation) {
      toast.error("Geolocation is not available on this device");
      return;
    }

    stopSharing();
    setSharingOrderId(orderId);
    setShareHint("Starting location share…");

    const socket = createTankerSocket();
    socketRef.current = socket;
    socket.connect();

    watchRef.current = navigator.geolocation.watchPosition(
      async (pos) => {
        const latitude = pos.coords.latitude;
        const longitude = pos.coords.longitude;
        try {
          await api.post(`/tanker/orders/${orderId}/location`, { latitude, longitude });
          socket.emit("driverLocationUpdate", { orderId, latitude, longitude });
          setShareHint(`Sharing · ${latitude.toFixed(5)}, ${longitude.toFixed(5)}`);
        } catch (err) {
          setShareHint(err instanceof Error ? err.message : "Location update failed");
        }
      },
      (err) => {
        setShareHint(err.message || "Unable to read GPS");
        toast.error(err.message || "Unable to read GPS");
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 },
    );
  }

  async function updateStatus(orderId: string, status: string) {
    try {
      await api.patch(`/tanker/orders/${orderId}/status`, { status });
      toast.success(`Status → ${status.replaceAll("_", " ")}`);
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
      toast.success("OTP verified");
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
                        onChange={(e) => void updateStatus(o.id, e.target.value)}
                      >
                        {ORDER_STATUSES.map((s) => (
                          <option key={s} value={s}>
                            {s.replaceAll("_", " ")}
                          </option>
                        ))}
                      </select>
                    </div>
                  </td>
                  <td>
                    <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
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
                      {o.paymentStatus === "paid" ? (
                        <form
                          onSubmit={(e) => void verifyOtp(e, o.id)}
                          style={{ display: "flex", gap: "0.35rem", alignItems: "center" }}
                        >
                          <input
                            aria-label="Delivery OTP"
                            placeholder="OTP"
                            maxLength={8}
                            value={otpByOrder[o.id] ?? ""}
                            onChange={(e) =>
                              setOtpByOrder((m) => ({
                                ...m,
                                [o.id]: e.target.value.replace(/\D/g, "").slice(0, 8),
                              }))
                            }
                            style={{ width: "5rem" }}
                          />
                          <button type="submit" className="btn btn-primary btn-sm">
                            Verify
                          </button>
                        </form>
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
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </>
  );
}
