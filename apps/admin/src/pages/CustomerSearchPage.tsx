import { FormEvent, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, formatInrFromPaise, qs } from "../api";
import { Modal } from "../components/Modal";
import { StatusBadge } from "../components/StatusBadge";
import {
  TermsAcceptCheckbox,
  recordTermsAcceptance,
} from "../components/TermsAcceptCheckbox";
import { useToast } from "../components/Toast";
import { useDebouncedValue } from "../hooks/useDebouncedValue";
import { openCashfreeCheckout } from "../lib/cashfree";
import {
  DEFAULT_PARKING_VEHICLE_TYPES,
  labelParkingVehicleType,
} from "../lib/parkingVehicleTypes";

type Listing = {
  id: string;
  apartmentName: string;
  city: string;
  addressLine?: string;
  pinCode?: string;
  parkingSlotNumber: string;
  parkingType: string;
  vehicleTypesAllowed?: string[];
  priceInPaise: number;
  rentType: string;
  status: string;
  availabilityStartTime?: string;
  availabilityEndTime?: string;
  availableDays?: string;
};

function formatAvailableDays(days?: string) {
  if (days === "weekdays") return "Weekdays";
  if (days === "weekends") return "Weekends";
  return "All days";
}

type Quote = {
  listingId: string;
  durationMinutes: number;
  baseAmountInPaise: number;
  platformFeeInPaise: number;
  taxInPaise: number;
  totalAmountInPaise: number;
};

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function toLocalInputValue(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function toIsoFromLocal(value: string) {
  return new Date(value).toISOString();
}

export function CustomerSearchPage() {
  const toast = useToast();
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const search = useDebouncedValue(q.trim(), 350);
  const defaultStart = useMemo(() => {
    const d = new Date();
    d.setMinutes(0, 0, 0);
    d.setHours(d.getHours() + 1);
    return toLocalInputValue(d);
  }, []);
  const defaultEnd = useMemo(() => {
    const d = new Date();
    d.setMinutes(0, 0, 0);
    d.setHours(d.getHours() + 3);
    return toLocalInputValue(d);
  }, []);
  const [startAt, setStartAt] = useState(defaultStart);
  const [endAt, setEndAt] = useState(defaultEnd);
  const [items, setItems] = useState<Listing[]>([]);
  const [selected, setSelected] = useState<Listing | null>(null);
  const [vehicleNumber, setVehicleNumber] = useState("");
  const [vehicleType, setVehicleType] = useState("");
  const [quote, setQuote] = useState<Quote | null>(null);
  const [step, setStep] = useState<"details" | "payment">("details");
  const [bookingId, setBookingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [termsId, setTermsId] = useState<number | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const res = await api.get<{ items: Listing[] }>(
          `/parking/search${qs({
            q: search || undefined,
            limit: 20,
            startAt: startAt ? toIsoFromLocal(startAt) : undefined,
            endAt: endAt ? toIsoFromLocal(endAt) : undefined,
          })}`,
        );
        setItems(res.items);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Search failed");
      }
    })();
  }, [search, startAt, endAt, toast]);

  function openBook(item: Listing) {
    setSelected(item);
    setQuote(null);
    setBookingId(null);
    setStep("details");
    setVehicleNumber("");
    const allowed = item.vehicleTypesAllowed?.length
      ? item.vehicleTypesAllowed
      : [...DEFAULT_PARKING_VEHICLE_TYPES];
    setVehicleType(allowed[0] ?? "");
  }

  async function loadQuote() {
    if (!selected) return;
    if (new Date(endAt) <= new Date(startAt)) {
      toast.error("Check-out must be after check-in");
      return;
    }
    setLoading(true);
    try {
      const res = await api.post<Quote>("/parking/bookings/quote", {
        listingId: selected.id,
        startAt: toIsoFromLocal(startAt),
        endAt: toIsoFromLocal(endAt),
      });
      setQuote(res);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Quote failed");
    } finally {
      setLoading(false);
    }
  }

  async function createBookingAndPay(e: FormEvent) {
    e.preventDefault();
    if (!selected) return;
    if (!termsAccepted) {
      toast.error("Please accept the Terms & Conditions to book");
      return;
    }
    if (new Date(endAt) <= new Date(startAt)) {
      toast.error("Check-out must be after check-in");
      return;
    }
    setLoading(true);
    try {
      if (!quote) {
        const qRes = await api.post<Quote>("/parking/bookings/quote", {
          listingId: selected.id,
          startAt: toIsoFromLocal(startAt),
          endAt: toIsoFromLocal(endAt),
        });
        setQuote(qRes);
      }

      const created = await api.post<{ booking: { id: string; totalAmountInPaise: number } }>(
        "/parking/bookings/v2",
        {
          listingId: selected.id,
          startAt: toIsoFromLocal(startAt),
          endAt: toIsoFromLocal(endAt),
          vehicleNumber: vehicleNumber.trim() || undefined,
          vehicleType: vehicleType || undefined,
        },
      );
      if (termsId) {
        await recordTermsAcceptance(termsId, "booking", Number(created.booking.id)).catch(
          () => undefined,
        );
      }
      setBookingId(created.booking.id);
      setStep("payment");
      toast.success("Booking created — complete payment");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create booking");
    } finally {
      setLoading(false);
    }
  }

  async function payNow() {
    if (!bookingId) return;
    setLoading(true);
    try {
      const order = await api.post<{
        orderId: string;
        paymentSessionId: string;
        env: "sandbox" | "production";
      }>("/payments/orders", { bookingId });

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

      await api.post("/payments/orders/verify", {
        bookingId,
        orderId: order.orderId,
      });
      await api.post(`/parking/bookings/${bookingId}/confirm-payment`, {
        orderId: order.orderId,
      });

      toast.success("Payment successful via Cashfree. Slot confirmed.");
      setSelected(null);
      navigate("/app/customer/bookings");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Payment failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <div className="topbar">
        <div>
          <h2>Search parking</h2>
          <p>
            Choose check-in / check-out. Only slots free in that window and matching the owner&apos;s
            available hours are shown.
          </p>
        </div>
      </div>

      <section className="panel">
        <div className="panel-head">
          <h3>Available slots</h3>
          <div className="toolbar" style={{ flexWrap: "wrap", gap: "0.5rem" }}>
            <input
              className="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Apartment, city…"
            />
            <label className="field" style={{ margin: 0 }}>
              <span style={{ fontSize: "0.75rem" }}>Check-in</span>
              <input type="datetime-local" value={startAt} onChange={(e) => setStartAt(e.target.value)} />
            </label>
            <label className="field" style={{ margin: 0 }}>
              <span style={{ fontSize: "0.75rem" }}>Check-out</span>
              <input type="datetime-local" value={endAt} onChange={(e) => setEndAt(e.target.value)} />
            </label>
          </div>
        </div>
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Apartment</th>
                <th>Slot</th>
                <th>Owner hours</th>
                <th>Price</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td>
                    <strong>{item.apartmentName}</strong>
                    <div style={{ color: "var(--muted)", fontSize: "0.85rem" }}>
                      {item.city}
                      {item.addressLine ? ` · ${item.addressLine}` : ""}
                    </div>
                  </td>
                  <td>
                    {item.parkingSlotNumber} · {item.parkingType}
                    <div style={{ color: "var(--muted)", fontSize: "0.85rem" }}>
                      {(item.vehicleTypesAllowed?.length
                        ? item.vehicleTypesAllowed
                        : DEFAULT_PARKING_VEHICLE_TYPES
                      )
                        .map(labelParkingVehicleType)
                        .join(", ")}
                    </div>
                  </td>
                  <td>
                    {item.availabilityStartTime && item.availabilityEndTime
                      ? `${item.availabilityStartTime}–${item.availabilityEndTime}`
                      : "—"}
                    <div style={{ color: "var(--muted)", fontSize: "0.85rem" }}>
                      {formatAvailableDays(item.availableDays)}
                    </div>
                  </td>
                  <td>
                    {formatInrFromPaise(item.priceInPaise)}
                    <div style={{ color: "var(--muted)", fontSize: "0.85rem" }}>{item.rentType}</div>
                  </td>
                  <td>
                    <StatusBadge status={item.status} />
                  </td>
                  <td>
                    <button type="button" className="btn btn-primary btn-sm" onClick={() => openBook(item)}>
                      Select
                    </button>
                  </td>
                </tr>
              ))}
              {items.length === 0 ? (
                <tr>
                  <td colSpan={6} className="empty">
                    No available listings for this check-in / check-out window (or outside owner hours).
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      {selected ? (
        <Modal
          title={step === "payment" ? "Payment" : "Book parking"}
          onClose={() => setSelected(null)}
          footer={
            step === "payment" ? (
              <>
                <button type="button" className="btn btn-ghost" onClick={() => setSelected(null)}>
                  Cancel
                </button>
                <button type="button" className="btn btn-primary" disabled={loading} onClick={() => void payNow()}>
                  {loading ? "Opening Cashfree…" : "Pay with Cashfree"}
                </button>
              </>
            ) : (
              <>
                <button type="button" className="btn btn-ghost" onClick={() => setSelected(null)}>
                  Cancel
                </button>
                <button type="button" className="btn btn-ghost" disabled={loading} onClick={() => void loadQuote()}>
                  Get quote
                </button>
                <button type="submit" form="book-form" className="btn btn-primary" disabled={loading}>
                  {loading ? "Creating…" : "Continue to payment"}
                </button>
              </>
            )
          }
        >
          {step === "details" ? (
            <form id="book-form" onSubmit={(e) => void createBookingAndPay(e)}>
              <p>
                <strong>{selected.apartmentName}</strong> · Slot {selected.parkingSlotNumber}
                <br />
                <span style={{ color: "var(--muted)" }}>
                  {selected.addressLine ?? selected.city} · {selected.rentType}{" "}
                  {formatInrFromPaise(selected.priceInPaise)}
                </span>
                {selected.availabilityStartTime && selected.availabilityEndTime ? (
                  <>
                    <br />
                    <span style={{ color: "var(--muted)", fontSize: "0.9rem" }}>
                      Owner available {selected.availabilityStartTime}–{selected.availabilityEndTime} ·{" "}
                      {formatAvailableDays(selected.availableDays)}
                    </span>
                  </>
                ) : null}
              </p>
              <div className="grid-2">
                <div className="field">
                  <label>Check-in</label>
                  <input
                    type="datetime-local"
                    required
                    value={startAt}
                    onChange={(e) => {
                      setStartAt(e.target.value);
                      setQuote(null);
                    }}
                  />
                </div>
                <div className="field">
                  <label>Check-out</label>
                  <input
                    type="datetime-local"
                    required
                    value={endAt}
                    onChange={(e) => {
                      setEndAt(e.target.value);
                      setQuote(null);
                    }}
                  />
                </div>
              </div>
              <div className="grid-2">
                <div className="field">
                  <label>Vehicle type</label>
                  <select
                    required
                    value={vehicleType}
                    onChange={(e) => setVehicleType(e.target.value)}
                  >
                    <option value="" disabled>
                      Select type
                    </option>
                    {(selected.vehicleTypesAllowed?.length
                      ? selected.vehicleTypesAllowed
                      : [...DEFAULT_PARKING_VEHICLE_TYPES]
                    ).map((t) => (
                      <option key={t} value={t}>
                        {labelParkingVehicleType(t)}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label>Vehicle number (optional)</label>
                  <input
                    value={vehicleNumber}
                    onChange={(e) => setVehicleNumber(e.target.value.toUpperCase())}
                    placeholder="TS09AB1234"
                  />
                </div>
              </div>
              {quote ? (
                <div className="detail-grid" style={{ marginTop: "0.75rem" }}>
                  <div>
                    <strong>Duration</strong>
                    <p>{quote.durationMinutes} minutes</p>
                  </div>
                  <div>
                    <strong>Base</strong>
                    <p>{formatInrFromPaise(quote.baseAmountInPaise)}</p>
                  </div>
                  <div>
                    <strong>Platform fee</strong>
                    <p>{formatInrFromPaise(quote.platformFeeInPaise)}</p>
                  </div>
                  <div>
                    <strong>Total</strong>
                    <p>{formatInrFromPaise(quote.totalAmountInPaise)}</p>
                  </div>
                </div>
              ) : (
                <p className="file-upload-hint">Get a quote or continue — total is calculated before payment.</p>
              )}
              <TermsAcceptCheckbox
                module="parking"
                audience="customer"
                checked={termsAccepted}
                onCheckedChange={setTermsAccepted}
                onTermsLoaded={(t) => setTermsId(t?.id ?? null)}
              />
            </form>
          ) : (
            <div>
              <p>
                Pay securely with <strong>Cashfree</strong> (sandbox/test mode). Amount is credited to the
                platform wallet after successful payment.
              </p>
              <div className="detail-grid">
                <div>
                  <strong>Booking</strong>
                  <p className="mono">{bookingId}</p>
                </div>
                <div>
                  <strong>Amount</strong>
                  <p>{quote ? formatInrFromPaise(quote.totalAmountInPaise) : "—"}</p>
                </div>
                <div>
                  <strong>Slot</strong>
                  <p>
                    {selected.apartmentName} · {selected.parkingSlotNumber}
                  </p>
                </div>
                <div>
                  <strong>Window</strong>
                  <p>
                    {new Date(startAt).toLocaleString("en-IN")} → {new Date(endAt).toLocaleString("en-IN")}
                  </p>
                </div>
              </div>
            </div>
          )}
        </Modal>
      ) : null}
    </>
  );
}
