// pages/bursar/modules/StudentFees.jsx
import { useState, useEffect, useMemo, useCallback } from "react";
import { db } from "../../../firebase";
import {
  collection, query, where, getDocs, writeBatch, doc, serverTimestamp,
} from "firebase/firestore";

// ─── Icons ────────────────────────────────────────────────────────────────────
const IC = {
  search:   <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 15.803a7.5 7.5 0 0010.607 10.607z"/></svg>,
  close:    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>,
  plus:     <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15"/></svg>,
  check:    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="w-3.5 h-3.5"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5"/></svg>,
  users:    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z"/></svg>,
  info:     <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z"/></svg>,
  warning:  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"/></svg>,
  chevDown: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5"/></svg>,
  refresh:  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99"/></svg>,
};

// ─── Spinner ──────────────────────────────────────────────────────────────────
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
    <div className={`bg-white rounded-2xl shadow-2xl w-full ${wide ? "max-w-2xl" : "max-w-lg"} overflow-hidden my-auto`}>
      <div className="bg-[#0F2044] px-6 py-5 flex items-start justify-between gap-4">
        <div>
          <h3 className="text-white font-bold text-base leading-tight">{title}</h3>
          {subtitle && <p className="text-white/50 text-xs mt-0.5">{subtitle}</p>}
        </div>
        <button onClick={onClose} className="text-white/50 hover:text-white transition-colors mt-0.5 flex-shrink-0">{IC.close}</button>
      </div>
      <div className="p-6 max-h-[78vh] overflow-y-auto">{children}</div>
    </div>
  </div>
);

