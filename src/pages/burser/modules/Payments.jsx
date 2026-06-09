// pages/bursar/modules/Payments.jsx
import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { db } from "../../../firebase";
import {
  collection, query, where, getDocs, addDoc,
  serverTimestamp, orderBy,
} from "firebase/firestore";

// ─── Icons ────────────────────────────────────────────────────────────────────
const IC = {
  search:   <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 15.803a7.5 7.5 0 0010.607 10.607z"/></svg>,
  close:    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>,
  plus:     <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15"/></svg>,
  check:    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="w-3.5 h-3.5"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5"/></svg>,
  warning:  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"/></svg>,
  payment:  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z"/></svg>,
  receipt:  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M9 14.25l6-6m4.5-3.493V21.75l-3.75-1.5-3.75 1.5-3.75-1.5-3.75 1.5V4.757c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0111.186 0c1.1.128 1.907 1.077 1.907 2.185z"/></svg>,
  user:     <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z"/></svg>,
  refresh:  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99"/></svg>,
  chevron:  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5"/></svg>,
};

const Spinner = ({ size = "sm" }) => {
  const cls = size === "lg" ? "w-8 h-8" : "w-4 h-4";
  return (
    <svg className={`animate-spin ${cls}`} viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
    </svg>
  );
};

// ─── Modal ────────────────────────────────────────────────────────────────────
const Modal = ({ title, subtitle, onClose, children, wide }) => (
  <div
    className="fixed inset-0 z-50 flex items-center justify-center px-4 py-8 overflow-y-auto"
    style={{ backgroundColor: "rgba(10,22,50,0.55)", backdropFilter: "blur(4px)" }}
    onClick={e => e.target === e.currentTarget && onClose()}
  >
    <div className={`bg-app-surface rounded-2xl shadow-2xl w-full ${wide ? "max-w-2xl" : "max-w-lg"} overflow-hidden my-auto`}>
      <div className="bg-app-primary px-6 py-5 flex items-start justify-between gap-4">
        <div>
          <h3 className="text-white font-bold text-base leading-tight">{title}</h3>
          {subtitle && <p className="text-white/50 text-xs mt-0.5">{subtitle}</p>}
        </div>
        <button onClick={onClose} className="text-white/50 hover:text-white transition-colors mt-0.5 flex-shrink-0">{IC.close}</button>
      </div>
      <div className="p-6 max-h-[82vh] overflow-y-auto">{children}</div>
    </div>
  </div>
);

