// ─── Data & Backup ────────────────────────────────────────────────────────────
// A school's own copy of its records: one JSON file with everything, or any
// dataset as a CSV for Excel. See services/dataExport.js for what is (and
// deliberately is not) included.
import { useState } from "react";
import { Download, ShieldCheck, FileSpreadsheet } from "lucide-react";
import {
  DATASETS, buildBackup, readDataset, toTable, downloadJson, logExport,
} from "../../../services/dataExport";
import { downloadCsv } from "../../../services/csv";
import { Btn, Notice, ModuleHeader } from "../../../components/ui/ModuleKit";
import "../../headteacher/modules/staff-management.css";

const stamp = () => new Date().toISOString().slice(0, 10);

export default function DataBackup({ schoolCode, schoolName, actorName }) {
  const [selected, setSelected] = useState(() => DATASETS.filter((d) => !d.sensitive).map((d) => d.id));
  const [progress, setProgress] = useState(null);
  const [notice, setNotice] = useState(null);
  const [csvBusy, setCsvBusy] = useState("");

  const groups = [...new Set(DATASETS.map((d) => d.group))];
  const toggle = (id) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const backup = async () => {
    setNotice(null);
    setProgress({ done: 0, total: selected.length, label: "Starting…" });
    try {
      const result = await buildBackup({
        schoolCode, school: { name: schoolName }, selected,
        onProgress: (done, total, label) => setProgress({ done, total, label }),
      });
      downloadJson(`${schoolCode}-backup-${stamp()}.json`, result);
      const skipped = Object.keys(result.meta.skipped);
      const total = Object.values(result.meta.counts).reduce((a, b) => a + b, 0);
      await logExport({
        schoolCode, actorName,
        description: `Full backup downloaded: ${Object.keys(result.data).length} datasets, ${total} records${skipped.length ? `; skipped ${skipped.join(", ")}` : ""}`,
      });
      setNotice({
        tone: skipped.length ? "warning" : "success",
        text: `Backup downloaded: ${total.toLocaleString()} records across ${Object.keys(result.data).length} datasets.`
          + (skipped.length ? ` Skipped (your role can't read them): ${skipped.join(", ")}.` : "")
          + (result.meta.credentialFieldsRemoved ? ` ${result.meta.credentialFieldsRemoved} password fields were left out on purpose.` : ""),
      });
    } catch (err) {
      setNotice({ tone: "danger", text: `The backup didn't finish: ${err.message}` });
    } finally {
      setProgress(null);
    }
  };

  const csv = async (dataset) => {
    setCsvBusy(dataset.id);
    setNotice(null);
    try {
      const r = await readDataset(schoolCode, dataset);
      if (r.error) throw new Error(r.error);
      if (r.rows.length === 0) { setNotice({ tone: "warning", text: `${dataset.label}: nothing to export yet.` }); return; }
      const t = toTable(r.rows);
      downloadCsv(`${schoolCode}-${dataset.id}-${stamp()}.csv`, t.headers, t.rows);
      await logExport({ schoolCode, actorName, description: `${dataset.label} exported to CSV (${r.rows.length} records)` });
    } catch (err) {
      setNotice({ tone: "danger", text: `${dataset.label}: ${err.message}` });
    } finally {
      setCsvBusy("");
    }
  };

  const pct = progress && progress.total ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <div>
      <ModuleHeader title="Data & Backup" subtitle="Take a copy of your school's records, any time" />
      {notice && <Notice tone={notice.tone} onDismiss={() => setNotice(null)}>{notice.text}</Notice>}

      <div className="alert alert--success" style={{ marginBottom: 18, alignItems: "flex-start", gap: 10 }}>
        <ShieldCheck size={18} style={{ flexShrink: 0, marginTop: 2 }} />
        <div style={{ fontSize: 13 }}>
          <strong>Your records belong to your school.</strong> Every export is recorded in the Audit Log. Passwords are never
          included. Keep backup files somewhere safe: they contain learners' personal information.
        </div>
      </div>

      <div className="card" style={{ padding: 20, marginBottom: 20 }}>
        <h3 style={{ margin: "0 0 4px" }}>Full backup</h3>
        <p className="text-muted" style={{ fontSize: 13, margin: "0 0 14px" }}>One JSON file with the datasets you tick. Discipline and health records are unticked by default.</p>

        {groups.map((g) => (
          <div key={g} style={{ marginBottom: 12 }}>
            <p className="field__label" style={{ margin: "0 0 6px" }}>{g}</p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {DATASETS.filter((d) => d.group === g).map((d) => (
                <label key={d.id} className={`filter-btn ${selected.includes(d.id) ? "filter-btn--active" : ""}`} style={{ cursor: "pointer" }}>
                  <input type="checkbox" checked={selected.includes(d.id)} onChange={() => toggle(d.id)} style={{ display: "none" }} />
                  {d.label}
                </label>
              ))}
            </div>
          </div>
        ))}

        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", marginTop: 14 }}>
          <Btn variant="accent" icon={<Download size={16} />} loading={Boolean(progress)} disabled={selected.length === 0} onClick={backup}>
            Download backup ({selected.length} dataset{selected.length === 1 ? "" : "s"})
          </Btn>
          <Btn variant="secondary" size="sm" onClick={() => setSelected(DATASETS.map((d) => d.id))}>Tick all</Btn>
          <Btn variant="secondary" size="sm" onClick={() => setSelected([])}>Clear</Btn>
        </div>

        {progress && (
          <div style={{ marginTop: 14 }} aria-live="polite">
            <div style={{ height: 6, borderRadius: 4, background: "var(--primary-pale)", overflow: "hidden" }}>
              <div style={{ width: `${pct}%`, height: "100%", background: "var(--primary)", transition: "width .2s" }} />
            </div>
            <p className="text-muted" style={{ fontSize: 12, marginTop: 6 }}>{progress.label} ({progress.done} of {progress.total})</p>
          </div>
        )}
      </div>

      <div className="card" style={{ padding: 20 }}>
        <h3 style={{ margin: "0 0 4px" }}><FileSpreadsheet size={16} style={{ verticalAlign: "-2px" }} /> Spreadsheets</h3>
        <p className="text-muted" style={{ fontSize: 13, margin: "0 0 14px" }}>Any single dataset as a CSV you can open in Excel.</p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {DATASETS.map((d) => (
            <Btn key={d.id} size="sm" variant="secondary" loading={csvBusy === d.id} icon={<Download size={13} />} onClick={() => csv(d)}>{d.label}</Btn>
          ))}
        </div>
      </div>

      <p className="text-muted" style={{ fontSize: 12.5, marginTop: 16 }}>
        A backup is a copy for safekeeping. To bring learners or staff back in, use Bulk import.
      </p>
    </div>
  );
}
