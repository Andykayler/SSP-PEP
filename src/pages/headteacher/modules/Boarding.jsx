// src/pages/headteacher/modules/Boarding.jsx
// Where boarders sleep, who is off site, and who is in the sick bay.
//
// Only reachable when the school's type says it boards. The sign-out tab
// carries the weight: a boarder leaving the grounds notifies their guardian
// immediately, which is the one thing a paper book at the gate can never do.
import { useState, useEffect, useCallback, useMemo } from "react";
import { db } from "../../../firebase";
import { collection, query, where, getDocs } from "firebase/firestore";
import {
  BedDouble, Plus, Pencil, Trash2, RefreshCw, LogOut, LogIn, Stethoscope,
  Search, AlertTriangle,
} from "lucide-react";
import {
  fetchDormitories, saveDormitory, deleteDormitory, fetchAllocations, allocate,
  removeAllocation, occupancy, fetchSignouts, signOut, signIn, stillOut,
  overdue, fetchSickbay, logSickbay,
} from "../../../services/boarding";
import { subscribeSchoolSettings } from "../../../services/academicTerm";
import {
  Modal, Btn, IconBtn, Input, Textarea, Select, Pill, EmptyState, StatGrid,
  StatCard, ModuleHeader, Notice, LoadingState, TableWrap,
} from "../../../components/ui/ModuleKit";
import "./staff-management.css";
import useLoader from "../../../hooks/useLoader";

const BLANK_DORM = { name: "", gender: "mixed", capacity: "", matronName: "", matronPhone: "", notes: "" };

