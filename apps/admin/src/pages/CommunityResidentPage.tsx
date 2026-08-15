import { FormEvent, useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, qs } from "../api";
import { ExpenseListPanel, type CommunityExpenseItem } from "../components/ExpenseListPanel";
import { Modal } from "../components/Modal";
import { Pagination } from "../components/Pagination";
import { StatusBadge } from "../components/StatusBadge";
import { useToast } from "../components/Toast";
import { useDebouncedValue } from "../hooks/useDebouncedValue";
import {
  COMPLAINT_CATEGORIES,
  complaintCategoryLabel,
  defaultVisitorWindow,
  formatDateTime,
  toIsoFromLocal,
} from "../lib/community";
import type { Paginated } from "../types";

type Section = "home" | "notices" | "expenses" | "complaints" | "visitors" | "guards";

type Apartment = {
  id: number;
  name: string;
  inviteCode: string;
  city: string;
  addressLine: string;
};

type Membership = {
  id: number;
  apartmentId: number;
  role: string;
  status: string;
  rejectedReason: string | null;
  apartment: Apartment | null;
  flat: { id: number; number: string; blockName: string | null } | null;
};

type Notice = { id: number; title: string; body: string; createdAt: string };
type Complaint = {
  id: number;
  category: string;
  title: string;
  body: string;
  status: string;
  adminNotes: string | null;
  createdAt: string;
  closedAt: string | null;
};
type Visitor = {
  id: number;
  guestName: string;
  guestPhone: string | null;
  vehicleNumber: string | null;
  purpose: string | null;
  validFrom: string;
  validTo: string;
  otp?: string;
  status: string;
  checkedInAt: string | null;
  checkedOutAt: string | null;
};
type Guard = {
  id: number;
  createdAt?: string;
  user: { id: number; name: string | null; phone: string } | null;
};

