// src/services/xlsx.js
// ─────────────────────────────────────────────────────────────────────────────
// Reads the first sheet of an .xlsx workbook into rows of text, with no
// dependency. A workbook is a zip of XML files; the browser (and Node 18+)
// already ship an inflater (DecompressionStream), so the only thing to write is
// the zip directory walk and a little XML scraping — far less than a library
// that would add hundreds of kilobytes to a site used on thin connections.
//
// Only values are read (text, numbers, shared strings). Formulas show their
// cached result, which is what a school's roll contains anyway.
// ─────────────────────────────────────────────────────────────────────────────

const decoder = new TextDecoder("utf-8");

function u16(b, o) { return b[o] | (b[o + 1] << 8); }
function u32(b, o) { return (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0; }

async function inflateRaw(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Map of file name → { method, size, offset } from the zip's central directory. */
function readDirectory(b) {
  let eocd = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 65_557); i -= 1) {
    if (u32(b, i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("That file isn't a valid Excel workbook.");

  const count = u16(b, eocd + 10);
  let p = u32(b, eocd + 16);
  const files = new Map();
  for (let i = 0; i < count; i += 1) {
    if (u32(b, p) !== 0x02014b50) break;
    const method = u16(b, p + 10);
    const size = u32(b, p + 20);
    const nameLen = u16(b, p + 28);
    const extraLen = u16(b, p + 30);
    const commentLen = u16(b, p + 32);
    const offset = u32(b, p + 42);
    const name = decoder.decode(b.subarray(p + 46, p + 46 + nameLen));
    files.set(name, { method, size, offset });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return files;
}

async function extract(b, entry) {
  const o = entry.offset;
  const dataStart = o + 30 + u16(b, o + 26) + u16(b, o + 28);
  const raw = b.subarray(dataStart, dataStart + entry.size);
  if (entry.method === 0) return raw;
  if (entry.method === 8) return inflateRaw(raw);
  throw new Error("That workbook uses a compression this reader doesn't support. Save it as CSV instead.");
}

const entities = (s) => s
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
  .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'")
  .replace(/&amp;/g, "&");

/** Text of every <t> inside a fragment — a shared string can be split into runs. */
function textOf(fragment) {
  let out = "";
  for (const m of fragment.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)) out += m[1];
  return entities(out);
}

function colIndex(ref) {
  let n = 0;
  for (const ch of ref.replace(/[^A-Z]/gi, "").toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

/**
 * @param {ArrayBuffer} buffer
 * @returns {Promise<string[][]>} rows of cell text; blank cells are ""
 */
export async function readXlsxRows(buffer) {
  const b = new Uint8Array(buffer);
  const files = readDirectory(b);
  const read = async (name) => (files.has(name) ? decoder.decode(await extract(b, files.get(name))) : "");

  const shared = [];
  const sst = await read("xl/sharedStrings.xml");
  for (const m of sst.matchAll(/<si[^>]*>([\s\S]*?)<\/si>/g)) shared.push(textOf(m[1]));

  // The first sheet in workbook order; sheet1.xml when the rels can't be read.
  let sheetPath = "xl/worksheets/sheet1.xml";
  const wb = await read("xl/workbook.xml");
  const rels = await read("xl/_rels/workbook.xml.rels");
  const rid = /<sheet\b[^>]*r:id="([^"]+)"/.exec(wb)?.[1];
  if (rid) {
    const rel = new RegExp(`<Relationship\\b[^>]*Id="${rid}"[^>]*>`).exec(rels)?.[0];
    const target = /Target="([^"]+)"/.exec(rel || "")?.[1];
    if (target) sheetPath = target.startsWith("/") ? target.slice(1) : `xl/${target}`;
  }
  const sheet = await read(sheetPath);
  if (!sheet) throw new Error("Couldn't find any data in that workbook.");

  const rows = [];
  for (const rowMatch of sheet.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const cells = [];
    for (const c of rowMatch[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = c[1];
      const body = c[2] || "";
      const ref = /\br="([A-Z]+\d+)"/.exec(attrs)?.[1];
      const type = /\bt="([^"]+)"/.exec(attrs)?.[1];
      const v = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1];
      let value = "";
      if (type === "s") value = shared[Number(v)] ?? "";
      else if (type === "inlineStr") value = textOf(body);
      else if (v != null) value = entities(v);
      cells[ref ? colIndex(ref) : cells.length] = value;
    }
    const filled = Array.from(cells, (x) => x ?? "");
    if (filled.some((x) => String(x).trim() !== "")) rows.push(filled);
  }
  return rows;
}
