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
            <p className="brand-kicker" style={{ color: "var(--muted)" }}>
              Parking marketplace
            </p>
            <h1 style={{ color: "var(--ink)", margin: "0.15rem 0 0", fontSize: "1.35rem" }}>
              Paashupatastra
            </h1>
          </div>
        </div>
        <p className="auth-sub">Choose how you want to continue. One place for customers, owners, and staff.</p>

        <div className="welcome-actions">
          <Link className="btn btn-primary" to="/login">
            Customer / Owner login
          </Link>
          <Link className="btn btn-ghost" to="/staff/login">
            Admin / Executive / Manager login
          </Link>
        </div>
      </div>
    </div>
  );
}
