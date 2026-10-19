// src/pages/PayConnected.jsx
// ─────────────────────────────────────────────────────────────────────────────
// Where PayChangu sends a school's browser after it approves (or declines) the
// Acalink app on its own PayChangu account — the redirect URL registered on the
// Connect app.
//
// PayChangu returns the school with an access token in the address. So, unlike
// /pay/return, this page DOES receive something sensitive, and its job is to
// get it off the screen and into the right hands quickly:
//
//   • it takes the query string, removes it from the address bar at once (so it
//     is not left in history, a screenshot or a shared link),
//   • and hands it to the server with the administrator's sign-in. The server
//     only accepts it from the administrator who started this connection, within
//     half an hour, and keeps it where no browser can read it.
//
// Nothing from the address is ever displayed, and the page decides nothing: that
// the school is connected is for the server to say, not the URL.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { CheckCircle2, XCircle, ArrowRight } from "lucide-react";
import { auth } from "../firebase";
import { completeConnect } from "../services/paychangu";

// Read once, before any render or effect, and scrubbed from the address bar.
const RETURNED = (() => {
  const params = Object.fromEntries(new URLSearchParams(window.location.search));
  if (Object.keys(params).length) window.history.replaceState(null, "", window.location.pathname);
  return params;
})();

export default function PayConnected() {
  const hasParams = Object.keys(RETURNED).length > 0;
  const [state, setState] = useState(hasParams ? "working" : "nothing");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!hasParams) return undefined;
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setState("signin");
        return;
      }
      try {
        await completeConnect(RETURNED);
        setState("done");
      } catch (err) {
        setError(err.message || "Could not finish the connection.");
        setState("error");
      }
    });
    return () => unsub();
  }, [hasParams]);

  return (
    <div style={{
      minHeight: "100vh", background: "var(--bg)", display: "flex",
      alignItems: "center", justifyContent: "center", padding: 24,
    }}>
      <div className="card" style={{ maxWidth: 460, width: "100%", padding: 32, textAlign: "center" }}>
        {state === "working" && (
          <>
            <div className="page-loading__spinner" style={{ margin: "0 auto 18px" }} />
            <p className="module-title" style={{ fontSize: 18 }}>Finishing your connection…</p>
          </>
        )}

        {state === "done" && (
          <>
            <CheckCircle2 size={46} style={{ color: "var(--success, #22c55e)", margin: "0 auto 14px" }} />
            <p className="module-title" style={{ fontSize: 18 }}>Connection received</p>
            <p className="module-sub">
              Acalink has your PayChangu approval and will switch your school&apos;s online
              payments over. Until then they keep working as before.
            </p>
          </>
        )}

        {(state === "signin" || state === "error" || state === "nothing") && (
          <>
            <XCircle size={46} style={{ color: "var(--danger, #ef4444)", margin: "0 auto 14px" }} />
            <p className="module-title" style={{ fontSize: 18 }}>
              {state === "nothing" ? "Nothing to finish here" : "Could not finish the connection"}
            </p>
            <p className="module-sub">
              {state === "signin" && "Sign in as your school administrator in this browser, then start again from School Settings."}
              {state === "error" && error}
              {state === "nothing" && "Start from School Settings → Online Payment Account."}
            </p>
          </>
        )}

        <a
          href="/admin"
          className="btn btn--accent btn--md"
          style={{ marginTop: 22, display: "inline-flex", gap: 8, alignItems: "center" }}
        >
          Back to the portal <ArrowRight size={15} />
        </a>
      </div>
    </div>
  );
}