// ─── Button ───────────────────────────────────────────────────────────────────
const Btn = ({ children, variant = "primary", size = "md", loading, className = "", disabled, ...props }) => {
  const base = "inline-flex items-center justify-center gap-2 font-semibold rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed select-none";
  const sizes = { sm: "px-3 py-1.5 text-xs", md: "px-4 py-2.5 text-sm", lg: "px-5 py-3 text-sm" };
  const variants = {
    primary: "bg-app-primary text-white hover:bg-[#162d5e] active:scale-[0.98]",
    gold:    "bg-app-warning text-app-text hover:bg-[#e5a800] active:scale-[0.98]",
    ghost:   "border border-app-border text-app-text/70 hover:bg-app-primary/5 active:scale-[0.98]",
    emerald: "bg-emerald-600 text-white hover:bg-emerald-700 active:scale-[0.98]",
  };
  return (
    <button {...props} disabled={loading || disabled} className={`${base} ${sizes[size]} ${variants[variant]} ${className}`}>
      {loading ? <Spinner /> : children}
    </button>
  );
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmt = n => `MWK ${Number(n || 0).toLocaleString()}`;
const today = () => new Date().toISOString().split("T")[0];

function initials(name = "") {
  return name.split(" ").filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join("");
}

function avatarColor(name = "") {
  const palettes = ["bg-blue-100 text-blue-700","bg-violet-100 text-violet-700","bg-emerald-100 text-emerald-700","bg-orange-100 text-orange-700","bg-rose-100 text-rose-700","bg-cyan-100 text-cyan-700"];
  return palettes[(name.charCodeAt(0) || 0) % palettes.length];
}

function genReceiptNo() {
  return `RCP-${Date.now().toString(36).toUpperCase()}-${Math.floor(100 + Math.random() * 900)}`;
}

// ─── Constants ────────────────────────────────────────────────────────────────
const PAYMENT_METHODS = ["Cash","Airtel Money","TNM Mpamba","National Bank Transfer","Standard Bank Transfer","NBS Transfer","Cheque","Other"];
const ACADEMIC_YEARS  = ["2024/2025","2025/2026","2026/2027"];
const TERMS           = ["Term 1","Term 2","Term 3","Full Year"];
const EMPTY_FORM      = { amount: "", method: "Cash", referenceNo: "", term: "Term 1", notes: "", date: today() };

const METHOD_BADGE = {
  "Cash":                    "bg-emerald-100 text-emerald-700",
  "Airtel Money":            "bg-red-100 text-red-700",
  "TNM Mpamba":              "bg-yellow-100 text-yellow-800",
  "National Bank Transfer":  "bg-blue-100 text-blue-700",
  "Standard Bank Transfer":  "bg-indigo-100 text-indigo-700",
  "NBS Transfer":            "bg-purple-100 text-purple-700",
  "Cheque":                  "bg-gray-100 text-gray-700",
};

// ─── Student Search Combobox ──────────────────────────────────────────────────
function StudentSearch({ students, studentFinancials, onSelect }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const ref = useRef(null);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q || q.length < 2) return [];
    return students.filter(s =>
      s.fullName?.toLowerCase().includes(q) ||
      s.studentCode?.toLowerCase().includes(q) ||
      s.className?.toLowerCase().includes(q)
    ).slice(0, 8);
  }, [query, students]);

  useEffect(() => {
    const handler = e => { if (!ref.current?.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  function pick(student) {
    const fin = studentFinancials(student.id);
    onSelect({ ...student, ...fin });
    setQuery("");
    setOpen(false);
  }

  function onKey(e) {
    if (!open || results.length === 0) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setActive(a => Math.min(a + 1, results.length - 1)); }
    if (e.key === "ArrowUp")   { e.preventDefault(); setActive(a => Math.max(a - 1, 0)); }
    if (e.key === "Enter")     { e.preventDefault(); pick(results[active]); }
    if (e.key === "Escape")    { setOpen(false); }
  }

  return (
    <div ref={ref} className="relative">
      <div className="relative">
        <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-app-text/30">{IC.search}</span>
        <input
          value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true); setActive(0); }}
          onFocus={() => query.length >= 2 && setOpen(true)}
          onKeyDown={onKey}
          placeholder="Type student name or code…"
          className="w-full pl-10 pr-4 py-3 text-sm rounded-xl border border-app-border bg-app-bg/60 outline-none focus:border-[#0F2044]/40 focus:bg-app-surface transition-all"
          autoComplete="off"
        />
      </div>

      {open && results.length > 0 && (
        <ul className="absolute z-30 left-0 right-0 mt-1.5 bg-app-surface border border-app-border rounded-xl shadow-xl overflow-hidden">
          {results.map((s, i) => {
            const fin = studentFinancials(s.id);
            return (
              <li
                key={s.id}
                onMouseDown={() => pick(s)}
                onMouseEnter={() => setActive(i)}
                className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors ${i === active ? "bg-app-primary/5" : "hover:bg-app-bg"}`}
              >
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0 ${avatarColor(s.fullName)}`}>
                  {initials(s.fullName)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-app-text truncate">{s.fullName}</div>
                  <div className="text-xs text-app-text/45 font-mono">{s.studentCode} · {s.className}</div>
                </div>
                <div className="text-right flex-shrink-0">
                  <div className={`text-xs font-bold ${fin.balance > 0 ? "text-red-600" : "text-emerald-600"}`}>
                    {fin.balance > 0 ? `Owes ${fmt(fin.balance)}` : "Settled"}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {open && query.length >= 2 && results.length === 0 && (
        <div className="absolute z-30 left-0 right-0 mt-1.5 bg-app-surface border border-app-border rounded-xl shadow-xl px-4 py-3 text-sm text-app-text/50">
          No students found for "{query}"
        </div>
      )}
    </div>
  );
}

// ─── Stat Card ────────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, accent }) {
  const map = { blue: "text-app-text", emerald: "text-emerald-600", gold: "text-amber-600" };
  return (
    <div className="bg-app-surface rounded-2xl border border-app-border p-5">
      <p className="text-xs font-bold uppercase tracking-wider text-app-text/35 mb-1">{label}</p>
      <p className={`text-xl font-bold ${map[accent] || map.blue}`}>{value}</p>
      {sub && <p className="text-xs text-app-text/40 mt-0.5">{sub}</p>}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
export default function Payments({ schoolCode, bursarName }) {
  // ── Data ───────────────────────────────────────────────────────────────────
  const [payments,      setPayments]      = useState([]);
  const [students,      setStudents]      = useState([]);
  const [classes,       setClasses]       = useState([]);
  const [feeAssignments,setFeeAssignments]= useState([]);
  const [loading,       setLoading]       = useState(true);

  // ── Filters ────────────────────────────────────────────────────────────────
  const [search,        setSearch]        = useState("");
  const [methodFilter,  setMethodFilter]  = useState("all");
  const [classFilter,   setClassFilter]   = useState("all");
  const [termFilter,    setTermFilter]    = useState("all");
  const [academicYear,  setAcademicYear]  = useState("2025/2026");

  // ── Modal ──────────────────────────────────────────────────────────────────
  const [showModal,     setShowModal]     = useState(false);
  const [selectedStudent, setSelectedStudent] = useState(null); // enriched with financials
  const [form,          setForm]          = useState(EMPTY_FORM);
  const [formErrors,    setFormErrors]    = useState({});
  const [actionLoading, setActionLoading] = useState(false);
  const [modalError,    setModalError]    = useState("");

  // ── Receipt ────────────────────────────────────────────────────────────────
  const [lastReceipt,   setLastReceipt]   = useState(null);

  // ── Toast ──────────────────────────────────────────────────────────────────
  const [toast,         setToast]         = useState(null);

  // ── Fetch ──────────────────────────────────────────────────────────────────
  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [pySnap, stSnap, clSnap, faSnap] = await Promise.all([
        getDocs(query(collection(db, "payments"),       where("schoolCode","==",schoolCode), where("academicYear","==",academicYear), orderBy("createdAt","desc"))),
        getDocs(query(collection(db, "students"),       where("schoolCode","==",schoolCode))),
        getDocs(query(collection(db, "school_classes"), where("schoolCode","==",schoolCode))),
        getDocs(query(collection(db, "fee_assignments"),where("schoolCode","==",schoolCode), where("academicYear","==",academicYear))),
      ]);
      setPayments(      pySnap.docs.map(d => ({ id: d.id, ...d.data() })));
      setStudents(      stSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      setClasses(       clSnap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a,b) => (a.order||0)-(b.order||0)));
      setFeeAssignments(faSnap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) { console.error(e); showToast("error", "Failed to load payments."); }
    setLoading(false);
  }, [schoolCode, academicYear]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // ── Student financials (uses loaded data, no extra fetches) ────────────────
  const studentFinancials = useCallback((studentId) => {
    const totalCharged = feeAssignments.filter(fa => fa.studentId === studentId).reduce((s,fa) => s + (fa.amount||0), 0);
    const totalPaid    = payments.filter(p => p.studentId === studentId).reduce((s,p) => s + (p.amount||0), 0);
    const balance      = totalCharged - totalPaid;
    return { totalCharged, totalPaid, balance };
  }, [feeAssignments, payments]);

  // ── Toast ──────────────────────────────────────────────────────────────────
  function showToast(type, message) {
    setToast({ type, message });
    setTimeout(() => setToast(null), 5000);
  }

  // ── Open modal (optionally pre-select student) ─────────────────────────────
  function openModal(student = null) {
    setSelectedStudent(student ? { ...student, ...studentFinancials(student.id) } : null);
    setForm(EMPTY_FORM);
    setFormErrors({});
    setModalError("");
    setShowModal(true);
  }

  // ── Validation ─────────────────────────────────────────────────────────────
  function validate() {
    const e = {};
    if (!form.amount || isNaN(form.amount) || Number(form.amount) <= 0) e.amount = "Enter a valid amount.";
    if (!form.method) e.method = "Select a payment method.";
    return e;
  }

  // ── Submit ─────────────────────────────────────────────────────────────────
  async function handleRecord(e) {
    e.preventDefault();
    if (!selectedStudent) { setModalError("Select a student first."); return; }
    const errs = validate();
    if (Object.keys(errs).length) { setFormErrors(errs); return; }

    setActionLoading(true); setModalError("");
    const receiptNo = genReceiptNo();
    const s = selectedStudent;

    try {
      await addDoc(collection(db, "payments"), {
        studentId:   s.id,
        studentName: s.fullName,
        studentCode: s.studentCode,
        classId:     s.classId,
        className:   s.className,
        amount:      Number(form.amount),
        method:      form.method,
        referenceNo: form.referenceNo.trim() || "",
        term:        form.term,
        notes:       form.notes.trim() || "",
        paymentDate: form.date,
        receiptNo,
        recordedBy:  bursarName || "Bursar",
        academicYear,
        schoolCode,
        createdAt:   serverTimestamp(),
      });

      const receipt = {
        receiptNo,
        studentName:  s.fullName,
        studentCode:  s.studentCode,
        className:    s.className,
        amount:       Number(form.amount),
        method:       form.method,
        referenceNo:  form.referenceNo.trim(),
        term:         form.term,
        paymentDate:  form.date,
        academicYear,
        bursarName:   bursarName || "Bursar",
        prevBalance:  s.balance,
        newBalance:   Math.max(0, s.balance - Number(form.amount)),
      };

      setLastReceipt(receipt);
      setShowModal(false);
      showToast("success", `Receipt ${receiptNo} issued for ${s.fullName} — ${fmt(Number(form.amount))}`);
      await fetchAll();
    } catch (err) {
      setModalError("Failed to record payment: " + err.message);
    }
    setActionLoading(false);
  }

  // ── Stats ──────────────────────────────────────────────────────────────────
  const todayStr = today();
  const nowMonth = `${new Date().getFullYear()}-${String(new Date().getMonth()+1).padStart(2,"0")}`;
  const stats = useMemo(() => ({
    todayTotal: payments.filter(p => p.paymentDate === todayStr).reduce((s,p) => s+p.amount, 0),
    monthTotal: payments.filter(p => (p.paymentDate||"").startsWith(nowMonth)).reduce((s,p) => s+p.amount, 0),
    yearTotal:  payments.reduce((s,p) => s+p.amount, 0),
    count:      payments.length,
  }), [payments]);

  // ── Filtered list ──────────────────────────────────────────────────────────
  const filtered = useMemo(() => payments.filter(p => {
    const q = search.trim().toLowerCase();
    const ms = !q || p.studentName?.toLowerCase().includes(q) || p.studentCode?.toLowerCase().includes(q) || p.receiptNo?.toLowerCase().includes(q);
    const mm = methodFilter === "all" || p.method === methodFilter;
    const mc = classFilter  === "all" || p.classId === classFilter;
    const mt = termFilter   === "all" || p.term === termFilter;
    return ms && mm && mc && mt;
  }), [payments, search, methodFilter, classFilter, termFilter]);

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-app-text tracking-tight">Payments</h2>
          <p className="text-sm text-app-text/50 mt-0.5">Record and track fee payments for {academicYear}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={academicYear}
            onChange={e => setAcademicYear(e.target.value)}
            className="px-3.5 py-2.5 text-sm rounded-xl border border-app-border bg-app-surface outline-none"
          >
            {ACADEMIC_YEARS.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <Btn variant="ghost" size="md" onClick={fetchAll} loading={loading} title="Refresh">{IC.refresh}</Btn>
          <Btn variant="gold" onClick={() => openModal()}>{IC.plus} Record Payment</Btn>
        </div>
      </div>

      {/* ── Stats ──────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Collected Today"     value={fmt(stats.todayTotal)} accent="blue" />
        <StatCard label="This Month"          value={fmt(stats.monthTotal)} accent="emerald" />
        <StatCard label={`Total ${academicYear}`} value={fmt(stats.yearTotal)} accent="gold" sub={`${stats.count} transactions`} />
        <StatCard label="Avg. per Payment"    value={stats.count ? fmt(Math.round(stats.yearTotal / stats.count)) : "MWK 0"} accent="blue" />
      </div>

      {/* ── Last Receipt Banner ─────────────────────────────────────────────── */}
      {lastReceipt && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl px-5 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-emerald-500 rounded-xl flex items-center justify-center text-white flex-shrink-0">{IC.check}</div>
            <div>
              <p className="text-sm font-bold text-emerald-800">Payment recorded</p>
              <p className="text-xs text-emerald-700 mt-0.5">
                <span className="font-mono font-semibold">{lastReceipt.receiptNo}</span>
                {" · "}{lastReceipt.studentName}{" · "}{fmt(lastReceipt.amount)}{" via "}{lastReceipt.method}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Btn variant="emerald" size="sm" onClick={() => window.dispatchEvent(new CustomEvent("printReceipt", { detail: lastReceipt }))}>
              {IC.receipt} Print
            </Btn>
            <Btn variant="ghost" size="sm" onClick={() => setLastReceipt(null)}>Dismiss</Btn>
          </div>
        </div>
      )}

      {/* ── Filters ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-app-text/30">{IC.search}</span>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search name, code, receipt…"
            className="w-full pl-10 pr-4 py-2.5 text-sm rounded-xl border border-app-border bg-app-surface outline-none focus:ring-2 focus:ring-[#0F2044]/15"
          />
          {search && (
            <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-app-text/30 hover:text-app-text/70">
              {IC.close}
            </button>
          )}
        </div>
        <select value={classFilter}  onChange={e => setClassFilter(e.target.value)}  className="px-3.5 py-2.5 text-sm rounded-xl border border-app-border bg-app-surface outline-none">
          <option value="all">All Classes</option>
          {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select value={termFilter}   onChange={e => setTermFilter(e.target.value)}   className="px-3.5 py-2.5 text-sm rounded-xl border border-app-border bg-app-surface outline-none">
          <option value="all">All Terms</option>
          {TERMS.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <select value={methodFilter} onChange={e => setMethodFilter(e.target.value)} className="px-3.5 py-2.5 text-sm rounded-xl border border-app-border bg-app-surface outline-none">
          <option value="all">All Methods</option>
          {PAYMENT_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
      </div>

      {/* ── Payments Table ──────────────────────────────────────────────────── */}
      <div className="bg-app-surface rounded-2xl border border-app-border overflow-hidden">
        {loading ? (
          <div className="p-16 flex flex-col items-center gap-3 text-app-text/40">
            <Spinner size="lg" />
            <span className="text-sm">Loading payments…</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-16 flex flex-col items-center gap-3 text-center">
            <div className="w-14 h-14 bg-app-primary/5 rounded-2xl flex items-center justify-center text-app-text/30">{IC.payment}</div>
            <div>
              <p className="font-semibold text-app-text/70">No payments found</p>
              <p className="text-sm text-app-text/40 mt-0.5">{search ? "Try adjusting your search." : "Record the first payment to get started."}</p>
            </div>
            {!search && <Btn variant="gold" size="sm" onClick={() => openModal()}>{IC.plus} Record Payment</Btn>}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px]">
              <thead>
                <tr className="border-b border-[#0F2044]/6 bg-app-bg/60">
                  <th className="px-5 py-3.5 text-left text-[10px] font-bold tracking-widest uppercase text-app-text/40">Student</th>
                  <th className="px-5 py-3.5 text-left text-[10px] font-bold tracking-widest uppercase text-app-text/40 hidden md:table-cell">Receipt</th>
                  <th className="px-5 py-3.5 text-left text-[10px] font-bold tracking-widest uppercase text-app-text/40 hidden sm:table-cell">Method</th>
                  <th className="px-5 py-3.5 text-left text-[10px] font-bold tracking-widest uppercase text-app-text/40 hidden lg:table-cell">Term</th>
                  <th className="px-5 py-3.5 text-left text-[10px] font-bold tracking-widest uppercase text-app-text/40 hidden lg:table-cell">Date</th>
                  <th className="px-5 py-3.5 text-right text-[10px] font-bold tracking-widest uppercase text-app-text/40">Amount</th>
                  <th className="px-5 py-3.5 text-center text-[10px] font-bold tracking-widest uppercase text-app-text/40 w-20">Again</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#0F2044]/5">
                {filtered.map(p => {
                  const student = students.find(s => s.id === p.studentId);
                  return (
                    <tr key={p.id} className="hover:bg-app-bg/60 transition-colors">
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-3">
                          <div className={`w-8 h-8 rounded-xl flex items-center justify-center text-xs font-bold flex-shrink-0 ${avatarColor(p.studentName)}`}>
                            {initials(p.studentName)}
                          </div>
                          <div>
                            <div className="text-sm font-semibold text-app-text">{p.studentName}</div>
                            <div className="text-xs text-app-text/40 font-mono">{p.className} · {p.studentCode}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3.5 hidden md:table-cell">
                        <span className="font-mono text-xs bg-app-bg text-app-text/60 px-2 py-1 rounded-lg">{p.receiptNo}</span>
                      </td>
                      <td className="px-5 py-3.5 hidden sm:table-cell">
                        <span className={`inline-flex px-2.5 py-1 rounded-lg text-xs font-semibold ${METHOD_BADGE[p.method] || "bg-gray-100 text-gray-600"}`}>
                          {p.method}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-xs text-app-text/55 hidden lg:table-cell">{p.term}</td>
                      <td className="px-5 py-3.5 text-xs text-app-text/55 hidden lg:table-cell">{p.paymentDate}</td>
                      <td className="px-5 py-3.5 text-right">
                        <span className="text-sm font-bold text-emerald-700">{fmt(p.amount)}</span>
                      </td>
                      {/* "Again" quick button: opens modal pre-selected for same student */}
                      <td className="px-5 py-3.5 text-center">
                        {student && (
                          <button
                            onClick={() => openModal(student)}
                            title="Record another payment for this student"
                            className="text-app-text/30 hover:text-[#F4B400] transition-colors"
                          >
                            {IC.plus}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-app-border bg-app-bg/80">
                  <td colSpan={5} className="px-5 py-3 text-xs font-bold text-app-text/50 uppercase tracking-wider">
                    {filtered.length} transaction{filtered.length !== 1 ? "s" : ""}
                    {filtered.length !== payments.length && ` (filtered from ${payments.length})`}
                  </td>
                  <td className="px-5 py-3 text-right font-bold text-app-text">
                    {fmt(filtered.reduce((s,p) => s+p.amount, 0))}
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* ── Record Payment Modal ─────────────────────────────────────────────── */}
      {showModal && (
        <Modal
          title="Record Payment"
          subtitle="Search for a student, then fill in payment details"
          onClose={() => setShowModal(false)}
          wide
        >
          <form onSubmit={handleRecord} className="space-y-6">

            {modalError && (
              <div className="flex items-center gap-2 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700">
                {IC.warning} {modalError}
              </div>
            )}

            {/* ── Student search ─────────────────────────────────────────── */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-app-text/50 mb-2">
                Student
              </label>
              {selectedStudent ? (
                /* Selected student card */
                <div className="flex items-center gap-3 p-4 bg-app-bg rounded-2xl border border-app-border">
                  <div className={`w-11 h-11 rounded-xl flex items-center justify-center text-sm font-bold flex-shrink-0 ${avatarColor(selectedStudent.fullName)}`}>
                    {initials(selectedStudent.fullName)}
                  </div>
                  <div className="flex-1">
                    <p className="font-bold text-app-text text-sm">{selectedStudent.fullName}</p>
                    <p className="text-xs text-app-text/50 font-mono">{selectedStudent.studentCode} · {selectedStudent.className}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] text-app-text/40 uppercase tracking-wider">Balance</p>
                    <p className={`text-base font-bold ${selectedStudent.balance > 0 ? "text-red-600" : "text-emerald-600"}`}>
                      {fmt(selectedStudent.balance)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedStudent(null)}
                    className="text-app-text/30 hover:text-app-text/70 transition-colors ml-1"
                    title="Change student"
                  >
                    {IC.close}
                  </button>
                </div>
              ) : (
                <StudentSearch
                  students={students}
                  studentFinancials={studentFinancials}
                  onSelect={setSelectedStudent}
                />
              )}
            </div>

            {/* ── Payment details (only shown after student selected) ──────── */}
            {selectedStudent && (
              <>
                <div className="grid grid-cols-2 gap-4">

                  {/* Amount */}
                  <div className="col-span-2 sm:col-span-1 flex flex-col gap-1.5">
                    <label className="text-xs font-semibold uppercase tracking-wider text-app-text/50">
                      Amount (MWK) <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-app-text/35">MWK</span>
                      <input
                        type="number" min="1" step="1"
                        value={form.amount}
                        onChange={e => { setForm(p => ({...p, amount: e.target.value})); setFormErrors(p => ({...p, amount: ""})); }}
                        className={`w-full pl-12 pr-4 py-3 text-sm rounded-xl border outline-none transition-all ${formErrors.amount ? "border-red-300 bg-red-50" : "border-app-border bg-app-bg/60 focus:border-[#0F2044]/40 focus:bg-app-surface"}`}
                        placeholder="0"
                        autoFocus
                      />
                    </div>
                    {formErrors.amount && <p className="text-xs text-red-600">{formErrors.amount}</p>}
                    {/* Suggest full balance */}
                    {selectedStudent.balance > 0 && !form.amount && (
                      <button
                        type="button"
                        onClick={() => setForm(p => ({...p, amount: String(selectedStudent.balance)}))}
                        className="text-xs text-app-text/50 hover:text-[#F4B400] transition-colors text-left"
                      >
                        Pay full balance: {fmt(selectedStudent.balance)} →
                      </button>
                    )}
                  </div>

                  {/* Method */}
                  <div className="col-span-2 sm:col-span-1 flex flex-col gap-1.5">
                    <label className="text-xs font-semibold uppercase tracking-wider text-app-text/50">
                      Method <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={form.method}
                      onChange={e => setForm(p => ({...p, method: e.target.value}))}
                      className="w-full px-3.5 py-3 text-sm rounded-xl border border-app-border bg-app-bg/60 outline-none focus:border-[#0F2044]/40 focus:bg-app-surface"
                    >
                      {PAYMENT_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                  </div>

                  {/* Term */}
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-semibold uppercase tracking-wider text-app-text/50">Term</label>
                    <select
                      value={form.term}
                      onChange={e => setForm(p => ({...p, term: e.target.value}))}
                      className="w-full px-3.5 py-3 text-sm rounded-xl border border-app-border bg-app-bg/60 outline-none focus:border-[#0F2044]/40 focus:bg-app-surface"
                    >
                      {TERMS.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>

                  {/* Date */}
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-semibold uppercase tracking-wider text-app-text/50">Date</label>
                    <input
                      type="date"
                      value={form.date}
                      onChange={e => setForm(p => ({...p, date: e.target.value}))}
                      className="w-full px-3.5 py-3 text-sm rounded-xl border border-app-border bg-app-bg/60 outline-none focus:border-[#0F2044]/40 focus:bg-app-surface"
                    />
                  </div>

                  {/* Reference */}
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-semibold uppercase tracking-wider text-app-text/50">
                      Reference / Txn No.
                    </label>
                    <input
                      value={form.referenceNo}
                      onChange={e => setForm(p => ({...p, referenceNo: e.target.value}))}
                      placeholder="Optional"
                      className="w-full px-3.5 py-3 text-sm rounded-xl border border-app-border bg-app-bg/60 outline-none focus:border-[#0F2044]/40 focus:bg-app-surface"
                    />
                  </div>

                  {/* Notes */}
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-semibold uppercase tracking-wider text-app-text/50">Notes</label>
                    <input
                      value={form.notes}
                      onChange={e => setForm(p => ({...p, notes: e.target.value}))}
                      placeholder="Optional note"
                      className="w-full px-3.5 py-3 text-sm rounded-xl border border-app-border bg-app-bg/60 outline-none focus:border-[#0F2044]/40 focus:bg-app-surface"
                    />
                  </div>
                </div>

                {/* ── Balance preview ──────────────────────────────────────── */}
                {form.amount && Number(form.amount) > 0 && (
                  <div className={`flex items-center justify-between px-4 py-3 rounded-xl text-sm border ${
                    selectedStudent.balance - Number(form.amount) <= 0
                      ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                      : "bg-app-bg border-app-border text-app-text/70"
                  }`}>
                    <span>Balance after payment</span>
                    <div className="flex items-center gap-2">
                      <span className="font-bold">
                        {fmt(Math.max(0, selectedStudent.balance - Number(form.amount)))}
                      </span>
                      {selectedStudent.balance - Number(form.amount) <= 0 && (
                        <span className="flex items-center gap-1 text-xs font-bold text-emerald-600">
                          {IC.check} Settled
                        </span>
                      )}
                    </div>
                  </div>
                )}

                {/* ── Actions ──────────────────────────────────────────────── */}
                <div className="flex gap-3 pt-1">
                  <Btn type="button" variant="ghost" className="flex-1" onClick={() => setShowModal(false)}>Cancel</Btn>
                  <Btn type="submit" variant="gold" className="flex-1" loading={actionLoading}>
                    {IC.receipt} Record & Issue Receipt
                  </Btn>
                </div>
              </>
            )}
          </form>
        </Modal>
      )}

      {/* ── Toast ───────────────────────────────────────────────────────────── */}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-[60] flex items-start gap-3 px-5 py-4 rounded-2xl shadow-xl max-w-sm text-sm font-medium
          ${toast.type === "success" ? "bg-emerald-600 text-white" : "bg-red-600 text-white"}`}>
          <span className="flex-shrink-0 mt-0.5">{toast.type === "success" ? IC.check : IC.warning}</span>
          <span className="leading-snug">{toast.message}</span>
          <button onClick={() => setToast(null)} className="flex-shrink-0 opacity-70 hover:opacity-100 ml-1 mt-0.5">{IC.close}</button>
        </div>
      )}
    </div>
  );
}