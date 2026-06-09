/** Client-side table helpers — sort, filter, paginate, export */

export function sortRows(rows, sortKey, direction = "asc") {
  if (!sortKey) return rows;
  const mul = direction === "desc" ? -1 : 1;
  return [...rows].sort((a, b) => {
    const av = getCellValue(a, sortKey);
    const bv = getCellValue(b, sortKey);
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    if (typeof av === "number" && typeof bv === "number") return (av - bv) * mul;
    const as = String(av).toLowerCase();
    const bs = String(bv).toLowerCase();
    if (as < bs) return -1 * mul;
    if (as > bs) return 1 * mul;
    return 0;
  });
}

function getCellValue(row, key) {
  if (typeof key === "function") return key(row);
  return row[key];
}

export function filterRows(rows, search, searchKeys = []) {
  if (!search?.trim()) return rows;
  const q = search.trim().toLowerCase();
  return rows.filter((row) =>
    searchKeys.some((k) => {
      const v = getCellValue(row, k);
      return v != null && String(v).toLowerCase().includes(q);
    })
  );
}

export function paginateRows(rows, page = 1, pageSize = 10) {
  const total = rows.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = (safePage - 1) * pageSize;
  return {
    rows: rows.slice(start, start + pageSize),
    page: safePage,
    pageSize,
    total,
    totalPages,
    from: total === 0 ? 0 : start + 1,
    to: Math.min(start + pageSize, total),
  };
}

export function exportToCsv(rows, columns, filename = "export.csv") {
  if (!rows.length) return;
  const header = columns.map((c) => c.label).join(",");
  const body = rows
    .map((row) =>
      columns
        .map((c) => {
          const v = getCellValue(row, c.key);
          const s = v == null ? "" : String(v).replace(/"/g, '""');
          return `"${s}"`;
        })
        .join(",")
    )
    .join("\n");
  const blob = new Blob([`${header}\n${body}`], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export const STATUS_VARIANTS = {
  active: "success",
  approved: "success",
  paid: "success",
  completed: "success",
  present: "success",
  pending: "warning",
  processing: "warning",
  overdue: "danger",
  rejected: "danger",
  suspended: "danger",
  inactive: "danger",
  absent: "danger",
  draft: "neutral",
  archived: "neutral",
};

export function statusVariant(status = "") {
  const key = String(status).toLowerCase().replace(/\s+/g, "_");
  return STATUS_VARIANTS[key] || "neutral";
}
