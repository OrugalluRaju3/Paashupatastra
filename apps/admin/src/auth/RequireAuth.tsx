import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "./AuthContext";
import type { AuthModule, PortalKind } from "./types";

export function RequireAuth({ portal }: { portal: PortalKind }) {
  const { token, user, portal: activePortal, module, ready } = useAuth();
  const location = useLocation();

  if (!ready) return <p className="loading">Loading…</p>;

  if (!token || !user) {
    const to = portal === "staff" ? "/" : "/";
    return <Navigate to={to} replace state={{ from: location.pathname }} />;
  }

  if (activePortal !== portal) {
    if (portal === "staff") {
      const staffModule = module === "tanker" ? "tanker" : "parking";
      return <Navigate to={`/staff/login/${staffModule}`} replace />;
    }
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}

export function RequireModule({ module: requiredModule }: { module: AuthModule }) {
  const { module, portal, ready } = useAuth();
  const location = useLocation();

  if (!ready) return <p className="loading">Loading…</p>;

  if (module !== requiredModule) {
    const to =
      portal === "staff" ? `/staff/login/${requiredModule}` : `/login/${requiredModule}`;
    return <Navigate to={to} replace state={{ from: location.pathname }} />;
  }

  return <Outlet />;
}
