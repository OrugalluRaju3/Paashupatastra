import { FormEvent, useCallback, useEffect, useState } from "react";

import { api, downloadAuthenticatedFile, formatInrFromPaise, openAuthenticatedHtml, qs } from "../api";

import { KpiCard } from "../components/KpiCard";

import { Pagination } from "../components/Pagination";

import { StatusBadge } from "../components/StatusBadge";

import { useToast } from "../components/Toast";

import type { Paginated } from "../types";



type TankerStats = {

  suppliers: number;

  vehicles: number;

  requestsPending: number;

  ordersActive: number;

  ordersDelivered: number;

};



type ReportSummary = TankerStats & {

  ordersCancelled: number;

  revenuePaidInPaise: number;

  revenuePendingInPaise: number;

  invoicesCount: number;

  invoicesPaidCount: number;

};



type Supplier = {

  id: string;

  fullName: string;

  email: string | null;

  city: string;

  state: string;

  pinCode: string;

  isOnline: boolean;

  isActive: boolean;

  createdAt: string;

};



type Vehicle = {

  id: string;

  supplierId: string;

  driverFullName: string;

  driverMobile: string;

  vehicleNumber: string;

  capacityLitres: number;

  amountInPaise: number;

  waterType: string;

  status: string;

  isActive: boolean;

  createdAt: string;

};



type TankerRequest = {

  id: string;

  customerUserId: string;

  supplierId: string | null;

  waterType: string;

  quantityLitres: number;

  deliveryAddress: string;

  status: string;

  createdAt: string;

};



type TankerOrder = {

  id: string;

  customerUserId: string;

  supplierId: string;

  waterType: string;

  capacityLitres: number;

  vehicleNumber: string | null;

  amountInPaise: number;

  deliveryAddress: string;

  status: string;

  paymentStatus: string;

  createdAt: string;

};



type Invoice = {

  id: string | number;

  invoiceNumber?: string;

  orderId: string | number;

  amountInPaise: number;

  status: string;

  createdAt: string;

};



type PlatformFee = {

  id: string;

  feeType: string;

  percentageBps: number;

  flatFeeInPaise: number;

  isActive: boolean;

};



type TaxSetting = {

  id: string;

  taxName: string;

  taxBps: number;

  country: string;

  state: string | null;

  isActive: boolean;

};



type Promo = {

  id: string;

  code: string;

  description: string | null;

  discountType: string;

  discountValue: number;

  minOrderInPaise: number;

  maxUses: number;

  isActive: boolean;

};



type StaffTab = "suppliers" | "vehicles" | "orders" | "requests" | "invoices" | "customers" | "settings" | "reports";



type CustomerReport = {
  customerUserId: string | number;
  name?: string | null;
  phone?: string | null;
  email?: string | null;
  isActive?: boolean;
  city?: string | null;
  createdAt?: string | null;
  ordersCount: number;
  lastOrderAt: string | null;
  totalPaidInPaise: number;
};



const emptyPlatformFeeForm = {

  feeType: "percentage",

  percentageBps: "1000",

  flatFeeInr: "0",

  isActive: true,

};



const emptyTaxForm = {

  taxName: "GST",

  taxBps: "1800",

  country: "IN",

  state: "",

  isActive: true,

};



const emptyPromoForm = {

  code: "",

  description: "",

  discountType: "percentage",

  discountValue: "1000",

  minOrderInr: "0",

  maxUses: "100",

  isActive: true,

};



