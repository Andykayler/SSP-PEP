// src/pages/headteacher/modules/Admissions.jsx
// Applicants, from the selection list to the roll.
//
// Laid out as stages rather than a flat table because the question an office
// asks is never "list everyone" — it is "who is waiting on us" and "how many
// places are left". Enrolling writes the student record and keeps the
// application, so in three years the office can still say where a child came
// from and what their selection score was.
import { useState, useCallback, useMemo } from "react";
import { db } from "../../../firebase";
import { collection, query, where, getDocs } from "firebase/firestore";
import {
  UserPlus, Plus, Pencil, Trash2, RefreshCw, Search, GraduationCap, ArrowRight,
} from "lucide-react";
import {
  fetchApplications, saveApplication, deleteApplication, setStage, enrol,
  summarise, stageMeta, STAGES, ALL_STAGES, SOURCES,
} from "../../../services/admissions";
import {
  Modal, Btn, IconBtn, Input, Textarea, Select, Pill, EmptyState, StatGrid,
  StatCard, ModuleHeader, Notice, LoadingState, FilterBar, TableWrap,
} from "../../../components/ui/ModuleKit";
import "./staff-management.css";
import useLoader from "../../../hooks/useLoader";

const BLANK = {
  applicantName: "", gender: "", dateOfBirth: "", previousSchool: "",
  source: "selection", selectionScore: "", appliedForClassId: "",
  appliedForClassName: "", guardianName: "", guardianPhone: "",
  boarding: false, notes: "", status: "applied",
};

