// src/components/timetable/TimetableUpload.jsx
// Fills the timetable grid from a timetable the school already has:
//
//   1. A photo or PDF of the printed timetable. The AI reads it
//      (api/_lib/aiTools.js, task=timetable-extract); nothing is stored.
//   2. A spreadsheet (CSV), one row per lesson.
//
// Either way the lessons are checked against the school's classes, subjects
// and teachers, and for clashes, and shown for review before anything is
// saved (services/timetableImportCore.js).
import { useState } from "react";
import { collection, doc, getDocs, query, where, writeBatch, serverTimestamp } from "firebase/firestore";
import { X, Download, Upload, AlertCircle, CheckCircle, Loader2, Sparkles, FileSpreadsheet } from "lucide-react";
import { db } from "../../firebase";
import { parseCsvRows, readFileAsText, downloadCsv } from "../../services/csv";
import { TIMETABLE_COLUMNS, planTimetableImport, timetableTemplateRows } from "../../services/timetableImportCore";
import { timetableFilesToImages, TIMETABLE_FILE_ACCEPT, MAX_PAGES } from "../../services/timetableImages";
import { extractTimetable } from "../../services/aiTools";

const Spinner = ({ size = 16 }) => <Loader2 size={size} style={{ animation: "spin 0.65s linear infinite" }} />;

const staffName = (t) => t.name || t.displayName || t.fullName || `${t.firstName || ""} ${t.lastName || ""}`.trim();

/** A list of problems, capped so a bad file doesn't fill the screen. */
function Problems({ tone, title, items, cap = 10 }) {
  if (!items.length) return null;
  return (
    <div className={`alert alert--${tone}`} style={{ flexDirection: "column", alignItems: "flex-start", gap: 4 }}>
      <strong>{title}</strong>
      {items.slice(0, cap).map((text, i) => <span key={i} style={{ fontSize: 12.5 }}>{text}</span>)}
      {items.length > cap && <span style={{ fontSize: 12.5 }}>and {items.length - cap} more</span>}
    </div>
  );
}

/**
 * What would be saved, and the button that saves it. `lenient` (the AI path)
 * saves the lessons that matched and lists the rest as skipped; a spreadsheet
 * the school typed must be fixed first.
 */
function Review({ plan, lenient, rowWord, saving, onSave }) {
  const skipped = plan.errors.map((e) => `${rowWord} ${e.line}: ${e.message}`);
  const blocked = plan.slots.length === 0 || plan.clashes.length > 0 || (!lenient && plan.errors.length > 0);
  const classCount = plan.classIds.length;
  return (
    <div className="space-y-3">
      <Problems tone={lenient ? "warning" : "error"}
        title={lenient
          ? `${skipped.length} lesson${skipped.length === 1 ? "" : "s"} couldn't be matched and will be skipped`
          : `${skipped.length} row${skipped.length === 1 ? "" : "s"} need fixing before this can be saved`}
        items={skipped} />
      <Problems tone="warning" title="Saved without a teacher" items={plan.warnings.map((w) => w.message)} />
      <Problems tone="error" title={`${plan.clashes.length} clash${plan.clashes.length === 1 ? "" : "es"} — fix these first`} items={plan.clashes} />
      {plan.slots.length > 0 && (
        <div className="alert alert--success">
          <CheckCircle size={14} />
          <span>
            {plan.slots.length} lesson{plan.slots.length === 1 ? "" : "s"} for {classCount} class{classCount === 1 ? "" : "es"}.
            Saving replaces the current timetable of {classCount === 1 ? "that class" : "those classes"}; other classes are left as they are.
            {lenient && " Check the grid afterwards — you can change any period by clicking it."}
          </span>
        </div>
      )}
      {plan.slots.length === 0 && <div className="alert alert--warning"><AlertCircle size={14} /> Nothing here matched the school&rsquo;s classes and subjects.</div>}
      <div className="flex justify-end">
        <button type="button" className="btn-save" onClick={onSave} disabled={saving || blocked}>
          {saving ? <Spinner /> : <Upload size={14} />} Fill the timetable
        </button>
      </div>
    </div>
  );
}

