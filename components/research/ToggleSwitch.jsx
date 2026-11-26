'use client';

// An on / off switch (role="switch"), with its state written next to it —
// never colour alone. `busy` greys it while a change is saving.
export default function ToggleSwitch({ on, onChange, label, busy = false, onText = 'On', offText = 'Off' }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      title={label}
      disabled={busy}
      onClick={() => onChange(!on)}
      className="inline-flex items-center gap-1.5 disabled:opacity-50"
    >
      <span className={`relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors ${on ? 'bg-action' : 'bg-divider-light'}`}>
        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${on ? 'translate-x-[18px]' : 'translate-x-0.5'}`} />
      </span>
      <span className={`text-xs font-semibold ${on ? 'text-foreground' : 'text-subtle'}`}>{on ? onText : offText}</span>
    </button>
  );
}
