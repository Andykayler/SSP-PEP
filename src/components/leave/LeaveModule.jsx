// src/components/leave/LeaveModule.jsx
// ─────────────────────────────────────────────────────────────────────────────
// Leave and cover, for both sides of the conversation.
//
//   mode="teacher"  ask for leave, withdraw a pending request, and answer the
//                   cover the head teacher has asked you to take.
//   mode="head"     decide requests, and — the part that takes a head teacher
//                   an afternoon by hand — arrange cover for every lesson the
//                   absent teacher would have taken, with the free teachers
//                   already worked out from the timetable.
//
// Everyone involved is told on WhatsApp (see functions/index.js): the head
// teacher when a request arrives, the teacher when it is decided, and the
// substitute when they are asked to cover.
// ─────────────────────────────────────────────────────────────────────────────
import { useState, useEffect, useMemo, useCallback } from "react";
import { db } from "../../firebase";
import { collection, query, where, getDocs } from "firebase/firestore";
import { CalendarOff, Check, X, Users, RefreshCw, Wand2 } from "lucide-react";
import {
  LEAVE_TYPES, STATUS_LABEL, STATUS_TONE, workingDays, submitLeave, cancelLeave, decideLeave,
  fetchMyLeave, fetchSchoolLeave, fetchSubstitutions, lessonsAffected, suggestCover,
  assignCover, respondToCover, subId,
} from "../../services/leave";
import {
  notifyLeaveRequested, notifyLeaveDecided, notifyCoverAssigned,
} from "../../services/notificationHooks";
import { notifyRoles } from "../../services/notifications";
import {
  Modal, Btn, Input, Select, Textarea, Pill, EmptyState, StatGrid, StatCard,
  ModuleHeader, Notice, LoadingState, TableWrap, FilterBar,
} from "../ui/ModuleKit";
import "../../pages/headteacher/modules/staff-management.css";

const todayISO = () => new Date().toISOString().slice(0, 10);
const fmt = (iso) => (iso ? new Date(`${iso}T00:00:00`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }) : "—");
const range = (l) => (l.startDate === l.endDate ? fmt(l.startDate) : `${fmt(l.startDate)} to ${fmt(l.endDate)}`);

