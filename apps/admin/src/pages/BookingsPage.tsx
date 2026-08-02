import { useCallback, useEffect, useState } from "react";
import { api, formatInrFromPaise, qs } from "../api";
import { Paginated, ParkingStats } from "../types";
import { KpiCard } from "../components/KpiCard";
import { Pagination } from "../components/Pagination";
import { StatusBadge } from "../components/StatusBadge";
import { useToast } from "../components/Toast";
import { useDebouncedValue } from "../hooks/useDebouncedValue";

type Booking = {
  id: string;
  slotId: string | null;
  listingId: string | null;
  apartmentId: string | null;
  renterUserId: string;
  ownerUserId: string | null;
  status: string;
  startAt: string;
  endAt: string;
  amountInPaise: number;
  totalAmountInPaise?: number;
  paymentStatus: string;
  vehicleNumber?: string | null;
  checkInCode: string;
  createdAt: string;
};

export function BookingsPage() {
  const toast = useToast();
  const [stats, setStats] = useState<ParkingStats | null>(null);
  const [data, setData] = useState<Paginated<Booking> | null>(null);
  const [q, setQ] = useState("");
  const search = useDebouncedValue(q.trim(), 350);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setPage(1);
  }, [search]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [list, s] = await Promise.all([
        api.get<Paginated<Booking>>(`/parking/bookings${qs({ page, limit: 8, q: search })}`),
        api.get<ParkingStats>("/parking/stats"),
      ]);
      setData(list);
      setStats(s);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load bookings");
    } finally {
      setLoading(false);
    }
  }, [page, search, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onCancel(item: Booking) {
    if (!window.confirm("Cancel this booking?")) return;
    try {
      await api.delete(`/parking/bookings/${item.id}`);
      toast.success("Booking cancelled");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Cancel failed");
    }
  }

  return (
    <>
      <div className="topbar">
        <div>
          <h2>Bookings</h2>
          <p>Track parking bookings and cancel when needed.</p>
        </div>
      </div>

      <div className="kpi-grid">
        <KpiCard label="Total bookings" value={stats?.bookingsTotal ?? "—"} />
        <KpiCard label="Active bookings" value={stats?.bookingsActive ?? "—"} />
        <KpiCard label="Approved listings" value={stats?.approved ?? stats?.slotsApproved ?? "—"} />
        <KpiCard label="Pending verification" value={stats?.pendingVerification ?? stats?.slotsPending ?? "—"} />
      </div>

      <section className="panel">
        <div className="panel-head">
          <h3>Booking list</h3>
          <div className="toolbar">
            <input
              className="search"
              placeholder="Search booking id, listing, status…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
        </div>

        {loading && !data ? <p className="loading">Loading…</p> : null}

        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Booking</th>
                <th>Schedule</th>
                <th>Vehicle / payment</th>
                <th>Amount</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {(data?.items ?? []).map((item) => {
                const refId = item.listingId ?? item.slotId;
                const amount = item.totalAmountInPaise || item.amountInPaise;
                return (
                  <tr key={item.id}>
                    <td>
                      <div className="mono">{item.id.slice(0, 8)}…</div>
                      <div style={{ color: "var(--muted)", fontSize: "0.85rem" }}>
                        {item.listingId ? "Listing" : "Slot"} {refId ? `${refId.slice(0, 8)}…` : "—"}
                      </div>
                    </td>
                    <td>
                      {new Date(item.startAt).toLocaleString()}
                      <div style={{ color: "var(--muted)", fontSize: "0.85rem" }}>
                        to {new Date(item.endAt).toLocaleString()}
                      </div>
                    </td>
                    <td>
                      {item.vehicleNumber ?? "—"}
                      <div style={{ color: "var(--muted)", fontSize: "0.85rem" }}>
                        Pay: {item.paymentStatus}
                      </div>
                    </td>
                    <td>{formatInrFromPaise(amount)}</td>
                    <td>
                      <StatusBadge status={item.status} />
                    </td>
                    <td>
                      {item.status !== "cancelled" && item.status !== "completed" ? (
                        <button
                          type="button"
                          className="btn btn-danger btn-sm"
                          onClick={() => void onCancel(item)}
                        >
                          Cancel
                        </button>
                      ) : (
                        <span style={{ color: "var(--muted)" }}>—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {data && data.items.length === 0 ? (
                <tr>
                  <td colSpan={6} className="empty">
                    No bookings yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        {data ? (
          <Pagination
            page={data.page}
            totalPages={data.totalPages}
            total={data.total}
            onPageChange={setPage}
          />
        ) : null}
      </section>
    </>
  );
}
