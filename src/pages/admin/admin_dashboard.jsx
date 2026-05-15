import { useState, useEffect } from "react";
import { auth, db } from "../../firebase";
import {
  doc, getDoc, collection, getDocs, setDoc, updateDoc, deleteDoc,
  query, where, orderBy, serverTimestamp, addDoc, limit
} from "firebase/firestore";
import { createUserWithEmailAndPassword, signOut, onAuthStateChanged } from "firebase/auth";

// ─── Icons ───────────────────────────────────────────────────────────────────
const IC = {
  home:      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955a1.126 1.126 0 011.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25"/></svg>,
  users:     <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z"/></svg>,
  students:  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M4.26 10.147a60.436 60.436 0 00-.491 6.347A48.627 48.627 0 0112 20.904a48.627 48.627 0 018.232-4.41 60.46 60.46 0 00-.491-6.347m-15.482 0a50.57 50.57 0 00-2.658-.813A59.905 59.905 0 0112 3.493a59.902 59.902 0 0110.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.697 50.697 0 0112 13.489a50.702 50.702 0 017.74-3.342M6.75 15a.75.75 0 100-1.5.75.75 0 000 1.5zm0 0v-3.675A55.378 55.378 0 0112 8.443m-7.007 11.55A5.981 5.981 0 006.75 15.75v-1.5"/></svg>,
  school:    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M4.26 10.147a60.436 60.436 0 00-.491 6.347A48.627 48.627 0 0112 20.904a48.627 48.627 0 018.232-4.41 60.46 60.46 0 00-.491-6.347m-15.482 0a50.57 50.57 0 00-2.658-.813A59.905 59.905 0 0112 3.493a59.902 59.902 0 0110.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.697 50.697 0 0112 13.489a50.702 50.702 0 017.74-3.342M6.75 15a.75.75 0 100-1.5.75.75 0 000 1.5zm0 0v-3.675A55.378 55.378 0 0112 8.443m-7.007 11.55A5.981 5.981 0 006.75 15.75v-1.5"/></svg>,
  billing:   <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z"/></svg>,
  bell:      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0"/></svg>,
  audit:     <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z"/></svg>,
  logout:    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75"/></svg>,
  menu:      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5"/></svg>,
  close:     <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>,
  plus:      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15"/></svg>,
  edit:      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125"/></svg>,
  trash:     <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"/></svg>,
  check:     <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5"/></svg>,
  search:    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 15.803a7.5 7.5 0 0010.607 10.607z"/></svg>,
  eye:       <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z"/><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/></svg>,
  eyeOff:    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88"/></svg>,
  shield:    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z"/></svg>,
  warning:   <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"/></svg>,
  transfer:  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5"/></svg>,
  idCard:    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M15 9h3.75M15 12h3.75M15 15h3.75M4.5 19.5h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5zm6-10.125a1.875 1.875 0 11-3.75 0 1.875 1.875 0 013.75 0zm1.294 6.336a6.721 6.721 0 01-3.17.789 6.721 6.721 0 01-3.168-.789 3.376 3.376 0 016.338 0z"/></svg>,
  copy:      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 01-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 011.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 00-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 01-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 00-3.375-3.375h-1.5a1.125 1.125 0 01-1.125-1.125v-1.5a3.375 3.375 0 00-3.375-3.375H9.75"/></svg>,
  arrowRight:<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3"/></svg>,
  info:      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z"/></svg>,
};

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

// Generate a unique student code: STU-XXXX-XXXX
function generateStudentCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const seg = () => Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
  return `STU-${seg()}-${seg()}`;
}

// ─── Role config ──────────────────────────────────────────────────────────────
const ROLES = [
  { value: "head_teacher",  label: "Head Teacher",  color: "bg-purple-100 text-purple-800", dot: "bg-purple-500" },
  { value: "class_teacher", label: "Class Teacher", color: "bg-blue-100 text-blue-800",     dot: "bg-blue-500"   },
  { value: "bursar",        label: "Bursar / Fees", color: "bg-amber-100 text-amber-800",   dot: "bg-amber-500"  },
  { value: "librarian",     label: "Librarian",     color: "bg-teal-100 text-teal-800",     dot: "bg-teal-500"   },
  { value: "parent",        label: "Parent",        color: "bg-green-100 text-green-800",   dot: "bg-green-500"  },
];
const roleMap = Object.fromEntries(ROLES.map(r => [r.value, r]));

const GENDERS = ["Male", "Female"];
const DISTRICTS = ["Blantyre","Lilongwe","Mzuzu","Zomba","Kasungu","Mangochi","Salima","Dedza","Ntchisi","Dowa","Nkhotakota","Mchinji","Chiradzulu","Mulanje","Thyolo","Phalombe","Balaka","Machinga","Nsanje","Chikwawa","Neno","Mwanza","Nkhata Bay","Rumphi","Karonga","Chitipa","Likoma","Ntcheu"];

const PRIMARY_SUBJECTS = ["Chichewa","English","Mathematics","Science and Technology","Social and Environmental Sciences","Expressive Arts","Agriculture","Life Skills","Religious and Moral Education"];
const SECONDARY_SUBJECTS = ["English","Chichewa","Mathematics","Biology","Chemistry","Physics","Agriculture","Geography","History","Social and Development Studies","Life Skills","Bible Knowledge"];

