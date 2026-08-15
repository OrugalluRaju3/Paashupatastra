import { FormEvent, useCallback, useEffect, useState } from "react";
import { api, formatInrFromPaise, qs } from "../api";
import { InvoiceListPanel, type InvoiceListItem } from "../components/InvoiceListPanel";
import { KpiCard } from "../components/KpiCard";
import { Pagination } from "../components/Pagination";
import { StatusBadge } from "../components/StatusBadge";
import { useToast } from "../components/Toast";
import { sevaCategoryLabel } from "../lib/sevaCategories";
import type { Paginated } from "../types";

type Stats = {
  providers: number;
  workers: number;
  offerings: number;
  bookingsActive: number;
  bookingsCompleted: number;
};

type ReportSummary = {
  providers: number;
  workers: number;
  offerings: number;
  bookingsRequested: number;
  bookingsActive: number;
  bookingsCompleted: number;
  bookingsCancelled: number;
  revenuePaidInPaise: number;
  revenuePendingInPaise: number;
  invoicesCount: number;
  invoicesPaidCount: number;
  platformFeeBps: number;
};

type PlatformFee = {
  id: string;
  feeType: string;
  percentageBps: number;
  flatFeeInPaise: number;
  isActive: boolean;
};

const emptyPlatformFeeForm = {
  feeType: "percentage",
  percentageBps: "1000",
  flatFeeInr: "0",
  isActive: "true",
};

type Provider = {
  id: number | string;
  fullName: string;
  email: string | null;
  city: string;
  state: string;
  pinCode: string;
  isOnline: boolean;
  isApproved: boolean;
  isActive: boolean;
  serviceRadiusKm: number;
  createdAt: string;
};

type Worker = {
  id: number | string;
  providerId: number | string;
  fullName: string;
  mobile: string;
  email: string | null;
  skills: string;
  isAvailable: boolean;
  isActive: boolean;
  createdAt: string;
};

type Offering = {
  id: number | string;
  providerId: number | string;
  category: string;
  title: string;
  durationMinutes: number;
  amountInPaise: number;
  isActive: boolean;
  createdAt: string;
};

type SevaBooking = {
  id: number | string;
  customerUserId: number | string;
  providerId: number | string;
  category: string;
  title: string;
  serviceAddress: string;
  scheduledAt: string;
  amountInPaise: number;
  totalAmountInPaise: number;
  paymentStatus: string;
  status: string;
  workerName: string | null;
  createdAt: string;
};

type CustomerRow = {
  customerUserId: number | string;
  name: string | null;
  phone: string;
  email: string | null;
  isActive: boolean;
  city: string | null;
  createdAt: string;
  bookingsCount: number;
  lastBookingAt: string | null;
  totalPaidInPaise: number;
};

type SevaInvoice = InvoiceListItem & {
  bookingId: string | number;
};

type StaffTab =
  | "providers"
  | "workers"
  | "offerings"
  | "bookings"
  | "invoices"
  | "customers"
  | "settings"
  | "reports";

