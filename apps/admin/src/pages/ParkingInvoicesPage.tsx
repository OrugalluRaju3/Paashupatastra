import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, qs } from "../api";
import { useAuth } from "../auth/AuthContext";
import { InvoiceListPanel, type InvoiceListItem } from "../components/InvoiceListPanel";
import { useToast } from "../components/Toast";
import type { Paginated } from "../types";

type ParkingInvoice = InvoiceListItem & {
  bookingId: string | number;
};

type Audience = "customer" | "owner" | "staff";

const COPY: Record<
  Audience,
  { title: string; subtitle: string; empty: string; bookingsTo: string; bookingsLabel: string }
> = {
  customer: {
    title: "My invoices",
    subtitle: "Download receipts for paid parking bookings.",
    empty: "No invoices yet. They appear after you complete payment for a booking.",
    bookingsTo: "/app/customer/bookings",
    bookingsLabel: "My bookings",
  },
  owner: {
    title: "Invoices",
    subtitle: "Generated after the customer pays. Download or print/PDF.",
    empty: "No invoices yet. They appear after a customer pays for your parking.",
    bookingsTo: "/app/owner/bookings",
    bookingsLabel: "Bookings",
  },
  staff: {
    title: "Parking invoices",
    subtitle: "Paid parking receipts for customers and owners.",
    empty: "No invoices yet.",
    bookingsTo: "/staff/bookings",
    bookingsLabel: "Bookings",
  },
};

export function ParkingInvoicesPage({ audience }: { audience: Audience }) {
  const toast = useToast();
  const { user } = useAuth();
  const [page, setPage] = useState(1);
  const [invoices, setInvoices] = useState<Paginated<ParkingInvoice> | null>(null);
  const copy = COPY[audience];

  const load = useCallback(async () => {
    if (audience !== "staff" && !user?.id) return;
    try {
      const query =
        audience === "customer"
          ? { page, limit: 10, renterUserId: user!.id }
          : audience === "owner"
            ? { page, limit: 10, ownerUserId: user!.id }
            : { page, limit: 10 };
      setInvoices(await api.get<Paginated<ParkingInvoice>>(`/parking/invoices${qs(query)}`));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load invoices");
    }
  }, [audience, page, toast, user]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <>
      <div className="topbar">
        <div>
          <h2>{copy.title}</h2>
          <p>{copy.subtitle}</p>
        </div>
        <Link className="btn btn-ghost" to={copy.bookingsTo}>
          {copy.bookingsLabel}
        </Link>
      </div>
      <section className="panel">
        <InvoiceListPanel
          data={invoices}
          fallbackNumber={(inv) => `INV-PK-${inv.id}`}
          refLabel="Booking"
          refValue={(inv) => String(inv.bookingId)}
          downloadPath={(inv) => `/parking/invoices/${inv.id}/download`}
          emptyMessage={copy.empty}
          onPageChange={setPage}
        />
      </section>
    </>
  );
}
