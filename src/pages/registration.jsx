import { useState } from "react";
import { db, auth } from "../firebase";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { createUserWithEmailAndPassword } from "firebase/auth";

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
  password: "",        // Added for auth
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

function Field({ label, required, error, hint, children }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs text-gray-500">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
      {error && <p className="text-xs text-red-500">{error}</p>}
      {hint && !error && <p className="text-xs text-gray-400">{hint}</p>}
    </div>
  );
}

const inputBase = "w-full px-3 py-2 text-sm bg-gray-50 border rounded-lg text-gray-900 placeholder-gray-300 outline-none transition-colors focus:bg-white";
const inputNormal = "border-gray-200 focus:border-gray-400 focus:ring-2 focus:ring-gray-200";
const inputErr = "border-red-300 bg-red-50 focus:border-red-400 focus:ring-2 focus:ring-red-100";

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
    console.log("=== FORM SUBMISSION STARTED ===");

    const allTouched = Object.fromEntries(Object.keys(form).map((k) => [k, true]));
    setTouched(allTouched);

    const validationErrors = validate(form);
    setErrors(validationErrors);

    if (Object.keys(validationErrors).length > 0 || !code) {
      console.log("Validation failed", validationErrors);
      return;
    }

    setLoading(true);
    setSubmitError(null);

    try {
      console.log("🚀 Creating Firebase Auth user...");

      // 1. Create Authentication User
      const userCredential = await createUserWithEmailAndPassword(auth, form.email.trim(), form.password);
      const uid = userCredential.user.uid;
      console.log("✅ Auth user created with UID:", uid);

      console.log("🚀 Writing school data to Firestore...");

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
        createdAt: serverTimestamp(),
        authUid: uid,                    // Link auth to school
      };

      await setDoc(doc(db, "schools", code), schoolData);
      console.log("✅ School document created");

      // 2. Create User document
      await setDoc(doc(db, "users", uid), {
        uid: uid,
        email: form.email.trim(),
        name: form.schoolName.trim(),
        role: "admin",
        schoolCode: code,
        district: form.district,
        createdAt: serverTimestamp(),
      });
      console.log("✅ User document created");

      console.log("🎉 Registration completed successfully!");

      setSuccessData({ name: form.schoolName.trim(), code });
      setSuccess(true);

    } catch (err) {
      console.error("❌ REGISTRATION ERROR:", err);
      console.error("Error Code:", err.code);

      let message = "Registration failed. Please try again.";

      if (err.code === "auth/email-already-in-use") {
        message = "This email is already registered.";
      } else if (err.code === "permission-denied") {
        message = "Permission denied. Check Firestore rules.";
      } else if (err.code === "auth/weak-password") {
        message = "Password is too weak.";
      }

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

  // Success Screen (same as before)
  if (success && successData) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
        <div className="bg-white border border-gray-200 rounded-xl w-full max-w-md p-8 text-center">
          <div className="w-12 h-12 rounded-full bg-green-50 border border-green-200 flex items-center justify-center text-green-600 text-xl mx-auto mb-4">✓</div>
          <p className="text-base font-medium text-gray-900 mb-1">Registration Successful!</p>
          <p className="text-sm text-gray-500 mb-3">{successData.name}</p>
          <div className="inline-flex items-center gap-2.5 px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg mb-4">
            <span className="font-mono text-sm tracking-wide text-gray-800">{successData.code}</span>
          </div>
          <p className="text-xs text-gray-400 mb-6">Your account has been created. You can now log in with your email and password.</p>
          <button onClick={reset} className="px-6 py-2 text-sm border border-gray-200 rounded-lg text-gray-700 hover:bg-gray-50">
            Register Another School
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
      <div className="bg-white border border-gray-200 rounded-xl w-full max-w-lg overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <p className="text-sm font-medium text-gray-900">School Registration</p>
            <p className="text-xs text-gray-400 mt-0.5">Create institution account</p>
          </div>
          <span className="text-[10px] font-medium bg-amber-50 text-amber-700 border border-amber-200 px-2.5 py-1 rounded-md">30-day trial</span>
        </div>

        <form onSubmit={handleSubmit} noValidate className="px-6 py-5 flex flex-col gap-4">
          {submitError && (
            <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
              {submitError}
            </div>
          )}

          {/* Existing fields ... */}
          <Field label="School name" required error={touched.schoolName && errors.schoolName}>
            <input type="text" value={form.schoolName} placeholder="e.g. Kamuzu Academy" onChange={(e) => change("schoolName", e.target.value)} onBlur={() => blur("schoolName")} className={`${inputBase} ${touched.schoolName && errors.schoolName ? inputErr : inputNormal}`} />
          </Field>

          <Field label="District" required error={touched.district && errors.district}>
            <div className="relative">
              <select value={form.district} onChange={(e) => change("district", e.target.value)} onBlur={() => blur("district")} className={`${inputBase} appearance-none pr-8 ${touched.district && errors.district ? inputErr : inputNormal}`}>
                <option value="">Select district…</option>
                {DISTRICTS.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
          </Field>

          <Field label="Auto-generated school code" hint="System generated">
            <div className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg font-mono text-sm">
              {code || "Select district to generate"}
            </div>
          </Field>

          <Field label="Physical address" required error={touched.address && errors.address}>
            <textarea rows={2} value={form.address} placeholder="38 Mtaya, Kaphiri, Lilongwe" onChange={(e) => change("address", e.target.value)} onBlur={() => blur("address")} className={`${inputBase} resize-none ${touched.address && errors.address ? inputErr : inputNormal}`} />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Phone number" required error={touched.phone && errors.phone}>
              <input type="tel" value={form.phone} placeholder="+265 981 410 178" onChange={(e) => change("phone", e.target.value)} onBlur={() => blur("phone")} className={`${inputBase} ${touched.phone && errors.phone ? inputErr : inputNormal}`} />
            </Field>
            <Field label="Email address" required error={touched.email && errors.email}>
              <input type="email" value={form.email} placeholder="principal@school.mw" onChange={(e) => change("email", e.target.value)} onBlur={() => blur("email")} className={`${inputBase} ${touched.email && errors.email ? inputErr : inputNormal}`} />
            </Field>
          </div>

          {/* New Password Field */}
          <Field label="Password" required error={touched.password && errors.password}>
            <input 
              type="password" 
              value={form.password} 
              placeholder="Create password (min 6 chars)" 
              onChange={(e) => change("password", e.target.value)} 
              onBlur={() => blur("password")} 
              className={`${inputBase} ${touched.password && errors.password ? inputErr : inputNormal}`} 
            />
          </Field>

          <hr className="border-gray-100" />

          <div className="flex items-start gap-2.5">
            <input type="checkbox" checked={form.terms} onChange={(e) => change("terms", e.target.checked)} className="mt-1 accent-gray-800" />
            <span className="text-xs text-gray-500">
              I confirm this information is accurate and I agree to the Terms of Service and Privacy Policy.
            </span>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 text-sm font-medium bg-gray-900 text-white rounded-lg hover:bg-gray-800 disabled:opacity-50"
          >
            {loading ? "Creating Account..." : "Register School & Create Account"}
          </button>
        </form>
      </div>
    </div>
  );
}