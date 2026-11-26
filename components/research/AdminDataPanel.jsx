'use client';

import { useState } from 'react';
import { Database, Eraser, History, ShieldAlert, Trash2 } from 'lucide-react';
import { useToast } from '@/components/admin/Toast';
import ConfirmDialog from '@/components/admin/ConfirmDialog';
import { adminAction } from '@/lib/research/apiClient';
import { fmtInt } from '@/lib/research/format';

// Settings › All data — the master admin only (the API checks the role too).
// Storage numbers, then three tools, each confirmed first:
//   Clean up    — data no user's search uses any more, and its daily reads
//                 (scraping credits spent every day for nobody).
//   Old history — every snapshot older than 30 / 90 / 180 / 365 days.
//   Everything  — all Product Research data (type DELETE). Accounts and coins
//                 live in the admin panel and are not touched.

const TRIM = [30, 90, 180, 365];
const size = (bytes) => (bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);

function Stat({ label, value, sub }) {
  return (
    <div className="rounded-2xl border border-divider bg-background p-3">
      <p className="text-xs text-muted">{label}</p>
      <p className="text-xl font-bold tabular-nums text-foreground">{value}</p>
      {sub && <p className="text-[11px] text-subtle">{sub}</p>}
    </div>
  );
}

function resultText(action, r) {
  if (action === 'clean-unused') return r.deletedTracks ? `Removed ${fmtInt(r.deletedTracks)} unused saved lists (${size(r.freedBytes)}) · ${fmtInt(r.dailyReads)} daily reads left` : `Nothing unused to remove · ${fmtInt(r.dailyReads)} daily reads`;
  if (action === 'trim') return r.snapshots ? `Deleted ${fmtInt(r.snapshots)} old daily snapshots in ${fmtInt(r.tracks)} lists${r.products ? ` · ${fmtInt(r.products)} products had none left and went` : ''}` : 'No snapshots that old — nothing deleted';
  return `Deleted all Product Research data (${fmtInt(r.deleted)} files, ${size(r.bytes)})`;
}

export default function AdminDataPanel({ storage: initial, onChanged }) {
  const { addToast } = useToast();
  const [storage, setStorage] = useState(initial);
  const [days, setDays] = useState(180);
  const [confirm, setConfirm] = useState(null); // 'clean-unused' | 'trim' | 'wipe'
  const [working, setWorking] = useState(false);
  const s = storage || initial || {};
  const unused = (s.unusedTracks || 0) + (s.unusedReads || 0);

  const run = async () => {
    const action = confirm;
    setWorking(true);
    const res = await adminAction(action === 'trim' ? { action, days } : action === 'wipe' ? { action, confirm: 'DELETE' } : { action });
    setWorking(false);
    setConfirm(null);
    if (!res.ok) { addToast(res.data?.error || 'That didn’t work — try again.', 'error'); return; }
    setStorage(res.data.storage);
    addToast(resultText(action, res.data.result));
    onChanged?.();
  };

  const DIALOG = {
    'clean-unused': {
      title: 'Clean up unused data?',
      description: `Deletes ${fmtInt(s.unusedTracks || 0)} saved lists no user's search uses any more, and stops ${fmtInt(s.unusedReads || 0)} daily reads that nobody needs (they spend scraping credits every day). Nobody's searches change.`,
      label: 'Clean up',
    },
    trim: {
      title: `Delete history older than ${days} days?`,
      description: `Every daily snapshot (rank, price, rating, reviews, bought) older than ${days} days is deleted, for every user. Rank moves over longer periods will show “-” after this. This can’t be undone.`,
      label: 'Delete old history',
    },
    wipe: {
      title: 'Delete ALL Product Research data?',
      description: 'Every user’s searches, every saved product and all its history, and the daily-read list — gone. Accounts and coins are in the admin panel and are not touched. This can’t be undone.',
      label: 'Delete everything',
    },
  };
  const dialog = confirm ? DIALOG[confirm] : null;

  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-divider bg-surface p-4">
      <div className="flex items-center gap-2">
        <ShieldAlert size={18} className="text-accent" />
        <h2 className="text-base font-semibold text-foreground">All data</h2>
        <span className="rounded-full bg-card px-2 py-0.5 text-[11px] font-semibold text-muted">Master admin only</span>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Stat label="Users with searches" value={fmtInt(s.users || 0)} />
        <Stat label="Saved lists" value={fmtInt(s.tracks || 0)} sub="one per market place / link + page range" />
        <Stat label="Daily reads" value={fmtInt(s.dailyReads || 0)} sub="read again every day" />
        <Stat label="Unused" value={fmtInt(unused)} sub={`${fmtInt(s.unusedTracks || 0)} lists · ${fmtInt(s.unusedReads || 0)} daily reads`} />
        <Stat label="Storage used" value={size(s.bytes || 0)} />
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <div className="flex flex-col gap-2 rounded-xl border border-divider bg-background p-3">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground"><Eraser size={15} /> Clean up unused data</p>
          <p className="text-xs text-muted">Data nobody’s search uses any more, and daily reads for nobody — saves storage and scraping credits. Nobody loses anything they track.</p>
          <button type="button" disabled={!unused} onClick={() => setConfirm('clean-unused')} className="mt-auto inline-flex w-fit items-center gap-1.5 rounded-full bg-action px-3 py-1.5 text-sm font-semibold text-white hover:bg-action-hover disabled:opacity-40">
            <Database size={14} /> {unused ? `Clean up ${fmtInt(unused)}` : 'Nothing unused'}
          </button>
        </div>

        <div className="flex flex-col gap-2 rounded-xl border border-divider bg-background p-3">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground"><History size={15} /> Delete old history</p>
          <p className="text-xs text-muted">Daily snapshots older than the age you pick, for every user. Searches stay; their older days go.</p>
          <div className="mt-auto flex flex-wrap items-center gap-2">
            <label className="inline-flex items-center gap-1.5 text-xs text-muted">
              Older than
              <select value={days} onChange={(e) => setDays(Number(e.target.value))} className="rounded-md bg-card px-1.5 py-1 font-semibold text-foreground focus:outline-none focus:ring-1 focus:ring-accent">
                {TRIM.map((d) => <option key={d} value={d}>{d} days</option>)}
              </select>
            </label>
            <button type="button" onClick={() => setConfirm('trim')} className="inline-flex items-center gap-1.5 rounded-full border border-neg/40 px-3 py-1.5 text-sm font-semibold text-neg hover:bg-neg/10">
              <Trash2 size={14} /> Delete
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-2 rounded-xl border border-neg/30 bg-neg/5 p-3">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-neg"><Trash2 size={15} /> Delete everything</p>
          <p className="text-xs text-muted">All Product Research data for every user — a fresh start. Accounts and coins are not touched. You’ll type DELETE to confirm.</p>
          <button type="button" onClick={() => setConfirm('wipe')} className="mt-auto inline-flex w-fit items-center gap-1.5 rounded-full bg-neg px-3 py-1.5 text-sm font-semibold text-white hover:opacity-90">
            <Trash2 size={14} /> Delete all data
          </button>
        </div>
      </div>

      <ConfirmDialog
        open={!!dialog}
        title={dialog?.title}
        description={dialog?.description}
        confirmText={confirm === 'wipe' ? 'DELETE' : undefined}
        confirmLabel={dialog?.label}
        loadingLabel="Working…"
        loading={working}
        onCancel={() => setConfirm(null)}
        onConfirm={run}
      />
    </section>
  );
}
