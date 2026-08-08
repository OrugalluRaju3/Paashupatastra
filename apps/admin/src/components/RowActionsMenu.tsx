import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export type RowActionItem = {
  id: string;
  label: string;
  onClick: () => void;
  tone?: "default" | "danger";
  disabled?: boolean;
};

type RowActionsMenuProps = {
  items: RowActionItem[];
  label?: string;
};

type MenuPosition = {
  top?: number;
  bottom?: number;
  right: number;
};

export function RowActionsMenu({ items, label = "Actions" }: RowActionsMenuProps) {
  const [open, setOpen] = useState(false);
  const [dropUp, setDropUp] = useState(false);
  const [pos, setPos] = useState<MenuPosition | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const menuId = useId();

  function updatePosition() {
    if (!rootRef.current) return;
    const rect = rootRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const up = spaceBelow < 220;
    setDropUp(up);
    setPos(
      up
        ? {
            bottom: Math.max(8, window.innerHeight - rect.top + 6),
            right: Math.max(8, window.innerWidth - rect.right),
          }
        : {
            top: Math.max(8, rect.bottom + 6),
            right: Math.max(8, window.innerWidth - rect.right),
          },
    );
  }

  useLayoutEffect(() => {
    if (!open) return;
    updatePosition();
  }, [open]);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      const target = e.target as Node;
      if (rootRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    function onReposition() {
      if (open) updatePosition();
    }
    if (open) {
      document.addEventListener("mousedown", onDocClick);
      document.addEventListener("keydown", onKey);
      window.addEventListener("resize", onReposition);
      window.addEventListener("scroll", onReposition, true);
    }
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onReposition);
      window.removeEventListener("scroll", onReposition, true);
    };
  }, [open]);

  function toggle() {
    setOpen((v) => !v);
  }

  return (
    <div className={`row-menu${open ? " is-open" : ""}`} ref={rootRef}>
      <button
        type="button"
        className="row-menu-trigger"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={toggle}
      >
        <span className="row-menu-dots" aria-hidden>
          <i />
          <i />
          <i />
        </span>
      </button>

      {open && pos
        ? createPortal(
            <div
              id={menuId}
              ref={panelRef}
              className={`row-menu-panel is-portal${dropUp ? " is-up" : ""}`}
              role="menu"
              style={{
                position: "fixed",
                top: pos.top,
                bottom: pos.bottom,
                right: pos.right,
                zIndex: 5000,
              }}
            >
              {items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  role="menuitem"
                  className={`row-menu-item${item.tone === "danger" ? " is-danger" : ""}`}
                  disabled={item.disabled}
                  onClick={() => {
                    setOpen(false);
                    item.onClick();
                  }}
                >
                  {item.label}
                </button>
              ))}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
