import { useState, useEffect, useCallback, useRef } from "react";
import { db } from "../../../firebase";
import {
  collection, query, where, getDocs, doc, getDoc,
  setDoc, serverTimestamp,
} from "firebase/firestore";
import { notifyAttendanceSaved } from "../../../services/notificationHooks";
import {
  CheckCircle, XCircle, Clock, Save, Users, Search,
  RefreshCw, AlertCircle, Loader2, ChevronDown, Download, CloudOff, MessageSquare,
} from "lucide-react";
import useOnlineStatus from "../../../hooks/useOnlineStatus";
import { commitWithGrace } from "../../../services/offlineWrite";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fullName(s) {
  return s.fullName || `${s.firstName ?? ""} ${s.lastName ?? ""}`.trim() || "—";
}

function initials(name = "") {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function fmtDate(dateStr) {
  if (!dateStr) return "—";
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

function nowTime() {
  return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

// Firestore doc ID for an attendance record: schoolCode_classId_date
function attendanceDocId(schoolCode, classId, date) {
  return `${schoolCode}_${classId}_${date}`;
}

// ─── Status config — colors pulled from the shared CSS custom properties ─────

const STATUS_CONFIG = {
  Present: {
    label: "Present", icon: CheckCircle,
    solid: "var(--success)", pale: "var(--success-pale)", text: "var(--success-light)", border: "1px solid rgba(34,197,94,0.22)",
  },
  Late: {
    label: "Late", icon: Clock,
    solid: "var(--warning)", pale: "var(--warning-pale)", text: "var(--warning-light)", border: "1px solid rgba(232,168,0,0.2)",
  },
  Absent: {
    label: "Absent", icon: XCircle,
    solid: "#ef4444", pale: "var(--danger-pale)", text: "var(--danger-light)", border: "1px solid rgba(239,68,68,0.2)",
  },
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
  padding: "10px 22px", borderRadius: "var(--radius-md)",
  background: disabled ? "var(--border-color)" : "var(--primary)",
  color: disabled ? "var(--text-muted)" : "#fff",
  border: "none", fontSize: 13, fontWeight: 500,
  cursor: disabled ? "not-allowed" : "pointer",
  transition: "all var(--transition-base)",
  opacity: disabled ? 0.6 : 1, fontFamily: "var(--font-body)",
});

const ghostBtnStyle = (disabled) => ({
  display: "flex", alignItems: "center", gap: 8,
  padding: "10px 18px", borderRadius: "var(--radius-md)",
  background: "var(--surface)", border: "1px solid var(--border-color)",
  color: "var(--text-secondary)", fontSize: 13, fontWeight: 500,
  cursor: disabled ? "not-allowed" : "pointer",
  opacity: disabled ? 0.4 : 1, transition: "all var(--transition-base)",
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

function markBtnStyle(active, cfg) {
  return {
    padding: "6px 12px", fontSize: 11, fontWeight: 600, borderRadius: "var(--radius-md)",
    border: "none", cursor: "pointer", transition: "all var(--transition-base)",
    background: active ? cfg.solid : cfg.pale,
    color: active ? "#fff" : cfg.text,
  };
}

function Spinner({ size = 16 }) {
  return <Loader2 size={size} style={{ animation: "spin 0.65s linear infinite" }} />;
}

// ─── Component ─────────────────────────────────────────────────────────────────

export default function AttendanceModule({ userId, schoolCode, userName, userRole }) {
  // What the register looked like the last time it was persisted. Saving
  // compares against this so correcting one pupil does not re-send "marked
  // absent" to every other absent child's guardian.
  const savedRecordsRef = useRef({});
  const [classes,       setClasses]       = useState([]);
  const [filterClassId, setFilterClassId] = useState("");
  const [students,      setStudents]      = useState([]);
  const [attendance,    setAttendance]    = useState({}); // { studentId: { status, time, remark } }
  const [selectedDate,  setSelectedDate]  = useState(todayISO());
  const [searchTerm,    setSearchTerm]    = useState("");

  const [classesReady,     setClassesReady]     = useState(false);
  const [studentsReady,    setStudentsReady]     = useState(false);
  const [attendanceReady,  setAttendanceReady]   = useState(false);
  const [saving,           setSaving]           = useState(false);
  const [saveStatus,       setSaveStatus]       = useState(""); // "saved" | "queued" | "error" | ""
  const [error,            setError]            = useState("");
  const [expandedRemark,   setExpandedRemark]   = useState(null); // studentId whose remark row is open (mobile)
  const online = useOnlineStatus();

  const isLoading    = !classesReady || !studentsReady || !attendanceReady;
  const noAssignment = classesReady && classes.length === 0;
  const selectedClass = classes.find((c) => c.id === filterClassId);

  // ── Step 1: Load teacher's classes ──────────────────────────────────────────
  useEffect(() => {
    if (!userId || !schoolCode) return;
    let cancelled = false;

    (async () => {
      setClassesReady(false);
      setStudentsReady(false);
      setAttendanceReady(false);
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
          // Clear any stale class selection left over from a previous
          // account/session — otherwise fetchStudents below can still fire
          // against a classId that doesn't belong to this teacher, and the
          // Firestore rejection would surface as a raw "Missing or
          // insufficient permissions" error instead of "No classes assigned".
          setFilterClassId("");
          setClassesReady(true);
          setStudentsReady(true);
          setAttendanceReady(true);
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
          setAttendanceReady(true);
        }
      } catch (err) {
        if (cancelled) return;
        console.error("Failed to load class assignments:", err);
        setError("Could not load your class assignments.");
        setClassesReady(true);
        setStudentsReady(true);
        setAttendanceReady(true);
      }
    })();

    return () => { cancelled = true; };
  }, [userId, schoolCode]);

  // ── Step 2: Load students for selected class ─────────────────────────────────
  const fetchStudents = useCallback(async () => {
    if (!schoolCode || !filterClassId) return;
    setStudentsReady(false);
    setAttendanceReady(false);
    setError("");

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
      setError(err.code === "permission-denied"
        ? "You don't have access to this class yet. Ask your head teacher to assign it to you from Staff Management."
        : `Could not load students: ${err.message}`);
    } finally {
      setStudentsReady(true);
    }
  }, [schoolCode, filterClassId]);

  useEffect(() => {
    if (classesReady && filterClassId) fetchStudents();
  }, [fetchStudents, classesReady, filterClassId]);

  // ── Step 3: Load existing attendance for class + date ────────────────────────
  const fetchAttendance = useCallback(async () => {
    if (!schoolCode || !filterClassId || !selectedDate) return;
    setAttendanceReady(false);

    try {
      const docId   = attendanceDocId(schoolCode, filterClassId, selectedDate);
      const docSnap = await getDoc(doc(db, "attendance", docId));

      if (docSnap.exists()) {
        const saved = docSnap.data().records ?? {};
        savedRecordsRef.current = saved;
        setAttendance(saved);
      } else {
        savedRecordsRef.current = {};
        setAttendance({});
      }
    } catch (err) {
      console.error("fetchAttendance error:", err);
      setAttendance({});
    } finally {
      setAttendanceReady(true);
    }
  }, [schoolCode, filterClassId, selectedDate]);

  useEffect(() => {
    if (studentsReady && filterClassId && selectedDate) fetchAttendance();
  }, [fetchAttendance, studentsReady, filterClassId, selectedDate]);

  // ── Mark individual student ──────────────────────────────────────────────────
  const markStudent = (studentId, status) => {
    setAttendance((prev) => ({
      ...prev,
      [studentId]: {
        ...prev[studentId],
        status,
        time: status === "Present" || status === "Late" ? nowTime() : "",
      },
    }));
    setSaveStatus("");
  };

  const updateRemark = (studentId, remark) => {
    setAttendance((prev) => ({
      ...prev,
      [studentId]: { ...prev[studentId], remark },
    }));
    setSaveStatus("");
  };

  // ── Bulk mark ────────────────────────────────────────────────────────────────
  const markAll = (status) => {
    const time = status === "Present" || status === "Late" ? nowTime() : "";
    const next = {};
    students.forEach((s) => {
      next[s.id] = { ...attendance[s.id], status, time };
    });
    setAttendance((prev) => ({ ...prev, ...next }));
    setSaveStatus("");
  };

  // ── Save to Firestore ─────────────────────────────────────────────────────
  // Offline, setDoc() puts the register in the local cache straight away but
  // its promise does not settle until the write reaches the server. Awaiting it
  // would leave a teacher on "Saving…" for the rest of the lesson with no idea
  // whether the register survived. So the write is raced against a short grace
  // period: if the write wins, it is on the server; if the timer wins, it is
  // durable on this device and Firestore will send it when the network returns.
  // Both are successes — they are worded differently because they mean
  // different things to the person holding the phone.
  const handleSave = async () => {
    if (!filterClassId || !selectedDate) return;
    setSaving(true);
    setSaveStatus("");

    const docId = attendanceDocId(schoolCode, filterClassId, selectedDate);
    const previous = savedRecordsRef.current;

    // Only absences and late arrivals reach guardians, and only ones that
    // changed since the last save — see the hook. Queued offline, these reach
    // families whenever the device next syncs.
    const committed = setDoc(doc(db, "attendance", docId), {
      schoolCode,
      classId:   filterClassId,
      className: selectedClass?.name || "",
      date:      selectedDate,
      teacherId: userId,
      records:   attendance,
      savedAt:   serverTimestamp(),
    }).then(() => notifyAttendanceSaved({
      schoolCode,
      className: selectedClass?.name || "",
      date: selectedDate,
      records: attendance,
      previousRecords: previous,
      students,
      actor: { id: userId, name: userName || "Class Teacher", role: userRole || "class_teacher" },
    }));

    // The register is in the cache the moment setDoc is called, so the diff
    // baseline moves now — re-saving must not re-notify these same families.
    savedRecordsRef.current = attendance;

    const { status, error } = await commitWithGrace(committed, {
      // A queued write that is later refused outright — a rules denial rather
      // than a slow network — must not leave the teacher believing it landed.
      onLateFailure: (err) => {
        console.error("Queued attendance rejected:", err);
        savedRecordsRef.current = previous;
        setSaveStatus("error");
      },
    });

    if (status === "failed") {
      console.error("Save error:", error);
      savedRecordsRef.current = previous;
    }
    setSaveStatus(status === "failed" ? "error" : status);
    if (status !== "failed") {
      setTimeout(() => setSaveStatus(""), status === "queued" ? 6000 : 3500);
    }
    setSaving(false);
  };

  // ── CSV Export ───────────────────────────────────────────────────────────────
  const handleExport = () => {
    const rows = [
      ["Student Code", "Name", "Status", "Time", "Remark"],
      ...filtered.map((s) => {
        const r = attendance[s.id] || {};
        return [s.studentCode, fullName(s), r.status || "Unmarked", r.time || "—", r.remark || ""];
      }),
    ];
    const csv  = rows.map((r) => r.map((v) => `"${v ?? ""}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url  = URL.createObjectURL(blob);
    const a    = Object.assign(document.createElement("a"), {
      href: url,
      download: `attendance_${selectedClass?.name || "class"}_${selectedDate}.csv`,
    });
    a.click();
    URL.revokeObjectURL(url);
  };

  // ── Derived stats ────────────────────────────────────────────────────────────
  const filtered = students.filter((s) => {
    if (!searchTerm) return true;
    const q = searchTerm.toLowerCase();
    return (
      fullName(s).toLowerCase().includes(q) ||
      s.studentCode?.toLowerCase().includes(q)
    );
  });

  const presentCount  = students.filter((s) => attendance[s.id]?.status === "Present").length;
  const lateCount     = students.filter((s) => attendance[s.id]?.status === "Late").length;
  const absentCount   = students.filter((s) => attendance[s.id]?.status === "Absent").length;
  const unmarkedCount = students.filter((s) => !attendance[s.id]?.status).length;

  // ─── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">

      {/* ── Mobile roll-call styles ───────────────────────────────────────────
          Table stays as-is at tablet/desktop widths. Below 640px it's swapped
          for a stacked card per student — bigger tap targets for the mark
          buttons, and no more horizontal scrolling to see a status pill. */}
      <style>{`
        .att-table-desktop { display: block; }
        .att-mobile-list { display: none; }
        .att-bulk-actions { flex-wrap: wrap; }
        @media (max-width: 640px) {
          .att-table-desktop { display: none; }
          .att-mobile-list { display: block; }
          .att-mobile-row {
            display: flex; align-items: center; gap: 8px;
            padding: 8px 12px; border-bottom: 1px solid var(--border-color);
          }
          .att-mobile-row__avatar { width: 30px; height: 30px; font-size: 10.5px; flex-shrink: 0; }
          .att-mobile-row__info { flex: 1; min-width: 0; }
          .att-mobile-row__name {
            font-size: 13px; font-weight: 600; color: var(--text-primary);
            overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
          }
          .att-mobile-row__meta {
            font-size: 10.5px; color: var(--text-muted); margin-top: 1px;
            overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
          }
          .att-mobile-row__marks { display: flex; gap: 4px; flex-shrink: 0; }
          .att-mobile-row__markbtn {
            width: 28px; height: 28px; padding: 0; border-radius: 999px;
            display: flex; align-items: center; justify-content: center;
            font-size: 11px; font-weight: 700; line-height: 1;
          }
          .att-mobile-row__remarkbtn {
            width: 28px; height: 28px; border-radius: 999px; border: none;
            display: flex; align-items: center; justify-content: center; flex-shrink: 0;
            background: var(--surface); color: var(--text-muted); position: relative;
          }
          .att-mobile-row__remarkbtn--filled { color: var(--primary); }
          .att-mobile-row__remarkbtn-dot {
            position: absolute; top: 3px; right: 3px; width: 6px; height: 6px;
            border-radius: 999px; background: var(--primary);
          }
          .att-mobile-remark-row {
            padding: 0 12px 10px 50px; border-bottom: 1px solid var(--border-color);
          }
          .att-mobile-remark-row input {
            width: 100%; box-sizing: border-box; padding: 8px 10px;
            border-radius: var(--radius-md); border: 1px solid var(--border-color);
            background: var(--input-bg); color: var(--text-primary); font-size: 12.5px;
            font-family: var(--font-body); outline: none;
          }
          .att-bulk-actions button { flex: 1 1 auto; }
        }
      `}</style>

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="module-title">Take Attendance</h2>
          <p className="module-sub">
            {isLoading
              ? "Loading…"
              : noAssignment
              ? "No classes assigned yet"
              : selectedClass
              ? `${selectedClass.name} · ${fmtDate(selectedDate)}`
              : "Select a class"}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button onClick={fetchStudents} disabled={isLoading} style={{ ...iconBtnStyle, opacity: isLoading ? 0.4 : 1 }} title="Refresh">
            <RefreshCw size={16} />
          </button>
          <button
            onClick={handleExport}
            disabled={filtered.length === 0 || isLoading}
            style={ghostBtnStyle(filtered.length === 0 || isLoading)}
          >
            <Download size={15} /> Export
          </button>
          <button
            onClick={handleSave}
            disabled={saving || isLoading || students.length === 0}
            style={primaryBtnStyle(saving || isLoading || students.length === 0)}
          >
            {saving ? <Spinner size={16} /> : <Save size={16} />}
            {saving ? "Saving…" : "Save Attendance"}
          </button>
        </div>
      </div>

      {!online && (
        <div className="alert alert--warning">
          <CloudOff size={16} style={{ flexShrink: 0, marginTop: 1 }} />
          You are offline. You can still mark and save this register — it will sync
          to the school as soon as the connection returns.
        </div>
      )}

      {/* ── Save feedback ────────────────────────────────────────────────────── */}
      {saveStatus === "saved" && (
        <div className="alert alert--success">
          <CheckCircle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
          Attendance saved successfully for {selectedClass?.name} on {fmtDate(selectedDate)}.
        </div>
      )}
      {saveStatus === "queued" && (
        <div className="alert alert--warning">
          <CloudOff size={16} style={{ flexShrink: 0, marginTop: 1 }} />
          Saved on this device. {selectedClass?.name} for {fmtDate(selectedDate)} will
          sync to the school — and reach guardians — once you have a connection. It is
          safe to close this page.
        </div>
      )}
      {saveStatus === "error" && (
        <div className="alert alert--error">
          <AlertCircle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
          Failed to save attendance. Please try again.
        </div>
      )}

      {/* ── No assignments ───────────────────────────────────────────────────── */}
      {noAssignment && (
        <div className="alert alert--warning">
          <AlertCircle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
          No classes have been assigned to you yet. Ask your head teacher to assign classes
          from the Staff Management page.
        </div>
      )}

      {/* ── Error ────────────────────────────────────────────────────────────── */}
      {error && (
        <div className="alert alert--error">
          <AlertCircle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
          {error}
        </div>
      )}

      {/* ── Summary cards ────────────────────────────────────────────────────── */}
      {!noAssignment && (
        <div>
          <div className="sec-eyebrow">Today at a glance</div>
          <div className="stat-strip">
            {[
              { label: "Present",  value: presentCount,    icon: <CheckCircle width={16} height={16} />, variant: "teal" },
              { label: "Absent",   value: absentCount,     icon: <XCircle width={16} height={16} />,     variant: "" },
              { label: "Late",     value: lateCount,       icon: <Clock width={16} height={16} />,       variant: "gold" },
              { label: "Total",    value: students.length, icon: <Users width={16} height={16} />,       variant: "" },
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
                    style={{ width: students.length ? `${Math.round((c.value / students.length) * 100)}%` : "0%" }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Filters ──────────────────────────────────────────────────────────── */}
      {!noAssignment && (
        <div className="cc">
          <div className="cc__body" style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "flex-end", padding: 20 }}>
            {/* Class selector */}
            <div style={{ flex: "1 1 180px" }}>
              <label style={labelStyle}>Class</label>
              <div style={{ position: "relative" }}>
                <select
                  value={filterClassId}
                  onChange={(e) => { setFilterClassId(e.target.value); setSaveStatus(""); }}
                  disabled={isLoading || classes.length === 0}
                  style={{ ...inputStyle, appearance: "none", paddingRight: 32, opacity: (isLoading || classes.length === 0) ? 0.5 : 1 }}
                >
                  {classes.length === 0 && <option value="">No classes</option>}
                  {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <ChevronDown size={14} style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)", pointerEvents: "none" }} />
              </div>
            </div>

            {/* Date picker */}
            <div style={{ flex: "1 1 180px" }}>
              <label style={labelStyle}>Date</label>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => { setSelectedDate(e.target.value); setSaveStatus(""); }}
                style={inputStyle}
              />
            </div>

            {/* Search */}
            <div style={{ flex: "1 1 200px" }}>
              <label style={labelStyle}>Search</label>
              <div className="search-wrap">
                <Search size={14} className="search-wrap__icon" />
                <input
                  type="text"
                  placeholder="Name or student code…"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="search-wrap__input"
                />
              </div>
            </div>

            {/* Bulk actions */}
            <div className="att-bulk-actions" style={{ display: "flex", gap: 8, flexShrink: 0, width: "100%", maxWidth: 320 }}>
              <button
                onClick={() => markAll("Present")}
                disabled={students.length === 0 || isLoading}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "11px 16px",
                  borderRadius: "var(--radius-md)", border: "none", fontSize: 11.5, fontWeight: 700,
                  background: STATUS_CONFIG.Present.solid, color: "#fff", cursor: "pointer",
                  opacity: (students.length === 0 || isLoading) ? 0.4 : 1,
                }}
              >
                <CheckCircle size={14} /> All Present
              </button>
              <button
                onClick={() => markAll("Absent")}
                disabled={students.length === 0 || isLoading}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "11px 16px",
                  borderRadius: "var(--radius-md)", border: "none", fontSize: 11.5, fontWeight: 700,
                  background: STATUS_CONFIG.Absent.solid, color: "#fff", cursor: "pointer",
                  opacity: (students.length === 0 || isLoading) ? 0.4 : 1,
                }}
              >
                <XCircle size={14} /> All Absent
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Attendance list ───────────────────────────────────────────────────
          Same data, two renderings: a table for tablet/desktop, cards for
          phones. Only one is visible at a time (see the media query above). */}
      <div className="cc">
        <div className="cc__head">
          <div className="cc__head-left">
            <Users width={18} height={18} />
            <h3>{selectedClass ? `${selectedClass.name} · Roll Call` : "Roll Call"}</h3>
          </div>
          <span style={{ fontSize: 11.5, color: "var(--text-muted)" }}>
            {isLoading
              ? "Loading…"
              : unmarkedCount > 0
              ? `${unmarkedCount} student${unmarkedCount !== 1 ? "s" : ""} unmarked`
              : students.length > 0
              ? "All students marked ✓"
              : ""}
          </span>
        </div>

        {isLoading ? (
          <div style={{ padding: "56px 20px", display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
            <div className="spinner" style={{ width: 28, height: 28, borderWidth: 3 }} />
            <p className="module-sub">Loading attendance…</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state__icon"><Users size={22} /></div>
            <div className="empty-state__title">
              {students.length === 0 ? "No students enrolled" : "No matches"}
            </div>
            <p className="empty-state__sub">
              {students.length === 0
                ? `No students enrolled in ${selectedClass?.name || "this class"} yet.`
                : "No students match your search."}
            </p>
          </div>
        ) : (
          <>
            {/* Desktop / tablet table */}
            <div className="data-table-wrap att-table-desktop">
              <table className="data-table data-table--stack">
                <thead style={{ background: "var(--surface)", borderBottom: "1px solid var(--border-color)" }}>
                  <tr>
                    <th style={thStyle}>Student</th>
                    <th style={thStyle} className="hidden md:table-cell">Student Code</th>
                    <th style={{ ...thStyle, textAlign: "center" }}>Status</th>
                    <th style={{ ...thStyle, textAlign: "center" }} className="hidden sm:table-cell">Time</th>
                    <th style={thStyle} className="hidden lg:table-cell">Remark</th>
                    <th style={{ ...thStyle, textAlign: "center" }}>Mark</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((student, i) => {
                    const record    = attendance[student.id] || {};
                    const status    = record.status || "";
                    const isFemale  = student.gender === "Female";
                    const name      = fullName(student);
                    const cfg       = STATUS_CONFIG[status];

                    return (
                      <tr
                        key={student.id}
                        style={{
                          borderBottom: i < filtered.length - 1 ? "1px solid var(--primary-dim)" : "none",
                          transition: "background 0.15s",
                        }}
                      >
                        {/* Name + avatar */}
                        <td style={tdStyle} data-label="Student">
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <div className={`avatar ${isFemale ? "avatar--pink" : "avatar--blue"}`} style={{ width: 34, height: 34, fontSize: 11 }}>
                              {initials(name)}
                            </div>
                            <div>
                              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>{name}</div>
                              <div style={{ fontSize: 10.5, color: "var(--text-muted)" }}>{student.dob || ""}</div>
                            </div>
                          </div>
                        </td>

                        {/* Student code */}
                        <td style={tdStyle} className="hidden md:table-cell" data-label="Student Code">
                          <span className="student-code-badge">
                            <span className="student-code-badge__text">{student.studentCode}</span>
                          </span>
                        </td>

                        {/* Status badge */}
                        <td style={{ ...tdStyle, textAlign: "center" }} data-label="Status">
                          {status ? (
                            <span className="status-pill" style={{ background: cfg.pale, color: cfg.text, border: cfg.border }}>
                              <span className="status-pill__dot" />
                              {status}
                            </span>
                          ) : (
                            <span className="status-pill" style={{ background: "var(--surface)", color: "var(--text-muted)", border: "1px solid var(--border-color)" }}>
                              Unmarked
                            </span>
                          )}
                        </td>

                        {/* Time */}
                        <td style={{ ...tdStyle, textAlign: "center" }} className="hidden sm:table-cell" data-label="Time">
                          <span style={{ fontSize: 12, color: "var(--text-secondary)", fontFamily: "var(--font-mono)" }}>
                            {record.time || "—"}
                          </span>
                        </td>

                        {/* Remark */}
                        <td style={tdStyle} className="hidden lg:table-cell" data-label="Remark">
                          <input
                            type="text"
                            placeholder="Add remark…"
                            value={record.remark || ""}
                            onChange={(e) => updateRemark(student.id, e.target.value)}
                            style={{
                              width: "100%", background: "transparent", border: "1px solid transparent",
                              borderRadius: "var(--radius-md)", padding: "6px 10px", fontSize: 12, outline: "none",
                              color: "var(--text-secondary)",
                            }}
                            onFocus={(e) => { e.target.style.border = "1px solid var(--border-color)"; e.target.style.background = "var(--surface)"; }}
                            onBlur={(e) => { e.target.style.border = "1px solid transparent"; e.target.style.background = "transparent"; }}
                          />
                        </td>

                        {/* Mark buttons */}
                        <td style={tdStyle} data-label="Mark">
                          <div style={{ display: "flex", gap: 4, justifyContent: "center", flexWrap: "wrap" }}>
                            {["Present", "Late", "Absent"].map((s) => (
                              <button
                                key={s}
                                onClick={() => markStudent(student.id, s)}
                                style={markBtnStyle(status === s, STATUS_CONFIG[s])}
                              >
                                {s}
                              </button>
                            ))}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile list — one compact row per student, so a class of 40+
                still fits without endless scrolling. The remark field is
                hidden behind a small icon and only drops down when tapped;
                a filled dot on that icon flags a remark that's already set. */}
            <div className="att-mobile-list">
              {filtered.map((student) => {
                const record   = attendance[student.id] || {};
                const status   = record.status || "";
                const isFemale = student.gender === "Female";
                const name     = fullName(student);
                const hasRemark = !!record.remark;
                const remarkOpen = expandedRemark === student.id;

                return (
                  <div key={student.id}>
                    <div className="att-mobile-row">
                      <div className={`avatar ${isFemale ? "avatar--pink" : "avatar--blue"} att-mobile-row__avatar`}>
                        {initials(name)}
                      </div>
                      <div className="att-mobile-row__info">
                        <div className="att-mobile-row__name">{name}</div>
                        <div className="att-mobile-row__meta">
                          {student.studentCode}{record.time ? ` · ${record.time}` : ""}
                        </div>
                      </div>
                      <div className="att-mobile-row__marks">
                        {["Present", "Late", "Absent"].map((s) => (
                          <button
                            key={s}
                            className="att-mobile-row__markbtn"
                            onClick={() => markStudent(student.id, s)}
                            title={s}
                            style={markBtnStyle(status === s, STATUS_CONFIG[s])}
                          >
                            {s[0]}
                          </button>
                        ))}
                      </div>
                      <button
                        className={`att-mobile-row__remarkbtn${hasRemark ? " att-mobile-row__remarkbtn--filled" : ""}`}
                        onClick={() => setExpandedRemark(remarkOpen ? null : student.id)}
                        title="Remark"
                      >
                        <MessageSquare size={14} />
                        {hasRemark && <span className="att-mobile-row__remarkbtn-dot" />}
                      </button>
                    </div>
                    {remarkOpen && (
                      <div className="att-mobile-remark-row">
                        <input
                          type="text"
                          autoFocus
                          placeholder="Add remark…"
                          value={record.remark || ""}
                          onChange={(e) => updateRemark(student.id, e.target.value)}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* ── Unmarked warning ─────────────────────────────────────────────────── */}
      {!isLoading && unmarkedCount > 0 && students.length > 0 && (
        <div className="alert alert--warning">
          <AlertCircle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
          {unmarkedCount} student{unmarkedCount !== 1 ? "s are" : " is"} still unmarked.
          Save will record them with no status. Consider using "All Present" or "All Absent" to bulk-mark first.
        </div>
      )}

      <p className="module-sub" style={{ textAlign: "center" }}>
        Attendance is saved per class per date and synced with the Admin Dashboard.
        Past records can be reloaded by selecting a previous date.
      </p>
    </div>
  );
}