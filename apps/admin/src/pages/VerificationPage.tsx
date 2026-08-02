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

type Listing = {
  id: string;
  apartmentName: string;
  city: string;
  pinCode?: string;
  status: string;
  parkingSlotNumber: string;
  ownerName?: string | null;
  ownerPhone?: string | null;
};

type Assignment = {
  id: string;
  listingId: string;
  executiveUserId: string;
  status: string;
  dueAt: string | null;
  apartmentName?: string | null;
  city?: string | null;
  parkingSlotNumber?: string | null;
  listingStatus?: string | null;
  executiveName?: string | null;
  executivePhone?: string | null;
};

type User = { id: string; name: string | null; phone: string; roles: string[] };

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
};

type TabId = "pending" | "assignments" | "manager";

export function VerificationPage() {
  const toast = useToast();
  const { user } = useAuth();
  const canManageReview = hasAnyRole(user, ["super_admin", "verification_manager"]);
  const [tab, setTab] = useState<TabId>("pending");
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
  const [fieldPhotoUrl, setFieldPhotoUrl] = useState("");
  const [managerListingId, setManagerListingId] = useState("");
  const [comments, setComments] = useState("Verified on site. Documents match.");

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
      if (!executiveId && execs.items[0]) setExecutiveId(execs.items[0].id);

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
    setFieldPhotoUrl("");
    setReportAssignmentId(assignmentId);
  }

  async function submitFieldReport(decision: "approve" | "reject" | "need_info") {
    if (!fieldPhotoUrl) {
      toast.error("Upload at least one field verification photo");
      return;
    }
    try {
      await api.post("/parking/verification/field-report", {
        assignmentId: reportAssignmentId,
        decision,
        comments,
        photoUrls: [fieldPhotoUrl],
        addressVerified: true,
        ownershipVerified: true,
        slotVerified: true,
        documentsVerified: true,
        gpsVerified: true,
      });
      setReportAssignmentId("");
      setFieldPhotoUrl("");
      toast.success(
        decision === "approve"
          ? "Field report sent to manager"
          : decision === "reject"
            ? "Listing rejected"
            : "Marked as needs info",
      );
      await loadTab();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Report failed");
    }
  }

  async function managerDecide(decision: "approve" | "reject" | "send_back") {
    if (!canManageReview) {
      toast.error("Only verification managers can approve or reject listings");
      return;
    }
    try {
      await api.post("/parking/verification/manager-decision", {
        listingId: managerListingId,
        decision,
        comments,
      });
      setManagerListingId("");
      toast.success(
        decision === "approve"
          ? "Listing approved and activated"
          : decision === "reject"
            ? "Listing rejected"
            : "Sent back for re-verification",
      );
      await loadTab();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Decision failed");
    }
  }

  const tabs: Array<{ id: TabId; label: string; count: number }> = [
    { id: "pending", label: "Pending verification", count: stats?.pendingVerification ?? 0 },
    { id: "assignments", label: "Field assignments", count: stats?.fieldInProgress ?? assignments?.total ?? 0 },
    { id: "manager", label: "Manager review", count: stats?.managerReview ?? 0 },
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

        {tab === "pending" || tab === "manager" ? (
          <>
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Listing</th>
                    <th>Owner</th>
                    <th>Status</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {(listings?.items ?? []).map((item) => (
                    <tr key={item.id}>
                      <td>
                        <strong>{item.apartmentName}</strong> · {item.parkingSlotNumber}
                        <div style={{ color: "var(--muted)", fontSize: "0.85rem" }}>
                          {item.city}
                          {item.pinCode ? ` · ${item.pinCode}` : ""}
                        </div>
                      </td>
                      <td>
                        <strong>{item.ownerName ?? "—"}</strong>
                        <div className="mono" style={{ color: "var(--muted)", fontSize: "0.85rem" }}>
                          {item.ownerPhone ?? "—"}
                        </div>
                      </td>
                      <td>
                        <StatusBadge status={item.status} />
                      </td>
                      <td>
                        {tab === "pending" ? (
                          canManageReview ? (
                            <button
                              type="button"
                              className="btn btn-primary btn-sm"
                              onClick={() => setAssignListingId(item.id)}
                            >
                              Assign executive
                            </button>
                          ) : (
                            <span style={{ color: "var(--muted)", fontSize: "0.85rem" }}>View only</span>
                          )
                        ) : canManageReview ? (
                          <button
                            type="button"
                            className="btn btn-primary btn-sm"
                            onClick={() => setManagerListingId(item.id)}
                          >
                            Decide
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
                      <td colSpan={4} className="empty">
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
                    <tr key={a.id}>
                      <td className="mono">{a.id.slice(0, 8)}…</td>
                      <td>
                        <strong>{a.apartmentName ?? a.listingId.slice(0, 8)}</strong>
                        {a.parkingSlotNumber ? ` · ${a.parkingSlotNumber}` : ""}
                        <div style={{ color: "var(--muted)", fontSize: "0.85rem" }}>
                          {a.city ?? "—"}
                          {a.listingStatus ? ` · ${a.listingStatus}` : ""}
                        </div>
                      </td>
                      <td>
                        <strong>{a.executiveName ?? "—"}</strong>
                        <div className="mono" style={{ color: "var(--muted)", fontSize: "0.85rem" }}>
                          {a.executivePhone ?? a.executiveUserId.slice(0, 8)}
                        </div>
                      </td>
                      <td>
                        <StatusBadge status={a.status} />
                      </td>
                      <td>
                        {a.status !== "completed" ? (
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            onClick={() => openFieldReport(a.id)}
                          >
                            Submit field report
                          </button>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  ))}
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
                  <option key={u.id} value={u.id}>
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
              <button type="button" className="btn btn-ghost" onClick={() => void submitFieldReport("need_info")}>
                Need info
              </button>
              <button type="button" className="btn btn-primary" onClick={() => void submitFieldReport("approve")}>
                Send to manager
              </button>
            </>
          }
        >
          <FileUploadField
            label="Site verification photo"
            required
            value={fieldPhotoUrl}
            onChange={setFieldPhotoUrl}
            hint="Upload a photo from the field visit"
          />
          <div className="field">
            <label>Comments</label>
            <textarea value={comments} onChange={(e) => setComments(e.target.value)} />
          </div>
        </Modal>
      ) : null}

      {managerListingId && canManageReview ? (
        <Modal
          title="Manager final decision"
          onClose={() => setManagerListingId("")}
          footer={
            <>
              <button type="button" className="btn btn-ghost" onClick={() => setManagerListingId("")}>
                Cancel
              </button>
              <button type="button" className="btn btn-danger" onClick={() => void managerDecide("reject")}>
                Reject
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => void managerDecide("send_back")}>
                Re-verify
              </button>
              <button type="button" className="btn btn-primary" onClick={() => void managerDecide("approve")}>
                Approve & activate
              </button>
            </>
          }
        >
          <div className="field">
            <label>Comments / notification note</label>
            <textarea value={comments} onChange={(e) => setComments(e.target.value)} />
          </div>
        </Modal>
      ) : null}
    </>
  );
}
