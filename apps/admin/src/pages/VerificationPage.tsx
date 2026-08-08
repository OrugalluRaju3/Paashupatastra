import { FormEvent, useCallback, useEffect, useState } from "react";
import { api, qs } from "../api";
import { useAuth } from "../auth/AuthContext";
import { hasAnyRole } from "../auth/types";
import { FileUploadField } from "../components/FileUploadField";
import { Modal } from "../components/Modal";
import { Pagination } from "../components/Pagination";
import { StatusBadge } from "../components/StatusBadge";
import { useToast } from "../components/Toast";
import { useDebouncedValue } from "../hooks/useDebouncedValue";

function shortId(id: string | number | null | undefined): string {
  if (id == null) return "—";
  return String(id);
}

type Listing = {
  id: string | number;
  apartmentName: string;
  city: string;
  pinCode?: string;
  status: string;
  parkingSlotNumber: string;
  ownerName?: string | null;
  ownerPhone?: string | null;
  rejectionReason?: string | null;
  rejectedByName?: string | null;
  rejectedByPhone?: string | null;
  rejectedByRole?: string | null;
  rejectedAt?: string | null;
};

type Assignment = {
  id: string | number;
  listingId: string | number;
  executiveUserId: string | number;
  status: string;
  dueAt: string | null;
  apartmentName?: string | null;
  city?: string | null;
  parkingSlotNumber?: string | null;
  listingStatus?: string | null;
  executiveName?: string | null;
  executivePhone?: string | null;
};

type User = { id: string | number; name: string | null; phone: string; roles: string[] };

type Paginated<T> = {
  items: T[];
  page: number;
  total: number;
  totalPages: number;
  limit: number;
};

type Stats = {
  pendingVerification: number;
  fieldInProgress: number;
  managerReview: number;
  needsInfo?: number;
  rejected?: number;
};

type TabId = "pending" | "assignments" | "manager" | "needs_info" | "rejected";

