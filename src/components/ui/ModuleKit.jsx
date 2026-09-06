// src/components/ui/ModuleKit.jsx
// ─────────────────────────────────────────────────────────────────────────────
// The pieces every module page needs, built once.
//
// Each existing module declares its own Modal and Btn at the top of the file.
// That was tolerable at five modules; at thirteen it means a change to how a
// dialog closes has to be made thirteen times, and the copies have already
// drifted. New modules use these instead.
//
// Everything here renders with classes from `staff-management.css` rather than
// styles of its own, so a module built with this kit looks like the ones built
// before it.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect } from "react";
import { X, Loader2, Inbox } from "lucide-react";

// TONES and money() live in ./format so this file exports components only,
// which is what Fast Refresh needs to hot-swap a component in place.

export function Spinner({ size = 16 }) {
  return <Loader2 size={size} className="spin" aria-hidden="true" />;
}

// ─── Modal ───────────────────────────────────────────────────────────────────

export function Modal({ title, subtitle, onClose, children, footer, wide = false }) {
  // Escape closes. Without it a dialog opened by mistake has to be dismissed
  // with the mouse, which on a phone means hunting for a small X.
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose?.(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="modal-overlay"
      onClick={(e) => { if (e.target === e.currentTarget) onClose?.(); }}
      role="presentation"
    >
      <div
        className={`modal-container ${wide ? "modal-container--wide" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="modal-header">
          <div>
            <h3>{title}</h3>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button type="button" onClick={onClose} className="modal-close" aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  );
}

// ─── Buttons ─────────────────────────────────────────────────────────────────

export function Btn({
  children, variant = "primary", size = "md", loading = false,
  icon = null, className = "", ...props
}) {
  return (
    <button
      type="button"
      className={`btn btn--${variant} ${size === "sm" ? "btn--sm" : ""} ${className}`}
      disabled={loading || props.disabled}
      {...props}
    >
      {loading ? <Spinner size={14} /> : icon}
      {children}
    </button>
  );
}

export function IconBtn({ icon, title, danger = false, ...props }) {
  return (
    <button
      type="button"
      className={`icon-btn ${danger ? "icon-btn--danger" : ""}`}
      title={title}
      aria-label={title}
      {...props}
    >
      {icon}
    </button>
  );
}

// ─── Fields ──────────────────────────────────────────────────────────────────

export function Field({ label, required, hint, error, children }) {
  return (
    <div className="field">
      {label && (
        <label className="field__label">
          {label}{required && <span className="text-danger"> *</span>}
        </label>
      )}
      {children}
      {error
        ? <p className="error-message">{error}</p>
        : hint && <p className="text-muted mt-1" style={{ fontSize: 11 }}>{hint}</p>}
    </div>
  );
}

export function Input({ label, required, hint, error, ...props }) {
  return (
    <Field label={label} required={required} hint={hint} error={error}>
      <input className="field__input" {...props} />
    </Field>
  );
}

export function Textarea({ label, required, hint, error, rows = 3, ...props }) {
  return (
    <Field label={label} required={required} hint={hint} error={error}>
      <textarea className="field__textarea" rows={rows} {...props} />
    </Field>
  );
}

export function Select({ label, required, hint, error, children, ...props }) {
  return (
    <Field label={label} required={required} hint={hint} error={error}>
      <select className="field__select" {...props}>{children}</select>
    </Field>
  );
}

// ─── Display ─────────────────────────────────────────────────────────────────

export function Pill({ tone = "neutral", children }) {
  // The stylesheet ships success / warning / danger pills; anything else uses
  // the neutral tag so an unmapped tone degrades quietly rather than rendering
  // an unstyled element.
  const cls = ["success", "warning", "danger"].includes(tone)
    ? `status-pill status-pill--${tone}`
    : "tag tag--neutral";
  return <span className={cls}>{children}</span>;
}

export function StatCard({ label, value, sub, tone }) {
  return (
    <div className="stat-card">
      <div className={`stat-card__value ${tone ? `stat-card__value--${tone}` : ""}`}>{value}</div>
      <div className="stat-card__label">{label}</div>
      {sub && <div className="stat-card__sub">{sub}</div>}
    </div>
  );
}

export function StatGrid({ children }) {
  return <div className="stats-grid">{children}</div>;
}

export function EmptyState({ icon, title, sub, action }) {
  return (
    <div className="empty-state">
      <div className="empty-state__icon">{icon || <Inbox size={28} />}</div>
      <div className="empty-state__title">{title}</div>
      {sub && <p className="empty-state__sub">{sub}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ModuleHeader({ title, subtitle, actions }) {
  return (
    <div className="flex items-center justify-between mb-5" style={{ flexWrap: "wrap", gap: 12 }}>
      <div>
        <h2 className="module-title">{title}</h2>
        {subtitle && <p className="module-sub">{subtitle}</p>}
      </div>
      {actions && <div className="flex gap-2">{actions}</div>}
    </div>
  );
}

/** Chip row used for filtering a list — the pattern already in Attendance. */
export function FilterBar({ options, value, onChange }) {
  return (
    <div className="filter-group">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          className={`filter-btn ${value === o.id ? "filter-btn--active" : ""}`}
          onClick={() => onChange(o.id)}
        >
          {o.label}
          {typeof o.count === "number" && ` (${o.count})`}
        </button>
      ))}
    </div>
  );
}

/**
 * A banner that says what happened. Auto-dismissal is the caller's business —
 * a message that vanishes before it is read is worse than none.
 */
export function Notice({ tone = "success", children, onDismiss }) {
  if (!children) return null;
  return (
    <div className={`alert alert--${tone === "danger" ? "error" : tone}`} style={{ marginBottom: 14 }}>
      <span style={{ flex: 1 }}>{children}</span>
      {onDismiss && (
        <button type="button" className="modal-close" onClick={onDismiss} aria-label="Dismiss">
          <X size={14} />
        </button>
      )}
    </div>
  );
}

export function LoadingState({ label = "Loading…" }) {
  return (
    <div className="empty-state">
      <Spinner size={22} />
      <div className="empty-state__title mt-2">{label}</div>
    </div>
  );
}

/** A wrapper that keeps a wide table scrolling inside itself. */
export function TableWrap({ children }) {
  return <div className="data-table-wrap">{children}</div>;
}
