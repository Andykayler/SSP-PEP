// src/pages/headteacher/modules/AtRiskModule.jsx
// ─────────────────────────────────────────────────────────────────────────────
// Learners the school is at risk of losing, worst first — with the reasons.
//
// It reads four things the head teacher already has but in four different
// screens (registers, marks, discipline, fees) and puts them side by side, so
// the child who is absent AND failing AND owing shows up before the parent
// arrives to withdraw them. Every row says which signals put the learner there;
// see services/atRiskCore.js for the thresholds (which are tested).
//
// Acting on a row is one press: tell the guardian on WhatsApp, or tell the
// class teacher. What goes to the guardian never includes fee details.
import { useState, useMemo, useCallback } from "react";
import { db } from "../../../firebase";
import { collection, query, where, getDocs } from "firebase/firestore";
import { HeartPulse, MessageCircle, UserCheck, RefreshCw, Search } from "lucide-react";
import { rankAtRisk, LEVELS, SIGNAL_LABEL } from "../../../services/atRiskCore";
import { buildArrears } from "../../../services/feeAllocationCore";
import { fetchMarkSheets, mergeMarks } from "../../../services/examReadiness";
import { fetchSchoolSettings } from "../../../services/academicTerm";
import { notifyAtRiskGuardian } from "../../../services/notificationHooks";
import { notifyUsers } from "../../../services/notifications";
import useLoader from "../../../hooks/useLoader";
import {
  Btn, Pill, EmptyState, StatGrid, StatCard, ModuleHeader, Notice, LoadingState, TableWrap, FilterBar,
} from "../../../components/ui/ModuleKit";
import "./staff-management.css";
import { isDeactivated } from "../../../services/staffAccountCore";

const today = () => new Date().toISOString().slice(0, 10);
const SIGNAL_TONE = { high: "danger", medium: "warning" };

