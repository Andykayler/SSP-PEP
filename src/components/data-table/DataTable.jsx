import { exportToCsv } from "./table-utils";

/* ── Icons ─────────────────────────────────────────────────────────────────── */
const IconSearch = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 15.803a7.5 7.5 0 0010.607 10.607z" />
  </svg>
);
const IconDownload = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M7.5 11.25L12 15.75m0 0l4.5-4.5M12 15.75V3" />
  </svg>
);
const IconSort = ({ dir }) => (
  <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={`dt-sort-icon${dir ? ` dt-sort-icon--${dir}` : ""}`}>
    {dir === "asc" ? <path d="M12 4l-6 8h12z" /> : dir === "desc" ? <path d="M12 20l6-8H6z" /> : <path d="M12 6l-4 5h8zm0 12l4-5H8z" opacity="0.35" />}
  </svg>
);

/** Card shell for tables */
export function DataTableCard({ children, className = "" }) {
  return <div className={`dt-card ${className}`.trim()}>{children}</div>;
}

/** Toolbar: search, slot for filters, export, clear */
export function TableToolbar({
  search,
  onSearchChange,
  searchPlaceholder = "Search records…",
  onClearFilters,
  hasActiveFilters,
  onExport,
  exportLabel = "Export CSV",
  children,
  resultCount,
}) {
  return (
    <div className="dt-toolbar">
      <div className="dt-toolbar__main">
        {onSearchChange != null && (
          <div className="dt-toolbar__search">
            <span className="dt-toolbar__search-icon"><IconSearch /></span>
            <input
              type="search"
              value={search ?? ""}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder={searchPlaceholder}
              className="dt-toolbar__search-input"
              aria-label="Search table"
            />
          </div>
        )}
        {children}
      </div>
      <div className="dt-toolbar__actions">
        {resultCount != null && (
          <span className="dt-toolbar__count">{resultCount} record{resultCount !== 1 ? "s" : ""}</span>
        )}
        {hasActiveFilters && onClearFilters && (
          <button type="button" className="dt-btn dt-btn--ghost" onClick={onClearFilters}>
            Clear filters
          </button>
        )}
        {onExport && (
          <button type="button" className="dt-btn dt-btn--outline" onClick={onExport}>
            <IconDownload /> {exportLabel}
          </button>
        )}
      </div>
    </div>
  );
}

/** Pagination footer */
export function TablePagination({
  page,
  totalPages,
  total,
  from,
  to,
  pageSize,
  pageSizeOptions = [10, 25, 50, 100],
  onPageChange,
  onPageSizeChange,
}) {
  if (total === 0) return null;

  const pages = [];
  const maxVisible = 5;
  let start = Math.max(1, page - Math.floor(maxVisible / 2));
  let end = Math.min(totalPages, start + maxVisible - 1);
  if (end - start < maxVisible - 1) start = Math.max(1, end - maxVisible + 1);
  for (let i = start; i <= end; i++) pages.push(i);

  return (
    <div className="dt-pagination" role="navigation" aria-label="Table pagination">
      <div className="dt-pagination__info">
        Showing <strong>{from}</strong>–<strong>{to}</strong> of <strong>{total}</strong>
      </div>
      <div className="dt-pagination__controls">
        {onPageSizeChange && (
          <label className="dt-pagination__size">
            <span className="sr-only">Rows per page</span>
            <select
              value={pageSize}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
              className="dt-pagination__select"
              aria-label="Rows per page"
            >
              {pageSizeOptions.map((n) => (
                <option key={n} value={n}>{n} / page</option>
              ))}
            </select>
          </label>
        )}
        <button
          type="button"
          className="dt-pagination__btn"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          aria-label="Previous page"
        >
          ←
        </button>
        {pages.map((p) => (
          <button
            key={p}
            type="button"
            className={`dt-pagination__btn${p === page ? " dt-pagination__btn--active" : ""}`}
            onClick={() => onPageChange(p)}
            aria-label={`Page ${p}`}
            aria-current={p === page ? "page" : undefined}
          >
            {p}
          </button>
        ))}
        <button
          type="button"
          className="dt-pagination__btn"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
          aria-label="Next page"
        >
          →
        </button>
      </div>
    </div>
  );
}

