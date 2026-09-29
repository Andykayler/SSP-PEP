// src/components/setup/CurriculumSettings.jsx
// "Sections, curriculum & grading" — the sections the school runs, each a
// level (Kindergarten, Primary, Secondary) taught to a curriculum (Malawian,
// Cambridge, Abeka), with its own subjects and grading scale. A school may run
// several curricula at one level: Primary (Malawian) beside Primary (Abeka).
//
// Shown in the admin's School Settings and the head teacher's Classes screen.
// Everything is a draft until "Save", except renaming a subject: that rewrites
// every class, timetable period and mark sheet carrying the old name, so it
// happens on the server straight away (see api/_lib/schoolRename.js).
import { useEffect, useMemo, useState } from "react";
import { collection, doc, getDocs, query, where, writeBatch, serverTimestamp } from "firebase/firestore";
import { Check, Plus, X, Pencil, RotateCcw, Trash2, Save } from "lucide-react";
import { db } from "../../firebase";
import { Btn, Notice } from "../ui/ModuleKit";
import {
  SECTIONS, CURRICULA, DEFAULT_SCALES, sectionsOf, defaultSection, ladderFor,
  validateScale, sectionKeyOfClass, sectionKey, sectionName, sectionOrder, toneFor,
  saveSections, renameSubject,
} from "../../services/curriculum";
import { syncAssignmentsWithClasses } from "../../services/staffAssignments";

const clone = (x) => JSON.parse(JSON.stringify(x));

const TONE_COLOR = {
  success: "var(--success, #16a34a)",
  primary: "var(--primary, #2563eb)",
  warning: "var(--warning, #d97706)",
  danger: "var(--danger, #dc2626)",
};

