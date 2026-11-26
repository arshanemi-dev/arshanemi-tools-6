'use client';

import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, Loader2, Plus } from 'lucide-react';

// A searchable dropdown: type to narrow the list, ↑ ↓ to move, Enter to
// pick, Esc to close. `creatable`: a typed name that isn't in the list shows
// "+ Create “…”" — Enter (or a click) runs `onCreate(text)`, which resolves
// the new option's value (or null when it failed — it says why itself).
// The list is drawn in a layer over the page (fixed, under the input), so a
// table's own scroll area never cuts it off.
// options = [{ value, label, color? }] — `color` draws a dot (market places).
export default function ComboBox({ value, onChange, options, placeholder = 'Search…', label, creatable = false, onCreate, invalid = false, autoFocus = false }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [creating, setCreating] = useState(false);
  const [box, setBox] = useState(null);
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const listId = useId();

  const selected = options.find((o) => o.value === value) || null;
  const q = query.trim().toLowerCase();
  const shown = useMemo(() => (q ? options.filter((o) => o.label.toLowerCase().includes(q)) : options), [options, q]);
  const exact = shown.find((o) => o.label.toLowerCase() === q);
  const canCreate = creatable && q.length >= 2 && !exact;
  const items = canCreate ? [...shown, { value: '__create__', label: query.trim(), create: true }] : shown;

  const close = useCallback(() => { setOpen(false); setQuery(''); setActive(0); }, []);
  const place = useCallback(() => {
    const r = inputRef.current?.getBoundingClientRect();
    if (r) setBox({ left: r.left, top: r.bottom + 4, width: Math.max(r.width, 220) });
  }, []);
  useLayoutEffect(() => { if (open) place(); }, [open, place]);
  useEffect(() => {
    if (!open) return undefined;
    const onMove = () => place();
    const onDown = (e) => {
      if (!inputRef.current?.contains(e.target) && !listRef.current?.contains(e.target)) close();
    };
    window.addEventListener('scroll', onMove, true);
    window.addEventListener('resize', onMove);
    document.addEventListener('mousedown', onDown);
    return () => {
      window.removeEventListener('scroll', onMove, true);
      window.removeEventListener('resize', onMove);
      document.removeEventListener('mousedown', onDown);
    };
  }, [open, place, close]);

  const pick = async (item) => {
    if (!item) return;
    if (item.create) {
      if (!onCreate) return;
      setCreating(true);
      const made = await onCreate(item.label);
      setCreating(false);
      if (made != null) { onChange(made); close(); }
      return;
    }
    onChange(item.value);
    close();
  };

  const onKey = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive((i) => Math.min(items.length - 1, i + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(0, i - 1)); }
    else if (e.key === 'Enter') { e.preventDefault(); if (open) pick(exact || items[active]); else setOpen(true); }
    else if (e.key === 'Escape') { if (open) { e.preventDefault(); e.stopPropagation(); close(); } }
  };

  return (
    <div className="relative min-w-[9rem]">
      {selected?.color && !open && <span className="pointer-events-none absolute left-2.5 top-1/2 h-2.5 w-2.5 -translate-y-1/2 rounded-full" style={{ backgroundColor: selected.color }} />}
      <input
        ref={inputRef}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-label={label}
        aria-invalid={invalid}
        autoFocus={autoFocus}
        value={open ? query : selected?.label || ''}
        placeholder={open ? (selected?.label || placeholder) : placeholder}
        onChange={(e) => { setQuery(e.target.value); setActive(0); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onClick={() => setOpen(true)}
        onKeyDown={onKey}
        className={`h-8 w-full rounded-lg border bg-background py-1 pr-7 text-sm text-foreground placeholder:text-subtle focus:outline-none ${selected?.color && !open ? 'pl-6' : 'pl-2.5'} ${invalid ? 'border-neg' : 'border-divider-light focus:border-accent'}`}
      />
      <ChevronDown size={14} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-subtle" />
      {open && box && createPortal(
        <ul
          ref={listRef}
          id={listId}
          role="listbox"
          className="dropdown-panel-in fixed z-[60] max-h-64 overflow-y-auto rounded-xl border border-divider-light bg-background p-1 text-sm shadow-lg"
          style={{ left: box.left, top: box.top, width: box.width }}
        >
          {!items.length && <li className="px-2.5 py-2 text-xs text-subtle">{creatable ? 'Type a new name to create it' : 'Nothing matches'}</li>}
          {items.map((item, i) => (
            <li
              key={item.create ? '__create__' : item.value}
              role="option"
              aria-selected={item.value === value}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => { e.preventDefault(); pick(item); }}
              className={`flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-1.5 ${i === active ? 'bg-card-hover' : ''} ${item.create ? 'font-semibold text-link' : 'text-foreground'}`}
            >
              {item.create
                ? (creating ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />)
                : item.color && <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: item.color }} />}
              <span className="min-w-0 flex-1 truncate">{item.create ? `Create “${item.label}”` : item.label}</span>
              {item.value === value && !item.create && <Check size={14} className="shrink-0 text-action" />}
            </li>
          ))}
        </ul>,
        document.body,
      )}
    </div>
  );
}
