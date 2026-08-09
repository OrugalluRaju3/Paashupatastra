import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api";
import { useAuth } from "../auth/AuthContext";
import { Modal } from "./Modal";
import { useToast } from "./Toast";

type ChatMessage = {
  id: number | string;
  senderUserId: number | string;
  senderName: string | null;
  body: string;
  mine?: boolean;
  createdAt: string;
};

type Props = {
  /** API path that supports GET/POST for messages, e.g. `/tanker/orders/12/messages` */
  messagesPath: string;
  title?: string;
  peerLabel?: string;
  intro?: string;
  closedLabel?: string;
  onClose: () => void;
};

export function ThreadChatModal({
  messagesPath,
  title = "Chat",
  peerLabel = "other party",
  intro,
  closedLabel = "Chat is closed for this order.",
  onClose,
}: Props) {
  const toast = useToast();
  const { user } = useAuth();
  const [items, setItems] = useState<ChatMessage[]>([]);
  const [canSend, setCanSend] = useState(true);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await api.get<{ items: ChatMessage[]; canSend: boolean }>(messagesPath);
      setItems(Array.isArray(res.items) ? res.items : []);
      setCanSend(res.canSend !== false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load chat");
    } finally {
      setLoading(false);
    }
  }, [messagesPath, toast]);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => {
      void load();
    }, 8_000);
    return () => window.clearInterval(timer);
  }, [load]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [items.length]);

  async function onSend(e: FormEvent) {
    e.preventDefault();
    const body = draft.trim();
    if (!body || !canSend) return;
    setSending(true);
    try {
      const saved = await api.post<ChatMessage>(messagesPath, { body });
      setDraft("");
      setItems((prev) => {
        if (prev.some((m) => String(m.id) === String(saved.id))) return prev;
        return [...prev, saved];
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to send message");
    } finally {
      setSending(false);
    }
  }

  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={
        canSend ? (
          <form className="booking-chat-compose" onSubmit={(e) => void onSend(e)}>
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={`Message the ${peerLabel}…`}
              maxLength={2000}
              disabled={sending}
              autoFocus
            />
            <button
              type="submit"
              className="btn btn-primary btn-sm"
              disabled={sending || !draft.trim()}
            >
              {sending ? "Sending…" : "Send"}
            </button>
          </form>
        ) : (
          <p className="booking-chat-closed">{closedLabel}</p>
        )
      }
    >
      <p className="booking-chat-intro">
        {intro ??
          `Chat with the ${peerLabel}. Messages refresh automatically.`}
      </p>
      <div className="booking-chat-thread" role="log" aria-live="polite">
        {loading ? <p className="loading">Loading messages…</p> : null}
        {!loading && items.length === 0 ? (
          <p className="empty">No messages yet. Say hello to start the conversation.</p>
        ) : null}
        {items.map((m) => {
          const mine = m.mine || String(m.senderUserId) === String(user?.id);
          return (
            <div key={String(m.id)} className={`booking-chat-bubble${mine ? " is-mine" : ""}`}>
              <div className="booking-chat-meta">
                <strong>{mine ? "You" : m.senderName || peerLabel}</strong>
                <span>
                  {new Date(m.createdAt).toLocaleString("en-IN", {
                    hour: "2-digit",
                    minute: "2-digit",
                    day: "numeric",
                    month: "short",
                  })}
                </span>
              </div>
              <p>{m.body}</p>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>
    </Modal>
  );
}

/** Parking booking chat (back-compat wrapper). */
export function BookingChatModal({
  bookingId,
  title = "Booking chat",
  peerLabel = "other party",
  onClose,
}: {
  bookingId: string;
  title?: string;
  peerLabel?: string;
  onClose: () => void;
}) {
  return (
    <ThreadChatModal
      messagesPath={`/parking/bookings/${bookingId}/messages`}
      title={title}
      peerLabel={peerLabel}
      intro={`Chat with the ${peerLabel} about arrival, OTP, and parking access. Messages refresh automatically.`}
      closedLabel="Chat is closed for this booking."
      onClose={onClose}
    />
  );
}
