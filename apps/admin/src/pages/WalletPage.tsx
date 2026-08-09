import { FormEvent, useCallback, useEffect, useState } from "react";
import { api, formatInrFromPaise, qs } from "../api";
import { useAuth } from "../auth/AuthContext";
import { KpiCard } from "../components/KpiCard";
import { Pagination } from "../components/Pagination";
import { StatusBadge } from "../components/StatusBadge";
import { useToast } from "../components/Toast";

type Wallet = {
  id: string;
  type: string;
  balanceInPaise: number;
  pendingSettlementInPaise?: number;
  currency: string;
  updatedAt?: string;
};

type Txn = {
  id: string;
  type: string;
  amountInPaise: number;
  balanceAfterInPaise: number;
  purpose: string;
  referenceId: string | null;
  notes: string | null;
  createdAt: string;
};

type BankAccount = {
  id: string;
  accountHolderName: string;
  bankName: string;
  accountNumber: string;
  accountNumberMasked: string;
  ifscCode: string;
  upiId: string | null;
  isPrimary: boolean;
  isVerified: boolean;
};

const emptyBankForm = {
  accountHolderName: "",
  bankName: "",
  accountNumber: "",
  ifscCode: "",
  upiId: "",
};

export function WalletPage() {
  const toast = useToast();
  const { intent, user } = useAuth();
  const isOwner = intent === "owner";
  const isSupplier = intent === "supplier";
  const canWithdraw = isOwner || isSupplier;
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [items, setItems] = useState<Txn[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [banks, setBanks] = useState<BankAccount[]>([]);
  const [selectedBankId, setSelectedBankId] = useState("");
  const [withdrawRupees, setWithdrawRupees] = useState("");
  const [withdrawing, setWithdrawing] = useState(false);
  const [bankForm, setBankForm] = useState(emptyBankForm);
  const [savingBank, setSavingBank] = useState(false);
  const [showBankForm, setShowBankForm] = useState(false);

  const load = useCallback(async () => {
    try {
      const [w, tx] = await Promise.all([
        api.get<Wallet>("/payments/wallets/me"),
        api.get<{ items: Txn[]; total: number; totalPages: number; page: number }>(
          `/payments/wallets/me/transactions${qs({ page, limit: 10 })}`,
        ),
      ]);
      setWallet(w);
      setItems(tx.items);
      setTotal(tx.total);
      setTotalPages(tx.totalPages);

      if (canWithdraw) {
        const bankRes = await api.get<{ items: BankAccount[] }>("/users/me/bank-accounts");
        setBanks(bankRes.items);
        setSelectedBankId((prev) => {
          if (prev && bankRes.items.some((b) => b.id === prev)) return prev;
          const primary = bankRes.items.find((b) => b.isPrimary) ?? bankRes.items[0];
          return primary?.id ?? "";
        });
        setShowBankForm(bankRes.items.length === 0);
        if (bankRes.items.length === 0 && user?.name) {
          setBankForm((f) => ({ ...f, accountHolderName: f.accountHolderName || user.name || "" }));
        }
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load wallet");
    }
  }, [page, toast, canWithdraw, user?.name]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onSaveBank(e: FormEvent) {
    e.preventDefault();
    setSavingBank(true);
    try {
      await api.post<BankAccount>("/users/me/bank-accounts", {
        accountHolderName: bankForm.accountHolderName.trim(),
        bankName: bankForm.bankName.trim(),
        accountNumber: bankForm.accountNumber.trim(),
        ifscCode: bankForm.ifscCode.trim().toUpperCase(),
        upiId: bankForm.upiId.trim() || null,
        isPrimary: true,
      });
      toast.success("Bank account saved");
      setBankForm(emptyBankForm);
      setShowBankForm(false);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save bank account");
    } finally {
      setSavingBank(false);
    }
  }

  async function onWithdraw(e: FormEvent) {
    e.preventDefault();
    const rupees = Number(withdrawRupees);
    if (!Number.isFinite(rupees) || rupees < 1) {
      toast.error("Enter at least ₹1 to withdraw");
      return;
    }
    if (!selectedBankId) {
      toast.error("Add or select a bank account first");
      return;
    }
    const amountInPaise = Math.round(rupees * 100);
    if (wallet && amountInPaise > wallet.balanceInPaise) {
      toast.error("Amount exceeds available balance");
      return;
    }
    setWithdrawing(true);
    try {
      const res = await api.post<{
        ok: boolean;
        amountInPaise: number;
        balanceInPaise: number;
        bankAccount: { bankName: string; accountNumberMasked: string };
      }>("/payments/wallets/me/withdraw", {
        amountInPaise,
        bankAccountId: selectedBankId,
      });
      toast.success(
        `Withdrawn ${formatInrFromPaise(res.amountInPaise)} to ${res.bankAccount.bankName} (${res.bankAccount.accountNumberMasked})`,
      );
      setWithdrawRupees("");
      setPage(1);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Withdrawal failed");
    } finally {
      setWithdrawing(false);
    }
  }

  const selectedBank = banks.find((b) => b.id === selectedBankId) ?? null;
  const maxRupees = wallet ? wallet.balanceInPaise / 100 : 0;

  return (
    <>
      <div className="topbar">
        <div>
          <h2>{isSupplier ? "Supplier wallet" : isOwner ? "Owner wallet" : "My wallet"}</h2>
          <p>
            {isSupplier
              ? "Customer payments are held in the admin wallet until delivery completes. Then platform fee is kept and the rest is credited here for withdrawal."
              : isOwner
                ? "Available balance is only credited after customer check-out (minus platform fee). Until then, payment stays in the admin/platform wallet."
                : "Payments you made for parking bookings. Funds are held in the platform wallet until check-out."}
          </p>
        </div>
        <button type="button" className="btn btn-ghost" onClick={() => void load()}>
          Refresh
        </button>
      </div>

      <div className="kpi-grid">
        <KpiCard
          label="Available balance"
          value={wallet ? formatInrFromPaise(wallet.balanceInPaise) : "—"}
          hint={
            canWithdraw
              ? isSupplier
                ? "Withdrawable after delivery settlements"
                : "Withdrawable after check-out settlements"
              : wallet
                ? `${wallet.type} wallet · ${wallet.currency}`
                : undefined
          }
        />
        {canWithdraw ? (
          <KpiCard
            label="Pending (in admin wallet)"
            value={wallet ? formatInrFromPaise(wallet.pendingSettlementInPaise ?? 0) : "—"}
            hint={
              isSupplier
                ? "Paid orders not yet delivered"
                : "Paid bookings not yet checked out"
            }
          />
        ) : null}
        <KpiCard label="Transactions" value={total} hint="All ledger entries" />
      </div>

      {canWithdraw ? (
        <section className="panel">
          <div className="panel-head">
            <h3>Withdraw to bank</h3>
            {banks.length > 0 && !showBankForm ? (
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowBankForm(true)}>
                Add / update bank
              </button>
            ) : null}
          </div>

          <div className="panel-body">
            {selectedBank && !showBankForm ? (
              <div className="withdraw-bank-summary">
                <div>
                  <span className="withdraw-label">Payout account</span>
                  <strong>
                    {selectedBank.bankName} · {selectedBank.accountHolderName}
                  </strong>
                  <p>
                    A/c {selectedBank.accountNumberMasked} · IFSC {selectedBank.ifscCode}
                  </p>
                </div>
              </div>
            ) : null}

            {showBankForm || banks.length === 0 ? (
              <form className="withdraw-form" onSubmit={(e) => void onSaveBank(e)}>
                <div className="withdraw-form-intro">
                  <h4>Bank account details</h4>
                  <p>Account holder name should match your registered owner name.</p>
                </div>
                <div className="grid-2">
                  <div className="field">
                    <label htmlFor="bank-holder">Account holder name</label>
                    <input
                      id="bank-holder"
                      required
                      value={bankForm.accountHolderName}
                      onChange={(e) => setBankForm((f) => ({ ...f, accountHolderName: e.target.value }))}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="bank-name">Bank name</label>
                    <input
                      id="bank-name"
                      required
                      value={bankForm.bankName}
                      onChange={(e) => setBankForm((f) => ({ ...f, bankName: e.target.value }))}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="bank-ac">Account number</label>
                    <input
                      id="bank-ac"
                      required
                      minLength={8}
                      value={bankForm.accountNumber}
                      onChange={(e) => setBankForm((f) => ({ ...f, accountNumber: e.target.value }))}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="bank-ifsc">IFSC code</label>
                    <input
                      id="bank-ifsc"
                      required
                      minLength={5}
                      value={bankForm.ifscCode}
                      onChange={(e) => setBankForm((f) => ({ ...f, ifscCode: e.target.value.toUpperCase() }))}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="bank-upi">UPI ID (optional)</label>
                    <input
                      id="bank-upi"
                      value={bankForm.upiId}
                      onChange={(e) => setBankForm((f) => ({ ...f, upiId: e.target.value }))}
                    />
                  </div>
                </div>
                <div className="withdraw-actions">
                  <button type="submit" className="btn btn-primary" disabled={savingBank}>
                    {savingBank ? "Saving…" : "Save bank account"}
                  </button>
                  {banks.length > 0 ? (
                    <button type="button" className="btn btn-ghost" onClick={() => setShowBankForm(false)}>
                      Cancel
                    </button>
                  ) : null}
                </div>
              </form>
            ) : null}

            {banks.length > 0 && !showBankForm ? (
              <form className="withdraw-form" onSubmit={(e) => void onWithdraw(e)}>
                {banks.length > 1 ? (
                  <div className="field">
                    <label htmlFor="bank-select">Bank account</label>
                    <select
                      id="bank-select"
                      value={selectedBankId}
                      onChange={(e) => setSelectedBankId(e.target.value)}
                    >
                      {banks.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.bankName} · {b.accountNumberMasked}
                          {b.isPrimary ? " (primary)" : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : null}

                <div className="withdraw-amount-row">
                  <div className="field">
                    <label htmlFor="withdraw-amt">Amount (₹)</label>
                    <input
                      id="withdraw-amt"
                      type="number"
                      min={1}
                      step={1}
                      max={maxRupees || undefined}
                      placeholder="e.g. 500"
                      value={withdrawRupees}
                      onChange={(e) => setWithdrawRupees(e.target.value)}
                      required
                    />
                  </div>
                  <div className="withdraw-actions withdraw-actions-inline">
                    <button
                      type="button"
                      className="btn btn-ghost"
                      disabled={!wallet || wallet.balanceInPaise < 100}
                      onClick={() => setWithdrawRupees(String(Math.floor(maxRupees)))}
                    >
                      Max
                    </button>
                    <button
                      type="submit"
                      className="btn btn-primary"
                      disabled={withdrawing || !wallet || wallet.balanceInPaise < 100}
                    >
                      {withdrawing ? "Withdrawing…" : "Withdraw"}
                    </button>
                  </div>
                </div>
                <p className="withdraw-hint">
                  Minimum ₹1. Settlement credits can be transferred to your linked bank account.
                </p>
              </form>
            ) : null}
          </div>
        </section>
      ) : null}

      <section className="panel">
        <div className="panel-head">
          <h3>Transaction history</h3>
        </div>
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>When</th>
                <th>Type</th>
                <th>Purpose</th>
                <th>Amount</th>
                <th>Balance after</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {items.map((t) => (
                <tr key={t.id}>
                  <td>{new Date(t.createdAt).toLocaleString("en-IN")}</td>
                  <td>
                    <StatusBadge status={t.type} />
                  </td>
                  <td>{t.purpose.replaceAll("_", " ")}</td>
                  <td>
                    <span style={{ color: t.type === "credit" ? "var(--success)" : "var(--danger)" }}>
                      {t.type === "credit" ? "+" : "-"}
                      {formatInrFromPaise(t.amountInPaise)}
                    </span>
                  </td>
                  <td>{formatInrFromPaise(t.balanceAfterInPaise)}</td>
                  <td style={{ color: "var(--muted)", fontSize: "0.85rem" }}>
                    {t.notes ?? (t.referenceId ? `Ref ${t.referenceId.slice(0, 8)}…` : "—")}
                  </td>
                </tr>
              ))}
              {items.length === 0 ? (
                <tr>
                  <td colSpan={6} className="empty">
                    {isSupplier
                      ? "No payouts yet. After a delivery completes, settlement appears here."
                      : isOwner
                        ? "No payouts yet. After a customer checks out, settlement appears here."
                        : "No payments yet. Book and pay for a parking slot to see activity."}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        {totalPages > 1 ? (
          <Pagination page={page} totalPages={totalPages} total={total} onPageChange={setPage} />
        ) : null}
      </section>
    </>
  );
}
