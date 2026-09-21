// src/pages/SignIn.jsx
import { useState, useEffect, useRef } from "react";
import { auth, db } from "../firebase";
import {
  signInWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  updatePassword,
} from "firebase/auth";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { Check } from "lucide-react";
import AuthLayout from "../components/auth/AuthLayout";
import "./signin.css";

const ROLES = {
  admin:         { label: "Administrator",   redirectTo: "/admin"   },
  director:      { label: "Director",        redirectTo: "/director" },
  head_teacher:  { label: "Head Teacher",    redirectTo: "/head"    },
  class_teacher: { label: "Class Teacher",   redirectTo: "/teacher" },
  bursar:        { label: "Bursar / Fees",   redirectTo: "/bursar"  },
  librarian:     { label: "Librarian",       redirectTo: "/library" },
};

// ─── Icons ────────────────────────────────────────────────────────────────────
const IconMail = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
  </svg>
);
const IconLock = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
  </svg>
);
const IconEye = ({ slash }) => slash ? (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
  </svg>
) : (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
  </svg>
);
const IconWarn = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" style={{ flexShrink: 0 }}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
  </svg>
);
const IconCheck = ({ size = 24 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);
const IconShield = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
  </svg>
);
const IconArrow = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
  </svg>
);
const Spinner = () => (
  <svg className="spinner" width="14" height="14" viewBox="0 0 24 24" fill="none">
    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeOpacity="0.2" />
    <path fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
  </svg>
);

// ─── Password strength helpers ────────────────────────────────────────────────
function getStrength(pw) {
  let score = 0;
  if (pw.length >= 8)  score++;
  if (pw.length >= 12) score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  return Math.min(score, 4); // 0-4
}
const strengthLabels = ["", "Weak", "Fair", "Good", "Strong"];
const strengthClasses = ["", "active-weak", "active-fair", "active-good", "active-strong"];

