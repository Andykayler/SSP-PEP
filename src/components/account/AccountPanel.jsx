// "Your account": the person's WhatsApp number, whether alerts go there, and
// two-step sign-in.
//
// A number is only ever saved after a code sent to it has been typed back in
// (api/auth/otp.js) — otherwise anyone could point another person's alerts, or
// their two-step codes, at a phone that is not theirs. That is also why `phone`
// and `twoFactor` are not writable from here directly; see firestore.rules.
//
// Rendered through a portal into <body> so the dashboards' blanket button and
// heading styles (polish.css) do not reach it.
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { doc, getDoc, updateDoc, serverTimestamp } from "firebase/firestore";
import { sendEmailVerification } from "firebase/auth";
import { MessageCircle, ShieldCheck, X, Check } from "lucide-react";
import { auth, db } from "../../firebase";
import { apiPost } from "../../services/api";
import "./account.css";

const OTP = "/api/auth/otp";

export default function AccountPanel({ open, onClose, name, roleLabel }) {
  const [profile, setProfile] = useState(null);
  const [phone, setPhone] = useState("");
  const [stage, setStage] = useState(null);       // { purpose, to } while a code is awaited
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");

  const uid = auth.currentUser?.uid;

  const load = async () => {
    if (!uid) return;
    const snap = await getDoc(doc(db, "users", uid));
    const p = snap.exists() ? snap.data() : {};
    setProfile(p);
    setPhone((cur) => cur || p.phone || "");
  };

  useEffect(() => {
    if (!open) return undefined;
    setStage(null); setCode(""); setError(""); setNote("");
    load().catch(() => setError("Couldn't load your account."));
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  const start = async (purpose, body = {}) => {
    setBusy(true); setError(""); setNote("");
    try {
      const sent = await apiPost(OTP, { action: "request", purpose, ...body });
      setStage({ purpose, to: sent.to }); setCode("");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const confirm = async (e) => {
    e.preventDefault();
    setBusy(true); setError("");
    try {
      await apiPost(OTP, { action: "verify", purpose: stage.purpose, code });
      setNote(
        stage.purpose === "enable_2fa" ? "Two-step sign-in is on."
          : stage.purpose === "disable_2fa" ? "Two-step sign-in is off."
            : "Number confirmed. Alerts will come to this WhatsApp.",
      );
      setStage(null); setCode("");
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const toggleAlerts = async (on) => {
    setError("");
    try {
      await updateDoc(doc(db, "users", uid), { whatsappAlerts: on, updatedAt: serverTimestamp() });
      setProfile((p) => ({ ...p, whatsappAlerts: on }));
    } catch (err) {
      setError(err.message);
    }
  };

  const resendVerification = async () => {
    try {
      await sendEmailVerification(auth.currentUser);
      setNote("Verification email sent. Check your inbox.");
    } catch (err) {
      setError(err.message || "Couldn't send the email.");
    }
  };

  const verified = Boolean(profile?.phoneVerifiedAt);
  const alertsOn = profile?.whatsappAlerts !== false;
  const emailOk = auth.currentUser?.emailVerified;

  return createPortal(
    <div className="ap-overlay" role="presentation" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="ap-card" role="dialog" aria-modal="true" aria-label="Your account">
        <div className="ap-head">
          <div>
            <h3>{name || "Your account"}</h3>
            <p>{roleLabel}{auth.currentUser?.email ? ` · ${auth.currentUser.email}` : ""}</p>
          </div>
          <button type="button" className="ap-x" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>

        {error && <p className="ap-msg ap-msg--err">{error}</p>}
        {note && <p className="ap-msg ap-msg--ok"><Check size={14} /> {note}</p>}

        {!emailOk && auth.currentUser?.email && (
          <div className="ap-warn">
            Your email address isn't verified yet.
            <button type="button" className="ap-link" onClick={resendVerification}>Send the email again</button>
          </div>
        )}

        <section className="ap-sec">
          <h4><MessageCircle size={16} /> WhatsApp</h4>
          <p className="ap-hint">Your school's alerts (leave decisions, lesson-plan feedback, cover, urgent notices) can come to your WhatsApp as well as the bell.</p>

          {stage && (stage.purpose === "verify_phone" || stage.purpose === "enable_2fa" || stage.purpose === "disable_2fa") ? (
            <form onSubmit={confirm} className="ap-row ap-row--col">
              <label className="ap-label" htmlFor="ap-code">Enter the 6-digit code sent to {stage.to}</label>
              <div className="ap-row">
                <input id="ap-code" className="ap-input ap-input--code" inputMode="numeric" autoComplete="one-time-code" maxLength={6}
                  autoFocus value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="••••••" />
                <button type="submit" className="ap-btn ap-btn--primary" disabled={busy || code.length !== 6}>Confirm</button>
                <button type="button" className="ap-btn" onClick={() => { setStage(null); setError(""); }}>Cancel</button>
              </div>
            </form>
          ) : (
            <>
              <label className="ap-label" htmlFor="ap-phone">Your WhatsApp number</label>
              <div className="ap-row">
                <input id="ap-phone" className="ap-input" type="tel" inputMode="tel" value={phone}
                  onChange={(e) => setPhone(e.target.value)} placeholder="0991 234 567" />
                <button type="button" className="ap-btn ap-btn--primary" disabled={busy || !phone.trim()}
                  onClick={() => start("verify_phone", { phone })}>
                  {verified && phone === profile?.phone ? "Re-verify" : "Send code"}
                </button>
              </div>
              {verified && phone === profile?.phone && <p className="ap-ok"><ShieldCheck size={14} /> This number is confirmed.</p>}

              <label className="ap-switch">
                <input type="checkbox" checked={alertsOn} disabled={!verified} onChange={(e) => toggleAlerts(e.target.checked)} />
                <span>Send me alerts on WhatsApp</span>
              </label>
              {!verified && <p className="ap-hint">Confirm your number first to turn WhatsApp alerts on.</p>}
            </>
          )}
        </section>

        <section className="ap-sec">
          <h4><ShieldCheck size={16} /> Two-step sign-in</h4>
          <p className="ap-hint">
            After your password, we send a code to your WhatsApp. Recommended for anyone who handles money or manages
            other people's accounts.
          </p>
          {profile?.twoFactor ? (
            <div className="ap-row">
              <span className="ap-ok"><ShieldCheck size={14} /> On</span>
              <button type="button" className="ap-btn" disabled={busy} onClick={() => start("disable_2fa")}>Turn off</button>
            </div>
          ) : (
            <button type="button" className="ap-btn ap-btn--primary" disabled={busy || !verified}
              onClick={() => start("enable_2fa", { phone: profile?.phone || phone })}>
              Turn on
            </button>
          )}
          {!verified && !profile?.twoFactor && <p className="ap-hint">Confirm your WhatsApp number above first.</p>}
        </section>
      </div>
    </div>,
    document.body,
  );
}
