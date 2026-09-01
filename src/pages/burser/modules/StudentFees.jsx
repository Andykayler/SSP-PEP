// pages/bursar/modules/StudentFees.jsx
import { useState, useEffect, useMemo, useCallback } from "react";
import { db } from "../../../firebase";
import {
  collection, query, where, getDocs, writeBatch, doc, serverTimestamp,
} from "firebase/firestore";
import {
  Search, X, Check, Users, Info, AlertTriangle, RefreshCw,
  GraduationCap, Wallet, AlertCircle, CheckCircle2,
} from "lucide-react";
import "./staff-management.css";

// ─── Shared Modal (aligned with FeeStructure) ─────────────────────────────────
const Modal = ({ title, subtitle, onClose, children, wide = false }) => (
  <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
    <div className={`modal-container ${wide ? "modal-container--wide" : ""}`}>
      <div className="modal-header">
        <div>
          <h3>{title}</h3>
          {subtitle && <p>{subtitle}</p>}
        </div>
        <button onClick={onClose} className="modal-close"><X size={18} /></button>
      </div>
      <div className="modal-body">{children}</div>
    </div>
  </div>
);

// ─── Button (using design system) ───────────────────────────────────────────
const Btn = ({ children, variant = "accent", size = "md", loading, className = "", ...props }) => (
  <button
    {...props}
    disabled={loading || props.disabled}
    className={`btn btn--${variant} ${size === "sm" ? "btn--sm" : ""} ${className}`}
  >
    {loading ? <RefreshCw size={14} className="spin" /> : children}
  </button>
);

// ─── Helpers ────────────────────────────────────────────────────────────────
const fmt = (n) => `MWK ${Number(n || 0).toLocaleString()}`;

function initials(name = "") {
  return name.split(" ").filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join("");
}

// ─── Status Pill ────────────────────────────────────────────────────────────
function StatusPill({ percentage, balance, totalCharged }) {
  if (totalCharged === 0)
    return <span className="status-pill">No Fees</span>;
  if (balance <= 0)
    return (
      <span className="status-pill status-pill--success">
        <Check size={12} /> Fully Paid
      </span>
    );
  if (percentage === 0)
    return <span className="status-pill status-pill--danger">Not Paid</span>;
  return <span className="status-pill status-pill--warning">{percentage}% Paid</span>;
}

// ─── Progress Bar ───────────────────────────────────────────────────────────
function ProgressBar({ percentage }) {
  const fillClass = percentage === 0
    ? "progress-bar__fill--danger"
    : percentage >= 100
      ? "progress-bar__fill--success"
      : "progress-bar__fill--warning";
  return (
    <div className="progress-bar">
      <div className={`progress-bar__fill ${fillClass}`} style={{ width: `${Math.min(percentage, 100)}%` }} />
    </div>
  );
}

// ─── Summary Card ───────────────────────────────────────────────────────────
function SummaryCard({ label, value, sub, accent = "blue" }) {
  const icons = {
    blue: { Icon: GraduationCap, className: "stat-card__value--accent" },
    emerald: { Icon: Wallet, className: "stat-card__value--success" },
    red: { Icon: AlertCircle, className: "stat-card__value--danger" },
    gold: { Icon: CheckCircle2, className: "stat-card__value--warning" },
  };
  const { Icon, className } = icons[accent] || icons.blue;

  return (
    <div className="stat-card">
      <div className={className}>
        <Icon size={22} />
      </div>
      <div className="stat-card__label">{label}</div>
      <div className="stat-card__value">{value}</div>
      {sub && <div className="stat-card__sub">{sub}</div>}
    </div>
  );
}

