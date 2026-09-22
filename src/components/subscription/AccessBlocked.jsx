// What a school sees when it may not use the platform right now: awaiting
// approval, turned away, suspended, or (for staff who cannot pay) lapsed.
//
// Shown instead of the dashboard, inside the same frame as sign-in so it reads
// as a state of the account rather than an error. It updates by itself — the
// hook underneath is a live subscription — so an approved school is let in
// without pressing anything.
import { Clock, Lock, X, CreditCard, Check, LogOut } from "lucide-react";
import AuthLayout from "../auth/AuthLayout";
import { BRAND } from "../brand";

const ICONS = {
  pending: Clock,
  rejected: X,
  suspended: Lock,
  trial_expired: CreditCard,
  past_due: CreditCard,
};

export default function AccessBlocked({ access, school, onSignOut }) {
  const Icon = ICONS[access.state] || Lock;
  const lapsed = access.state === "trial_expired" || access.state === "past_due";
  const name = school?.name || "your school";

  return (
    <AuthLayout>
      <div className="la-card la-done">
        <span className="la-done__icon" style={access.state === "pending" ? undefined : { background: "color-mix(in srgb, var(--lp-red) 14%, transparent)", color: "var(--lp-red)" }}>
          <Icon size={28} aria-hidden="true" />
        </span>
        <p className="lp-eyebrow" style={{ justifyContent: "center" }}>{name}</p>
        <h1>{access.title}</h1>
        <p className="la-done__body" style={{ marginTop: 10 }}>{access.message}</p>

        {access.state === "pending" && (
          <ul className="la-todo la-todo--steps" aria-label="Registration progress">
            <li className="is-done"><span className="la-todo__box"><Check size={12} strokeWidth={3} /></span>Registered</li>
            <li><span className="la-todo__box" />Under review by {BRAND}</li>
            <li><span className="la-todo__box" />Go live</li>
          </ul>
        )}

        {lapsed && (
          <p className="la-done__body">
            Only the school administrator or director can renew the subscription. Please ask them to sign in and open
            Billing.
          </p>
        )}

        <div className="la-done__actions">
          <button type="button" className="reg-btn reg-btn--ghost" onClick={onSignOut}>
            <LogOut size={16} aria-hidden="true" /> Sign out
          </button>
        </div>
      </div>
    </AuthLayout>
  );
}
