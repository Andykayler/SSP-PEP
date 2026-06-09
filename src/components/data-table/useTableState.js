import { useState, useMemo, useCallback } from "react";
import { sortRows, filterRows, paginateRows } from "./table-utils";

/**
 * Hook for client-side table search, sort, filter, and pagination.
 */
export function useTableState(data = [], options = {}) {
  const {
    searchKeys = [],
    initialPageSize = 10,
    initialSort = { key: null, direction: "asc" },
    filterFn = null,
  } = options;

  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(initialPageSize);
  const [sort, setSort] = useState(initialSort);
  const [filters, setFilters] = useState({});

  const setFilter = useCallback((key, value) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
    setPage(1);
  }, []);

  const clearFilters = useCallback(() => {
    setSearch("");
    setFilters({});
    setPage(1);
    setSort(initialSort);
  }, [initialSort]);

  const toggleSort = useCallback((key) => {
    setSort((prev) => {
      if (prev.key !== key) return { key, direction: "asc" };
      if (prev.direction === "asc") return { key, direction: "desc" };
      return { key: null, direction: "asc" };
    });
    setPage(1);
  }, []);

  const processed = useMemo(() => {
    let rows = [...data];
    rows = filterRows(rows, search, searchKeys);
    if (filterFn) rows = rows.filter((row) => filterFn(row, filters));
    rows = sortRows(rows, sort.key, sort.direction);
    return rows;
  }, [data, search, searchKeys, filters, filterFn, sort]);

  const pagination = useMemo(
    () => paginateRows(processed, page, pageSize),
    [processed, page, pageSize]
  );

  const hasActiveFilters =
    !!search.trim() ||
    Object.values(filters).some((v) => v != null && v !== "" && v !== "all");

  return {
    search,
    setSearch,
    filters,
    setFilter,
    clearFilters,
    hasActiveFilters,
    sort,
    toggleSort,
    page,
    setPage,
    pageSize,
    setPageSize,
    processed,
    pagination,
    total: processed.length,
  };
}
