import type { ReactNode } from "react";

type Props = {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer: ReactNode;
  /** Wider dialog for long-form content editors. */
  wide?: boolean;
};

export function Modal({ title, onClose, children, footer, wide }: Props) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className={`modal${wide ? " modal-wide" : ""}`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <header>
          <h3>{title}</h3>
        </header>
        <div className="body">{children}</div>
        <footer>{footer}</footer>
      </div>
    </div>
  );
}