export default function LeaveModule({ schoolCode, currentUser, mode = "teacher" }) {
  const head = mode === "head";
  const [leaves, setLeaves] = useState(null);
  const [subs, setSubs] = useState([]);
  const [timetable, setTimetable] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [notice, setNotice] = useState(null);
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState(head ? "pending" : "mine");
  const [deciding, setDeciding] = useState(null);     // { request, approved }
  const [coverFor, setCoverFor] = useState(null);     // an approved request

  const load = useCallback(async () => {
    if (!schoolCode || !currentUser?.id) return;
    try {
      const [l, s] = await Promise.all([
        head ? fetchSchoolLeave(schoolCode) : fetchMyLeave(currentUser.id),
        fetchSubstitutions(schoolCode),
      ]);
      setLeaves(l);
      setSubs(s);
      if (head) {
        const [tt, us] = await Promise.all([
          getDocs(query(collection(db, "timetable"), where("schoolCode", "==", schoolCode))),
          getDocs(query(collection(db, "users"), where("schoolCode", "==", schoolCode), where("role", "in", ["head_teacher", "class_teacher"]))),
        ]);
        setTimetable(tt.docs.map((d) => ({ id: d.id, ...d.data() })));
        setTeachers(us.docs.map((d) => ({ id: d.id, ...d.data() })));
      }
    } catch (err) {
      console.error("[leave] load failed:", err);
      setNotice({ tone: "danger", text: `Could not load leave: ${err.message}` });
      setLeaves([]);
    }
  }, [schoolCode, currentUser?.id, head]);

  useEffect(() => { load(); }, [load]);

  const say = (tone, text) => setNotice({ tone, text });
  const run = async (fn, ok) => {
    setBusy(true);
    try { await fn(); if (ok) say("success", ok); await load(); }
    catch (err) { say("danger", err.message || "That didn't work."); }
    finally { setBusy(false); }
  };

  if (leaves === null) return <LoadingState label="Loading leave…" />;

  const pending = leaves.filter((l) => l.status === "pending");
  const upcomingCover = subs.filter((s) => s.date >= todayISO() && s.status !== "declined");
  const myCover = subs.filter((s) => s.substituteId === currentUser.id && s.date >= todayISO() && s.status !== "declined");

  return (
    <div>
      <ModuleHeader
        title={head ? "Leave & Cover" : "Leave"}
        subtitle={head ? "Decide leave requests and arrange cover for the lessons they leave" : "Ask for leave, and answer cover requests"}
        actions={<Btn variant="secondary" icon={<RefreshCw size={15} />} onClick={load}>Refresh</Btn>}
      />
      {notice && <Notice tone={notice.tone} onDismiss={() => setNotice(null)}>{notice.text}</Notice>}

      {head ? (
        <>
          <StatGrid>
            <StatCard label="Awaiting decision" value={pending.length} tone={pending.length ? "warning" : undefined} />
            <StatCard label="Away today" value={leaves.filter((l) => l.status === "approved" && l.startDate <= todayISO() && l.endDate >= todayISO()).length} />
            <StatCard label="Cover booked" value={upcomingCover.length} sub="From today onwards" />
          </StatGrid>

          <div className="mb-4">
            <FilterBar
              value={view}
              onChange={setView}
              options={[
                { id: "pending", label: "Awaiting decision", count: pending.length },
                { id: "all", label: "All requests", count: leaves.length },
                { id: "cover", label: "Cover", count: upcomingCover.length },
              ]}
            />
          </div>

          {view !== "cover" && (
            (view === "pending" ? pending : leaves).length === 0 ? (
              <EmptyState icon={<CalendarOff size={28} />} title={view === "pending" ? "No requests waiting" : "No leave requests yet"} sub="Requests from teachers appear here." />
            ) : (
              <TableWrap>
                <table className="data-table">
                  <thead><tr><th>Staff</th><th>Type</th><th>Dates</th><th>Days</th><th>Status</th><th style={{ textAlign: "right" }}>Actions</th></tr></thead>
                  <tbody>
                    {(view === "pending" ? pending : leaves).map((l) => (
                      <tr key={l.id}>
                        <td><strong>{l.staffName}</strong>{l.reason && <div className="text-muted" style={{ fontSize: 12, maxWidth: 260 }}>{l.reason}</div>}</td>
                        <td style={{ fontSize: 13 }}>{l.type}</td>
                        <td style={{ fontSize: 13 }}>{range(l)}</td>
                        <td>{l.days}</td>
                        <td>
                          <Pill tone={STATUS_TONE[l.status]}>{STATUS_LABEL[l.status]}</Pill>
                          {l.decisionNote && <div className="text-muted" style={{ fontSize: 11, marginTop: 3 }}>{l.decisionNote}</div>}
                        </td>
                        <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                          {l.status === "pending" && (
                            <>
                              <Btn size="sm" variant="accent" icon={<Check size={14} />} onClick={() => setDeciding({ request: l, approved: true })}>Approve</Btn>{" "}
                              <Btn size="sm" variant="danger" icon={<X size={14} />} onClick={() => setDeciding({ request: l, approved: false })}>Decline</Btn>
                            </>
                          )}
                          {l.status === "approved" && l.endDate >= todayISO() && (
                            <Btn size="sm" variant="secondary" icon={<Users size={14} />} onClick={() => setCoverFor(l)}>Arrange cover</Btn>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableWrap>
            )
          )}

          {view === "cover" && <CoverTable subs={upcomingCover} showOriginal />}
        </>
      ) : (
        <>
          {myCover.length > 0 && (
            <div className="card" style={{ padding: 18, marginBottom: 18 }}>
              <h3 style={{ margin: "0 0 10px", fontSize: "1rem" }}>Cover you've been asked to take</h3>
              <TableWrap>
                <table className="data-table">
                  <thead><tr><th>When</th><th>Class</th><th>For</th><th>Status</th><th style={{ textAlign: "right" }} /></tr></thead>
                  <tbody>
                    {myCover.map((s) => (
                      <tr key={s.id}>
                        <td>{fmt(s.date)} · P{s.periodNumber}{s.startTime ? ` (${s.startTime})` : ""}</td>
                        <td><strong>{s.className}</strong> {s.subject}</td>
                        <td>{s.originalTeacherName}</td>
                        <td><Pill tone={s.status === "confirmed" ? "success" : "warning"}>{s.status === "confirmed" ? "Confirmed" : "Please respond"}</Pill></td>
                        <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                          {s.status === "assigned" && (
                            <>
                              <Btn size="sm" variant="accent" disabled={busy} onClick={() => run(() => respondToCover(s.id, true), "Thanks. The head teacher knows you'll cover it.")}>I can cover</Btn>{" "}
                              <Btn size="sm" variant="secondary" disabled={busy} onClick={() => run(async () => {
                                await respondToCover(s.id, false);
                                await notifyRoles({ schoolCode, roles: ["head_teacher"], title: `${currentUser.name} can't cover ${s.className}`, body: `${fmt(s.date)}, period ${s.periodNumber}. Please arrange someone else.`, category: "cover", priority: "high", actorId: currentUser.id, actorName: currentUser.name, tab: "leave" });
                              }, "Declined. The head teacher has been told.")}>Can't</Btn>
                            </>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableWrap>
            </div>
          )}

          <RequestForm
            busy={busy}
            onSubmit={(form) => run(async () => {
              const { id, days } = await submitLeave({ schoolCode, staff: currentUser, ...form });
              await notifyLeaveRequested({ schoolCode, request: { id, staffName: currentUser.name, ...form, days }, actor: currentUser });
            }, "Request sent. Your head teacher has been told.")}
          />

          <h3 style={{ margin: "22px 0 10px", fontSize: "1rem" }}>Your requests</h3>
          {leaves.length === 0 ? (
            <EmptyState icon={<CalendarOff size={28} />} title="No leave requests yet" sub="Use the form above to ask for leave." />
          ) : (
            <TableWrap>
              <table className="data-table">
                <thead><tr><th>Type</th><th>Dates</th><th>Days</th><th>Status</th><th style={{ textAlign: "right" }} /></tr></thead>
                <tbody>
                  {leaves.map((l) => (
                    <tr key={l.id}>
                      <td>{l.type}{l.reason && <div className="text-muted" style={{ fontSize: 12 }}>{l.reason}</div>}</td>
                      <td style={{ fontSize: 13 }}>{range(l)}</td>
                      <td>{l.days}</td>
                      <td>
                        <Pill tone={STATUS_TONE[l.status]}>{STATUS_LABEL[l.status]}</Pill>
                        {l.decisionNote && <div className="text-muted" style={{ fontSize: 11, marginTop: 3 }}>{l.decidedByName}: {l.decisionNote}</div>}
                      </td>
                      <td style={{ textAlign: "right" }}>
                        {l.status === "pending" && <Btn size="sm" variant="secondary" disabled={busy} onClick={() => run(() => cancelLeave(l.id), "Request withdrawn.")}>Withdraw</Btn>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          )}
        </>
      )}

      {deciding && (
        <DecisionDialog
          {...deciding}
          busy={busy}
          onClose={() => setDeciding(null)}
          onConfirm={(note) => run(async () => {
            await decideLeave({ request: deciding.request, approved: deciding.approved, note, actor: currentUser });
            await notifyLeaveDecided({ schoolCode, request: deciding.request, approved: deciding.approved, note, actor: currentUser });
            const req = deciding.request;
            setDeciding(null);
            if (deciding.approved) setCoverFor({ ...req, status: "approved" });
          }, deciding.approved ? "Approved. The teacher has been told." : "Declined. The teacher has been told.")}
        />
      )}

      {coverFor && (
        <CoverDialog
          leave={coverFor}
          timetable={timetable}
          teachers={teachers}
          subs={subs}
          leaves={leaves}
          busy={busy}
          onClose={() => setCoverFor(null)}
          onAssign={(lesson, substitute) => run(async () => {
            const sub = await assignCover({ schoolCode, lesson, substitute, actor: currentUser });
            await notifyCoverAssigned({ schoolCode, substitution: sub, actor: currentUser });
          })}
        />
      )}
    </div>
  );
}

function RequestForm({ onSubmit, busy }) {
  const [f, setF] = useState({ type: LEAVE_TYPES[0], startDate: todayISO(), endDate: todayISO(), reason: "" });
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value, ...(k === "startDate" && e.target.value > x.endDate ? { endDate: e.target.value } : {}) }));
  const days = workingDays(f.startDate, f.endDate);
  return (
    <div className="card" style={{ padding: 20 }}>
      <h3 style={{ margin: "0 0 12px", fontSize: "1rem" }}>Ask for leave</h3>
      <div className="grid grid-cols-2 gap-4">
        <Select label="Type" value={f.type} onChange={set("type")}>{LEAVE_TYPES.map((t) => <option key={t}>{t}</option>)}</Select>
        <div />
        <Input label="From" type="date" min={todayISO()} value={f.startDate} onChange={set("startDate")} />
        <Input label="To" type="date" min={f.startDate} value={f.endDate} onChange={set("endDate")} />
      </div>
      <Textarea label="Reason (optional)" rows={2} value={f.reason} onChange={set("reason")} />
      <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
        <Btn variant="accent" loading={busy} disabled={days < 1} onClick={() => onSubmit(f)}>Send request</Btn>
        <span className="text-muted" style={{ fontSize: 13 }}>{days > 0 ? `${days} school day${days === 1 ? "" : "s"}` : "No school days in that range"}</span>
      </div>
    </div>
  );
}

function DecisionDialog({ request, approved, busy, onClose, onConfirm }) {
  const [note, setNote] = useState("");
  return (
    <Modal
      title={approved ? "Approve leave" : "Decline leave"}
      subtitle={`${request.staffName} · ${request.type} · ${range(request)} (${request.days} day${request.days === 1 ? "" : "s"})`}
      onClose={onClose}
      footer={<><Btn variant="secondary" onClick={onClose} disabled={busy}>Cancel</Btn><Btn variant={approved ? "accent" : "danger"} loading={busy} disabled={!approved && !note.trim()} onClick={() => onConfirm(note)}>{approved ? "Approve" : "Decline"}</Btn></>}
    >
      {request.reason && <p className="text-muted" style={{ fontSize: 13, marginBottom: 12 }}>Their reason: {request.reason}</p>}
      <Textarea label={approved ? "Note (optional)" : "Reason"} required={!approved} rows={3} value={note} onChange={(e) => setNote(e.target.value)} hint="The teacher receives this on WhatsApp." />
      {approved && <p className="text-muted" style={{ fontSize: 12.5 }}>Next you'll be able to arrange cover for their lessons.</p>}
    </Modal>
  );
}

function CoverDialog({ leave, timetable, teachers, subs, leaves, onClose, onAssign, busy }) {
  const lessons = useMemo(() => lessonsAffected(leave, timetable).filter((l) => l.date >= todayISO()), [leave, timetable]);
  const [pick, setPick] = useState({});
  const assigned = (l) => subs.find((s) => s.id === subId(leave.schoolCode, l) && s.status !== "declined");

  const options = (l) => suggestCover({ lesson: l, teachers, timetable, substitutions: subs, leaves });

  const autoAll = async () => {
    for (const l of lessons.filter((x) => !assigned(x))) {
      const best = options(l)[0];
      if (best) await onAssign(l, best);
    }
  };

  return (
    <Modal
      wide
      title={`Cover for ${leave.staffName}`}
      subtitle={`${leave.type} · ${range(leave)}`}
      onClose={onClose}
      footer={
        <>
          <Btn variant="secondary" onClick={onClose}>Done</Btn>
          {lessons.some((l) => !assigned(l)) && <Btn variant="accent" icon={<Wand2 size={15} />} loading={busy} onClick={autoAll}>Assign best fit to all</Btn>}
        </>
      }
    >
      {lessons.length === 0 ? (
        <p className="text-muted">{leave.staffName} has no timetabled lessons on those dates, so no cover is needed.</p>
      ) : (
        <TableWrap>
          <table className="data-table">
            <thead><tr><th>When</th><th>Lesson</th><th>Cover</th><th /></tr></thead>
            <tbody>
              {lessons.map((l) => {
                const a = assigned(l);
                const opts = options(l);
                return (
                  <tr key={l.key}>
                    <td style={{ fontSize: 13, whiteSpace: "nowrap" }}>{fmt(l.date)}<div className="text-muted" style={{ fontSize: 11 }}>P{l.periodNumber} {l.startTime}</div></td>
                    <td><strong>{l.className}</strong> · {l.subject}</td>
                    <td>
                      {a ? (
                        <><strong>{a.substituteName}</strong> <Pill tone={a.status === "confirmed" ? "success" : "warning"}>{a.status === "confirmed" ? "Confirmed" : "Asked"}</Pill></>
                      ) : opts.length === 0 ? (
                        <span className="text-muted" style={{ fontSize: 12.5 }}>Nobody is free</span>
                      ) : (
                        <select className="search-input" value={pick[l.key] ?? opts[0].id} onChange={(e) => setPick((p) => ({ ...p, [l.key]: e.target.value }))}>
                          {opts.map((t) => (
                            <option key={t.id} value={t.id}>{t.name}{t.teachesSubject ? " · teaches this subject" : t.teachesClass ? " · teaches this class" : ""}{t.duties ? ` · ${t.duties} cover this week` : ""}</option>
                          ))}
                        </select>
                      )}
                    </td>
                    <td style={{ textAlign: "right" }}>
                      {!a && opts.length > 0 && (
                        <Btn size="sm" variant="accent" disabled={busy} onClick={() => onAssign(l, opts.find((t) => t.id === (pick[l.key] ?? opts[0].id)))}>Assign</Btn>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </TableWrap>
      )}
    </Modal>
  );
}

function CoverTable({ subs, showOriginal }) {
  if (subs.length === 0) return <EmptyState icon={<Users size={28} />} title="No cover booked" sub="Cover you arrange after approving leave appears here." />;
  return (
    <TableWrap>
      <table className="data-table">
        <thead><tr><th>When</th><th>Class</th>{showOriginal && <th>For</th>}<th>Cover</th><th>Status</th></tr></thead>
        <tbody>
          {subs.map((s) => (
            <tr key={s.id}>
              <td style={{ fontSize: 13 }}>{fmt(s.date)} · P{s.periodNumber}</td>
              <td><strong>{s.className}</strong> {s.subject}</td>
              {showOriginal && <td>{s.originalTeacherName}</td>}
              <td>{s.substituteName}</td>
              <td><Pill tone={s.status === "confirmed" ? "success" : "warning"}>{s.status === "confirmed" ? "Confirmed" : "Awaiting reply"}</Pill></td>
            </tr>
          ))}
        </tbody>
      </table>
    </TableWrap>
  );
}
