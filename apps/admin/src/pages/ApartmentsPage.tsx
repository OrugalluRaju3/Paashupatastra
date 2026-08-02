import { FormEvent, useCallback, useEffect, useState } from "react";
import { api, qs } from "../api";
import { Apartment, ApartmentStats, Paginated } from "../types";
import { KpiCard } from "../components/KpiCard";
import { Modal } from "../components/Modal";
import { Pagination } from "../components/Pagination";
import { StatusBadge } from "../components/StatusBadge";
import { useDebouncedValue } from "../hooks/useDebouncedValue";

type FormState = {
  name: string;
  city: string;
  state: string;
  addressLine: string;
  isActive: boolean;
};

const emptyForm: FormState = {
  name: "",
  city: "",
  state: "",
  addressLine: "",
  isActive: true,
};

export function ApartmentsPage() {
  const [stats, setStats] = useState<ApartmentStats | null>(null);
  const [data, setData] = useState<Paginated<Apartment> | null>(null);
  const [q, setQ] = useState("");
  const search = useDebouncedValue(q.trim(), 350);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Apartment | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setPage(1);
  }, [search]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [list, s] = await Promise.all([
        api.get<Paginated<Apartment>>(`/apartments${qs({ page, limit: 8, q: search })}`),
        api.get<ApartmentStats>("/apartments/stats"),
      ]);
      setData(list);
      setStats(s);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [page, search]);

  useEffect(() => {
    void load();
  }, [load]);

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setModalOpen(true);
  }

  function openEdit(item: Apartment) {
    setEditing(item);
    setForm({
      name: item.name,
      city: item.city,
      state: item.state,
      addressLine: item.addressLine,
      isActive: item.isActive,
    });
    setModalOpen(true);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      if (editing) {
        await api.patch(`/apartments/${editing.id}`, form);
      } else {
        await api.post("/apartments", form);
      }
      setModalOpen(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function onDelete(item: Apartment) {
    if (!window.confirm(`Delete apartment "${item.name}"?`)) return;
    try {
      await api.delete(`/apartments/${item.id}`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    }
  }

  return (
    <>
      <div className="topbar">
        <div>
          <h2>Apartments</h2>
          <p>Create, search, update, and remove community apartments.</p>
        </div>
        <button type="button" className="btn btn-primary" onClick={openCreate}>
          + Create apartment
        </button>
      </div>

      <div className="kpi-grid">
        <KpiCard label="Total" value={stats?.total ?? "—"} />
        <KpiCard label="Active" value={stats?.active ?? "—"} />
        <KpiCard label="Inactive" value={stats?.inactive ?? "—"} />
        <KpiCard label="Cities" value={stats?.cities ?? "—"} />
      </div>

      <section className="panel">
        <div className="panel-head">
          <h3>Apartment list</h3>
          <div className="toolbar">
            <input
              className="search"
              placeholder="Search name, city, invite code..."
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
        </div>

        {error ? <p className="error">{error}</p> : null}
        {loading && !data ? <p className="loading">Loading…</p> : null}

        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Name</th>
                <th>Location</th>
                <th>Invite</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {(data?.items ?? []).map((item) => (
                <tr key={item.id}>
                  <td>
                    <strong>{item.name}</strong>
                    <div className="mono" style={{ color: "var(--muted)" }}>
                      {item.addressLine}
                    </div>
                  </td>
                  <td>
                    {item.city}, {item.state}
                  </td>
                  <td className="mono">{item.inviteCode}</td>
                  <td>
                    <StatusBadge status={item.isActive ? "active" : "inactive"} />
                  </td>
                  <td>
                    <div className="row-actions">
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => openEdit(item)}>
                        Edit
                      </button>
                      <button type="button" className="btn btn-danger btn-sm" onClick={() => void onDelete(item)}>
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {data && data.items.length === 0 ? (
                <tr>
                  <td colSpan={5} className="empty">
                    No apartments found.
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

      {modalOpen ? (
        <Modal
          title={editing ? "Update apartment" : "Create apartment"}
          onClose={() => setModalOpen(false)}
          footer={
            <>
              <button type="button" className="btn btn-ghost" onClick={() => setModalOpen(false)}>
                Cancel
              </button>
              <button type="submit" form="apartment-form" className="btn btn-primary" disabled={saving}>
                {saving ? "Saving…" : editing ? "Update" : "Create"}
              </button>
            </>
          }
        >
          <form id="apartment-form" onSubmit={onSubmit}>
            <div className="field">
              <label htmlFor="name">Name</label>
              <input
                id="name"
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div className="grid-2">
              <div className="field">
                <label htmlFor="city">City</label>
                <input
                  id="city"
                  required
                  value={form.city}
                  onChange={(e) => setForm({ ...form, city: e.target.value })}
                />
              </div>
              <div className="field">
                <label htmlFor="state">State</label>
                <input
                  id="state"
                  required
                  value={form.state}
                  onChange={(e) => setForm({ ...form, state: e.target.value })}
                />
              </div>
            </div>
            <div className="field">
              <label htmlFor="address">Address</label>
              <input
                id="address"
                required
                value={form.addressLine}
                onChange={(e) => setForm({ ...form, addressLine: e.target.value })}
              />
            </div>
            {editing ? (
              <div className="field">
                <label htmlFor="active">Status</label>
                <select
                  id="active"
                  value={form.isActive ? "true" : "false"}
                  onChange={(e) => setForm({ ...form, isActive: e.target.value === "true" })}
                >
                  <option value="true">Active</option>
                  <option value="false">Inactive</option>
                </select>
              </div>
            ) : null}
          </form>
        </Modal>
      ) : null}
    </>
  );
}