// ─── Fee Preview in Modal ───────────────────────────────────────────────────
function FeePreviewRows({ studentIds, students, feeStructures, studentFees, assignTerm }) {
  const previews = useMemo(() => {
    return studentIds.map((sid) => {
      const student = students.find((s) => s.id === sid);
      if (!student?.classId) return { student, fees: [], skipped: 0 };
      const relevant = feeStructures.filter((f) => f.classId === student.classId && f.term === assignTerm);
      const newFees = relevant.filter((fee) => !studentFees.some((sf) => sf.studentId === sid && sf.feeStructureId === fee.id));
      const skipped = relevant.length - newFees.length;
      return { student, fees: newFees, skipped };
    });
  }, [studentIds, students, feeStructures, studentFees, assignTerm]);

  if (studentIds.length === 0) return null;

  const totalNew = previews.reduce((s, p) => s + p.fees.length, 0);
  const totalAmt = previews.reduce((s, p) => s + p.fees.reduce((a, f) => a + (f.amount || 0), 0), 0);
  const totalSkipped = previews.reduce((s, p) => s + p.skipped, 0);

  return (
    <div className="space-y-4">
      <div className="alert alert--info">
        <Info size={18} />
        <div className="flex-between flex-wrap" style={{ flex: 1 }}>
          <span className="font-semibold">{totalNew} new fee record(s)</span>
          <span className="font-bold">{fmt(totalAmt)}</span>
          {totalSkipped > 0 && <span className="text-warning">{totalSkipped} skipped (already assigned)</span>}
        </div>
      </div>

      {studentIds.length <= 6 && previews.map(({ student, fees, skipped }) => (
        <div key={student?.id} className="card">
          <div className="assignment-card__header">
            <div className="font-semibold">{student?.fullName}</div>
            {skipped > 0 && <span className="text-warning">{skipped} skipped</span>}
          </div>
          {fees.length === 0 ? (
            <div className="empty-assignments">All fees already assigned for this term.</div>
          ) : (
            <div className="data-table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Fee</th>
                    <th>Category</th>
                    <th className="text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {fees.map((fee) => (
                    <tr key={fee.id}>
                      <td>{fee.name}</td>
                      <td><span className="tag">{fee.category}</span></td>
                      <td className="text-right font-semibold">{fmt(fee.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ))}

      {studentIds.length > 6 && (
        <p className="empty-assignments">
          Bulk preview hidden ({studentIds.length} students). Fees applied per class.
        </p>
      )}
    </div>
  );
}

// ─── Skeletons (aligned with FeeStructure) ──────────────────────────────────
function SkeletonSummaryCards() {
  return (
    <div className="stats-grid">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="stat-card">
          <div className="skeleton-block" style={{ width: "75%", height: 12, marginBottom: 12 }} />
          <div className="skeleton-block" style={{ width: "66%", height: 32, marginBottom: 8 }} />
          <div className="skeleton-block" style={{ width: "50%", height: 12 }} />
        </div>
      ))}
    </div>
  );
}

function SkeletonFilterBar() {
  return (
    <div className="filter-bar">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="skeleton-block" style={{ height: 44, flex: 1, borderRadius: "var(--radius-lg)" }} />
      ))}
    </div>
  );
}

