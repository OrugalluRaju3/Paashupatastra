import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { AppHeader } from "./AppHeader";

export function PublicLayout() {
  const { user, intent, logout } = useAuth();
  const navigate = useNavigate();
  const isOwner = intent === "owner";

  const links = isOwner
    ? [
        { to: "/app/owner", label: "Home", end: true },
        { to: "/app/owner/listings", label: "My applications" },
        { to: "/app/owner/bookings", label: "Bookings" },
        { to: "/app/owner/wallet", label: "Wallet" },
      ]
    : [
        { to: "/app/customer", label: "Home", end: true },
        { to: "/app/customer/search", label: "Search parking" },
        { to: "/app/customer/bookings", label: "My bookings" },
        { to: "/app/customer/wallet", label: "Wallet" },
      ];

  function onLogout() {
    logout();
    navigate("/login");
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark" aria-hidden>
            P
          </div>
          <div>
            <p className="brand-kicker">{isOwner ? "Owner" : "Customer"}</p>
            <h1>Paashupatastra</h1>
          </div>
        </div>
        <nav className="nav" aria-label="Primary">
          {links.map((link) => (
            <NavLink key={link.to} to={link.to} end={link.end}>
              <span>{link.label}</span>
            </NavLink>
          ))}
        </nav>
        <p className="sidebar-foot">Find, book, and settle parking with clarity.</p>
      </aside>
      <div className="shell-body">
        <AppHeader
          portalLabel={isOwner ? "Owner portal" : "Customer portal"}
          userName={user?.name}
          userPhone={user?.phone}
          roleLabel={isOwner ? "Parking owner" : "Customer"}
          onLogout={onLogout}
        />
        <main className="main">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
