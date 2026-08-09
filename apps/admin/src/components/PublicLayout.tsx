import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { AnnouncementBanner } from "./AnnouncementBanner";
import { AppHeader } from "./AppHeader";

export function PublicLayout() {
  const { user, intent, module, logout } = useAuth();
  const navigate = useNavigate();
  const isOwner = intent === "owner";
  const isSupplier = intent === "supplier";
  const isDriver = intent === "driver";
  const isTankerModule = module === "tanker";

  const helpLinks = [
    { to: "/app/help/faq", label: "FAQs" },
    { to: "/app/help/privacy", label: "Privacy" },
    { to: "/app/help/terms", label: "Terms" },
    { to: "/app/help/support", label: "Support" },
  ];

  const links = isDriver
    ? [{ to: "/app/driver", label: "Deliveries", end: true }, ...helpLinks]
    : isSupplier
      ? [
          { to: "/app/supplier", label: "Home", end: true },
          { to: "/app/supplier/fleet", label: "Fleet" },
          { to: "/app/supplier/requests", label: "Requests" },
          { to: "/app/supplier/orders", label: "Orders" },
          { to: "/app/supplier/invoices", label: "Invoices" },
          { to: "/app/supplier/wallet", label: "Wallet" },
          { to: "/app/supplier/profile", label: "Profile" },
          ...helpLinks,
        ]
      : isOwner
        ? [
            { to: "/app/owner", label: "Home", end: true },
            { to: "/app/owner/listings", label: "My applications" },
            { to: "/app/owner/bookings", label: "Bookings" },
            { to: "/app/owner/wallet", label: "Wallet" },
            ...helpLinks,
          ]
        : isTankerModule
          ? [
              { to: "/app/tanker", label: "Search tankers", end: true },
              { to: "/app/tanker/requests", label: "My requests" },
              { to: "/app/tanker/orders", label: "My orders" },
              { to: "/app/tanker/invoices", label: "Invoices" },
              ...helpLinks,
            ]
          : [
              { to: "/app/customer", label: "Home", end: true },
              { to: "/app/customer/search", label: "Search parking" },
              { to: "/app/customer/bookings", label: "My bookings" },
              { to: "/app/customer/wallet", label: "Wallet" },
              ...helpLinks,
            ];

  function onLogout() {
    logout();
    navigate(module === "tanker" ? "/login/tanker" : "/login/parking");
  }

  const portalLabel = isDriver
    ? "Driver portal"
    : isSupplier
      ? "Supplier portal"
      : isOwner
        ? "Owner portal"
        : isTankerModule
          ? "Tanker customer portal"
          : "Customer portal";
  const roleLabel = isDriver
    ? "Tanker driver"
    : isSupplier
      ? "Water supplier"
      : isOwner
        ? "Parking owner"
        : isTankerModule
          ? "Tanker customer"
          : "Customer";
  const kicker = isDriver
    ? "Driver"
    : isSupplier
      ? "Supplier"
      : isOwner
        ? "Owner"
        : isTankerModule
          ? "Tanker"
          : "Customer";

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark" aria-hidden>
            P
          </div>
          <div>
            <p className="brand-kicker">{kicker}</p>
            <h1>Paashupatastra</h1>
          </div>
        </div>
        <nav className="nav" aria-label="Primary">
          {links.map((link) => (
            <NavLink key={link.to} to={link.to} end={"end" in link ? link.end : undefined}>
              <span>{link.label}</span>
            </NavLink>
          ))}
        </nav>
        <p className="sidebar-foot">
          {isDriver
            ? "Update delivery status, share live location, and verify OTP."
            : isSupplier
              ? "Manage fleet, requests, and water deliveries."
              : isTankerModule
                ? "Order water tankers and track deliveries."
                : "Find, book, and settle parking with clarity."}
        </p>
      </aside>
      <div className="shell-body">
        <AppHeader
          portalLabel={portalLabel}
          userName={user?.name}
          userPhone={user?.phone}
          roleLabel={roleLabel}
          onLogout={onLogout}
        />
        <main className="main">
          <AnnouncementBanner />
          <Outlet />
        </main>
      </div>
    </div>
  );
}