export function VerificationPage() {
  const toast = useToast();
  const { user } = useAuth();
  const canManageReview = hasAnyRole(user, [
    "parking_super_admin",
    "super_admin",
    "verification_manager",
  ]);
  const isFieldExecutiveOnly =
    hasAnyRole(user, ["field_executive"]) && !canManageReview;
  const [tab, setTab] = useState<TabId>(isFieldExecutiveOnly ? "assignments" : "pending");
  const [stats, setStats] = useState<Stats | null>(null);
  const [listings, setListings] = useState<Paginated<Listing> | null>(null);
  const [assignments, setAssignments] = useState<Paginated<Assignment> | null>(null);
  const [executives, setExecutives] = useState<User[]>([]);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const search = useDebouncedValue(q.trim(), 350);
  const [assignListingId, setAssignListingId] = useState("");
  const [executiveId, setExecutiveId] = useState("");
  const [reportAssignmentId, setReportAssignmentId] = useState("");
  const [fieldPhotoUrls, setFieldPhotoUrls] = useState<string[]>([]);
  const [managerListingId, setManagerListingId] = useState("");
  const [managerReports, setManagerReports] = useState<
    Array<{
      id: string | number;
      decision: string;
      comments: string;
      photoUrls?: string[] | null;
      createdAt?: string;
    }>
  >([]);
  const [managerReportsLoading, setManagerReportsLoading] = useState(false);
  const [comments, setComments] = useState("");

  useEffect(() => {
    setPage(1);
  }, [search]);

  const loadCounts = useCallback(async () => {
    const s = await api.get<Stats>("/parking/stats");
    setStats(s);
  }, []);

  const loadTab = useCallback(async () => {
    try {
      await loadCounts();
      const execs = await api.get<Paginated<User>>(`/users${qs({ role: "field_executive", limit: 50 })}`);
      setExecutives(execs.items);
      if (!executiveId && execs.items[0]) setExecutiveId(String(execs.items[0].id));

      if (tab === "pending") {
        const p = await api.get<Paginated<Listing>>(
          `/parking/listings${qs({ status: "pending_verification", page, limit: 10, q: search })}`,
        );
        setListings(p);
        setAssignments(null);
      } else if (tab === "manager") {
        const m = await api.get<Paginated<Listing>>(
          `/parking/listings${qs({ status: "manager_review", page, limit: 10, q: search })}`,
        );
        setListings(m);
        setAssignments(null);
      } else if (tab === "needs_info") {
        const n = await api.get<Paginated<Listing>>(
          `/parking/listings${qs({ status: "needs_info", page, limit: 10, q: search })}`,
        );
        setListings(n);
        setAssignments(null);
      } else if (tab === "rejected") {
        const r = await api.get<Paginated<Listing>>(
          `/parking/listings${qs({ status: "rejected", page, limit: 10, q: search })}`,
        );
        setListings(r);
        setAssignments(null);
      } else {
        const a = await api.get<Paginated<Assignment>>(
          `/parking/verification/assignments${qs({ page, limit: 10, q: search })}`,
        );
        setAssignments(a);
        setListings(null);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load verification queue");
    }
  }, [tab, page, search, executiveId, loadCounts, toast]);

  useEffect(() => {
    void loadTab();
  }, [loadTab]);

  function switchTab(next: TabId) {
    setTab(next);
    setPage(1);
    setQ("");
  }

  async function assign(e: FormEvent) {
    e.preventDefault();
    try {
      await api.post("/parking/verification/assign", {
        listingId: assignListingId,
        executiveUserId: executiveId,
      });
      setAssignListingId("");
      toast.success("Field executive assigned");
      await loadTab();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Assign failed");
    }
  }

  function openFieldReport(assignmentId: string) {
    setFieldPhotoUrls([]);
    setComments("");
    setReportAssignmentId(assignmentId);
  }

  async function submitFieldReport(decision: "approve" | "reject") {
    if (fieldPhotoUrls.length === 0) {
      toast.error("Upload at least one field verification photo");
      return;
    }
    const reason = comments.trim();
    if (decision === "reject" && reason.length < 10) {
      toast.error("Rejection reason is required (at least 10 characters)");
      return;
    }
    if (decision === "approve" && reason.length < 5) {
      toast.error("Comments are required (at least 5 characters)");
      return;
    }
    try {
      await api.post("/parking/verification/field-report", {
        assignmentId: reportAssignmentId,
        decision,
        comments: reason,
        photoUrls: fieldPhotoUrls,
        addressVerified: true,
        ownershipVerified: true,
        slotVerified: true,
        documentsVerified: true,
        gpsVerified: true,
      });
      setReportAssignmentId("");
      setFieldPhotoUrls([]);
      setComments("");
      toast.success(
        decision === "approve" ? "Field report sent to manager" : "Request rejected",
      );
      await loadTab();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Report failed");
    }
  }

  async function openManagerDecide(listingId: string) {
    setComments("");
    setManagerListingId(listingId);
    setManagerReports([]);
    setManagerReportsLoading(true);
    try {
      const res = await api.get<{
        reports: Array<{
          id: string | number;
          decision: string;
          comments: string;
          photoUrls?: string[] | null;
          createdAt?: string;
        }>;
      }>(`/parking/listings/${listingId}`);
      setManagerReports(Array.isArray(res.reports) ? res.reports : []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load field report files");
    } finally {
      setManagerReportsLoading(false);
    }
  }

  async function managerDecide(decision: "approve" | "reject" | "send_back" | "need_info") {
    if (!canManageReview) {
      toast.error("Only verification managers can approve or reject listings");
      return;
    }
    const reason = comments.trim();
    if (decision === "reject" && reason.length < 10) {
      toast.error("Rejection reason is required (at least 10 characters)");
      return;
    }
    if (reason.length < 3) {
      toast.error("Comments are required");
      return;
    }
    try {
      await api.post("/parking/verification/manager-decision", {
        listingId: managerListingId,
        decision,
        comments: reason,
      });
      setManagerListingId("");
      setManagerReports([]);
      setComments("");
      toast.success(
        decision === "approve"
          ? "Request approved and activated"
          : decision === "reject"
            ? "Request rejected"
            : decision === "need_info"
              ? "Marked as needs more info"
              : "Sent back for re-verification",
      );
      await loadTab();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Decision failed");
    }
  }

  const tabs: Array<{ id: TabId; label: string; count: number }> = [
    ...(canManageReview
      ? [
          {
            id: "pending" as const,
            label: "Pending verification",
            count: stats?.pendingVerification ?? 0,
          },
        ]
      : []),
    {
      id: "assignments",
      label: "Field assignments",
      count: stats?.fieldInProgress ?? assignments?.total ?? 0,
    },
    { id: "rejected", label: "Rejected", count: stats?.rejected ?? 0 },
    ...(canManageReview
      ? [
          { id: "needs_info" as const, label: "Needs info", count: stats?.needsInfo ?? 0 },
          { id: "manager" as const, label: "Manager review", count: stats?.managerReview ?? 0 },
        ]
      : []),
  ];

  return (
    <>
      <div className="topbar">
        <div>
          <h2>Verification workflow</h2>
          <p>Assign field executives → field report → manager final approval.</p>
        </div>
        <button type="button" className="btn btn-ghost" onClick={() => void loadTab()}>
          Refresh
        </button>
      </div>

      <div className="tabs" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            className={tab === t.id ? "tab active" : "tab"}
            onClick={() => switchTab(t.id)}
          >
            {t.label} <span className="tab-count">({t.count})</span>
          </button>
        ))}
      </div>

      <section className="panel">
        <div className="panel-head">
          <h3>{tabs.find((t) => t.id === tab)?.label}</h3>
          <div className="toolbar">
            <input
              className="search"
              value={q}
              placeholder={
                tab === "assignments"
                  ? "Search assignment id, listing, status…"
                  : "Search apartment, city, pin…"
              }
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
        </div>

        {tab === "pending" || tab === "manager" || tab === "needs_info" || tab === "rejected" ? (
          <>
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Listing</th>
                    <th>Owner</th>
                    <th>Status</th>
                    {tab === "rejected" ? <th>Rejected by</th> : null}
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {(listings?.items ?? []).map((item) => (
                    <tr key={String(item.id)}>
                      <td>
                        <strong>{item.apartmentName}</strong> · {item.parkingSlotNumber}
                        <div style={{ color: "var(--muted)", fontSize: "0.85rem" }}>
                          {item.city}
                          {item.pinCode ? ` · ${item.pinCode}` : ""}
                        </div>
                        {tab === "rejected" && item.rejectionReason ? (
                          <div style={{ color: "var(--muted)", fontSize: "0.85rem", marginTop: "0.25rem" }}>
                            Reason: {item.rejectionReason}
                          </div>
                        ) : null}
                      </td>
                      <td>
                        <strong>{item.ownerName ?? "—"}</strong>
                        <div className="mono" style={{ color: "var(--muted)", fontSize: "0.85rem" }}>
                          {item.ownerPhone ?? "—"}
                        </div>
                      </td>
                      <td>
                        <StatusBadge status={item.status} />
                        {tab === "rejected" && item.rejectedAt ? (
                          <div style={{ color: "var(--muted)", fontSize: "0.8rem", marginTop: "0.25rem" }}>
                            {new Date(item.rejectedAt).toLocaleString()}
                          </div>
                        ) : null}
                      </td>
                      {tab === "rejected" ? (
                        <td>
                          <strong>{item.rejectedByName ?? "—"}</strong>
                          <div style={{ color: "var(--muted)", fontSize: "0.85rem" }}>
                            {(item.rejectedByRole ?? "staff").replaceAll("_", " ")}
                            {item.rejectedByPhone ? ` · ${item.rejectedByPhone}` : ""}
                          </div>
                        </td>
                      ) : null}
                      <td>
                        {tab === "pending" ? (
                          canManageReview ? (
                            <button
                              type="button"
                              className="btn btn-primary btn-sm"
                              onClick={() => setAssignListingId(String(item.id))}
                            >
                              Assign executive
                            </button>
                          ) : (
                            <span style={{ color: "var(--muted)", fontSize: "0.85rem" }}>View only</span>
                          )
                        ) : tab === "rejected" ? (
                          <span style={{ color: "var(--muted)", fontSize: "0.85rem" }}>
                            Owner may re-apply
                          </span>
                        ) : canManageReview ? (
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  void openManagerDecide(String(item.id));
                }}
              >
                {tab === "needs_info" ? "Follow up" : "Decide"}
              </button>
                        ) : (
                          <span style={{ color: "var(--muted)", fontSize: "0.85rem" }}>
                            Manager only
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {listings && listings.items.length === 0 ? (
                    <tr>
                      <td colSpan={tab === "rejected" ? 5 : 4} className="empty">
                        No requests in this queue.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
            {listings ? (
              <Pagination
                page={listings.page}
                totalPages={listings.totalPages}
                total={listings.total}
                onPageChange={setPage}
              />
            ) : null}
          </>
        ) : (
          <>
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Assignment</th>
                    <th>Listing</th>
                    <th>Executive</th>
                    <th>Status</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {(assignments?.items ?? []).map((a) => (
                    <tr key={String(a.id)}>
                      <td className="mono">#{shortId(a.id)}</td>
                      <td>
                        <strong>{a.apartmentName ?? `Listing #${shortId(a.listingId)}`}</strong>
                        {a.parkingSlotNumber ? ` · ${a.parkingSlotNumber}` : ""}
                        <div style={{ color: "var(--muted)", fontSize: "0.85rem" }}>
                          {a.city ?? "—"}
                          {a.listingStatus ? ` · ${a.listingStatus}` : ""}
                        </div>
                      </td>
                      <td>
                        <strong>{a.executiveName ?? "—"}</strong>
                        <div className="mono" style={{ color: "var(--muted)", fontSize: "0.85rem" }}>
                          {a.executivePhone ?? `User #${shortId(a.executiveUserId)}`}
                        </div>
                      </td>
                      <td>
                        <StatusBadge status={a.status} />
                        {a.listingStatus ? (
                          <div style={{ color: "var(--muted)", fontSize: "0.8rem", marginTop: "0.25rem" }}>
                            Listing: {a.listingStatus.replaceAll("_", " ")}
                          </div>
                        ) : null}
                      </td>
                      <td>
                        {a.status === "assigned" || a.status === "in_progress" ? (
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            onClick={() => openFieldReport(String(a.id))}
                          >
                            Submit field report
                          </button>
                        ) : a.status === "needs_info" ? (
                          <span style={{ color: "var(--muted)", fontSize: "0.85rem" }}>Needs info</span>
                        ) : a.status === "rejected" ? (
                          <span style={{ color: "var(--muted)", fontSize: "0.85rem" }}>Rejected</span>
                        ) : a.status === "completed" ? (
                          <span style={{ color: "var(--muted)", fontSize: "0.85rem" }}>
                            Sent to manager
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  ))}
                  {!assignments ? (
                    <tr>
                      <td colSpan={5} className="empty">
                        Loading field assignments…
                      </td>
                    </tr>
                  ) : null}
                  {assignments && assignments.items.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="empty">
                        No field assignments yet.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
            {assignments ? (
              <Pagination
                page={assignments.page}
                totalPages={assignments.totalPages}
                total={assignments.total}
                onPageChange={setPage}
              />
            ) : null}
          </>
        )}
      </section>

      {assignListingId ? (
        <Modal
          title="Assign field executive"
          onClose={() => setAssignListingId("")}
          footer={
            <>
              <button type="button" className="btn btn-ghost" onClick={() => setAssignListingId("")}>
                Cancel
              </button>
              <button type="submit" form="assign-form" className="btn btn-primary">
                Assign
              </button>
            </>
          }
        >
          <form id="assign-form" onSubmit={assign}>
            <div className="field">
              <label>Field executive</label>
              <select value={executiveId} onChange={(e) => setExecutiveId(e.target.value)} required>
                <option value="">Select executive</option>
                {executives.map((u) => (
                  <option key={String(u.id)} value={String(u.id)}>
                    {u.name ?? u.phone} ({u.phone})
                  </option>
                ))}
              </select>
              {executives.length === 0 ? (
                <p className="error">Create a field executive under Users & staff first.</p>
              ) : null}
            </div>
          </form>
        </Modal>
      ) : null}

      {reportAssignmentId ? (
        <Modal
          title="Field verification report"
          onClose={() => setReportAssignmentId("")}
          footer={
            <>
              <button type="button" className="btn btn-ghost" onClick={() => setReportAssignmentId("")}>
                Cancel
              </button>
              <button type="button" className="btn btn-danger" onClick={() => void submitFieldReport("reject")}>
                Reject
              </button>
              <button type="button" className="btn btn-primary" onClick={() => void submitFieldReport("approve")}>
                Send to manager
              </button>
            </>
          }
        >
          <FileUploadField
            label="Site verification photos"
            required
            multiple
            value={fieldPhotoUrls}
            onChange={setFieldPhotoUrls}
            hint="Upload one or more photos from the field visit. You can select multiple files at once."
          />
          <div className="field">
            <label htmlFor="field-report-comments">
              Comments / rejection reason <span style={{ color: "var(--danger, #b42318)" }}>*</span>
            </label>
            <textarea
              id="field-report-comments"
              required
              minLength={5}
              placeholder="Required. For reject, explain the reason (min 10 characters)."
              value={comments}
              onChange={(e) => setComments(e.target.value)}
            />
            <p className="auth-hint">Rejection reason is mandatory and is emailed to owner, manager, and admin.</p>
          </div>
        </Modal>
      ) : null}

      {managerListingId && canManageReview ? (
        <Modal
          title="Manager decision"
          onClose={() => {
            setManagerListingId("");
            setManagerReports([]);
          }}
          footer={
            <>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => {
                  setManagerListingId("");
                  setManagerReports([]);
                }}
              >
                Cancel
              </button>
              <button type="button" className="btn btn-danger" onClick={() => void managerDecide("reject")}>
                Reject
              </button>
              {tab === "manager" ? (
                <button type="button" className="btn btn-ghost" onClick={() => void managerDecide("need_info")}>
                  Need more info
                </button>
              ) : null}
              <button type="button" className="btn btn-ghost" onClick={() => void managerDecide("send_back")}>
                Re-verify
              </button>
              {tab === "manager" ? (
                <button type="button" className="btn btn-primary" onClick={() => void managerDecide("approve")}>
                  Approve & activate
                </button>
              ) : null}
            </>
          }
        >
          <div className="field-report-photos">
            <h4>Field executive uploads</h4>
            {managerReportsLoading ? <p className="loading">Loading field files…</p> : null}
            {!managerReportsLoading && managerReports.length === 0 ? (
              <p className="auth-hint" style={{ margin: 0 }}>
                No field reports found for this request yet.
              </p>
            ) : null}
            {!managerReportsLoading
              ? managerReports.map((report, index) => {
                  const photos = Array.isArray(report.photoUrls)
                    ? report.photoUrls.filter(Boolean)
                    : [];
                  return (
                    <div key={String(report.id)} className="report-block">
                      <p className="report-meta">
                        Report #{index + 1} · {report.decision.replaceAll("_", " ")}
                        {report.createdAt
                          ? ` · ${new Date(report.createdAt).toLocaleString("en-IN")}`
                          : ""}
                      </p>
                      {report.comments ? <p className="report-comments">{report.comments}</p> : null}
                      {photos.length ? (
                        <ul className="photo-links">
                          {photos.map((url, photoIndex) => (
                            <li key={`${report.id}-${photoIndex}`}>
                              <a href={url} target="_blank" rel="noreferrer">
                                View file {photoIndex + 1}
                              </a>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="auth-hint" style={{ margin: 0 }}>
                          No files attached to this report.
                        </p>
                      )}
                    </div>
                  );
                })
              : null}
          </div>
          <div className="field">
            <label htmlFor="manager-decision-comments">
              Comments / rejection reason <span style={{ color: "var(--danger, #b42318)" }}>*</span>
            </label>
            <textarea
              id="manager-decision-comments"
              required
              minLength={3}
              placeholder="Required. For reject, explain the reason (min 10 characters)."
              value={comments}
              onChange={(e) => setComments(e.target.value)}
            />
            <p className="auth-hint">
              On reject, this reason and rejection time are sent to owner, executive, manager, and admin.
            </p>
          </div>
          {tab === "needs_info" ? (
            <p className="auth-hint">
              Needs-info is set by managers/admins only. Reject the listing, or re-verify after the owner updates
              documents. Approve is only available from Manager review.
            </p>
          ) : (
            <p className="auth-hint">
              Use Need more info to ask the owner for documents/details. Use Re-verify to send the listing back to
              the field executive.
            </p>
          )}
        </Modal>
      ) : null}
    </>
  );
}
