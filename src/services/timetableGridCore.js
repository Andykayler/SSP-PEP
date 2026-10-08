// src/services/timetableGridCore.js
// ─────────────────────────────────────────────────────────────────────────────
// Reading a timetable spreadsheet laid out the way schools draw them on paper —
// a grid, not one row per lesson:
//
//   Day      Class   | Routine | Bible | Maths | Maths | … | Break | …
//   Monday   Year 1  | Routine | Bible | Arith | Arith | … |   B   | …
//            Year 2  | …
//   Tuesday  Year 1  | …
//
// Pure; the head teacher's upload screen reads the workbook and hands the cell
// grids here. The result is the same row shape parseCsvRows() gives, so it goes
// through planTimetableImport() like any other upload.
//
//   • Columns after "Class" are periods 1, 2, 3… left to right. A break column
//     (one that only ever holds a single letter, "B", "R", "E"…) is skipped.
//   • The day is written once at the top of its block and carries down.
//   • The same class twice in a day's block (two Year 2 rows) is Year 2A and 2B,
//     in the order the school's classes are named.
//   • Subjects are written in whatever shorthand the school uses ("Arithmet",
//     "B/K", "SES"). They are matched to each class's subjects; what can't be
//     matched is returned in `unmatched` for the head teacher to map by hand.
//   • Anything right of the last period column (totals, notes) is ignored.
// ─────────────────────────────────────────────────────────────────────────────

const norm = (v) => String(v ?? "").trim().toLowerCase().replace(/\s+/g, " ");

/** A cell's text, or "" — numbers and dates in a grid are never lessons. */
const cellText = (v) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim() : "");

const STOP_WORDS = new Set(["and", "of", "the", "&"]);
// Words schools abbreviate to one another, so "Arithmet" finds "Mathematics".
const SYNONYMS = [["arithmet", "math"], ["ict", "comput"]];

/** Letters and digits only, without a plural s: "Spellings" and "Spelling" meet. */
const key = (s) => {
  const k = norm(s).replace(/[^a-z0-9]/g, "");
  return k.length > 4 && k.endsWith("s") ? k.slice(0, -1) : k;
};

