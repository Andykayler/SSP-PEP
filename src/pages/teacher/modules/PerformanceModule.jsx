import { useState, useEffect, useCallback } from "react";
import { db } from "../../../firebase";
import {
  collection, query, where, getDocs, doc, getDoc,
  setDoc, serverTimestamp,
} from "firebase/firestore";
import {
  Award, AlertTriangle, RefreshCw, Loader2, CheckCircle,
  AlertCircle, Search, ChevronDown, Users,
  BarChart2, Edit3, Save,
} from "lucide-react";

function fullName(s) {
  return s.fullName || `${s.firstName ?? ""} ${s.lastName ?? ""}`.trim() || "—";
}

// ─── MANEB Grade Scale (MSCE) ─────────────────────────────────────────────────
const MANEB_GRADES = [
  { grade: 1, min: 80, max: 100, remark: "Distinction", color: "text-emerald-700", bg: "bg-emerald-100", border: "border-emerald-200" },
  { grade: 2, min: 70, max: 79,  remark: "Distinction", color: "text-emerald-600", bg: "bg-emerald-50",  border: "border-emerald-200" },
  { grade: 3, min: 65, max: 69,  remark: "Credit",      color: "text-blue-700",    bg: "bg-blue-100",    border: "border-blue-200" },
  { grade: 4, min: 60, max: 64,  remark: "Credit",      color: "text-blue-600",    bg: "bg-blue-50",     border: "border-blue-200" },
  { grade: 5, min: 55, max: 59,  remark: "Credit",      color: "text-sky-600",     bg: "bg-sky-50",      border: "border-sky-200" },
  { grade: 6, min: 50, max: 54,  remark: "Credit",      color: "text-sky-500",     bg: "bg-sky-50",      border: "border-sky-200" },
  { grade: 7, min: 45, max: 49,  remark: "Pass",        color: "text-amber-600",   bg: "bg-amber-50",    border: "border-amber-200" },
  { grade: 8, min: 40, max: 44,  remark: "Pass",        color: "text-amber-500",   bg: "bg-amber-50",    border: "border-amber-200" },
  { grade: 9, min: 0,  max: 39,  remark: "Fail",        color: "text-red-600",     bg: "bg-red-50",      border: "border-red-200" },
];

function getGradeInfo(score) {
  if (score === null || score === undefined || score === "") return null;
  const n = Number(score);
  if (isNaN(n)) return null;
  return MANEB_GRADES.find(g => n >= g.min && n <= g.max) || MANEB_GRADES[MANEB_GRADES.length - 1];
}

