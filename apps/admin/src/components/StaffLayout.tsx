import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { isSevaSuperAdmin, isTankerSuperAdmin } from "../auth/types";
import { AppHeader } from "./AppHeader";

const ROLE_LABEL: Record<string, string> = {
  parking_super_admin: "Parking super admin",
  tanker_super_admin: "Tanker super admin",
  seva_super_admin: "Seva super admin",
  super_admin: "Super admin",
  verification_manager: "Verification manager",
  field_executive: "Field executive",
};

type StaffNavLink = {
  to: string;
  label: string;
  end?: boolean;
  roles: string[];
};

const parkingSuperRoles = ["parking_super_admin", "super_admin"];

const parkingOpsLinks: StaffNavLink[] = [
  {
    to: "/staff",
    label: "Dashboard",
    end: true,
    roles: [...parkingSuperRoles, "verification_manager", "field_executive"],
  },
  {
    to: "/staff/listings",
    label: "Owners",
    roles: [...parkingSuperRoles, "verification_manager"],
  },
  {
    to: "/staff/verification",
    label: "Verification",
    roles: [...parkingSuperRoles, "verification_manager", "field_executive"],
  },
  {
    to: "/staff/reportees",
    label: "My reportees",
    roles: ["verification_manager"],
  },
  {
    to: "/staff/bookings",
    label: "Bookings",
    roles: [...parkingSuperRoles, "verification_manager"],
  },
  { to: "/staff/invoices", label: "Invoices", roles: parkingSuperRoles },
  { to: "/staff/users/parking", label: "Parking users", roles: parkingSuperRoles },
  { to: "/staff/settings", label: "Commission", roles: parkingSuperRoles },
  { to: "/staff/content", label: "Content", roles: parkingSuperRoles },
  { to: "/staff/parking", label: "Legacy slots", roles: parkingSuperRoles },
];

const tankerOpsLinks: StaffNavLink[] = [
  { to: "/staff/tanker", label: "Water tanker", roles: ["tanker_super_admin"] },
  { to: "/staff/users/tanker", label: "Tanker users", roles: ["tanker_super_admin"] },
  { to: "/staff/content", label: "Content", roles: ["tanker_super_admin"] },
];

const sevaOpsLinks: StaffNavLink[] = [
  { to: "/staff/seva", label: "Housekeeping", roles: ["seva_super_admin"] },
  { to: "/staff/content", label: "Content", roles: ["seva_super_admin"] },
];
const staffOnlyLinks: StaffNavLink[] = [
  { to: "/staff/users", label: "Staff users", end: true, roles: parkingSuperRoles },
];

function filterParkingLinks(links: StaffNavLink[], roles: string[]) {
  return links.filter((l) => l.roles.some((r) => roles.includes(r)));
}

function filterTankerLinks(links: StaffNavLink[], roles: string[]) {
  return links.filter(
    (l) => isTankerSuperAdmin({ roles }) || l.roles.some((r) => roles.includes(r)),
  );
}

function filterSevaLinks(links: StaffNavLink[], roles: string[]) {
  return links.filter(
    (l) => isSevaSuperAdmin({ roles }) || l.roles.some((r) => roles.includes(r)),
  );
}

export function StaffLayout() {
  const { user, logout, intent, module } = useAuth();
  const navigate = useNavigate();
  const roles = user?.roles ?? [];
  const staffModule =
    module === "tanker" ? "tanker" : module === "seva" ? "seva" : "parking";

  const parkingLinks = staffModule === "parking" ? filterParkingLinks(parkingOpsLinks, roles) : [];
  const tankerLinks = staffModule === "tanker" ? filterTankerLinks(tankerOpsLinks, roles) : [];
  const sevaLinks = staffModule === "seva" ? filterSevaLinks(sevaOpsLinks, roles) : [];
  const adminLinks = staffModule === "parking" ? filterParkingLinks(staffOnlyLinks, roles) : [];

  function onLogout() {
    logout();
    navigate(`/staff/login/${staffModule}`);
  }

  const roleLabel =
    ROLE_LABEL[intent ?? ""] ||
    ROLE_LABEL[roles.find((r) => ROLE_LABEL[r]) ?? ""] ||
    "Staff";

  const brandKicker =
    staffModule === "tanker"
      ? "Tanker staff"
      : staffModule === "seva"
        ? "Seva staff"
        : "Parking staff";

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark" aria-hidden>
            P
          </div>
          <div>
            <p className="brand-kicker">{brandKicker}</p>
            <h1>Paashupatastra</h1>
          </div>
        </div>
        <nav className="nav" aria-label="Staff">
          {parkingLinks.length > 0 ? (
            <>
              <p className="nav-section-label">Parking ops</p>
              {parkingLinks.map((link) => (
                <NavLink key={link.to} to={link.to} end={link.end}>
                  <span>{link.label}</span>
                </NavLink>
              ))}
            </>
          ) : null}
          {tankerLinks.length > 0 ? (
            <>
              <p className="nav-section-label">Tanker ops</p>
              {tankerLinks.map((link) => (
                <NavLink key={link.to} to={link.to} end={link.end}>
                  <span>{link.label}</span>
                </NavLink>
              ))}
            </>
          ) : null}
          {sevaLinks.length > 0 ? (
            <>
              <p className="nav-section-label">Seva ops</p>
              {sevaLinks.map((link) => (
                <NavLink key={link.to} to={link.to} end={link.end}>
                  <span>{link.label}</span>
                </NavLink>
              ))}
            </>
          ) : null}
          {adminLinks.length > 0 ? (
            <>
              <p className="nav-section-label">Administration</p>
              {adminLinks.map((link) => (
                <NavLink key={link.to} to={link.to} end={link.end}>
                  <span>{link.label}</span>
                </NavLink>
              ))}
            </>
          ) : null}
        </nav>
        <p className="sidebar-foot">
          {staffModule === "tanker"
            ? "Manage tanker suppliers, drivers, and deliveries."
            : staffModule === "seva"
              ? "Manage housekeeping providers, workers, and bookings."
              : "Verify listings, manage bookings, and keep the marketplace healthy."}
        </p>
      </aside>
      <div className="shell-body">
        <AppHeader
          portalLabel={
            staffModule === "tanker"
              ? "Tanker staff console"
              : staffModule === "seva"
                ? "Seva staff console"
                : "Parking staff console"
          }
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