// ─── Button ───────────────────────────────────────────────────────────────────
const Btn = ({ children, variant = "primary", size = "md", loading, className = "", disabled, ...props }) => {
  const base = "inline-flex items-center justify-center gap-2 font-semibold rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed select-none";
  const sizes = { sm: "px-3 py-1.5 text-xs", md: "px-4 py-2.5 text-sm", lg: "px-5 py-3 text-sm" };
  const variants = {
    primary: "bg-[#0F2044] text-white hover:bg-[#162d5e] active:scale-[0.98]",
    gold:    "bg-[#F4B400] text-[#0F2044] hover:bg-[#e5a800] active:scale-[0.98]",
    ghost:   "border border-[#0F2044]/15 text-[#0F2044]/70 hover:bg-[#0F2044]/5 active:scale-[0.98]",
    danger:  "bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 active:scale-[0.98]",
  };
  return (
    <button {...props} disabled={loading || disabled} className={`${base} ${sizes[size]} ${variants[variant]} ${className}`}>
      {loading ? <Spinner /> : children}
    </button>
  );
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmt = (n) => `MWK ${Number(n || 0).toLocaleString()}`;

function initials(name = "") {
  return name.split(" ").filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join("");
}

function avatarColor(name = "") {
  const colors = [
    ["bg-blue-100 text-blue-700"],
    ["bg-violet-100 text-violet-700"],
    ["bg-emerald-100 text-emerald-700"],
    ["bg-orange-100 text-orange-700"],
    ["bg-rose-100 text-rose-700"],
    ["bg-cyan-100 text-cyan-700"],
  ];
  const idx = name.charCodeAt(0) % colors.length;
  return colors[idx][0];
}

// ─── Status Pill ──────────────────────────────────────────────────────────────
function StatusPill({ percentage, balance, totalCharged }) {
  if (totalCharged === 0)
    return <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-gray-100 text-gray-500">No Fees</span>;
  if (balance <= 0)
    return <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-emerald-100 text-emerald-700">{IC.check} Fully Paid</span>;
  if (percentage === 0)
    return <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-red-100 text-red-700">Not Paid</span>;
  return <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-amber-100 text-amber-700">{percentage}% Paid</span>;
}

// ─── Progress Bar ─────────────────────────────────────────────────────────────
function ProgressBar({ percentage }) {
  const color = percentage === 0 ? "bg-red-400" : percentage >= 100 ? "bg-emerald-500" : "bg-amber-400";
  return (
    <div className="w-full bg-[#0F2044]/8 rounded-full h-1.5 overflow-hidden">
      <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${Math.min(percentage, 100)}%` }} />
    </div>
  );
}

// ─── Summary Card ─────────────────────────────────────────────────────────────
function SummaryCard({ label, value, sub, accent }) {
  const accentMap = {
    blue:    "from-[#0F2044] to-[#1a3a7a]",
    gold:    "from-[#d4960d] to-[#F4B400]",
    red:     "from-red-600 to-red-400",
    emerald: "from-emerald-600 to-emerald-400",
  };
  return (
    <div className="bg-white rounded-2xl border border-[#0F2044]/8 p-5 flex flex-col gap-1">
      <span className="text-xs font-semibold text-[#0F2044]/40 uppercase tracking-wider">{label}</span>
      <span className={`text-xl font-bold bg-gradient-to-r ${accentMap[accent] || accentMap.blue} bg-clip-text text-transparent`}>{value}</span>
      {sub && <span className="text-xs text-[#0F2044]/40">{sub}</span>}
    </div>
  );
}

// ─── Fee Preview Table in Modal ───────────────────────────────────────────────
function FeePreviewRows({ studentIds, students, feeStructures, studentFees, assignTerm, academicYear }) {
  const previews = useMemo(() => {
    return studentIds.map(sid => {
      const student = students.find(s => s.id === sid);
      if (!student?.classId) return { student, fees: [], skipped: 0 };
      const relevant = feeStructures.filter(f => f.classId === student.classId && f.term === assignTerm);
      const newFees = relevant.filter(fee => !studentFees.some(sf => sf.studentId === sid && sf.feeStructureId === fee.id));
      const skipped = relevant.length - newFees.length;
      return { student, fees: newFees, skipped };
    });
  }, [studentIds, students, feeStructures, studentFees, assignTerm]);

  if (studentIds.length === 0) return null;

  const totalNew = previews.reduce((s, p) => s + p.fees.length, 0);
  const totalAmt = previews.reduce((s, p) => s + p.fees.reduce((a, f) => a + (f.amount || 0), 0), 0);
  const totalSkipped = previews.reduce((s, p) => s + p.skipped, 0);

  return (
    <div className="space-y-3">
      {/* Summary row */}
      <div className="flex items-center gap-3 p-3 bg-[#0F2044]/4 rounded-xl text-sm">
        <span className="font-semibold text-[#0F2044]">{totalNew} fee record(s)</span>
        <span className="text-[#0F2044]/40">·</span>
        <span className="font-bold text-[#0F2044]">{fmt(totalAmt)} total</span>
        {totalSkipped > 0 && (
          <>
            <span className="text-[#0F2044]/40">·</span>
            <span className="text-amber-600 text-xs">{totalSkipped} already assigned, skipped</span>
          </>
        )}
      </div>

      {/* Per student preview (compact when many students) */}
      {studentIds.length <= 5 && previews.map(({ student, fees, skipped }) => (
        <div key={student?.id} className="border border-[#0F2044]/10 rounded-xl overflow-hidden">
          <div className="px-4 py-2.5 bg-[#F7F5F0] flex items-center justify-between">
            <span className="text-xs font-bold text-[#0F2044]">{student?.fullName}</span>
            {skipped > 0 && <span className="text-xs text-amber-600">{skipped} skipped</span>}
          </div>
          {fees.length === 0 ? (
            <div className="px-4 py-2 text-xs text-[#0F2044]/40">All fees already assigned.</div>
          ) : (
            <table className="w-full text-xs">
              <tbody>
                {fees.map(fee => (
                  <tr key={fee.id} className="border-t border-[#0F2044]/5">
                    <td className="px-4 py-2 text-[#0F2044]/70">{fee.name}</td>
                    <td className="px-4 py-2 text-[#0F2044]/50">{fee.category}</td>
                    <td className="px-4 py-2 text-right font-semibold text-[#0F2044]">{fmt(fee.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ))}

      {studentIds.length > 5 && (
        <p className="text-xs text-[#0F2044]/50 text-center py-2">
          Preview hidden for bulk ({studentIds.length} students). Fees will be applied based on each student's class.
        </p>
      )}
    </div>
  );
}

// ─── Constants ────────────────────────────────────────────────────────────────
const TERMS = ["Term 1", "Term 2", "Term 3", "Full Year"];
const ACADEMIC_YEARS = ["2024/2025", "2025/2026", "2026/2027"];

// ═════════════════════════════════════════════════════════════════════════════
export default function StudentFees({ schoolCode, schoolName }) {
  // ── Data state ─────────────────────────────────────────────────────────────
  const [students,     setStudents]     = useState([]);
  const [classes,      setClasses]      = useState([]);
  const [feeStructures,setFeeStructures]= useState([]);
  const [studentFees,  setStudentFees]  = useState([]);
  const [payments,     setPayments]     = useState([]);
  const [loading,      setLoading]      = useState(true);

  // ── UI state ───────────────────────────────────────────────────────────────
  const [search,       setSearch]       = useState("");
  const [classFilter,  setClassFilter]  = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");   // all | paid | partial | unpaid | none
  const [academicYear, setAcademicYear] = useState("2025/2026");
  const [sortKey,      setSortKey]      = useState("name");  // name | balance | percentage

  // ── Selection ──────────────────────────────────────────────────────────────
  const [selectedIds,  setSelectedIds]  = useState(new Set());

  // ── Modal state ────────────────────────────────────────────────────────────
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [assignTerm,      setAssignTerm]      = useState("Term 1");
  // bulkMode: "all" = all filtered students, "selected" = only selectedIds
  const [bulkMode,        setBulkMode]        = useState("all");

  // ── Action state ───────────────────────────────────────────────────────────
  const [actionLoading, setActionLoading] = useState(false);
  const [toast,         setToast]         = useState(null); // { type: "success"|"error", message }

  // ── Fetch all data ─────────────────────────────────────────────────────────
  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [stSnap, clSnap, fsSnap, faSnap, pySnap] = await Promise.all([
        getDocs(query(collection(db, "students"),       where("schoolCode",  "==", schoolCode))),
        getDocs(query(collection(db, "school_classes"), where("schoolCode",  "==", schoolCode))),
        getDocs(query(collection(db, "fee_structures"), where("schoolCode",  "==", schoolCode), where("academicYear", "==", academicYear))),
        getDocs(query(collection(db, "fee_assignments"),where("schoolCode",  "==", schoolCode), where("academicYear", "==", academicYear))),
        getDocs(query(collection(db, "payments"),       where("schoolCode",  "==", schoolCode), where("academicYear", "==", academicYear))),
      ]);

      setStudents(    stSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      setClasses(     clSnap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (a.order ?? 0) - (b.order ?? 0)));
      setFeeStructures(fsSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      setStudentFees( faSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      setPayments(    pySnap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) {
      showToast("error", "Failed to load data. Please refresh.");
      console.error(e);
    }
    setLoading(false);
  }, [schoolCode, academicYear]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // ── Toast helper ───────────────────────────────────────────────────────────
  function showToast(type, message) {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4500);
  }

  // ── Financials per student ─────────────────────────────────────────────────
  function getFinancials(studentId) {
    const assigned     = studentFees.filter(fa => fa.studentId === studentId);
    const totalCharged = assigned.reduce((s, fa) => s + (fa.amount || 0), 0);
    const totalPaid    = payments.filter(p => p.studentId === studentId).reduce((s, p) => s + (p.amount || 0), 0);
    const balance      = totalCharged - totalPaid;
    const percentage   = totalCharged > 0 ? Math.round((totalPaid / totalCharged) * 100) : 0;
    return { totalCharged, totalPaid, balance, percentage, assignedTerms: [...new Set(assigned.map(a => a.term))] };
  }

  // ── Enriched + filtered student list ──────────────────────────────────────
  const enriched = useMemo(() =>
    students.map(s => ({ ...s, ...getFinancials(s.id) })),
    [students, studentFees, payments]
  );

  const filtered = useMemo(() => {
    let list = enriched.filter(s => {
      const matchSearch  = !search || s.fullName?.toLowerCase().includes(search.toLowerCase()) || s.studentCode?.toLowerCase().includes(search.toLowerCase());
      const matchClass   = classFilter === "all" || s.classId === classFilter;
      const matchStatus  = statusFilter === "all"
        || (statusFilter === "paid"    && s.totalCharged > 0 && s.balance <= 0)
        || (statusFilter === "partial" && s.percentage > 0 && s.balance > 0)
        || (statusFilter === "unpaid"  && s.totalCharged > 0 && s.percentage === 0)
        || (statusFilter === "none"    && s.totalCharged === 0);
      return matchSearch && matchClass && matchStatus;
    });

    list.sort((a, b) => {
      if (sortKey === "balance")     return b.balance - a.balance;
      if (sortKey === "percentage")  return a.percentage - b.percentage;
      return (a.fullName || "").localeCompare(b.fullName || "");
    });

    return list;
  }, [enriched, search, classFilter, statusFilter, sortKey]);

  // ── Summary stats ──────────────────────────────────────────────────────────
  const summary = useMemo(() => {
    const totalCharged = enriched.reduce((s, x) => s + x.totalCharged, 0);
    const totalPaid    = enriched.reduce((s, x) => s + x.totalPaid, 0);
    const outstanding  = enriched.reduce((s, x) => s + Math.max(x.balance, 0), 0);
    const fullyPaid    = enriched.filter(x => x.totalCharged > 0 && x.balance <= 0).length;
    return { totalCharged, totalPaid, outstanding, fullyPaid, total: enriched.length };
  }, [enriched]);

  // ── Selection helpers ──────────────────────────────────────────────────────
  const allFilteredSelected = filtered.length > 0 && filtered.every(s => selectedIds.has(s.id));
  const someSelected = selectedIds.size > 0;

  function toggleAll() {
    if (allFilteredSelected) {
      setSelectedIds(prev => { const n = new Set(prev); filtered.forEach(s => n.delete(s.id)); return n; });
    } else {
      setSelectedIds(prev => { const n = new Set(prev); filtered.forEach(s => n.add(s.id)); return n; });
    }
  }

  function toggleOne(id) {
    setSelectedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  // ── Open assign modal ──────────────────────────────────────────────────────
  // Always opens in bulk mode — targets selected students if any, otherwise all filtered
  function openAssignModal() {
    setBulkMode(someSelected ? "selected" : "all");
    setAssignTerm("Term 1");
    setShowAssignModal(true);
  }

  // ── Modal targets ──────────────────────────────────────────────────────────
  // Derived from bulkMode: "selected" uses selectedIds, "all" uses all filtered students
  const modalStudentIds = useMemo(() => {
    if (!showAssignModal) return [];
    return bulkMode === "selected"
      ? [...selectedIds]
      : filtered.map(s => s.id);
  }, [showAssignModal, bulkMode, selectedIds, filtered]);

  // ── Assign term (bulk) ─────────────────────────────────────────────────────
  async function handleAssignTerm() {
    if (modalStudentIds.length === 0 || !assignTerm) return;

    setActionLoading(true);
    try {
      const batch = writeBatch(db);
      let assigned = 0;
      let skipped  = 0;

      for (const studentId of modalStudentIds) {
        const student = students.find(s => s.id === studentId);
        if (!student?.classId) continue;

        const relevantFees = feeStructures.filter(f =>
          f.classId === student.classId && f.term === assignTerm
        );

        for (const fee of relevantFees) {
          const alreadyAssigned = studentFees.some(sf =>
            sf.studentId === studentId && sf.feeStructureId === fee.id
          );
          if (alreadyAssigned) { skipped++; continue; }

          const ref = doc(collection(db, "fee_assignments"));
          batch.set(ref, {
            studentId:       student.id,
            studentName:     student.fullName,
            studentCode:     student.studentCode,
            classId:         student.classId,
            className:       student.className,
            feeStructureId:  fee.id,
            feeName:         fee.name,
            category:        fee.category || "",
            amount:          fee.amount,
            term:            assignTerm,
            academicYear,
            schoolCode,
            createdAt:       serverTimestamp(),
          });
          assigned++;
        }
      }

      await batch.commit();

      const msg = assigned > 0
        ? `${assignTerm} assigned — ${assigned} fee record(s) created for ${modalStudentIds.length} student(s).${skipped > 0 ? ` ${skipped} already existed.` : ""}`
        : `No new fees to assign. ${skipped > 0 ? `${skipped} were already assigned.` : "Check that fee structures exist for this term and class."}`;

      showToast(assigned > 0 ? "success" : "error", msg);
      setShowAssignModal(false);
      setSelectedIds(new Set());
      await fetchAll();
    } catch (err) {
      showToast("error", "Failed to assign fees: " + err.message);
      console.error(err);
    }
    setActionLoading(false);
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-[#0F2044] tracking-tight">Student Fee Enrollment</h2>
          <p className="text-sm text-[#0F2044]/50 mt-0.5">Assign a term to automatically apply fee structures to students.</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={academicYear}
            onChange={e => setAcademicYear(e.target.value)}
            className="px-3.5 py-2.5 text-sm rounded-xl border border-[#0F2044]/10 bg-white outline-none focus:ring-2 focus:ring-[#0F2044]/20"
          >
            {ACADEMIC_YEARS.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <Btn variant="ghost" size="md" onClick={fetchAll} loading={loading} title="Refresh data">
            {IC.refresh}
          </Btn>
        </div>
      </div>

      {/* ── Summary Cards ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <SummaryCard label="Total Charged"  value={fmt(summary.totalCharged)}  accent="blue"    sub={`${summary.total} students`} />
        <SummaryCard label="Total Collected" value={fmt(summary.totalPaid)}    accent="emerald" sub="All payments" />
        <SummaryCard label="Outstanding"     value={fmt(summary.outstanding)}  accent="red"     sub="Remaining balance" />
        <SummaryCard label="Fully Paid"      value={`${summary.fullyPaid}`}    accent="gold"    sub={`of ${summary.total} students`} />
      </div>

      {/* ── Filters & Bulk Action Bar ───────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
        <div className="relative flex-1 min-w-0">
          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#0F2044]/30">{IC.search}</span>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by name or code…"
            className="w-full pl-10 pr-4 py-2.5 text-sm rounded-xl border border-[#0F2044]/10 bg-white outline-none focus:ring-2 focus:ring-[#0F2044]/20"
          />
          {search && (
            <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#0F2044]/30 hover:text-[#0F2044]/70">
              {IC.close}
            </button>
          )}
        </div>

        <select
          value={classFilter}
          onChange={e => setClassFilter(e.target.value)}
          className="px-3.5 py-2.5 text-sm rounded-xl border border-[#0F2044]/10 bg-white outline-none focus:ring-2 focus:ring-[#0F2044]/20"
        >
          <option value="all">All Classes</option>
          {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>

        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className="px-3.5 py-2.5 text-sm rounded-xl border border-[#0F2044]/10 bg-white outline-none focus:ring-2 focus:ring-[#0F2044]/20"
        >
          <option value="all">All Statuses</option>
          <option value="paid">Fully Paid</option>
          <option value="partial">Partial</option>
          <option value="unpaid">Not Paid</option>
          <option value="none">No Fees</option>
        </select>

        <select
          value={sortKey}
          onChange={e => setSortKey(e.target.value)}
          className="px-3.5 py-2.5 text-sm rounded-xl border border-[#0F2044]/10 bg-white outline-none focus:ring-2 focus:ring-[#0F2044]/20"
        >
          <option value="name">Sort: Name</option>
          <option value="balance">Sort: Balance ↓</option>
          <option value="percentage">Sort: % Paid ↑</option>
        </select>

        {/* Primary assign button — always visible, targets selected or all */}
        <Btn variant="gold" size="md" onClick={openAssignModal} disabled={filtered.length === 0}>
          {IC.users}
          {someSelected ? `Assign Term (${selectedIds.size} selected)` : `Assign Term (All ${filtered.length})`}
        </Btn>
      </div>

      {/* ── Student Table ───────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-[#0F2044]/8 overflow-hidden">
        {loading ? (
          <div className="p-16 flex flex-col items-center justify-center gap-3 text-[#0F2044]/40">
            <Spinner size="lg" />
            <span className="text-sm">Loading student records…</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-16 flex flex-col items-center justify-center gap-2 text-center">
            <div className="w-12 h-12 rounded-2xl bg-[#0F2044]/5 flex items-center justify-center text-[#0F2044]/30 mb-1">
              {IC.info}
            </div>
            <p className="font-semibold text-[#0F2044]/60">No students found</p>
            <p className="text-sm text-[#0F2044]/35">Try adjusting your search or filters.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px]">
              <thead>
                <tr className="border-b border-[#0F2044]/6 bg-[#F7F5F0]/60">
                  <th className="px-5 py-3.5 w-10">
                    <input
                      type="checkbox"
                      checked={allFilteredSelected}
                      onChange={toggleAll}
                      className="rounded border-[#0F2044]/30 accent-[#0F2044] cursor-pointer"
                    />
                  </th>
                  <th className="px-4 py-3.5 text-left text-xs font-bold uppercase tracking-wider text-[#0F2044]/40">Student</th>
                  <th className="px-4 py-3.5 text-left text-xs font-bold uppercase tracking-wider text-[#0F2044]/40 hidden md:table-cell">Class</th>
                  <th className="px-4 py-3.5 text-left text-xs font-bold uppercase tracking-wider text-[#0F2044]/40 hidden lg:table-cell">Terms Assigned</th>
                  <th className="px-4 py-3.5 text-right text-xs font-bold uppercase tracking-wider text-[#0F2044]/40">Charged</th>
                  <th className="px-4 py-3.5 text-right text-xs font-bold uppercase tracking-wider text-[#0F2044]/40">Paid</th>
                  <th className="px-4 py-3.5 text-right text-xs font-bold uppercase tracking-wider text-[#0F2044]/40">Balance</th>
                  <th className="px-4 py-3.5 text-center text-xs font-bold uppercase tracking-wider text-[#0F2044]/40">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#0F2044]/5">
                {filtered.map(s => {
                  const isSelected = selectedIds.has(s.id);
                  const hasAssignment = s.assignedTerms.length > 0;

                  return (
                    <tr
                      key={s.id}
                      className={`transition-colors ${isSelected ? "bg-[#0F2044]/3" : "hover:bg-[#F7F5F0]/60"}`}
                    >
                      {/* Checkbox */}
                      <td className="px-5 py-4 w-10">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleOne(s.id)}
                          className="rounded border-[#0F2044]/30 accent-[#0F2044] cursor-pointer"
                        />
                      </td>

                      {/* Student */}
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-3">
                          <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-sm font-bold flex-shrink-0 ${avatarColor(s.fullName)}`}>
                            {initials(s.fullName)}
                          </div>
                          <div>
                            <div className="font-semibold text-[#0F2044] text-sm leading-tight">{s.fullName}</div>
                            <div className="text-xs text-[#0F2044]/45 font-mono">{s.studentCode}</div>
                          </div>
                        </div>
                      </td>

                      {/* Class */}
                      <td className="px-4 py-4 text-sm text-[#0F2044]/55 hidden md:table-cell">
                        {s.className || <span className="text-[#0F2044]/25">—</span>}
                      </td>

                      {/* Terms Assigned */}
                      <td className="px-4 py-4 hidden lg:table-cell">
                        <div className="flex flex-wrap gap-1">
                          {s.assignedTerms.length === 0
                            ? <span className="text-xs text-[#0F2044]/25">None</span>
                            : s.assignedTerms.map(t => (
                                <span key={t} className="px-2 py-0.5 rounded-md bg-[#0F2044]/8 text-[#0F2044]/60 text-xs font-medium">{t}</span>
                              ))
                          }
                        </div>
                      </td>

                      {/* Financials */}
                      <td className="px-4 py-4 text-right">
                        <span className="text-sm font-medium text-[#0F2044]/70">{fmt(s.totalCharged)}</span>
                      </td>
                      <td className="px-4 py-4 text-right">
                        <span className="text-sm font-semibold text-emerald-600">{fmt(s.totalPaid)}</span>
                      </td>
                      <td className="px-4 py-4 text-right">
                        <span className={`text-sm font-bold ${s.balance > 0 ? "text-red-600" : "text-emerald-600"}`}>
                          {fmt(s.balance)}
                        </span>
                      </td>

                      {/* Status — replaces the old Action column */}
                      <td className="px-4 py-4">
                        <div className="flex flex-col items-center gap-1.5">
                          <StatusPill balance={s.balance} percentage={s.percentage} totalCharged={s.totalCharged} />
                          {s.totalCharged > 0 && <ProgressBar percentage={s.percentage} />}
                          {/* Show a subtle "assigned" indicator instead of an action button */}
                          {hasAssignment && (
                            <span className="inline-flex items-center gap-1 text-xs text-[#0F2044]/35 font-medium mt-0.5">
                              {IC.check} Enrolled
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Table footer */}
        {!loading && filtered.length > 0 && (
          <div className="px-5 py-3 border-t border-[#0F2044]/5 flex items-center justify-between text-xs text-[#0F2044]/40">
            <span>
              Showing {filtered.length} of {enriched.length} student{enriched.length !== 1 ? "s" : ""}
              {someSelected && <span className="ml-2 text-[#0F2044]/60 font-semibold">· {selectedIds.size} selected</span>}
            </span>
            {someSelected && (
              <button onClick={() => setSelectedIds(new Set())} className="text-[#0F2044]/50 hover:text-[#0F2044] transition-colors">
                Clear selection
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── Assign Term Modal ───────────────────────────────────────────────── */}
      {showAssignModal && (
        <Modal
          title={
            bulkMode === "selected"
              ? `Assign Term to ${selectedIds.size} Selected Student${selectedIds.size !== 1 ? "s" : ""}`
              : `Assign Term to All ${filtered.length} Student${filtered.length !== 1 ? "s" : ""}`
          }
          subtitle={
            bulkMode === "selected"
              ? "Fee structures will be auto-applied per class"
              : classFilter !== "all"
                ? `Filtered to: ${classes.find(c => c.id === classFilter)?.name ?? "selected class"}`
                : "Fee structures will be auto-applied per class"
          }
          onClose={() => setShowAssignModal(false)}
          wide
        >
          <div className="space-y-6">

            {/* Scope toggle — switch between all-filtered and selected-only */}
            {someSelected && (
              <div className="flex items-center gap-2 p-3 bg-[#0F2044]/4 rounded-xl text-sm">
                <span className="text-[#0F2044]/60 text-xs font-semibold uppercase tracking-wide mr-1">Apply to:</span>
                <button
                  onClick={() => setBulkMode("all")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${bulkMode === "all" ? "bg-[#0F2044] text-white" : "text-[#0F2044]/60 hover:bg-[#0F2044]/10"}`}
                >
                  All {filtered.length} shown
                </button>
                <button
                  onClick={() => setBulkMode("selected")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${bulkMode === "selected" ? "bg-[#0F2044] text-white" : "text-[#0F2044]/60 hover:bg-[#0F2044]/10"}`}
                >
                  {selectedIds.size} selected only
                </button>
              </div>
            )}

            {/* Term selector */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-[#0F2044]/50 mb-2">
                Select Term to Assign
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {TERMS.map(t => (
                  <button
                    key={t}
                    onClick={() => setAssignTerm(t)}
                    className={`py-2.5 text-sm font-semibold rounded-xl border transition-all ${
                      assignTerm === t
                        ? "bg-[#0F2044] text-white border-[#0F2044]"
                        : "border-[#0F2044]/15 text-[#0F2044]/60 hover:bg-[#0F2044]/5"
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            {/* Fee preview */}
            {modalStudentIds.length > 0 && (
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-[#0F2044]/50 mb-2">
                  Fee Preview — {assignTerm}
                </label>
                <FeePreviewRows
                  studentIds={modalStudentIds}
                  students={students}
                  feeStructures={feeStructures}
                  studentFees={studentFees}
                  assignTerm={assignTerm}
                  academicYear={academicYear}
                />
              </div>
            )}

            {/* Info note */}
            <div className="flex items-start gap-3 p-3.5 bg-blue-50 border border-blue-100 rounded-xl text-xs text-blue-700">
              <span className="mt-0.5 flex-shrink-0">{IC.info}</span>
              <span>
                Only new fee records will be created. If a student already has a fee assigned for this term from a matching fee structure, it will be skipped to avoid duplicates.
              </span>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-3 pt-1">
              <Btn variant="ghost" size="md" onClick={() => setShowAssignModal(false)} className="flex-1">
                Cancel
              </Btn>
              <Btn variant="gold" size="md" loading={actionLoading} onClick={handleAssignTerm} className="flex-1">
                {IC.check} Confirm & Assign {assignTerm}
              </Btn>
            </div>
          </div>
        </Modal>
      )}

      {/* ── Toast Notification ──────────────────────────────────────────────── */}
      {toast && (
        <div
          className={`fixed bottom-6 right-6 z-[60] flex items-start gap-3 px-5 py-4 rounded-2xl shadow-xl max-w-sm text-sm font-medium transition-all
            ${toast.type === "success" ? "bg-emerald-600 text-white" : "bg-red-600 text-white"}`}
        >
          <span className="flex-shrink-0 mt-0.5">
            {toast.type === "success" ? IC.check : IC.warning}
          </span>
          <span className="leading-snug">{toast.message}</span>
          <button onClick={() => setToast(null)} className="flex-shrink-0 opacity-70 hover:opacity-100 ml-1 mt-0.5">
            {IC.close}
          </button>
        </div>
      )}
    </div>
  );
}