// src/services/dataExport.js
// ─────────────────────────────────────────────────────────────────────────────
// A school's right to take its own records away.
//
// A full backup is a single JSON file; each dataset can also be taken as a CSV
// a school office can open in Excel. Nothing here changes any data, and every
// export is written to the audit log with who took it and what it contained —
// a file with every learner's record in it is exactly the thing an audit trail
// exists for.
//
// Two deliberate omissions:
//
//   • Credentials. `students.parentPortalPassword` is the guardian's app
//     password. A backup that carries it in plain text is a leaked credential
//     the moment the file is emailed, so any field whose name says "password"
//     is stripped, and the file says it was.
//   • Anything the signed-in person's role cannot read. A dataset that the
//     security rules refuse is reported as skipped rather than failing the
//     whole backup, so a partial backup is still a backup — and says it is.
// ─────────────────────────────────────────────────────────────────────────────
import { db } from "../firebase";
import { collection, query, where, getDocs, addDoc, serverTimestamp } from "firebase/firestore";
import { DATASETS, BACKUP_VERSION, cleanValue } from "./dataExportCore.js";

export * from "./dataExportCore.js";

/** Reads one dataset. Never throws: a refused or failed read comes back as `error`. */
export async function readDataset(schoolCode, dataset) {
  try {
    const snap = await getDocs(query(collection(db, dataset.id), where("schoolCode", "==", schoolCode)));
    const stats = { stripped: 0 };
    const rows = snap.docs.map((d) => ({ id: d.id, ...cleanValue(d.data(), stats) }));
    return { id: dataset.id, rows, stripped: stats.stripped };
  } catch (err) {
    return { id: dataset.id, rows: [], stripped: 0, error: err.code === "permission-denied" ? "Your role cannot read this." : err.message };
  }
}

/**
 * Builds the whole backup, one dataset at a time so progress can be shown.
 * @param {(done: number, total: number, label: string) => void} [onProgress]
 */
export async function buildBackup({ schoolCode, school, selected, onProgress }) {
  const chosen = DATASETS.filter((d) => selected.includes(d.id));
  const data = {};
  const skipped = {};
  let stripped = 0;

  for (let i = 0; i < chosen.length; i += 1) {
    onProgress?.(i, chosen.length, chosen[i].label);
    const r = await readDataset(schoolCode, chosen[i]);
    if (r.error) skipped[r.id] = r.error; else data[r.id] = r.rows;
    stripped += r.stripped;
  }
  onProgress?.(chosen.length, chosen.length, "Done");

  return {
    meta: {
      app: "Acalink",
      backupVersion: BACKUP_VERSION,
      schoolCode,
      schoolName: school?.name || "",
      exportedAt: new Date().toISOString(),
      counts: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, v.length])),
      skipped,
      credentialFieldsRemoved: stripped,
      note: "Credential fields (anything named like a password) are removed from this file on purpose.",
    },
    data,
  };
}

export function downloadJson(filename, object) {
  const blob = new Blob([JSON.stringify(object, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Records the export in the school's audit log, in the shape AuditLog.jsx reads. */
export async function logExport({ schoolCode, actorName, description }) {
  try {
    await addDoc(collection(db, "audit_logs"), {
      schoolCode, action: "data_exported", description, performedBy: actorName || "Unknown", timestamp: serverTimestamp(),
    });
  } catch (err) {
    console.error("[export] audit log write failed:", err);
  }
}