function when(ts) {
  const d = ts?.toDate?.();
  if (!d) return "—";
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" })
    + " " + d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function Boarding({ schoolCode, currentUser }) {
  const [tab, setTab] = useState("signouts");
  const [dorms, setDorms] = useState(null);
  const [allocations, setAllocations] = useState([]);
  const [signouts, setSignouts] = useState([]);
  const [sickbay, setSickbay] = useState([]);
  const [students, setStudents] = useState([]);
  const [term, setTerm] = useState("");
  const [search, setSearch] = useState("");
  const [dormForm, setDormForm] = useState(null);
  const [allocForm, setAllocForm] = useState(null);
  const [outForm, setOutForm] = useState(null);
  const [sickForm, setSickForm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);

  const load = useCallback(async () => {
    if (!schoolCode) return;
    try {
      const [d, a, so, sb, snap] = await Promise.all([
        fetchDormitories(schoolCode),
        fetchAllocations(schoolCode, term),
        fetchSignouts(schoolCode),
        fetchSickbay(schoolCode),
        getDocs(query(collection(db, "students"), where("schoolCode", "==", schoolCode))),
      ]);
      setDorms(d); setAllocations(a); setSignouts(so); setSickbay(sb);
      setStudents(snap.docs.map((x) => ({ id: x.id, ...x.data() })));
    } catch (err) {
      console.error("[boarding] load failed:", err);
      setNotice({ tone: "danger", text: "Could not load boarding records: " + err.message });
      setDorms([]);
    }
  }, [schoolCode, term]);

  useLoader(load);

  useEffect(() => {
    if (!schoolCode) return;
    return subscribeSchoolSettings(schoolCode, (s) => setTerm(s?.currentTerm || ""));
  }, [schoolCode]);


  const withOccupancy = useMemo(() => occupancy(dorms || [], allocations), [dorms, allocations]);
  const out = useMemo(() => stillOut(signouts), [signouts]);
  const late = useMemo(() => overdue(signouts), [signouts]);

  const unallocated = useMemo(() => {
    const placed = new Set(allocations.map((a) => a.studentId));
    return students.filter((s) => s.boarder && !placed.has(s.id));
  }, [students, allocations]);

  const filteredStudents = useMemo(() => {
    const q = search.trim().toLowerCase();
    return students
      .filter((s) => !q || s.fullName?.toLowerCase().includes(q))
      .sort((a, b) => (a.fullName || "").localeCompare(b.fullName || ""));
  }, [students, search]);

  // ── Actions ────────────────────────────────────────────────────────────────
  const run = async (fn, successText) => {
    setBusy(true);
    const res = await fn();
    setBusy(false);
    setNotice(res.ok ? { tone: "success", text: successText } : { tone: "danger", text: res.error });
    if (res.ok) load();
    return res.ok;
  };

  if (dorms === null) return <LoadingState label="Loading boarding records…" />;

  return (
    <div className="space-y-6">
      <ModuleHeader
        title="Boarding"
        subtitle={`Dormitories, sign-out register and sick bay${term ? ` · ${term}` : ""}`}
        actions={[<IconBtn key="r" icon={<RefreshCw size={15} />} title="Refresh" onClick={load} />]}
      />

      {notice && <Notice tone={notice.tone} onDismiss={() => setNotice(null)}>{notice.text}</Notice>}

      {late.length > 0 && (
        <Notice tone="danger">
          <AlertTriangle size={14} style={{ verticalAlign: "-2px", marginRight: 6 }} />
          {late.length} boarder{late.length === 1 ? " is" : "s are"} past the time they were due back:
          {" "}{late.map((s) => s.studentName).join(", ")}.
        </Notice>
      )}

      <StatGrid>
        <StatCard label="Beds in use" value={allocations.length}
          sub={`of ${withOccupancy.reduce((s, d) => s + (d.capacity || 0), 0)} across ${dorms.length} dormitor${dorms.length === 1 ? "y" : "ies"}`} />
        <StatCard label="Off site now" value={out.length} tone={out.length ? "warning" : "success"}
          sub="Signed out and not back" />
        <StatCard label="Overdue" value={late.length} tone={late.length ? "danger" : "success"}
          sub="Past their expected return" />
        <StatCard label="Awaiting a bed" value={unallocated.length}
          tone={unallocated.length ? "warning" : "success"} sub="Boarders with no allocation" />
      </StatGrid>

      <div className="tab-bar">
        {[
          ["signouts", `Sign-out register (${out.length} out)`],
          ["allocations", `Allocations (${allocations.length})`],
          ["dorms", `Dormitories (${dorms.length})`],
          ["sickbay", `Sick bay (${sickbay.length})`],
        ].map(([id, label]) => (
          <button key={id} type="button" className={`tab ${tab === id ? "tab--active" : ""}`}
            onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>

      {/* ── Sign-out register ──────────────────────────────────────────────── */}
      {tab === "signouts" && (
        <>
          <div className="flex justify-between items-center" style={{ flexWrap: "wrap", gap: 12 }}>
            <p className="text-muted" style={{ fontSize: 13, margin: 0 }}>
              Signing a boarder out notifies their guardian straight away.
            </p>
            <Btn variant="accent" icon={<LogOut size={15} />}
              onClick={() => setOutForm({ studentId: "", reason: "", expectedBack: "", authorisedBy: currentUser?.name || "" })}>
              Sign a boarder out
            </Btn>
          </div>
          {signouts.length === 0 ? (
            <EmptyState icon={<LogOut size={28} />} title="Nobody has been signed out"
              sub="Every departure from the grounds is recorded here and the family told." />
          ) : (
            <TableWrap>
              <table className="data-table">
                <thead>
                  <tr><th>Student</th><th>Class</th><th>Reason</th><th>Out</th>
                    <th>Expected back</th><th>Status</th><th style={{ textAlign: "right" }} /></tr>
                </thead>
                <tbody>
                  {signouts.map((s) => {
                    const isOut = !s.returnedAt;
                    const isLate = isOut && s.expectedBack
                      && s.expectedBack < new Date().toISOString().slice(0, 16);
                    return (
                      <tr key={s.id}>
                        <td><strong>{s.studentName}</strong></td>
                        <td className="text-muted">{s.className}</td>
                        <td className="text-muted">{s.reason}</td>
                        <td className="text-muted">{when(s.outAt)}</td>
                        <td className="text-muted">{s.expectedBack || "—"}</td>
                        <td>
                          <Pill tone={isLate ? "danger" : isOut ? "warning" : "success"}>
                            {isLate ? "Overdue" : isOut ? "Off site" : "Returned"}
                          </Pill>
                        </td>
                        <td style={{ textAlign: "right" }}>
                          {isOut && (
                            <Btn size="sm" variant="success" icon={<LogIn size={13} />} loading={busy}
                              onClick={() => run(() => signIn({ signoutId: s.id }), `${s.studentName} signed back in.`)}>
                              Sign in
                            </Btn>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </TableWrap>
          )}
        </>
      )}

      {/* ── Allocations ────────────────────────────────────────────────────── */}
      {tab === "allocations" && (
        <>
          <div className="flex justify-between items-center" style={{ flexWrap: "wrap", gap: 12 }}>
            <p className="text-muted" style={{ fontSize: 13, margin: 0 }}>
              One bed per student per term. Re-allocating moves them rather than adding a bed.
            </p>
            <Btn variant="accent" icon={<Plus size={15} />} disabled={dorms.length === 0}
              onClick={() => setAllocForm({ studentId: "", dormitoryId: "", bedNumber: "" })}>
              Allocate a bed
            </Btn>
          </div>
          {allocations.length === 0 ? (
            <EmptyState icon={<BedDouble size={28} />} title="No beds allocated this term"
              sub={dorms.length === 0 ? "Add a dormitory first." : "Place boarders in their dormitories."} />
          ) : (
            <TableWrap>
              <table className="data-table">
                <thead>
                  <tr><th>Student</th><th>Class</th><th>Dormitory</th><th>Bed</th>
                    <th style={{ textAlign: "right" }} /></tr>
                </thead>
                <tbody>
                  {allocations
                    .slice()
                    .sort((a, b) => (a.dormitoryName || "").localeCompare(b.dormitoryName || ""))
                    .map((a) => (
                      <tr key={a.id}>
                        <td><strong>{a.studentName}</strong></td>
                        <td className="text-muted">{a.className}</td>
                        <td>{a.dormitoryName}</td>
                        <td className="text-muted">{a.bedNumber || "—"}</td>
                        <td style={{ textAlign: "right" }}>
                          <IconBtn icon={<Trash2 size={15} />} title="Remove allocation" danger
                            onClick={() => run(() => removeAllocation(a.id), "Allocation removed.")} />
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </TableWrap>
          )}
        </>
      )}

      {/* ── Dormitories ────────────────────────────────────────────────────── */}
      {tab === "dorms" && (
        <>
          <div className="flex justify-end">
            <Btn variant="accent" icon={<Plus size={15} />} onClick={() => setDormForm({ ...BLANK_DORM })}>
              Add Dormitory
            </Btn>
          </div>
          {dorms.length === 0 ? (
            <EmptyState icon={<BedDouble size={28} />} title="No dormitories yet"
              sub="Add each dormitory and how many beds it holds."
              action={<Btn variant="accent" icon={<Plus size={15} />}
                onClick={() => setDormForm({ ...BLANK_DORM })}>Add Dormitory</Btn>} />
          ) : (
            <div className="space-y-2">
              {withOccupancy.map((d) => (
                <div key={d.id} className="card p-5 flex items-center justify-between"
                  style={{ flexWrap: "wrap", gap: 12 }}>
                  <div>
                    <div className="flex items-center gap-2 mb-1" style={{ flexWrap: "wrap" }}>
                      <strong>{d.name}</strong>
                      <span className="tag tag--neutral">{d.gender}</span>
                      <Pill tone={d.over ? "danger" : d.percent >= 90 ? "warning" : "success"}>
                        {d.used} / {d.capacity} beds
                      </Pill>
                    </div>
                    <div className="text-muted" style={{ fontSize: 12 }}>
                      {d.matronName ? `Matron: ${d.matronName}` : "No matron recorded"}
                      {d.matronPhone ? ` · ${d.matronPhone}` : ""}
                      {d.over && " · over capacity"}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <IconBtn icon={<Pencil size={15} />} title="Edit" onClick={() => setDormForm({ ...d })} />
                    <IconBtn icon={<Trash2 size={15} />} title="Remove" danger
                      onClick={() => {
                        if (d.used > 0) {
                          setNotice({ tone: "warning", text: `${d.name} still has ${d.used} student${d.used === 1 ? "" : "s"} in it.` });
                          return;
                        }
                        if (window.confirm(`Remove ${d.name}?`)) run(() => deleteDormitory(d.id), "Dormitory removed.");
                      }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* ── Sick bay ───────────────────────────────────────────────────────── */}
      {tab === "sickbay" && (
        <>
          <div className="flex justify-between items-center" style={{ flexWrap: "wrap", gap: 12 }}>
            <p className="text-muted" style={{ fontSize: 13, margin: 0 }}>
              Every visit notifies the guardian. A referral out is marked urgent.
            </p>
            <Btn variant="accent" icon={<Stethoscope size={15} />}
              onClick={() => setSickForm({ studentId: "", complaint: "", treatment: "", referredOut: false })}>
              Log a visit
            </Btn>
          </div>
          {sickbay.length === 0 ? (
            <EmptyState icon={<Stethoscope size={28} />} title="No sick bay visits recorded" />
          ) : (
            <TableWrap>
              <table className="data-table">
                <thead>
                  <tr><th>Student</th><th>Class</th><th>Complaint</th><th>Treatment</th>
                    <th>Seen</th><th>By</th></tr>
                </thead>
                <tbody>
                  {sickbay.map((v) => (
                    <tr key={v.id}>
                      <td>
                        <strong>{v.studentName}</strong>
                        {v.referredOut && <div><Pill tone="danger">Referred out</Pill></div>}
                      </td>
                      <td className="text-muted">{v.className}</td>
                      <td>{v.complaint}</td>
                      <td className="text-muted">{v.treatment || "—"}</td>
                      <td className="text-muted">{when(v.seenAt)}</td>
                      <td className="text-muted">{v.seenByName || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          )}
        </>
      )}

      {/* ── Forms ──────────────────────────────────────────────────────────── */}
      {dormForm && (
        <Modal title={dormForm.id ? "Edit dormitory" : "Add a dormitory"}
          onClose={() => setDormForm(null)}
          footer={(
            <>
              <Btn variant="secondary" onClick={() => setDormForm(null)}>Cancel</Btn>
              <Btn variant="accent" loading={busy} onClick={async () => {
                if (await run(() => saveDormitory({ schoolCode, dormitory: dormForm, actor: currentUser }), "Dormitory saved")) {
                  setDormForm(null);
                }
              }}>Save</Btn>
            </>
          )}>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Input label="Name" required value={dormForm.name} placeholder="Chilembwe House"
                onChange={(e) => setDormForm((p) => ({ ...p, name: e.target.value }))} />
              <Select label="For" value={dormForm.gender}
                onChange={(e) => setDormForm((p) => ({ ...p, gender: e.target.value }))}>
                <option value="mixed">Mixed</option>
                <option value="female">Girls</option>
                <option value="male">Boys</option>
              </Select>
            </div>
            <Input label="Beds" required type="number" min="1" value={dormForm.capacity}
              onChange={(e) => setDormForm((p) => ({ ...p, capacity: e.target.value }))} />
            <div className="grid grid-cols-2 gap-4">
              <Input label="Matron or patron" value={dormForm.matronName}
                onChange={(e) => setDormForm((p) => ({ ...p, matronName: e.target.value }))} />
              <Input label="Their phone" value={dormForm.matronPhone}
                onChange={(e) => setDormForm((p) => ({ ...p, matronPhone: e.target.value }))} />
            </div>
          </div>
        </Modal>
      )}

      {allocForm && (
        <Modal title="Allocate a bed" onClose={() => setAllocForm(null)}
          footer={(
            <>
              <Btn variant="secondary" onClick={() => setAllocForm(null)}>Cancel</Btn>
              <Btn variant="accent" loading={busy} onClick={async () => {
                const student = students.find((s) => s.id === allocForm.studentId);
                const dormitory = dorms.find((d) => d.id === allocForm.dormitoryId);
                if (await run(() => allocate({
                  schoolCode, student, dormitory, bedNumber: allocForm.bedNumber, term, actor: currentUser,
                }), "Bed allocated.")) setAllocForm(null);
              }}>Allocate</Btn>
            </>
          )}>
          <div className="space-y-4">
            <div className="search-wrapper">
              <Search size={15} className="search-icon" />
              <input className="search-input" placeholder="Filter students…"
                value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <Select label="Student" required value={allocForm.studentId}
              onChange={(e) => setAllocForm((p) => ({ ...p, studentId: e.target.value }))}>
              <option value="">Choose a student…</option>
              {filteredStudents.map((s) => (
                <option key={s.id} value={s.id}>{s.fullName}{s.className ? ` — ${s.className}` : ""}</option>
              ))}
            </Select>
            <Select label="Dormitory" required value={allocForm.dormitoryId}
              onChange={(e) => setAllocForm((p) => ({ ...p, dormitoryId: e.target.value }))}>
              <option value="">Choose a dormitory…</option>
              {withOccupancy.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} — {d.free} bed{d.free === 1 ? "" : "s"} free
                </option>
              ))}
            </Select>
            <Input label="Bed number" value={allocForm.bedNumber}
              onChange={(e) => setAllocForm((p) => ({ ...p, bedNumber: e.target.value }))} />
          </div>
        </Modal>
      )}

      {outForm && (
        <Modal title="Sign a boarder out" subtitle="Their guardian is notified immediately."
          onClose={() => setOutForm(null)}
          footer={(
            <>
              <Btn variant="secondary" onClick={() => setOutForm(null)}>Cancel</Btn>
              <Btn variant="accent" loading={busy} onClick={async () => {
                const student = students.find((s) => s.id === outForm.studentId);
                if (await run(() => signOut({
                  schoolCode, student, reason: outForm.reason,
                  expectedBack: outForm.expectedBack, authorisedBy: outForm.authorisedBy, actor: currentUser,
                }), "Signed out and the guardian told.")) setOutForm(null);
              }}>Sign out</Btn>
            </>
          )}>
          <div className="space-y-4">
            <Select label="Student" required value={outForm.studentId}
              onChange={(e) => setOutForm((p) => ({ ...p, studentId: e.target.value }))}>
              <option value="">Choose a student…</option>
              {filteredStudents.map((s) => (
                <option key={s.id} value={s.id}>{s.fullName}{s.className ? ` — ${s.className}` : ""}</option>
              ))}
            </Select>
            <Input label="Reason" required value={outForm.reason}
              placeholder="Medical appointment in town"
              onChange={(e) => setOutForm((p) => ({ ...p, reason: e.target.value }))} />
            <Input label="Expected back" type="datetime-local" value={outForm.expectedBack}
              hint="Anyone still out past this time is flagged."
              onChange={(e) => setOutForm((p) => ({ ...p, expectedBack: e.target.value }))} />
            <Input label="Authorised by" value={outForm.authorisedBy}
              onChange={(e) => setOutForm((p) => ({ ...p, authorisedBy: e.target.value }))} />
          </div>
        </Modal>
      )}

      {sickForm && (
        <Modal title="Log a sick bay visit" onClose={() => setSickForm(null)}
          footer={(
            <>
              <Btn variant="secondary" onClick={() => setSickForm(null)}>Cancel</Btn>
              <Btn variant="accent" loading={busy} onClick={async () => {
                const student = students.find((s) => s.id === sickForm.studentId);
                if (await run(() => logSickbay({
                  schoolCode, student, complaint: sickForm.complaint,
                  treatment: sickForm.treatment, referredOut: sickForm.referredOut, actor: currentUser,
                }), "Visit logged and the guardian told.")) setSickForm(null);
              }}>Log visit</Btn>
            </>
          )}>
          <div className="space-y-4">
            <Select label="Student" required value={sickForm.studentId}
              onChange={(e) => setSickForm((p) => ({ ...p, studentId: e.target.value }))}>
              <option value="">Choose a student…</option>
              {filteredStudents.map((s) => (
                <option key={s.id} value={s.id}>{s.fullName}{s.className ? ` — ${s.className}` : ""}</option>
              ))}
            </Select>
            <Input label="Complaint" required value={sickForm.complaint}
              onChange={(e) => setSickForm((p) => ({ ...p, complaint: e.target.value }))} />
            <Textarea label="Treatment given" value={sickForm.treatment}
              onChange={(e) => setSickForm((p) => ({ ...p, treatment: e.target.value }))} />
            <label className="checkbox-label">
              <input type="checkbox" checked={sickForm.referredOut}
                onChange={(e) => setSickForm((p) => ({ ...p, referredOut: e.target.checked }))} />
              <span>Referred to a clinic or hospital</span>
            </label>
          </div>
        </Modal>
      )}
    </div>
  );
}
