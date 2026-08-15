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
  const isProvider = intent === "provider";
  const isWorker = intent === "worker";
  const isTankerModule = module === "tanker";
  const isSevaModule = module === "seva";

  const helpLinks = [
    { to: "/app/help/faq", label: "FAQs" },
    { to: "/app/help/privacy", label: "Privacy" },
    { to: "/app/help/terms", label: "Terms" },
    { to: "/app/help/support", label: "Support" },
  ];

  const links = isDriver
    ? [{ to: "/app/driver", label: "Deliveries", end: true }, ...helpLinks]
    : isWorker
      ? [{ to: "/app/worker", label: "My jobs", end: true }, ...helpLinks]
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
        : isProvider
          ? [
              { to: "/app/provider", label: "Home", end: true },
              { to: "/app/provider/offerings", label: "Offerings" },
              { to: "/app/provider/workers", label: "Workers" },
              { to: "/app/provider/requests", label: "Requests" },
              { to: "/app/provider/jobs", label: "Jobs" },
              { to: "/app/provider/invoices", label: "Invoices" },
              { to: "/app/provider/wallet", label: "Wallet" },
              ...helpLinks,
            ]
          : isOwner
            ? [
                { to: "/app/owner", label: "Home", end: true },
                { to: "/app/owner/listings", label: "My applications" },
                { to: "/app/owner/bookings", label: "Bookings" },
                { to: "/app/owner/invoices", label: "Invoices" },
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
              : isSevaModule
                ? [
                    { to: "/app/seva", label: "Search services", end: true },
                    { to: "/app/seva/bookings", label: "My bookings" },
                    { to: "/app/seva/invoices", label: "Invoices" },
                    ...helpLinks,
                  ]
                : [
                    { to: "/app/customer", label: "Home", end: true },
                    { to: "/app/customer/search", label: "Search parking" },
                    { to: "/app/customer/bookings", label: "My bookings" },
                    { to: "/app/customer/invoices", label: "Invoices" },
                    { to: "/app/customer/wallet", label: "Wallet" },
                    ...helpLinks,
                  ];

  function onLogout() {
    logout();
    navigate(
      module === "tanker" ? "/login/tanker" : module === "seva" ? "/login/seva" : "/login/parking",
    );
  }

  const portalLabel = isDriver
    ? "Driver portal"
    : isWorker
      ? "Worker portal"
      : isSupplier
        ? "Supplier portal"
        : isProvider
          ? "Provider portal"
          : isOwner
            ? "Owner portal"
            : isTankerModule
              ? "Tanker customer portal"
              : isSevaModule
                ? "Seva customer portal"
                : "Customer portal";
  const roleLabel = isDriver
    ? "Tanker driver"
    : isWorker
      ? "Seva worker"
      : isSupplier
        ? "Water supplier"
        : isProvider
          ? "Seva provider"
          : isOwner
            ? "Parking owner"
            : isTankerModule
              ? "Tanker customer"
              : isSevaModule
                ? "Seva customer"
                : "Customer";
  const kicker = isDriver
    ? "Driver"
    : isWorker
      ? "Worker"
      : isSupplier
        ? "Supplier"
        : isProvider
          ? "Provider"
          : isOwner
            ? "Owner"
            : isTankerModule
              ? "Tanker"
              : isSevaModule
                ? "Seva"
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
            : isWorker
              ? "Update job status and verify customer OTP on site."
              : isSupplier
                ? "Manage fleet, requests, and water deliveries."
                : isProvider
                  ? "Manage offerings, workers, and Seva bookings."
                  : isTankerModule
                    ? "Order water tankers and track deliveries."
                    : isSevaModule
                      ? "Book housekeeping and maintenance services."
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
