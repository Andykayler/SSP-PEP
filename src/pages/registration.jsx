import { useState, useEffect, useRef } from "react";

// ─── Design tokens ────────────────────────────────────────────────────────────
// Palette: deep ink navy + warm ochre gold + clean ivory
// Typography: Playfair Display (headings) + DM Sans (body)
// Aesthetic: authoritative editorial — like a government gazette meets modern SaaS

// ─── SVG Icons ────────────────────────────────────────────────────────────────
const Icon = {
  Shield: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  ),
  Lock: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  ),
  Cloud: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
      <path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z" />
    </svg>
  ),
  Network: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
      <circle cx="12" cy="5" r="3" /><circle cx="5" cy="19" r="3" /><circle cx="19" cy="19" r="3" />
      <line x1="12" y1="8" x2="5" y2="16" /><line x1="12" y1="8" x2="19" y2="16" />
    </svg>
  ),
  CheckCircle: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-14 h-14">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  ),
  ChevronDown: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 pointer-events-none">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  ),
  Alert: () => (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5 flex-shrink-0">
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" />
    </svg>
  ),
  Warning: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 flex-shrink-0 mt-0.5">
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  ),
  Home: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  ),
  Spinner: () => (
    <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  ),
  Refresh: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
      <polyline points="1 4 1 10 7 10" /><path d="M3.51 15a9 9 0 1 0 .49-4.88" />
    </svg>
  ),
};

// ─── Decorative School Illustration ──────────────────────────────────────────
const SchoolIllustration = () => (
  <svg viewBox="0 0 340 230" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full">
    <rect x="0" y="170" width="340" height="60" fill="#F4B400" opacity="0.06" rx="6" />
    <rect x="70" y="90" width="200" height="120" fill="#F4B400" opacity="0.08" rx="3" />
    <rect x="70" y="90" width="200" height="120" stroke="#0F2044" strokeWidth="1.5" rx="3" opacity="0.3" />
    <polygon points="55,90 170,38 285,90" fill="#0F2044" opacity="0.12" />
    <polygon points="55,90 170,38 285,90" stroke="#0F2044" strokeWidth="1.5" strokeLinejoin="round" opacity="0.4" />
    <line x1="170" y1="38" x2="170" y2="16" stroke="#F4B400" strokeWidth="2.5" />
    <rect x="170" y="15" width="22" height="13" fill="#F4B400" opacity="0.95" rx="1.5" />
    {[92, 123, 154, 185, 216, 247].map((x, i) => (
      <rect key={i} x={x} y="90" width="7" height="120" fill="#0F2044" opacity="0.07" stroke="#0F2044" strokeWidth="0.6" />
    ))}
    {[82, 133, 184, 235].map((x, i) => (
      <g key={i}>
        <rect x={x} y="105" width="26" height="34" rx="2" fill="white" opacity="0.7" stroke="#0F2044" strokeWidth="1" />
        <line x1={x + 13} y1="105" x2={x + 13} y2="139" stroke="#0F2044" strokeWidth="0.8" opacity="0.2" />
        <line x1={x} y1="122" x2={x + 26} y2="122" stroke="#0F2044" strokeWidth="0.8" opacity="0.2" />
        <rect x={x + 1} y="106" width="10" height="14" fill="#F4B400" opacity="0.2" />
      </g>
    ))}
    <rect x="140" y="162" width="60" height="48" rx="3" fill="white" opacity="0.7" stroke="#0F2044" strokeWidth="1.2" />
    <rect x="144" y="165" width="24" height="42" fill="#0F2044" opacity="0.06" />
    <rect x="172" y="165" width="24" height="42" fill="#0F2044" opacity="0.06" />
    <circle cx="160" cy="187" r="2.5" fill="#F4B400" opacity="0.8" />
    <path d="M140 164 Q170 152 200 164" stroke="#0F2044" strokeWidth="1.2" fill="none" opacity="0.3" />
    <rect x="126" y="208" width="88" height="5" rx="1.5" fill="#0F2044" opacity="0.12" />
    <rect x="116" y="212" width="108" height="5" rx="1.5" fill="#0F2044" opacity="0.08" />
    <ellipse cx="34" cy="168" rx="24" ry="30" fill="#10B981" opacity="0.15" />
    <ellipse cx="34" cy="162" rx="19" ry="23" fill="#10B981" opacity="0.22" />
    <rect x="31" y="185" width="7" height="22" fill="#0F2044" opacity="0.15" />
    <ellipse cx="306" cy="168" rx="24" ry="30" fill="#10B981" opacity="0.15" />
    <ellipse cx="306" cy="162" rx="19" ry="23" fill="#10B981" opacity="0.22" />
    <rect x="303" y="185" width="7" height="22" fill="#0F2044" opacity="0.15" />
    <line x1="10" y1="210" x2="330" y2="210" stroke="#0F2044" strokeWidth="1" opacity="0.12" />
    {[42, 82, 258, 298].map((x, i) => (
      <circle key={i} cx={x} cy={65 + (i % 2) * 22} r="3" fill="#F4B400" opacity="0.5" />
    ))}
    <line x1="42" y1="65" x2="82" y2="87" stroke="#F4B400" strokeWidth="1" opacity="0.35" />
    <line x1="258" y1="87" x2="298" y2="65" stroke="#F4B400" strokeWidth="1" opacity="0.35" />
  </svg>
);

