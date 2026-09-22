// The slim strip above the page when a trial or subscription is close to
// ending (or has just ended and is in its grace period). Everything still
// works; this is the nudge. Only people who can actually pay get the button.
import { CreditCard, AlertTriangle } from "lucide-react";

export default function SubscriptionBanner({ access, canPay, onSubscribe }) {
  if (!access?.warn && !access?.restricted) return null;

  const urgent = access.restricted || access.state === "trial_grace" || access.state === "past_due_grace";
  return (
    <div
      role="status"
      style={{
        display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12, marginBottom: 20,
        padding: "12px 16px", borderRadius: "var(--radius-md, 12px)",
        border: `1px solid ${urgent ? "rgba(239,68,68,0.35)" : "rgba(232,168,0,0.35)"}`,
        background: urgent ? "var(--danger-pale)" : "var(--warning-pale)",
        color: urgent ? "var(--danger-light)" : "var(--warning-light)",
      }}
    >
      <AlertTriangle size={18} aria-hidden="true" style={{ flexShrink: 0 }} />
      <div style={{ flex: "1 1 240px", minWidth: 0 }}>
        <strong style={{ fontSize: 14 }}>{access.title}</strong>
        <div style={{ fontSize: 13, opacity: 0.9 }}>{access.message}</div>
      </div>
      {canPay && onSubscribe && (
        <button
          type="button"
          onClick={onSubscribe}
          style={{
            display: "inline-flex", alignItems: "center", gap: 8, minHeight: 38, padding: "0 16px",
            border: "none", borderRadius: 10, background: "var(--primary)", color: "#fff",
            fontWeight: 600, fontSize: 13, cursor: "pointer",
          }}
        >
          <CreditCard size={15} aria-hidden="true" /> Subscribe
        </button>
      )}
    </div>
  );
}
