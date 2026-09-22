// src/components/health/HealthModule.jsx
// ─────────────────────────────────────────────────────────────────────────────
// Health profiles and the sick bay, for the whole school.
//
//   mode="lead"   the head teacher: edit every learner's profile, read the
//                 visit log, log visits.
//   mode="staff"  a class teacher: see who in the school has an allergy or a
//                 condition (read-only), and log a learner who has fallen ill.
//                 They cannot read the visit log back — see the sickbay_visits
//                 rules — so the log is not shown to them.
//
// Logging a visit tells the guardian on WhatsApp straight away, and if the
// learner is being sent home it is marked urgent and the head teacher is told
// as well.
// ─────────────────────────────────────────────────────────────────────────────
import { useState, useMemo, useCallback } from "react";
import { db } from "../../firebase";
import { collection, query, where, getDocs } from "firebase/firestore";
import { HeartPulse, Pencil, Plus, Search, AlertTriangle, RefreshCw } from "lucide-react";
import {
  fetchProfiles, saveProfile, fetchVisits, logVisit, needsAttention, BLOOD_GROUPS,
} from "../../services/health";
import { notifySickbayVisit } from "../../services/notificationHooks";
import useLoader from "../../hooks/useLoader";
import {
  Modal, Btn, IconBtn, Input, Select, Textarea, Pill, EmptyState, StatGrid, StatCard,
  ModuleHeader, Notice, LoadingState, TableWrap, FilterBar,
} from "../ui/ModuleKit";
import "../../pages/headteacher/modules/staff-management.css";

