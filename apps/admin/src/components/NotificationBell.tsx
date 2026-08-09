import { useCallback, useEffect, useRef, useState } from "react";
import { api, qs } from "../api";
import { useAuth } from "../auth/AuthContext";

type NotificationItem = {
  id: string;
  title: string;
  body: string;
  createdAt: string;
  isRead: boolean;
  referenceType?: string | null;
};

type InboxResponse = {
  items: NotificationItem[];
  unreadCount: number;
};

export function NotificationBell() {
  const { token, user, intent } = useAuth();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  const load = useCallback(async () => {
    if (!token || !user?.id) return;
    try {
      const res = await api.get<InboxResponse>(`/notifications/me${qs({ limit: 30 })}`);
      setItems(res.items);
      setUnreadCount(res.unreadCount);
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to load notifications");
    }
  }, [token, user?.id, intent]);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 20_000);
    return () => window.clearInterval(timer);
  }, [load]);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!panelRef.current?.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  async function markRead(id: string) {
    try {
      await api.post(`/notifications/${id}/read`, {});
      setItems((prev) => prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)));
      setUnreadCount((c) => Math.max(0, c - 1));
    } catch {
      // ignore
    }
  }

  async function markAllRead() {
    setLoading(true);
    try {
      await api.post("/notifications/read-all", {});
      setItems((prev) => prev.map((n) => ({ ...n, isRead: true })));
      setUnreadCount(0);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }

  if (!token) return null;

  return (
    <div className="notif-bell" ref={panelRef}>
      <button
        type="button"
        className="notif-bell-btn"
        aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ""}`}
        onClick={() => {
          setOpen((v) => !v);
          void load();
        }}
      >
        <span className="notif-bell-icon" aria-hidden />
        {unreadCount > 0 ? <span className="notif-badge">{unreadCount > 99 ? "99+" : unreadCount}</span> : null}
      </button>

      {open ? (
        <div className="notif-panel">
          <div className="notif-panel-head">
            <strong>Notifications</strong>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={loading || unreadCount === 0}
              onClick={() => void markAllRead()}
            >
              Mark all read
            </button>
          </div>
          <div className="notif-list">
            {loadError ? (
              <p className="notif-empty">
                Could not load notifications ({loadError}).{" "}
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => void load()}>
                  Retry
                </button>
              </p>
            ) : null}
            {!loadError
              ? items.map((n) => (
                  <button
                    key={n.id}
                    type="button"
                    className={`notif-item${n.isRead ? "" : " is-unread"}`}
                    onClick={() => void markRead(n.id)}
                  >
                    <div className="notif-item-title">{n.title}</div>
                    <div className="notif-item-body">{n.body}</div>
                    <div className="notif-item-meta">{new Date(n.createdAt).toLocaleString("en-IN")}</div>
                  </button>
                ))
              : null}
            {!loadError && items.length === 0 ? <p className="notif-empty">No notifications yet.</p> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
