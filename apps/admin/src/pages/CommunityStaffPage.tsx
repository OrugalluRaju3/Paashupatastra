import { FormEvent, useCallback, useEffect, useState } from "react";
import { api, qs } from "../api";
import { KpiCard } from "../components/KpiCard";
import { Modal } from "../components/Modal";
import { Pagination } from "../components/Pagination";
import { RowActionsMenu } from "../components/RowActionsMenu";
import { StatusBadge } from "../components/StatusBadge";
import { useToast } from "../components/Toast";
import { digitsPhone } from "../lib/phone";
import { formatDateTime } from "../lib/community";
import type { Apartment, ApartmentStats, Paginated } from "../types";

type Tab = "overview" | "apartments" | "members";

type Stats = {
  apartments: number;
  membersPending: number;
  membersApproved: number;
  openComplaints: number;
  unpaidDues: number;
  balanceInPaise: number;
};

type Member = {
  id: number;
  apartmentId: number;
  role: string;
  status: string;
  createdAt?: string;
  apartment: { id: number; name: string } | null;
  user: { id: number; name: string | null; phone: string; email: string | null } | null;
};

type FlatOption = { id: number; number: string; blockName: string | null };

type MemberRole = "resident" | "apartment_admin" | "guard";

type InviteResult = {
  loginPath: string;
  phone: string;
  email: string | null;
  role: string;
  emailStatus: string;
  smtpSent: boolean;
  error?: string;
};

const emptyApt = { name: "", city: "", state: "", addressLine: "", isActive: true };

const emptyMemberForm = {
  name: "",
  phone: "",
  email: "",
  city: "",
  state: "",
  pinCode: "",
  country: "IN",
  role: "resident" as MemberRole,
  apartmentId: "",
  flatId: "",
};

