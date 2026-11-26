'use client';

import { useEffect, useMemo, useState } from 'react';
import ColumnHeaderCell from '@/components/dashboard/ColumnHeaderCell';
import TablePager, { DEFAULT_PAGE_SIZE } from '@/components/dashboard/TablePager';
import styles from '@/components/dashboard/DataTable.module.css';
import { activeFilters, cellNumber, cellPasses, cellText, columnOptions, columnRange } from '@/lib/table/columnFilter';

// The research tables — the same look and behaviour as tools-5's
// DetailsTable: blue header band pinned with a green Total row under it,
// every column sortable and filterable (spreadsheet-style: sort A→Z / Z→A,
// a Min / Max range on number columns, search + tick values — each column's
// checklist offers what the OTHER filters leave), striped rows, pager footer.
//
// `columns` = [{ key, label, description?, numeric?, value(row) → raw,
//   text(row) → string shown/filtered on, render?(row) → node, tone?(row) →
//   class, total?: 'sum' | 'avg' | (rows) → string, sticky? }]
// `rows` = [{ key, ... }]. `defaultSort` = { key, dir }.
// `selectedKeys` + `onToggleRow` / `onToggleAll` show the tick column (here:
// which products the graphs compare). `onView(rows)` hears the filtered +
// sorted rows (all pages) — what the export downloads and the cards count.

const TOTAL_CELL = 'bg-[#dcfce7] px-3 py-2 font-semibold text-black whitespace-nowrap';
const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

function compare(a, b) {
  if (a == null && b == null) return 0;
  if (a == null) return 1; // blanks last, whichever way
  if (b == null) return -1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return collator.compare(String(a), String(b));
}

function totalText(col, rows) {
  if (!col.total) return '';
  if (typeof col.total === 'function') return col.total(rows);
  const nums = rows.map(col.value).filter((v) => typeof v === 'number' && Number.isFinite(v));
  if (!nums.length) return '-';
  const sum = nums.reduce((s, v) => s + v, 0);
  const v = col.total === 'avg' ? sum / nums.length : sum;
  return col.totalFormat ? col.totalFormat(v) : String(Math.round(v * 10) / 10);
}

