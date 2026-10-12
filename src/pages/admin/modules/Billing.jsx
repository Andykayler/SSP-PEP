import { useEffect, useState } from "react";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "../../../firebase";
import { quote, formatMWK, describeDiscount, SMS } from "../../../services/pricing";
import { IC } from "./icons";
import { Btn } from "./ui";
import PayChanguCheckout from "../../../components/payments/PayChanguCheckout";

// ─── MODULE 4: Billing ────────────────────────────────────────────────────────
// What a school pays is its active roll times the yearly rate per learner, so
// this page counts learners first and prices second. The rate lives in
// services/pricing.js; nothing here hardcodes a figure. The director's
// Subscription tab renders this same page.

/** Enrolment as billed: the active learners on the roll. */
function useBilledEnrolment(schoolCode) {
  const [state, setState] = useState({ loading: true, learners: 0, error: "" });

  useEffect(() => {
    let alive = true;

    (async () => {
      if (!schoolCode) {
        if (alive) setState({ loading: false, learners: 0, error: "" });
        return;
      }
      try {
        const snap = await getDocs(
          query(collection(db, "students"), where("schoolCode", "==", schoolCode))
        );
        // A withdrawn learner still has a record but is not billed for.
        const active = snap.docs
          .map(d => d.data())
          .filter(s => (s.status || "active") === "active");
        if (alive) setState({ loading: false, learners: active.length, error: "" });
      } catch (e) {
        console.error("Billing: enrolment lookup failed", e);
        if (alive) setState({ loading: false, learners: 0, error: "Could not read enrolment." });
      }
    })();

    return () => { alive = false; };
  }, [schoolCode]);

  return state;
}

