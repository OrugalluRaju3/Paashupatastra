import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { api, formatInrFromPaise, qs } from "../api";
import { InvoiceListPanel, type InvoiceListItem } from "../components/InvoiceListPanel";
import { KpiCard } from "../components/KpiCard";
import { Modal } from "../components/Modal";
import { StatusBadge } from "../components/StatusBadge";
import { ThreadChatModal } from "../components/BookingChatModal";
import { useToast } from "../components/Toast";
import { digitsPhone, isValidPhone } from "../lib/phone";
import { SEVA_CATEGORIES, sevaCategoryLabel, type SevaCategoryId } from "../lib/sevaCategories";
import type { Paginated } from "../types";

type Provider = {
  id: number | string;
  userId: number | string;
  fullName: string;
  email: string | null;
  address: string;
  city: string;
  state: string;
  pinCode: string;
  isOnline: boolean;
  isApproved: boolean;
  isActive: boolean;
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
};

type SevaBooking = {
  id: number | string;
  providerId: number | string;
  workerId: number | string | null;
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
  workerName: string | null;
  workerMobile: string | null;
  createdAt: string;
};

type Stats = {
  providers: number;
  offerings: number;
  bookingsActive: number;
  bookingsCompleted: number;
};

type SevaInvoice = InvoiceListItem & {
  bookingId: string | number;
};

type ProviderTab = "home" | "offerings" | "workers" | "requests" | "jobs" | "invoices";

const JOB_STATUSES = ["scheduled", "on_the_way", "in_progress", "completed", "cancelled"] as const;

function tabFromPath(pathname: string): ProviderTab {
  if (pathname.includes("/offerings")) return "offerings";
  if (pathname.includes("/workers")) return "workers";
  if (pathname.includes("/requests")) return "requests";
  if (pathname.includes("/jobs")) return "jobs";
  if (pathname.endsWith("/invoices") || pathname.includes("/invoices")) return "invoices";
  return "home";
}

function isNotFoundError(err: unknown) {
  return err instanceof Error && /not found/i.test(err.message);
}

const emptyWorkerForm = { fullName: "", mobile: "", email: "", skills: "cleaning" };

const emptyOfferingForm = {
  category: SEVA_CATEGORIES[0].id as SevaCategoryId,
  title: "",
  description: "",
  durationMinutes: "60",
  amountInr: "",
};

