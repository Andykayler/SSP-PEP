// modules/ReportsModule.jsx  (Head Teacher / Admin view)
// Reads live ca_marks + students from Firestore to generate real reports.

import { useState, useEffect, useCallback, useRef } from "react";
import { db } from "../../../firebase";
import {
  collection, query, where, getDocs, doc, getDoc,
} from "firebase/firestore";
import {
  FileText, Download, Printer, TrendingUp, Award, Users,
  RefreshCw, Loader2, AlertCircle, ChevronDown, Search,
  BarChart2, X, CheckCircle, AlertTriangle, ArrowUp, ArrowDown, Minus,
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

const TERMS = ["Term 1 2026", "Term 2 2026", "Term 3 2025", "Term 1 2025", "Term 2 2025"];

function getGradeInfo(score) {
  if (score === null || score === undefined || score === "") return null;
  const n = Number(score);
  if (isNaN(n)) return null;
  return MANEB_GRADES.find(g => n >= g.min && n <= g.max) || MANEB_GRADES[MANEB_GRADES.length - 1];
}

function fullName(s) {
  return s.fullName || `${s.firstName ?? ""} ${s.lastName ?? ""}`.trim() || s.name || "—";
}

function avg(scores) {
  if (!scores.length) return null;
  return Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10;
}

function Spinner({ size = 20 }) {
  return <Loader2 size={size} className="animate-spin text-[#0F2044]/40 inline-block" />;
}

// ─── Print styles injected once ──────────────────────────────────────────────
const PRINT_STYLE = `
@media print {
  body * { visibility: hidden !important; }
  #report-print-area, #report-print-area * { visibility: visible !important; }
  #report-print-area { position: absolute; left: 0; top: 0; width: 100%; }
}
`;

// ─── Mini bar chart (CSS only) ────────────────────────────────────────────────
function MiniBar({ value, max = 100, color = "#3b82f6" }) {
  const pct = max ? Math.round((value / max) * 100) : 0;
  return (
    <div className="flex-1 bg-[#F7F5F0] rounded-full h-2.5 overflow-hidden">
      <div
        className="h-full rounded-full transition-all duration-700"
        style={{ width: `${pct}%`, backgroundColor: color }}
      />
    </div>
  );
}

function scoreColor(score) {
  if (score >= 70) return "#10b981";
  if (score >= 50) return "#3b82f6";
  if (score >= 40) return "#f59e0b";
  return "#ef4444";
}

// ─── Report Card (printable single student) ───────────────────────────────────
function ReportCardModal({ student, schoolCode, term, onClose }) {
  const g = getGradeInfo(student.average);
  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 overflow-y-auto"
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white rounded-3xl w-full max-w-xl shadow-2xl overflow-hidden">
        {/* Modal chrome */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#0F2044]/10 bg-[#F7F5F0]">
          <h3 className="font-semibold text-[#0F2044] text-sm">Report Card Preview</h3>
          <div className="flex gap-2">
            <button
              onClick={() => window.print()}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-[#0F2044] text-white text-xs font-semibold rounded-xl hover:bg-[#1a2a5c] transition-colors"
            >
              <Printer size={13} /> Print
            </button>
            <button onClick={onClose} className="p-2 text-[#0F2044]/50 hover:text-[#0F2044] rounded-xl transition-colors">
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Printable area */}
        <div id="report-print-area" className="p-8 space-y-6">
          {/* School header */}
          <div className="text-center border-b-2 border-[#0F2044] pb-5">
            <p className="text-[10px] font-bold tracking-[0.25em] text-[#0F2044]/50 uppercase mb-1">
              Republic of Malawi · Ministry of Education
            </p>
            <h2 className="text-2xl font-bold text-[#0F2044]" style={{ fontFamily: "'Playfair Display', serif" }}>
              {schoolCode}
            </h2>
            <p className="text-sm text-[#0F2044]/60 mt-1">Continuous Assessment Report · {term}</p>
          </div>

          {/* Student info */}
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-[#0F2044]/40">Student Name</p>
              <p className="font-semibold text-[#0F2044] mt-0.5">{fullName(student)}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-[#0F2044]/40">Adm. No.</p>
              <p className="font-semibold text-[#0F2044] mt-0.5">{student.studentCode || student.id}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-[#0F2044]/40">Class</p>
              <p className="font-semibold text-[#0F2044] mt-0.5">{student.className}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-[#0F2044]/40">Class Position</p>
              <p className="font-semibold text-[#0F2044] mt-0.5">
                {student.rank ? `${student.rank}${student.rank === 1 ? "st" : student.rank === 2 ? "nd" : student.rank === 3 ? "rd" : "th"}` : "—"}
              </p>
            </div>
          </div>

          {/* Subject marks table */}
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-[#0F2044]/50 mb-2">Subject Results</p>
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-[#F7F5F0]">
                  <th className="text-left py-2 px-3 rounded-tl-xl font-bold text-[#0F2044]/60 text-[10px] uppercase tracking-wide">Subject</th>
                  <th className="text-center py-2 px-3 font-bold text-[#0F2044]/60 text-[10px] uppercase tracking-wide">Mark (%)</th>
                  <th className="text-center py-2 px-3 rounded-tr-xl font-bold text-[#0F2044]/60 text-[10px] uppercase tracking-wide">Grade</th>
                </tr>
              </thead>
              <tbody>
                {student.subjects.map((subj, i) => {
                  const score = student.subjectMarks?.[subj];
                  const sg = getGradeInfo(score);
                  const hasScore = score !== null && score !== undefined && score !== "";
                  return (
                    <tr key={subj} className={i % 2 === 0 ? "bg-white" : "bg-[#FAFAF8]"}>
                      <td className="py-2.5 px-3 font-medium text-[#0F2044]">{subj}</td>
                      <td className="py-2.5 px-3 text-center font-bold text-[#0F2044]">{hasScore ? score : "—"}</td>
                      <td className="py-2.5 px-3 text-center">
                        {sg ? (
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-lg ${sg.bg} ${sg.color} ${sg.border} border`}>
                            G{sg.grade} · {sg.remark}
                          </span>
                        ) : <span className="text-[#0F2044]/30">—</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Overall */}
          <div className={`flex items-center justify-between rounded-2xl p-4 border ${g ? `${g.bg} ${g.border}` : "bg-[#F7F5F0] border-[#0F2044]/10"}`}>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-[#0F2044]/50">Overall CA Average</p>
              <p className={`text-3xl font-bold mt-0.5 ${g?.color || "text-[#0F2044]"}`}>
                {student.average !== null ? `${student.average}%` : "—"}
              </p>
            </div>
            {g && (
              <div className="text-right">
                <p className={`text-3xl font-bold ${g.color}`}>G{g.grade}</p>
                <p className={`text-xs font-semibold ${g.color}`}>{g.remark}</p>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="border-t border-[#0F2044]/10 pt-4 grid grid-cols-2 gap-4 text-[10px] text-[#0F2044]/40">
            <div>
              <p className="font-bold text-[#0F2044]/60 mb-4">Class Teacher's Signature</p>
              <div className="border-b border-[#0F2044]/20 w-32" />
            </div>
            <div className="text-right">
              <p className="font-bold text-[#0F2044]/60 mb-4">Head Teacher's Signature</p>
              <div className="border-b border-[#0F2044]/20 w-32 ml-auto" />
            </div>
            <p className="col-span-2 text-center">CA contributes 40% to final MSCE grade. This is a school record.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function ReportsModule({ schoolCode }) {
  const [reportType, setReportType] = useState("reportCards");
  const [selectedClassId, setSelectedClassId] = useState("all");
  const [selectedTerm, setSelectedTerm] = useState("Term 1 2026");
  const [compareTerm, setCompareTerm] = useState("Term 3 2025");
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState("rank"); // rank | name | average
  const [sortDir, setSortDir] = useState("asc");
  const [viewingStudent, setViewingStudent] = useState(null);
  const [error, setError] = useState("");

  const [classes, setClasses] = useState([]);
  const [allStudents, setAllStudents] = useState([]);
  const [allMarksMap, setAllMarksMap] = useState({});        // classId → { subjects, marks, teacherIds }
  const [compareMarksMap, setCompareMarksMap] = useState({}); // same for compare term
  const [teacherNames, setTeacherNames] = useState({});

  const [classesReady, setClassesReady] = useState(false);
  const [dataReady, setDataReady] = useState(false);
  const isLoading = !classesReady || !dataReady;

  // ── Print style injection ────────────────────────────────────────────────
  useEffect(() => {
    const el = document.createElement("style");
    el.textContent = PRINT_STYLE;
    document.head.appendChild(el);
    return () => document.head.removeChild(el);
  }, []);

  // ── Step 1: Load all classes ─────────────────────────────────────────────
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
        setClasses(
          snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (a.name || "").localeCompare(b.name || ""))
        );
      } catch {
        if (!cancelled) setError("Could not load classes.");
      } finally {
        if (!cancelled) setClassesReady(true);
      }
    })();
    return () => { cancelled = true; };
  }, [schoolCode]);

  // ── Step 2: Load students + marks (primary + compare term) ───────────────
  const fetchData = useCallback(async () => {
    if (!schoolCode || !classesReady) return;
    setDataReady(false);
    setError("");
    try {
      // Students
      const studentSnap = await getDocs(
        query(collection(db, "students"), where("schoolCode", "==", schoolCode))
      );
      setAllStudents(studentSnap.docs.map(d => ({ id: d.id, ...d.data() })));

      // Helper: load ca_marks for a term into a map
      const loadTermMarks = async (term) => {
        const snap = await getDocs(
          query(
            collection(db, "ca_marks"),
            where("schoolCode", "==", schoolCode),
            where("term", "==", term)
          )
        );
        const map = {};
        const teacherUids = new Set();
        snap.docs.forEach(d => {
          const data = d.data();
          const cid = data.classId;
          if (!map[cid]) map[cid] = { subjects: [], marks: {}, teacherIds: [] };
          (data.subjects || []).forEach(subj => {
            if (!map[cid].subjects.includes(subj)) map[cid].subjects.push(subj);
          });
          Object.entries(data.marks || {}).forEach(([sid, sm]) => {
            if (!map[cid].marks[sid]) map[cid].marks[sid] = {};
            Object.assign(map[cid].marks[sid], sm);
          });
          if (data.teacherId) {
            map[cid].teacherIds.push(data.teacherId);
            teacherUids.add(data.teacherId);
          }
        });
        return { map, teacherUids };
      };

      const [primary, compare] = await Promise.all([
        loadTermMarks(selectedTerm),
        loadTermMarks(compareTerm),
      ]);

      setAllMarksMap(primary.map);
      setCompareMarksMap(compare.map);

      // Teacher names
      const allUids = new Set([...primary.teacherUids, ...compare.teacherUids]);
      const names = {};
      await Promise.all([...allUids].map(async uid => {
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
      setError("Could not load report data: " + err.message);
    } finally {
      setDataReady(true);
    }
  }, [schoolCode, classesReady, selectedTerm, compareTerm]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── Enrich students ──────────────────────────────────────────────────────
  const enrich = (marksMap) => (student) => {
    const cid = student.classId;
    const classData = marksMap[cid] || {};
    const classObj = classes.find(c => c.id === cid);
    const subjectMarks = classData.marks?.[student.id] || {};
    const subjects = classData.subjects || [];
    const scores = subjects
      .map(s => subjectMarks[s])
      .filter(v => v !== null && v !== undefined && v !== "")
      .map(Number);
    const average = avg(scores);
    const teacherName = (classData.teacherIds || []).map(uid => teacherNames[uid]).filter(Boolean).join(", ") || "—";
    return { ...student, className: classObj?.name || "—", subjectMarks, subjects, average, teacherName };
  };

  const enrichedStudents = allStudents.map(enrich(allMarksMap));
  const compareStudents  = allStudents.map(enrich(compareMarksMap));

  // Rank within each class
  const addRanks = (list) => {
    const byClass = {};
    list.forEach(s => {
      if (!byClass[s.classId]) byClass[s.classId] = [];
      byClass[s.classId].push(s);
    });
    Object.values(byClass).forEach(group => {
      group.filter(s => s.average !== null).sort((a, b) => b.average - a.average).forEach((s, i) => { s.rank = i + 1; });
    });
    return list;
  };
  addRanks(enrichedStudents);
  addRanks(compareStudents);

  // Add trend delta
  const compareMap = Object.fromEntries(compareStudents.map(s => [s.id, s.average]));
  const studentsWithTrend = enrichedStudents.map(s => ({
    ...s,
    prevAverage: compareMap[s.id] ?? null,
    delta: s.average !== null && compareMap[s.id] !== null
      ? Math.round((s.average - compareMap[s.id]) * 10) / 10
      : null,
  }));

  // Class filter
  const classFiltered = selectedClassId === "all"
    ? studentsWithTrend
    : studentsWithTrend.filter(s => s.classId === selectedClassId);

  const studentsWithMarks = classFiltered.filter(s => s.average !== null);

  // All subjects in scope
  const allSubjects = [...new Set(classFiltered.flatMap(s => s.subjects))].sort();

  // Search + sort
  const searchFiltered = classFiltered.filter(s => {
    if (!search) return true;
    const q = search.toLowerCase();
    return fullName(s).toLowerCase().includes(q) || s.studentCode?.toLowerCase().includes(q) || s.className?.toLowerCase().includes(q);
  });

  const sorted = [...searchFiltered].sort((a, b) => {
    let va, vb;
    if (sortBy === "name") { va = fullName(a); vb = fullName(b); }
    else if (sortBy === "average") { va = a.average ?? -1; vb = b.average ?? -1; }
    else { va = a.rank ?? 9999; vb = b.rank ?? 9999; }
    if (typeof va === "string") return sortDir === "asc" ? va.localeCompare(vb) : vb.localeCompare(va);
    return sortDir === "asc" ? va - vb : vb - va;
  });

  // School stats
  const schoolAvg   = avg(studentsWithMarks.map(s => s.average));
  const distinctions = studentsWithMarks.filter(s => s.average >= 70).length;
  const passRate     = studentsWithMarks.length
    ? Math.round((studentsWithMarks.filter(s => s.average >= 40).length / studentsWithMarks.length) * 100)
    : null;
  const failing      = studentsWithMarks.filter(s => s.average < 40).length;

  // Previous term stats for trend
  const prevStudentsWithMarks = allStudents.map(enrich(compareMarksMap)).filter(s => s.average !== null);
  const prevSchoolAvg = avg(prevStudentsWithMarks.map(s => s.average));
  const avgDelta = schoolAvg !== null && prevSchoolAvg !== null
    ? Math.round((schoolAvg - prevSchoolAvg) * 10) / 10
    : null;

  const noData = dataReady && studentsWithMarks.length === 0;

  // Sort toggle helper
  const toggleSort = (col) => {
    if (sortBy === col) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortBy(col); setSortDir("asc"); }
  };

  const SortIcon = ({ col }) => {
    if (sortBy !== col) return <Minus size={10} className="opacity-30" />;
    return sortDir === "asc" ? <ArrowUp size={10} /> : <ArrowDown size={10} />;
  };

  return (
    <div className="space-y-6">
      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold text-[#0F2044]" style={{ fontFamily: "'Playfair Display', serif" }}>
            Reports &amp; Analytics
          </h2>
          <p className="text-[#0F2044]/60 mt-1">
            {selectedTerm} · MANEB grade scale (1–9) · Continuous Assessment
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={fetchData}
            disabled={isLoading}
            className="p-2.5 bg-white border border-[#0F2044]/10 rounded-xl hover:bg-[#F7F5F0] transition-colors text-[#0F2044]/60 disabled:opacity-40"
            title="Refresh"
          >
            <RefreshCw size={16} className={isLoading ? "animate-spin" : ""} />
          </button>
          <button
            onClick={() => window.print()}
            className="flex items-center gap-2 px-4 py-2.5 bg-[#0F2044] text-white text-sm font-semibold rounded-xl hover:bg-[#1a2a5c] transition-colors"
          >
            <Printer size={14} /> Print Report
          </button>
        </div>
      </div>

      {/* ── Error ─────────────────────────────────────────────────────────── */}
      {error && (
        <div className="flex items-start gap-3 bg-red-50 border border-red-200 text-red-700 p-4 rounded-2xl text-sm">
          <AlertCircle size={16} className="shrink-0 mt-0.5" /> {error}
        </div>
      )}

      {/* ── Summary cards ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          {
            label: "School Average",
            value: isLoading ? null : schoolAvg !== null ? `${schoolAvg}%` : "—",
            sub: avgDelta !== null
              ? `${avgDelta > 0 ? "+" : ""}${avgDelta}% vs ${compareTerm}`
              : getGradeInfo(schoolAvg)?.remark || "",
            color: "text-[#0F2044]",
            bg: "bg-white border-[#0F2044]/8",
            subColor: avgDelta !== null
              ? (avgDelta > 0 ? "text-emerald-600" : avgDelta < 0 ? "text-red-500" : "text-[#0F2044]/40")
              : "text-[#0F2044]/40",
          },
          {
            label: "Distinctions (≥70%)",
            value: isLoading ? null : distinctions,
            sub: "Grade 1 or 2",
            color: "text-emerald-700",
            bg: "bg-emerald-50 border-emerald-100",
            subColor: "text-emerald-600/60",
          },
          {
            label: "School Pass Rate",
            value: isLoading ? null : passRate !== null ? `${passRate}%` : "—",
            sub: "Scoring ≥40%",
            color: "text-blue-700",
            bg: "bg-blue-50 border-blue-100",
            subColor: "text-blue-600/60",
          },
          {
            label: "Failing Students",
            value: isLoading ? null : failing,
            sub: "Grade 9 (<40%)",
            color: "text-red-600",
            bg: "bg-red-50 border-red-100",
            subColor: "text-red-500/60",
          },
        ].map(({ label, value, sub, color, bg, subColor }) => (
          <div key={label} className={`rounded-3xl p-5 border ${bg}`}>
            <p className={`text-2xl font-bold ${color}`}>
              {isLoading ? <Spinner size={20} /> : value}
            </p>
            <p className="text-xs text-[#0F2044]/50 mt-1">{label}</p>
            {sub && <p className={`text-[10px] mt-0.5 font-medium ${subColor}`}>{sub}</p>}
          </div>
        ))}
      </div>

      {/* ── Tab nav ───────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-2">
        {[
          { id: "reportCards", icon: FileText,   label: "Report Cards" },
          { id: "performance", icon: TrendingUp,  label: "Performance Trends" },
          { id: "analytics",   icon: BarChart2,   label: "Analytics" },
          { id: "atRisk",      icon: AlertTriangle, label: "At-Risk Students" },
        ].map(({ id, icon: Icon, label }) => (
          <button
            key={id}
            onClick={() => setReportType(id)}
            className={`flex items-center gap-2 px-5 py-3 rounded-2xl text-sm font-semibold transition-all
              ${reportType === id ? "bg-[#0F2044] text-white shadow-md" : "bg-white border border-[#0F2044]/10 text-[#0F2044]/70 hover:bg-[#F7F5F0]"}`}
          >
            <Icon size={15} /> {label}
          </button>
        ))}
      </div>

      {/* ── Controls row ──────────────────────────────────────────────────── */}
      <div className="bg-white rounded-3xl p-5 border border-[#0F2044]/8 flex flex-col md:flex-row gap-4 items-end">
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

        <div>
          <label className="block text-[10px] font-bold tracking-widest text-[#0F2044]/50 mb-1.5">TERM</label>
          <div className="relative">
            <select value={selectedTerm} onChange={e => setSelectedTerm(e.target.value)}
              className="appearance-none pl-4 pr-10 py-3 bg-white border border-[#0F2044]/15 rounded-2xl text-sm focus:outline-none focus:border-[#0F2044]/40 text-[#0F2044]">
              {TERMS.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#0F2044]/40 pointer-events-none" />
          </div>
        </div>

        {(reportType === "performance") && (
          <div>
            <label className="block text-[10px] font-bold tracking-widest text-[#0F2044]/50 mb-1.5">COMPARE TO</label>
            <div className="relative">
              <select value={compareTerm} onChange={e => setCompareTerm(e.target.value)}
                className="appearance-none pl-4 pr-10 py-3 bg-white border border-[#0F2044]/15 rounded-2xl text-sm focus:outline-none focus:border-[#0F2044]/40 text-[#0F2044]">
                {TERMS.filter(t => t !== selectedTerm).map(t => <option key={t} value={t}>{t}</option>)}
              </select>
              <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#0F2044]/40 pointer-events-none" />
            </div>
          </div>
        )}

        <div className="flex-1 relative">
          <Search size={13} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#0F2044]/35" />
          <input
            type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search student, class…"
            className="w-full pl-9 pr-4 py-3 bg-[#FAFAF8] border border-[#0F2044]/10 rounded-2xl text-sm focus:outline-none focus:border-[#0F2044]/30"
          />
        </div>
      </div>

      {/* ── Loading / No data ─────────────────────────────────────────────── */}
      {isLoading && (
        <div className="bg-white rounded-2xl border border-[#0F2044]/8 py-20 flex flex-col items-center gap-3">
          <Spinner size={28} />
          <p className="text-sm text-[#0F2044]/40">Loading report data…</p>
        </div>
      )}

      {!isLoading && noData && (
        <div className="bg-white rounded-2xl border border-[#0F2044]/8 py-20 flex flex-col items-center gap-3 text-center">
          <FileText size={32} className="text-[#0F2044]/20" />
          <p className="text-sm font-medium text-[#0F2044]/40">No marks submitted for {selectedTerm} yet.</p>
          <p className="text-xs text-[#0F2044]/30">Teachers submit CA marks from their Performance module.</p>
        </div>
      )}

      {!isLoading && !noData && (
        <>
          {/* ════ REPORT CARDS ════ */}
          {reportType === "reportCards" && (
            <div className="bg-white rounded-2xl border border-[#0F2044]/8 overflow-hidden">
              <div className="px-6 py-4 bg-[#F7F5F0] border-b border-[#0F2044]/8 flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-[#0F2044] text-sm">
                    Report Cards — {selectedClassId === "all" ? "All Classes" : classes.find(c => c.id === selectedClassId)?.name} · {selectedTerm}
                  </h3>
                  <p className="text-[10px] text-[#0F2044]/45 mt-0.5">
                    Click a student to preview and print their individual report card
                  </p>
                </div>
                <span className="text-xs text-[#0F2044]/50">{sorted.length} student{sorted.length !== 1 ? "s" : ""}</span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[#0F2044]/8 bg-white">
                      <th className="px-5 py-3 text-left text-[10px] font-bold tracking-wide text-[#0F2044]/50">ADM. NO.</th>
                      <th
                        className="px-5 py-3 text-left text-[10px] font-bold tracking-wide text-[#0F2044]/50 cursor-pointer select-none hover:text-[#0F2044]/80"
                        onClick={() => toggleSort("name")}
                      >
                        <span className="flex items-center gap-1">STUDENT <SortIcon col="name" /></span>
                      </th>
                      <th className="px-3 py-3 text-center text-[10px] font-bold tracking-wide text-[#0F2044]/50">CLASS</th>
                      <th
                        className="px-3 py-3 text-center text-[10px] font-bold tracking-wide text-[#0F2044]/50 cursor-pointer select-none hover:text-[#0F2044]/80"
                        onClick={() => toggleSort("average")}
                      >
                        <span className="flex items-center justify-center gap-1">AVERAGE <SortIcon col="average" /></span>
                      </th>
                      <th className="px-3 py-3 text-center text-[10px] font-bold tracking-wide text-[#0F2044]/50">GRADE</th>
                      <th
                        className="px-3 py-3 text-center text-[10px] font-bold tracking-wide text-[#0F2044]/50 cursor-pointer select-none hover:text-[#0F2044]/80"
                        onClick={() => toggleSort("rank")}
                      >
                        <span className="flex items-center justify-center gap-1">POSITION <SortIcon col="rank" /></span>
                      </th>
                      <th className="px-3 py-3 text-center text-[10px] font-bold tracking-wide text-[#0F2044]/50">TREND</th>
                      <th className="px-3 py-3 text-center text-[10px] font-bold tracking-wide text-[#0F2044]/50">TEACHER</th>
                      <th className="px-3 py-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#0F2044]/5">
                    {sorted.map(student => {
                      const g = getGradeInfo(student.average);
                      return (
                        <tr
                          key={student.id}
                          className="hover:bg-[#FAFAF8] transition-colors cursor-pointer"
                          onClick={() => setViewingStudent(student)}
                        >
                          <td className="px-5 py-3 text-[10px] text-[#0F2044]/40 font-mono">
                            {student.studentCode || student.id.slice(0, 8)}
                          </td>
                          <td className="px-5 py-3">
                            <p className="font-semibold text-[#0F2044] text-sm">{fullName(student)}</p>
                          </td>
                          <td className="px-3 py-3 text-center text-xs text-[#0F2044]/60">{student.className}</td>
                          <td className="px-3 py-3 text-center">
                            {student.average !== null ? (
                              <span className={`font-bold text-base ${g?.color || "text-[#0F2044]"}`}>{student.average}%</span>
                            ) : <span className="text-[#0F2044]/25">—</span>}
                          </td>
                          <td className="px-3 py-3 text-center">
                            {g ? (
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-lg border ${g.bg} ${g.color} ${g.border}`}>
                                G{g.grade} · {g.remark}
                              </span>
                            ) : <span className="text-[#0F2044]/25 text-xs">—</span>}
                          </td>
                          <td className="px-3 py-3 text-center">
                            {student.rank ? (
                              <span className={`inline-flex items-center justify-center w-7 h-7 rounded-xl text-xs font-bold
                                ${student.rank === 1 ? "bg-[#F4B400] text-[#0F2044]"
                                : student.rank === 2 ? "bg-gray-200 text-gray-700"
                                : student.rank === 3 ? "bg-amber-100 text-amber-700"
                                : "bg-[#F7F5F0] text-[#0F2044]/50"}`}>
                                {student.rank}
                              </span>
                            ) : <span className="text-[#0F2044]/20 text-xs">—</span>}
                          </td>
                          <td className="px-3 py-3 text-center">
                            {student.delta !== null ? (
                              <span className={`flex items-center justify-center gap-0.5 text-xs font-semibold
                                ${student.delta > 0 ? "text-emerald-600" : student.delta < 0 ? "text-red-500" : "text-[#0F2044]/30"}`}>
                                {student.delta > 0 ? <ArrowUp size={11} /> : student.delta < 0 ? <ArrowDown size={11} /> : <Minus size={11} />}
                                {Math.abs(student.delta)}%
                              </span>
                            ) : <span className="text-[#0F2044]/20 text-xs">—</span>}
                          </td>
                          <td className="px-3 py-3 text-center text-[10px] text-[#0F2044]/40 max-w-[100px] truncate">
                            {student.teacherName}
                          </td>
                          <td className="px-3 py-3 text-center">
                            <button
                              onClick={e => { e.stopPropagation(); setViewingStudent(student); }}
                              className="text-[10px] font-semibold text-[#0F2044]/50 hover:text-[#0F2044] bg-[#F7F5F0] hover:bg-[#0F2044]/10 px-3 py-1.5 rounded-xl transition-colors"
                            >
                              View
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="px-5 py-3 bg-[#F7F5F0] border-t border-[#0F2044]/8 flex items-center justify-between">
                <p className="text-[10px] text-[#0F2044]/45">
                  {studentsWithMarks.length} students with marks · CA contributes 40% to final MSCE grade
                </p>
                <button
                  onClick={() => window.print()}
                  className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-xl bg-[#0F2044] text-white hover:bg-[#1a2a5c] transition-colors"
                >
                  <Printer size={12} /> Print All
                </button>
              </div>
            </div>
          )}

          {/* ════ PERFORMANCE TRENDS ════ */}
          {reportType === "performance" && (
            <div className="space-y-5">
              {/* School-level comparison */}
              <div className="bg-white rounded-2xl border border-[#0F2044]/8 p-6">
                <h3 className="font-semibold text-[#0F2044] text-sm mb-4">
                  School Average — {selectedTerm} vs {compareTerm}
                </h3>
                {[
                  { label: selectedTerm, value: schoolAvg, students: studentsWithMarks.length },
                  { label: compareTerm,  value: prevSchoolAvg, students: prevStudentsWithMarks.length },
                ].map(({ label, value, students }) => {
                  const g = getGradeInfo(value);
                  return (
                    <div key={label} className="flex items-center gap-4 mb-3">
                      <span className="text-xs font-semibold text-[#0F2044]/60 w-28 shrink-0">{label}</span>
                      <MiniBar value={value ?? 0} color={scoreColor(value ?? 0)} />
                      <div className="flex items-center gap-2 shrink-0">
                        {value !== null ? (
                          <>
                            <span className={`text-base font-bold ${g?.color || "text-[#0F2044]"}`}>{value}%</span>
                            {g && <span className={`text-[9px] font-semibold ${g.color}`}>G{g.grade}</span>}
                          </>
                        ) : <span className="text-xs text-[#0F2044]/30">No data</span>}
                        <span className="text-[10px] text-[#0F2044]/35">({students} students)</span>
                      </div>
                    </div>
                  );
                })}
                {avgDelta !== null && (
                  <div className={`mt-3 inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-xl
                    ${avgDelta > 0 ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                    : avgDelta < 0 ? "bg-red-50 text-red-600 border border-red-200"
                    : "bg-[#F7F5F0] text-[#0F2044]/50 border border-[#0F2044]/10"}`}>
                    {avgDelta > 0 ? <ArrowUp size={12} /> : avgDelta < 0 ? <ArrowDown size={12} /> : <Minus size={12} />}
                    {avgDelta > 0 ? "+" : ""}{avgDelta}% change from {compareTerm}
                  </div>
                )}
              </div>

              {/* Per-class comparison */}
              {selectedClassId === "all" && (
                <div className="bg-white rounded-2xl border border-[#0F2044]/8 p-6">
                  <h3 className="font-semibold text-[#0F2044] text-sm mb-4">Class-by-Class Comparison</h3>
                  <div className="space-y-4">
                    {classes.map(cls => {
                      const currStudents = studentsWithMarks.filter(s => s.classId === cls.id);
                      const prevStudents = prevStudentsWithMarks.filter(s => s.classId === cls.id);
                      const currAvg = avg(currStudents.map(s => s.average));
                      const prevAvg = avg(prevStudents.map(s => s.average));
                      const delta   = currAvg !== null && prevAvg !== null ? Math.round((currAvg - prevAvg) * 10) / 10 : null;
                      const gc = getGradeInfo(currAvg);
                      const gp = getGradeInfo(prevAvg);
                      return (
                        <div key={cls.id} className="border border-[#0F2044]/8 rounded-2xl p-4">
                          <div className="flex items-center justify-between mb-3">
                            <p className="font-semibold text-[#0F2044] text-sm">{cls.name}</p>
                            {delta !== null && (
                              <span className={`flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-lg
                                ${delta > 0 ? "bg-emerald-50 text-emerald-700" : delta < 0 ? "bg-red-50 text-red-600" : "bg-[#F7F5F0] text-[#0F2044]/40"}`}>
                                {delta > 0 ? <ArrowUp size={10} /> : delta < 0 ? <ArrowDown size={10} /> : <Minus size={10} />}
                                {delta > 0 ? "+" : ""}{delta}%
                              </span>
                            )}
                          </div>
                          {[
                            { label: selectedTerm, value: currAvg, g: gc, count: currStudents.length },
                            { label: compareTerm,  value: prevAvg, g: gp, count: prevStudents.length },
                          ].map(({ label, value, g, count }) => (
                            <div key={label} className="flex items-center gap-3 mb-1.5">
                              <span className="text-[10px] text-[#0F2044]/50 w-24 shrink-0">{label}</span>
                              <MiniBar value={value ?? 0} color={scoreColor(value ?? 0)} />
                              <div className="flex items-center gap-1 shrink-0">
                                {value !== null ? (
                                  <>
                                    <span className={`text-sm font-bold ${g?.color || "text-[#0F2044]"}`}>{value}%</span>
                                    <span className="text-[10px] text-[#0F2044]/35">({count})</span>
                                  </>
                                ) : <span className="text-[10px] text-[#0F2044]/30">No data</span>}
                              </div>
                            </div>
                          ))}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Per-student trend table */}
              <div className="bg-white rounded-2xl border border-[#0F2044]/8 overflow-hidden">
                <div className="px-5 py-4 bg-[#F7F5F0] border-b border-[#0F2044]/8">
                  <h3 className="font-semibold text-[#0F2044] text-sm">Student Progress — {selectedTerm} vs {compareTerm}</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-[#0F2044]/8">
                        <th className="px-5 py-3 text-left text-[10px] font-bold tracking-wide text-[#0F2044]/50">STUDENT</th>
                        <th className="px-3 py-3 text-center text-[10px] font-bold tracking-wide text-[#0F2044]/50">CLASS</th>
                        <th className="px-3 py-3 text-center text-[10px] font-bold tracking-wide text-[#0F2044]/50">{compareTerm}</th>
                        <th className="px-3 py-3 text-center text-[10px] font-bold tracking-wide text-[#0F2044]/50">{selectedTerm}</th>
                        <th className="px-3 py-3 text-center text-[10px] font-bold tracking-wide text-[#0F2044]/50">CHANGE</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#0F2044]/5">
                      {sorted
                        .filter(s => s.average !== null || s.prevAverage !== null)
                        .map(s => {
                          const gc = getGradeInfo(s.average);
                          const gp = getGradeInfo(s.prevAverage);
                          return (
                            <tr key={s.id} className="hover:bg-[#FAFAF8] transition-colors">
                              <td className="px-5 py-3">
                                <p className="font-semibold text-[#0F2044] text-sm">{fullName(s)}</p>
                                <p className="text-[10px] text-[#0F2044]/40">{s.studentCode || ""}</p>
                              </td>
                              <td className="px-3 py-3 text-center text-xs text-[#0F2044]/60">{s.className}</td>
                              <td className="px-3 py-3 text-center">
                                {s.prevAverage !== null ? (
                                  <span className={`font-semibold text-sm ${gp?.color || "text-[#0F2044]"}`}>{s.prevAverage}%</span>
                                ) : <span className="text-[#0F2044]/25">—</span>}
                              </td>
                              <td className="px-3 py-3 text-center">
                                {s.average !== null ? (
                                  <span className={`font-bold text-sm ${gc?.color || "text-[#0F2044]"}`}>{s.average}%</span>
                                ) : <span className="text-[#0F2044]/25">—</span>}
                              </td>
                              <td className="px-3 py-3 text-center">
                                {s.delta !== null ? (
                                  <span className={`inline-flex items-center gap-0.5 text-xs font-bold px-2.5 py-1 rounded-lg
                                    ${s.delta > 0 ? "bg-emerald-50 text-emerald-700" : s.delta < 0 ? "bg-red-50 text-red-600" : "bg-[#F7F5F0] text-[#0F2044]/40"}`}>
                                    {s.delta > 0 ? <ArrowUp size={10} /> : s.delta < 0 ? <ArrowDown size={10} /> : <Minus size={10} />}
                                    {s.delta > 0 ? "+" : ""}{s.delta}%
                                  </span>
                                ) : <span className="text-[#0F2044]/20 text-xs">—</span>}
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ════ ANALYTICS ════ */}
          {reportType === "analytics" && (
            <div className="space-y-5">
              {/* Grade distribution */}
              <div className="bg-white rounded-2xl border border-[#0F2044]/8 p-6">
                <h3 className="font-semibold text-[#0F2044] text-sm mb-4">
                  Grade Distribution — {selectedClassId === "all" ? "All Classes" : classes.find(c => c.id === selectedClassId)?.name}
                </h3>
                <div className="space-y-2.5">
                  {MANEB_GRADES.map(g => {
                    const count = studentsWithMarks.filter(s => getGradeInfo(s.average)?.grade === g.grade).length;
                    const pct   = studentsWithMarks.length ? Math.round((count / studentsWithMarks.length) * 100) : 0;
                    return (
                      <div key={g.grade} className="flex items-center gap-3">
                        <span className={`text-[10px] font-bold w-24 shrink-0 ${g.color}`}>G{g.grade} {g.remark}</span>
                        <MiniBar value={pct} color={g.grade <= 2 ? "#10b981" : g.grade <= 6 ? "#3b82f6" : g.grade <= 8 ? "#f59e0b" : "#ef4444"} />
                        <span className="text-[11px] font-semibold text-[#0F2044]/60 w-16 text-right">
                          {count} <span className="text-[#0F2044]/30">({pct}%)</span>
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Class averages */}
              {selectedClassId === "all" && (
                <div className="bg-white rounded-2xl border border-[#0F2044]/8 p-6">
                  <h3 className="font-semibold text-[#0F2044] text-sm mb-4">Class Averages</h3>
                  <div className="space-y-3">
                    {classes.map(cls => {
                      const clsStudents = studentsWithMarks.filter(s => s.classId === cls.id);
                      const clsAvg = avg(clsStudents.map(s => s.average));
                      const g = getGradeInfo(clsAvg);
                      return (
                        <div key={cls.id} className="flex items-center gap-3">
                          <span className="text-xs font-semibold text-[#0F2044]/70 w-24 shrink-0">{cls.name}</span>
                          <MiniBar value={clsAvg ?? 0} color={scoreColor(clsAvg ?? 0)} />
                          {clsAvg !== null ? (
                            <div className="flex items-center gap-1.5 shrink-0">
                              <span className={`text-sm font-bold ${g?.color || "text-[#0F2044]"}`}>{clsAvg}%</span>
                              {g && <span className={`text-[9px] font-semibold ${g.color}`}>G{g.grade}</span>}
                              <span className="text-[10px] text-[#0F2044]/40">({clsStudents.length})</span>
                            </div>
                          ) : <span className="text-xs text-[#0F2044]/30 shrink-0">No data</span>}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Subject averages */}
              {allSubjects.length > 0 && (
                <div className="bg-white rounded-2xl border border-[#0F2044]/8 p-6">
                  <h3 className="font-semibold text-[#0F2044] text-sm mb-4">Subject Averages</h3>
                  <div className="space-y-3">
                    {allSubjects.map(subj => {
                      const scores = classFiltered
                        .map(s => s.subjectMarks[subj])
                        .filter(v => v !== null && v !== undefined && v !== "")
                        .map(Number);
                      const subjAvg = avg(scores);
                      const g = getGradeInfo(subjAvg);
                      return (
                        <div key={subj} className="flex items-center gap-3">
                          <span className="text-xs font-medium text-[#0F2044]/70 w-32 shrink-0 truncate">{subj}</span>
                          <MiniBar value={subjAvg ?? 0} color={scoreColor(subjAvg ?? 0)} />
                          {subjAvg !== null ? (
                            <div className="flex items-center gap-2 shrink-0">
                              <span className={`text-sm font-bold ${g?.color || "text-[#0F2044]"}`}>{subjAvg}%</span>
                              {g && <span className={`text-[9px] font-semibold ${g.color}`}>G{g.grade}</span>}
                              <span className="text-[10px] text-[#0F2044]/35">({scores.length})</span>
                            </div>
                          ) : <span className="text-xs text-[#0F2044]/30 shrink-0">No data</span>}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Teacher submissions overview */}
              <div className="bg-white rounded-2xl border border-[#0F2044]/8 p-6">
                <h3 className="font-semibold text-[#0F2044] text-sm mb-4">Mark Submission Status</h3>
                <div className="space-y-2.5">
                  {classes.map(cls => {
                    const classData = allMarksMap[cls.id];
                    const submitted = !!classData;
                    const teachers  = (classData?.teacherIds || []).map(uid => teacherNames[uid]).filter(Boolean);
                    const count     = Object.keys(classData?.marks || {}).length;
                    return (
                      <div key={cls.id} className={`flex items-center gap-3 p-3 rounded-xl border
                        ${submitted ? "border-emerald-200 bg-emerald-50/50" : "border-[#0F2044]/8 bg-[#F7F5F0]"}`}>
                        {submitted
                          ? <CheckCircle size={14} className="text-emerald-600 shrink-0" />
                          : <AlertCircle size={14} className="text-[#0F2044]/30 shrink-0" />}
                        <div className="flex-1">
                          <p className="text-sm font-semibold text-[#0F2044]">{cls.name}</p>
                          {submitted && (
                            <p className="text-[10px] text-[#0F2044]/50">
                              {count} students · {teachers.join(", ") || "Unknown teacher"}
                            </p>
                          )}
                        </div>
                        <span className={`text-[10px] font-bold px-2.5 py-1 rounded-lg
                          ${submitted ? "bg-emerald-100 text-emerald-700" : "bg-[#0F2044]/8 text-[#0F2044]/40"}`}>
                          {submitted ? "Submitted" : "Pending"}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* ════ AT-RISK STUDENTS ════ */}
          {reportType === "atRisk" && (
            <div className="space-y-5">
              {/* Failing */}
              {studentsWithMarks.filter(s => s.average < 40).length > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-2xl p-5">
                  <div className="flex items-center gap-2 mb-3">
                    <AlertTriangle size={16} className="text-red-600" />
                    <h3 className="font-semibold text-red-800 text-sm">
                      Failing Students — G9 · below 40% ({studentsWithMarks.filter(s => s.average < 40).length})
                    </h3>
                  </div>
                  <div className="space-y-2">
                    {studentsWithMarks.filter(s => s.average < 40).sort((a, b) => a.average - b.average).map(s => {
                      const g = getGradeInfo(s.average);
                      const weak = s.subjects.filter(subj => {
                        const sc = s.subjectMarks[subj];
                        return sc !== null && sc !== undefined && Number(sc) < 40;
                      });
                      return (
                        <div key={s.id} className="flex items-center justify-between bg-white border border-red-200 rounded-xl px-4 py-3 cursor-pointer hover:bg-red-50/50 transition-colors"
                          onClick={() => setViewingStudent(s)}>
                          <div>
                            <p className="font-semibold text-[#0F2044] text-sm">{fullName(s)}</p>
                            <p className="text-[10px] text-[#0F2044]/50">{s.className}</p>
                            {weak.length > 0 && (
                              <p className="text-[10px] text-red-700 mt-0.5">Failing: {weak.join(", ")}</p>
                            )}
                          </div>
                          <div className="text-right shrink-0">
                            <p className={`font-bold text-lg ${g?.color}`}>{s.average}%</p>
                            {s.delta !== null && (
                              <p className={`text-[10px] font-semibold ${s.delta > 0 ? "text-emerald-600" : "text-red-500"}`}>
                                {s.delta > 0 ? "+" : ""}{s.delta}% vs {compareTerm}
                              </p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Needs support (40–49%) */}
              {studentsWithMarks.filter(s => s.average >= 40 && s.average < 50).length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5">
                  <div className="flex items-center gap-2 mb-3">
                    <AlertTriangle size={16} className="text-amber-600" />
                    <h3 className="font-semibold text-amber-800 text-sm">
                      Needs Support — G7–G8 · 40–49% ({studentsWithMarks.filter(s => s.average >= 40 && s.average < 50).length})
                    </h3>
                  </div>
                  <div className="space-y-2">
                    {studentsWithMarks.filter(s => s.average >= 40 && s.average < 50).sort((a, b) => a.average - b.average).map(s => {
                      const g = getGradeInfo(s.average);
                      const weak = s.subjects.filter(subj => {
                        const sc = s.subjectMarks[subj];
                        return sc !== null && sc !== undefined && Number(sc) < 50;
                      });
                      return (
                        <div key={s.id} className="flex items-center justify-between bg-white border border-amber-200 rounded-xl px-4 py-3 cursor-pointer hover:bg-amber-50/50 transition-colors"
                          onClick={() => setViewingStudent(s)}>
                          <div>
                            <p className="font-semibold text-[#0F2044] text-sm">{fullName(s)}</p>
                            <p className="text-[10px] text-[#0F2044]/50">{s.className}</p>
                            {weak.length > 0 && (
                              <p className="text-[10px] text-amber-700 mt-0.5">Struggling: {weak.join(", ")}</p>
                            )}
                          </div>
                          <div className="text-right shrink-0">
                            <p className={`font-bold text-lg ${g?.color}`}>{s.average}%</p>
                            {s.delta !== null && (
                              <p className={`text-[10px] font-semibold ${s.delta > 0 ? "text-emerald-600" : "text-red-500"}`}>
                                {s.delta > 0 ? "+" : ""}{s.delta}% vs {compareTerm}
                              </p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {studentsWithMarks.filter(s => s.average < 50).length === 0 && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-2xl py-16 flex flex-col items-center gap-3 text-center">
                  <CheckCircle size={32} className="text-emerald-600" />
                  <p className="text-sm font-semibold text-emerald-800">No students currently below 50%!</p>
                  <p className="text-xs text-emerald-700/70">All students with marks are passing at Credit level or above.</p>
                </div>
              )}
            </div>
          )}
        </>
      )}

      <p className="text-center text-xs text-[#0F2044]/40 pt-1">
        Showing CA marks submitted by teachers. Select a class or term to filter.
        Marks are read-only here — teachers manage entry from their Performance module.
      </p>

      {/* ── Report card modal ─────────────────────────────────────────────── */}
      {viewingStudent && (
        <ReportCardModal
          student={viewingStudent}
          schoolCode={schoolCode}
          term={selectedTerm}
          onClose={() => setViewingStudent(null)}
        />
      )}
    </div>
  );
}