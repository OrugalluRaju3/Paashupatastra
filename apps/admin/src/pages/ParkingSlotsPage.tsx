import { FormEvent, useCallback, useEffect, useState } from "react";
import { api, formatInrFromPaise, qs } from "../api";
import { Paginated, ParkingSlot, ParkingStats } from "../types";
import { KpiCard } from "../components/KpiCard";
import { Modal } from "../components/Modal";
import { Pagination } from "../components/Pagination";
import { StatusBadge } from "../components/StatusBadge";
import { useToast } from "../components/Toast";
import { useDebouncedValue } from "../hooks/useDebouncedValue";

type FormState = {
  apartmentId: string;
  title: string;
  spotCode: string;
  blockName: string;
  rentType: "daily" | "monthly";
  priceInPaise: number;
  vehicleSize: "two_wheeler" | "four_wheeler" | "any";
  description: string;
};

export function ParkingSlotsPage() {
  const toast = useToast();
  const [stats, setStats] = useState<ParkingStats | null>(null);
  const [data, setData] = useState<Paginated<ParkingSlot> | null>(null);
  const [q, setQ] = useState("");
  const search = useDebouncedValue(q.trim(), 350);
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ParkingSlot | null>(null);
  const [form, setForm] = useState<FormState>({
    apartmentId: "",
    title: "",
    spotCode: "",
    blockName: "",
    rentType: "monthly",
    priceInPaise: 200000,
    vehicleSize: "four_wheeler",
    description: "",
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setPage(1);
  }, [search]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [list, s] = await Promise.all([
        api.get<Paginated<ParkingSlot>>(
          `/parking/slots${qs({ page, limit: 8, q: search, status: status || undefined })}`,
        ),
        api.get<ParkingStats>("/parking/stats"),
      ]);
      setData(list);
      setStats(s);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load slots");
    } finally {
      setLoading(false);
    }
  }, [page, search, status, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  function openEdit(item: ParkingSlot) {
    setEditing(item);
    setForm({
      apartmentId: item.apartmentId,
      title: item.title,
      spotCode: item.spotCode,
      blockName: item.blockName ?? "",
      rentType: item.rentType,
      priceInPaise: item.priceInPaise,
      vehicleSize: item.vehicleSize,
      description: item.description ?? "",
    });
    setModalOpen(true);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!editing) return;
    setSaving(true);
    try {
      await api.patch(`/parking/slots/${editing.id}`, {
        apartmentId: form.apartmentId,
        title: form.title,
        spotCode: form.spotCode,
        blockName: form.blockName || undefined,
        rentType: form.rentType,
        priceInPaise: Number(form.priceInPaise),
        vehicleSize: form.vehicleSize,
        description: form.description || undefined,
      });
      toast.success("Parking slot updated");
      setModalOpen(false);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="topbar">
        <div>
          <h2>Legacy slots</h2>
          <p>View and edit legacy parking slot inventory.</p>
        </div>
      </div>

      <div className="kpi-grid">
        <KpiCard label="Total slots" value={stats?.slotsTotal ?? "—"} />
        <KpiCard label="Approved" value={stats?.slotsApproved ?? "—"} />
        <KpiCard label="Pending" value={stats?.slotsPending ?? "—"} />
        <KpiCard label="Bookings" value={stats?.bookingsTotal ?? "—"} />
      </div>

      <section className="panel">
        <div className="panel-head">
          <h3>Slots</h3>
          <div className="toolbar">
            <input
              className="search"
              placeholder="Search title, spot, block…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <select
              className="search"
              style={{ minWidth: 160, flex: "0 0 auto" }}
              value={status}
              onChange={(e) => {
                setPage(1);
                setStatus(e.target.value);
              }}
            >
              <option value="">All statuses</option>
              <option value="pending_approval">Pending approval</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
        </div>

        {loading && !data ? <p className="loading">Loading…</p> : null}

        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Slot</th>
                <th>Rent</th>
                <th>Vehicle</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {(data?.items ?? []).map((item) => (
                <tr key={item.id}>
                  <td>
                    <strong>{item.title}</strong>
                    <div className="mono" style={{ color: "var(--muted)" }}>
                      {item.blockName ? `${item.blockName} · ` : ""}
                      {item.spotCode}
                    </div>
                  </td>
                  <td>
                    {formatInrFromPaise(item.priceInPaise)} / {item.rentType}
                  </td>
                  <td>{item.vehicleSize.replaceAll("_", " ")}</td>
                  <td>
                    <StatusBadge status={item.status} />
                  </td>
                  <td>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => openEdit(item)}>
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
              {data && data.items.length === 0 ? (
                <tr>
                  <td colSpan={5} className="empty">
                    No parking slots found.
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

      {modalOpen && editing ? (
        <Modal
          title="Update parking slot"
          onClose={() => setModalOpen(false)}
          footer={
            <>
              <button type="button" className="btn btn-ghost" onClick={() => setModalOpen(false)}>
                Cancel
              </button>
              <button type="submit" form="slot-form" className="btn btn-primary" disabled={saving}>
                {saving ? "Saving…" : "Update"}
              </button>
            </>
          }
        >
          <form id="slot-form" onSubmit={onSubmit}>
            <div className="field">
              <label htmlFor="title">Title</label>
              <input
                id="title"
                required
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
              />
            </div>
            <div className="grid-2">
              <div className="field">
                <label htmlFor="spot">Spot code</label>
                <input
                  id="spot"
                  required
                  value={form.spotCode}
                  onChange={(e) => setForm({ ...form, spotCode: e.target.value })}
                />
              </div>
              <div className="field">
                <label htmlFor="block">Block</label>
                <input
                  id="block"
                  value={form.blockName}
                  onChange={(e) => setForm({ ...form, blockName: e.target.value })}
                />
              </div>
            </div>
            <div className="grid-2">
              <div className="field">
                <label htmlFor="rentType">Rent type</label>
                <select
                  id="rentType"
                  value={form.rentType}
                  onChange={(e) =>
                    setForm({ ...form, rentType: e.target.value as FormState["rentType"] })
                  }
                >
                  <option value="daily">Daily</option>
                  <option value="monthly">Monthly</option>
                </select>
              </div>
              <div className="field">
                <label htmlFor="price">Price (paise)</label>
                <input
                  id="price"
                  type="number"
                  min={1}
                  required
                  value={form.priceInPaise}
                  onChange={(e) => setForm({ ...form, priceInPaise: Number(e.target.value) })}
                />
              </div>
            </div>
            <div className="field">
              <label htmlFor="vehicle">Vehicle size</label>
              <select
                id="vehicle"
                value={form.vehicleSize}
                onChange={(e) =>
                  setForm({ ...form, vehicleSize: e.target.value as FormState["vehicleSize"] })
                }
              >
                <option value="four_wheeler">Four wheeler</option>
                <option value="two_wheeler">Two wheeler</option>
                <option value="any">Any</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="desc">Description</label>
              <textarea
                id="desc"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>
          </form>
        </Modal>
      ) : null}
    </>
  );
}
