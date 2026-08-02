import { FormEvent, useEffect, useState } from "react";
import { api } from "../api";
import { KpiCard } from "../components/KpiCard";
import { useToast } from "../components/Toast";

type Commission = {
  id: string;
  moduleName: string;
  commissionBps: number;
  platformFeeFlatPaise: number;
  taxBps: number;
};

type Wallet = { balanceInPaise: number };

export function SettingsPage() {
  const toast = useToast();
  const [commission, setCommission] = useState<Commission | null>(null);
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [form, setForm] = useState({
    commissionBps: 1000,
    platformFeeFlatPaise: 500,
    taxBps: 0,
  });

  async function load() {
    try {
      const [c, w] = await Promise.all([
        api.get<Commission>("/payments/commission"),
        api.get<Wallet>("/payments/wallets/platform"),
      ]);
      setCommission(c);
      setWallet(w);
      setForm({
        commissionBps: c.commissionBps,
        platformFeeFlatPaise: c.platformFeeFlatPaise,
        taxBps: c.taxBps,
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load settings");
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function save(e: FormEvent) {
    e.preventDefault();
    try {
      const c = await api.patch<Commission>("/payments/commission", form);
      setCommission(c);
      toast.success("Commission settings saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    }
  }

  return (
    <>
      <div className="topbar">
        <div>
          <h2>Commission & wallet</h2>
          <p>Platform fee settings and platform wallet balance.</p>
        </div>
      </div>

      <div className="kpi-grid">
        <KpiCard
          label="Commission"
          value={`${((commission?.commissionBps ?? 0) / 100).toFixed(1)}%`}
        />
        <KpiCard
          label="Flat fee"
          value={`₹${((commission?.platformFeeFlatPaise ?? 0) / 100).toFixed(0)}`}
        />
        <KpiCard label="Tax" value={`${((commission?.taxBps ?? 0) / 100).toFixed(1)}%`} />
        <KpiCard
          label="Platform wallet"
          value={
            wallet
              ? new Intl.NumberFormat("en-IN", {
                  style: "currency",
                  currency: "INR",
                  maximumFractionDigits: 0,
                }).format(wallet.balanceInPaise / 100)
              : "—"
          }
        />
      </div>

      <section className="panel">
        <div className="panel-head">
          <h3>Update parking commission</h3>
        </div>
        <form onSubmit={save} style={{ padding: "1rem", display: "grid", gap: "0.75rem", maxWidth: 480 }}>
          <div className="field">
            <label>Commission (basis points, 1000 = 10%)</label>
            <input
              type="number"
              value={form.commissionBps}
              onChange={(e) => setForm({ ...form, commissionBps: Number(e.target.value) })}
            />
          </div>
          <div className="field">
            <label>Flat platform fee (paise)</label>
            <input
              type="number"
              value={form.platformFeeFlatPaise}
              onChange={(e) => setForm({ ...form, platformFeeFlatPaise: Number(e.target.value) })}
            />
          </div>
          <div className="field">
            <label>Tax (basis points)</label>
            <input
              type="number"
              value={form.taxBps}
              onChange={(e) => setForm({ ...form, taxBps: Number(e.target.value) })}
            />
          </div>
          <button className="btn btn-primary" type="submit">
            Save settings
          </button>
        </form>
      </section>
    </>
  );
}
