import { useState, useEffect, useCallback } from "react";
import { db } from "../../../firebase";
import {
  collection, query, where, getDocs, doc, getDoc,
  setDoc, serverTimestamp,
} from "firebase/firestore";
import { notifyMarksPublished } from "../../../services/notificationHooks";
import { subscribeSchoolSettings, termOptions } from "../../../services/academicTerm";
import {
  Award, AlertTriangle, RefreshCw, Loader2, CheckCircle,
  AlertCircle, Search, ChevronDown, Users,
  BarChart2, Edit3, Save, PieChart, Info, Send,
} from "lucide-react";

function fullName(s) {
  return s.fullName || `${s.firstName ?? ""} ${s.lastName ?? ""}`.trim() || "—";
}

// ─── Assessment components & their weight toward the overall term grade ──────
const ASSESSMENT_TYPES = [
  { id: "CA1",     label: "CA 1",         weight: 0.10 },
  { id: "CA2",     label: "CA 2",         weight: 0.10 },
  { id: "MidTerm", label: "Mid-Term",     weight: 0.20 },
  { id: "EndTerm", label: "End of Term",  weight: 0.60 },
];

function computeWeighted(perComponentScores) {
  let weightedSum = 0, weightUsed = 0;
  ASSESSMENT_TYPES.forEach(({ id, weight }) => {
    const v = perComponentScores[id];
    if (v !== null && v !== undefined && v !== "") {
      weightedSum += Number(v) * weight;
      weightUsed += weight;
    }
  });
  if (weightUsed === 0) return null;
  return {
    score: Math.round((weightedSum / weightUsed) * 10) / 10,
    complete: weightUsed >= 0.999,
  };
}

// ─── MANEB Grade Scale (MSCE) — bucketed onto the shared success/primary/
// warning/danger palette instead of nine bespoke colors ──────────────────────
const MANEB_GRADES = [
  { grade: 1, min: 80, max: 100, remark: "Distinction", tone: "success" },
  { grade: 2, min: 70, max: 79,  remark: "Distinction", tone: "success" },
  { grade: 3, min: 65, max: 69,  remark: "Credit",      tone: "primary" },
  { grade: 4, min: 60, max: 64,  remark: "Credit",      tone: "primary" },
  { grade: 5, min: 55, max: 59,  remark: "Credit",      tone: "primary" },
  { grade: 6, min: 50, max: 54,  remark: "Credit",      tone: "primary" },
  { grade: 7, min: 45, max: 49,  remark: "Pass",        tone: "warning" },
  { grade: 8, min: 40, max: 44,  remark: "Pass",        tone: "warning" },
  { grade: 9, min: 0,  max: 39,  remark: "Fail",        tone: "danger" },
];

const TONE = {
  success: { bg: "var(--success-pale)", color: "var(--success-light)", border: "1px solid rgba(34,197,94,0.22)" },
  primary: { bg: "var(--primary-pale)", color: "var(--primary-light)", border: "1px solid var(--border-color)" },
  warning: { bg: "var(--warning-pale)", color: "var(--warning-light)", border: "1px solid rgba(232,168,0,0.2)" },
  danger:  { bg: "var(--danger-pale)",  color: "var(--danger-light)",  border: "1px solid rgba(239,68,68,0.2)" },
};

function getGradeInfo(score) {
  if (score === null || score === undefined || score === "") return null;
  const n = Number(score);
  if (isNaN(n)) return null;
  const g = MANEB_GRADES.find(g => n >= g.min && n <= g.max) || MANEB_GRADES[MANEB_GRADES.length - 1];
  return { ...g, ...TONE[g.tone] };
}

// ─── shared inline style helpers (same set used across Homework / Lesson
// Plans modules, so all teacher-portal pages read as one design system) ──────
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

const saveBtnStyle = (disabled) => ({
  display: "flex", alignItems: "center", gap: 8,
  padding: "10px 20px", borderRadius: "var(--radius-md)",
  background: disabled ? "var(--border-color)" : "linear-gradient(135deg, var(--warning), var(--warning-light))",
  color: disabled ? "var(--text-muted)" : "#1a0f00",
  border: "none", fontWeight: 600, fontSize: 13,
  cursor: disabled ? "not-allowed" : "pointer",
  transition: "all var(--transition-base)",
});

const inputStyle = {
  padding: "10px 14px", borderRadius: "var(--radius-md)",
  border: "1px solid var(--border-color)", background: "var(--input-bg)",
  color: "var(--text-primary)", fontSize: 13, outline: "none",
  fontFamily: "var(--font-body)", boxSizing: "border-box",
};

const labelStyle = {
  fontFamily: "var(--font-mono)", fontSize: 9.5, letterSpacing: "1.5px",
  color: "var(--text-muted)", textTransform: "uppercase",
  marginBottom: 6, display: "block", fontWeight: 600,
};

function Spinner({ size = 20 }) {
  return <Loader2 size={size} style={{ animation: "spin 0.65s linear infinite", color: "var(--text-muted)" }} />;
}

