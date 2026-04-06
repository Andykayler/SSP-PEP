import { useState, useEffect, useRef } from "react";
import Header from "../components/header";

// ─── Icons ────────────────────────────────────────────────────────────────────
const ShieldCheckIcon = ({ className = "w-4 h-4" }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className={className}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
  </svg>
);

const LockClosedIcon = ({ className = "w-4 h-4" }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className={className}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
  </svg>
);

const EnvelopeIcon = ({ className = "w-4 h-4" }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className={className}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
  </svg>
);

const BuildingOfficeIcon = ({ className = "w-4 h-4" }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className={className}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21" />
  </svg>
);

const EyeIcon = ({ className = "w-4 h-4" }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className={className}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
  </svg>
);

const EyeSlashIcon = ({ className = "w-4 h-4" }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className={className}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
  </svg>
);

const ExclamationIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4 flex-shrink-0">
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
  </svg>
);

const ArrowRightIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
  </svg>
);

const CheckCircleIcon = ({ className = "w-5 h-5" }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className={className}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

const Spinner = () => (
  <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
  </svg>
);

// ─── Data ─────────────────────────────────────────────────────────────────────
const STATS = [
  { value: "340+", label: "Schools Active" },
  { value: "92K",  label: "Students Enrolled" },
  { value: "99.8%", label: "Uptime SLA" },
];

const ACTIVITY = [
  { school: "Blantyre Secondary",      action: "Uploaded exam results",  time: "2m ago",  dot: "bg-emerald-400" },
  { school: "Lilongwe Girls",          action: "Parent report sent",     time: "11m ago", dot: "bg-blue-400" },
  { school: "St. Patrick's College",   action: "New student enrolled",   time: "34m ago", dot: "bg-amber-400" },
  { school: "Chancellor College Sec.", action: "Fee notice published",   time: "1h ago",  dot: "bg-blue-300" },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
const inputBase = "w-full text-sm text-gray-800 bg-white border rounded-xl outline-none transition-all duration-200 placeholder:text-gray-300 focus:ring-2 focus:ring-blue-900/20 focus:border-blue-900";

const inputClass = (touched, error, valid) => {
  if (touched && error) return `${inputBase} border-red-400 bg-red-50/60 focus:ring-red-200 focus:border-red-500`;
  if (touched && valid) return `${inputBase} border-emerald-400 bg-emerald-50/20`;
  return `${inputBase} border-gray-200 hover:border-gray-300`;
};

const FieldError = ({ msg }) =>
  msg ? (
    <p className="text-xs text-red-600 flex items-center gap-1 font-medium mt-1">
      <svg className="w-3 h-3 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
        <path fillRule="evenodd" d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12zm8.706-1.442c1.146-.573 2.437.463 2.126 1.706l-.709 2.836.042-.02a.75.75 0 01.67 1.34l-.04.022c-1.147.573-2.438-.463-2.127-1.706l.71-2.836-.042.02a.75.75 0 11-.671-1.34l.041-.022zM12 9a.75.75 0 100-1.5.75.75 0 000 1.5z" clipRule="evenodd" />
      </svg>
      {msg}
    </p>
  ) : null;

// ─── Forgot Password Modal ────────────────────────────────────────────────────
const ForgotPasswordModal = ({ onClose }) => {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSend = async (e) => {
    e.preventDefault();
    if (!email) return;
    setLoading(true);
    await new Promise((r) => setTimeout(r, 1500));
    setLoading(false);
    setSent(true);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4" style={{ backgroundColor: "rgba(15,23,42,0.55)", backdropFilter: "blur(4px)" }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden animate-fadeIn">
        <div className="bg-blue-900 px-6 py-4 flex items-center justify-between">
          <div>
            <p className="text-blue-300 text-xs font-semibold uppercase tracking-widest mb-0.5">Account Recovery</p>
            <h3 className="text-white font-bold text-base">Reset Password</h3>
          </div>
          <button onClick={onClose} className="text-blue-300 hover:text-white transition-colors">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="px-6 py-5">
          {sent ? (
            <div className="text-center py-4 space-y-3">
              <div className="w-12 h-12 bg-emerald-50 rounded-full flex items-center justify-center text-emerald-500 mx-auto">
                <CheckCircleIcon className="w-6 h-6" />
              </div>
              <div>
                <p className="font-bold text-gray-900 text-sm">Reset Link Sent</p>
                <p className="text-xs text-gray-500 mt-1">
                  Check your inbox at <span className="font-semibold text-blue-900">{email}</span> for reset instructions.
                </p>
              </div>
              <button onClick={onClose} className="w-full py-2.5 bg-blue-900 text-white text-sm font-semibold rounded-xl hover:bg-blue-800 transition-colors">
                Back to Sign In
              </button>
            </div>
          ) : (
            <form onSubmit={handleSend} className="space-y-4">
              <p className="text-xs text-gray-500 leading-relaxed">
                Enter the admin email address associated with your school account. We'll send a secure reset link.
              </p>
              <div>
                <label className="text-xs font-semibold text-gray-600 uppercase tracking-wider mb-1 block">
                  Admin Email <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-300 pointer-events-none">
                    <EnvelopeIcon />
                  </span>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="admin@school.mw"
                    className={`${inputBase} border-gray-200 hover:border-gray-300 pl-9 pr-4 py-2.5`}
                    required
                  />
                </div>
              </div>
              <button
                type="submit"
                disabled={loading || !email}
                className="w-full flex items-center justify-center gap-2 py-2.5 bg-blue-900 hover:bg-blue-800 disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-xl transition-colors"
              >
                {loading ? <><Spinner /> Sending...</> : "Send Reset Link"}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

// ─── Success Screen ───────────────────────────────────────────────────────────
const SuccessScreen = ({ email, schoolCode, role }) => (
  <div className="flex flex-col items-center justify-center text-center px-6 py-10 gap-5 animate-fadeIn">
    <div className="w-20 h-20 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-500 shadow-inner">
      <CheckCircleIcon className="w-10 h-10" />
    </div>
    <div>
      <h2 className="text-2xl font-bold text-gray-900 mb-1">Welcome Back</h2>
      <p className="text-gray-500 text-sm">
        Signed in as <span className="font-semibold text-blue-900">{email}</span>
      </p>
      <span className="inline-flex items-center gap-1.5 mt-2 bg-blue-900/5 border border-blue-900/10 rounded-lg px-3 py-1">
        <BuildingOfficeIcon className="w-3.5 h-3.5 text-blue-900" />
        <span className="text-xs font-bold text-blue-900 mono tracking-wider">{schoolCode}</span>
        <span className="text-xs text-gray-400">· {role}</span>
      </span>
    </div>

    <div className="w-full bg-blue-50 border border-blue-100 rounded-xl p-4 text-left space-y-2">
      <p className="text-xs font-semibold text-blue-900 uppercase tracking-wider mb-2">Session Details</p>
      {[
        ["Role", role],
        ["Access Level", role === "School Administrator" ? "Full Portal Access" : "Teacher Portal Access"],
        ["Login Time", new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })],
        ["Session", "Secure · AES-256 Encrypted"],
      ].map(([k, v]) => (
        <div key={k} className="flex justify-between text-xs">
          <span className="text-gray-500">{k}</span>
          <span className="font-semibold text-gray-700">{v}</span>
        </div>
      ))}
    </div>

    <div className="text-xs text-emerald-600 font-medium animate-pulse">
      Redirecting to dashboard...
    </div>
  </div>
);

// ─── Shared Layout Pieces ─────────────────────────────────────────────────────
const LogoMark = () => (
  <div className="flex items-center gap-3">
    <div className="w-11 h-11 bg-blue-900 rounded-xl flex items-center justify-center shadow-lg flex-shrink-0">
      <svg viewBox="0 0 24 24" fill="none" className="w-6 h-6" stroke="white" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M4.26 10.147a60.436 60.436 0 00-.491 6.347A48.627 48.627 0 0112 20.904a48.627 48.627 0 018.232-4.41 60.46 60.46 0 00-.491-6.347m-15.482 0a50.57 50.57 0 00-2.658-.813A59.905 59.905 0 0112 3.493a59.902 59.902 0 0110.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.697 50.697 0 0112 13.489a50.702 50.702 0 017.74-3.342M6.75 15a.75.75 0 100-1.5.75.75 0 000 1.5zm0 0v-3.675A55.378 55.378 0 0112 8.443m-7.007 11.55A5.981 5.981 0 006.75 15.75v-1.5" />
      </svg>
    </div>
    <div>
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest leading-none mb-0.5">
        Ministry of Education · Malawi
      </p>
      <h1 className="text-lg font-bold text-blue-900 leading-none">SSP-PEP</h1>
    </div>
  </div>
);

const Footer = () => (
  <footer className="border-t border-gray-200 bg-white/70 py-4 px-4 flex-shrink-0">
    <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
      <p className="text-xs text-gray-400">
        © {new Date().getFullYear()} SSP-PEP · Ministry of Education, Malawi. All rights reserved.
      </p>
      <div className="flex items-center gap-5">
        {["Contact", "Privacy Policy", "Terms of Service", "Help"].map((link) => (
          <a key={link} href="#" className="text-xs text-gray-400 hover:text-blue-900 transition-colors font-medium">
            {link}
          </a>
        ))}
      </div>
    </div>
  </footer>
);

const GlobalStyles = () => (
  <style>{`
    @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=DM+Mono:wght@400;500&display=swap');
    * { font-family: 'DM Sans', sans-serif; box-sizing: border-box; }
    .mono { font-family: 'DM Mono', monospace; }
    @keyframes fadeIn  { from { opacity:0; transform:translateY(8px);  } to { opacity:1; transform:translateY(0); } }
    @keyframes slideUp { from { opacity:0; transform:translateY(20px); } to { opacity:1; transform:translateY(0); } }
    .animate-fadeIn   { animation: fadeIn  0.4s ease both; }
    .slide-up         { animation: slideUp 0.6s cubic-bezier(0.16,1,0.3,1) both; }
    .slide-up-delay   { animation: slideUp 0.6s 0.15s cubic-bezier(0.16,1,0.3,1) both; }
    .pattern-bg {
      background-color: #F9FAFB;
      background-image: radial-gradient(#e2e8f0 1px, transparent 1px);
      background-size: 24px 24px;
    }
    .gold-bar { background: linear-gradient(90deg, #F4B400, #F59E0B); }
  `}</style>
);

// ─── Main Component ───────────────────────────────────────────────────────────
export default function SignIn() {
  const [email, setEmail] = useState("");
  const [schoolCode, setSchoolCode] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [remember, setRemember] = useState(false);
  const [touched, setTouched] = useState({ email: false, schoolCode: false, password: false });
  const [loading, setLoading] = useState(false);
  const [authError, setAuthError] = useState("");
  const [success, setSuccess] = useState(false);
  const [showForgot, setShowForgot] = useState(false);
  const [failCount, setFailCount] = useState(0);
  const [redirectTo, setRedirectTo] = useState("");
  const [userRole, setUserRole] = useState("");

  const emailRef = useRef(null);

  useEffect(() => {
    emailRef.current?.focus();
  }, []);

  // Validation
  const emailError = touched.email
    ? !email.trim() ? "Email address is required"
    : !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? "Enter a valid email address"
    : "" : "";

  const schoolCodeError = touched.schoolCode
    ? !schoolCode.trim() ? "School code is required"
    : !/^[A-Z0-9\-]{4,12}$/.test(schoolCode.trim()) ? "Must be 4–12 uppercase alphanumeric characters"
    : "" : "";

  const passwordError = touched.password
    ? !password ? "Password is required"
    : password.length < 6 ? "Password must be at least 6 characters"
    : "" : "";

  const emailValid = touched.email && !emailError && email;
  const schoolCodeValid = touched.schoolCode && !schoolCodeError && schoolCode;
  const passwordValid = touched.password && !passwordError && password;

  const touchAll = () => setTouched({ email: true, schoolCode: true, password: true });
  const hasErrors = !!emailError || !!schoolCodeError || !!passwordError || !email || !schoolCode || !password;

  const handleSubmit = async (e) => {
    e.preventDefault();
    touchAll();
    setAuthError("");

    if (hasErrors) return;

    setLoading(true);
    await new Promise((r) => setTimeout(r, 1800));
    setLoading(false);

    const normalizedEmail = email.trim().toLowerCase();

    // Special credentials
    if (normalizedEmail === "andy@gmail.com" && password === "123456") {
      setRedirectTo("/admin");
      setUserRole("School Administrator");
      setSuccess(true);
      return;
    }
    if (normalizedEmail === "parent@gmail.com" && password === "123456") {
      setRedirectTo("/parent");
      setUserRole("School Administrator");
      setSuccess(true);
      return;
    }

    if (normalizedEmail === "teacher@gmail.com" && password === "123456") {
      setRedirectTo("/teacher");
      setUserRole("Teacher");
      setSuccess(true);
      return;
    }

    // Demo fallback
    if (failCount === 0 && password !== "demo1234") {
      setFailCount(1);
      setAuthError("Invalid credentials. Please verify your email, school code, and password.");
      return;
    }

    // Default success
    setRedirectTo("/admin");
    setUserRole("School Administrator");
    setSuccess(true);
  };

  // Auto redirect after success screen
  useEffect(() => {
    if (success && redirectTo) {
      const timer = setTimeout(() => {
        window.location.href = redirectTo;
      }, 2200);
      return () => clearTimeout(timer);
    }
  }, [success, redirectTo]);

  // Success Screen
  if (success) {
    return (
      <>
        <GlobalStyles />
        <div className="min-h-screen pattern-bg flex flex-col">
          <div className="gold-bar h-1 w-full flex-shrink-0" />
          <div className="flex-1 flex items-center justify-center px-4 py-12">
            <div className="bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden w-full max-w-md animate-fadeIn">
              <div className="bg-blue-900 px-7 py-4 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 bg-white/10 rounded-lg flex items-center justify-center">
                    <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4" stroke="white" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.26 10.147a60.436 60.436 0 00-.491 6.347A48.627 48.627 0 0112 20.904a48.627 48.627 0 018.232-4.41 60.46 60.46 0 00-.491-6.347m-15.482 0a50.57 50.57 0 00-2.658-.813A59.905 59.905 0 0112 3.493a59.902 59.902 0 0110.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.697 50.697 0 0112 13.489a50.702 50.702 0 017.74-3.342M6.75 15a.75.75 0 100-1.5.75.75 0 000 1.5zm0 0v-3.675A55.378 55.378 0 0112 8.443m-7.007 11.55A5.981 5.981 0 006.75 15.75v-1.5" />
                    </svg>
                  </div>
                  <span className="text-white font-bold">SSP-PEP</span>
                </div>
                <div className="flex items-center gap-1.5 text-emerald-300 text-xs font-semibold">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Session Active
                </div>
              </div>
              <SuccessScreen email={email} schoolCode={schoolCode} role={userRole} />
            </div>
          </div>
          <Footer />
        </div>
      </>
    );
  }

  // Main Sign In Page
  return (
    <>
      <Header />
      <GlobalStyles />
      {showForgot && <ForgotPasswordModal onClose={() => setShowForgot(false)} />}

      <div className="min-h-screen pattern-bg flex flex-col">
        <div className="gold-bar h-1 w-full flex-shrink-0" />

        <div className="flex-1 flex items-start lg:items-center justify-center px-4 py-8 lg:py-10">
          <div className="w-full max-w-6xl grid grid-cols-1 lg:grid-cols-5 gap-6 lg:gap-10 items-center">

            {/* LEFT PANEL */}
            <div className="lg:col-span-2 slide-up">
              <LogoMark />

              <div className="mt-8 mb-3">
                <h2 className="text-3xl lg:text-4xl font-bold text-gray-900 leading-tight">
                  Administrator<br />
                  Portal<br />
                  <span className="text-blue-900">Sign In</span>
                </h2>
              </div>
              <p className="text-gray-500 text-sm leading-relaxed mb-8 max-w-xs">
                Secure access for registered school administrators. Manage students, staff, examinations, and parent engagement from one unified dashboard.
              </p>

              <div className="flex items-start gap-3 bg-amber-50 border border-amber-200/60 rounded-xl px-4 py-3 mb-8">
                <span className="text-amber-500 flex-shrink-0 mt-0.5">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
                  </svg>
                </span>
                <div>
                  <p className="text-xs font-bold text-amber-800">Authorised Personnel Only</p>
                  <p className="text-xs text-amber-700 mt-0.5 leading-relaxed">
                    This portal is restricted to registered school administrators. Your school code was issued during institution registration.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3 mb-8">
                {STATS.map(({ value, label }) => (
                  <div key={label} className="bg-white border border-gray-100 rounded-xl p-3 shadow-sm text-center">
                    <p className="text-xl font-bold text-blue-900">{value}</p>
                    <p className="text-xs text-gray-400 mt-0.5 leading-tight">{label}</p>
                  </div>
                ))}
              </div>

              <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-50 flex items-center justify-between">
                  <p className="text-xs font-bold text-gray-700 uppercase tracking-wider">Platform Activity</p>
                  <span className="flex items-center gap-1.5 text-xs text-emerald-600 font-semibold">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse inline-block" />
                    Live
                  </span>
                </div>
                <div className="divide-y divide-gray-50">
                  {ACTIVITY.map((item, i) => (
                    <div key={i} className="flex items-start gap-3 px-4 py-2.5">
                      <div className={`w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 ${item.dot}`} />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold text-gray-700 truncate">{item.school}</p>
                        <p className="text-xs text-gray-400">{item.action}</p>
                      </div>
                      <span className="text-xs text-gray-300 whitespace-nowrap flex-shrink-0">{item.time}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* RIGHT PANEL - SIGN IN FORM */}
            <div className="lg:col-span-3 slide-up-delay">
              <div className="bg-white rounded-2xl shadow-xl shadow-gray-200/60 border border-gray-100 overflow-hidden">
                <div className="bg-blue-900 px-7 py-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-blue-300 text-xs font-semibold uppercase tracking-widest mb-1">
                        Secure Administrator Access
                      </p>
                      <h3 className="text-white text-xl font-bold">School Admin Sign In</h3>
                    </div>
                    <div className="flex items-center gap-2 bg-white/10 border border-white/20 rounded-xl px-3 py-1.5">
                      <ShieldCheckIcon className="w-3.5 h-3.5 text-amber-300" />
                      <span className="text-amber-200 text-xs font-semibold">SSL Secured</span>
                    </div>
                  </div>
                </div>

                <div className="px-7 py-6 space-y-5">
                  {authError && (
                    <div className="flex items-start gap-3 bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 animate-fadeIn">
                      <span className="mt-0.5"><ExclamationIcon /></span>
                      <div>
                        <p className="text-xs font-bold">Authentication Failed</p>
                        <p className="text-xs mt-0.5 text-red-600">{authError}</p>
                        {failCount >= 1 && (
                          <p className="text-xs mt-1.5 text-red-500">
                            Trouble signing in?{" "}
                            <button
                              onClick={() => setShowForgot(true)}
                              className="font-bold underline hover:no-underline"
                            >
                              Reset your password
                            </button>
                            {" "}or contact your IT administrator.
                          </p>
                        )}
                      </div>
                    </div>
                  )}

                  <form onSubmit={handleSubmit} noValidate className="space-y-4">
                    {/* Email Field */}
                    <div>
                      <label className="text-xs font-semibold text-gray-600 uppercase tracking-wider flex items-center gap-1 mb-1">
                        Admin Email Address <span className="text-red-500">*</span>
                      </label>
                      <div className="relative">
                        <span className={`absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none transition-colors ${touched.email && emailError ? "text-red-400" : emailValid ? "text-emerald-500" : "text-gray-300"}`}>
                          <EnvelopeIcon />
                        </span>
                        <input
                          ref={emailRef}
                          type="email"
                          value={email}
                          onChange={(e) => { setEmail(e.target.value); setAuthError(""); }}
                          onBlur={() => setTouched((p) => ({ ...p, email: true }))}
                          placeholder="admin@school.mw"
                          className={`${inputClass(touched.email, emailError, emailValid)} pl-9 pr-9 py-2.5`}
                        />
                        {emailValid && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-emerald-500"><CheckCircleIcon className="w-4 h-4" /></span>}
                      </div>
                      <FieldError msg={emailError} />
                    </div>

                    {/* School Code */}
                    <div>
                      <label className="text-xs font-semibold text-gray-600 uppercase tracking-wider flex items-center gap-1 mb-1">
                        School Code <span className="text-red-500">*</span>
                      </label>
                      <div className="relative">
                        <span className={`absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none transition-colors ${touched.schoolCode && schoolCodeError ? "text-red-400" : schoolCodeValid ? "text-emerald-500" : "text-gray-300"}`}>
                          <BuildingOfficeIcon />
                        </span>
                        <input
                          type="text"
                          value={schoolCode}
                          onChange={(e) => { setSchoolCode(e.target.value.toUpperCase()); setAuthError(""); }}
                          onBlur={() => setTouched((p) => ({ ...p, schoolCode: true }))}
                          placeholder="e.g. KA-2024"
                          className={`${inputClass(touched.schoolCode, schoolCodeError, schoolCodeValid)} mono tracking-widest pl-9 pr-9 py-2.5`}
                        />
                        {schoolCodeValid && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-emerald-500"><CheckCircleIcon className="w-4 h-4" /></span>}
                      </div>
                      <FieldError msg={schoolCodeError} />
                      <p className="text-xs text-gray-400 mt-1">
                        Issued to your institution during registration.{" "}
                        <a href="/" className="text-blue-900 font-semibold hover:underline">Not registered yet?</a>
                      </p>
                    </div>

                    {/* Password */}
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-xs font-semibold text-gray-600 uppercase tracking-wider flex items-center gap-1">
                          Password <span className="text-red-500">*</span>
                        </label>
                        <button type="button" onClick={() => setShowForgot(true)} className="text-xs text-blue-900 font-semibold hover:underline">
                          Forgot password?
                        </button>
                      </div>
                      <div className="relative">
                        <span className={`absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none transition-colors ${touched.password && passwordError ? "text-red-400" : passwordValid ? "text-emerald-500" : "text-gray-300"}`}>
                          <LockClosedIcon />
                        </span>
                        <input
                          type={showPw ? "text" : "password"}
                          value={password}
                          onChange={(e) => { setPassword(e.target.value); setAuthError(""); }}
                          onBlur={() => setTouched((p) => ({ ...p, password: true }))}
                          placeholder="Enter your password"
                          className={`${inputClass(touched.password, passwordError, passwordValid)} pl-9 pr-10 py-2.5`}
                        />
                        <button
                          type="button"
                          onClick={() => setShowPw(!showPw)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500 transition-colors"
                        >
                          {showPw ? <EyeSlashIcon /> : <EyeIcon />}
                        </button>
                      </div>
                      <FieldError msg={passwordError} />
                    </div>

                    {/* Remember me */}
                    <div className="flex items-center justify-between pt-0.5">
                      <label className="flex items-center gap-2 cursor-pointer select-none">
                        <div
                          onClick={() => setRemember(!remember)}
                          className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-all cursor-pointer flex-shrink-0 ${remember ? "bg-blue-900 border-blue-900" : "border-gray-300 hover:border-blue-900"}`}
                        >
                          {remember && (
                            <svg className="w-2.5 h-2.5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </div>
                        <span className="text-xs text-gray-600 font-medium">Remember this device</span>
                      </label>
                      <span className="text-xs text-gray-400 flex items-center gap-1">
                        <LockClosedIcon className="w-3 h-3" />
                        Session: 8 hours
                      </span>
                    </div>

                    {/* Submit Button */}
                    <button
                      type="submit"
                      disabled={loading}
                      className="w-full flex items-center justify-center gap-2 bg-blue-900 hover:bg-blue-800 active:bg-blue-950 disabled:opacity-70 disabled:cursor-not-allowed text-white font-semibold text-sm py-3 rounded-xl transition-all duration-200"
                      style={{ boxShadow: "0 4px 14px 0 rgba(30,58,138,0.25)" }}
                    >
                      {loading ? <><Spinner /> Verifying credentials...</> : <><ShieldCheckIcon /> Sign In to Admin Portal</>}
                    </button>
                  </form>

                  <div className="flex items-center justify-center gap-2 text-gray-400 pt-1">
                    <LockClosedIcon className="w-3.5 h-3.5 flex-shrink-0" />
                    <p className="text-xs text-center">
                      All sessions encrypted with AES-256. Activity is logged for security auditing.
                    </p>
                  </div>
                </div>

                <div className="px-7 py-3 bg-gray-50/60 border-t border-gray-100 flex flex-wrap items-center justify-between gap-2">
                  {[
                    { icon: "🔒", text: "HTTPS Encrypted" },
                    { icon: "🇲🇼", text: "Malawi Data Residency" },
                    { icon: "✅", text: "GDPR Compliant" },
                  ].map(({ icon, text }) => (
                    <span key={text} className="flex items-center gap-1.5 text-xs text-gray-400 font-medium">
                      <span>{icon}</span> {text}
                    </span>
                  ))}
                </div>
              </div>

              <p className="text-center text-xs text-gray-400 mt-4">
                Having trouble signing in?{" "}
                <a href="#support" className="text-blue-900 font-semibold hover:underline">Contact IT Support</a>
              </p>
            </div>
          </div>
        </div>

        <Footer />
      </div>
    </>
  );
}