// ─── Field wrapper ────────────────────────────────────────────────────────────
const FieldWrapper = ({ label, required, error, hint, children }) => (
  <div className="flex flex-col gap-1.5">
    <label className="text-[11px] font-bold tracking-widest uppercase text-[#0F2044]/60">
      {label}{required && <span className="text-[#C0392B] ml-0.5">*</span>}
    </label>
    {children}
    {error && (
      <p className="flex items-start gap-1.5 text-[#C0392B] text-[11px] font-medium leading-snug">
        <Icon.Alert /> {error}
      </p>
    )}
    {hint && !error && (
      <p className="text-[#0F2044]/40 text-[11px]">{hint}</p>
    )}
  </div>
);

const base = "w-full px-3.5 py-2.5 text-sm rounded-lg border bg-[#FAFAF8] text-[#0F2044] placeholder-[#0F2044]/30 transition-all duration-200 outline-none font-[DM_Sans]";
const normal = "border-[#0F2044]/15 hover:border-[#0F2044]/30 focus:border-[#F4B400] focus:ring-2 focus:ring-[#F4B400]/20 focus:bg-white";
const errCls = "border-[#C0392B]/40 bg-red-50/50 focus:border-[#C0392B] focus:ring-2 focus:ring-[#C0392B]/10";

// ─── Plan metadata ────────────────────────────────────────────────────────────
const PLANS = {
  Basic: {
    price: "Free trial",
    features: ["Student enrollment", "Class management", "Basic reporting"],
    color: "from-slate-50 to-slate-100",
    accent: "#64748B",
  },
  Standard: {
    price: "MWK 45,000/yr",
    features: ["All Basic features", "Parent portal", "SMS alerts", "Attendance tracking"],
    color: "from-blue-50 to-indigo-50",
    accent: "#1E3A8A",
  },
  Premium: {
    price: "MWK 90,000/yr",
    features: ["All Standard features", "Advanced analytics", "Custom reports", "API access", "Priority support"],
    color: "from-amber-50 to-yellow-50",
    accent: "#B45309",
  },
};

