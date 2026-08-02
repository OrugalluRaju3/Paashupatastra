import { FormEvent, useCallback, useEffect, useState } from "react";
import { api, formatInrFromPaise, qs } from "../api";
import { useAuth } from "../auth/AuthContext";
import { Modal } from "../components/Modal";
import { ParkingNavigationMap } from "../components/ParkingNavigationMap";
import { StatusBadge } from "../components/StatusBadge";
import { useToast } from "../components/Toast";
import { openCashfreeCheckout } from "../lib/cashfree";

type Booking = {
  id: string;
  status: string;
  paymentStatus: string;
  startAt: string;
  endAt: string;
  durationMinutes?: number;
  totalAmountInPaise: number;
  baseAmountInPaise?: number;
  platformFeeInPaise?: number;
  vehicleNumber?: string | null;
  vehicleType?: string | null;
  checkedInAt?: string | null;
  checkedOutAt?: string | null;
  listing?: {
    apartmentName: string;
    flatNumber?: string;
    blockTower?: string;
    floorNumber?: string | null;
    parkingSlotNumber: string;
    city: string;
    state?: string;
    addressLine?: string;
    pinCode?: string;
    parkingType?: string;
    vehicleTypesAllowed?: string[];
    latitude?: number | null;
    longitude?: number | null;
    mapsUrl?: string | null;
    navigationUrl?: string | null;
  } | null;
  owner?: {
    name: string | null;
    phone: string | null;
    phoneMasked: string | null;
  } | null;
};

function formatDuration(minutes?: number) {
  if (!minutes || minutes <= 0) return "—";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h <= 0) return `${m} min`;
  if (m <= 0) return `${h} hr`;
  return `${h} hr ${m} min`;
}

function labelType(value?: string | null) {
  if (!value) return "—";
  return value.replaceAll("_", " ");
}

function canNavigate(status: string) {
  return status === "confirmed" || status === "checked_in";
}

function listingAddress(listing: Booking["listing"]) {
  if (!listing) return "";
  return [listing.addressLine, listing.city, listing.state, listing.pinCode].filter(Boolean).join(", ");
}

