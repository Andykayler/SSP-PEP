import { useState, useEffect } from "react";
import { auth, db } from "../../firebase";
import {
  doc, getDoc, collection, getDocs, setDoc, updateDoc, deleteDoc,
  query, where, orderBy, serverTimestamp, addDoc, limit
} from "firebase/firestore";
import { createUserWithEmailAndPassword, signOut, onAuthStateChanged } from "firebase/auth";

import Sidebar, { NAV_ITEMS } from "./side_bar";
import { getInitialTheme, applyTheme, toggleTheme as flipTheme } from "../../utils/theme";
import "./admin_dashboard.css";

// ─── EMAIL CONFIG ─────────────────────────────────────────────────────────────
const EMAILJS_SERVICE_ID           = "acalink_101";
const EMAILJS_PUBLIC_KEY           = "0onfJrfekd5sOwhKF";
const EMAILJS_STAFF_TEMPLATE_ID    = "Acalink_welcomEmail";
const EMAILJS_GUARDIAN_TEMPLATE_ID = "acalink-guardianwelcom";

async function sendEmail({ templateId, toEmail, toName, params }) {
  try {
    const response = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        service_id: EMAILJS_SERVICE_ID,
        template_id: templateId,
        user_id: EMAILJS_PUBLIC_KEY,
        template_params: {
          to_name: toName, to_email: toEmail, reply_to: toEmail,
          school_name: params.school_name, user_role: params.user_role,
          login_email: params.login_email, password: params.password,
          login_url: params.login_url,
        },
      }),
    });
    if (!response.ok) throw new Error(await response.text());
    return true;
  } catch (err) { console.error("Email send failed:", err); return false; }
}

function generatePassword() {
  const words = ["Blue","Star","Lake","Gold","Moon","Fire","Wind","Peak","Rock","Dawn"];
  const syms  = ["#","@","!","$"];
  return `${words[Math.floor(Math.random()*words.length)]}${syms[Math.floor(Math.random()*syms.length)]}${Math.floor(1000+Math.random()*9000)}`;
}

function generateStudentCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const seg = () => Array.from({ length: 4 }, () => chars[Math.floor(Math.random()*chars.length)]).join("");
  return `STU-${seg()}-${seg()}`;
}

// ─── Icons ────────────────────────────────────────────────────────────────────
const IC = {
  home:     <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} width={20} height={20}><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955a1.126 1.126 0 011.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25"/></svg>,
  users:    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} width={20} height={20}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z"/></svg>,
  students: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} width={20} height={20}><path strokeLinecap="round" strokeLinejoin="round" d="M4.26 10.147a60.436 60.436 0 00-.491 6.347A48.627 48.627 0 0112 20.904a48.627 48.627 0 018.232-4.41 60.46 60.46 0 00-.491-6.347m-15.482 0a50.57 50.57 0 00-2.658-.813A59.905 59.905 0 0112 3.493a59.902 59.902 0 0110.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.697 50.697 0 0112 13.489a50.702 50.702 0 017.74-3.342M6.75 15a.75.75 0 100-1.5.75.75 0 000 1.5zm0 0v-3.675A55.378 55.378 0 0112 8.443m-7.007 11.55A5.981 5.981 0 006.75 15.75v-1.5"/></svg>,
  school:   <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} width={20} height={20}><path strokeLinecap="round" strokeLinejoin="round" d="M4.26 10.147a60.436 60.436 0 00-.491 6.347A48.627 48.627 0 0112 20.904a48.627 48.627 0 018.232-4.41 60.46 60.46 0 00-.491-6.347m-15.482 0a50.57 50.57 0 00-2.658-.813A59.905 59.905 0 0112 3.493a59.902 59.902 0 0110.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.697 50.697 0 0112 13.489a50.702 50.702 0 017.74-3.342M6.75 15a.75.75 0 100-1.5.75.75 0 000 1.5zm0 0v-3.675A55.378 55.378 0 0112 8.443m-7.007 11.55A5.981 5.981 0 006.75 15.75v-1.5"/></svg>,
  billing:  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} width={20} height={20}><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z"/></svg>,
  bell:     <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} width={20} height={20}><path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0"/></svg>,
  audit:    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} width={20} height={20}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z"/></svg>,
  menu:     <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} width={20} height={20}><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5"/></svg>,
  close:    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} width={20} height={20}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>,
  plus:     <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width={16} height={16}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15"/></svg>,
  edit:     <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} width={16} height={16}><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125"/></svg>,
  trash:    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} width={16} height={16}><path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"/></svg>,
  check:    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width={16} height={16}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5"/></svg>,
  search:   <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} width={16} height={16}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 15.803a7.5 7.5 0 0010.607 10.607z"/></svg>,
  eye:      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} width={16} height={16}><path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z"/><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/></svg>,
  shield:   <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} width={16} height={16}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z"/></svg>,
  warning:  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} width={16} height={16}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"/></svg>,
  transfer: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} width={16} height={16}><path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5"/></svg>,
  copy:     <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} width={16} height={16}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 01-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 011.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 00-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 01-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 00-3.375-3.375h-1.5a1.125 1.125 0 01-1.125-1.125v-1.5a3.375 3.375 0 00-3.375-3.375H9.75"/></svg>,
  info:     <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} width={16} height={16}><path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z"/></svg>,
  mail:     <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} width={16} height={16}><path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75"/></svg>,
  sun: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} width={18} height={18}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707M17.657 17.657l-.707-.707M6.343 6.343l-.707-.707M12 7a5 5 0 100 10A5 5 0 0012 7z"/>
    </svg>
  ),
  moon: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} width={18} height={18}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 12.79A9 9 0 1111.21 3a7 7 0 009.79 9.79z"/>
    </svg>
  ),
};

// ─── Constants ────────────────────────────────────────────────────────────────
const ROLES = [
  { value: "head_teacher",  label: "Head Teacher",  badgeClass: "badge--purple" },
  { value: "class_teacher", label: "Class Teacher", badgeClass: "badge--blue"   },
  { value: "bursar",        label: "Bursar / Fees", badgeClass: "badge--amber"  },
  { value: "librarian",     label: "Librarian",     badgeClass: "badge--teal"   },
];
const roleMap = Object.fromEntries(ROLES.map(r => [r.value, r]));

const GENDERS   = ["Male", "Female"];
const DISTRICTS = ["Blantyre","Lilongwe","Mzuzu","Zomba","Kasungu","Mangochi","Salima","Dedza","Ntchisi","Dowa","Nkhotakota","Mchinji","Chiradzulu","Mulanje","Thyolo","Phalombe","Balaka","Machinga","Nsanje","Chikwawa","Neno","Mwanza","Nkhata Bay","Rumphi","Karonga","Chitipa","Likoma","Ntcheu"];
const PRIMARY_SUBJECTS   = ["Chichewa","English","Mathematics","Science and Technology","Social and Environmental Sciences","Expressive Arts","Agriculture","Life Skills","Religious and Moral Education"];
const SECONDARY_SUBJECTS = ["English","Chichewa","Mathematics","Biology","Chemistry","Physics","Agriculture","Geography","History","Social and Development Studies","Life Skills","Bible Knowledge"];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function initials(name = "") {
  return name.split(" ").filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join("");
}
function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}
function fmtDate(ts) {
  if (!ts) return "—";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

// ─── Shared UI ────────────────────────────────────────────────────────────────
const RoleBadge = ({ role }) => {
  const r = roleMap[role] || { label: role, badgeClass: "badge--blue" };
  return <span className={`badge ${r.badgeClass}`}><span className="badge__dot" />{r.label}</span>;
};

const StatusPill = ({ active }) => (
  <span className={`status-pill ${active ? "status-pill--active" : "status-pill--suspended"}`}>
    <span className="status-pill__dot" />
    {active ? "Active" : "Suspended"}
  </span>
);

const Modal = ({ title, onClose, children, size = "md" }) => (
  <div className="modal-backdrop">
    <div className={`modal modal--${size}`}>
      <div className="modal__header">
        <span className="modal__title">{title}</span>
        <button className="modal__close" onClick={onClose}>{IC.close}</button>
      </div>
      <div className="modal__body">{children}</div>
    </div>
  </div>
);

const Field = ({ label, required, error, children }) => (
  <div className="field">
    {label && (
      <label className={`field__label${required ? " field__label--required" : ""}`}>{label}</label>
    )}
    {children}
    {error && <span className="field__error">{error}</span>}
  </div>
);

const Input = ({ label, required, error, ...props }) => (
  <Field label={label} required={required} error={error}>
    <input {...props} className={`field__input${error ? " field__input--error" : ""}`} />
  </Field>
);

const Select = ({ label, required, error, children, ...props }) => (
  <Field label={label} required={required} error={error}>
    <select {...props} className={`field__select${error ? " field__select--error" : ""}`}>
      {children}
    </select>
  </Field>
);

const Textarea = ({ label, ...props }) => (
  <Field label={label}>
    <textarea {...props} className="field__textarea" />
  </Field>
);

const Btn = ({ children, variant = "primary", size = "md", loading, className = "", ...props }) => (
  <button
    {...props}
    disabled={loading || props.disabled}
    className={`btn btn--${variant} btn--${size} ${className}`}
  >
    {loading ? <span className="spinner" /> : children}
  </button>
);

const Spinner = () => <span className="spinner spinner--dark" />;

const EmptyState = ({ icon, title, sub, action }) => (
  <div className="empty-state">
    <div className="empty-state__icon">{icon}</div>
    <p className="empty-state__title">{title}</p>
    <p className="empty-state__sub">{sub}</p>
    {action}
  </div>
);

// ─── Student Code Badge ───────────────────────────────────────────────────────
function StudentCodeBadge({ code }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }
  return (
    <span className="student-code-badge">
      <span className="student-code-badge__text">{code}</span>
      <button className="student-code-badge__copy" onClick={copy} title="Copy code">
        {copied ? <span style={{ color: "var(--teal)" }}>{IC.check}</span> : IC.copy}
      </button>
    </span>
  );
}

