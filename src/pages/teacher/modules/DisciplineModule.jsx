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

function initials(name = "") {
  return name.split(" ").filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join("");
}

// ─── Severity / status config — colors pulled from shared CSS custom props ───

const SEVERITY_CONFIG = {
  Low:    { pale: "var(--success-pale)", text: "var(--success-light)", border: "1px solid rgba(34,197,94,0.22)", solid: "var(--success)" },
  Medium: { pale: "var(--warning-pale)", text: "var(--warning-light)", border: "1px solid rgba(232,168,0,0.2)",  solid: "var(--warning)" },
  High:   { pale: "var(--danger-pale)",  text: "var(--danger-light)",  border: "1px solid rgba(239,68,68,0.2)",  solid: "#ef4444" },
};

// ─── Shared inline style helpers ──────────────────────────────────────────────

const iconBtnStyle = {
  display: "flex", alignItems: "center", justifyContent: "center",
  width: 36, height: 36, padding: 0, background: "var(--surface)",
  border: "1px solid var(--border-color)", borderRadius: "var(--radius-md)",
  color: "var(--text-muted)", cursor: "pointer", flexShrink: 0,
  transition: "all var(--transition-base)",
};

const primaryBtnStyle = (disabled) => ({
  display: "flex", alignItems: "center", gap: 8,
  padding: "10px 20px", borderRadius: "var(--radius-md)",
  background: disabled ? "var(--border-color)" : "var(--primary)",
  color: disabled ? "var(--text-muted)" : "#fff",
  border: "none", fontSize: 13, fontWeight: 500,
  cursor: disabled ? "not-allowed" : "pointer",
  transition: "all var(--transition-base)",
  opacity: disabled ? 0.6 : 1, fontFamily: "var(--font-body)",
});

const ghostBtnStyle = {
  flex: 1, padding: "12px 0", borderRadius: "var(--radius-md)",
  background: "var(--bg-primary)", border: "1px solid var(--border-color)",
  color: "var(--text-secondary)", fontSize: 13, fontWeight: 500,
  cursor: "pointer", transition: "all var(--transition-base)",
};

const saveBtnStyle = (disabled) => ({
  flex: 1, padding: "12px 0", borderRadius: "var(--radius-md)",
  background: disabled ? "var(--border-color)" : "var(--primary)",
  color: disabled ? "var(--text-muted)" : "#fff",
  border: "none", fontWeight: 600, fontSize: 13,
  display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
  cursor: disabled ? "not-allowed" : "pointer",
  transition: "all var(--transition-base)",
});

const inputStyle = {
  width: "100%", padding: "11px 14px", borderRadius: "var(--radius-md)",
  border: "1px solid var(--border-color)", background: "var(--input-bg)",
  color: "var(--text-primary)", fontSize: 13, outline: "none",
  fontFamily: "var(--font-body)", boxSizing: "border-box",
};

const labelStyle = {
  fontFamily: "var(--font-mono)", fontSize: 9.5, letterSpacing: "1.5px",
  color: "var(--text-muted)", textTransform: "uppercase",
  marginBottom: 6, display: "block", fontWeight: 600,
};

const thStyle = {
  padding: "13px 18px", textAlign: "left", fontFamily: "var(--font-mono)",
  fontSize: 9.5, fontWeight: 700, letterSpacing: "1px", textTransform: "uppercase",
  color: "var(--text-muted)", whiteSpace: "nowrap",
};

const tdStyle = { padding: "13px 18px", verticalAlign: "middle" };