/** Sortable column header */
export function SortableTh({ label, sortKey, currentSort, onSort, align, className = "" }) {
  const active = currentSort?.key === sortKey;
  const dir = active ? currentSort.direction : null;
  return (
    <th
      className={`dt-th-sortable${active ? " dt-th-sortable--active" : ""} ${className}`.trim()}
      style={align ? { textAlign: align } : undefined}
    >
      <button
        type="button"
        className="dt-th-sortable__btn"
        onClick={() => onSort(sortKey)}
        aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"}
      >
        <span>{label}</span>
        <IconSort dir={dir} />
      </button>
    </th>
  );
}

/** Loading skeleton */
export function TableSkeleton({ rows = 5, cols = 5 }) {
  return (
    <div className="dt-skeleton" aria-busy="true" aria-label="Loading table data">
      <div className="dt-skeleton__head">
        {Array.from({ length: cols }).map((_, i) => (
          <div key={i} className="dt-skeleton__cell dt-skeleton__cell--head" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="dt-skeleton__row">
          {Array.from({ length: cols }).map((_, c) => (
            <div key={c} className="dt-skeleton__cell" style={{ animationDelay: `${(r * cols + c) * 40}ms` }} />
          ))}
        </div>
      ))}
    </div>
  );
}

/** Empty state inside table card */
export function TableEmpty({ icon, title = "No records found", description, action }) {
  return (
    <div className="dt-empty">
      {icon && <div className="dt-empty__icon">{icon}</div>}
      <p className="dt-empty__title">{title}</p>
      {description && <p className="dt-empty__desc">{description}</p>}
      {action && <div className="dt-empty__action">{action}</div>}
    </div>
  );
}

/** Responsive table wrapper */
export function TableWrap({ children, stack = true, noHint = false }) {
  return (
    <div className={`data-table-wrap${stack ? "" : " data-table-wrap--no-stack"}${noHint ? " data-table-wrap--no-hint" : ""}`}>
      {children}
    </div>
  );
}

/** Standardized action button */
export function TableActionBtn({ icon, label, onClick, variant = "default", disabled }) {
  return (
    <button
      type="button"
      className={`dt-action-btn dt-action-btn--${variant}`}
      onClick={onClick}
      title={label}
      aria-label={label}
      disabled={disabled}
    >
      {icon}
    </button>
  );
}

/** Status badge for table cells */
export function TableStatusBadge({ status, variant }) {
  const v = variant || "neutral";
  return (
    <span className={`dt-status dt-status--${v}`}>
      <span className="dt-status__dot" aria-hidden="true" />
      {status}
    </span>
  );
}

/** Bulk selection bar */
export function TableBulkBar({ count, onClear, children }) {
  if (!count) return null;
  return (
    <div className="dt-bulk-bar" role="status">
      <span><strong>{count}</strong> selected</span>
      <div className="dt-bulk-bar__actions">
        {children}
        <button type="button" className="dt-btn dt-btn--ghost" onClick={onClear}>Clear selection</button>
      </div>
    </div>
  );
}

/** Full table section composer */
export function DataTableSection({
  loading,
  empty,
  emptyTitle,
  emptyDescription,
  emptyAction,
  skeletonCols = 5,
  skeletonRows = 6,
  toolbar,
  pagination,
  bulkBar,
  children,
}) {
  return (
    <DataTableCard>
      {toolbar}
      {bulkBar}
      {loading ? (
        <TableSkeleton rows={skeletonRows} cols={skeletonCols} />
      ) : empty ? (
        <TableEmpty title={emptyTitle} description={emptyDescription} action={emptyAction} />
      ) : (
        <>
          <TableWrap>{children}</TableWrap>
          {pagination}
        </>
      )}
    </DataTableCard>
  );
}

export { exportToCsv };