// ─── Forgot Password Modal ────────────────────────────────────────────────────
const ForgotPasswordModal = ({ onClose }) => {
  const [email, setEmail]     = useState("");
  const [sent, setSent]       = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr]         = useState("");

  const handleSend = async (e) => {
    e.preventDefault();
    if (!email) return;
    setLoading(true); setErr("");
    try {
      await sendPasswordResetEmail(auth, email.trim());
      setSent(true);
    } catch {
      setErr("Could not send reset email. Please check the address.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="la-modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="la-modal" role="dialog" aria-modal="true" aria-label="Reset password">
        <button type="button" className="la-modal__close" onClick={onClose} aria-label="Close">✕</button>
        <p className="lp-eyebrow">Account recovery</p>
        <h3 className="la-modal__title">Reset your password</h3>
        {sent ? (
          <div className="la-modal__done">
            <div className="success-circle"><IconCheck size={26} /></div>
            <strong>Reset link sent</strong>
            <p>Check your inbox at <span className="highlight">{email}</span></p>
            <button type="button" className="submit-btn" onClick={onClose} style={{ marginTop: 0 }}>Back to sign in</button>
          </div>
        ) : (
          <form onSubmit={handleSend}>
            <p className="la-modal__desc">Enter the email address for your account and we'll send a password reset link.</p>
            {err && <p className="la-modal__error">{err}</p>}
            <div className="field-group">
              <label className="field-label">Email Address</label>
              <div className="field-wrap">
                <span className="field-icon"><IconMail /></span>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="your@email.mw" className="field-input" required />
              </div>
            </div>
            <button type="submit" className="submit-btn" disabled={loading || !email} style={{ marginTop: 8 }}>
              {loading ? <><Spinner /> Sending…</> : "Send reset link"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};

// ─── Force Change Password Screen ─────────────────────────────────────────────
// Shown when mustChangePassword === true on the user's Firestore document.
// Updates Firebase Auth password + clears the flag, then redirects.
const ForceChangePassword = ({ firebaseUser, redirectTo, userDisplayName }) => {
  const [newPw, setNewPw]         = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [showNew, setShowNew]     = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState("");

  const strength   = getStrength(newPw);
  const rules = [
    { label: "At least 8 characters",          met: newPw.length >= 8 },
    { label: "At least one uppercase letter",  met: /[A-Z]/.test(newPw) },
    { label: "At least one number",            met: /[0-9]/.test(newPw) },
    { label: "At least one special character", met: /[^A-Za-z0-9]/.test(newPw) },
  ];

  const allRulesMet   = rules.every(r => r.met);
  const passwordsMatch = newPw && confirmPw && newPw === confirmPw;
  const canSubmit      = allRulesMet && passwordsMatch && !loading;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!canSubmit) return;

    setLoading(true); 
    setError("");

    try {
      // 1. Update Firebase Auth password
      await updatePassword(firebaseUser, newPw);

      // 2. Clear the flag in Firestore (NO serverTimestamp needed here)
      await updateDoc(doc(db, "users", firebaseUser.uid), {
        mustChangePassword: false,
        updatedAt: new Date()                    // Use normal Date instead
      });

      // Success
      window.location.href = redirectTo;

    } catch (err) {
      console.error(err);
      if (err.code === "auth/requires-recent-login") {
        setError("Your session has expired. Please sign in again.");
      } else {
        setError("Failed to update password: " + (err.message || "Unknown error"));
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="la-card">
            <p className="change-pw-tag">Security required</p>
            <h1 className="change-pw-title">Set your password</h1>

            <div className="pw-warning">
              <span className="pw-warning-icon"><IconWarn /></span>
              <p className="pw-warning-text">
                You're using a <strong>system-generated password</strong>. You must set a personal password before accessing your dashboard.
                {userDisplayName && <> Welcome, <strong>{userDisplayName}</strong>.</>}
              </p>
            </div>

            <p className="change-pw-desc">
              Choose a strong password you'll remember. It must meet all the requirements below.
            </p>

            {error && (
              <div className="auth-error" style={{ marginBottom: 18 }}>
                <span className="auth-error-icon"><IconWarn /></span>
                <p className="auth-error-msg">{error}</p>
              </div>
            )}

            <form onSubmit={handleSubmit}>
              {/* New password */}
              <div className="field-group">
                <label className="field-label">New Password</label>
                <div className="field-wrap">
                  <span className="field-icon"><IconLock /></span>
                  <input
                    type={showNew ? "text" : "password"}
                    value={newPw}
                    onChange={(e) => { setNewPw(e.target.value); setError(""); }}
                    placeholder="Create a strong password"
                    className={`field-input${newPw && !allRulesMet ? " is-error" : newPw && allRulesMet ? " is-valid" : ""}`}
                    style={{ paddingRight: 42 }}
                    autoComplete="new-password"
                  />
                  <button type="button" className="field-input-right" onClick={() => setShowNew(v => !v)}>
                    <IconEye slash={showNew} />
                  </button>
                </div>

                {/* Strength meter */}
                {newPw && (
                  <>
                    <div className="strength-bar-wrap">
                      {[1,2,3,4].map(i => (
                        <div key={i} className={`strength-seg ${i <= strength ? strengthClasses[strength] : ""}`} />
                      ))}
                    </div>
                    <p className="strength-label">{strengthLabels[strength]}</p>
                  </>
                )}

                {/* Rules */}
                <div className="pw-rules">
                  {rules.map(r => (
                    <div key={r.label} className={`pw-rule${r.met ? " met" : ""}`}>
                      <span className="pw-rule-dot" />
                      {r.label}
                    </div>
                  ))}
                </div>
              </div>

              {/* Confirm password */}
              <div className="field-group" style={{ marginTop: 4 }}>
                <label className="field-label">Confirm Password</label>
                <div className="field-wrap">
                  <span className="field-icon"><IconLock /></span>
                  <input
                    type={showConfirm ? "text" : "password"}
                    value={confirmPw}
                    onChange={(e) => { setConfirmPw(e.target.value); setError(""); }}
                    placeholder="Repeat your password"
                    className={`field-input${confirmPw && !passwordsMatch ? " is-error" : confirmPw && passwordsMatch ? " is-valid" : ""}`}
                    style={{ paddingRight: 42 }}
                    autoComplete="new-password"
                  />
                  <button type="button" className="field-input-right" onClick={() => setShowConfirm(v => !v)}>
                    <IconEye slash={showConfirm} />
                  </button>
                </div>
                {confirmPw && !passwordsMatch && (
                  <p className="field-error"><IconWarn /> Passwords do not match</p>
                )}
              </div>

              <button type="submit" className="submit-btn" disabled={!canSubmit}>
                {loading
                  ? <><Spinner /> Updating…</>
                  : <>Set Password & Continue <IconArrow /></>}
              </button>
            </form>

            <p className="security-note" style={{ marginTop: 16 }}>
              <IconShield /> Your password is encrypted and never stored in plain text
            </p>
    </div>
  );
};

// ─── Side panel ─────────────────────────────────────────────────────────────────
// Decorative: a teacher's to-do sheet, the same paper object as on the landing page.
const TodaySheet = () => (
  <div className="la-sheet" aria-hidden="true">
    <div className="la-sheet__head"><strong>Today</strong><span>Form 3A</span></div>
    <ul className="la-todo">
      <li className="is-done"><span className="la-todo__box"><Check size={12} strokeWidth={3} /></span>Register taken</li>
      <li className="is-done"><span className="la-todo__box"><Check size={12} strokeWidth={3} /></span>Lesson plan for P3</li>
      <li><span className="la-todo__box" />Enter Biology test marks</li>
    </ul>
    <p className="lp-pen">Nearly there!</p>
  </div>
);

// ─── Main Component ───────────────────────────────────────────────────────────
export default function SignIn() {
  const [email, setEmail]         = useState("");
  const [password, setPassword]   = useState("");
  const [showPw, setShowPw]       = useState(false);
  const [touched, setTouched]     = useState({ email: false, password: false });
  const [loading, setLoading]     = useState(false);
  const [authError, setAuthError] = useState("");
  const [showForgot, setShowForgot] = useState(false);

  // Force-change password state
  const [mustChangePw, setMustChangePw]     = useState(false);
  const [fbUser, setFbUser]                 = useState(null);
  const [redirectTo, setRedirectTo]         = useState("");
  const [userDisplayName, setUserDisplayName] = useState("");

  const emailRef = useRef(null);
  useEffect(() => { emailRef.current?.focus(); }, []);

  const emailError =
    touched.email && (!email.trim()
      ? "Email address is required"
      : !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
      ? "Enter a valid email address" : "");

  const passwordError =
    touched.password && (!password
      ? "Password is required"
      : password.length < 6
      ? "Must be at least 6 characters" : "");

  const hasErrors = !!emailError || !!passwordError || !email || !password;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setTouched({ email: true, password: true });
    setAuthError("");
    if (hasErrors) return;

    setLoading(true);
    try {
      const credential = await signInWithEmailAndPassword(
        auth, email.trim().toLowerCase(), password
      );
      const uid = credential.user.uid;

      const userSnap = await getDoc(doc(db, "users", uid));
      if (!userSnap.exists()) {
        await signOut(auth);
        setAuthError("No account record found. Please contact your administrator.");
        setLoading(false);
        return;
      }

      const userData = userSnap.data();
      const allowedRoles = ["admin", "director", "head_teacher", "class_teacher", "bursar"];

      if (!allowedRoles.includes(userData.role)) {
        await signOut(auth);
        setAuthError("Access denied. This portal is for school staff only.");
        setLoading(false);
        return;
      }

      const roleConfig  = ROLES[userData.role];
      const destination = roleConfig?.redirectTo ?? "/admin";

      // ── Check if this is a system-generated first-time password ──
      if (userData.mustChangePassword === true) {
        setFbUser(credential.user);
        setRedirectTo(destination);
        setUserDisplayName(userData.name || "");
        setMustChangePw(true);
        setLoading(false);
        return;
      }

      // Normal login — redirect immediately, no welcome card
      window.location.href = destination;

    } catch (err) {
      const map = {
        "auth/user-not-found":         "No account found with that email address.",
        "auth/wrong-password":         "Incorrect password. Please try again.",
        "auth/invalid-credential":     "Invalid email or password.",
        "auth/too-many-requests":      "Too many failed attempts. Please wait and try again.",
        "auth/user-disabled":          "This account has been disabled. Contact support.",
        "auth/network-request-failed": "Network error. Check your connection and try again.",
      };
      setAuthError(map[err.code] || "Sign-in failed. Please try again.");
      setLoading(false);
    }
  };

  // ── Show force-change screen ──
  if (mustChangePw && fbUser) {
    return (
      <AuthLayout>
        <ForceChangePassword
          firebaseUser={fbUser}
          redirectTo={redirectTo}
          userDisplayName={userDisplayName}
        />
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      eyebrow="Staff portal"
      title="Welcome back to the staff room."
      lead="Sign in to take today's register, enter marks, or see how the school is doing."
      sheet={<TodaySheet />}
      switchText="New school?"
      switchLabel="Register your school"
      switchTo="/register"
    >
      {showForgot && <ForgotPasswordModal onClose={() => setShowForgot(false)} />}

      <div className="la-card">
        <h1 className="form-heading">Staff sign in</h1>
        <p className="form-hint">Authorised personnel only. You'll be directed to your dashboard on sign in.</p>

        {authError && (
              <div className="auth-error">
                <span className="auth-error-icon"><IconWarn /></span>
                <p className="auth-error-msg">{authError}</p>
              </div>
            )}

            <form onSubmit={handleSubmit} noValidate>
              <div className="field-group">
                <label className="field-label">Email Address</label>
                <div className="field-wrap">
                  <span className="field-icon"><IconMail /></span>
                  <input
                    ref={emailRef}
                    type="email"
                    value={email}
                    onChange={(e) => { setEmail(e.target.value); setAuthError(""); }}
                    onBlur={() => setTouched(p => ({ ...p, email: true }))}
                    placeholder="your@school.mw"
                    className={`field-input${emailError ? " is-error" : email && !emailError && touched.email ? " is-valid" : ""}`}
                    style={{ paddingRight: 14 }}
                  />
                </div>
                {emailError && <p className="field-error"><IconWarn /> {emailError}</p>}
              </div>

              <div className="field-group">
                <div className="row-between">
                  <label className="field-label" style={{ marginBottom: 0 }}>Password</label>
                  <button type="button" className="forgot-btn" onClick={() => setShowForgot(true)}>Forgot password?</button>
                </div>
                <div className="field-wrap">
                  <span className="field-icon"><IconLock /></span>
                  <input
                    type={showPw ? "text" : "password"}
                    value={password}
                    onChange={(e) => { setPassword(e.target.value); setAuthError(""); }}
                    onBlur={() => setTouched(p => ({ ...p, password: true }))}
                    placeholder="Enter your password"
                    className={`field-input${passwordError ? " is-error" : password && !passwordError && touched.password ? " is-valid" : ""}`}
                    style={{ paddingRight: 42 }}
                  />
                  <button type="button" className="field-input-right" onClick={() => setShowPw(!showPw)}>
                    <IconEye slash={showPw} />
                  </button>
                </div>
                {passwordError && <p className="field-error"><IconWarn /> {passwordError}</p>}
              </div>

              <button type="submit" className="submit-btn" disabled={loading}>
                {loading ? <><Spinner /> Verifying…</> : <>Sign In <IconArrow /></>}
              </button>
            </form>

            <p className="security-note">
              <IconShield /> 256-bit SSL encrypted · Authorised staff only
            </p>
      </div>
    </AuthLayout>
  );
}