// ─── Inline action button (table rows) ───────────────────────────────────────
function ActionBtn({ onClick, icon, title, hoverBg = "rgba(79,110,247,0.07)" }) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onClick}
      title={title}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        padding: 7,
        borderRadius: 8,
        background: hovered ? hoverBg : "none",
        border: "none",
        cursor: "pointer",
        color: hovered ? "var(--accent-lt)" : "var(--text3)",
        transition: "all .2s",
        display: "flex",
        alignItems: "center",
      }}
    >
      {icon}
    </button>
  );
}

// ─── MODULE 1: User Management ────────────────────────────────────────────────
function UserManagement({ schoolCode, schoolName }) {
  const [users, setUsers]                 = useState([]);
  const [loading, setLoading]             = useState(true);
  const [search, setSearch]               = useState("");
  const [roleFilter, setRoleFilter]       = useState("all");
  const [showAdd, setShowAdd]             = useState(false);
  const [showEdit, setShowEdit]           = useState(null);
  const [showDelete, setShowDelete]       = useState(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError]                 = useState("");
  const [successMsg, setSuccessMsg]       = useState("");
  const [form, setForm]                   = useState({ name: "", email: "", role: "", phone: "" });
  const [formErrors, setFormErrors]       = useState({});

  useEffect(() => { fetchUsers(); }, []);

  async function fetchUsers() {
    setLoading(true);
    try {
      const q = query(collection(db, "users"), where("schoolCode", "==", schoolCode));
      const snap = await getDocs(q);
      setUsers(snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(u => u.role !== "admin" && u.role !== "student"));
    } catch (e) { console.error(e); }
    setLoading(false);
  }

  function validateForm(f) {
    const e = {};
    if (!f.name.trim() || f.name.trim().length < 2) e.name = "Full name required.";
    if (!f.email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email)) e.email = "Valid email required.";
    if (!f.role) e.role = "Select a role.";
    return e;
  }

  async function handleAdd(e) {
    e.preventDefault();
    const errs = validateForm(form);
    if (Object.keys(errs).length) { setFormErrors(errs); return; }
    setActionLoading(true); setError(""); setSuccessMsg("");
    const autoPassword = generatePassword();
    try {
      const cred = await createUserWithEmailAndPassword(auth, form.email.trim(), autoPassword);
      await setDoc(doc(db, "users", cred.user.uid), {
        uid: cred.user.uid, name: form.name.trim(), email: form.email.trim(),
        role: form.role, phone: form.phone.trim() || "", schoolCode,
        status: "active", mustChangePassword: true, createdAt: serverTimestamp(),
      });
      await sendEmail({
        templateId: EMAILJS_STAFF_TEMPLATE_ID,
        toEmail: form.email.trim(), toName: form.name.trim(),
        params: {
          school_name: schoolName, user_role: roleMap[form.role]?.label || form.role,
          login_email: form.email.trim(), password: autoPassword,
          login_url: window.location.origin + "/login",
        },
      });
      setShowAdd(false);
      setForm({ name: "", email: "", role: "", phone: "" });
      setSuccessMsg(`Account created! Credentials sent to ${form.email.trim()}.`);
      fetchUsers();
    } catch (err) {
      setError(err.code === "auth/email-already-in-use" ? "This email is already registered." : "Failed: " + err.message);
    }
    setActionLoading(false);
  }

  async function handleEdit(e) {
    e.preventDefault(); setActionLoading(true); setError("");
    try {
      await updateDoc(doc(db, "users", showEdit.id), { name: form.name.trim(), role: form.role, phone: form.phone.trim() });
      setShowEdit(null); fetchUsers();
    } catch (err) { setError("Update failed: " + err.message); }
    setActionLoading(false);
  }

  async function toggleStatus(user) {
    try {
      await updateDoc(doc(db, "users", user.id), { status: user.status === "active" ? "suspended" : "active" });
      fetchUsers();
    } catch (err) { console.error(err); }
  }

  async function handleDelete() {
    setActionLoading(true);
    try { await deleteDoc(doc(db, "users", showDelete.id)); setShowDelete(null); fetchUsers(); }
    catch (err) { setError("Delete failed."); }
    setActionLoading(false);
  }

  function openEdit(user) {
    setForm({ name: user.name || "", email: user.email || "", role: user.role || "", phone: user.phone || "" });
    setFormErrors({}); setError(""); setShowEdit(user);
  }
  function openAdd() {
    setForm({ name: "", email: "", role: "", phone: "" });
    setFormErrors({}); setError(""); setShowAdd(true);
  }

  const filtered = users.filter(u => {
    const ms = !search || u.name?.toLowerCase().includes(search.toLowerCase()) || u.email?.toLowerCase().includes(search.toLowerCase());
    const mr = roleFilter === "all" || u.role === roleFilter;
    return ms && mr;
  });

  const roleCounts = ROLES.map(r => ({ ...r, count: users.filter(u => u.role === r.value).length }));

  return (
    <div className="space-y-6">
      <div className="flex-between" style={{ flexWrap: "wrap", gap: 12 }}>
        <div>
          <h2 className="module-title">User Management</h2>
          <p className="module-sub">{users.length} staff accounts — {schoolName}</p>
        </div>
        <Btn onClick={openAdd} variant="gold" size="sm">{IC.plus} Add User</Btn>
      </div>

      {successMsg && (
        <div className="alert alert--success">{IC.mail}<span>{successMsg}</span></div>
      )}

      <div className="filter-pills">
        <button
          onClick={() => setRoleFilter("all")}
          className={`filter-pill ${roleFilter === "all" ? "filter-pill--active" : "filter-pill--inactive"}`}
        >
          All ({users.length})
        </button>
        {roleCounts.map(r => (
          <button
            key={r.value}
            onClick={() => setRoleFilter(r.value)}
            className={`filter-pill ${roleFilter === r.value ? "filter-pill--active" : "filter-pill--inactive"}`}
          >
            {r.label} ({r.count})
          </button>
        ))}
      </div>

      <div className="search-wrap">
        <span className="search-wrap__icon">{IC.search}</span>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by name or email…"
          className="search-wrap__input"
        />
      </div>

      <div className="card">
        {loading ? (
          <div style={{ padding: "48px", display: "flex", justifyContent: "center" }}><Spinner /></div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={IC.users}
            title="No users found"
            sub={search ? "Try a different search" : "Add your first staff member"}
            action={<Btn onClick={openAdd} variant="gold" size="sm">{IC.plus} Add User</Btn>}
          />
        ) : (
          <div className="data-table-wrap">
<table className="data-table data-table--stack">
            <thead>
              <tr>
                <th>User</th>
                <th>Role</th>
                <th>Status</th>
                <th>Added</th>
                <th style={{ textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(u => (
                <tr key={u.id}>
                  <td data-label="User">
                    <div className="flex-gap-3">
                      <div className="avatar avatar--navy">{initials(u.name)}</div>
                      <div>
                        <div className="data-table__primary">{u.name}</div>
                        <div className="data-table__meta">{u.email}</div>
                      </div>
                    </div>
                  </td>
                  <td data-label="Role"><RoleBadge role={u.role} /></td>
                  <td data-label="Status"><StatusPill active={u.status !== "suspended"} /></td>
                  <td style={{ fontSize: 12, color: "var(--text3)" }} data-label="Added">{fmtDate(u.createdAt)}</td>
                  <td data-label="Actions">
                    <div className="data-table__actions" style={{ display: "flex", justifyContent: "flex-end", gap: 2 }}>
                      <ActionBtn onClick={() => openEdit(u)} icon={IC.edit} title="Edit" />
                      <ActionBtn onClick={() => toggleStatus(u)} icon={IC.shield} title={u.status === "suspended" ? "Activate" : "Suspend"} hoverBg="rgba(251,191,36,0.12)" />
                      <ActionBtn onClick={() => setShowDelete(u)} icon={IC.trash} title="Delete" hoverBg="rgba(239,68,68,0.1)" />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
</div>
        )}
      </div>

      {showAdd && (
        <Modal title="Add New Staff User" onClose={() => setShowAdd(false)} size="lg">
          <form onSubmit={handleAdd} className="space-y-4">
            {error && <div className="alert alert--error">{IC.warning}<span>{error}</span></div>}
            <div className="alert alert--info">{IC.mail}<span>A secure auto-generated password will be emailed to the user upon account creation.</span></div>
            <div className="grid-2">
              <Input label="Full Name" required value={form.name} onChange={e => setForm(p => ({...p, name: e.target.value}))} placeholder="Jane Mwale" error={formErrors.name} />
              <Select label="Role" required value={form.role} onChange={e => setForm(p => ({...p, role: e.target.value}))} error={formErrors.role}>
                <option value="">Select role…</option>
                {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
              </Select>
            </div>
            <Input label="Email Address" required type="email" value={form.email} onChange={e => setForm(p => ({...p, email: e.target.value}))} placeholder="jane@school.mw" error={formErrors.email} />
            <Input label="Phone Number" type="tel" value={form.phone} onChange={e => setForm(p => ({...p, phone: e.target.value}))} placeholder="+265 9xx xxx xxx" />
            <div className="data-table__actions" style={{ display: "flex", justifyContent: "flex-end", gap: 8, paddingTop: 8 }}>
              <Btn type="button" variant="ghost" onClick={() => setShowAdd(false)}>Cancel</Btn>
              <Btn type="submit" variant="gold" loading={actionLoading}>{IC.mail} Create &amp; Send</Btn>
            </div>
          </form>
        </Modal>
      )}

      {showEdit && (
        <Modal title="Edit User" onClose={() => setShowEdit(null)} size="md">
          <form onSubmit={handleEdit} className="space-y-4">
            {error && <div className="alert alert--error">{IC.warning}<span>{error}</span></div>}
            <Input label="Full Name" required value={form.name} onChange={e => setForm(p => ({...p, name: e.target.value}))} />
            <Select label="Role" required value={form.role} onChange={e => setForm(p => ({...p, role: e.target.value}))}>
              <option value="">Select role…</option>
              {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
            </Select>
            <Input label="Phone Number" type="tel" value={form.phone} onChange={e => setForm(p => ({...p, phone: e.target.value}))} />
            <p style={{ fontSize: 11, color: "var(--text3)" }}>Email and password changes must be done through Firebase Console.</p>
            <div className="data-table__actions" style={{ display: "flex", justifyContent: "flex-end", gap: 8, paddingTop: 8 }}>
              <Btn type="button" variant="ghost" onClick={() => setShowEdit(null)}>Cancel</Btn>
              <Btn type="submit" variant="accent" loading={actionLoading}>Save Changes</Btn>
            </div>
          </form>
        </Modal>
      )}

      {showDelete && (
        <Modal title="Delete User" onClose={() => setShowDelete(null)} size="md">
          <div className="space-y-4">
            <div className="alert alert--error">
              {IC.warning}
              <div>
                <p style={{ fontWeight: 600, fontSize: 13, marginBottom: 3 }}>This cannot be undone.</p>
                <p style={{ fontSize: 12 }}>The Firestore record for <strong>{showDelete.name}</strong> will be permanently deleted. Their Firebase Auth account must be removed separately.</p>
              </div>
            </div>
            <div className="data-table__actions" style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <Btn variant="ghost" onClick={() => setShowDelete(null)}>Cancel</Btn>
              <Btn variant="danger" loading={actionLoading} onClick={handleDelete}>Delete User</Btn>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── MODULE 2: Student Management ─────────────────────────────────────────────
function StudentManagement({ schoolCode, schoolName }) {
  const [activeTab, setActiveTab]         = useState("list");
  const [students, setStudents]           = useState([]);
  const [classes, setClasses]             = useState([]);
  const [loading, setLoading]             = useState(true);
  const [search, setSearch]               = useState("");
  const [classFilter, setClassFilter]     = useState("all");
  const [showDetail, setShowDetail]       = useState(null);
  const [showDelete, setShowDelete]       = useState(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError]                 = useState("");

  const EMPTY_REG = {
    firstName: "", lastName: "", dob: "", gender: "",
    nationalId: "", guardianName: "", guardianPhone: "",
    guardianEmail: "", guardianRelation: "",
    district: "", village: "", classId: "",
  };
  const [regForm, setRegForm]               = useState(EMPTY_REG);
  const [regErrors, setRegErrors]           = useState({});
  const [newStudentResult, setNewStudentResult] = useState(null);

  const [transferCode, setTransferCode]         = useState("");
  const [transferFound, setTransferFound]       = useState(null);
  const [transferLoading, setTransferLoading]   = useState(false);
  const [transferError, setTransferError]       = useState("");
  const [transferSuccess, setTransferSuccess]   = useState("");
  const [transferClassId, setTransferClassId]   = useState("");

  useEffect(() => { fetchStudents(); fetchClasses(); }, []);

  async function fetchStudents() {
    setLoading(true);
    try {
      const q = query(collection(db, "students"), where("schoolCode", "==", schoolCode));
      const snap = await getDocs(q);
      setStudents(snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (a.lastName||"").localeCompare(b.lastName||"")));
    } catch (e) { console.error(e); }
    setLoading(false);
  }

  async function fetchClasses() {
    try {
      const q = query(collection(db, "school_classes"), where("schoolCode", "==", schoolCode));
      const snap = await getDocs(q);
      setClasses(snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => a.order - b.order));
    } catch (e) { setClasses([]); }
  }

  function validateReg(f) {
    const e = {};
    if (!f.firstName.trim()) e.firstName = "First name required.";
    if (!f.lastName.trim())  e.lastName  = "Last name required.";
    if (!f.dob)              e.dob       = "Date of birth required.";
    if (!f.gender)           e.gender    = "Select gender.";
    if (!f.guardianName.trim())  e.guardianName  = "Guardian name required.";
    if (!f.guardianPhone.trim()) e.guardianPhone = "Guardian phone required.";
    if (!f.classId)          e.classId   = "Select a class.";
    if (f.guardianEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.guardianEmail)) e.guardianEmail = "Enter a valid email.";
    return e;
  }

  async function handleRegister(e) {
    e.preventDefault();
    const errs = validateReg(regForm);
    if (Object.keys(errs).length) { setRegErrors(errs); return; }
    setActionLoading(true); setError("");

    const studentCode    = generateStudentCode();
    const fullName       = `${regForm.firstName.trim()} ${regForm.lastName.trim()}`;
    const cls            = classes.find(c => c.id === regForm.classId);
    const parentPassword = generatePassword();

    try {
      const studentData = {
        studentCode, firstName: regForm.firstName.trim(), lastName: regForm.lastName.trim(),
        fullName, dob: regForm.dob, gender: regForm.gender,
        nationalId: regForm.nationalId.trim() || "",
        guardianName: regForm.guardianName.trim(), guardianPhone: regForm.guardianPhone.trim(),
        guardianEmail: regForm.guardianEmail.trim() || "",
        guardianRelation: regForm.guardianRelation.trim() || "Parent/Guardian",
        district: regForm.district, village: regForm.village.trim() || "",
        classId: regForm.classId, className: cls?.name || "",
        schoolCode, schoolName, status: "active",
        parentPortalPassword: parentPassword,
        transferHistory: [{ schoolCode, schoolName, joinedAt: new Date().toISOString(), action: "enrolled" }],
        createdAt: serverTimestamp(),
      };
      await addDoc(collection(db, "students"), studentData);

      let emailSent = false;
      if (regForm.guardianEmail.trim()) {
        await sendEmail({
          templateId: EMAILJS_GUARDIAN_TEMPLATE_ID,
          toEmail: regForm.guardianEmail.trim(), toName: regForm.guardianName.trim(),
          params: {
            student_name: fullName, student_code: studentCode,
            school_name: schoolName, class_name: cls?.name || "",
            parent_password: parentPassword,
            portal_url: window.location.origin + "/parent-portal",
            login_note: `Use Student Code: ${studentCode} and the password above to log into the parent portal.`,
          },
        });
        emailSent = true;
      }
      setNewStudentResult({ code: studentCode, guardianEmail: regForm.guardianEmail.trim(), emailSent });
      setRegForm(EMPTY_REG); setRegErrors({});
      fetchStudents();
    } catch (err) { setError("Registration failed: " + err.message); }
    setActionLoading(false);
  }

  async function handleTransferLookup() {
    setTransferLoading(true); setTransferError(""); setTransferFound(null);
    const code = transferCode.trim().toUpperCase();
    if (!code) { setTransferError("Enter a student code."); setTransferLoading(false); return; }
    try {
      const q = query(collection(db, "students"), where("studentCode", "==", code), limit(1));
      const snap = await getDocs(q);
      if (snap.empty) {
        setTransferError(`No student found with code ${code}.`);
      } else {
        const st = { id: snap.docs[0].id, ...snap.docs[0].data() };
        if (st.schoolCode === schoolCode) setTransferError("This student is already enrolled here.");
        else setTransferFound(st);
      }
    } catch (e) { setTransferError("Lookup failed: " + e.message); }
    setTransferLoading(false);
  }

  async function handleTransferConfirm() {
    if (!transferFound || !transferClassId) { setTransferError("Please select a class."); return; }
    setTransferLoading(true); setTransferError(""); setTransferSuccess("");
    try {
      const cls = classes.find(c => c.id === transferClassId);
      const newHistory = [
        ...(transferFound.transferHistory || []),
        { schoolCode, schoolName, joinedAt: new Date().toISOString(), action: "transferred_in" },
      ];
      await updateDoc(doc(db, "students", transferFound.id), {
        schoolCode, schoolName, classId: transferClassId, className: cls?.name || "",
        status: "active", transferHistory: newHistory, lastTransferAt: serverTimestamp(),
      });
      setTransferSuccess(`${transferFound.fullName} has been transferred to ${schoolName} — ${cls?.name || "selected class"}.`);
      setTransferFound(null); setTransferCode(""); setTransferClassId("");
      fetchStudents();
    } catch (e) { setTransferError("Transfer failed: " + e.message); }
    setTransferLoading(false);
  }

  async function handleDeleteStudent() {
    setActionLoading(true);
    try { await deleteDoc(doc(db, "students", showDelete.id)); setShowDelete(null); fetchStudents(); }
    catch (err) { console.error(err); }
    setActionLoading(false);
  }

  const filtered = students.filter(s => {
    const ms = !search || s.fullName?.toLowerCase().includes(search.toLowerCase()) || s.studentCode?.toLowerCase().includes(search.toLowerCase());
    const mc = classFilter === "all" || s.classId === classFilter;
    return ms && mc;
  });

  const tabs = [
    { id: "list",     label: "Student List",    icon: IC.users    },
    { id: "register", label: "Register Student", icon: IC.plus     },
    { id: "transfer", label: "Transfer In",      icon: IC.transfer },
  ];

  function resetTabState() { setError(""); setNewStudentResult(null); setTransferSuccess(""); setTransferError(""); }

  return (
    <div className="space-y-6">
      <div className="flex-between" style={{ flexWrap: "wrap", gap: 12 }}>
        <div>
          <h2 className="module-title">Student Management</h2>
          <p className="module-sub">{students.length} students enrolled — {schoolName}</p>
        </div>
      </div>

      <div className="sub-tabs" style={{ overflowX: "auto" }}>
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => { setActiveTab(t.id); resetTabState(); }}
            className={`sub-tab${activeTab === t.id ? " sub-tab--active" : ""}`}
          >
            {t.icon}<span>{t.label}</span>
          </button>
        ))}
      </div>

      {activeTab === "list" && (
        <div className="space-y-4">
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <div className="search-wrap" style={{ flex: 1, minWidth: 200 }}>
              <span className="search-wrap__icon">{IC.search}</span>
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name or code…" className="search-wrap__input" />
            </div>
            <select value={classFilter} onChange={e => setClassFilter(e.target.value)} className="field__select" style={{ width: "auto", minWidth: 140 }}>
              <option value="all">All Classes</option>
              {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          <div className="card">
            {loading ? (
              <div style={{ padding: 48, display: "flex", justifyContent: "center" }}><Spinner /></div>
            ) : filtered.length === 0 ? (
              <EmptyState icon={IC.students} title="No students found"
                sub={search ? "Try a different search" : "Register your first student"}
                action={<Btn onClick={() => setActiveTab("register")} variant="gold" size="sm">{IC.plus} Register</Btn>}
              />
            ) : (
              <div className="data-table-wrap">
<table className="data-table data-table--stack">
                <thead>
                  <tr>
                    <th>Student</th><th>Code</th><th>Class</th><th>Guardian</th><th>Status</th>
                    <th style={{ textAlign: "right" }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(s => (
                    <tr key={s.id}>
                      <td data-label="Student">
                        <div className="flex-gap-3">
                          <div className={`avatar ${s.gender === "Female" ? "avatar--pink" : "avatar--blue"}`}>{initials(s.fullName)}</div>
                          <div>
                            <div className="data-table__primary">{s.fullName}</div>
                            <div className="data-table__meta">{s.gender} · {s.dob || "—"}</div>
                          </div>
                        </div>
                      </td>
                      <td data-label="Code"><StudentCodeBadge code={s.studentCode} /></td>
                      <td style={{ fontSize: 13, color: "var(--text2)" }} data-label="Class">{s.className || "—"}</td>
                      <td data-label="Guardian">
                        <div style={{ fontSize: 12, color: "var(--text2)" }}>{s.guardianName || "—"}</div>
                        <div style={{ fontSize: 11, color: "var(--text3)" }}>{s.guardianPhone || ""}</div>
                      </td>
                      <td data-label="Status"><StatusPill active={s.status !== "suspended"} /></td>
                      <td data-label="Actions">
                        <div className="data-table__actions" style={{ display: "flex", justifyContent: "flex-end", gap: 2 }}>
                          <ActionBtn onClick={() => setShowDetail(s)} icon={IC.eye} title="View profile" />
                          <ActionBtn onClick={() => setShowDelete(s)} icon={IC.trash} title="Remove" hoverBg="rgba(239,68,68,0.1)" />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
</div>
            )}
          </div>
        </div>
      )}

      {activeTab === "register" && (
        <div style={{ maxWidth: 680 }}>
          {newStudentResult ? (
            <div className="card" style={{ padding: 40, textAlign: "center" }}>
              <div style={{ width: 56, height: 56, background: "rgba(34,197,94,0.15)", borderRadius: 18, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px", color: "#4ade80" }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width={28} height={28}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5"/></svg>
              </div>
              <h3 style={{ fontFamily: "var(--font-display)", fontSize: "1.3rem", color: "var(--text)", marginBottom: 6 }}>Student Registered!</h3>
              <p style={{ fontSize: 13, color: "var(--text3)", marginBottom: 20 }}>This student code is the unique identifier across all schools.</p>
              <div style={{ background: "var(--accent-pale)", borderRadius: 16, padding: "16px 24px", display: "inline-flex", flexDirection: "column", alignItems: "center", gap: 8, marginBottom: 20 }}>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: 2, textTransform: "uppercase", color: "var(--accent-lt)", opacity: 0.7 }}>Student Code</span>
                <StudentCodeBadge code={newStudentResult.code} />
                <span style={{ fontSize: 11, color: "var(--text3)" }}>Used for transfers and parent portal login</span>
              </div>
              {newStudentResult.guardianEmail ? (
                newStudentResult.emailSent
                  ? <div className="alert alert--success">{IC.mail}<span>Credentials sent to <strong>{newStudentResult.guardianEmail}</strong></span></div>
                  : <div className="alert alert--warning">{IC.warning}<span>Email may have failed. Share the code manually.</span></div>
              ) : (
                <div className="alert alert--info">{IC.info}<span>No guardian email provided. Share the student code manually.</span></div>
              )}
              <div style={{ display: "flex", justifyContent: "center", gap: 10, marginTop: 20 }}>
                <Btn variant="ghost" onClick={() => { setNewStudentResult(null); setActiveTab("list"); }}>View Students</Btn>
                <Btn variant="gold" onClick={() => setNewStudentResult(null)}>Register Another</Btn>
              </div>
            </div>
          ) : (
            <form onSubmit={handleRegister} className="card" style={{ padding: 28 }}>
              {error && <div className="alert alert--error" style={{ marginBottom: 16 }}>{IC.warning}<span>{error}</span></div>}
              <div style={{ marginBottom: 24 }}>
                <span className="section-tag">Personal Information</span>
                <div className="grid-2" style={{ marginTop: 12 }}>
                  <Input label="First Name" required value={regForm.firstName} onChange={e => setRegForm(p => ({...p, firstName: e.target.value}))} placeholder="Chisomo" error={regErrors.firstName} />
                  <Input label="Last Name" required value={regForm.lastName} onChange={e => setRegForm(p => ({...p, lastName: e.target.value}))} placeholder="Banda" error={regErrors.lastName} />
                  <Input label="Date of Birth" required type="date" value={regForm.dob} onChange={e => setRegForm(p => ({...p, dob: e.target.value}))} error={regErrors.dob} />
                  <Select label="Gender" required value={regForm.gender} onChange={e => setRegForm(p => ({...p, gender: e.target.value}))} error={regErrors.gender}>
                    <option value="">Select…</option>
                    {GENDERS.map(g => <option key={g} value={g}>{g}</option>)}
                  </Select>
                  <Input label="National ID (optional)" value={regForm.nationalId} onChange={e => setRegForm(p => ({...p, nationalId: e.target.value}))} placeholder="Optional" />
                  <Select label="District of Origin" value={regForm.district} onChange={e => setRegForm(p => ({...p, district: e.target.value}))}>
                    <option value="">Select…</option>
                    {DISTRICTS.map(d => <option key={d} value={d}>{d}</option>)}
                  </Select>
                </div>
                <div style={{ marginTop: 16 }}>
                  <Input label="Village / Area" value={regForm.village} onChange={e => setRegForm(p => ({...p, village: e.target.value}))} placeholder="Home village or area" />
                </div>
              </div>
              <div style={{ marginBottom: 24 }}>
                <span className="section-tag">Guardian / Parent Information</span>
                <div className="grid-2" style={{ marginTop: 12 }}>
                  <Input label="Guardian Full Name" required value={regForm.guardianName} onChange={e => setRegForm(p => ({...p, guardianName: e.target.value}))} placeholder="John Banda" error={regErrors.guardianName} />
                  <Input label="Guardian Phone" required value={regForm.guardianPhone} onChange={e => setRegForm(p => ({...p, guardianPhone: e.target.value}))} placeholder="+265 9xx xxx xxx" error={regErrors.guardianPhone} />
                  <Input label="Relationship" value={regForm.guardianRelation} onChange={e => setRegForm(p => ({...p, guardianRelation: e.target.value}))} placeholder="Father / Mother / Uncle…" />
                </div>
                <div style={{ marginTop: 16 }}>
                  <Input label="Guardian Email (for parent portal)" type="email" value={regForm.guardianEmail} onChange={e => setRegForm(p => ({...p, guardianEmail: e.target.value}))} placeholder="guardian@example.com" error={regErrors.guardianEmail} />
                  <p style={{ fontSize: 11, color: "var(--text3)", marginTop: 5, display: "flex", gap: 6, alignItems: "center" }}>{IC.info} If provided, guardian receives student code + parent portal credentials.</p>
                </div>
              </div>
              <div style={{ marginBottom: 24 }}>
                <span className="section-tag">Academic Placement</span>
                <div style={{ marginTop: 12 }}>
                  <Select label="Assign to Class" required value={regForm.classId} onChange={e => setRegForm(p => ({...p, classId: e.target.value}))} error={regErrors.classId}>
                    <option value="">Select class…</option>
                    {classes.length === 0 && <option disabled>No classes — add in School Settings</option>}
                    {classes.map(c => <option key={c.id} value={c.id}>{c.name} ({c.level})</option>)}
                  </Select>
                </div>
              </div>
              <div className="data-table__actions" style={{ display: "flex", justifyContent: "flex-end", gap: 8, paddingTop: 8 }}>
                <Btn type="button" variant="ghost" onClick={() => setRegForm(EMPTY_REG)}>Clear Form</Btn>
                <Btn type="submit" variant="gold" loading={actionLoading}>{IC.students} Register Student</Btn>
              </div>
            </form>
          )}
        </div>
      )}

      {activeTab === "transfer" && (
        <div style={{ maxWidth: 680 }} className="space-y-5">
          <div className="alert alert--info">
            {IC.info}
            <div style={{ fontSize: 12, lineHeight: 1.6 }}>
              <strong>How transfers work:</strong> Enter the student's code (STU-XXXX-XXXX). Their full record is retrieved and linked to this school. Previous school data is unchanged.
            </div>
          </div>
          {transferSuccess ? (
            <div className="card" style={{ padding: 40, textAlign: "center" }}>
              <div style={{ width: 56, height: 56, background: "rgba(34,197,94,0.15)", borderRadius: 18, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px", color: "#4ade80" }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width={28} height={28}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5"/></svg>
              </div>
              <p style={{ fontFamily: "var(--font-display)", fontSize: "1.1rem", color: "var(--text)", marginBottom: 8 }}>Transfer Complete</p>
              <p style={{ fontSize: 13, color: "var(--text3)", marginBottom: 20 }}>{transferSuccess}</p>
              <div style={{ display: "flex", justifyContent: "center", gap: 10 }}>
                <Btn variant="ghost" onClick={() => { setTransferSuccess(""); setActiveTab("list"); }}>View Students</Btn>
                <Btn variant="gold" onClick={() => setTransferSuccess("")}>Transfer Another</Btn>
              </div>
            </div>
          ) : (
            <div className="card space-y-5" style={{ padding: 24 }}>
              <div>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <input
                    value={transferCode}
                    onChange={e => { setTransferCode(e.target.value.toUpperCase()); setTransferFound(null); setTransferError(""); }}
                    placeholder="STU-XXXX-XXXX"
                    className="field__input"
                    style={{ fontFamily: "var(--font-mono)", letterSpacing: 2, flex: 1, minWidth: 180 }}
                  />
                  <Btn onClick={handleTransferLookup} loading={transferLoading} variant="accent">Look Up</Btn>
                </div>
                {transferError && <p style={{ fontSize: 12, color: "#f87171", marginTop: 6 }}>{transferError}</p>}
              </div>
              {transferFound && (
                <div style={{ borderTop: "1px solid var(--border)", paddingTop: 20 }} className="space-y-4">
                  <span className="section-tag">Confirm &amp; Assign Class</span>
                  <div style={{ background: "var(--bg2)", borderRadius: 16, padding: 16, border: "1px solid var(--border)" }}>
                    <div className="flex-gap-3" style={{ marginBottom: 14 }}>
                      <div className={`avatar ${transferFound.gender === "Female" ? "avatar--pink" : "avatar--blue"}`} style={{ width: 44, height: 44 }}>{initials(transferFound.fullName)}</div>
                      <div>
                        <p style={{ fontWeight: 700, fontSize: 14, color: "var(--text)" }}>{transferFound.fullName}</p>
                        <StudentCodeBadge code={transferFound.studentCode} />
                      </div>
                    </div>
                    <div className="grid-2" style={{ fontSize: 12, gap: 8 }}>
                      {[
                        ["Gender", transferFound.gender], ["DOB", transferFound.dob||"—"],
                        ["Guardian", transferFound.guardianName], ["Phone", transferFound.guardianPhone],
                        ["Previous School", transferFound.schoolName||transferFound.schoolCode], ["Previous Class", transferFound.className||"—"],
                      ].map(([k, v]) => (
                        <div key={k}><span style={{ color: "var(--text3)" }}>{k}: </span><strong style={{ color: "var(--text)" }}>{v}</strong></div>
                      ))}
                    </div>
                  </div>
                  <Select label="Assign to Class at This School" required value={transferClassId} onChange={e => setTransferClassId(e.target.value)}>
                    <option value="">Select class…</option>
                    {classes.map(c => <option key={c.id} value={c.id}>{c.name} ({c.level})</option>)}
                  </Select>
                  <div className="data-table__actions" style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                    <Btn variant="ghost" onClick={() => { setTransferFound(null); setTransferCode(""); }}>Cancel</Btn>
                    <Btn variant="teal" onClick={handleTransferConfirm} loading={transferLoading}>{IC.transfer} Confirm Transfer</Btn>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {showDetail && (
        <Modal title="Student Profile" onClose={() => setShowDetail(null)} size="lg">
          <div className="space-y-5">
            <div className="flex-gap-4">
              <div className={`avatar ${showDetail.gender === "Female" ? "avatar--pink" : "avatar--blue"}`} style={{ width: 56, height: 56, borderRadius: 16, fontSize: 18 }}>{initials(showDetail.fullName)}</div>
              <div>
                <h3 style={{ fontFamily: "var(--font-display)", fontSize: "1.3rem", color: "var(--text)" }}>{showDetail.fullName}</h3>
                <StudentCodeBadge code={showDetail.studentCode} />
                <p style={{ fontSize: 11.5, color: "var(--text3)", marginTop: 4 }}>{showDetail.className} · {showDetail.gender} · {showDetail.status}</p>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 2, borderRadius: 14, overflow: "hidden" }}>
              {[
                ["Date of Birth", showDetail.dob||"—"], ["National ID", showDetail.nationalId||"—"],
                ["District", showDetail.district||"—"], ["Village", showDetail.village||"—"],
                ["Guardian", showDetail.guardianName||"—"], ["Relationship", showDetail.guardianRelation||"—"],
                ["Guardian Phone", showDetail.guardianPhone||"—"], ["Guardian Email", showDetail.guardianEmail||"—"],
                ["Enrolled", fmtDate(showDetail.createdAt)], ["Parent Portal", showDetail.guardianEmail ? "Email sent ✓" : "No email provided"],
              ].map(([k, v]) => (
                <div key={k} style={{ background: "var(--bg-card)", padding: "10px 16px", border: "1px solid var(--border)" }}>
                  <p style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: 2, textTransform: "uppercase", color: "var(--text3)", marginBottom: 3 }}>{k}</p>
                  <p style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>{v}</p>
                </div>
              ))}
            </div>
          </div>
        </Modal>
      )}

      {showDelete && (
        <Modal title="Remove Student" onClose={() => setShowDelete(null)} size="md">
          <div className="space-y-4">
            <div className="alert alert--error">
              {IC.warning}
              <div>
                <p style={{ fontWeight: 600, fontSize: 13, marginBottom: 3 }}>Remove from this school?</p>
                <p style={{ fontSize: 12 }}><strong>{showDelete.fullName}</strong>'s record will be removed from {schoolName}. Their student code stays valid for future enrolment elsewhere.</p>
              </div>
            </div>
            <div className="data-table__actions" style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <Btn variant="ghost" onClick={() => setShowDelete(null)}>Cancel</Btn>
              <Btn variant="danger" loading={actionLoading} onClick={handleDeleteStudent}>Remove Student</Btn>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── MODULE 3: School Settings ────────────────────────────────────────────────
function SchoolSettings({ schoolCode, schoolData, onUpdate }) {
  const [form, setForm]             = useState({ name: "", district: "", address: "", phone: "", email: "" });
  const [classes, setClasses]       = useState([]);
  const [loading, setLoading]       = useState(false);
  const [saved, setSaved]           = useState(false);
  const [error, setError]           = useState("");
  const [showClassModal, setShowClassModal] = useState(false);
  const [editingClass, setEditingClass]     = useState(null);
  const [classForm, setClassForm]   = useState({ name: "", level: "primary", subjects: [] });

  useEffect(() => {
    if (schoolData) setForm({ name: schoolData.name||"", district: schoolData.district||"", address: schoolData.address||"", phone: schoolData.phone||"", email: schoolData.email||"" });
    fetchClasses();
  }, [schoolData]);

  async function fetchClasses() {
    try {
      const q = query(collection(db, "school_classes"), where("schoolCode", "==", schoolCode));
      const snap = await getDocs(q);
      setClasses(snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => a.order - b.order));
    } catch (e) { setClasses([]); }
  }

  async function handleSaveSchool(e) {
    e.preventDefault(); setLoading(true); setError(""); setSaved(false);
    try {
      await updateDoc(doc(db, "schools", schoolCode), { ...form, name: form.name.trim(), address: form.address.trim(), phone: form.phone.trim(), email: form.email.trim(), updatedAt: serverTimestamp() });
      setSaved(true); if (onUpdate) onUpdate({ ...schoolData, ...form });
      setTimeout(() => setSaved(false), 3000);
    } catch (err) { setError("Save failed: " + err.message); }
    setLoading(false);
  }

  function openClassModal(cls = null) {
    if (cls) {
      setClassForm({ name: cls.name||"", level: cls.level||"primary", subjects: cls.subjects||[] });
      setEditingClass(cls);
    } else {
      setClassForm({ name: "", level: "primary", subjects: [] });
      setEditingClass(null);
    }
    setShowClassModal(true);
  }

  async function saveClass() {
    if (!classForm.name.trim()) { alert("Class name required"); return; }
    setLoading(true);
    try {
      const data = {
        name: classForm.name.trim(), level: classForm.level,
        subjects: classForm.subjects.length > 0 ? classForm.subjects : (classForm.level === "primary" ? PRIMARY_SUBJECTS : SECONDARY_SUBJECTS),
        schoolCode, order: classes.length + 1, updatedAt: serverTimestamp(),
      };
      if (editingClass) await updateDoc(doc(db, "school_classes", editingClass.id), data);
      else await addDoc(collection(db, "school_classes"), data);
      setShowClassModal(false); fetchClasses();
    } catch (err) { alert("Failed to save class"); }
    setLoading(false);
  }

  async function deleteClass(id) {
    if (!confirm("Delete this class?")) return;
    try { await deleteDoc(doc(db, "school_classes", id)); fetchClasses(); } catch (e) { console.error(e); }
  }

  function toggleSubject(subject) {
    setClassForm(prev => ({
      ...prev,
      subjects: prev.subjects.includes(subject)
        ? prev.subjects.filter(s => s !== subject)
        : [...prev.subjects, subject],
    }));
  }

  return (
    <div className="space-y-8" style={{ maxWidth: 800 }}>
      <div>
        <h2 className="module-title">School Settings</h2>
        <p className="module-sub">Manage your institution's profile, contact details, and class structure</p>
      </div>
      <div className="card" style={{ padding: 28 }}>
        {error && <div className="alert alert--error" style={{ marginBottom: 16 }}>{IC.warning}<span>{error}</span></div>}
        {saved && <div className="alert alert--success" style={{ marginBottom: 16 }}>{IC.check}<span>Settings saved successfully.</span></div>}
        <div className="space-y-4">
          <Input label="School Name" required value={form.name} onChange={e => setForm(p => ({...p, name: e.target.value}))} />
          <Select label="District" required value={form.district} onChange={e => setForm(p => ({...p, district: e.target.value}))}>
            <option value="">Select district…</option>
            {DISTRICTS.map(d => <option key={d} value={d}>{d}</option>)}
          </Select>
          <Textarea label="Physical Address" value={form.address} onChange={e => setForm(p => ({...p, address: e.target.value}))} rows={2} />
          <div className="grid-2">
            <Input label="Phone Number" type="tel" value={form.phone} onChange={e => setForm(p => ({...p, phone: e.target.value}))} />
            <Input label="Email Address" type="email" value={form.email} onChange={e => setForm(p => ({...p, email: e.target.value}))} />
          </div>
          <div className="data-table__actions" style={{ display: "flex", justifyContent: "flex-end", paddingTop: 8 }}>
            <Btn onClick={handleSaveSchool} loading={loading} variant="accent">Save School Info</Btn>
          </div>
        </div>
      </div>
      <div className="card">
        <div style={{ padding: "20px 24px", borderBottom: "1px solid var(--border)", background: "var(--bg2)", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <div>
            <p style={{ fontFamily: "var(--font-display)", fontSize: 16, color: "var(--text)", letterSpacing: 0.5 }}>Classes &amp; Subjects</p>
            <p style={{ fontSize: 12, color: "var(--text3)", marginTop: 2 }}>Based on Malawi National Curriculum (Primary: Std 1–8 | Secondary: Form 1–4)</p>
          </div>
          <Btn onClick={() => openClassModal()} variant="gold" size="sm">{IC.plus} Add Class</Btn>
        </div>
        <div style={{ padding: 24 }}>
          {classes.length === 0 ? (
            <EmptyState icon={IC.school} title="No classes defined yet" sub="Add classes per Malawian curriculum"
              action={<Btn onClick={() => openClassModal()} variant="gold">{IC.plus} Add First Class</Btn>}
            />
          ) : (
            <div className="space-y-4">
              {classes.map(cls => (
                <div key={cls.id} style={{ border: "1px solid var(--border)", borderRadius: 16, padding: 20 }}>
                  <div className="flex-between" style={{ marginBottom: 14, flexWrap: "wrap", gap: 8 }}>
                    <div className="flex-gap-3">
                      <span style={{ background: "var(--accent-pale)", color: "var(--accent-lt)", border: "1px solid var(--border)", fontSize: 10, fontWeight: 700, padding: "3px 10px", borderRadius: 6, letterSpacing: 1, textTransform: "uppercase" }}>{cls.level}</span>
                      <span style={{ fontFamily: "var(--font-display)", fontSize: 16, color: "var(--text)" }}>{cls.name}</span>
                    </div>
                    <div style={{ display: "flex", gap: 6 }}>
                      <ActionBtn onClick={() => openClassModal(cls)} icon={IC.edit} title="Edit class" />
                      <ActionBtn onClick={() => deleteClass(cls.id)} icon={IC.trash} title="Delete class" hoverBg="rgba(239,68,68,0.1)" />
                    </div>
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {cls.subjects?.map((sub, i) => (
                      <span key={i} className="badge badge--teal">{sub}</span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      {showClassModal && (
        <Modal title={editingClass ? "Edit Class" : "Add New Class"} onClose={() => setShowClassModal(false)} size="lg">
          <div className="space-y-5">
            <div className="grid-2">
              <Input label="Class Name" required value={classForm.name} onChange={e => setClassForm(p => ({...p, name: e.target.value}))} placeholder={classForm.level === "primary" ? "Standard 5" : "Form 2"} />
              <Select label="Level" required value={classForm.level} onChange={e => setClassForm(p => ({...p, level: e.target.value, subjects: []}))}>
                <option value="primary">Primary</option>
                <option value="secondary">Secondary</option>
              </Select>
            </div>
            <div>
              <label className="field__label">Subjects</label>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, maxHeight: 220, overflowY: "auto", padding: 12, border: "1px solid var(--border)", borderRadius: 12, background: "var(--bg)", marginTop: 6 }}>
                {(classForm.level === "primary" ? PRIMARY_SUBJECTS : SECONDARY_SUBJECTS).map((subject, idx) => (
                  <label key={idx} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer", padding: "7px 10px", borderRadius: 8, color: "var(--text2)" }}>
                    <input type="checkbox" checked={classForm.subjects.includes(subject)} onChange={() => toggleSubject(subject)} style={{ accentColor: "var(--accent)" }} />
                    <span>{subject}</span>
                  </label>
                ))}
              </div>
              <p style={{ fontSize: 11, color: "var(--text3)", marginTop: 5 }}>Defaults applied if none selected.</p>
            </div>
            <div className="data-table__actions" style={{ display: "flex", justifyContent: "flex-end", gap: 8, paddingTop: 8, borderTop: "1px solid var(--border)" }}>
              <Btn variant="ghost" onClick={() => setShowClassModal(false)}>Cancel</Btn>
              <Btn onClick={saveClass} variant="gold" loading={loading}>{editingClass ? "Update Class" : "Add Class"}</Btn>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── MODULE 4: Billing ────────────────────────────────────────────────────────
function Billing({ schoolData }) {
  const status = schoolData?.subscription_status || "trial";
  const plans = [
    { id: "trial",    name: "Trial",    price: "Free",       period: "30 days",  desc: "For schools getting started.", features: ["Up to 5 users", "Core modules", "Email support"], current: status === "trial" },
    { id: "standard", name: "Standard", price: "MWK 45,000", period: "/ month",  desc: "Best for growing schools.", features: ["Up to 30 users", "All modules", "Priority support", "Data exports"], current: status === "standard" },
    { id: "premium",  name: "Premium",  price: "MWK 95,000", period: "/ month",  desc: "Full power for large institutions.", features: ["Unlimited users", "All modules + API", "24/7 support", "Custom reports", "Multi-branch"], current: status === "premium" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="module-title">Subscription &amp; Billing</h2>
        <p className="module-sub">Manage your plan and payment details</p>
      </div>
      <div className={`alert ${status === "trial" ? "alert--warning" : "alert--success"}`} style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <div>
          <p style={{ fontWeight: 700, fontSize: 14 }}>Current plan: <span style={{ textTransform: "capitalize" }}>{status}</span></p>
          {status === "trial" && <p style={{ fontSize: 12, marginTop: 3 }}>Upgrade to unlock all features.</p>}
        </div>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: 1, padding: "4px 12px", borderRadius: 8, background: status === "trial" ? "rgba(232,168,0,0.2)" : "rgba(34,197,94,0.2)", color: status === "trial" ? "var(--gold-lt)" : "#4ade80", fontWeight: 700 }}>
          {status === "trial" ? "Trial Active" : "Subscribed"}
        </span>
      </div>
      <div className="plan-grid">
        {plans.map(plan => (
          <div key={plan.id} className={`plan-card${plan.current ? " plan-card--featured" : ""}`}>
            <p className="plan-card__tier">{plan.name}</p>
            <p className="plan-card__name">{plan.name}</p>
            <p className="plan-card__price">{plan.price} <span className="plan-card__period">{plan.period}</span></p>
            <p className="plan-card__desc">{plan.desc}</p>
            <ul className="plan-card__features">
              {plan.features.map(f => (
                <li key={f} className="plan-card__feature">
                  <span className="plan-card__feature-icon">{IC.check}</span>{f}
                </li>
              ))}
            </ul>
            {plan.current
              ? <div style={{ textAlign: "center", fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--teal-lt)", letterSpacing: 1 }}>CURRENT PLAN</div>
              : <Btn variant={plan.id === "premium" ? "gold" : "ghost"} size="sm" onClick={() => alert("Contact billing@ssp-pep.mw to upgrade")}>Upgrade</Btn>
            }
          </div>
        ))}
      </div>
      <div style={{ background: "var(--accent-pale)", border: "1px solid var(--border2)", borderRadius: 16, padding: 20 }}>
        <p style={{ fontWeight: 600, color: "var(--text)", marginBottom: 4 }}>Need to change your plan?</p>
        <p style={{ fontSize: 12.5, color: "var(--text2)" }}>Contact SSP-PEP billing: <span style={{ fontFamily: "var(--font-mono)", color: "var(--accent-lt)" }}>billing@ssp-pep.mw</span> or call <span style={{ fontFamily: "var(--font-mono)" }}>+265 1 XXX XXX</span>.</p>
      </div>
    </div>
  );
}

// ─── MODULE 5: Announcements ──────────────────────────────────────────────────
function Announcements({ schoolCode, userName }) {
  const [items, setItems]             = useState([]);
  const [loading, setLoading]         = useState(true);
  const [showAdd, setShowAdd]         = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [form, setForm]               = useState({ title: "", body: "", audience: "all", priority: "normal" });
  const [error, setError]             = useState("");

  useEffect(() => { fetchAnnouncements(); }, []);

  async function fetchAnnouncements() {
    setLoading(true);
    try {
      const q = query(collection(db, "announcements"), where("schoolCode", "==", schoolCode), orderBy("createdAt", "desc"));
      const snap = await getDocs(q);
      setItems(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) { console.error(e); }
    setLoading(false);
  }

  async function handlePost(e) {
    e.preventDefault();
    if (!form.title.trim() || !form.body.trim()) { setError("Title and message are required."); return; }
    setActionLoading(true); setError("");
    try {
      await addDoc(collection(db, "announcements"), { ...form, schoolCode, postedBy: userName, createdAt: serverTimestamp() });
      setShowAdd(false); setForm({ title: "", body: "", audience: "all", priority: "normal" }); fetchAnnouncements();
    } catch (err) { setError("Failed to post: " + err.message); }
    setActionLoading(false);
  }

  async function handleDelete(id) {
    if (!window.confirm("Delete this announcement?")) return;
    try { await deleteDoc(doc(db, "announcements", id)); fetchAnnouncements(); } catch (e) { console.error(e); }
  }

  const audienceLabel = { all: "Everyone", staff: "Staff Only", parents: "Parents Only", teachers: "Teachers Only" };
  const priorityBadge = { urgent: "badge--red", high: "badge--amber", normal: "badge--blue" };

  return (
    <div className="space-y-6">
      <div className="flex-between" style={{ flexWrap: "wrap", gap: 12 }}>
        <div>
          <h2 className="module-title">Announcements &amp; Notices</h2>
          <p className="module-sub">Broadcast messages to staff, parents, and teachers</p>
        </div>
        <Btn onClick={() => setShowAdd(true)} variant="gold" size="sm">{IC.plus} New Announcement</Btn>
      </div>
      {loading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: 48 }}><Spinner /></div>
      ) : items.length === 0 ? (
        <EmptyState icon={IC.bell} title="No announcements yet" sub="Post your first notice"
          action={<Btn onClick={() => setShowAdd(true)} variant="gold" size="sm">{IC.plus} Post</Btn>}
        />
      ) : (
        <div className="space-y-3">
          {items.map(item => (
            <div key={item.id} className="card" style={{ padding: 20 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 6 }}>
                    <span className={`badge ${priorityBadge[item.priority] || "badge--blue"}`}>{item.priority}</span>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text3)", letterSpacing: 1 }}>→ {audienceLabel[item.audience] || item.audience}</span>
                  </div>
                  <p style={{ fontWeight: 700, fontSize: 14, color: "var(--text)", marginBottom: 4 }}>{item.title}</p>
                  <p style={{ fontSize: 13, color: "var(--text2)", lineHeight: 1.6 }}>{item.body}</p>
                  <p style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text3)", marginTop: 8 }}>Posted by {item.postedBy} · {fmtDate(item.createdAt)}</p>
                </div>
                <ActionBtn onClick={() => handleDelete(item.id)} icon={IC.trash} title="Delete" hoverBg="rgba(239,68,68,0.1)" />
              </div>
            </div>
          ))}
        </div>
      )}
      {showAdd && (
        <Modal title="New Announcement" onClose={() => setShowAdd(false)} size="lg">
          <form onSubmit={handlePost} className="space-y-4">
            {error && <div className="alert alert--error">{IC.warning}<span>{error}</span></div>}
            <Input label="Title" required value={form.title} onChange={e => setForm(p => ({...p, title: e.target.value}))} />
            <Textarea label="Message" value={form.body} onChange={e => setForm(p => ({...p, body: e.target.value}))} rows={4} />
            <div className="grid-2">
              <Select label="Audience" value={form.audience} onChange={e => setForm(p => ({...p, audience: e.target.value}))}>
                <option value="all">Everyone</option>
                <option value="staff">Staff Only</option>
                <option value="teachers">Teachers Only</option>
                <option value="parents">Parents Only</option>
              </Select>
              <Select label="Priority" value={form.priority} onChange={e => setForm(p => ({...p, priority: e.target.value}))}>
                <option value="normal">Normal</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </Select>
            </div>
            <div className="data-table__actions" style={{ display: "flex", justifyContent: "flex-end", gap: 8, paddingTop: 8 }}>
              <Btn type="button" variant="ghost" onClick={() => setShowAdd(false)}>Cancel</Btn>
              <Btn type="submit" variant="gold" loading={actionLoading}>Post Announcement</Btn>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

// ─── MODULE 6: Audit Log ──────────────────────────────────────────────────────
function AuditLog({ schoolCode }) {
  const [logs, setLogs]       = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { fetchLogs(); }, []);

  async function fetchLogs() {
    setLoading(true);
    try {
      const q = query(collection(db, "audit_logs"), where("schoolCode", "==", schoolCode), orderBy("timestamp", "desc"));
      const snap = await getDocs(q);
      setLogs(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) { setLogs([]); }
    setLoading(false);
  }

  const actionBadge = {
    user_created: "badge--green", user_deleted: "badge--red",
    user_suspended: "badge--amber", settings_updated: "badge--blue",
    announcement_posted: "badge--purple", student_registered: "badge--teal",
    student_transferred: "badge--blue",
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="module-title">Audit Log</h2>
        <p className="module-sub">A record of all administrative actions</p>
      </div>
      <div className="card">
        {loading ? (
          <div style={{ padding: 48, display: "flex", justifyContent: "center" }}><Spinner /></div>
        ) : logs.length === 0 ? (
          <EmptyState icon={IC.audit} title="No audit entries yet" sub="Actions appear here automatically" />
        ) : (
          <div>
            {logs.map(log => (
              <div key={log.id} style={{ padding: "16px 20px", borderBottom: "1px solid var(--border)", display: "flex", gap: 14, alignItems: "flex-start" }}>
                <div style={{ width: 32, height: 32, background: "var(--accent-pale)", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--accent-lt)", flexShrink: 0, marginTop: 2 }}>{IC.audit}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 3 }}>
                    <span className={`badge ${actionBadge[log.action] || "badge--blue"}`}>{(log.action||"").replace(/_/g," ")}</span>
                    <span style={{ fontSize: 12.5, color: "var(--text2)" }}>{log.description}</span>
                  </div>
                  <p style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text3)", letterSpacing: 0.5 }}>By {log.performedBy} · {fmtDate(log.timestamp)}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Overview ─────────────────────────────────────────────────────────────────
function Overview({ userData, schoolData, schoolCode, setTab }) {
  const displayName  = userData?.name || "Admin";
  const schoolName   = schoolData?.name || schoolCode;
  const subscription = schoolData?.subscription_status || "trial";

  const quickActions = [
    { label: "Add Staff User",   icon: IC.users,    tab: "users",         color: "quick-action-btn--navy"   },
    { label: "Register Student", icon: IC.students, tab: "students",      color: "quick-action-btn--teal"   },
    { label: "Post Notice",      icon: IC.bell,     tab: "announcements", color: "quick-action-btn--gold"   },
    { label: "School Settings",  icon: IC.school,   tab: "settings",      color: "quick-action-btn--purple" },
  ];

  const moduleCards = [
    { tab: "users",         icon: IC.users,    title: "User Management",    desc: "Create and manage staff, teacher, bursar, and librarian accounts." },
    { tab: "students",      icon: IC.students, title: "Student Management", desc: "Register students with unique codes and transfer between schools." },
    { tab: "settings",      icon: IC.school,   title: "School Settings",    desc: "Update school profile, classes, subjects, and contact information." },
    { tab: "billing",       icon: IC.billing,  title: "Subscription",       desc: "View your current plan and upgrade options." },
    { tab: "announcements", icon: IC.bell,     title: "Announcements",      desc: "Broadcast notices to staff, teachers, and parents." },
    { tab: "audit",         icon: IC.audit,    title: "Audit Log",          desc: "Track all administrative actions with timestamps." },
  ];

  return (
    <div className="space-y-8">
      <div className="overview-hero">
        <div>
          <p className="overview-hero__greeting">{greeting()}</p>
          <h2 className="overview-hero__name">
            <span className="overview-hero__name-gradient">{displayName.split(" ")[0]}</span>
          </h2>
          <p className="overview-hero__school">{schoolName}</p>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-start" }}>
          <span className={`overview-hero__plan overview-hero__plan--${subscription === "trial" ? "trial" : "active"}`}>
            {subscription} plan
          </span>
          {schoolCode && <span className="overview-hero__code">{schoolCode}</span>}
        </div>
      </div>

      <div>
        <p className="sec-eyebrow">Quick Actions</p>
        <div className="quick-actions-grid">
          {quickActions.map(a => (
            <button key={a.tab} onClick={() => setTab(a.tab)} className={`quick-action-btn ${a.color}`}>
              <div className="quick-action-btn__icon">{a.icon}</div>
              <span className="quick-action-btn__label">{a.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="sec-eyebrow">Admin Modules</p>
        <div className="modules-grid">
          {moduleCards.map(m => (
            <button key={m.tab} onClick={() => setTab(m.tab)} className="module-card">
              <div className="module-card__icon">{m.icon}</div>
              <p className="module-card__title">{m.title}</p>
              <p className="module-card__desc">{m.desc}</p>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── MAIN DASHBOARD ───────────────────────────────────────────────────────────
export default function AdminDashboard() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [currentTab, setCurrentTab]   = useState("overview");
  const [authUser,   setAuthUser]     = useState(null);
  const [userData,   setUserData]     = useState(null);
  const [schoolData, setSchoolData]   = useState(null);
  const [loading,    setLoading]      = useState(true);
  const [authError,  setAuthError]    = useState("");

  // ── Theme state ──
  const [theme, setTheme] = useState(getInitialTheme);
  useEffect(() => { applyTheme(theme); }, [theme]);

  function handleToggleTheme() {
    setTheme((t) => flipTheme(t));
  }

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (fbUser) => {
      if (!fbUser) { window.location.href = "/"; return; }
      setAuthUser(fbUser);
      try {
        const userSnap = await getDoc(doc(db, "users", fbUser.uid));
        if (!userSnap.exists()) { setAuthError("User profile not found."); setLoading(false); return; }
        const user = userSnap.data();
        setUserData(user);
        if (user.schoolCode) {
          const schoolSnap = await getDoc(doc(db, "schools", user.schoolCode));
          if (schoolSnap.exists()) setSchoolData(schoolSnap.data());
        }
      } catch (e) { setAuthError("Failed to load profile. Please refresh."); }
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const handleSignOut = async () => { await signOut(auth); window.location.href = "/"; };

  const displayName    = userData?.name || authUser?.email || "Admin";
  const schoolName     = schoolData?.name || userData?.name || "Your School";
  const schoolDistrict = schoolData?.district || "";
  const schoolCode     = userData?.schoolCode || "";
  const currentNavItem = NAV_ITEMS.find(i => i.id === currentTab);

  // ── Loading screen ──
  if (loading) return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ width: 44, height: 44, border: "3px solid var(--border)", borderTop: "3px solid var(--accent)", borderRadius: "50%", animation: "spin .7s linear infinite", margin: "0 auto 16px" }} />
        <p style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text3)", letterSpacing: 1 }}>Loading your dashboard…</p>
      </div>
    </div>
  );

  // ── Auth error ──
  if (authError) return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ background: "var(--bg2)", borderRadius: 20, border: "1px solid var(--border)", padding: 40, maxWidth: 380, textAlign: "center" }}>
        <div style={{ width: 48, height: 48, background: "rgba(239,68,68,0.12)", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px", color: "#f87171" }}>
          {IC.warning}
        </div>
        <p style={{ fontSize: 14, fontWeight: 600, color: "var(--text)", marginBottom: 20 }}>{authError}</p>
        <button onClick={handleSignOut} className="btn btn--accent btn--md">Back to Sign In</button>
      </div>
    </div>
  );

  return (
    <div className="dashboard-shell">
      {/* Sidebar */}
      <Sidebar
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        currentTab={currentTab}
        onTabChange={(tab) => { setCurrentTab(tab); setSidebarOpen(false); }}
        schoolName={schoolName}
        schoolDistrict={schoolDistrict}
        schoolCode={schoolCode}
        onSignOut={handleSignOut}
      />

      {/* Main content area */}
      <div className="main-area">

        {/* Top bar */}
        <header className="topbar">
          <div className="topbar__left">
            <button className="topbar__menu-btn" onClick={() => setSidebarOpen(v => !v)}>
              {sidebarOpen ? IC.close : IC.menu}
            </button>
            <div>
              <div className="topbar__title">{currentNavItem?.label || "Dashboard"}</div>
              <div className="topbar__subtitle">System Administrator · {schoolName}</div>
            </div>
          </div>

          <div className="topbar__right">
            <div className="topbar__status">
              <span className="topbar__status-dot" />
              <span className="topbar__status-text">Online</span>
            </div>

            {/* ── Theme toggle button ── */}
            <button
              onClick={handleToggleTheme}
              title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
              className="theme-toggle-btn"
            >
              {theme === "dark" ? IC.sun : IC.moon}
            </button>

            <div style={{ textAlign: "right" }}>
              <div className="topbar-user-name">{displayName}</div>
              <div className="topbar__user-role">System Admin</div>
            </div>
            <div className="topbar__avatar">{initials(displayName) || "??"}</div>
          </div>
        </header>

        {/* Page content */}
        <main className="page-content">
          {currentTab === "overview"      && <Overview userData={userData} schoolData={schoolData} schoolCode={schoolCode} setTab={setCurrentTab} />}
          {currentTab === "users"         && <UserManagement schoolCode={schoolCode} schoolName={schoolName} />}
          {currentTab === "students"      && <StudentManagement schoolCode={schoolCode} schoolName={schoolName} />}
          {currentTab === "settings"      && <SchoolSettings schoolCode={schoolCode} schoolData={schoolData} onUpdate={setSchoolData} />}
          {currentTab === "billing"       && <Billing schoolData={schoolData} />}
          {currentTab === "announcements" && <Announcements schoolCode={schoolCode} userName={displayName} />}
          {currentTab === "audit"         && <AuditLog schoolCode={schoolCode} />}
        </main>

        {/* Footer */}
        <footer className="dashboard-footer">
          <span>© 2026 SSP-PEP · Ministry of Education, Malawi</span>
          <span>v1.4.0</span>
        </footer>
      </div>
    </div>
  );
}