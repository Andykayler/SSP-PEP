// modules/DisciplineModule.jsx  (Head Teacher / Admin view)
// Reads live Firestore discipline_cases written by teachers via the teacher DisciplineModule.

import { useState, useEffect, useCallback } from "react";
import { db } from "../../../firebase";
import {
  collection, query, where, getDocs, doc, updateDoc, deleteDoc,
} from "firebase/firestore";
import {
  Plus, Eye, RefreshCw, Search, AlertCircle, Loader2,
  ChevronDown, X, ShieldAlert, CheckCircle, Trash2,
} from "lucide-react";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function Spinner({ size = 20 }) {
  return <Loader2 size={size} className="animate-spin text-app-text/40 inline-block" />;
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
  Low:    { bg: "bg-emerald-100", text: "text-emerald-700", dot: "bg-emerald-500" },
  Medium: { bg: "bg-amber-100",   text: "text-amber-700",   dot: "bg-amber-500"   },
  High:   { bg: "bg-red-100",     text: "text-red-700",     dot: "bg-red-500"     },
  // Legacy labels from older records
  Minor:  { bg: "bg-amber-100",   text: "text-amber-700",   dot: "bg-amber-400"   },
  Serious:{ bg: "bg-red-100",     text: "text-red-700",     dot: "bg-red-500"     },
};

// ─── Detail Modal ─────────────────────────────────────────────────────────────

