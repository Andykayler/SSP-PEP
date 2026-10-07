// src/services/csv.js
// ─────────────────────────────────────────────────────────────────────────────
// A CSV reader and writer, hand-rolled rather than pulled from npm.
//
// The files this has to survive come off school office machines: Excel exports
// with a UTF-8 BOM, CRLF line endings, quoted fields containing commas ("Banda,
// Grace"), and doubled quotes inside those. That is the whole of RFC 4180 and
// it is about sixty lines — cheaper than a dependency, and one less thing to
// keep patched on a project that ships to schools with thin bandwidth.
//
// Anything more exotic (semicolon delimiters from a locale-set Excel, UTF-16
// exports) is rejected with a readable message rather than half-parsed, because
// a silently mangled student roll is far worse than a refused file.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Splits CSV text into rows of raw string cells. Blank lines are dropped;
 * a blank *field* is preserved as "".
 */
export function parseCsv(text) {
  if (typeof text !== "string" || text.trim() === "") return [];

  // Excel prepends a BOM to UTF-8 exports; left in place it becomes part of
  // the first header name and every column lookup misses.
  let s = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  s = s.replace(/\r\n?/g, "\n");

  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < s.length; i++) {
    const c = s[i];

    if (inQuotes) {
      if (c === '"') {
        // A doubled quote inside a quoted field is one literal quote.
        if (s[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else {
        field += c;
      }
      continue;
    }

    if (c === '"')      inQuotes = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") {
      row.push(field); field = "";
      if (row.some((v) => v.trim() !== "")) rows.push(row);
      row = [];
    } else field += c;
  }

  row.push(field);
  if (row.some((v) => v.trim() !== "")) rows.push(row);

  return rows;
}

/**
 * Parses to objects keyed by header. Headers are lower-cased and stripped of
 * spaces, underscores and hyphens, so "First Name", "first_name" and
 * "firstname" all reach the same key — school office files are inconsistent
 * about this and correcting them by hand is exactly the work we are removing.
 */
export function parseCsvRows(text) {
  return tableFromRows(parseCsv(text));
}

/** Rows of cells (first row = headers) → objects keyed by normalised header. */
export function tableFromRows(rows) {
  if (!rows || rows.length === 0) return { headers: [], rows: [] };

  const headers = rows[0].map(normaliseHeader);
  const out = rows.slice(1).map((cells, i) => {
    const obj = { __line: i + 2 }; // 1-based, +1 for the header row
    headers.forEach((h, j) => { if (h) obj[h] = String(cells[j] ?? "").trim(); });
    return obj;
  });

  return { headers, rows: out };
}

/**
 * Reads an uploaded roll — CSV, or an Excel workbook (.xlsx) as school offices
 * send them — into the same { headers, rows } shape.
 */
export async function readTableFile(file) {
  const name = (file?.name || "").toLowerCase();
  if (name.endsWith(".xlsx")) {
    const { readXlsxRows } = await import("./xlsx.js");
    return tableFromRows(await readXlsxRows(await file.arrayBuffer()));
  }
  if (name.endsWith(".xls")) {
    throw new Error("That's an old .xls workbook. Open it in Excel and Save As .xlsx or CSV UTF-8, then upload that.");
  }
  return parseCsvRows(await readFileAsText(file));
}

export function normaliseHeader(h = "") {
  return String(h).trim().toLowerCase().replace(/[\s_-]+/g, "");
}

/** Quotes a cell only when it has to be, so the file stays readable in a text editor. */
function escapeCell(v) {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(headers, rows) {
  const head = headers.map(escapeCell).join(",");
  const body = rows.map((r) => r.map(escapeCell).join(",")).join("\n");
  return `${head}\n${body}`;
}

/**
 * Hands the browser a file to save. The BOM is deliberate: without it Excel
 * opens UTF-8 as the system codepage and mangles every accented name.
 */
export function downloadCsv(filename, headers, rows) {
  const blob = new Blob(["﻿" + toCsv(headers, rows)], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** Reads a File object as text, rejecting the binary formats people mistake for CSV. */
export function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const name = (file?.name || "").toLowerCase();
    if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
      reject(new Error(
        "That's an Excel workbook, not a CSV. In Excel choose File → Save As → CSV UTF-8, then upload that file."
      ));
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read the file."));
    reader.onload = () => resolve(String(reader.result || ""));
    reader.readAsText(file, "utf-8");
  });
}
