import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import type { PortalKind } from "../auth/types";

export function RequireAuth({ portal }: { portal: PortalKind }) {
  const { token, user, portal: activePortal, ready } = useAuth();
  const location = useLocation();

  if (!ready) return <p className="loading">Loading…</p>;

  if (!token || !user) {
    const to = portal === "staff" ? "/staff/login" : "/login";
    return <Navigate to={to} replace state={{ from: location.pathname }} />;
  }

  if (activePortal !== portal) {
    return <Navigate to={portal === "staff" ? "/staff/login" : "/login"} replace />;
  }

  return <Outlet />;
}
