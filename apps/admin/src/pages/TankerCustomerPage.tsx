import { FormEvent, useCallback, useEffect, useRef, useState } from "react";

import { api, formatInrFromPaise, qs } from "../api";

import { useAuth } from "../auth/AuthContext";

import { Pagination } from "../components/Pagination";

import { StatusBadge } from "../components/StatusBadge";

import { useToast } from "../components/Toast";

import { openCashfreeCheckout } from "../lib/cashfree";

import { createTankerSocket } from "../lib/tankerSocket";

import type { Paginated } from "../types";



type Supplier = {

  id: string;

  fullName: string;

  city: string;

  pinCode: string;

  isOnline: boolean;

  address: string;

};



type NearbyItem = {

  supplier: Supplier;

  distanceKm: number;

};



type TankerRequest = {

  id: string;

  supplierId: string | null;

  waterType: string;

  quantityLitres: number;

  deliveryAddress: string;

  comments: string | null;

  status: string;

  createdAt: string;

};



type TankerOrder = {

  id: string;

  waterType: string;

  capacityLitres: number;

  vehicleNumber: string | null;

  driverName: string | null;

  driverMobile: string | null;

  amountInPaise: number;

  totalAmountInPaise?: number;

  platformFeeInPaise?: number;

  taxInPaise?: number;

  discountInPaise?: number;

  driverLatitude?: number | null;

  driverLongitude?: number | null;

  driverLocationUpdatedAt?: string | null;

  deliveryAddress: string;

  status: string;

  paymentStatus: string;

  deliveryOtp: string | null;

  createdAt: string;

};



type DriverLocation = {

  latitude: number | null;

  longitude: number | null;

  updatedAt: string | null;

};



const emptyForm = {

  waterType: "drinking",

  quantityLitres: "5000",

  deliveryAddress: "",

  comments: "",

  supplierId: "",

};



function isActiveOrder(status: string) {

  return !["delivered", "cancelled"].includes(status);

}