// ─── Shared UI ────────────────────────────────────────────────────────────────
const Badge = ({ role }) => {
  const r = roleMap[role] || { label: role, color: "bg-gray-100 text-gray-700" };
  return <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold ${r.color}`}>{r.label}</span>;
};

const StatusPill = ({ active }) => (
  <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold ${active ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>
    <span className={`w-1.5 h-1.5 rounded-full ${active ? "bg-emerald-500" : "bg-red-400"}`} />
    {active ? "Active" : "Suspended"}
  </span>
);

const Modal = ({ title, onClose, children, wide, extraWide }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6 overflow-y-auto" style={{ backgroundColor: "rgba(15,32,68,0.45)", backdropFilter: "blur(3px)" }}>
    <div className={`bg-white rounded-2xl shadow-2xl w-full ${extraWide ? "max-w-3xl" : wide ? "max-w-2xl" : "max-w-md"} overflow-hidden my-auto`}>
      <div className="bg-[#0F2044] px-6 py-4 flex items-center justify-between">
        <h3 className="text-white font-semibold text-base">{title}</h3>
        <button onClick={onClose} className="text-white/60 hover:text-white transition-colors">{IC.close}</button>
      </div>
      <div className="p-6 max-h-[80vh] overflow-y-auto">{children}</div>
    </div>
  </div>
);

const Input = ({ label, required, error, ...props }) => (
  <div className="flex flex-col gap-1.5">
    {label && <label className="text-xs font-semibold text-[#0F2044]/60 uppercase tracking-wider">{label}{required && <span className="text-red-500 ml-0.5">*</span>}</label>}
    <input {...props} className={`w-full px-3.5 py-2.5 text-sm rounded-xl border outline-none transition-all ${error ? "border-red-300 bg-red-50" : "border-[#0F2044]/15 bg-[#F7F5F0]/60 focus:border-[#0F2044]/40 focus:bg-white"}`} />
    {error && <p className="text-xs text-red-600">{error}</p>}
  </div>
);

const Select = ({ label, required, error, children, ...props }) => (
  <div className="flex flex-col gap-1.5">
    {label && <label className="text-xs font-semibold text-[#0F2044]/60 uppercase tracking-wider">{label}{required && <span className="text-red-500 ml-0.5">*</span>}</label>}
    <select {...props} className={`w-full px-3.5 py-2.5 text-sm rounded-xl border outline-none transition-all appearance-none ${error ? "border-red-300 bg-red-50" : "border-[#0F2044]/15 bg-[#F7F5F0]/60 focus:border-[#0F2044]/40 focus:bg-white"}`}>
      {children}
    </select>
    {error && <p className="text-xs text-red-600">{error}</p>}
  </div>
);

const Textarea = ({ label, ...props }) => (
  <div className="flex flex-col gap-1.5">
    {label && <label className="text-xs font-semibold text-[#0F2044]/60 uppercase tracking-wider">{label}</label>}
    <textarea {...props} className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-[#0F2044]/15 bg-[#F7F5F0]/60 focus:border-[#0F2044]/40 focus:bg-white outline-none transition-all resize-none" />
  </div>
);

const Btn = ({ children, variant = "primary", size = "md", loading, className = "", ...props }) => {
  const base = "inline-flex items-center justify-center gap-2 font-semibold rounded-xl transition-all disabled:opacity-50";
  const sizes = { sm: "px-3 py-1.5 text-xs", md: "px-4 py-2.5 text-sm", lg: "px-6 py-3 text-sm" };
  const variants = {
    primary: "bg-[#0F2044] text-white hover:bg-[#0F2044]/90",
    gold:    "bg-[#F4B400] text-[#0F2044] hover:brightness-105",
    ghost:   "border border-[#0F2044]/15 text-[#0F2044]/70 hover:bg-[#0F2044]/5",
    danger:  "bg-red-600 text-white hover:bg-red-700",
    teal:    "bg-teal-600 text-white hover:bg-teal-700",
    purple:  "bg-purple-600 text-white hover:bg-purple-700",
  };
  return <button {...props} disabled={loading || props.disabled} className={`${base} ${sizes[size]} ${variants[variant]} ${className}`}>{loading ? <Spinner /> : children}</button>;
};

const Spinner = () => (
  <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
  </svg>
);

const EmptyState = ({ icon, title, sub, action }) => (
  <div className="flex flex-col items-center justify-center py-20 text-center">
    <div className="w-16 h-16 bg-[#0F2044]/5 rounded-2xl flex items-center justify-center text-[#0F2044]/30 mb-4">{icon}</div>
    <p className="font-semibold text-[#0F2044] mb-1">{title}</p>
    <p className="text-sm text-[#0F2044]/50 mb-4">{sub}</p>
    {action}
  </div>
);

// ─── MODULE: Student Code Badge ───────────────────────────────────────────────
function StudentCodeBadge({ code }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }
  return (
    <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-[#0F2044]/5 border border-[#0F2044]/10 rounded-xl">
      <span className="font-mono text-xs font-bold text-[#0F2044] tracking-widest">{code}</span>
      <button onClick={copy} className="text-[#0F2044]/40 hover:text-[#0F2044] transition-colors" title="Copy code">
        {copied ? <span className="text-emerald-600">{IC.check}</span> : IC.copy}
      </button>
    </div>
  );
}

// ─── MODULE 1: User Management ────────────────────────────────────────────────
function UserManagement({ schoolCode, schoolName }) {
  const [users, setUsers]           = useState([]);
  const [loading, setLoading]       = useState(true);
  const [search, setSearch]         = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [showAdd, setShowAdd]       = useState(false);
  const [showEdit, setShowEdit]     = useState(null);
  const [showDelete, setShowDelete] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError]           = useState("");
  const [form, setForm]             = useState({ name: "", email: "", password: "", role: "", phone: "" });
  const [formErrors, setFormErrors] = useState({});
  const [showPw, setShowPw]         = useState(false);

  useEffect(() => { fetchUsers(); }, []);

  async function fetchUsers() {
    setLoading(true);
    try {
      const q = query(collection(db, "users"), where("schoolCode", "==", schoolCode));
      const snap = await getDocs(q);
      setUsers(snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(u => u.role !== "admin"));
    } catch (e) { console.error(e); }
    setLoading(false);
  }

  function validateForm(f) {
    const e = {};
    if (!f.name.trim() || f.name.trim().length < 2) e.name = "Full name required.";
    if (!f.email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email)) e.email = "Valid email required.";
    if (!showEdit && (!f.password || f.password.length < 6)) e.password = "Password must be at least 6 characters.";
    if (!f.role) e.role = "Select a role.";
    return e;
  }

  async function handleAdd(e) {
    e.preventDefault();
    const errs = validateForm(form);
    if (Object.keys(errs).length) { setFormErrors(errs); return; }
    setActionLoading(true); setError("");
    try {
      const cred = await createUserWithEmailAndPassword(auth, form.email.trim(), form.password);
      await setDoc(doc(db, "users", cred.user.uid), {
        uid: cred.user.uid, name: form.name.trim(), email: form.email.trim(),
        role: form.role, phone: form.phone.trim() || "",
        schoolCode, status: "active", createdAt: serverTimestamp(),
      });
      setShowAdd(false);
      setForm({ name: "", email: "", password: "", role: "", phone: "" });
      fetchUsers();
    } catch (err) {
      setError(err.code === "auth/email-already-in-use" ? "This email is already registered." : "Failed to create user: " + err.message);
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
    setForm({ name: user.name || "", email: user.email || "", password: "", role: user.role || "", phone: user.phone || "" });
    setFormErrors({}); setError(""); setShowEdit(user);
  }
  function openAdd() {
    setForm({ name: "", email: "", password: "", role: "", phone: "" });
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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-[#0F2044]">User Management</h2>
          <p className="text-sm text-[#0F2044]/50 mt-0.5">{users.length} staff accounts across {schoolName}</p>
        </div>
        <Btn onClick={openAdd} variant="gold">{IC.plus} Add User</Btn>
      </div>

      <div className="flex flex-wrap gap-2">
        <button onClick={() => setRoleFilter("all")} className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${roleFilter === "all" ? "bg-[#0F2044] text-white" : "bg-white border border-[#0F2044]/10 text-[#0F2044]/60 hover:border-[#0F2044]/30"}`}>All ({users.length})</button>
        {roleCounts.map(r => (
          <button key={r.value} onClick={() => setRoleFilter(r.value)} className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${roleFilter === r.value ? "bg-[#0F2044] text-white" : "bg-white border border-[#0F2044]/10 text-[#0F2044]/60 hover:border-[#0F2044]/30"}`}>
            {r.label} ({r.count})
          </button>
        ))}
      </div>

      <div className="relative">
        <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#0F2044]/30">{IC.search}</span>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name or email…" className="w-full pl-10 pr-4 py-2.5 text-sm rounded-xl border border-[#0F2044]/10 bg-white outline-none focus:border-[#0F2044]/30 transition-all" />
      </div>

      <div className="bg-white rounded-2xl border border-[#0F2044]/8 overflow-hidden">
        {loading ? <div className="p-12 flex items-center justify-center"><Spinner /></div>
          : filtered.length === 0 ? (
            <EmptyState icon={IC.users} title="No users found" sub={search ? "Try a different search" : "Add your first staff member"}
              action={<Btn onClick={openAdd} variant="gold" size="sm">{IC.plus} Add User</Btn>} />
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-[#0F2044]/5">
                  <th className="px-5 py-3.5 text-left text-[10px] font-bold tracking-widest uppercase text-[#0F2044]/40">User</th>
                  <th className="px-5 py-3.5 text-left text-[10px] font-bold tracking-widest uppercase text-[#0F2044]/40 hidden md:table-cell">Role</th>
                  <th className="px-5 py-3.5 text-left text-[10px] font-bold tracking-widest uppercase text-[#0F2044]/40 hidden lg:table-cell">Status</th>
                  <th className="px-5 py-3.5 text-left text-[10px] font-bold tracking-widest uppercase text-[#0F2044]/40 hidden lg:table-cell">Added</th>
                  <th className="px-5 py-3.5 text-right text-[10px] font-bold tracking-widest uppercase text-[#0F2044]/40">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#0F2044]/5">
                {filtered.map(u => (
                  <tr key={u.id} className="hover:bg-[#F7F5F0]/60 transition-colors">
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 bg-[#0F2044] text-white rounded-xl flex items-center justify-center text-xs font-bold flex-shrink-0">{initials(u.name)}</div>
                        <div><div className="text-sm font-semibold text-[#0F2044]">{u.name}</div><div className="text-xs text-[#0F2044]/50">{u.email}</div></div>
                      </div>
                    </td>
                    <td className="px-5 py-4 hidden md:table-cell"><Badge role={u.role} /></td>
                    <td className="px-5 py-4 hidden lg:table-cell"><StatusPill active={u.status !== "suspended"} /></td>
                    <td className="px-5 py-4 text-xs text-[#0F2044]/40 hidden lg:table-cell">{fmtDate(u.createdAt)}</td>
                    <td className="px-5 py-4">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => openEdit(u)} className="p-2 rounded-lg hover:bg-[#0F2044]/5 text-[#0F2044]/50 hover:text-[#0F2044] transition-colors">{IC.edit}</button>
                        <button onClick={() => toggleStatus(u)} className={`p-2 rounded-lg transition-colors ${u.status === "suspended" ? "hover:bg-emerald-50 text-red-400 hover:text-emerald-600" : "hover:bg-amber-50 text-[#0F2044]/50 hover:text-amber-600"}`}>{IC.shield}</button>
                        <button onClick={() => setShowDelete(u)} className="p-2 rounded-lg hover:bg-red-50 text-[#0F2044]/50 hover:text-red-600 transition-colors">{IC.trash}</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
      </div>

      {showAdd && (
        <Modal title="Add New User" onClose={() => setShowAdd(false)} wide>
          <form onSubmit={handleAdd} className="space-y-4">
            {error && <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700">{error}</div>}
            <div className="grid grid-cols-2 gap-4">
              <Input label="Full Name" required value={form.name} onChange={e => setForm(p => ({...p, name: e.target.value}))} placeholder="Jane Mwale" error={formErrors.name} />
              <Select label="Role" required value={form.role} onChange={e => setForm(p => ({...p, role: e.target.value}))} error={formErrors.role}>
                <option value="">Select role…</option>
                {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
              </Select>
            </div>
            <Input label="Email Address" required type="email" value={form.email} onChange={e => setForm(p => ({...p, email: e.target.value}))} placeholder="jane@school.mw" error={formErrors.email} />
            <Input label="Phone Number" type="tel" value={form.phone} onChange={e => setForm(p => ({...p, phone: e.target.value}))} placeholder="+265 9xx xxx xxx" />
            <div className="relative">
              <Input label="Password" required type={showPw ? "text" : "password"} value={form.password} onChange={e => setForm(p => ({...p, password: e.target.value}))} placeholder="Min. 6 characters" error={formErrors.password} />
              <button type="button" onClick={() => setShowPw(p => !p)} className="absolute right-3 top-8 text-[#0F2044]/40 hover:text-[#0F2044]">{showPw ? IC.eyeOff : IC.eye}</button>
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <Btn type="button" variant="ghost" onClick={() => setShowAdd(false)}>Cancel</Btn>
              <Btn type="submit" variant="gold" loading={actionLoading}>Create User</Btn>
            </div>
          </form>
        </Modal>
      )}

      {showEdit && (
        <Modal title="Edit User" onClose={() => setShowEdit(null)}>
          <form onSubmit={handleEdit} className="space-y-4">
            {error && <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700">{error}</div>}
            <Input label="Full Name" required value={form.name} onChange={e => setForm(p => ({...p, name: e.target.value}))} />
            <Select label="Role" required value={form.role} onChange={e => setForm(p => ({...p, role: e.target.value}))}>
              <option value="">Select role…</option>
              {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
            </Select>
            <Input label="Phone Number" type="tel" value={form.phone} onChange={e => setForm(p => ({...p, phone: e.target.value}))} />
            <p className="text-xs text-[#0F2044]/40">Email and password changes must be done through Firebase Console.</p>
            <div className="flex justify-end gap-3 pt-2">
              <Btn type="button" variant="ghost" onClick={() => setShowEdit(null)}>Cancel</Btn>
              <Btn type="submit" loading={actionLoading}>Save Changes</Btn>
            </div>
          </form>
        </Modal>
      )}

      {showDelete && (
        <Modal title="Delete User" onClose={() => setShowDelete(null)}>
          <div className="space-y-4">
            <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-100 rounded-xl">
              {IC.warning}
              <div>
                <p className="text-sm font-semibold text-red-800">This action cannot be undone.</p>
                <p className="text-xs text-red-600 mt-0.5">The user record for <strong>{showDelete.name}</strong> will be permanently deleted from Firestore. Their Firebase Auth account will remain — remove it from Firebase Console if needed.</p>
              </div>
            </div>
            <div className="flex justify-end gap-3">
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
  const [activeTab, setActiveTab] = useState("list"); // list | register | transfer
  const [students, setStudents] = useState([]);
  const [classes, setClasses]   = useState([]);
  const [loading, setLoading]   = useState(true);
  const [search, setSearch]     = useState("");
  const [classFilter, setClassFilter] = useState("all");
  const [showDetail, setShowDetail] = useState(null);
  const [showDelete, setShowDelete] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [success, setSuccess]   = useState("");
  const [error, setError]       = useState("");

  // Registration form
  const EMPTY_REG = {
    firstName: "", lastName: "", dob: "", gender: "",
    nationalId: "", guardianName: "", guardianPhone: "",
    guardianRelation: "", district: "", village: "",
    classId: "", email: "", password: "",
    createAccount: false, // whether to create a Firebase Auth account
  };
  const [regForm, setRegForm]   = useState(EMPTY_REG);
  const [regErrors, setRegErrors] = useState({});
  const [showPw, setShowPw]     = useState(false);
  const [newStudentCode, setNewStudentCode] = useState(null); // shown after success

  // Transfer form
  const [transferCode, setTransferCode] = useState("");
  const [transferFound, setTransferFound] = useState(null);
  const [transferLoading, setTransferLoading] = useState(false);
  const [transferError, setTransferError] = useState("");
  const [transferSuccess, setTransferSuccess] = useState("");
  const [transferClassId, setTransferClassId] = useState("");

  useEffect(() => { fetchStudents(); fetchClasses(); }, []);

  async function fetchStudents() {
    setLoading(true);
    try {
      const q = query(collection(db, "students"), where("schoolCode", "==", schoolCode));
      const snap = await getDocs(q);
      setStudents(snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (a.lastName || "").localeCompare(b.lastName || "")));
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
    if (!f.guardianName.trim()) e.guardianName = "Guardian name required.";
    if (!f.guardianPhone.trim()) e.guardianPhone = "Guardian phone required.";
    if (!f.classId)          e.classId   = "Select a class.";
    if (f.createAccount) {
      if (!f.email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email)) e.email = "Valid email required.";
      if (!f.password || f.password.length < 6) e.password = "Min 6 characters.";
    }
    return e;
  }

  async function handleRegister(e) {
    e.preventDefault();
    const errs = validateReg(regForm);
    if (Object.keys(errs).length) { setRegErrors(errs); return; }
    setActionLoading(true); setError(""); setSuccess("");

    const studentCode = generateStudentCode();
    const fullName = `${regForm.firstName.trim()} ${regForm.lastName.trim()}`;
    const cls = classes.find(c => c.id === regForm.classId);

    try {
      const studentData = {
        studentCode,
        firstName: regForm.firstName.trim(),
        lastName: regForm.lastName.trim(),
        fullName,
        dob: regForm.dob,
        gender: regForm.gender,
        nationalId: regForm.nationalId.trim() || "",
        guardianName: regForm.guardianName.trim(),
        guardianPhone: regForm.guardianPhone.trim(),
        guardianRelation: regForm.guardianRelation.trim() || "Parent/Guardian",
        district: regForm.district,
        village: regForm.village.trim() || "",
        classId: regForm.classId,
        className: cls?.name || "",
        schoolCode,
        schoolName,
        status: "active",
        hasAccount: regForm.createAccount,
        transferHistory: [{ schoolCode, schoolName, joinedAt: new Date().toISOString(), action: "enrolled" }],
        createdAt: serverTimestamp(),
      };

      // Add to students collection
      const studentRef = await addDoc(collection(db, "students"), studentData);

      // Optionally create user account
      if (regForm.createAccount && regForm.email) {
        const cred = await createUserWithEmailAndPassword(auth, regForm.email.trim(), regForm.password);
        await setDoc(doc(db, "users", cred.user.uid), {
          uid: cred.user.uid,
          name: fullName,
          email: regForm.email.trim(),
          role: "student",
          studentCode,
          studentId: studentRef.id,
          schoolCode,
          status: "active",
          createdAt: serverTimestamp(),
        });
        // Link back
        await updateDoc(doc(db, "students", studentRef.id), { uid: cred.user.uid, email: regForm.email.trim() });
      }

      setNewStudentCode(studentCode);
      setRegForm(EMPTY_REG);
      setRegErrors({});
      fetchStudents();
    } catch (err) {
      setError(err.code === "auth/email-already-in-use" ? "Email already in use." : "Registration failed: " + err.message);
    }
    setActionLoading(false);
  }

  // ── Transfer: look up student by code ──
  async function handleTransferLookup() {
    setTransferLoading(true); setTransferError(""); setTransferFound(null);
    const code = transferCode.trim().toUpperCase();
    if (!code) { setTransferError("Enter a student code."); setTransferLoading(false); return; }
    try {
      const q = query(collection(db, "students"), where("studentCode", "==", code), limit(1));
      const snap = await getDocs(q);
      if (snap.empty) { setTransferError(`No student found with code ${code}.`); }
      else {
        const st = { id: snap.docs[0].id, ...snap.docs[0].data() };
        if (st.schoolCode === schoolCode) { setTransferError("This student is already enrolled at this school."); }
        else { setTransferFound(st); }
      }
    } catch (e) { setTransferError("Lookup failed: " + e.message); }
    setTransferLoading(false);
  }

  async function handleTransferConfirm() {
    if (!transferFound || !transferClassId) { setTransferError("Please select a class for the student."); return; }
    setTransferLoading(true); setTransferError(""); setTransferSuccess("");
    try {
      const cls = classes.find(c => c.id === transferClassId);
      const newHistory = [
        ...(transferFound.transferHistory || []),
        { schoolCode, schoolName, joinedAt: new Date().toISOString(), action: "transferred_in" }
      ];
      await updateDoc(doc(db, "students", transferFound.id), {
        schoolCode,
        schoolName,
        classId: transferClassId,
        className: cls?.name || "",
        status: "active",
        transferHistory: newHistory,
        lastTransferAt: serverTimestamp(),
      });
      setTransferSuccess(`${transferFound.fullName} has been successfully transferred to ${schoolName} and placed in ${cls?.name || "the selected class"}.`);
      setTransferFound(null);
      setTransferCode("");
      setTransferClassId("");
      fetchStudents();
    } catch (e) { setTransferError("Transfer failed: " + e.message); }
    setTransferLoading(false);
  }

  async function handleDelete() {
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

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-[#0F2044]">Student Management</h2>
          <p className="text-sm text-[#0F2044]/50 mt-0.5">{students.length} students enrolled at {schoolName}</p>
        </div>
      </div>

      {/* Sub-tabs */}
      <div className="flex gap-1 p-1 bg-[#0F2044]/5 rounded-2xl w-fit">
        {tabs.map(t => (
          <button key={t.id} onClick={() => { setActiveTab(t.id); setError(""); setSuccess(""); setNewStudentCode(null); setTransferSuccess(""); setTransferError(""); }}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all ${activeTab === t.id ? "bg-white text-[#0F2044] shadow-sm" : "text-[#0F2044]/50 hover:text-[#0F2044]"}`}>
            {t.icon}<span className="hidden sm:inline">{t.label}</span>
          </button>
        ))}
      </div>

      {/* ── TAB: Student List ── */}
      {activeTab === "list" && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#0F2044]/30">{IC.search}</span>
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name or student code…" className="w-full pl-10 pr-4 py-2.5 text-sm rounded-xl border border-[#0F2044]/10 bg-white outline-none focus:border-[#0F2044]/30 transition-all" />
            </div>
            <select value={classFilter} onChange={e => setClassFilter(e.target.value)} className="px-3.5 py-2.5 text-sm rounded-xl border border-[#0F2044]/10 bg-white outline-none focus:border-[#0F2044]/30 appearance-none">
              <option value="all">All Classes</option>
              {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          <div className="bg-white rounded-2xl border border-[#0F2044]/8 overflow-hidden">
            {loading ? <div className="p-12 flex justify-center"><Spinner /></div>
              : filtered.length === 0 ? (
                <EmptyState icon={IC.students} title="No students found"
                  sub={search ? "Try a different search" : "Register your first student to get started"}
                  action={<Btn onClick={() => setActiveTab("register")} variant="gold" size="sm">{IC.plus} Register Student</Btn>} />
              ) : (
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-[#0F2044]/5">
                      <th className="px-5 py-3.5 text-left text-[10px] font-bold tracking-widest uppercase text-[#0F2044]/40">Student</th>
                      <th className="px-5 py-3.5 text-left text-[10px] font-bold tracking-widest uppercase text-[#0F2044]/40 hidden md:table-cell">Student Code</th>
                      <th className="px-5 py-3.5 text-left text-[10px] font-bold tracking-widest uppercase text-[#0F2044]/40 hidden md:table-cell">Class</th>
                      <th className="px-5 py-3.5 text-left text-[10px] font-bold tracking-widest uppercase text-[#0F2044]/40 hidden lg:table-cell">Guardian</th>
                      <th className="px-5 py-3.5 text-left text-[10px] font-bold tracking-widest uppercase text-[#0F2044]/40 hidden lg:table-cell">Status</th>
                      <th className="px-5 py-3.5 text-right text-[10px] font-bold tracking-widest uppercase text-[#0F2044]/40">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#0F2044]/5">
                    {filtered.map(s => (
                      <tr key={s.id} className="hover:bg-[#F7F5F0]/60 transition-colors">
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-3">
                            <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-xs font-bold flex-shrink-0 ${s.gender === "Female" ? "bg-pink-100 text-pink-700" : "bg-blue-100 text-blue-700"}`}>
                              {initials(s.fullName)}
                            </div>
                            <div>
                              <div className="text-sm font-semibold text-[#0F2044]">{s.fullName}</div>
                              <div className="text-xs text-[#0F2044]/50">{s.gender} · {s.dob || "—"}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-4 hidden md:table-cell">
                          <StudentCodeBadge code={s.studentCode} />
                        </td>
                        <td className="px-5 py-4 hidden md:table-cell">
                          <span className="text-sm text-[#0F2044]/70">{s.className || "—"}</span>
                        </td>
                        <td className="px-5 py-4 hidden lg:table-cell">
                          <div className="text-xs text-[#0F2044]/70">{s.guardianName || "—"}</div>
                          <div className="text-xs text-[#0F2044]/40">{s.guardianPhone || ""}</div>
                        </td>
                        <td className="px-5 py-4 hidden lg:table-cell">
                          <StatusPill active={s.status !== "suspended"} />
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex items-center justify-end gap-1">
                            <button onClick={() => setShowDetail(s)} className="p-2 rounded-lg hover:bg-[#0F2044]/5 text-[#0F2044]/50 hover:text-[#0F2044] transition-colors" title="View details">{IC.eye}</button>
                            <button onClick={() => setShowDelete(s)} className="p-2 rounded-lg hover:bg-red-50 text-[#0F2044]/50 hover:text-red-600 transition-colors" title="Delete">{IC.trash}</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
          </div>
        </div>
      )}

      {/* ── TAB: Register Student ── */}
      {activeTab === "register" && (
        <div className="space-y-4 max-w-2xl">
          {newStudentCode ? (
            // Success state
            <div className="bg-white rounded-2xl border border-[#0F2044]/8 p-8 text-center space-y-5">
              <div className="w-16 h-16 bg-emerald-100 rounded-2xl flex items-center justify-center mx-auto text-emerald-600">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-8 h-8"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5"/></svg>
              </div>
              <div>
                <h3 className="text-lg font-bold text-[#0F2044] mb-1">Student Registered!</h3>
                <p className="text-sm text-[#0F2044]/60 mb-4">Save the student code below — it is used to transfer the student between schools.</p>
                <div className="inline-flex flex-col items-center gap-3 p-5 bg-[#F7F5F0] rounded-2xl border border-[#0F2044]/10">
                  <p className="text-xs font-bold uppercase tracking-widest text-[#0F2044]/50">Student Code</p>
                  <StudentCodeBadge code={newStudentCode} />
                  <p className="text-xs text-[#0F2044]/40">Share this code with parents for future school transfers</p>
                </div>
              </div>
              <div className="flex justify-center gap-3">
                <Btn variant="ghost" onClick={() => { setNewStudentCode(null); setActiveTab("list"); }}>View Students</Btn>
                <Btn variant="gold" onClick={() => setNewStudentCode(null)}>Register Another</Btn>
              </div>
            </div>
          ) : (
            <form onSubmit={handleRegister} className="bg-white rounded-2xl border border-[#0F2044]/8 p-6 space-y-6">
              {error && <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700">{error}</div>}

              {/* Personal Info */}
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-[#0F2044]/40 mb-4">Personal Information</p>
                <div className="grid grid-cols-2 gap-4">
                  <Input label="First Name" required value={regForm.firstName} onChange={e => setRegForm(p => ({...p, firstName: e.target.value}))} placeholder="Chisomo" error={regErrors.firstName} />
                  <Input label="Last Name" required value={regForm.lastName} onChange={e => setRegForm(p => ({...p, lastName: e.target.value}))} placeholder="Banda" error={regErrors.lastName} />
                  <Input label="Date of Birth" required type="date" value={regForm.dob} onChange={e => setRegForm(p => ({...p, dob: e.target.value}))} error={regErrors.dob} />
                  <Select label="Gender" required value={regForm.gender} onChange={e => setRegForm(p => ({...p, gender: e.target.value}))} error={regErrors.gender}>
                    <option value="">Select…</option>
                    {GENDERS.map(g => <option key={g} value={g}>{g}</option>)}
                  </Select>
                  <Input label="National ID (if available)" value={regForm.nationalId} onChange={e => setRegForm(p => ({...p, nationalId: e.target.value}))} placeholder="Optional" />
                  <Select label="District of Origin" value={regForm.district} onChange={e => setRegForm(p => ({...p, district: e.target.value}))}>
                    <option value="">Select…</option>
                    {DISTRICTS.map(d => <option key={d} value={d}>{d}</option>)}
                  </Select>
                </div>
                <div className="mt-4">
                  <Input label="Village / Area" value={regForm.village} onChange={e => setRegForm(p => ({...p, village: e.target.value}))} placeholder="Home village or area" />
                </div>
              </div>

              {/* Guardian Info */}
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-[#0F2044]/40 mb-4">Guardian / Parent Information</p>
                <div className="grid grid-cols-2 gap-4">
                  <Input label="Guardian Full Name" required value={regForm.guardianName} onChange={e => setRegForm(p => ({...p, guardianName: e.target.value}))} placeholder="John Banda" error={regErrors.guardianName} />
                  <Input label="Guardian Phone" required value={regForm.guardianPhone} onChange={e => setRegForm(p => ({...p, guardianPhone: e.target.value}))} placeholder="+265 9xx xxx xxx" error={regErrors.guardianPhone} />
                  <Input label="Relationship" value={regForm.guardianRelation} onChange={e => setRegForm(p => ({...p, guardianRelation: e.target.value}))} placeholder="Father / Mother / Uncle…" />
                </div>
              </div>

              {/* Academic */}
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-[#0F2044]/40 mb-4">Academic Placement</p>
                <Select label="Assign to Class" required value={regForm.classId} onChange={e => setRegForm(p => ({...p, classId: e.target.value}))} error={regErrors.classId}>
                  <option value="">Select class…</option>
                  {classes.length === 0 && <option disabled>No classes defined — add them in School Settings</option>}
                  {classes.map(c => <option key={c.id} value={c.id}>{c.name} ({c.level})</option>)}
                </Select>
              </div>

              {/* Optional Account */}
              <div className="border border-[#0F2044]/10 rounded-2xl p-4 space-y-4">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input type="checkbox" checked={regForm.createAccount} onChange={e => setRegForm(p => ({...p, createAccount: e.target.checked}))}
                    className="mt-0.5 w-4 h-4 accent-[#0F2044]" />
                  <div>
                    <p className="text-sm font-semibold text-[#0F2044]">Create login account for this student</p>
                    <p className="text-xs text-[#0F2044]/50 mt-0.5">Allows the student (or parent) to log in and view reports, fees, and notices using a student code–linked account.</p>
                  </div>
                </label>
                {regForm.createAccount && (
                  <div className="space-y-3 pt-2 border-t border-[#0F2044]/8">
                    <Input label="Email Address" required type="email" value={regForm.email} onChange={e => setRegForm(p => ({...p, email: e.target.value}))} placeholder="student@example.com" error={regErrors.email} />
                    <div className="relative">
                      <Input label="Password" required type={showPw ? "text" : "password"} value={regForm.password} onChange={e => setRegForm(p => ({...p, password: e.target.value}))} placeholder="Min. 6 characters" error={regErrors.password} />
                      <button type="button" onClick={() => setShowPw(p => !p)} className="absolute right-3 top-8 text-[#0F2044]/40 hover:text-[#0F2044]">{showPw ? IC.eyeOff : IC.eye}</button>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <Btn type="button" variant="ghost" onClick={() => setRegForm(EMPTY_REG)}>Clear Form</Btn>
                <Btn type="submit" variant="gold" loading={actionLoading}>{IC.students} Register Student</Btn>
              </div>
            </form>
          )}
        </div>
      )}

      {/* ── TAB: Transfer In ── */}
      {activeTab === "transfer" && (
        <div className="max-w-2xl space-y-5">
          <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 flex gap-3">
            {IC.info}
            <div className="text-xs text-blue-800 space-y-1">
              <p className="font-semibold">How transfers work</p>
              <p>When a student moves from another school, enter their <strong>Student Code</strong> (format: STU-XXXX-XXXX). Their full record — personal details, guardian info, and academic history — will be retrieved and transferred to this school. Their previous school's data remains unchanged.</p>
            </div>
          </div>

          {transferSuccess ? (
            <div className="bg-white rounded-2xl border border-[#0F2044]/8 p-8 text-center space-y-4">
              <div className="w-16 h-16 bg-emerald-100 rounded-2xl flex items-center justify-center mx-auto text-emerald-600">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-8 h-8"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5"/></svg>
              </div>
              <p className="font-bold text-[#0F2044]">Transfer Complete</p>
              <p className="text-sm text-[#0F2044]/60">{transferSuccess}</p>
              <div className="flex justify-center gap-3">
                <Btn variant="ghost" onClick={() => { setTransferSuccess(""); setActiveTab("list"); }}>View Students</Btn>
                <Btn variant="gold" onClick={() => setTransferSuccess("")}>Transfer Another</Btn>
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-[#0F2044]/8 p-6 space-y-5">
              {/* Step 1: Look up */}
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-[#0F2044]/40 mb-3">Step 1 — Enter Student Code</p>
                <div className="flex gap-3">
                  <input
                    value={transferCode}
                    onChange={e => { setTransferCode(e.target.value.toUpperCase()); setTransferFound(null); setTransferError(""); }}
                    placeholder="STU-XXXX-XXXX"
                    className="flex-1 px-3.5 py-2.5 text-sm rounded-xl border border-[#0F2044]/15 bg-[#F7F5F0]/60 focus:border-[#0F2044]/40 focus:bg-white outline-none font-mono tracking-widest transition-all"
                  />
                  <Btn onClick={handleTransferLookup} loading={transferLoading} variant="primary">Look Up</Btn>
                </div>
                {transferError && <p className="text-xs text-red-600 mt-2">{transferError}</p>}
              </div>

              {/* Step 2: Preview & confirm */}
              {transferFound && (
                <div className="border-t border-[#0F2044]/8 pt-5 space-y-4">
                  <p className="text-xs font-bold uppercase tracking-widest text-[#0F2044]/40">Step 2 — Confirm Student Details</p>
                  <div className="bg-[#F7F5F0] rounded-2xl p-4 space-y-3">
                    <div className="flex items-center gap-3">
                      <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-sm font-bold ${transferFound.gender === "Female" ? "bg-pink-100 text-pink-700" : "bg-blue-100 text-blue-700"}`}>
                        {initials(transferFound.fullName)}
                      </div>
                      <div>
                        <p className="font-bold text-[#0F2044]">{transferFound.fullName}</p>
                        <StudentCodeBadge code={transferFound.studentCode} />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div><span className="text-[#0F2044]/40">Gender: </span><span className="text-[#0F2044] font-medium">{transferFound.gender}</span></div>
                      <div><span className="text-[#0F2044]/40">DOB: </span><span className="text-[#0F2044] font-medium">{transferFound.dob || "—"}</span></div>
                      <div><span className="text-[#0F2044]/40">Guardian: </span><span className="text-[#0F2044] font-medium">{transferFound.guardianName}</span></div>
                      <div><span className="text-[#0F2044]/40">Phone: </span><span className="text-[#0F2044] font-medium">{transferFound.guardianPhone}</span></div>
                      <div><span className="text-[#0F2044]/40">Previous school: </span><span className="text-[#0F2044] font-medium">{transferFound.schoolName || transferFound.schoolCode}</span></div>
                      <div><span className="text-[#0F2044]/40">Previous class: </span><span className="text-[#0F2044] font-medium">{transferFound.className || "—"}</span></div>
                    </div>
                    {transferFound.transferHistory && transferFound.transferHistory.length > 1 && (
                      <div className="pt-2 border-t border-[#0F2044]/8">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-[#0F2044]/40 mb-2">Transfer History</p>
                        <div className="space-y-1">
                          {transferFound.transferHistory.map((h, i) => (
                            <div key={i} className="flex items-center gap-2 text-xs text-[#0F2044]/60">
                              <span className="w-1.5 h-1.5 rounded-full bg-[#0F2044]/30 flex-shrink-0" />
                              <span>{h.action === "enrolled" ? "Enrolled at" : "Transferred to"} <strong>{h.schoolName || h.schoolCode}</strong></span>
                              <span className="text-[#0F2044]/30">{h.joinedAt ? new Date(h.joinedAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : ""}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  <Select label="Assign to Class at This School" required value={transferClassId} onChange={e => setTransferClassId(e.target.value)}>
                    <option value="">Select class…</option>
                    {classes.map(c => <option key={c.id} value={c.id}>{c.name} ({c.level})</option>)}
                  </Select>

                  <div className="flex justify-end gap-3">
                    <Btn variant="ghost" onClick={() => { setTransferFound(null); setTransferCode(""); }}>Cancel</Btn>
                    <Btn variant="teal" onClick={handleTransferConfirm} loading={transferLoading}>{IC.transfer} Confirm Transfer</Btn>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Detail Modal */}
      {showDetail && (
        <Modal title="Student Profile" onClose={() => setShowDetail(null)} wide>
          <div className="space-y-5">
            <div className="flex items-center gap-4">
              <div className={`w-16 h-16 rounded-2xl flex items-center justify-center text-xl font-bold ${showDetail.gender === "Female" ? "bg-pink-100 text-pink-700" : "bg-blue-100 text-blue-700"}`}>
                {initials(showDetail.fullName)}
              </div>
              <div>
                <h3 className="text-xl font-bold text-[#0F2044]">{showDetail.fullName}</h3>
                <div className="mt-1"><StudentCodeBadge code={showDetail.studentCode} /></div>
                <p className="text-xs text-[#0F2044]/50 mt-1">{showDetail.className} · {showDetail.gender} · {showDetail.status}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-px bg-[#0F2044]/5 rounded-xl overflow-hidden text-sm">
              {[
                ["Date of Birth", showDetail.dob || "—"],
                ["National ID", showDetail.nationalId || "—"],
                ["District", showDetail.district || "—"],
                ["Village", showDetail.village || "—"],
                ["Guardian", showDetail.guardianName || "—"],
                ["Relationship", showDetail.guardianRelation || "—"],
                ["Guardian Phone", showDetail.guardianPhone || "—"],
                ["Enrolled", fmtDate(showDetail.createdAt)],
              ].map(([k, v]) => (
                <div key={k} className="bg-white px-4 py-3">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-[#0F2044]/40 mb-0.5">{k}</p>
                  <p className="font-medium text-[#0F2044]">{v}</p>
                </div>
              ))}
            </div>

            {showDetail.transferHistory && showDetail.transferHistory.length > 0 && (
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-[#0F2044]/40 mb-3">School History</p>
                <div className="space-y-2">
                  {showDetail.transferHistory.map((h, i) => (
                    <div key={i} className={`flex items-center gap-3 p-3 rounded-xl ${i === showDetail.transferHistory.length - 1 ? "bg-emerald-50 border border-emerald-100" : "bg-[#F7F5F0]"}`}>
                      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${i === showDetail.transferHistory.length - 1 ? "bg-emerald-500" : "bg-[#0F2044]/30"}`} />
                      <div className="flex-1">
                        <p className="text-sm font-semibold text-[#0F2044]">{h.schoolName || h.schoolCode}</p>
                        <p className="text-xs text-[#0F2044]/50 capitalize">{(h.action || "").replace(/_/g, " ")} · {h.joinedAt ? new Date(h.joinedAt).toLocaleDateString("en-GB") : "—"}</p>
                      </div>
                      {i === showDetail.transferHistory.length - 1 && <span className="text-xs font-semibold text-emerald-600 bg-emerald-100 px-2 py-0.5 rounded-lg">Current</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {showDetail.hasAccount && (
              <div className="flex items-center gap-2 px-4 py-3 bg-[#0F2044]/5 rounded-xl text-xs text-[#0F2044]/70">
                {IC.idCard}<span>This student has a login account linked to this profile.</span>
              </div>
            )}
          </div>
        </Modal>
      )}

      {/* Delete Confirm */}
      {showDelete && (
        <Modal title="Remove Student" onClose={() => setShowDelete(null)}>
          <div className="space-y-4">
            <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-100 rounded-xl">
              {IC.warning}
              <div>
                <p className="text-sm font-semibold text-red-800">Remove from this school?</p>
                <p className="text-xs text-red-600 mt-0.5"><strong>{showDelete.fullName}</strong>'s record will be deleted from {schoolName}. Their student code remains valid and they can be enrolled elsewhere using it.</p>
              </div>
            </div>
            <div className="flex justify-end gap-3">
              <Btn variant="ghost" onClick={() => setShowDelete(null)}>Cancel</Btn>
              <Btn variant="danger" loading={actionLoading} onClick={handleDelete}>Remove Student</Btn>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── MODULE 3: School Settings ────────────────────────────────────────────────
function SchoolSettings({ schoolCode, schoolData, onUpdate }) {
  const [form, setForm]     = useState({ name: "", district: "", address: "", phone: "", email: "" });
  const [classes, setClasses] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saved, setSaved]   = useState(false);
  const [error, setError]   = useState("");
  const [showClassModal, setShowClassModal] = useState(false);
  const [editingClass, setEditingClass] = useState(null);
  const [classForm, setClassForm] = useState({ name: "", level: "primary", subjects: [] });

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
    if (cls) { setClassForm({ name: cls.name||"", level: cls.level||"primary", subjects: cls.subjects||[] }); setEditingClass(cls); }
    else { setClassForm({ name: "", level: "primary", subjects: [] }); setEditingClass(null); }
    setShowClassModal(true);
  }

  async function saveClass() {
    if (!classForm.name.trim()) { alert("Class name required"); return; }
    setLoading(true);
    try {
      const data = { name: classForm.name.trim(), level: classForm.level, subjects: classForm.subjects.length > 0 ? classForm.subjects : (classForm.level === "primary" ? PRIMARY_SUBJECTS : SECONDARY_SUBJECTS), schoolCode, order: classes.length + 1, updatedAt: serverTimestamp() };
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
    setClassForm(prev => ({ ...prev, subjects: prev.subjects.includes(subject) ? prev.subjects.filter(s => s !== subject) : [...prev.subjects, subject] }));
  }

  return (
    <div className="space-y-8 max-w-4xl">
      <div>
        <h2 className="text-xl font-bold text-[#0F2044]">School Settings</h2>
        <p className="text-sm text-[#0F2044]/50 mt-0.5">Manage your institution's profile, contact details, and class structure</p>
      </div>

      <div className="bg-white rounded-2xl border border-[#0F2044]/8 p-6 space-y-5">
        {error && <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700">{error}</div>}
        {saved && <div className="px-4 py-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-700 flex items-center gap-2">{IC.check} Settings saved successfully.</div>}
        <Input label="School Name" required value={form.name} onChange={e => setForm(p => ({...p, name: e.target.value}))} />
        <Select label="District" required value={form.district} onChange={e => setForm(p => ({...p, district: e.target.value}))}>
          <option value="">Select district…</option>
          {DISTRICTS.map(d => <option key={d} value={d}>{d}</option>)}
        </Select>
        <Textarea label="Physical Address" value={form.address} onChange={e => setForm(p => ({...p, address: e.target.value}))} rows={2} />
        <div className="grid grid-cols-2 gap-4">
          <Input label="Phone Number" type="tel" value={form.phone} onChange={e => setForm(p => ({...p, phone: e.target.value}))} />
          <Input label="Email Address" type="email" value={form.email} onChange={e => setForm(p => ({...p, email: e.target.value}))} />
        </div>
        <div className="flex justify-end pt-2">
          <Btn type="button" onClick={handleSaveSchool} loading={loading}>Save School Info</Btn>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-[#0F2044]/8 overflow-hidden">
        <div className="px-6 py-5 border-b border-[#0F2044]/8 flex items-center justify-between bg-[#F7F5F0]">
          <div>
            <h3 className="font-semibold text-[#0F2044]">Classes & Subjects</h3>
            <p className="text-sm text-[#0F2044]/50">Based on Malawi National Curriculum (Primary: Std 1-8 | Secondary: Form 1-4)</p>
          </div>
          <Btn onClick={() => openClassModal()} variant="gold" size="sm">{IC.plus} Add Class</Btn>
        </div>
        <div className="p-6">
          {classes.length === 0 ? (
            <EmptyState icon={IC.school} title="No classes defined yet" sub="Add classes and subjects per Malawian curriculum"
              action={<Btn onClick={() => openClassModal()} variant="gold">{IC.plus} Add First Class</Btn>} />
          ) : (
            <div className="space-y-4">
              {classes.map((cls, index) => (
                <div key={cls.id} className="border border-[#0F2044]/10 rounded-2xl p-5 hover:shadow-sm transition-all">
                  <div className="flex justify-between items-start mb-4">
                    <div className="flex items-center gap-3">
                      <span className="inline-block px-3 py-1 bg-[#0F2044] text-white text-xs font-bold rounded-lg">{cls.level === "primary" ? "PRIMARY" : "SECONDARY"}</span>
                      <h4 className="font-semibold text-lg text-[#0F2044]">{cls.name}</h4>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => openClassModal(cls)} className="p-2 text-[#0F2044]/60 hover:text-[#0F2044] hover:bg-[#0F2044]/5 rounded-lg transition-colors">{IC.edit}</button>
                      <button onClick={() => deleteClass(cls.id)} className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors">{IC.trash}</button>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {cls.subjects?.map((sub, i) => (
                      <span key={i} className="inline-flex items-center px-3 py-1 bg-emerald-50 text-emerald-700 text-xs rounded-xl font-medium">{sub}</span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {showClassModal && (
        <Modal title={editingClass ? "Edit Class" : "Add New Class"} onClose={() => setShowClassModal(false)} wide>
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <Input label="Class Name" required value={classForm.name} onChange={e => setClassForm(p => ({...p, name: e.target.value}))} placeholder={classForm.level === "primary" ? "Standard 5" : "Form 2"} />
              <Select label="Level" required value={classForm.level} onChange={e => setClassForm(p => ({...p, level: e.target.value, subjects: []}))}>
                <option value="primary">Primary</option>
                <option value="secondary">Secondary</option>
              </Select>
            </div>
            <div>
              <label className="text-xs font-semibold text-[#0F2044]/60 uppercase tracking-wider block mb-2">Subjects</label>
              <div className="grid grid-cols-2 gap-2 max-h-64 overflow-y-auto p-3 border border-[#0F2044]/10 rounded-xl bg-[#F7F5F0]/50">
                {(classForm.level === "primary" ? PRIMARY_SUBJECTS : SECONDARY_SUBJECTS).map((subject, idx) => (
                  <label key={idx} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-white p-2 rounded-lg transition-colors">
                    <input type="checkbox" checked={classForm.subjects.includes(subject)} onChange={() => toggleSubject(subject)} className="w-4 h-4 accent-[#0F2044]" />
                    <span>{subject}</span>
                  </label>
                ))}
              </div>
              <p className="text-xs text-[#0F2044]/50 mt-2">Defaults will be applied if none selected.</p>
            </div>
            <div className="flex justify-end gap-3 pt-4 border-t">
              <Btn type="button" variant="ghost" onClick={() => setShowClassModal(false)}>Cancel</Btn>
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
    { id: "trial",    name: "Trial",    price: "Free",       period: "30 days", features: ["Up to 5 users", "Core modules", "Email support"], current: status === "trial" },
    { id: "standard", name: "Standard", price: "MWK 45,000", period: "/ month", features: ["Up to 30 users", "All modules", "Priority support", "Data exports"], current: status === "standard" },
    { id: "premium",  name: "Premium",  price: "MWK 95,000", period: "/ month", features: ["Unlimited users", "All modules + API", "24/7 support", "Custom reports", "Multi-branch"], current: status === "premium" },
  ];
  return (
    <div className="space-y-6">
      <div><h2 className="text-xl font-bold text-[#0F2044]">Subscription & Billing</h2><p className="text-sm text-[#0F2044]/50 mt-0.5">Manage your plan and payment details</p></div>
      <div className={`rounded-2xl p-5 flex items-center justify-between ${status === "trial" ? "bg-amber-50 border border-amber-200" : "bg-emerald-50 border border-emerald-200"}`}>
        <div>
          <p className={`text-xs font-bold uppercase tracking-wider mb-0.5 ${status === "trial" ? "text-amber-700" : "text-emerald-700"}`}>Current Plan</p>
          <p className={`font-bold text-lg capitalize ${status === "trial" ? "text-amber-800" : "text-emerald-800"}`}>{status}</p>
          {status === "trial" && <p className="text-xs text-amber-600 mt-0.5">Upgrade to unlock all features</p>}
        </div>
        <div className={`px-3 py-1.5 rounded-xl text-xs font-bold ${status === "trial" ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"}`}>{status === "trial" ? "Trial Active" : "Subscribed"}</div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {plans.map(plan => (
          <div key={plan.id} className={`rounded-2xl border p-5 flex flex-col ${plan.current ? "bg-[#0F2044] border-[#0F2044]" : "bg-white border-[#0F2044]/10"}`}>
            <div className="mb-4">
              <p className={`text-xs font-bold uppercase tracking-wider mb-1 ${plan.current ? "text-white/50" : "text-[#0F2044]/50"}`}>{plan.name}</p>
              <p className={`font-bold text-2xl ${plan.current ? "text-white" : "text-[#0F2044]"}`}>{plan.price}</p>
              <p className={`text-xs ${plan.current ? "text-white/40" : "text-[#0F2044]/40"}`}>{plan.period}</p>
            </div>
            <ul className="space-y-2 flex-1 mb-5">
              {plan.features.map(f => (
                <li key={f} className={`flex items-center gap-2 text-xs ${plan.current ? "text-white/70" : "text-[#0F2044]/60"}`}>
                  <span className={plan.current ? "text-[#F4B400]" : "text-emerald-500"}>{IC.check}</span>{f}
                </li>
              ))}
            </ul>
            {plan.current ? <span className="text-center text-xs font-semibold text-[#F4B400]">Current Plan</span>
              : <Btn variant={plan.id === "premium" ? "gold" : "ghost"} size="sm" onClick={() => alert("Contact SSP-PEP to upgrade: billing@ssp-pep.mw")}>Upgrade</Btn>}
          </div>
        ))}
      </div>
      <div className="bg-[#F7F5F0] rounded-2xl p-5 border border-[#0F2044]/8">
        <p className="text-sm font-semibold text-[#0F2044] mb-1">Need to change your plan?</p>
        <p className="text-xs text-[#0F2044]/60">Contact the SSP-PEP billing team at <span className="font-mono text-[#0F2044]">billing@ssp-pep.mw</span> or call <span className="font-mono text-[#0F2044]">+265 1 XXX XXX</span>.</p>
      </div>
    </div>
  );
}

// ─── MODULE 5: Announcements ──────────────────────────────────────────────────
function Announcements({ schoolCode, userName }) {
  const [items, setItems]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [form, setForm]       = useState({ title: "", body: "", audience: "all", priority: "normal" });
  const [error, setError]     = useState("");

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
  const priorityStyle = { urgent: "bg-red-100 text-red-700", high: "bg-amber-100 text-amber-700", normal: "bg-blue-100 text-blue-700" };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h2 className="text-xl font-bold text-[#0F2044]">Announcements & Notices</h2><p className="text-sm text-[#0F2044]/50 mt-0.5">Broadcast messages to staff, parents, and teachers</p></div>
        <Btn onClick={() => setShowAdd(true)} variant="gold">{IC.plus} New Announcement</Btn>
      </div>
      {loading ? <div className="flex justify-center py-12"><Spinner /></div>
        : items.length === 0 ? <EmptyState icon={IC.bell} title="No announcements yet" sub="Post your first notice" action={<Btn onClick={() => setShowAdd(true)} variant="gold" size="sm">{IC.plus} Post</Btn>} />
        : (
          <div className="space-y-3">
            {items.map(item => (
              <div key={item.id} className="bg-white rounded-2xl border border-[#0F2044]/8 p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className={`inline-flex px-2 py-0.5 rounded-lg text-[10px] font-bold uppercase tracking-wider ${priorityStyle[item.priority] || priorityStyle.normal}`}>{item.priority}</span>
                      <span className="text-[10px] text-[#0F2044]/40 font-medium">→ {audienceLabel[item.audience] || item.audience}</span>
                    </div>
                    <p className="font-semibold text-[#0F2044] mb-1">{item.title}</p>
                    <p className="text-sm text-[#0F2044]/60 leading-relaxed">{item.body}</p>
                    <p className="text-xs text-[#0F2044]/30 mt-2">Posted by {item.postedBy} · {fmtDate(item.createdAt)}</p>
                  </div>
                  <button onClick={() => handleDelete(item.id)} className="p-2 rounded-lg hover:bg-red-50 text-[#0F2044]/30 hover:text-red-600 transition-colors flex-shrink-0">{IC.trash}</button>
                </div>
              </div>
            ))}
          </div>
        )}
      {showAdd && (
        <Modal title="New Announcement" onClose={() => setShowAdd(false)} wide>
          <form onSubmit={handlePost} className="space-y-4">
            {error && <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700">{error}</div>}
            <Input label="Title" required value={form.title} onChange={e => setForm(p => ({...p, title: e.target.value}))} />
            <Textarea label="Message" value={form.body} onChange={e => setForm(p => ({...p, body: e.target.value}))} rows={4} />
            <div className="grid grid-cols-2 gap-4">
              <Select label="Audience" value={form.audience} onChange={e => setForm(p => ({...p, audience: e.target.value}))}>
                <option value="all">Everyone</option><option value="staff">Staff Only</option>
                <option value="teachers">Teachers Only</option><option value="parents">Parents Only</option>
              </Select>
              <Select label="Priority" value={form.priority} onChange={e => setForm(p => ({...p, priority: e.target.value}))}>
                <option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option>
              </Select>
            </div>
            <div className="flex justify-end gap-3 pt-2">
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
  const actionColor = {
    user_created: "bg-emerald-100 text-emerald-700", user_deleted: "bg-red-100 text-red-700",
    user_suspended: "bg-amber-100 text-amber-700", settings_updated: "bg-blue-100 text-blue-700",
    announcement_posted: "bg-purple-100 text-purple-700", student_registered: "bg-teal-100 text-teal-700",
    student_transferred: "bg-indigo-100 text-indigo-700",
  };
  return (
    <div className="space-y-6">
      <div><h2 className="text-xl font-bold text-[#0F2044]">Audit Log</h2><p className="text-sm text-[#0F2044]/50 mt-0.5">A record of all administrative actions</p></div>
      <div className="bg-white rounded-2xl border border-[#0F2044]/8 overflow-hidden">
        {loading ? <div className="p-12 flex justify-center"><Spinner /></div>
          : logs.length === 0 ? <EmptyState icon={IC.audit} title="No audit entries yet" sub="Actions appear here automatically" />
          : (
            <div className="divide-y divide-[#0F2044]/5">
              {logs.map(log => (
                <div key={log.id} className="px-5 py-4 flex items-start gap-4 hover:bg-[#F7F5F0]/50 transition-colors">
                  <div className="w-8 h-8 bg-[#0F2044]/5 rounded-xl flex items-center justify-center text-[#0F2044]/40 flex-shrink-0 mt-0.5">{IC.audit}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`px-2 py-0.5 rounded-lg text-[10px] font-bold uppercase tracking-wider ${actionColor[log.action] || "bg-gray-100 text-gray-600"}`}>{(log.action||"").replace(/_/g," ")}</span>
                      <span className="text-xs text-[#0F2044]/50">{log.description}</span>
                    </div>
                    <p className="text-xs text-[#0F2044]/30 mt-1">By {log.performedBy} · {fmtDate(log.timestamp)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
      </div>
    </div>
  );
}

// ─── OVERVIEW ─────────────────────────────────────────────────────────────────
function Overview({ userData, schoolData, schoolCode, setTab }) {
  const displayName  = userData?.name || "Admin";
  const schoolName   = schoolData?.name || schoolCode;
  const subscription = schoolData?.subscription_status || "trial";
  const quickActions = [
    { label: "Add Staff User",     icon: IC.users,    tab: "users",        color: "bg-[#0F2044]" },
    { label: "Register Student",   icon: IC.students, tab: "students",     color: "bg-teal-600" },
    { label: "Post Notice",        icon: IC.bell,     tab: "announcements",color: "bg-[#F4B400]" },
    { label: "School Settings",    icon: IC.school,   tab: "settings",     color: "bg-purple-600" },
  ];
  return (
    <div className="space-y-8">
      <div className="bg-[#0F2044] rounded-3xl p-7 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <p className="text-white/50 text-sm mb-1">{greeting()}</p>
          <h2 className="text-2xl font-bold text-white">{displayName.split(" ")[0]}</h2>
          <p className="text-white/60 text-sm mt-1">{schoolName}</p>
        </div>
        <div className="flex flex-col items-start sm:items-end gap-2">
          <span className={`px-3 py-1.5 rounded-xl text-xs font-bold capitalize ${subscription === "trial" ? "bg-amber-400 text-amber-900" : "bg-emerald-400 text-emerald-900"}`}>{subscription} plan</span>
          <span className="text-white/40 text-xs font-mono">{schoolCode}</span>
        </div>
      </div>
      <div>
        <p className="text-xs font-bold uppercase tracking-widest text-[#0F2044]/40 mb-3">Quick Actions</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {quickActions.map(a => (
            <button key={a.tab} onClick={() => setTab(a.tab)} className={`${a.color} text-white rounded-2xl p-5 flex flex-col items-start gap-3 hover:brightness-105 active:scale-[0.98] transition-all text-left`}>
              <div className="opacity-90">{a.icon}</div>
              <span className="text-sm font-semibold leading-tight">{a.label}</span>
            </button>
          ))}
        </div>
      </div>
      <div>
        <p className="text-xs font-bold uppercase tracking-widest text-[#0F2044]/40 mb-3">Admin Modules</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[
            { tab: "users",         icon: IC.users,    title: "User Management",    desc: "Create and manage staff, teacher, bursar, librarian, and parent accounts" },
            { tab: "students",      icon: IC.students, title: "Student Management", desc: "Register students with unique codes, view profiles, and transfer students between schools" },
            { tab: "settings",      icon: IC.school,   title: "School Settings",    desc: "Update school profile, classes, subjects, and contact information" },
            { tab: "billing",       icon: IC.billing,  title: "Subscription",       desc: "View your current plan and upgrade options" },
            { tab: "announcements", icon: IC.bell,     title: "Announcements",      desc: "Broadcast notices to staff, teachers, and parents" },
            { tab: "audit",         icon: IC.audit,    title: "Audit Log",          desc: "Track all administrative actions with timestamps" },
          ].map(m => (
            <button key={m.tab} onClick={() => setTab(m.tab)} className="bg-white rounded-2xl border border-[#0F2044]/8 p-5 text-left hover:border-[#0F2044]/20 hover:shadow-sm transition-all group">
              <div className="w-10 h-10 bg-[#0F2044]/5 rounded-xl flex items-center justify-center text-[#0F2044]/60 group-hover:bg-[#0F2044] group-hover:text-white transition-all mb-3">{m.icon}</div>
              <p className="font-semibold text-[#0F2044] text-sm mb-1">{m.title}</p>
              <p className="text-xs text-[#0F2044]/50 leading-relaxed">{m.desc}</p>
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
  const userInitials   = initials(displayName);
  const schoolInitials = initials(schoolName).slice(0, 2);

  const navItems = [
    { id: "overview",      label: "Overview",          icon: IC.home     },
    { id: "users",         label: "User Management",   icon: IC.users    },
    { id: "students",      label: "Students",          icon: IC.students },
    { id: "settings",      label: "School Settings",   icon: IC.school   },
    { id: "billing",       label: "Subscription",      icon: IC.billing  },
    { id: "announcements", label: "Announcements",     icon: IC.bell     },
    { id: "audit",         label: "Audit Log",         icon: IC.audit    },
  ];

  if (loading) return (
    <div className="min-h-screen bg-[#F7F5F0] flex items-center justify-center" style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <div className="text-center space-y-3">
        <div className="w-12 h-12 border-4 border-[#0F2044]/20 border-t-[#0F2044] rounded-full animate-spin mx-auto" />
        <p className="text-sm text-[#0F2044]/60">Loading your dashboard…</p>
      </div>
    </div>
  );

  if (authError) return (
    <div className="min-h-screen bg-[#F7F5F0] flex items-center justify-center p-4" style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <div className="bg-white rounded-2xl border border-red-200 p-8 max-w-sm text-center space-y-4">
        <div className="w-12 h-12 bg-red-50 rounded-full flex items-center justify-center mx-auto text-red-500">{IC.warning}</div>
        <p className="text-sm font-semibold text-gray-800">{authError}</p>
        <Btn onClick={handleSignOut} variant="primary">Back to Sign In</Btn>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#F7F5F0] flex" style={{ fontFamily: "'DM Sans', sans-serif" }}>

      {/* Sidebar */}
      <aside className={`${sidebarOpen ? "translate-x-0" : "-translate-x-full"} lg:translate-x-0 fixed lg:static inset-y-0 left-0 z-50 bg-white border-r border-[#0F2044]/10 shadow-xl lg:shadow-none transition-transform duration-300 flex flex-col`} style={{ width: "17rem" }}>
        <div className="px-6 py-5 border-b border-[#0F2044]/8 flex items-center gap-3 flex-shrink-0">
          <div className="w-9 h-9 rounded-xl bg-[#F4B400] flex items-center justify-center flex-shrink-0">
            <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5"><path d="M12 3L2 8l10 5 10-5-10-5z" fill="#0F2044"/><path d="M2 13l10 5 10-5" stroke="#0F2044" strokeWidth="1.8" strokeLinejoin="round"/></svg>
          </div>
          <div><div className="font-bold text-lg text-[#0F2044] leading-none">SSP-PEP</div><div className="text-[10px] text-[#0F2044]/40 mt-0.5">System Admin</div></div>
        </div>

        <nav className="flex-1 px-4 py-4 space-y-1 overflow-y-auto">
          <p className="px-3 py-2 text-[10px] font-bold tracking-widest uppercase text-[#0F2044]/40">Admin Modules</p>
          {navItems.map(item => {
            const active = currentTab === item.id;
            return (
              <button key={item.id} onClick={() => { setCurrentTab(item.id); setSidebarOpen(false); }}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-medium transition-all duration-200 ${active ? "bg-[#0F2044] text-white shadow-md" : "text-[#0F2044]/60 hover:bg-[#0F2044]/5 hover:text-[#0F2044]"}`}>
                <span className={active ? "text-white" : "text-[#0F2044]/50"}>{item.icon}</span>
                <span>{item.label}</span>
                {item.id === "students" && <span className={`ml-auto text-[10px] font-bold px-1.5 py-0.5 rounded-md ${active ? "bg-white/20 text-white" : "bg-teal-100 text-teal-700"}`}>NEW</span>}
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-[#0F2044]/8 flex-shrink-0">
          <div className="bg-[#F7F5F0] rounded-2xl p-4 border border-[#0F2044]/8">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-9 h-9 bg-[#0F2044] text-white rounded-xl flex items-center justify-center text-xs font-bold flex-shrink-0">{schoolInitials || "SC"}</div>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-[#0F2044] truncate">{schoolName}</p>
                <p className="text-[10px] text-[#0F2044]/40 truncate">{schoolDistrict}</p>
                {schoolCode && <p className="text-[9px] font-mono text-[#0F2044]/30 tracking-wider">{schoolCode}</p>}
              </div>
            </div>
            <button onClick={handleSignOut} className="w-full flex items-center justify-center gap-2 text-red-500 hover:text-red-700 hover:bg-red-50 py-2 rounded-xl text-xs font-semibold transition-colors">
              {IC.logout} Sign Out
            </button>
          </div>
        </div>
      </aside>

      {sidebarOpen && <div className="fixed inset-0 z-40 bg-black/30 lg:hidden" onClick={() => setSidebarOpen(false)} />}

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="bg-white border-b border-[#0F2044]/10 px-6 py-4 flex items-center justify-between sticky top-0 z-40 flex-shrink-0">
          <div className="flex items-center gap-4">
            <button onClick={() => setSidebarOpen(v => !v)} className="lg:hidden p-2 text-[#0F2044] hover:bg-[#F7F5F0] rounded-xl">{sidebarOpen ? IC.close : IC.menu}</button>
            <div>
              <h1 className="text-xl font-bold text-[#0F2044]">{navItems.find(i => i.id === currentTab)?.label || "Dashboard"}</h1>
              <p className="text-xs text-[#0F2044]/40">System Administrator · {schoolName}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-[#F7F5F0] rounded-xl border border-[#0F2044]/8">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-xs text-[#0F2044]/60 font-medium">Online</span>
            </div>
            <div className="flex items-center gap-2.5">
              <div className="text-right hidden sm:block">
                <p className="text-sm font-semibold text-[#0F2044]">{displayName}</p>
                <p className="text-xs text-emerald-600">System Admin</p>
              </div>
              <div className="w-9 h-9 bg-[#0F2044] text-white rounded-xl flex items-center justify-center font-bold text-sm">{userInitials || "??"}</div>
            </div>
          </div>
        </header>

        <main className="flex-1 p-6 lg:p-8 overflow-auto">
          {currentTab === "overview"      && <Overview userData={userData} schoolData={schoolData} schoolCode={schoolCode} setTab={setCurrentTab} />}
          {currentTab === "users"         && <UserManagement schoolCode={schoolCode} schoolName={schoolName} />}
          {currentTab === "students"      && <StudentManagement schoolCode={schoolCode} schoolName={schoolName} />}
          {currentTab === "settings"      && <SchoolSettings schoolCode={schoolCode} schoolData={schoolData} onUpdate={setSchoolData} />}
          {currentTab === "billing"       && <Billing schoolData={schoolData} />}
          {currentTab === "announcements" && <Announcements schoolCode={schoolCode} userName={displayName} />}
          {currentTab === "audit"         && <AuditLog schoolCode={schoolCode} />}
        </main>

        <footer className="border-t border-[#0F2044]/8 bg-white py-3 px-8 text-xs text-[#0F2044]/30 flex justify-between items-center flex-shrink-0">
          <span>© 2026 SSP-PEP · Ministry of Education, Malawi</span>
          <span>v1.3.0</span>
        </footer>
      </div>
    </div>
  );
}