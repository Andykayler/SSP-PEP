import { useEffect, useState } from "react";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "../../../firebase";
import {
  quote, compareCadences, formatMWK, bandFor,
  BANDS, MIN_PLATFORM_PER_TERM, BOARDING_PER_TERM, SMS, TERMS_PER_YEAR,
  DEFAULT_CADENCE,
} from "../../../services/pricing";
import { IC } from "./icons";
import { Btn } from "./ui";
import PayChanguCheckout from "../../../components/payments/PayChanguCheckout";

// ─── MODULE 4: Billing ────────────────────────────────────────────────────────
// What a school pays is derived from its own enrolment, not from a plan someone
// picked at sign-up — so this page counts learners first and prices second. The
// rates themselves live in services/pricing.js; nothing here hardcodes a figure.

/** Enrolment as billed: active learners, and how many of them board. */
function useBilledEnrolment(schoolCode) {
  const [state, setState] = useState({ loading: true, learners: 0, boarders: 0, error: "" });

  useEffect(() => {
    let alive = true;

    (async () => {
      if (!schoolCode) {
        if (alive) setState({ loading: false, learners: 0, boarders: 0, error: "" });
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
        const boarders = active
          .filter(s => (s.residence || "").toLowerCase() === "boarding").length;
        if (alive) setState({ loading: false, learners: active.length, boarders, error: "" });
      } catch (e) {
        console.error("Billing: enrolment lookup failed", e);
        if (alive) setState({ loading: false, learners: 0, boarders: 0, error: "Could not read enrolment." });
      }
    })();

    return () => { alive = false; };
  }, [schoolCode]);

  return state;
}