function distance(a, b) {
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

const only = (list) => (list.length === 1 ? list[0] : null);

/**
 * The subject a timetable label means, out of the subjects a class takes.
 * "Arithmet" → "Mathematics", "B/K" → "Bible Knowledge", "Englsh" → "English".
 * Null when nothing fits or two subjects fit equally well.
 */
export function resolveSubject(label, subjects = []) {
  const k = key(label);
  if (k.length < 2 || !subjects.length) return null;
  const entries = subjects.map((s) => ({ subject: s, key: key(s), words: norm(s).split(/[^a-z0-9&]+/).filter((w) => w && !STOP_WORDS.has(w)) }));

  const exact = only(entries.filter((e) => e.key === k));
  if (exact) return exact.subject;

  // "Hand Wr" → Handwriting, "Agricult" → Agriculture; also tries the label's synonyms.
  const stems = [k, ...SYNONYMS.filter((g) => g.some((w) => k.length >= 4 && (k.startsWith(w) || w.startsWith(k)))).flat()];
  for (const stem of stems) {
    if (stem.length < 3) continue;
    const hit = only(entries.filter((e) => e.key.startsWith(stem)));
    if (hit) return hit.subject;
  }

  // "B/K" → Bible Knowledge, "E/Arts" → Expressive Arts, "SES" → Social and Environmental Sciences.
  const parts = norm(label).split(/[/\s]+/).filter(Boolean);
  const initials = only(entries.filter((e) => {
    if (e.words.length < 2) return false;
    if (parts.length === e.words.length) return parts.every((p, i) => e.words[i].startsWith(p.replace(/[^a-z0-9]/g, "")));
    return parts.length === 1 && k === e.words.map((w) => w[0]).join("");
  }));
  if (initials) return initials.subject;

  // A typo or two: "Englsh", "Comlputer", "Agrucult".
  if (k.length >= 5) {
    const allowed = k.length >= 8 ? 2 : 1;
    const scored = entries
      .map((e) => ({ e, d: Math.min(distance(k, e.key), distance(k, e.key.slice(0, k.length))) }))
      .filter((x) => x.d <= allowed)
      .sort((a, b) => a.d - b.d);
    if (scored.length && (scored.length === 1 || scored[0].d < scored[1].d)) return scored[0].e.subject;
  }
  return null;
}

/**
 * Which of the school's classes a label in the grid means. `count` is how many
 * times the label appears in this day's block and `index` which one this is:
 * two "Year 2" rows are the first and second of "Year 2A", "Year 2B".
 */
function resolveClass(label, index, count, classes) {
  const k = norm(label);
  const exact = classes.filter((c) => norm(c.name) === k);
  if (count === 1) {
    if (exact.length) return exact[0];
    const lettered = classes.filter((c) => norm(c.name).startsWith(k) && /^[\s-]?[a-z0-9]$/.test(norm(c.name).slice(k.length)));
    return lettered.length === 1 ? lettered[0] : null;
  }
  const lettered = classes
    .filter((c) => norm(c.name).startsWith(k) && /^[\s-]?[a-z0-9]$/.test(norm(c.name).slice(k.length)))
    .sort((a, b) => String(a.name).localeCompare(String(b.name), undefined, { numeric: true }));
  const pool = lettered.length >= count ? lettered : exact;
  return pool[index] || null;
}

/**
 * @param {{ sheet?: string, data: any[][] }[]} sheets  the workbook, cell by cell
 * @param {{ classes: {name:string, subjects?:string[]}[], subjectMap?: Record<string,string> }} options
 *   subjectMap: normalised timetable label → the subject it means, or "" to skip it.
 *   It is what the head teacher chose for the labels `unmatched` returned.
 * @returns {{ rows: object[], unmatched: {label:string, count:number}[],
 *             problems: string[], notes: string[], sheetsRead: number }}
 */
export function parseTimetableGrids(sheets, { classes = [], subjectMap = {} } = {}) {
  const rows = [];
  const problems = [];
  const notes = [];
  const unmatched = new Map();
  const unknownClasses = new Set();
  let sheetsRead = 0;

  (sheets || []).forEach(({ sheet = "", data = [] }) => {
    const grid = data.map((r) => (Array.isArray(r) ? r : []));
    const at = (r, c) => cellText(grid[r]?.[c]);

    // The header: a cell reading "Class", with the day column beside it.
    let head = null;
    for (let r = 0; r < Math.min(grid.length, 12) && !head; r++) {
      const c = grid[r].findIndex((v) => norm(cellText(v)) === "class");
      if (c > 0) head = { r, c };
    }
    if (!head) return;
    const classCol = head.c;
    const dayCol = grid[head.r].findIndex((v, i) => i < classCol && /^days?$/.test(norm(cellText(v))));
    const dayAt = dayCol >= 0 ? dayCol : classCol - 1;

    // Rows holding lessons: a class label with at least one cell to its right.
    const width = Math.max(0, ...grid.map((r) => r.length));
    const hasLesson = (r) => { for (let c = classCol + 1; c < width; c++) if (at(r, c)) return true; return false; };
    const dataRows = [];
    for (let r = head.r + 1; r < grid.length; r++) if (at(r, classCol) && hasLesson(r)) dataRows.push(r);
    if (!dataRows.length) return;
    sheetsRead += 1;

    // Period columns: everything after "Class" up to the last one with a lesson,
    // minus the break columns, which only ever hold a single letter.
    // The time headers above the lessons mark where the week ends; totals and
    // notes to the right of them are not lessons.
    let headerEnd = classCol;
    for (let r = head.r; r < dataRows[0]; r++) for (let c = width - 1; c > headerEnd; c--) if (grid[r][c] != null && grid[r][c] !== "") { headerEnd = c; break; }
    const edge = headerEnd > classCol ? headerEnd : width - 1;
    let lastCol = classCol;
    dataRows.forEach((r) => { for (let c = edge; c > lastCol; c--) if (at(r, c)) { lastCol = c; break; } });
    const periodCols = [];
    for (let c = classCol + 1; c <= lastCol; c++) {
      const values = dataRows.map((r) => at(r, c)).filter(Boolean);
      if (!(values.length && values.every((v) => v.length <= 1))) periodCols.push(c);
    }
    notes.push(`${sheet ? `"${sheet}": ` : ""}${periodCols.length} period columns (break columns skipped), numbered 1–${periodCols.length} from the left.`);

    // How often each class appears in each day's block, to tell Year 2 from Year 2.
    let day = "";
    const blocks = [];
    dataRows.forEach((r) => {
      const d = at(r, dayAt);
      if (d || !blocks.length) { day = d || day; blocks.push({ day, rows: [] }); }
      blocks[blocks.length - 1].rows.push(r);
    });

    blocks.forEach((block) => {
      const counts = new Map();
      block.rows.forEach((r) => counts.set(norm(at(r, classCol)), (counts.get(norm(at(r, classCol))) || 0) + 1));
      const seenInBlock = new Map();
      block.rows.forEach((r) => {
        const label = at(r, classCol);
        const index = seenInBlock.get(norm(label)) || 0;
        seenInBlock.set(norm(label), index + 1);
        const cls = resolveClass(label, index, counts.get(norm(label)), classes);
        if (!cls) {
          if (!unknownClasses.has(norm(label))) {
            unknownClasses.add(norm(label));
            problems.push(counts.get(norm(label)) > 1
              ? `"${label}" is listed ${counts.get(norm(label))} times for a day — name the school's classes like "${label} A" and "${label} B" to tell them apart.`
              : `The school has no class called "${label}", so its lessons were skipped.`);
          }
          return;
        }
        periodCols.forEach((c, i) => {
          const raw = at(r, c);
          if (!raw) return;
          const mapped = subjectMap[norm(raw)];
          if (mapped === "") return; // chosen to skip
          const subject = mapped || resolveSubject(raw, cls.subjects || []);
          if (!subject) {
            unmatched.set(raw, { label: raw, count: (unmatched.get(raw)?.count || 0) + 1 });
            return;
          }
          rows.push({
            __line: `${cls.name} ${block.day} period ${i + 1}`,
            class: cls.name, day: block.day, period: String(i + 1), subject, teacher: "", venue: "",
          });
        });
      });
    });
  });

  // "Spellings" and "spellings " are one label to ask about.
  const merged = new Map();
  [...unmatched.values()].forEach(({ label, count }) => {
    const k = norm(label);
    merged.set(k, { label: merged.get(k)?.label || label, count: (merged.get(k)?.count || 0) + count });
  });
  return {
    rows,
    unmatched: [...merged.values()].sort((a, b) => b.count - a.count),
    problems,
    notes,
    sheetsRead,
  };
}

export const normLabel = norm;