export function SevaProviderPage() {
  const toast = useToast();
  const location = useLocation();
  const navigate = useNavigate();
  const tab = useMemo(() => tabFromPath(location.pathname), [location.pathname]);

  const [profileLoading, setProfileLoading] = useState(true);
  const [provider, setProvider] = useState<Provider | null>(null);
  const [needsProfile, setNeedsProfile] = useState(false);
  const [togglingOnline, setTogglingOnline] = useState(false);
  const [stats, setStats] = useState<Stats | null>(null);
  const [wallet, setWallet] = useState<{
    balanceInPaise: number;
    pendingSettlementInPaise?: number;
  } | null>(null);

  const [offerings, setOfferings] = useState<Offering[]>([]);
  const [showOfferingModal, setShowOfferingModal] = useState(false);
  const [editingOffering, setEditingOffering] = useState<Offering | null>(null);
  const [offeringForm, setOfferingForm] = useState(emptyOfferingForm);
  const [savingOffering, setSavingOffering] = useState(false);

  const [workers, setWorkers] = useState<Worker[]>([]);
  const [showWorkerModal, setShowWorkerModal] = useState(false);
  const [workerForm, setWorkerForm] = useState(emptyWorkerForm);
  const [savingWorker, setSavingWorker] = useState(false);

  const [bookings, setBookings] = useState<SevaBooking[]>([]);
  const [decidingId, setDecidingId] = useState<string | null>(null);
  const [assignWorkerId, setAssignWorkerId] = useState<Record<string, string>>({});
  const [otpByBooking, setOtpByBooking] = useState<Record<string, string>>({});
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [chatBooking, setChatBooking] = useState<SevaBooking | null>(null);
  const [invPage, setInvPage] = useState(1);
  const [invoices, setInvoices] = useState<Paginated<SevaInvoice> | null>(null);

  const switchTab = (next: ProviderTab | "wallet") => {
    const paths: Record<ProviderTab | "wallet", string> = {
      home: "/app/provider",
      offerings: "/app/provider/offerings",
      workers: "/app/provider/workers",
      requests: "/app/provider/requests",
      jobs: "/app/provider/jobs",
      invoices: "/app/provider/invoices",
      wallet: "/app/provider/wallet",
    };
    navigate(paths[next]);
  };

  const loadProfile = useCallback(async () => {
    setProfileLoading(true);
    try {
      const me = await api.get<Provider>("/seva/providers/me");
      setProvider(me);
      setNeedsProfile(false);
    } catch (err) {
      if (isNotFoundError(err)) {
        setProvider(null);
        setNeedsProfile(true);
      } else {
        toast.error(err instanceof Error ? err.message : "Failed to load provider profile");
      }
    } finally {
      setProfileLoading(false);
    }
  }, [toast]);

  const loadStats = useCallback(async () => {
    try {
      setStats(await api.get<Stats>("/seva/stats"));
    } catch {
      /* non-critical */
    }
  }, []);

  const loadWallet = useCallback(async () => {
    try {
      setWallet(
        await api.get<{ balanceInPaise: number; pendingSettlementInPaise?: number }>(
          "/payments/wallets/me",
        ),
      );
    } catch {
      /* non-critical */
    }
  }, []);

  const loadOfferings = useCallback(async () => {
    if (!provider) return;
    try {
      const res = await api.get<{ items: Offering[] }>(
        `/seva/offerings${qs({ providerId: provider.id, limit: 50 })}`,
      );
      setOfferings(res.items ?? []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load offerings");
    }
  }, [provider, toast]);

  const loadWorkers = useCallback(async () => {
    if (!provider) return;
    try {
      const res = await api.get<{ items: Worker[] }>(`/seva/workers${qs({ providerId: provider.id })}`);
      setWorkers(res.items ?? []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load workers");
    }
  }, [provider, toast]);

  const loadBookings = useCallback(async () => {
    if (!provider) return;
    try {
      const res = await api.get<{ items: SevaBooking[] }>(
        `/seva/bookings${qs({ providerId: provider.id, limit: 100 })}`,
      );
      setBookings(res.items ?? []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load bookings");
    }
  }, [provider, toast]);

  const loadInvoices = useCallback(async () => {
    if (!provider) return;
    try {
      setInvoices(
        await api.get<Paginated<SevaInvoice>>(
          `/seva/invoices${qs({ page: invPage, limit: 10, providerId: provider.id })}`,
        ),
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load invoices");
    }
  }, [invPage, provider, toast]);

  useEffect(() => {
    void loadProfile();
    void loadStats();
    void loadWallet();
  }, [loadProfile, loadStats, loadWallet]);

  useEffect(() => {
    if (!provider) return;
    if (tab === "home" || tab === "offerings") void loadOfferings();
    if (tab === "home" || tab === "workers" || tab === "requests" || tab === "jobs") void loadWorkers();
    if (tab === "home" || tab === "requests" || tab === "jobs") void loadBookings();
    if (tab === "invoices") void loadInvoices();
  }, [provider, tab, loadOfferings, loadWorkers, loadBookings, loadInvoices]);

  async function onToggleOnline() {
    if (!provider) return;
    setTogglingOnline(true);
    try {
      const saved = await api.patch<Provider>("/seva/providers/me/online", {
        isOnline: !provider.isOnline,
      });
      setProvider(saved);
      toast.success(saved.isOnline ? "You are online" : "You are offline");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update online status");
    } finally {
      setTogglingOnline(false);
    }
  }

  function openCreateOffering() {
    setEditingOffering(null);
    setOfferingForm(emptyOfferingForm);
    setShowOfferingModal(true);
  }

  function openEditOffering(o: Offering) {
    setEditingOffering(o);
    setOfferingForm({
      category: o.category as SevaCategoryId,
      title: o.title,
      description: o.description ?? "",
      durationMinutes: String(o.durationMinutes),
      amountInr: String(o.amountInPaise / 100),
    });
    setShowOfferingModal(true);
  }

  async function onSaveOffering(e: FormEvent) {
    e.preventDefault();
    const durationMinutes = Number.parseInt(offeringForm.durationMinutes, 10);
    const amountInr = Number(offeringForm.amountInr);
    if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) {
      toast.error("Enter a valid duration in minutes");
      return;
    }
    if (!Number.isFinite(amountInr) || amountInr < 0) {
      toast.error("Enter a valid amount in INR");
      return;
    }
    setSavingOffering(true);
    try {
      const payload = {
        category: offeringForm.category,
        title: offeringForm.title.trim(),
        description: offeringForm.description.trim() || null,
        durationMinutes: Math.round(durationMinutes),
        amountInPaise: Math.round(amountInr * 100),
      };
      if (editingOffering) {
        await api.patch(`/seva/offerings/${editingOffering.id}`, payload);
        toast.success("Offering updated");
      } else {
        await api.post("/seva/offerings", payload);
        toast.success("Offering created");
      }
      setShowOfferingModal(false);
      await loadOfferings();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save offering");
    } finally {
      setSavingOffering(false);
    }
  }

  async function onToggleOfferingActive(o: Offering) {
    try {
      await api.patch(`/seva/offerings/${o.id}`, { isActive: !o.isActive });
      toast.success(o.isActive ? "Offering deactivated" : "Offering activated");
      await loadOfferings();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update offering");
    }
  }

  async function onAddWorker(e: FormEvent) {
    e.preventDefault();
    if (!workerForm.fullName.trim() || !workerForm.mobile.trim()) {
      toast.error("Enter worker name and mobile");
      return;
    }
    if (!isValidPhone(workerForm.mobile)) {
      toast.error("Enter a valid 10-digit mobile number");
      return;
    }
    setSavingWorker(true);
    try {
      await api.post("/seva/workers", {
        fullName: workerForm.fullName.trim(),
        mobile: workerForm.mobile.trim(),
        email: workerForm.email.trim() || undefined,
        skills: workerForm.skills.trim() || "cleaning",
      });
      toast.success("Worker added");
      setShowWorkerModal(false);
      setWorkerForm(emptyWorkerForm);
      await loadWorkers();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add worker");
    } finally {
      setSavingWorker(false);
    }
  }

  async function onDecide(bookingId: string, decision: "accept" | "reject") {
    const workerId = assignWorkerId[bookingId];
    if (decision === "accept" && !workerId) {
      toast.error("Assign a worker before accepting this request");
      return;
    }
    setDecidingId(bookingId);
    try {
      await api.post(`/seva/bookings/${bookingId}/decide`, {
        decision,
        workerId: decision === "accept" && workerId ? Number(workerId) : undefined,
      });
      toast.success(decision === "accept" ? "Request accepted" : "Request rejected");
      await loadBookings();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update request");
    } finally {
      setDecidingId(null);
    }
  }

  async function onAssignWorker(bookingId: string) {
    const workerId = assignWorkerId[bookingId];
    if (!workerId) {
      toast.error("Select a worker to assign");
      return;
    }
    setUpdatingId(bookingId);
    try {
      await api.post(`/seva/bookings/${bookingId}/assign-worker`, { workerId: Number(workerId) });
      toast.success("Worker assigned");
      await loadBookings();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to assign worker");
    } finally {
      setUpdatingId(null);
    }
  }

  async function onUpdateStatus(booking: SevaBooking, status: string) {
    const needsOtp = status === "in_progress" || status === "completed";
    const otp = (otpByBooking[String(booking.id)] ?? "").trim();
    if (needsOtp && !booking.otpVerified && status === "in_progress" && otp.length < 4) {
      toast.error("Enter the customer's service OTP to start the job");
      return;
    }
    if (status === "completed" && !booking.otpVerified) {
      toast.error("Verify OTP (set in progress) before completing");
      return;
    }
    setUpdatingId(String(booking.id));
    try {
      await api.patch(`/seva/bookings/${booking.id}/status`, {
        status,
        otp: status === "in_progress" && !booking.otpVerified ? otp : undefined,
      });
      toast.success(`Status → ${status.replaceAll("_", " ")}`);
      setOtpByBooking((m) => {
        const next = { ...m };
        delete next[String(booking.id)];
        return next;
      });
      await loadBookings();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update status");
    } finally {
      setUpdatingId(null);
    }
  }

  const requestBookings = bookings.filter((b) => b.status === "requested");
  const jobBookings = bookings.filter((b) => b.status !== "requested" && b.status !== "rejected");
  const activeJobCount = jobBookings.filter((b) => !["completed", "cancelled"].includes(b.status)).length;
  const availableWorkers = workers.filter((w) => w.isAvailable && w.isActive);

  const tabs: Array<{ id: ProviderTab | "wallet"; label: string }> = [
    { id: "home", label: "Home" },
    { id: "offerings", label: "Offerings" },
    { id: "workers", label: "Workers" },
    { id: "requests", label: "Requests" },
    { id: "jobs", label: "Jobs" },
    { id: "invoices", label: "Invoices" },
    { id: "wallet", label: "Wallet" },
  ];

  return (
    <>
      <div className="topbar">
        <div>
          <h2>Seva provider console</h2>
          <p>
            {provider ? `${provider.fullName} · ${provider.city}, ${provider.pinCode}` : "Manage offerings, workers, and jobs."}
          </p>
        </div>
        <button type="button" className="btn btn-ghost" onClick={() => void loadProfile()}>
          Refresh
        </button>
      </div>

      {needsProfile ? (
        <div className="panel" style={{ marginBottom: "1rem", borderColor: "var(--accent)" }}>
          <div className="panel-body">
            <p style={{ margin: 0 }}>
              <strong>No Seva provider profile found</strong> for this account yet. Complete signup as a
              Seva provider to go online and receive requests.
            </p>
          </div>
        </div>
      ) : null}

      <div className="tabs" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={t.id !== "wallet" && tab === t.id}
            className={t.id !== "wallet" && tab === t.id ? "tab active" : "tab"}
            onClick={() => switchTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {profileLoading && tab !== "home" ? <p className="loading">Loading…</p> : null}

      {tab === "home" ? (
        <>
          <section className="panel">
            <div className="panel-head">
              <h3>Overview</h3>
              {provider ? (
                <button
                  type="button"
                  className={provider.isOnline ? "btn btn-primary btn-sm" : "btn btn-ghost btn-sm"}
                  disabled={togglingOnline}
                  onClick={() => void onToggleOnline()}
                >
                  {togglingOnline
                    ? "Updating…"
                    : provider.isOnline
                      ? "Online — go offline"
                      : "Offline — go online"}
                </button>
              ) : null}
            </div>
            <div className="panel-body">
              {provider ? (
                <p>
                  Status: <StatusBadge status={provider.isOnline ? "active" : "inactive"} /> ·{" "}
                  {provider.address}
                </p>
              ) : null}
              <div className="kpi-grid kpi-grid-compact" style={{ marginTop: "1rem" }}>
                <KpiCard label="My offerings" value={offerings.length} />
                <KpiCard label="My workers" value={workers.length} />
                <KpiCard label="Pending requests" value={requestBookings.length} />
                <KpiCard label="Active jobs" value={activeJobCount} hint={`${jobBookings.length} total`} />
              </div>
              {wallet ? (
                <div className="kpi-grid kpi-grid-compact" style={{ marginTop: "0.75rem" }}>
                  <KpiCard
                    label="Available in wallet"
                    value={formatInrFromPaise(wallet.balanceInPaise)}
                    hint="Withdrawable after job settlements"
                  />
                  <KpiCard
                    label="Pending (admin wallet)"
                    value={formatInrFromPaise(wallet.pendingSettlementInPaise ?? 0)}
                    hint="Paid jobs not yet completed"
                  />
                </div>
              ) : null}
              {stats ? (
                <div className="kpi-grid kpi-grid-compact" style={{ marginTop: "0.75rem" }}>
                  <KpiCard label="Platform providers" value={stats.providers} />
                  <KpiCard label="Platform offerings" value={stats.offerings} />
                  <KpiCard label="Platform active bookings" value={stats.bookingsActive} />
                  <KpiCard label="Platform completed" value={stats.bookingsCompleted} />
                </div>
              ) : null}
              <div className="toolbar" style={{ marginTop: "1rem", gap: "0.5rem", flexWrap: "wrap" }}>
                <button type="button" className="btn btn-primary btn-sm" onClick={openCreateOffering}>
                  Add offering
                </button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => switchTab("requests")}>
                  View requests
                </button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => switchTab("invoices")}>
                  Invoices
                </button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => switchTab("wallet")}>
                  Open wallet
                </button>
              </div>
            </div>
          </section>
        </>
      ) : null}

      {tab === "offerings" ? (
        <section className="panel">
          <div className="panel-head">
            <h3>My offerings</h3>
            <button type="button" className="btn btn-primary btn-sm" onClick={openCreateOffering}>
              Add offering
            </button>
          </div>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Service</th>
                  <th>Category</th>
                  <th>Duration</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {offerings.map((o) => (
                  <tr key={String(o.id)}>
                    <td>
                      <strong>{o.title}</strong>
                      {o.description ? (
                        <div style={{ color: "var(--muted)", fontSize: "0.85rem" }}>{o.description}</div>
                      ) : null}
                    </td>
                    <td>{sevaCategoryLabel(o.category)}</td>
                    <td>{o.durationMinutes} min</td>
                    <td className="mono">{formatInrFromPaise(o.amountInPaise)}</td>
                    <td>
                      <StatusBadge status={o.isActive ? "active" : "inactive"} />
                    </td>
                    <td>
                      <div className="action-stack">
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={() => openEditOffering(o)}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={() => void onToggleOfferingActive(o)}
                        >
                          {o.isActive ? "Deactivate" : "Activate"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {offerings.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="empty">
                      No offerings yet. Add your first service to start receiving requests.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {tab === "workers" ? (
        <section className="panel">
          <div className="panel-head">
            <h3>My workers</h3>
            <button type="button" className="btn btn-primary btn-sm" onClick={() => setShowWorkerModal(true)}>
              Add worker
            </button>
          </div>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Mobile</th>
                  <th>Skills</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {workers.map((w) => (
                  <tr key={String(w.id)}>
                    <td>
                      <strong>{w.fullName}</strong>
                      {w.email ? (
                        <div style={{ color: "var(--muted)", fontSize: "0.85rem" }}>{w.email}</div>
                      ) : null}
                    </td>
                    <td className="mono">{w.mobile}</td>
                    <td>{w.skills}</td>
                    <td>
                      <StatusBadge status={w.isAvailable && w.isActive ? "active" : "inactive"} />
                    </td>
                  </tr>
                ))}
                {workers.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="empty">
                      No workers yet. Add workers so you can assign them to jobs.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {tab === "requests" ? (
        <section className="panel">
          <div className="panel-head">
            <h3>New requests</h3>
          </div>
          {availableWorkers.length === 0 ? (
            <p className="auth-sub" style={{ margin: "0.75rem 1.1rem 0" }}>
              Add an available worker before you can accept requests. Assigning a worker is required.
            </p>
          ) : null}
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Service</th>
                  <th>Address</th>
                  <th>Amount</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {requestBookings.map((b) => (
                  <tr key={String(b.id)}>
                    <td>{new Date(b.scheduledAt).toLocaleString("en-IN")}</td>
                    <td>
                      <strong>{b.title}</strong>
                      <div style={{ color: "var(--muted)", fontSize: "0.85rem" }}>
                        {sevaCategoryLabel(b.category)}
                      </div>
                      {b.notes ? (
                        <div style={{ color: "var(--muted)", fontSize: "0.85rem" }}>{b.notes}</div>
                      ) : null}
                    </td>
                    <td>{b.serviceAddress}</td>
                    <td className="mono">{formatInrFromPaise(b.totalAmountInPaise ?? b.amountInPaise)}</td>
                    <td>
                      <div className="toolbar" style={{ flexWrap: "wrap", gap: "0.35rem", alignItems: "center" }}>
                        <select
                          value={assignWorkerId[String(b.id)] ?? ""}
                          onChange={(e) =>
                            setAssignWorkerId((prev) => ({ ...prev, [String(b.id)]: e.target.value }))
                          }
                          style={{ maxWidth: "12rem" }}
                        >
                          <option value="">Select worker (required)</option>
                          {availableWorkers.map((w) => (
                            <option key={String(w.id)} value={String(w.id)}>
                              {w.fullName} · {w.mobile}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          disabled={
                            decidingId === String(b.id) ||
                            availableWorkers.length === 0 ||
                            !assignWorkerId[String(b.id)]
                          }
                          onClick={() => void onDecide(String(b.id), "accept")}
                        >
                          Accept
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          disabled={decidingId === String(b.id)}
                          onClick={() => void onDecide(String(b.id), "reject")}
                        >
                          Reject
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {requestBookings.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="empty">
                      No new requests right now.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {tab === "jobs" ? (
        <section className="panel">
          <div className="panel-head">
            <h3>Jobs</h3>
          </div>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Service / worker</th>
                  <th>Payment</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {jobBookings.map((b) => (
                  <tr key={String(b.id)}>
                    <td>{new Date(b.scheduledAt).toLocaleString("en-IN")}</td>
                    <td>
                      <strong>{b.title}</strong>
                      <div style={{ color: "var(--muted)", fontSize: "0.85rem" }}>{b.serviceAddress}</div>
                      <div style={{ color: "var(--muted)", fontSize: "0.85rem" }}>
                        {b.workerName ? `Worker: ${b.workerName}` : "No worker assigned"}
                      </div>
                    </td>
                    <td>
                      <StatusBadge status={b.paymentStatus} />
                    </td>
                    <td>
                      <StatusBadge status={b.status} />
                      {b.paymentStatus === "paid" && !["completed", "cancelled"].includes(b.status) ? (
                        <div className="field" style={{ marginTop: "0.35rem", minWidth: "9rem" }}>
                          {!b.otpVerified && b.status !== "completed" ? (
                            <input
                              aria-label={`Service OTP for booking ${b.id}`}
                              placeholder="Customer OTP"
                              maxLength={8}
                              value={otpByBooking[String(b.id)] ?? ""}
                              onChange={(e) =>
                                setOtpByBooking((m) => ({
                                  ...m,
                                  [String(b.id)]: e.target.value.replace(/\D/g, "").slice(0, 8),
                                }))
                              }
                              style={{ width: "7rem", marginBottom: "0.35rem" }}
                            />
                          ) : null}
                          <select
                            aria-label="Update job status"
                            value={b.status}
                            disabled={updatingId === String(b.id)}
                            onChange={(e) => void onUpdateStatus(b, e.target.value)}
                          >
                            {JOB_STATUSES.map((s) => (
                              <option key={s} value={s}>
                                {s.replaceAll("_", " ")}
                              </option>
                            ))}
                          </select>
                        </div>
                      ) : null}
                    </td>
                    <td>
                      <div className="action-stack">
                        {!b.workerId ? (
                          <>
                            <select
                              value={assignWorkerId[String(b.id)] ?? ""}
                              onChange={(e) =>
                                setAssignWorkerId((prev) => ({ ...prev, [String(b.id)]: e.target.value }))
                              }
                              style={{ maxWidth: "11rem" }}
                            >
                              <option value="">Assign worker</option>
                              {availableWorkers.map((w) => (
                                <option key={String(w.id)} value={String(w.id)}>
                                  {w.fullName} · {w.mobile}
                                </option>
                              ))}
                            </select>
                            <button
                              type="button"
                              className="btn btn-primary btn-sm"
                              disabled={updatingId === String(b.id) || !assignWorkerId[String(b.id)]}
                              onClick={() => void onAssignWorker(String(b.id))}
                            >
                              Assign
                            </button>
                          </>
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
                {jobBookings.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="empty">
                      No jobs yet. Accepted requests appear here.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {tab === "invoices" ? (
        <section className="panel">
          <div className="panel-head">
            <h3>Invoices</h3>
            <p style={{ margin: 0, color: "var(--muted)", fontSize: "0.9rem" }}>
              Generated after customer payment. Download or print/PDF.
            </p>
          </div>
          <InvoiceListPanel
            data={invoices}
            fallbackNumber={(inv) => `INV-SV-${inv.id}`}
            refLabel="Booking"
            refValue={(inv) => String(inv.bookingId)}
            downloadPath={(inv) => `/seva/invoices/${inv.id}/download`}
            emptyMessage={
              needsProfile
                ? "Invoices appear after your profile is set up."
                : "No invoices yet. They appear after the customer pays."
            }
            onPageChange={setInvPage}
          />
        </section>
      ) : null}

      {showOfferingModal ? (
        <Modal
          title={editingOffering ? "Edit offering" : "Add offering"}
          onClose={() => setShowOfferingModal(false)}
          footer={
            <>
              <button type="button" className="btn btn-ghost" onClick={() => setShowOfferingModal(false)}>
                Cancel
              </button>
              <button
                type="submit"
                form="offering-form"
                className="btn btn-primary"
                disabled={savingOffering}
              >
                {savingOffering ? "Saving…" : editingOffering ? "Save changes" : "Create offering"}
              </button>
            </>
          }
        >
          <form id="offering-form" onSubmit={(e) => void onSaveOffering(e)}>
            <div className="field">
              <label htmlFor="of-category">Category</label>
              <select
                id="of-category"
                value={offeringForm.category}
                onChange={(e) =>
                  setOfferingForm((f) => ({ ...f, category: e.target.value as SevaCategoryId }))
                }
              >
                {SEVA_CATEGORIES.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="of-title">Title</label>
              <input
                id="of-title"
                required
                minLength={2}
                value={offeringForm.title}
                onChange={(e) => setOfferingForm((f) => ({ ...f, title: e.target.value }))}
              />
            </div>
            <div className="field">
              <label htmlFor="of-desc">Description (optional)</label>
              <textarea
                id="of-desc"
                rows={2}
                value={offeringForm.description}
                onChange={(e) => setOfferingForm((f) => ({ ...f, description: e.target.value }))}
              />
            </div>
            <div className="grid-2">
              <div className="field">
                <label htmlFor="of-duration">Duration (minutes)</label>
                <input
                  id="of-duration"
                  type="number"
                  min={1}
                  required
                  value={offeringForm.durationMinutes}
                  onChange={(e) => setOfferingForm((f) => ({ ...f, durationMinutes: e.target.value }))}
                />
              </div>
              <div className="field">
                <label htmlFor="of-amount">Amount (INR)</label>
                <input
                  id="of-amount"
                  type="number"
                  min={0}
                  required
                  value={offeringForm.amountInr}
                  onChange={(e) => setOfferingForm((f) => ({ ...f, amountInr: e.target.value }))}
                />
              </div>
            </div>
          </form>
        </Modal>
      ) : null}

      {showWorkerModal ? (
        <Modal
          title="Add worker"
          onClose={() => setShowWorkerModal(false)}
          footer={
            <>
              <button type="button" className="btn btn-ghost" onClick={() => setShowWorkerModal(false)}>
                Cancel
              </button>
              <button type="submit" form="worker-form" className="btn btn-primary" disabled={savingWorker}>
                {savingWorker ? "Saving…" : "Add worker"}
              </button>
            </>
          }
        >
          <form id="worker-form" onSubmit={(e) => void onAddWorker(e)}>
            <div className="field">
              <label htmlFor="w-name">Full name</label>
              <input
                id="w-name"
                required
                minLength={2}
                value={workerForm.fullName}
                onChange={(e) => setWorkerForm((f) => ({ ...f, fullName: e.target.value }))}
              />
            </div>
            <div className="grid-2">
              <div className="field">
                <label htmlFor="w-mobile">Mobile</label>
                <input
                  id="w-mobile"
                  required
                  inputMode="numeric"
                  maxLength={10}
                  minLength={10}
                  placeholder="10-digit mobile"
                  value={workerForm.mobile}
                  onChange={(e) => setWorkerForm((f) => ({ ...f, mobile: digitsPhone(e.target.value) }))}
                />
              </div>
              <div className="field">
                <label htmlFor="w-email">Email (optional)</label>
                <input
                  id="w-email"
                  type="email"
                  value={workerForm.email}
                  onChange={(e) => setWorkerForm((f) => ({ ...f, email: e.target.value }))}
                />
              </div>
            </div>
            <div className="field">
              <label htmlFor="w-skills">Skills</label>
              <input
                id="w-skills"
                required
                minLength={2}
                value={workerForm.skills}
                onChange={(e) => setWorkerForm((f) => ({ ...f, skills: e.target.value }))}
                placeholder="cleaning, electrical, plumbing…"
              />
            </div>
          </form>
        </Modal>
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
