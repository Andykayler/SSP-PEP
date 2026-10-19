// src/pages/PayConnected.jsx
// ─────────────────────────────────────────────────────────────────────────────
// Where PayChangu sends a school's browser after it approves (or declines) the
// Acalink app on its own PayChangu account — the redirect URL to give PayChangu
// when the Connect app is created.
//
// Like /pay/return, this page decides nothing. Whatever is in the query string
// could be written by anyone who can edit a URL, so it is never shown as a
// fact and never trusted to mark a school as connected. It tells the person
// what happens next and sends them back to the portal, where the real state
// lives. It needs no sign-in, because the browser that lands here comes from
// another site and may not have restored its session yet.
// ─────────────────────────────────────────────────────────────────────────────
import { CheckCircle2, ArrowRight } from "lucide-react";

export default function PayConnected() {
  return (
    <div style={{
      minHeight: "100vh", background: "var(--bg)", display: "flex",
      alignItems: "center", justifyContent: "center", padding: 24,
    }}>
      <div className="card" style={{ maxWidth: 460, width: "100%", padding: 32, textAlign: "center" }}>
        <CheckCircle2 size={46} style={{ color: "var(--primary)", margin: "0 auto 14px" }} />
        <p className="module-title" style={{ fontSize: 18 }}>Back from PayChangu</p>
        <p className="module-sub">
          If you approved the connection, Acalink will confirm it on our servers and
          your school&apos;s online fee payments will start going to your own PayChangu
          account. Until it is confirmed, payments keep working as before.
        </p>
        <p className="module-sub" style={{ marginTop: 10 }}>
          You can close this window and check the status in your portal under
          School Settings.
        </p>
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
