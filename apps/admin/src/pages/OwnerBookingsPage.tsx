import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, formatInrFromPaise, qs } from "../api";
import { BookingChatModal } from "../components/BookingChatModal";
import { KpiCard } from "../components/KpiCard";
import { StatusBadge } from "../components/StatusBadge";
import { useToast } from "../components/Toast";

type Booking = {
  id: string;
  status: string;
  paymentStatus: string;
  startAt: string;
  endAt: string;
  totalAmountInPaise: number;
  platformFeeInPaise: number;
  ownerOtp?: string | null;
  vehicleNumber?: string | null;
  checkedInAt?: string | null;
  checkedOutAt?: string | null;
  listing?: {
    apartmentName: string;
    parkingSlotNumber: string;
    city: string;
    addressLine?: string;
  } | null;
  customer?: {
    name: string | null;
    phoneMasked: string | null;
  } | null;
};

function canChat(status: string) {
  return status === "confirmed" || status === "checked_in" || status === "completed";
}

export function OwnerBookingsPage() {
  const toast = useToast();
  const [items, setItems] = useState<Booking[]>([]);
  const [chatBooking, setChatBooking] = useState<Booking | null>(null);
  const [wallet, setWallet] = useState<{
    balanceInPaise: number;
    pendingSettlementInPaise?: number;
  } | null>(null);

  const load = useCallback(async () => {
    try {
      const [bookings, w] = await Promise.all([
        api.get<{ items: Booking[] }>(
          `/parking/bookings${qs({ mine: "owner", limit: 50 })}`,
        ),
        api
          .get<{ balanceInPaise: number; pendingSettlementInPaise?: number }>(
            "/payments/wallets/me",
          )
          .catch(() => null),
      ]);
      setItems(bookings.items ?? []);
      setWallet(w);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load bookings");
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <>
      <div className="topbar">
        <div>
          <h2>Customer bookings</h2>
          <p>
            Share the check-in OTP only when the customer arrives. Use Chat after payment to
            coordinate. After check-out, payout (minus platform fee) credits your wallet.
          </p>
        </div>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <Link className="btn btn-ghost" to="/app/owner/wallet">
            Open wallet
          </Link>
          <button type="button" className="btn btn-ghost" onClick={() => void load()}>
            Refresh
          </button>
        </div>
      </div>

      {wallet ? (
        <div className="kpi-grid">
          <KpiCard
            label="Available in wallet"
            value={formatInrFromPaise(wallet.balanceInPaise)}
            hint="Credited after check-out"
          />
          <KpiCard
            label="Pending (admin hold)"
            value={formatInrFromPaise(wallet.pendingSettlementInPaise ?? 0)}
            hint="Released after check-out − fee"
          />
        </div>
      ) : null}

      <section className="panel">
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Customer</th>
                <th>Slot</th>
                <th>Window</th>
                <th>OTP</th>
                <th>Payment</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {items.map((b) => (
                <tr key={b.id}>
                  <td>
                    <strong>{b.customer?.name ?? "Customer"}</strong>
                    <div className="mono" style={{ color: "var(--muted)", fontSize: "0.85rem" }}>
                      {b.customer?.phoneMasked ?? "—"}
                    </div>
                    {b.vehicleNumber ? (
                      <div style={{ fontSize: "0.85rem" }}>Vehicle {b.vehicleNumber}</div>
                    ) : null}
                  </td>
                  <td>
                    <strong>{b.listing?.apartmentName ?? "—"}</strong>
                    <div style={{ color: "var(--muted)", fontSize: "0.85rem" }}>
                      Slot {b.listing?.parkingSlotNumber ?? "—"}
                    </div>
                  </td>
                  <td>
                    {new Date(b.startAt).toLocaleString("en-IN")}
                    <div style={{ color: "var(--muted)", fontSize: "0.85rem" }}>
                      → {new Date(b.endAt).toLocaleString("en-IN")}
                    </div>
                  </td>
                  <td>
                    {b.status === "confirmed" || b.status === "checked_in" ? (
                      <strong className="mono" style={{ fontSize: "1.1rem", letterSpacing: "0.08em" }}>
                        {b.ownerOtp ?? "—"}
                      </strong>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td>
                    {formatInrFromPaise(b.totalAmountInPaise)}
                    <div style={{ color: "var(--muted)", fontSize: "0.8rem" }}>
                      Fee {formatInrFromPaise(b.platformFeeInPaise)}
                    </div>
                  </td>
                  <td>
                    <StatusBadge status={b.status} />
                  </td>
                  <td>
                    {canChat(b.status) ? (
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => setChatBooking(b)}
                      >
                        Chat
                      </button>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
              {items.length === 0 ? (
                <tr>
                  <td colSpan={7} className="empty">
                    No customer bookings yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      {chatBooking ? (
        <BookingChatModal
          bookingId={String(chatBooking.id)}
          title={`Chat · Booking #${chatBooking.id}`}
          peerLabel="customer"
          onClose={() => setChatBooking(null)}
        />
      ) : null}
    </>
  );
}
