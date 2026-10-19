// pages/bursar/modules/StudentFees.jsx
import { useState, useEffect, useMemo, useCallback } from "react";
import { db } from "../../../firebase";
import { collection, query, where, getDocs } from "firebase/firestore";
import { subscribeSchoolSettings } from "../../../services/academicTerm";
import { syncTermFees, applyOptionalFee, unbillTerm } from "../../../services/termFees";
import { structuresForTerm, isOptionalLine } from "../../../services/termFeesCore";
import { termPosition } from "../../../services/feeAllocationCore";
import { fetchClearances } from "../../../services/feeClearance";
import {
  fetchReleases, setResultsRelease, resultsAccess, releaseActive,
} from "../../../services/resultsRelease";
import {
  Search, X, Check, Users, Info, AlertTriangle, RefreshCw, Unlock,
  GraduationCap, Wallet, AlertCircle, CheckCircle2, PlusCircle, Eraser,
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
function ResultsPill({ access, release, balance }) {
  if (access.visible && releaseActive(release)) {
    return <span className="status-pill" style={{ background: "var(--primary-pale)", color: "var(--primary-light)" }}>Released</span>;
  }
  if (access.visible) return <span className="status-pill status-pill--active">Visible</span>;
  if (access.reason === "clearance") return <span className="status-pill status-pill--suspended">Withheld by head</span>;
  return <span className="status-pill status-pill--suspended" title={`Owes ${fmt(balance)}`}>Held — fees owed</span>;
}

export default function StudentFees({ schoolCode, currentUser }) {
  const [students, setStudents] = useState([]);
  const [classes, setClasses] = useState([]);
  const [studentFees, setStudentFees] = useState([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState("");
  const [classFilter, setClassFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortKey, setSortKey] = useState("name");
  const [selectedIds, setSelectedIds] = useState(new Set());

  // The term the head teacher has opened. Billing and the results gate both
  // follow it.
  const [currentTerm, setCurrentTerm] = useState(undefined);
  const [billingNote, setBillingNote] = useState("");
  // Each student's position in the current term (termPosition): this term's
  // fees, what's paid toward them, and anything carried forward from earlier
  // terms. A student is in one term at a time — older unpaid fees are a
  // brought-forward balance, not a second enrolment.
  const [positions, setPositions] = useState(new Map());
  const [releases, setReleases] = useState(new Map());
  const [clearances, setClearances] = useState(new Map());
  const [releaseFor, setReleaseFor] = useState(null);   // { students, approve }
  const [releaseNote, setReleaseNote] = useState("");
  // Optional (secondary) fee lines for the open term, and the add/remove dialog.
  const [structures, setStructures] = useState([]);
  const [optionalOpen, setOptionalOpen] = useState(false);
  const [optionalLineId, setOptionalLineId] = useState("");
  const [optionalAction, setOptionalAction] = useState("add");

  const [resetOpen, setResetOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    if (!schoolCode) return undefined;
    return subscribeSchoolSettings(schoolCode, (s) => {
      const t = s?.currentTerm || "";
      setCurrentTerm(t);
    });
  }, [schoolCode]);

  function showToast(type, message) {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4500);
  }

  // The page starts in its loading state; the refresh button sets it again
  // before calling this, so nothing here has to set state before the first await.
  const fetchAll = useCallback(async ({ sync = false } = {}) => {
    try {
      // Bring this term's billing up to date first, so the table below is
      // never showing a student who simply hasn't been billed yet.
      if (sync && currentTerm) {
        const r = await syncTermFees({ schoolCode, term: currentTerm });
        setBillingNote(r.created || r.updated || r.removed
          ? `${currentTerm} billing updated: ${r.created} new charge${r.created === 1 ? "" : "s"}${r.updated ? `, ${r.updated} corrected` : ""}${r.removed ? `, ${r.removed} removed` : ""}.`
          : `${currentTerm} billing is up to date — ${r.billed} student${r.billed === 1 ? "" : "s"} billed.`);
      }

      const q = (name) => getDocs(query(collection(db, name), where("schoolCode", "==", schoolCode)));
      const [stSnap, clSnap, faSnap, pySnap, rel, clr, fsSnap] = await Promise.all([
        q("students"),
        q("school_classes"),
        q("fee_assignments"),
        q("payments"),
        currentTerm ? fetchReleases(schoolCode, currentTerm) : Promise.resolve(new Map()),
        currentTerm ? fetchClearances(schoolCode, currentTerm) : Promise.resolve(new Map()),
        q("fee_structures"),
      ]);
      setStructures(fsSnap.docs.map((d) => ({ id: d.id, ...d.data() })));

      const studentRows = stSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setStudents(studentRows);
      setClasses(clSnap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (a.order ?? 0) - (b.order ?? 0)));
      const charges = faSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      // Confirmed money only — the same rule the parent app's results check
      // and the Arrears screen use, so all three agree on what is owed.
      const confirmed = pySnap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((p) => p.status === "verified");
      setStudentFees(charges);
      setReleases(rel);
      setClearances(clr);

      const chargesBy = new Map();
      charges.forEach((c) => { if (!chargesBy.has(c.studentId)) chargesBy.set(c.studentId, []); chargesBy.get(c.studentId).push(c); });
      const paidBy = new Map();
      confirmed.forEach((p) => { if (!paidBy.has(p.studentId)) paidBy.set(p.studentId, []); paidBy.get(p.studentId).push(p); });
      setPositions(new Map(studentRows.map((st) => [
        st.id,
        termPosition(chargesBy.get(st.id) || [], paidBy.get(st.id) || [], currentTerm || ""),
      ])));
    } catch (e) {
      showToast("error", "Failed to load data.");
      console.error(e);
    }
    setLoading(false);
  }, [schoolCode, currentTerm]);

  // Billing is brought up to date every time the page opens.
  // Deferred a tick (as admin_dashboard does) so the load's state updates
  // don't run synchronously inside the effect.
  useEffect(() => {
    if (currentTerm === undefined) return undefined;
    const id = setTimeout(() => fetchAll({ sync: Boolean(currentTerm) }), 0);
    return () => clearTimeout(id);
  }, [fetchAll, currentTerm]);

  const enriched = useMemo(() => students
    .filter((s) => (s.status || "active") === "active" || studentFees.some((f) => f.studentId === s.id))
    .map((s) => {
      const pos = positions.get(s.id) || { charged: 0, paid: 0, owed: 0, broughtForward: 0, balance: 0, percentage: 0 };
      const release = releases.get(s.id) || null;
      const access = resultsAccess({ balance: pos.balance, release, clearance: clearances.get(s.id), term: currentTerm });
      // Optional fees the student has been added to. Shown for reference only:
      // positions (charged / owed / balance) count compulsory fees alone.
      const optionalCharged = studentFees
        .filter((f) => f.studentId === s.id && f.optional && f.term === currentTerm)
        .reduce((sum, f) => sum + (Number(f.amount) || 0), 0);
      return {
        ...s,
        optionalCharged,
        compulsoryCharged: pos.charged,
        // This term only — the one term the student is in (compulsory + optional).
        totalCharged: pos.charged,
        totalPaid: pos.paid,
        termOwed: pos.owed,
        percentage: pos.percentage,
        broughtForward: pos.broughtForward,
        // Everything owed, this term and brought forward.
        balance: pos.balance,
        owedAll: pos.balance,
        release,
        access,
      };
    }),
  [students, studentFees, positions, releases, clearances, currentTerm]);

  const filtered = useMemo(() => {
    let list = enriched.filter((s) => {
      const matchSearch = !search ||
        s.fullName?.toLowerCase().includes(search.toLowerCase()) ||
        s.studentCode?.toLowerCase().includes(search.toLowerCase());
      const matchClass = classFilter === "all" || s.classId === classFilter;
      const matchStatus = statusFilter === "all" ||
        (statusFilter === "paid" && s.totalCharged > 0 && s.termOwed <= 0) ||
        (statusFilter === "partial" && s.percentage > 0 && s.termOwed > 0) ||
        (statusFilter === "unpaid" && s.totalCharged > 0 && s.percentage === 0) ||
        (statusFilter === "none" && s.totalCharged === 0) ||
        (statusFilter === "arrears" && s.broughtForward > 0) ||
        (statusFilter === "held" && !s.access.visible) ||
        (statusFilter === "released" && releaseActive(s.release, currentTerm));
      return matchSearch && matchClass && matchStatus;
    });

    list.sort((a, b) => {
      if (sortKey === "balance") return b.balance - a.balance;
      if (sortKey === "percentage") return a.percentage - b.percentage;
      return (a.fullName || "").localeCompare(b.fullName || "");
    });

    return list;
  }, [enriched, search, classFilter, statusFilter, sortKey, currentTerm]);

  const summary = useMemo(() => {
    const totalCharged = enriched.reduce((s, x) => s + x.totalCharged, 0);
    const totalPaid = enriched.reduce((s, x) => s + x.totalPaid, 0);
    const outstanding = enriched.reduce((s, x) => s + Math.max(x.balance, 0), 0);
    const broughtForward = enriched.reduce((s, x) => s + x.broughtForward, 0);
    const fullyPaid = enriched.filter((x) => x.totalCharged > 0 && x.termOwed <= 0).length;
    const held = enriched.filter((x) => !x.access.visible && x.access.reason === "balance").length;
    return { totalCharged, totalPaid, outstanding, broughtForward, fullyPaid, held, total: enriched.length };
  }, [enriched]);

  const allFilteredSelected = filtered.length > 0 && filtered.every((s) => selectedIds.has(s.id));
  const someSelected = selectedIds.size > 0;
  const selectedHeld = enriched.filter((s) => selectedIds.has(s.id) && !s.access.visible && s.access.reason === "balance");

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

  const selectedStudents = enriched.filter((s) => selectedIds.has(s.id));
  // Optional lines that apply to at least one selected student's class.
  const optionalLines = useMemo(() => {
    if (!currentTerm) return [];
    const classIds = new Set(enriched.filter((s) => selectedIds.has(s.id)).map((s) => s.classId));
    return structuresForTerm(structures, currentTerm).filter((l) => isOptionalLine(l) && classIds.has(l.classId));
  }, [structures, currentTerm, enriched, selectedIds]);
  const optionalLine = optionalLines.find((l) => l.id === optionalLineId) || null;
  const optionalTargets = optionalLine ? selectedStudents.filter((s) => s.classId === optionalLine.classId) : [];

  async function confirmOptional() {
    if (!optionalLine || optionalTargets.length === 0) return;
    setActionLoading(true);
    try {
      const r = await applyOptionalFee({ schoolCode, term: currentTerm, line: optionalLine, students: optionalTargets, action: optionalAction });
      const n = optionalAction === "add" ? r.added : r.removed;
      showToast("success", optionalAction === "add"
        ? `${optionalLine.name} added for ${n} student${n === 1 ? "" : "s"}${n < optionalTargets.length ? ` (${optionalTargets.length - n} already had it)` : ""}.`
        : `${optionalLine.name} removed from ${n} student${n === 1 ? "" : "s"}.`);
      setOptionalOpen(false);
      setSelectedIds(new Set());
      setLoading(true);
      await fetchAll();
    } catch (err) {
      console.error(err);
      showToast("error", `Couldn't save: ${err.message}`);
    }
    setActionLoading(false);
  }

  // Takes the whole term off every student's bill. `rebill` then raises the
  // compulsory fees again straight away; without it the term stays unbilled
  // until billing is next brought up to date (refresh, or reopening this page).
  async function confirmReset(rebill) {
    if (!currentTerm) return;
    setActionLoading(true);
    try {
      const r = await unbillTerm({ schoolCode, term: currentTerm });
      let note = `${currentTerm}: ${r.removed} charge${r.removed === 1 ? "" : "s"} removed from students' bills.`;
      if (rebill) {
        const b = await syncTermFees({ schoolCode, term: currentTerm });
        note += ` Billed again: ${b.created} charge${b.created === 1 ? "" : "s"} for ${b.billed} student${b.billed === 1 ? "" : "s"}.`;
      }
      setBillingNote(note);
      showToast("success", note);
      setResetOpen(false);
      setSelectedIds(new Set());
      setLoading(true);
      await fetchAll();
    } catch (err) {
      console.error(err);
      showToast("error", `Couldn't reset billing: ${err.message}`);
    }
    setActionLoading(false);
  }

  async function confirmRelease() {
    if (!releaseFor || !currentTerm) return;
    setActionLoading(true);
    try {
      for (const student of releaseFor.students) {
        await setResultsRelease({
          schoolCode,
          student: { ...student, balance: student.owedAll },
          term: currentTerm,
          approve: releaseFor.approve,
          actor: currentUser,
          note: releaseNote,
        });
      }
      const n = releaseFor.students.length;
      showToast("success", releaseFor.approve
        ? `${currentTerm} results released for ${n} student${n === 1 ? "" : "s"}. Guardians have been told.`
        : `Release withdrawn for ${n} student${n === 1 ? "" : "s"}. Their results are hidden until fees are cleared.`);
      setReleaseFor(null);
      setReleaseNote("");
      setSelectedIds(new Set());
      setLoading(true);
      await fetchAll();
    } catch (err) {
      console.error(err);
      showToast("error", `Couldn't save: ${err.message}`);
    }
    setActionLoading(false);
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex-between flex-wrap">
        <div>
          <h2>Student Fees</h2>
          <p className="text-muted">
            Balances per student, and whether their families can see results.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {currentTerm && <span className="tag tag--blue" style={{ alignSelf: "center" }}>{currentTerm}</span>}
          <Btn variant="secondary" onClick={() => { setLoading(true); fetchAll({ sync: Boolean(currentTerm) }); }} loading={loading} title="Refresh and update billing">
            <RefreshCw size={16} />
          </Btn>
          <Btn variant="secondary" onClick={() => setResetOpen(true)} disabled={!currentTerm} title="Take this term off every student's bill">
            <Eraser size={16} /> Reset billing
          </Btn>
        </div>
      </div>

      {currentTerm === "" ? (
        <div className="alert alert--warning">
          <AlertTriangle size={16} />
          <div>The head teacher hasn&apos;t opened a term yet. Students are billed automatically once a term is open and its fee structure is set.</div>
        </div>
      ) : currentTerm && (
        <div className="alert alert--info">
          <Info size={16} />
          <div>
            <strong>{currentTerm}</strong> is open. Every active student is billed automatically from their class&apos;s compulsory fees. Optional fees (bus, uniform…) are only billed to students you add them to: select students, then use Optional fees.
            {" "}Results are hidden from families who owe fees unless you release them.
            {billingNote && <div style={{ marginTop: 4, fontWeight: 600 }}>{billingNote}</div>}
          </div>
        </div>
      )}

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
            <SummaryCard label="Billed This Term" value={fmt(summary.totalCharged)} accent="blue" sub={`${currentTerm || "No term open"} · ${summary.total} students`} />
            <SummaryCard label="Paid This Term" value={fmt(summary.totalPaid)} accent="emerald" sub="Confirmed payments" />
            <SummaryCard label="Outstanding" value={fmt(summary.outstanding)} accent="red"
              sub={summary.broughtForward > 0 ? `incl. ${fmt(summary.broughtForward)} brought forward` : "All from this term"} />
            <SummaryCard label="Results Held" value={summary.held} accent="gold" sub="Owe fees, not released" />
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
              <option value="none">Not billed this term</option>
              <option value="arrears">Brought forward</option>
              <option value="held">Results held</option>
              <option value="released">Results released</option>
            </select>

            <select value={sortKey} onChange={(e) => setSortKey(e.target.value)} className="form-input form-input--compact">
              <option value="name">Sort: Name</option>
              <option value="balance">Sort: Balance</option>
              <option value="percentage">Sort: % Paid</option>
            </select>

            <Btn
              variant="secondary"
              onClick={() => { setOptionalLineId(optionalLines[0]?.id || ""); setOptionalAction("add"); setOptionalOpen(true); }}
              disabled={!currentTerm || optionalLines.length === 0}
              title={someSelected ? "Add or remove an optional fee for the selected students" : "Select students first"}
            >
              <PlusCircle size={16} /> Optional fees{someSelected ? ` (${selectedIds.size})` : ""}
            </Btn>

            <Btn
              variant="accent"
              onClick={() => { setReleaseNote(""); setReleaseFor({ students: selectedHeld, approve: true }); }}
              disabled={!currentTerm || selectedHeld.length === 0}
              title="Select students whose results are held"
            >
              <Unlock size={16} /> Release results{selectedHeld.length ? ` (${selectedHeld.length})` : ""}
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
                        <input type="checkbox" checked={allFilteredSelected} onChange={toggleAll} aria-label="Select all" />
                      </th>
                      <th>Student</th>
                      <th>Class</th>
                      <th>Term</th>
                      <th className="text-right">Compulsory</th>
                      <th className="text-right">Optional</th>
                      <th className="text-right">Paid</th>
                      <th className="text-right">Brought forward</th>
                      <th className="text-right">Balance</th>
                      <th>Status</th>
                      <th>Results {currentTerm ? `· ${currentTerm}` : ""}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((s) => {
                      const isSelected = selectedIds.has(s.id);
                      const held = !s.access.visible && s.access.reason === "balance";
                      const released = releaseActive(s.release, currentTerm);
                      return (
                        <tr key={s.id} style={isSelected ? { background: "var(--primary-pale)" } : undefined}>
                          <td>
                            <input type="checkbox" checked={isSelected} onChange={() => toggleOne(s.id)} aria-label={`Select ${s.fullName}`} />
                          </td>
                          <td>
                            <div className="flex gap-2 items-center">
                              <div className="assignment-avatar">{initials(s.fullName)}</div>
                              <div>
                                <div className="data-table__primary">{s.fullName}</div>
                                <div className="data-table__meta">{s.studentCode}</div>
                              </div>
                            </div>
                          </td>
                          <td>{s.className || "—"}</td>
                          <td>
                            {s.totalCharged > 0
                              ? <span className="tag tag--blue">{currentTerm}</span>
                              : <span className="text-muted">Not billed</span>}
                          </td>
                          <td className="text-right">{fmt(s.compulsoryCharged)}</td>
                          <td className={`text-right ${s.optionalCharged > 0 ? "" : "text-muted"}`}>{s.optionalCharged > 0 ? fmt(s.optionalCharged) : "—"}</td>
                          <td className="text-right font-semibold text-success">{fmt(s.totalPaid)}</td>
                          <td className={`text-right ${s.broughtForward > 0 ? "text-danger" : "text-muted"}`}>
                            {s.broughtForward > 0 ? fmt(s.broughtForward) : "—"}
                          </td>
                          <td className={`text-right font-bold ${s.balance > 0 ? "text-danger" : "text-success"}`}>
                            {fmt(s.balance)}
                          </td>
                          <td>
                            <div className="space-y-2">
                              <StatusPill balance={s.termOwed} percentage={s.percentage} totalCharged={s.totalCharged} />
                              {s.totalCharged > 0 && <ProgressBar percentage={s.percentage} />}
                            </div>
                          </td>
                          <td>
                            {currentTerm ? (
                              <div className="flex gap-2 items-center flex-wrap">
                                <ResultsPill access={s.access} release={s.release} balance={s.owedAll} />
                                {held && (
                                  <button type="button" className="icon-btn" style={{ width: "auto", padding: "4px 8px", fontSize: 12 }}
                                    onClick={() => { setReleaseNote(""); setReleaseFor({ students: [s], approve: true }); }}>
                                    Release
                                  </button>
                                )}
                                {released && s.owedAll > 0 && (
                                  <button type="button" className="icon-btn" style={{ width: "auto", padding: "4px 8px", fontSize: 12 }}
                                    onClick={() => { setReleaseNote(""); setReleaseFor({ students: [s], approve: false }); }}>
                                    Withdraw
                                  </button>
                                )}
                              </div>
                            ) : <span className="text-muted">—</span>}
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

      {/* Optional fee add / remove */}
      {resetOpen && (
        <Modal
          title="Reset this term's billing"
          subtitle={currentTerm}
          onClose={() => !actionLoading && setResetOpen(false)}
        >
          <div className="space-y-4">
            <div className="alert alert--warning">
              <AlertTriangle size={16} />
              <div>
                This removes <strong>every charge</strong> on {currentTerm} for <strong>all students</strong> —
                compulsory fees, optional fees you added, and any charge entered by hand. Payments are not
                touched. Optional fees have to be added again afterwards.
              </div>
            </div>
            <div className="flex gap-4 mt-4" style={{ flexWrap: "wrap" }}>
              <Btn variant="secondary" onClick={() => setResetOpen(false)} disabled={actionLoading} className="flex-1">Cancel</Btn>
              <Btn variant="secondary" onClick={() => confirmReset(false)} loading={actionLoading} className="flex-1">
                Unbill everyone
              </Btn>
              <Btn variant="accent" onClick={() => confirmReset(true)} loading={actionLoading} className="flex-1">
                Unbill, then bill again
              </Btn>
            </div>
            <p className="text-muted" style={{ fontSize: 12 }}>
              &ldquo;Unbill everyone&rdquo; leaves the term empty until you press refresh or reopen this page,
              which bills every active student from their class&apos;s compulsory fees again.
            </p>
          </div>
        </Modal>
      )}

      {optionalOpen && (
        <Modal
          title="Optional fees"
          subtitle={`${selectedIds.size} student${selectedIds.size === 1 ? "" : "s"} selected · ${currentTerm}`}
          onClose={() => setOptionalOpen(false)}
        >
          <div className="space-y-4">
            <div className="field">
              <label className="field__label" htmlFor="optional-line">Fee</label>
              <select id="optional-line" className="form-input" value={optionalLineId} onChange={(e) => setOptionalLineId(e.target.value)}>
                {optionalLines.map((l) => <option key={l.id} value={l.id}>{l.name} — {l.className} ({fmt(l.amount)})</option>)}
              </select>
            </div>
            <div className="field">
              <label className="field__label" htmlFor="optional-action">Action</label>
              <select id="optional-action" className="form-input" value={optionalAction} onChange={(e) => setOptionalAction(e.target.value)}>
                <option value="add">Add to the selected students</option>
                <option value="remove">Remove from the selected students</option>
              </select>
            </div>
            {optionalLine && (
              <div className="alert alert--info">
                <Info size={16} />
                <div>
                  {optionalTargets.length} of the {selectedIds.size} selected {optionalTargets.length === 1 ? "is" : "are"} in {optionalLine.className}
                  {optionalTargets.length < selectedIds.size ? "; students in other classes are skipped" : ""}.
                </div>
              </div>
            )}
            <div className="flex gap-4 mt-4">
              <Btn variant="secondary" onClick={() => setOptionalOpen(false)} className="flex-1">Cancel</Btn>
              <Btn variant="accent" onClick={confirmOptional} loading={actionLoading} disabled={optionalTargets.length === 0} className="flex-1">
                {optionalAction === "add" ? "Add fee" : "Remove fee"}
              </Btn>
            </div>
          </div>
        </Modal>
      )}

      {/* Release / withdraw confirmation */}
      {releaseFor && (
        <Modal
          title={releaseFor.approve ? `Release ${currentTerm} results` : "Withdraw the release"}
          subtitle={releaseFor.students.length === 1
            ? `${releaseFor.students[0].fullName} · owes ${fmt(releaseFor.students[0].owedAll)}`
            : `${releaseFor.students.length} students with fees owed`}
          onClose={() => setReleaseFor(null)}
        >
          <div className="space-y-4">
            <div className={`alert ${releaseFor.approve ? "alert--info" : "alert--warning"}`}>
              <Info size={16} />
              <div>
                {releaseFor.approve
                  ? "The family will see this term's marks and report card in ACALink even though fees are still owed, and will be told they're available. The balance itself is unchanged."
                  : "The family's view of this term's results will be hidden again until the balance is cleared."}
              </div>
            </div>
            <div className="field">
              <label className="field__label" htmlFor="release-note">Note (optional, kept on record)</label>
              <input id="release-note" className="field__input" value={releaseNote} onChange={(e) => setReleaseNote(e.target.value)}
                placeholder={releaseFor.approve ? "e.g. Payment plan agreed" : "Reason"} />
            </div>
            <div className="flex gap-4 mt-4">
              <Btn variant="secondary" onClick={() => setReleaseFor(null)} className="flex-1">Cancel</Btn>
              <Btn variant="accent" onClick={confirmRelease} loading={actionLoading} className="flex-1">
                {releaseFor.approve ? "Release results" : "Withdraw release"}
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
