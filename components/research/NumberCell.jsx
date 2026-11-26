'use client';

import { useRef, useState } from 'react';

// A small number box for a table cell, with a word after it ("days").
//   onChange(text)  → a live box (the row being added / edited: Save saves)
//   onCommit(text)  → saves by itself: on Enter or on leaving the box, only
//                     when the text changed; Escape puts the saved value back.
//                     The caller checks the text (a bad one: say why, keep
//                     the saved value).
// `value` = the number shown (null / '' = empty, the placeholder shows).
export default function NumberCell({ value, onChange = null, onCommit = null, placeholder = '', suffix = '', label, min = 0, max, busy = false, invalid = false }) {
  const saved = value == null ? '' : String(value);
  const [draft, setDraft] = useState(null); // null = not typing
  const cancel = useRef(false);
  const live = !!onChange;
  const text = live ? saved : draft ?? saved;

  const commit = () => {
    if (cancel.current) { cancel.current = false; setDraft(null); return; }
    if (draft != null && draft.trim() !== saved) onCommit?.(draft.trim());
    setDraft(null);
  };

  return (
    <span className="inline-flex items-center gap-1.5">
      <input
        type="number"
        inputMode="numeric"
        step={1}
        min={min}
        max={max}
        value={text}
        placeholder={placeholder}
        disabled={busy}
        aria-label={label}
        aria-invalid={invalid}
        title={label}
        onChange={(e) => (live ? onChange(e.target.value) : setDraft(e.target.value))}
        onBlur={live ? undefined : commit}
        onKeyDown={(e) => {
          if (live) return;
          if (e.key === 'Enter') e.currentTarget.blur();
          if (e.key === 'Escape') { cancel.current = true; e.currentTarget.blur(); }
        }}
        className={`h-8 w-16 rounded-lg border bg-background px-2 text-center text-sm tabular-nums text-foreground placeholder:text-subtle focus:outline-none disabled:opacity-50 ${invalid ? 'border-neg' : 'border-divider-light focus:border-accent'}`}
      />
      {suffix && <span className="whitespace-nowrap text-xs text-muted">{suffix}</span>}
    </span>
  );
}