const when = (ms) => (ms ? new Date(ms).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—");

export default function HealthModule({ schoolCode, currentUser, mode = "lead" }) {
  const lead = mode === "lead";
  const [tab, setTab] = useState("profiles");
  const [students, setStudents] = useState(null);
  const [profiles, setProfiles] = useState(new Map());
  const [visits, setVisits] = useState([]);
  const [search, setSearch] = useState("");
  const [onlyFlagged, setOnlyFlagged] = useState(false);
  const [editing, setEditing] = useState(null);
  const [visitFor, setVisitFor] = useState(null);      // true, or a student
  const [notice, setNotice] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!schoolCode) return;
    try {
      const [s, p, v] = await Promise.all([
        getDocs(query(collection(db, "students"), where("schoolCode", "==", schoolCode))),
        fetchProfiles(schoolCode),
        lead ? fetchVisits(schoolCode) : Promise.resolve([]),
      ]);
      setStudents(s.docs.map((d) => ({ id: d.id, ...d.data() })).filter((x) => x.status !== "withdrawn")
        .sort((a, b) => (a.fullName || "").localeCompare(b.fullName || "")));
      setProfiles(p);
      setVisits(v);
    } catch (err) {
      console.error("[health] load failed:", err);
      setNotice({ tone: "danger", text: `Could not load health records: ${err.message}` });
      setStudents([]);
    }
  }, [schoolCode, lead]);

  useLoader(load);

  const flagged = useMemo(() => (students || []).filter((s) => needsAttention(profiles.get(s.id))), [students, profiles]);
  const shown = (students || []).filter((s) => {
    const q = search.trim().toLowerCase();
    if (q && !`${s.fullName} ${s.className}`.toLowerCase().includes(q)) return false;
    return !onlyFlagged || needsAttention(profiles.get(s.id));
  });

  const run = async (fn, ok) => {
    setBusy(true);
    try { await fn(); if (ok) setNotice({ tone: "success", text: ok }); await load(); }
    catch (err) { setNotice({ tone: "danger", text: err.message || "That didn't work." }); }
    finally { setBusy(false); }
  };

  if (students === null) return <LoadingState label="Loading health records…" />;

  const thisWeek = visits.filter((v) => Date.now() - (v.seenAtMs || 0) < 7 * 86_400_000).length;

  return (
    <div>
      <ModuleHeader
        title="Health"
        subtitle={lead ? "Allergies and conditions, and the sick bay" : "Who to look out for, and a way to log a learner who is ill"}
        actions={
          <>
            <Btn variant="secondary" icon={<RefreshCw size={15} />} onClick={load}>Refresh</Btn>
            <Btn variant="accent" icon={<Plus size={15} />} onClick={() => setVisitFor(true)}>Log a sick learner</Btn>
          </>
        }
      />
      {notice && <Notice tone={notice.tone} onDismiss={() => setNotice(null)}>{notice.text}</Notice>}

      <StatGrid>
        <StatCard label="Learners" value={students.length} />
        <StatCard label="With allergies / conditions" value={flagged.length} tone={flagged.length ? "warning" : undefined} />
        {lead && <StatCard label="Sick bay visits" value={thisWeek} sub="Last 7 days" />}
      </StatGrid>

      {lead && (
        <div className="mb-4">
          <FilterBar value={tab} onChange={setTab} options={[{ id: "profiles", label: "Health profiles" }, { id: "visits", label: "Sick bay log", count: visits.length }]} />
        </div>
      )}

      {(tab === "profiles" || !lead) && (
        <>
          <div className="flex items-center gap-3 mb-4" style={{ flexWrap: "wrap" }}>
            <div className="search-wrapper" style={{ maxWidth: 280 }}>
              <Search size={15} className="search-icon" />
              <input className="search-input" placeholder="Search a learner or class…" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
              <input type="checkbox" checked={onlyFlagged} onChange={(e) => setOnlyFlagged(e.target.checked)} style={{ width: 16, height: 16 }} />
              Only those with allergies or conditions
            </label>
          </div>

          {shown.length === 0 ? (
            <EmptyState icon={<HeartPulse size={28} />} title="No learners match" sub={onlyFlagged ? "No one has an allergy or condition recorded yet." : "Try another search."} />
          ) : (
            <TableWrap>
              <table className="data-table">
                <thead><tr><th>Learner</th><th>Allergies</th><th>Conditions</th><th>Medication</th><th>Emergency contact</th>{lead && <th />}</tr></thead>
                <tbody>
                  {shown.map((s) => {
                    const p = profiles.get(s.id);
                    return (
                      <tr key={s.id}>
                        <td>
                          <strong>{s.fullName}</strong> {needsAttention(p) && <AlertTriangle size={14} style={{ color: "var(--warning-light)", verticalAlign: "-2px" }} aria-label="Needs attention" />}
                          <div className="text-muted" style={{ fontSize: 12 }}>{s.className}</div>
                        </td>
                        <td style={{ fontSize: 13 }}>{p?.allergies || <span className="text-muted">—</span>}</td>
                        <td style={{ fontSize: 13 }}>{p?.conditions || <span className="text-muted">—</span>}</td>
                        <td style={{ fontSize: 13 }}>{p?.medication || <span className="text-muted">—</span>}</td>
                        <td style={{ fontSize: 13 }}>{p?.emergencyName ? `${p.emergencyName} ${p.emergencyPhone || ""}` : (s.guardianPhone || "—")}</td>
                        {lead && <td style={{ textAlign: "right" }}><IconBtn icon={<Pencil size={15} />} title="Edit health profile" onClick={() => setEditing(s)} /></td>}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </TableWrap>
          )}
        </>
      )}

      {lead && tab === "visits" && (
        visits.length === 0 ? (
          <EmptyState icon={<HeartPulse size={28} />} title="No sick bay visits yet" sub="Visits logged here, and from Boarding, appear in this log." />
        ) : (
          <TableWrap>
            <table className="data-table">
              <thead><tr><th>When</th><th>Learner</th><th>Complaint</th><th>Treatment</th><th>Outcome</th></tr></thead>
              <tbody>
                {visits.map((v) => (
                  <tr key={v.id}>
                    <td style={{ fontSize: 13, whiteSpace: "nowrap" }}>{when(v.seenAtMs)}</td>
                    <td><strong>{v.studentName}</strong><div className="text-muted" style={{ fontSize: 12 }}>{v.className}</div></td>
                    <td style={{ fontSize: 13 }}>{v.complaint}{v.temperature ? ` · ${v.temperature}°C` : ""}</td>
                    <td style={{ fontSize: 13 }}>{v.treatment || "—"}</td>
                    <td>{v.referredOut ? <Pill tone="danger">Referred out</Pill> : v.sentHome ? <Pill tone="warning">Sent home</Pill> : <Pill tone="success">Returned to class</Pill>}<div className="text-muted" style={{ fontSize: 11 }}>{v.seenByName}</div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )
      )}

      {editing && (
        <ProfileDialog
          student={editing}
          profile={profiles.get(editing.id)}
          busy={busy}
          onClose={() => setEditing(null)}
          onSave={(data) => run(async () => { await saveProfile({ schoolCode, student: editing, data, actor: currentUser }); setEditing(null); }, `${editing.fullName}'s profile saved.`)}
        />
      )}

      {visitFor && (
        <VisitDialog
          students={students}
          profiles={profiles}
          busy={busy}
          onClose={() => setVisitFor(null)}
          onSave={(student, v) => run(async () => {
            await logVisit({ schoolCode, student, ...v, actor: currentUser });
            await notifySickbayVisit({ schoolCode, student, complaint: v.complaint, action: v.treatment, sentHome: v.sentHome || v.referredOut, actor: currentUser });
            setVisitFor(null);
          }, "Logged. The guardian has been told on WhatsApp.")}
        />
      )}
    </div>
  );
}

function ProfileDialog({ student, profile, onClose, onSave, busy }) {
  const [f, setF] = useState({
    allergies: "", conditions: "", medication: "", bloodGroup: "Unknown", emergencyName: "", emergencyPhone: "", doctor: "", notes: "", ...profile,
  });
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  return (
    <Modal wide title="Health profile" subtitle={`${student.fullName} · ${student.className}`} onClose={onClose}
      footer={<><Btn variant="secondary" onClick={onClose}>Cancel</Btn><Btn variant="accent" loading={busy} onClick={() => onSave(f)}>Save</Btn></>}>
      <div className="grid grid-cols-2 gap-4">
        <Textarea label="Allergies" rows={2} value={f.allergies} onChange={set("allergies")} placeholder="e.g. Penicillin, groundnuts" />
        <Textarea label="Medical conditions" rows={2} value={f.conditions} onChange={set("conditions")} placeholder="e.g. Asthma, sickle cell" />
        <Textarea label="Regular medication" rows={2} value={f.medication} onChange={set("medication")} />
        <Select label="Blood group" value={f.bloodGroup} onChange={set("bloodGroup")}>{BLOOD_GROUPS.map((b) => <option key={b}>{b}</option>)}</Select>
        <Input label="Emergency contact" value={f.emergencyName} onChange={set("emergencyName")} placeholder="If not the guardian" />
        <Input label="Emergency phone" type="tel" value={f.emergencyPhone} onChange={set("emergencyPhone")} />
        <Input label="Doctor / clinic" value={f.doctor} onChange={set("doctor")} />
      </div>
      <Textarea label="Other notes" rows={2} value={f.notes} onChange={set("notes")} />
    </Modal>
  );
}

function VisitDialog({ students, profiles, onClose, onSave, busy }) {
  const [term, setTerm] = useState("");
  const [picked, setPicked] = useState(null);
  const [f, setF] = useState({ complaint: "", treatment: "", temperature: "", sentHome: false, referredOut: false });
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));
  const t = term.trim().toLowerCase();
  const matches = t ? students.filter((s) => `${s.fullName} ${s.className}`.toLowerCase().includes(t)).slice(0, 6) : [];
  const profile = picked && profiles.get(picked.id);

  return (
    <Modal title="Log a sick learner" onClose={onClose}
      footer={<><Btn variant="secondary" onClick={onClose}>Cancel</Btn><Btn variant="accent" loading={busy} disabled={!picked || !f.complaint.trim()} onClick={() => onSave(picked, f)}>Save &amp; tell guardian</Btn></>}>
      <Input label="Find the learner" value={term} onChange={(e) => { setTerm(e.target.value); setPicked(null); }} placeholder="Type a name…" autoFocus />
      {picked ? (
        <p style={{ margin: "0 0 12px", fontSize: 14 }}><strong>{picked.fullName}</strong> · {picked.className}</p>
      ) : matches.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 12 }}>
          {matches.map((m) => (
            <button key={m.id} type="button" className="btn btn--secondary btn--sm" style={{ justifyContent: "flex-start" }} onClick={() => setPicked(m)}>
              {m.fullName} · {m.className}{needsAttention(profiles.get(m.id)) ? "  ⚠" : ""}
            </button>
          ))}
        </div>
      )}
      {needsAttention(profile) && (
        <div className="alert alert--warning" style={{ flexDirection: "column", alignItems: "flex-start", gap: 2, marginBottom: 12 }}>
          <strong>Health alert for {picked.fullName}</strong>
          {profile.allergies && <span style={{ fontSize: 12.5 }}>Allergies: {profile.allergies}</span>}
          {profile.conditions && <span style={{ fontSize: 12.5 }}>Conditions: {profile.conditions}</span>}
          {profile.medication && <span style={{ fontSize: 12.5 }}>Medication: {profile.medication}</span>}
        </div>
      )}
      <Textarea label="What's wrong" required rows={2} value={f.complaint} onChange={set("complaint")} />
      <div className="grid grid-cols-2 gap-4">
        <Input label="Treatment given" value={f.treatment} onChange={set("treatment")} />
        <Input label="Temperature (°C)" type="number" step="0.1" value={f.temperature} onChange={set("temperature")} />
      </div>
      <label style={{ display: "flex", gap: 8, alignItems: "center", margin: "6px 0", fontSize: 13.5 }}>
        <input type="checkbox" checked={f.sentHome} onChange={set("sentHome")} style={{ width: 16, height: 16 }} /> Being sent home (the guardian is told to collect them, and marked urgent)
      </label>
      <label style={{ display: "flex", gap: 8, alignItems: "center", margin: "6px 0", fontSize: 13.5 }}>
        <input type="checkbox" checked={f.referredOut} onChange={set("referredOut")} style={{ width: 16, height: 16 }} /> Referred to a clinic or hospital
      </label>
    </Modal>
  );
}
