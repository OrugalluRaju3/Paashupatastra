import { FormEvent, useCallback, useEffect, useState } from "react";
import { api, formatInrFromPaise, qs } from "../api";
import { ExpenseListPanel } from "../components/ExpenseListPanel";
import { KpiCard } from "../components/KpiCard";
import { Modal } from "../components/Modal";
import { Pagination } from "../components/Pagination";
import { RowActionsMenu } from "../components/RowActionsMenu";
import { StatusBadge } from "../components/StatusBadge";
import { useToast } from "../components/Toast";
import { useDebouncedValue } from "../hooks/useDebouncedValue";
import { complaintCategoryLabel, EXPENSE_CATEGORIES, formatDateTime } from "../lib/community";
import { digitsPhone } from "../lib/phone";
import type { Paginated } from "../types";

type Section =
  | "home"
  | "units"
  | "members"
  | "notices"
  | "complaints"
  | "visitors"
  | "expenses";

type Apartment = {
  id: number;
  name: string;
  inviteCode: string;
  city: string;
  state: string;
  addressLine: string;
};

type MembershipMe = {
  id: number;
  apartmentId: number;
  role: string;
  status: string;
  apartment: Apartment | null;
};

type Stats = {
  membersPending: number;
  membersApproved: number;
  openComplaints: number;
  unpaidDues: number;
  balanceInPaise: number;
};

type Block = { id: number; name: string };
type Flat = { id: number; number: string; blockId: number; blockName: string | null; createdAt?: string };
type Member = {
  id: number;
  role: string;
  status: string;
  createdAt?: string;
  user: { id: number; name: string | null; phone: string; email: string | null } | null;
};

type SocietyMemberRole = "resident" | "guard";

type InviteResult = {
  loginPath: string;
  phone: string;
  email: string | null;
  role: string;
  emailStatus: string;
  smtpSent: boolean;
  error?: string;
};

const emptyMemberForm = {
  name: "",
  phone: "",
  email: "",
  city: "",
  state: "",
  pinCode: "",
  country: "IN",
  role: "resident" as SocietyMemberRole,
  flatId: "",
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
  otp?: string;
  status: string;
  validFrom: string;
  validTo: string;
  checkedInAt: string | null;
  checkedOutAt: string | null;
};
type Expense = { id: number; category: string; vendor: string; amountInPaise: number; notes: string | null; createdAt: string };
type Account = {
  apartmentId: number;
  balanceInPaise: number;
  monthlyMaintenanceInPaise: number;
  dueDay: number;
};

const COMPLAINT_STATUSES = ["open", "acknowledged", "in_progress", "resolved", "closed"];

