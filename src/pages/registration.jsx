import { useState } from "react";
import { db, auth } from "../firebase";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { createUserWithEmailAndPassword, sendEmailVerification } from "firebase/auth";
import { normalisePhone } from "../services/phone";
import { LEGAL_VERSION } from "../services/legal";
import { Link } from "react-router-dom";
import { Check } from "lucide-react";
import AuthLayout from "../components/auth/AuthLayout";

const DISTRICTS = [
  "Blantyre", "Lilongwe", "Mzuzu", "Zomba", "Kasungu", "Mangochi",
  "Salima", "Dedza", "Ntchisi", "Dowa", "Nkhotakota", "Mchinji",
  "Chiradzulu", "Mulanje", "Thyolo", "Phalombe", "Balaka", "Machinga",
  "Nsanje", "Chikwawa", "Neno", "Mwanza", "Nkhata Bay", "Rumphi",
  "Karonga", "Chitipa", "Likoma", "Ntcheu",
];

function genCode(district) {
  const abbr = district.replace(/\s+/g, "").substring(0, 4).toUpperCase();
  const yr = new Date().getFullYear();
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `MWI-${abbr}-${yr}-${rand}`;
}

const EMPTY = {
  schoolName: "",
  district: "",
  address: "",
  phone: "",
  email: "",
  password: "",
  terms: false,
};

function validate(form) {
  const e = {};
  if (!form.schoolName.trim() || form.schoolName.trim().length < 4)
    e.schoolName = "Enter the full school name.";
  if (!form.district)
    e.district = "Please select a district.";
  if (!form.address.trim() || form.address.trim().length < 8)
    e.address = "Please enter a more complete address.";
  if (!form.phone.trim() || !/^[+]?[\d\s\-()\u202f]{8,15}$/.test(form.phone.trim()))
    e.phone = "Enter a valid phone number.";
  if (!form.email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim()))
    e.email = "Enter a valid email address.";
  if (!form.password || form.password.length < 6)
    e.password = "Password must be at least 6 characters.";
  if (!form.terms)
    e.terms = "You must accept the terms to proceed.";
  return e;
}

// Decorative: the first three things a new school does, on the same paper object
// used across the landing and sign-in pages.
const StartSheet = () => (
  <div className="la-sheet" aria-hidden="true">
    <div className="la-sheet__head"><strong>Getting started</strong><span>Term 1</span></div>
    <ul className="la-todo">
      <li className="is-done"><span className="la-todo__box"><Check size={12} strokeWidth={3} /></span>Register your school</li>
      <li><span className="la-todo__box" />Add classes and staff</li>
      <li><span className="la-todo__box" />Take the first register</li>
    </ul>
    <p className="lp-pen">30 days free!</p>
  </div>
);

