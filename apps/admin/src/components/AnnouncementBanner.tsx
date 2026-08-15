import { useCallback, useEffect, useState } from "react";
import { api, qs } from "../api";
import { useAuth } from "../auth/AuthContext";

type Announcement = {
  id: number;
  title: string;
  body: string;
};

export function AnnouncementBanner() {
  const { module, token } = useAuth();
  const [items, setItems] = useState<Announcement[]>([]);
  const [dismissed, setDismissed] = useState<Set<number>>(new Set());

  const load = useCallback(async () => {
    if (!token) return;
    const contentModule = module === "tanker" ? "tanker" : module === "seva" ? "seva" : "parking";
    try {
      const res = await api.get<{ items: Announcement[] }>(
        `/content/announcements${qs({ module: contentModule })}`,
      );
      setItems(res.items ?? []);
    } catch {
      // best-effort banner
    }
  }, [module, token]);

  useEffect(() => {
    void load();
  }, [load]);

  const visible = items.filter((i) => !dismissed.has(i.id));
  if (!visible.length) return null;

  return (
    <div className="announcement-stack" role="region" aria-label="Announcements">
      {visible.map((a) => (
        <div key={a.id} className="announcement-banner">
          <div>
            <strong>{a.title}</strong>
            <p>{a.body}</p>
          </div>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => setDismissed((prev) => new Set(prev).add(a.id))}
          >
            Dismiss
          </button>
        </div>
      ))}
    </div>
  );
}
