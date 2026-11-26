'use client';

import Link from 'next/link';
import { FileSpreadsheet, FileText, Plus } from 'lucide-react';
import IconButton from '@/components/dashboard/IconButton';
import DateRangeFilter from '@/components/dashboard/DateRangeFilter';
import SearchPicker, { MY_ENTRIES_HREF } from './SearchPicker';

const PILL = 'inline-flex h-9 items-center gap-1.5 rounded-full bg-accent px-3 text-sm font-semibold text-white transition-colors hover:bg-accent-hover';

// The filters row at the top of the home page: which entries (Entries ▾ —
// pick several, ONLY the user's saved ones; nothing ticked at first),
// "Add Entries" (to My Entries, where they save more), Date, Excel, PDF —
// and, for the master admin only, "New search" (the admin's page, where
// entries are added and read).
// `r` = useResearch(), `v` = useResearchView(r). `onExport(kind)` downloads
// the page's own table.
export default function ResearchFilters({ r, v, onExport, canExport, pdfTitle }) {
  return (
    <div className="border-b border-divider bg-background">
      <div className="flex w-full flex-wrap items-center gap-2 px-4 py-2.5 sm:px-6 lg:px-10">
        {r.listReady && r.searches.length > 0 && <SearchPicker searches={r.searches} picked={r.picked} onPick={r.pick} />}
        {r.listReady && r.allSearches.length > 0 && (
          <Link href={MY_ENTRIES_HREF} className={PILL} title="Save more entries to your list — or remove some — on My Entries">
            <Plus size={15} /> Add Entries
          </Link>
        )}
        {r.isAdmin && (
          <Link href="/product-research/new-search" className={PILL}>
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
