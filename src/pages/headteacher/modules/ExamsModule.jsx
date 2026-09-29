// src/pages/headteacher/modules/ExamsModule.jsx
// ─────────────────────────────────────────────────────────────────────────────
// Running an examination from one screen: the paper timetable, the rooms and
// seating, who invigilates, and telling everyone — then, afterwards, how each
// subject did.
//
// The work a school does by hand here is tedious and error-prone in a specific
// way: a candidate seated beside a classmate, a teacher invigilating their own
// paper, two papers for one class at the same hour. The seating and roster are
// generated (see services/examsCore.js, which is tested), and every problem the
// generator or the timetable can detect is shown, not swallowed.
// ─────────────────────────────────────────────────────────────────────────────
import { useState, useEffect, useMemo, useCallback } from "react";
import { db } from "../../../firebase";
import { collection, query, where, getDocs } from "firebase/firestore";
import { GraduationCap, Plus, Trash2, Printer, Download, Send, Wand2, ArrowLeft, RefreshCw, AlertTriangle, Check } from "lucide-react";
import {
  fetchExams, createExam, updateExam, deleteExam, EXAM_TYPES, newId, fmtDate, sortPapers,
  paperProblems, generateSeating, roomLists, generateDuty, dutyConflict, dutyLines,
  analyseSubjects, analyseClasses,
} from "../../../services/exams";
import { fetchMarkSheets, buildReadiness, formNumber, bandMeta, RISK_BANDS } from "../../../services/examReadiness";
import { sectionsOf, isManebScale } from "../../../services/curriculumCore";
import { scaleRows } from "../../../components/ui/grades";
import { fetchSchoolLeave } from "../../../services/leave";
import { subscribeSchoolSettings, pastTermOptions } from "../../../services/academicTerm";
import { downloadCsv } from "../../../services/csv";
import useLoader from "../../../hooks/useLoader";
import { notifyExamTimetable, notifyExamDuty } from "../../../services/notificationHooks";
import PrintSheet from "../../../components/ui/PrintSheet";
import {
  Modal, Btn, IconBtn, Input, Select, Pill, EmptyState, StatGrid, StatCard,
  ModuleHeader, Notice, LoadingState, TableWrap, FilterBar,
} from "../../../components/ui/ModuleKit";
import "./staff-management.css";
import { isDeactivated } from "../../../services/staffAccountCore";

const STATUS_TONE = { draft: "warning", published: "success" };

