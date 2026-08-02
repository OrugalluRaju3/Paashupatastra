import { useEffect, useRef, useState } from "react";
import { NotificationBell } from "./NotificationBell";

type AppHeaderProps = {
  portalLabel: string;
  userName?: string | null;
  userPhone?: string | null;
  roleLabel?: string | null;
  onLogout: () => void;
};

function initials(name?: string | null, phone?: string | null) {
  const n = (name ?? "").trim();
  if (n) {
    const parts = n.split(/\s+/).filter(Boolean);
    return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "U";
  }
  return (phone ?? "U").slice(-2);
}

export function AppHeader({
  portalLabel,
  userName,
  userPhone,
  roleLabel,
  onLogout,
}: AppHeaderProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  return (
    <header className="app-header">
      <div className="app-header-left">
        <p className="app-header-portal">{portalLabel}</p>
        <p className="app-header-hint">Signed in and ready</p>
      </div>

      <div className="app-header-right">
        <NotificationBell />

        <div className="profile-menu" ref={ref}>
          <button
            type="button"
            className="profile-trigger"
            aria-expanded={open}
            aria-haspopup="menu"
            onClick={() => setOpen((v) => !v)}
          >
            <span className="profile-avatar" aria-hidden>
              {initials(userName, userPhone)}
            </span>
            <span className="profile-meta">
              <strong>{userName?.trim() || "Account"}</strong>
              <span>{roleLabel || userPhone || "Profile"}</span>
            </span>
            <span className={`profile-caret${open ? " is-open" : ""}`} aria-hidden />
          </button>

          {open ? (
            <div className="profile-dropdown" role="menu">
              <div className="profile-dropdown-head">
                <span className="profile-avatar profile-avatar-lg" aria-hidden>
                  {initials(userName, userPhone)}
                </span>
                <div>
                  <strong>{userName?.trim() || "Account"}</strong>
                  {userPhone ? <p>{userPhone}</p> : null}
                  {roleLabel ? <p className="profile-role">{roleLabel}</p> : null}
                </div>
              </div>
              <button
                type="button"
                className="profile-logout"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  onLogout();
                }}
              >
                Log out
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
}
