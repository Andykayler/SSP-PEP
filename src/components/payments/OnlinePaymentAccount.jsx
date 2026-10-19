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

  const requested = request?.status === CONNECT_REQUESTED;

  return (
    <div className="card" style={{ padding: 28 }}>
      <p style={{ fontFamily: "var(--font-display)", fontSize: 16, color: "var(--text)", letterSpacing: 0.5, display: "flex", alignItems: "center", gap: 8 }}>
        <Landmark size={16} aria-hidden="true" /> Online Payment Account
      </p>
      <p style={{ fontSize: 12, color: "var(--text3)", marginTop: 2, marginBottom: 14 }}>
        Right now families&apos; online payments go through Acalink&apos;s PayChangu account and
        your share is paid out to the mobile money number above. If you would rather
        receive them straight into your school&apos;s own PayChangu account, ask below.
      </p>

      {error && <div className="alert alert--error" style={{ marginBottom: 12 }}><span>{error}</span></div>}

      {request === undefined ? (
        <p className="text-muted" style={{ fontSize: 13 }}>Checking…</p>
      ) : requested ? (
        <div className="alert alert--success" style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <CheckCircle2 size={16} aria-hidden="true" />
          <span>
            Request sent. Acalink will contact you to link your PayChangu account. Until then
            nothing changes and your payments keep arriving as before.
          </span>
        </div>
      ) : (
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button type="button" className="btn btn--accent btn--md" onClick={ask} disabled={busy}>
            {busy ? "Sending…" : "Request my own PayChangu account"}
          </button>
        </div>
      )}
    </div>
  );
}