export function CommunityStaffPage() {
  const toast = useToast();
  const [tab, setTab] = useState<Tab>("overview");
  const [stats, setStats] = useState<Stats | null>(null);
  const [aptStats, setAptStats] = useState<ApartmentStats | null>(null);
  const [apartments, setApartments] = useState<Paginated<Apartment> | null>(null);
  const [aptPage, setAptPage] = useState(1);
  const [members, setMembers] = useState<Paginated<Member> | null>(null);
  const [memberPage, setMemberPage] = useState(1);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Apartment | null>(null);
  const [form, setForm] = useState(emptyApt);
  const [registerOpen, setRegisterOpen] = useState(false);
  const [registering, setRegistering] = useState(false);
  const [memberForm, setMemberForm] = useState(emptyMemberForm);
  const [registerApartments, setRegisterApartments] = useState<Apartment[]>([]);
  const [registerFlats, setRegisterFlats] = useState<FlatOption[]>([]);
  const [invite, setInvite] = useState<InviteResult | null>(null);

  const load = useCallback(async () => {
    try {
      if (tab === "overview") {
        setStats(await api.get<Stats>("/community/stats"));
        setAptStats(await api.get<ApartmentStats>("/apartments/stats"));
      } else if (tab === "apartments") {
        setApartments(await api.get<Paginated<Apartment>>(`/apartments${qs({ page: aptPage, limit: 10 })}`));
      } else if (tab === "members") {
        setMembers(
          await api.get<Paginated<Member>>(`/community/memberships${qs({ page: memberPage, limit: 10 })}`),
        );
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load");
    }
  }, [aptPage, memberPage, tab, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!registerOpen || !memberForm.apartmentId) {
      setRegisterFlats([]);
      return;
    }
    void api
      .get<{ items: FlatOption[] }>(`/community/flats${qs({ apartmentId: memberForm.apartmentId })}`)
      .then((res) => setRegisterFlats(res.items ?? []))
      .catch(() => setRegisterFlats([]));
  }, [memberForm.apartmentId, registerOpen]);

  async function saveApartment(e: FormEvent) {
    e.preventDefault();
    try {
      if (editing) {
        await api.patch(`/apartments/${editing.id}`, form);
      } else {
        await api.post("/apartments", form);
      }
      toast.success(editing ? "Apartment updated" : "Apartment created");
      setFormOpen(false);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    }
  }

  function openEdit(a: Apartment) {
    setEditing(a);
    setForm({
      name: a.name,
      city: a.city,
      state: a.state,
      addressLine: a.addressLine,
      isActive: a.isActive,
    });
    setFormOpen(true);
  }

  async function setApartmentActive(a: Apartment, isActive: boolean) {
    if (a.isActive === isActive) return;
    const ok = window.confirm(
      isActive
        ? `Activate "${a.name}"? Residents, apartment admins, and guards will be able to use it again.`
        : `Deactivate "${a.name}"? It will no longer be available for community login and operations.`,
    );
    if (!ok) return;
    try {
      await api.patch(`/apartments/${a.id}`, { isActive });
      toast.success(isActive ? "Apartment activated" : "Apartment deactivated");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Update failed");
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
    if (active === (m.status === "approved")) return;
    const label = m.user?.name ?? m.user?.phone ?? "this member";
    const ok = window.confirm(
      active
        ? `Activate ${label}? They will be able to use the Community portal again.`
        : `Deactivate ${label}? They will lose access until activated again.`,
    );
    if (!ok) return;
    await decide(m.id, active ? "approve" : "suspend");
  }

  async function openRegister() {
    setInvite(null);
    setMemberForm(emptyMemberForm);
    setRegisterFlats([]);
    try {
      const res = await api.get<Paginated<Apartment>>(`/apartments${qs({ page: 1, limit: 100 })}`);
      setRegisterApartments(res.items ?? []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load apartments");
      setRegisterApartments([]);
    }
    setRegisterOpen(true);
  }

  async function registerMember(e: FormEvent) {
    e.preventDefault();
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
        apartmentId: Number(memberForm.apartmentId),
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

  return (
    <>
      <div className="topbar">
        <div>
          <h2>Community operations</h2>
          <p>
            {tab === "members"
              ? "Register apartment admins, residents, and guards. They receive an invite email and notification."
              : "Apartments and memberships."}
          </p>
        </div>
        {tab === "apartments" ? (
          <button
            className="btn btn-primary"
            type="button"
            onClick={() => {
              setEditing(null);
              setForm(emptyApt);
              setFormOpen(true);
            }}
          >
            Create apartment
          </button>
        ) : null}
        {tab === "members" ? (
          <button className="btn btn-primary" type="button" onClick={() => void openRegister()}>
            Register member
          </button>
        ) : null}
      </div>
      <div className="tabs" style={{ marginBottom: "1rem" }}>
        {(
          [
            ["overview", "Overview"],
            ["apartments", "Apartments"],
            ["members", "Members"],
          ] as Array<[Tab, string]>
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={`intent${tab === id ? " active" : ""}`}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "overview" ? (
        <div className="kpi-grid">
          <KpiCard label="Apartments" value={stats?.apartments ?? aptStats?.total ?? 0} />
          <KpiCard label="Approved members" value={stats?.membersApproved ?? 0} />
          <KpiCard label="Pending joins" value={stats?.membersPending ?? 0} />
          <KpiCard label="Open complaints" value={stats?.openComplaints ?? 0} />
        </div>
      ) : null}

      {tab === "apartments" ? (
        <section className="panel">
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Location</th>
                  <th>Invite</th>
                  <th>Status</th>
                  <th>Created</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {(apartments?.items ?? []).map((a) => (
                  <tr key={a.id}>
                    <td>
                      <strong>{a.name}</strong>
                      {a.addressLine ? (
                        <div className="mono" style={{ color: "var(--muted)" }}>
                          {a.addressLine}
                        </div>
                      ) : null}
                    </td>
                    <td>
                      {[a.city, a.state].filter(Boolean).join(", ") || "—"}
                    </td>
                    <td className="mono">{a.inviteCode}</td>
                    <td>
                      <StatusBadge status={a.isActive ? "active" : "inactive"} />
                    </td>
                    <td>{formatDateTime(a.createdAt)}</td>
                    <td>
                      <RowActionsMenu
                        label={`Actions for ${a.name}`}
                        items={[
                          {
                            id: "edit",
                            label: "Edit",
                            onClick: () => openEdit(a),
                          },
                          {
                            id: "activate",
                            label: "Activate",
                            disabled: a.isActive,
                            onClick: () => void setApartmentActive(a, true),
                          },
                          {
                            id: "deactivate",
                            label: "Deactivate",
                            tone: "danger",
                            disabled: !a.isActive,
                            onClick: () => void setApartmentActive(a, false),
                          },
                        ]}
                      />
                    </td>
                  </tr>
                ))}
                {apartments && apartments.items.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="empty">
                      No apartments yet.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
          <Pagination
            page={apartments?.page ?? 1}
            totalPages={apartments?.totalPages ?? 1}
            total={apartments?.total ?? 0}
            onPageChange={setAptPage}
          />
        </section>
      ) : null}

      {tab === "members" ? (
        <section className="panel">
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
                  <th>Apartment</th>
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
                      {m.user?.email ? <div className="muted">{m.user.email}</div> : null}
                    </td>
                    <td>{m.apartment?.name ?? m.apartmentId}</td>
                    <td>{m.role.replaceAll("_", " ")}</td>
                    <td>
                      <StatusBadge
                        status={m.status === "approved" ? "active" : m.status === "suspended" ? "inactive" : m.status}
                      />
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
                    <td colSpan={6} className="empty">
                      No members yet. Register apartment admins, residents, and guards from this tab.
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

      {formOpen ? (
        <Modal
          title={editing ? "Edit apartment" : "Create apartment"}
          onClose={() => setFormOpen(false)}
          footer={
            <button className="btn btn-primary" type="submit" form="staff-apt-form">
              Save
            </button>
          }
        >
          <form id="staff-apt-form" onSubmit={saveApartment} className="auth-form">
            <div className="field">
              <label htmlFor="sname">Name</label>
              <input
                id="sname"
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div className="grid-2">
              <div className="field">
                <label htmlFor="scity">City</label>
                <input
                  id="scity"
                  required
                  value={form.city}
                  onChange={(e) => setForm({ ...form, city: e.target.value })}
                />
              </div>
              <div className="field">
                <label htmlFor="sstate">State</label>
                <input
                  id="sstate"
                  required
                  value={form.state}
                  onChange={(e) => setForm({ ...form, state: e.target.value })}
                />
              </div>
            </div>
            <div className="field">
              <label htmlFor="saddr">Address</label>
              <input
                id="saddr"
                required
                value={form.addressLine}
                onChange={(e) => setForm({ ...form, addressLine: e.target.value })}
              />
            </div>
          </form>
        </Modal>
      ) : null}

      {registerOpen ? (
        <Modal
          title="Register community member"
          onClose={() => setRegisterOpen(false)}
          footer={
            <>
              <button className="btn btn-ghost" type="button" onClick={() => setRegisterOpen(false)}>
                Cancel
              </button>
              <button className="btn btn-primary" type="submit" form="register-member-form" disabled={registering}>
                {registering ? "Registering…" : "Register & send invite"}
              </button>
            </>
          }
        >
          <p className="muted">
            Allocate the role and apartment now. The member receives an invitation email and in-app
            notification, then logs in at Community login with OTP.
          </p>
          {registerApartments.length === 0 ? (
            <p className="error">Create an apartment first, then register members.</p>
          ) : null}
          <form id="register-member-form" onSubmit={registerMember} className="auth-form">
            <div className="grid-2">
              <div className="field">
                <label htmlFor="m-name">Full name</label>
                <input
                  id="m-name"
                  required
                  minLength={2}
                  value={memberForm.name}
                  onChange={(e) => setMemberForm({ ...memberForm, name: e.target.value })}
                />
              </div>
              <div className="field">
                <label htmlFor="m-role">Role</label>
                <select
                  id="m-role"
                  value={memberForm.role}
                  onChange={(e) =>
                    setMemberForm({
                      ...memberForm,
                      role: e.target.value as MemberRole,
                      flatId: e.target.value === "resident" ? memberForm.flatId : "",
                    })
                  }
                >
                  <option value="resident">Resident</option>
                  <option value="apartment_admin">Apartment admin</option>
                  <option value="guard">Community guard</option>
                </select>
              </div>
            </div>
            <div className="grid-2">
              <div className="field">
                <label htmlFor="m-phone">Mobile (login ID)</label>
                <input
                  id="m-phone"
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
                <label htmlFor="m-email">Email</label>
                <input
                  id="m-email"
                  type="email"
                  required
                  value={memberForm.email}
                  onChange={(e) => setMemberForm({ ...memberForm, email: e.target.value })}
                />
              </div>
            </div>
            <div className="grid-2">
              <div className="field">
                <label htmlFor="m-city">City</label>
                <input
                  id="m-city"
                  required
                  value={memberForm.city}
                  onChange={(e) => setMemberForm({ ...memberForm, city: e.target.value })}
                />
              </div>
              <div className="field">
                <label htmlFor="m-state">State</label>
                <input
                  id="m-state"
                  required
                  value={memberForm.state}
                  onChange={(e) => setMemberForm({ ...memberForm, state: e.target.value })}
                />
              </div>
            </div>
            <div className="grid-2">
              <div className="field">
                <label htmlFor="m-pin">PIN code</label>
                <input
                  id="m-pin"
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
                <label htmlFor="m-country">Country</label>
                <input
                  id="m-country"
                  required
                  value={memberForm.country}
                  onChange={(e) => setMemberForm({ ...memberForm, country: e.target.value })}
                />
              </div>
            </div>
            <div className="field">
              <label htmlFor="m-apt">Apartment</label>
              <select
                id="m-apt"
                required
                value={memberForm.apartmentId}
                onChange={(e) => setMemberForm({ ...memberForm, apartmentId: e.target.value, flatId: "" })}
              >
                <option value="">Select apartment</option>
                {registerApartments.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>
            {memberForm.role === "resident" ? (
              <div className="field">
                <label htmlFor="m-flat">Flat</label>
                <select
                  id="m-flat"
                  required
                  value={memberForm.flatId}
                  onChange={(e) => setMemberForm({ ...memberForm, flatId: e.target.value })}
                  disabled={!memberForm.apartmentId}
                >
                  <option value="">Select flat</option>
                  {registerFlats.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.blockName ? `${f.blockName} · ` : ""}
                      {f.number}
                    </option>
                  ))}
                </select>
                {memberForm.apartmentId && registerFlats.length === 0 ? (
                  <p className="muted">No flats yet. Ask apartment admin to add blocks and flats first.</p>
                ) : null}
              </div>
            ) : null}
            {invite?.error ? <p className="error">{invite.error}</p> : null}
          </form>
        </Modal>
      ) : null}
    </>
  );
}
