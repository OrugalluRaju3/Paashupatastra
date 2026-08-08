import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

export function OwnerHomePage() {
  const { user } = useAuth();
  return (
    <>
      <div className="topbar">
        <div>
          <h2>Owner home</h2>
          <p>Register parking and track verification status.</p>
        </div>
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          <Link className="btn btn-ghost" to="/app/owner/wallet">
            Wallet
          </Link>
          <Link className="btn btn-ghost" to="/app/owner/bookings">
            Bookings
          </Link>
          <Link className="btn btn-primary" to="/app/owner/listings">
            My applications
          </Link>
        </div>
      </div>
      <section className="panel">
        <div className="panel-head">
          <h3>Owner guide</h3>
        </div>
        <div style={{ padding: "1rem" }}>
          <ol style={{ margin: 0, paddingLeft: "1.2rem", display: "grid", gap: "0.45rem" }}>
            <li>Register parking under My applications and complete verification.</li>
            <li>When a customer pays, you get minimal customer details + a check-in OTP.</li>
            <li>Share the OTP only when they arrive so they can check in.</li>
            <li>
              If a customer never checks in after their start time, they get reminders every 5
              minutes until check-out time; then the booking auto-completes and payout (minus
              platform fee) credits your wallet.
            </li>
            <li>After normal check-out, payout (minus platform fee) credits your wallet.</li>
            <li>
              If a customer misses check-out, you both get reminders every 5 minutes.
            </li>
            <li>
              If check-out is overdue by more than 1 hour, both the customer&apos;s account and your
              account are set inactive (with reason). Login is blocked until a Parking Super Admin
              reactivates you — you will get email and in-app notifications.
            </li>
          </ol>
          <p style={{ marginTop: "1rem" }}>
            <strong>Name:</strong> {user?.name ?? "—"} · <strong>Mobile:</strong> {user?.phone}
          </p>
        </div>
      </section>
    </>
  );
}
