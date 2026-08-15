import { useState, type ReactNode } from "react";
import { downloadAuthenticatedFile, formatInrFromPaise, openAuthenticatedHtml, qs } from "../api";
import { EXPENSE_CATEGORIES, formatDateTime } from "../lib/community";
import type { Paginated } from "../types";
import { Pagination } from "./Pagination";
import { useToast } from "./Toast";

export type CommunityExpenseItem = {
  id: number;
  category: string;
  vendor: string;
  amountInPaise: number;
  notes: string | null;
  createdAt: string;
};

type Props = {
  apartmentId?: number;
  data: Paginated<CommunityExpenseItem> | null;
  heading?: ReactNode;
  category: string;
  fromDate: string;
  toDate: string;
  vendorQ: string;
  onCategoryChange: (value: string) => void;
  onFromDateChange: (value: string) => void;
  onToDateChange: (value: string) => void;
  onVendorQChange: (value: string) => void;
  onPageChange: (page: number) => void;
};

export function ExpenseListPanel({
  apartmentId,
  data,
  heading,
  category,
  fromDate,
  toDate,
  vendorQ,
  onCategoryChange,
  onFromDateChange,
  onToDateChange,
  onVendorQChange,
  onPageChange,
}: Props) {
  const toast = useToast();
  const [exporting, setExporting] = useState<"pdf" | "excel" | null>(null);
  const filtered = Boolean(category || fromDate || toDate || vendorQ.trim());

  function exportPath(format: "pdf" | "excel") {
    return `/community/expenses/export${qs({
      apartmentId,
      format,
      category: category || undefined,
      q: vendorQ.trim() || undefined,
      fromDate: fromDate || undefined,
      toDate: toDate || undefined,
    })}`;
  }

  async function exportExpenses(format: "pdf" | "excel") {
    setExporting(format);
    try {
      const path = exportPath(format);
      if (format === "pdf") {
        await openAuthenticatedHtml(path);
      } else {
        await downloadAuthenticatedFile(path, "society-expenses.xls");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to export expenses");
    } finally {
      setExporting(null);
    }
  }

  function clearFilters() {
    onCategoryChange("");
    onFromDateChange("");
    onToDateChange("");
    onVendorQChange("");
  }

  return (
    <section className="panel">
      <div className="panel-head">
        <h3>{heading ?? "Expenses"}</h3>
        <div className="expense-export-actions">
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={exporting !== null}
            onClick={() => void exportExpenses("pdf")}
          >
            {exporting === "pdf" ? "…" : "Download PDF"}
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={exporting !== null}
            onClick={() => void exportExpenses("excel")}
          >
            {exporting === "excel" ? "…" : "Download Excel"}
          </button>
        </div>
      </div>
      <div className="expense-filters">
        <label className="expense-filter">
          <span>Category</span>
          <select
            aria-label="Filter by category"
            value={category}
            onChange={(e) => onCategoryChange(e.target.value)}
          >
            <option value="">All categories</option>
            {EXPENSE_CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>
                {cat.replaceAll("_", " ")}
              </option>
            ))}
          </select>
        </label>
        <label className="expense-filter">
          <span>From</span>
          <input
            type="date"
            aria-label="From date"
            value={fromDate}
            max={toDate || undefined}
            onChange={(e) => onFromDateChange(e.target.value)}
          />
        </label>
        <label className="expense-filter">
          <span>To</span>
          <input
            type="date"
            aria-label="To date"
            value={toDate}
            min={fromDate || undefined}
            onChange={(e) => onToDateChange(e.target.value)}
          />
        </label>
        <label className="expense-filter expense-filter-search">
          <span>Vendor</span>
          <input
            type="search"
            placeholder="Search vendor"
            value={vendorQ}
            onChange={(e) => onVendorQChange(e.target.value)}
          />
        </label>
        <div className="expense-filter-actions">
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={!filtered}
            onClick={clearFilters}
          >
            Clear
          </button>
        </div>
      </div>
      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th>Recorded</th>
              <th>Vendor</th>
              <th>Category</th>
              <th>Amount</th>
            </tr>
          </thead>
          <tbody>
            {(data?.items ?? []).map((ex) => (
              <tr key={ex.id}>
                <td>{formatDateTime(ex.createdAt)}</td>
                <td>
                  {ex.vendor}
                  {ex.notes ? <div className="muted">{ex.notes}</div> : null}
                </td>
                <td>{ex.category.replaceAll("_", " ")}</td>
                <td>{formatInrFromPaise(ex.amountInPaise)}</td>
              </tr>
            ))}
            {data && data.items.length === 0 ? (
              <tr>
                <td colSpan={4} className="empty">
                  {filtered ? "No expenses match these filters." : "No expenses yet."}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <Pagination
        page={data?.page ?? 1}
        totalPages={data?.totalPages ?? 1}
        total={data?.total ?? 0}
        onPageChange={onPageChange}
      />
    </section>
  );
}
