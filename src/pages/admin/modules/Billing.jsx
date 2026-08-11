import { IC } from "./icons";
import { Btn } from "./ui";

// ─── MODULE 4: Billing ────────────────────────────────────────────────────────
export default function Billing({ schoolData }) {
  const status = schoolData?.subscription_status || "trial";
  const plans = [
    { id: "trial",    name: "Trial",    price: "Free",       period: "30 days", desc: "For schools getting started.", features: ["Up to 5 users", "Core modules", "Email support"], current: status === "trial" },
    { id: "standard", name: "Standard", price: "MWK 45,000", period: "/ month", desc: "Best for growing schools.", features: ["Up to 30 users", "All modules", "Priority support", "Data exports"], current: status === "standard" },
    { id: "premium",  name: "Premium",  price: "MWK 95,000", period: "/ month", desc: "Full power for large institutions.", features: ["Unlimited users", "All modules + API", "24/7 support", "Custom reports", "Multi-branch"], current: status === "premium" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="module-title">Subscription &amp; Billing</h2>
        <p className="module-sub">Manage your plan and payment details</p>
      </div>
      <div className={`alert ${status === "trial" ? "alert--warning" : "alert--success"}`} style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <div>
          <p style={{ fontWeight: 700, fontSize: 14 }}>Current plan: <span style={{ textTransform: "capitalize" }}>{status}</span></p>
          {status === "trial" && <p style={{ fontSize: 12, marginTop: 3 }}>Upgrade to unlock all features.</p>}
        </div>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: 1, padding: "4px 12px", borderRadius: 8, background: status === "trial" ? "rgba(232,168,0,0.2)" : "rgba(34,197,94,0.2)", color: status === "trial" ? "var(--gold-lt)" : "#4ade80", fontWeight: 700 }}>
          {status === "trial" ? "Trial Active" : "Subscribed"}
        </span>
      </div>
      <div className="plan-grid">
        {plans.map(plan => (
          <div key={plan.id} className={`plan-card${plan.current ? " plan-card--featured" : ""}`}>
            <p className="plan-card__tier">{plan.name}</p>
            <p className="plan-card__name">{plan.name}</p>
            <p className="plan-card__price">{plan.price} <span className="plan-card__period">{plan.period}</span></p>
            <p className="plan-card__desc">{plan.desc}</p>
            <ul className="plan-card__features">
              {plan.features.map(f => <li key={f} className="plan-card__feature"><span className="plan-card__feature-icon">{IC.check}</span>{f}</li>)}
            </ul>
            {plan.current
              ? <div style={{ textAlign: "center", fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--teal-lt)", letterSpacing: 1 }}>CURRENT PLAN</div>
              : <Btn variant={plan.id === "premium" ? "gold" : "ghost"} size="sm" onClick={() => alert("Contact billing@ssp-pep.mw to upgrade")}>Upgrade</Btn>
            }
          </div>
        ))}
      </div>
      <div style={{ background: "var(--accent-pale)", border: "1px solid var(--border2)", borderRadius: 16, padding: 20 }}>
        <p style={{ fontWeight: 600, color: "var(--text)", marginBottom: 4 }}>Need to change your plan?</p>
        <p style={{ fontSize: 12.5, color: "var(--text2)" }}>Contact SSP-PEP billing: <span style={{ fontFamily: "var(--font-mono)", color: "var(--accent-lt)" }}>billing@ssp-pep.mw</span> or call <span style={{ fontFamily: "var(--font-mono)" }}>+265 1 XXX XXX</span>.</p>
      </div>
    </div>
  );
}
