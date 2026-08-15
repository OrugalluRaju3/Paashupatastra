import { FormEvent, useCallback, useEffect, useState } from "react";
import { api, qs } from "../api";
import { Pagination } from "../components/Pagination";
import { StatusBadge } from "../components/StatusBadge";
import { useToast } from "../components/Toast";
import { useDebouncedValue } from "../hooks/useDebouncedValue";
import { formatDateTime } from "../lib/community";
import type { Paginated } from "../types";

type Section = "gate" | "residents";

type Membership = {
  id: number;
  apartmentId: number;
  role: string;
  status: string;
  apartment: { id: number; name: string } | null;
};

type Visitor = {
  id: number;
  guestName: string;
  guestPhone: string | null;
  vehicleNumber: string | null;
  purpose: string | null;
  otp?: string;
  status: string;
  validFrom: string;
  validTo: string;
  checkedInAt: string | null;
  checkedOutAt: string | null;
};

type Resident = {
  id: number;
  createdAt?: string;
  user: { id: number; name: string | null; phone: string; email: string | null } | null;
  flat: { id: number; number: string; blockName: string | null } | null;
};

function flatLabel(flat: Resident["flat"]) {
  if (!flat) return "—";
  return flat.blockName ? `${flat.blockName} · ${flat.number}` : flat.number;
}

export function CommunityGuardPage({ section }: { section: Section }) {
  const toast = useToast();
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [visitors, setVisitors] = useState<Visitor[]>([]);
  const [residents, setResidents] = useState<Paginated<Resident> | null>(null);
  const [residentPage, setResidentPage] = useState(1);
  const [residentQ, setResidentQ] = useState("");
  const residentSearch = useDebouncedValue(residentQ.trim(), 350);
  const [otp, setOtp] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);

  const approved = memberships.find((m) => m.status === "approved") ?? null;
  const apartmentId = approved?.apartmentId;

  const loadMe = useCallback(async () => {
    const me = await api.get<{ items: Membership[] }>("/community/memberships/me");
    setMemberships(me.items ?? []);
  }, []);

  const load = useCallback(async () => {
    if (!apartmentId) return;
    try {
      if (section === "gate") {
        const res = await api.get<{ items: Visitor[] }>("/community/visitors");
        setVisitors(res.items ?? []);
      } else {
        setResidents(
          await api.get<Paginated<Resident>>(
            `/community/memberships${qs({
              apartmentId,
              page: residentPage,
              limit: 10,
              q: residentSearch || undefined,
            })}`,
          ),
        );
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load");
    }
  }, [apartmentId, residentPage, residentSearch, section, toast]);

  useEffect(() => {
    void loadMe().catch((err) => toast.error(err instanceof Error ? err.message : "Failed to load"));
  }, [loadMe, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setResidentPage(1);
  }, [residentSearch]);

  async function verify(id: number, action: "check_in" | "check_out") {
    setBusyId(id);
    try {
      await api.post(`/community/visitors/${id}/verify`, { otp: otp.trim(), action });
      toast.success(action === "check_in" ? "Guest checked in" : "Guest checked out");
      setOtp("");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Verify failed");
    } finally {
      setBusyId(null);
    }
  }

  async function onVerifyForm(e: FormEvent) {
    e.preventDefault();
    const match = visitors.find((v) => v.otp === otp.trim() && (v.status === "scheduled" || v.status === "checked_in"));
    if (!match) {
      toast.error("No matching pass for this OTP");
      return;
    }
    await verify(match.id, match.status === "checked_in" ? "check_out" : "check_in");
  }

  if (!approved) {
    return (
      <>
        <div className="topbar">
          <div>
            <h2>Gate</h2>
            <p>
              Community Super Admin registers guards and assigns the apartment. Use the login from
              your invitation email.
            </p>
          </div>
        </div>
        <p>
          You are not registered as a community guard yet. Ask Community Super Admin to register
          this mobile.
        </p>
      </>
    );
  }

  return (
    <>
      <div className="topbar">
        <div>
          <h2>{approved.apartment?.name ?? "Gate"}</h2>
          <p>
            {section === "residents"
              ? "Look up approved residents by name or mobile number."
              : "Verify visitor OTP to check guests in and out."}
          </p>
        </div>
      </div>

      {section === "gate" ? (
        <>
          <section className="panel" style={{ padding: "1rem", marginBottom: "1rem" }}>
            <form onSubmit={onVerifyForm} className="auth-form">
              <div className="field">
                <label htmlFor="otp">Visitor OTP</label>
                <input
                  id="otp"
                  required
                  minLength={4}
                  maxLength={8}
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 8))}
                />
              </div>
              <button className="btn btn-primary" type="submit">
                Verify
              </button>
            </form>
          </section>
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
                    <th>Actions</th>
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
                      <td>
                        <div className="row-actions">
                          {v.status === "scheduled" ? (
                            <button
                              className="btn btn-primary btn-sm"
                              type="button"
                              disabled={busyId === v.id || otp.length < 4}
                              onClick={() => void verify(v.id, "check_in")}
                            >
                              Check in
                            </button>
                          ) : null}
                          {v.status === "checked_in" ? (
                            <button
                              className="btn btn-ghost btn-sm"
                              type="button"
                              disabled={busyId === v.id || otp.length < 4}
                              onClick={() => void verify(v.id, "check_out")}
                            >
                              Check out
                            </button>
                          ) : null}
                          {v.status !== "scheduled" && v.status !== "checked_in" ? "—" : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {visitors.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="empty">
                        No visitor passes yet.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </section>
        </>
      ) : null}

      {section === "residents" ? (
        <section className="panel">
          <div className="panel-head">
            <h3>Residents</h3>
            <div className="toolbar">
              <input
                className="search"
                placeholder="Search name or phone"
                value={residentQ}
                onChange={(e) => setResidentQ(e.target.value)}
              />
            </div>
          </div>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Phone</th>
                  <th>Flat</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {(residents?.items ?? []).map((r) => (
                  <tr key={r.id}>
                    <td>
                      <strong>{r.user?.name ?? "—"}</strong>
                    </td>
                    <td className="mono">{r.user?.phone ?? "—"}</td>
                    <td>{flatLabel(r.flat)}</td>
                    <td>{formatDateTime(r.createdAt)}</td>
                  </tr>
                ))}
                {residents && residents.items.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="empty">
                      {residentQ.trim() ? "No residents match this search." : "No residents yet."}
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
          <Pagination
            page={residents?.page ?? 1}
            totalPages={residents?.totalPages ?? 1}
            total={residents?.total ?? 0}
            onPageChange={setResidentPage}
          />
        </section>
      ) : null}
    </>
  );
}
