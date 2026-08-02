import { FormEvent, useCallback, useEffect, useState } from "react";
import { api, qs } from "../api";
import { Modal } from "../components/Modal";
import { Pagination } from "../components/Pagination";
import { RowActionsMenu } from "../components/RowActionsMenu";
import { StatusBadge } from "../components/StatusBadge";
import { useToast } from "../components/Toast";
import { useDebouncedValue } from "../hooks/useDebouncedValue";

type User = {
  id: string;
  phone: string;
  name: string | null;
  email?: string | null;
  roles: string[];
  isActive: boolean;
  city: string | null;
  state?: string | null;
  country?: string | null;
  pinCode?: string | null;
  dateOfBirth?: string | null;
  preferredLocation?: string | null;
  createdAt?: string;
};

type Paginated<T> = {
  items: T[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

type InviteResult = {
  loginPath: string;
  phone: string;
  email: string | null;
  role: string;
  emailStatus: string;
  smtpSent: boolean;
  outboxPath?: string;
  error?: string;
};

const emptyForm = {
  name: "",
  phone: "",
  email: "",
  role: "field_executive",
  city: "",
  state: "",
  pinCode: "",
  country: "IN",
  dateOfBirth: "",
  preferredLocation: "",
};

type FormState = typeof emptyForm;
type ModalMode = "invite" | "view" | "edit" | null;

function userToForm(u: User): FormState {
  const staffRole = u.roles.includes("verification_manager")
    ? "verification_manager"
    : u.roles.includes("field_executive")
      ? "field_executive"
      : u.roles.includes("super_admin")
        ? "super_admin"
        : "";
  return {
    name: u.name ?? "",
    phone: u.phone,
    email: u.email ?? "",
    role: staffRole || "field_executive",
    city: u.city ?? "",
    state: u.state ?? "",
    pinCode: u.pinCode ?? "",
    country: u.country ?? "IN",
    dateOfBirth: u.dateOfBirth ? String(u.dateOfBirth).slice(0, 10) : "",
    preferredLocation: u.preferredLocation ?? "",
  };
}

function isStaffUser(u: User) {
  return u.roles.some((r) =>
    ["super_admin", "verification_manager", "field_executive"].includes(r),
  );
}

export function UsersPage() {
  const toast = useToast();
  const [data, setData] = useState<Paginated<User> | null>(null);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const search = useDebouncedValue(q.trim(), 350);
  const [invite, setInvite] = useState<InviteResult | null>(null);
  const [saving, setSaving] = useState(false);
  const [modalMode, setModalMode] = useState<ModalMode>(null);
  const [selected, setSelected] = useState<User | null>(null);
  const [form, setForm] = useState(emptyForm);

  useEffect(() => {
    setPage(1);
  }, [search]);

  const load = useCallback(async () => {
    try {
      const list = await api.get<Paginated<User>>(`/users${qs({ page, limit: 10, q: search })}`);
      setData(list);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load users");
    }
  }, [page, search, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function openInvite() {
    setInvite(null);
    setSelected(null);
    setForm(emptyForm);
    setModalMode("invite");
  }

  function openView(u: User) {
    setSelected(u);
    setForm(userToForm(u));
    setModalMode("view");
  }

  function openEdit(u: User) {
    setSelected(u);
    setForm(userToForm(u));
    setModalMode("edit");
  }

  async function createStaff(e: FormEvent) {
    e.preventDefault();
    setInvite(null);
    setSaving(true);
    try {
      const res = await api.post<User & { invite: InviteResult }>("/users/staff", {
        name: form.name.trim(),
        phone: form.phone.trim(),
        email: form.email.trim(),
        role: form.role,
        city: form.city.trim(),
        state: form.state.trim(),
        country: form.country.trim() || "IN",
        pinCode: form.pinCode.trim(),
        dateOfBirth: form.dateOfBirth || null,
        preferredLocation: form.preferredLocation.trim() || null,
      });
      setInvite(res.invite);
      if (res.invite.error) {
        toast.error(`Staff saved, but invite email failed: ${res.invite.error}`);
      } else {
        toast.success(
          res.invite.smtpSent
            ? `Invite emailed to ${res.invite.email}`
            : `Staff saved. Email status: ${res.invite.emailStatus}`,
        );
        setModalMode(null);
      }
      setForm(emptyForm);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Invite failed");
    } finally {
      setSaving(false);
    }
  }

  async function saveEdit(e: FormEvent) {
    e.preventDefault();
    if (!selected) return;
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        name: form.name.trim(),
        phone: form.phone.trim(),
        email: form.email.trim() || null,
        city: form.city.trim() || null,
        state: form.state.trim() || null,
        country: form.country.trim() || "IN",
        pinCode: form.pinCode.trim() || null,
        dateOfBirth: form.dateOfBirth || null,
        preferredLocation: form.preferredLocation.trim() || null,
      };

      if (
        isStaffUser(selected) &&
        (form.role === "field_executive" || form.role === "verification_manager") &&
        !selected.roles.includes("super_admin")
      ) {
        const roles = selected.roles.filter(
          (r) => r !== "field_executive" && r !== "verification_manager",
        );
        roles.push(form.role);
        payload.roles = roles;
      }

      await api.patch(`/users/${selected.id}`, payload);
      toast.success("User updated");
      setModalMode(null);
      setSelected(null);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Update failed");
    } finally {
      setSaving(false);
    }
  }

  async function toggleStatus(u: User) {
    const next = !u.isActive;
    try {
      await api.patch(`/users/${u.id}/status`, { isActive: next });
      toast.success(next ? "User activated" : "User deactivated");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Status update failed");
    }
  }

  async function onDelete(u: User) {
    if (!window.confirm(`Delete user "${u.name ?? u.phone}"? This cannot be undone.`)) return;
    try {
      await api.delete(`/users/${u.id}`);
      toast.success("User deleted");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    }
  }

  const readOnly = modalMode === "view";
  const modalTitle =
    modalMode === "invite"
      ? "Invite manager / executive"
      : modalMode === "edit"
        ? "Edit user"
        : modalMode === "view"
          ? "User details"
          : "";

  return (
    <>
      <div className="topbar">
        <div>
          <h2>Users & staff</h2>
          <p>Invite managers and field executives. They receive email login credentials.</p>
        </div>
        <button type="button" className="btn btn-primary" onClick={openInvite}>
          + Invite manager / executive
        </button>
      </div>

      {invite && !modalMode ? (
        <div className="sidebar-user" style={{ marginBottom: "1rem", maxWidth: 520 }}>
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

      <section className="panel">
        <div className="panel-head">
          <h3>All users</h3>
          <div className="toolbar">
            <input
              className="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search phone/name/email"
            />
          </div>
        </div>
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Name</th>
                <th>Mobile</th>
                <th>Email</th>
                <th>Location</th>
                <th>Roles</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {(data?.items ?? []).map((u) => (
                <tr key={u.id}>
                  <td>
                    <strong>{u.name ?? "-"}</strong>
                    {u.dateOfBirth ? (
                      <div style={{ color: "var(--muted)", fontSize: "0.85rem" }}>
                        DOB {String(u.dateOfBirth).slice(0, 10)}
                      </div>
                    ) : null}
                  </td>
                  <td className="mono">{u.phone}</td>
                  <td>{u.email ?? "-"}</td>
                  <td>
                    {[u.city, u.state, u.pinCode].filter(Boolean).join(", ") || "-"}
                    {u.country ? (
                      <div style={{ color: "var(--muted)", fontSize: "0.85rem" }}>{u.country}</div>
                    ) : null}
                  </td>
                  <td>{u.roles.join(", ")}</td>
                  <td>
                    <StatusBadge status={u.isActive ? "active" : "inactive"} />
                  </td>
                  <td>
                    <RowActionsMenu
                      label={`Actions for ${u.name ?? u.phone}`}
                      items={[
                        {
                          id: "view",
                          label: "View",
                          onClick: () => openView(u),
                        },
                        {
                          id: "edit",
                          label: "Edit",
                          onClick: () => openEdit(u),
                        },
                        {
                          id: "status",
                          label: u.isActive ? "Deactivate" : "Activate",
                          onClick: () => void toggleStatus(u),
                        },
                        {
                          id: "delete",
                          label: "Delete",
                          tone: "danger",
                          onClick: () => void onDelete(u),
                        },
                      ]}
                    />
                  </td>
                </tr>
              ))}
              {data && data.items.length === 0 ? (
                <tr>
                  <td colSpan={7} className="empty">
                    No users found.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        {data ? (
          <Pagination
            page={data.page}
            totalPages={data.totalPages}
            total={data.total}
            onPageChange={setPage}
          />
        ) : null}
      </section>

      {modalMode ? (
        <Modal
          title={modalTitle}
          onClose={() => {
            setModalMode(null);
            setSelected(null);
          }}
          footer={
            <>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => {
                  setModalMode(null);
                  setSelected(null);
                }}
              >
                {modalMode === "view" ? "Close" : "Cancel"}
              </button>
              {modalMode === "invite" ? (
                <button type="submit" form="user-form" className="btn btn-primary" disabled={saving}>
                  {saving ? "Sending invite..." : "Create & send invite"}
                </button>
              ) : null}
              {modalMode === "edit" ? (
                <button type="submit" form="user-form" className="btn btn-primary" disabled={saving}>
                  {saving ? "Saving..." : "Save changes"}
                </button>
              ) : null}
              {modalMode === "view" && selected ? (
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => openEdit(selected)}
                >
                  Edit
                </button>
              ) : null}
            </>
          }
        >
          <form
            id="user-form"
            onSubmit={modalMode === "invite" ? createStaff : saveEdit}
            style={{ display: "grid", gap: "0.75rem" }}
          >
            <div className="grid-2">
              <div className="field">
                <label htmlFor="staff-name">Full name</label>
                <input
                  id="staff-name"
                  value={form.name}
                  onChange={(e) => setField("name", e.target.value)}
                  required
                  minLength={2}
                  disabled={readOnly}
                />
              </div>
              <div className="field">
                <label htmlFor="staff-role">Role</label>
                {modalMode === "view" || (modalMode === "edit" && selected && !isStaffUser(selected)) ? (
                  <input value={selected?.roles.join(", ") ?? "-"} disabled />
                ) : (
                  <select
                    id="staff-role"
                    value={form.role}
                    onChange={(e) => setField("role", e.target.value)}
                    disabled={modalMode === "edit" && selected?.roles.includes("super_admin")}
                  >
                    {modalMode === "edit" && selected?.roles.includes("super_admin") ? (
                      <option value="super_admin">Super admin</option>
                    ) : null}
                    <option value="field_executive">Field executive</option>
                    <option value="verification_manager">Verification manager</option>
                  </select>
                )}
              </div>
            </div>

            <div className="grid-2">
              <div className="field">
                <label htmlFor="staff-phone">Mobile (login ID)</label>
                <input
                  id="staff-phone"
                  inputMode="numeric"
                  maxLength={10}
                  value={form.phone}
                  onChange={(e) => setField("phone", e.target.value.replace(/\D/g, "").slice(0, 10))}
                  required
                  pattern="[6-9][0-9]{9}"
                  placeholder="10-digit Indian mobile"
                  disabled={readOnly}
                />
              </div>
              <div className="field">
                <label htmlFor="staff-email">Email (invite + OTP)</label>
                <input
                  id="staff-email"
                  type="email"
                  value={form.email}
                  onChange={(e) => setField("email", e.target.value)}
                  required={modalMode === "invite"}
                  disabled={readOnly}
                />
              </div>
            </div>

            <div className="grid-2">
              <div className="field">
                <label htmlFor="staff-city">City</label>
                <input
                  id="staff-city"
                  value={form.city}
                  onChange={(e) => setField("city", e.target.value)}
                  required={modalMode === "invite"}
                  minLength={2}
                  disabled={readOnly}
                />
              </div>
              <div className="field">
                <label htmlFor="staff-state">State</label>
                <input
                  id="staff-state"
                  value={form.state}
                  onChange={(e) => setField("state", e.target.value)}
                  required={modalMode === "invite"}
                  minLength={2}
                  disabled={readOnly}
                />
              </div>
            </div>

            <div className="grid-2">
              <div className="field">
                <label htmlFor="staff-pin">PIN code</label>
                <input
                  id="staff-pin"
                  inputMode="numeric"
                  maxLength={6}
                  value={form.pinCode}
                  onChange={(e) => setField("pinCode", e.target.value.replace(/\D/g, "").slice(0, 6))}
                  required={modalMode === "invite"}
                  pattern="[0-9]{6}"
                  disabled={readOnly}
                />
              </div>
              <div className="field">
                <label htmlFor="staff-country">Country</label>
                <input
                  id="staff-country"
                  value={form.country}
                  onChange={(e) => setField("country", e.target.value)}
                  required={modalMode === "invite"}
                  disabled={readOnly}
                />
              </div>
            </div>

            <div className="grid-2">
              <div className="field">
                <label htmlFor="staff-dob">Date of birth (optional)</label>
                <input
                  id="staff-dob"
                  type="date"
                  value={form.dateOfBirth}
                  onChange={(e) => setField("dateOfBirth", e.target.value)}
                  disabled={readOnly}
                />
              </div>
              <div className="field">
                <label htmlFor="staff-loc">Preferred location (optional)</label>
                <input
                  id="staff-loc"
                  value={form.preferredLocation}
                  onChange={(e) => setField("preferredLocation", e.target.value)}
                  disabled={readOnly}
                />
              </div>
            </div>

            {modalMode === "view" && selected ? (
              <div className="field">
                <label>Status</label>
                <input value={selected.isActive ? "Active" : "Inactive"} disabled />
              </div>
            ) : null}
          </form>
        </Modal>
      ) : null}
    </>
  );
}