function Spinner({ size = 15 }) {
  return <Loader2 size={size} style={{ animation: "spin 0.65s linear infinite" }} />;
}

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
  const pendingCount = records.filter((r) => r.status === "Pending Review").length;
  const highCount = records.filter((r) => r.severity === "High").length;

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
          <h2 className="module-title">Discipline Management</h2>
          <p className="module-sub">
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
            style={{ ...iconBtnStyle, opacity: isLoading ? 0.4 : 1 }}
            title="Refresh"
          >
            <RefreshCw size={16} />
          </button>
          {!noAssignment && (
            <button
              onClick={() => { setShowForm(true); setError(""); }}
              disabled={isLoading}
              style={primaryBtnStyle(isLoading)}
            >
              <Plus size={15} /> Log Offense
            </button>
          )}
        </div>
      </div>

      {/* ── No assignment warning ──────────────────────────────────────────── */}
      {noAssignment && (
        <div className="alert alert--warning">
          <AlertCircle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
          No classes have been assigned to you yet. Ask your head teacher to assign
          classes from the Staff Management page.
        </div>
      )}

      {/* ── Error ─────────────────────────────────────────────────────────── */}
      {error && (
        <div className="alert alert--error">
          <AlertCircle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
          {error}
        </div>
      )}

      {/* ── Summary cards ─────────────────────────────────────────────────── */}
      {!noAssignment && (
        <div>
          <div className="sec-eyebrow">Case overview</div>
          <div className="stat-strip">
            {[
              { label: "Total cases",     value: records.length, icon: <ShieldAlert width={16} height={16} />, variant: "" },
              { label: "Pending review",  value: pendingCount,   icon: <AlertCircle width={16} height={16} />, variant: "gold" },
              { label: "High severity",   value: highCount,      icon: <AlertTriangle width={16} height={16} />, variant: "" },
              { label: "Students",        value: students.length, icon: <ShieldAlert width={16} height={16} />, variant: "teal" },
            ].map((c) => (
              <div key={c.label} className="stat-card">
                <div className="stat-card__top">
                  <div className={`stat-card__icon${c.variant ? ` stat-card__icon--${c.variant}` : ""}`}>{c.icon}</div>
                  <span className="stat-card__label">{c.label}</span>
                </div>
                <div className="stat-card__value">{isLoading ? "…" : c.value}</div>
                <div className="stat-card__bar">
                  <div
                    className={`stat-card__bar-fill${c.variant ? ` stat-card__bar-fill--${c.variant}` : ""}`}
                    style={{ width: records.length ? `${Math.round((c.value / Math.max(records.length, 1)) * 100)}%` : "0%" }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Log Offense Form ───────────────────────────────────────────────── */}
      {showForm && (
        <div className="cc">
          <div className="cc__head">
            <div className="cc__head-left">
              <AlertTriangle width={18} height={18} style={{ color: "var(--warning-light)" }} />
              <h3>Log New Discipline Case</h3>
            </div>
            <button onClick={() => { setShowForm(false); setError(""); }} style={{ ...iconBtnStyle, background: "transparent", border: "none" }}>
              <X size={18} />
            </button>
          </div>

          <div className="cc__body" style={{ padding: 24 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              {/* Student selector — scoped to teacher's class */}
              <div>
                <label style={labelStyle}>Student</label>
                <div style={{ position: "relative" }}>
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
                    style={{ ...inputStyle, appearance: "none", paddingRight: 32 }}
                  >
                    <option value="">Select a student…</option>
                    {students.map((s) => (
                      <option key={s.id} value={s.id}>
                        {`${s.firstName ?? ""} ${s.lastName ?? ""}`.trim() || s.fullName || s.id}
                        {s.studentCode ? ` (${s.studentCode})` : ""}
                      </option>
                    ))}
                  </select>
                  <ChevronDown size={14} style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)", pointerEvents: "none" }} />
                </div>
                {students.length === 0 && studentsReady && (
                  <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>No students enrolled in this class.</p>
                )}
              </div>

              {/* Class (read-only, mirrors selected filter) */}
              <div>
                <label style={labelStyle}>Class</label>
                <div style={{ ...inputStyle, background: "var(--bg-primary)", color: "var(--text-secondary)", display: "flex", alignItems: "center" }}>
                  {selectedClass?.name || "—"}
                </div>
              </div>

              {/* Offense */}
              <div style={{ gridColumn: "1 / -1" }}>
                <label style={labelStyle}>Offense / Incident</label>
                <input
                  type="text"
                  value={newRecord.offense}
                  onChange={(e) => setNewRecord({ ...newRecord, offense: e.target.value })}
                  placeholder="Describe the offense clearly…"
                  style={inputStyle}
                />
              </div>

              {/* Severity */}
              <div>
                <label style={labelStyle}>Severity</label>
                <div style={{ display: "flex", gap: 8 }}>
                  {["Low", "Medium", "High"].map((level) => {
                    const cfg = SEVERITY_CONFIG[level];
                    const active = newRecord.severity === level;
                    return (
                      <button
                        key={level}
                        type="button"
                        onClick={() => setNewRecord({ ...newRecord, severity: level })}
                        style={{
                          flex: 1, padding: "11px 0", borderRadius: "var(--radius-md)",
                          fontSize: 13, fontWeight: 500, cursor: "pointer", transition: "all var(--transition-base)",
                          background: active ? cfg.pale : "var(--bg-primary)",
                          color: active ? cfg.text : "var(--text-muted)",
                          border: active ? cfg.border : "1px solid var(--border-color)",
                        }}
                      >
                        {level}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Action */}
              <div>
                <label style={labelStyle}>Action Taken / Recommended</label>
                <input
                  type="text"
                  value={newRecord.action}
                  onChange={(e) => setNewRecord({ ...newRecord, action: e.target.value })}
                  placeholder="e.g. Verbal warning, Suspension…"
                  style={inputStyle}
                />
              </div>
            </div>

            <div style={{ display: "flex", gap: 12, marginTop: 20 }}>
              <button onClick={handleSave} disabled={saving} style={saveBtnStyle(saving)}>
                {saving ? <><Spinner size={15} /> Saving…</> : "Save Discipline Record"}
              </button>
              <button onClick={() => { setShowForm(false); setError(""); }} style={ghostBtnStyle}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Filters ────────────────────────────────────────────────────────── */}
      {!noAssignment && (
        <div className="cc">
          <div className="cc__body" style={{ display: "flex", flexWrap: "wrap", gap: 16, padding: 20 }}>
            <div className="search-wrap" style={{ flex: 1, minWidth: 220 }}>
              <Search size={14} className="search-wrap__icon" />
              <input
                type="text"
                placeholder="Search by student name or offense…"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="search-wrap__input"
              />
            </div>

            <div style={{ position: "relative", minWidth: 170 }}>
              <select
                value={filterClassId}
                onChange={(e) => setFilterClassId(e.target.value)}
                disabled={isLoading || classes.length === 0}
                style={{ ...inputStyle, appearance: "none", paddingRight: 32, opacity: (isLoading || classes.length === 0) ? 0.5 : 1 }}
              >
                {classes.length === 0 && <option value="">No classes</option>}
                {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <ChevronDown size={14} style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)", pointerEvents: "none" }} />
            </div>
          </div>
        </div>
      )}

      {/* ── Table ─────────────────────────────────────────────────────────── */}
      <div className="cc">
        <div className="cc__head">
          <div className="cc__head-left">
            <ShieldAlert width={18} height={18} />
            <h3>Discipline Records</h3>
          </div>
        </div>

        {isLoading ? (
          <div style={{ padding: "56px 20px", display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
            <div className="spinner" style={{ width: 28, height: 28, borderWidth: 3 }} />
            <p className="module-sub">Loading records…</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state__icon"><ShieldAlert size={22} /></div>
            <div className="empty-state__title">
              {records.length === 0 ? "No cases logged" : "No matches"}
            </div>
            <p className="empty-state__sub">
              {records.length === 0
                ? `No discipline cases logged for ${selectedClass?.name || "this class"} yet.`
                : "No records match your search."}
            </p>
          </div>
        ) : (
          <div className="data-table-wrap">
            <table className="data-table data-table--stack">
              <thead style={{ background: "var(--surface)", borderBottom: "1px solid var(--border-color)" }}>
                <tr>
                  <th style={thStyle}>Student</th>
                  <th style={thStyle} className="hidden md:table-cell">Date</th>
                  <th style={thStyle} className="hidden sm:table-cell">Offense</th>
                  <th style={{ ...thStyle, textAlign: "center" }}>Severity</th>
                  <th style={thStyle} className="hidden lg:table-cell">Action</th>
                  <th style={{ ...thStyle, textAlign: "center" }} className="hidden lg:table-cell">Status</th>
                  <th style={{ ...thStyle, textAlign: "center" }}></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((record, i) => {
                  const sev = SEVERITY_CONFIG[record.severity] || SEVERITY_CONFIG.Medium;
                  const resolved = record.status?.toLowerCase().includes("resolved");

                  return (
                    <tr key={record.id} style={{ borderBottom: i < filtered.length - 1 ? "1px solid var(--primary-dim)" : "none" }}>
                      {/* Student */}
                      <td style={tdStyle} data-label="Student">
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <div className="avatar avatar--accent" style={{ width: 34, height: 34, fontSize: 11 }}>
                            {initials(record.studentName || "?")}
                          </div>
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>{record.studentName || "—"}</div>
                            {record.studentCode && (
                              <div style={{ fontSize: 10.5, color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>{record.studentCode}</div>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Date */}
                      <td style={{ ...tdStyle, fontSize: 12.5, color: "var(--text-secondary)" }} className="hidden md:table-cell" data-label="Date">
                        {record.date || "—"}
                      </td>

                      {/* Offense */}
                      <td style={{ ...tdStyle, fontSize: 12.5, color: "var(--text-secondary)", maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} className="hidden sm:table-cell" data-label="Offense">
                        {record.offense}
                      </td>

                      {/* Severity */}
                      <td style={{ ...tdStyle, textAlign: "center" }} data-label="Severity">
                        <span className="status-pill" style={{ background: sev.pale, color: sev.text, border: sev.border }}>
                          <span className="status-pill__dot" />
                          {record.severity}
                        </span>
                      </td>

                      {/* Action */}
                      <td style={{ ...tdStyle, fontSize: 12, color: "var(--text-muted)", maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} className="hidden lg:table-cell" data-label="Action">
                        {record.action}
                      </td>

                      {/* Status */}
                      <td style={{ ...tdStyle, textAlign: "center" }} className="hidden lg:table-cell" data-label="Status">
                        <span className={`status-pill status-pill--${resolved ? "active" : "suspended"}`} style={!resolved ? { background: "var(--warning-pale)", color: "var(--warning-light)", border: "1px solid rgba(232,168,0,0.2)" } : undefined}>
                          {record.status || "Pending Review"}
                        </span>
                      </td>

                      {/* Actions */}
                      <td style={tdStyle} data-label="Actions">
                        <div style={{ display: "flex", justifyContent: "center", gap: 6 }}>
                          <button onClick={() => setViewRecord(record)} style={iconBtnStyle} title="View">
                            <Eye size={13} />
                          </button>
                          <button onClick={() => handleDelete(record.id)} style={{ ...iconBtnStyle, color: "#ef4444" }} title="Delete">
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

      <p className="module-sub" style={{ textAlign: "center" }}>
        Showing discipline records for your assigned classes only. Serious cases are
        automatically escalated to the School Administrator.
      </p>

      {/* ── Record detail modal ────────────────────────────────────────────── */}
      {viewRecord && (
        <div
          style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)",
            backdropFilter: "blur(4px)", WebkitBackdropFilter: "blur(4px)",
            display: "flex", alignItems: "center", justifyContent: "center",
            zIndex: 50, padding: 16,
          }}
          onClick={(e) => e.target === e.currentTarget && setViewRecord(null)}
        >
          <div style={{
            background: "var(--card-bg)", borderRadius: "var(--radius-xl)",
            width: "100%", maxWidth: 480, overflow: "hidden",
            boxShadow: "var(--shadow-lg)", border: "1px solid var(--border-strong)",
          }}>
            {/* Modal header */}
            <div style={{ background: "var(--hero-bg)", padding: "20px 26px", borderBottom: "1px solid var(--border-strong)", display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div className="avatar avatar--navy" style={{ width: 44, height: 44, fontSize: 13 }}>
                  {initials(viewRecord.studentName || "?")}
                </div>
                <div>
                  <h3 style={{ fontFamily: "var(--font-display)", fontSize: "1.1rem", color: "var(--text-primary)", lineHeight: 1.2 }}>
                    {viewRecord.studentName || "—"}
                  </h3>
                  <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 3 }}>
                    {viewRecord.className} · {viewRecord.date}
                  </p>
                </div>
              </div>
              <button onClick={() => setViewRecord(null)} style={{ ...iconBtnStyle, background: "transparent", border: "none", flexShrink: 0 }}>
                <X size={18} />
              </button>
            </div>

            <div style={{ padding: 26, display: "flex", flexDirection: "column", gap: 18 }}>
              {/* Severity + Status */}
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                {(() => {
                  const sev = SEVERITY_CONFIG[viewRecord.severity] || SEVERITY_CONFIG.Medium;
                  return (
                    <span className="status-pill" style={{ background: sev.pale, color: sev.text, border: sev.border, padding: "5px 12px", fontSize: 11 }}>
                      <span className="status-pill__dot" />
                      {viewRecord.severity} Severity
                    </span>
                  );
                })()}
                <span
                  className={`status-pill status-pill--${viewRecord.status?.toLowerCase().includes("resolved") ? "active" : "suspended"}`}
                  style={!viewRecord.status?.toLowerCase().includes("resolved") ? { background: "var(--warning-pale)", color: "var(--warning-light)", border: "1px solid rgba(232,168,0,0.2)", padding: "5px 12px", fontSize: 11 } : { padding: "5px 12px", fontSize: 11 }}
                >
                  {viewRecord.status || "Pending Review"}
                </span>
              </div>

              {/* Offense */}
              <div style={{ padding: 16, background: "var(--surface)", borderRadius: "var(--radius-md)", border: "1px solid var(--border-color)" }}>
                <p style={labelStyle}>Offense / Incident</p>
                <p style={{ fontSize: 13, fontWeight: 500, color: "var(--text-primary)" }}>{viewRecord.offense}</p>
              </div>

              {/* Details grid */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1, background: "var(--primary-dim)", borderRadius: "var(--radius-md)", overflow: "hidden" }}>
                {[
                  ["Student Code", viewRecord.studentCode || "—"],
                  ["Class",        viewRecord.className   || "—"],
                  ["Date",         viewRecord.date        || "—"],
                  ["Reported By",  viewRecord.reportedBy  || "Teacher"],
                ].map(([k, v]) => (
                  <div key={k} style={{ background: "var(--card-bg)", padding: "12px 16px" }}>
                    <p style={{ fontSize: 9.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: "1px", color: "var(--text-muted)", marginBottom: 2, fontFamily: "var(--font-mono)" }}>{k}</p>
                    <p style={{ fontSize: 13, fontWeight: 500, color: "var(--text-primary)" }}>{v}</p>
                  </div>
                ))}
              </div>

              {/* Action */}
              <div style={{ padding: 16, background: "var(--surface)", borderRadius: "var(--radius-md)", border: "1px solid var(--border-color)" }}>
                <p style={labelStyle}>Action Taken / Recommended</p>
                <p style={{ fontSize: 13, color: "var(--text-secondary)" }}>{viewRecord.action || "—"}</p>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <button onClick={() => setViewRecord(null)} style={{ ...ghostBtnStyle, flex: "none", padding: "10px 24px" }}>
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