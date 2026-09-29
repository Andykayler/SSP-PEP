// modules/PerformanceModule.jsx  (Headteacher dashboard)
import { useState, useEffect, useCallback, useMemo } from "react";
import { db } from "../../../firebase";
import {
  collection, query, where, getDocs, doc, getDoc,
} from "firebase/firestore";
import {
  Award, AlertTriangle, RefreshCw, Loader2, AlertCircle,
  Search, ChevronDown, Users, BarChart2, Eye, X, PieChart, Info,
} from "lucide-react";
import {
  subscribeSchoolSettings, pastTermOptions, isPastTerm,
} from "../../../services/academicTerm";
import { sectionsOf, sectionIdOfClass, MANEB_SCALE } from "../../../services/curriculumCore";
import { gradeInfo, scaleRows, rangeLabel } from "../../../components/ui/grades";

// ─── Assessment components & their weight toward the overall term grade ──────
// Mirrors the teacher-side Performance module exactly — same ids are used as
// the `assessmentType` field on each `ca_marks` document, so this is what
// lets the headteacher dashboard split marks by component instead of
// blending every submission for the term together.
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

const round1 = (n) => Math.round(n * 10) / 10;

function Spinner({ size = 20 }) {
  return <div className="spinner" style={{ width: size, height: size }} />;
}

function fullName(s) {
  return s.fullName || `${s.firstName ?? ""} ${s.lastName ?? ""}`.trim() || s.name || "—";
}

