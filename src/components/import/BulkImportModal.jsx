// src/components/import/BulkImportModal.jsx
// ─────────────────────────────────────────────────────────────────────────────
// Upload → check → confirm → import. Shared by students and staff, because the
// only things that differ between them are the columns and the two functions
// that validate and write.
//
// The check step is not a formality. A clerk who uploads six hundred rows and
// is told "43 problems" learns nothing; one who is shown *which line* and *what
// is wrong with it* can fix the spreadsheet and re-upload in a few minutes. So
// every row is listed with its own verdict, bad rows are sorted to the top, and
// the file is never partially written — the import button only ever writes rows
// that have already passed.
//
// Rows with warnings still import. A warning means "this looks odd, check it",
// not "this is wrong", and blocking on them would make a duplicate-looking name
// — two cousins in one class, which is common — impossible to enrol.
// ─────────────────────────────────────────────────────────────────────────────
import { useRef, useState } from "react";
import { Modal, Btn } from "../../pages/admin/modules/ui";
import { IC } from "../../pages/admin/modules/icons";
import { readTableFile, downloadCsv } from "../../services/csv";

const UploadIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6}
       width={28} height={28}>
    <path strokeLinecap="round" strokeLinejoin="round"
          d="M12 16.5V6.75m0 0L8.25 10.5M12 6.75l3.75 3.75M3 16.5v1.875A2.625 2.625 0 005.625 21h12.75A2.625 2.625 0 0021 18.375V16.5" />
  </svg>
);

