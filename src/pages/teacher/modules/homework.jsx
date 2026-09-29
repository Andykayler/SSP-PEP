import { useState, useEffect, useCallback } from "react";
import { db } from "../../../firebase";
import { fetchMyAssignments } from "../../../services/staffAssignments";
import {
  collection, query, where, getDocs, addDoc, updateDoc, deleteDoc,
  doc, serverTimestamp,
} from "firebase/firestore";
import { notifyHomeworkPosted } from "../../../services/notificationHooks";
import SubmissionPanel from "../../../components/homework/SubmissionPanel";
import {
  Plus, Clock, Calendar, Eye, Edit2, Trash2,
  CheckCircle, AlertCircle,
  BookOpen, FileText, X, Save, Search, RefreshCw,
  Loader2, ChevronDown, Users,
} from "lucide-react";
import AiQuestionMaker from "../../../components/ai/AiQuestionMaker";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmt(dateStr) {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  if (isNaN(d)) return dateStr;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function daysUntil(dateStr) {
  if (!dateStr) return null;
  return Math.ceil((new Date(dateStr) - new Date(new Date().toDateString())) / 864e5);
}

// ─── Shared inline style helpers ──────────────────────────────────────────────

const iconBtnStyle = {
  display: "flex", alignItems: "center", justifyContent: "center",
  width: 34, height: 34, padding: 0, background: "var(--surface)",
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
  background: disabled ? "var(--border-color)" : "linear-gradient(135deg, var(--warning), var(--warning-light))",
  color: disabled ? "var(--text-muted)" : "#1a0f00",
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

function Spinner({ size = 15 }) {
  return <Loader2 size={size} style={{ animation: "spin 0.65s linear infinite" }} />;
}

function Toast({ message, type = "success", onClose }) {
  useEffect(() => {
    const t = setTimeout(onClose, 3200);
    return () => clearTimeout(t);
  }, [onClose]);
  const ok = type === "success";
  return (
    <div style={{
      position: "fixed", bottom: 24, right: 24, zIndex: 200,
      display: "flex", alignItems: "center", gap: 10,
      padding: "13px 20px", borderRadius: "var(--radius-md)",
      background: ok ? "var(--success)" : "#ef4444",
      color: "#fff", fontSize: 13, fontWeight: 500,
      boxShadow: "var(--shadow-lg)",
    }}>
      {ok ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
      {message}
    </div>
  );
}

// ─── Due-date tile (mirrors the period tile used on the Lesson Plans page) ───
function DueTile({ dueDate, overdue, urgent }) {
  const bg     = overdue ? "var(--danger-pale)" : urgent ? "var(--warning-pale)" : "var(--primary-pale)";
  const color  = overdue ? "var(--danger-light)" : urgent ? "var(--warning-light)" : "var(--primary-light)";
  const border = overdue ? "1px solid rgba(239,68,68,0.2)" : urgent ? "1px solid rgba(232,168,0,0.2)" : "1px solid var(--border-color)";
  const d = new Date(dueDate);
  const day   = isNaN(d) ? "—" : d.getDate();
  const month = isNaN(d) ? "" : d.toLocaleDateString("en-GB", { month: "short" });

  return (
    <div style={{
      width: 56, borderRadius: "var(--radius-md)", background: bg, border,
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      padding: "10px 4px", minHeight: 62, flexShrink: 0,
    }}>
      <span style={{ fontFamily: "var(--font-display)", fontSize: 19, color, lineHeight: 1 }}>{day}</span>
      <span style={{ fontSize: 9, marginTop: 3, color, opacity: 0.85, textTransform: "uppercase", fontFamily: "var(--font-mono)", letterSpacing: "0.5px" }}>
        {month}
      </span>
    </div>
  );
}

// ─── Homework row (cc-row pattern) ────────────────────────────────────────────
function HomeworkRow({ hw, onView, onEdit, onDelete }) {
  const days = daysUntil(hw.dueDate);
  const overdue = days !== null && days < 0;
  const urgent  = days !== null && days >= 0 && days <= 2;
  const rate = hw.totalStudents > 0 ? Math.round(((hw.submitted || 0) / hw.totalStudents) * 100) : 0;
  const unsubmitted = (hw.totalStudents || 0) - (hw.submitted || 0);

  return (
    <div className="cc-row" style={{ alignItems: "flex-start" }}>
      <DueTile dueDate={hw.dueDate} overdue={overdue} urgent={urgent} />

      <div className="cc-row__info">
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6, marginBottom: 6 }}>
          <span className="badge badge--blue">{hw.className}</span>
          <span className="badge badge--teal">{hw.subject}</span>
          {overdue && (
            <span className="status-pill" style={{ background: "var(--danger-pale)", color: "var(--danger-light)", border: "1px solid rgba(239,68,68,0.2)" }}>
              <span className="status-pill__dot" /> Overdue
            </span>
          )}
          {urgent && !overdue && (
            <span className="status-pill" style={{ background: "var(--warning-pale)", color: "var(--warning-light)", border: "1px solid rgba(232,168,0,0.2)" }}>
              <span className="status-pill__dot" /> Due soon
            </span>
          )}
        </div>

        <div className="cc-row__name" style={{ fontSize: 14, whiteSpace: "normal", fontFamily: "var(--font-display)", letterSpacing: "0.3px" }}>
          {hw.title}
        </div>

        {hw.description && (
          <p className="cc-row__meta" style={{ whiteSpace: "normal", marginTop: 4, lineHeight: 1.55, maxWidth: 520 }}>
            {hw.description}
          </p>
        )}

        <div style={{ display: "flex", flexWrap: "wrap", gap: 14, marginTop: 8 }}>
          <span className="cc-row__meta" style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <Calendar size={11} /> Due {fmt(hw.dueDate)}
          </span>
          <span className="cc-row__meta" style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <Clock size={11} /> Assigned {fmt(hw.dateAssigned)}
          </span>
          {unsubmitted > 0 && (
            <span className="cc-row__meta" style={{ color: "var(--warning-light)" }}>
              {unsubmitted} unsubmitted
            </span>
          )}
        </div>

        {/* Submission progress */}
        <div style={{ marginTop: 10, maxWidth: 260 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10.5, color: "var(--text-muted)", marginBottom: 4 }}>
            <span>{hw.submitted || 0}/{hw.totalStudents || 0} submitted</span>
            <span style={{ fontWeight: 700, color: "var(--success-light)" }}>{rate}%</span>
          </div>
          <div style={{ height: 5, borderRadius: 99, background: "var(--primary-dim)", overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${rate}%`, background: "linear-gradient(90deg, var(--success), var(--secondary-light))", transition: "width 1s cubic-bezier(0.4,0,0.2,1)" }} />
          </div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 6, flexShrink: 0, marginTop: 2 }}>
        <button onClick={() => onView(hw)} style={iconBtnStyle} title="View"><Eye size={14} /></button>
        <button onClick={() => onEdit(hw)} style={iconBtnStyle} title="Edit"><Edit2 size={14} /></button>
        <button onClick={() => onDelete(hw.id)} style={{ ...iconBtnStyle, color: "#ef4444" }} title="Delete"><Trash2 size={14} /></button>
      </div>
    </div>
  );
}

// ─── Form Modal (New / Edit) ──────────────────────────────────────────────────

function HomeworkFormModal({ hw, myClasses, mySubjects, schoolCode, schoolClassesMap, onSave, onClose }) {
  const isEdit = Boolean(hw);
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState("");

  const [studentCount,        setStudentCount]        = useState(hw?.totalStudents ?? null);
  const [studentCountLoading, setStudentCountLoading] = useState(false);

  const [form, setForm] = useState({
    className:   hw?.className   || myClasses[0]  || "",
    subject:     hw?.subject     || mySubjects[0] || "",
    title:       hw?.title       || "",
    description: hw?.description || "",
    dueDate:     hw?.dueDate     || "",
    submitted:   hw?.submitted   || 0,
  });

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  useEffect(() => {
    if (!form.className || !schoolCode) return;
    const classId = schoolClassesMap[form.className];
    if (!classId) {
      setStudentCount(0);
      return;
    }

    let cancelled = false;
    setStudentCountLoading(true);
    setStudentCount(null);

    getDocs(
      query(
        collection(db, "students"),
        where("schoolCode", "==", schoolCode),
        where("classId",    "==", classId)
      )
    )
      .then((snap) => { if (!cancelled) setStudentCount(snap.size); })
      .catch((err) => { console.error("student count fetch:", err); if (!cancelled) setStudentCount(0); })
      .finally(() => { if (!cancelled) setStudentCountLoading(false); });

    return () => { cancelled = true; };
  }, [form.className, schoolCode, schoolClassesMap]);

  const handleSave = async () => {
    if (!form.title.trim()) { setError("Title is required."); return; }
    if (!form.dueDate)      { setError("Due date is required."); return; }
    if (!form.className)    { setError("Please select a class."); return; }
    setSaving(true);
    setError("");
    try {
      await onSave({ ...form, totalStudents: studentCount ?? 0 });
      onClose();
    } catch (err) {
      setError(err.code === "permission-denied"
        ? "Permission denied. Check your Firestore rules."
        : "Failed to save. Please try again.");
      setSaving(false);
    }
  };

  const countPanel = studentCount === null && !studentCountLoading
    ? { bg: "var(--surface)", border: "1px solid var(--border-color)", iconBg: "var(--primary-pale)", iconColor: "var(--primary-light)" }
    : studentCount === 0
    ? { bg: "var(--warning-pale)", border: "1px solid rgba(232,168,0,0.2)", iconBg: "var(--warning-pale)", iconColor: "var(--warning-light)" }
    : { bg: "var(--success-pale)", border: "1px solid rgba(34,197,94,0.22)", iconBg: "var(--success-pale)", iconColor: "var(--success-light)" };

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)",
      backdropFilter: "blur(4px)", WebkitBackdropFilter: "blur(4px)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, padding: 16,
    }}>
      <div style={{
        background: "var(--card-bg)", borderRadius: "var(--radius-xl)",
        width: "100%", maxWidth: 560, maxHeight: "94vh", overflow: "hidden",
        boxShadow: "var(--shadow-lg)", display: "flex", flexDirection: "column",
        border: "1px solid var(--border-strong)",
      }}>
        <div style={{ background: "var(--hero-bg)", padding: "20px 28px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid var(--border-strong)", flexShrink: 0 }}>
          <h3 style={{ fontFamily: "var(--font-display)", fontSize: "1.15rem", color: "var(--text-primary)", letterSpacing: "0.5px" }}>
            {isEdit ? "Edit Homework" : "Assign New Homework"}
          </h3>
          <button onClick={onClose} style={{ ...iconBtnStyle, background: "transparent", border: "none" }}>
            <X size={20} />
          </button>
        </div>

        <div style={{ overflowY: "auto", padding: 28, display: "flex", flexDirection: "column", gap: 18, flex: 1 }}>
          {error && (
            <div className="alert alert--error">
              <AlertCircle size={15} style={{ flexShrink: 0, marginTop: 1 }} /> {error}
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div>
              <label style={labelStyle}>Class</label>
              <div style={{ position: "relative" }}>
                <select value={form.className} onChange={(e) => set("className", e.target.value)} style={{ ...inputStyle, appearance: "none", paddingRight: 32 }}>
                  {myClasses.length === 0 && <option value="">No classes assigned</option>}
                  {myClasses.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
                <ChevronDown size={13} style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)", pointerEvents: "none" }} />
              </div>
            </div>
            <div>
              <label style={labelStyle}>Subject</label>
              <div style={{ position: "relative" }}>
                <select value={form.subject} onChange={(e) => set("subject", e.target.value)} style={{ ...inputStyle, appearance: "none", paddingRight: 32 }}>
                  {mySubjects.length === 0 && <option value="">No subjects assigned</option>}
                  {mySubjects.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
                <ChevronDown size={13} style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)", pointerEvents: "none" }} />
              </div>
            </div>
          </div>

          {/* Auto-resolved student count */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", borderRadius: "var(--radius-md)", background: countPanel.bg, border: countPanel.border }}>
            <div style={{ width: 32, height: 32, borderRadius: "var(--radius-md)", background: countPanel.iconBg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              {studentCountLoading ? <Spinner size={14} /> : <Users size={14} style={{ color: countPanel.iconColor }} />}
            </div>
            <div>
              <p style={{ ...labelStyle, marginBottom: 2 }}>Students in class</p>
              {studentCountLoading ? (
                <p style={{ fontSize: 13, color: "var(--text-muted)" }}>Counting students…</p>
              ) : studentCount === null ? (
                <p style={{ fontSize: 13, color: "var(--text-muted)" }}>Select a class above</p>
              ) : studentCount === 0 ? (
                <p style={{ fontSize: 13, fontWeight: 600, color: "var(--warning-light)" }}>No students enrolled in {form.className}</p>
              ) : (
                <p style={{ fontSize: 13, fontWeight: 600, color: "var(--success-light)" }}>{studentCount} student{studentCount !== 1 ? "s" : ""} enrolled</p>
              )}
            </div>
          </div>

          <div>
            <label style={labelStyle}>Title *</label>
            <input type="text" placeholder="e.g. Quadratic Equations Exercise" value={form.title} onChange={(e) => set("title", e.target.value)} style={inputStyle} />
          </div>

          <div>
            <label style={labelStyle}>Description / Instructions</label>
            <textarea rows={3} placeholder="Detailed instructions, page numbers, requirements…" value={form.description} onChange={(e) => set("description", e.target.value)} style={{ ...inputStyle, resize: "vertical" }} />
            <div style={{ marginTop: 8 }}>
              <AiQuestionMaker className={form.className} subject={form.subject} topic={form.title}
                onQuestions={(text) => set("description", form.description.trim() ? `${form.description.trim()}

${text}` : text)} />
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div>
              <label style={labelStyle}>Due Date *</label>
              <input type="date" value={form.dueDate} onChange={(e) => set("dueDate", e.target.value)} style={inputStyle} />
            </div>
            {isEdit && (
              <div>
                <label style={labelStyle}>Submitted Count</label>
                <input
                  type="number" min={0} max={studentCount ?? undefined}
                  value={form.submitted}
                  onChange={(e) => set("submitted", parseInt(e.target.value) || 0)}
                  style={inputStyle}
                />
              </div>
            )}
          </div>
        </div>

        <div style={{ padding: "18px 28px", borderTop: "1px solid var(--border-color)", display: "flex", gap: 12, flexShrink: 0 }}>
          <button onClick={onClose} style={ghostBtnStyle}>Cancel</button>
          <button onClick={handleSave} disabled={saving || studentCountLoading} style={saveBtnStyle(saving || studentCountLoading)}>
            {saving ? <Spinner size={15} /> : <Save size={15} />}
            {isEdit ? "Update" : "Assign Homework"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── View Modal ───────────────────────────────────────────────────────────────

function ViewModal({ hw, onClose }) {
  const days = daysUntil(hw.dueDate);
  const overdue = days !== null && days < 0;
  const rate = hw.totalStudents > 0 ? Math.round(((hw.submitted || 0) / hw.totalStudents) * 100) : 0;

  return (
    <div
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)",
        backdropFilter: "blur(4px)", WebkitBackdropFilter: "blur(4px)",
        display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, padding: 16,
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div style={{
        background: "var(--card-bg)", borderRadius: "var(--radius-xl)",
        width: "100%", maxWidth: 480, overflow: "hidden",
        boxShadow: "var(--shadow-lg)", border: "1px solid var(--border-strong)",
      }}>
        <div style={{ background: "var(--hero-bg)", padding: "20px 26px", borderBottom: "1px solid var(--border-strong)", display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
          <div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
              <span className="badge badge--blue">{hw.className}</span>
              <span className="badge badge--teal">{hw.subject}</span>
              {overdue && (
                <span className="status-pill" style={{ background: "var(--danger-pale)", color: "var(--danger-light)", border: "1px solid rgba(239,68,68,0.2)" }}>
                  Overdue
                </span>
              )}
            </div>
            <h3 style={{ fontFamily: "var(--font-display)", fontSize: "1.15rem", color: "var(--text-primary)", lineHeight: 1.3 }}>{hw.title}</h3>
          </div>
          <button onClick={onClose} style={{ ...iconBtnStyle, background: "transparent", border: "none", flexShrink: 0 }}>
            <X size={18} />
          </button>
        </div>

        <div style={{ padding: 26, display: "flex", flexDirection: "column", gap: 18 }}>
          <div style={{ padding: 16, background: "var(--surface)", borderRadius: "var(--radius-md)", border: "1px solid var(--border-color)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <p style={labelStyle}>Submission Progress</p>
              <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>{rate}%</span>
            </div>
            <div style={{ width: "100%", height: 6, borderRadius: 99, background: "var(--primary-dim)", overflow: "hidden", marginBottom: 8 }}>
              <div style={{ height: "100%", width: `${rate}%`, background: "linear-gradient(90deg, var(--success), var(--secondary-light))" }} />
            </div>
            <p style={{ fontSize: 11.5, color: "var(--text-muted)" }}>{hw.submitted || 0} of {hw.totalStudents || 0} submitted</p>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1, background: "var(--primary-dim)", borderRadius: "var(--radius-md)", overflow: "hidden" }}>
            {[
              ["Assigned", fmt(hw.dateAssigned)],
              ["Due Date", fmt(hw.dueDate)],
              ["Class",    hw.className || "—"],
              ["Subject",  hw.subject   || "—"],
            ].map(([k, v]) => (
              <div key={k} style={{ background: "var(--card-bg)", padding: "12px 16px" }}>
                <p style={{ fontSize: 9.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: "1px", color: "var(--text-muted)", marginBottom: 2, fontFamily: "var(--font-mono)" }}>{k}</p>
                <p style={{ fontSize: 13, fontWeight: 500, color: "var(--text-primary)" }}>{v}</p>
              </div>
            ))}
          </div>

          {hw.description && (
            <div style={{ padding: 16, background: "var(--surface)", borderRadius: "var(--radius-md)", border: "1px solid var(--border-color)" }}>
              <p style={labelStyle}>Instructions</p>
              <p style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.6 }}>{hw.description}</p>
            </div>
          )}

          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button onClick={onClose} style={{ ...ghostBtnStyle, flex: "none", padding: "10px 24px" }}>Close</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Module ──────────────────────────────────────────────────────────────

export default function HomeworkModule({ userId, schoolCode, userName, userRole }) {
  const [homework,      setHomework]      = useState([]);
  const [myClasses,     setMyClasses]     = useState([]);
  const [mySubjects,    setMySubjects]    = useState([]);
  const [schoolClassesMap, setSchoolClassesMap] = useState({});

  const [assignLoading, setAssignLoading] = useState(true);
  const [hwLoading,     setHwLoading]     = useState(true);

  const [activeTab,     setActiveTab]     = useState("active");
  const [search,        setSearch]        = useState("");
  const [classFilter,   setClassFilter]   = useState("all");

  const [showNew,       setShowNew]       = useState(false);
  const [editHw,        setEditHw]        = useState(null);
  const [viewHw,        setViewHw]        = useState(null);
  const [toast,         setToast]         = useState(null);
  const [error,         setError]         = useState("");


  const isLoading    = assignLoading || hwLoading;
  const noAssignment = !assignLoading && myClasses.length === 0;

  const showToast = (message, type = "success") => setToast({ message, type });

  // ── Step 1: Load teacher's assigned classes & subjects, resolve classId map ─
  useEffect(() => {
    if (!userId || !schoolCode) return;
    let cancelled = false;
    (async () => {
      setAssignLoading(true);
      try {
        // Only classes and subjects the school still has registered.
        const mine = await fetchMyAssignments(userId, schoolCode);
        if (cancelled) return;
        setMyClasses(mine.classNames);
        setMySubjects(mine.subjects);
        setSchoolClassesMap(Object.fromEntries(mine.classes.map((c) => [c.name, c.id])));
      } catch (err) {
        console.error("Failed to load assignments:", err);
        setError("Could not load your class assignments.");
      } finally {
        if (!cancelled) setAssignLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [userId, schoolCode]);

  // ── Step 2: Fetch homework for this teacher ───────────────────────────────
  const fetchHomework = useCallback(async () => {
    if (!userId) return;
    setHwLoading(true);
    setError("");
    try {
      const snap = await getDocs(
        query(
          collection(db, "homework"),
          where("teacherId",  "==", userId),
          where("schoolCode", "==", schoolCode)
        )
      );
      const list = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .sort((a, b) => {
          const tsA = a.createdAt?.toMillis?.() ?? 0;
          const tsB = b.createdAt?.toMillis?.() ?? 0;
          return tsB - tsA;
        });
      setHomework(list);
    } catch (err) {
      console.error("fetchHomework error:", err);
      setError(`Could not load homework: ${err.message}`);
    } finally {
      setHwLoading(false);
    }
  }, [userId, schoolCode]);

  useEffect(() => {
    if (!assignLoading) fetchHomework();
  }, [fetchHomework, assignLoading]);

  // ── Save (create / update) ────────────────────────────────────────────────
  const saveHomework = async (formData, existingId = null) => {
    const payload = {
      ...formData,
      // The id of the class in `school_classes`, not just its display name —
      // stored so guardians are notified by the same identity the roster uses
      // (see notifyHomeworkPosted / sendHomeworkMessages). Falls back to ""
      // if the class was somehow removed from the map since the form opened.
      classId:    schoolClassesMap[formData.className] || "",
      teacherId:  userId,
      schoolCode,
      updatedAt:  serverTimestamp(),
    };
    if (existingId) {
      await updateDoc(doc(db, "homework", existingId), payload);
      setHomework((prev) =>
        prev.map((h) => (h.id === existingId ? { ...h, ...payload } : h))
      );
      showToast("Homework updated.");
    } else {
      payload.createdAt    = serverTimestamp();
      payload.dateAssigned = new Date().toISOString().slice(0, 10);
      payload.submitted    = 0;
      const ref = await addDoc(collection(db, "homework"), payload);
      setHomework((prev) => [{ id: ref.id, ...payload }, ...prev]);

      // In-app notice and WhatsApp for every guardian of every student in
      // this exact class (matched by classId, so a same-named class on
      // another campus is never included).
      await notifyHomeworkPosted({
        schoolCode,
        classId: payload.classId,
        className: payload.className,
        subject: payload.subject,
        title: payload.title,
        dueDate: payload.dueDate,
        homeworkId: ref.id,
        actor: { id: userId, name: userName || "Class Teacher", role: userRole || "class_teacher" },
      });
      showToast("Homework assigned — guardians are being notified on WhatsApp.");
    }
  };

  // ── Delete ────────────────────────────────────────────────────────────────
  const deleteHomework = async (id) => {
    if (!window.confirm("Delete this homework assignment?")) return;
    try {
      await deleteDoc(doc(db, "homework", id));
      setHomework((prev) => prev.filter((h) => h.id !== id));
      showToast("Homework deleted.");
    } catch {
      showToast("Failed to delete.", "error");
    }
  };

  // ── Derived lists ─────────────────────────────────────────────────────────
  const today = new Date().toISOString().slice(0, 10);

  const filtered = homework.filter((h) => {
    const matchSearch = !search ||
      h.title?.toLowerCase().includes(search.toLowerCase()) ||
      h.className?.toLowerCase().includes(search.toLowerCase()) ||
      h.subject?.toLowerCase().includes(search.toLowerCase());
    const matchClass = classFilter === "all" || h.className === classFilter;
    return matchSearch && matchClass;
  });

  const activeList  = filtered.filter((h) => h.dueDate >= today);
  const overdueList = filtered.filter((h) => h.dueDate <  today);
  const displayList = activeTab === "active" ? activeList : overdueList;

  const avgSubmission = homework.length
    ? Math.round(
        homework.reduce((sum, h) => sum + (h.totalStudents > 0 ? ((h.submitted || 0) / h.totalStudents) * 100 : 0), 0) /
        homework.length
      )
    : 0;

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">

      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="module-title">Homework &amp; Assignments</h2>
          <p className="module-sub">
            {assignLoading
              ? "Loading your assignments…"
              : noAssignment
              ? "No classes assigned yet"
              : `${myClasses.join(" · ")} · ${mySubjects.slice(0, 3).join(" · ")}${mySubjects.length > 3 ? " …" : ""}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={fetchHomework} disabled={isLoading} style={{ ...iconBtnStyle, opacity: isLoading ? 0.4 : 1 }} title="Refresh">
            <RefreshCw size={16} />
          </button>
          {!noAssignment && (
            <button onClick={() => setShowNew(true)} disabled={isLoading} style={primaryBtnStyle(isLoading)}>
              <Plus size={15} /> Assign Homework
            </button>
          )}
        </div>
      </div>

      {/* Parent-app submissions: who has handed work in, and who is asking to
          hand it in late. Sits above the assignment list because a waiting
          request is the only thing here that blocks a family. */}
      {!noAssignment && (
        <SubmissionPanel
          schoolCode={schoolCode}
          teacherId={userId}
          teacherName={userName}
        />
      )}

      {noAssignment && (
        <div className="alert alert--warning">
          <AlertCircle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
          No classes have been assigned to you yet. Ask your head teacher to assign classes from Staff Management.
        </div>
      )}

      {error && (
        <div className="alert alert--error">
          <AlertCircle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
          {error}
        </div>
      )}

      {/* ── Stats ── */}
      {!noAssignment && (
        <div>
          <div className="sec-eyebrow">Homework overview</div>
          <div className="stat-strip">
            {[
              { label: "Total assigned",  value: homework.length,     icon: <FileText width={16} height={16} />, variant: "" },
              { label: "Active",          value: activeList.length,   icon: <BookOpen width={16} height={16} />, variant: "teal" },
              { label: "Overdue",         value: overdueList.length,  icon: <AlertCircle width={16} height={16} />, variant: "" },
              { label: "Avg. submission", value: `${avgSubmission}%`, icon: <CheckCircle width={16} height={16} />, variant: "gold" },
            ].map((c) => (
              <div key={c.label} className="stat-card">
                <div className="stat-card__top">
                  <div className={`stat-card__icon${c.variant ? ` stat-card__icon--${c.variant}` : ""}`}>{c.icon}</div>
                  <span className="stat-card__label">{c.label}</span>
                </div>
                <div className="stat-card__value">{isLoading ? "…" : c.value}</div>
                <div className="stat-card__bar">
                  <div className={`stat-card__bar-fill${c.variant ? ` stat-card__bar-fill--${c.variant}` : ""}`} style={{ width: "60%" }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Tabs + Filters ── */}
      {!noAssignment && (
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="filter-pills" style={{ flexShrink: 0 }}>
            {[
              { id: "active",  label: "Active",  count: activeList.length },
              { id: "overdue", label: "Overdue", count: overdueList.length },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`filter-pill ${activeTab === tab.id ? "filter-pill--active" : "filter-pill--inactive"}`}
                style={activeTab === tab.id && tab.id === "overdue" ? { background: "#ef4444", boxShadow: "0 3px 10px rgba(239,68,68,0.3)" } : undefined}
              >
                {tab.label} <span style={{ marginLeft: 6, opacity: 0.7 }}>{tab.count}</span>
              </button>
            ))}
          </div>

          <div className="search-wrap" style={{ flex: 1 }}>
            <Search size={14} className="search-wrap__icon" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by title, class, or subject…"
              className="search-wrap__input"
            />
          </div>

          {myClasses.length > 1 && (
            <div style={{ position: "relative", flexShrink: 0, minWidth: 150 }}>
              <select
                value={classFilter}
                onChange={(e) => setClassFilter(e.target.value)}
                style={{ ...inputStyle, appearance: "none", paddingRight: 32 }}
              >
                <option value="all">All classes</option>
                {myClasses.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <ChevronDown size={13} style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)", pointerEvents: "none" }} />
            </div>
          )}
        </div>
      )}

      {/* ── List ── */}
      <div className="cc">
        <div className="cc__head">
          <div className="cc__head-left">
            <FileText width={18} height={18} />
            <h3>{activeTab === "active" ? "Active Homework" : "Overdue Homework"}</h3>
          </div>
        </div>
        <div className="cc__body" style={{ padding: 0 }}>
          {isLoading ? (
            <div style={{ padding: "56px 20px", display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
              <div className="spinner" style={{ width: 28, height: 28, borderWidth: 3 }} />
              <p className="module-sub">Loading homework…</p>
            </div>
          ) : displayList.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state__icon"><FileText size={22} /></div>
              <div className="empty-state__title">
                {homework.length === 0 ? "No homework assigned yet" : activeTab === "overdue" ? "Nothing overdue" : "No matches"}
              </div>
              <p className="empty-state__sub">
                {homework.length === 0
                  ? "Create your first homework assignment to get started."
                  : activeTab === "overdue"
                  ? "Great work — no overdue homework right now."
                  : "No homework matches your filter."}
              </p>
            </div>
          ) : (
            displayList.map((hw) => (
              <HomeworkRow key={hw.id} hw={hw} onView={setViewHw} onEdit={setEditHw} onDelete={deleteHomework} />
            ))
          )}
        </div>
      </div>

      <p className="module-sub" style={{ textAlign: "center" }}>
        Homework is scoped to your assigned classes and subjects only.
      </p>

      {/* ── Modals ── */}
      {showNew && (
        <HomeworkFormModal
          myClasses={myClasses}
          mySubjects={mySubjects}
          schoolCode={schoolCode}
          schoolClassesMap={schoolClassesMap}
          onSave={(data) => saveHomework(data)}
          onClose={() => setShowNew(false)}
        />
      )}
      {editHw && (
        <HomeworkFormModal
          hw={editHw}
          myClasses={myClasses}
          mySubjects={mySubjects}
          schoolCode={schoolCode}
          schoolClassesMap={schoolClassesMap}
          onSave={(data) => saveHomework(data, editHw.id)}
          onClose={() => setEditHw(null)}
        />
      )}
      {viewHw && <ViewModal hw={viewHw} onClose={() => setViewHw(null)} />}
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}