// ─── Student Detail Modal ─────────────────────────────────────────────────────
// `subjectRows` is always a flat [{ subject, score, complete }] array — for a
// single-assessment view `complete` is just `true` whenever a score exists;
// for the Overall view it reflects whether all four components were entered.
function StudentModal({ student, subjectRows, assessmentLabel, isOverall, onClose }) {
  const getGradeInfo = (score) => gradeInfo(score, student.scale);
  const g = getGradeInfo(student.average);
  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-container" style={{ maxWidth: "400px" }}>
        <div className="modal-header">
          <div>
            <h3>{fullName(student)}</h3>
            <p>{student.className} · {student.studentCode || ""} · {assessmentLabel}</p>
          </div>
          <button onClick={onClose} className="modal-close">
            <X size={18} />
          </button>
        </div>

        <div className="modal-body" style={{ padding: "24px" }}>
          {/* Average */}
          <div className={`flex items-center justify-between p-4 rounded-2xl border mb-5 ${g ? `${g.bg} ${g.border}` : "bg-app-bg border-app-border"}`}>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-app-text/50 mb-0.5">
                {isOverall ? "Overall Average" : `${assessmentLabel} Average`}
              </p>
              <p className={`text-3xl font-bold ${g?.color || "text-app-text"}`}>
                {student.average !== null ? `${student.average}%` : "—"}
              </p>
              {isOverall && !student.complete && student.average !== null && (
                <p className="text-[10px] font-semibold text-warning mt-1">Provisional — not all components entered</p>
              )}
            </div>
            {g && (
              <div className="text-right">
                <p className={`text-2xl font-bold ${g.color}`}>{g.code}</p>
                <p className={`text-xs font-semibold ${g.color}`}>{g.remark}</p>
              </div>
            )}
          </div>

          {/* Per-subject marks */}
          <div className="mb-5">
            <p className="text-[10px] font-bold uppercase tracking-widest text-app-text/50 mb-3">Subject Marks</p>
            <div className="space-y-2">
              {subjectRows.map(({ subject, score, complete }) => {
                const sg = getGradeInfo(score);
                const hasScore = score !== null && score !== undefined && score !== "";
                return (
                  <div key={subject} className="flex items-center gap-3">
                    <span className="text-xs text-app-text/70 font-medium w-32 shrink-0 truncate">{subject}</span>
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
                      <span className={`text-xs font-bold w-24 text-right ${sg?.color || "text-app-text"}`}>
                        {score}% {sg ? `· ${sg.code}` : ""}{isOverall && !complete ? " *" : ""}
                      </span>
                    ) : (
                      <span className="text-xs text-app-text/30 w-24 text-right">No data</span>
                    )}
                  </div>
                );
              })}
              {isOverall && subjectRows.some(r => !r.complete && r.score !== null) && (
                <p className="text-[10px] text-app-text/40 mt-1">* provisional — awaiting remaining components</p>
              )}
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
          {student.teacherName && !isOverall && (
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

export default function PerformanceModule({ schoolCode }) {
  const [classes,        setClasses]        = useState([]);
  const [selectedClassId,setSelectedClassId]= useState("all");
  // Empty until the school's own term arrives. This used to default to the
  // literal "Term 1 2026" and choose from a hardcoded list, so the head
  // teacher was shown a term the school might not be in and marks recorded
  // against the real one looked missing.
  const [selectedTerm,   setSelectedTerm]   = useState("");
  const [schoolTerm,     setSchoolTerm]     = useState("");
  const [viewingPast,    setViewingPast]    = useState(false);
  const [selectedAssessment, setSelectedAssessment] = useState(ASSESSMENT_TYPES[0].id);
  const [viewMode,       setViewMode]       = useState("ranking"); // ranking | analytics | overall
  const [search,         setSearch]         = useState("");
  const [viewingStudent, setViewingStudent] = useState(null);
  const [error,          setError]          = useState("");
  const [schoolSettings, setSchoolSettings] = useState(null);

  // The school's current term is the default and the only one shown until the
  // head teacher deliberately looks back.
  useEffect(() => {
    if (!schoolCode) return undefined;
    const unsub = subscribeSchoolSettings(schoolCode, (settings) => {
      setSchoolSettings(settings);
      const term = settings?.currentTerm || "";
      setSchoolTerm(term);
      setSelectedTerm((chosen) => chosen || term);
    });
    return () => unsub();
  }, [schoolCode]);

  const [allStudents,    setAllStudents]    = useState([]);
  // classId -> assessmentType -> { subjects: [], marks: { studentId: { subject: score } }, teacherIds: [] }
  const [marksByClassAssessment, setMarksByClassAssessment] = useState({});
  const [teacherNames,   setTeacherNames]   = useState({});

  const [classesReady,   setClassesReady]   = useState(false);
  const [dataReady,      setDataReady]      = useState(false);

  const isLoading = !classesReady || !dataReady;
  const isOverall = viewMode === "overall";
  const selectedAssessmentLabel = ASSESSMENT_TYPES.find(a => a.id === selectedAssessment)?.label || "";

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

  // Fetch students and marks — grouped by class AND assessment component so
  // CA1/CA2/Mid-Term/End-of-Term never overwrite one another.
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
        const data  = d.data();
        const cid   = data.classId;
        const atype = data.assessmentType;
        if (!cid || !atype) return;

        if (!map[cid]) map[cid] = {};
        if (!map[cid][atype]) map[cid][atype] = { subjects: [], marks: {}, teacherIds: [] };
        const bucket = map[cid][atype];

        (data.subjects || []).forEach(subj => {
          if (!bucket.subjects.includes(subj)) bucket.subjects.push(subj);
        });

        Object.entries(data.marks || {}).forEach(([studentId, subjectMarks]) => {
          if (!bucket.marks[studentId]) bucket.marks[studentId] = {};
          Object.assign(bucket.marks[studentId], subjectMarks);
        });

        if (data.teacherId) {
          bucket.teacherIds.push(data.teacherId);
          teacherUids.add(data.teacherId);
        }
      });

      setMarksByClassAssessment(map);

      const names = {};
      await Promise.all([...teacherUids].map(async uid => {
        try {
          const snap = await getDoc(doc(db, "users", uid));
          if (snap.exists()) {
            const d = snap.data();
            names[uid] = d.displayName || d.fullName || `${d.firstName ?? ""} ${d.lastName ?? ""}`.trim() || "Unknown Teacher";
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

  // Each class is graded on its own section's scale (School Settings →
  // Sections, Curriculum & Grading). Looked up once per section so the same
  // scale is the same object, which the distribution chart compares on.
  const sections = useMemo(() => sectionsOf(schoolSettings), [schoolSettings]);
  const scaleOf = (classId) => {
    const cls = classes.find((c) => c.id === classId);
    const id = sectionIdOfClass(cls, sections);
    return (sections.find((x) => x.id === id) || sections[0])?.grading || MANEB_SCALE;
  };
  // The scale for the whole view: the chosen class's, or the one every class
  // shares. With "All classes" across differently graded sections there is no
  // single scale, so the legend and chart use the first and say so.
  const classScales = [...new Set(classes.map((c) => scaleOf(c.id)))];
  const mixedScales = selectedClassId === "all" && classScales.length > 1;
  const viewScale = selectedClassId === "all" ? (classScales[0] || MANEB_SCALE) : scaleOf(selectedClassId);
  const GRADES = scaleRows(viewScale);
  const getGradeInfo = (score, scale = viewScale) => gradeInfo(score, scale);

  const getBucket = (classId, assessmentType) =>
    marksByClassAssessment[classId]?.[assessmentType] || { subjects: [], marks: {}, teacherIds: [] };

  // ── Single-assessment view (Ranking / Analytics) ──────────────────────────
  const singleAssessmentStudents = (() => {
    const classFilter = selectedClassId === "all" ? null : selectedClassId;
    const relevant = classFilter ? allStudents.filter(s => s.classId === classFilter) : allStudents;

    return relevant.map(student => {
      const cid       = student.classId;
      const classObj  = classes.find(c => c.id === cid);
      const bucket    = getBucket(cid, selectedAssessment);
      const subjectMarks = bucket.marks[student.id] || {};
      const subjects  = bucket.subjects;
      const scores    = subjects.map(s => subjectMarks[s]).filter(v => v !== null && v !== undefined && v !== "").map(Number);
      const average   = scores.length ? round1(scores.reduce((a, b) => a + b, 0) / scores.length) : null;
      const teacherName = [...new Set(bucket.teacherIds)].map(uid => teacherNames[uid]).filter(Boolean).join(", ") || "—";

      return { ...student, className: classObj?.name || "—", subjectMarks, subjects, average, teacherName, scale: scaleOf(cid) };
    });
  })();

  // ── Overall (weighted) view — combines all four components per subject ───
  const overallStudents = (() => {
    const classFilter = selectedClassId === "all" ? null : selectedClassId;
    const relevant = classFilter ? allStudents.filter(s => s.classId === classFilter) : allStudents;

    return relevant.map(student => {
      const cid      = student.classId;
      const classObj = classes.find(c => c.id === cid);

      const subjectsSet = new Set();
      ASSESSMENT_TYPES.forEach(({ id }) => getBucket(cid, id).subjects.forEach(s => subjectsSet.add(s)));
      const subjects = [...subjectsSet];

      const subjMap = {};
      subjects.forEach(subj => {
        const perComponent = {};
        ASSESSMENT_TYPES.forEach(({ id }) => {
          const v = getBucket(cid, id).marks[student.id]?.[subj];
          if (v !== null && v !== undefined && v !== "") perComponent[id] = v;
        });
        subjMap[subj] = computeWeighted(perComponent);
      });

      const scores   = subjects.map(s => subjMap[s]?.score).filter(v => v !== null && v !== undefined);
      const complete = subjects.length > 0 && subjects.every(s => subjMap[s]?.complete);
      const average  = scores.length ? round1(scores.reduce((a, b) => a + b, 0) / scores.length) : null;

      return { ...student, className: classObj?.name || "—", subjects, subjMap, average, complete, scale: scaleOf(cid) };
    });
  })();

  const activeStudents = isOverall ? overallStudents : singleAssessmentStudents;

  // Rank within each class
  const studentsByClass = {};
  activeStudents.forEach(s => {
    if (!studentsByClass[s.classId]) studentsByClass[s.classId] = [];
    studentsByClass[s.classId].push(s);
  });
  Object.values(studentsByClass).forEach(group => {
    const withAvg = group.filter(s => s.average !== null).sort((a, b) => b.average - a.average);
    withAvg.forEach((s, i) => { s.rank = i + 1; });
  });

  const allSubjects = [...new Set(activeStudents.flatMap(s => s.subjects))].sort();

  const filtered = activeStudents.filter(s => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      fullName(s).toLowerCase().includes(q) ||
      s.studentCode?.toLowerCase().includes(q) ||
      s.className?.toLowerCase().includes(q)
    );
  });
  const ranked = [...filtered].filter(s => s.average !== null).sort((a, b) => b.average - a.average);

  // Stats — reflect whatever view is currently active
  const studentsWithMarks = activeStudents.filter(s => s.average !== null);
  const classAvg = studentsWithMarks.length
    ? round1(studentsWithMarks.reduce((a, b) => a + b.average, 0) / studentsWithMarks.length)
    : null;
  // Top grades and passes by each learner's own scale, not fixed percentages.
  const distinctions = studentsWithMarks.filter(s => getGradeInfo(s.average, s.scale)?.tone === "success").length;
  const failing      = studentsWithMarks.filter(s => getGradeInfo(s.average, s.scale)?.pass === false).length;
  const passRate     = studentsWithMarks.length
    ? Math.round((studentsWithMarks.filter(s => getGradeInfo(s.average, s.scale)?.pass !== false).length / studentsWithMarks.length) * 100)
    : null;
  const noData = dataReady && studentsWithMarks.length === 0;

  // Build the subject-rows the detail modal needs, in either mode
  const subjectRowsFor = (student) => {
    if (isOverall) {
      return student.subjects.map(subject => ({
        subject,
        score: student.subjMap[subject]?.score ?? null,
        complete: student.subjMap[subject]?.complete ?? false,
      }));
    }
    return student.subjects.map(subject => ({
      subject,
      score: student.subjectMarks[subject] ?? null,
      complete: true,
    }));
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 style={{ fontFamily: "'Playfair Display', serif" }}>Student Performance</h2>
          <p className="text-muted">
            Continuous Assessment · {mixedScales ? "each section's own grading" : `${viewScale.name || "School"} grading`} · {selectedTerm} ·{" "}
            {isOverall ? "Overall (weighted)" : selectedAssessmentLabel}
          </p>
          {/* Named explicitly, because a past term looks identical to the
              current one once the page has loaded — and a head teacher reading
              last term's ranking as this term's is the whole failure. */}
          {isPastTerm(selectedTerm, schoolTerm) && (
            <p style={{ fontSize: 11, color: "var(--warning, #f0b90b)", marginTop: 4 }}>
              Viewing a past term. The school is recording against {schoolTerm}.{" "}
              <button
                type="button"
                onClick={() => { setSelectedTerm(schoolTerm); setViewingPast(false); }}
                style={{ background: "none", border: "none", padding: 0, cursor: "pointer", color: "inherit", textDecoration: "underline", fontSize: 11 }}
              >
                Back to current
              </button>
            </p>
          )}
        </div>
        <button onClick={fetchData} disabled={isLoading} className="icon-btn" title="Refresh">
          <RefreshCw size={16} className={isLoading ? "spin" : ""} />
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
          <div className="stat-card__label">Top grades</div>
          <div className="text-muted text-[10px] mt-1">{mixedScales ? "Each section's top grades" : GRADES.filter(g => g.tone === "success").map(g => g.code).join(" or ")}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card__value stat-card__value--accent">{isLoading ? <Spinner size={20} /> : passRate !== null ? `${passRate}%` : "—"}</div>
          <div className="stat-card__label">School pass rate</div>
          <div className="text-muted text-[10px] mt-1">{mixedScales ? "A passing grade on their scale" : `Scoring ≥${Math.min(...GRADES.filter(g => g.pass !== false).map(g => g.min))}%`}</div>
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
        {/* The current term is shown, not chosen — the school records against
            one term and picking another here only ever hid live marks. Looking
            back is a separate, deliberate act, and read-only either way since
            nothing on this screen writes marks. */}
        <div>
          <label className="field__label">TERM</label>
          {viewingPast ? (
            <div className="relative">
              <select
                value={selectedTerm}
                onChange={e => setSelectedTerm(e.target.value)}
                className="field__select"
              >
                {[schoolTerm, ...pastTermOptions(schoolTerm)].filter(Boolean).map(t => (
                  <option key={t} value={t}>{t}{t === schoolTerm ? " (current)" : ""}</option>
                ))}
              </select>
              <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-app-text/40 pointer-events-none" />
            </div>
          ) : (
            <div className="field__select" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
              <span>{schoolTerm || "Not set"}</span>
              <button
                type="button"
                onClick={() => setViewingPast(true)}
                style={{ background: "none", border: "none", padding: 0, cursor: "pointer", fontSize: 11, color: "var(--primary, #4f6ef7)" }}
              >
                View past
              </button>
            </div>
          )}
        </div>

        {/* Assessment component — irrelevant on the combined Overall tab */}
        {!isOverall && (
          <div>
            <label className="field__label">ASSESSMENT</label>
            <div className="relative">
              <select
                value={selectedAssessment}
                onChange={e => setSelectedAssessment(e.target.value)}
                className="field__select"
              >
                {ASSESSMENT_TYPES.map(a => (
                  <option key={a.id} value={a.id}>{a.label} ({Math.round(a.weight * 100)}%)</option>
                ))}
              </select>
              <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-app-text/40 pointer-events-none" />
            </div>
          </div>
        )}

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
            { id: "ranking",   icon: Award,     label: "Ranking" },
            { id: "analytics", icon: BarChart2, label: "Analytics" },
            { id: "overall",   icon: PieChart,  label: "Overall" },
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

      {isOverall && (
        <div className="flex items-start gap-2 bg-blue-50 border border-blue-200 text-blue-800 p-3.5 rounded-2xl text-xs">
          <Info size={14} className="shrink-0 mt-0.5" />
          <span>
            Overall combines {ASSESSMENT_TYPES.map(a => `${a.label} (${Math.round(a.weight * 100)}%)`).join(" · ")} for {selectedTerm}.
            Students missing one or more components are marked <span className="font-semibold">Provisional</span>.
          </span>
        </div>
      )}

      {/* Grading scale reference */}
      <details className="group">
        <summary className="text-[11px] text-muted cursor-pointer select-none hover:text-app-text/70 transition-colors flex items-center gap-1.5">
          <ChevronDown size={12} className="group-open:rotate-180 transition-transform" />
          Grading Scale Reference{mixedScales ? " (first section — pick a class to see its own)" : ""}
        </summary>
        <div className="mt-2 flex flex-wrap gap-1.5 pl-4">
          {GRADES.map(g => (
            <span key={g.grade}
              className={`text-[10px] px-2.5 py-1 rounded-lg border font-semibold ${g.bg} ${g.color} ${g.border}`}>
              {g.code}: {rangeLabel(g)}% · {g.remark}
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
          <p className="empty-state__sub">
            {isOverall
              ? `No marks have been submitted for ${selectedTerm} yet.`
              : `No ${selectedAssessmentLabel} marks have been submitted for ${selectedTerm} yet.`}
          </p>
          <p className="text-muted text-xs">Teachers submit CA marks from their Performance module.</p>
        </div>
      )}

      {!isLoading && !noData && (
        <>
          {/* RANKING & OVERALL share the same ranked-list layout */}
          {(viewMode === "ranking" || viewMode === "overall") && (
            <div className="card">
              <div className="cc__head">
                <div className="cc__head-left">
                  {isOverall ? <PieChart size={18} /> : <Award size={18} />}
                  <h3>
                    {selectedClassId === "all" ? "School-wide" : classes.find(c => c.id === selectedClassId)?.name || ""}
                    {" "}{isOverall ? "Overall Ranking" : "Ranking"} · {selectedTerm}
                    {!isOverall && ` · ${selectedAssessmentLabel}`}
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
                    const g = getGradeInfo(student.average, student.scale);
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
                          <p className="text-xs text-muted">
                            {student.className}
                            {isOverall && !student.complete && student.average !== null && (
                              <span className="ml-2 text-[9px] font-semibold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">Provisional</span>
                            )}
                          </p>
                        </div>
                        <div className="hidden md:flex flex-wrap gap-1 max-w-xs">
                          {student.subjects.map(subj => {
                            const score = isOverall ? student.subjMap[subj]?.score : student.subjectMarks[subj];
                            const sg = getGradeInfo(score, student.scale);
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
                          {g && <p className={`text-[10px] font-semibold ${g.color}`}>{g.code} · {g.remark}</p>}
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
                  Grade Distribution — {selectedClassId === "all" ? "All Classes" : classes.find(c => c.id === selectedClassId)?.name || ""} · {selectedAssessmentLabel}
                </h3>
                <div className="space-y-2.5">
                  {GRADES.map(g => {
                    const count = studentsWithMarks.filter(s => s.scale === viewScale && getGradeInfo(s.average, s.scale)?.grade === g.grade).length;
                    const pct   = studentsWithMarks.length ? Math.round((count / studentsWithMarks.length) * 100) : 0;
                    return (
                      <div key={g.grade} className="flex items-center gap-3">
                        <span className={`text-[10px] font-bold w-24 shrink-0 ${g.color}`}>{g.code} {g.remark}</span>
                        <div className="flex-1 bg-app-bg rounded-full h-2.5">
                          <div
                            className="h-2.5 rounded-full transition-all duration-500"
                            style={{
                              width: `${pct}%`,
                              backgroundColor: g.hex,
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
                  <h3 className="font-semibold text-app-text text-sm mb-4">Class Averages Comparison — {selectedAssessmentLabel}</h3>
                  <div className="space-y-3">
                    {classes.map(cls => {
                      const clsStudents = studentsWithMarks.filter(s => s.classId === cls.id);
                      const avg = clsStudents.length
                        ? round1(clsStudents.reduce((a, b) => a + b.average, 0) / clsStudents.length)
                        : null;
                      const g = getGradeInfo(avg, scaleOf(cls.id));
                      return (
                        <div key={cls.id} className="flex items-center gap-3">
                          <span className="text-xs font-semibold text-muted w-24 shrink-0">{cls.name}</span>
                          <div className="flex-1 bg-app-bg rounded-full h-3">
                            {avg !== null && (
                              <div
                                className="h-3 rounded-full transition-all duration-700"
                                style={{
                                  width: `${avg}%`,
                                  backgroundColor: g?.hex,
                                }}
                              />
                            )}
                          </div>
                          {avg !== null ? (
                            <div className="flex items-center gap-1.5 shrink-0">
                              <span className={`text-sm font-bold ${g?.color || "text-app-text"}`}>{avg}%</span>
                              {g && <span className={`text-[9px] font-semibold ${g.color}`}>{g.code}</span>}
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
                  <h3 className="font-semibold text-app-text text-sm mb-4">Subject Averages — {selectedAssessmentLabel}</h3>
                  <div className="space-y-3">
                    {allSubjects.map(subj => {
                      const scope  = selectedClassId === "all" ? activeStudents : activeStudents.filter(s => s.classId === selectedClassId);
                      const scores = scope
                        .map(s => s.subjectMarks?.[subj])
                        .filter(v => v !== null && v !== undefined && v !== "")
                        .map(Number);
                      const avg = scores.length
                        ? round1(scores.reduce((a, b) => a + b, 0) / scores.length)
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
                                  backgroundColor: g?.hex,
                                }}
                              />
                            )}
                          </div>
                          {avg !== null ? (
                            <div className="flex items-center gap-2 shrink-0">
                              <span className={`text-sm font-bold ${g?.color || "text-app-text"}`}>{avg}%</span>
                              {g && <span className={`text-[9px] font-semibold ${g.color}`}>{g.code}</span>}
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
                        Students Needing Support ({atRisk.length}) — {selectedAssessmentLabel}
                      </h3>
                    </div>
                    <div className="space-y-2">
                      {atRisk.map(s => {
                        const g = getGradeInfo(s.average, s.scale);
                        const weakSubjects = s.subjects.filter(subj => {
                          const sc = s.subjectMarks?.[subj];
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
                              <p className={`text-[10px] font-semibold ${g?.color}`}>{g?.code} · {g?.remark}</p>
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
        Showing CA marks submitted by teachers. Select a class, term, or assessment component to filter, or view the Overall (weighted) tab for the combined term grade.
        Marks are read‑only — teachers manage entry from their Performance module.
      </p>

      {viewingStudent && (
        <StudentModal
          student={viewingStudent}
          subjectRows={subjectRowsFor(viewingStudent)}
          assessmentLabel={isOverall ? "Overall (weighted)" : selectedAssessmentLabel}
          isOverall={isOverall}
          onClose={() => setViewingStudent(null)}
        />
      )}
    </div>
  );
}