// modules/DisciplineModule.jsx
import { useState, useEffect, useCallback } from "react";
import { db } from "../../../firebase";
import {
  collection, query, where, getDocs, doc, updateDoc, deleteDoc,
} from "firebase/firestore";
import {
  Eye, RefreshCw, AlertCircle, Loader2,
  ChevronDown, X, ShieldAlert, CheckCircle, Trash2,
  BarChart3, UserX, ClipboardList, Search,
} from "lucide-react";
import "./staff-management.css";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function Spinner({ size = 20 }) {
  return <div className="spinner" style={{ width: size, height: size }} />;
}

function initials(name = "") {
  return name.split(" ").filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join("");
}

function fmtDate(dateStr) {
  if (!dateStr) return "—";
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

const SEVERITY_CONFIG = {
  Low:    { variant: "success", label: "Low" },
  Medium: { variant: "warning", label: "Medium" },
  High:   { variant: "danger",  label: "High" },
  Minor:  { variant: "warning", label: "Minor" },
  Serious:{ variant: "danger",  label: "Serious" },
};

function KpiCard({ label, value, sub, icon: Icon, accent = "neutral", loading }) {
  let accentClass = "";
  let valueClass = "stat-card__value";
  switch (accent) {
    case "success":
      accentClass = "stat-card--success";
      valueClass += " stat-card__value--success";
      break;
    case "warning":
      accentClass = "stat-card--warning";
      valueClass += " stat-card__value--warning";
      break;
    case "danger":
      accentClass = "stat-card--danger";
      valueClass += " stat-card__value--danger";
      break;
    case "info":
      accentClass = "stat-card--info";
      valueClass += " stat-card__value--info";
      break;
    default:
      accentClass = "";
  }
  return (
    <div className={`stat-card ${accentClass}`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="stat-card__label">{label}</div>
          <div className={valueClass}>
            {loading ? <Spinner size={22} /> : value}
          </div>
          {sub && <div className="stat-card__sub">{sub}</div>}
        </div>
        {Icon && <Icon size={24} className="text-muted shrink-0" />}
      </div>
    </div>
  );
}

function ResolutionBar({ resolved, total }) {
  const pct = total > 0 ? Math.round((resolved / total) * 100) : 0;
  return (
    <div className="space-y-1">
      <div className="h-2 w-full bg-primary-dim rounded-full overflow-hidden">
        <div className="h-full bg-success rounded-full transition-all" style={{ width: `${pct}%` }} />
      </div>
      <p className="text-[10px] text-muted">{pct}% resolution rate</p>
    </div>
  );
}

// ─── Detail Modal ─────────────────────────────────────────────────────────────
function RecordModal({ record, onClose, onMarkResolved, onDelete }) {
  const sev = SEVERITY_CONFIG[record.severity] || SEVERITY_CONFIG.Medium;
  const resolved = record.status?.toLowerCase().includes("resolved");
  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-container" style={{ maxWidth: "480px" }}>
        <div className="modal-header">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-surface flex items-center justify-center text-sm font-bold text-app-text">
              {initials(record.studentName || "?")}
            </div>
            <div>
              <h3>{record.studentName || "—"}</h3>
              <p className="text-muted text-xs">{record.className} · {record.date}</p>
            </div>
          </div>
          <button onClick={onClose} className="modal-close">
            <X size={18} />
          </button>
        </div>

        <div className="modal-body space-y-5">
          <div className="flex items-center gap-3 flex-wrap">
            <span className={`status-pill status-pill--${sev.variant}`}>
              {record.severity} Severity
            </span>
            <span className={`status-pill ${resolved ? "status-pill--success" : "status-pill--warning"}`}>
              {record.status || "Pending Review"}
            </span>
          </div>

          <div className="p-4 bg-app-bg rounded-xl border border-app-border">
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted mb-1">Offense / Incident</p>
            <p className="text-sm text-app-text font-medium">{record.offense}</p>
          </div>

          <div className="grid grid-cols-2 gap-px bg-primary-dim rounded-xl overflow-hidden text-sm">
            {[
              ["Student Code", record.studentCode || "—"],
              ["Class",        record.className   || "—"],
              ["Date",         fmtDate(record.date)],
              ["Reported By",  record.reportedBy  || "Teacher"],
              ["Parent Notified", record.parentNotified ? "Yes" : "No"],
            ].map(([k, v]) => (
              <div key={k} className="bg-card-bg px-4 py-3">
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted mb-0.5">{k}</p>
                <p className="font-medium text-app-text">{v}</p>
              </div>
            ))}
          </div>

          <div className="p-4 bg-app-bg rounded-xl border border-app-border">
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted mb-1">Action Taken / Recommended</p>
            <p className="text-sm text-app-text/70">{record.action || record.punishment || "—"}</p>
          </div>

          <div className="flex gap-3 pt-1">
            <button
              onClick={() => onMarkResolved(record.id, record.status)}
              className={`flex-1 py-3 rounded-xl font-medium text-sm transition-all flex items-center justify-center gap-2 ${
                resolved ? "btn--warning" : "btn--success"
              }`}
            >
              <CheckCircle size={14} />
              {resolved ? "Re-open Case" : "Mark Resolved"}
            </button>
            <button
              onClick={() => { onDelete(record.id); onClose(); }}
              className="px-4 py-3 bg-danger/10 hover:bg-danger/20 text-danger rounded-xl text-sm font-medium transition-all flex items-center gap-1.5"
            >
              <Trash2 size={14} /> Delete
            </button>
            <button
              onClick={onClose}
              className="px-5 py-3 border border-app-border rounded-xl hover:bg-surface text-sm font-medium transition-colors text-muted"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function DisciplineModule({ schoolCode }) {
  const [classes,       setClasses]       = useState([]);
  const [records,       setRecords]       = useState([]);
  const [filterClassId, setFilterClassId] = useState("all");
  const [filterSeverity,setFilterSeverity]= useState("All");
  const [filterStatus,  setFilterStatus]  = useState("All");
  const [filterDate,    setFilterDate]    = useState("");
  const [searchTerm,    setSearchTerm]    = useState("");
  const [viewRecord,    setViewRecord]    = useState(null);
  const [error,         setError]         = useState("");

  const [classesReady,  setClassesReady]  = useState(false);
  const [recordsReady,  setRecordsReady]  = useState(false);
  const isLoading = !classesReady || !recordsReady;

  // Load classes
  useEffect(() => {
    if (!schoolCode) return;
    let cancelled = false;
    (async () => {
      setClassesReady(false);
      setError("");
      try {
        const snap = await getDocs(
          query(collection(db, "school_classes"), where("schoolCode", "==", schoolCode))
        );
        if (cancelled) return;
        const list = snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .sort((a, b) => (a.name || "").localeCompare(b.name || ""));
        setClasses(list);
      } catch {
        if (!cancelled) setError("Could not load classes.");
      } finally {
        if (!cancelled) setClassesReady(true);
      }
    })();
    return () => { cancelled = true; };
  }, [schoolCode]);

  // Load discipline cases
  const fetchRecords = useCallback(async () => {
    if (!schoolCode) return;
    setRecordsReady(false);
    try {
      const q = filterClassId === "all"
        ? query(collection(db, "discipline_cases"), where("schoolCode", "==", schoolCode))
        : query(
            collection(db, "discipline_cases"),
            where("schoolCode", "==", schoolCode),
            where("classId",    "==", filterClassId)
          );
      const snap = await getDocs(q);
      const list = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .sort((a, b) => {
          const toMs = (v) => v?.toMillis?.() ?? (v ? new Date(v).getTime() : 0);
          return toMs(b.createdAt) - toMs(a.createdAt);
        });
      setRecords(list);
    } catch (err) {
      setError(`Could not load discipline records: ${err.message}`);
    } finally {
      setRecordsReady(true);
    }
  }, [schoolCode, filterClassId]);

  useEffect(() => {
    if (classesReady) fetchRecords();
  }, [fetchRecords, classesReady]);

  async function handleMarkResolved(id, currentStatus) {
    const resolved = currentStatus?.toLowerCase().includes("resolved");
    const newStatus = resolved ? "Pending Review" : "Resolved";
    try {
      await updateDoc(doc(db, "discipline_cases", id), { status: newStatus });
      setRecords((prev) =>
        prev.map((r) => r.id === id ? { ...r, status: newStatus } : r)
      );
      if (viewRecord?.id === id) setViewRecord((v) => ({ ...v, status: newStatus }));
    } catch {
      setError("Failed to update status.");
    }
  }

  async function handleDelete(id) {
    if (!window.confirm("Permanently delete this discipline record?")) return;
    try {
      await deleteDoc(doc(db, "discipline_cases", id));
      setRecords((prev) => prev.filter((r) => r.id !== id));
    } catch {
      setError("Failed to delete record.");
    }
  }

  const pendingCount  = records.filter((r) => !r.status?.toLowerCase().includes("resolved")).length;
  const resolvedCount = records.filter((r) =>  r.status?.toLowerCase().includes("resolved")).length;
  const highCount     = records.filter((r) => r.severity === "High" || r.severity === "Serious").length;
  const suspendedCount = records.filter((r) => r.status?.toLowerCase().includes("suspend")).length;
  const resolutionRate = records.length > 0 ? Math.round((resolvedCount / records.length) * 100) : 0;

  const hasActiveFilters = filterSeverity !== "All" || filterStatus !== "All" || filterDate || searchTerm;
  const clearFilters = () => {
    setFilterSeverity("All");
    setFilterStatus("All");
    setFilterDate("");
    setSearchTerm("");
  };

  const filtered = records.filter((r) => {
    const matchSev    = filterSeverity === "All" || r.severity === filterSeverity;
    const matchStatus = filterStatus   === "All"
      || (filterStatus === "Pending"  && !r.status?.toLowerCase().includes("resolved"))
      || (filterStatus === "Resolved" &&  r.status?.toLowerCase().includes("resolved"));
    const matchDate   = !filterDate || r.date === filterDate;
    const matchSearch = !searchTerm
      || r.studentName?.toLowerCase().includes(searchTerm.toLowerCase())
      || r.offense?.toLowerCase().includes(searchTerm.toLowerCase())
      || r.studentCode?.toLowerCase().includes(searchTerm.toLowerCase())
      || r.className?.toLowerCase().includes(searchTerm.toLowerCase());
    return matchSev && matchStatus && matchDate && matchSearch;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 style={{ fontFamily: "'Playfair Display', serif" }}>Behaviour Analytics</h2>
          <p className="text-muted">Incident tracking · Severity insights · Resolution monitoring</p>
        </div>
        <button
          onClick={fetchRecords}
          disabled={isLoading}
          className="icon-btn"
          title="Refresh"
        >
          <RefreshCw size={16} className={isLoading ? "spin" : ""} />
        </button>
      </div>

      {error && <div className="error-message"><AlertCircle size={16} /> {error}</div>}

      {/* KPI Cards */}
      <div className="stats-grid grid-cols-2 lg:grid-cols-5 gap-4">
        <KpiCard label="Total Cases" value={records.length} icon={ClipboardList} accent="neutral" loading={isLoading} />
        <KpiCard label="Open Cases" value={pendingCount} icon={AlertCircle} accent="warning" loading={isLoading} />
        <KpiCard label="Resolved" value={resolvedCount} icon={CheckCircle} accent="success" loading={isLoading} />
        <KpiCard label="Suspended" value={suspendedCount} icon={UserX} accent="danger" loading={isLoading} />
        <KpiCard label="Resolution Rate" value={`${resolutionRate}%`} sub={`${highCount} high severity`} icon={BarChart3} accent="info" loading={isLoading} />
      </div>

      {!isLoading && records.length > 0 && (
        <div className="card p-5">
          <ResolutionBar resolved={resolvedCount} total={records.length} />
        </div>
      )}

      {/* Filters toolbar – using .filter-bar for compact selects */}
      <div className="card">
        <div className="cc__head">
          <div className="cc__head-left">
            <ShieldAlert size={18} />
            <h3>Discipline Cases</h3>
          </div>
          {hasActiveFilters && (
            <button onClick={clearFilters} className="cc__view">
              Clear filters
            </button>
          )}
        </div>
        <div className="cc__body">
          <div className="filter-bar">
            <div className="search-wrapper">
              <Search size={14} className="search-icon" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search student, offense, class…"
                className="search-input"
              />
            </div>
            <div className="relative">
              <select
                value={filterClassId}
                onChange={(e) => setFilterClassId(e.target.value)}
                disabled={isLoading}
                className="field__select"
              >
                <option value="all">All classes</option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
            </div>
            <input
              type="date"
              value={filterDate}
              onChange={(e) => setFilterDate(e.target.value)}
              className="search-input"  // reuse compact input style
              style={{ padding: "8px 12px", width: "auto" }}
            />
            <select value={filterSeverity} onChange={(e) => setFilterSeverity(e.target.value)} className="field__select">
              {["All", "Low", "Medium", "High"].map((s) => (
                <option key={s} value={s}>{s === "All" ? "All severity" : s}</option>
              ))}
            </select>
            <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="field__select">
              {["All", "Pending", "Resolved"].map((s) => (
                <option key={s} value={s}>{s === "All" ? "All status" : s}</option>
              ))}
            </select>
          </div>

          {isLoading ? (
            <div className="empty-state py-12">
              <Spinner size={28} />
              <p className="empty-state__sub">Loading discipline records…</p>
            </div>
          ) : filtered.length === 0 ? (
            <TableEmpty
              icon={<ShieldAlert size={32} />}
              title={records.length === 0 ? "No discipline cases yet" : "No matching records"}
              description={records.length === 0
                ? "Cases logged by teachers will appear here for review."
                : "Try adjusting your filters or search term."}
            />
          ) : (
            <div className="data-table-wrap">
              <table className="data-table data-table--stack">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Student</th>
                    <th>Class</th>
                    <th>Incident</th>
                    <th>Severity</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((record) => {
                    const sev = SEVERITY_CONFIG[record.severity] || SEVERITY_CONFIG.Medium;
                    const resolved = record.status?.toLowerCase().includes("resolved");
                    const isCritical = record.severity === "High" || record.severity === "Serious";
                    return (
                      <tr key={record.id} className={isCritical ? "bg-danger/5" : ""}>
                        <td data-label="Date" className="text-muted font-mono text-xs">
                          {fmtDate(record.date)}
                        </td>
                        <td data-label="Student">
                          <div className="flex items-center gap-3">
                            <div className="assignment-avatar" style={{ width: 36, height: 36 }}>
                              {initials(record.studentName || "?")}
                            </div>
                            <div>
                              <div className="font-semibold text-app-text">{record.studentName || "—"}</div>
                              {record.studentCode && (
                                <div className="text-muted text-[10px] font-mono">{record.studentCode}</div>
                              )}
                            </div>
                          </div>
                        </td>
                        <td data-label="Class" className="text-muted">{record.className || "—"}</td>
                        <td data-label="Incident">
                          <div className="text-sm text-app-text/70 truncate max-w-xs">{record.offense}</div>
                          {record.reportedBy && (
                            <div className="text-[10px] text-muted mt-0.5">Reported by {record.reportedBy}</div>
                          )}
                        </td>
                        <td data-label="Severity" className="text-center">
                          <span className={`status-pill status-pill--${sev.variant}`}>
                            {record.severity || "Medium"}
                          </span>
                        </td>
                        <td data-label="Status" className="text-center">
                          <span className={`status-pill ${resolved ? "status-pill--success" : record.status?.toLowerCase().includes("suspend") ? "status-pill--danger" : "status-pill--warning"}`}>
                            {record.status || "Pending Review"}
                          </span>
                        </td>
                        <td data-label="Actions">
                          <div className="flex justify-center gap-2">
                            <button
                              onClick={() => setViewRecord(record)}
                              className="icon-btn icon-btn--assign"
                              title="View"
                            >
                              <Eye size={14} />
                            </button>
                            <button
                              onClick={() => handleMarkResolved(record.id, record.status)}
                              className={`tag ${resolved ? "tag--neutral" : "tag--green"}`}
                            >
                              {resolved ? "Re-open" : "Resolve"}
                            </button>
                            <button
                              onClick={() => handleDelete(record.id)}
                              className="tag tag--red"
                              title="Delete"
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <div className="cc__head border-t mt-4">
            <p className="text-muted text-[10px]">
              Showing {filtered.length} of {records.length} cases
            </p>
          </div>
        </div>
      </div>

      <p className="text-center text-xs text-muted pt-1">
        Showing all discipline cases submitted by teachers across the school.
        Use the filters above to narrow by class, severity, or status.
      </p>

      {viewRecord && (
        <RecordModal
          record={viewRecord}
          onClose={() => setViewRecord(null)}
          onMarkResolved={handleMarkResolved}
          onDelete={handleDelete}
        />
      )}
    </div>
  );
}

// Helper component for empty state
function TableEmpty({ icon, title, description }) {
  return (
    <div className="empty-state py-12">
      <div className="empty-state__icon">{icon}</div>
      <div className="empty-state__title">{title}</div>
      <div className="empty-state__sub">{description}</div>
    </div>
  );
}