export default function Billing({ schoolData, schoolCode, canPay = true }) {
  const status = schoolData?.subscription_status || "trial";
  const isTrial = status === "trial";

  const { loading, learners, error } = useBilledEnrolment(schoolCode);
  const [paying, setPaying] = useState(false);
  const [paid, setPaid] = useState(null);

  const q = quote({ learners, discount: schoolData?.discount });
  const rate = q.ratePerLearner;

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="module-title">Subscription &amp; Billing</h2>
          <p className="module-sub">Working out your yearly subscription from your enrolment</p>
        </div>
        <div className="page-loading"><div className="page-loading__spinner" /></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="module-title">Subscription &amp; Billing</h2>
        <p className="module-sub">{formatMWK(rate)} per learner, per year — your invoice follows your roll</p>
      </div>

      {/* ── Status ─────────────────────────────────────────────────────── */}
      <div className={`alert ${isTrial ? "alert--warning" : "alert--success"}`}
           style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <div>
          <p style={{ fontWeight: 700, fontSize: 14 }}>
            {isTrial ? "Trial — no invoices raised yet" : "Subscription active"}
          </p>
          <p style={{ fontSize: 12, marginTop: 3 }}>
            {isTrial
              ? "You keep full access during the trial. The figure below is what you would be billed at today's enrolment."
              : `Billed once a year: ${formatMWK(q.annualPayable)} for ${learners.toLocaleString()} learners.`}
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span style={{
            fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: 1, padding: "4px 12px",
            borderRadius: 8, fontWeight: 700,
            background: isTrial ? "rgba(232,168,0,0.2)" : "rgba(34,197,94,0.2)",
            color: isTrial ? "var(--gold-lt)" : "#4ade80",
          }}>
            {isTrial ? "Trial Active" : "Subscribed"}
          </span>
          {/* The amount is repriced server-side from the roll when the checkout
              opens, so the button cannot commit the school to a stale quote. */}
          {canPay && learners > 0 && (
            <Btn variant="gold" size="sm" onClick={() => setPaying(true)}>
              {IC.billing} Pay {formatMWK(q.annualPayable)} now
            </Btn>
          )}
        </div>
      </div>

      {paid && (
        <div className="alert alert--success">
          {IC.check}
          <span>
            Payment of {formatMWK(paid.amount)} received{paid.receiptNo ? ` — receipt ${paid.receiptNo}` : ""}.
            Your subscription is active. Refresh to see the updated status.
          </span>
        </div>
      )}

      {schoolData?.lastPaymentAt && !paid && (
        <p style={{ fontSize: 12, color: "var(--text3)" }}>
          Last payment: {formatMWK(schoolData.lastPaymentAmount)}
          {schoolData.paidThroughLabel ? ` · ${schoolData.paidThroughLabel}` : ""}
        </p>
      )}

      {error && <div className="alert alert--error">{error}</div>}

      {/* ── The sum ────────────────────────────────────────────────────── */}
      <div className="stat-strip">
        <div className="stat-card">
          <div className="stat-card__label">Billed learners</div>
          <div className="stat-card__value">{learners.toLocaleString()}</div>
          <div className="stat-card__sub">Active learners on your roll today</div>
        </div>
        <div className="stat-card">
          <div className="stat-card__label">Rate</div>
          <div className="stat-card__value">{formatMWK(rate, false)}</div>
          <div className="stat-card__sub">
            {q.discount ? `${describeDiscount(q.discount)} — standard ${formatMWK(q.standardRate, false)}` : "MWK per learner per year"}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-card__label">Yearly subscription</div>
          <div className="stat-card__value">{formatMWK(q.annualPayable)}</div>
          <div className="stat-card__sub">
            {learners.toLocaleString()} × {formatMWK(rate, false)}
          </div>
        </div>
      </div>

      {q.discount && (
        <div className="alert alert--success">
          <span>
            Your school has a discount: {describeDiscount(q.discount)}
            {q.discount.note ? ` (${q.discount.note})` : ""}. You save {formatMWK(q.saving)} a year.
          </span>
        </div>
      )}

      <p style={{ fontSize: 12.5, color: "var(--text2)" }}>
        Withdrawn learners are not billed. The amount charged is always worked out from your roll at the
        moment you pay.
      </p>

      {/* ── SMS wallet ─────────────────────────────────────────────────── */}
      <div style={{ background: "var(--accent-pale)", border: "1px solid var(--border2)", borderRadius: 16, padding: 20 }}>
        <p style={{ fontWeight: 600, color: "var(--text)", marginBottom: 4 }}>SMS wallet</p>
        <p style={{ fontSize: 12.5, color: "var(--text2)", marginBottom: 12 }}>
          Text messages are billed separately from your subscription, because they cost us a real
          per-message fee. Fee receipts, arrears notices and account credentials go by SMS; everything
          else reaches guardians through the app at no cost.
        </p>
        <div className="stat-strip">
          <div className="stat-card">
            <div className="stat-card__label">Included this term</div>
            <div className="stat-card__value">{q.includedSms.toLocaleString()}</div>
            <div className="stat-card__sub">{SMS.includedPer100PerTerm} per 100 learners</div>
          </div>
          <div className="stat-card">
            <div className="stat-card__label">Rate after that</div>
            <div className="stat-card__value">{formatMWK(SMS.pricePerMessage, false)}</div>
            <div className="stat-card__sub">MWK per message</div>
          </div>
          <div className="stat-card">
            <div className="stat-card__label">Top-up bundles</div>
            <div className="stat-card__value">{SMS.bundles[0].toLocaleString()}+</div>
            <div className="stat-card__sub">
              {SMS.bundles.map(b => b.toLocaleString()).join(" / ")} messages
            </div>
          </div>
        </div>
      </div>

      {/* ── Contact ────────────────────────────────────────────────────── */}
      <div style={{ background: "var(--accent-pale)", border: "1px solid var(--border2)", borderRadius: 16, padding: 20 }}>
        <p style={{ fontWeight: 600, color: "var(--text)", marginBottom: 4 }}>Questions about your invoice?</p>
        <p style={{ fontSize: 12.5, color: "var(--text2)" }}>
          Contact Acalink billing: <span style={{ fontFamily: "var(--font-mono)", color: "var(--accent-lt)" }}>billing@acalink.mw</span>
          {" "}or call <span style={{ fontFamily: "var(--font-mono)" }}>+265 1 XXX XXX</span>.
        </p>
      </div>

      {paying && (
        <PayChanguCheckout
          purpose="subscription"
          title="Pay your Acalink subscription"
          subtitle={`${learners.toLocaleString()} learners × ${formatMWK(rate)} · 1 year`}
          context={{}}
          defaultAmount={q.annualPayable}
          amountEditable={false}
          payerEmail={schoolData?.email || ""}
          payerPhone={schoolData?.phone || ""}
          onClose={() => setPaying(false)}
          onSettled={(tx) => setPaid(tx)}
        />
      )}
    </div>
  );
}
