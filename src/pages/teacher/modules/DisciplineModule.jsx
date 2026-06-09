import { useState, useEffect, useCallback } from "react";
import { db } from "../../../firebase";
import {
  collection, query, where, getDocs, addDoc, deleteDoc,
  doc, getDoc, serverTimestamp,
} from "firebase/firestore";
import {
  AlertTriangle, Plus, Trash2, Eye, RefreshCw,
  AlertCircle, Loader2, ChevronDown, X, Search, ShieldAlert,
} from "lucide-react";

// ─── Helpers ────────────────────────────────────────────────────────────────

function Spinner({ size = 20 }) {
  return <Loader2 size={size} className="animate-spin text-app-text/40 inline-block" />;
}

function initials(name = "") {
  return name.split(" ").filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join("");
}

const SEVERITY_CONFIG = {
  Low:    { bg: "bg-emerald-100", text: "text-emerald-700", dot: "bg-emerald-500" },
  Medium: { bg: "bg-amber-100",   text: "text-amber-700",   dot: "bg-amber-500"   },
  High:   { bg: "bg-red-100",     text: "text-red-700",     dot: "bg-red-500"     },
};

// ─── Component ───────────────────────────────────────────────────────────────

export default function DisciplineModule({ userId, schoolCode }) {
  const [classes,        setClasses]        = useState([]);
  const [students,       setStudents]       = useState([]);
  const [records,        setRecords]        = useState([]);
  const [filterClassId,  setFilterClassId]  = useState("");
  const [searchTerm,     setSearchTerm]     = useState("");
  const [showForm,       setShowForm]       = useState(false);
  const [viewRecord,     setViewRecord]     = useState(null);
  const [error,          setError]          = useState("");
  const [saving,         setSaving]         = useState(false);

  const [classesReady,   setClassesReady]   = useState(false);
  const [studentsReady,  setStudentsReady]  = useState(false);
  const [recordsReady,   setRecordsReady]   = useState(false);

  const isLoading    = !classesReady || !studentsReady || !recordsReady;
  const noAssignment = classesReady && studentsReady && recordsReady && classes.length === 0;

  const [newRecord, setNewRecord] = useState({
    studentId: "", studentName: "", offense: "", severity: "Medium", action: "",
  });

  // ── Step 1: Load teacher's assigned classes ───────────────────────────────
  useEffect(() => {
    if (!userId || !schoolCode) return;
    let cancelled = false;

    (async () => {
      setClassesReady(false);
      setStudentsReady(false);
      setRecordsReady(false);
      setClasses([]);
      setError("");

      try {
        const userSnap = await getDoc(doc(db, "users", userId));
        if (cancelled) return;

        const assignedNames = userSnap.exists()
          ? userSnap.data().assignedClasses ?? []
          : [];

        if (assignedNames.length === 0) {
          setClasses([]);
          setClassesReady(true);
          setStudentsReady(true);
          setRecordsReady(true);
          return;
        }

        const snap = await getDocs(
          query(collection(db, "school_classes"), where("schoolCode", "==", schoolCode))
        );
        if (cancelled) return;

        const myClasses = snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .filter((c) => assignedNames.includes(c.name));

        setClasses(myClasses);
        setClassesReady(true);

        if (myClasses.length > 0) {
          setFilterClassId(myClasses[0].id);
        } else {
          setStudentsReady(true);
          setRecordsReady(true);
        }
      } catch (err) {
        if (cancelled) return;
        console.error("Failed to load class assignments:", err);
        setError("Could not load your class assignments.");
        setClassesReady(true);
        setStudentsReady(true);
        setRecordsReady(true);
      }
    })();

    return () => { cancelled = true; };
  }, [userId, schoolCode]);

  // ── Step 2: Fetch students for selected class ─────────────────────────────
  const fetchStudents = useCallback(async () => {
    if (!schoolCode || !filterClassId) return;
    setStudentsReady(false);
    try {
      const snap = await getDocs(
        query(
          collection(db, "students"),
          where("schoolCode", "==", schoolCode),
          where("classId",   "==", filterClassId)
        )
      );
      const list = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (a.lastName || "").localeCompare(b.lastName || ""));
      setStudents(list);
    } catch (err) {
      console.error("fetchStudents error:", err);
      setError(`Could not load students: ${err.message}`);
    } finally {
      setStudentsReady(true);
    }
  }, [schoolCode, filterClassId]);

  // ── Step 3: Fetch discipline records for selected class ───────────────────
  const fetchRecords = useCallback(async () => {
    if (!schoolCode || !filterClassId) return;
    setRecordsReady(false);
    try {
      const snap = await getDocs(
        query(
          collection(db, "discipline_cases"),
          where("schoolCode", "==", schoolCode),
          where("classId",    "==", filterClassId)
        )
      );
      const list = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .sort((a, b) => {
          // Sort newest first — handle Firestore Timestamps and ISO strings
          const toMs = (v) =>
            v?.toMillis?.() ?? (v ? new Date(v).getTime() : 0);
          return toMs(b.createdAt) - toMs(a.createdAt);
        });
      setRecords(list);
    } catch (err) {
      console.error("fetchRecords error:", err);
      setError(`Could not load discipline records: ${err.message}`);
    } finally {
      setRecordsReady(true);
    }
  }, [schoolCode, filterClassId]);

  useEffect(() => {
    if (classesReady && filterClassId) {
      fetchStudents();
      fetchRecords();
    }
  }, [fetchStudents, fetchRecords, classesReady, filterClassId]);

  // ── Filtered records ──────────────────────────────────────────────────────
  const filtered = records.filter((r) => {
    if (!searchTerm) return true;
    const q = searchTerm.toLowerCase();
    return (
      r.studentName?.toLowerCase().includes(q) ||
      r.offense?.toLowerCase().includes(q) ||
      r.studentCode?.toLowerCase().includes(q)
    );
  });

  const selectedClass = classes.find((c) => c.id === filterClassId);

  // ── Save new record ───────────────────────────────────────────────────────
  async function handleSave() {
    if (!newRecord.studentId || !newRecord.offense.trim()) {
      setError("Please select a student and describe the offense.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const student = students.find((s) => s.id === newRecord.studentId);
      await addDoc(collection(db, "discipline_cases"), {
        studentId:    newRecord.studentId,
        studentName:  newRecord.studentName,
        studentCode:  student?.studentCode || "",
        classId:      filterClassId,
        className:    selectedClass?.name || "",
        offense:      newRecord.offense.trim(),
        severity:     newRecord.severity,
        action:       newRecord.action.trim() || "Pending review",
        reportedByUid: userId,
        schoolCode,
        date:         new Date().toISOString().split("T")[0],
        status:       "Pending Review",
        createdAt:    serverTimestamp(),
      });
      setNewRecord({ studentId: "", studentName: "", offense: "", severity: "Medium", action: "" });
      setShowForm(false);
      fetchRecords();
    } catch (err) {
      console.error("Error saving record:", err);
      setError("Failed to save record. Please check your permissions.");
    } finally {
      setSaving(false);
    }
  }

  // ── Delete record ─────────────────────────────────────────────────────────
  async function handleDelete(id) {
    if (!window.confirm("Delete this discipline record?")) return;
    try {
      await deleteDoc(doc(db, "discipline_cases", id));
      fetchRecords();
    } catch (err) {
      console.error("Error deleting:", err);
      setError("Failed to delete record.");
    }
  }

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2
            className="text-3xl font-bold text-app-text"
            style={{ fontFamily: "'Playfair Display', serif" }}
          >
            Discipline Management
          </h2>
          <p className="text-app-text/60 mt-1">
            {isLoading
              ? "Loading your assignments…"
              : noAssignment
              ? "No classes assigned yet"
              : `${selectedClass?.name || ""} · ${filtered.length} record${filtered.length !== 1 ? "s" : ""} shown`}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => { fetchStudents(); fetchRecords(); }}
            disabled={isLoading}
            className="p-2.5 bg-app-surface border border-app-border rounded-xl hover:bg-app-bg transition-colors text-app-text/60 disabled:opacity-40 disabled:cursor-not-allowed"
            title="Refresh"
          >
            <RefreshCw size={16} />
          </button>
          {!noAssignment && (
            <button
              onClick={() => { setShowForm(true); setError(""); }}
              disabled={isLoading}
              className="flex items-center gap-2 bg-app-primary hover:bg-black text-white px-5 py-2.5 rounded-2xl font-medium text-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Plus size={15} /> Log Offense
            </button>
          )}
        </div>
      </div>

      {/* ── No assignment warning ──────────────────────────────────────────── */}
      {noAssignment && (
        <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 text-amber-800 p-4 rounded-2xl text-sm">
          <AlertCircle size={16} className="shrink-0 mt-0.5" />
          No classes have been assigned to you yet. Ask your head teacher to assign
          classes from the Staff Management page.
        </div>
      )}

      {/* ── Error ─────────────────────────────────────────────────────────── */}
      {error && (
        <div className="flex items-start gap-3 bg-red-50 border border-red-200 text-red-700 p-4 rounded-2xl text-sm">
          <AlertCircle size={16} className="shrink-0 mt-0.5" />
          {error}
        </div>
      )}

      {/* ── Log Offense Form ───────────────────────────────────────────────── */}
      {showForm && (
        <div className="bg-app-surface rounded-3xl border border-app-border p-6 shadow-sm">
          <div className="flex items-center justify-between mb-5">
            <h3 className="font-semibold text-lg flex items-center gap-2 text-app-text">
              <AlertTriangle size={18} className="text-amber-500" />
              Log New Discipline Case
            </h3>
            <button
              onClick={() => { setShowForm(false); setError(""); }}
              className="text-app-text/40 hover:text-app-text transition-colors"
            >
              <X size={18} />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Student selector — scoped to teacher's class */}
            <div>
              <label className="block text-[10px] font-bold tracking-widest text-app-text/50 mb-1.5 uppercase">
                Student
              </label>
              <div className="relative">
                <select
                  value={newRecord.studentId}
                  onChange={(e) => {
                    const s = students.find((st) => st.id === e.target.value);
                    setNewRecord({
                      ...newRecord,
                      studentId:   e.target.value,
                      studentName: s ? `${s.firstName ?? ""} ${s.lastName ?? ""}`.trim() || s.fullName || "" : "",
                    });
                  }}
                  className="appearance-none w-full pl-4 pr-10 py-3 border border-app-border rounded-2xl text-sm focus:outline-none focus:border-[#0F2044]/40 text-app-text bg-app-surface"
                >
                  <option value="">Select a student…</option>
                  {students.map((s) => (
                    <option key={s.id} value={s.id}>
                      {`${s.firstName ?? ""} ${s.lastName ?? ""}`.trim() || s.fullName || s.id}
                      {s.studentCode ? ` (${s.studentCode})` : ""}
                    </option>
                  ))}
                </select>
                <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-app-text/40 pointer-events-none" />
              </div>
              {students.length === 0 && studentsReady && (
                <p className="text-xs text-app-text/40 mt-1">No students enrolled in this class.</p>
              )}
            </div>

            {/* Class (read-only, mirrors selected filter) */}
            <div>
              <label className="block text-[10px] font-bold tracking-widest text-app-text/50 mb-1.5 uppercase">
                Class
              </label>
              <div className="px-4 py-3 bg-app-bg border border-app-border rounded-2xl text-sm text-app-text/70 font-medium">
                {selectedClass?.name || "—"}
              </div>
            </div>

            {/* Offense */}
            <div className="md:col-span-2">
              <label className="block text-[10px] font-bold tracking-widest text-app-text/50 mb-1.5 uppercase">
                Offense / Incident
              </label>
              <input
                type="text"
                value={newRecord.offense}
                onChange={(e) => setNewRecord({ ...newRecord, offense: e.target.value })}
                placeholder="Describe the offense clearly…"
                className="w-full px-4 py-3 border border-app-border rounded-2xl text-sm focus:outline-none focus:border-[#0F2044]/40"
              />
            </div>

            {/* Severity */}
            <div>
              <label className="block text-[10px] font-bold tracking-widest text-app-text/50 mb-1.5 uppercase">
                Severity
              </label>
              <div className="flex gap-2">
                {["Low", "Medium", "High"].map((level) => {
                  const cfg = SEVERITY_CONFIG[level];
                  const active = newRecord.severity === level;
                  return (
                    <button
                      key={level}
                      type="button"
                      onClick={() => setNewRecord({ ...newRecord, severity: level })}
                      className={`flex-1 py-3 rounded-2xl text-sm font-medium transition-all border ${
                        active
                          ? `${cfg.bg} ${cfg.text} border-transparent`
                          : "bg-app-surface border-app-border text-app-text/50 hover:border-app-border"
                      }`}
                    >
                      {level}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Action */}
            <div>
              <label className="block text-[10px] font-bold tracking-widest text-app-text/50 mb-1.5 uppercase">
                Action Taken / Recommended
              </label>
              <input
                type="text"
                value={newRecord.action}
                onChange={(e) => setNewRecord({ ...newRecord, action: e.target.value })}
                placeholder="e.g. Verbal warning, Suspension…"
                className="w-full px-4 py-3 border border-app-border rounded-2xl text-sm focus:outline-none focus:border-[#0F2044]/40"
              />
            </div>
          </div>

          <div className="flex gap-3 mt-5">
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex-1 bg-app-primary text-white py-3 rounded-2xl font-medium text-sm hover:bg-black transition-all disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {saving ? <><Spinner size={15} /> Saving…</> : "Save Discipline Record"}
            </button>
            <button
              onClick={() => { setShowForm(false); setError(""); }}
              className="flex-1 bg-app-bg hover:bg-[#EDEBE6] text-app-text py-3 rounded-2xl font-medium text-sm transition-all"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ── Filters ────────────────────────────────────────────────────────── */}
      {!noAssignment && (
        <div className="bg-app-surface rounded-3xl p-5 border border-app-border flex flex-col md:flex-row gap-4">
          {/* Search */}
          <div className="flex-1 relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-app-text/40 w-4 h-4" />
            <input
              type="text"
              placeholder="Search by student name or offense…"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-11 pr-4 py-3 bg-[#FAFAF8] border border-app-border rounded-2xl text-sm focus:outline-none focus:border-[#0F2044]/30"
            />
          </div>

          {/* Class selector */}
          <div className="relative">
            <select
              value={filterClassId}
              onChange={(e) => setFilterClassId(e.target.value)}
              disabled={isLoading || classes.length === 0}
              className="appearance-none pl-4 pr-10 py-3 bg-app-surface border border-app-border rounded-2xl text-sm focus:outline-none focus:border-[#0F2044]/40 text-app-text min-w-[160px] disabled:opacity-50"
            >
              {classes.length === 0 && <option value="">No classes</option>}
              {classes.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-app-text/40 pointer-events-none" />
          </div>
        </div>
      )}

      {/* ── Table ─────────────────────────────────────────────────────────── */}
      <div className="bg-app-surface rounded-3xl border border-app-border overflow-hidden">
        {isLoading ? (
          <div className="py-24 flex flex-col items-center gap-3 text-app-text/40">
            <Spinner size={28} />
            <p className="text-sm">Loading records…</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-24 flex flex-col items-center gap-3 text-app-text/30">
            <ShieldAlert size={36} />
            <p className="text-sm font-medium text-app-text/40">
              {records.length === 0
                ? `No discipline cases logged for ${selectedClass?.name || "this class"} yet.`
                : "No records match your search."}
            </p>
          </div>
        ) : (
          <div className="data-table-wrap">
<table className="data-table data-table--stack">
            <thead className="bg-app-bg border-b border-app-border">
              <tr>
                {[
                  ["Student",  "text-left",   ""],
                  ["Date",     "text-left",   "hidden md:table-cell"],
                  ["Offense",  "text-left",   "hidden sm:table-cell"],
                  ["Severity", "text-center", ""],
                  ["Action",   "text-left",   "hidden lg:table-cell"],
                  ["Status",   "text-center", "hidden lg:table-cell"],
                  ["",         "text-center", ""],
                ].map(([label, align, hidden], i) => (
                  <th
                    key={i}
                    className={`px-6 py-4 ${align} text-[10px] font-bold tracking-widest uppercase text-app-text/40 ${hidden}`}
                  >
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#0F2044]/5">
              {filtered.map((record) => {
                const sev = SEVERITY_CONFIG[record.severity] || SEVERITY_CONFIG.Medium;
                const resolved = record.status?.toLowerCase().includes("resolved");

                return (
                  <tr key={record.id} className="hover:bg-[#FAFAF8] transition-colors">
                    {/* Student */}
                    <td className="px-6 py-4" data-label="Field">
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

                    {/* Date */}
                    <td className="px-6 py-4 hidden md:table-cell text-sm text-app-text/60" data-label="Field">
                      {record.date || "—"}
                    </td>

                    {/* Offense */}
                    <td className="px-6 py-4 hidden sm:table-cell text-sm text-app-text/70 max-w-xs truncate" data-label="Field">
                      {record.offense}
                    </td>

                    {/* Severity */}
                    <td className="px-6 py-4 text-center" data-label="Field">
                      <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-lg ${sev.bg} ${sev.text}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${sev.dot}`} />
                        {record.severity}
                      </span>
                    </td>

                    {/* Action */}
                    <td className="px-6 py-4 hidden lg:table-cell text-xs text-app-text/60 max-w-[180px] truncate" data-label="Field">
                      {record.action}
                    </td>

                    {/* Status */}
                    <td className="px-6 py-4 text-center hidden lg:table-cell" data-label="Field">
                      <span className={`text-xs font-semibold px-2.5 py-1 rounded-lg ${resolved ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
                        {record.status || "Pending Review"}
                      </span>
                    </td>

                    {/* Actions */}
                    <td className="px-6 py-4" data-label="Field">
                      <div className="flex justify-center gap-2">
                        <button
                          onClick={() => setViewRecord(record)}
                          className="flex items-center gap-1 text-xs bg-app-primary/5 hover:bg-app-primary/10 text-app-text/70 hover:text-app-text px-3 py-2 rounded-xl transition-colors"
                        >
                          <Eye size={13} /> View
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
        Showing discipline records for your assigned classes only. Serious cases are
        automatically escalated to the School Administrator.
      </p>

      {/* ── Record detail modal ────────────────────────────────────────────── */}
      {viewRecord && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={(e) => e.target === e.currentTarget && setViewRecord(null)}
        >
          <div className="bg-app-surface rounded-3xl w-full max-w-md overflow-hidden shadow-2xl">
            {/* Modal header */}
            <div className="bg-app-primary px-7 py-5 flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-app-surface/10 flex items-center justify-center text-sm font-bold text-white">
                  {initials(viewRecord.studentName || "?")}
                </div>
                <div>
                  <h3 className="text-white font-bold text-lg leading-tight">
                    {viewRecord.studentName || "—"}
                  </h3>
                  <p className="text-white/50 text-xs mt-0.5">
                    {viewRecord.className} · {viewRecord.date}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setViewRecord(null)}
                className="text-white/50 hover:text-white transition-colors p-1"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-7 space-y-5">
              {/* Severity + Status */}
              <div className="flex items-center gap-3">
                {(() => {
                  const sev = SEVERITY_CONFIG[viewRecord.severity] || SEVERITY_CONFIG.Medium;
                  return (
                    <span className={`inline-flex items-center gap-1.5 text-sm font-semibold px-3 py-1.5 rounded-xl ${sev.bg} ${sev.text}`}>
                      <span className={`w-2 h-2 rounded-full ${sev.dot}`} />
                      {viewRecord.severity} Severity
                    </span>
                  );
                })()}
                <span className={`text-sm font-semibold px-3 py-1.5 rounded-xl ${viewRecord.status?.toLowerCase().includes("resolved") ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
                  {viewRecord.status || "Pending Review"}
                </span>
              </div>

              {/* Offense */}
              <div className="p-4 bg-app-bg rounded-2xl border border-app-border">
                <p className="text-[10px] font-bold uppercase tracking-widest text-app-text/40 mb-1.5">
                  Offense / Incident
                </p>
                <p className="text-sm text-app-text font-medium">{viewRecord.offense}</p>
              </div>

              {/* Details grid */}
              <div className="grid grid-cols-2 gap-px bg-app-primary/5 rounded-2xl overflow-hidden text-sm">
                {[
                  ["Student Code", viewRecord.studentCode || "—"],
                  ["Class",        viewRecord.className   || "—"],
                  ["Date",         viewRecord.date        || "—"],
                  ["Reported By",  viewRecord.reportedBy  || "Teacher"],
                ].map(([k, v]) => (
                  <div key={k} className="bg-app-surface px-4 py-3">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-app-text/40 mb-0.5">{k}</p>
                    <p className="font-medium text-app-text">{v}</p>
                  </div>
                ))}
              </div>

              {/* Action */}
              <div className="p-4 bg-app-bg rounded-2xl border border-app-border">
                <p className="text-[10px] font-bold uppercase tracking-widest text-app-text/40 mb-1.5">
                  Action Taken / Recommended
                </p>
                <p className="text-sm text-app-text/70">{viewRecord.action || "—"}</p>
              </div>

              <div className="flex justify-end pt-1">
                <button
                  onClick={() => setViewRecord(null)}
                  className="px-6 py-2.5 border border-app-border rounded-xl hover:bg-app-bg text-sm font-medium transition-colors text-app-text/70"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}