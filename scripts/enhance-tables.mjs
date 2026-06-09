/**
 * Standardizes all JSX tables: classes, wrappers, mobile data-labels.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(__dirname, "..", "src");

function walk(dir, acc = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory() && ent.name !== "node_modules") walk(p, acc);
    else if (ent.name.endsWith(".jsx")) acc.push(p);
  }
  return acc;
}

function stripJsxText(s) {
  return s.replace(/<[^>]+>/g, "").replace(/\{[^}]+\}/g, "").replace(/\s+/g, " ").trim();
}

function extractHeaders(theadBlock) {
  const headers = [];
  const thRegex = /<th\b[^>]*>([\s\S]*?)<\/th>/gi;
  let m;
  while ((m = thRegex.exec(theadBlock)) !== null) {
    headers.push(stripJsxText(m[1]) || "Field");
  }
  return headers;
}

function addDataLabels(tbodyContent, headers) {
  if (!headers.length) return tbodyContent;
  let colIndex = 0;
  return tbodyContent.replace(/<td\b([^>]*)>/gi, (match, attrs) => {
    if (attrs.includes("data-label=")) {
      colIndex++;
      return match;
    }
    const colspanMatch = attrs.match(/colSpan=\{?(\d+)\}?/i);
    const label = (headers[colIndex] || "Field").replace(/"/g, "'");
    colIndex += colspanMatch ? parseInt(colspanMatch[1], 10) : 1;
    const cleanAttrs = attrs.trim();
    if (cleanAttrs) return `<td ${cleanAttrs} data-label="${label}">`;
    return `<td data-label="${label}">`;
  });
}

function normalizeTable(tableHtml) {
  let html = tableHtml;

  html = html.replace(/<table\b([^>]*)>/i, (match, attrs) => {
    if (/className=/.test(attrs)) {
      return match.replace(/className="([^"]*)"/, (_, cls) => {
        const cleaned = cls
          .replace(/\bw-full\b/g, "")
          .replace(/\bmin-w-\[[^\]]+\]/g, "")
          .replace(/\bmin-w-full\b/g, "")
          .replace(/\btext-(xs|sm)\b/g, "")
          .replace(/\bborder-collapse\b/g, "")
          .replace(/\bdata-table\b/g, "")
          .replace(/\bdata-table--stack\b/g, "")
          .replace(/\s+/g, " ")
          .trim();
        return `className="data-table data-table--stack${cleaned ? ` ${cleaned}` : ""}"`;
      });
    }
    return `<table className="data-table data-table--stack"${attrs}>`;
  });

  const theadMatch = html.match(/<thead\b[^>]*>([\s\S]*?)<\/thead>/i);
  if (theadMatch) {
    const headers = extractHeaders(theadMatch[1]);
    html = html.replace(/<tbody\b([^>]*)>([\s\S]*?)<\/tbody>/i, (m, a, body) => {
      return `<tbody${a}>${addDataLabels(body, headers)}</tbody>`;
    });
  }

  // Strip redundant Tailwind on th/td inside data-table (optional cleanup)
  html = html.replace(/<th className="[^"]*"/g, (m) => {
    if (m.includes("dt-th-sortable") || m.includes("SortableTh")) return m;
    return "<th";
  });

  return html;
}

function processContent(content) {
  let updated = content;

  updated = updated.replace(/<div className="overflow-x-auto">/g, '<div className="data-table-wrap">');
  updated = updated.replace(
    /<div className="card" style=\{\{\s*overflowX:\s*"auto"\s*\}\}>/g,
    '<div className="card">'
  );

  // Process each table
  updated = updated.replace(/<table\b[\s\S]*?<\/table>/gi, (tableHtml) => normalizeTable(tableHtml));

  // Wrap tables not already in data-table-wrap
  const parts = updated.split(/(<div className="data-table-wrap">[\s\S]*?<\/div>)/g);
  if (parts.length === 1) {
    updated = updated.replace(/(<table className="data-table[\s\S]*?<\/table>)/gi, (t) => {
      return `<div className="data-table-wrap">\n${t}\n</div>`;
    });
  } else {
    let result = "";
    for (const part of parts) {
      if (part.startsWith('<div className="data-table-wrap">')) {
        result += part;
      } else {
        result += part.replace(/(<table className="data-table[\s\S]*?<\/table>)/gi, (t) => {
          const before = result.slice(-80);
          if (before.includes("data-table-wrap")) return t;
          return `<div className="data-table-wrap">\n${t}\n</div>`;
        });
      }
    }
    updated = result || updated;
  }

  // Simpler second pass: wrap any bare table
  updated = updated.replace(
    /(?<!<div className="data-table-wrap">\s*)<table className="data-table/g,
    (m, offset, str) => {
      const before = str.slice(Math.max(0, offset - 60), offset);
      if (before.includes("data-table-wrap")) return m;
      return `<div className="data-table-wrap">\n<table className="data-table`;
    }
  );

  // Close wraps — match table followed by closing without double wrap
  updated = updated.replace(
    /(<div className="data-table-wrap">\s*<table[\s\S]*?<\/table>)(?!\s*<\/div>)/g,
    "$1\n</div>"
  );

  // Dedupe nested wraps
  updated = updated.replace(
    /<div className="data-table-wrap">\s*<div className="data-table-wrap">/g,
    '<div className="data-table-wrap">'
  );
  updated = updated.replace(/<\/div>\s*<\/div>\s*(?=<\/div>)/g, "</div>");

  // Fix action column alignment class
  updated = updated.replace(
    /style=\{\{\s*display:\s*"flex",\s*justifyContent:\s*"flex-end"/g,
    'className="data-table__actions" style={{ display: "flex", justifyContent: "flex-end"'
  );

  return updated;
}

const files = walk(SRC).filter((f) => fs.readFileSync(f, "utf8").includes("<table"));
let count = 0;
for (const f of files) {
  const original = fs.readFileSync(f, "utf8");
  const updated = processContent(original);
  if (updated !== original) {
    fs.writeFileSync(f, updated, "utf8");
    console.log("✓", path.relative(SRC, f));
    count++;
  }
}
console.log(`\nEnhanced ${count} files with ${files.length} total table files.`);