export default function ResearchTable({
  columns, rows, defaultSort = null, emptyText = 'No rows yet.',
  selectedKeys = null, onToggleRow, onToggleAll, onView, totalLabel = 'Total',
  // What ticking means here — the dashboard: "in the graphs"; Settings: "to delete".
  tickPurpose = 'in the graphs', tickedSummary = 'in graphs',
  // Rows drawn first, outside sorting / filters / paging (an editable new row).
  pinnedRows = [],
}) {
  const [sort, setSort] = useState(defaultSort);
  const [filters, setFilters] = useState({});
  const [filterOpen, setFilterOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const selectable = !!selectedKeys;

  // Every row's cells as { raw, display } — what the filters read.
  const cellsOf = useMemo(() => {
    const m = new Map();
    for (const r of rows) {
      const cells = {};
      for (const c of columns) cells[c.key] = { raw: c.value(r), display: c.text(r) };
      m.set(r.key, cells);
    }
    return m;
  }, [rows, columns]);

  const colSig = columns.map((c) => c.key).join('\u0000');
  const applied = useMemo(() => activeFilters(filters, colSig.split('\u0000')), [filters, colSig]);
  const passes = (r, except = null) => applied.every(([key, f]) => key === except || cellPasses(f, cellsOf.get(r.key)?.[key]));
  const optionsFor = (key) => columnOptions(rows.filter((r) => passes(r, key)), (r) => cellText(cellsOf.get(r.key)[key]), (r) => cellsOf.get(r.key)[key].raw);
  const rangeFor = (key) => columnRange(rows.filter((r) => passes(r, key)), (r) => cellNumber(cellsOf.get(r.key)[key]));

  const view = useMemo(() => {
    let out = applied.length ? rows.filter((r) => applied.every(([key, f]) => cellPasses(f, cellsOf.get(r.key)[key]))) : rows;
    const col = sort && columns.find((c) => c.key === sort.key);
    if (col) {
      const sign = sort.dir === 'desc' ? -1 : 1;
      out = [...out].sort((a, b) => {
        const va = col.value(a);
        const vb = col.value(b);
        if (va == null || vb == null) return compare(va, vb); // blanks stay last
        return sign * compare(va, vb);
      });
    }
    return out;
  }, [rows, applied, sort, columns, cellsOf]);

  useEffect(() => { onView?.(view); }, [view, onView]);
  useEffect(() => { (() => setPage(1))(); }, [rows, filters, sort, pageSize]);

  const pageCount = Math.max(1, Math.ceil(view.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const pageStart = (currentPage - 1) * pageSize;
  const pageRows = view.slice(pageStart, pageStart + pageSize);
  const allChecked = selectable && pageRows.length > 0 && pageRows.every((r) => selectedKeys.has(r.key));

  return (
    <div className="overflow-hidden rounded-xl border border-divider bg-background">
      {applied.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-divider bg-action-soft px-3 py-1.5 text-xs text-foreground">
          <span>
            {applied.length} filter{applied.length === 1 ? '' : 's'} on — showing <span className="font-semibold">{view.length}</span> of {rows.length} row{rows.length === 1 ? '' : 's'}
          </span>
          <button type="button" onClick={() => setFilters({})} className="font-semibold text-link hover:underline">Clear all filters</button>
        </div>
      )}
      <div data-table-scroll className={`max-h-[70vh] overflow-auto ${filterOpen ? 'min-h-[30rem]' : ''}`}>
        <table className={`${styles.table} text-sm`}>
          <thead className="sticky top-0 z-10">
            <tr>
              {selectable && (
                <th className="w-10 bg-[#1565C0] px-2 py-1">
                  <input type="checkbox" checked={allChecked} onChange={() => onToggleAll?.(pageRows.map((r) => r.key))} className="accent-[var(--color-action)]" aria-label="Tick every row on this page" title={`Tick / untick this page's rows ${tickPurpose}`} />
                </th>
              )}
              {columns.map((col) => (
                <th key={col.key} className={`group/cell bg-[#1565C0] px-1 py-1 text-center font-medium text-white ${col.sticky ? 'sticky left-0 z-20' : ''}`}>
                  <ColumnHeaderCell
                    col={{ key: col.key, id: col.key, label: col.label, description: col.description || '' }}
                    sort={sort}
                    onSortChange={setSort}
                    filter={filters[col.key]}
                    onFilterChange={(f) => setFilters((prev) => ({ ...prev, [col.key]: f }))}
                    getFilterOptions={() => optionsFor(col.key)}
                    getFilterRange={col.numeric ? () => rangeFor(col.key) : null}
                    onFilterOpenChange={setFilterOpen}
                  />
                </th>
              ))}
            </tr>
            {view.length > 0 && columns.some((c) => c.total) && (
              <tr>
                {selectable && <td className={TOTAL_CELL} />}
                {columns.map((col, i) => (
                  <td key={col.key} className={`${TOTAL_CELL} text-center tabular-nums ${i === 0 ? 'uppercase tracking-wide' : ''}`}>
                    {i === 0 && !col.total ? totalLabel : totalText(col, view)}
                  </td>
                ))}
              </tr>
            )}
          </thead>
          <tbody>
            {/* Pinned rows (a new row being added): always first, never sorted, filtered or paged. */}
            {pinnedRows.map((r) => (
              <tr key={r.key} data-active="true">
                {selectable && <td className="px-2 py-2" />}
                {columns.map((col) => (
                  <td key={col.key} className={`px-3 py-2 ${col.wrap ? '' : 'whitespace-nowrap'} ${col.tone?.(r) || 'text-foreground'}`}>
                    {col.render ? col.render(r) : col.text(r)}
                  </td>
                ))}
              </tr>
            ))}
            {view.length === 0 && !pinnedRows.length && (
              <tr>
                <td colSpan={columns.length + (selectable ? 1 : 0)} className="px-4 py-10 text-center text-sm text-muted">
                  {rows.length === 0 ? emptyText : 'No rows match the current filters.'}
                </td>
              </tr>
            )}
            {pageRows.map((r) => (
              <tr key={r.key} data-selected={selectable && selectedKeys.has(r.key)} className="transition-colors">
                {selectable && (
                  <td className="px-2 py-2">
                    <input type="checkbox" checked={selectedKeys.has(r.key)} onChange={() => onToggleRow?.(r.key)} className="accent-[var(--color-action)]" aria-label={`Tick ${r.title || r.query || r.key} ${tickPurpose}`} />
                  </td>
                )}
                {columns.map((col) => (
                  <td key={col.key} className={`px-3 py-2 ${col.sticky ? 'sticky left-0 z-[1] bg-inherit' : ''} ${col.wrap ? '' : 'whitespace-nowrap'} ${col.tone?.(r) || 'text-foreground'}`}>
                    {col.render ? col.render(r) : col.text(r)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <TablePager
        summary={(
          <>
            {view.length === 0 ? '0 rows' : `${pageStart + 1}–${Math.min(pageStart + pageSize, view.length)} of ${view.length} row${view.length === 1 ? '' : 's'}`}
            {selectable && selectedKeys.size > 0 && ` · ${selectedKeys.size} ${tickedSummary}`}
          </>
        )}
        pageSize={pageSize}
        onPageSizeChange={setPageSize}
        currentPage={currentPage}
        pageCount={pageCount}
        onPageChange={setPage}
      />
    </div>
  );
}
