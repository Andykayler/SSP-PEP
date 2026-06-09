// modules/PerformanceModule.jsx
import { useState, useEffect, useCallback } from "react";
import { db } from "../../../firebase";
import {
  collection, query, where, getDocs, doc, getDoc,
} from "firebase/firestore";
import {
  Award, AlertTriangle, RefreshCw, Loader2, AlertCircle,
  Search, ChevronDown, Users, BarChart2, Eye, X,
} from "lucide-react";

// ─── MANEB Grade Scale ────────────────────────────────────────────────────────
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

function Spinner({ size = 20 }) {
  return <div className="spinner" style={{ width: size, height: size }} />;
}

function fullName(s) {
  return s.fullName || `${s.firstName ?? ""} ${s.lastName ?? ""}`.trim() || s.name || "—";
}

// ─── Student Detail Modal ─────────────────────────────────────────────────────
function StudentModal({ student, subjects, onClose }) {
  const g = getGradeInfo(student.average);
  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-container" style={{ maxWidth: "400px" }}>
        <div className="modal-header">
          <div>
            <h3>{fullName(student)}</h3>
            <p>{student.className} · {student.studentCode || ""}</p>
          </div>
          <button onClick={onClose} className="modal-close">
            <X size={18} />
          </button>
        </div>

        <div className="modal-body" style={{ padding: "24px" }}>
          {/* Average */}
          <div className={`flex items-center justify-between p-4 rounded-2xl border mb-5 ${g ? `${g.bg} ${g.border}` : "bg-app-bg border-app-border"}`}>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-app-text/50 mb-0.5">Overall Average</p>
              <p className={`text-3xl font-bold ${g?.color || "text-app-text"}`}>
                {student.average !== null ? `${student.average}%` : "—"}
              </p>
            </div>
            {g && (
              <div className="text-right">
                <p className={`text-2xl font-bold ${g.color}`}>G{g.grade}</p>
                <p className={`text-xs font-semibold ${g.color}`}>{g.remark}</p>
              </div>
            )}
          </div>

          {/* Per-subject marks */}
          <div className="mb-5">
            <p className="text-[10px] font-bold uppercase tracking-widest text-app-text/50 mb-3">Subject Marks</p>
            <div className="space-y-2">
              {subjects.map(subj => {
                const score = student.subjectMarks?.[subj];
                const sg = getGradeInfo(score);
                const hasScore = score !== null && score !== undefined && score !== "";
                return (
                  <div key={subj} className="flex items-center gap-3">
                    <span className="text-xs text-app-text/70 font-medium w-32 shrink-0 truncate">{subj}</span>
                    <div className="flex-1 bg-app-bg rounded-full h-2">
                      {hasScore && (
                        <div
                          className="h-2 rounded-full transition-all duration-500"
                          style={{
                            width: `${score}%`,
                            backgroundColor: score >= 70 ? "#10b981" : score >= 50 ? "#3b82f6" : score >= 40 ? "#f59e0b" : "#ef4444",
                          }}
                        />
                      )}
                    </div>
                    {hasScore ? (
                      <span className={`text-xs font-bold w-20 text-right ${sg?.color || "text-app-text"}`}>
                        {score}% {sg ? `· G${sg.grade}` : ""}
                      </span>
                    ) : (
                      <span className="text-xs text-app-text/30 w-20 text-right">No data</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Class rank */}
          {student.rank && (
            <div className="flex items-center gap-3 bg-app-bg rounded-2xl p-4 mb-5">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm
                ${student.rank === 1 ? "bg-app-warning text-app-text"
                : student.rank === 2 ? "bg-gray-200 text-gray-700"
                : student.rank === 3 ? "bg-amber-100 text-amber-700"
                : "bg-app-surface text-app-text/50 border border-app-border"}`}>
                {student.rank}
              </div>
              <p className="text-sm text-app-text/70">
                Ranked <strong className="text-app-text">#{student.rank}</strong> in {student.className}
              </p>
            </div>
          )}

          {/* Teacher */}
          {student.teacherName && (
            <p className="text-xs text-app-text/40 text-center mb-4">
              Marks submitted by: {student.teacherName}
            </p>
          )}

          <button onClick={onClose} className="btn-cancel w-full mt-2">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
const TERMS = ["Term 1 2026", "Term 2 2026", "Term 3 2025", "Term 1 2025", "Term 2 2025"];

export default function PerformanceModule({ schoolCode }) {
  const [classes,        setClasses]        = useState([]);
  const [selectedClassId,setSelectedClassId]= useState("all");
  const [selectedTerm,   setSelectedTerm]   = useState("Term 1 2026");
  const [viewMode,       setViewMode]       = useState("ranking");
  const [search,         setSearch]         = useState("");
  const [viewingStudent, setViewingStudent] = useState(null);
  const [error,          setError]          = useState("");

  const [allStudents,    setAllStudents]    = useState([]);
  const [allMarksMap,    setAllMarksMap]    = useState({});
  const [teacherNames,   setTeacherNames]   = useState({});

  const [classesReady,   setClassesReady]   = useState(false);
  const [dataReady,      setDataReady]      = useState(false);

  const isLoading = !classesReady || !dataReady;

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
          .map(d => ({ id: d.id, ...d.data() }))
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

  // Fetch students and marks
  const fetchData = useCallback(async () => {
    if (!schoolCode || !classesReady) return;
    setDataReady(false);
    setError("");

    try {
      const studentSnap = await getDocs(
        query(collection(db, "students"), where("schoolCode", "==", schoolCode))
      );
      const students = studentSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      setAllStudents(students);

      const marksSnap = await getDocs(
        query(
          collection(db, "ca_marks"),
          where("schoolCode", "==", schoolCode),
          where("term",       "==", selectedTerm)
        )
      );

      const map = {};
      const teacherUids = new Set();

      marksSnap.docs.forEach(d => {
        const data = d.data();
        const cid  = data.classId;
        if (!map[cid]) map[cid] = { subjects: [], marks: {}, teacherIds: [] };

        (data.subjects || []).forEach(subj => {
          if (!map[cid].subjects.includes(subj)) map[cid].subjects.push(subj);
        });

        Object.entries(data.marks || {}).forEach(([studentId, subjectMarks]) => {
          if (!map[cid].marks[studentId]) map[cid].marks[studentId] = {};
          Object.assign(map[cid].marks[studentId], subjectMarks);
        });

        if (data.teacherId) {
          map[cid].teacherIds.push(data.teacherId);
          teacherUids.add(data.teacherId);
        }
      });

      setAllMarksMap(map);

      const names = {};
      await Promise.all([...teacherUids].map(async uid => {
        try {
          const snap = await getDoc(doc(db, "users", uid));
          if (snap.exists()) {
            const d = snap.data();
            names[uid] = d.displayName || d.fullName || `${d.firstName ?? ""} ${d.lastName ?? ""}`.trim() || uid;
          }
        } catch {}
      }));
      setTeacherNames(names);

    } catch (err) {
      setError("Could not load performance data: " + err.message);
    } finally {
      setDataReady(true);
    }
  }, [schoolCode, classesReady, selectedTerm]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Enrich students
  const enrichedStudents = (() => {
    const classFilter = selectedClassId === "all" ? null : selectedClassId;
    const relevantStudents = classFilter
      ? allStudents.filter(s => s.classId === classFilter)
      : allStudents;

    return relevantStudents.map(student => {
      const cid         = student.classId;
      const classData   = allMarksMap[cid] || {};
      const classObj    = classes.find(c => c.id === cid);
      const subjectMarks= classData.marks?.[student.id] || {};
      const subjects    = classData.subjects || [];
      const scores      = subjects.map(s => subjectMarks[s]).filter(v => v !== null && v !== undefined && v !== "").map(Number);
      const average     = scores.length
        ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10
        : null;
      const teacherName = (classData.teacherIds || []).map(uid => teacherNames[uid]).filter(Boolean).join(", ") || "—";

      return {
        ...student,
        className:   classObj?.name || "—",
        subjectMarks,
        subjects,
        average,
        teacherName,
      };
    });
  })();

  // Rank within each class
  const studentsByClass = {};
  enrichedStudents.forEach(s => {
    if (!studentsByClass[s.classId]) studentsByClass[s.classId] = [];
    studentsByClass[s.classId].push(s);
  });
  Object.values(studentsByClass).forEach(group => {
    const withAvg = group.filter(s => s.average !== null).sort((a, b) => b.average - a.average);
    withAvg.forEach((s, i) => { s.rank = i + 1; });
  });

  const allSubjects = [...new Set(enrichedStudents.flatMap(s => s.subjects))].sort();

  // Filter and rank for ranking view
  const filtered = enrichedStudents.filter(s => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      fullName(s).toLowerCase().includes(q) ||
      s.studentCode?.toLowerCase().includes(q) ||
      s.className?.toLowerCase().includes(q)
    );
  });
  const ranked = [...filtered].filter(s => s.average !== null).sort((a, b) => b.average - a.average);

  // Stats
  const studentsWithMarks = enrichedStudents.filter(s => s.average !== null);
  const classAvg = studentsWithMarks.length
    ? Math.round((studentsWithMarks.reduce((a, b) => a + b.average, 0) / studentsWithMarks.length) * 10) / 10
    : null;
  const distinctions = studentsWithMarks.filter(s => s.average >= 70).length;
  const failing      = studentsWithMarks.filter(s => s.average < 40).length;
  const passRate     = studentsWithMarks.length
    ? Math.round((studentsWithMarks.filter(s => s.average >= 40).length / studentsWithMarks.length) * 100)
    : null;
  const noData = dataReady && studentsWithMarks.length === 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 style={{ fontFamily: "'Playfair Display', serif" }}>Student Performance</h2>
          <p className="text-muted">Continuous Assessment · MANEB grade scale (1–9) · {selectedTerm}</p>
        </div>
        <button onClick={fetchData} disabled={isLoading} className="icon-btn" title="Refresh">
          <RefreshCw size={16} className={isLoading ? "animate-spin" : ""} />
        </button>
      </div>

      {error && <div className="error-message"><AlertCircle size={16} /> {error}</div>}

      {/* Summary cards */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-card__value">{isLoading ? <Spinner size={20} /> : classAvg !== null ? `${classAvg}%` : "—"}</div>
          <div className="stat-card__label">School average</div>
          {classAvg !== null && <div className="text-muted text-[10px] mt-1">{getGradeInfo(classAvg)?.remark}</div>}
        </div>
        <div className="stat-card">
          <div className="stat-card__value stat-card__value--success">{isLoading ? <Spinner size={20} /> : distinctions}</div>
          <div className="stat-card__label">Distinctions (≥70%)</div>
          <div className="text-muted text-[10px] mt-1">Grade 1 or 2</div>
        </div>
        <div className="stat-card">
          <div className="stat-card__value stat-card__value--accent">{isLoading ? <Spinner size={20} /> : passRate !== null ? `${passRate}%` : "—"}</div>
          <div className="stat-card__label">School pass rate</div>
          <div className="text-muted text-[10px] mt-1">Scoring ≥40%</div>
        </div>
        <div className="stat-card">
          <div className="stat-card__value stat-card__value--warning">{isLoading ? <Spinner size={20} /> : failing}</div>
          <div className="stat-card__label">Failing students</div>
          <div className="text-muted text-[10px] mt-1">Grade 9 (&lt;40%)</div>
        </div>
      </div>

      {/* Controls */}
      <div className="stats-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "16px" }}>
        <div>
          <label className="field__label">CLASS</label>
          <div className="relative">
            <select
              value={selectedClassId}
              onChange={e => setSelectedClassId(e.target.value)}
              disabled={isLoading}
              className="field__select"
            >
              <option value="all">All classes</option>
              {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-app-text/40 pointer-events-none" />
          </div>
        </div>
        <div>
          <label className="field__label">TERM</label>
          <div className="relative">
            <select value={selectedTerm} onChange={e => setSelectedTerm(e.target.value)} className="field__select">
              {TERMS.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-app-text/40 pointer-events-none" />
          </div>
        </div>
        <div className="search-wrapper">
          <Search className="search-icon" size={14} />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search student, class…"
            className="search-input"
          />
        </div>
        <div className="flex gap-1 ml-auto shrink-0">
          {[
            { id: "ranking",   icon: Award,    label: "Ranking" },
            { id: "analytics", icon: BarChart2, label: "Analytics" },
          ].map(({ id, icon: Icon, label }) => (
            <button
              key={id}
              onClick={() => setViewMode(id)}
              className={`tab ${viewMode === id ? "tab--active" : ""}`}
            >
              <Icon size={13} /> {label}
            </button>
          ))}
        </div>
      </div>

      {/* MANEB scale reference */}
      <details className="group">
        <summary className="text-[11px] text-muted cursor-pointer select-none hover:text-app-text/70 transition-colors flex items-center gap-1.5">
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
        <div className="empty-state">
          <Spinner size={28} />
          <p className="empty-state__sub">Loading performance data…</p>
        </div>
      )}

      {!isLoading && noData && (
        <div className="empty-state">
          <Users size={32} className="text-muted" />
          <p className="empty-state__sub">No marks have been submitted for {selectedTerm} yet.</p>
          <p className="text-muted text-xs">Teachers submit CA marks from their Performance module.</p>
        </div>
      )}

      {!isLoading && !noData && (
        <>
          {/* RANKING VIEW */}
          {viewMode === "ranking" && (
            <div className="card">
              <div className="cc__head">
                <div className="cc__head-left">
                  <Award size={18} />
                  <h3>
                    {selectedClassId === "all" ? "School-wide Ranking" : `${classes.find(c => c.id === selectedClassId)?.name || ""} Ranking`}
                    {" · "}{selectedTerm}
                  </h3>
                </div>
                <span className="text-muted text-xs">{ranked.length} student{ranked.length !== 1 ? "s" : ""}</span>
              </div>

              {ranked.length === 0 ? (
                <div className="empty-state">
                  <p className="empty-state__sub">No marks match your search.</p>
                </div>
              ) : (
                <div className="divide-y divide-app-border">
                  {ranked.map((student, idx) => {
                    const g = getGradeInfo(student.average);
                    const overallRank = idx + 1;
                    return (
                      <div
                        key={student.id}
                        className={`flex items-center gap-4 px-6 py-4 hover:bg-app-bg transition-colors ${overallRank <= 3 ? "bg-warning/5" : ""}`}
                      >
                        <div className={`w-8 h-8 rounded-xl flex items-center justify-center font-bold text-sm shrink-0
                          ${overallRank === 1 ? "bg-app-warning text-app-text"
                          : overallRank === 2 ? "bg-gray-200 text-gray-700"
                          : overallRank === 3 ? "bg-amber-100 text-amber-700"
                          : "bg-app-bg text-muted"}`}>
                          {overallRank}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-app-text text-sm truncate">{fullName(student)}</p>
                          <p className="text-xs text-muted">{student.className}</p>
                        </div>
                        <div className="hidden md:flex flex-wrap gap-1 max-w-xs">
                          {student.subjects.map(subj => {
                            const score = student.subjectMarks[subj];
                            const sg = getGradeInfo(score);
                            return score !== null && score !== undefined ? (
                              <span key={subj} className={`text-[9px] px-1.5 py-0.5 rounded border font-medium
                                ${sg ? `${sg.bg} ${sg.color} ${sg.border}` : "bg-app-bg text-muted border-app-border"}`}>
                                {subj}: {score}%
                              </span>
                            ) : null;
                          })}
                        </div>
                        <div className="text-right shrink-0">
                          <p className={`text-xl font-bold ${g?.color || "text-app-text"}`}>{student.average}%</p>
                          {g && <p className={`text-[10px] font-semibold ${g.color}`}>G{g.grade} · {g.remark}</p>}
                        </div>
                        <button
                          onClick={() => setViewingStudent(student)}
                          className="icon-btn icon-btn--assign"
                        >
                          <Eye size={12} /> View
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ANALYTICS VIEW */}
          {viewMode === "analytics" && (
            <div className="space-y-5">
              {/* Grade distribution */}
              <div className="card p-6">
                <h3 className="font-semibold text-app-text text-sm mb-4">
                  Grade Distribution — {selectedClassId === "all" ? "All Classes" : classes.find(c => c.id === selectedClassId)?.name || ""}
                </h3>
                <div className="space-y-2.5">
                  {MANEB_GRADES.map(g => {
                    const count = studentsWithMarks.filter(s => getGradeInfo(s.average)?.grade === g.grade).length;
                    const pct   = studentsWithMarks.length ? Math.round((count / studentsWithMarks.length) * 100) : 0;
                    return (
                      <div key={g.grade} className="flex items-center gap-3">
                        <span className={`text-[10px] font-bold w-24 shrink-0 ${g.color}`}>G{g.grade} {g.remark}</span>
                        <div className="flex-1 bg-app-bg rounded-full h-2.5">
                          <div
                            className="h-2.5 rounded-full transition-all duration-500"
                            style={{
                              width: `${pct}%`,
                              backgroundColor: g.grade <= 2 ? "#10b981" : g.grade <= 6 ? "#3b82f6" : g.grade <= 8 ? "#f59e0b" : "#ef4444",
                            }}
                          />
                        </div>
                        <span className="text-[11px] font-semibold text-muted w-16 text-right">
                          {count} <span className="text-muted">({pct}%)</span>
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Per-class averages */}
              {selectedClassId === "all" && (
                <div className="card p-6">
                  <h3 className="font-semibold text-app-text text-sm mb-4">Class Averages Comparison</h3>
                  <div className="space-y-3">
                    {classes.map(cls => {
                      const clsStudents = studentsWithMarks.filter(s => s.classId === cls.id);
                      const avg = clsStudents.length
                        ? Math.round((clsStudents.reduce((a, b) => a + b.average, 0) / clsStudents.length) * 10) / 10
                        : null;
                      const g = getGradeInfo(avg);
                      return (
                        <div key={cls.id} className="flex items-center gap-3">
                          <span className="text-xs font-semibold text-muted w-24 shrink-0">{cls.name}</span>
                          <div className="flex-1 bg-app-bg rounded-full h-3">
                            {avg !== null && (
                              <div
                                className="h-3 rounded-full transition-all duration-700"
                                style={{
                                  width: `${avg}%`,
                                  backgroundColor: avg >= 70 ? "#10b981" : avg >= 50 ? "#3b82f6" : avg >= 40 ? "#f59e0b" : "#ef4444",
                                }}
                              />
                            )}
                          </div>
                          {avg !== null ? (
                            <div className="flex items-center gap-1.5 shrink-0">
                              <span className={`text-sm font-bold ${g?.color || "text-app-text"}`}>{avg}%</span>
                              {g && <span className={`text-[9px] font-semibold ${g.color}`}>G{g.grade}</span>}
                              <span className="text-[10px] text-muted">({clsStudents.length} students)</span>
                            </div>
                          ) : (
                            <span className="text-xs text-muted shrink-0">No data</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Per-subject averages */}
              {allSubjects.length > 0 && (
                <div className="card p-6">
                  <h3 className="font-semibold text-app-text text-sm mb-4">Subject Averages</h3>
                  <div className="space-y-3">
                    {allSubjects.map(subj => {
                      const scope  = selectedClassId === "all" ? enrichedStudents : enrichedStudents.filter(s => s.classId === selectedClassId);
                      const scores = scope
                        .map(s => s.subjectMarks[subj])
                        .filter(v => v !== null && v !== undefined && v !== "")
                        .map(Number);
                      const avg = scores.length
                        ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10
                        : null;
                      const g = getGradeInfo(avg);
                      return (
                        <div key={subj} className="flex items-center gap-3">
                          <span className="text-xs font-medium text-muted w-32 shrink-0 truncate">{subj}</span>
                          <div className="flex-1 bg-app-bg rounded-full h-2.5">
                            {avg !== null && (
                              <div
                                className="h-2.5 rounded-full transition-all duration-700"
                                style={{
                                  width: `${avg}%`,
                                  backgroundColor: avg >= 70 ? "#10b981" : avg >= 50 ? "#3b82f6" : avg >= 40 ? "#f59e0b" : "#ef4444",
                                }}
                              />
                            )}
                          </div>
                          {avg !== null ? (
                            <div className="flex items-center gap-2 shrink-0">
                              <span className={`text-sm font-bold ${g?.color || "text-app-text"}`}>{avg}%</span>
                              {g && <span className={`text-[9px] font-semibold ${g.color}`}>G{g.grade}</span>}
                              <span className="text-[10px] text-muted">({scores.length} entries)</span>
                            </div>
                          ) : (
                            <span className="text-xs text-muted shrink-0">No data</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* At-risk students */}
              {(() => {
                const scope   = selectedClassId === "all" ? studentsWithMarks : studentsWithMarks.filter(s => s.classId === selectedClassId);
                const atRisk  = scope.filter(s => s.average < 50).sort((a, b) => a.average - b.average);
                if (!atRisk.length) return null;
                return (
                  <div className="bg-warning/10 border border-warning/30 rounded-2xl p-5">
                    <div className="flex items-center gap-2 mb-3">
                      <AlertTriangle size={16} className="text-warning" />
                      <h3 className="font-semibold text-warning-dark text-sm">
                        Students Needing Support ({atRisk.length})
                      </h3>
                    </div>
                    <div className="space-y-2">
                      {atRisk.map(s => {
                        const g = getGradeInfo(s.average);
                        const weakSubjects = s.subjects.filter(subj => {
                          const sc = s.subjectMarks[subj];
                          return sc !== null && sc !== undefined && Number(sc) < 50;
                        });
                        return (
                          <div
                            key={s.id}
                            className="flex items-center justify-between bg-card-bg border border-warning/20 rounded-xl px-4 py-3 cursor-pointer hover:bg-warning/5 transition-colors"
                            onClick={() => setViewingStudent(s)}
                          >
                            <div>
                              <p className="font-semibold text-app-text text-sm">{fullName(s)}</p>
                              <p className="text-[10px] text-muted">{s.className}</p>
                              {weakSubjects.length > 0 && (
                                <p className="text-[10px] text-warning mt-0.5">
                                  Struggling: {weakSubjects.join(", ")}
                                </p>
                              )}
                            </div>
                            <div className="text-right">
                              <p className={`font-bold text-base ${g?.color}`}>{s.average}%</p>
                              <p className={`text-[10px] font-semibold ${g?.color}`}>G{g?.grade} · {g?.remark}</p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}
            </div>
          )}
        </>
      )}

      <p className="text-center text-xs text-muted pt-1">
        Showing CA marks submitted by teachers. Select a class or term to filter.
        Marks are read‑only — teachers manage entry from their Performance module.
      </p>

      {viewingStudent && (
        <StudentModal
          student={viewingStudent}
          subjects={viewingStudent.subjects}
          onClose={() => setViewingStudent(null)}
        />
      )}
    </div>
  );
}