function SubjectEditor({ subjects, onChange, onRename, busy }) {
  const [adding, setAdding] = useState("");
  const [editing, setEditing] = useState(null); // { from, to }

  function add() {
    const s = adding.trim();
    if (s && !subjects.some((x) => x.toLowerCase() === s.toLowerCase())) onChange([...subjects, s]);
    setAdding("");
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2" style={{ flexWrap: "wrap" }}>
        {subjects.map((s) => (editing?.from === s ? (
          <span key={s} className="flex items-center gap-1">
            <input
              className="field__input" style={{ width: 180, padding: "4px 8px" }} autoFocus
              value={editing.to} onChange={(e) => setEditing({ ...editing, to: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === "Enter") { e.preventDefault(); onRename(editing.from, editing.to.trim()); setEditing(null); }
                if (e.key === "Escape") setEditing(null);
              }}
            />
            <button type="button" className="icon-btn" title="Rename" aria-label="Rename"
              disabled={busy || !editing.to.trim()}
              onClick={() => { onRename(editing.from, editing.to.trim()); setEditing(null); }}>
              <Check size={13} />
            </button>
            <button type="button" className="icon-btn" title="Cancel" aria-label="Cancel" onClick={() => setEditing(null)}>
              <X size={13} />
            </button>
          </span>
        ) : (
          <span key={s} className="tag tag--blue" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            {s}
            <button type="button" aria-label={`Rename ${s}`} title="Rename" disabled={busy}
              onClick={() => setEditing({ from: s, to: s })}
              style={{ border: "none", background: "none", cursor: "pointer", color: "inherit", padding: 0, display: "inline-flex" }}>
              <Pencil size={11} />
            </button>
            <button type="button" aria-label={`Remove ${s}`} title="Remove"
              onClick={() => onChange(subjects.filter((x) => x !== s))}
              style={{ border: "none", background: "none", cursor: "pointer", color: "inherit", padding: 0, display: "inline-flex" }}>
              <X size={12} />
            </button>
          </span>
        )))}
      </div>
      <div className="flex gap-2" style={{ alignItems: "center" }}>
        <input
          className="field__input" style={{ flex: 1, maxWidth: 320 }} placeholder="Add a subject, e.g. Computer Studies"
          value={adding} onChange={(e) => setAdding(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
        />
        <Btn variant="ghost" size="sm" icon={<Plus size={13} />} onClick={add} disabled={!adding.trim()}>Add</Btn>
      </div>
    </div>
  );
}

function GradingEditor({ scale, onChange, defaultScale }) {
  const bands = scale.bands;
  const check = validateScale(scale);
  // Upper bound of each band, for the "80–100" preview column.
  const sorted = [...bands].map((b, i) => ({ ...b, i })).sort((a, b) => Number(b.min) - Number(a.min));
  const upper = {};
  sorted.forEach((b, k) => { upper[b.i] = k === 0 ? 100 : Number(sorted[k - 1].min) - 1; });

  const set = (i, patch) => onChange({ ...scale, bands: bands.map((b, k) => (k === i ? { ...b, ...patch } : b)) });

  return (
    <div className="space-y-2">
      <div style={{ overflowX: "auto" }}>
        <table className="data-table" style={{ minWidth: 520 }}>
          <thead>
            <tr><th>Grade</th><th>From (%)</th><th>Range</th><th>Remark</th><th>Pass?</th><th /></tr>
          </thead>
          <tbody>
            {bands.map((b, i) => {
              const tone = check.ok ? toneFor(check.scale.bands, check.scale.bands.findIndex((x) => x.label === String(b.label).trim())) : null;
              return (
                <tr key={i}>
                  <td>
                    <input className="field__input" style={{ width: 70, padding: "4px 8px", borderLeft: tone ? `3px solid ${TONE_COLOR[tone]}` : undefined }}
                      value={b.label} onChange={(e) => set(i, { label: e.target.value })} aria-label="Grade name" />
                  </td>
                  <td>
                    <input className="field__input" type="number" min={0} max={100} style={{ width: 80, padding: "4px 8px" }}
                      value={b.min} onChange={(e) => set(i, { min: e.target.value === "" ? "" : Number(e.target.value) })} aria-label="Lowest mark" />
                  </td>
                  <td className="text-muted" style={{ fontSize: 12, whiteSpace: "nowrap" }}>
                    {Number.isFinite(Number(b.min)) && b.min !== "" ? `${b.min}–${upper[i]}` : "—"}
                  </td>
                  <td>
                    <input className="field__input" style={{ width: 180, padding: "4px 8px" }}
                      value={b.remark} onChange={(e) => set(i, { remark: e.target.value })} aria-label="Remark" />
                  </td>
                  <td>
                    <input type="checkbox" checked={b.pass !== false} onChange={(e) => set(i, { pass: e.target.checked })} aria-label="Counts as a pass" />
                  </td>
                  <td>
                    <button type="button" className="icon-btn icon-btn--danger" title="Remove grade" aria-label="Remove grade"
                      disabled={bands.length <= 2}
                      onClick={() => onChange({ ...scale, bands: bands.filter((_, k) => k !== i) })}>
                      <Trash2 size={13} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {!check.ok && <p className="error-message">{check.error}</p>}
      <div className="flex gap-2" style={{ flexWrap: "wrap" }}>
        <Btn variant="ghost" size="sm" icon={<Plus size={13} />}
          onClick={() => onChange({ ...scale, bands: [...bands, { label: "", min: "", remark: "", pass: true }] })}>
          Add grade
        </Btn>
        <Btn variant="ghost" size="sm" icon={<RotateCcw size={13} />} onClick={() => onChange(clone(defaultScale))}>
          Reset to {defaultScale.name}
        </Btn>
      </div>
    </div>
  );
}

export default function CurriculumSettings({ schoolCode, settings, actorId }) {
  const saved = useMemo(() => sectionsOf(settings), [settings]);
  // Unsaved edits, or null while the screen simply shows what is saved — so
  // a change saved elsewhere (another tab, a rename) shows up unless mid-edit.
  const [edits, setEdits] = useState(null);
  const draft = edits ?? saved;
  const dirty = edits !== null;
  const [open, setOpen] = useState(() => saved[0]?.key || "");
  const [adding, setAdding] = useState({ level: "primary", curriculum: "malawi" });
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState(null); // { tone, text }
  const [classes, setClasses] = useState([]);

  useEffect(() => {
    if (!schoolCode) return;
    getDocs(query(collection(db, "school_classes"), where("schoolCode", "==", schoolCode)))
      .then((snap) => setClasses(snap.docs.map((d) => ({ id: d.id, ...d.data() }))))
      .catch(() => setClasses([]));
  }, [schoolCode]);

  // The open tab, or the first section if that one was just removed.
  const activeKey = draft.some((s) => s.key === open) ? open : draft[0]?.key;
  const classesIn = (key) => classes.filter((c) => sectionKeyOfClass(c, draft) === key);

  const edit = (next) => { setEdits(clone(next)); setNote(null); };
  const update = (key, patch) => edit(draft.map((s) => (s.key === key ? { ...s, ...patch } : s)));

  const newKey = sectionKey(adding.level, adding.curriculum);
  const alreadyRun = draft.some((s) => s.key === newKey);

  function addSection() {
    if (alreadyRun) return;
    const added = defaultSection(adding.level, adding.curriculum);
    edit([...draft, added].sort((a, b) => sectionOrder(a) - sectionOrder(b)));
    setOpen(added.key);
  }

  function removeSection(section) {
    if (draft.length === 1) { setNote({ tone: "danger", text: "A school needs at least one section." }); return; }
    const inUse = classesIn(section.key).length;
    if (!window.confirm(inUse
      ? `${inUse} class${inUse === 1 ? " is" : "es are"} in ${sectionName(section)}. Remove the section anyway? The classes stay, but they'll be graded as another section until you move them.`
      : `Remove ${sectionName(section)}?`)) return;
    edit(draft.filter((s) => s.key !== section.key));
  }

  async function rename(from, to) {
    if (!to || from === to) return;
    const everSaved = (settings?.sections || []).some((s) => (s.subjects || []).includes(from))
      || classes.some((c) => (c.subjects || []).includes(from));
    // A subject nobody has used yet only exists in this draft.
    if (everSaved) {
      if (!window.confirm(`Rename "${from}" to "${to}" everywhere — every section, class, timetable period, mark sheet and teacher that has it?`)) return;
      setBusy(true);
      const res = await renameSubject(from, to);
      setBusy(false);
      if (!res.ok) { setNote({ tone: "danger", text: res.error }); return; }
      setNote({ tone: "success", text: `Renamed "${from}" to "${to}" across the school.` });
      setClasses((prev) => prev.map((c) => ({ ...c, subjects: (c.subjects || []).map((x) => (x === from ? to : x)) })));
    }
    // The server already renamed it in saved sections; an unsaved draft, or a
    // school whose sections were never saved, needs it renamed here too.
    if (dirty || !everSaved || !Array.isArray(settings?.sections)) {
      setEdits(draft.map((s) => ({ ...s, subjects: [...new Set(s.subjects.map((x) => (x === from ? to : x)))] })));
    }
  }

  async function save() {
    setBusy(true);
    const res = await saveSections({ schoolCode, sections: draft, actorId });
    setBusy(false);
    if (!res.ok) { setNote({ tone: "danger", text: res.error }); return; }
    setEdits(null);
    setNote({ tone: "success", text: "Sections, subjects and grading saved." });
  }

  /** Gives every class in a section exactly the section's subject list. */
  async function applySubjects(section) {
    const targets = classesIn(section.key);
    if (!targets.length) return;
    if (!window.confirm(`Set the subjects of all ${targets.length} ${sectionName(section)} class${targets.length === 1 ? "" : "es"} to this list? Subjects not on the list come off those classes, and off their teachers.`)) return;
    setBusy(true);
    try {
      const batch = writeBatch(db);
      targets.forEach((c) => batch.update(doc(db, "school_classes", c.id), {
        subjects: section.subjects, section: section.id, curriculum: section.curriculum, sectionKey: section.key,
        updatedAt: serverTimestamp(),
      }));
      await batch.commit();
      await syncAssignmentsWithClasses(schoolCode).catch((e) => console.error("assignment sync failed:", e));
      setClasses((prev) => prev.map((c) => (targets.some((t) => t.id === c.id) ? { ...c, subjects: section.subjects } : c)));
      setNote({ tone: "success", text: `Updated the subjects of ${targets.length} class${targets.length === 1 ? "" : "es"}.` });
    } catch (err) {
      setNote({ tone: "danger", text: `Couldn't update the classes: ${err.message}` });
    }
    setBusy(false);
  }

  return (
    <div className="space-y-4">
      {note && <Notice tone={note.tone} onDismiss={() => setNote(null)}>{note.text}</Notice>}

      {/* The sections the school runs, one tab each. */}
      <div className="flex gap-2" style={{ flexWrap: "wrap" }} role="tablist">
        {draft.map((s) => (
          <button key={s.key} type="button" role="tab" aria-selected={activeKey === s.key}
            className={`filter-btn ${activeKey === s.key ? "filter-btn--active" : ""}`} onClick={() => setOpen(s.key)}>
            {sectionName(s)}
            <span className="text-muted" style={{ fontSize: 11, marginLeft: 6 }}>{classesIn(s.key).length}</span>
          </button>
        ))}
      </div>

      {/* Add another: any level, any curriculum — including a second curriculum at a level already run. */}
      <div className="flex gap-2" style={{ flexWrap: "wrap", alignItems: "center" }}>
        <span className="field__label" style={{ margin: 0 }}>Add a section</span>
        <select className="field__select" style={{ width: 160 }} value={adding.level}
          onChange={(e) => setAdding((p) => ({ ...p, level: e.target.value }))} aria-label="Level">
          {SECTIONS.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
        </select>
        <select className="field__select" style={{ width: 190 }} value={adding.curriculum}
          onChange={(e) => setAdding((p) => ({ ...p, curriculum: e.target.value }))} aria-label="Curriculum">
          {CURRICULA.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
        </select>
        <Btn variant="ghost" size="sm" icon={<Plus size={13} />} onClick={addSection} disabled={alreadyRun}>
          {alreadyRun ? "Already added" : "Add"}
        </Btn>
      </div>

      {draft.filter((s) => s.key === activeKey).map((section) => {
        const ladder = ladderFor(section.id, section.curriculum);
        const count = classesIn(section.key).length;
        return (
          <div key={section.key} className="space-y-5" style={{ border: "1px solid var(--border-color, var(--border))", borderRadius: 12, padding: 18 }}>
            <div className="flex items-center justify-between" style={{ gap: 12, flexWrap: "wrap" }}>
              <div>
                <p style={{ fontWeight: 700 }}>{sectionName(section)}</p>
                <p className="text-muted" style={{ fontSize: 12, marginTop: 2 }}>
                  Classes: {ladder.join(", ")}. {count} class{count === 1 ? "" : "es"} set up — add them under Classes.
                </p>
              </div>
              <Btn variant="ghost" size="sm" icon={<Trash2 size={13} />} onClick={() => removeSection(section)}>Remove section</Btn>
            </div>

            <div>
              <p className="field__label" style={{ marginBottom: 2 }}>Subjects</p>
              <p className="text-muted" style={{ fontSize: 12, marginBottom: 8 }}>
                New classes in this section start with these. Renaming a subject updates it everywhere straight away.
              </p>
              <SubjectEditor subjects={section.subjects} busy={busy}
                onChange={(subjects) => update(section.key, { subjects })} onRename={rename} />
              {count > 0 && (
                <div style={{ marginTop: 10 }}>
                  <Btn variant="ghost" size="sm" disabled={busy || dirty} onClick={() => applySubjects(section)}
                    title={dirty ? "Save first" : undefined}>
                    Apply this list to all {count} class{count === 1 ? "" : "es"}
                  </Btn>
                  {dirty && <span className="text-muted" style={{ fontSize: 11.5, marginLeft: 8 }}>Save first.</span>}
                </div>
              )}
            </div>

            <div>
              <p className="field__label" style={{ marginBottom: 2 }}>Grading scale</p>
              <p className="text-muted" style={{ fontSize: 12, marginBottom: 8 }}>
                How a percentage becomes a grade on mark sheets, report cards and the parent app for this section.
              </p>
              <GradingEditor scale={section.grading} defaultScale={DEFAULT_SCALES[section.id][section.curriculum]}
                onChange={(grading) => update(section.key, { grading })} />
            </div>
          </div>
        );
      })}

      <div className="flex justify-end gap-2">
        {dirty && <Btn variant="ghost" onClick={() => { setEdits(null); setNote(null); }}>Discard changes</Btn>}
        <Btn variant="accent" loading={busy} disabled={!dirty} icon={<Save size={14} />} onClick={save}>Save sections</Btn>
      </div>
    </div>
  );
}