export function CustomerBookingsPage() {
  const toast = useToast();
  const { user } = useAuth();
  const [items, setItems] = useState<Booking[]>([]);
  const [checkInId, setCheckInId] = useState<string | null>(null);
  const [navBooking, setNavBooking] = useState<Booking | null>(null);
  const [viewBooking, setViewBooking] = useState<Booking | null>(null);
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!user?.id) return;
    try {
      const res = await api.get<{ items: Booking[] }>(
        `/parking/bookings${qs({ renterUserId: user.id, limit: 50 })}`,
      );
      setItems(res.items);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load bookings");
    }
  }, [user?.id, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  async function confirmCheckIn(e: FormEvent) {
    e.preventDefault();
    if (!checkInId) return;
    setLoading(true);
    try {
      await api.post(`/parking/bookings/${checkInId}/check-in`, { otp: otp.trim() });
      toast.success("Checked in — parking session started");
      setCheckInId(null);
      setOtp("");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Check-in failed");
    } finally {
      setLoading(false);
    }
  }

  async function checkOut(id: string) {
    setLoading(true);
    try {
      const res = await api.post<{
        booking: { id: string };
        settlement?: { ownerShareInPaise?: number } | null;
        settlementError?: string | null;
      }>(`/parking/bookings/${id}/check-out`, {});
      if (res.settlementError) {
        toast.error(`Checked out, but owner payout failed: ${res.settlementError}`);
      } else {
        toast.success("Checked out successfully");
      }
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Check-out failed");
    } finally {
      setLoading(false);
    }
  }

  async function payPending(id: string) {
    setLoading(true);
    try {
      const order = await api.post<{
        orderId: string;
        paymentSessionId: string;
        env: "sandbox" | "production";
      }>("/payments/orders", { bookingId: id });

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

      await api.post("/payments/orders/verify", { bookingId: id, orderId: order.orderId });
      await api.post(`/parking/bookings/${id}/confirm-payment`, { orderId: order.orderId });
      toast.success("Payment successful — check Alerts and email for details");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Payment failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <div className="topbar">
        <div>
          <h2>My bookings</h2>
          <p>After payment, navigate live to the slot, check in with owner OTP, then check out.</p>
        </div>
        <button type="button" className="btn btn-ghost" onClick={() => void load()}>
          Refresh
        </button>
      </div>

      <section className="panel">
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Slot</th>
                <th>Window</th>
                <th>Amount</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {items.map((b) => (
                <tr key={b.id}>
                  <td>
                    <strong>{b.listing?.apartmentName ?? "Parking"}</strong>
                    <div style={{ color: "var(--muted)", fontSize: "0.85rem" }}>
                      Slot {b.listing?.parkingSlotNumber ?? "—"} · {b.listing?.city ?? ""}
                      {b.listing?.addressLine ? ` · ${b.listing.addressLine}` : ""}
                    </div>
                  </td>
                  <td>
                    {new Date(b.startAt).toLocaleString("en-IN")}
                    <div style={{ color: "var(--muted)", fontSize: "0.85rem" }}>
                      → {new Date(b.endAt).toLocaleString("en-IN")}
                    </div>
                  </td>
                  <td>{formatInrFromPaise(b.totalAmountInPaise)}</td>
                  <td>
                    <StatusBadge status={b.status} />
                    <div style={{ color: "var(--muted)", fontSize: "0.8rem" }}>{b.paymentStatus}</div>
                  </td>
                  <td>
                    <div className="action-stack">
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => setViewBooking(b)}
                      >
                        View
                      </button>
                      {b.status === "pending" ? (
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          disabled={loading}
                          onClick={() => void payPending(b.id)}
                        >
                          Pay
                        </button>
                      ) : null}
                      {canNavigate(b.status) ? (
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={() => setNavBooking(b)}
                        >
                          Navigate
                        </button>
                      ) : null}
                      {b.status === "confirmed" ? (
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          onClick={() => {
                            setOtp("");
                            setCheckInId(b.id);
                          }}
                        >
                          Enter OTP
                        </button>
                      ) : null}
                      {b.status === "checked_in" ? (
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          disabled={loading}
                          onClick={() => void checkOut(b.id)}
                        >
                          Check out
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
              {items.length === 0 ? (
                <tr>
                  <td colSpan={5} className="empty">
                    No bookings yet. Search and select a parking slot to start.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      {viewBooking ? (
        <Modal
          title="Parking & owner details"
          onClose={() => setViewBooking(null)}
          footer={
            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
              {canNavigate(viewBooking.status) ? (
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => {
                    setNavBooking(viewBooking);
                    setViewBooking(null);
                  }}
                >
                  Navigate
                </button>
              ) : null}
              {viewBooking.status === "confirmed" ? (
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => {
                    setOtp("");
                    setCheckInId(viewBooking.id);
                    setViewBooking(null);
                  }}
                >
                  Enter OTP
                </button>
              ) : null}
              <button type="button" className="btn btn-ghost" onClick={() => setViewBooking(null)}>
                Close
              </button>
            </div>
          }
        >
          <p style={{ marginTop: 0 }}>
            On arrival, contact the owner for the check-in OTP, then use Enter OTP.
          </p>
          <dl className="detail-list">
            <div>
              <dt>Owner name</dt>
              <dd>{viewBooking.owner?.name ?? "—"}</dd>
            </div>
            <div>
              <dt>Owner phone</dt>
              <dd>
                {viewBooking.owner?.phone ? (
                  <a href={`tel:${viewBooking.owner.phone}`}>{viewBooking.owner.phone}</a>
                ) : (
                  (viewBooking.owner?.phoneMasked ?? "—")
                )}
              </dd>
            </div>
            <div>
              <dt>Apartment</dt>
              <dd>{viewBooking.listing?.apartmentName ?? "—"}</dd>
            </div>
            <div>
              <dt>Block / tower</dt>
              <dd>{viewBooking.listing?.blockTower || "—"}</dd>
            </div>
            <div>
              <dt>Flat</dt>
              <dd>{viewBooking.listing?.flatNumber || "—"}</dd>
            </div>
            <div>
              <dt>Parking slot</dt>
              <dd>{viewBooking.listing?.parkingSlotNumber ?? "—"}</dd>
            </div>
            <div>
              <dt>Parking type</dt>
              <dd>{labelType(viewBooking.listing?.parkingType)}</dd>
            </div>
            <div>
              <dt>Vehicle type</dt>
              <dd>
                {labelType(viewBooking.vehicleType) !== "—"
                  ? labelType(viewBooking.vehicleType)
                  : viewBooking.listing?.vehicleTypesAllowed?.length
                    ? viewBooking.listing.vehicleTypesAllowed.map(labelType).join(", ")
                    : "—"}
              </dd>
            </div>
            <div>
              <dt>Vehicle number</dt>
              <dd>{viewBooking.vehicleNumber || "—"}</dd>
            </div>
            <div>
              <dt>Address</dt>
              <dd>{listingAddress(viewBooking.listing) || "—"}</dd>
            </div>
            <div>
              <dt>Booked from</dt>
              <dd>{new Date(viewBooking.startAt).toLocaleString("en-IN")}</dd>
            </div>
            <div>
              <dt>Booked until</dt>
              <dd>{new Date(viewBooking.endAt).toLocaleString("en-IN")}</dd>
            </div>
            <div>
              <dt>Duration</dt>
              <dd>{formatDuration(viewBooking.durationMinutes)}</dd>
            </div>
            <div>
              <dt>Paid amount</dt>
              <dd>
                {formatInrFromPaise(viewBooking.totalAmountInPaise)}
                {viewBooking.paymentStatus === "paid" ? " · paid" : ` · ${viewBooking.paymentStatus}`}
              </dd>
            </div>
            {viewBooking.baseAmountInPaise != null || viewBooking.platformFeeInPaise != null ? (
              <div>
                <dt>Fee breakup</dt>
                <dd>
                  Base {formatInrFromPaise(viewBooking.baseAmountInPaise ?? 0)}
                  {viewBooking.platformFeeInPaise
                    ? ` · Platform fee ${formatInrFromPaise(viewBooking.platformFeeInPaise)}`
                    : ""}
                </dd>
              </div>
            ) : null}
            <div>
              <dt>Status</dt>
              <dd>
                <StatusBadge status={viewBooking.status} /> · {viewBooking.paymentStatus}
              </dd>
            </div>
          </dl>
        </Modal>
      ) : null}

      {checkInId ? (
        <Modal
          title="Check-in OTP"
          onClose={() => setCheckInId(null)}
          footer={
            <>
              <button type="button" className="btn btn-ghost" onClick={() => setCheckInId(null)}>
                Cancel
              </button>
              <button type="submit" form="checkin-form" className="btn btn-primary" disabled={loading}>
                {loading ? "Verifying…" : "Verify & check in"}
              </button>
            </>
          }
        >
          <p>Ask the parking owner for the check-in OTP they received, then enter it below.</p>
          <form id="checkin-form" onSubmit={(e) => void confirmCheckIn(e)}>
            <div className="field">
              <label>OTP from owner</label>
              <input
                required
                minLength={4}
                maxLength={8}
                value={otp}
                onChange={(e) => setOtp(e.target.value)}
                placeholder="4–6 digit OTP"
                autoFocus
              />
            </div>
          </form>
        </Modal>
      ) : null}

      {navBooking ? (
        <Modal
          title="Live navigation to parking"
          onClose={() => setNavBooking(null)}
          footer={
            <button type="button" className="btn btn-ghost" onClick={() => setNavBooking(null)}>
              Close
            </button>
          }
        >
          <ParkingNavigationMap
            latitude={navBooking.listing?.latitude}
            longitude={navBooking.listing?.longitude}
            label={`${navBooking.listing?.apartmentName ?? "Parking"} · Slot ${navBooking.listing?.parkingSlotNumber ?? "—"}`}
            address={listingAddress(navBooking.listing)}
            mapsUrl={navBooking.listing?.mapsUrl}
            navigationUrl={navBooking.listing?.navigationUrl}
          />
        </Modal>
      ) : null}
    </>
  );
}