export default function ExamsModule({ schoolCode, currentUser }) {
  const [view, setView] = useState("exams");
  const [exams, setExams] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [students, setStudents] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [classes, setClasses] = useState([]);
  const [leaves, setLeaves] = useState([]);
  const [currentTerm, setCurrentTerm] = useState("");
  const [settings, setSettings] = useState(null);
  const [notice, setNotice] = useState(null);
  const [showNew, setShowNew] = useState(false);

  const load = useCallback(async () => {
    if (!schoolCode) return;
    try {
      const [ex, sSnap, uSnap, cSnap, lv] = await Promise.all([
        fetchExams(schoolCode),
        getDocs(query(collection(db, "students"), where("schoolCode", "==", schoolCode))),
        getDocs(query(collection(db, "users"), where("schoolCode", "==", schoolCode), where("role", "in", ["head_teacher", "class_teacher"]))),
        getDocs(query(collection(db, "school_classes"), where("schoolCode", "==", schoolCode))),
        fetchSchoolLeave(schoolCode).catch(() => []),
      ]);
      setExams(ex);
      setStudents(sSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setTeachers(uSnap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((t) => !isDeactivated(t)));
      setClasses(cSnap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (a.order ?? 0) - (b.order ?? 0)));
      setLeaves(lv);
    } catch (err) {
      console.error("[exams] load failed:", err);
      setNotice({ tone: "danger", text: `Could not load exams: ${err.message}` });
      setExams([]);
    }
  }, [schoolCode]);

  useLoader(load);
  useEffect(() => (schoolCode ? subscribeSchoolSettings(schoolCode, (s) => { setCurrentTerm(s?.currentTerm || ""); setSettings(s); }) : undefined), [schoolCode]);

  const selected = exams?.find((e) => e.id === selectedId) || null;

  // Save a change to one exam and keep the list in step without a reload.
  const patchExam = async (id, patch) => {
    await updateExam(id, patch);
    setExams((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  };

  if (exams === null) return <LoadingState label="Loading exams…" />;

  return (
    <div>
      {selected ? (
        <ExamDetail
          exam={selected}
          students={students}
          teachers={teachers}
          classes={classes}
          leaves={leaves}
          schoolCode={schoolCode}
          currentUser={currentUser}
          patch={(p) => patchExam(selected.id, p)}
          onBack={() => setSelectedId(null)}
          onDeleted={() => { setSelectedId(null); load(); }}
          say={(tone, text) => setNotice({ tone, text })}
        />
      ) : (
        <>
          <ModuleHeader
            title="Exams"
            subtitle="Timetable, seating, invigilation, and how each subject did"
            actions={
              <>
                <Btn variant="secondary" icon={<RefreshCw size={15} />} onClick={load}>Refresh</Btn>
                <Btn variant="accent" icon={<Plus size={15} />} onClick={() => setShowNew(true)}>New exam</Btn>
              </>
            }
          />
          {notice && <Notice tone={notice.tone} onDismiss={() => setNotice(null)}>{notice.text}</Notice>}

          <div className="mb-4">
            <FilterBar value={view} onChange={setView} options={[{ id: "exams", label: "Exams", count: exams.length }, { id: "analysis", label: "Results analysis" }]} />
          </div>

          {view === "exams" && (
            exams.length === 0 ? (
              <EmptyState icon={<GraduationCap size={28} />} title="No exams yet" sub="Create an exam to build its timetable, seating and invigilation."
                action={<Btn variant="accent" icon={<Plus size={15} />} onClick={() => setShowNew(true)}>New exam</Btn>} />
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 16 }}>
                {exams.map((e) => (
                  <button key={e.id} type="button" className="card" onClick={() => setSelectedId(e.id)}
                    style={{ padding: 20, textAlign: "left", cursor: "pointer", border: "1px solid var(--border-color)", background: "var(--card-bg)", color: "inherit", display: "flex", flexDirection: "column", gap: 8 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                      <strong style={{ fontFamily: "var(--font-display)", fontSize: "1.1rem", fontWeight: 400 }}>{e.name}</strong>
                      <Pill tone={STATUS_TONE[e.status]}>{e.status === "published" ? "Published" : "Draft"}</Pill>
                    </div>
                    <span className="text-muted" style={{ fontSize: 12.5 }}>{e.type}{e.term ? ` · ${e.term}` : ""}</span>
                    <span style={{ fontSize: 13 }}>{fmtDate(e.startDate)}{e.endDate && e.endDate !== e.startDate ? ` to ${fmtDate(e.endDate)}` : ""}</span>
                    <span className="text-muted" style={{ fontSize: 12.5 }}>{(e.classNames || []).join(", ") || "No classes"} · {e.papers.length} paper{e.papers.length === 1 ? "" : "s"}</span>
                  </button>
                ))}
              </div>
            )
          )}

          {view === "analysis" && <Analysis schoolCode={schoolCode} students={students} currentTerm={currentTerm} classes={classes} settings={settings} />}
        </>
      )}

      {showNew && (
        <NewExamDialog
          classes={classes}
          currentTerm={currentTerm}
          onClose={() => setShowNew(false)}
          onCreate={async (data) => {
            const id = await createExam({ schoolCode, data, actor: currentUser });
            setShowNew(false);
            await load();
            setSelectedId(id);
          }}
        />
      )}
    </div>
  );
}

// ─── New exam ────────────────────────────────────────────────────────────────
function NewExamDialog({ classes, currentTerm, onClose, onCreate }) {
  const [f, setF] = useState({ name: "", type: EXAM_TYPES[2], term: currentTerm, startDate: "", endDate: "", classNames: [] });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const toggle = (c) => setF((x) => ({ ...x, classNames: x.classNames.includes(c) ? x.classNames.filter((n) => n !== c) : [...x.classNames, c] }));
  const ok = f.name.trim() && f.startDate && f.classNames.length > 0;

  return (
    <Modal title="New exam" onClose={onClose}
      footer={<><Btn variant="secondary" onClick={onClose}>Cancel</Btn>
        <Btn variant="accent" loading={busy} disabled={!ok} onClick={async () => { setBusy(true); try { await onCreate(f); } catch (e) { setErr(e.message); setBusy(false); } }}>Create</Btn></>}>
      {err && <Notice tone="danger">{err}</Notice>}
      <Input label="Name" required value={f.name} onChange={set("name")} placeholder="e.g. Term 2 End-of-term Examinations" autoFocus />
      <div className="grid grid-cols-2 gap-4">
        <Select label="Type" value={f.type} onChange={set("type")}>{EXAM_TYPES.map((t) => <option key={t}>{t}</option>)}</Select>
        <Input label="Term" value={f.term} onChange={set("term")} />
        <Input label="First paper" type="date" required value={f.startDate} onChange={set("startDate")} />
        <Input label="Last paper" type="date" min={f.startDate} value={f.endDate} onChange={set("endDate")} />
      </div>
      <p className="field__label" style={{ margin: "12px 0 6px" }}>Classes sitting <span className="text-danger">*</span></p>
      {classes.length === 0 && <p className="text-muted" style={{ fontSize: 13 }}>Create classes first (Classes &amp; Streams).</p>}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {classes.map((c) => (
          <label key={c.id} className={`filter-btn ${f.classNames.includes(c.name) ? "filter-btn--active" : ""}`} style={{ cursor: "pointer" }}>
            <input type="checkbox" checked={f.classNames.includes(c.name)} onChange={() => toggle(c.name)} style={{ display: "none" }} />
            {c.name}
          </label>
        ))}
      </div>
    </Modal>
  );
}

// ─── One exam ────────────────────────────────────────────────────────────────
function ExamDetail({ exam, students, teachers, classes, leaves, schoolCode, currentUser, patch, onBack, onDeleted, say }) {
  const [tab, setTab] = useState("timetable");
  const [busy, setBusy] = useState(false);

  const sitting = useMemo(() => students.filter((s) => exam.classNames.includes(s.className) && s.status !== "withdrawn"), [students, exam.classNames]);
  const problems = useMemo(() => paperProblems(exam.papers), [exam.papers]);
  const seated = Object.keys(exam.seating || {}).length;
  const ready = exam.papers.length > 0 && !problems.some((p) => p.level === "error") && seated > 0 && exam.duty.length > 0;

  const run = async (fn, ok) => {
    setBusy(true);
    try { await fn(); if (ok) say("success", ok); }
    catch (e) { say("danger", e.message || "That didn't work."); }
    finally { setBusy(false); }
  };

  return (
    <div>
      <ModuleHeader
        title={exam.name}
        subtitle={`${exam.type}${exam.term ? ` · ${exam.term}` : ""} · ${exam.classNames.join(", ")}`}
        actions={
          <>
            <Btn variant="secondary" icon={<ArrowLeft size={15} />} onClick={onBack}>All exams</Btn>
            <IconBtn icon={<Trash2 size={16} />} title="Delete exam" danger
              onClick={() => { if (window.confirm(`Delete "${exam.name}" and its seating and roster?`)) run(async () => { await deleteExam(exam.id); onDeleted(); }, "Exam deleted."); }} />
          </>
        }
      />

      <StatGrid>
        <StatCard label="Candidates" value={sitting.length} />
        <StatCard label="Papers" value={exam.papers.length} />
        <StatCard label="Seated" value={`${seated}/${sitting.length}`} tone={seated === sitting.length && seated > 0 ? "success" : "warning"} />
        <StatCard label="Status" value={exam.status === "published" ? "Published" : "Draft"} tone={exam.status === "published" ? "success" : "warning"} />
      </StatGrid>

      <div className="mb-4">
        <FilterBar value={tab} onChange={setTab} options={[
          { id: "timetable", label: "Timetable", count: exam.papers.length },
          { id: "seating", label: "Rooms & seating", count: exam.rooms.length },
          { id: "duty", label: "Invigilation", count: exam.duty.length },
          { id: "publish", label: "Publish" },
        ]} />
      </div>

      {tab === "timetable" && <TimetableTab exam={exam} classes={classes} problems={problems} patch={patch} run={run} busy={busy} />}
      {tab === "seating" && <SeatingTab exam={exam} students={students} sitting={sitting} schoolCode={schoolCode} patch={patch} run={run} busy={busy} />}
      {tab === "duty" && <DutyTab exam={exam} teachers={teachers} students={students} leaves={leaves} patch={patch} run={run} busy={busy} />}
      {tab === "publish" && (
        <PublishTab exam={exam} sitting={sitting} ready={ready} problems={problems} seated={seated} busy={busy}
          onPublish={(notifyGuardians) => run(async () => {
            await patch({ status: "published", publishedAt: new Date().toISOString() });
            if (notifyGuardians) await notifyExamTimetable({ schoolCode, exam, students: sitting, actor: currentUser });
            const staffIds = [...new Set(exam.duty.map((d) => d.staffId))];
            await notifyExamDuty({ schoolCode, exam, actor: currentUser, duties: staffIds.map((id) => ({ staffId: id, lines: dutyLines(exam, id) })) });
          }, "Published. Guardians and invigilators have been told.")} />
      )}
    </div>
  );
}

// ─── Timetable ───────────────────────────────────────────────────────────────
function TimetableTab({ exam, classes, problems, patch, run, busy }) {
  const [f, setF] = useState({ className: exam.classNames[0] || "", subject: "", date: exam.startDate || "", start: "08:00", end: "10:00" });
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const subjects = useMemo(() => {
    const c = classes.find((x) => x.name === f.className);
    return c?.subjects || [];
  }, [classes, f.className]);

  const add = () => run(() => patch({ papers: [...exam.papers, { id: newId(), ...f, subject: f.subject.trim() }] }));
  const remove = (id) => run(() => patch({ papers: exam.papers.filter((p) => p.id !== id), duty: exam.duty.filter((d) => d.paperId !== id) }));

  return (
    <div>
      <div className="card" style={{ padding: 18, marginBottom: 16 }}>
        <h3 style={{ margin: "0 0 10px", fontSize: "1rem" }}>Add a paper</h3>
        <div className="grid grid-cols-2 gap-4">
          <Select label="Class" value={f.className} onChange={set("className")}>{exam.classNames.map((c) => <option key={c}>{c}</option>)}</Select>
          <Input label="Subject" list="exam-subjects" value={f.subject} onChange={set("subject")} placeholder="e.g. Mathematics" />
          <datalist id="exam-subjects">{subjects.map((s) => <option key={s} value={s} />)}</datalist>
          <Input label="Date" type="date" value={f.date} onChange={set("date")} />
          <div style={{ display: "flex", gap: 10 }}>
            <Input label="Start" type="time" value={f.start} onChange={set("start")} />
            <Input label="End" type="time" value={f.end} onChange={set("end")} />
          </div>
        </div>
        <Btn variant="accent" icon={<Plus size={15} />} disabled={busy || !f.subject.trim() || !f.date} onClick={add}>Add paper</Btn>
      </div>

      {problems.length > 0 && (
        <div className={`alert ${problems.some((p) => p.level === "error") ? "alert--error" : "alert--warning"}`} style={{ flexDirection: "column", alignItems: "flex-start", gap: 4, marginBottom: 14 }}>
          <strong><AlertTriangle size={14} style={{ verticalAlign: "-2px" }} /> {problems.length} thing{problems.length === 1 ? "" : "s"} to check</strong>
          {problems.slice(0, 6).map((p, i) => <span key={i} style={{ fontSize: 12.5 }}>{p.message}</span>)}
        </div>
      )}

      {exam.papers.length === 0 ? (
        <EmptyState icon={<GraduationCap size={28} />} title="No papers yet" sub="Add each paper above. Clashes are flagged as you go." />
      ) : (
        <TableWrap>
          <table className="data-table">
            <thead><tr><th>Date</th><th>Time</th><th>Class</th><th>Subject</th><th /></tr></thead>
            <tbody>
              {sortPapers(exam.papers).map((p) => (
                <tr key={p.id}>
                  <td>{fmtDate(p.date)}</td><td style={{ fontSize: 13 }}>{p.start}–{p.end}</td>
                  <td>{p.className}</td><td><strong>{p.subject}</strong></td>
                  <td style={{ textAlign: "right" }}><IconBtn icon={<Trash2 size={15} />} title="Remove" danger onClick={() => remove(p.id)} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      )}
    </div>
  );
}

// ─── Rooms & seating ─────────────────────────────────────────────────────────
function SeatingTab({ exam, students, sitting, schoolCode, patch, run, busy }) {
  const [prefix, setPrefix] = useState((schoolCode || "").split("-").pop() ? "" : "");
  const [print, setPrint] = useState(false);
  const rooms = exam.rooms;
  const capacity = rooms.reduce((n, r) => n + (Number(r.capacity) || 0), 0);
  const lists = useMemo(() => roomLists(exam, students), [exam, students]);
  const setRoom = (id, key, value) => patch({ rooms: rooms.map((r) => (r.id === id ? { ...r, [key]: value } : r)) });

  const generate = () => run(async () => {
    const { seating, unplaced } = generateSeating({ students, classNames: exam.classNames, rooms, prefix: prefix.trim() });
    // Duty rows for rooms that no longer exist would point at nothing.
    await patch({ seating, duty: exam.duty.filter((d) => rooms.some((r) => r.id === d.roomId)) });
    if (unplaced.length) throw new Error(`${unplaced.length} candidate${unplaced.length === 1 ? "" : "s"} could not be seated: the rooms hold ${capacity}, and ${sitting.length} are sitting. Add room capacity and generate again.`);
  }, "Seating generated.");

  const exportCsv = () => downloadCsv(
    `${exam.name.replace(/\W+/g, "-")}-candidates.csv`,
    ["Candidate no", "Name", "Class", "Room", "Seat", "Guardian phone"],
    lists.flatMap(({ room, learners }) => learners.map((l) => [l.candidateNo, l.student.fullName || `${l.student.firstName || ""} ${l.student.lastName || ""}`.trim(), l.student.className, room.name, l.seat, l.student.guardianPhone || ""])),
  );

  return (
    <div>
      <div className="card" style={{ padding: 18, marginBottom: 16 }}>
        <h3 style={{ margin: "0 0 10px", fontSize: "1rem" }}>Rooms</h3>
        {rooms.map((r) => (
          <div key={r.id} style={{ display: "flex", gap: 10, alignItems: "flex-end", marginBottom: 8, flexWrap: "wrap" }}>
            <div style={{ flex: "1 1 180px" }}><Input label="Name" defaultValue={r.name} onBlur={(e) => e.target.value !== r.name && setRoom(r.id, "name", e.target.value)} /></div>
            <div style={{ width: 120 }}><Input label="Seats" type="number" min="1" defaultValue={r.capacity} onBlur={(e) => Number(e.target.value) !== Number(r.capacity) && setRoom(r.id, "capacity", Math.max(1, Number(e.target.value) || 1))} /></div>
            <IconBtn icon={<Trash2 size={15} />} title="Remove room" danger onClick={() => patch({ rooms: rooms.filter((x) => x.id !== r.id) })} />
          </div>
        ))}
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginTop: 6 }}>
          <Btn variant="secondary" icon={<Plus size={15} />} onClick={() => patch({ rooms: [...rooms, { id: newId(), name: `Room ${rooms.length + 1}`, capacity: 40 }] })}>Add room</Btn>
          <span className="text-muted" style={{ fontSize: 13 }}>{capacity} seats for {sitting.length} candidates{capacity < sitting.length ? " (not enough)" : ""}</span>
        </div>
      </div>

      <div className="card" style={{ padding: 18, marginBottom: 16, display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
        <div style={{ width: 200 }}><Input label="Candidate number prefix" value={prefix} onChange={(e) => setPrefix(e.target.value)} hint="Optional, e.g. your centre number" /></div>
        <Btn variant="accent" icon={<Wand2 size={15} />} loading={busy} disabled={rooms.length === 0 || sitting.length === 0} onClick={generate}>
          {Object.keys(exam.seating).length ? "Regenerate seating" : "Generate seating"}
        </Btn>
        {lists.some((l) => l.learners.length) && (
          <>
            <Btn variant="secondary" icon={<Printer size={15} />} onClick={() => setPrint(true)}>Print room lists</Btn>
            <Btn variant="secondary" icon={<Download size={15} />} onClick={exportCsv}>Candidate list (CSV)</Btn>
          </>
        )}
      </div>
      <p className="text-muted" style={{ fontSize: 12.5, margin: "-6px 0 16px" }}>
        Classes are mixed so neighbours are usually from different classes. Candidate numbers are alphabetical and stay the same if you regenerate.
      </p>

      {lists.filter((l) => l.learners.length).map(({ room, learners }) => (
        <div key={room.id} className="card" style={{ padding: 16, marginBottom: 12 }}>
          <strong>{room.name}</strong> <span className="text-muted" style={{ fontSize: 12.5 }}>{learners.length} of {room.capacity} seats</span>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
            {[...new Set(learners.map((l) => l.student.className))].map((c) => <span key={c} className="tag tag--neutral">{c}: {learners.filter((l) => l.student.className === c).length}</span>)}
          </div>
        </div>
      ))}

      {print && (
        <PrintSheet title="Seating lists" onClose={() => setPrint(false)}>
          {lists.filter((l) => l.learners.length).map(({ room, learners }, i) => (
            <div key={room.id} className={`ps-room ${i > 0 ? "ps-break" : ""}`}>
              <h1>{exam.name}</h1>
              <p className="ps-sub">{room.name} · {learners.length} candidates · {exam.classNames.join(", ")}</p>
              <table>
                <thead><tr><th>Seat</th><th>Candidate no</th><th>Name</th><th>Class</th><th>Signature</th></tr></thead>
                <tbody>{learners.map((l) => (
                  <tr key={l.id}><td>{l.seat}</td><td>{l.candidateNo}</td><td>{l.student.fullName || `${l.student.firstName || ""} ${l.student.lastName || ""}`}</td><td>{l.student.className}</td><td style={{ width: 130 }} /></tr>
                ))}</tbody>
              </table>
            </div>
          ))}
        </PrintSheet>
      )}
    </div>
  );
}

// ─── Invigilation ────────────────────────────────────────────────────────────
function DutyTab({ exam, teachers, students, leaves, patch, run, busy }) {
  const [perRoom, setPerRoom] = useState("1");
  const [gaps, setGaps] = useState([]);
  const [print, setPrint] = useState(false);
  const [conflict, setConflict] = useState("");

  const generate = () => run(async () => {
    const r = generateDuty({ exam, teachers, students, leaves, perRoom: Number(perRoom) });
    setGaps(r.gaps);
    await patch({ duty: r.duty });
  }, "Roster generated.");

  const reassign = (d, staffId) => {
    const t = teachers.find((x) => x.id === staffId);
    const clash = dutyConflict(exam.duty, d, staffId);
    if (clash) { setConflict(`${t?.name} is already invigilating ${clash.className} ${clash.subject} at that time.`); return; }
    setConflict("");
    run(() => patch({ duty: exam.duty.map((x) => (x.id === d.id ? { ...x, staffId, staffName: t?.name || "" } : x)) }));
  };

  const sorted = [...exam.duty].sort((a, b) => `${a.date}${a.start}${a.roomName}`.localeCompare(`${b.date}${b.start}${b.roomName}`));
  const load = useMemo(() => {
    const m = new Map();
    exam.duty.forEach((d) => m.set(d.staffName, (m.get(d.staffName) || 0) + 1));
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [exam.duty]);

  if (Object.keys(exam.seating).length === 0) {
    return <EmptyState icon={<GraduationCap size={28} />} title="Seat the candidates first" sub="Invigilators are assigned to rooms that have candidates. Generate the seating in Rooms & seating." />;
  }

  return (
    <div>
      <div className="card" style={{ padding: 18, marginBottom: 16, display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
        <div style={{ width: 180 }}>
          <Select label="Invigilators per room" value={perRoom} onChange={(e) => setPerRoom(e.target.value)}><option value="1">1</option><option value="2">2</option></Select>
        </div>
        <Btn variant="accent" icon={<Wand2 size={15} />} loading={busy} disabled={exam.papers.length === 0} onClick={generate}>{exam.duty.length ? "Regenerate roster" : "Generate roster"}</Btn>
        {exam.duty.length > 0 && <Btn variant="secondary" icon={<Printer size={15} />} onClick={() => setPrint(true)}>Print roster</Btn>}
      </div>
      <p className="text-muted" style={{ fontSize: 12.5, margin: "-6px 0 14px" }}>
        Nobody invigilates their own subject if someone else is free, is booked twice at once, or is picked on a day they're on approved leave.
      </p>

      {conflict && <Notice tone="warning" onDismiss={() => setConflict("")}>{conflict}</Notice>}
      {gaps.length > 0 && (
        <div className="alert alert--warning" style={{ flexDirection: "column", alignItems: "flex-start", gap: 4, marginBottom: 14 }}>
          <strong>Nobody was free for {gaps.length} duty slot{gaps.length === 1 ? "" : "s"}:</strong>
          {gaps.slice(0, 5).map((g) => <span key={g} style={{ fontSize: 12.5 }}>{g}</span>)}
        </div>
      )}

      {load.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 14 }}>
          {load.map(([name, n]) => <span key={name} className="tag tag--neutral">{name}: {n}</span>)}
        </div>
      )}

      {sorted.length > 0 && (
        <TableWrap>
          <table className="data-table">
            <thead><tr><th>Date</th><th>Time</th><th>Paper</th><th>Room</th><th>Invigilator</th></tr></thead>
            <tbody>
              {sorted.map((d) => (
                <tr key={d.id}>
                  <td>{fmtDate(d.date)}</td><td style={{ fontSize: 13 }}>{d.start}–{d.end}</td>
                  <td><strong>{d.className}</strong> {d.subject}</td><td>{d.roomName}</td>
                  <td>
                    <select className="search-input" value={d.staffId} onChange={(e) => reassign(d, e.target.value)}>
                      {teachers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      )}

      {print && (
        <PrintSheet title="Invigilation roster" onClose={() => setPrint(false)}>
          <h1>{exam.name}: invigilation roster</h1>
          <p className="ps-sub">{exam.classNames.join(", ")}</p>
          <table>
            <thead><tr><th>Date</th><th>Time</th><th>Paper</th><th>Room</th><th>Invigilator</th></tr></thead>
            <tbody>{sorted.map((d) => <tr key={d.id}><td>{fmtDate(d.date)}</td><td>{d.start}–{d.end}</td><td>{d.className} {d.subject}</td><td>{d.roomName}</td><td>{d.staffName}</td></tr>)}</tbody>
          </table>
        </PrintSheet>
      )}
    </div>
  );
}

// ─── Publish ─────────────────────────────────────────────────────────────────
function PublishTab({ exam, sitting, ready, problems, seated, onPublish, busy }) {
  const [guardians, setGuardians] = useState(true);
  const withPhone = sitting.filter((s) => s.guardianPhone).length;
  const staffCount = new Set(exam.duty.map((d) => d.staffId)).size;
  const check = (ok, text) => (
    <li style={{ display: "flex", gap: 8, alignItems: "center", margin: "8px 0", color: ok ? "var(--success-light)" : "var(--text-secondary)" }}>
      {ok ? <Check size={16} /> : <AlertTriangle size={16} />} {text}
    </li>
  );
  return (
    <div className="card" style={{ padding: 22, maxWidth: 620 }}>
      <h3 style={{ margin: "0 0 6px" }}>{exam.status === "published" ? "Published" : "Ready to tell everyone?"}</h3>
      <ul style={{ listStyle: "none", padding: 0, margin: "12px 0 16px" }}>
        {check(exam.papers.length > 0, `${exam.papers.length} paper${exam.papers.length === 1 ? "" : "s"} on the timetable`)}
        {check(!problems.some((p) => p.level === "error"), problems.some((p) => p.level === "error") ? "The timetable has clashes to fix" : "No timetable clashes")}
        {check(seated > 0 && seated === sitting.length, `${seated} of ${sitting.length} candidates seated`)}
        {check(exam.duty.length > 0, `${exam.duty.length} invigilation duties across ${staffCount} teacher${staffCount === 1 ? "" : "s"}`)}
      </ul>
      <label style={{ display: "flex", gap: 10, alignItems: "center", margin: "0 0 16px", fontSize: 14 }}>
        <input type="checkbox" checked={guardians} onChange={(e) => setGuardians(e.target.checked)} style={{ width: 18, height: 18 }} />
        Send the timetable to {withPhone} guardian{withPhone === 1 ? "" : "s"} on WhatsApp
      </label>
      <p className="text-muted" style={{ fontSize: 12.5, marginBottom: 16 }}>
        Invigilators are always sent their own duties, on WhatsApp. {sitting.length - withPhone > 0 ? `${sitting.length - withPhone} candidate(s) have no guardian phone number and won't be reached.` : ""}
      </p>
      <Btn variant="accent" icon={<Send size={15} />} loading={busy} disabled={!ready} onClick={() => { if (window.confirm(exam.status === "published" ? "Send everything again?" : "Publish and send now?")) onPublish(guardians); }}>
        {exam.status === "published" ? "Send again" : "Publish & notify"}
      </Btn>
      {!ready && <p className="text-muted" style={{ fontSize: 12.5, marginTop: 10 }}>Complete the checklist to publish.</p>}
    </div>
  );
}

// ─── Results analysis ────────────────────────────────────────────────────────
function Analysis({ schoolCode, students, currentTerm, classes, settings }) {
  // Exams are graded on the secondary section's scale (or the school's only
  // section). MSCE readiness — credits, "on track" — applies on MANEB only.
  const sections = useMemo(() => sectionsOf(settings), [settings]);
  const scale = (sections.find((x) => x.id === "secondary") || sections[0]).grading;
  const maneb = isManebScale(scale);
  const GRADES = scaleRows(scale);
  const [pickedTerm, setTerm] = useState("");
  const [form, setForm] = useState("all");
  // The term defaults to the school's current one until the user picks another.
  const term = pickedTerm || currentTerm;
  const key = `${term}|${form}`;
  const [result, setResult] = useState({ key: "", rows: null });
  const rows = result.key === key ? result.rows : null;
  const terms = useMemo(() => [currentTerm, ...(currentTerm ? pastTermOptions(currentTerm) : [])].filter(Boolean), [currentTerm]);

  useEffect(() => {
    if (!term) return undefined;
    let live = true;
    fetchMarkSheets(schoolCode, term).then((sheets) => {
      if (live) setResult({ key, rows: buildReadiness({ students, sheets, formFilter: form === "all" ? null : Number(form) }) });
    });
    return () => { live = false; };
  }, [schoolCode, term, form, students, key]);

  const forms = useMemo(() => [...new Set(classes.map((c) => formNumber(c.name)).filter(Boolean))].sort(), [classes]);
  const subjects = useMemo(() => (rows ? analyseSubjects(rows, scale) : []), [rows, scale]);
  const byClass = useMemo(() => (rows ? analyseClasses(rows) : []), [rows]);
  const bands = useMemo(() => Object.fromEntries(RISK_BANDS.map((b) => [b.id, (rows || []).filter((r) => r.band === b.id).length])), [rows]);

  const exportSubjects = () => downloadCsv(`results-${term.replace(/\W+/g, "-")}.csv`,
    ["Subject", "Entered", "Mean", "High", "Low", ...(maneb ? ["Credit %"] : []), "Pass %", ...GRADES.map((g) => g.code)],
    subjects.map((s) => [s.subject, s.entered, s.mean, s.high, s.low, ...(maneb ? [s.creditRate] : []), s.passRate, ...GRADES.map((g) => s.dist[g.grade])]));
  const exportCandidates = () => downloadCsv(`msce-candidates-${term.replace(/\W+/g, "-")}.csv`,
    ["Name", "Class", "Credits", "English credit", "Standing", "Weakest subjects"],
    (rows || []).map((r) => [r.fullName || "", r.className || "", r.credits, r.englishCredit ? "Yes" : "No", bandMeta(r.band).label, (r.weakest || []).map((w) => `${w.subject} ${w.score}`).join("; ")]));

  return (
    <div>
      <div className="flex items-center gap-3 mb-4" style={{ flexWrap: "wrap" }}>
        <select className="search-input" style={{ maxWidth: 200 }} value={term} onChange={(e) => setTerm(e.target.value)}>{terms.map((t) => <option key={t}>{t}</option>)}</select>
        <select className="search-input" style={{ maxWidth: 160 }} value={form} onChange={(e) => setForm(e.target.value)}>
          <option value="all">All forms</option>{forms.map((f) => <option key={f} value={f}>Form {f}</option>)}
        </select>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <Btn variant="secondary" size="sm" icon={<Download size={14} />} disabled={!subjects.length} onClick={exportSubjects}>Subject results</Btn>
          <Btn variant="secondary" size="sm" icon={<Download size={14} />} disabled={!rows?.length} onClick={exportCandidates}>Candidate standing</Btn>
        </div>
      </div>

      {rows === null ? <LoadingState label="Working out the results…" /> : subjects.length === 0 ? (
        <EmptyState icon={<GraduationCap size={28} />} title="No marks for this selection" sub="Marks appear here once teachers have entered them for the term." />
      ) : (
        <>
          <StatGrid>
            <StatCard label="Learners with marks" value={rows.filter((r) => r.band !== "noData").length} />
            {maneb && <>
              <StatCard label="On track for MSCE" value={bands.onTrack} tone="success" sub="6+ credits incl. English" />
              <StatCard label="Borderline" value={bands.borderline} tone="warning" />
              <StatCard label="At risk" value={bands.atRisk} tone={bands.atRisk ? "danger" : undefined} />
            </>}
          </StatGrid>

          <h3 style={{ margin: "18px 0 8px", fontSize: "1rem" }}>By subject</h3>
          <TableWrap>
            <table className="data-table">
              <thead><tr><th>Subject</th><th>Entered</th><th>Mean</th>{maneb && <th>Credit rate</th>}<th>Pass rate</th><th>Grade spread ({GRADES[0]?.code} to {GRADES[GRADES.length - 1]?.code})</th><th>Top</th></tr></thead>
              <tbody>
                {subjects.map((s) => {
                  const max = Math.max(...Object.values(s.dist), 1);
                  return (
                    <tr key={s.subject}>
                      <td><strong>{s.subject}</strong></td>
                      <td>{s.entered}</td>
                      <td>{s.mean}</td>
                      {maneb && <td><Pill tone={s.creditRate >= 60 ? "success" : s.creditRate >= 35 ? "warning" : "danger"}>{s.creditRate}%</Pill></td>}
                      <td>{s.passRate}%</td>
                      <td>
                        <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 30 }} title={GRADES.map((g) => `${g.code}: ${s.dist[g.grade]}`).join("  ")}>
                          {GRADES.map((g) => <div key={g.grade} style={{ width: 10, height: `${Math.max(2, (s.dist[g.grade] / max) * 30)}px`, background: g.hex, borderRadius: 2 }} />)}
                        </div>
                      </td>
                      <td style={{ fontSize: 12.5 }}>{s.top.map((t) => `${t.name} (${t.score})`).slice(0, 2).join(", ")}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </TableWrap>

          {byClass.length > 0 && (
            <>
              <h3 style={{ margin: "18px 0 8px", fontSize: "1rem" }}>By class</h3>
              <TableWrap>
                <table className="data-table">
                  <thead><tr><th>Class</th><th>Learners</th><th>Mean score</th>{maneb && <th>On track for MSCE</th>}</tr></thead>
                  <tbody>{byClass.map((c) => <tr key={c.className}><td><strong>{c.className}</strong></td><td>{c.learners}</td><td>{c.mean}</td>{maneb && <td>{c.onTrack}</td>}</tr>)}</tbody>
                </table>
              </TableWrap>
            </>
          )}
        </>
      )}
    </div>
  );
}