export function CommunityResidentPage({ section }: { section: Section }) {
  const toast = useToast();
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [notices, setNotices] = useState<Notice[]>([]);
  const [expenses, setExpenses] = useState<Paginated<CommunityExpenseItem> | null>(null);
  const [expensePage, setExpensePage] = useState(1);
  const [expenseCategory, setExpenseCategory] = useState("");
  const [expenseFrom, setExpenseFrom] = useState("");
  const [expenseTo, setExpenseTo] = useState("");
  const [expenseVendorQ, setExpenseVendorQ] = useState("");
  const expenseVendorSearch = useDebouncedValue(expenseVendorQ.trim(), 350);
  const [complaints, setComplaints] = useState<Paginated<Complaint> | null>(null);
  const [complaintPage, setComplaintPage] = useState(1);
  const [visitors, setVisitors] = useState<Visitor[]>([]);
  const [guards, setGuards] = useState<Paginated<Guard> | null>(null);
  const [guardPage, setGuardPage] = useState(1);
  const [guardQ, setGuardQ] = useState("");
  const guardSearch = useDebouncedValue(guardQ.trim(), 350);
  const [complaintOpen, setComplaintOpen] = useState(false);
  const [visitorOpen, setVisitorOpen] = useState(false);
  const [complaintForm, setComplaintForm] = useState({
    category: "other",
    title: "",
    body: "",
  });
  const windowDefaults = defaultVisitorWindow();
  const [visitorForm, setVisitorForm] = useState({
    guestName: "",
    guestPhone: "",
    vehicleNumber: "",
    purpose: "",
    validFrom: windowDefaults.validFrom,
    validTo: windowDefaults.validTo,
  });

  const approved = memberships.find((m) => m.status === "approved") ?? null;
  const pending = memberships.find((m) => m.status === "pending") ?? null;

  const loadMe = useCallback(async () => {
    const res = await api.get<{ items: Membership[] }>("/community/memberships/me");
    setMemberships(res.items ?? []);
  }, []);

  useEffect(() => {
    void loadMe().catch((err) => toast.error(err instanceof Error ? err.message : "Failed to load"));
  }, [loadMe, toast]);

  const loadApprovedData = useCallback(async () => {
    if (!approved) return;
    try {
      if (section === "notices") {
        const res = await api.get<{ items: Notice[] }>("/community/notices");
        setNotices(res.items ?? []);
      } else if (section === "expenses") {
        setExpenses(
          await api.get<Paginated<CommunityExpenseItem>>(
            `/community/expenses${qs({
              apartmentId: approved.apartmentId,
              page: expensePage,
              limit: 10,
              category: expenseCategory || undefined,
              q: expenseVendorSearch || undefined,
              fromDate: expenseFrom || undefined,
              toDate: expenseTo || undefined,
            })}`,
          ),
        );
      } else if (section === "complaints") {
        setComplaints(
          await api.get<Paginated<Complaint>>(`/community/complaints${qs({ page: complaintPage, limit: 10 })}`),
        );
      } else if (section === "visitors") {
        const res = await api.get<{ items: Visitor[] }>("/community/visitors");
        setVisitors(res.items ?? []);
      } else if (section === "guards") {
        setGuards(
          await api.get<Paginated<Guard>>(
            `/community/memberships${qs({
              apartmentId: approved.apartmentId,
              page: guardPage,
              limit: 10,
              q: guardSearch || undefined,
            })}`,
          ),
        );
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load");
    }
  }, [approved, complaintPage, expenseCategory, expenseFrom, expensePage, expenseTo, expenseVendorSearch, guardPage, guardSearch, section, toast]);

  useEffect(() => {
    void loadApprovedData();
  }, [loadApprovedData]);

  useEffect(() => {
    setGuardPage(1);
  }, [guardSearch]);

  useEffect(() => {
    setExpensePage(1);
  }, [expenseCategory, expenseFrom, expenseTo, expenseVendorSearch]);

  async function submitComplaint(e: FormEvent) {
    e.preventDefault();
    try {
      await api.post("/community/complaints", {
        category: complaintForm.category,
        title: complaintForm.title.trim(),
        body: complaintForm.body.trim(),
      });
      toast.success("Complaint submitted");
      setComplaintOpen(false);
      setComplaintForm({ category: "other", title: "", body: "" });
      await loadApprovedData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to submit complaint");
    }
  }

  async function submitVisitor(e: FormEvent) {
    e.preventDefault();
    const validFrom = toIsoFromLocal(visitorForm.validFrom);
    const validTo = toIsoFromLocal(visitorForm.validTo);
    if (!validFrom || !validTo) {
      toast.error("Enter a valid visitor window");
      return;
    }
    try {
      await api.post("/community/visitors", {
        guestName: visitorForm.guestName.trim(),
        guestPhone: visitorForm.guestPhone.trim() || undefined,
        vehicleNumber: visitorForm.vehicleNumber.trim() || null,
        purpose: visitorForm.purpose.trim() || null,
        validFrom,
        validTo,
      });
      toast.success("Visitor pass created. Share the OTP with your guest.");
      setVisitorOpen(false);
      await loadApprovedData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create pass");
    }
  }

  if (!approved) {
    return (
      <>
        <div className="topbar">
          <div>
            <h2>Community</h2>
            <p>
              Community Super Admin registers residents and assigns your apartment. Use the login
              from your invitation email.
            </p>
          </div>
        </div>
        {pending ? (
          <section className="panel" style={{ padding: "1rem", marginBottom: "1rem" }}>
            <p>
              Your membership for {pending.apartment?.name ?? "the apartment"} is{" "}
              <StatusBadge status={pending.status} />.
            </p>
            {pending.rejectedReason ? <p className="error">{pending.rejectedReason}</p> : null}
          </section>
        ) : (
          <section className="panel" style={{ padding: "1.25rem" }}>
            <p>
              You are not registered for an apartment yet. Ask Community Super Admin to register
              this mobile as a resident.
            </p>
          </section>
        )}
      </>
    );
  }

  return (
    <>
      <div className="topbar">
        <div>
          <h2>
            {section === "home"
              ? approved.apartment?.name ?? "Community"
              : section[0].toUpperCase() + section.slice(1)}
          </h2>
          <p>
            {approved.flat
              ? `Flat ${approved.flat.blockName ? `${approved.flat.blockName}-` : ""}${approved.flat.number}`
              : "Approved resident"}
          </p>
        </div>
        {section === "complaints" ? (
          <button className="btn btn-primary" type="button" onClick={() => setComplaintOpen(true)}>
            New complaint
          </button>
        ) : null}
        {section === "visitors" ? (
          <button className="btn btn-primary" type="button" onClick={() => setVisitorOpen(true)}>
            New visitor pass
          </button>
        ) : null}
      </div>

      {section === "home" ? (
        <p className="muted">
          Need help? <Link to="/app/help/faq">Open the help centre</Link>
        </p>
      ) : null}

      {section === "notices" ? (
        <section className="panel">
          {notices.length === 0 ? <p className="muted">No notices yet.</p> : null}
          {notices.map((n) => (
            <article key={n.id} className="stack-item">
              <h3>{n.title}</h3>
              <p>{n.body}</p>
              <p className="muted">{formatDateTime(n.createdAt)}</p>
            </article>
          ))}
        </section>
      ) : null}

      {section === "expenses" ? (
        <ExpenseListPanel
          apartmentId={approved?.apartmentId}
          data={expenses}
          category={expenseCategory}
          fromDate={expenseFrom}
          toDate={expenseTo}
          vendorQ={expenseVendorQ}
          onCategoryChange={setExpenseCategory}
          onFromDateChange={setExpenseFrom}
          onToDateChange={setExpenseTo}
          onVendorQChange={setExpenseVendorQ}
          onPageChange={setExpensePage}
        />
      ) : null}

      {section === "complaints" ? (
        <section className="panel">
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Category</th>
                  <th>Registered</th>
                  <th>Closed</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {(complaints?.items ?? []).map((c) => (
                  <tr key={c.id}>
                    <td>
                      <strong>{c.title}</strong>
                      <div className="muted">{c.body}</div>
                      {c.adminNotes ? <div className="muted">Admin: {c.adminNotes}</div> : null}
                    </td>
                    <td>{complaintCategoryLabel(c.category)}</td>
                    <td>{formatDateTime(c.createdAt)}</td>
                    <td>{formatDateTime(c.closedAt)}</td>
                    <td>
                      <StatusBadge status={c.status} />
                    </td>
                  </tr>
                ))}
                {complaints && complaints.items.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="empty">
                      No complaints yet.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
          <Pagination
            page={complaints?.page ?? 1}
            totalPages={complaints?.totalPages ?? 1}
            total={complaints?.total ?? 0}
            onPageChange={setComplaintPage}
          />
        </section>
      ) : null}

      {section === "visitors" ? (
        <section className="panel">
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Guest</th>
                  <th>OTP</th>
                  <th>Window</th>
                  <th>Checked in</th>
                  <th>Checked out</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {visitors.map((v) => (
                  <tr key={v.id}>
                    <td>
                      {v.guestName}
                      {v.vehicleNumber ? <div className="muted mono">{v.vehicleNumber}</div> : null}
                    </td>
                    <td className="mono">{v.otp ?? "—"}</td>
                    <td>
                      {formatDateTime(v.validFrom)} – {formatDateTime(v.validTo)}
                    </td>
                    <td>{formatDateTime(v.checkedInAt)}</td>
                    <td>{formatDateTime(v.checkedOutAt)}</td>
                    <td>
                      <StatusBadge status={v.status} />
                    </td>
                  </tr>
                ))}
                {visitors.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="empty">
                      No visitor passes yet.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {section === "guards" ? (
        <section className="panel">
          <div className="panel-head">
            <h3>Guards</h3>
            <div className="toolbar">
              <input
                className="search"
                placeholder="Search name or phone"
                value={guardQ}
                onChange={(e) => setGuardQ(e.target.value)}
              />
            </div>
          </div>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Phone</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {(guards?.items ?? []).map((g) => (
                  <tr key={g.id}>
                    <td>
                      <strong>{g.user?.name ?? "—"}</strong>
                    </td>
                    <td className="mono">{g.user?.phone ?? "—"}</td>
                    <td>{formatDateTime(g.createdAt)}</td>
                  </tr>
                ))}
                {guards && guards.items.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="empty">
                      {guardQ.trim() ? "No guards match this search." : "No guards yet."}
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
          <Pagination
            page={guards?.page ?? 1}
            totalPages={guards?.totalPages ?? 1}
            total={guards?.total ?? 0}
            onPageChange={setGuardPage}
          />
        </section>
      ) : null}

      {complaintOpen ? (
      <Modal
        title="New complaint"
        onClose={() => setComplaintOpen(false)}
        footer={
          <button className="btn btn-primary" type="submit" form="complaint-form">
            Submit
          </button>
        }
      >
        <form id="complaint-form" onSubmit={submitComplaint} className="auth-form">
          <div className="field">
            <label htmlFor="cat">Category</label>
            <select
              id="cat"
              value={complaintForm.category}
              onChange={(e) => setComplaintForm({ ...complaintForm, category: e.target.value })}
            >
              {COMPLAINT_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {complaintCategoryLabel(c)}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="ctitle">Title</label>
            <input
              id="ctitle"
              required
              minLength={3}
              value={complaintForm.title}
              onChange={(e) => setComplaintForm({ ...complaintForm, title: e.target.value })}
            />
          </div>
          <div className="field">
            <label htmlFor="cbody">Details</label>
            <textarea
              id="cbody"
              required
              minLength={3}
              value={complaintForm.body}
              onChange={(e) => setComplaintForm({ ...complaintForm, body: e.target.value })}
            />
          </div>
          <button className="btn btn-ghost" type="button" onClick={() => setComplaintOpen(false)}>
            Cancel
          </button>
        </form>
      </Modal>
      ) : null}

      {visitorOpen ? (
      <Modal
        title="Visitor pass"
        onClose={() => setVisitorOpen(false)}
        footer={
          <button className="btn btn-primary" type="submit" form="visitor-form">
            Create pass
          </button>
        }
      >
        <form id="visitor-form" onSubmit={submitVisitor} className="auth-form">
          <div className="field">
            <label htmlFor="gname">Guest name</label>
            <input
              id="gname"
              required
              minLength={2}
              value={visitorForm.guestName}
              onChange={(e) => setVisitorForm({ ...visitorForm, guestName: e.target.value })}
            />
          </div>
          <div className="field">
            <label htmlFor="gphone">Guest phone</label>
            <input
              id="gphone"
              inputMode="numeric"
              maxLength={10}
              value={visitorForm.guestPhone}
              onChange={(e) =>
                setVisitorForm({ ...visitorForm, guestPhone: e.target.value.replace(/\D/g, "").slice(0, 10) })
              }
            />
          </div>
          <div className="grid-2">
            <div className="field">
              <label htmlFor="from">Valid from</label>
              <input
                id="from"
                type="datetime-local"
                required
                value={visitorForm.validFrom}
                onChange={(e) => setVisitorForm({ ...visitorForm, validFrom: e.target.value })}
              />
            </div>
            <div className="field">
              <label htmlFor="to">Valid to</label>
              <input
                id="to"
                type="datetime-local"
                required
                value={visitorForm.validTo}
                onChange={(e) => setVisitorForm({ ...visitorForm, validTo: e.target.value })}
              />
            </div>
          </div>
          <div className="field">
            <label htmlFor="veh">Vehicle (optional)</label>
            <input
              id="veh"
              value={visitorForm.vehicleNumber}
              onChange={(e) => setVisitorForm({ ...visitorForm, vehicleNumber: e.target.value })}
            />
          </div>
          <div className="field">
            <label htmlFor="purpose">Purpose</label>
            <input
              id="purpose"
              value={visitorForm.purpose}
              onChange={(e) => setVisitorForm({ ...visitorForm, purpose: e.target.value })}
            />
          </div>
          <button className="btn btn-ghost" type="button" onClick={() => setVisitorOpen(false)}>
            Cancel
          </button>
        </form>
      </Modal>
      ) : null}
    </>
  );
}
