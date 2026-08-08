import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../api";
import { useToast } from "../components/Toast";

export function PaymentReturnPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();
  const bookingId = params.get("booking_id") ?? "";
  const tankerOrderId = params.get("tanker_order_id") ?? "";
  const orderId = params.get("order_id") ?? "";
  const [status, setStatus] = useState<"working" | "ok" | "fail">("working");
  const [message, setMessage] = useState("Verifying Cashfree payment…");

  useEffect(() => {
    if (!bookingId && !tankerOrderId) {
      setStatus("fail");
      setMessage("Missing booking or tanker order id in return URL");
      return;
    }
    void (async () => {
      try {
        if (tankerOrderId) {
          await api.post("/payments/orders/verify", {
            tankerOrderId,
            orderId: orderId || undefined,
          });
          await api.post(`/tanker/orders/${tankerOrderId}/confirm-payment`, {
            orderId: orderId || undefined,
          });
          setStatus("ok");
          setMessage("Payment successful. Your tanker order is confirmed.");
          toast.success("Payment successful");
          window.setTimeout(() => navigate("/app/tanker"), 1500);
        } else {
          await api.post("/payments/orders/verify", {
            bookingId,
            orderId: orderId || undefined,
          });
          await api.post(`/parking/bookings/${bookingId}/confirm-payment`, {
            orderId: orderId || undefined,
          });
          setStatus("ok");
          setMessage("Payment successful. Your booking is confirmed.");
          toast.success("Payment successful");
          window.setTimeout(() => navigate("/app/customer/bookings"), 1500);
        }
      } catch (err) {
        setStatus("fail");
        setMessage(err instanceof Error ? err.message : "Payment verification failed");
        toast.error(err instanceof Error ? err.message : "Payment verification failed");
      }
    })();
  }, [bookingId, tankerOrderId, orderId, navigate, toast]);

  return (
    <>
      <div className="topbar">
        <div>
          <h2>Payment return</h2>
          <p>Cashfree sandbox checkout callback</p>
        </div>
      </div>
      <section className="panel" style={{ padding: "1.25rem" }}>
        <p className={status === "fail" ? "error" : "status"}>{message}</p>
        {status === "fail" ? (
          <div style={{ display: "flex", gap: "0.5rem", marginTop: "1rem" }}>
            {tankerOrderId ? (
              <Link className="btn btn-primary" to="/app/tanker">
                My tanker orders
              </Link>
            ) : (
              <Link className="btn btn-primary" to="/app/customer/bookings">
                My bookings
              </Link>
            )}
            {!tankerOrderId ? (
              <Link className="btn btn-ghost" to="/app/customer/search">
                Search again
              </Link>
            ) : null}
          </div>
        ) : null}
      </section>
    </>
  );
}
