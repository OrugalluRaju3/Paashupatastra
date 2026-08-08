import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

export function CustomerHomePage() {
  const { user } = useAuth();
  return (
    <>
      <div className="topbar">
        <div>
          <h2>Welcome{user?.name ? `, ${user.name}` : ""}</h2>
          <p>Search and book verified parking near you.</p>
        </div>
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          <Link className="btn btn-ghost" to="/app/customer/wallet">
            Wallet
          </Link>
          <Link className="btn btn-ghost" to="/app/customer/bookings">
            My bookings
          </Link>
          <Link className="btn btn-primary" to="/app/customer/search">
            Search parking
          </Link>
        </div>
      </div>
      <section className="panel">
        <div className="panel-head">
          <h3>How booking works</h3>
        </div>
        <div style={{ padding: "1rem" }}>
          <ol style={{ margin: 0, paddingLeft: "1.2rem", display: "grid", gap: "0.45rem" }}>
            <li>Search an approved slot and pick check-in / check-out time.</li>
            <li>Pay — amount goes to the platform wallet and the slot is held for you.</li>
            <li>On arrival, get the OTP from the owner and check in.</li>
            <li>
              If check-in time has started but you never check in, you get reminders every 5 minutes
              until check-out time. Then the booking is marked completed and payment goes to the
              owner.
            </li>
            <li>You get a reminder 5 minutes before check-out; then check out in the app.</li>
            <li>
              If you miss check-out, you and the owner get reminders every 5 minutes.
            </li>
            <li>
              If check-out is overdue by more than 1 hour, both your account and the owner&apos;s
              account are set inactive (with reason). Login is blocked until a Parking Super Admin
              reactivates you — you will get email and in-app notifications.
            </li>
          </ol>
          <p style={{ marginTop: "1rem" }}>
            <strong>Mobile:</strong> {user?.phone}
          </p>
        </div>
      </section>
    </>
  );
}