function GradeBadge({ score, small = false }) {
  const g = getGradeInfo(score);
  if (!g) return <span className="text-app-text/30 text-xs">—</span>;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg border font-bold
      ${small ? "text-[10px]" : "text-xs"} ${g.bg} ${g.color} ${g.border}`}>
      G{g.grade} <span className="font-normal opacity-70">{g.remark}</span>
    </span>
  );
}

function Spinner({ size = 20 }) {
  return <Loader2 size={size} className="animate-spin text-app-text/40 inline-block" />;
}

function Toast({ message, type = "success", onClose }) {
  useEffect(() => {
    const t = setTimeout(onClose, 3500);
    return () => clearTimeout(t);
  }, [onClose]);
  return (
    <div className={`fixed bottom-6 right-6 z-[200] flex items-center gap-3 px-5 py-3.5
      rounded-2xl shadow-xl text-sm font-medium
      ${type === "success" ? "bg-emerald-600 text-white" : "bg-red-600 text-white"}`}>
      {type === "success" ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
      {message}
    </div>
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
    <td className="px-3 py-3 text-center align-middle" style={{ minWidth: 88 }}>
      <div className="flex flex-col items-center gap-1">
        <input
          type="number" min={0} max={100}
          value={local}
          disabled={disabled}
          onChange={e => setLocal(e.target.value)}
          onFocus={() => setEditing(true)}
          onBlur={handleBlur}
          placeholder="—"
          className={`w-16 text-center rounded-xl border py-1.5 text-sm font-semibold outline-none transition-all
            ${disabled ? "bg-app-bg text-app-text/30 border-transparent cursor-not-allowed"
            : editing ? "border-[#F4B400] bg-app-surface shadow-sm text-app-text"
            : g ? `${g.bg} ${g.color} ${g.border}` : "border-app-border bg-app-surface text-app-text/40"}
          `}
        />
        {!editing && g && (
          <span className={`text-[9px] font-bold tracking-wide ${g.color}`}>
            G{g.grade} · {g.remark}
          </span>
        )}
      </div>
    </td>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function PerformanceModule({ userId, schoolCode }) {
  // ── class/subject assignments (mirrors StudentModule pattern) ──────────────
  const [classes,       setClasses]       = useState([]); // resolved school_classes docs
  const [mySubjects,    setMySubjects]    = useState([]);
  const [selectedClassId,   setSelectedClassId]   = useState("");
  const [classesReady,  setClassesReady]  = useState(false);
  const [studentsReady, setStudentsReady] = useState(false);
  const isLoading = !classesReady || !studentsReady;
  const noAssignment = classesReady && studentsReady && classes.length === 0;

  const [selectedTerm, setSelectedTerm] = useState("Term 1 2026");
  const [viewMode,     setViewMode]     = useState("marks");
  const [search,       setSearch]       = useState("");

  const [students, setStudents] = useState([]);
  const [marks,    setMarks]    = useState({});
  const [saving,   setSaving]   = useState(false);
  const [toast,    setToast]    = useState(null);
  const [dirty,    setDirty]    = useState(false);
  const [error,    setError]    = useState("");

  const showToast = (msg, type = "success") => setToast({ message: msg, type });

  const selectedClass = classes.find(c => c.id === selectedClassId);

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

  // 2. Fetch students by classId (exactly as StudentModule does)
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
      setError("Could not load students: " + err.message);
    } finally {
      setStudentsReady(true);
    }
  }, [schoolCode, selectedClassId]);

  useEffect(() => {
    if (classesReady && selectedClassId) fetchStudents();
  }, [fetchStudents, classesReady, selectedClassId]);

  // 3. Load saved marks whenever class or term changes
  const loadMarks = useCallback(async () => {
    if (!selectedClassId || !schoolCode || !selectedTerm || !userId) return;
    try {
      const docId = `${schoolCode}_${selectedClassId}_${selectedTerm.replace(/\s+/g, "_")}_${userId}`;
      const snap = await getDoc(doc(db, "ca_marks", docId));
      if (snap.exists()) {
        setMarks(snap.data().marks || {});
      } else {
        setMarks({});
      }
      setDirty(false);
    } catch (err) {
      console.error("loadMarks:", err);
    }
  }, [selectedClassId, selectedTerm, schoolCode, userId]);

  useEffect(() => { loadMarks(); }, [loadMarks]);

  // 4. Update a mark locally
  const updateMark = (studentId, subject, score) => {
    setMarks(prev => ({
      ...prev,
      [studentId]: { ...(prev[studentId] || {}), [subject]: score }
    }));
    setDirty(true);
  };

  // 5. Save all marks to Firestore
  const saveAllMarks = async () => {
    if (!dirty) return;
    setSaving(true);
    try {
      const docId = `${schoolCode}_${selectedClassId}_${selectedTerm.replace(/\s+/g, "_")}_${userId}`;
      await setDoc(doc(db, "ca_marks", docId), {
        schoolCode,
        classId:   selectedClassId,
        className: selectedClass?.name || "",
        term:      selectedTerm,
        teacherId: userId,
        subjects:  mySubjects,
        marks,
        updatedAt: serverTimestamp(),
      });
      setDirty(false);
      showToast("Marks saved successfully.");
    } catch (err) {
      console.error(err);
      showToast("Failed to save marks: " + err.message, "error");
    } finally {
      setSaving(false);
    }
  };

  // ── helpers ───────────────────────────────────────────────────────────────
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

  const noStudents = classesReady && studentsReady && students.length === 0 && selectedClassId;

  const TERMS = ["Term 1 2026", "Term 2 2026", "Term 3 2025", "Term 1 2025", "Term 2 2025"];

  return (
    <div className="space-y-5">
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-app-text">Student Performance</h2>
          <p className="text-sm text-app-text/55 mt-0.5">
            {isLoading
              ? "Loading assignments…"
              : noAssignment
              ? "No classes assigned yet"
              : `${selectedClass?.name || ""} · Continuous Assessment · MANEB grade scale (1–9)`}
          </p>
        </div>
        <div className="flex gap-2 shrink-0 flex-wrap">
          <button
            onClick={fetchStudents}
            disabled={isLoading}
            className="p-2.5 bg-app-surface border border-app-border rounded-xl hover:bg-app-bg transition-colors text-app-text/60 disabled:opacity-40 disabled:cursor-not-allowed"
            title="Refresh"
          >
            <RefreshCw size={16} />
          </button>
          {dirty && (
            <button
              onClick={saveAllMarks}
              disabled={saving}
              className="flex items-center gap-2 px-5 py-2.5 bg-app-warning text-app-text rounded-2xl hover:brightness-105 transition-all font-bold text-sm disabled:opacity-60"
            >
              {saving ? <Spinner size={15} /> : <Save size={15} />}
              Save marks
            </button>
          )}
        </div>
      </div>

      {noAssignment && (
        <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 text-amber-800 p-4 rounded-2xl text-sm">
          <AlertCircle size={16} className="shrink-0 mt-0.5" />
          No classes assigned yet. Ask your head teacher to assign classes from Staff Management.
        </div>
      )}

      {error && (
        <div className="flex items-start gap-3 bg-red-50 border border-red-200 text-red-700 p-4 rounded-2xl text-sm">
          <AlertCircle size={16} className="shrink-0 mt-0.5" />
          {error}
        </div>
      )}

      {/* ── Controls ── */}
      <div className="flex flex-wrap gap-3 items-end">
        <div>
          <label className="text-[10px] font-bold tracking-widest text-app-text/45 block mb-1">CLASS</label>
          <select
            value={selectedClassId}
            onChange={e => { setSelectedClassId(e.target.value); setDirty(false); }}
            disabled={isLoading || classes.length === 0}
            className="px-4 py-2.5 bg-app-surface border border-app-border rounded-xl text-sm focus:outline-none focus:border-[#0F2044]/40 text-app-text font-medium disabled:opacity-50"
          >
            {classes.length === 0 && <option value="">No classes</option>}
            {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className="text-[10px] font-bold tracking-widest text-app-text/45 block mb-1">TERM</label>
          <select
            value={selectedTerm}
            onChange={e => setSelectedTerm(e.target.value)}
            className="px-4 py-2.5 bg-app-surface border border-app-border rounded-xl text-sm focus:outline-none focus:border-[#0F2044]/40 text-app-text"
          >
            {TERMS.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div className="relative flex-1 min-w-[180px]">
          <Search size={13} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-app-text/35" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search students…"
            className="w-full pl-9 pr-4 py-2.5 bg-app-surface border border-app-border rounded-xl text-sm focus:outline-none focus:border-[#0F2044]/30 text-app-text"
          />
        </div>
        <div className="flex gap-1 ml-auto">
          {[
            { id: "marks",     icon: Edit3,    label: "Marks" },
            { id: "ranking",   icon: Award,    label: "Ranking" },
            { id: "analytics", icon: BarChart2, label: "Analytics" },
          ].map(({ id, icon: Icon, label }) => (
            <button
              key={id}
              onClick={() => setViewMode(id)}
              className={`flex items-center gap-1.5 px-3.5 py-2.5 text-xs font-semibold rounded-xl transition-all
                ${viewMode === id ? "bg-app-primary text-white" : "bg-app-surface border border-app-border text-app-text/60 hover:border-[#0F2044]/25"}`}
            >
              <Icon size={13} />{label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Summary cards ── */}
      {ranked.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Class average", value: classAvg !== null ? `${classAvg}%` : "—", sub: classAvg !== null ? getGradeInfo(classAvg)?.remark : "", color: "text-app-text" },
            { label: "Distinctions (G1–G2)", value: topPass, sub: `≥70%`, color: "text-emerald-700" },
            { label: "Needs support (G8)", value: needsHelp, sub: "40–49%", color: "text-amber-600" },
            { label: "Failing (G9)", value: atRisk, sub: "<40%", color: "text-red-600" },
          ].map(c => (
            <div key={c.label} className="bg-app-surface rounded-2xl border border-app-border p-4">
              <p className="text-[11px] text-app-text/50 mb-1">{c.label}</p>
              <p className={`text-2xl font-bold ${c.color}`}>{c.value}</p>
              <p className="text-[10px] text-app-text/40 mt-0.5">{c.sub}</p>
            </div>
          ))}
        </div>
      )}

      {/* ── MANEB scale reference ── */}
      <details className="group">
        <summary className="text-[11px] text-app-text/45 cursor-pointer select-none hover:text-app-text/70 transition-colors flex items-center gap-1.5">
          <ChevronDown size={12} className="group-open:rotate-180 transition-transform" />
          MANEB Grade Scale Reference
        </summary>
        <div className="mt-2 flex flex-wrap gap-1.5 pl-4">
          {MANEB_GRADES.map(g => (
            <span key={g.grade}
              className={`text-[10px] px-2.5 py-1 rounded-lg border font-semibold ${g.bg} ${g.color} ${g.border}`}>
              G{g.grade}: {g.min}{g.grade < 9 ? `–${g.max}` : "+"}% · {g.remark}
            </span>
          ))}
        </div>
      </details>

      {isLoading && (
        <div className="bg-app-surface rounded-2xl border border-app-border py-16 flex flex-col items-center gap-3">
          <Spinner size={28} />
          <p className="text-sm text-app-text/40">Loading…</p>
        </div>
      )}

      {noStudents && !isLoading && (
        <div className="bg-app-surface rounded-2xl border border-app-border py-16 text-center">
          <Users size={28} className="mx-auto mb-3 text-app-text/20" />
          <p className="text-sm text-app-text/40 font-medium">No students found in {selectedClass?.name || "this class"}</p>
          <p className="text-xs text-app-text/30 mt-1">Students need to be enrolled in this class first.</p>
        </div>
      )}

      {!isLoading && !noAssignment && students.length > 0 && (
        <>
          {/* ════ MARKS VIEW ════ */}
          {viewMode === "marks" && (
            <div className="bg-app-surface rounded-2xl border border-app-border overflow-hidden">
              <div className="px-5 py-3.5 border-b border-app-border flex items-center justify-between bg-app-bg">
                <div>
                  <h3 className="font-semibold text-app-text text-sm">
                    Enter / Edit CA Marks — {selectedClass?.name || ""} · {selectedTerm}
                  </h3>
                  <p className="text-[10px] text-app-text/45 mt-0.5">
                    Marks are out of 100. MANEB grade is auto-calculated per subject.
                  </p>
                </div>
                {dirty && (
                  <span className="text-[10px] text-amber-600 font-semibold bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-lg">
                    Unsaved changes
                  </span>
                )}
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-app-border bg-app-surface">
                      <th className="px-5 py-3 text-left text-[11px] font-bold tracking-wide text-app-text/50 sticky left-0 bg-app-surface">
                        STUDENT
                      </th>
                      {mySubjects.map(subj => (
                        <th key={subj} className="px-3 py-3 text-center text-[11px] font-bold tracking-wide text-app-text/50 whitespace-nowrap">
                          {subj}
                        </th>
                      ))}
                      <th className="px-3 py-3 text-center text-[11px] font-bold tracking-wide text-app-text/50">
                        AVERAGE
                      </th>
                      <th className="px-3 py-3 text-center text-[11px] font-bold tracking-wide text-app-text/50">
                        RANK
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#0F2044]/5">
                    {filtered.map((student) => {
                      const avg = student.average;
                      const avgGrade = getGradeInfo(avg);
                      return (
                        <tr key={student.id} className="hover:bg-[#FAFAF8] transition-colors">
                          <td className="px-5 py-3 sticky left-0 bg-app-surface">
                            <p className="font-semibold text-app-text text-sm">{fullName(student)}</p>
                            <p className="text-[10px] text-app-text/40">{student.studentCode || student.id}</p>
                          </td>
                          {mySubjects.map(subj => (
                            <ScoreCell
                              key={subj}
                              value={student.subjectMarks[subj] ?? null}
                              onCommit={score => updateMark(student.id, subj, score)}
                            />
                          ))}
                          <td className="px-3 py-3 text-center">
                            {avg !== null ? (
                              <div className="flex flex-col items-center gap-0.5">
                                <span className={`font-bold text-base ${avgGrade?.color || "text-app-text"}`}>
                                  {avg}%
                                </span>
                                {avgGrade && (
                                  <span className={`text-[9px] font-bold ${avgGrade.color}`}>
                                    G{avgGrade.grade} · {avgGrade.remark}
                                  </span>
                                )}
                              </div>
                            ) : <span className="text-app-text/25 text-xs">—</span>}
                          </td>
                          <td className="px-3 py-3 text-center">
                            {student.rank ? (
                              <span className={`inline-flex items-center justify-center w-7 h-7 rounded-xl text-xs font-bold
                                ${student.rank === 1 ? "bg-app-warning text-app-text"
                                : student.rank === 2 ? "bg-gray-200 text-gray-700"
                                : student.rank === 3 ? "bg-amber-100 text-amber-700"
                                : "bg-app-bg text-app-text/50"}`}>
                                {student.rank}
                              </span>
                            ) : <span className="text-app-text/20 text-xs">—</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="px-5 py-3 border-t border-app-border bg-app-bg flex items-center justify-between">
                <p className="text-[10px] text-app-text/45">
                  {students.length} student{students.length !== 1 ? "s" : ""} · {mySubjects.length} subject{mySubjects.length !== 1 ? "s" : ""} · CA contributes 40% to final MSCE grade                </p>
                <button
                  onClick={saveAllMarks}
                  disabled={!dirty || saving}
                  className="flex items-center gap-1.5 px-4 py-2 bg-app-warning text-app-text text-xs font-bold rounded-xl
                    disabled:opacity-40 disabled:cursor-not-allowed hover:brightness-105 transition-all"
                >
                  {saving ? <Spinner size={13} /> : <Save size={13} />}
                  Save all marks
                </button>
              </div>
            </div>
          )}

          {/* ════ RANKING VIEW ════ */}
          {viewMode === "ranking" && (
            <div className="bg-app-surface rounded-2xl border border-app-border overflow-hidden">
              <div className="px-5 py-4 border-b border-app-border bg-app-bg">
                <h3 className="font-semibold text-app-text text-sm">
                  Class Ranking — {selectedClass?.name || ""} · {selectedTerm}
                </h3>
                <p className="text-[10px] text-app-text/45 mt-0.5">
                  Ranked by overall average across all taught subjects
                </p>
              </div>
              <div className="p-4 space-y-2">
                {ranked.length === 0 && (
                  <p className="text-center text-sm text-app-text/40 py-10">
                    No marks entered yet. Enter marks in the Marks view first.
                  </p>
                )}
                {ranked.map((student) => {
                  const g = getGradeInfo(student.average);
                  return (
                    <div
                      key={student.id}
                      className={`flex items-center gap-4 p-4 rounded-2xl border transition-all
                        ${student.rank <= 3 ? "border-[#F4B400]/30 bg-app-warning/4" : "border-app-border bg-app-surface"}`}
                    >
                      <div className={`w-8 h-8 rounded-xl flex items-center justify-center font-bold text-sm shrink-0
                        ${student.rank === 1 ? "bg-app-warning text-app-text"
                        : student.rank === 2 ? "bg-gray-300 text-gray-800"
                        : student.rank === 3 ? "bg-amber-200 text-amber-800"
                        : "bg-app-bg text-app-text/50"}`}>
                        {student.rank}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-app-text text-sm truncate">{fullName(student)}</p>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {mySubjects.map(subj => {
                            const score = student.subjectMarks[subj];
                            const sg = getGradeInfo(score);
                            return score !== null && score !== undefined ? (
                              <span key={subj} className={`text-[9px] px-1.5 py-0.5 rounded border font-medium
                                ${sg ? `${sg.bg} ${sg.color} ${sg.border}` : "bg-gray-50 text-gray-500 border-gray-200"}`}>
                                {subj}: {score}%
                              </span>
                            ) : null;
                          })}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className={`text-xl font-bold ${g?.color || "text-app-text"}`}>
                          {student.average}%
                        </p>
                        {g && (
                          <p className={`text-[10px] font-semibold ${g.color}`}>
                            Grade {g.grade} · {g.remark}
                          </p>
                        )}
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
              {/* Grade distribution */}
              <div className="bg-app-surface rounded-2xl border border-app-border p-5">
                <h3 className="font-semibold text-app-text text-sm mb-4">Grade Distribution — {selectedClass?.name || ""}</h3>
                <div className="space-y-2.5">
                  {MANEB_GRADES.map(g => {
                    const count = ranked.filter(s => {
                      const sg = getGradeInfo(s.average);
                      return sg?.grade === g.grade;
                    }).length;
                    const pct = ranked.length ? Math.round((count / ranked.length) * 100) : 0;
                    return (
                      <div key={g.grade} className="flex items-center gap-3">
                        <span className={`text-[10px] font-bold w-20 shrink-0 ${g.color}`}>
                          G{g.grade} {g.remark}
                        </span>
                        <div className="flex-1 bg-app-bg rounded-full h-2">
                          <div
                            className={`h-2 rounded-full transition-all duration-500 ${g.bg.replace("bg-", "bg-").replace("-50", "-400").replace("-100", "-500")}`}
                            style={{ width: `${pct}%`, backgroundColor: g.grade <= 2 ? "#10b981" : g.grade <= 6 ? "#3b82f6" : g.grade <= 8 ? "#f59e0b" : "#ef4444" }}
                          />
                        </div>
                        <span className="text-[11px] font-semibold text-app-text/60 w-12 text-right">
                          {count} <span className="text-app-text/30">({pct}%)</span>
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Per-subject average */}
              {mySubjects.length > 0 && (
                <div className="bg-app-surface rounded-2xl border border-app-border p-5">
                  <h3 className="font-semibold text-app-text text-sm mb-4">Subject Averages</h3>
                  <div className="space-y-3">
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
                        <div key={subj} className="flex items-center gap-3">
                          <span className="text-xs font-medium text-app-text/70 w-32 shrink-0 truncate">{subj}</span>
                          <div className="flex-1 bg-app-bg rounded-full h-2.5">
                            {avg !== null && (
                              <div
                                className="h-2.5 rounded-full transition-all duration-700"
                                style={{
                                  width: `${avg}%`,
                                  backgroundColor: avg >= 70 ? "#10b981" : avg >= 50 ? "#3b82f6" : avg >= 40 ? "#f59e0b" : "#ef4444"
                                }}
                              />
                            )}
                          </div>
                          {avg !== null ? (
                            <div className="flex items-center gap-1.5 shrink-0">
                              <span className={`text-sm font-bold ${g?.color || "text-app-text"}`}>{avg}%</span>
                              {g && <span className={`text-[9px] font-semibold ${g.color}`}>G{g.grade}</span>}
                            </div>
                          ) : (
                            <span className="text-xs text-app-text/30 shrink-0">No data</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* At-risk students */}
              {ranked.filter(s => s.average < 50).length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5">
                  <div className="flex items-center gap-2 mb-3">
                    <AlertTriangle size={16} className="text-amber-600" />
                    <h3 className="font-semibold text-amber-800 text-sm">Students Needing Support</h3>
                  </div>
                  <div className="space-y-2">
                    {ranked.filter(s => s.average < 50).map(s => {
                      const g = getGradeInfo(s.average);
                      const weakSubjects = mySubjects
                        .filter(subj => {
                          const sc = s.subjectMarks[subj];
                          return sc !== null && sc !== undefined && Number(sc) < 50;
                        });
                      return (
                        <div key={s.id} className="flex items-center justify-between bg-app-surface border border-amber-200 rounded-xl px-4 py-2.5">
                          <div>
                            <p className="font-semibold text-app-text text-sm">{fullName(s)}</p>
                            {weakSubjects.length > 0 && (
                              <p className="text-[10px] text-amber-700 mt-0.5">
                                Struggling: {weakSubjects.join(", ")}
                              </p>
                            )}
                          </div>
                          <div className="text-right">
                            <p className={`font-bold text-base ${g?.color}`}>{s.average}%</p>
                            <p className={`text-[10px] font-semibold ${g?.color}`}>Grade {g?.grade} · {g?.remark}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}