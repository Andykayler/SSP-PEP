import { useState, useEffect, useRef } from "react";
import { auth, db } from "../firebase";
import {
  signInWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  updatePassword,
} from "firebase/auth";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import "./signin.css";

const ROLES = {
  admin:         { label: "Administrator",   redirectTo: "/admin"   },
  head_teacher:  { label: "Head Teacher",    redirectTo: "/head"    },
  class_teacher: { label: "Class Teacher",   redirectTo: "/teacher" },
  bursar:        { label: "Bursar / Fees",   redirectTo: "/bursar"  },
  librarian:     { label: "Librarian",       redirectTo: "/library" },
};

export default function SignIn() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [authError, setAuthError] = useState("");
  const [showForgot, setShowForgot] = useState(false);

  // Force password change
  const [mustChangePw, setMustChangePw] = useState(false);
  const [fbUser, setFbUser] = useState(null);
  const [redirectTo, setRedirectTo] = useState("");
  const [userDisplayName, setUserDisplayName] = useState("");

  const emailRef = useRef(null);

  useEffect(() => {
    emailRef.current?.focus();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setAuthError("");
    if (!email.trim() || !password) return;

    setLoading(true);

    try {
      const credential = await signInWithEmailAndPassword(
        auth,
        email.trim().toLowerCase(),
        password
      );
      const uid = credential.user.uid;

      const userSnap = await getDoc(doc(db, "users", uid));
      if (!userSnap.exists()) {
        await signOut(auth);
        setAuthError("No account record found.");
        setLoading(false);
        return;
      }

      const userData = userSnap.data();
      const allowedRoles = ["admin", "head_teacher", "class_teacher", "bursar"];

      if (!allowedRoles.includes(userData.role)) {
        await signOut(auth);
        setAuthError("Access denied. This portal is for school staff only.");
        setLoading(false);
        return;
      }

      const roleConfig = ROLES[userData.role];
      const destination = roleConfig?.redirectTo ?? "/admin";

      if (userData.mustChangePassword === true) {
        setFbUser(credential.user);
        setRedirectTo(destination);
        setUserDisplayName(userData.name || "");
        setMustChangePw(true);
        setLoading(false);
        return;
      }

      window.location.href = destination;
    } catch (err) {
      const messages = {
        "auth/user-not-found": "No account found with that email.",
        "auth/wrong-password": "Incorrect password.",
        "auth/invalid-credential": "Invalid email or password.",
        "auth/too-many-requests": "Too many failed attempts. Try again later.",
      };
      setAuthError(messages[err.code] || "Sign in failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // Force Change Password Screen
  if (mustChangePw && fbUser) {
    return <ForceChangePassword firebaseUser={fbUser} redirectTo={redirectTo} userDisplayName={userDisplayName} />;
  }

  return (
    <div className="signin-page">
      <div className="signin-page__glow" />
      <div className="signin-page__glow signin-page__glow--teal" />

      <div className="signin-card">
        <div className="signin-card__header">
          <div className="signin-card__logo">
            <div className="signin-card__logo-mark">E</div>
            EduForge
          </div>
          <div className="signin-card__badge">Staff Portal</div>
        </div>

        <div className="signin-card__body">
          <h1 className="signin-title">Welcome Back</h1>
          <p className="signin-subtitle">Sign in to access your dashboard</p>

          {authError && (
            <div className="signin-error" style={{ marginBottom: "16px", textAlign: "center" }}>
              {authError}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div className="signin-field">
              <label className="signin-label">Email Address</label>
              <input
                ref={emailRef}
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@school.mw"
                className="signin-input"
                required
              />
            </div>

            <div className="signin-field">
              <label className="signin-label">Password</label>
              <div style={{ position: "relative" }}>
                <input
                  type={showPw ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  className="signin-input"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPw(!showPw)}
                  style={{
                    position: "absolute",
                    right: "12px",
                    top: "50%",
                    transform: "translateY(-50%)",
                    background: "none",
                    border: "none",
                    color: "rgba(255,255,255,0.4)",
                    cursor: "pointer",
                  }}
                >
                  {showPw ? "Hide" : "Show"}
                </button>
              </div>
              <button
                type="button"
                className="signin-forgot"
                onClick={() => setShowForgot(true)}
              >
                Forgot password?
              </button>
            </div>

            <button type="submit" className="signin-btn" disabled={loading}>
              {loading ? "Signing in..." : "Sign In"}
            </button>
          </form>
        </div>
      </div>

      {showForgot && <ForgotPasswordModal onClose={() => setShowForgot(false)} />}
    </div>
  );
}

/* ── Forgot Password Modal ───────────────────────────────── */
function ForgotPasswordModal({ onClose }) {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSend = async (e) => {
    e.preventDefault();
    if (!email) return;
    setLoading(true);
    try {
      await sendPasswordResetEmail(auth, email.trim());
      setSent(true);
    } catch {
      alert("Failed to send reset email.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="signin-modal" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="signin-modal-content">
        {sent ? (
          <div style={{ textAlign: "center" }}>
            <h3 style={{ color: "var(--teal-lt)" }}>Reset Link Sent</h3>
            <p>Check your inbox at <strong>{email}</strong></p>
            <button onClick={onClose} className="signin-btn" style={{ marginTop: "20px" }}>
              Back to Sign In
            </button>
          </div>
        ) : (
          <form onSubmit={handleSend}>
            <h3>Reset Password</h3>
            <p style={{ fontSize: "13px", color: "rgba(255,255,255,0.6)", margin: "12px 0" }}>
              Enter your email and we'll send you a reset link.
            </p>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com"
              className="signin-input"
              required
            />
            <button type="submit" className="signin-btn" disabled={loading} style={{ marginTop: "16px" }}>
              {loading ? "Sending..." : "Send Reset Link"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

/* ── Force Change Password ───────────────────────────────── */
function ForceChangePassword({ firebaseUser, redirectTo, userDisplayName }) {
  // (You can expand this later if needed — kept minimal for now)
  return (
    <div className="signin-page">
      <div className="signin-card" style={{ maxWidth: "460px" }}>
        <div className="signin-card__body" style={{ textAlign: "center" }}>
          <h2 style={{ color: "var(--teal-lt)" }}>Security Update Required</h2>
          <p>Welcome, {userDisplayName || "User"}</p>
          <p style={{ margin: "16px 0" }}>
            You are using a temporary password. Please set a new password to continue.
          </p>
          {/* You can expand this form if needed */}
          <button onClick={() => window.location.reload()} className="signin-btn">
            Reload & Try Again
          </button>
        </div>
      </div>
    </div>
  );
}