function RecordModal({ record, onClose, onMarkResolved, onDelete }) {
  const sev = SEVERITY_CONFIG[record.severity] || SEVERITY_CONFIG.Medium;
  const resolved = record.status?.toLowerCase().includes("resolved");

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-app-surface rounded-3xl w-full max-w-md overflow-hidden shadow-2xl">
        {/* Modal header */}
        <div className="bg-app-primary px-7 py-5 flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-app-surface/10 flex items-center justify-center text-sm font-bold text-white">
              {initials(record.studentName || "?")}
            </div>
            <div>
              <h3 className="text-white font-bold text-lg leading-tight">
                {record.studentName || "—"}
              </h3>
              <p className="text-white/50 text-xs mt-0.5">
                {record.className} · {record.date}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-white/50 hover:text-white transition-colors p-1">
            <X size={20} />
          </button>
        </div>

        <div className="p-7 space-y-5">
          {/* Severity + Status */}
          <div className="flex items-center gap-3 flex-wrap">
            <span className={`inline-flex items-center gap-1.5 text-sm font-semibold px-3 py-1.5 rounded-xl ${sev.bg} ${sev.text}`}>
              <span className={`w-2 h-2 rounded-full ${sev.dot}`} />
              {record.severity} Severity
            </span>
            <span className={`text-sm font-semibold px-3 py-1.5 rounded-xl ${resolved ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
              {record.status || "Pending Review"}
            </span>
          </div>

          {/* Offense */}
          <div className="p-4 bg-app-bg rounded-2xl border border-app-border">
            <p className="text-[10px] font-bold uppercase tracking-widest text-app-text/40 mb-1.5">Offense / Incident</p>
            <p className="text-sm text-app-text font-medium">{record.offense}</p>
          </div>

          {/* Details grid */}
          <div className="grid grid-cols-2 gap-px bg-app-primary/5 rounded-2xl overflow-hidden text-sm">
            {[
              ["Student Code", record.studentCode || "—"],
              ["Class",        record.className   || "—"],
              ["Date",         fmtDate(record.date)],
              ["Reported By",  record.reportedBy  || "Teacher"],
              ["Parent Notified", record.parentNotified ? "Yes" : "No"],
            ].map(([k, v]) => (
              <div key={k} className="bg-app-surface px-4 py-3">
                <p className="text-[10px] font-bold uppercase tracking-wider text-app-text/40 mb-0.5">{k}</p>
                <p className="font-medium text-app-text">{v}</p>
              </div>
            ))}
          </div>

          {/* Action */}
          <div className="p-4 bg-app-bg rounded-2xl border border-app-border">
            <p className="text-[10px] font-bold uppercase tracking-widest text-app-text/40 mb-1.5">Action Taken / Recommended</p>
            <p className="text-sm text-app-text/70">{record.action || record.punishment || "—"}</p>
          </div>

          {/* Head teacher actions */}
          <div className="flex gap-3 pt-1">
            <button
              onClick={() => onMarkResolved(record.id, record.status)}
              className={`flex-1 py-3 rounded-2xl font-medium text-sm transition-all flex items-center justify-center gap-2 ${
                resolved
                  ? "bg-amber-50 text-amber-700 hover:bg-amber-100"
                  : "bg-emerald-600 text-white hover:bg-emerald-700"
              }`}
            >
              <CheckCircle size={14} />
              {resolved ? "Re-open Case" : "Mark Resolved"}
            </button>
            <button
              onClick={() => { onDelete(record.id); onClose(); }}
              className="px-4 py-3 bg-red-50 hover:bg-red-100 text-red-600 rounded-2xl text-sm font-medium transition-all flex items-center gap-1.5"
            >
              <Trash2 size={14} /> Delete
            </button>
            <button
              onClick={onClose}
              className="px-5 py-3 border border-app-border rounded-2xl hover:bg-app-bg text-sm font-medium transition-colors text-app-text/70"
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
  const [searchTerm,    setSearchTerm]    = useState("");
  const [viewRecord,    setViewRecord]    = useState(null);
  const [error,         setError]         = useState("");

  const [classesReady,  setClassesReady]  = useState(false);
  const [recordsReady,  setRecordsReady]  = useState(false);

  const isLoading = !classesReady || !recordsReady;

  // ── Load all school classes ────────────────────────────────────────────────
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
      } catch (err) {
        if (cancelled) return;
        setError("Could not load classes.");
      } finally {
        if (!cancelled) setClassesReady(true);
      }
    })();

    return () => { cancelled = true; };
  }, [schoolCode]);

  // ── Load discipline cases ──────────────────────────────────────────────────
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

  // ── Mark resolved / re-open ────────────────────────────────────────────────
  async function handleMarkResolved(id, currentStatus) {
    const resolved = currentStatus?.toLowerCase().includes("resolved");
    const newStatus = resolved ? "Pending Review" : "Resolved";
    try {
      await updateDoc(doc(db, "discipline_cases", id), { status: newStatus });
      setRecords((prev) =>
        prev.map((r) => r.id === id ? { ...r, status: newStatus } : r)
      );
      if (viewRecord?.id === id) setViewRecord((v) => ({ ...v, status: newStatus }));
    } catch (err) {
      setError("Failed to update status.");
    }
  }

  // ── Delete ─────────────────────────────────────────────────────────────────
  async function handleDelete(id) {
    if (!window.confirm("Permanently delete this discipline record?")) return;
    try {
      await deleteDoc(doc(db, "discipline_cases", id));
      setRecords((prev) => prev.filter((r) => r.id !== id));
    } catch (err) {
      setError("Failed to delete record.");
    }
  }

  // ── Derived stats ──────────────────────────────────────────────────────────
  const pendingCount  = records.filter((r) => !r.status?.toLowerCase().includes("resolved")).length;
  const resolvedCount = records.filter((r) =>  r.status?.toLowerCase().includes("resolved")).length;
  const highCount     = records.filter((r) => r.severity === "High" || r.severity === "Serious").length;

  // ── Filtered list ──────────────────────────────────────────────────────────
  const filtered = records.filter((r) => {
    const matchSev    = filterSeverity === "All" || r.severity === filterSeverity;
    const matchStatus = filterStatus   === "All"
      || (filterStatus === "Pending"  && !r.status?.toLowerCase().includes("resolved"))
      || (filterStatus === "Resolved" &&  r.status?.toLowerCase().includes("resolved"));
    const matchSearch = !searchTerm
      || r.studentName?.toLowerCase().includes(searchTerm.toLowerCase())
      || r.offense?.toLowerCase().includes(searchTerm.toLowerCase())
      || r.studentCode?.toLowerCase().includes(searchTerm.toLowerCase())
      || r.className?.toLowerCase().includes(searchTerm.toLowerCase());
    return matchSev && matchStatus && matchSearch;
  });

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2
            className="text-3xl font-bold text-app-text"
            style={{ fontFamily: "'Playfair Display', serif" }}
          >
            Discipline Management
          </h2>
          <p className="text-app-text/60 mt-1">
            Track behaviour · Log offenses · Parent notifications
          </p>
        </div>
        <button
          onClick={fetchRecords}
          disabled={isLoading}
          className="p-2.5 bg-app-surface border border-app-border rounded-xl hover:bg-app-bg transition-colors text-app-text/60 disabled:opacity-40"
          title="Refresh"
        >
          <RefreshCw size={16} className={isLoading ? "animate-spin" : ""} />
        </button>
      </div>

      {/* ── Error ────────────────────────────────────────────────────────────── */}
      {error && (
        <div className="flex items-start gap-3 bg-red-50 border border-red-200 text-red-700 p-4 rounded-2xl text-sm">
          <AlertCircle size={16} className="shrink-0 mt-0.5" />
          {error}
        </div>
      )}

      {/* ── Summary cards ────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total cases",    value: records.length, color: "text-app-text",   bg: "bg-app-surface border-app-border" },
          { label: "Pending review", value: pendingCount,   color: "text-amber-600",   bg: "bg-amber-50 border-amber-100" },
          { label: "Resolved",       value: resolvedCount,  color: "text-emerald-600", bg: "bg-emerald-50 border-emerald-100" },
          { label: "High severity",  value: highCount,      color: "text-red-600",     bg: "bg-red-50 border-red-100" },
        ].map(({ label, value, color, bg }) => (
          <div key={label} className={`rounded-3xl p-6 border ${bg}`}>
            <p className={`text-4xl font-bold ${color}`}>
              {isLoading ? <Spinner size={22} /> : value}
            </p>
            <p className="text-xs text-app-text/50 mt-1">{label}</p>
          </div>
        ))}
      </div>

      {/* ── Filters ──────────────────────────────────────────────────────────── */}
      <div className="bg-app-surface rounded-3xl p-5 border border-app-border flex flex-col md:flex-row gap-4 items-end">
        {/* Search */}
        <div className="flex-1 relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-app-text/40 w-4 h-4" />
          <input
            type="text"
            placeholder="Search student, offense, class…"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-11 pr-4 py-3 bg-[#FAFAF8] border border-app-border rounded-2xl text-sm focus:outline-none focus:border-[#0F2044]/30"
          />
        </div>

        {/* Class filter */}
        <div className="relative">
          <select
            value={filterClassId}
            onChange={(e) => setFilterClassId(e.target.value)}
            disabled={isLoading}
            className="appearance-none pl-4 pr-10 py-3 bg-app-surface border border-app-border rounded-2xl text-sm focus:outline-none focus:border-[#0F2044]/40 text-app-text min-w-[160px] disabled:opacity-50"
          >
            <option value="all">All classes</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-app-text/40 pointer-events-none" />
        </div>

        {/* Severity filter */}
        <div className="flex gap-2 flex-wrap">
          {["All", "Low", "Medium", "High"].map((s) => (
            <button
              key={s}
              onClick={() => setFilterSeverity(s)}
              className={`px-3 py-2.5 rounded-xl text-xs font-semibold border transition-colors ${
                filterSeverity === s
                  ? "bg-app-primary text-white border-[#0F2044]"
                  : "border-app-border text-app-text/60 hover:border-[#0F2044]/30"
              }`}
            >
              {s}
            </button>
          ))}
        </div>

        {/* Status filter */}
        <div className="flex gap-2 flex-wrap">
          {["All", "Pending", "Resolved"].map((s) => (
            <button
              key={s}
              onClick={() => setFilterStatus(s)}
              className={`px-3 py-2.5 rounded-xl text-xs font-semibold border transition-colors ${
                filterStatus === s
                  ? "bg-app-primary text-white border-[#0F2044]"
                  : "border-app-border text-app-text/60 hover:border-[#0F2044]/30"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* ── Table ────────────────────────────────────────────────────────────── */}
      <div className="bg-app-surface rounded-3xl border border-app-border overflow-hidden">
        <div className="px-6 py-4 bg-app-bg border-b border-app-border flex justify-between items-center">
          <h3 className="font-semibold text-app-text text-sm">All Discipline Records</h3>
          <span className="text-xs text-app-text/50">
            {isLoading ? "Loading…" : `${filtered.length} case${filtered.length !== 1 ? "s" : ""}`}
          </span>
        </div>

        {isLoading ? (
          <div className="py-24 flex flex-col items-center gap-3 text-app-text/40">
            <Spinner size={28} />
            <p className="text-sm">Loading discipline records…</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-24 flex flex-col items-center gap-3 text-app-text/30">
            <ShieldAlert size={36} />
            <p className="text-sm font-medium text-app-text/40">
              {records.length === 0
                ? "No discipline cases have been logged yet."
                : "No records match your filters."}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-app-bg border-b border-app-border">
                <tr>
                  {[
                    ["Date",      "text-left",   "hidden md:table-cell"],
                    ["Student",   "text-left",   ""],
                    ["Class",     "text-left",   "hidden lg:table-cell"],
                    ["Offense",   "text-left",   "hidden sm:table-cell"],
                    ["Severity",  "text-center", ""],
                    ["Status",    "text-center", ""],
                    ["Actions",   "text-center", ""],
                  ].map(([label, align, hidden]) => (
                    <th
                      key={label}
                      className={`px-5 py-3.5 ${align} text-[10px] font-bold tracking-widest uppercase text-app-text/40 ${hidden}`}
                    >
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#0F2044]/5">
                {filtered.map((record) => {
                  const sev      = SEVERITY_CONFIG[record.severity] || SEVERITY_CONFIG.Medium;
                  const resolved = record.status?.toLowerCase().includes("resolved");

                  return (
                    <tr key={record.id} className="hover:bg-[#FAFAF8] transition-colors">

                      {/* Date */}
                      <td className="px-5 py-4 hidden md:table-cell text-sm text-app-text/60 font-mono whitespace-nowrap">
                        {fmtDate(record.date)}
                      </td>

                      {/* Student */}
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-xl bg-app-primary/8 text-app-text/60 flex items-center justify-center text-xs font-bold flex-shrink-0">
                            {initials(record.studentName || "?")}
                          </div>
                          <div>
                            <div className="text-sm font-semibold text-app-text">{record.studentName || "—"}</div>
                            {record.studentCode && (
                              <div className="text-xs text-app-text/40 font-mono">{record.studentCode}</div>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Class */}
                      <td className="px-5 py-4 hidden lg:table-cell text-sm text-app-text/60">
                        {record.className || "—"}
                      </td>

                      {/* Offense */}
                      <td className="px-5 py-4 hidden sm:table-cell text-sm text-app-text/70 max-w-xs truncate">
                        {record.offense}
                      </td>

                      {/* Severity */}
                      <td className="px-5 py-4 text-center">
                        <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-lg ${sev.bg} ${sev.text}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${sev.dot}`} />
                          {record.severity}
                        </span>
                      </td>

                      {/* Status */}
                      <td className="px-5 py-4 text-center">
                        <span className={`text-xs font-semibold px-2.5 py-1 rounded-lg ${resolved ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
                          {record.status || "Pending Review"}
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="px-5 py-4">
                        <div className="flex justify-center gap-2">
                          <button
                            onClick={() => setViewRecord(record)}
                            className="flex items-center gap-1 text-xs bg-app-primary/5 hover:bg-app-primary/10 text-app-text/70 hover:text-app-text px-3 py-2 rounded-xl transition-colors"
                          >
                            <Eye size={13} /> View
                          </button>
                          <button
                            onClick={() => handleMarkResolved(record.id, record.status)}
                            className={`text-xs px-3 py-2 rounded-xl font-medium transition-colors ${
                              resolved
                                ? "bg-amber-50 text-amber-700 hover:bg-amber-100"
                                : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                            }`}
                          >
                            {resolved ? "Re-open" : "Resolve"}
                          </button>
                          <button
                            onClick={() => handleDelete(record.id)}
                            className="flex items-center gap-1 text-xs bg-red-50 hover:bg-red-100 text-red-600 px-3 py-2 rounded-xl transition-colors"
                          >
                            <Trash2 size={13} />
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
      </div>

      <p className="text-center text-xs text-app-text/40 pt-1">
        Showing all discipline cases submitted by teachers across the school.
        Use the filters above to narrow by class, severity, or status.
      </p>

      {/* ── Detail modal ─────────────────────────────────────────────────────── */}
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