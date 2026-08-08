import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api, formatInrFromPaise, qs } from "../api";
import { KpiCard } from "../components/KpiCard";
import { useToast } from "../components/Toast";

type ParkingStats = {
  listingsTotal: number;
  pendingVerification: number;
  fieldInProgress: number;
  managerReview: number;
  approved: number;
  rejected?: number;
  bookingsTotal: number;
  bookingsActive: number;
};

type UserStats = {
  total: number;
  owners: number;
  executives: number;
};

type PlatformWallet = { balanceInPaise: number };

type Period = "week" | "month" | "quarter" | "year";

type Analytics = {
  period: Period;
  range: { start: string; end: string };
  summary: {
    bookingsCreated: number;
    bookingsCompleted: number;
    bookingsPaid: number;
    revenueInPaise: number;
    platformFeeInPaise: number;
    listingsCreated: number;
    listingsApproved: number;
  };
  series: Array<{
    bucket: string;
    bookings: number;
    paid: number;
    revenueInPaise: number;
    platformFeeInPaise: number;
  }>;
  statusBreakdown: Array<{ status: string; count: number }>;
};

const PERIODS: Array<{ id: Period; label: string }> = [
  { id: "week", label: "Weekly" },
  { id: "month", label: "Monthly" },
  { id: "quarter", label: "Quarterly" },
  { id: "year", label: "Yearly" },
];

