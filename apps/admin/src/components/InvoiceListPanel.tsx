import { useState } from "react";
import { downloadAuthenticatedFile, formatInrFromPaise, openAuthenticatedHtml } from "../api";
import type { Paginated } from "../types";
import { Pagination } from "./Pagination";
import { StatusBadge } from "./StatusBadge";
import { useToast } from "./Toast";

export type InvoiceListItem = {
  id: string | number;
  invoiceNumber?: string;
  amountInPaise: number;
  status: string;
  createdAt: string;
};

type Props<T extends InvoiceListItem> = {
  data: Paginated<T> | null;
  fallbackNumber: (inv: T) => string;
  refLabel: string;
  refValue: (inv: T) => string;
  downloadPath: (inv: T) => string;
  emptyMessage: string;
  onPageChange: (page: number) => void;
};

export function InvoiceListPanel<T extends InvoiceListItem>({
  data,
  fallbackNumber,
  refLabel,
  refValue,
  downloadPath,
  emptyMessage,
  onPageChange,
}: Props<T>) {
  const toast = useToast();
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  async function downloadInvoice(inv: T, mode: "file" | "print") {
    const id = String(inv.id);
    setDownloadingId(id);
    try {
      if (mode === "print") {
        await openAuthenticatedHtml(downloadPath(inv));
      } else {
        await downloadAuthenticatedFile(downloadPath(inv), `${inv.invoiceNumber ?? fallbackNumber(inv)}.html`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to download invoice");
    } finally {
      setDownloadingId(null);
    }
  }

  return (
    <>
      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th>Invoice</th>
              <th>Date</th>
              <th>{refLabel}</th>
              <th>Amount</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {(data?.items ?? []).map((inv) => (
              <tr key={String(inv.id)}>
                <td>
                  <code>{inv.invoiceNumber ?? fallbackNumber(inv)}</code>
                </td>
                <td>{new Date(inv.createdAt).toLocaleString("en-IN")}</td>
                <td>
                  <code>#{refValue(inv)}</code>
                </td>
                <td>{formatInrFromPaise(inv.amountInPaise)}</td>
                <td>
                  <StatusBadge status={inv.status} />
                </td>
                <td>
                  <div className="action-stack">
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      disabled={downloadingId === String(inv.id)}
                      onClick={() => void downloadInvoice(inv, "file")}
                    >
                      {downloadingId === String(inv.id) ? "…" : "Download"}
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      disabled={downloadingId === String(inv.id)}
                      onClick={() => void downloadInvoice(inv, "print")}
                    >
                      Print / PDF
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {(data?.items.length ?? 0) === 0 ? (
              <tr>
                <td colSpan={6} className="empty">
                  {emptyMessage}
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
          onPageChange={onPageChange}
        />
      ) : null}
    </>
  );
}