export function TankerCustomerPage() {

  const toast = useToast();

  const { user } = useAuth();

  const [form, setForm] = useState(emptyForm);

  const [nearby, setNearby] = useState<NearbyItem[]>([]);

  const [onlineSuppliers, setOnlineSuppliers] = useState<Supplier[]>([]);

  const [geoHint, setGeoHint] = useState("");

  const [submitting, setSubmitting] = useState(false);

  const [payingId, setPayingId] = useState<string | null>(null);

  const [trackingOrderId, setTrackingOrderId] = useState<string | null>(null);

  const [driverLocation, setDriverLocation] = useState<DriverLocation | null>(null);

  const [reqPage, setReqPage] = useState(1);

  const [ordPage, setOrdPage] = useState(1);

  const [requests, setRequests] = useState<Paginated<TankerRequest> | null>(null);

  const [orders, setOrders] = useState<Paginated<TankerOrder> | null>(null);

  const socketRef = useRef<ReturnType<typeof createTankerSocket> | null>(null);



  const loadLists = useCallback(async () => {

    if (!user?.id) return;

    try {

      const [reqs, ords] = await Promise.all([

        api.get<Paginated<TankerRequest>>(

          `/tanker/requests${qs({ page: reqPage, limit: 8, customerUserId: user.id })}`,

        ),

        api.get<Paginated<TankerOrder>>(

          `/tanker/orders${qs({ page: ordPage, limit: 8, customerUserId: user.id })}`,

        ),

      ]);

      setRequests(reqs);

      setOrders(ords);

    } catch (err) {

      toast.error(err instanceof Error ? err.message : "Failed to load tanker activity");

    }

  }, [ordPage, reqPage, toast, user?.id]);



  const loadSuppliers = useCallback(async () => {

    const fallback = async () => {

      const list = await api.get<Paginated<Supplier>>(`/tanker/suppliers${qs({ page: 1, limit: 20, online: "true" })}`);

      setOnlineSuppliers(list.items);

      setNearby([]);

      setGeoHint("Showing online suppliers (location unavailable).");

    };



    if (!navigator.geolocation) {

      try {

        await fallback();

      } catch (err) {

        toast.error(err instanceof Error ? err.message : "Failed to load suppliers");

      }

      return;

    }



    navigator.geolocation.getCurrentPosition(

      async (pos) => {

        try {

          const res = await api.get<{ items: NearbyItem[] }>(

            `/tanker/suppliers/nearby${qs({

              lat: pos.coords.latitude,

              lng: pos.coords.longitude,

            })}`,

          );

          setNearby(res.items);

          setOnlineSuppliers([]);

          setGeoHint(

            res.items.length

              ? `Found ${res.items.length} supplier(s) nearby.`

              : "No nearby suppliers — pick any online supplier or leave blank.",

          );

          if (res.items.length === 0) {

            const list = await api.get<Paginated<Supplier>>(

              `/tanker/suppliers${qs({ page: 1, limit: 20, online: "true" })}`,

            );

            setOnlineSuppliers(list.items);

          }

        } catch (err) {

          toast.error(err instanceof Error ? err.message : "Failed to load nearby suppliers");

          try {

            await fallback();

          } catch {

            /* already toasted */

          }

        }

      },

      async () => {

        try {

          await fallback();

        } catch (err) {

          toast.error(err instanceof Error ? err.message : "Failed to load suppliers");

        }

      },

      { timeout: 8000 },

    );

  }, [toast]);



  useEffect(() => {

    void loadSuppliers();

  }, [loadSuppliers]);



  useEffect(() => {

    void loadLists();

  }, [loadLists]);



  useEffect(() => {

    if (!trackingOrderId) return;



    const socket = createTankerSocket();

    socketRef.current = socket;

    socket.connect();

    socket.emit("trackDriver", { orderId: trackingOrderId });



    socket.on("driverLocation", (data: { latitude?: number; longitude?: number; updatedAt?: string }) => {

      setDriverLocation({

        latitude: data.latitude ?? null,

        longitude: data.longitude ?? null,

        updatedAt: data.updatedAt ?? null,

      });

    });



    const pollLocation = async () => {

      try {

        const loc = await api.get<DriverLocation & { orderId: string }>(

          `/tanker/orders/${trackingOrderId}/location`,

        );

        setDriverLocation({

          latitude: loc.latitude,

          longitude: loc.longitude,

          updatedAt: loc.updatedAt,

        });

      } catch {

        /* polling fallback — ignore transient errors */

      }

    };



    void pollLocation();

    const interval = setInterval(() => void pollLocation(), 10000);



    return () => {

      socket.emit("stopTracking", { orderId: trackingOrderId });

      socket.disconnect();

      socketRef.current = null;

      clearInterval(interval);

    };

  }, [trackingOrderId]);



  function stopTracking() {

    setTrackingOrderId(null);

    setDriverLocation(null);

  }



  async function payOrder(id: string) {

    setPayingId(id);

    try {

      const order = await api.post<{

        orderId: string;

        paymentSessionId: string;

        env: "sandbox" | "production";

      }>("/payments/orders", { tankerOrderId: id });



      if (!order.paymentSessionId) {

        throw new Error("Cashfree did not return a payment session");

      }



      const checkout = await openCashfreeCheckout({

        paymentSessionId: order.paymentSessionId,

        mode: order.env === "production" ? "production" : "sandbox",

      });

      if (checkout.error) {

        throw new Error(checkout.error.message || "Cashfree checkout cancelled");

      }



      await api.post("/payments/orders/verify", { tankerOrderId: id, orderId: order.orderId });

      await api.post(`/tanker/orders/${id}/confirm-payment`, { orderId: order.orderId });

      toast.success("Payment successful");

      await loadLists();

    } catch (err) {

      toast.error(err instanceof Error ? err.message : "Payment failed");

    } finally {

      setPayingId(null);

    }

  }



  async function onSubmit(e: FormEvent) {

    e.preventDefault();

    const qty = Number(form.quantityLitres);

    if (!Number.isFinite(qty) || qty <= 0) {

      toast.error("Enter a valid quantity in litres");

      return;

    }

    setSubmitting(true);

    try {

      await api.post("/tanker/requests", {

        waterType: form.waterType.trim() || "drinking",

        quantityLitres: Math.round(qty),

        deliveryAddress: form.deliveryAddress.trim(),

        comments: form.comments.trim() || null,

        supplierId: form.supplierId || undefined,

      });

      toast.success("Water tanker request submitted");

      setForm(emptyForm);

      setReqPage(1);

      await loadLists();

    } catch (err) {

      toast.error(err instanceof Error ? err.message : "Failed to create request");

    } finally {

      setSubmitting(false);

    }

  }



  const supplierOptions: Array<{ id: string; label: string }> = nearby.length

    ? nearby.map((n) => ({

        id: n.supplier.id,

        label: `${n.supplier.fullName} · ${n.distanceKm.toFixed(1)} km · ${n.supplier.city}`,

      }))

    : onlineSuppliers.map((s) => ({

        id: s.id,

        label: `${s.fullName} · ${s.city} · ${s.pinCode}`,

      }));



  return (

    <>

      <div className="topbar">

        <div>

          <h2>Water tanker</h2>

          <p>Request drinking or bore water delivery from nearby suppliers.</p>

        </div>

        <button type="button" className="btn btn-ghost" onClick={() => void loadLists()}>

          Refresh

        </button>

      </div>



      <section className="panel">

        <div className="panel-head">

          <h3>New request</h3>

        </div>

        <div className="panel-body">

          {geoHint ? <p className="withdraw-hint">{geoHint}</p> : null}

          <form className="withdraw-form" onSubmit={(e) => void onSubmit(e)}>

            <div className="grid-2">

              <div className="field">

                <label htmlFor="t-water">Water type</label>

                <select

                  id="t-water"

                  value={form.waterType}

                  onChange={(e) => setForm((f) => ({ ...f, waterType: e.target.value }))}

                >

                  <option value="drinking">Drinking</option>

                  <option value="bore">Bore</option>

                  <option value="raw">Raw</option>

                </select>

              </div>

              <div className="field">

                <label htmlFor="t-qty">Quantity (litres)</label>

                <input

                  id="t-qty"

                  type="number"

                  min={100}

                  step={100}

                  required

                  value={form.quantityLitres}

                  onChange={(e) => setForm((f) => ({ ...f, quantityLitres: e.target.value }))}

                />

              </div>

            </div>

            <div className="field">

              <label htmlFor="t-addr">Delivery address</label>

              <input

                id="t-addr"

                required

                minLength={3}

                value={form.deliveryAddress}

                onChange={(e) => setForm((f) => ({ ...f, deliveryAddress: e.target.value }))}

              />

            </div>

            <div className="field">

              <label htmlFor="t-supplier">Preferred supplier (optional)</label>

              <select

                id="t-supplier"

                value={form.supplierId}

                onChange={(e) => setForm((f) => ({ ...f, supplierId: e.target.value }))}

              >

                <option value="">Any available</option>

                {supplierOptions.map((s) => (

                  <option key={s.id} value={s.id}>

                    {s.label}

                  </option>

                ))}

              </select>

            </div>

            <div className="field">

              <label htmlFor="t-comments">Comments (optional)</label>

              <input

                id="t-comments"

                value={form.comments}

                onChange={(e) => setForm((f) => ({ ...f, comments: e.target.value }))}

              />

            </div>

            <button type="submit" className="btn btn-primary" disabled={submitting}>

              {submitting ? "Submitting…" : "Request tanker"}

            </button>

          </form>

        </div>

      </section>



      {onlineSuppliers.length > 0 && nearby.length === 0 ? (

        <section className="panel">

          <div className="panel-head">

            <h3>Browse online suppliers</h3>

            <button type="button" className="btn btn-ghost btn-sm" onClick={() => void loadSuppliers()}>

              Refresh

            </button>

          </div>

          <div className="table-wrap">

            <table className="data">

              <thead>

                <tr>

                  <th>Supplier</th>

                  <th>Location</th>

                  <th>Status</th>

                </tr>

              </thead>

              <tbody>

                {onlineSuppliers.map((s) => (

                  <tr key={s.id}>

                    <td>

                      <strong>{s.fullName}</strong>

                      <div style={{ color: "var(--muted)", fontSize: "0.85rem" }}>{s.address}</div>

                    </td>

                    <td>

                      {s.city} · {s.pinCode}

                    </td>

                    <td>

                      <StatusBadge status={s.isOnline ? "active" : "inactive"} />

                    </td>

                  </tr>

                ))}

              </tbody>

            </table>

          </div>

        </section>

      ) : null}



      <section className="panel">

        <div className="panel-head">

          <h3>My requests</h3>

        </div>

        <div className="table-wrap">

          <table className="data">

            <thead>

              <tr>

                <th>When</th>

                <th>Water</th>

                <th>Address</th>

                <th>Status</th>

              </tr>

            </thead>

            <tbody>

              {(requests?.items ?? []).map((r) => (

                <tr key={r.id}>

                  <td>{new Date(r.createdAt).toLocaleString("en-IN")}</td>

                  <td>

                    {r.waterType} · {r.quantityLitres.toLocaleString("en-IN")} L

                  </td>

                  <td>{r.deliveryAddress}</td>

                  <td>

                    <StatusBadge status={r.status} />

                  </td>

                </tr>

              ))}

              {(requests?.items.length ?? 0) === 0 ? (

                <tr>

                  <td colSpan={4} className="empty">

                    No requests yet.

                  </td>

                </tr>

              ) : null}

            </tbody>

          </table>

        </div>

        {(requests?.totalPages ?? 0) > 1 ? (

          <Pagination

            page={reqPage}

            totalPages={requests!.totalPages}

            total={requests!.total}

            onPageChange={setReqPage}

          />

        ) : null}

      </section>



      <section className="panel">

        <div className="panel-head">

          <h3>My orders</h3>

        </div>

        <div className="table-wrap">

          <table className="data">

            <thead>

              <tr>

                <th>When</th>

                <th>Delivery</th>

                <th>Driver / vehicle</th>

                <th>Amount</th>

                <th>OTP</th>

                <th>Status</th>

                <th>Action</th>

              </tr>

            </thead>

            <tbody>

              {(orders?.items ?? []).map((o) => (

                <tr key={o.id}>

                  <td>{new Date(o.createdAt).toLocaleString("en-IN")}</td>

                  <td>

                    {o.deliveryAddress}

                    <div style={{ color: "var(--muted)", fontSize: "0.85rem" }}>

                      {o.waterType} · {o.capacityLitres.toLocaleString("en-IN")} L

                    </div>

                  </td>

                  <td>

                    {o.driverName ?? "—"}

                    <div style={{ color: "var(--muted)", fontSize: "0.85rem" }}>

                      {o.vehicleNumber ?? "—"}

                      {o.driverMobile ? ` · ${o.driverMobile}` : ""}

                    </div>

                  </td>

                  <td>

                    {formatInrFromPaise(o.totalAmountInPaise ?? o.amountInPaise)}

                    <div style={{ color: "var(--muted)", fontSize: "0.85rem" }}>{o.paymentStatus}</div>

                  </td>

                  <td>

                    {o.paymentStatus === "paid" &&

                    o.deliveryOtp &&

                    isActiveOrder(o.status) ? (

                      <strong>{o.deliveryOtp}</strong>

                    ) : o.paymentStatus !== "paid" && isActiveOrder(o.status) ? (

                      <span style={{ color: "var(--muted)" }}>Pay first</span>

                    ) : (

                      "—"

                    )}

                  </td>

                  <td>

                    <StatusBadge status={o.status} />

                  </td>

                  <td>

                    {o.paymentStatus !== "paid" && isActiveOrder(o.status) ? (

                      <button

                        type="button"

                        className="btn btn-primary btn-sm"

                        disabled={payingId === o.id}

                        onClick={() => void payOrder(o.id)}

                      >

                        {payingId === o.id ? "Paying…" : "Pay"}

                      </button>

                    ) : o.paymentStatus === "paid" && isActiveOrder(o.status) ? (

                      <button

                        type="button"

                        className="btn btn-ghost btn-sm"

                        onClick={() => {

                          setDriverLocation(null);

                          setTrackingOrderId(o.id);

                        }}

                      >

                        Track

                      </button>

                    ) : (

                      "—"

                    )}

                  </td>

                </tr>

              ))}

              {(orders?.items.length ?? 0) === 0 ? (

                <tr>

                  <td colSpan={7} className="empty">

                    No orders yet. Accepted requests become orders.

                  </td>

                </tr>

              ) : null}

            </tbody>

          </table>

        </div>

        {(orders?.totalPages ?? 0) > 1 ? (

          <Pagination

            page={ordPage}

            totalPages={orders!.totalPages}

            total={orders!.total}

            onPageChange={setOrdPage}

          />

        ) : null}

      </section>



      {trackingOrderId ? (

        <section className="panel">

          <div className="panel-head">

            <h3>Track driver</h3>

            <button type="button" className="btn btn-ghost btn-sm" onClick={stopTracking}>

              Stop tracking

            </button>

          </div>

          <div className="panel-body">

            <p style={{ marginTop: 0 }}>

              Order <code>{trackingOrderId.slice(0, 8)}…</code>

            </p>

            {driverLocation?.latitude != null && driverLocation.longitude != null ? (

              <dl className="detail-list">

                <div>

                  <dt>Latitude</dt>

                  <dd>{driverLocation.latitude.toFixed(6)}</dd>

                </div>

                <div>

                  <dt>Longitude</dt>

                  <dd>{driverLocation.longitude.toFixed(6)}</dd>

                </div>

                <div>

                  <dt>Updated</dt>

                  <dd>

                    {driverLocation.updatedAt

                      ? new Date(driverLocation.updatedAt).toLocaleString("en-IN")

                      : "—"}

                  </dd>

                </div>

              </dl>

            ) : (

              <p className="withdraw-hint">Waiting for driver location…</p>

            )}

          </div>

        </section>

      ) : null}

    </>

  );

}

