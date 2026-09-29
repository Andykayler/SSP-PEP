// modules/ReportsModule.jsx
import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { auth, db } from "../../../firebase";
import {
  subscribeSchoolSettings, pastTermOptions, isPastTerm, academicYearFor,
} from "../../../services/academicTerm";
import { notifyGuardians } from "../../../services/notifications";
import { fetchClearances, reportCardAllowed } from "../../../services/feeClearance";
import { buildArrears } from "../../../services/feeAllocationCore";
import { fetchReleases, resultsAccess } from "../../../services/resultsRelease";
import { sectionsOf, sectionIdOfClass, ladderFor, isManebScale, MANEB_SCALE } from "../../../services/curriculumCore";
import { gradeInfo, scaleRows } from "../../../components/ui/grades";
import { sendSmsToMany } from "../../../services/sms";
import { smsFallbackCategories } from "../../../services/smsFallback";
import { isModuleOn } from "../../../services/modules";
import { fetchTermSummaries, fetchReportCardHistory } from "../../../services/termSummary";
import { fetchInsights } from "../../../services/aiInsight";
import "./staff-management.css";
import {
  collection, query, where, getDocs, doc, getDoc, setDoc, writeBatch, serverTimestamp,
} from "firebase/firestore";
import {
  FileText, Download, Printer, TrendingUp, Award, Users,
  RefreshCw, Loader2, AlertCircle, ChevronDown, Search,
  BarChart2, X, CheckCircle, AlertTriangle, ArrowUp, ArrowDown, Minus,
  GraduationCap, ArrowRight, Save, Send,
} from "lucide-react";

// School type → highest form/standard that type goes up to — mirrors the
// options offered in ClassModule.jsx's "Set up classes" flow. A student in
// the top level has nothing to promote into, so they graduate instead.

// Assessment components & weights — mirrors PerformanceModule.jsx (both
// teacher and headteacher copies) exactly, since promotion eligibility has
// to be based on the same weighted overall grade shown there, not the
// simpler last-write-wins merge this file's own `loadTermMarks` uses for
// its other tabs.
const ASSESSMENT_TYPES = [
  { id: "CA1",     weight: 0.10 },
  { id: "CA2",     weight: 0.10 },
  { id: "MidTerm", weight: 0.20 },
  { id: "EndTerm", weight: 0.60 },
];

function computeWeightedAverage(perComponentScores) {
  let weightedSum = 0, weightUsed = 0;
  ASSESSMENT_TYPES.forEach(({ id, weight }) => {
    const v = perComponentScores[id];
    if (v !== null && v !== undefined && v !== "") {
      weightedSum += Number(v) * weight;
      weightUsed += weight;
    }
  });
  if (weightUsed === 0) return null;
  return Math.round((weightedSum / weightUsed) * 10) / 10;
}

// Term options are derived from whatever the school has set as current, so
// this module can never offer a term the rest of the system does not use.


function fullName(s) {
  return s.fullName || `${s.firstName ?? ""} ${s.lastName ?? ""}`.trim() || s.name || "—";
}

function avg(scores) {
  if (!scores.length) return null;
  return Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10;
}