// ─── Main Component ───────────────────────────────────────────────────────────
export default function Registration() {
  const [form, setForm] = useState({
    schoolName: "",
    schoolCode: "",
    address: "",
    phone: "",
    email: "",
    plan: "",
    terms: false,
  });
  const [errors, setErrors] = useState({});
  const [touched, setTouched] = useState({});
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [successData, setSuccessData] = useState(null);
  const [submitError, setSubmitError] = useState(null);
  const [mounted, setMounted] = useState(false);
  const formRef = useRef(null);

  useEffect(() => { setMounted(true); }, []);

  // ── Validation ───────────────────────────────────────────────────────────
  const validate = (data) => {
    const e = {};
    if (!data.schoolName.trim()) e.schoolName = "School name is required.";
    else if (data.schoolName.trim().length < 4) e.schoolName = "Enter the full official school name (min. 4 characters).";

    if (!data.schoolCode.trim()) e.schoolCode = "School code is required.";
    else if (!/^[A-Z0-9-]{4,12}$/.test(data.schoolCode.trim()))
      e.schoolCode = "4–12 uppercase letters, numbers, or hyphens only (e.g. MWI-SEC-001).";

    if (!data.address.trim()) e.address = "School address is required.";
    else if (data.address.trim().length < 10) e.address = "Please provide a more complete address.";

    if (!data.phone.trim()) e.phone = "Phone number is required.";
    else if (!/^[+]?[\d\s\-()]{8,15}$/.test(data.phone.trim()))
      e.phone = "Enter a valid phone number (e.g. +265 999 000 000).";

    if (!data.email.trim()) e.email = "Email address is required.";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email.trim()))
      e.email = "Enter a valid email address.";

    if (!data.plan) e.plan = "Please select a subscription plan.";
    if (!data.terms) e.terms = "You must accept the Terms & Conditions to proceed.";
    return e;
  };

  const handleChange = (field, value) => {
    const updated = { ...form, [field]: value };
    setForm(updated);
    if (submitError) setSubmitError(null);
    if (touched[field]) {
      const e = validate(updated);
      setErrors((prev) => ({ ...prev, [field]: e[field] }));
    }
  };

  const handleBlur = (field) => {
    setTouched((prev) => ({ ...prev, [field]: true }));
    const e = validate(form);
    setErrors((prev) => ({ ...prev, [field]: e[field] }));
  };

  // ── Submit → Flask API ───────────────────────────────────────────────────
  const handleSubmit = async (ev) => {
    ev.preventDefault();
    const allTouched = Object.fromEntries(Object.keys(form).map((k) => [k, true]));
    setTouched(allTouched);
    const e2 = validate(form);
    setErrors(e2);
    if (Object.keys(e2).length > 0) {
      // Scroll to first error
      formRef.current?.querySelector("[data-error]")?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }

    setLoading(true);
    setSubmitError(null);

    try {
      const res = await fetch("/api/schools/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.schoolName.trim(),
          code: form.schoolCode.trim().toUpperCase(),
          address: form.address.trim(),
          phone: form.phone.trim(),
          email: form.email.trim(),
          subscription_plan: form.plan,
          subscription_status: "trial",
        }),
      });

      let json;
      try {
        json = await res.json();
      } catch {
        throw new Error("Server returned an unreadable response. Please try again.");
      }

      if (!res.ok) {
        if (res.status === 409) {
          // Duplicate code — surface as inline field error
          setErrors((prev) => ({
            ...prev,
            schoolCode: "This school code is already registered. Please use a different code.",
          }));
          setTouched((prev) => ({ ...prev, schoolCode: true }));
          setSubmitError(null);
          console.warn("[SSP-PEP] Registration conflict — duplicate school code:", form.schoolCode);
        } else if (res.status === 400) {
          const msg = json?.error || "Invalid submission. Please review all fields.";
          setSubmitError(msg);
          console.error(`[SSP-PEP] 400 Bad Request:`, json);
        } else if (res.status >= 500) {
          setSubmitError(
            json?.error
              ? `Server error: ${json.error}`
              : "A server error occurred. Our team has been notified — please try again shortly or contact support@ssp-pep.mw."
          );
          console.error(`[SSP-PEP] ${res.status} Server Error:`, json);
        } else {
          setSubmitError(json?.error || `Unexpected error (HTTP ${res.status}). Please try again.`);
          console.error(`[SSP-PEP] Unexpected HTTP ${res.status}:`, json);
        }
        return;
      }

      // ✅ Success
      console.info("[SSP-PEP] School registered successfully:", json.school);
      setSuccessData(json.school);
      setSuccess(true);

    } catch (err) {
      const isNetwork = err instanceof TypeError;
      const msg = isNetwork
        ? "Unable to reach the server. Please check your internet connection and try again."
        : err.message || "An unexpected error occurred. Please try again.";
      setSubmitError(msg);
      console.error("[SSP-PEP] Registration error:", err);
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setSuccess(false);
    setSuccessData(null);
    setSubmitError(null);
    setForm({ schoolName: "", schoolCode: "", address: "", phone: "", email: "", plan: "", terms: false });
    setErrors({});
    setTouched({});
  };

  if (!mounted) return null;

  // ─── Success Screen ──────────────────────────────────────────────────────
  if (success && successData) {
    return (
      <div className="min-h-screen bg-[#F7F5F0] flex items-center justify-center p-6">
        <style>{`
          @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;600;700&family=DM+Sans:wght@300;400;500;600;700&display=swap');
          @keyframes scaleIn { from { opacity:0; transform:scale(0.88); } to { opacity:1; transform:scale(1); } }
          @keyframes fadeUp { from { opacity:0; transform:translateY(16px); } to { opacity:1; transform:translateY(0); } }
          .success-card { animation: scaleIn 0.45s cubic-bezier(0.34,1.56,0.64,1) both; }
          .success-row { animation: fadeUp 0.4s ease both; }
        `}</style>
        <div className="success-card bg-white rounded-2xl shadow-2xl shadow-[#0F2044]/10 border border-[#0F2044]/8 p-10 max-w-lg w-full text-center" style={{ fontFamily: "'DM Sans', sans-serif" }}>
          <div className="flex justify-center mb-6">
            <div className="w-20 h-20 rounded-full bg-emerald-50 border-2 border-emerald-200 flex items-center justify-center text-emerald-600">
              <Icon.CheckCircle />
            </div>
          </div>
          <div className="inline-flex items-center gap-1.5 bg-emerald-50 text-emerald-700 text-[10px] font-bold px-3 py-1 rounded-full mb-4 uppercase tracking-widest border border-emerald-200">
            ✓ Registration Successful
          </div>
          <h2 className="text-2xl font-bold text-[#0F2044] mb-2" style={{ fontFamily: "'Playfair Display', serif" }}>
            Welcome to SSP-PEP
          </h2>
          <p className="text-[#0F2044]/60 text-sm leading-relaxed mb-1">
            <span className="font-semibold text-[#0F2044]">{successData.name}</span> has been registered.
          </p>
          <div className="flex items-center justify-center gap-3 text-xs text-[#0F2044]/50 mb-6">
            <span>Code: <span className="font-mono font-bold text-[#0F2044]">{successData.code}</span></span>
            <span className="w-1 h-1 rounded-full bg-[#0F2044]/20 inline-block" />
            <span>Plan: <span className="font-semibold text-[#0F2044]/80">{form.plan}</span></span>
            <span className="w-1 h-1 rounded-full bg-[#0F2044]/20 inline-block" />
            <span className="text-amber-600 font-semibold">Trial Active</span>
          </div>

          <div className="bg-[#F7F5F0] border border-[#0F2044]/10 rounded-xl p-5 text-left mb-6 space-y-2.5">
            <p className="text-xs font-bold text-[#0F2044] uppercase tracking-widest mb-3">Next Steps</p>
            {[
              `Confirmation email sent to ${form.email}`,
              "An administrator will verify your school details within 24 hours",
              "Once approved, you will receive your admin login credentials",
            ].map((step, i) => (
              <p key={i} className="success-row flex items-start gap-2 text-[#0F2044]/60 text-xs" style={{ animationDelay: `${i * 0.08 + 0.2}s` }}>
                <span className="w-4 h-4 rounded-full bg-[#F4B400]/20 text-[#B45309] text-[10px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5">{i + 1}</span>
                {step}
              </p>
            ))}
          </div>

          <button
            onClick={resetForm}
            className="w-full bg-[#0F2044] hover:bg-[#1a3366] text-white text-sm font-semibold py-3 rounded-xl transition-colors duration-200 flex items-center justify-center gap-2"
          >
            <Icon.Home /> Register Another School
          </button>
          <p className="mt-4 text-xs text-[#0F2044]/40">
            Questions? <a href="mailto:support@ssp-pep.mw" className="text-[#0F2044]/70 hover:text-[#0F2044] underline">support@ssp-pep.mw</a>
          </p>
        </div>
      </div>
    );
  }

  // ─── Main Registration Page ──────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#F7F5F0]" style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,600;0,700;1,400&family=DM+Sans:wght@300;400;500;600;700&display=swap');
        @keyframes fadeLeft  { from { opacity:0; transform:translateX(-24px); } to { opacity:1; transform:translateX(0); } }
        @keyframes fadeRight { from { opacity:0; transform:translateX(24px); } to { opacity:1; transform:translateX(0); } }
        @keyframes fadeDown  { from { opacity:0; transform:translateY(-12px); } to { opacity:1; transform:translateY(0); } }
        @keyframes shimmer   { 0%,100% { opacity:1; } 50% { opacity:0.6; } }
        .anim-left   { animation: fadeLeft  0.7s cubic-bezier(0.22,1,0.36,1) both; }
        .anim-right  { animation: fadeRight 0.7s cubic-bezier(0.22,1,0.36,1) 0.1s both; }
        .anim-down   { animation: fadeDown  0.5s ease both; }
        .dot-pulse   { animation: shimmer 2s ease-in-out infinite; }
        select { appearance:none; -webkit-appearance:none; }
        ::-webkit-scrollbar { width:5px; }
        ::-webkit-scrollbar-track { background:#F7F5F0; }
        ::-webkit-scrollbar-thumb { background:#0F2044; border-radius:3px; opacity:0.2; }
      `}</style>

      {/* ── Header bar ── */}
      <header className="anim-down bg-[#0F2044] border-b border-white/8 px-6 py-3.5">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-[#F4B400] flex items-center justify-center shadow-sm">
              <svg viewBox="0 0 24 24" fill="none" className="w-4.5 h-4.5 w-[18px] h-[18px]">
                <path d="M12 3L2 8l10 5 10-5-10-5z" fill="#0F2044" />
                <path d="M2 13l10 5 10-5" stroke="#0F2044" strokeWidth="1.8" strokeLinejoin="round" />
              </svg>
            </div>
            <div>
              <span className="text-white text-sm font-bold tracking-tight">SSP-PEP</span>
              <span className="hidden sm:inline text-white/40 text-xs ml-2">· Ministry of Education, Malawi</span>
            </div>
          </div>
          <a href="#" className="text-white/50 hover:text-white text-xs transition-colors">
            Already registered? <span className="underline text-[#F4B400]/80">Sign in →</span>
          </a>
        </div>
      </header>

      {/* ── Main ── */}
      <main className="flex-1 flex items-start lg:items-center justify-center px-4 py-10 sm:p-10">
        <div className="w-full max-w-6xl grid lg:grid-cols-[1fr_1.05fr] gap-10 lg:gap-14 items-center">

          {/* ── LEFT PANEL ── */}
          <div className="hidden lg:flex flex-col gap-8 anim-left">
            {/* Heading */}
            <div>
              <div className="flex items-center gap-2 mb-5">
                <div className="h-px flex-1 bg-[#0F2044]/15" />
                <span className="text-[10px] font-bold tracking-[0.2em] uppercase text-[#0F2044]/40">Official Platform</span>
                <div className="h-px flex-1 bg-[#0F2044]/15" />
              </div>
              <h1 className="text-4xl font-bold text-[#0F2044] leading-[1.15] mb-4" style={{ fontFamily: "'Playfair Display', serif" }}>
                Digitizing<br />
                <span className="italic text-[#B45309]">Secondary Education</span><br />
                Management
              </h1>
              <p className="text-[#0F2044]/55 text-sm leading-relaxed max-w-sm">
                The official platform for secondary schools across Malawi to manage enrollment, communicate with parents, and streamline administration.
              </p>
            </div>

            {/* Illustration */}
            <div className="bg-white rounded-2xl p-6 border border-[#0F2044]/8 shadow-sm">
              <SchoolIllustration />
            </div>

            {/* Trust badges */}
            <div className="grid grid-cols-3 gap-3">
              {[
                { icon: <Icon.Shield />, label: "Secure", sub: "256-bit TLS 1.3" },
                { icon: <Icon.Cloud />, label: "Cloud-Based", sub: "99.9% Uptime" },
                { icon: <Icon.Network />, label: "Multi-School", sub: "Scalable" },
              ].map((b, i) => (
                <div key={i} className="bg-white border border-[#0F2044]/8 rounded-xl p-3.5 flex flex-col gap-1.5 hover:border-[#F4B400]/40 hover:shadow-sm transition-all duration-200">
                  <div className="text-[#0F2044]/50">{b.icon}</div>
                  <p className="text-xs font-bold text-[#0F2044]">{b.label}</p>
                  <p className="text-[10px] text-[#0F2044]/40">{b.sub}</p>
                </div>
              ))}
            </div>

            {/* Stats */}
            <div className="flex items-center gap-8">
              {[["120+", "Schools"], ["45K+", "Students"], ["2024", "Launched"]].map(([n, l], i) => (
                <div key={i}>
                  <p className="text-xl font-bold text-[#0F2044]" style={{ fontFamily: "'Playfair Display', serif" }}>{n}</p>
                  <p className="text-[11px] text-[#0F2044]/40 uppercase tracking-wider">{l}</p>
                </div>
              ))}
            </div>
          </div>

          {/* ── RIGHT PANEL — Form Card ── */}
          <div className="anim-right">
            {/* Mobile branding */}
            <div className="lg:hidden text-center mb-6">
              <div className="inline-flex items-center gap-2.5 bg-[#0F2044] rounded-xl px-4 py-2.5">
                <div className="w-6 h-6 bg-[#F4B400] rounded-md flex items-center justify-center">
                  <svg viewBox="0 0 24 24" fill="none" className="w-3.5 h-3.5">
                    <path d="M12 3L2 8l10 5 10-5-10-5z" fill="#0F2044" />
                    <path d="M2 13l10 5 10-5" stroke="#0F2044" strokeWidth="1.8" strokeLinejoin="round" />
                  </svg>
                </div>
                <span className="text-white text-sm font-bold">SSP-PEP</span>
              </div>
              <p className="text-sm text-[#0F2044]/55 mt-2">Digitizing Secondary Education Management</p>
            </div>

            <div className="bg-white rounded-2xl shadow-xl shadow-[#0F2044]/8 border border-[#0F2044]/8 overflow-hidden">
              {/* Card top stripe */}
              <div className="h-1 bg-gradient-to-r from-[#0F2044] via-[#F4B400] to-[#0F2044]" />

              {/* Card header */}
              <div className="px-7 pt-7 pb-5 border-b border-[#0F2044]/8">
                <div className="flex items-start justify-between">
                  <div>
                    <h2 className="text-xl font-bold text-[#0F2044]" style={{ fontFamily: "'Playfair Display', serif" }}>
                      School Registration
                    </h2>
                    <p className="text-[#0F2044]/45 text-xs mt-0.5">Create your institution's account on the platform</p>
                  </div>
                  <div className="flex items-center gap-1.5 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400 dot-pulse" />
                    <span className="text-amber-700 text-[10px] font-bold uppercase tracking-wider">30-day trial</span>
                  </div>
                </div>
              </div>

              {/* Form body */}
              <form ref={formRef} onSubmit={handleSubmit} noValidate className="px-7 py-6 space-y-5">

                {/* ── Submit error banner ── */}
                {submitError && (
                  <div className="flex items-start gap-2.5 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-xs text-red-700 leading-snug" role="alert">
                    <Icon.Warning />
                    <div>
                      <p className="font-semibold mb-0.5">Registration failed</p>
                      <p className="text-red-600/80">{submitError}</p>
                    </div>
                  </div>
                )}

                {/* School Name */}
                <FieldWrapper label="School Name" required error={touched.schoolName && errors.schoolName}>
                  <input
                    data-error={touched.schoolName && errors.schoolName ? "" : undefined}
                    type="text"
                    value={form.schoolName}
                    onChange={e => handleChange("schoolName", e.target.value)}
                    onBlur={() => handleBlur("schoolName")}
                    placeholder="e.g. Kamuzu Academy Secondary School"
                    className={`${base} ${touched.schoolName && errors.schoolName ? errCls : normal}`}
                  />
                </FieldWrapper>

                {/* School Code */}
                <FieldWrapper
                  label="School Code"
                  required
                  error={touched.schoolCode && errors.schoolCode}
                  hint="Unique identifier from the Ministry of Education (e.g. MWI-SEC-001)"
                >
                  <input
                    data-error={touched.schoolCode && errors.schoolCode ? "" : undefined}
                    type="text"
                    value={form.schoolCode}
                    onChange={e => handleChange("schoolCode", e.target.value.toUpperCase())}
                    onBlur={() => handleBlur("schoolCode")}
                    placeholder="MWI-SEC-001"
                    className={`${base} font-mono tracking-widest ${touched.schoolCode && errors.schoolCode ? errCls : normal}`}
                  />
                </FieldWrapper>

                {/* Address */}
                <FieldWrapper label="School Address" required error={touched.address && errors.address}>
                  <textarea
                    data-error={touched.address && errors.address ? "" : undefined}
                    value={form.address}
                    onChange={e => handleChange("address", e.target.value)}
                    onBlur={() => handleBlur("address")}
                    placeholder="Street / Area, District, Region, Malawi"
                    rows={3}
                    className={`${base} resize-none ${touched.address && errors.address ? errCls : normal}`}
                  />
                </FieldWrapper>

                {/* Phone + Email */}
                <div className="grid sm:grid-cols-2 gap-4">
                  <FieldWrapper label="Phone Number" required error={touched.phone && errors.phone}>
                    <input
                      data-error={touched.phone && errors.phone ? "" : undefined}
                      type="tel"
                      value={form.phone}
                      onChange={e => handleChange("phone", e.target.value)}
                      onBlur={() => handleBlur("phone")}
                      placeholder="+265 999 000 000"
                      className={`${base} ${touched.phone && errors.phone ? errCls : normal}`}
                    />
                  </FieldWrapper>
                  <FieldWrapper label="Email Address" required error={touched.email && errors.email}>
                    <input
                      data-error={touched.email && errors.email ? "" : undefined}
                      type="email"
                      value={form.email}
                      onChange={e => handleChange("email", e.target.value)}
                      onBlur={() => handleBlur("email")}
                      placeholder="principal@school.mw"
                      className={`${base} ${touched.email && errors.email ? errCls : normal}`}
                    />
                  </FieldWrapper>
                </div>

                {/* Subscription Plan */}
                <FieldWrapper label="Subscription Plan" required error={touched.plan && errors.plan}>
                  <div className="relative">
                    <select
                      data-error={touched.plan && errors.plan ? "" : undefined}
                      value={form.plan}
                      onChange={e => handleChange("plan", e.target.value)}
                      onBlur={() => handleBlur("plan")}
                      className={`${base} pr-9 cursor-pointer ${touched.plan && errors.plan ? errCls : normal} ${!form.plan ? "text-[#0F2044]/30" : "text-[#0F2044]"}`}
                    >
                      <option value="" disabled>Choose a plan…</option>
                      {Object.keys(PLANS).map(p => (
                        <option key={p} value={p}>{p} — {PLANS[p].price}</option>
                      ))}
                    </select>
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[#0F2044]/40 pointer-events-none">
                      <Icon.ChevronDown />
                    </span>
                  </div>

                  {/* Plan detail card */}
                  {form.plan && (
                    <div className={`mt-2 bg-gradient-to-br ${PLANS[form.plan].color} border border-[#0F2044]/10 rounded-xl p-3.5`}>
                      <div className="flex flex-wrap gap-x-4 gap-y-1">
                        {PLANS[form.plan].features.map((f, i) => (
                          <span key={i} className="text-[11px] text-[#0F2044]/65 flex items-center gap-1">
                            <span className="text-[#F4B400]">✓</span> {f}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </FieldWrapper>

                {/* Trial notice */}
                <div className="flex items-center gap-3 bg-amber-50/70 border border-amber-200/70 rounded-xl px-4 py-3">
                  <div className="w-2 h-2 rounded-full bg-amber-400 flex-shrink-0 dot-pulse" />
                  <div>
                    <p className="text-[11px] font-bold text-amber-800 uppercase tracking-wider">30-day free trial included</p>
                    <p className="text-[11px] text-amber-700/70 mt-0.5">No payment required to register. Billing begins after approval.</p>
                  </div>
                </div>

                {/* Terms */}
                <div>
                  <label className="flex items-start gap-3 cursor-pointer group">
                    <div className="relative flex-shrink-0 mt-0.5">
                      <input
                        type="checkbox"
                        checked={form.terms}
                        onChange={e => handleChange("terms", e.target.checked)}
                        onBlur={() => handleBlur("terms")}
                        className="sr-only"
                      />
                      <div className={`w-[18px] h-[18px] rounded-[5px] border-2 flex items-center justify-center transition-all duration-150
                        ${form.terms
                          ? "bg-[#0F2044] border-[#0F2044]"
                          : touched.terms && errors.terms
                            ? "border-[#C0392B] bg-red-50"
                            : "border-[#0F2044]/25 bg-white group-hover:border-[#0F2044]/50"
                        }`}>
                        {form.terms && (
                          <svg viewBox="0 0 12 10" fill="none" className="w-2.5 h-2">
                            <polyline points="1,5 4.5,8.5 11,1" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        )}
                      </div>
                    </div>
                    <p className="text-xs text-[#0F2044]/55 leading-relaxed">
                      I confirm the information provided is accurate and I agree to the{" "}
                      <a href="#" className="text-[#0F2044] font-semibold underline underline-offset-2">Terms of Service</a> and{" "}
                      <a href="#" className="text-[#0F2044] font-semibold underline underline-offset-2">Privacy Policy</a>{" "}
                      of SSP-PEP. I am authorised to register this institution.
                    </p>
                  </label>
                  {touched.terms && errors.terms && (
                    <p className="flex items-center gap-1.5 text-[#C0392B] text-[11px] font-medium mt-1.5 ml-6">
                      <Icon.Alert /> {errors.terms}
                    </p>
                  )}
                </div>

                {/* Submit */}
                <div className="pt-1 space-y-3">
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full bg-[#0F2044] hover:bg-[#1a3366] active:bg-[#0a1830] text-white font-semibold text-sm py-3.5 rounded-xl transition-all duration-200 flex items-center justify-center gap-2.5 shadow-lg shadow-[#0F2044]/20 hover:shadow-xl hover:shadow-[#0F2044]/25 disabled:opacity-60 disabled:cursor-not-allowed hover:-translate-y-0.5 active:translate-y-0"
                  >
                    {loading ? (
                      <><Icon.Spinner /> Registering school…</>
                    ) : (
                      <><Icon.Home /> Register School</>
                    )}
                  </button>

                  {/* Security note */}
                  <div className="flex items-center justify-center gap-1.5 text-[#0F2044]/35 text-[11px]">
                    <Icon.Lock />
                    <span>Encrypted in transit and at rest · TLS 1.3</span>
                    <Icon.Shield />
                  </div>
                </div>
              </form>
            </div>

            <p className="text-center text-[11px] text-[#0F2044]/35 mt-4">
              Need help?{" "}
              <a href="mailto:support@ssp-pep.mw" className="text-[#0F2044]/60 hover:text-[#0F2044] underline">support@ssp-pep.mw</a>
              {" "}· <a href="tel:+2651234567" className="text-[#0F2044]/60 hover:text-[#0F2044] underline">+265 1 234 567</a>
            </p>
          </div>
        </div>
      </main>

      {/* ── Footer ── */}
      <footer className="border-t border-[#0F2044]/8 bg-white px-6 py-4">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-[11px] text-[#0F2044]/40">
          <p>© {new Date().getFullYear()} SSP-PEP · Ministry of Education, Malawi. All rights reserved.</p>
          <div className="flex items-center gap-5">
            {["Contact", "Privacy Policy", "Terms of Use", "Accessibility"].map((l, i) => (
              <a key={i} href="#" className="hover:text-[#0F2044] transition-colors">{l}</a>
            ))}
          </div>
          <div className="flex items-center gap-1.5">
            <Icon.Shield />
            <span>Secure Platform</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