function formatBucket(iso: string, period: Period) {
  const d = new Date(iso);
  if (period === "year") {
    return d.toLocaleDateString("en-IN", { month: "short" });
  }
  if (period === "quarter") {
    return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
  }
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

export function DashboardPage() {
  const toast = useToast();
  const [parking, setParking] = useState<ParkingStats | null>(null);
  const [users, setUsers] = useState<UserStats | null>(null);
  const [wallet, setWallet] = useState<PlatformWallet | null>(null);
  const [period, setPeriod] = useState<Period>("month");
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [loadingAnalytics, setLoadingAnalytics] = useState(false);

  useEffect(() => {
    Promise.all([
      api.get<ParkingStats>("/parking/stats"),
      api.get<UserStats>("/users/stats"),
      api.get<PlatformWallet>("/payments/wallets/platform"),
    ])
      .then(([p, u, w]) => {
        setParking(p);
        setUsers(u);
        setWallet(w);
      })
      .catch((err: Error) => toast.error(err.message || "Failed to load dashboard"));
  }, [toast]);

  const loadAnalytics = useCallback(async () => {
    setLoadingAnalytics(true);
    try {
      const res = await api.get<Analytics>(`/parking/analytics${qs({ period })}`);
      setAnalytics(res);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load analytics");
    } finally {
      setLoadingAnalytics(false);
    }
  }, [period, toast]);

  useEffect(() => {
    void loadAnalytics();
  }, [loadAnalytics]);

  const maxSeries = useMemo(() => {
    if (!analytics?.series.length) return 1;
    return Math.max(...analytics.series.map((s) => Math.max(s.bookings, s.paid)), 1);
  }, [analytics]);

  const maxStatus = useMemo(() => {
    if (!analytics?.statusBreakdown.length) return 1;
    return Math.max(...analytics.statusBreakdown.map((s) => s.count), 1);
  }, [analytics]);

  return (
    <>
      <div className="topbar">
        <div>
          <h2>Dashboard</h2>
          <p>Overview of listings, bookings, users, and period analytics.</p>
        </div>
        <Link className="btn btn-primary" to="/staff/verification">
          Open verification queue
        </Link>
      </div>

      <div className="kpi-grid kpi-grid-compact">
        <KpiCard label="Listings" value={parking?.listingsTotal ?? "—"} hint="All applications" />
        <KpiCard label="Pending" value={parking?.pendingVerification ?? "—"} hint="Verification" />
        <KpiCard label="Field" value={parking?.fieldInProgress ?? "—"} hint="In progress" />
        <KpiCard label="Review" value={parking?.managerReview ?? "—"} hint="Manager queue" />
        <KpiCard label="Approved" value={parking?.approved ?? "—"} hint="Live slots" />
        <KpiCard label="Rejected" value={parking?.rejected ?? "—"} hint="Declined" />
        <KpiCard label="Active bookings" value={parking?.bookingsActive ?? "—"} />
        <KpiCard
          label="Users"
          value={users?.total ?? "—"}
          hint={`${users?.owners ?? 0} owners · ${users?.executives ?? 0} execs`}
        />
        <KpiCard
          label="Platform wallet"
          value={
            wallet
              ? new Intl.NumberFormat("en-IN", {
                  style: "currency",
                  currency: "INR",
                  maximumFractionDigits: 0,
                }).format(wallet.balanceInPaise / 100)
              : "—"
          }
        />
      </div>

      <section className="panel">
        <div className="panel-head">
          <div>
            <h3>Period analytics</h3>
            {analytics ? (
              <p className="panel-sub">
                {new Date(analytics.range.start).toLocaleDateString("en-IN")} –{" "}
                {new Date(analytics.range.end).toLocaleDateString("en-IN")}
              </p>
            ) : null}
          </div>
          <div className="tabs period-tabs">
            {PERIODS.map((p) => (
              <button
                key={p.id}
                type="button"
                className={`tab${period === p.id ? " active" : ""}`}
                onClick={() => setPeriod(p.id)}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <div className="panel-body">
          {loadingAnalytics && !analytics ? (
            <p className="loading">Loading analytics…</p>
          ) : (
            <>
              <div className="kpi-grid kpi-grid-compact analytics-kpis">
                <KpiCard
                  label="Bookings created"
                  value={analytics?.summary.bookingsCreated ?? "—"}
                />
                <KpiCard label="Paid bookings" value={analytics?.summary.bookingsPaid ?? "—"} />
                <KpiCard
                  label="Completed"
                  value={analytics?.summary.bookingsCompleted ?? "—"}
                  hint="Checked out"
                />
                <KpiCard
                  label="Gross revenue"
                  value={
                    analytics ? formatInrFromPaise(analytics.summary.revenueInPaise) : "—"
                  }
                />
                <KpiCard
                  label="Platform fees"
                  value={
                    analytics ? formatInrFromPaise(analytics.summary.platformFeeInPaise) : "—"
                  }
                />
                <KpiCard
                  label="New listings"
                  value={analytics?.summary.listingsCreated ?? "—"}
                />
                <KpiCard
                  label="Listings approved"
                  value={analytics?.summary.listingsApproved ?? "—"}
                />
              </div>

              <div className="analytics-grid">
                <div className="analytics-block">
                  <h4>Bookings over time</h4>
                  {analytics?.series.length ? (
                    <div className="bar-chart" role="img" aria-label="Bookings chart">
                      {analytics.series.map((point) => (
                        <div key={point.bucket} className="bar-col">
                          <div className="bar-track">
                            <div
                              className="bar-fill bar-fill-secondary"
                              style={{ height: `${(point.paid / maxSeries) * 100}%` }}
                              title={`Paid ${point.paid}`}
                            />
                            <div
                              className="bar-fill"
                              style={{ height: `${(point.bookings / maxSeries) * 100}%` }}
                              title={`Bookings ${point.bookings}`}
                            />
                          </div>
                          <span className="bar-label">{formatBucket(point.bucket, period)}</span>
                          <span className="bar-value">{point.bookings}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="empty">No booking activity in this period.</p>
                  )}
                  <div className="chart-legend">
                    <span>
                      <i className="legend-swatch" /> Bookings
                    </span>
                    <span>
                      <i className="legend-swatch legend-swatch-secondary" /> Paid
                    </span>
                  </div>
                </div>

                <div className="analytics-block">
                  <h4>Booking status mix</h4>
                  {analytics?.statusBreakdown.length ? (
                    <div className="status-bars">
                      {analytics.statusBreakdown.map((row) => (
                        <div key={row.status} className="status-bar-row">
                          <div className="status-bar-meta">
                            <strong>{row.status.replaceAll("_", " ")}</strong>
                            <span>{row.count}</span>
                          </div>
                          <div className="status-bar-track">
                            <div
                              className="status-bar-fill"
                              style={{ width: `${(row.count / maxStatus) * 100}%` }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="empty">No status data for this period.</p>
                  )}

                  {analytics?.series.length ? (
                    <div className="analytics-note">
                      Peak day/bucket revenue:{" "}
                      <strong>
                        {formatInrFromPaise(
                          Math.max(...analytics.series.map((s) => s.revenueInPaise), 0),
                        )}
                      </strong>
                    </div>
                  ) : null}
                </div>
              </div>
            </>
          )}
        </div>
      </section>
    </>
  );
}
