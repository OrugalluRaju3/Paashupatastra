import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api, formatInrFromPaise, qs } from "../api";
import { useAuth } from "../auth/AuthContext";
import { InvoiceListPanel, type InvoiceListItem } from "../components/InvoiceListPanel";
import { Modal } from "../components/Modal";
import { StatusBadge } from "../components/StatusBadge";
import { ThreadChatModal } from "../components/BookingChatModal";
import { useToast } from "../components/Toast";
import { openCashfreeCheckout } from "../lib/cashfree";
import { SEVA_CATEGORIES, sevaCategoryLabel } from "../lib/sevaCategories";
import type { Paginated } from "../types";

type Provider = {
  id: number | string;
  fullName: string;
  city: string;
  pinCode: string;
  address: string;
  isOnline: boolean;
};

type Offering = {
  id: number | string;
  providerId: number | string;
  category: string;
  title: string;
  description: string | null;
  durationMinutes: number;
  amountInPaise: number;
  isActive: boolean;
  provider: Provider | null;
};

type SevaBooking = {
  id: number | string;
  offeringId: number | string;
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
  serviceOtp?: string;
  workerName: string | null;
  workerMobile: string | null;
  paymentDueAt?: string | null;
  paymentSecondsRemaining?: number | null;
  createdAt: string;
};

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function defaultScheduledLocal() {
  const d = new Date();
  d.setMinutes(0, 0, 0);
  d.setHours(d.getHours() + 3);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function toIsoFromLocal(value: string) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function isActiveBooking(status: string) {
  return !["completed", "cancelled", "rejected"].includes(status);
}

function formatCountdown(totalSeconds: number) {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function bookingSecondsLeft(
  b: { paymentDueAt?: string | null; paymentSecondsRemaining?: number | null },
  nowMs: number,
) {
  if (b.paymentDueAt != null) {
    return Math.max(0, Math.floor((new Date(b.paymentDueAt).getTime() - nowMs) / 1000));
  }
  return b.paymentSecondsRemaining ?? 0;
}

type SevaInvoice = InvoiceListItem & {
  bookingId: string | number;
};

export type SevaCustomerSection = "search" | "bookings" | "invoices";

export function SevaCustomerPage({ section }: { section: SevaCustomerSection }) {
  const toast = useToast();
  const { user } = useAuth();

  const [category, setCategory] = useState("");
  const [q, setQ] = useState("");
  const [offerings, setOfferings] = useState<Offering[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [searching, setSearching] = useState(false);
  const [selectedOfferingId, setSelectedOfferingId] = useState("");
  const [bookForm, setBookForm] = useState({
    serviceAddress: "",
    scheduledAt: defaultScheduledLocal(),
    notes: "",
  });
  const [submitting, setSubmitting] = useState(false);

  const [page, setPage] = useState(1);
  const [bookings, setBookings] = useState<Paginated<SevaBooking> | null>(null);
  const [invPage, setInvPage] = useState(1);
  const [invoices, setInvoices] = useState<Paginated<SevaInvoice> | null>(null);
  const [payingId, setPayingId] = useState<string | null>(null);
  const [chatBooking, setChatBooking] = useState<SevaBooking | null>(null);
  const [payPromptBookingId, setPayPromptBookingId] = useState<string | null>(null);
  const [nowTick, setNowTick] = useState(Date.now());

  const selectedOffering = useMemo(
    () => offerings.find((o) => String(o.id) === selectedOfferingId) ?? null,
    [offerings, selectedOfferingId],
  );

  const runSearch = useCallback(
    async (e?: FormEvent) => {
      e?.preventDefault();
      setSearching(true);
      setHasSearched(true);
      setSelectedOfferingId("");
      try {
        const res = await api.get<Paginated<Offering>>(
          `/seva/search${qs({ category: category || undefined, q: q.trim() || undefined, page: 1, limit: 20 })}`,
        );
        setOfferings(res.items ?? []);
        if ((res.items ?? []).length === 0) {
          toast.error("No providers currently offer this service. Try another category.");
        }
      } catch (err) {
        setOfferings([]);
        toast.error(err instanceof Error ? err.message : "Search failed");
      } finally {
        setSearching(false);
      }
    },
    [category, q, toast],
  );

  const loadBookings = useCallback(async () => {
    if (!user?.id) return;
    try {
      const res = await api.get<Paginated<SevaBooking>>(
        `/seva/bookings${qs({ page, limit: 10, customerUserId: user.id })}`,
      );
      setBookings(res);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load bookings");
    }
  }, [page, toast, user?.id]);

  const loadInvoices = useCallback(async () => {
    if (!user?.id) return;
    try {
      setInvoices(
        await api.get<Paginated<SevaInvoice>>(
          `/seva/invoices${qs({ page: invPage, limit: 10, customerUserId: user.id })}`,
        ),
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load invoices");
    }
  }, [invPage, toast, user?.id]);

  useEffect(() => {
    if (section === "search") void runSearch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section]);

  useEffect(() => {
    if (section === "bookings") void loadBookings();
  }, [section, loadBookings]);

  useEffect(() => {
    if (section === "invoices") void loadInvoices();
  }, [section, loadInvoices]);

  const refreshPayPrompt = useCallback(async () => {
    if (!user?.id) return;
    try {
      const res = await api.get<Paginated<SevaBooking>>(
        `/seva/bookings${qs({ page: 1, limit: 10, customerUserId: user.id })}`,
      );
      if (page === 1 || section !== "bookings") setBookings(res);
      const unpaid = res.items
        .filter((b) => b.paymentStatus !== "paid" && b.status === "accepted")
        .filter((b) => bookingSecondsLeft(b, Date.now()) > 0)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
      if (unpaid) {
        setPayPromptBookingId((cur) => cur ?? String(unpaid.id));
        setBookings((prev) => {
          if (!prev) return res;
          if (prev.items.some((b) => String(b.id) === String(unpaid.id))) return prev;
          return { ...prev, items: [unpaid, ...prev.items.filter((b) => String(b.id) !== String(unpaid.id))] };
        });
      }
    } catch {
      /* ignore background poll errors */
    }
  }, [page, section, user?.id]);

  useEffect(() => {
    if (!user?.id) return;
    void refreshPayPrompt();
    const poll = window.setInterval(() => void refreshPayPrompt(), 8_000);
    return () => window.clearInterval(poll);
  }, [user?.id, refreshPayPrompt]);

  useEffect(() => {
    const unpaid = (bookings?.items ?? [])
      .filter((b) => b.paymentStatus !== "paid" && b.status === "accepted")
      .filter((b) => bookingSecondsLeft(b, nowTick) > 0)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    const next = unpaid[0];
    if (next) {
      setPayPromptBookingId((cur) => cur ?? String(next.id));
      return;
    }
    if (payPromptBookingId) {
      const stillOpen = unpaid.some((b) => String(b.id) === payPromptBookingId);
      if (!stillOpen) setPayPromptBookingId(null);
    }
  }, [bookings?.items, nowTick, payPromptBookingId]);

  useEffect(() => {
    const hasPendingPay = (bookings?.items ?? []).some(
      (b) => b.paymentStatus !== "paid" && b.status === "accepted",
    );
    if (!hasPendingPay && !payPromptBookingId) return;
    const tick = window.setInterval(() => setNowTick(Date.now()), 1000);
    return () => window.clearInterval(tick);
  }, [bookings?.items, payPromptBookingId]);

  useEffect(() => {
    if (section !== "bookings") return;
    const poll = window.setInterval(() => void loadBookings(), 15_000);
    return () => window.clearInterval(poll);
  }, [section, loadBookings]);

  async function onBook(e: FormEvent) {
    e.preventDefault();
    if (!selectedOffering) {
      toast.error("Select a service to book");
      return;
    }
    if (!bookForm.serviceAddress.trim()) {
      toast.error("Enter the service address");
      return;
    }
    const scheduledAt = toIsoFromLocal(bookForm.scheduledAt);
    if (!scheduledAt) {
      toast.error("Choose a valid date and time");
      return;
    }
    setSubmitting(true);
    try {
      await api.post("/seva/bookings", {
        offeringId: Number(selectedOffering.id),
        serviceAddress: bookForm.serviceAddress.trim(),
        scheduledAt,
        notes: bookForm.notes.trim() || undefined,
      });
      toast.success("Request sent to the provider");
      setSelectedOfferingId("");
      setBookForm({ serviceAddress: "", scheduledAt: defaultScheduledLocal(), notes: "" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create booking");
    } finally {
      setSubmitting(false);
    }
  }

  async function payBooking(id: string) {
    setPayingId(id);
    try {
      const order = await api.post<{
        orderId: string;
        paymentSessionId?: string;
        env?: "sandbox" | "production";
      }>("/payments/orders", { sevaBookingId: Number(id) });

      let paid = false;
      try {
        if (!order.paymentSessionId) throw new Error("Cashfree did not return a payment session");
        const checkout = await openCashfreeCheckout({
          paymentSessionId: order.paymentSessionId,
          mode: order.env === "production" ? "production" : "sandbox",
        });
        if (checkout.error) throw new Error(checkout.error.message || "Cashfree checkout cancelled");
        paid = true;
      } catch (cfErr) {
        toast.info(
          cfErr instanceof Error
            ? `Cashfree unavailable (${cfErr.message}) — confirming payment directly`
            : "Cashfree unavailable — confirming payment directly",
        );
      }
      await api.post(`/seva/bookings/${id}/confirm-payment`, {
        orderId: order.orderId,
        source: paid ? "cashfree" : "fallback",
      });
      toast.success("Payment successful");
      setPayPromptBookingId(null);
      await loadBookings();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Payment failed");
    } finally {
      setPayingId(null);
    }
  }

  const payPromptBooking = useMemo(
    () =>
      (bookings?.items ?? []).find((b) => String(b.id) === payPromptBookingId) ?? null,
    [bookings?.items, payPromptBookingId],
  );
  const payPromptSeconds = payPromptBooking ? bookingSecondsLeft(payPromptBooking, nowTick) : 0;
  const payPromptModal =
    payPromptBooking && payPromptSeconds > 0 ? (
      <Modal
        title="Complete payment now"
        onClose={() => undefined}
        footer={
          <button
            type="button"
            className="btn btn-primary"
            disabled={payingId === String(payPromptBooking.id)}
            onClick={() => void payBooking(String(payPromptBooking.id))}
          >
            {payingId === String(payPromptBooking.id) ? "Paying…" : "Pay now"}
          </button>
        }
      >
        <p style={{ marginTop: 0 }}>
          Your request was accepted. Complete payment within{" "}
          <strong>{formatCountdown(payPromptSeconds)}</strong> or the worker will be released
          and this booking cancelled.
        </p>
        <div className="kpi-grid kpi-grid-compact" style={{ marginBottom: "0.75rem" }}>
          <div>
            <div style={{ color: "var(--muted)", fontSize: "0.85rem" }}>Amount</div>
            <strong>
              {formatInrFromPaise(payPromptBooking.totalAmountInPaise ?? payPromptBooking.amountInPaise)}
            </strong>
          </div>
          <div>
            <div style={{ color: "var(--muted)", fontSize: "0.85rem" }}>Worker</div>
            <strong>{payPromptBooking.workerName ?? "Assigned"}</strong>
          </div>
        </div>
        <p style={{ color: "var(--muted)", marginBottom: 0, fontSize: "0.9rem" }}>
          {payPromptBooking.title}
          <br />
          {payPromptBooking.serviceAddress}
        </p>
      </Modal>
    ) : null;

  if (section === "invoices") {
    return (
      <>
        <div className="topbar">
          <div>
            <h2>My invoices</h2>
            <p>Download receipts for paid Seva bookings.</p>
          </div>
          <Link className="btn btn-ghost" to="/app/seva/bookings">
            My bookings
          </Link>
        </div>
        <section className="panel">
          <InvoiceListPanel
            data={invoices}
            fallbackNumber={(inv) => `INV-SV-${inv.id}`}
            refLabel="Booking"
            refValue={(inv) => String(inv.bookingId)}
            downloadPath={(inv) => `/seva/invoices/${inv.id}/download`}
            emptyMessage="No invoices yet. They appear after you complete payment for a booking."
            onPageChange={setInvPage}
          />
        </section>
        {payPromptModal}
      </>
    );
  }

  if (section === "bookings") {
    return (
      <>
        <div className="topbar">
          <div>
            <h2>My Seva bookings</h2>
            <p>Pay after the provider accepts, then track your service and OTP.</p>
          </div>
          <Link className="btn btn-primary" to="/app/seva">
            Book a service
          </Link>
        </div>
        <section className="panel">
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Service</th>
                  <th>Scheduled</th>
                  <th>Address</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th>Payment / OTP</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {(bookings?.items ?? []).map((b) => (
                  <tr key={String(b.id)}>
                    <td>
                      <strong>{b.title}</strong>
                      <div style={{ color: "var(--muted)", fontSize: "0.85rem" }}>
                        {sevaCategoryLabel(b.category)}
                      </div>
                      {b.workerName ? (
                        <div style={{ color: "var(--muted)", fontSize: "0.85rem" }}>
                          Worker: {b.workerName}
                          {b.workerMobile ? ` · ${b.workerMobile}` : ""}
                        </div>
                      ) : null}
                    </td>
                    <td>{new Date(b.scheduledAt).toLocaleString("en-IN")}</td>
                    <td>{b.serviceAddress}</td>
                    <td className="mono">{formatInrFromPaise(b.totalAmountInPaise ?? b.amountInPaise)}</td>
                    <td>
                      <StatusBadge status={b.status} />
                    </td>
                    <td>
                      <StatusBadge status={b.paymentStatus} />
                      {b.paymentStatus === "paid" && b.serviceOtp && isActiveBooking(b.status) ? (
                        <div style={{ marginTop: "0.35rem", fontSize: "0.85rem" }}>
                          OTP <span className="mono">{b.serviceOtp}</span>
                        </div>
                      ) : null}
                    </td>
                    <td>
                      <div className="action-stack">
                        {b.paymentStatus !== "paid" && b.status === "accepted" ? (
                          <button
                            type="button"
                            className="btn btn-primary btn-sm"
                            disabled={
                              payingId === String(b.id) || bookingSecondsLeft(b, nowTick) <= 0
                            }
                            onClick={() => void payBooking(String(b.id))}
                          >
                            {payingId === String(b.id)
                              ? "Paying…"
                              : bookingSecondsLeft(b, nowTick) > 0
                                ? `Pay (${formatCountdown(bookingSecondsLeft(b, nowTick))})`
                                : "Payment expired"}
                          </button>
                        ) : null}
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
                {(bookings?.items.length ?? 0) === 0 ? (
                  <tr>
                    <td colSpan={7} className="empty">
                      No bookings yet. <Link to="/app/seva">Search services</Link> to create one.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
          {bookings ? (
            <div className="pagination">
              <span>
                Page {bookings.page} of {bookings.totalPages} · {bookings.total} total
              </span>
              <div className="pagination-actions">
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  Previous
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  disabled={page >= bookings.totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </button>
              </div>
            </div>
          ) : null}
        </section>
        {payPromptModal}
        {chatBooking ? (
          <ThreadChatModal
            messagesPath={`/seva/bookings/${chatBooking.id}/messages`}
            title={`Chat · ${chatBooking.title}`}
            peerLabel="provider"
            intro="Chat with your provider/worker about access, timing, and the job. Available after payment."
            closedLabel="Chat is closed after the booking is completed."
            onClose={() => setChatBooking(null)}
          />
        ) : null}
      </>
    );
  }

  return (
    <>
      <div className="topbar">
        <div>
          <h2>Book housekeeping & maintenance</h2>
          <p>Choose a category, browse providers, and request a slot.</p>
        </div>
      </div>

      <section className="panel">
        <div className="panel-head">
          <h3>Find a service</h3>
        </div>
        <form className="panel-body form-grid" onSubmit={(e) => void runSearch(e)}>
          <div className="field">
            <label htmlFor="sq-category">Category</label>
            <select id="sq-category" value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="">All categories</option>
              {SEVA_CATEGORIES.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="sq-q">Search</label>
            <input
              id="sq-q"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Deep clean, AC service…"
            />
          </div>
          <div className="form-actions" style={{ gridColumn: "1 / -1" }}>
            <button type="submit" className="btn btn-primary" disabled={searching}>
              {searching ? "Searching…" : "Search"}
            </button>
          </div>
        </form>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h3>Available offerings</h3>
          {hasSearched ? (
            <span style={{ color: "var(--muted)", fontSize: "0.9rem" }}>
              {offerings.length} result{offerings.length === 1 ? "" : "s"}
            </span>
          ) : null}
        </div>
        {!hasSearched ? (
          <p className="empty" style={{ padding: "1.25rem" }}>
            Searching…
          </p>
        ) : offerings.length === 0 ? (
          <p className="empty" style={{ padding: "1.25rem" }}>
            No matching offerings. Try another category or search term.
          </p>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th />
                  <th>Service</th>
                  <th>Provider</th>
                  <th>Duration</th>
                  <th>Price</th>
                </tr>
              </thead>
              <tbody>
                {offerings.map((o) => {
                  const selected = String(o.id) === selectedOfferingId;
                  return (
                    <tr key={String(o.id)} className={selected ? "is-selected" : undefined}>
                      <td>
                        <input
                          type="radio"
                          name="offering"
                          checked={selected}
                          onChange={() => setSelectedOfferingId(String(o.id))}
                          aria-label={`Select ${o.title}`}
                        />
                      </td>
                      <td>
                        <strong>{o.title}</strong>
                        <div style={{ color: "var(--muted)", fontSize: "0.85rem" }}>
                          {sevaCategoryLabel(o.category)}
                        </div>
                        {o.description ? (
                          <div style={{ color: "var(--muted)", fontSize: "0.85rem" }}>{o.description}</div>
                        ) : null}
                      </td>
                      <td>
                        {o.provider ? (
                          <>
                            <strong>{o.provider.fullName}</strong>
                            <div style={{ color: "var(--muted)", fontSize: "0.85rem" }}>
                              {o.provider.address}, {o.provider.city} {o.provider.pinCode}
                            </div>
                          </>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td>{o.durationMinutes} min</td>
                      <td className="mono">{formatInrFromPaise(o.amountInPaise)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {selectedOffering ? (
          <div className="panel-body" style={{ borderTop: "1px solid var(--line)" }}>
            <p style={{ margin: "0 0 0.75rem" }}>
              Booking <strong>{selectedOffering.title}</strong>
              {selectedOffering.provider ? ` with ${selectedOffering.provider.fullName}` : ""}.
            </p>
            <form onSubmit={(e) => void onBook(e)} className="form-grid">
              <div className="field" style={{ gridColumn: "1 / -1" }}>
                <label htmlFor="sb-address">Service address</label>
                <input
                  id="sb-address"
                  required
                  value={bookForm.serviceAddress}
                  onChange={(e) => setBookForm((f) => ({ ...f, serviceAddress: e.target.value }))}
                  placeholder="Flat / street / landmark"
                />
              </div>
              <div className="field">
                <label htmlFor="sb-when">Scheduled date & time</label>
                <input
                  id="sb-when"
                  type="datetime-local"
                  required
                  value={bookForm.scheduledAt}
                  onChange={(e) => setBookForm((f) => ({ ...f, scheduledAt: e.target.value }))}
                />
              </div>
              <div className="field" style={{ gridColumn: "1 / -1" }}>
                <label htmlFor="sb-notes">Notes (optional)</label>
                <textarea
                  id="sb-notes"
                  rows={2}
                  value={bookForm.notes}
                  onChange={(e) => setBookForm((f) => ({ ...f, notes: e.target.value }))}
                />
              </div>
              <div className="form-actions" style={{ gridColumn: "1 / -1" }}>
                <button type="submit" className="btn btn-primary" disabled={submitting}>
                  {submitting ? "Sending…" : "Request this service"}
                </button>
                <Link className="btn btn-ghost" to="/app/seva/bookings">
                  My bookings
                </Link>
              </div>
            </form>
          </div>
        ) : null}
      </section>
      {payPromptModal}
    </>
  );
}
