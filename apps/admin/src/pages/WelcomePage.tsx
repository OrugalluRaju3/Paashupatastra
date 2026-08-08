import { Link } from "react-router-dom";

export function WelcomePage() {
  return (
    <div className="auth-page">
      <div className="auth-card welcome-card">
        <div className="brand" style={{ padding: 0, marginBottom: "0.75rem" }}>
          <div className="brand-mark" aria-hidden>
            P
          </div>
          <div>
            <h1 style={{ color: "var(--ink)", margin: 0, fontSize: "1.35rem" }}>Paashupatastra</h1>
          </div>
        </div>
        <p className="auth-sub">
          Book a parking slot or order a water tanker — pick a service below to sign in as a
          customer, owner, supplier, or staff.
        </p>

        <div className="welcome-actions">
          <Link className="btn btn-primary" to="/login/parking">
            Parking
          </Link>
          <Link className="btn btn-primary" to="/login/tanker">
            Water tanker
          </Link>
          <Link className="btn btn-ghost" to="/staff/login/parking">
            Parking staff
          </Link>
          <Link className="btn btn-ghost" to="/staff/login/tanker">
            Tanker staff
          </Link>
        </div>
      </div>
    </div>
  );
}
