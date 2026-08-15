import { FormEvent, useCallback, useEffect, useState } from "react";
import { api, formatInrFromPaise } from "../api";
import { KpiCard } from "../components/KpiCard";
import { StatusBadge } from "../components/StatusBadge";
import { ThreadChatModal } from "../components/BookingChatModal";
import { useToast } from "../components/Toast";
import { sevaCategoryLabel } from "../lib/sevaCategories";

type Worker = {
  id: number | string;
  providerId: number | string;
  fullName: string;
  mobile: string;
  skills: string;
  isAvailable: boolean;
  isActive: boolean;
};

type SevaBooking = {
  id: number | string;
  providerId: number | string;
  category: string;
  title: string;
  serviceAddress: string;
  scheduledAt: string;
  notes: string | null;
  amountInPaise: number;
  totalAmountInPaise: number;
  paymentStatus: string;
  status: string;
  otpVerified: boolean;
  createdAt: string;
};

type WorkerMe = {
  phone: string;
  name: string | null;
  workers: Worker[];
  bookings: SevaBooking[];
};

function isDone(status: string) {
  return status === "completed" || status === "cancelled";
}

export function SevaWorkerPage() {
  const toast = useToast();
  const [me, setMe] = useState<WorkerMe | null>(null);
  const [loading, setLoading] = useState(true);
  const [otpByBooking, setOtpByBooking] = useState<Record<string, string>>({});
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [chatBooking, setChatBooking] = useState<SevaBooking | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setMe(await api.get<WorkerMe>("/seva/worker/me"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load worker console");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const poll = window.setInterval(() => void load(), 15_000);
    return () => window.clearInterval(poll);
  }, [load]);

  async function markOnTheWay(id: string) {
    setUpdatingId(id);
    try {
      await api.patch(`/seva/bookings/${id}/status`, { status: "on_the_way" });
      toast.success("Status → on the way");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update status");
    } finally {
      setUpdatingId(null);
    }
  }

  async function verifyOtp(e: FormEvent, id: string) {
    e.preventDefault();
    const otp = (otpByBooking[id] ?? "").trim();
    if (otp.length < 4) {
      toast.error("Enter the customer's service OTP");
      return;
    }
    setUpdatingId(id);
    try {
      await api.post(`/seva/bookings/${id}/verify-otp`, { otp });
      toast.success("OTP verified — job in progress");
      setOtpByBooking((m) => {
        const next = { ...m };
        delete next[id];
        return next;
      });
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "OTP verification failed");
    } finally {
      setUpdatingId(null);
    }
  }

  async function markCompleted(id: string) {
    setUpdatingId(id);
    try {
      await api.patch(`/seva/bookings/${id}/status`, { status: "completed" });
      toast.success("Job completed — provider wallet will be credited");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to mark completed");
    } finally {
      setUpdatingId(null);
    }
  }

  const activeBookings = (me?.bookings ?? []).filter((b) => !isDone(b.status));
  const pastBookings = (me?.bookings ?? []).filter((b) => isDone(b.status));

  return (
    <>
      <div className="topbar">
        <div>
          <h2>Worker console</h2>
          <p>
            {me?.name ? `${me.name} · ` : ""}
            {me?.phone ?? "—"} — assigned Seva jobs.
          </p>
        </div>
        <button type="button" className="btn btn-ghost" onClick={() => void load()}>
          Refresh
        </button>
      </div>

      {loading && !me ? <p className="loading">Loading…</p> : null}

      {me ? (
        <div className="kpi-grid kpi-grid-compact" style={{ marginBottom: "1rem" }}>
          <KpiCard label="Active jobs" value={activeBookings.length} />
          <KpiCard label="Completed" value={pastBookings.length} hint={`${me.bookings.length} total`} />
          <KpiCard label="Skills" value={me.workers[0]?.skills ?? "—"} />
        </div>
      ) : null}

      <section className="panel">
        <div className="panel-head">
          <h3>Active jobs ({activeBookings.length})</h3>
        </div>
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>When</th>
                <th>Service</th>
                <th>Payment</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {activeBookings.map((b) => (
                <tr key={String(b.id)}>
                  <td>{new Date(b.scheduledAt).toLocaleString("en-IN")}</td>
                  <td>
                    <strong>{b.title}</strong>
                    <div style={{ color: "var(--muted)", fontSize: "0.85rem" }}>
                      {sevaCategoryLabel(b.category)}
                    </div>
                    <div style={{ color: "var(--muted)", fontSize: "0.85rem" }}>{b.serviceAddress}</div>
                    {b.notes ? (
                      <div style={{ color: "var(--muted)", fontSize: "0.85rem" }}>{b.notes}</div>
                    ) : null}
                  </td>
                  <td>
                    {formatInrFromPaise(b.totalAmountInPaise ?? b.amountInPaise)}
                    <div style={{ color: "var(--muted)", fontSize: "0.85rem" }}>{b.paymentStatus}</div>
                  </td>
                  <td>
                    <StatusBadge status={b.status} />
                  </td>
                  <td>
                    <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                      {b.paymentStatus !== "paid" ? (
                        <span style={{ color: "var(--muted)", fontSize: "0.85rem" }}>
                          Waiting for customer payment
                        </span>
                      ) : b.status === "accepted" || b.status === "scheduled" ? (
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          disabled={updatingId === String(b.id)}
                          onClick={() => void markOnTheWay(String(b.id))}
                        >
                          Start — on the way
                        </button>
                      ) : b.status === "on_the_way" && !b.otpVerified ? (
                        <form
                          onSubmit={(e) => void verifyOtp(e, String(b.id))}
                          style={{ display: "flex", gap: "0.35rem", alignItems: "center", flexWrap: "wrap" }}
                        >
                          <input
                            aria-label="Customer service OTP"
                            placeholder="Customer OTP"
                            maxLength={8}
                            value={otpByBooking[String(b.id)] ?? ""}
                            onChange={(e) =>
                              setOtpByBooking((m) => ({
                                ...m,
                                [String(b.id)]: e.target.value.replace(/\D/g, "").slice(0, 8),
                              }))
                            }
                            style={{ width: "6.5rem" }}
                          />
                          <button type="submit" className="btn btn-primary btn-sm">
                            Verify → Start job
                          </button>
                        </form>
                      ) : b.status === "in_progress" && b.otpVerified ? (
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          disabled={updatingId === String(b.id)}
                          onClick={() => void markCompleted(String(b.id))}
                        >
                          Mark completed
                        </button>
                      ) : (
                        <span style={{ color: "var(--muted)", fontSize: "0.85rem" }}>In progress</span>
                      )}
                      {b.paymentStatus === "paid" ? (
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={() => setChatBooking(b)}
                        >
                          Chat
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
              {activeBookings.length === 0 ? (
                <tr>
                  <td colSpan={5} className="empty">
                    No active jobs. New jobs appear here once a provider assigns you.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      {pastBookings.length > 0 ? (
        <section className="panel">
          <div className="panel-head">
            <h3>Recent completed</h3>
          </div>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Service</th>
                  <th>Address</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {pastBookings.slice(0, 10).map((b) => (
                  <tr key={String(b.id)}>
                    <td>{new Date(b.scheduledAt).toLocaleString("en-IN")}</td>
                    <td>{b.title}</td>
                    <td>{b.serviceAddress}</td>
                    <td>
                      <StatusBadge status={b.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {chatBooking ? (
        <ThreadChatModal
          messagesPath={`/seva/bookings/${chatBooking.id}/messages`}
          title={`Chat · ${chatBooking.title}`}
          peerLabel="customer"
          intro="Chat with the customer about access, timing, and the job. Available after payment."
          closedLabel="Chat is closed after the booking is completed."
          onClose={() => setChatBooking(null)}
        />
      ) : null}
    </>
  );
}