function Spinner({ size = 20 }) {
  return <div className="spinner" style={{ width: size, height: size }} />;
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
    <div className="flex-1 bg-app-bg rounded-full h-2.5 overflow-hidden">
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

// ─── Report Card Modal (printable) ──────────────────────────────────────────
function ReportCardModal({ student, schoolCode, term, onClose }) {
  const getGradeInfo = (score) => gradeInfo(score, student.scale);
  const g = getGradeInfo(student.average);
  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-container" style={{ maxWidth: "640px" }}>
        <div className="modal-header">
          <div>
            <h3>Report Card Preview</h3>
            <p>{fullName(student)}</p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => window.print()} className="icon-btn icon-btn--assign" style={{ background: "rgba(255,255,255,0.2)" }}>
              <Printer size={16} />
            </button>
            <button onClick={onClose} className="modal-close">
              <X size={18} />
            </button>
          </div>
        </div>

        <div id="report-print-area" className="modal-body" style={{ maxHeight: "none", padding: "24px" }}>
          {/* School header */}
          <div className="text-center border-b-2 border-[#0F2044] pb-5">
            <p className="text-[10px] font-bold tracking-[0.25em] text-app-text/50 uppercase mb-1">
              Acalink
            </p>
            <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: "1.75rem", fontWeight: "bold" }}>
              {schoolCode}
            </h2>
            <p className="text-sm text-app-text/60 mt-1">Continuous Assessment Report · {term}</p>
          </div>

          {/* Student info */}
          <div className="grid grid-cols-2 gap-4 text-sm mt-6">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-app-text/40">Student Name</p>
              <p className="font-semibold text-app-text mt-0.5">{fullName(student)}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-app-text/40">Adm. No.</p>
              <p className="font-semibold text-app-text mt-0.5">{student.studentCode || student.id}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-app-text/40">Class</p>
              <p className="font-semibold text-app-text mt-0.5">{student.className}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-app-text/40">Class Position</p>
              <p className="font-semibold text-app-text mt-0.5">
                {student.rank ? `${student.rank}${student.rank === 1 ? "st" : student.rank === 2 ? "nd" : student.rank === 3 ? "rd" : "th"}` : "—"}
              </p>
            </div>
          </div>

          {/* Subject marks table */}
          <div className="mt-6">
            <p className="text-[10px] font-bold uppercase tracking-widest text-app-text/50 mb-2">Subject Results</p>
            <div className="data-table-wrap">
              <table className="data-table data-table--stack">
                <thead>
                  <tr>
                    <th>Subject</th>
                    <th>Mark (%)</th>
                    <th>Grade</th>
                  </tr>
                </thead>
                <tbody>
                  {student.subjects.map((subj, i) => {
                    const score = student.subjectMarks?.[subj];
                    const sg = getGradeInfo(score);
                    const hasScore = score !== null && score !== undefined && score !== "";
                    return (
                      <tr key={subj}>
                        <td data-label="Subject">{subj}</td>
                        <td data-label="Mark (%)">{hasScore ? score : "—"}</td>
                        <td data-label="Grade">
                          {sg ? (
                            <span className={`tag ${sg.bg} ${sg.color} ${sg.border}`}>
                              {sg.code} · {sg.remark}
                            </span>
                          ) : <span className="text-muted">—</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Overall */}
          <div className={`mt-6 flex items-center justify-between rounded-2xl p-4 border ${g ? `${g.bg} ${g.border}` : "bg-app-bg border-app-border"}`}>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-app-text/50">Overall CA Average</p>
              <p className={`text-3xl font-bold mt-0.5 ${g?.color || "text-app-text"}`}>
                {student.average !== null ? `${student.average}%` : "—"}
              </p>
            </div>
            {g && (
              <div className="text-right">
                <p className={`text-3xl font-bold ${g.color}`}>{g.code}</p>
                <p className={`text-xs font-semibold ${g.color}`}>{g.remark}</p>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="border-t border-app-border pt-4 mt-6 grid grid-cols-2 gap-4 text-[10px] text-app-text/40">
            <div>
              <p className="font-bold text-app-text/60 mb-4">Class Teacher's Signature</p>
              <div className="border-b border-app-border w-32" />
            </div>
            <div className="text-right">
              <p className="font-bold text-app-text/60 mb-4">Head Teacher's Signature</p>
              <div className="border-b border-app-border w-32 ml-auto" />
            </div>
            <p className="col-span-2 text-center">
              {isManebScale(student.scale) ? "CA contributes 40% to final MSCE grade. " : ""}This is a school record.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function ReportsModule({ schoolCode, userId, userName }) {
  const [reportType, setReportType] = useState("reportCards");
  const [selectedClassId, setSelectedClassId] = useState("all");
  const [selectedTerm, setSelectedTerm] = useState("");
  const [schoolTerm, setSchoolTerm] = useState("");
  const [releasing, setReleasing] = useState(false);
  const [releaseNote, setReleaseNote] = useState(null);
  // Empty until the school's term is known, then defaults to the term before
  // it. This was the literal "Term 3 2025", so every school compared against
  // one particular term in one particular year whatever term they were in.
  const [compareTerm, setCompareTerm] = useState("");
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState("rank"); // rank | name | average
  const [sortDir, setSortDir] = useState("asc");
  const [viewingStudent, setViewingStudent] = useState(null);
  const [error, setError] = useState("");

  const [classes, setClasses] = useState([]);
  const [allStudents, setAllStudents] = useState([]);
  const [allMarksMap, setAllMarksMap] = useState({});
  const [compareMarksMap, setCompareMarksMap] = useState({});
  const [byAssessmentMap, setByAssessmentMap] = useState({}); // classId -> assessmentType -> { marks }
  const [teacherNames, setTeacherNames] = useState({});
  const [schoolSettings, setSchoolSettings] = useState(null);

  // Each class is graded on its own section's scale; see curriculumCore.js.
  // One object per section, so learners on the same scale compare equal.
  const sections = useMemo(() => sectionsOf(schoolSettings), [schoolSettings]);
  const scaleOf = (classId) => {
    const cls = classes.find((c) => c.id === classId);
    const id = sectionIdOfClass(cls, sections);
    return (sections.find((x) => x.id === id) || sections[0])?.grading || MANEB_SCALE;
  };

  const [classesReady, setClassesReady] = useState(false);
  const [dataReady, setDataReady] = useState(false);
  const isLoading = !classesReady || !dataReady;

  // The school's current term drives the default selection here, the same way
  // it does in the teacher's mark entry.
  useEffect(() => {
    if (!schoolCode) return undefined;
    const unsub = subscribeSchoolSettings(schoolCode, (settings) => {
      const term = settings?.currentTerm || "";
      setSchoolTerm(term);
      setSelectedTerm((chosen) => chosen || term);
      setCompareTerm((chosen) => chosen || pastTermOptions(term, 1)[0] || "");
    });
    return () => unsub();
  }, [schoolCode]);

  // Current term first, then terms that have actually happened. Never a future
  // one: nothing is recorded in it, so a report for it is a blank page that
  // reads as a school with no marks.
  const TERMS = [schoolTerm, ...pastTermOptions(schoolTerm)].filter(Boolean);

  // Print style injection
  useEffect(() => {
    const el = document.createElement("style");
    el.textContent = PRINT_STYLE;
    document.head.appendChild(el);
    return () => document.head.removeChild(el);
  }, []);

  // Load classes
  useEffect(() => {
    if (!schoolCode) return;
    let cancelled = false;
    (async () => {
      setClassesReady(false);
      setError("");
      try {
        const [snap, settingsSnap] = await Promise.all([
          getDocs(query(collection(db, "school_classes"), where("schoolCode", "==", schoolCode))),
          getDoc(doc(db, "school_settings", schoolCode)),
        ]);
        if (cancelled) return;
        setClasses(
          snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (a.formLevel ?? 999) - (b.formLevel ?? 999) || (a.name || "").localeCompare(b.name || ""))
        );
        setSchoolSettings(settingsSnap.exists() ? settingsSnap.data() : null);
      } catch {
        if (!cancelled) setError("Could not load classes.");
      } finally {
        if (!cancelled) setClassesReady(true);
      }
    })();
    return () => { cancelled = true; };
  }, [schoolCode]);

  // Fetch marks
  const fetchData = useCallback(async () => {
    if (!schoolCode || !classesReady) return;
    setDataReady(false);
    setError("");
    try {
      const studentSnap = await getDocs(
        query(collection(db, "students"), where("schoolCode", "==", schoolCode))
      );
      // Only currently-enrolled students — a missing status defaults to "active"
      // (same convention used in modules/student.jsx), everything else (transferred,
      // graduated, suspended, etc.) is excluded from reports.
      const currentStudents = studentSnap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(s => (s.status || "active") === "active");
      setAllStudents(currentStudents);

      const loadTermMarks = async (term) => {
        const snap = await getDocs(
          query(
            collection(db, "ca_marks"),
            where("schoolCode", "==", schoolCode),
            where("term", "==", term)
          )
        );
        const map = {};
        // Same rows, bucketed by assessmentType too — `map` above merges every
        // component together last-write-wins (fine for a quick single-figure
        // average elsewhere in this file), but promotion eligibility needs the
        // properly *weighted* CA1/CA2/Mid-Term/End-of-Term combination, which
        // requires keeping each component's marks separate.
        const byAssessment = {};
        const teacherUids = new Set();
        snap.docs.forEach(d => {
          const data = d.data();
          const cid = data.classId;
          const atype = data.assessmentType;
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
          if (cid && atype) {
            if (!byAssessment[cid]) byAssessment[cid] = {};
            if (!byAssessment[cid][atype]) byAssessment[cid][atype] = { subjects: [], marks: {} };
            const bucket = byAssessment[cid][atype];
            (data.subjects || []).forEach(subj => {
              if (!bucket.subjects.includes(subj)) bucket.subjects.push(subj);
            });
            Object.entries(data.marks || {}).forEach(([sid, sm]) => {
              if (!bucket.marks[sid]) bucket.marks[sid] = {};
              Object.assign(bucket.marks[sid], sm);
            });
          }
        });
        return { map, byAssessment, teacherUids };
      };

      const [primary, compare] = await Promise.all([
        loadTermMarks(selectedTerm),
        loadTermMarks(compareTerm),
      ]);

      setAllMarksMap(primary.map);
      setCompareMarksMap(compare.map);
      setByAssessmentMap(primary.byAssessment);

      const allUids = new Set([...primary.teacherUids, ...compare.teacherUids]);
      const names = {};
      await Promise.all([...allUids].map(async uid => {
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
      setError("Could not load report data: " + err.message);
    } finally {
      setDataReady(true);
    }
  }, [schoolCode, classesReady, selectedTerm, compareTerm]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Enrich students
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
    return { ...student, className: classObj?.name || "—", subjectMarks, subjects, average, teacherName, scale: scaleOf(cid) };
  };

  let enrichedStudents = allStudents.map(enrich(allMarksMap));
  let compareStudents  = allStudents.map(enrich(compareMarksMap));

  // Ranks
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
  enrichedStudents = addRanks(enrichedStudents);
  compareStudents = addRanks(compareStudents);

  // Trend delta
  const compareMap = Object.fromEntries(compareStudents.map(s => [s.id, s.average]));
  const studentsWithTrend = enrichedStudents.map(s => ({
    ...s,
    prevAverage: compareMap[s.id] ?? null,
    delta: s.average !== null && compareMap[s.id] !== null
      ? Math.round((s.average - compareMap[s.id]) * 10) / 10
      : null,
  }));

  const classFiltered = selectedClassId === "all"
    ? studentsWithTrend
    : studentsWithTrend.filter(s => s.classId === selectedClassId);
  const studentsWithMarks = classFiltered.filter(s => s.average !== null);
  const allSubjects = [...new Set(classFiltered.flatMap(s => s.subjects))].sort();

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

  // The scale for the whole view: the chosen class's, or the one every class
  // shares. "All classes" across differently graded sections has no single
  // scale, so the chart and legend use the first section's and say so.
  const classScales = [...new Set(classes.map((c) => scaleOf(c.id)))];
  const mixedScales = selectedClassId === "all" && classScales.length > 1;
  const viewScale = selectedClassId === "all" ? (classScales[0] || MANEB_SCALE) : scaleOf(selectedClassId);
  const GRADES = scaleRows(viewScale);
  const getGradeInfo = (score, scale = viewScale) => gradeInfo(score, scale);

  const schoolAvg   = avg(studentsWithMarks.map(s => s.average));
  const distinctions = studentsWithMarks.filter(s => getGradeInfo(s.average, s.scale)?.tone === "success").length;
  const passRate     = studentsWithMarks.length
    ? Math.round((studentsWithMarks.filter(s => getGradeInfo(s.average, s.scale)?.pass !== false).length / studentsWithMarks.length) * 100)
    : null;
  const failing      = studentsWithMarks.filter(s => getGradeInfo(s.average, s.scale)?.pass === false).length;
  // Passing, but on the lowest passing grades — the "needs support" group.
  const isFailing = (s) => getGradeInfo(s.average, s.scale)?.pass === false;
  const needsSupport = (s) => {
    const g = getGradeInfo(s.average, s.scale);
    return Boolean(g) && g.pass !== false && g.tone === "warning";
  };

  const prevStudentsWithMarks = allStudents.map(enrich(compareMarksMap)).filter(s => s.average !== null);
  const prevSchoolAvg = avg(prevStudentsWithMarks.map(s => s.average));
  const avgDelta = schoolAvg !== null && prevSchoolAvg !== null
    ? Math.round((schoolAvg - prevSchoolAvg) * 10) / 10
    : null;

  const noData = dataReady && studentsWithMarks.length === 0;

  const toggleSort = (col) => {
    if (sortBy === col) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortBy(col); setSortDir("asc"); }
  };

  const SortIcon = ({ col }) => {
    if (sortBy !== col) return <Minus size={10} className="opacity-30" />;
    return sortDir === "asc" ? <ArrowUp size={10} /> : <ArrowDown size={10} />;
  };

  // ── Releasing report cards to families ──────────────────────────────────
  // A report card is a snapshot, not a live view. Individual components become
  // visible in the parent app as each teacher publishes them; the combined,
  // weighted assessment stays hidden until the head teacher issues it here.
  // Writing the document IS the release — the app shows the panel when the
  // document exists.
  /**
   * The whole report card as an SMS: every subject with its mark, then the
   * average and the position.
   *
   * Subject names are written out in full rather than abbreviated. These are a
   * parent's only copy of the result — they cannot open the app, which is why
   * they are being sent an SMS — and "SES 68" is a worse thing to receive than
   * a message one segment longer.
   *
   * Twilio rejects anything past 1600 characters, so a pupil carrying an
   * unusual number of subjects is trimmed rather than failing outright: a
   * report missing its last two lines still beats no report.
   */
  const reportCardSms = (student, subjects, insight = "") => {
    const cls = student.className || classes.find((c) => c.id === student.classId)?.name || "";
    const size = enrichedStudents.filter((x) => x.classId === student.classId).length;
    const avg = student.average !== null && student.average !== undefined
      ? `${Number(student.average).toFixed(1)}%`
      : "n/a";

    const marks = subjects
      .map((r) => `${r.subject} ${Math.round(r.score)}`)
      .join(", ");

    const head = `${selectedTerm} report: ${fullName(student)}${cls ? `, ${cls}` : ""}`;
    const tail = `Average ${avg}${student.rank ? `, position ${student.rank} of ${size}` : ""}`;

    // The insight goes last, after the marks it refers to — a parent reading a
    // truncated message on a basic handset should still have the result even
    // if the advice is cut off, never the reverse.
    const text = [head, marks || "No subject marks recorded", tail, insight]
      .filter(Boolean)
      .join("\n");

    return text.length <= 1600 ? text : text.slice(0, 1597) + "...";
  };

  /**
   * Roughly how many billable parts a message costs. A single SMS holds 160
   * GSM-7 characters, but a concatenated one only 153 per part, because each
   * part gives up seven characters to the header that reassembles them —
   * which is why a 161-character message bills as two 153s, not 160 + 1.
   *
   * Approximate by design: a non-Latin character anywhere in the text drops
   * the limits to 70 and 67, and this does not attempt to detect that.
   */
  const smsSegments = (text) => {
    const n = (text || "").length;
    if (n === 0) return 0;
    return n <= 160 ? 1 : Math.ceil(n / 153);
  };

  const releaseReportCards = async () => {
    const scored = sorted.filter((s) => s.average !== null && s.average !== undefined);
    if (scored.length === 0) {
      setReleaseNote({ type: "error", text: "No students have marks for this term yet." });
      return;
    }

    // A student whose report card the school has decided to withhold over fees
    // must not have it issued anyway — that decision was recorded and the
    // family was told it stands. Held-back students are named rather than
    // silently dropped, so nobody wonders later why a card never arrived.
    const clearances = await fetchClearances(schoolCode, selectedTerm);
    const withheld = scored.filter((s) => !reportCardAllowed(clearances.get(s.id)));
    const targets = scored.filter((s) => reportCardAllowed(clearances.get(s.id)));

    // Families who owe fees don't see results until the balance is cleared or
    // the bursar releases them. Their cards are still issued — the parent app
    // shows each one as soon as that happens — but they are not sent the
    // notice or the SMS, which carries the marks themselves.
    let feeHeld = new Set();
    try {
      const [chargeSnap, paySnap, releases] = await Promise.all([
        getDocs(query(collection(db, "fee_assignments"), where("schoolCode", "==", schoolCode))),
        getDocs(query(collection(db, "payments"), where("schoolCode", "==", schoolCode))),
        fetchReleases(schoolCode, selectedTerm),
      ]);
      const balances = buildArrears({
        students: targets,
        charges: chargeSnap.docs.map((d) => d.data()),
        payments: paySnap.docs.map((d) => d.data()).filter((p) => p.status === "verified"),
        currentTerm: selectedTerm,
      });
      feeHeld = new Set(balances
        .filter((r) => !resultsAccess({ balance: r.balance, release: releases.get(r.id), term: selectedTerm }).visible)
        .map((r) => r.id));
    } catch (err) {
      // Without the fee position, nobody is notified — telling a family that
      // owes fees their child's marks is the one thing this must not do.
      console.error("[reports] fee position unavailable:", err);
      feeHeld = new Set(targets.map((s) => s.id));
    }
    const notifyTargets = targets.filter((s) => !feeHeld.has(s.id));

    if (targets.length === 0) {
      setReleaseNote({
        type: "error",
        text: `All ${withheld.length} student(s) with marks have their report card withheld `
          + `over fees. Clear them in Arrears & Clearance first.`,
      });
      return;
    }

    const scope = selectedClassId === "all"
      ? "every class"
      : classes.find((c) => c.id === selectedClassId)?.name || "this class";
    if (!window.confirm(
      `Issue ${selectedTerm} report cards for ${targets.length} student(s) in ${scope}?\n\n`
      + (withheld.length > 0
        ? `${withheld.length} student(s) are held back over fees and will be skipped: `
          + `${withheld.slice(0, 5).map(fullName).join(", ")}`
          + `${withheld.length > 5 ? ` and ${withheld.length - 5} more` : ""}.\n\n`
        : "")
      + (feeHeld.size > 0
        ? `${feeHeld.size} famil${feeHeld.size === 1 ? "y owes" : "ies owe"} fees: their cards are issued but stay `
          + `hidden, and they are not notified, until fees are cleared or the bursar releases them.\n\n`
        : "")
      + `Guardians will be notified and the combined result becomes visible in the `
      + `ACALink app. Re-issuing overwrites the previous card.`
    )) return;

    setReleasing(true);
    setReleaseNote(null);
    try {
      // Per-student subject rows, kept as they are computed for the report card
      // document so the SMS below can quote the same marks without walking
      // byAssessmentMap a second time.
      const subjectsById = new Map();

      // Firestore caps a batch at 500 writes.
      for (let i = 0; i < targets.length; i += 400) {
        const batch = writeBatch(db);
        targets.slice(i, i + 400).forEach((student) => {
          const cid = student.classId;
          const subjectNames = new Set();
          ASSESSMENT_TYPES.forEach(({ id }) =>
            (byAssessmentMap[cid]?.[id]?.subjects || []).forEach((sub) => subjectNames.add(sub)));

          const subjects = [...subjectNames].map((subject) => {
            const components = {};
            ASSESSMENT_TYPES.forEach(({ id }) => {
              const v = byAssessmentMap[cid]?.[id]?.marks?.[student.id]?.[subject];
              if (v !== null && v !== undefined && v !== "") components[id] = Number(v);
            });
            return { subject, components, score: computeWeightedAverage(components) };
          }).filter((row) => row.score !== null);

          subjectsById.set(student.id, subjects);

          const docId = `${schoolCode}__${student.id}__${selectedTerm.replace(/\s+/g, "_")}`;
          batch.set(doc(db, "report_cards", docId), {
            schoolCode,
            studentId: student.id,
            studentName: fullName(student),
            studentCode: student.studentCode || "",
            classId: cid,
            className: student.className || classes.find((c) => c.id === cid)?.name || "",
            term: selectedTerm,
            academicYear: academicYearFor(selectedTerm),
            subjects,
            overallAverage: student.average,
            position: student.rank ?? null,
            classSize: enrichedStudents.filter((s) => s.classId === cid).length,
            generatedAt: serverTimestamp(),
            generatedBy: userId || "",
          });
        });
        await batch.commit();
      }

      // ── AI insight ──
      //
      // Runs after the cards are written, never before: the result is the thing
      // the school came here to issue, and it must be safely saved before
      // anything waits on a language model. Everything downstream tolerates an
      // empty map — a pupil with no insight gets exactly the report card this
      // screen produced before the module existed.
      //
      // Generated once and used twice: written onto the report card, where the
      // app reads it, and passed to the SMS below. Not gated on SMS — a school
      // using only the app still gets insights.
      let insights = new Map();
      let insightError = null;
      if (isModuleOn(schoolSettings, "ai_insights")) {
        setReleaseNote({ type: "ok", text: "Preparing insights…" });

        const [summaries, cardHistory] = await Promise.all([
          fetchTermSummaries({ schoolCode, term: selectedTerm }),
          fetchReportCardHistory({ schoolCode, upToTerm: selectedTerm }),
        ]);

        // Class averages give the model something to judge a mark against —
        // 55% means nothing until you know the class sat at 48 or at 71.
        const classAverages = new Map();
        classes.forEach((c) => {
          const marks = enrichedStudents
            .filter((s) => s.classId === c.id && s.average !== null && s.average !== undefined)
            .map((s) => Number(s.average));
          if (marks.length > 0) {
            classAverages.set(c.id, Math.round(marks.reduce((a, b) => a + b, 0) / marks.length));
          }
        });

        // Per-subject class averages. The overall figure cannot distinguish a
        // 62 in a class averaging 41 from a 62 in a class averaging 78, and
        // those two need opposite advice.
        const subjectAverages = new Map();   // classId -> { subject -> average }
        classes.forEach((c) => {
          const inClass = enrichedStudents.filter((s) => s.classId === c.id);
          const bySubject = {};
          inClass.forEach((s) => {
            (s.subjects || []).forEach((subj) => {
              const v = Number(s.subjectMarks?.[subj]);
              if (Number.isFinite(v)) (bySubject[subj] ||= []).push(v);
            });
          });
          const out = {};
          Object.entries(bySubject).forEach(([subj, vals]) => {
            out[subj] = Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
          });
          subjectAverages.set(c.id, out);
        });

        // How the pupil moved through the term's assessments. A fade and a
        // climb produce the same average and mean opposite things.
        const progressionFor = (student) => ASSESSMENT_TYPES.map(({ id, label }) => {
          const marksForType = byAssessmentMap[student.classId]?.[id]?.marks?.[student.id];
          if (!marksForType) return null;
          const vals = Object.values(marksForType)
            .map(Number).filter(Number.isFinite);
          if (vals.length === 0) return null;
          return { label, score: Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) };
        }).filter(Boolean);

        ({ insights, error: insightError } = await fetchInsights(
          targets.map((s) => {
            const sum = summaries.get(s.id);
            return {
              id: s.id,
              name: fullName(s),
              className: s.className || classes.find((c) => c.id === s.classId)?.name || "",
              average: s.average !== null && s.average !== undefined
                ? Math.round(Number(s.average)) : null,
              classAverage: classAverages.get(s.classId) ?? null,
              position: s.rank ?? null,
              classSize: enrichedStudents.filter((x) => x.classId === s.classId).length,
              term: selectedTerm,
              subjects: (subjectsById.get(s.id) || []).map((r) => ({
                subject: r.subject,
                score: Math.round(r.score),
                classAverage: subjectAverages.get(s.classId)?.[r.subject] ?? null,
              })),
              progression: progressionFor(s),
              history: cardHistory.get(s.id) || [],
              attendance: sum
                ? { present: sum.present, daysRecorded: sum.daysRecorded,
                    absent: sum.absent, late: sum.late }
                : null,
              discipline: sum
                ? { cases: sum.disciplineCases, serious: sum.seriousCases, offenses: sum.offenses }
                : null,
            };
          }),
          {
            onProgress: (done, total) =>
              setReleaseNote({ type: "ok", text: `Preparing insights ${done}/${total}…` }),
          },
        ));

        // Second pass over the cards just written, adding the insight. Separate
        // from the first so a model failure cannot cost the school its results.
        if (insights.size > 0) {
          const withInsight = targets.filter((s) => insights.has(s.id));
          for (let i = 0; i < withInsight.length; i += 400) {
            const batch = writeBatch(db);
            withInsight.slice(i, i + 400).forEach((student) => {
              const docId = `${schoolCode}__${student.id}__${selectedTerm.replace(/\s+/g, "_")}`;
              batch.set(
                doc(db, "report_cards", docId),
                {
                  // The app shows the full analysis; the SMS carries the short
                  // line. Both are stored so the two never drift apart and the
                  // school can see exactly what each parent was sent.
                  insight: insights.get(student.id).analysis,
                  insightSms: insights.get(student.id).sms,
                  insightAt: serverTimestamp(),
                },
                { merge: true },
              );
            });
            await batch.commit();
          }
        }
      }

      // Notified only now, with the insight already on the card — a parent who
      // taps the notification the second it arrives should find the finished
      // report, not one that grows a paragraph while they are reading it.
      await notifyGuardians({
        students: notifyTargets,
        schoolCode,
        title: (s) => `${selectedTerm} report card for ${fullName(s)}`,
        body: "Your child's report card has been issued. Open ACALink to see the full result.",
        // `report`, not `performance`: this is the head teacher issuing the
        // term's official result, not a teacher publishing one subject. The
        // distinction is what lets a school send an SMS for this and stay
        // silent for the dozen subject publications that precede it.
        category: "report",
        priority: "high",
        actorId: userId,
        actorName: userName || "Head Teacher",
        actorRole: "head_teacher",
        entityType: "report_card",
      });

      // ── SMS to every guardian ──
      //
      // Sent from here rather than from a Cloud Function because this message
      // goes out regardless of whether the guardian uses the app, so nothing
      // needs to check `parent_devices` — the one fact a browser cannot see.
      // The in-app notification above already covers app users; this reaches
      // the families on feature phones, who are otherwise told nothing.
      //
      // The mark itself is in the message on purpose. A guardian without the
      // app cannot act on "open ACALink to see the result", and telling a
      // parent a report exists without saying what is in it just sends them to
      // the school to ask — the trip this is supposed to save.
      // SMS when the school has SMS on and chose it for report cards;
      // otherwise WhatsApp, which costs the school nothing per message — so a
      // school with SMS off still reaches families who don't use the app.
      let smsNote = "";
      const smsOn = isModuleOn(schoolSettings, "sms");
      const channel = smsOn ? "sms" : "whatsapp";
      const sendToPhones = smsOn
        ? smsFallbackCategories(schoolSettings).includes("report")
        : schoolSettings?.whatsappEnabled !== false;
      if (sendToPhones) {

        const recipients = notifyTargets
          .filter((s) => s.guardianPhone)
          .map((s) => ({
            to: s.guardianPhone,
            ref: s.id,
            message: reportCardSms(s, subjectsById.get(s.id) || [], insights.get(s.id)?.sms || ""),
          }));

        if (recipients.length > 0) {
          // A full report card runs past one segment, and each segment bills
          // separately — so the count is reported rather than left for the
          // school to discover on the Twilio invoice.
          const segments = recipients.reduce((sum, r) => sum + smsSegments(r.message), 0);
          const label = smsOn ? "SMS" : "WhatsApp";

          setReleaseNote({ type: "ok", text: `Sending ${label} 0/${recipients.length}…` });
          const res = await sendSmsToMany(recipients, {
            channel,
            onProgress: (done, total) =>
              setReleaseNote({ type: "ok", text: `Sending ${label} ${done}/${total}…` }),
          });
          smsNote = res.failed === 0
            ? ` ${res.sent} ${label} sent${smsOn ? ` (~${segments} billable parts)` : ""}.`
            : ` ${res.sent} ${label} sent, ${res.failed} failed`
              + `${res.failures[0]?.reason ? ` (${res.failures[0].reason})` : ""}.`;
        }
      }

      // The release itself succeeded either way — the cards are written and the
      // guardians told — so a failed insight is reported alongside that, not
      // instead of it. Saying nothing would leave the school to notice on its
      // own that a module it switched on is doing nothing.
      setReleaseNote({
        type: insightError ? "error" : "ok",
        text: `Issued ${targets.length} report card(s). ${notifyTargets.length} guardian(s) notified.${smsNote}`
            + (feeHeld.size > 0 ? ` ${feeHeld.size} held back until fees are cleared or released by the bursar.` : "")
            + (insightError ? ` Insights unavailable: ${insightError}` : ""),
      });
    } catch (err) {
      console.error("Report card release failed:", err);
      setReleaseNote({ type: "error", text: `Could not issue report cards: ${err.message}` });
    } finally {
      setReleasing(false);
    }
  };

  // ── Promotion ───────────────────────────────────────────────────────────
  // Uses whatever `selectedTerm` is currently chosen above as the "final"
  // assessment the promotion decision is based on — the head teacher picks
  // the term (usually the last one of the year) the same way they already
  // do for every other tab in this module.
  const promotionThreshold = schoolSettings?.promotionThreshold ?? 40;
  const [thresholdDraft, setThresholdDraft] = useState(null);
  const [savingThreshold, setSavingThreshold] = useState(false);
  const [promotingLevel, setPromotingLevel] = useState(null);
  const [promoteMsg, setPromoteMsg] = useState(null);

  const promotionGroups = useMemo(() => {
    const configured = classes.filter((c) => c.formLevel);
    if (configured.length === 0) return [];

    // Grouped by section and year: Standard 1 and Form 1 are both year 1.
    const sectionOrder = (id) => ["kindergarten", "primary", "secondary"].indexOf(id);
    const byLevel = {};
    configured.forEach((c) => {
      const key = `${sectionIdOfClass(c, sections)}:${c.formLevel}`;
      if (!byLevel[key]) byLevel[key] = [];
      byLevel[key].push(c);
    });
    const inYear = (sectionId, year) => classes
      .filter((c) => c.formLevel === year && sectionIdOfClass(c, sections) === sectionId)
      .sort((a, b) => (a.stream || "").localeCompare(b.stream || ""));

    return Object.keys(byLevel).sort((a, b) => {
      const [sa, la] = a.split(":");
      const [sb, lb] = b.split(":");
      return sectionOrder(sa) - sectionOrder(sb) || Number(la) - Number(lb);
    }).map((level) => {
      const [sectionId, yearText] = level.split(":");
      const year = Number(yearText);
      const levelClasses = byLevel[level];
      const levelClassIds = new Set(levelClasses.map((c) => c.id));
      const first = levelClasses[0];
      const levelLabel = first.stream ? first.name.slice(0, first.name.length - first.stream.length) : first.name;

      const withAverage = allStudents.filter((s) => levelClassIds.has(s.classId)).map((s) => {
        const cid = s.classId;
        const subjectsSet = new Set();
        ASSESSMENT_TYPES.forEach(({ id }) => (byAssessmentMap[cid]?.[id]?.subjects || []).forEach((sub) => subjectsSet.add(sub)));
        const perSubjectAverages = [...subjectsSet].map((subj) => {
          const perComponent = {};
          ASSESSMENT_TYPES.forEach(({ id }) => {
            const v = byAssessmentMap[cid]?.[id]?.marks?.[s.id]?.[subj];
            if (v !== null && v !== undefined && v !== "") perComponent[id] = v;
          });
          return computeWeightedAverage(perComponent);
        }).filter((v) => v !== null);
        const average = perSubjectAverages.length
          ? Math.round((perSubjectAverages.reduce((a, b) => a + b, 0) / perSubjectAverages.length) * 10) / 10
          : null;
        return { ...s, average };
      });

      const withMarks = withAverage.filter((s) => s.average !== null);
      const passing = withMarks.filter((s) => s.average >= promotionThreshold).sort((a, b) => b.average - a.average);
      const repeating = withMarks.filter((s) => s.average < promotionThreshold);
      const noMarks = withAverage.filter((s) => s.average === null);

      // The top of kindergarten moves up into the first primary year when the
      // school has one; the top of any other section is the final year.
      const section = sections.find((x) => x.id === sectionId) || sections[0];
      const lastYear = ladderFor(section.id, section.curriculum).length;
      const intoPrimary = sectionId === "kindergarten" && year >= lastYear && sections.some((x) => x.id === "primary");
      const isFinalLevel = year >= lastYear && !intoPrimary;
      const targetClasses = isFinalLevel
        ? []
        : intoPrimary ? inYear("primary", 1) : inYear(sectionId, year + 1);
      const targetConfigured = isFinalLevel || targetClasses.length > 0;

      // Rank-based tiering: split passing students (already sorted by average
      // descending) into as-equal-as-possible chunks, one per target class —
      // highest scorers into the alphabetically-first stream ("A").
      const assignments = [];
      if (!isFinalLevel && targetClasses.length > 0 && passing.length > 0) {
        const n = targetClasses.length;
        const base = Math.floor(passing.length / n);
        const extra = passing.length % n;
        let idx = 0;
        targetClasses.forEach((cls, i) => {
          const count = base + (i < extra ? 1 : 0);
          assignments.push({ targetClass: cls, students: passing.slice(idx, idx + count) });
          idx += count;
        });
      }

      return { level, levelLabel, levelClasses, passing, repeating, noMarks, isFinalLevel, targetClasses, targetConfigured, assignments };
    });
  }, [classes, allStudents, byAssessmentMap, promotionThreshold, sections]);

  const saveThreshold = async () => {
    const n = Number(thresholdDraft);
    if (!Number.isFinite(n) || n < 0 || n > 100) {
      setPromoteMsg({ type: "error", text: "Threshold must be a number between 0 and 100." });
      return;
    }
    setSavingThreshold(true);
    setPromoteMsg(null);
    try {
      await setDoc(doc(db, "school_settings", schoolCode), {
        schoolCode, promotionThreshold: n,
        updatedAt: serverTimestamp(), updatedBy: auth.currentUser?.uid || null,
      }, { merge: true });
      setSchoolSettings((prev) => ({ ...(prev || {}), schoolCode, promotionThreshold: n }));
      setThresholdDraft(null);
      setPromoteMsg({ type: "success", text: "Pass threshold updated." });
    } catch (err) {
      console.error("Save threshold error:", err);
      setPromoteMsg({ type: "error", text: "Could not save the threshold. Please try again." });
    } finally {
      setSavingThreshold(false);
    }
  };

  const promoteGroup = async (group) => {
    const totalPromoting = group.isFinalLevel
      ? group.passing.length
      : group.assignments.reduce((n, a) => n + a.students.length, 0);
    if (totalPromoting === 0) {
      setPromoteMsg({ type: "error", text: "No passing students to promote in this group." });
      return;
    }
    const confirmText = group.isFinalLevel
      ? `Mark ${totalPromoting} student(s) from ${group.levelLabel} as graduated? Their class assignment is left as-is; only their status changes.`
      : `Promote ${totalPromoting} student(s) from ${group.levelLabel} to the next level? Their class updates immediately — students below the ${promotionThreshold}% threshold stay in ${group.levelLabel}.`;
    if (!window.confirm(confirmText)) return;

    setPromotingLevel(group.level);
    setPromoteMsg(null);
    try {
      const allOps = [];
      if (group.isFinalLevel) {
        group.passing.forEach((s) => allOps.push({
          id: s.id,
          data: {
            status: "graduated",
            graduatedAt: serverTimestamp(),
            graduatedFromClassId: s.classId,
            graduatedTerm: selectedTerm,
            graduatedAverage: s.average,
          },
        }));
      } else {
        group.assignments.forEach(({ targetClass, students }) => {
          students.forEach((s) => allOps.push({
            id: s.id,
            data: {
              classId: targetClass.id,
              lastPromotedAt: serverTimestamp(),
              lastPromotedFromClassId: s.classId,
              lastPromotedTerm: selectedTerm,
              lastPromotedAverage: s.average,
            },
          }));
        });
      }

      for (let i = 0; i < allOps.length; i += 400) {
        const batch = writeBatch(db);
        allOps.slice(i, i + 400).forEach(({ id, data }) => batch.update(doc(db, "students", id), data));
        await batch.commit();
      }

      setPromoteMsg({
        type: "success",
        text: `${totalPromoting} student(s) ${group.isFinalLevel ? "marked as graduated" : "promoted"} from ${group.levelLabel}.`,
      });
      fetchData();
    } catch (err) {
      console.error("Promotion error:", err);
      setPromoteMsg({
        type: "error",
        text: err.code === "permission-denied" ? "Permission denied. Check your Firestore rules." : "Failed to promote students. Please try again.",
      });
    } finally {
      setPromotingLevel(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 style={{ fontFamily: "'Playfair Display', serif" }}>Reports &amp; Analytics</h2>
          <p className="text-muted">{selectedTerm} · {mixedScales ? "each section's own grading" : `${viewScale.name || "School"} grading`} · Continuous Assessment</p>
          {/* A past term's report looks exactly like the current one once
              rendered. Issuing last term's cards by mistake is not a recoverable
              error — guardians have already been told — so the state is named. */}
          {isPastTerm(selectedTerm, schoolTerm) && (
            <p style={{ fontSize: 11, color: "var(--warning, #f0b90b)", marginTop: 4 }}>
              Viewing {selectedTerm}, which has ended. The school is recording against{" "}
              {schoolTerm}.{" "}
              <button
                type="button"
                onClick={() => setSelectedTerm(schoolTerm)}
                style={{ background: "none", border: "none", padding: 0, cursor: "pointer", color: "inherit", textDecoration: "underline", fontSize: 11 }}
              >
                Back to current
              </button>
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <button onClick={fetchData} disabled={isLoading} className="icon-btn" title="Refresh">
            <RefreshCw size={16} className={isLoading ? "spin" : ""} />
          </button>
          <button onClick={() => window.print()} className="btn-refresh">
            <Printer size={14} /> Print Report
          </button>
        </div>
      </div>

      {error && <div className="error-message"><AlertCircle size={16} /> {error}</div>}

      {/* Summary cards */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-card__value">{isLoading ? <Spinner size={20} /> : schoolAvg !== null ? `${schoolAvg}%` : "—"}</div>
          <div className="stat-card__label">School Average</div>
          {avgDelta !== null && (
            <div className={`text-[10px] font-medium mt-1 ${avgDelta > 0 ? "text-success" : avgDelta < 0 ? "text-danger" : "text-muted"}`}>
              {avgDelta > 0 ? "+" : ""}{avgDelta}% vs {compareTerm}
            </div>
          )}
        </div>
        <div className="stat-card">
          <div className="stat-card__value stat-card__value--success">{isLoading ? <Spinner size={20} /> : distinctions}</div>
          <div className="stat-card__label">Top grades</div>
          <div className="text-muted text-[10px] mt-1">{mixedScales ? "Each section's top grades" : GRADES.filter(g => g.tone === "success").map(g => g.code).join(" or ")}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card__value stat-card__value--accent">{isLoading ? <Spinner size={20} /> : passRate !== null ? `${passRate}%` : "—"}</div>
          <div className="stat-card__label">School Pass Rate</div>
          <div className="text-muted text-[10px] mt-1">{mixedScales ? "A passing grade on their scale" : `Scoring ≥${Math.min(...GRADES.filter(g => g.pass !== false).map(g => g.min))}%`}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card__value stat-card__value--warning">{isLoading ? <Spinner size={20} /> : failing}</div>
          <div className="stat-card__label">Failing Students</div>
          <div className="text-muted text-[10px] mt-1">{mixedScales ? "Below a pass on their scale" : GRADES.filter(g => g.pass === false).map(g => `${g.code} (<${g.max + 1}%)`).join(", ")}</div>
        </div>
      </div>

      {/* Tab nav */}
      <div className="tab-bar">
        {[
          { id: "reportCards", icon: FileText,   label: "Report Cards" },
          { id: "performance", icon: TrendingUp,  label: "Performance Trends" },
          { id: "analytics",   icon: BarChart2,   label: "Analytics" },
          { id: "atRisk",      icon: AlertTriangle, label: "At-Risk Students" },
          { id: "promotion",   icon: GraduationCap, label: "Promotion" },
        ].map(({ id, icon: Icon, label }) => (
          <button
            key={id}
            onClick={() => setReportType(id)}
            className={`tab ${reportType === id ? "tab--active" : ""}`}
          >
            <Icon size={15} /> {label}
          </button>
        ))}
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
        {reportType === "performance" && (
          <div>
            <label className="field__label">COMPARE TO</label>
            <div className="relative">
              <select value={compareTerm} onChange={e => setCompareTerm(e.target.value)} className="field__select">
                {TERMS.filter(t => t !== selectedTerm).map(t => <option key={t} value={t}>{t}</option>)}
              </select>
              <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-app-text/40 pointer-events-none" />
            </div>
          </div>
        )}
        <div className="search-wrapper">
          <Search className="search-icon" size={14} />
          <input
            type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search student, class…"
            className="search-input"
          />
        </div>
      </div>

      {isLoading && (
        <div className="empty-state">
          <Spinner size={28} />
          <p className="empty-state__sub">Loading report data…</p>
        </div>
      )}

      {!isLoading && noData && (
        <div className="empty-state">
          <FileText size={32} className="text-muted" />
          <p className="empty-state__sub">No marks submitted for {selectedTerm} yet.</p>
          <p className="text-muted" style={{ fontSize: "0.7rem" }}>Teachers submit CA marks from their Performance module.</p>
        </div>
      )}

      {!isLoading && !noData && (
        <>
          {/* REPORT CARDS TAB */}
          {reportType === "reportCards" && (
            <div className="card">
              <div className="cc__head">
                <div className="cc__head-left">
                  <FileText size={18} />
                  <h3>Report Cards — {selectedClassId === "all" ? "All Classes" : classes.find(c => c.id === selectedClassId)?.name}</h3>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-muted" style={{ fontSize: "0.7rem" }}>{sorted.length} student{sorted.length !== 1 ? "s" : ""}</span>
                  <button
                    type="button"
                    className="btn btn--accent btn--sm"
                    onClick={releaseReportCards}
                    disabled={releasing || !selectedTerm}
                    title="Publish the combined term result to the ACALink parent app"
                  >
                    {releasing ? <Loader2 size={13} className="spin" /> : <Send size={13} />}
                    Issue to parents
                  </button>
                </div>
              </div>
              {releaseNote && (
                <div className={`alert alert--${releaseNote.type === "ok" ? "success" : "error"}`}
                     style={{ margin: "0 16px 12px" }}>
                  {releaseNote.text}
                </div>
              )}
              <div className="data-table-wrap">
                <table className="data-table data-table--stack">
                  <thead>
                    <tr>
                      <th>ADM. NO.</th>
                      <th onClick={() => toggleSort("name")} style={{ cursor: "pointer" }}>STUDENT <SortIcon col="name" /></th>
                      <th>CLASS</th>
                      <th onClick={() => toggleSort("average")} style={{ cursor: "pointer", textAlign: "center" }}>AVERAGE <SortIcon col="average" /></th>
                      <th>GRADE</th>
                      <th onClick={() => toggleSort("rank")} style={{ cursor: "pointer", textAlign: "center" }}>POSITION <SortIcon col="rank" /></th>
                      <th>TREND</th>
                      <th>TEACHER</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {sorted.map(student => {
                      const g = getGradeInfo(student.average, student.scale);
                      return (
                        <tr key={student.id} onClick={() => setViewingStudent(student)} style={{ cursor: "pointer" }}>
                          <td data-label="ADM. NO." className="text-muted font-mono text-[10px]">{student.studentCode || student.id.slice(0, 8)}</td>
                          <td data-label="STUDENT"><span className="font-semibold">{fullName(student)}</span></td>
                          <td data-label="CLASS">{student.className}</td>
                          <td data-label="AVERAGE" className="text-center">
                            {student.average !== null ? (
                              <span className={`font-bold text-base ${g?.color}`}>{student.average}%</span>
                            ) : <span className="text-muted">—</span>}
                          </td>
                          <td data-label="GRADE" className="text-center">
                            {g ? (
                              <span className={`tag ${g.bg} ${g.color} ${g.border}`}>{g.code} · {g.remark}</span>
                            ) : <span className="text-muted">—</span>}
                          </td>
                          <td data-label="POSITION" className="text-center">
                            {student.rank ? (
                              <span className={`inline-flex items-center justify-center w-7 h-7 rounded-xl text-xs font-bold
                                ${student.rank === 1 ? "bg-warning text-app-text" :
                                  student.rank === 2 ? "bg-gray-200 text-gray-700" :
                                  student.rank === 3 ? "bg-amber-100 text-amber-700" :
                                  "bg-app-bg text-muted"}`}>
                                {student.rank}
                              </span>
                            ) : <span className="text-muted">—</span>}
                          </td>
                          <td data-label="TREND" className="text-center">
                            {student.delta !== null ? (
                              <span className={`flex items-center justify-center gap-0.5 text-xs font-semibold
                                ${student.delta > 0 ? "text-success" : student.delta < 0 ? "text-danger" : "text-muted"}`}>
                                {student.delta > 0 ? <ArrowUp size={11} /> : student.delta < 0 ? <ArrowDown size={11} /> : <Minus size={11} />}
                                {Math.abs(student.delta)}%
                              </span>
                            ) : <span className="text-muted">—</span>}
                          </td>
                          <td data-label="TEACHER" className="text-muted text-[10px] truncate max-w-[100px]">{student.teacherName}</td>
                          <td data-label="ACTION" className="text-center">
                            <button onClick={e => { e.stopPropagation(); setViewingStudent(student); }} className="tag tag--blue">View</button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="cc__head border-t">
                <p className="text-muted text-[10px]">{studentsWithMarks.length} students with marks{isManebScale(viewScale) && !mixedScales ? " · CA contributes 40% to final MSCE grade" : ""}</p>
                <button onClick={() => window.print()} className="btn-refresh"><Printer size={12} /> Print All</button>
              </div>
            </div>
          )}

          {/* PERFORMANCE TRENDS TAB */}
          {reportType === "performance" && (
            <div className="space-y-5">
              {/* School-level comparison */}
              <div className="card p-6">
                <h3 className="font-semibold text-app-text text-sm mb-4">School Average — {selectedTerm} vs {compareTerm}</h3>
                <div className="space-y-3">
                  {[
                    { label: selectedTerm, value: schoolAvg, students: studentsWithMarks.length },
                    { label: compareTerm,  value: prevSchoolAvg, students: prevStudentsWithMarks.length },
                  ].map(({ label, value, students }) => {
                    const g = getGradeInfo(value);
                    return (
                      <div key={label} className="flex items-center gap-4">
                        <span className="text-xs font-semibold text-muted w-28 shrink-0">{label}</span>
                        <MiniBar value={value ?? 0} color={scoreColor(value ?? 0)} />
                        <div className="flex items-center gap-2 shrink-0">
                          {value !== null ? (
                            <>
                              <span className={`text-base font-bold ${g?.color || "text-app-text"}`}>{value}%</span>
                              {g && <span className={`text-[9px] font-semibold ${g.color}`}>{g.code}</span>}
                            </>
                          ) : <span className="text-xs text-muted">No data</span>}
                          <span className="text-[10px] text-muted">({students} students)</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
                {avgDelta !== null && (
                  <div className={`mt-4 inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-xl
                    ${avgDelta > 0 ? "bg-success/10 text-success border border-success/20" :
                      avgDelta < 0 ? "bg-danger/10 text-danger border border-danger/20" :
                      "bg-app-bg text-muted border border-app-border"}`}>
                    {avgDelta > 0 ? <ArrowUp size={12} /> : avgDelta < 0 ? <ArrowDown size={12} /> : <Minus size={12} />}
                    {avgDelta > 0 ? "+" : ""}{avgDelta}% change from {compareTerm}
                  </div>
                )}
              </div>

              {/* Per-class comparison */}
              {selectedClassId === "all" && (
                <div className="card p-6">
                  <h3 className="font-semibold text-app-text text-sm mb-4">Class-by-Class Comparison</h3>
                  <div className="space-y-4">
                    {classes.map(cls => {
                      const currStudents = studentsWithMarks.filter(s => s.classId === cls.id);
                      const prevStudents = prevStudentsWithMarks.filter(s => s.classId === cls.id);
                      const currAvg = avg(currStudents.map(s => s.average));
                      const prevAvg = avg(prevStudents.map(s => s.average));
                      const delta   = currAvg !== null && prevAvg !== null ? Math.round((currAvg - prevAvg) * 10) / 10 : null;
                      const gc = getGradeInfo(currAvg, scaleOf(cls.id));
                      const gp = getGradeInfo(prevAvg, scaleOf(cls.id));
                      return (
                        <div key={cls.id} className="border border-app-border rounded-2xl p-4">
                          <div className="flex items-center justify-between mb-3">
                            <p className="font-semibold text-app-text">{cls.name}</p>
                            {delta !== null && (
                              <span className={`flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-lg
                                ${delta > 0 ? "bg-success/10 text-success" : delta < 0 ? "bg-danger/10 text-danger" : "bg-app-bg text-muted"}`}>
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
                              <span className="text-[10px] text-muted w-24 shrink-0">{label}</span>
                              <MiniBar value={value ?? 0} color={scoreColor(value ?? 0)} />
                              <div className="flex items-center gap-1 shrink-0">
                                {value !== null ? (
                                  <>
                                    <span className={`text-sm font-bold ${g?.color || "text-app-text"}`}>{value}%</span>
                                    <span className="text-[10px] text-muted">({count})</span>
                                  </>
                                ) : <span className="text-[10px] text-muted">No data</span>}
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
              <div className="card">
                <div className="cc__head">
                  <div className="cc__head-left">
                    <TrendingUp size={18} />
                    <h3>Student Progress — {selectedTerm} vs {compareTerm}</h3>
                  </div>
                </div>
                <div className="data-table-wrap">
                  <table className="data-table data-table--stack">
                    <thead>
                      <tr>
                        <th>STUDENT</th>
                        <th>CLASS</th>
                        <th>{compareTerm}</th>
                        <th>{selectedTerm}</th>
                        <th>CHANGE</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sorted.filter(s => s.average !== null || s.prevAverage !== null).map(s => {
                        const gc = getGradeInfo(s.average, s.scale);
                        const gp = getGradeInfo(s.prevAverage, s.scale);
                        return (
                          <tr key={s.id}>
                            <td data-label="STUDENT">
                              <span className="font-semibold">{fullName(s)}</span>
                              <div className="text-muted text-[10px]">{s.studentCode || ""}</div>
                            </td>
                            <td data-label="CLASS">{s.className}</td>
                            <td data-label={compareTerm} className="text-center">
                              {s.prevAverage !== null ? (
                                <span className={`font-semibold text-sm ${gp?.color}`}>{s.prevAverage}%</span>
                              ) : <span className="text-muted">—</span>}
                            </td>
                            <td data-label={selectedTerm} className="text-center">
                              {s.average !== null ? (
                                <span className={`font-bold text-sm ${gc?.color}`}>{s.average}%</span>
                              ) : <span className="text-muted">—</span>}
                            </td>
                            <td data-label="CHANGE" className="text-center">
                              {s.delta !== null ? (
                                <span className={`inline-flex items-center gap-0.5 text-xs font-bold px-2.5 py-1 rounded-lg
                                  ${s.delta > 0 ? "bg-success/10 text-success" : s.delta < 0 ? "bg-danger/10 text-danger" : "bg-app-bg text-muted"}`}>
                                  {s.delta > 0 ? <ArrowUp size={10} /> : s.delta < 0 ? <ArrowDown size={10} /> : <Minus size={10} />}
                                  {s.delta > 0 ? "+" : ""}{s.delta}%
                                </span>
                              ) : <span className="text-muted">—</span>}
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

          {/* ANALYTICS TAB */}
          {reportType === "analytics" && (
            <div className="space-y-5">
              {/* Grade distribution */}
              <div className="card p-6">
                <h3 className="font-semibold text-app-text text-sm mb-4">
                  Grade Distribution — {selectedClassId === "all" ? "All Classes" : classes.find(c => c.id === selectedClassId)?.name}
                </h3>
                <div className="space-y-2.5">
                  {GRADES.map(g => {
                    const count = studentsWithMarks.filter(s => s.scale === viewScale && getGradeInfo(s.average, s.scale)?.grade === g.grade).length;
                    const pct   = studentsWithMarks.length ? Math.round((count / studentsWithMarks.length) * 100) : 0;
                    return (
                      <div key={g.grade} className="flex items-center gap-3">
                        <span className={`text-[10px] font-bold w-24 shrink-0 ${g.color}`}>{g.code} {g.remark}</span>
                        <MiniBar value={pct} color={g.grade <= 2 ? "#10b981" : g.grade <= 6 ? "#3b82f6" : g.grade <= 8 ? "#f59e0b" : "#ef4444"} />
                        <span className="text-[11px] font-semibold text-muted w-16 text-right">
                          {count} <span className="text-muted">({pct}%)</span>
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Class averages */}
              {selectedClassId === "all" && (
                <div className="card p-6">
                  <h3 className="font-semibold text-app-text text-sm mb-4">Class Averages</h3>
                  <div className="space-y-3">
                    {classes.map(cls => {
                      const clsStudents = studentsWithMarks.filter(s => s.classId === cls.id);
                      const clsAvg = avg(clsStudents.map(s => s.average));
                      const g = getGradeInfo(clsAvg, scaleOf(cls.id));
                      return (
                        <div key={cls.id} className="flex items-center gap-3">
                          <span className="text-xs font-semibold text-muted w-24 shrink-0">{cls.name}</span>
                          <MiniBar value={clsAvg ?? 0} color={scoreColor(clsAvg ?? 0)} />
                          {clsAvg !== null ? (
                            <div className="flex items-center gap-1.5 shrink-0">
                              <span className={`text-sm font-bold ${g?.color || "text-app-text"}`}>{clsAvg}%</span>
                              {g && <span className={`text-[9px] font-semibold ${g.color}`}>{g.code}</span>}
                              <span className="text-[10px] text-muted">({clsStudents.length})</span>
                            </div>
                          ) : <span className="text-xs text-muted shrink-0">No data</span>}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Subject averages */}
              {allSubjects.length > 0 && (
                <div className="card p-6">
                  <h3 className="font-semibold text-app-text text-sm mb-4">Subject Averages</h3>
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
                          <span className="text-xs font-medium text-muted w-32 shrink-0 truncate">{subj}</span>
                          <MiniBar value={subjAvg ?? 0} color={scoreColor(subjAvg ?? 0)} />
                          {subjAvg !== null ? (
                            <div className="flex items-center gap-2 shrink-0">
                              <span className={`text-sm font-bold ${g?.color || "text-app-text"}`}>{subjAvg}%</span>
                              {g && <span className={`text-[9px] font-semibold ${g.color}`}>{g.code}</span>}
                              <span className="text-[10px] text-muted">({scores.length})</span>
                            </div>
                          ) : <span className="text-xs text-muted shrink-0">No data</span>}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Mark submission status */}
              <div className="card p-6">
                <h3 className="font-semibold text-app-text text-sm mb-4">Mark Submission Status</h3>
                <div className="space-y-2.5">
                  {classes.map(cls => {
                    const classData = allMarksMap[cls.id];
                    const submitted = !!classData;
                    const teachers  = (classData?.teacherIds || []).map(uid => teacherNames[uid]).filter(Boolean);
                    const count     = Object.keys(classData?.marks || {}).length;
                    return (
                      <div key={cls.id} className={`flex items-center gap-3 p-3 rounded-xl border
                        ${submitted ? "border-success/30 bg-success/5" : "border-app-border bg-app-bg"}`}>
                        {submitted
                          ? <CheckCircle size={14} className="text-success shrink-0" />
                          : <AlertCircle size={14} className="text-muted shrink-0" />}
                        <div className="flex-1">
                          <p className="text-sm font-semibold text-app-text">{cls.name}</p>
                          {submitted && (
                            <p className="text-[10px] text-muted">
                              {count} students · {teachers.join(", ") || "Unknown teacher"}
                            </p>
                          )}
                        </div>
                        <span className={`text-[10px] font-bold px-2.5 py-1 rounded-lg
                          ${submitted ? "bg-success/10 text-success" : "bg-app-bg text-muted"}`}>
                          {submitted ? "Submitted" : "Pending"}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* AT-RISK STUDENTS TAB */}
          {reportType === "atRisk" && (
            <div className="space-y-5">
              {studentsWithMarks.filter(isFailing).length > 0 && (
                <div className="bg-danger/10 border border-danger/30 rounded-2xl p-5">
                  <div className="flex items-center gap-2 mb-3">
                    <AlertTriangle size={16} className="text-danger" />
                    <h3 className="font-semibold text-danger text-sm">
                      Failing Students — below a passing grade ({studentsWithMarks.filter(isFailing).length})
                    </h3>
                  </div>
                  <div className="space-y-2">
                    {studentsWithMarks.filter(isFailing).sort((a, b) => a.average - b.average).map(s => {
                      const g = getGradeInfo(s.average, s.scale);
                      const weak = s.subjects.filter(subj => getGradeInfo(s.subjectMarks[subj], s.scale)?.pass === false);
                      return (
                        <div key={s.id} className="flex items-center justify-between bg-card-bg border border-danger/20 rounded-xl px-4 py-3 cursor-pointer hover:bg-danger/5 transition-colors"
                          onClick={() => setViewingStudent(s)}>
                          <div>
                            <p className="font-semibold text-app-text">{fullName(s)}</p>
                            <p className="text-[10px] text-muted">{s.className}</p>
                            {weak.length > 0 && <p className="text-[10px] text-danger mt-0.5">Failing: {weak.join(", ")}</p>}
                          </div>
                          <div className="text-right shrink-0">
                            <p className={`font-bold text-lg ${g?.color}`}>{s.average}%</p>
                            {s.delta !== null && (
                              <p className={`text-[10px] font-semibold ${s.delta > 0 ? "text-success" : "text-danger"}`}>
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

              {studentsWithMarks.filter(needsSupport).length > 0 && (
                <div className="bg-warning/10 border border-warning/30 rounded-2xl p-5">
                  <div className="flex items-center gap-2 mb-3">
                    <AlertTriangle size={16} className="text-warning" />
                    <h3 className="font-semibold text-warning-dark text-sm">
                      Needs Support — lowest passing grades ({studentsWithMarks.filter(needsSupport).length})
                    </h3>
                  </div>
                  <div className="space-y-2">
                    {studentsWithMarks.filter(needsSupport).sort((a, b) => a.average - b.average).map(s => {
                      const g = getGradeInfo(s.average, s.scale);
                      const weak = s.subjects.filter(subj => {
                        const sg = getGradeInfo(s.subjectMarks[subj], s.scale);
                        return Boolean(sg) && (sg.pass === false || sg.tone === "warning");
                      });
                      return (
                        <div key={s.id} className="flex items-center justify-between bg-card-bg border border-warning/20 rounded-xl px-4 py-3 cursor-pointer hover:bg-warning/5 transition-colors"
                          onClick={() => setViewingStudent(s)}>
                          <div>
                            <p className="font-semibold text-app-text">{fullName(s)}</p>
                            <p className="text-[10px] text-muted">{s.className}</p>
                            {weak.length > 0 && <p className="text-[10px] text-warning mt-0.5">Struggling: {weak.join(", ")}</p>}
                          </div>
                          <div className="text-right shrink-0">
                            <p className={`font-bold text-lg ${g?.color}`}>{s.average}%</p>
                            {s.delta !== null && (
                              <p className={`text-[10px] font-semibold ${s.delta > 0 ? "text-success" : "text-danger"}`}>
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

              {studentsWithMarks.filter((s) => isFailing(s) || needsSupport(s)).length === 0 && (
                <div className="bg-success/10 border border-success/30 rounded-2xl py-16 flex flex-col items-center gap-3 text-center">
                  <CheckCircle size={32} className="text-success" />
                  <p className="text-sm font-semibold text-success-dark">No students currently below 50%!</p>
                  <p className="text-xs text-success/70">All students with marks are passing at Credit level or above.</p>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* PROMOTION TAB — independent of the noData gate above, since it looks
          at every configured form/standard, not just the class currently
          selected in the filter row. */}
      {!isLoading && reportType === "promotion" && (
        <div className="space-y-5">
          <div className="card p-5">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <h3 className="font-semibold text-app-text text-sm">Pass threshold</h3>
                <p className="text-xs text-muted mt-0.5">
                  Students with an overall average for {selectedTerm} at or above this mark are eligible to promote.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="number" min={0} max={100}
                  value={thresholdDraft ?? promotionThreshold}
                  onChange={(e) => setThresholdDraft(e.target.value)}
                  className="field__select"
                  style={{ width: 90, textAlign: "center" }}
                />
                <span className="text-sm text-muted">%</span>
                <button onClick={saveThreshold} disabled={savingThreshold || thresholdDraft === null} className="btn-refresh">
                  {savingThreshold ? <Loader2 size={13} className="spin" /> : <Save size={13} />} Save
                </button>
              </div>
            </div>
          </div>

          {promoteMsg && (
            <div className={`alert ${promoteMsg.type === "error" ? "alert--error" : "alert--success"}`}>
              {promoteMsg.type === "error" ? <AlertCircle size={16} /> : <CheckCircle size={16} />} {promoteMsg.text}
            </div>
          )}

          {promotionGroups.length === 0 ? (
            <div className="empty-state">
              <GraduationCap size={32} className="text-muted" />
              <p className="empty-state__title">No forms/standards configured for promotion yet</p>
              <p className="empty-state__sub">
                Use "Set up classes" on Classes &amp; Streams so this school's forms have a level assigned, then come back here.
              </p>
            </div>
          ) : (
            promotionGroups.map((group) => (
              <div key={group.level} className="card p-5">
                <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-primary-pale flex items-center justify-center flex-shrink-0">
                      <GraduationCap size={18} className="text-primary" />
                    </div>
                    <div>
                      <p className="font-semibold text-app-text text-sm">
                        {group.levelLabel} {group.isFinalLevel ? "— Final year" : `→ next level`}
                      </p>
                      <p className="text-xs text-muted">
                        {group.passing.length} passing · {group.repeating.length} repeating
                        {group.noMarks.length > 0 && ` · ${group.noMarks.length} no marks yet`}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => promoteGroup(group)}
                    disabled={promotingLevel === group.level || group.passing.length === 0 || !group.targetConfigured}
                    className="btn btn--accent btn--md"
                  >
                    {promotingLevel === group.level ? <Loader2 size={14} className="spin" /> : <ArrowRight size={14} />}
                    {group.isFinalLevel ? "Mark as graduated" : "Promote passing students"}
                  </button>
                </div>

                {!group.targetConfigured && (
                  <div className="alert alert--warning mb-3">
                    <AlertTriangle size={15} />
                    The next level isn't set up yet — add it from "Set up classes" on Classes &amp; Streams before promoting {group.levelLabel}.
                  </div>
                )}

                {!group.isFinalLevel && group.targetClasses.length > 0 && group.passing.length > 0 && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                    {group.assignments.map(({ targetClass, students }) => (
                      <div key={targetClass.id} className="border border-app-border rounded-xl p-3">
                        <p className="text-xs font-semibold text-app-text">{targetClass.name}</p>
                        <p className="text-[11px] text-muted mt-0.5">{students.length} student{students.length !== 1 ? "s" : ""}</p>
                        {students.length > 0 && (
                          <p className="text-[10px] text-muted mt-1">
                            Range: {students[students.length - 1].average}%–{students[0].average}%
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {group.repeating.length > 0 && (
                  <details className="mt-3">
                    <summary className="text-[11px] text-muted cursor-pointer select-none">
                      {group.repeating.length} student{group.repeating.length !== 1 ? "s" : ""} repeating {group.levelLabel} (below {promotionThreshold}%)
                    </summary>
                    <div className="mt-2 space-y-1">
                      {group.repeating.sort((a, b) => a.average - b.average).map((s) => (
                        <div key={s.id} className="flex items-center justify-between text-xs py-1 border-b border-app-border last:border-0">
                          <span>{fullName(s)}</span>
                          <span className="text-danger font-semibold">{s.average}%</span>
                        </div>
                      ))}
                    </div>
                  </details>
                )}
              </div>
            ))
          )}
        </div>
      )}

      <p className="text-center text-xs text-muted pt-1">
        Showing CA marks submitted by teachers. Select a class or term to filter.
        Marks are read‑only here — teachers manage entry from their Performance module.
      </p>

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