export function TankerStaffPage() {

  const toast = useToast();

  const [tab, setTab] = useState<StaffTab>("suppliers");

  const [stats, setStats] = useState<TankerStats | null>(null);

  const [reportSummary, setReportSummary] = useState<ReportSummary | null>(null);

  const [page, setPage] = useState(1);

  const [suppliers, setSuppliers] = useState<Paginated<Supplier> | null>(null);

  const [vehicles, setVehicles] = useState<Paginated<Vehicle> | null>(null);

  const [orders, setOrders] = useState<Paginated<TankerOrder> | null>(null);

  const [requests, setRequests] = useState<Paginated<TankerRequest> | null>(null);

  const [invoices, setInvoices] = useState<Paginated<Invoice> | null>(null);

  const [downloadingInvoiceId, setDownloadingInvoiceId] = useState<string | null>(null);

  const [customers, setCustomers] = useState<Paginated<CustomerReport> | null>(null);

  const [platformFees, setPlatformFees] = useState<PlatformFee[]>([]);

  const [taxes, setTaxes] = useState<TaxSetting[]>([]);

  const [promos, setPromos] = useState<Promo[]>([]);

  const [platformFeeForm, setPlatformFeeForm] = useState(emptyPlatformFeeForm);

  const [taxForm, setTaxForm] = useState(emptyTaxForm);

  const [promoForm, setPromoForm] = useState(emptyPromoForm);

  const [savingSettings, setSavingSettings] = useState(false);

  const [loading, setLoading] = useState(false);



  useEffect(() => {

    setPage(1);

  }, [tab]);



  const load = useCallback(async () => {

    setLoading(true);

    try {

      if (tab === "reports") {

        setReportSummary(await api.get<ReportSummary>("/tanker/reports/summary"));

      } else {

        setStats(await api.get<TankerStats>("/tanker/stats"));

      }



      if (tab === "suppliers") {

        setSuppliers(await api.get<Paginated<Supplier>>(`/tanker/suppliers${qs({ page, limit: 10 })}`));

      } else if (tab === "vehicles") {

        setVehicles(await api.get<Paginated<Vehicle>>(`/tanker/vehicles${qs({ page, limit: 10 })}`));

      } else if (tab === "orders") {

        setOrders(await api.get<Paginated<TankerOrder>>(`/tanker/orders${qs({ page, limit: 10 })}`));

      } else if (tab === "requests") {

        setRequests(await api.get<Paginated<TankerRequest>>(`/tanker/requests${qs({ page, limit: 10 })}`));

      } else if (tab === "invoices") {

        setInvoices(await api.get<Paginated<Invoice>>(`/tanker/invoices${qs({ page, limit: 10 })}`));

      } else if (tab === "customers") {

        setCustomers(

          await api.get<Paginated<CustomerReport>>(`/tanker/reports/customers${qs({ page, limit: 10 })}`),

        );

      } else if (tab === "settings") {

        const [fees, taxRows, promoRows] = await Promise.all([

          api.get<{ items: PlatformFee[] }>("/tanker/settings/platform-fees"),

          api.get<{ items: TaxSetting[] }>("/tanker/settings/taxes"),

          api.get<{ items: Promo[] }>("/tanker/settings/promos"),

        ]);

        setPlatformFees(fees.items);

        setTaxes(taxRows.items);

        setPromos(promoRows.items);

      }

    } catch (err) {

      toast.error(err instanceof Error ? err.message : "Failed to load tanker data");

    } finally {

      setLoading(false);

    }

  }, [page, tab, toast]);



  useEffect(() => {

    void load();

  }, [load]);



  async function onCreatePlatformFee(e: FormEvent) {

    e.preventDefault();

    setSavingSettings(true);

    try {

      await api.post("/tanker/settings/platform-fees", {

        feeType: platformFeeForm.feeType,

        percentageBps: Number(platformFeeForm.percentageBps),

        flatFeeInPaise: Math.round(Number(platformFeeForm.flatFeeInr) * 100),

        isActive: platformFeeForm.isActive,

      });

      toast.success("Platform fee created");

      setPlatformFeeForm(emptyPlatformFeeForm);

      await load();

    } catch (err) {

      toast.error(err instanceof Error ? err.message : "Failed to create platform fee");

    } finally {

      setSavingSettings(false);

    }

  }



  async function onCreateTax(e: FormEvent) {

    e.preventDefault();

    setSavingSettings(true);

    try {

      await api.post("/tanker/settings/taxes", {

        taxName: taxForm.taxName.trim(),

        taxBps: Number(taxForm.taxBps),

        country: taxForm.country.trim() || "IN",

        state: taxForm.state.trim() || null,

        isActive: taxForm.isActive,

      });

      toast.success("Tax setting created");

      setTaxForm(emptyTaxForm);

      await load();

    } catch (err) {

      toast.error(err instanceof Error ? err.message : "Failed to create tax");

    } finally {

      setSavingSettings(false);

    }

  }



  async function onCreatePromo(e: FormEvent) {

    e.preventDefault();

    setSavingSettings(true);

    try {

      await api.post("/tanker/settings/promos", {

        code: promoForm.code.trim().toUpperCase(),

        description: promoForm.description.trim() || null,

        discountType: promoForm.discountType,

        discountValue: Number(promoForm.discountValue),

        minOrderInPaise: Math.round(Number(promoForm.minOrderInr) * 100),

        maxUses: Number(promoForm.maxUses),

        isActive: promoForm.isActive,

      });

      toast.success("Promo code created");

      setPromoForm(emptyPromoForm);

      await load();

    } catch (err) {

      toast.error(err instanceof Error ? err.message : "Failed to create promo");

    } finally {

      setSavingSettings(false);

    }

  }



  async function deletePlatformFee(id: string) {

    try {

      await api.delete(`/tanker/settings/platform-fees/${id}`);

      toast.success("Platform fee deleted");

      await load();

    } catch (err) {

      toast.error(err instanceof Error ? err.message : "Failed to delete platform fee");

    }

  }



  async function deleteTax(id: string) {

    try {

      await api.delete(`/tanker/settings/taxes/${id}`);

      toast.success("Tax deleted");

      await load();

    } catch (err) {

      toast.error(err instanceof Error ? err.message : "Failed to delete tax");

    }

  }



  async function deletePromo(id: string) {

    try {

      await api.delete(`/tanker/settings/promos/${id}`);

      toast.success("Promo deleted");

      await load();

    } catch (err) {

      toast.error(err instanceof Error ? err.message : "Failed to delete promo");

    }

  }



  const tabs: Array<{ id: StaffTab; label: string }> = [

    { id: "suppliers", label: "Suppliers" },

    { id: "vehicles", label: "Vehicles" },

    { id: "orders", label: "Orders" },

    { id: "requests", label: "Requests" },

    { id: "invoices", label: "Invoices" },

    { id: "customers", label: "Customers" },

    { id: "settings", label: "Settings" },

    { id: "reports", label: "Reports" },

  ];



  const currentTotalPages =

    tab === "suppliers"

      ? (suppliers?.totalPages ?? 1)

      : tab === "vehicles"

        ? (vehicles?.totalPages ?? 1)

        : tab === "orders"

          ? (orders?.totalPages ?? 1)

          : tab === "invoices"

            ? (invoices?.totalPages ?? 1)

            : tab === "customers"

              ? (customers?.totalPages ?? 1)

              : tab === "requests"

              ? (requests?.totalPages ?? 1)

              : 1;



  const currentTotal =

    tab === "suppliers"

      ? (suppliers?.total ?? 0)

      : tab === "vehicles"

        ? (vehicles?.total ?? 0)

        : tab === "orders"

          ? (orders?.total ?? 0)

          : tab === "invoices"

            ? (invoices?.total ?? 0)

            : tab === "customers"

              ? (customers?.total ?? 0)

              : tab === "requests"

              ? (requests?.total ?? 0)

              : 0;



  return (

    <>

      <div className="topbar">

        <div>

          <h2>Water tanker</h2>

          <p>Suppliers, fleet, delivery requests, and orders.</p>

        </div>

        <button type="button" className="btn btn-ghost" onClick={() => void load()}>

          Refresh

        </button>

      </div>



      {tab === "reports" ? (

        <div className="kpi-grid">

          <KpiCard label="Suppliers" value={reportSummary?.suppliers ?? "—"} />

          <KpiCard label="Vehicles" value={reportSummary?.vehicles ?? "—"} />

          <KpiCard label="Pending requests" value={reportSummary?.requestsPending ?? "—"} />

          <KpiCard label="Active orders" value={reportSummary?.ordersActive ?? "—"} />

          <KpiCard label="Delivered" value={reportSummary?.ordersDelivered ?? "—"} />

          <KpiCard label="Cancelled" value={reportSummary?.ordersCancelled ?? "—"} />

          <KpiCard

            label="Revenue (paid)"

            value={

              reportSummary

                ? formatInrFromPaise(reportSummary.revenuePaidInPaise)

                : "—"

            }

          />

          <KpiCard

            label="Revenue (pending)"

            value={

              reportSummary

                ? formatInrFromPaise(reportSummary.revenuePendingInPaise)

                : "—"

            }

          />

          <KpiCard

            label="Invoices"

            value={reportSummary?.invoicesCount ?? "—"}

            hint={`${reportSummary?.invoicesPaidCount ?? 0} paid`}

          />

        </div>

      ) : (

        <div className="kpi-grid">

          <KpiCard label="Suppliers" value={stats?.suppliers ?? "—"} />

          <KpiCard label="Vehicles" value={stats?.vehicles ?? "—"} />

          <KpiCard label="Pending requests" value={stats?.requestsPending ?? "—"} />

          <KpiCard

            label="Active orders"

            value={stats?.ordersActive ?? "—"}

            hint={`${stats?.ordersDelivered ?? 0} delivered`}

          />

        </div>

      )}



      <div className="tabs" role="tablist">

        {tabs.map((t) => (

          <button

            key={t.id}

            type="button"

            role="tab"

            aria-selected={tab === t.id}

            className={tab === t.id ? "tab active" : "tab"}

            onClick={() => setTab(t.id)}

          >

            {t.label}

          </button>

        ))}

      </div>



      <section className="panel">

        <div className="panel-head">

          <h3>{tabs.find((t) => t.id === tab)?.label}</h3>

        </div>



        {loading ? <p className="loading">Loading…</p> : null}



        {tab === "suppliers" ? (

          <div className="table-wrap">

            <table className="data">

              <thead>

                <tr>

                  <th>Name</th>

                  <th>Location</th>

                  <th>Online</th>

                  <th>Status</th>

                  <th>Joined</th>

                </tr>

              </thead>

              <tbody>

                {(suppliers?.items ?? []).map((s) => (

                  <tr key={s.id}>

                    <td>

                      <strong>{s.fullName}</strong>

                      <div style={{ color: "var(--muted)", fontSize: "0.85rem" }}>{s.email ?? "—"}</div>

                    </td>

                    <td>

                      {s.city}, {s.state} · {s.pinCode}

                    </td>

                    <td>

                      <StatusBadge status={s.isOnline ? "active" : "inactive"} />

                    </td>

                    <td>

                      <StatusBadge status={s.isActive ? "active" : "inactive"} />

                    </td>

                    <td>{new Date(s.createdAt).toLocaleDateString("en-IN")}</td>

                  </tr>

                ))}

                {(suppliers?.items.length ?? 0) === 0 ? (

                  <tr>

                    <td colSpan={5} className="empty">

                      No suppliers yet.

                    </td>

                  </tr>

                ) : null}

              </tbody>

            </table>

          </div>

        ) : null}



        {tab === "vehicles" ? (

          <div className="table-wrap">

            <table className="data">

              <thead>

                <tr>

                  <th>Vehicle</th>

                  <th>Driver</th>

                  <th>Capacity</th>

                  <th>Amount</th>

                  <th>Status</th>

                </tr>

              </thead>

              <tbody>

                {(vehicles?.items ?? []).map((v) => (

                  <tr key={v.id}>

                    <td>

                      <strong>{v.vehicleNumber}</strong>

                      <div style={{ color: "var(--muted)", fontSize: "0.85rem" }}>{v.waterType}</div>

                    </td>

                    <td>

                      {v.driverFullName}

                      <div style={{ color: "var(--muted)", fontSize: "0.85rem" }}>{v.driverMobile}</div>

                    </td>

                    <td>{v.capacityLitres.toLocaleString("en-IN")} L</td>

                    <td>{formatInrFromPaise(v.amountInPaise)}</td>

                    <td>

                      <StatusBadge status={v.status} />

                    </td>

                  </tr>

                ))}

                {(vehicles?.items.length ?? 0) === 0 ? (

                  <tr>

                    <td colSpan={5} className="empty">

                      No vehicles yet.

                    </td>

                  </tr>

                ) : null}

              </tbody>

            </table>

          </div>

        ) : null}



        {tab === "orders" ? (

          <div className="table-wrap">

            <table className="data">

              <thead>

                <tr>

                  <th>Order</th>

                  <th>Delivery</th>

                  <th>Vehicle</th>

                  <th>Amount</th>

                  <th>Status</th>

                </tr>

              </thead>

              <tbody>

                {(orders?.items ?? []).map((o) => (

                  <tr key={o.id}>

                    <td>

                      <code>#{String(o.id)}</code>

                      <div style={{ color: "var(--muted)", fontSize: "0.85rem" }}>

                        {o.waterType} · {o.capacityLitres.toLocaleString("en-IN")} L

                      </div>

                    </td>

                    <td>{o.deliveryAddress}</td>

                    <td>{o.vehicleNumber ?? "—"}</td>

                    <td>

                      {formatInrFromPaise(o.amountInPaise)}

                      <div style={{ color: "var(--muted)", fontSize: "0.85rem" }}>{o.paymentStatus}</div>

                    </td>

                    <td>

                      <StatusBadge status={o.status} />

                    </td>

                  </tr>

                ))}

                {(orders?.items.length ?? 0) === 0 ? (

                  <tr>

                    <td colSpan={5} className="empty">

                      No orders yet.

                    </td>

                  </tr>

                ) : null}

              </tbody>

            </table>

          </div>

        ) : null}



        {tab === "requests" ? (

          <div className="table-wrap">

            <table className="data">

              <thead>

                <tr>

                  <th>Request</th>

                  <th>Water</th>

                  <th>Delivery</th>

                  <th>Status</th>

                  <th>Created</th>

                </tr>

              </thead>

              <tbody>

                {(requests?.items ?? []).map((r) => (

                  <tr key={r.id}>

                    <td>

                      <code>#{String(r.id)}</code>

                    </td>

                    <td>

                      {r.waterType} · {r.quantityLitres.toLocaleString("en-IN")} L

                    </td>

                    <td>{r.deliveryAddress}</td>

                    <td>

                      <StatusBadge status={r.status} />

                    </td>

                    <td>{new Date(r.createdAt).toLocaleString("en-IN")}</td>

                  </tr>

                ))}

                {(requests?.items.length ?? 0) === 0 ? (

                  <tr>

                    <td colSpan={5} className="empty">

                      No requests yet.

                    </td>

                  </tr>

                ) : null}

              </tbody>

            </table>

          </div>

        ) : null}



        {tab === "invoices" ? (

          <div className="table-wrap">

            <table className="data">

              <thead>

                <tr>

                  <th>Invoice</th>

                  <th>Order</th>

                  <th>Amount</th>

                  <th>Status</th>

                  <th>Created</th>

                  <th />

                </tr>

              </thead>

              <tbody>

                {(invoices?.items ?? []).map((inv) => (

                  <tr key={String(inv.id)}>

                    <td>

                      <code>{inv.invoiceNumber ?? `INV-TK-${inv.id}`}</code>

                    </td>

                    <td>

                      <code>#{String(inv.orderId)}</code>

                    </td>

                    <td>{formatInrFromPaise(inv.amountInPaise)}</td>

                    <td>

                      <StatusBadge status={inv.status} />

                    </td>

                    <td>{new Date(inv.createdAt).toLocaleString("en-IN")}</td>

                    <td>

                      <div className="action-stack">

                        <button

                          type="button"

                          className="btn btn-primary btn-sm"

                          disabled={downloadingInvoiceId === String(inv.id)}

                          onClick={() => {

                            const id = String(inv.id);

                            setDownloadingInvoiceId(id);

                            void downloadAuthenticatedFile(

                              `/tanker/invoices/${id}/download`,

                              `${inv.invoiceNumber ?? `INV-TK-${id}`}.html`,

                            )

                              .catch((err) =>

                                toast.error(err instanceof Error ? err.message : "Download failed"),

                              )

                              .finally(() => setDownloadingInvoiceId(null));

                          }}

                        >

                          Download

                        </button>

                        <button

                          type="button"

                          className="btn btn-ghost btn-sm"

                          disabled={downloadingInvoiceId === String(inv.id)}

                          onClick={() => {

                            const id = String(inv.id);

                            setDownloadingInvoiceId(id);

                            void openAuthenticatedHtml(`/tanker/invoices/${id}/download`)

                              .catch((err) =>

                                toast.error(err instanceof Error ? err.message : "Open failed"),

                              )

                              .finally(() => setDownloadingInvoiceId(null));

                          }}

                        >

                          Print / PDF

                        </button>

                      </div>

                    </td>

                  </tr>

                ))}

                {(invoices?.items.length ?? 0) === 0 ? (

                  <tr>

                    <td colSpan={6} className="empty">

                      No invoices yet.

                    </td>

                  </tr>

                ) : null}

              </tbody>

            </table>

          </div>

        ) : null}



        {tab === "customers" ? (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>Mobile</th>
                  <th>Email</th>
                  <th>Orders</th>
                  <th>Total paid</th>
                  <th>Last order</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {(customers?.items ?? []).map((c) => (
                  <tr key={String(c.customerUserId)}>
                    <td>
                      <strong>{c.name ?? "—"}</strong>
                      <div style={{ color: "var(--muted)", fontSize: "0.85rem" }}>
                        #{String(c.customerUserId)}
                        {c.city ? ` · ${c.city}` : ""}
                      </div>
                    </td>
                    <td className="mono">{c.phone ?? "—"}</td>
                    <td>{c.email ?? "—"}</td>
                    <td>{c.ordersCount}</td>
                    <td>{formatInrFromPaise(c.totalPaidInPaise)}</td>
                    <td>
                      {c.lastOrderAt ? new Date(c.lastOrderAt).toLocaleString("en-IN") : "—"}
                    </td>
                    <td>
                      <StatusBadge status={c.isActive === false ? "inactive" : "active"} />
                    </td>
                  </tr>
                ))}
                {(customers?.items.length ?? 0) === 0 ? (
                  <tr>
                    <td colSpan={7} className="empty">
                      No customers registered yet.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        ) : null}



        {tab === "reports" && !loading ? (

          <div className="panel-body">

            <p style={{ marginTop: 0, color: "var(--muted)" }}>

              Summary metrics for tanker operations, revenue, and invoicing.

            </p>

          </div>

        ) : null}



        {tab === "settings" ? (

          <div className="panel-body">

            <section style={{ marginBottom: "2rem" }}>

              <h4 style={{ marginTop: 0 }}>Platform fees</h4>

              <div className="table-wrap">

                <table className="data">

                  <thead>

                    <tr>

                      <th>Type</th>

                      <th>Percentage (bps)</th>

                      <th>Flat fee</th>

                      <th>Active</th>

                      <th></th>

                    </tr>

                  </thead>

                  <tbody>

                    {platformFees.map((f) => (

                      <tr key={f.id}>

                        <td>{f.feeType}</td>

                        <td>{f.percentageBps}</td>

                        <td>{formatInrFromPaise(f.flatFeeInPaise)}</td>

                        <td>

                          <StatusBadge status={f.isActive ? "active" : "inactive"} />

                        </td>

                        <td>

                          <button

                            type="button"

                            className="btn btn-ghost btn-sm"

                            onClick={() => void deletePlatformFee(f.id)}

                          >

                            Delete

                          </button>

                        </td>

                      </tr>

                    ))}

                    {platformFees.length === 0 ? (

                      <tr>

                        <td colSpan={5} className="empty">

                          No platform fees configured.

                        </td>

                      </tr>

                    ) : null}

                  </tbody>

                </table>

              </div>

              <form className="withdraw-form" style={{ marginTop: "1rem" }} onSubmit={(e) => void onCreatePlatformFee(e)}>

                <div className="grid-2">

                  <div className="field">

                    <label htmlFor="pf-type">Fee type</label>

                    <select

                      id="pf-type"

                      value={platformFeeForm.feeType}

                      onChange={(e) => setPlatformFeeForm((f) => ({ ...f, feeType: e.target.value }))}

                    >

                      <option value="percentage">Percentage</option>

                      <option value="flat">Flat</option>

                      <option value="both">Both</option>

                    </select>

                  </div>

                  <div className="field">

                    <label htmlFor="pf-bps">Percentage (bps, 1000 = 10%)</label>

                    <input

                      id="pf-bps"

                      type="number"

                      min={0}

                      value={platformFeeForm.percentageBps}

                      onChange={(e) => setPlatformFeeForm((f) => ({ ...f, percentageBps: e.target.value }))}

                    />

                  </div>

                </div>

                <div className="grid-2">

                  <div className="field">

                    <label htmlFor="pf-flat">Flat fee (INR)</label>

                    <input

                      id="pf-flat"

                      type="number"

                      min={0}

                      value={platformFeeForm.flatFeeInr}

                      onChange={(e) => setPlatformFeeForm((f) => ({ ...f, flatFeeInr: e.target.value }))}

                    />

                  </div>

                  <div className="field">

                    <label htmlFor="pf-active">Active</label>

                    <select

                      id="pf-active"

                      value={platformFeeForm.isActive ? "true" : "false"}

                      onChange={(e) =>

                        setPlatformFeeForm((f) => ({ ...f, isActive: e.target.value === "true" }))

                      }

                    >

                      <option value="true">Yes</option>

                      <option value="false">No</option>

                    </select>

                  </div>

                </div>

                <button type="submit" className="btn btn-primary btn-sm" disabled={savingSettings}>

                  Add platform fee

                </button>

              </form>

            </section>



            <section style={{ marginBottom: "2rem" }}>

              <h4>Taxes</h4>

              <div className="table-wrap">

                <table className="data">

                  <thead>

                    <tr>

                      <th>Name</th>

                      <th>Rate (bps)</th>

                      <th>Country</th>

                      <th>State</th>

                      <th>Active</th>

                      <th></th>

                    </tr>

                  </thead>

                  <tbody>

                    {taxes.map((t) => (

                      <tr key={t.id}>

                        <td>{t.taxName}</td>

                        <td>{t.taxBps}</td>

                        <td>{t.country}</td>

                        <td>{t.state ?? "—"}</td>

                        <td>

                          <StatusBadge status={t.isActive ? "active" : "inactive"} />

                        </td>

                        <td>

                          <button

                            type="button"

                            className="btn btn-ghost btn-sm"

                            onClick={() => void deleteTax(t.id)}

                          >

                            Delete

                          </button>

                        </td>

                      </tr>

                    ))}

                    {taxes.length === 0 ? (

                      <tr>

                        <td colSpan={6} className="empty">

                          No tax settings configured.

                        </td>

                      </tr>

                    ) : null}

                  </tbody>

                </table>

              </div>

              <form className="withdraw-form" style={{ marginTop: "1rem" }} onSubmit={(e) => void onCreateTax(e)}>

                <div className="grid-2">

                  <div className="field">

                    <label htmlFor="tx-name">Tax name</label>

                    <input

                      id="tx-name"

                      required

                      value={taxForm.taxName}

                      onChange={(e) => setTaxForm((f) => ({ ...f, taxName: e.target.value }))}

                    />

                  </div>

                  <div className="field">

                    <label htmlFor="tx-bps">Rate (bps, 1800 = 18%)</label>

                    <input

                      id="tx-bps"

                      type="number"

                      min={0}

                      max={10000}

                      required

                      value={taxForm.taxBps}

                      onChange={(e) => setTaxForm((f) => ({ ...f, taxBps: e.target.value }))}

                    />

                  </div>

                </div>

                <div className="grid-2">

                  <div className="field">

                    <label htmlFor="tx-country">Country</label>

                    <input

                      id="tx-country"

                      required

                      value={taxForm.country}

                      onChange={(e) => setTaxForm((f) => ({ ...f, country: e.target.value }))}

                    />

                  </div>

                  <div className="field">

                    <label htmlFor="tx-state">State (optional)</label>

                    <input

                      id="tx-state"

                      value={taxForm.state}

                      onChange={(e) => setTaxForm((f) => ({ ...f, state: e.target.value }))}

                    />

                  </div>

                </div>

                <button type="submit" className="btn btn-primary btn-sm" disabled={savingSettings}>

                  Add tax

                </button>

              </form>

            </section>



            <section>

              <h4>Promo codes</h4>

              <div className="table-wrap">

                <table className="data">

                  <thead>

                    <tr>

                      <th>Code</th>

                      <th>Type</th>

                      <th>Value</th>

                      <th>Min order</th>

                      <th>Max uses</th>

                      <th>Active</th>

                      <th></th>

                    </tr>

                  </thead>

                  <tbody>

                    {promos.map((p) => (

                      <tr key={p.id}>

                        <td>

                          <strong>{p.code}</strong>

                          {p.description ? (

                            <div style={{ color: "var(--muted)", fontSize: "0.85rem" }}>{p.description}</div>

                          ) : null}

                        </td>

                        <td>{p.discountType}</td>

                        <td>{p.discountValue}</td>

                        <td>{formatInrFromPaise(p.minOrderInPaise)}</td>

                        <td>{p.maxUses}</td>

                        <td>

                          <StatusBadge status={p.isActive ? "active" : "inactive"} />

                        </td>

                        <td>

                          <button

                            type="button"

                            className="btn btn-ghost btn-sm"

                            onClick={() => void deletePromo(p.id)}

                          >

                            Delete

                          </button>

                        </td>

                      </tr>

                    ))}

                    {promos.length === 0 ? (

                      <tr>

                        <td colSpan={7} className="empty">

                          No promo codes configured.

                        </td>

                      </tr>

                    ) : null}

                  </tbody>

                </table>

              </div>

              <form className="withdraw-form" style={{ marginTop: "1rem" }} onSubmit={(e) => void onCreatePromo(e)}>

                <div className="grid-2">

                  <div className="field">

                    <label htmlFor="pm-code">Code</label>

                    <input

                      id="pm-code"

                      required

                      minLength={2}

                      value={promoForm.code}

                      onChange={(e) => setPromoForm((f) => ({ ...f, code: e.target.value }))}

                    />

                  </div>

                  <div className="field">

                    <label htmlFor="pm-type">Discount type</label>

                    <select

                      id="pm-type"

                      value={promoForm.discountType}

                      onChange={(e) => setPromoForm((f) => ({ ...f, discountType: e.target.value }))}

                    >

                      <option value="percentage">Percentage</option>

                      <option value="flat">Flat</option>

                    </select>

                  </div>

                </div>

                <div className="field">

                  <label htmlFor="pm-desc">Description (optional)</label>

                  <input

                    id="pm-desc"

                    value={promoForm.description}

                    onChange={(e) => setPromoForm((f) => ({ ...f, description: e.target.value }))}

                  />

                </div>

                <div className="grid-2">

                  <div className="field">

                    <label htmlFor="pm-value">Discount value (bps or paise)</label>

                    <input

                      id="pm-value"

                      type="number"

                      min={0}

                      required

                      value={promoForm.discountValue}

                      onChange={(e) => setPromoForm((f) => ({ ...f, discountValue: e.target.value }))}

                    />

                  </div>

                  <div className="field">

                    <label htmlFor="pm-min">Min order (INR)</label>

                    <input

                      id="pm-min"

                      type="number"

                      min={0}

                      value={promoForm.minOrderInr}

                      onChange={(e) => setPromoForm((f) => ({ ...f, minOrderInr: e.target.value }))}

                    />

                  </div>

                </div>

                <div className="field">

                  <label htmlFor="pm-max">Max uses</label>

                  <input

                    id="pm-max"

                    type="number"

                    min={0}

                    value={promoForm.maxUses}

                    onChange={(e) => setPromoForm((f) => ({ ...f, maxUses: e.target.value }))}

                  />

                </div>

                <button type="submit" className="btn btn-primary btn-sm" disabled={savingSettings}>

                  Add promo

                </button>

              </form>

            </section>

          </div>

        ) : null}



        {currentTotalPages > 1 ? (

          <Pagination page={page} totalPages={currentTotalPages} total={currentTotal} onPageChange={setPage} />

        ) : null}

      </section>

    </>

  );

}