export default function Billing({ schoolData, schoolCode, canPay = true }) {
  const status = schoolData?.subscription_status || "trial";
  const isTrial = status === "trial";

  const { loading, learners, boarders, error } = useBilledEnrolment(schoolCode);
  const [cadence, setCadence] = useState(schoolData?.billing_cadence || DEFAULT_CADENCE);
  const [paying, setPaying] = useState(false);
  const [paid, setPaid] = useState(null);

  const q = quote({ learners, boarders, cadence });
  const options = compareCadences({ learners, boarders });
  const band = bandFor(learners || 1);

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="module-title">Subscription &amp; Billing</h2>
          <p className="module-sub">Working out this term's invoice from your enrolment</p>
        </div>
        <div className="page-loading"><div className="page-loading__spinner" /></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="module-title">Subscription &amp; Billing</h2>
        <p className="module-sub">Priced per learner, per term — your invoice follows your roll</p>
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
              ? "You keep full access during the trial. The figures below are what you would be billed at today's enrolment."
              : `Billed ${q.cadence.label.toLowerCase()} at ${formatMWK(q.perInvoice)} per invoice.`}
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
          {/* Paying is offered wherever the invoice is shown, because the
              moment an administrator has read the figure is the moment they
              are willing to settle it. The amount is repriced server-side from
              the roll when the checkout opens, so the button cannot commit the
              school to a stale quote. */}
          {canPay && learners > 0 && (
            <Btn variant="gold" size="sm" onClick={() => setPaying(true)}>
              {IC.billing} Pay {formatMWK(q.perInvoice)} now
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

      {/* ── Billed enrolment ───────────────────────────────────────────── */}
      <div className="stat-strip">
        <div className="stat-card">
          <div className="stat-card__label">Billed learners</div>
          <div className="stat-card__value">{learners.toLocaleString()}</div>
          <div className="stat-card__sub">Active roll, snapshotted day 14 of term</div>
        </div>
        <div className="stat-card">
          <div className="stat-card__label">Of which boarding</div>
          <div className="stat-card__value">{boarders.toLocaleString()}</div>
          <div className="stat-card__sub">{formatMWK(BOARDING_PER_TERM)} per boarder per term</div>
        </div>
        <div className="stat-card">
          <div className="stat-card__label">Your band</div>
          <div className="stat-card__value">Band {band.id}</div>
          <div className="stat-card__sub">{formatMWK(band.rate)} per learner per term</div>
        </div>
        <div className="stat-card">
          <div className="stat-card__label">Cost per learner / year</div>
          <div className="stat-card__value">{formatMWK(q.perLearnerPerYear, false)}</div>
          <div className="stat-card__sub">Falls as your school grows</div>
        </div>
      </div>

      {/* ── Cadence ────────────────────────────────────────────────────── */}
      <div>
        <p style={{ fontWeight: 600, color: "var(--text)", marginBottom: 10 }}>How you would like to pay</p>
        <div className="plan-grid">
          {options.map(opt => {
            const selected = opt.cadence.id === cadence;
            return (
              <div key={opt.cadence.id} className={`plan-card${selected ? " plan-card--featured" : ""}`}>
                <p className="plan-card__tier">
                  {opt.cadence.id === "annual" ? "Best value" : opt.cadence.id === "termly" ? "Recommended" : "On request"}
                </p>
                <p className="plan-card__name">{opt.cadence.label}</p>
                <p className="plan-card__price">
                  {formatMWK(opt.perInvoice)}
                  <span className="plan-card__period">
                    {opt.cadence.invoicesPerYear === 1 ? " / year" :
                     opt.cadence.invoicesPerYear === TERMS_PER_YEAR ? " / term" : " / month"}
                  </span>
                </p>
                <p className="plan-card__desc">{opt.cadence.note}</p>
                <ul className="plan-card__features">
                  <li className="plan-card__feature">
                    <span className="plan-card__feature-icon">{IC.check}</span>
                    {formatMWK(opt.annualPayable)} a year
                  </li>
                  <li className="plan-card__feature">
                    <span className="plan-card__feature-icon">{IC.check}</span>
                    {opt.savingVsTermly > 0
                      ? `Saves ${formatMWK(opt.savingVsTermly)} vs termly`
                      : opt.savingVsTermly < 0
                        ? `${formatMWK(Math.abs(opt.savingVsTermly))} more than termly`
                        : "List price"}
                  </li>
                  <li className="plan-card__feature">
                    <span className="plan-card__feature-icon">{IC.check}</span>
                    {opt.cadence.invoicesPerYear} invoice{opt.cadence.invoicesPerYear === 1 ? "" : "s"} a year
                  </li>
                </ul>
                {selected
                  ? <div style={{ textAlign: "center", fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--teal-lt)", letterSpacing: 1 }}>SELECTED</div>
                  : <Btn variant={opt.cadence.id === "annual" ? "gold" : "ghost"} size="sm"
                         onClick={() => setCadence(opt.cadence.id)}>Show this</Btn>}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── How the invoice is built ───────────────────────────────────── */}
      <div>
        <p style={{ fontWeight: 600, color: "var(--text)", marginBottom: 4 }}>How this term's invoice is built</p>
        <p style={{ fontSize: 12.5, color: "var(--text2)", marginBottom: 10 }}>
          Learners are priced in the band they fall into, not all at one rate — so the next learner
          you enrol never costs more than the last.
        </p>
        <div className="data-table-wrap">
          <table className="data-table data-table--stack">
            <thead>
              <tr>
                <th>Band</th>
                <th>Learners</th>
                <th>Rate / learner / term</th>
                <th style={{ textAlign: "right" }}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {q.breakdown.length === 0 && (
                <tr><td colSpan={4} data-label="Band" style={{ color: "var(--text-muted)" }}>
                  No active learners on the roll yet.
                </td></tr>
              )}
              {q.breakdown.map(row => (
                <tr key={row.id}>
                  <td data-label="Band">
                    <div className="data-table__primary">Band {row.id}</div>
                    <div className="data-table__meta">
                      {row.from.toLocaleString()}{row.to === Infinity ? "+" : `–${row.to.toLocaleString()}`}
                    </div>
                  </td>
                  <td data-label="Learners">{row.learners.toLocaleString()}</td>
                  <td data-label="Rate">{formatMWK(row.rate)}</td>
                  <td data-label="Amount" style={{ textAlign: "right" }}>{formatMWK(row.amount)}</td>
                </tr>
              ))}

              {q.floorApplied && (
                <tr>
                  <td data-label="Band" colSpan={3}>
                    <div className="data-table__primary">Minimum invoice</div>
                    <div className="data-table__meta">
                      Bands come to {formatMWK(q.bandTotal)}; the floor is {formatMWK(MIN_PLATFORM_PER_TERM)}
                    </div>
                  </td>
                  <td data-label="Amount" style={{ textAlign: "right" }}>
                    {formatMWK(MIN_PLATFORM_PER_TERM - q.bandTotal)}
                  </td>
                </tr>
              )}

              {q.boardingPerTerm > 0 && (
                <tr>
                  <td data-label="Band" colSpan={3}>
                    <div className="data-table__primary">Boarding add-on</div>
                    <div className="data-table__meta">
                      {q.boarders.toLocaleString()} boarders x {formatMWK(BOARDING_PER_TERM)}
                    </div>
                  </td>
                  <td data-label="Amount" style={{ textAlign: "right" }}>{formatMWK(q.boardingPerTerm)}</td>
                </tr>
              )}

              <tr>
                <td data-label="Band" colSpan={3} style={{ fontWeight: 700, color: "var(--text)" }}>
                  Total per term
                </td>
                <td data-label="Amount" style={{ textAlign: "right", fontWeight: 700, color: "var(--text)" }}>
                  {formatMWK(q.listPerTerm)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p style={{ fontSize: 11.5, color: "var(--text-muted)", marginTop: 8 }}>
          {TERMS_PER_YEAR} terms a year. Enrolment is locked on day 14 of each term — learners who
          join or leave after that are picked up on the next invoice, not this one.
        </p>
      </div>

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

      {/* ── Onboarding ─────────────────────────────────────────────────── */}
      {isTrial && (
        <div className="alert alert--info" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
          <div>
            <p style={{ fontWeight: 700, fontSize: 13.5 }}>
              One-time setup: {q.onboarding === null ? "by quote" : formatMWK(q.onboarding)}
            </p>
            <p style={{ fontSize: 12, marginTop: 3 }}>
              Covers data import, fee-structure setup and staff training. Waived if you prepay annually.
            </p>
          </div>
        </div>
      )}

      {/* ── Contact ────────────────────────────────────────────────────── */}
      <div style={{ background: "var(--accent-pale)", border: "1px solid var(--border2)", borderRadius: 16, padding: 20 }}>
        <p style={{ fontWeight: 600, color: "var(--text)", marginBottom: 4 }}>Questions about your invoice?</p>
        <p style={{ fontSize: 12.5, color: "var(--text2)" }}>
          Contact Acalink billing: <span style={{ fontFamily: "var(--font-mono)", color: "var(--accent-lt)" }}>billing@acalink.mw</span>
          {" "}or call <span style={{ fontFamily: "var(--font-mono)" }}>+265 1 XXX XXX</span>.
          Rates are reviewed once a year, effective Term 1.
        </p>
      </div>

      {paying && (
        <PayChanguCheckout
          purpose="subscription"
          title="Pay your Acalink subscription"
          subtitle={`${q.cadence.label} · ${learners.toLocaleString()} learners`}
          context={{ cadence }}
          defaultAmount={q.perInvoice}
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