export default function BulkImportModal({
  title,
  noun,               // "student" / "staff member" — used in the wording
  columns,            // STUDENT_COLUMNS | STAFF_COLUMNS
  sample,             // one example row for the template
  templateName,
  previewColumns,     // [{ label, get(row) }]
  onValidate,         // (parsedRows) => validatedRows
  onImport,           // (validatedRows, onProgress) => result
  renderResult,       // (result) => JSX
  onClose,
  onDone,
}) {
  const [step, setStep]         = useState("pick");   // pick | preview | running | done
  const [fileName, setFileName] = useState("");
  const [validated, setValidated] = useState([]);
  const [error, setError]       = useState("");
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [result, setResult]     = useState(null);
  const inputRef = useRef(null);

  const okRows   = validated.filter((r) => r.valid);
  const badRows  = validated.filter((r) => !r.valid);
  const warnRows = validated.filter((r) => r.valid && r.warnings.length > 0);

  function downloadTemplate() {
    downloadCsv(templateName, columns.map((c) => c.label), [sample]);
  }

  async function handleFile(file) {
    if (!file) return;
    setError("");
    setFileName(file.name);
    try {
      const { rows, headers } = await readTableFile(file);

      if (rows.length === 0) {
        setError("That file has no rows under the header. Check it is a CSV or Excel (.xlsx) file with the column names in the first row.");
        return;
      }
      const missing = columns
        .filter((c) => c.required && !(c.present ? c.present(headers) : headers.includes(c.key)))
        .map((c) => c.label);
      if (missing.length > 0) {
        setError(
          `The file is missing these columns: ${missing.join(", ")}. `
          + `Download the template below and copy your data into it.`
        );
        return;
      }

      setValidated(onValidate(rows));
      setStep("preview");
    } catch (err) {
      setError(err.message || "Could not read that file.");
    }
  }

  async function runImport() {
    setStep("running");
    setProgress({ done: 0, total: okRows.length });
    try {
      const res = await onImport(validated, setProgress);
      setResult(res);
      setStep("done");
      onDone?.(res);
    } catch (err) {
      setError(err.message || "The import failed.");
      setStep("preview");
    }
  }

  return (
    <Modal title={title} onClose={onClose} size="lg">
      {error && (
        <div className="alert alert--error" style={{ marginBottom: 16 }}>
          {IC.warning}<span>{error}</span>
        </div>
      )}

      {/* ── STEP 1: pick a file ── */}
      {step === "pick" && (
        <div className="space-y-4">
          <div
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); handleFile(e.dataTransfer.files?.[0]); }}
            style={{
              border: "2px dashed var(--border)", borderRadius: 12, padding: "36px 20px",
              textAlign: "center", cursor: "pointer", background: "var(--surface2)",
            }}
          >
            <div style={{ color: "var(--text3)", marginBottom: 10 }}>{UploadIcon}</div>
            <div style={{ fontWeight: 600, fontSize: 14 }}>Choose a CSV or Excel file</div>
            <div style={{ fontSize: 12, color: "var(--text3)", marginTop: 4 }}>
              or drag it here
            </div>
            <input
              ref={inputRef}
              type="file"
              accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              style={{ display: "none" }}
              onChange={(e) => handleFile(e.target.files?.[0])}
            />
          </div>

          <div className="alert alert--info">
            {IC.info}
            <span>
              Nothing is saved until you have seen what the file contains. Every row is
              checked first and you get the chance to cancel.
            </span>
          </div>

          <div>
            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>
              Columns this file needs
            </div>
            <div className="data-table-wrap">
              <table className="data-table">
                <thead>
                  <tr><th>Column</th><th>Required</th><th>Notes</th></tr>
                </thead>
                <tbody>
                  {columns.map((c) => (
                    <tr key={c.key}>
                      <td style={{ fontWeight: 600, fontSize: 13 }}>{c.label}</td>
                      <td style={{ fontSize: 12, color: c.required ? "var(--danger)" : "var(--text3)" }}>
                        {c.required ? "Required" : "Optional"}
                      </td>
                      <td style={{ fontSize: 12, color: "var(--text3)" }}>{c.hint || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex-between">
            <Btn variant="ghost" onClick={downloadTemplate}>Download blank template</Btn>
            <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
          </div>
        </div>
      )}

      {/* ── STEP 2: what's in the file ── */}
      {step === "preview" && (
        <div className="space-y-4">
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Tally tone="success" n={okRows.length} label={`ready to import`} />
            {warnRows.length > 0 && <Tally tone="warning" n={warnRows.length} label="with a warning" />}
            {badRows.length > 0 && <Tally tone="danger" n={badRows.length} label="will be skipped" />}
          </div>

          <div style={{ fontSize: 12, color: "var(--text3)" }}>
            {fileName} · {validated.length} rows read
            {badRows.length > 0 && " · problem rows are listed first"}
          </div>

          <div className="data-table-wrap" style={{ maxHeight: 340, overflowY: "auto" }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ width: 52 }}>Line</th>
                  {previewColumns.map((c) => <th key={c.label}>{c.label}</th>)}
                  <th>Verdict</th>
                </tr>
              </thead>
              <tbody>
                {[...badRows, ...warnRows, ...okRows.filter((r) => r.warnings.length === 0)]
                  .map((r) => (
                    <tr key={r.line} style={!r.valid ? { background: "rgba(239,68,68,0.05)" } : undefined}>
                      <td style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}>{r.line}</td>
                      {previewColumns.map((c) => (
                        <td key={c.label} style={{ fontSize: 13 }}>{c.get(r) || "—"}</td>
                      ))}
                      <td style={{ fontSize: 12 }}>
                        {r.errors.map((e, i) => (
                          <div key={i} style={{ color: "var(--danger)" }}>{e}</div>
                        ))}
                        {r.warnings.map((w, i) => (
                          <div key={i} style={{ color: "var(--warning, #b45309)" }}>{w}</div>
                        ))}
                        {r.valid && r.warnings.length === 0 && (
                          <span style={{ color: "var(--success, #16a34a)" }}>OK</span>
                        )}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>

          {badRows.length > 0 && (
            <div className="alert alert--warning">
              {IC.warning}
              <span>
                {badRows.length} row{badRows.length === 1 ? "" : "s"} cannot be imported and
                will be left out. Fix them in your spreadsheet and upload it again to add
                them — the {okRows.length} good row{okRows.length === 1 ? "" : "s"} will
                already be in, so remove those from the second file.
              </span>
            </div>
          )}

          <div className="flex-between">
            <Btn variant="ghost" onClick={() => { setStep("pick"); setValidated([]); setError(""); }}>
              Choose a different file
            </Btn>
            <div style={{ display: "flex", gap: 8 }}>
              <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
              <Btn variant="primary" disabled={okRows.length === 0} onClick={runImport}>
                Import {okRows.length} {noun}{okRows.length === 1 ? "" : "s"}
              </Btn>
            </div>
          </div>
        </div>
      )}

      {/* ── STEP 3: working ── */}
      {step === "running" && (
        <div style={{ padding: "40px 20px", textAlign: "center" }}>
          <div className="spinner spinner--dark" style={{ margin: "0 auto 16px" }} />
          <div style={{ fontWeight: 600 }}>
            Importing {progress.done} of {progress.total}…
          </div>
          <div style={{ fontSize: 12, color: "var(--text3)", marginTop: 6 }}>
            Don't close this window.
          </div>
        </div>
      )}

      {/* ── STEP 4: what happened ── */}
      {step === "done" && (
        <div className="space-y-4">
          {renderResult(result)}
          <div className="flex-between">
            <span />
            <Btn variant="primary" onClick={onClose}>Done</Btn>
          </div>
        </div>
      )}
    </Modal>
  );
}

function Tally({ n, label, tone }) {
  const colors = {
    success: ["rgba(34,197,94,0.12)", "#16a34a"],
    warning: ["rgba(232,168,0,0.14)", "#b45309"],
    danger:  ["rgba(239,68,68,0.12)", "#dc2626"],
  }[tone];
  return (
    <div style={{
      background: colors[0], color: colors[1], borderRadius: 10,
      padding: "8px 14px", fontSize: 13, fontWeight: 600,
    }}>
      {n} {label}
    </div>
  );
}