export default function TimetableUpload({ schoolCode, classes, staff, days, periods, allSlots, slotId, onImported, onClose }) {
  const [tab, setTab] = useState("ai");
  const [busy, setBusy] = useState("");        // what is happening, for the spinner
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [plan, setPlan] = useState(null);
  const [saving, setSaving] = useState(false);

  const switchTab = (next) => { setTab(next); setPlan(null); setError(""); setNote(""); };

  // ── Photo or PDF, read by the AI ─────────────────────────────────────────
  async function readWithAi(e) {
    const files = e.target.files;
    if (!files?.length) return;
    setError(""); setNote(""); setPlan(null);
    try {
      setBusy("Preparing the file…");
      const { images, pages } = await timetableFilesToImages(files);
      e.target.value = "";
      setBusy(`Reading ${images.length === 1 ? "the timetable" : `${images.length} pages`}… this can take up to a minute.`);
      const { data, error: aiError } = await extractTimetable({
        images,
        classes: classes.map((c) => ({ name: c.name, subjects: c.subjects || [] })),
        days,
        periods: periods.map(({ number, start, end }) => ({ number, start, end })),
        teachers: staff.map(staffName).filter(Boolean),
      });
      if (aiError) throw new Error(aiError);
      const notes = [];
      if (pages > images.length) notes.push(`Only the first ${MAX_PAGES} pages were read — upload the rest separately.`);
      if (data.truncated) notes.push("The timetable was too long to read in one go, so some lessons may be missing. Upload fewer pages at a time.");
      setNote(notes.join(" "));
      setPlan(planTimetableImport({ rows: data.lessons, classes, staff, days, periods, existingSlots: allSlots, strict: false }));
    } catch (err) {
      setError(err.message);
    } finally {
      e.target.value = "";
      setBusy("");
    }
  }

  // ── Spreadsheet ───────────────────────────────────────────────────────────
  async function readCsv(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError(""); setNote(""); setPlan(null);
    try {
      const { headers, rows } = parseCsvRows(await readFileAsText(file));
      const missing = ["class", "day", "period", "subject"].filter((h) => !headers.includes(h));
      if (missing.length) {
        setError(`The file needs these columns: ${TIMETABLE_COLUMNS.join(", ")}. Missing: ${missing.join(", ")}.`);
        return;
      }
      setPlan(planTimetableImport({ rows, classes, staff, days, periods, existingSlots: allSlots }));
    } catch (err) {
      setError(err.message);
    }
  }

  async function save() {
    if (!plan?.slots.length) return;
    setSaving(true);
    setError("");
    try {
      // Replace, not merge: a period the timetable leaves out is a free period.
      const existing = await getDocs(query(collection(db, "timetable"), where("schoolCode", "==", schoolCode)));
      const newIds = new Set(plan.slots.map((s) => slotId(schoolCode, s.classId, s.day, s.periodNumber)));
      const ops = [];
      existing.docs.forEach((d) => {
        if (plan.classIds.includes(d.data().classId) && !newIds.has(d.id)) ops.push((b) => b.delete(d.ref));
      });
      const saved = plan.slots.map((s) => {
        const id = slotId(schoolCode, s.classId, s.day, s.periodNumber);
        const data = { schoolCode, ...s, source: tab === "ai" ? "ai_import" : "import", updatedAt: serverTimestamp() };
        ops.push((b) => b.set(doc(db, "timetable", id), { ...data, createdAt: serverTimestamp() }, { merge: true }));
        return { id, ...data };
      });
      for (let i = 0; i < ops.length; i += 400) {
        const batch = writeBatch(db);
        ops.slice(i, i + 400).forEach((op) => op(batch));
        await batch.commit();
      }
      const next = [...allSlots.filter((s) => !plan.classIds.includes(s.classId)), ...saved];
      onImported(next, `Filled ${saved.length} lessons for ${plan.classIds.length} class${plan.classIds.length === 1 ? "" : "es"}.`);
    } catch (err) {
      console.error("Timetable import failed:", err);
      setError(`Couldn't save the timetable: ${err.message}`);
      setSaving(false);
    }
  }

  const template = () => downloadCsv("timetable-template.csv", TIMETABLE_COLUMNS, timetableTemplateRows(classes, days, periods));

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <div className="modal-container" style={{ maxWidth: 680 }}>
        <div className="modal-header">
          <div>
            <h3>Upload timetable</h3>
            <p>Fill the grid from the timetable the school already has.</p>
          </div>
          <button onClick={onClose} className="modal-close" disabled={Boolean(busy)}><X size={22} /></button>
        </div>
        <div className="modal-body space-y-4">
          <div className="flex gap-2 flex-wrap">
            <button type="button" className={`filter-btn ${tab === "ai" ? "filter-btn--active" : ""}`} onClick={() => switchTab("ai")} disabled={Boolean(busy)}>
              <Sparkles size={13} /> Photo or PDF
            </button>
            <button type="button" className={`filter-btn ${tab === "csv" ? "filter-btn--active" : ""}`} onClick={() => switchTab("csv")} disabled={Boolean(busy)}>
              <FileSpreadsheet size={13} /> Spreadsheet (CSV)
            </button>
          </div>

          {tab === "ai" ? (
            <div className="space-y-3">
              <p className="text-sm text-muted">
                Take a clear photo of the printed timetable, or choose a PDF — the whole school&rsquo;s, or several
                photos one class at a time (up to {MAX_PAGES} pages). The AI reads the lessons and matches them to
                your classes, subjects and teachers; you review them before anything is saved. The file itself
                isn&rsquo;t kept.
              </p>
              <label className="btn-save" style={{ cursor: busy ? "wait" : "pointer", display: "inline-flex" }}>
                {busy ? <Spinner /> : <Upload size={14} />} Choose photo or PDF
                <input type="file" accept={TIMETABLE_FILE_ACCEPT} multiple onChange={readWithAi} disabled={Boolean(busy)} style={{ display: "none" }} />
              </label>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-muted">
                One row per lesson: <strong>{TIMETABLE_COLUMNS.join(", ")}</strong>. Periods are numbered
                1–{periods.length}; days are {days.join(", ")}. Leave a row&rsquo;s subject empty for a free period.
                From Excel, use File → Save As → CSV UTF-8.
              </p>
              <div className="flex gap-2 flex-wrap">
                <button type="button" className="btn-refresh" onClick={template}><Download size={14} /> Download template</button>
                <label className="btn-save" style={{ cursor: "pointer" }}>
                  <Upload size={14} /> Choose CSV file
                  <input type="file" accept=".csv,text/csv" onChange={readCsv} style={{ display: "none" }} />
                </label>
              </div>
            </div>
          )}

          {busy && <p className="text-sm text-muted flex items-center gap-2"><Spinner size={14} /> {busy}</p>}
          {error && <div className="error-message"><AlertCircle size={14} /> {error}</div>}
          {note && <div className="alert alert--warning"><AlertCircle size={14} /> <span>{note}</span></div>}
          {plan && (
            <Review plan={plan} lenient={tab === "ai"} rowWord={tab === "ai" ? "Lesson" : "Line"} saving={saving} onSave={save} />
          )}
        </div>
      </div>
    </div>
  );
}
