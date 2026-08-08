import { useCallback, useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { api, qs } from "../api";
import { useAuth } from "../auth/AuthContext";
import { Pagination } from "../components/Pagination";
import { StatusBadge } from "../components/StatusBadge";
import { useToast } from "../components/Toast";
import { useDebouncedValue } from "../hooks/useDebouncedValue";

type Reportee = {
  id: number | string;
  phone: string;
  name: string | null;
  email?: string | null;
  city?: string | null;
  state?: string | null;
  isActive: boolean;
  roles: string[];
  createdAt?: string;
};

type Paginated<T> = {
  items: T[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

export function ManagerReporteesPage() {
  const { user } = useAuth();
  const isManager = user?.roles?.includes("verification_manager") ?? false;
  // Admins manage staff from Users; reportees list is for verification managers only
  if (!isManager) {
    return <Navigate to="/staff" replace />;
  }

  return <ManagerReporteesPageInner />;
}

function ManagerReporteesPageInner() {
  const toast = useToast();
  const [data, setData] = useState<Paginated<Reportee> | null>(null);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const search = useDebouncedValue(q.trim(), 350);

  useEffect(() => {
    setPage(1);
  }, [search]);

  const load = useCallback(async () => {
    try {
      const res = await api.get<Paginated<Reportee>>(
        `/users/me/reportees${qs({ page, limit: 10, q: search })}`,
      );
      setData(res);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load reportees");
    }
  }, [page, search, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <>
      <div className="topbar">
        <div>
          <h2>My reportees</h2>
          <p>Field executives who report to you for parking verification.</p>
        </div>
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          <Link className="btn btn-ghost" to="/staff/verification">
            Open verification
          </Link>
          <button type="button" className="btn btn-ghost" onClick={() => void load()}>
            Refresh
          </button>
        </div>
      </div>

      <section className="panel">
        <div className="panel-head">
          <h3>Field executives</h3>
          <div className="toolbar">
            <input
              className="search"
              value={q}
              placeholder="Search name, phone, email, city…"
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
        </div>

        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Executive</th>
                <th>Contact</th>
                <th>Location</th>
                <th>Status</th>
                <th>Joined</th>
              </tr>
            </thead>
            <tbody>
              {(data?.items ?? []).map((u) => (
                <tr key={String(u.id)}>
                  <td>
                    <strong>{u.name ?? "—"}</strong>
                    <div className="mono" style={{ color: "var(--muted)", fontSize: "0.85rem" }}>
                      #{String(u.id)}
                    </div>
                  </td>
                  <td>
                    <div className="mono">{u.phone}</div>
                    <div style={{ color: "var(--muted)", fontSize: "0.85rem" }}>{u.email ?? "—"}</div>
                  </td>
                  <td>
                    {[u.city, u.state].filter(Boolean).join(", ") || "—"}
                  </td>
                  <td>
                    <StatusBadge status={u.isActive ? "active" : "inactive"} />
                  </td>
                  <td>
                    {u.createdAt ? new Date(u.createdAt).toLocaleDateString() : "—"}
                  </td>
                </tr>
              ))}
              {!data ? (
                <tr>
                  <td colSpan={5} className="empty">
                    Loading reportees…
                  </td>
                </tr>
              ) : null}
              {data && data.items.length === 0 ? (
                <tr>
                  <td colSpan={5} className="empty">
                    No field executives report to you yet. Ask Super Admin to invite executives with you as
                    reporting manager.
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
    </>
  );
}