function SkeletonStudentTable({ rows = 6 }) {
  return (
    <div className="card">
      <div className="data-table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              {Array.from({ length: 8 }).map((_, i) => (
                <th key={i}><div className="skeleton-block" style={{ height: 12, width: 80 }} /></th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: rows }).map((_, i) => (
              <tr key={i}>
                {Array.from({ length: 8 }).map((_, j) => (
                  <td key={j}><div className="skeleton-block" style={{ height: 20 }} /></td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Constants ──────────────────────────────────────────────────────────────
const TERMS = ["Term 1", "Term 2", "Term 3", "Full Year"];
const ACADEMIC_YEARS = ["2024/2025", "2025/2026", "2026/2027"];

// ═════════════════════════════════════════════════════════════════════════════
export default function StudentFees({ schoolCode, schoolName }) {
  const [students, setStudents] = useState([]);
  const [classes, setClasses] = useState([]);
  const [feeStructures, setFeeStructures] = useState([]);
  const [studentFees, setStudentFees] = useState([]);
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState("");
  const [classFilter, setClassFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [academicYear, setAcademicYear] = useState("2025/2026");
  const [sortKey, setSortKey] = useState("name");

  const [selectedIds, setSelectedIds] = useState(new Set());

  const [showAssignModal, setShowAssignModal] = useState(false);
  const [assignTerm, setAssignTerm] = useState("Term 1");
  const [bulkMode, setBulkMode] = useState("all");

  const [actionLoading, setActionLoading] = useState(false);
  const [toast, setToast] = useState(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [stSnap, clSnap, fsSnap, faSnap, pySnap] = await Promise.all([
        getDocs(query(collection(db, "students"), where("schoolCode", "==", schoolCode))),
        getDocs(query(collection(db, "school_classes"), where("schoolCode", "==", schoolCode))),
        getDocs(query(collection(db, "fee_structures"), where("schoolCode", "==", schoolCode), where("academicYear", "==", academicYear))),
        getDocs(query(collection(db, "fee_assignments"), where("schoolCode", "==", schoolCode), where("academicYear", "==", academicYear))),
        getDocs(query(collection(db, "payments"), where("schoolCode", "==", schoolCode), where("academicYear", "==", academicYear))),
      ]);

      setStudents(stSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setClasses(clSnap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (a.order ?? 0) - (b.order ?? 0)));
      setFeeStructures(fsSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setStudentFees(faSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setPayments(pySnap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (e) {
      showToast("error", "Failed to load data.");
      console.error(e);
    }
    setLoading(false);
  }, [schoolCode, academicYear]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  function showToast(type, message) {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4500);
  }

  function getFinancials(studentId) {
    const assigned = studentFees.filter((fa) => fa.studentId === studentId);
    const totalCharged = assigned.reduce((s, fa) => s + (fa.amount || 0), 0);
    const totalPaid = payments.filter((p) => p.studentId === studentId).reduce((s, p) => s + (p.amount || 0), 0);
    const balance = totalCharged - totalPaid;
    const percentage = totalCharged > 0 ? Math.round((totalPaid / totalCharged) * 100) : 0;
    return { totalCharged, totalPaid, balance, percentage, assignedTerms: [...new Set(assigned.map((a) => a.term))] };
  }

  const enriched = useMemo(() => students.map((s) => ({ ...s, ...getFinancials(s.id) })), [students, studentFees, payments]);

  const filtered = useMemo(() => {
    let list = enriched.filter((s) => {
      const matchSearch = !search ||
        s.fullName?.toLowerCase().includes(search.toLowerCase()) ||
        s.studentCode?.toLowerCase().includes(search.toLowerCase());
      const matchClass = classFilter === "all" || s.classId === classFilter;
      const matchStatus = statusFilter === "all" ||
        (statusFilter === "paid" && s.totalCharged > 0 && s.balance <= 0) ||
        (statusFilter === "partial" && s.percentage > 0 && s.balance > 0) ||
        (statusFilter === "unpaid" && s.totalCharged > 0 && s.percentage === 0) ||
        (statusFilter === "none" && s.totalCharged === 0);
      return matchSearch && matchClass && matchStatus;
    });

    list.sort((a, b) => {
      if (sortKey === "balance") return b.balance - a.balance;
      if (sortKey === "percentage") return a.percentage - b.percentage;
      return (a.fullName || "").localeCompare(b.fullName || "");
    });

    return list;
  }, [enriched, search, classFilter, statusFilter, sortKey]);

  const summary = useMemo(() => {
    const totalCharged = enriched.reduce((s, x) => s + x.totalCharged, 0);
    const totalPaid = enriched.reduce((s, x) => s + x.totalPaid, 0);
    const outstanding = enriched.reduce((s, x) => s + Math.max(x.balance, 0), 0);
    const fullyPaid = enriched.filter((x) => x.totalCharged > 0 && x.balance <= 0).length;
    return { totalCharged, totalPaid, outstanding, fullyPaid, total: enriched.length };
  }, [enriched]);

  const allFilteredSelected = filtered.length > 0 && filtered.every((s) => selectedIds.has(s.id));
  const someSelected = selectedIds.size > 0;

  function toggleAll() {
    if (allFilteredSelected) {
      setSelectedIds((prev) => { const n = new Set(prev); filtered.forEach((s) => n.delete(s.id)); return n; });
    } else {
      setSelectedIds((prev) => { const n = new Set(prev); filtered.forEach((s) => n.add(s.id)); return n; });
    }
  }

  function toggleOne(id) {
    setSelectedIds((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  function openAssignModal() {
    setBulkMode(someSelected ? "selected" : "all");
    setAssignTerm("Term 1");
    setShowAssignModal(true);
  }

  const modalStudentIds = useMemo(() => {
    if (!showAssignModal) return [];
    return bulkMode === "selected" ? [...selectedIds] : filtered.map((s) => s.id);
  }, [showAssignModal, bulkMode, selectedIds, filtered]);

  async function handleAssignTerm() {
    if (modalStudentIds.length === 0 || !assignTerm) return;

    setActionLoading(true);
    try {
      const batch = writeBatch(db);
      let assigned = 0;
      let skipped = 0;

      for (const studentId of modalStudentIds) {
        const student = students.find((s) => s.id === studentId);
        if (!student?.classId) continue;

        const relevantFees = feeStructures.filter((f) => f.classId === student.classId && f.term === assignTerm);

        for (const fee of relevantFees) {
          const alreadyAssigned = studentFees.some((sf) => sf.studentId === studentId && sf.feeStructureId === fee.id);
          if (alreadyAssigned) { skipped++; continue; }

          const ref = doc(collection(db, "fee_assignments"));
          batch.set(ref, {
            studentId: student.id,
            studentName: student.fullName,
            studentCode: student.studentCode,
            classId: student.classId,
            className: student.className,
            feeStructureId: fee.id,
            feeName: fee.name,
            category: fee.category || "",
            amount: fee.amount,
            term: assignTerm,
            academicYear,
            schoolCode,
            createdAt: serverTimestamp(),
          });
          assigned++;
        }
      }

      await batch.commit();

      const msg = assigned > 0
        ? `${assignTerm} fees assigned to ${modalStudentIds.length} student(s).`
        : "No new fees assigned.";

      showToast(assigned > 0 ? "success" : "error", msg);
      setShowAssignModal(false);
      setSelectedIds(new Set());
      await fetchAll();
    } catch (err) {
      showToast("error", "Failed to assign fees.");
      console.error(err);
    }
    setActionLoading(false);
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex-between flex-wrap">
        <div>
          <h2>Student Fee Enrollment</h2>
          <p className="text-muted">Assign terms and track fee status across all students.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <select
            value={academicYear}
            onChange={(e) => setAcademicYear(e.target.value)}
            className="form-input form-input--compact"
          >
            {ACADEMIC_YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
          <Btn variant="secondary" onClick={fetchAll} loading={loading}>
            <RefreshCw size={16} />
          </Btn>
        </div>
      </div>

      {loading ? (
        <>
          <SkeletonSummaryCards />
          <SkeletonFilterBar />
          <SkeletonStudentTable />
        </>
      ) : (
        <>
          {/* Summary Cards */}
          <div className="stats-grid">
            <SummaryCard label="Total Charged" value={fmt(summary.totalCharged)} accent="blue" sub={`${summary.total} students`} />
            <SummaryCard label="Total Collected" value={fmt(summary.totalPaid)} accent="emerald" />
            <SummaryCard label="Outstanding" value={fmt(summary.outstanding)} accent="red" />
            <SummaryCard label="Fully Paid" value={summary.fullyPaid} accent="gold" sub={`of ${summary.total}`} />
          </div>

          {/* Filter Bar */}
          <div className="filter-bar">
            <div className="search-wrapper flex-1">
              <Search className="search-icon" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search students..."
                className="search-input"
              />
              {search && (
                <button
                  onClick={() => setSearch("")}
                  className="icon-btn"
                  style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)" }}
                >
                  <X size={16} />
                </button>
              )}
            </div>

            <select value={classFilter} onChange={(e) => setClassFilter(e.target.value)} className="form-input form-input--compact">
              <option value="all">All Classes</option>
              {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>

            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="form-input form-input--compact">
              <option value="all">All Status</option>
              <option value="paid">Fully Paid</option>
              <option value="partial">Partial</option>
              <option value="unpaid">Unpaid</option>
              <option value="none">No Fees</option>
            </select>

            <select value={sortKey} onChange={(e) => setSortKey(e.target.value)} className="form-input form-input--compact">
              <option value="name">Sort: Name</option>
              <option value="balance">Sort: Balance</option>
              <option value="percentage">Sort: % Paid</option>
            </select>

            <Btn variant="accent" onClick={openAssignModal} disabled={filtered.length === 0}>
              <Users size={16} /> Assign Term
            </Btn>
          </div>

          {/* Student Table */}
          <div className="card">
            {filtered.length === 0 ? (
              <div className="empty-state">
                <div className="empty-state__icon"><Info size={28} /></div>
                <div className="empty-state__title">No students match your filters</div>
                <p className="empty-state__sub">Try changing search or filters</p>
              </div>
            ) : (
              <div className="data-table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>
                        <input
                          type="checkbox"
                          checked={allFilteredSelected}
                          onChange={toggleAll}
                        />
                      </th>
                      <th>Student</th>
                      <th>Class</th>
                      <th>Terms</th>
                      <th className="text-right">Charged</th>
                      <th className="text-right">Paid</th>
                      <th className="text-right">Balance</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((s) => {
                      const isSelected = selectedIds.has(s.id);
                      return (
                        <tr key={s.id} style={isSelected ? { background: "var(--primary-pale)" } : undefined}>
                          <td>
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleOne(s.id)}
                            />
                          </td>
                          <td>
                            <div className="flex gap-2 items-center">
                              <div className="assignment-avatar">
                                {initials(s.fullName)}
                              </div>
                              <div>
                                <div className="data-table__primary">{s.fullName}</div>
                                <div className="data-table__meta">{s.studentCode}</div>
                              </div>
                            </div>
                          </td>
                          <td>{s.className || "—"}</td>
                          <td>
                            <div className="flex flex-wrap gap-2">
                              {s.assignedTerms.length === 0 ? (
                                <span className="text-muted">None</span>
                              ) : (
                                s.assignedTerms.map((t, i) => (
                                  <span key={i} className="tag tag--blue">{t}</span>
                                ))
                              )}
                            </div>
                          </td>
                          <td className="text-right">{fmt(s.totalCharged)}</td>
                          <td className="text-right font-semibold text-success">{fmt(s.totalPaid)}</td>
                          <td className={`text-right font-bold ${s.balance > 0 ? "text-danger" : "text-success"}`}>
                            {fmt(s.balance)}
                          </td>
                          <td>
                            <div className="space-y-2">
                              <StatusPill
                                balance={s.balance}
                                percentage={s.percentage}
                                totalCharged={s.totalCharged}
                              />
                              {s.totalCharged > 0 && <ProgressBar percentage={s.percentage} />}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {filtered.length > 0 && (
              <div className="flex-between" style={{ padding: "12px 20px", borderTop: "1px solid var(--border-color)" }}>
                <span className="text-muted">Showing {filtered.length} of {enriched.length} students</span>
                {someSelected && (
                  <button onClick={() => setSelectedIds(new Set())} className="icon-btn" style={{ color: "var(--primary-light)", width: "auto", padding: "4px 8px" }}>
                    Clear selection ({selectedIds.size})
                  </button>
                )}
              </div>
            )}
          </div>
        </>
      )}

      {/* Assign Modal */}
      {showAssignModal && (
        <Modal
          title={bulkMode === "selected"
            ? `Assign ${assignTerm} to ${selectedIds.size} Students`
            : `Assign ${assignTerm} to All Students`}
          subtitle="Fees will be applied based on each student's class"
          onClose={() => setShowAssignModal(false)}
          wide
        >
          <div className="space-y-6">
            {someSelected && (
              <div className="flex gap-2">
                <button
                  onClick={() => setBulkMode("all")}
                  className={`flex-1 choice-btn ${bulkMode === "all" ? "choice-btn--active" : ""}`}
                >
                  All filtered ({filtered.length})
                </button>
                <button
                  onClick={() => setBulkMode("selected")}
                  className={`flex-1 choice-btn ${bulkMode === "selected" ? "choice-btn--active" : ""}`}
                >
                  Selected only ({selectedIds.size})
                </button>
              </div>
            )}

            <div>
              <label className="field__label">Term to Assign</label>
              <div className="grid grid-cols-2 mt-2">
                {TERMS.map((t) => (
                  <button
                    key={t}
                    onClick={() => setAssignTerm(t)}
                    className={`choice-btn ${assignTerm === t ? "choice-btn--active" : ""}`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="field__label block mb-2">Preview for {assignTerm}</label>
              <FeePreviewRows
                studentIds={modalStudentIds}
                students={students}
                feeStructures={feeStructures}
                studentFees={studentFees}
                assignTerm={assignTerm}
              />
            </div>

            <div className="alert alert--info">
              <Info size={18} />
              <div>Only new fees will be created. Duplicates are automatically skipped.</div>
            </div>

            <div className="flex gap-4 mt-4">
              <Btn variant="secondary" onClick={() => setShowAssignModal(false)} className="flex-1">Cancel</Btn>
              <Btn variant="accent" onClick={handleAssignTerm} loading={actionLoading} className="flex-1">
                Confirm Assignment
              </Btn>
            </div>
          </div>
        </Modal>
      )}

      {/* Toast */}
      {toast && (
        <div className={`toast ${toast.type === "success" ? "toast--success" : "toast--error"}`}>
          {toast.type === "success" ? <Check size={18} /> : <AlertTriangle size={18} />}
          <span>{toast.message}</span>
          <button onClick={() => setToast(null)} className="toast__close"><X size={16} /></button>
        </div>
      )}
    </div>
  );
}
