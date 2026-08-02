import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { AppHeader } from "./AppHeader";

const ROLE_LABEL: Record<string, string> = {
  super_admin: "Super admin",
  verification_manager: "Verification manager",
  field_executive: "Field executive",
};

const staffLinks = [
  {
    to: "/staff",
    label: "Dashboard",
    end: true,
    roles: ["super_admin", "verification_manager", "field_executive"],
  },
  { to: "/staff/listings", label: "Owners", roles: ["super_admin", "verification_manager"] },
  {
    to: "/staff/verification",
    label: "Verification",
    roles: ["super_admin", "verification_manager", "field_executive"],
  },
  { to: "/staff/bookings", label: "Bookings", roles: ["super_admin", "verification_manager"] },
  { to: "/staff/users", label: "Users & staff", roles: ["super_admin"] },
  { to: "/staff/settings", label: "Commission", roles: ["super_admin"] },
  { to: "/staff/parking", label: "Legacy slots", roles: ["super_admin"] },
];

export function StaffLayout() {
  const { user, logout, intent } = useAuth();
  const navigate = useNavigate();
  const roles = user?.roles ?? [];

  const links = staffLinks.filter(
    (l) => roles.includes("super_admin") || l.roles.some((r) => roles.includes(r)),
  );

  function onLogout() {
    logout();
    navigate("/staff/login");
  }

  const roleLabel =
    ROLE_LABEL[intent ?? ""] ||
    ROLE_LABEL[roles.find((r) => ROLE_LABEL[r]) ?? ""] ||
    "Staff";

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark" aria-hidden>
            P
          </div>
          <div>
            <p className="brand-kicker">Staff</p>
            <h1>Paashupatastra</h1>
          </div>
        </div>
        <nav className="nav" aria-label="Staff">
          {links.map((link) => (
            <NavLink key={link.to} to={link.to} end={link.end}>
              <span>{link.label}</span>
            </NavLink>
          ))}
        </nav>
        <p className="sidebar-foot">Verify listings, manage bookings, and keep the marketplace healthy.</p>
      </aside>
      <div className="shell-body">
        <AppHeader
          portalLabel="Staff console"
          userName={user?.name}
          userPhone={user?.phone}
          roleLabel={roleLabel}
          onLogout={onLogout}
        />
        <main className="main">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