function Toast({ message, type = "success", onClose }) {
  useEffect(() => {
    const t = setTimeout(onClose, 3500);
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

function GradeBadge({ score }) {
  const g = getGradeInfo(score);
  if (!g) return <span style={{ color: "var(--text-muted)", opacity: 0.4, fontSize: 12 }}>—</span>;
  return (
    <span className="status-pill" style={{ background: g.bg, color: g.color, border: g.border }}>
      <span className="status-pill__dot" /> G{g.grade} · {g.remark}
    </span>
  );
}

// ─── Score input cell ─────────────────────────────────────────────────────────
function ScoreCell({ value, onCommit, disabled }) {
  const [local, setLocal] = useState(value ?? "");
  const [editing, setEditing] = useState(false);

  useEffect(() => { setLocal(value ?? ""); }, [value]);

  const handleBlur = () => {
    setEditing(false);
    const n = local === "" ? null : Math.min(100, Math.max(0, Number(local)));
    if (isNaN(n) && local !== "") { setLocal(value ?? ""); return; }
    if (n !== value) onCommit(n);
  };

  const g = getGradeInfo(value);
  return (
    <td style={{ padding: "10px 12px", textAlign: "center", verticalAlign: "middle", minWidth: 88 }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
        <input
          type="number" min={0} max={100}
          value={local}
          disabled={disabled}
          onChange={e => setLocal(e.target.value)}
          onFocus={() => setEditing(true)}
          onBlur={handleBlur}
          placeholder="—"
          style={{
            width: 64, textAlign: "center", borderRadius: "var(--radius-md)",
            padding: "7px 0", fontSize: 13, fontWeight: 600, outline: "none",
            fontFamily: "var(--font-body)", transition: "all var(--transition-base)",
            background: disabled ? "var(--bg-primary)" : editing ? "var(--surface)" : g ? g.bg : "var(--surface)",
            color: disabled ? "var(--text-muted)" : editing ? "var(--text-primary)" : g ? g.color : "var(--text-muted)",
            border: editing ? "1px solid var(--warning)" : g ? g.border : "1px solid var(--border-color)",
            cursor: disabled ? "not-allowed" : "text",
          }}
        />
        {!editing && g && (
          <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.3px", color: g.color }}>
            G{g.grade} · {g.remark}
          </span>
        )}
      </div>
    </td>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function PerformanceModule({ userId, schoolCode, userName, userRole }) {
  const [classes,       setClasses]       = useState([]);
  const [mySubjects,    setMySubjects]    = useState([]);
  const [selectedClassId,   setSelectedClassId]   = useState("");
  const [classesReady,  setClassesReady]  = useState(false);
  const [studentsReady, setStudentsReady] = useState(false);
  const isLoading = !classesReady || !studentsReady;
  const noAssignment = classesReady && studentsReady && classes.length === 0;

  // Empty until the school's current term arrives — picking a literal default
  // is what let marks be filed under a term the parent app never queries.
  const [selectedTerm, setSelectedTerm] = useState("");
  const [schoolTerm, setSchoolTerm] = useState("");
  const [selectedAssessment, setSelectedAssessment] = useState(ASSESSMENT_TYPES[0].id);
  const [viewMode,     setViewMode]     = useState("marks");
  const [search,       setSearch]       = useState("");

  const [students, setStudents] = useState([]);
  const [marks,    setMarks]    = useState({});
  const [saving,   setSaving]   = useState(false);
  const [toast,    setToast]    = useState(null);
  const [dirty,    setDirty]    = useState(false);
  // When this component's results were last announced to guardians. Saving is
  // silent; publishing is the deliberate act that notifies.
  const [publishedAt, setPublishedAt] = useState(null);
  const [publishing,  setPublishing]  = useState(false);
  const [error,    setError]    = useState("");

  const [overallData,  setOverallData]  = useState({});
  const [overallReady, setOverallReady] = useState(false);

  // The school's term is the default for new entry, but a teacher can still
  // look back at an earlier one from the dropdown.
  useEffect(() => {
    if (!schoolCode) return undefined;
    const unsub = subscribeSchoolSettings(schoolCode, (settings) => {
      const term = settings?.currentTerm || "";
      setSchoolTerm(term);
      setSelectedTerm((chosen) => chosen || term);
    });
    return () => unsub();
  }, [schoolCode]);

  const showToast = (msg, type = "success") => setToast({ message: msg, type });

  const selectedClass = classes.find(c => c.id === selectedClassId);
  const selectedAssessmentLabel = ASSESSMENT_TYPES.find(a => a.id === selectedAssessment)?.label || "";

  const marksDocId = useCallback((assessmentType) => (
    `${schoolCode}_${selectedClassId}_${selectedTerm.replace(/\s+/g, "_")}_${userId}_${assessmentType}`
  ), [schoolCode, selectedClassId, selectedTerm, userId]);

  // 1. Load teacher profile → assigned class names → resolve to school_classes docs
  useEffect(() => {
    if (!userId || !schoolCode) return;
    let cancelled = false;
    (async () => {
      setClassesReady(false);
      setStudentsReady(false);
      setClasses([]);
      setError("");
      try {
        const userSnap = await getDoc(doc(db, "users", userId));
        if (cancelled) return;
        const userData = userSnap.exists() ? userSnap.data() : {};
        const assignedNames    = userData.assignedClasses  || [];
        const assignedSubjects = userData.assignedSubjects || [];
        setMySubjects(assignedSubjects);

        if (assignedNames.length === 0) {
          setClasses([]);
          // Clear any stale class selection left over from a previous
          // account/session — otherwise fetchStudents below can still fire
          // against a classId that doesn't belong to this teacher, and the
          // Firestore rejection would surface as a raw "Missing or
          // insufficient permissions" error instead of "No classes assigned".
          setSelectedClassId("");
          setClassesReady(true);
          setStudentsReady(true);
          return;
        }

        const snap = await getDocs(
          query(collection(db, "school_classes"), where("schoolCode", "==", schoolCode))
        );
        if (cancelled) return;
        const myClasses = snap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .filter(c => assignedNames.includes(c.name));

        setClasses(myClasses);
        setClassesReady(true);
        if (myClasses.length > 0) {
          setSelectedClassId(myClasses[0].id);
        } else {
          setStudentsReady(true);
        }
      } catch (err) {
        if (cancelled) return;
        console.error("load assignments:", err);
        setError("Could not load your class assignments.");
        setClassesReady(true);
        setStudentsReady(true);
      }
    })();
    return () => { cancelled = true; };
  }, [userId, schoolCode]);

  // 2. Fetch students by classId
  const fetchStudents = useCallback(async () => {
    if (!schoolCode || !selectedClassId) return;
    setStudentsReady(false);
    setStudents([]);
    setMarks({});
    setDirty(false);
    try {
      const snap = await getDocs(
        query(
          collection(db, "students"),
          where("schoolCode", "==", schoolCode),
          where("classId",    "==", selectedClassId)
        )
      );
      const list = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (a.lastName || "").localeCompare(b.lastName || ""));
      setStudents(list);
    } catch (err) {
      console.error("fetchStudents:", err);
      setError(err.code === "permission-denied"
        ? "You don't have access to this class yet. Ask your head teacher to assign it to you from Staff Management."
        : "Could not load students: " + err.message);
    } finally {
      setStudentsReady(true);
    }
  }, [schoolCode, selectedClassId]);

  useEffect(() => {
    if (classesReady && selectedClassId) fetchStudents();
  }, [fetchStudents, classesReady, selectedClassId]);

  // 3. Load saved marks whenever class, term, or assessment component changes
  const loadMarks = useCallback(async () => {
    if (!selectedClassId || !schoolCode || !selectedTerm || !userId || !selectedAssessment) return;
    try {
      const snap = await getDoc(doc(db, "ca_marks", marksDocId(selectedAssessment)));
      setMarks(snap.exists() ? (snap.data().marks || {}) : {});
      setPublishedAt(snap.exists() ? (snap.data().publishedAt?.toDate?.() || null) : null);
      setDirty(false);
    } catch (err) {
      console.error("loadMarks:", err);
    }
  }, [selectedClassId, selectedTerm, selectedAssessment, schoolCode, userId, marksDocId]);

  useEffect(() => { loadMarks(); }, [loadMarks]);

  const updateMark = (studentId, subject, score) => {
    setMarks(prev => ({
      ...prev,
      [studentId]: { ...(prev[studentId] || {}), [subject]: score }
    }));
    setDirty(true);
  };

  const saveAllMarks = async () => {
    if (!dirty) return;
    setSaving(true);
    try {
      await setDoc(doc(db, "ca_marks", marksDocId(selectedAssessment)), {
        schoolCode,
        classId:        selectedClassId,
        className:      selectedClass?.name || "",
        term:           selectedTerm,
        assessmentType: selectedAssessment,
        teacherId:      userId,
        subjects:       mySubjects,
        marks,
        updatedAt:      serverTimestamp(),
      }, { merge: true });
      setDirty(false);
      showToast(`${selectedAssessmentLabel} marks saved. Use Publish to notify guardians.`);
    } catch (err) {
      console.error(err);
      showToast("Failed to save marks: " + err.message, "error");
    } finally {
      setSaving(false);
    }
  };

  // Students with at least one score recorded — the only ones worth announcing.
  const scoredStudentIds = Object.keys(marks).filter((id) =>
    Object.values(marks[id] || {}).some((v) => v !== "" && v !== null && v !== undefined));

  /**
   * Announces this component's results to guardians, once. Kept separate from
   * saving because a teacher correcting a single mark would otherwise re-send
   * "new results available" to the whole class every time they hit Save.
   */
  const publishResults = async () => {
    if (scoredStudentIds.length === 0) return;
    if (publishedAt && !window.confirm(
      `These ${selectedAssessmentLabel} marks were already published on `
      + `${publishedAt.toLocaleDateString("en-GB")}. Notify all guardians again?`
    )) return;

    setPublishing(true);
    try {
      if (dirty) await saveAllMarks();
      await notifyMarksPublished({
        schoolCode,
        className: selectedClass?.name || "",
        subject: mySubjects.join(", "),
        assessment: selectedAssessmentLabel,
        term: selectedTerm,
        studentIds: scoredStudentIds,
        actor: { id: userId, name: userName || "Class Teacher", role: userRole || "class_teacher" },
      });
      await setDoc(doc(db, "ca_marks", marksDocId(selectedAssessment)), {
        publishedAt: serverTimestamp(),
        publishedBy: userId,
      }, { merge: true });
      setPublishedAt(new Date());
      showToast(`Guardians of ${scoredStudentIds.length} student${scoredStudentIds.length !== 1 ? "s" : ""} notified.`);
    } catch (err) {
      console.error(err);
      showToast("Could not publish results: " + err.message, "error");
    } finally {
      setPublishing(false);
    }
  };

  // 6. Overall tab — combine all four components with their weights
  const loadOverall = useCallback(async () => {
    if (!selectedClassId || !schoolCode || !selectedTerm || !userId || students.length === 0) return;
    setOverallReady(false);
    try {
      const snaps = await Promise.all(
        ASSESSMENT_TYPES.map(({ id }) => getDoc(doc(db, "ca_marks", marksDocId(id))))
      );
      const byAssessment = {};
      ASSESSMENT_TYPES.forEach(({ id }, i) => {
        byAssessment[id] = snaps[i].exists() ? (snaps[i].data().marks || {}) : {};
      });

      const combined = {};
      students.forEach((s) => {
        combined[s.id] = {};
        mySubjects.forEach((subj) => {
          const perComponent = {};
          ASSESSMENT_TYPES.forEach(({ id }) => {
            const v = byAssessment[id]?.[s.id]?.[subj];
            if (v !== null && v !== undefined && v !== "") perComponent[id] = v;
          });
          combined[s.id][subj] = computeWeighted(perComponent);
        });
      });
      setOverallData(combined);
    } catch (err) {
      console.error("loadOverall:", err);
      showToast("Could not load combined overall marks.", "error");
    } finally {
      setOverallReady(true);
    }
  }, [selectedClassId, selectedTerm, schoolCode, userId, students, mySubjects, marksDocId]);

  useEffect(() => {
    if (viewMode === "overall" && studentsReady && selectedClassId) loadOverall();
  }, [viewMode, loadOverall, studentsReady, selectedClassId]);

  // ── derived data ─────────────────────────────────────────────────────────
  const getStudentAvg = (studentId) => {
    const m = marks[studentId] || {};
    const scores = mySubjects.map(s => m[s]).filter(v => v !== null && v !== undefined && v !== "");
    if (!scores.length) return null;
    return Math.round((scores.reduce((a, b) => a + Number(b), 0) / scores.length) * 10) / 10;
  };

  const studentsWithStats = students.map(s => ({
    ...s,
    average: getStudentAvg(s.id),
    subjectMarks: marks[s.id] || {},
  }));

  const ranked = [...studentsWithStats]
    .filter(s => s.average !== null)
    .sort((a, b) => b.average - a.average)
    .map((s, i) => ({ ...s, rank: i + 1 }));

  const allWithRank = studentsWithStats.map(s => {
    const r = ranked.find(r => r.id === s.id);
    return { ...s, rank: r?.rank ?? null };
  });

  const filtered = allWithRank.filter(s =>
    !search ||
    fullName(s).toLowerCase().includes(search.toLowerCase()) ||
    s.studentCode?.toLowerCase().includes(search.toLowerCase())
  );

  const classAvg = ranked.length
    ? Math.round((ranked.reduce((a, b) => a + b.average, 0) / ranked.length) * 10) / 10
    : null;
  const atRisk    = ranked.filter(s => s.average < 40).length;
  const needsHelp = ranked.filter(s => s.average >= 40 && s.average < 50).length;
  const topPass   = ranked.filter(s => s.average >= 70).length;

  const overallStudents = students.map((s) => {
    const subjMap = overallData[s.id] || {};
    const scores = mySubjects.map((subj) => subjMap[subj]?.score).filter((v) => v !== null && v !== undefined);
    const allComplete = mySubjects.length > 0 && mySubjects.every((subj) => subjMap[subj]?.complete);
    const average = scores.length ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10 : null;
    return { ...s, subjMap, average, complete: allComplete };
  });

  const overallRanked = [...overallStudents]
    .filter((s) => s.average !== null)
    .sort((a, b) => b.average - a.average)
    .map((s, i) => ({ ...s, rank: i + 1 }));

  const overallAllWithRank = overallStudents.map((s) => {
    const r = overallRanked.find((r) => r.id === s.id);
    return { ...s, rank: r?.rank ?? null };
  });

  const overallFiltered = overallAllWithRank.filter((s) =>
    !search ||
    fullName(s).toLowerCase().includes(search.toLowerCase()) ||
    s.studentCode?.toLowerCase().includes(search.toLowerCase())
  );

  const noStudents = classesReady && studentsReady && students.length === 0 && selectedClassId;
  const TERMS = termOptions(schoolTerm || selectedTerm);

  const VIEW_TABS = [
    { id: "marks",     icon: Edit3,     label: "Marks" },
    { id: "ranking",   icon: Award,     label: "Ranking" },
    { id: "analytics", icon: BarChart2, label: "Analytics" },
    { id: "overall",   icon: PieChart,  label: "Overall" },
  ];

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="module-title">Student Performance</h2>
          <p className="module-sub">
            {isLoading
              ? "Loading assignments…"
              : noAssignment
              ? "No classes assigned yet"
              : viewMode === "overall"
              ? `${selectedClass?.name || ""} · Overall (weighted) · ${selectedTerm} · MANEB grade scale (1–9)`
              : `${selectedClass?.name || ""} · ${selectedAssessmentLabel} · MANEB grade scale (1–9)`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => (viewMode === "overall" ? loadOverall() : fetchStudents())}
            disabled={isLoading}
            style={{ ...iconBtnStyle, opacity: isLoading ? 0.4 : 1 }}
            title="Refresh"
          >
            <RefreshCw size={16} />
          </button>
          {dirty && viewMode !== "overall" && (
            <button onClick={saveAllMarks} disabled={saving} style={saveBtnStyle(saving)}>
              {saving ? <Spinner size={15} /> : <Save size={15} />}
              Save {selectedAssessmentLabel} marks
            </button>
          )}
          {viewMode !== "overall" && scoredStudentIds.length > 0 && (
            <button
              onClick={publishResults}
              disabled={publishing}
              style={saveBtnStyle(publishing)}
              title={publishedAt
                ? `Already published ${publishedAt.toLocaleDateString("en-GB")}`
                : "Notify guardians that these results are available"}
            >
              {publishing ? <Spinner size={15} /> : <Send size={15} />}
              {publishedAt ? "Re-publish" : "Publish results"}
            </button>
          )}
        </div>
      </div>

      {noAssignment && (
        <div className="alert alert--warning">
          <AlertCircle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
          No classes assigned yet. Ask your head teacher to assign classes from Staff Management.
        </div>
      )}

      {error && (
        <div className="alert alert--error">
          <AlertCircle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
          {error}
        </div>
      )}

      {/* ── Controls ── */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "flex-end" }}>
        <div>
          <label style={labelStyle}>Class</label>
          <div style={{ position: "relative" }}>
            <select
              value={selectedClassId}
              onChange={e => { setSelectedClassId(e.target.value); setDirty(false); }}
              disabled={isLoading || classes.length === 0}
              style={{ ...inputStyle, appearance: "none", paddingRight: 32, minWidth: 150, opacity: (isLoading || classes.length === 0) ? 0.5 : 1 }}
            >
              {classes.length === 0 && <option value="">No classes</option>}
              {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <ChevronDown size={13} style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)", pointerEvents: "none" }} />
          </div>
        </div>

        <div>
          <label style={labelStyle}>Term</label>
          <div style={{ position: "relative" }}>
            <select
              value={selectedTerm}
              onChange={e => { setSelectedTerm(e.target.value); setDirty(false); }}
              style={{ ...inputStyle, appearance: "none", paddingRight: 32, minWidth: 140 }}
            >
              {TERMS.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <ChevronDown size={13} style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)", pointerEvents: "none" }} />
          </div>
        </div>

        {viewMode !== "overall" && (
          <div>
            <label style={labelStyle}>Assessment</label>
            <div style={{ position: "relative" }}>
              <select
                value={selectedAssessment}
                onChange={e => { setSelectedAssessment(e.target.value); setDirty(false); }}
                style={{ ...inputStyle, appearance: "none", paddingRight: 32, minWidth: 150 }}
              >
                {ASSESSMENT_TYPES.map(a => (
                  <option key={a.id} value={a.id}>{a.label} ({Math.round(a.weight * 100)}%)</option>
                ))}
              </select>
              <ChevronDown size={13} style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)", pointerEvents: "none" }} />
            </div>
          </div>
        )}

        <div className="search-wrap" style={{ flex: 1, minWidth: 180 }}>
          <Search size={14} className="search-wrap__icon" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search students…"
            className="search-wrap__input"
          />
        </div>

        <div className="filter-pills">
          {VIEW_TABS.map(({ id, icon: Icon, label }) => (
            <button
              key={id}
              onClick={() => setViewMode(id)}
              className={`filter-pill ${viewMode === id ? "filter-pill--active" : "filter-pill--inactive"}`}
            >
              <Icon size={13} style={{ marginRight: 5, verticalAlign: -2 }} />{label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Summary cards (per-assessment tabs only) ── */}
      {viewMode !== "overall" && ranked.length > 0 && (
        <div>
          <div className="sec-eyebrow">Assessment overview</div>
          <div className="stat-strip">
            {[
              { label: "Class average",         value: classAvg !== null ? `${classAvg}%` : "—", icon: <BarChart2 width={16} height={16} />, variant: "" },
              { label: "Distinctions (G1–G2)",  value: topPass,   icon: <Award width={16} height={16} />, variant: "teal" },
              { label: "Needs support (G8)",    value: needsHelp, icon: <AlertTriangle width={16} height={16} />, variant: "gold" },
              { label: "Failing (G9)",          value: atRisk,    icon: <AlertCircle width={16} height={16} />, variant: "" },
            ].map((c) => (
              <div key={c.label} className="stat-card">
                <div className="stat-card__top">
                  <div className={`stat-card__icon${c.variant ? ` stat-card__icon--${c.variant}` : ""}`}>{c.icon}</div>
                  <span className="stat-card__label">{c.label}</span>
                </div>
                <div className="stat-card__value">{c.value}</div>
                <div className="stat-card__bar">
                  <div className={`stat-card__bar-fill${c.variant ? ` stat-card__bar-fill--${c.variant}` : ""}`} style={{ width: "60%" }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── MANEB scale reference ── */}
      <details>
        <summary style={{ fontSize: 11, color: "var(--text-muted)", cursor: "pointer", userSelect: "none", display: "flex", alignItems: "center", gap: 6 }}>
          <ChevronDown size={12} /> MANEB Grade Scale Reference
        </summary>
        <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 6, paddingLeft: 18 }}>
          {MANEB_GRADES.map(g => {
            const t = TONE[g.tone];
            return (
              <span key={g.grade} style={{ fontSize: 10, padding: "5px 10px", borderRadius: "var(--radius-md)", background: t.bg, color: t.color, border: t.border, fontWeight: 600 }}>
                G{g.grade}: {g.min}{g.grade < 9 ? `–${g.max}` : "+"}% · {g.remark}
              </span>
            );
          })}
        </div>
      </details>

      {(viewMode !== "overall" ? isLoading : (isLoading || !overallReady)) && (
        <div style={{ padding: "56px 20px", display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
          <div className="spinner" style={{ width: 28, height: 28, borderWidth: 3 }} />
          <p className="module-sub">Loading…</p>
        </div>
      )}

      {noStudents && !isLoading && (
        <div className="empty-state">
          <div className="empty-state__icon"><Users size={22} /></div>
          <div className="empty-state__title">No students found in {selectedClass?.name || "this class"}</div>
          <p className="empty-state__sub">Students need to be enrolled in this class first.</p>
        </div>
      )}

      {!isLoading && !noAssignment && students.length > 0 && (
        <>
          {/* ════ MARKS VIEW ════ */}
          {viewMode === "marks" && (
            <div className="cc">
              <div className="cc__head">
                <div className="cc__head-left">
                  <Edit3 width={18} height={18} />
                  <h3>Enter / Edit {selectedAssessmentLabel} Marks</h3>
                </div>
                {dirty && (
                  <span className="status-pill" style={{ background: "var(--warning-pale)", color: "var(--warning-light)", border: "1px solid rgba(232,168,0,0.2)" }}>
                    <span className="status-pill__dot" /> Unsaved changes
                  </span>
                )}
              </div>
              <p className="module-sub" style={{ padding: "0 20px", marginTop: -4 }}>
                Marks are out of 100 · contributes {Math.round((ASSESSMENT_TYPES.find(a => a.id === selectedAssessment)?.weight || 0) * 100)}% to the Overall term grade
              </p>

              <div className="cc__body" style={{ padding: 0, overflowX: "auto" }}>
                <table className="data-table data-table--stack" style={{ width: "100%" }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: "left", padding: "10px 20px" }}>Student</th>
                      {mySubjects.map(subj => (
                        <th key={subj} style={{ padding: "10px 12px", textAlign: "center", fontSize: 11, fontWeight: 700, color: "var(--text-muted)", whiteSpace: "nowrap" }}>
                          {subj}
                        </th>
                      ))}
                      <th style={{ padding: "10px 12px", textAlign: "center" }}>Average</th>
                      <th style={{ padding: "10px 12px", textAlign: "center" }}>Rank</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((student) => {
                      const avg = student.average;
                      const avgGrade = getGradeInfo(avg);
                      return (
                        <tr key={student.id}>
                          <td style={{ padding: "12px 20px" }} data-label="Student">
                            <p style={{ fontWeight: 600, fontSize: 13, color: "var(--text-primary)" }}>{fullName(student)}</p>
                            <p style={{ fontSize: 10.5, color: "var(--text-muted)" }}>{student.studentCode || student.id}</p>
                          </td>
                          {mySubjects.map(subj => (
                            <ScoreCell
                              key={subj}
                              value={student.subjectMarks[subj] ?? null}
                              onCommit={score => updateMark(student.id, subj, score)}
                            />
                          ))}
                          <td style={{ padding: "10px 12px", textAlign: "center" }} data-label="Average">
                            {avg !== null ? (
                              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                                <span style={{ fontWeight: 700, fontSize: 15, color: avgGrade?.color || "var(--text-primary)" }}>{avg}%</span>
                                {avgGrade && <span style={{ fontSize: 9, fontWeight: 700, color: avgGrade.color }}>G{avgGrade.grade} · {avgGrade.remark}</span>}
                              </div>
                            ) : <span style={{ color: "var(--text-muted)", opacity: 0.4, fontSize: 12 }}>—</span>}
                          </td>
                          <td style={{ padding: "10px 12px", textAlign: "center" }} data-label="Rank">
                            {student.rank ? (
                              <span style={{
                                display: "inline-flex", alignItems: "center", justifyContent: "center",
                                width: 28, height: 28, borderRadius: "var(--radius-md)", fontSize: 12, fontWeight: 700,
                                background: student.rank === 1 ? "var(--warning)" : student.rank <= 3 ? "var(--warning-pale)" : "var(--surface)",
                                color: student.rank === 1 ? "#1a0f00" : student.rank <= 3 ? "var(--warning-light)" : "var(--text-muted)",
                              }}>{student.rank}</span>
                            ) : <span style={{ color: "var(--text-muted)", opacity: 0.3, fontSize: 12 }}>—</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div style={{ padding: "14px 20px", borderTop: "1px solid var(--border-color)", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
                <p className="module-sub" style={{ margin: 0 }}>
                  {students.length} student{students.length !== 1 ? "s" : ""} · {mySubjects.length} subject{mySubjects.length !== 1 ? "s" : ""} ·{" "}
                  {publishedAt
                    ? `published to guardians ${publishedAt.toLocaleDateString("en-GB")}`
                    : "not yet published to guardians"}
                </p>
                <button onClick={saveAllMarks} disabled={!dirty || saving} style={saveBtnStyle(!dirty || saving)}>
                  {saving ? <Spinner size={13} /> : <Save size={13} />}
                  Save {selectedAssessmentLabel} marks
                </button>
              </div>
            </div>
          )}

          {/* ════ RANKING VIEW ════ */}
          {viewMode === "ranking" && (
            <div className="cc">
              <div className="cc__head">
                <div className="cc__head-left">
                  <Award width={18} height={18} />
                  <h3>Class Ranking — {selectedAssessmentLabel} · {selectedTerm}</h3>
                </div>
              </div>
              <div className="cc__body" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {ranked.length === 0 && (
                  <div className="empty-state">
                    <div className="empty-state__icon"><Award size={22} /></div>
                    <div className="empty-state__title">No marks entered yet</div>
                    <p className="empty-state__sub">Enter marks in the Marks view first.</p>
                  </div>
                )}
                {ranked.map((student) => {
                  const g = getGradeInfo(student.average);
                  return (
                    <div key={student.id} className="cc-row" style={{ alignItems: "center" }}>
                      <div style={{
                        width: 40, height: 40, borderRadius: "var(--radius-md)", flexShrink: 0,
                        display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 14,
                        background: student.rank === 1 ? "var(--warning)" : student.rank <= 3 ? "var(--warning-pale)" : "var(--surface)",
                        color: student.rank === 1 ? "#1a0f00" : student.rank <= 3 ? "var(--warning-light)" : "var(--text-muted)",
                        border: "1px solid var(--border-color)",
                      }}>
                        {student.rank}
                      </div>
                      <div className="cc-row__info">
                        <div className="cc-row__name" style={{ fontSize: 14 }}>{fullName(student)}</div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
                          {mySubjects.map(subj => {
                            const score = student.subjectMarks[subj];
                            const sg = getGradeInfo(score);
                            return score !== null && score !== undefined ? (
                              <span key={subj} style={{ fontSize: 9.5, padding: "3px 8px", borderRadius: "var(--radius-md)", fontWeight: 600, background: sg ? sg.bg : "var(--surface)", color: sg ? sg.color : "var(--text-muted)", border: sg ? sg.border : "1px solid var(--border-color)" }}>
                                {subj}: {score}%
                              </span>
                            ) : null;
                          })}
                        </div>
                      </div>
                      <div style={{ textAlign: "right", flexShrink: 0 }}>
                        <p style={{ fontSize: 20, fontWeight: 700, color: g?.color || "var(--text-primary)", fontFamily: "var(--font-display)" }}>{student.average}%</p>
                        {g && <p style={{ fontSize: 10, fontWeight: 700, color: g.color }}>Grade {g.grade} · {g.remark}</p>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ════ ANALYTICS VIEW ════ */}
          {viewMode === "analytics" && (
            <div className="space-y-4">
              <div className="cc">
                <div className="cc__head">
                  <div className="cc__head-left">
                    <BarChart2 width={18} height={18} />
                    <h3>Grade Distribution — {selectedAssessmentLabel}</h3>
                  </div>
                </div>
                <div className="cc__body" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {MANEB_GRADES.map(g => {
                    const t = TONE[g.tone];
                    const count = ranked.filter(s => getGradeInfo(s.average)?.grade === g.grade).length;
                    const pct = ranked.length ? Math.round((count / ranked.length) * 100) : 0;
                    return (
                      <div key={g.grade} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <span style={{ fontSize: 10, fontWeight: 700, width: 92, flexShrink: 0, color: t.color }}>G{g.grade} {g.remark}</span>
                        <div style={{ flex: 1, height: 8, borderRadius: 99, background: "var(--primary-dim)", overflow: "hidden" }}>
                          <div style={{ height: "100%", width: `${pct}%`, borderRadius: 99, background: t.color, transition: "width 0.5s" }} />
                        </div>
                        <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-secondary)", width: 64, textAlign: "right" }}>
                          {count} <span style={{ color: "var(--text-muted)" }}>({pct}%)</span>
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {mySubjects.length > 0 && (
                <div className="cc">
                  <div className="cc__head">
                    <div className="cc__head-left">
                      <BarChart2 width={18} height={18} />
                      <h3>Subject Averages</h3>
                    </div>
                  </div>
                  <div className="cc__body" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    {mySubjects.map(subj => {
                      const scores = students
                        .map(s => marks[s.id]?.[subj])
                        .filter(v => v !== null && v !== undefined && v !== "")
                        .map(Number);
                      const avg = scores.length
                        ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10
                        : null;
                      const g = getGradeInfo(avg);
                      return (
                        <div key={subj} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", width: 128, flexShrink: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{subj}</span>
                          <div style={{ flex: 1, height: 9, borderRadius: 99, background: "var(--primary-dim)", overflow: "hidden" }}>
                            {avg !== null && (
                              <div style={{ height: "100%", width: `${avg}%`, borderRadius: 99, background: g?.color || "var(--primary-light)", transition: "width 0.7s" }} />
                            )}
                          </div>
                          {avg !== null ? (
                            <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                              <span style={{ fontSize: 13, fontWeight: 700, color: g?.color || "var(--text-primary)" }}>{avg}%</span>
                              {g && <span style={{ fontSize: 9, fontWeight: 700, color: g.color }}>G{g.grade}</span>}
                            </div>
                          ) : <span style={{ fontSize: 11, color: "var(--text-muted)", flexShrink: 0 }}>No data</span>}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {ranked.filter(s => s.average < 50).length > 0 && (
                <div className="cc" style={{ background: "var(--warning-pale)", borderColor: "rgba(232,168,0,0.2)" }}>
                  <div className="cc__head" style={{ borderColor: "rgba(232,168,0,0.2)" }}>
                    <div className="cc__head-left">
                      <AlertTriangle width={18} height={18} style={{ color: "var(--warning-light)" }} />
                      <h3 style={{ color: "var(--warning-light)" }}>Students Needing Support</h3>
                    </div>
                  </div>
                  <div className="cc__body" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {ranked.filter(s => s.average < 50).map(s => {
                      const g = getGradeInfo(s.average);
                      const weakSubjects = mySubjects.filter(subj => {
                        const sc = s.subjectMarks[subj];
                        return sc !== null && sc !== undefined && Number(sc) < 50;
                      });
                      return (
                        <div key={s.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "var(--card-bg)", border: "1px solid rgba(232,168,0,0.2)", borderRadius: "var(--radius-md)", padding: "10px 16px" }}>
                          <div>
                            <p style={{ fontWeight: 600, fontSize: 13, color: "var(--text-primary)" }}>{fullName(s)}</p>
                            {weakSubjects.length > 0 && (
                              <p style={{ fontSize: 10.5, color: "var(--warning-light)", marginTop: 2 }}>Struggling: {weakSubjects.join(", ")}</p>
                            )}
                          </div>
                          <div style={{ textAlign: "right" }}>
                            <p style={{ fontWeight: 700, fontSize: 15, color: g?.color }}>{s.average}%</p>
                            <p style={{ fontSize: 10, fontWeight: 700, color: g?.color }}>Grade {g?.grade} · {g?.remark}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ════ OVERALL (WEIGHTED) VIEW ════ */}
          {viewMode === "overall" && (
            <div className="space-y-4">
              <div className="alert alert--info" style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                <Info size={14} style={{ flexShrink: 0, marginTop: 2 }} />
                <span style={{ fontSize: 12.5, lineHeight: 1.55 }}>
                  Overall combines {ASSESSMENT_TYPES.map(a => `${a.label} (${Math.round(a.weight * 100)}%)`).join(" · ")}.
                  Scores marked <strong>Provisional</strong> are calculated from whichever components have been entered so far and will shift once the remaining ones are saved.
                </span>
              </div>

              {overallRanked.length > 0 && (
                <div>
                  <div className="sec-eyebrow">Overall term overview</div>
                  <div className="stat-strip">
                    {(() => {
                      const ov = overallRanked;
                      const ovAvg = ov.length ? Math.round((ov.reduce((a, b) => a + b.average, 0) / ov.length) * 10) / 10 : null;
                      const ovAtRisk = ov.filter(s => s.average < 40).length;
                      const ovNeedsHelp = ov.filter(s => s.average >= 40 && s.average < 50).length;
                      const ovTop = ov.filter(s => s.average >= 70).length;
                      return [
                        { label: "Overall class average", value: ovAvg !== null ? `${ovAvg}%` : "—", icon: <PieChart width={16} height={16} />, variant: "" },
                        { label: "Distinctions (G1–G2)",   value: ovTop,      icon: <Award width={16} height={16} />, variant: "teal" },
                        { label: "Needs support (G8)",     value: ovNeedsHelp,icon: <AlertTriangle width={16} height={16} />, variant: "gold" },
                        { label: "Failing (G9)",           value: ovAtRisk,  icon: <AlertCircle width={16} height={16} />, variant: "" },
                      ].map(c => (
                        <div key={c.label} className="stat-card">
                          <div className="stat-card__top">
                            <div className={`stat-card__icon${c.variant ? ` stat-card__icon--${c.variant}` : ""}`}>{c.icon}</div>
                            <span className="stat-card__label">{c.label}</span>
                          </div>
                          <div className="stat-card__value">{c.value}</div>
                          <div className="stat-card__bar">
                            <div className={`stat-card__bar-fill${c.variant ? ` stat-card__bar-fill--${c.variant}` : ""}`} style={{ width: "60%" }} />
                          </div>
                        </div>
                      ));
                    })()}
                  </div>
                </div>
              )}

              <div className="cc">
                <div className="cc__head">
                  <div className="cc__head-left">
                    <PieChart width={18} height={18} />
                    <h3>Overall Term Grade — {selectedTerm}</h3>
                  </div>
                </div>

                {!overallReady ? (
                  <div style={{ padding: "56px 20px", display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
                    <Spinner size={24} />
                    <p className="module-sub">Combining assessment components…</p>
                  </div>
                ) : (
                  <div className="cc__body" style={{ padding: 0, overflowX: "auto" }}>
                    <table className="data-table data-table--stack" style={{ width: "100%" }}>
                      <thead>
                        <tr>
                          <th style={{ textAlign: "left", padding: "10px 20px" }}>Student</th>
                          {mySubjects.map(subj => (
                            <th key={subj} style={{ padding: "10px 12px", textAlign: "center", fontSize: 11, fontWeight: 700, color: "var(--text-muted)", whiteSpace: "nowrap" }}>{subj}</th>
                          ))}
                          <th style={{ padding: "10px 12px", textAlign: "center" }}>Overall</th>
                          <th style={{ padding: "10px 12px", textAlign: "center" }}>Rank</th>
                        </tr>
                      </thead>
                      <tbody>
                        {overallFiltered.map((student) => {
                          const avgGrade = getGradeInfo(student.average);
                          return (
                            <tr key={student.id}>
                              <td style={{ padding: "12px 20px" }} data-label="Student">
                                <p style={{ fontWeight: 600, fontSize: 13, color: "var(--text-primary)" }}>{fullName(student)}</p>
                                <p style={{ fontSize: 10.5, color: "var(--text-muted)" }}>{student.studentCode || student.id}</p>
                                {!student.complete && student.average !== null && (
                                  <span style={{ display: "inline-block", marginTop: 4, fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: "var(--radius-md)", background: "var(--warning-pale)", color: "var(--warning-light)" }}>
                                    Provisional
                                  </span>
                                )}
                              </td>
                              {mySubjects.map(subj => {
                                const cell = student.subjMap[subj];
                                const g = getGradeInfo(cell?.score);
                                return (
                                  <td key={subj} style={{ padding: "10px 12px", textAlign: "center" }} data-label={subj}>
                                    {cell ? (
                                      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                                        <span style={{ fontWeight: 600, fontSize: 13, color: g?.color || "var(--text-primary)" }}>{cell.score}%</span>
                                        {!cell.complete && <span style={{ fontSize: 8.5, fontWeight: 700, color: "var(--warning-light)" }}>partial</span>}
                                      </div>
                                    ) : <span style={{ color: "var(--text-muted)", opacity: 0.4, fontSize: 12 }}>—</span>}
                                  </td>
                                );
                              })}
                              <td style={{ padding: "10px 12px", textAlign: "center" }} data-label="Overall">
                                {student.average !== null ? (
                                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                                    <span style={{ fontWeight: 700, fontSize: 15, color: avgGrade?.color || "var(--text-primary)" }}>{student.average}%</span>
                                    {avgGrade && <span style={{ fontSize: 9, fontWeight: 700, color: avgGrade.color }}>G{avgGrade.grade} · {avgGrade.remark}</span>}
                                  </div>
                                ) : <span style={{ color: "var(--text-muted)", opacity: 0.4, fontSize: 12 }}>—</span>}
                              </td>
                              <td style={{ padding: "10px 12px", textAlign: "center" }} data-label="Rank">
                                {student.rank ? (
                                  <span style={{
                                    display: "inline-flex", alignItems: "center", justifyContent: "center",
                                    width: 28, height: 28, borderRadius: "var(--radius-md)", fontSize: 12, fontWeight: 700,
                                    background: student.rank === 1 ? "var(--warning)" : student.rank <= 3 ? "var(--warning-pale)" : "var(--surface)",
                                    color: student.rank === 1 ? "#1a0f00" : student.rank <= 3 ? "var(--warning-light)" : "var(--text-muted)",
                                  }}>{student.rank}</span>
                                ) : <span style={{ color: "var(--text-muted)", opacity: 0.3, fontSize: 12 }}>—</span>}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}

                <div style={{ padding: "12px 20px", borderTop: "1px solid var(--border-color)" }}>
                  <p className="module-sub" style={{ margin: 0 }}>
                    Overall is read-only here — go to the Marks tab and select CA 1, CA 2, Mid-Term, or End of Term to enter scores for a specific component.
                  </p>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}