export default function AtRiskModule({ schoolCode, currentUser }) {
  const [data, setData] = useState(null);
  const [term, setTerm] = useState("");
  const [level, setLevel] = useState("all");
  const [cls, setCls] = useState("all");
  const [search, setSearch] = useState("");
  const [notice, setNotice] = useState(null);
  const [busy, setBusy] = useState("");

  const load = useCallback(async () => {
    if (!schoolCode) return;
    try {
      const settings = (await fetchSchoolSettings(schoolCode)) || {};
      const currentTerm = settings.currentTerm || "";
      setTerm(currentTerm);

      const q = (name) => getDocs(query(collection(db, name), where("schoolCode", "==", schoolCode)));
      const [stu, att, dis, fee, pay, sheets, users] = await Promise.all([
        q("students"), q("attendance"), q("discipline_cases"), q("fee_assignments"), q("payments"),
        currentTerm ? fetchMarkSheets(schoolCode, currentTerm) : Promise.resolve([]),
        getDocs(query(collection(db, "users"), where("schoolCode", "==", schoolCode), where("role", "in", ["head_teacher", "class_teacher"]))),
      ]);
      const students = stu.docs.map((d) => ({ id: d.id, ...d.data() }));
      const payments = pay.docs.map((d) => ({ id: d.id, ...d.data() })).filter((p) => p.status === "verified");   // a typed-in claim is not money

      setData({
        students,
        teachers: users.docs.map((d) => ({ id: d.id, ...d.data() })).filter((t) => !isDeactivated(t)),
        attendance: att.docs.map((d) => d.data()),
        discipline: dis.docs.map((d) => d.data()),
        marks: mergeMarks(sheets),
        arrears: currentTerm
          ? buildArrears({ students, charges: fee.docs.map((d) => ({ id: d.id, ...d.data() })), payments, currentTerm })
          : [],
      });
    } catch (err) {
      console.error("[at-risk] load failed:", err);
      setNotice({ tone: "danger", text: `Could not load the data: ${err.message}` });
      setData({ students: [], teachers: [], attendance: [], discipline: [], marks: new Map(), arrears: [] });
    }
  }, [schoolCode]);

  useLoader(load);

  const ranked = useMemo(() => (data
    ? rankAtRisk({ students: data.students, attendance: data.attendance, marks: data.marks, arrears: data.arrears, discipline: data.discipline, today: today() })
    : []), [data]);

  const classes = useMemo(() => [...new Set(ranked.map((r) => r.student.className).filter(Boolean))].sort(), [ranked]);
  const shown = ranked.filter((r) => {
    if (level !== "all" && r.level !== level) return false;
    if (cls !== "all" && r.student.className !== cls) return false;
    const q = search.trim().toLowerCase();
    return !q || `${r.student.fullName} ${r.student.className}`.toLowerCase().includes(q);
  });

  const say = (tone, text) => setNotice({ tone, text });

  const tellGuardian = async (row) => {
    if (!row.student.guardianPhone) return say("warning", `No guardian phone number for ${row.student.fullName}.`);
    if (!row.guardianReasons) return say("warning", "Nothing here is suitable to send to a guardian. Speak to the family directly.");
    if (!window.confirm(`Send ${row.student.fullName}'s guardian this on WhatsApp?\n\n"${row.guardianReasons} Please contact the school so we can help."`)) return;
    setBusy(row.student.id);
    await notifyAtRiskGuardian({ schoolCode, student: row.student, reasons: row.guardianReasons, actor: currentUser });
    setBusy("");
    say("success", `Guardian of ${row.student.fullName} has been messaged.`);
  };

  const tellTeacher = async (row) => {
    const teachers = data.teachers.filter((t) => (t.assignedClasses || []).includes(row.student.className));
    if (teachers.length === 0) return say("warning", `No teacher is assigned to ${row.student.className}.`);
    setBusy(row.student.id);
    await notifyUsers({
      userIds: teachers.map((t) => t.id),
      schoolCode,
      title: `Please look out for ${row.student.fullName}`,
      body: row.signals.map((s) => s.text).join(". ") + ".",
      category: "risk", priority: "high",
      actorId: currentUser?.id, actorName: currentUser?.name, tab: "students",
    });
    setBusy("");
    say("success", `${teachers.map((t) => t.name).join(", ")} ${teachers.length === 1 ? "has" : "have"} been told.`);
  };

  if (data === null) return <LoadingState label="Looking across attendance, results, discipline and fees…" />;

  const high = ranked.filter((r) => r.level === "high").length;
  return (
    <div>
      <ModuleHeader
        title="At-Risk Learners"
        subtitle={`Attendance, results, discipline and fees, side by side${term ? ` · ${term}` : ""}`}
        actions={<Btn variant="secondary" icon={<RefreshCw size={15} />} onClick={() => { setData(null); load(); }}>Refresh</Btn>}
      />
      {notice && <Notice tone={notice.tone} onDismiss={() => setNotice(null)}>{notice.text}</Notice>}

      <StatGrid>
        <StatCard label="High risk" value={high} tone={high ? "danger" : undefined} />
        <StatCard label="Worth watching" value={ranked.length - high} tone={ranked.length - high ? "warning" : undefined} />
        <StatCard label="Learners checked" value={data.students.length} />
      </StatGrid>

      {!term && <Notice tone="warning">No current term is set, so marks and fees are left out. Set the term in School Settings for the full picture.</Notice>}

      <div className="flex items-center gap-3 mb-4" style={{ flexWrap: "wrap" }}>
        <FilterBar value={level} onChange={setLevel} options={[
          { id: "all", label: "All", count: ranked.length },
          { id: "high", label: "High risk", count: high },
          { id: "watch", label: "Watch", count: ranked.length - high },
        ]} />
        <select className="search-input" style={{ maxWidth: 160 }} value={cls} onChange={(e) => setCls(e.target.value)}>
          <option value="all">All classes</option>{classes.map((c) => <option key={c}>{c}</option>)}
        </select>
        <div className="search-wrapper" style={{ maxWidth: 240 }}>
          <Search size={15} className="search-icon" />
          <input className="search-input" placeholder="Search a learner…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>

      {shown.length === 0 ? (
        <EmptyState
          icon={<HeartPulse size={28} />}
          title={ranked.length === 0 ? "Nobody is flagged right now" : "No learners match"}
          sub={ranked.length === 0 ? "That means no learner has enough warning signs at once. It updates as registers, marks and cases are entered." : "Try another filter."}
        />
      ) : (
        <TableWrap>
          <table className="data-table">
            <thead><tr><th>Learner</th><th>Level</th><th>Why</th><th style={{ textAlign: "right" }}>Act</th></tr></thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.student.id}>
                  <td><strong>{r.student.fullName}</strong><div className="text-muted" style={{ fontSize: 12 }}>{r.student.className}</div></td>
                  <td><Pill tone={LEVELS[r.level].tone}>{LEVELS[r.level].label}</Pill></td>
                  <td>
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      {r.signals.map((s) => (
                        <span key={s.kind} style={{ fontSize: 12.5, display: "flex", gap: 6, alignItems: "baseline" }}>
                          <Pill tone={SIGNAL_TONE[s.level]}>{SIGNAL_LABEL[s.kind]}</Pill> {s.text}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                    <Btn size="sm" variant="secondary" icon={<MessageCircle size={14} />} disabled={busy === r.student.id} onClick={() => tellGuardian(r)}>Guardian</Btn>{" "}
                    <Btn size="sm" variant="secondary" icon={<UserCheck size={14} />} disabled={busy === r.student.id} onClick={() => tellTeacher(r)}>Teacher</Btn>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      )}
    </div>
  );
}
