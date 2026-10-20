// src/components/payments/OnlinePaymentAccount.jsx
// ─────────────────────────────────────────────────────────────────────────────
// Admin → School Settings: which PayChangu account the school's online fee
// payments go through, and a way to ask for its own.
//
// Says plainly what is true today — payments go through Acalink's account and
// the school's share is paid out to its mobile money number — so a school that
// never touches this card is not left wondering. Asking changes nothing by
// itself; it only tells Acalink the school wants to move.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useState } from "react";
import { Landmark, CheckCircle2 } from "lucide-react";
import { auth } from "../../firebase";
import { startConnect } from "../../services/paychangu";
import { fetchConnectRequest, requestOwnAccount, CONNECT_REQUESTED } from "../../services/connectRequests";

export default function OnlinePaymentAccount({ schoolCode }) {
  const [request, setRequest] = useState(undefined); // undefined = loading, null = none
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!schoolCode) return undefined;
    let alive = true;
    fetchConnectRequest(schoolCode)
      .then((r) => { if (alive) setRequest(r); })
      .catch(() => { if (alive) setRequest(null); });
    return () => { alive = false; };
  }, [schoolCode]);

  async function ask() {
    setBusy(true); setError("");
    try {
      await requestOwnAccount({ schoolCode, user: auth.currentUser });
      setRequest(await fetchConnectRequest(schoolCode));
    } catch (err) {
      console.error(err);
      setError("Could not send your request. Please try again.");
    }
    setBusy(false);
  }

  // Sends the administrator to PayChangu to approve the Acalink app on their
  // own account. The page they come back to is /pay/connected.
  async function connect() {
    setBusy(true); setError("");
    try {
      const { url } = await startConnect();
      window.location.assign(url);
    } catch (err) {
      setError(err.message || "Could not start the connection.");
      setBusy(false);
    }
  }

  const requested = request?.status === CONNECT_REQUESTED;

  return (
    <div className="card" style={{ padding: 28 }}>
      <p style={{ fontFamily: "var(--font-display)", fontSize: 16, color: "var(--text)", letterSpacing: 0.5, display: "flex", alignItems: "center", gap: 8 }}>
        <Landmark size={16} aria-hidden="true" /> Online Payment Account
      </p>
      <p style={{ fontSize: 12, color: "var(--text3)", marginTop: 2, marginBottom: 14 }}>
        Right now families&apos; online payments are collected by Acalink and paid out to your
        bank account when the bursar requests it and the director approves. If you would rather
        receive them straight into your school&apos;s own PayChangu account, connect it
        below. You need a PayChangu account first.
      </p>

      {error && <div className="alert alert--error" style={{ marginBottom: 12 }}><span>{error}</span></div>}

      {request === undefined ? (
        <p className="text-muted" style={{ fontSize: 13 }}>Checking…</p>
      ) : (
        <>
          {requested && (
            <div className="alert alert--success" style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12 }}>
              <CheckCircle2 size={16} aria-hidden="true" />
              <span>Request sent. Acalink will contact you. Until then nothing changes.</span>
            </div>
          )}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, flexWrap: "wrap" }}>
            {!requested && (
              <button type="button" className="btn btn--secondary btn--md" onClick={ask} disabled={busy}>
                Ask Acalink to set it up
              </button>
            )}
            <button type="button" className="btn btn--accent btn--md" onClick={connect} disabled={busy}>
              {busy ? "Opening PayChangu…" : "Connect my PayChangu account"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