export function CommunitySocietyPage({ section }: { section: Section }) {
  const toast = useToast();
  const [memberships, setMemberships] = useState<MembershipMe[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [account, setAccount] = useState<Account | null>(null);
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [flats, setFlats] = useState<Flat[]>([]);
  const [members, setMembers] = useState<Paginated<Member> | null>(null);
  const [memberPage, setMemberPage] = useState(1);
  const [memberStatus, setMemberStatus] = useState("");
  const [notices, setNotices] = useState<Notice[]>([]);
  const [complaints, setComplaints] = useState<Paginated<Complaint> | null>(null);
  const [complaintPage, setComplaintPage] = useState(1);
  const [visitors, setVisitors] = useState<Visitor[]>([]);
  const [expenses, setExpenses] = useState<Paginated<Expense> | null>(null);
  const [expensePage, setExpensePage] = useState(1);
  const [expenseCategory, setExpenseCategory] = useState("");
  const [expenseFrom, setExpenseFrom] = useState("");
  const [expenseTo, setExpenseTo] = useState("");
  const [expenseVendorQ, setExpenseVendorQ] = useState("");
  const expenseVendorSearch = useDebouncedValue(expenseVendorQ.trim(), 350);
  const [noticeOpen, setNoticeOpen] = useState(false);
  const [expenseOpen, setExpenseOpen] = useState(false);
  const [blockName, setBlockName] = useState("");
  const [flatForm, setFlatForm] = useState({ blockId: "", number: "" });
  const [noticeForm, setNoticeForm] = useState({ title: "", body: "" });
  const [expenseForm, setExpenseForm] = useState({
    category: "maintenance",
    vendor: "",
    amountInr: "",
    notes: "",
  });
  const [registerOpen, setRegisterOpen] = useState(false);
  const [registering, setRegistering] = useState(false);
  const [memberForm, setMemberForm] = useState(emptyMemberForm);
  const [registerFlats, setRegisterFlats] = useState<Flat[]>([]);
  const [invite, setInvite] = useState<InviteResult | null>(null);
  const [complaintEdit, setComplaintEdit] = useState<{
    id: number;
    title: string;
    status: string;
    adminNotes: string;
  } | null>(null);
  const [savingComplaint, setSavingComplaint] = useState(false);

  const approved = memberships.find((m) => m.status === "approved" && m.role === "apartment_admin") ?? null;
  const apartmentId = approved?.apartmentId;

  const loadMe = useCallback(async () => {
    const res = await api.get<{ items: MembershipMe[] }>("/community/memberships/me");
    setMemberships(res.items ?? []);
  }, []);

  useEffect(() => {
    void loadMe().catch((err) => toast.error(err instanceof Error ? err.message : "Failed to load"));
  }, [loadMe, toast]);

  const load = useCallback(async () => {
    if (!apartmentId) return;
    const q = { apartmentId };
    try {
      if (section === "home") {
        setStats(await api.get<Stats>(`/community/stats${qs(q)}`));
      } else if (section === "units") {
        const [b, f] = await Promise.all([
          api.get<{ items: Block[] }>(`/community/blocks${qs({ apartmentId })}`),
          api.get<{ items: Flat[] }>(`/community/flats${qs({ apartmentId })}`),
        ]);
        setBlocks(b.items ?? []);
        setFlats(f.items ?? []);
      } else if (section === "members") {
        setMembers(
          await api.get<Paginated<Member>>(
            `/community/memberships${qs({ ...q, page: memberPage, limit: 10, status: memberStatus || undefined })}`,
          ),
        );
      } else if (section === "notices") {
        const res = await api.get<{ items: Notice[] }>(`/community/notices${qs(q)}`);
        setNotices(res.items ?? []);
      } else if (section === "complaints") {
        setComplaints(
          await api.get<Paginated<Complaint>>(
            `/community/complaints${qs({ ...q, page: complaintPage, limit: 10 })}`,
          ),
        );
      } else if (section === "visitors") {
        const res = await api.get<{ items: Visitor[] }>(`/community/visitors${qs(q)}`);
        setVisitors(res.items ?? []);
      } else if (section === "expenses") {
        const [list, acc] = await Promise.all([
          api.get<Paginated<Expense>>(
            `/community/expenses${qs({
              ...q,
              page: expensePage,
              limit: 10,
              category: expenseCategory || undefined,
              q: expenseVendorSearch || undefined,
              fromDate: expenseFrom || undefined,
              toDate: expenseTo || undefined,
            })}`,
          ),
          api.get<Account>(`/community/account${qs(q)}`),
        ]);
        setExpenses(list);
        setAccount(acc);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load");
    }
  }, [
    apartmentId,
    complaintPage,
    expenseCategory,
    expenseFrom,
    expensePage,
    expenseTo,
    expenseVendorSearch,
    memberPage,
    memberStatus,
    section,
    toast,
  ]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setExpensePage(1);
  }, [expenseCategory, expenseFrom, expenseTo, expenseVendorSearch]);

  useEffect(() => {
    if (!registerOpen || !apartmentId) {
      setRegisterFlats([]);
      return;
    }
    void api
      .get<{ items: Flat[] }>(`/community/flats${qs({ apartmentId })}`)
      .then((res) => setRegisterFlats(res.items ?? []))
      .catch(() => setRegisterFlats([]));
  }, [apartmentId, registerOpen]);

  async function addBlock(e: FormEvent) {
    e.preventDefault();
    if (!apartmentId) return;
    try {
      await api.post("/community/blocks", { apartmentId, name: blockName.trim() });
      setBlockName("");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add block");
    }
  }

  async function addFlat(e: FormEvent) {
    e.preventDefault();
    try {
      await api.post("/community/flats", { blockId: Number(flatForm.blockId), number: flatForm.number.trim() });
      setFlatForm({ ...flatForm, number: "" });
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add flat");
    }
  }

  async function decide(id: number, decision: "approve" | "reject" | "suspend") {
    try {
      await api.post(`/community/memberships/${id}/decide`, { decision });
      toast.success(
        decision === "approve" ? "Member activated" : decision === "suspend" ? "Member deactivated" : "Membership rejected",
      );
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Update failed");
    }
  }

  async function setMemberActive(m: Member, active: boolean) {
    if (m.role === "apartment_admin") return;
    const nextApproved = m.status === "approved";
    if (active === nextApproved) return;
    const label = m.user?.name ?? m.user?.phone ?? "this member";
    const ok = window.confirm(
      active
        ? `Activate ${label}? They will be able to use the Community portal again.`
        : `Deactivate ${label}? They will lose access until activated again.`,
    );
    if (!ok) return;
    await decide(m.id, active ? "approve" : "suspend");
  }

  function openRegister() {
    setInvite(null);
    setMemberForm(emptyMemberForm);
    setRegisterOpen(true);
  }

  async function registerMember(e: FormEvent) {
    e.preventDefault();
    if (!apartmentId) return;
    setInvite(null);
    setRegistering(true);
    try {
      const payload: Record<string, unknown> = {
        name: memberForm.name.trim(),
        phone: memberForm.phone.trim(),
        email: memberForm.email.trim(),
        city: memberForm.city.trim(),
        state: memberForm.state.trim(),
        country: memberForm.country.trim() || "IN",
        pinCode: memberForm.pinCode.trim(),
        role: memberForm.role,
        apartmentId,
      };
      if (memberForm.flatId) payload.flatId = Number(memberForm.flatId);
      const res = await api.post<{ invite: InviteResult }>("/community/members/register", payload);
      setInvite(res.invite);
      if (res.invite.error) {
        toast.error(`Member saved, but invite email failed: ${res.invite.error}`);
      } else {
        toast.success(
          res.invite.smtpSent
            ? `Invite emailed to ${res.invite.email}`
            : `Member registered. Email status: ${res.invite.emailStatus}`,
        );
        setRegisterOpen(false);
      }
      setMemberForm(emptyMemberForm);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setRegistering(false);
    }
  }

  async function postNotice(e: FormEvent) {
    e.preventDefault();
    if (!apartmentId) return;
    try {
      await api.post("/community/notices", {
        apartmentId,
        title: noticeForm.title.trim(),
        body: noticeForm.body.trim(),
      });
      toast.success("Notice posted. Residents were notified.");
      setNoticeOpen(false);
      setNoticeForm({ title: "", body: "" });
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to post notice");
    }
  }

  async function updateComplaint(e: FormEvent) {
    e.preventDefault();
    if (!complaintEdit) return;
    setSavingComplaint(true);
    try {
      await api.patch(`/community/complaints/${complaintEdit.id}`, {
        status: complaintEdit.status,
        adminNotes: complaintEdit.adminNotes.trim() || null,
      });
      toast.success("Complaint updated");
      setComplaintEdit(null);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Update failed");
    } finally {
      setSavingComplaint(false);
    }
  }

  async function postExpense(e: FormEvent) {
    e.preventDefault();
    if (!apartmentId) return;
    const amountInPaise = Math.round(Number(expenseForm.amountInr) * 100);
    if (!Number.isFinite(amountInPaise) || amountInPaise <= 0) {
      toast.error("Enter a valid amount");
      return;
    }
    try {
      await api.post("/community/expenses", {
        apartmentId,
        category: expenseForm.category.trim(),
        vendor: expenseForm.vendor.trim(),
        amountInPaise,
        notes: expenseForm.notes.trim() || null,
      });
      toast.success("Expense recorded");
      setExpenseForm({ category: "maintenance", vendor: "", amountInr: "", notes: "" });
      setExpenseOpen(false);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to record expense");
    }
  }

  if (!approved) {
    return (
      <>
        <div className="topbar">
          <div>
            <h2>Apartment admin</h2>
            <p>
              Community Super Admin registers apartment admins and assigns the society. Use the
              login from your invitation email.
            </p>
          </div>
        </div>
        {memberships.length > 0 ? (
          <section className="panel">
            {memberships.map((m) => (
              <p key={m.id}>
                {m.apartment?.name ?? "Apartment"} · {m.role.replaceAll("_", " ")} ·{" "}
                <StatusBadge status={m.status} />
              </p>
            ))}
          </section>
        ) : (
          <section className="panel" style={{ padding: "1.25rem" }}>
            <p>
              You are not registered as an apartment admin yet. Ask Community Super Admin to
              register this mobile and assign a society.
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
          <h2>{approved.apartment?.name ?? "Society"}</h2>
          <p>Invite code: {approved.apartment?.inviteCode}</p>
        </div>
        {section === "members" ? (
          <button className="btn btn-primary" type="button" onClick={openRegister}>
            Register member
          </button>
        ) : null}
        {section === "notices" ? (
          <button className="btn btn-primary" type="button" onClick={() => setNoticeOpen(true)}>
            Post notice
          </button>
        ) : null}
        {section === "expenses" ? (
          <button className="btn btn-primary" type="button" onClick={() => setExpenseOpen(true)}>
            Record expense
          </button>
        ) : null}
      </div>

      {section === "home" ? (
        <div className="kpi-grid">
          <KpiCard label="Balance" value={formatInrFromPaise(stats?.balanceInPaise ?? 0)} />
          <KpiCard label="Approved members" value={stats?.membersApproved ?? 0} />
          <KpiCard label="Pending joins" value={stats?.membersPending ?? 0} />
          <KpiCard label="Open complaints" value={stats?.openComplaints ?? 0} />
        </div>
      ) : null}

      {section === "units" ? (
        <section className="panel">
          <div className="panel-body">
          <form onSubmit={addBlock} className="auth-form" style={{ marginBottom: "1rem" }}>
            <div className="field">
              <label htmlFor="block">Add block / tower</label>
              <input id="block" required value={blockName} onChange={(e) => setBlockName(e.target.value)} />
            </div>
            <button className="btn btn-primary" type="submit">
              Add block
            </button>
          </form>
          <form onSubmit={addFlat} className="auth-form">
            <div className="grid-2">
              <div className="field">
                <label htmlFor="fblock">Block</label>
                <select
                  id="fblock"
                  required
                  value={flatForm.blockId}
                  onChange={(e) => setFlatForm({ ...flatForm, blockId: e.target.value })}
                >
                  <option value="">Select</option>
                  {blocks.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="fnum">Flat number</label>
                <input
                  id="fnum"
                  required
                  value={flatForm.number}
                  onChange={(e) => setFlatForm({ ...flatForm, number: e.target.value })}
                />
              </div>
            </div>
            <button className="btn btn-primary" type="submit">
              Add flat
            </button>
          </form>
          </div>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Block</th>
                  <th>Flat</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {flats.map((f) => (
                  <tr key={f.id}>
                    <td>{f.blockName ?? f.blockId}</td>
                    <td>{f.number}</td>
                    <td>{formatDateTime(f.createdAt)}</td>
                  </tr>
                ))}
                {flats.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="empty">
                      No units yet.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {section === "members" ? (
        <section className="panel">
          <div className="panel-head">
            <div className="tabs">
              {["", "pending", "approved", "rejected", "suspended"].map((s) => (
                <button
                  key={s || "all"}
                  type="button"
                  className={`intent${memberStatus === s ? " active" : ""}`}
                  onClick={() => setMemberStatus(s)}
                >
                  {s || "all"}
                </button>
              ))}
            </div>
          </div>
          {invite && !registerOpen ? (
            <div className="panel-body" style={{ borderBottom: "1px solid var(--line)" }}>
              <strong>Last invite</strong>
              <div>Login path: {invite.loginPath}</div>
              <div>Mobile: {invite.phone}</div>
              <div>Email: {invite.email}</div>
              <div>
                Email status: {invite.emailStatus}
                {invite.smtpSent ? " (SMTP sent)" : ""}
              </div>
            </div>
          ) : null}
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Member</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Created</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {(members?.items ?? []).map((m) => (
                  <tr key={m.id}>
                    <td>
                      <strong>{m.user?.name ?? "—"}</strong>
                      <div className="muted mono">{m.user?.phone}</div>
                    </td>
                    <td>{m.role.replaceAll("_", " ")}</td>
                    <td>
                      <StatusBadge status={m.status === "approved" ? "active" : m.status === "suspended" ? "inactive" : m.status} />
                    </td>
                    <td>{formatDateTime(m.createdAt)}</td>
                    <td>
                      {m.role === "apartment_admin" ? (
                        "—"
                      ) : (
                        <RowActionsMenu
                          label={`Actions for ${m.user?.name ?? m.user?.phone ?? "member"}`}
                          items={[
                            {
                              id: "activate",
                              label: "Activate",
                              disabled: m.status === "approved",
                              onClick: () => void setMemberActive(m, true),
                            },
                            {
                              id: "deactivate",
                              label: "Deactivate",
                              tone: "danger",
                              disabled: m.status === "suspended",
                              onClick: () => void setMemberActive(m, false),
                            },
                          ]}
                        />
                      )}
                    </td>
                  </tr>
                ))}
                {members && members.items.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="empty">
                      No members found.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
          <Pagination
            page={members?.page ?? 1}
            totalPages={members?.totalPages ?? 1}
            total={members?.total ?? 0}
            onPageChange={setMemberPage}
          />
        </section>
      ) : null}

      {section === "notices" ? (
        <section className="panel">
          {notices.map((n) => (
            <article key={n.id} className="stack-item">
              <h3>{n.title}</h3>
              <p>{n.body}</p>
              <p className="muted">{formatDateTime(n.createdAt)}</p>
            </article>
          ))}
        </section>
      ) : null}

      {section === "complaints" ? (
        <section className="panel">
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Complaint</th>
                  <th>Registered</th>
                  <th>Closed</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {(complaints?.items ?? []).map((c) => (
                  <tr key={c.id}>
                    <td>
                      <strong>{c.title}</strong>
                      <div className="muted">
                        {complaintCategoryLabel(c.category)} · {c.body}
                      </div>
                    </td>
                    <td>{formatDateTime(c.createdAt)}</td>
                    <td>{formatDateTime(c.closedAt)}</td>
                    <td>
                      <StatusBadge status={c.status} />
                    </td>
                    <td>
                      <select
                        aria-label={`Change status for ${c.title}`}
                        value={c.status}
                        onChange={(e) => {
                          const next = e.target.value;
                          if (next === c.status) return;
                          setComplaintEdit({
                            id: c.id,
                            title: c.title,
                            status: next,
                            adminNotes: c.adminNotes ?? "",
                          });
                        }}
                      >
                        {COMPLAINT_STATUSES.map((s) => (
                          <option key={s} value={s}>
                            {s.replaceAll("_", " ")}
                          </option>
                        ))}
                      </select>
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
                  <th>Checked in</th>
                  <th>Checked out</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {visitors.map((v) => (
                  <tr key={v.id}>
                    <td>{v.guestName}</td>
                    <td className="mono">{v.otp ?? "—"}</td>
                    <td>{formatDateTime(v.checkedInAt)}</td>
                    <td>{formatDateTime(v.checkedOutAt)}</td>
                    <td>
                      <StatusBadge status={v.status} />
                    </td>
                  </tr>
                ))}
                {visitors.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="empty">
                      No visitor passes yet.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {section === "expenses" ? (
        <ExpenseListPanel
          apartmentId={apartmentId}
          data={expenses}
          heading={`Balance: ${formatInrFromPaise(account?.balanceInPaise ?? 0)}`}
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

      {noticeOpen ? (
        <Modal
          title="Post notice"
          onClose={() => setNoticeOpen(false)}
          footer={
            <button className="btn btn-primary" type="submit" form="notice-form">
              Post
            </button>
          }
        >
          <form id="notice-form" onSubmit={postNotice} className="auth-form">
            <div className="field">
              <label htmlFor="ntitle">Title</label>
              <input
                id="ntitle"
                required
                minLength={3}
                value={noticeForm.title}
                onChange={(e) => setNoticeForm({ ...noticeForm, title: e.target.value })}
              />
            </div>
            <div className="field">
              <label htmlFor="nbody">Body</label>
              <textarea
                id="nbody"
                required
                minLength={3}
                value={noticeForm.body}
                onChange={(e) => setNoticeForm({ ...noticeForm, body: e.target.value })}
              />
            </div>
          </form>
        </Modal>
      ) : null}

      {expenseOpen ? (
        <Modal
          title="Record expense"
          onClose={() => setExpenseOpen(false)}
          footer={
            <button className="btn btn-primary" type="submit" form="exp-form">
              Save
            </button>
          }
        >
          <form id="exp-form" onSubmit={postExpense} className="auth-form">
            <div className="field">
              <label htmlFor="ecat">Category</label>
              <select
                id="ecat"
                required
                value={expenseForm.category}
                onChange={(e) => setExpenseForm({ ...expenseForm, category: e.target.value })}
              >
                {EXPENSE_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat.replaceAll("_", " ")}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="evend">Vendor</label>
              <input
                id="evend"
                required
                value={expenseForm.vendor}
                onChange={(e) => setExpenseForm({ ...expenseForm, vendor: e.target.value })}
              />
            </div>
            <div className="field">
              <label htmlFor="eamt">Amount (₹)</label>
              <input
                id="eamt"
                required
                type="number"
                min={1}
                value={expenseForm.amountInr}
                onChange={(e) => setExpenseForm({ ...expenseForm, amountInr: e.target.value })}
              />
            </div>
            <div className="field">
              <label htmlFor="enotes">Notes</label>
              <textarea
                id="enotes"
                value={expenseForm.notes}
                onChange={(e) => setExpenseForm({ ...expenseForm, notes: e.target.value })}
              />
            </div>
          </form>
        </Modal>
      ) : null}

      {registerOpen ? (
        <Modal
          title="Register resident or guard"
          onClose={() => setRegisterOpen(false)}
          footer={
            <>
              <button className="btn btn-ghost" type="button" onClick={() => setRegisterOpen(false)}>
                Cancel
              </button>
              <button className="btn btn-primary" type="submit" form="society-register-form" disabled={registering}>
                {registering ? "Registering…" : "Register & send invite"}
              </button>
            </>
          }
        >
          <p className="muted">
            Register a resident or guard for this apartment. They receive an invitation email and
            in-app notification, then log in at Community login with OTP.
          </p>
          <form id="society-register-form" onSubmit={registerMember} className="auth-form">
            <div className="grid-2">
              <div className="field">
                <label htmlFor="sm-name">Full name</label>
                <input
                  id="sm-name"
                  required
                  minLength={2}
                  value={memberForm.name}
                  onChange={(e) => setMemberForm({ ...memberForm, name: e.target.value })}
                />
              </div>
              <div className="field">
                <label htmlFor="sm-role">Role</label>
                <select
                  id="sm-role"
                  value={memberForm.role}
                  onChange={(e) =>
                    setMemberForm({
                      ...memberForm,
                      role: e.target.value as SocietyMemberRole,
                      flatId: e.target.value === "resident" ? memberForm.flatId : "",
                    })
                  }
                >
                  <option value="resident">Resident</option>
                  <option value="guard">Community guard</option>
                </select>
              </div>
            </div>
            <div className="grid-2">
              <div className="field">
                <label htmlFor="sm-phone">Mobile (login ID)</label>
                <input
                  id="sm-phone"
                  inputMode="numeric"
                  maxLength={10}
                  required
                  pattern="[0-9]{10}"
                  placeholder="10-digit Indian mobile"
                  value={memberForm.phone}
                  onChange={(e) => setMemberForm({ ...memberForm, phone: digitsPhone(e.target.value) })}
                />
              </div>
              <div className="field">
                <label htmlFor="sm-email">Email</label>
                <input
                  id="sm-email"
                  type="email"
                  required
                  value={memberForm.email}
                  onChange={(e) => setMemberForm({ ...memberForm, email: e.target.value })}
                />
              </div>
            </div>
            <div className="grid-2">
              <div className="field">
                <label htmlFor="sm-city">City</label>
                <input
                  id="sm-city"
                  required
                  value={memberForm.city}
                  onChange={(e) => setMemberForm({ ...memberForm, city: e.target.value })}
                />
              </div>
              <div className="field">
                <label htmlFor="sm-state">State</label>
                <input
                  id="sm-state"
                  required
                  value={memberForm.state}
                  onChange={(e) => setMemberForm({ ...memberForm, state: e.target.value })}
                />
              </div>
            </div>
            <div className="grid-2">
              <div className="field">
                <label htmlFor="sm-pin">PIN code</label>
                <input
                  id="sm-pin"
                  required
                  maxLength={6}
                  pattern="[0-9]{6}"
                  value={memberForm.pinCode}
                  onChange={(e) =>
                    setMemberForm({ ...memberForm, pinCode: e.target.value.replace(/\D/g, "").slice(0, 6) })
                  }
                />
              </div>
              <div className="field">
                <label htmlFor="sm-country">Country</label>
                <input
                  id="sm-country"
                  required
                  value={memberForm.country}
                  onChange={(e) => setMemberForm({ ...memberForm, country: e.target.value })}
                />
              </div>
            </div>
            {memberForm.role === "resident" ? (
              <div className="field">
                <label htmlFor="sm-flat">Flat</label>
                <select
                  id="sm-flat"
                  required
                  value={memberForm.flatId}
                  onChange={(e) => setMemberForm({ ...memberForm, flatId: e.target.value })}
                >
                  <option value="">Select flat</option>
                  {registerFlats.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.blockName ? `${f.blockName} · ` : ""}
                      {f.number}
                    </option>
                  ))}
                </select>
                {registerFlats.length === 0 ? (
                  <p className="muted">No flats yet. Add blocks and flats under Units first.</p>
                ) : null}
              </div>
            ) : null}
            {invite?.error ? <p className="error">{invite.error}</p> : null}
          </form>
        </Modal>
      ) : null}

      {complaintEdit ? (
        <Modal
          title="Update complaint"
          onClose={() => setComplaintEdit(null)}
          footer={
            <>
              <button className="btn btn-ghost" type="button" onClick={() => setComplaintEdit(null)}>
                Cancel
              </button>
              <button
                className="btn btn-primary"
                type="submit"
                form="complaint-status-form"
                disabled={savingComplaint}
              >
                {savingComplaint ? "Saving…" : "Save status"}
              </button>
            </>
          }
        >
          <form id="complaint-status-form" onSubmit={updateComplaint} className="auth-form">
            <p>
              <strong>{complaintEdit.title}</strong>
            </p>
            <div className="field">
              <label htmlFor="c-status">Status</label>
              <select
                id="c-status"
                value={complaintEdit.status}
                onChange={(e) => setComplaintEdit({ ...complaintEdit, status: e.target.value })}
              >
                {COMPLAINT_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s.replaceAll("_", " ")}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="c-notes">Admin notes</label>
              <textarea
                id="c-notes"
                rows={4}
                maxLength={2000}
                placeholder="Add a note for the resident (optional)"
                value={complaintEdit.adminNotes}
                onChange={(e) => setComplaintEdit({ ...complaintEdit, adminNotes: e.target.value })}
              />
            </div>
          </form>
        </Modal>
      ) : null}
    </>
  );
}