export default function SchoolRegistration() {
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [touched, setTouched] = useState({});
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [successData, setSuccessData] = useState(null);
  const [submitError, setSubmitError] = useState(null);

  const change = (field, value) => {
    const updated = { ...form, [field]: value };
    if (field === "district") {
      const newCode = value ? genCode(value) : "";
      setCode(newCode);
    }
    setForm(updated);
    if (submitError) setSubmitError(null);

    if (touched[field]) {
      const e = validate(updated);
      setErrors((prev) => ({ ...prev, [field]: e[field] }));
    }
  };

  const blur = (field) => {
    setTouched((prev) => ({ ...prev, [field]: true }));
    const e = validate(form);
    setErrors((prev) => ({ ...prev, [field]: e[field] }));
  };

  const handleSubmit = async (ev) => {
    ev.preventDefault();

    const allTouched = Object.fromEntries(Object.keys(form).map((k) => [k, true]));
    setTouched(allTouched);

    const validationErrors = validate(form);
    setErrors(validationErrors);

    if (Object.keys(validationErrors).length > 0 || !code) return;

    setLoading(true);
    setSubmitError(null);

    try {
      const userCredential = await createUserWithEmailAndPassword(auth, form.email.trim(), form.password);
      const uid = userCredential.user.uid;

      const schoolData = {
        name: form.schoolName.trim(),
        code: code,
        district: form.district,
        address: form.address.trim(),
        phone: form.phone.trim(),
        email: form.email.trim(),
        subscription_status: "trial",
        role: "admin",
        status: "pending",
        termsAcceptedAt: serverTimestamp(),
        termsVersion: LEGAL_VERSION,
        createdAt: serverTimestamp(),
        authUid: uid,
      };

      await setDoc(doc(db, "schools", code), schoolData);
      await setDoc(doc(db, "users", uid), {
        uid,
        email: form.email.trim(),
        name: form.schoolName.trim(),
        role: "admin",
        schoolCode: code,
        district: form.district,
        // The founder's own number, so alerts can reach them on WhatsApp once
        // they turn that on in their account settings.
        phone: normalisePhone(form.phone),
        createdAt: serverTimestamp(),
      });

      // A typo'd email would otherwise create an account nobody can recover.
      // Failing to send must not fail the registration that already succeeded.
      let verificationSent = false;
      try {
        await sendEmailVerification(userCredential.user);
        verificationSent = true;
      } catch (mailErr) {
        console.warn("[registration] verification email not sent:", mailErr);
      }

      setSuccessData({ name: form.schoolName.trim(), code, email: form.email.trim(), verificationSent });
      setSuccess(true);
    } catch (err) {
      let message = "Registration failed. Please try again.";
      if (err.code === "auth/email-already-in-use") message = "This email is already registered.";
      else if (err.code === "auth/weak-password") message = "Password is too weak.";

      setSubmitError(message);
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    setForm(EMPTY);
    setErrors({});
    setTouched({});
    setCode("");
    setSuccess(false);
    setSuccessData(null);
    setSubmitError(null);
  };

  // Success Screen
  if (success && successData) {
    return (
      <AuthLayout>
        <div className="la-card la-done">
          <span className="la-done__icon"><Check size={30} strokeWidth={2.5} /></span>
          <p className="lp-eyebrow">Registration successful</p>
          <h1>School account created</h1>
          <p className="la-done__school">{successData.name}</p>

          <div className="la-done__code">{successData.code}</div>
          <div className="la-done__label">Your school code</div>

          <p className="la-done__body">
            Your school is registered and waiting for approval. We review every new school, and you will get a
            WhatsApp message on the number you gave as soon as it is approved.
            {successData.verificationSent && <> We also emailed <strong>{successData.email}</strong>. Please open the link in it to confirm your address.</>}
          </p>

          <div className="la-done__actions">
            <Link to="/signin" className="reg-btn reg-btn--primary">Sign in</Link>
            <button type="button" onClick={reset} className="reg-btn reg-btn--ghost">Register another school</button>
          </div>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      eyebrow="School registration"
      title="Set your school up in an afternoon."
      lead="Register the school, add your classes and staff, and take your first register this week. Every plan starts with a 30-day free trial."
      sheet={<StartSheet />}
      stickySide
      switchText="Already registered?"
      switchLabel="Sign in"
      switchTo="/signin"
    >
      <div className="la-card">
        <h1 className="form-heading">Register your school</h1>
        <p className="form-hint">Tell us about the school. Its code is generated from your district.</p>

        <form onSubmit={handleSubmit} noValidate className="reg-card__body">
          {submitError && (
            <div className="reg-submit-error">
              {submitError}
            </div>
          )}

          <div className="reg-fields">
            <div className="reg-field">
              <label className="reg-label">School Name <span className="reg-label__req">*</span></label>
              <input
                type="text"
                value={form.schoolName}
                placeholder="e.g. Kamuzu Academy"
                onChange={(e) => change("schoolName", e.target.value)}
                onBlur={() => blur("schoolName")}
                className={`reg-input ${touched.schoolName && errors.schoolName ? "reg-input--error" : ""}`}
              />
              {touched.schoolName && errors.schoolName && (
                <p className="reg-error-msg">{errors.schoolName}</p>
              )}
            </div>

            <div className="reg-field">
              <label className="reg-label">District <span className="reg-label__req">*</span></label>
              <select
                value={form.district}
                onChange={(e) => change("district", e.target.value)}
                onBlur={() => blur("district")}
                className={`reg-input ${touched.district && errors.district ? "reg-input--error" : ""}`}
              >
                <option value="">Select district…</option>
                {DISTRICTS.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
              {touched.district && errors.district && (
                <p className="reg-error-msg">{errors.district}</p>
              )}
            </div>

            <div className="reg-field">
              <label className="reg-label">School Code</label>
              <div className="reg-input reg-input--readonly">
                {code || "Select district to generate code"}
              </div>
            </div>

            <div className="reg-field">
              <label className="reg-label">Physical Address <span className="reg-label__req">*</span></label>
              <textarea
                rows={3}
                value={form.address}
                placeholder="38 Mtaya, Kaphiri, Lilongwe"
                onChange={(e) => change("address", e.target.value)}
                onBlur={() => blur("address")}
                className={`reg-input ${touched.address && errors.address ? "reg-input--error" : ""}`}
              />
              {touched.address && errors.address && (
                <p className="reg-error-msg">{errors.address}</p>
              )}
            </div>

            <div className="reg-row">
              <div className="reg-field">
                <label className="reg-label">Phone Number <span className="reg-label__req">*</span></label>
                <input
                  type="tel"
                  value={form.phone}
                  placeholder="+265 981 410 178"
                  onChange={(e) => change("phone", e.target.value)}
                  onBlur={() => blur("phone")}
                  className={`reg-input ${touched.phone && errors.phone ? "reg-input--error" : ""}`}
                />
                {touched.phone && errors.phone && (
                  <p className="reg-error-msg">{errors.phone}</p>
                )}
              </div>

              <div className="reg-field">
                <label className="reg-label">Email Address <span className="reg-label__req">*</span></label>
                <input
                  type="email"
                  value={form.email}
                  placeholder="principal@school.mw"
                  onChange={(e) => change("email", e.target.value)}
                  onBlur={() => blur("email")}
                  className={`reg-input ${touched.email && errors.email ? "reg-input--error" : ""}`}
                />
                {touched.email && errors.email && (
                  <p className="reg-error-msg">{errors.email}</p>
                )}
              </div>
            </div>

            <div className="reg-field">
              <label className="reg-label">Password <span className="reg-label__req">*</span></label>
              <input
                type="password"
                value={form.password}
                placeholder="Create password (min 6 characters)"
                onChange={(e) => change("password", e.target.value)}
                onBlur={() => blur("password")}
                className={`reg-input ${touched.password && errors.password ? "reg-input--error" : ""}`}
              />
              {touched.password && errors.password && (
                <p className="reg-error-msg">{errors.password}</p>
              )}
            </div>
          </div>

          <div className="reg-terms">
            <input
              type="checkbox"
              checked={form.terms}
              onChange={(e) => change("terms", e.target.checked)}
              className="reg-terms__checkbox"
            />
            <span className="reg-terms__text">
              I confirm this information is accurate and I agree to the{" "}
              <Link to="/terms" target="_blank" className="reg-terms__link">Terms of Service</Link> and{" "}
              <Link to="/privacy" target="_blank" className="reg-terms__link">Privacy Policy</Link>.
            </span>
          </div>

          {touched.terms && errors.terms && (
            <p className="reg-error-msg">{errors.terms}</p>
          )}

          <div className="reg-card__footer" style={{ borderTop: "none", paddingTop: "8px" }}>
            <button
              type="submit"
              disabled={loading}
              className="reg-btn reg-btn--primary"
            >
              {loading ? "Creating Account..." : "Register School & Create Account"}
            </button>
          </div>
        </form>
      </div>
    </AuthLayout>
  );
}