export default function Admissions({ schoolCode, currentUser, schoolBoards = false }) {
  const [rows, setRows] = useState(null);
  const [classes, setClasses] = useState([]);
  const [form, setForm] = useState(null);
  const [stage, setStageFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);

  const load = useCallback(async () => {
    if (!schoolCode) return;
    try {
      const [apps, classSnap] = await Promise.all([
        fetchApplications(schoolCode),
        getDocs(query(collection(db, "school_classes"), where("schoolCode", "==", schoolCode))),
      ]);
      setRows(apps);
      setClasses(classSnap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (a.order || 0) - (b.order || 0)));
    } catch (err) {
      console.error("[admissions] load failed:", err);
      setNotice({ tone: "danger", text: "Could not load applications: " + err.message });
      setRows([]);
    }
  }, [schoolCode]);


  useLoader(load);

  const stats = useMemo(() => summarise(rows || []), [rows]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (rows || [])
      .filter((r) => stage === "all" || r.status === stage)
      .filter((r) => !q
        || r.applicantName?.toLowerCase().includes(q)
        || r.guardianName?.toLowerCase().includes(q)
        || r.previousSchool?.toLowerCase().includes(q));
  }, [rows, stage, search]);

  const submit = async () => {
    setBusy(true);
    const chosen = classes.find((c) => c.id === form.appliedForClassId);
    const res = await saveApplication({
      schoolCode,
      application: { ...form, appliedForClassName: chosen?.name || "" },
      actor: currentUser,
    });
    setBusy(false);
    if (!res.ok) { setNotice({ tone: "danger", text: res.error }); return; }
    setForm(null);
    setNotice({ tone: "success", text: form.id ? "Application updated." : "Application recorded." });
    load();
  };

  const advance = async (row, status) => {
    const note = status === "rejected" || status === "waitlisted"
      ? window.prompt(`Why is ${row.applicantName} being marked "${stageMeta(status).label}"?`, "")
      : "";
    if (note === null) return;
    setBusy(true);
    const res = await setStage({ applicationId: row.id, status, note, actor: currentUser });
    setBusy(false);
    setNotice(res.ok
      ? { tone: "success", text: `${row.applicantName} — ${stageMeta(status).label}.` }
      : { tone: "danger", text: res.error });
    if (res.ok) load();
  };

  const doEnrol = async (row) => {
    if (!window.confirm(
      `Enrol ${row.applicantName} into ${row.appliedForClassName}?\n\n`
      + "This creates their student record. The application is kept for the file.")) return;
    setBusy(true);
    const res = await enrol({ schoolCode, application: row, actor: currentUser });
    setBusy(false);
    setNotice(res.ok
      ? { tone: "success", text: `${row.applicantName} is now on the roll.` }
      : { tone: "danger", text: res.error });
    if (res.ok) load();
  };

  const remove = async (row) => {
    if (!window.confirm(`Delete ${row.applicantName}'s application?`)) return;
    await deleteApplication(row.id);
    load();
  };

  if (rows === null) return <LoadingState label="Loading applications…" />;

  return (
    <div className="space-y-6">
      <ModuleHeader
        title="Admissions"
        subtitle="Applications, offers and enrolment"
        actions={[
          <IconBtn key="r" icon={<RefreshCw size={15} />} title="Refresh" onClick={load} />,
          <Btn key="a" variant="accent" icon={<Plus size={15} />} onClick={() => setForm({ ...BLANK })}>
            Add Applicant
          </Btn>,
        ]}
      />

      {notice && <Notice tone={notice.tone} onDismiss={() => setNotice(null)}>{notice.text}</Notice>}

      <StatGrid>
        <StatCard label="Applications" value={stats.total} sub="All time" />
        <StatCard label="Awaiting a decision" value={stats.counts.applied + stats.counts.shortlisted}
          tone={stats.counts.applied ? "warning" : "success"} sub="Applied or shortlisted" />
        <StatCard label="Offered, not answered" value={stats.counts.offered}
          tone={stats.counts.offered ? "warning" : "success"} sub="Waiting on the family" />
        <StatCard label="Enrolled" value={stats.counts.enrolled} tone="success"
          sub={`${stats.counts.accepted} accepted, not yet enrolled`} />
      </StatGrid>

      <div className="filter-bar">
        <div className="search-wrapper">
          <Search size={15} className="search-icon" />
          <input className="search-input" placeholder="Search applicant, guardian or school…"
            value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>

      <FilterBar
        value={stage}
        onChange={setStageFilter}
        options={[
          { id: "all", label: "All", count: rows.length },
          ...ALL_STAGES.map((s) => ({ id: s.id, label: s.label, count: stats.counts[s.id] })),
        ]}
      />

      {visible.length === 0 ? (
        <EmptyState
          icon={<UserPlus size={28} />}
          title={rows.length === 0 ? "No applications yet" : "Nothing at this stage"}
          sub={rows.length === 0
            ? "Record the district selection list here, then move each applicant through to enrolment."
            : "Try another stage or clear the search."}
          action={rows.length === 0
            ? <Btn variant="accent" icon={<Plus size={15} />} onClick={() => setForm({ ...BLANK })}>
              Add Applicant
            </Btn>
            : null}
        />
      ) : (
        <TableWrap>
          <table className="data-table">
            <thead>
              <tr>
                <th>Applicant</th><th>From</th><th>Score</th><th>For</th>
                <th>Guardian</th><th>Stage</th><th style={{ textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => {
                const meta = stageMeta(r.status);
                const idx = STAGES.findIndex((s) => s.id === r.status);
                const next = idx >= 0 && idx < STAGES.length - 2 ? STAGES[idx + 1] : null;
                return (
                  <tr key={r.id}>
                    <td>
                      <strong>{r.applicantName}</strong>
                      {r.boarding && <div className="text-muted" style={{ fontSize: 11 }}>boarder</div>}
                    </td>
                    <td className="text-muted">{r.previousSchool || "—"}</td>
                    <td className="text-muted">
                      {r.selectionScore === null || r.selectionScore === undefined ? "—" : r.selectionScore}
                    </td>
                    <td className="text-muted">{r.appliedForClassName || "—"}</td>
                    <td className="text-muted">
                      {r.guardianName || "—"}
                      <div style={{ fontSize: 11 }}>{r.guardianPhone}</div>
                    </td>
                    <td><Pill tone={meta.tone}>{meta.label}</Pill></td>
                    <td style={{ textAlign: "right" }}>
                      <div className="flex gap-2 justify-end">
                        {r.status === "accepted" && (
                          <Btn size="sm" variant="success" icon={<GraduationCap size={13} />}
                            loading={busy} onClick={() => doEnrol(r)}>
                            Enrol
                          </Btn>
                        )}
                        {next && (
                          <Btn size="sm" variant="secondary" icon={<ArrowRight size={13} />}
                            loading={busy} onClick={() => advance(r, next.id)}>
                            {next.label}
                          </Btn>
                        )}
                        <IconBtn icon={<Pencil size={15} />} title="Edit" onClick={() => setForm({ ...r })} />
                        <IconBtn icon={<Trash2 size={15} />} title="Delete" danger onClick={() => remove(r)} />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </TableWrap>
      )}

      {form && (
        <Modal
          title={form.id ? "Edit application" : "Add an applicant"}
          onClose={() => setForm(null)}
          wide
          footer={(
            <>
              <Btn variant="secondary" onClick={() => setForm(null)}>Cancel</Btn>
              <Btn variant="accent" loading={busy} onClick={submit}>Save</Btn>
            </>
          )}
        >
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Input label="Applicant name" required value={form.applicantName}
                onChange={(e) => setForm((p) => ({ ...p, applicantName: e.target.value }))} />
              <Select label="Gender" value={form.gender}
                onChange={(e) => setForm((p) => ({ ...p, gender: e.target.value }))}>
                <option value="">Not stated</option>
                <option value="female">Female</option>
                <option value="male">Male</option>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Input label="Date of birth" type="date" value={form.dateOfBirth}
                onChange={(e) => setForm((p) => ({ ...p, dateOfBirth: e.target.value }))} />
              <Select label="How they came" value={form.source}
                onChange={(e) => setForm((p) => ({ ...p, source: e.target.value }))}>
                {SOURCES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Input label="Previous school" value={form.previousSchool}
                onChange={(e) => setForm((p) => ({ ...p, previousSchool: e.target.value }))} />
              <Input label="Selection score" type="number" value={form.selectionScore}
                hint="PSLCE aggregate, for selection entrants."
                onChange={(e) => setForm((p) => ({ ...p, selectionScore: e.target.value }))} />
            </div>
            <Select label="Applying for" required value={form.appliedForClassId}
              hint="Needed before they can be enrolled."
              onChange={(e) => setForm((p) => ({ ...p, appliedForClassId: e.target.value }))}>
              <option value="">Choose a class…</option>
              {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
            <div className="grid grid-cols-2 gap-4">
              <Input label="Guardian name" value={form.guardianName}
                onChange={(e) => setForm((p) => ({ ...p, guardianName: e.target.value }))} />
              <Input label="Guardian phone" required value={form.guardianPhone}
                hint="This becomes their sign-in for the parent app."
                onChange={(e) => setForm((p) => ({ ...p, guardianPhone: e.target.value }))} />
            </div>
            {schoolBoards && (
              <label className="checkbox-label">
                <input type="checkbox" checked={form.boarding}
                  onChange={(e) => setForm((p) => ({ ...p, boarding: e.target.checked }))} />
                <span>Applying as a boarder</span>
              </label>
            )}
            <Textarea label="Notes" value={form.notes}
              onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} />
          </div>
        </Modal>
      )}
    </div>
  );
}