export function SevaStaffPage() {
  const toast = useToast();
  const [tab, setTab] = useState<StaffTab>("providers");
  const [stats, setStats] = useState<Stats | null>(null);
  const [reportSummary, setReportSummary] = useState<ReportSummary | null>(null);
  const [page, setPage] = useState(1);
  const [providers, setProviders] = useState<Paginated<Provider> | null>(null);
  const [workers, setWorkers] = useState<Paginated<Worker> | null>(null);
  const [offerings, setOfferings] = useState<Paginated<Offering> | null>(null);
  const [bookings, setBookings] = useState<Paginated<SevaBooking> | null>(null);
  const [invoices, setInvoices] = useState<Paginated<SevaInvoice> | null>(null);
  const [customers, setCustomers] = useState<Paginated<CustomerRow> | null>(null);
  const [platformFees, setPlatformFees] = useState<PlatformFee[]>([]);
  const [platformFeeForm, setPlatformFeeForm] = useState(emptyPlatformFeeForm);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [savingFee, setSavingFee] = useState(false);

  useEffect(() => {
    setPage(1);
  }, [tab]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setStats(await api.get<Stats>("/seva/stats"));
      if (tab === "reports") {
        setReportSummary(await api.get<ReportSummary>("/seva/reports/summary"));
      } else if (tab === "providers") {
        setProviders(await api.get<Paginated<Provider>>(`/seva/providers${qs({ page, limit: 10 })}`));
      } else if (tab === "workers") {
        setWorkers(await api.get<Paginated<Worker>>(`/seva/workers${qs({ page, limit: 10 })}`));
      } else if (tab === "offerings") {
        setOfferings(await api.get<Paginated<Offering>>(`/seva/offerings${qs({ page, limit: 10 })}`));
      } else if (tab === "bookings") {
        setBookings(await api.get<Paginated<SevaBooking>>(`/seva/bookings${qs({ page, limit: 10 })}`));
      } else if (tab === "invoices") {
        setInvoices(await api.get<Paginated<SevaInvoice>>(`/seva/invoices${qs({ page, limit: 10 })}`));
      } else if (tab === "customers") {
        setCustomers(
          await api.get<Paginated<CustomerRow>>(`/seva/reports/customers${qs({ page, limit: 10 })}`),
        );
      } else if (tab === "settings") {
        const fees = await api.get<{ items: PlatformFee[] }>("/seva/settings/platform-fees");
        setPlatformFees(fees.items ?? []);
        setReportSummary(await api.get<ReportSummary>("/seva/reports/summary"));
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load Seva data");
    } finally {
      setLoading(false);
    }
  }, [page, tab, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onCreatePlatformFee(e: FormEvent) {
    e.preventDefault();
    setSavingFee(true);
    try {
      const percentageBps = Number(platformFeeForm.percentageBps);
      const flatFeeInPaise = Math.round(Number(platformFeeForm.flatFeeInr || 0) * 100);
      await api.post("/seva/settings/platform-fees", {
        feeType: platformFeeForm.feeType,
        percentageBps: Number.isFinite(percentageBps) ? percentageBps : 1000,
        flatFeeInPaise: Number.isFinite(flatFeeInPaise) ? flatFeeInPaise : 0,
        isActive: platformFeeForm.isActive === "true",
      });
      toast.success("Platform fee saved");
      setPlatformFeeForm(emptyPlatformFeeForm);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save platform fee");
    } finally {
      setSavingFee(false);
    }
  }

  async function deletePlatformFee(id: string) {
    if (!window.confirm("Delete this platform fee setting?")) return;
    setBusyId(id);
    try {
      await api.delete(`/seva/settings/platform-fees/${id}`);
      toast.success("Platform fee deleted");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setBusyId(null);
    }
  }

  async function patchProvider(
    id: number | string,
    body: { isApproved?: boolean; isActive?: boolean; isOnline?: boolean },
  ) {
    setBusyId(String(id));
    try {
      await api.patch(`/seva/providers/${id}`, body);
      toast.success("Provider updated");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Update failed");
    } finally {
      setBusyId(null);
    }
  }

  const tabs: Array<{ id: StaffTab; label: string }> = [
    { id: "providers", label: "Providers" },
    { id: "workers", label: "Workers" },
    { id: "offerings", label: "Offerings" },
    { id: "bookings", label: "Bookings" },
    { id: "invoices", label: "Invoices" },
    { id: "customers", label: "Customers" },
    { id: "settings", label: "Settings" },
    { id: "reports", label: "Reports" },
  ];

  const currentTotalPages =
    tab === "providers"
      ? (providers?.totalPages ?? 1)
      : tab === "workers"
        ? (workers?.totalPages ?? 1)
        : tab === "offerings"
          ? (offerings?.totalPages ?? 1)
          : tab === "bookings"
            ? (bookings?.totalPages ?? 1)
            : tab === "invoices"
              ? (invoices?.totalPages ?? 1)
            : tab === "customers"
              ? (customers?.totalPages ?? 1)
              : 1;

  const currentTotal =
    tab === "providers"
      ? (providers?.total ?? 0)
      : tab === "workers"
        ? (workers?.total ?? 0)
        : tab === "offerings"
          ? (offerings?.total ?? 0)
          : tab === "bookings"
            ? (bookings?.total ?? 0)
            : tab === "invoices"
              ? (invoices?.total ?? 0)
            : tab === "customers"
              ? (customers?.total ?? 0)
              : 0;

  return (
    <>
      <div className="topbar">
        <div>
          <h2>Housekeeping &amp; maintenance</h2>
          <p>Providers, workers, offerings, and service bookings.</p>
        </div>
        <button type="button" className="btn btn-ghost" onClick={() => void load()}>
          Refresh
        </button>
      </div>

      {tab === "reports" ? (
        <div className="kpi-grid">
          <KpiCard label="Providers" value={reportSummary?.providers ?? "—"} />
          <KpiCard label="Workers" value={reportSummary?.workers ?? "—"} />
          <KpiCard label="Offerings" value={reportSummary?.offerings ?? "—"} />
          <KpiCard label="Requested" value={reportSummary?.bookingsRequested ?? "—"} />
          <KpiCard label="Active bookings" value={reportSummary?.bookingsActive ?? "—"} />
          <KpiCard label="Completed" value={reportSummary?.bookingsCompleted ?? "—"} />
          <KpiCard label="Cancelled / rejected" value={reportSummary?.bookingsCancelled ?? "—"} />
          <KpiCard
            label="Revenue (paid)"
            value={
              reportSummary ? formatInrFromPaise(reportSummary.revenuePaidInPaise) : "—"
            }
          />
          <KpiCard
            label="Revenue (pending)"
            value={
              reportSummary ? formatInrFromPaise(reportSummary.revenuePendingInPaise) : "—"
            }
          />
          <KpiCard
            label="Invoices"
            value={reportSummary?.invoicesCount ?? "—"}
            hint={`${reportSummary?.invoicesPaidCount ?? 0} paid`}
          />
        </div>
      ) : (
        <div className="kpi-grid">
          <KpiCard label="Providers" value={stats?.providers ?? "—"} />
          <KpiCard label="Workers" value={stats?.workers ?? "—"} />
          <KpiCard label="Offerings" value={stats?.offerings ?? "—"} />
          <KpiCard label="Active bookings" value={stats?.bookingsActive ?? "—"} />
        </div>
      )}

      <div className="tabs" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            className={tab === t.id ? "tab active" : "tab"}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <section className="panel">
        <div className="panel-head">
          <h3>{tabs.find((t) => t.id === tab)?.label}</h3>
        </div>

        {loading ? <p className="loading">Loading…</p> : null}

        {tab === "providers" ? (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Location</th>
                  <th>Radius</th>
                  <th>Online</th>
                  <th>Approved</th>
                  <th>Status</th>
                  <th>Joined</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {(providers?.items ?? []).map((p) => (
                  <tr key={String(p.id)}>
                    <td>
                      <strong>{p.fullName}</strong>
                      <div style={{ color: "var(--muted)", fontSize: "0.85rem" }}>
                        {p.email ?? "—"}
                      </div>
                    </td>
                    <td>
                      {p.city}, {p.state} · {p.pinCode}
                    </td>
                    <td>{p.serviceRadiusKm} km</td>
                    <td>
                      <StatusBadge status={p.isOnline ? "active" : "inactive"} />
                    </td>
                    <td>
                      <StatusBadge status={p.isApproved ? "approved" : "pending"} />
                    </td>
                    <td>
                      <StatusBadge status={p.isActive ? "active" : "inactive"} />
                    </td>
                    <td>{new Date(p.createdAt).toLocaleDateString("en-IN")}</td>
                    <td>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem" }}>
                        {!p.isApproved ? (
                          <button
                            type="button"
                            className="btn btn-ghost"
                            disabled={busyId === String(p.id)}
                            onClick={() => void patchProvider(p.id, { isApproved: true })}
                          >
                            Approve
                          </button>
                        ) : null}
                        <button
                          type="button"
                          className="btn btn-ghost"
                          disabled={busyId === String(p.id)}
                          onClick={() =>
                            void patchProvider(p.id, { isActive: !p.isActive })
                          }
                        >
                          {p.isActive ? "Deactivate" : "Activate"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {(providers?.items.length ?? 0) === 0 && !loading ? (
                  <tr>
                    <td colSpan={8} className="empty">
                      No providers yet.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        ) : null}

        {tab === "workers" ? (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Mobile</th>
                  <th>Skills</th>
                  <th>Provider</th>
                  <th>Available</th>
                  <th>Joined</th>
                </tr>
              </thead>
              <tbody>
                {(workers?.items ?? []).map((w) => (
                  <tr key={String(w.id)}>
                    <td>
                      <strong>{w.fullName}</strong>
                      <div style={{ color: "var(--muted)", fontSize: "0.85rem" }}>
                        {w.email ?? "—"}
                      </div>
                    </td>
                    <td className="mono">{w.mobile}</td>
                    <td>{w.skills}</td>
                    <td>
                      <code>#{String(w.providerId)}</code>
                    </td>
                    <td>
                      <StatusBadge status={w.isAvailable ? "available" : "busy"} />
                    </td>
                    <td>{new Date(w.createdAt).toLocaleDateString("en-IN")}</td>
                  </tr>
                ))}
                {(workers?.items.length ?? 0) === 0 && !loading ? (
                  <tr>
                    <td colSpan={6} className="empty">
                      No workers yet.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        ) : null}

        {tab === "offerings" ? (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Service</th>
                  <th>Category</th>
                  <th>Duration</th>
                  <th>Amount</th>
                  <th>Provider</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {(offerings?.items ?? []).map((o) => (
                  <tr key={String(o.id)}>
                    <td>
                      <strong>{o.title}</strong>
                    </td>
                    <td>{sevaCategoryLabel(o.category)}</td>
                    <td>{o.durationMinutes} min</td>
                    <td className="mono">{formatInrFromPaise(o.amountInPaise)}</td>
                    <td>
                      <code>#{String(o.providerId)}</code>
                    </td>
                    <td>
                      <StatusBadge status={o.isActive ? "active" : "inactive"} />
                    </td>
                  </tr>
                ))}
                {(offerings?.items.length ?? 0) === 0 && !loading ? (
                  <tr>
                    <td colSpan={6} className="empty">
                      No offerings yet.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        ) : null}

        {tab === "bookings" ? (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Booking</th>
                  <th>Service</th>
                  <th>Address</th>
                  <th>Scheduled</th>
                  <th>Amount</th>
                  <th>Payment</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {(bookings?.items ?? []).map((b) => (
                  <tr key={String(b.id)}>
                    <td>
                      <code>#{String(b.id)}</code>
                      <div style={{ color: "var(--muted)", fontSize: "0.85rem" }}>
                        Customer #{String(b.customerUserId)} · Provider #{String(b.providerId)}
                      </div>
                    </td>
                    <td>
                      <strong>{b.title}</strong>
                      <div style={{ color: "var(--muted)", fontSize: "0.85rem" }}>
                        {sevaCategoryLabel(b.category)}
                        {b.workerName ? ` · ${b.workerName}` : ""}
                      </div>
                    </td>
                    <td>{b.serviceAddress}</td>
                    <td>{new Date(b.scheduledAt).toLocaleString("en-IN")}</td>
                    <td className="mono">
                      {formatInrFromPaise(b.totalAmountInPaise ?? b.amountInPaise)}
                    </td>
                    <td>
                      <StatusBadge status={b.paymentStatus} />
                    </td>
                    <td>
                      <StatusBadge status={b.status} />
                    </td>
                  </tr>
                ))}
                {(bookings?.items.length ?? 0) === 0 && !loading ? (
                  <tr>
                    <td colSpan={7} className="empty">
                      No bookings yet.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        ) : null}

        {tab === "invoices" ? (
          <InvoiceListPanel
            data={invoices}
            fallbackNumber={(inv) => `INV-SV-${inv.id}`}
            refLabel="Booking"
            refValue={(inv) => String(inv.bookingId)}
            downloadPath={(inv) => `/seva/invoices/${inv.id}/download`}
            emptyMessage="No invoices yet."
            onPageChange={setPage}
          />
        ) : null}

        {tab === "customers" ? (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>Contact</th>
                  <th>City</th>
                  <th>Bookings</th>
                  <th>Paid</th>
                  <th>Last booking</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {(customers?.items ?? []).map((c) => (
                  <tr key={String(c.customerUserId)}>
                    <td>
                      <strong>{c.name ?? "—"}</strong>
                      <div style={{ color: "var(--muted)", fontSize: "0.85rem" }}>
                        #{String(c.customerUserId)}
                      </div>
                    </td>
                    <td>
                      <div className="mono">{c.phone}</div>
                      <div style={{ color: "var(--muted)", fontSize: "0.85rem" }}>
                        {c.email ?? "—"}
                      </div>
                    </td>
                    <td>{c.city ?? "—"}</td>
                    <td>{c.bookingsCount}</td>
                    <td className="mono">{formatInrFromPaise(c.totalPaidInPaise)}</td>
                    <td>
                      {c.lastBookingAt
                        ? new Date(c.lastBookingAt).toLocaleDateString("en-IN")
                        : "—"}
                    </td>
                    <td>
                      <StatusBadge status={c.isActive ? "active" : "inactive"} />
                    </td>
                  </tr>
                ))}
                {(customers?.items.length ?? 0) === 0 && !loading ? (
                  <tr>
                    <td colSpan={7} className="empty">
                      No customers yet.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        ) : null}

        {tab === "settings" && !loading ? (
          <div className="panel-body" style={{ padding: "1rem 1.25rem" }}>
            <p className="auth-sub" style={{ marginTop: 0 }}>
              Platform fee is applied when a customer creates a booking. Provider settlement credits
              the remaining amount to their wallet after job completion.
            </p>
            <div className="kpi-grid kpi-grid-compact" style={{ marginTop: "1rem", marginBottom: "1.25rem" }}>
              <KpiCard
                label="Active fee (approx %)"
                value={
                  reportSummary
                    ? `${(reportSummary.platformFeeBps / 100).toFixed(1)}%`
                    : "—"
                }
                hint="Used when fee type includes percentage"
              />
              <KpiCard
                label="Configured rows"
                value={platformFees.length}
                hint="Newest active row wins at booking time"
              />
            </div>

            <h4 style={{ marginTop: 0 }}>Platform fees</h4>
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Type</th>
                    <th>Percentage (bps)</th>
                    <th>Flat fee</th>
                    <th>Active</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {platformFees.map((f) => (
                    <tr key={f.id}>
                      <td>{f.feeType}</td>
                      <td>{f.percentageBps}</td>
                      <td>{formatInrFromPaise(f.flatFeeInPaise)}</td>
                      <td>
                        <StatusBadge status={f.isActive ? "active" : "inactive"} />
                      </td>
                      <td>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          disabled={busyId === f.id}
                          onClick={() => void deletePlatformFee(f.id)}
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                  {platformFees.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="empty">
                        No platform fees configured — bookings use the 10% default.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>

            <form className="withdraw-form" style={{ marginTop: "1rem" }} onSubmit={(e) => void onCreatePlatformFee(e)}>
              <div className="grid-2">
                <div className="field">
                  <label htmlFor="seva-pf-type">Fee type</label>
                  <select
                    id="seva-pf-type"
                    value={platformFeeForm.feeType}
                    onChange={(e) => setPlatformFeeForm((f) => ({ ...f, feeType: e.target.value }))}
                  >
                    <option value="percentage">Percentage</option>
                    <option value="flat">Flat</option>
                    <option value="both">Both</option>
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="seva-pf-bps">Percentage (bps, 1000 = 10%)</label>
                  <input
                    id="seva-pf-bps"
                    type="number"
                    min={0}
                    max={10000}
                    value={platformFeeForm.percentageBps}
                    onChange={(e) =>
                      setPlatformFeeForm((f) => ({ ...f, percentageBps: e.target.value }))
                    }
                  />
                </div>
                <div className="field">
                  <label htmlFor="seva-pf-flat">Flat fee (₹)</label>
                  <input
                    id="seva-pf-flat"
                    type="number"
                    min={0}
                    step={1}
                    value={platformFeeForm.flatFeeInr}
                    onChange={(e) =>
                      setPlatformFeeForm((f) => ({ ...f, flatFeeInr: e.target.value }))
                    }
                  />
                </div>
                <div className="field">
                  <label htmlFor="seva-pf-active">Active</label>
                  <select
                    id="seva-pf-active"
                    value={platformFeeForm.isActive}
                    onChange={(e) => setPlatformFeeForm((f) => ({ ...f, isActive: e.target.value }))}
                  >
                    <option value="true">Yes</option>
                    <option value="false">No</option>
                  </select>
                </div>
              </div>
              <div className="withdraw-actions" style={{ marginTop: "0.75rem" }}>
                <button type="submit" className="btn btn-primary" disabled={savingFee}>
                  {savingFee ? "Saving…" : "Add platform fee"}
                </button>
              </div>
            </form>
          </div>
        ) : null}

        {tab === "reports" && !loading ? (
          <div className="panel-body" style={{ padding: "1rem 1.25rem" }}>
            <p className="auth-sub" style={{ marginTop: 0 }}>
              Snapshot of housekeeping &amp; maintenance marketplace health. Use the KPI cards
              above for totals; open other tabs for row-level detail.
            </p>
          </div>
        ) : null}

        {tab !== "settings" && tab !== "reports" && tab !== "invoices" && currentTotalPages > 1 ? (
          <Pagination
            page={page}
            totalPages={currentTotalPages}
            total={currentTotal}
            onPageChange={setPage}
          />
        ) : null}
      </section>
    </>
  );
}
