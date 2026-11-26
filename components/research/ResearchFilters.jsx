'use client';

import Link from 'next/link';
import { FileSpreadsheet, FileText, Plus } from 'lucide-react';
import IconButton from '@/components/dashboard/IconButton';
import DateRangeFilter from '@/components/dashboard/DateRangeFilter';
import SearchPicker from './SearchPicker';

// The filters row at the top of the home page: which entry (Entries ▾),
// Date, Excel, PDF — and, for the master admin only, "New search" (the
// admin's page, where entries are added and read).
// `r` = useResearch(), `v` = useResearchView(r). `onExport(kind)` downloads
// the page's own table.
export default function ResearchFilters({ r, v, onExport, canExport, pdfTitle }) {
  return (
    <div className="border-b border-divider bg-background">
      <div className="flex w-full flex-wrap items-center gap-2 px-4 py-2.5 sm:px-6 lg:px-10">
        {r.listReady && r.searches.length > 0 && <SearchPicker searches={r.searches} activeId={r.activeId} onPick={r.open} />}
        {r.isAdmin && (
          <Link href="/product-research/new-search" className="inline-flex h-9 items-center gap-1.5 rounded-full bg-accent px-3 text-sm font-semibold text-white transition-colors hover:bg-accent-hover">
            <Plus size={15} /> New search
          </Link>
        )}
        <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
          <DateRangeFilter value={v.dateRange} onChange={v.setDateRange} />
          <IconButton icon={FileSpreadsheet} label="Excel" title="Download this table (filters and sort as shown) to Excel" onClick={() => onExport('xlsx')} disabled={!canExport} />
          <IconButton icon={FileText} label="PDF" title={pdfTitle || 'Download this table to PDF'} onClick={() => onExport('pdf')} disabled={!canExport} />
        </div>
      </div>
    </div>
  );
}
