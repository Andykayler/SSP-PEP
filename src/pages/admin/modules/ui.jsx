import { useState } from "react";
import { IC } from "./icons";
import { roleMap } from "./constants";

// ─── Shared UI ────────────────────────────────────────────────────────────────
export const RoleBadge = ({ role }) => {
  const r = roleMap[role] || { label: role, badgeClass: "badge--blue" };
  return <span className={`badge ${r.badgeClass}`}><span className="badge__dot" />{r.label}</span>;
};

export const StatusPill = ({ active }) => (
  <span className={`status-pill ${active ? "status-pill--active" : "status-pill--suspended"}`}>
    <span className="status-pill__dot" />
    {active ? "Active" : "Suspended"}
  </span>
);

// Small inline icon badges for notification delivery status
export const NotifStatus = ({ email, sms }) => (
  <div style={{ display: "flex", gap: 4, marginTop: 4, flexWrap: "wrap" }}>
    {email !== undefined && (
      <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 6, fontFamily: "var(--font-mono)", letterSpacing: 0.5,
        background: email ? "rgba(34,197,94,0.15)" : "rgba(239,68,68,0.12)",
        color: email ? "#4ade80" : "#f87171" }}>
        {email ? "✓ Email" : "✗ Email"}
      </span>
    )}
    {sms !== undefined && (
      <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 6, fontFamily: "var(--font-mono)", letterSpacing: 0.5,
        background: sms ? "rgba(34,197,94,0.15)" : "rgba(239,68,68,0.12)",
        color: sms ? "#4ade80" : "#f87171" }}>
        {sms ? "✓ SMS" : "✗ SMS"}
      </span>
    )}
  </div>
);

export const Modal = ({ title, onClose, children, size = "md" }) => (
  <div className="modal-backdrop">
    <div className={`modal modal--${size}`}>
      <div className="modal__header">
        <span className="modal__title">{title}</span>
        <button className="modal__close" onClick={onClose}>{IC.close}</button>
      </div>
      <div className="modal__body">{children}</div>
    </div>
  </div>
);

export const Field = ({ label, required, error, children }) => (
  <div className="field">
    {label && <label className={`field__label${required ? " field__label--required" : ""}`}>{label}</label>}
    {children}
    {error && <span className="field__error">{error}</span>}
  </div>
);

export const Input = ({ label, required, error, ...props }) => (
  <Field label={label} required={required} error={error}>
    <input {...props} className={`field__input${error ? " field__input--error" : ""}`} />
  </Field>
);

export const Select = ({ label, required, error, children, ...props }) => (
  <Field label={label} required={required} error={error}>
    <select {...props} className={`field__select${error ? " field__select--error" : ""}`}>
      {children}
    </select>
  </Field>
);

export const Textarea = ({ label, ...props }) => (
  <Field label={label}>
    <textarea {...props} className="field__textarea" />
  </Field>
);

export const Btn = ({ children, variant = "primary", size = "md", loading, className = "", ...props }) => (
  <button
    {...props}
    disabled={loading || props.disabled}
    className={`btn btn--${variant} btn--${size} ${className}`}
  >
    {loading ? <span className="spinner" /> : children}
  </button>
);

export const Spinner = () => <span className="spinner spinner--dark" />;

export const EmptyState = ({ icon, title, sub, action }) => (
  <div className="empty-state">
    <div className="empty-state__icon">{icon}</div>
    <p className="empty-state__title">{title}</p>
    <p className="empty-state__sub">{sub}</p>
    {action}
  </div>
);

// ─── Student Code Badge ───────────────────────────────────────────────────────
export function StudentCodeBadge({ code }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }
  return (
    <span className="student-code-badge">
      <span className="student-code-badge__text">{code}</span>
      <button className="student-code-badge__copy" onClick={copy} title="Copy code">
        {copied ? <span style={{ color: "var(--teal)" }}>{IC.check}</span> : IC.copy}
      </button>
    </span>
  );
}

export function ActionBtn({ onClick, icon, title, hoverBg = "rgba(79,110,247,0.07)" }) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onClick}
      title={title}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        padding: 7, borderRadius: 8,
        background: hovered ? hoverBg : "none",
        border: "none", cursor: "pointer",
        color: hovered ? "var(--accent-lt)" : "var(--text3)",
        transition: "all .2s", display: "flex", alignItems: "center",
      }}
    >
      {icon}
    </button>
  );
}
