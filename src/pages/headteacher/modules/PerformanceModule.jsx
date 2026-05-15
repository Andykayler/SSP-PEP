// modules/PerformanceModule.jsx  (Head Teacher / Admin view)
// Reads live ca_marks submitted by all teachers, aggregated school-wide.

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
  return <Loader2 size={size} className="animate-spin text-[#0F2044]/40 inline-block" />;
}

function fullName(s) {
  return s.fullName || `${s.firstName ?? ""} ${s.lastName ?? ""}`.trim() || s.name || "—";
}

// ─── Student Detail Modal ─────────────────────────────────────────────────────

function StudentModal({ student, subjects, onClose }) {
  const g = getGradeInfo(student.average);
  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white rounded-3xl w-full max-w-md overflow-hidden shadow-2xl">
        <div className="bg-[#0F2044] px-7 py-5 flex items-start justify-between">
          <div>
            <h3 className="text-white font-bold text-lg">{fullName(student)}</h3>
            <p className="text-white/50 text-xs mt-0.5">
              {student.className} · {student.studentCode || ""}
            </p>
          </div>
          <button onClick={onClose} className="text-white/50 hover:text-white p-1 transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="p-7 space-y-5">
          {/* Average */}
          <div className={`flex items-center justify-between p-4 rounded-2xl border ${g ? `${g.bg} ${g.border}` : "bg-[#F7F5F0] border-[#0F2044]/8"}`}>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-[#0F2044]/50 mb-0.5">Overall Average</p>
              <p className={`text-3xl font-bold ${g?.color || "text-[#0F2044]"}`}>
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
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-[#0F2044]/50 mb-3">Subject Marks</p>
            <div className="space-y-2">
              {subjects.map(subj => {
                const score = student.subjectMarks?.[subj];
                const sg = getGradeInfo(score);
                const hasScore = score !== null && score !== undefined && score !== "";
                return (
                  <div key={subj} className="flex items-center gap-3">
                    <span className="text-xs text-[#0F2044]/70 font-medium w-32 shrink-0 truncate">{subj}</span>
                    <div className="flex-1 bg-[#F7F5F0] rounded-full h-2">
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
                      <span className={`text-xs font-bold w-20 text-right ${sg?.color || "text-[#0F2044]"}`}>
                        {score}% {sg ? `· G${sg.grade}` : ""}
                      </span>
                    ) : (
                      <span className="text-xs text-[#0F2044]/30 w-20 text-right">No data</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Class rank */}
          {student.rank && (
            <div className="flex items-center gap-3 bg-[#F7F5F0] rounded-2xl p-4">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm
                ${student.rank === 1 ? "bg-[#F4B400] text-[#0F2044]"
                : student.rank === 2 ? "bg-gray-200 text-gray-700"
                : student.rank === 3 ? "bg-amber-100 text-amber-700"
                : "bg-white text-[#0F2044]/50 border border-[#0F2044]/10"}`}>
                {student.rank}
              </div>
              <p className="text-sm text-[#0F2044]/70">
                Ranked <strong className="text-[#0F2044]">#{student.rank}</strong> in {student.className}
              </p>
            </div>
          )}

          {/* Teacher */}
          {student.teacherName && (
            <p className="text-xs text-[#0F2044]/40 text-center">
              Marks submitted by: {student.teacherName}
            </p>
          )}

          <button
            onClick={onClose}
            className="w-full py-3 border border-[#0F2044]/15 rounded-2xl hover:bg-[#F7F5F0] text-sm font-medium transition-colors"
          >
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

  // Aggregated data
  const [allStudents,    setAllStudents]    = useState([]); // raw student docs
  const [allMarksMap,    setAllMarksMap]    = useState({}); // classId → { subjects, marks, teacherName }
  const [teacherNames,   setTeacherNames]   = useState({}); // uid → displayName

  const [classesReady,   setClassesReady]   = useState(false);
  const [dataReady,      setDataReady]      = useState(false);

  const isLoading = !classesReady || !dataReady;

  // ── Step 1: Load all classes ───────────────────────────────────────────────
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
      } catch (err) {
        if (!cancelled) setError("Could not load classes.");
      } finally {
        if (!cancelled) setClassesReady(true);
      }
    })();
    return () => { cancelled = true; };
  }, [schoolCode]);

  // ── Step 2: Load all students + ca_marks for selected term ────────────────
  const fetchData = useCallback(async () => {
    if (!schoolCode || !classesReady) return;
    setDataReady(false);
    setError("");

    try {
      // Load students
      const studentSnap = await getDocs(
        query(collection(db, "students"), where("schoolCode", "==", schoolCode))
      );
      const students = studentSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      setAllStudents(students);

      // Load all ca_marks docs for this school + term
      const termKey = selectedTerm.replace(/\s+/g, "_");
      const marksSnap = await getDocs(
        query(
          collection(db, "ca_marks"),
          where("schoolCode", "==", schoolCode),
          where("term",       "==", selectedTerm)
        )
      );

      // Build classId → marks data map (multiple teachers may teach same class)
      // Merge: each teacher's subjects contribute to the class record
      const map = {};
      const teacherUids = new Set();

      marksSnap.docs.forEach(d => {
        const data = d.data();
        const cid  = data.classId;
        if (!map[cid]) map[cid] = { subjects: [], marks: {}, teacherIds: [] };

        // Merge subjects
        (data.subjects || []).forEach(subj => {
          if (!map[cid].subjects.includes(subj)) map[cid].subjects.push(subj);
        });

        // Merge marks per student
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

      // Load teacher names
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

  // ── Derive enriched student list ───────────────────────────────────────────
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

  // Filter
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

  // Stats (across current filter)
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

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2
            className="text-3xl font-bold text-[#0F2044]"
            style={{ fontFamily: "'Playfair Display', serif" }}
          >
            Student Performance
          </h2>
          <p className="text-[#0F2044]/60 mt-1">
            Continuous Assessment · MANEB grade scale (1–9) · {selectedTerm}
          </p>
        </div>
        <button
          onClick={fetchData}
          disabled={isLoading}
          className="p-2.5 bg-white border border-[#0F2044]/10 rounded-xl hover:bg-[#F7F5F0] transition-colors text-[#0F2044]/60 disabled:opacity-40"
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
          { label: "School average",     value: isLoading ? null : classAvg !== null ? `${classAvg}%` : "—", color: "text-[#0F2044]",   bg: "bg-white border-[#0F2044]/8",        sub: classAvg !== null ? getGradeInfo(classAvg)?.remark : "" },
          { label: "Distinctions (≥70%)",value: isLoading ? null : distinctions,                              color: "text-emerald-700", bg: "bg-emerald-50 border-emerald-100",    sub: "Grade 1 or 2" },
          { label: "School pass rate",   value: isLoading ? null : passRate !== null ? `${passRate}%` : "—", color: "text-blue-700",    bg: "bg-blue-50 border-blue-100",          sub: "Scoring ≥40%" },
          { label: "Failing students",   value: isLoading ? null : failing,                                   color: "text-red-600",     bg: "bg-red-50 border-red-100",            sub: "Grade 9 (<40%)" },
        ].map(({ label, value, color, bg, sub }) => (
          <div key={label} className={`rounded-3xl p-5 border ${bg}`}>
            <p className={`text-2xl font-bold ${color}`}>
              {isLoading ? <Spinner size={20} /> : value}
            </p>
            <p className="text-xs text-[#0F2044]/50 mt-1">{label}</p>
            {sub && <p className="text-[10px] text-[#0F2044]/35 mt-0.5">{sub}</p>}
          </div>
        ))}
      </div>

      {/* ── Controls ─────────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-3xl p-5 border border-[#0F2044]/8 flex flex-col md:flex-row gap-4 items-end">
        {/* Class filter */}
        <div>
          <label className="block text-[10px] font-bold tracking-widest text-[#0F2044]/50 mb-1.5">CLASS</label>
          <div className="relative">
            <select
              value={selectedClassId}
              onChange={e => setSelectedClassId(e.target.value)}
              disabled={isLoading}
              className="appearance-none pl-4 pr-10 py-3 bg-white border border-[#0F2044]/15 rounded-2xl text-sm focus:outline-none focus:border-[#0F2044]/40 text-[#0F2044] min-w-[160px] disabled:opacity-50"
            >
              <option value="all">All classes</option>
              {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#0F2044]/40 pointer-events-none" />
          </div>
        </div>

        {/* Term */}
        <div>
          <label className="block text-[10px] font-bold tracking-widest text-[#0F2044]/50 mb-1.5">TERM</label>
          <div className="relative">
            <select
              value={selectedTerm}
              onChange={e => setSelectedTerm(e.target.value)}
              className="appearance-none pl-4 pr-10 py-3 bg-white border border-[#0F2044]/15 rounded-2xl text-sm focus:outline-none focus:border-[#0F2044]/40 text-[#0F2044]"
            >
              {TERMS.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#0F2044]/40 pointer-events-none" />
          </div>
        </div>

        {/* Search */}
        <div className="flex-1 relative">
          <Search size={13} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#0F2044]/35" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search student, class…"
            className="w-full pl-9 pr-4 py-3 bg-[#FAFAF8] border border-[#0F2044]/10 rounded-2xl text-sm focus:outline-none focus:border-[#0F2044]/30"
          />
        </div>

        {/* View toggle */}
        <div className="flex gap-1 ml-auto shrink-0">
          {[
            { id: "ranking",   icon: Award,    label: "Ranking" },
            { id: "analytics", icon: BarChart2, label: "Analytics" },
          ].map(({ id, icon: Icon, label }) => (
            <button
              key={id}
              onClick={() => setViewMode(id)}
              className={`flex items-center gap-1.5 px-4 py-3 text-xs font-semibold rounded-xl transition-all
                ${viewMode === id ? "bg-[#0F2044] text-white" : "bg-white border border-[#0F2044]/10 text-[#0F2044]/60 hover:border-[#0F2044]/25"}`}
            >
              <Icon size={13} />{label}
            </button>
          ))}
        </div>
      </div>

      {/* ── MANEB scale reference ─────────────────────────────────────────────── */}
      <details className="group">
        <summary className="text-[11px] text-[#0F2044]/45 cursor-pointer select-none hover:text-[#0F2044]/70 transition-colors flex items-center gap-1.5">
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

      {/* ── Loading ───────────────────────────────────────────────────────────── */}
      {isLoading && (
        <div className="bg-white rounded-2xl border border-[#0F2044]/8 py-20 flex flex-col items-center gap-3">
          <Spinner size={28} />
          <p className="text-sm text-[#0F2044]/40">Loading performance data…</p>
        </div>
      )}

      {/* ── No data notice ────────────────────────────────────────────────────── */}
      {!isLoading && noData && (
        <div className="bg-white rounded-2xl border border-[#0F2044]/8 py-20 flex flex-col items-center gap-3">
          <Users size={32} className="text-[#0F2044]/20" />
          <p className="text-sm font-medium text-[#0F2044]/40">
            No marks have been submitted for {selectedTerm} yet.
          </p>
          <p className="text-xs text-[#0F2044]/30">Teachers submit CA marks from their Performance module.</p>
        </div>
      )}

      {!isLoading && !noData && (
        <>
          {/* ════ RANKING VIEW ════ */}
          {viewMode === "ranking" && (
            <div className="bg-white rounded-2xl border border-[#0F2044]/8 overflow-hidden">
              <div className="px-6 py-4 bg-[#F7F5F0] border-b border-[#0F2044]/8 flex justify-between items-center">
                <div>
                  <h3 className="font-semibold text-[#0F2044] text-sm">
                    {selectedClassId === "all" ? "School-wide Ranking" : `${classes.find(c => c.id === selectedClassId)?.name || ""} Ranking`}
                    {" · "}{selectedTerm}
                  </h3>
                  <p className="text-[10px] text-[#0F2044]/45 mt-0.5">Ranked by average across all submitted subjects</p>
                </div>
                <span className="text-xs text-[#0F2044]/50">{ranked.length} student{ranked.length !== 1 ? "s" : ""}</span>
              </div>

              {ranked.length === 0 ? (
                <div className="py-16 text-center">
                  <p className="text-sm text-[#0F2044]/40">No marks match your search.</p>
                </div>
              ) : (
                <div className="divide-y divide-[#0F2044]/5">
                  {ranked.map((student, idx) => {
                    const g = getGradeInfo(student.average);
                    const overallRank = idx + 1;
                    return (
                      <div
                        key={student.id}
                        className={`flex items-center gap-4 px-6 py-4 hover:bg-[#FAFAF8] transition-colors ${overallRank <= 3 ? "bg-[#F4B400]/3" : ""}`}
                      >
                        {/* Rank badge */}
                        <div className={`w-8 h-8 rounded-xl flex items-center justify-center font-bold text-sm shrink-0
                          ${overallRank === 1 ? "bg-[#F4B400] text-[#0F2044]"
                          : overallRank === 2 ? "bg-gray-200 text-gray-700"
                          : overallRank === 3 ? "bg-amber-100 text-amber-700"
                          : "bg-[#F7F5F0] text-[#0F2044]/50"}`}>
                          {overallRank}
                        </div>

                        {/* Name + class */}
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-[#0F2044] text-sm truncate">{fullName(student)}</p>
                          <p className="text-xs text-[#0F2044]/40">{student.className}</p>
                        </div>

                        {/* Subject chips */}
                        <div className="hidden md:flex flex-wrap gap-1 max-w-xs">
                          {student.subjects.map(subj => {
                            const score = student.subjectMarks[subj];
                            const sg    = getGradeInfo(score);
                            return score !== null && score !== undefined ? (
                              <span key={subj} className={`text-[9px] px-1.5 py-0.5 rounded border font-medium
                                ${sg ? `${sg.bg} ${sg.color} ${sg.border}` : "bg-gray-50 text-gray-500 border-gray-200"}`}>
                                {subj}: {score}%
                              </span>
                            ) : null;
                          })}
                        </div>

                        {/* Average */}
                        <div className="text-right shrink-0">
                          <p className={`text-xl font-bold ${g?.color || "text-[#0F2044]"}`}>
                            {student.average}%
                          </p>
                          {g && <p className={`text-[10px] font-semibold ${g.color}`}>G{g.grade} · {g.remark}</p>}
                        </div>

                        {/* View button */}
                        <button
                          onClick={() => setViewingStudent(student)}
                          className="flex items-center gap-1 text-xs bg-[#0F2044]/5 hover:bg-[#0F2044]/10 text-[#0F2044]/60 hover:text-[#0F2044] px-3 py-2 rounded-xl transition-colors shrink-0"
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

          {/* ════ ANALYTICS VIEW ════ */}
          {viewMode === "analytics" && (
            <div className="space-y-5">

              {/* Grade distribution */}
              <div className="bg-white rounded-2xl border border-[#0F2044]/8 p-6">
                <h3 className="font-semibold text-[#0F2044] text-sm mb-4">
                  Grade Distribution — {selectedClassId === "all" ? "All Classes" : classes.find(c => c.id === selectedClassId)?.name || ""}
                </h3>
                <div className="space-y-2.5">
                  {MANEB_GRADES.map(g => {
                    const count = studentsWithMarks.filter(s => getGradeInfo(s.average)?.grade === g.grade).length;
                    const pct   = studentsWithMarks.length ? Math.round((count / studentsWithMarks.length) * 100) : 0;
                    return (
                      <div key={g.grade} className="flex items-center gap-3">
                        <span className={`text-[10px] font-bold w-24 shrink-0 ${g.color}`}>G{g.grade} {g.remark}</span>
                        <div className="flex-1 bg-[#F7F5F0] rounded-full h-2.5">
                          <div
                            className="h-2.5 rounded-full transition-all duration-500"
                            style={{
                              width: `${pct}%`,
                              backgroundColor: g.grade <= 2 ? "#10b981" : g.grade <= 6 ? "#3b82f6" : g.grade <= 8 ? "#f59e0b" : "#ef4444",
                            }}
                          />
                        </div>
                        <span className="text-[11px] font-semibold text-[#0F2044]/60 w-16 text-right">
                          {count} <span className="text-[#0F2044]/30">({pct}%)</span>
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Per-class averages */}
              {selectedClassId === "all" && (
                <div className="bg-white rounded-2xl border border-[#0F2044]/8 p-6">
                  <h3 className="font-semibold text-[#0F2044] text-sm mb-4">Class Averages Comparison</h3>
                  <div className="space-y-3">
                    {classes.map(cls => {
                      const clsStudents = studentsWithMarks.filter(s => s.classId === cls.id);
                      const avg = clsStudents.length
                        ? Math.round((clsStudents.reduce((a, b) => a + b.average, 0) / clsStudents.length) * 10) / 10
                        : null;
                      const g = getGradeInfo(avg);
                      return (
                        <div key={cls.id} className="flex items-center gap-3">
                          <span className="text-xs font-semibold text-[#0F2044]/70 w-24 shrink-0">{cls.name}</span>
                          <div className="flex-1 bg-[#F7F5F0] rounded-full h-3">
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
                              <span className={`text-sm font-bold ${g?.color || "text-[#0F2044]"}`}>{avg}%</span>
                              {g && <span className={`text-[9px] font-semibold ${g.color}`}>G{g.grade}</span>}
                              <span className="text-[10px] text-[#0F2044]/40">({clsStudents.length} students)</span>
                            </div>
                          ) : (
                            <span className="text-xs text-[#0F2044]/30 shrink-0">No data</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Per-subject averages (school-wide or filtered class) */}
              {allSubjects.length > 0 && (
                <div className="bg-white rounded-2xl border border-[#0F2044]/8 p-6">
                  <h3 className="font-semibold text-[#0F2044] text-sm mb-4">Subject Averages</h3>
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
                          <span className="text-xs font-medium text-[#0F2044]/70 w-32 shrink-0 truncate">{subj}</span>
                          <div className="flex-1 bg-[#F7F5F0] rounded-full h-2.5">
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
                              <span className={`text-sm font-bold ${g?.color || "text-[#0F2044]"}`}>{avg}%</span>
                              {g && <span className={`text-[9px] font-semibold ${g.color}`}>G{g.grade}</span>}
                              <span className="text-[10px] text-[#0F2044]/35">({scores.length} entries)</span>
                            </div>
                          ) : (
                            <span className="text-xs text-[#0F2044]/30 shrink-0">No data</span>
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
                  <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5">
                    <div className="flex items-center gap-2 mb-3">
                      <AlertTriangle size={16} className="text-amber-600" />
                      <h3 className="font-semibold text-amber-800 text-sm">
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
                            className="flex items-center justify-between bg-white border border-amber-200 rounded-xl px-4 py-3 cursor-pointer hover:bg-amber-50/50 transition-colors"
                            onClick={() => setViewingStudent(s)}
                          >
                            <div>
                              <p className="font-semibold text-[#0F2044] text-sm">{fullName(s)}</p>
                              <p className="text-[10px] text-[#0F2044]/50">{s.className}</p>
                              {weakSubjects.length > 0 && (
                                <p className="text-[10px] text-amber-700 mt-0.5">
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

      <p className="text-center text-xs text-[#0F2044]/40 pt-1">
        Showing CA marks submitted by teachers. Select a class or term to filter.
        Marks are read-only — teachers manage entry from their Performance module.
      </p>

      {/* ── Student detail modal ──────────────────────────────────────────────── */}
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