// src/pages/PayReturn.jsx
// ─────────────────────────────────────────────────────────────────────────────
// Where PayChangu sends the payer's browser when the checkout closes.
//
// This page decides nothing. It asks the server what happened, and the server
// asks PayChangu — the query string it arrives with could say anything, and a
// page that trusted it would be a receipt generator for anyone who can edit a
// URL.
//
// It usually opens in the tab the checkout took over, with the portal still
// sitting in the tab behind it. So the copy is written for someone who may
// close this window immediately: the outcome first, and a clear statement that
// the ledger is already updated whether or not they wait.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { CheckCircle2, XCircle, Clock, ArrowRight } from "lucide-react";
import { auth } from "../firebase";
import { watchTransaction } from "../services/paychangu";
import { money } from "../components/ui/format";

const PORTALS = {
  admin: "/admin",
  director: "/director",
  head_teacher: "/head",
  class_teacher: "/teacher",
  bursar: "/bursar",
};

export default function PayReturn() {
  const txRef = new URLSearchParams(window.location.search).get("tx_ref") || "";

  // A missing reference is knowable before the first render, so it is the
  // initial state rather than something an effect corrects — otherwise the
  // page paints "checking your payment" for a link that can never resolve.
  const [state, setState] = useState(() =>
    txRef
      ? { phase: "loading", tx: null, error: "" }
      : { phase: "error", tx: null, error: "This link is missing its payment reference." });

  useEffect(() => {
    if (!txRef) return undefined;

    let stop = null;
    // The status endpoint needs a signed-in caller, and a tab opened by the
    // gateway starts before Firebase has restored the session — so wait for
    // the auth state rather than firing a request that would 401.
    const unsub = onAuthStateChanged(auth, (user) => {
      if (!user) {
        // Not a failure. Staff are signed in on this device; a parent who paid
        // from the Acalink app or WhatsApp is not — they opened this page from
        // PayChangu's browser tab. Their result is on the app, and the payment
        // is confirmed on our servers either way.
        setState({ phase: "elsewhere", tx: null, error: "" });
        return;
      }

      stop?.();
      stop = watchTransaction(txRef, {
        onUpdate: (tx) => setState((s) => (s.phase === "loading" ? { phase: "pending", tx, error: "" } : { ...s, tx })),
        onSettled: (tx) => setState({ phase: tx.status === "success" ? "success" : "failed", tx, error: "" }),
        onError: (err) => setState((s) => ({ ...s, error: err.message })),
      });
    });

    return () => { unsub(); stop?.(); };
  }, [txRef]);

  const tx = state.tx;
  const backHref = state.phase === "elsewhere"
    ? "https://parents.acalinks.com"
    : PORTALS[tx?.purpose === "subscription" ? "admin" : "bursar"] || "/";

  return (
    <div style={{
      minHeight: "100vh", background: "var(--bg)", display: "flex",
      alignItems: "center", justifyContent: "center", padding: 24,
    }}>
      <div className="card" style={{ maxWidth: 460, width: "100%", padding: 32, textAlign: "center" }}>
        {state.phase === "loading" && (
          <>
            <div className="page-loading__spinner" style={{ margin: "0 auto 18px" }} />
            <p className="module-title" style={{ fontSize: 18 }}>Checking your payment…</p>
          </>
        )}

        {state.phase === "pending" && (
          <>
            <Clock size={46} style={{ color: "var(--primary)", margin: "0 auto 14px" }} />
            <p className="module-title" style={{ fontSize: 18 }}>Still with the gateway</p>
            <p className="module-sub">
              Mobile money can take a minute or two to clear. You can close this window —
              the payment is confirmed on our servers either way, and the receipt appears
              in the portal as soon as it lands.
            </p>
          </>
        )}

        {state.phase === "success" && (
          <>
            <CheckCircle2 size={46} style={{ color: "var(--success, #22c55e)", margin: "0 auto 14px" }} />
            <p className="module-title" style={{ fontSize: 18 }}>Payment received</p>
            <p style={{ fontWeight: 700, fontSize: 26, margin: "8px 0 2px" }}>{money(tx?.amount)}</p>
            {tx?.receiptNo && (
              <p className="text-muted" style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}>
                Receipt {tx.receiptNo}
              </p>
            )}
            <p className="module-sub" style={{ marginTop: 12 }}>
              {tx?.purpose === "subscription"
                ? "Your Acalink subscription is active."
                : `Credited to ${tx?.studentName || "the student's account"}.`}
            </p>
          </>
        )}

        {state.phase === "failed" && (
          <>
            <XCircle size={46} style={{ color: "var(--danger, #ef4444)", margin: "0 auto 14px" }} />
            <p className="module-title" style={{ fontSize: 18 }}>Payment not completed</p>
            <p className="module-sub">
              Nothing has been charged. You can start the payment again from the portal.
            </p>
          </>
        )}

        {state.phase === "elsewhere" && (
          <>
            <CheckCircle2 size={46} style={{ color: "var(--primary)", margin: "0 auto 14px" }} />
            <p className="module-title" style={{ fontSize: 18 }}>Thank you</p>
            <p className="module-sub">
              If you approved the payment, it is being confirmed. You can close this page and go
              back to Acalink — your receipt appears there once it clears, and you will also be told
              by message. If you did not finish paying, nothing has been charged.
            </p>
          </>
        )}

        {state.phase === "error" && (
          <>
            <XCircle size={46} style={{ color: "var(--danger, #ef4444)", margin: "0 auto 14px" }} />
            <p className="module-title" style={{ fontSize: 18 }}>Cannot show this payment</p>
            <p className="module-sub">{state.error}</p>
          </>
        )}

        {state.phase !== "loading" && state.phase !== "error" && state.phase !== "elsewhere" && state.error && (
          <p className="text-muted" style={{ fontSize: 12, marginTop: 10 }}>{state.error}</p>
        )}

        <a
          href={backHref}
          className="btn btn--accent btn--md"
          style={{ marginTop: 22, display: "inline-flex", gap: 8, alignItems: "center" }}
        >
          {state.phase === "elsewhere" ? "Open Acalink" : "Back to the portal"} <ArrowRight size={15} />
        </a>
      </div>
    </div>
  );
}
