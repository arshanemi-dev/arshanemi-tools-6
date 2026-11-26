'use client';

import { useEffect, useMemo, useState } from 'react';
import { CategoryScale, Chart as ChartJS, LinearScale, LineController, LineElement, PointElement, Tooltip } from 'chart.js';
import { Line } from 'react-chartjs-2';
import { Eye, EyeOff } from 'lucide-react';
import { fmtAnyDate } from '@/lib/table/dates';
import { compact } from '@/lib/research/format';

// Only what a line chart needs (Chart.js tree-shaking).
ChartJS.register(LineController, LineElement, PointElement, CategoryScale, LinearScale, Tooltip);

// Product Research's line chart (Chart.js). One line per product:
//  - `series` = [{ key, title, slot, points: [{ t: 'YYYY-MM-DD', value }] }].
//    `slot` (0–7) picks the validated colour --series-N (app/globals.css), so
//    a product keeps its colour whatever else is switched on or off. The
//    colours are read from the page's theme, light or dark, and re-read when
//    it changes.
//  - A day a product has no value is a gap in its line, never a 0.
//  - `invert` (rank): #1 at the top — climbing the listing reads as going up.
//  - Hover anywhere: a guide line on that day + a tooltip with every shown
//    product's value, best first.
//  - `toggles`: a chip per product turns its line on / off, plus All on /
//    All off. Names are always written (identity is never colour alone); with
//    2–4 lines shown each line's name is also written at its end.
// `days` = every day of the range (so the x axis keeps its spacing); left
// out, it is the days the points have.

const VARS = ['--series-1', '--series-2', '--series-3', '--series-4', '--series-5', '--series-6', '--series-7', '--series-8'];
const short = (s, n) => (String(s).length > n ? `${String(s).slice(0, n - 1)}…` : String(s));

function readColors() {
  if (typeof window === 'undefined') return null;
  const css = getComputedStyle(document.documentElement);
  const v = (name, fallback) => css.getPropertyValue(name).trim() || fallback;
  return {
    series: VARS.map((name, i) => v(name, ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948'][i])),
    grid: v('--color-divider', '#e2e8f0'),
    text: v('--color-subtle', '#64748b'),
    ink: v('--color-foreground', '#0f172a'),
    muted: v('--color-muted', '#475569'),
    surface: v('--color-background', '#ffffff'),
  };
}

// The theme's colours, kept up to date when the theme switches (ThemeContext
// sets data-theme / CSS variables on <html>). Shared with HistoryTrendChart.
export function useThemeColors() {
  const [colors, setColors] = useState(null);
  useEffect(() => {
    const update = () => setColors(readColors());
    update();
    const mo = new MutationObserver(update);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'style', 'class'] });
    return () => mo.disconnect();
  }, []);
  return colors;
}

// Hover guide line: a dashed line down the hovered day.
export const hoverLine = {
  id: 'hoverLine',
  afterDatasetsDraw(chart) {
    const active = chart.tooltip?.getActiveElements?.() || [];
    if (!active.length) return;
    const { ctx, chartArea } = chart;
    const x = active[0].element.x;
    ctx.save();
    ctx.setLineDash([3, 3]);
    ctx.lineWidth = 1;
    ctx.strokeStyle = chart.options.plugins.hoverLine?.color || '#94a3b8';
    ctx.beginPath();
    ctx.moveTo(x, chartArea.top);
    ctx.lineTo(x, chartArea.bottom);
    ctx.stroke();
    ctx.restore();
  },
};

// End labels: each shown line's name at its last point (2–4 lines shown),
// nudged apart so they never overlap.
const endLabels = {
  id: 'endLabels',
  afterDatasetsDraw(chart) {
    const opts = chart.options.plugins.endLabels;
    if (!opts?.enabled) return;
    const { ctx, chartArea } = chart;
    const items = [];
    chart.data.datasets.forEach((ds, i) => {
      if (!chart.isDatasetVisible(i)) return;
      const meta = chart.getDatasetMeta(i);
      for (let j = ds.data.length - 1; j >= 0; j -= 1) {
        if (ds.data[j] != null && meta.data[j]) { items.push({ y: meta.data[j].y, text: short(ds.label, 18), color: ds.borderColor }); break; }
      }
    });
    if (items.length < 2 || items.length > 4) return;
    items.sort((a, b) => a.y - b.y);
    for (let k = 1; k < items.length; k += 1) if (items[k].y - items[k - 1].y < 13) items[k].y = items[k - 1].y + 13;
    ctx.save();
    ctx.font = '11px ui-sans-serif, system-ui, sans-serif';
    ctx.textBaseline = 'middle';
    for (const it of items) {
      ctx.fillStyle = it.color;
      ctx.beginPath();
      ctx.arc(chartArea.right + 10, it.y, 3.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = opts.color;
      ctx.fillText(it.text, chartArea.right + 18, it.y);
    }
    ctx.restore();
  },
};

// `fill` = grow to the height the parent gives (the parent must be a flex
// column); `height` is then the smallest it gets.
export default function LineChart({ series = [], days: daysIn = null, invert = false, format = (v) => String(v), toggles = false, height = 300, fill = false, emptyText = 'No history for this range yet — snapshots build up day by day.' }) {
  const colors = useThemeColors();
  const [hidden, setHidden] = useState(() => new Set());
  const drawn = useMemo(() => series.filter((s) => s.points.length), [series]);
  const days = useMemo(() => daysIn || [...new Set(drawn.flatMap((s) => s.points.map((p) => p.t)))].sort(), [daysIn, drawn]);
  const shownCount = drawn.filter((s) => !hidden.has(s.key)).length;
  const reduceMotion = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  const data = useMemo(() => {
    if (!colors) return null;
    const many = days.length > 31;
    return {
      labels: days,
      datasets: drawn.map((s) => {
        const color = colors.series[(s.slot ?? 0) % 8];
        const byDay = new Map(s.points.map((p) => [p.t, p.value]));
        const values = days.map((d) => (byDay.has(d) ? byDay.get(d) : null));
        return {
          key: s.key,
          label: s.title,
          data: values,
          hidden: hidden.has(s.key),
          borderColor: color,
          backgroundColor: color,
          borderWidth: 2,
          tension: 0.25,
          spanGaps: false,
          // A lone day (gaps both sides) always gets a visible dot; otherwise
          // small dots, none on a long range.
          pointRadius: (ctx) => {
            const i = ctx.dataIndex;
            const lone = values[i] != null && values[i - 1] == null && values[i + 1] == null;
            return lone ? 4 : many ? 0 : 2.5;
          },
          pointHoverRadius: 5,
          pointBorderColor: colors.surface,
          pointBorderWidth: 2,
          pointHoverBorderWidth: 2,
        };
      }),
    };
  }, [colors, days, drawn, hidden]);

  const options = useMemo(() => {
    if (!colors) return null;
    const labelled = shownCount >= 2 && shownCount <= 4;
    return {
      responsive: true,
      maintainAspectRatio: false,
      animation: reduceMotion ? false : { duration: 250 },
      interaction: { mode: 'index', intersect: false },
      layout: { padding: { top: 6, right: labelled ? 130 : 8 } },
      scales: {
        x: {
          grid: { display: false },
          border: { color: colors.grid },
          ticks: { color: colors.text, maxRotation: 0, autoSkip: true, maxTicksLimit: 7, font: { size: 10.5 }, callback: (_, i) => fmtAnyDate(days[i]).replace(/\s\d{4}$/, '') },
        },
        y: {
          reverse: invert,
          grace: '5%',
          grid: { color: colors.grid },
          border: { display: false },
          ticks: { color: colors.text, maxTicksLimit: 6, font: { size: 10.5 }, precision: 0, callback: (v) => (invert ? `#${v}` : compact(v)) },
        },
      },
      plugins: {
        legend: { display: false },
        hoverLine: { color: colors.text },
        endLabels: { enabled: labelled, color: colors.muted },
        tooltip: {
          backgroundColor: colors.surface,
          titleColor: colors.ink,
          bodyColor: colors.muted,
          borderColor: colors.grid,
          borderWidth: 1,
          padding: 10,
          boxPadding: 4,
          usePointStyle: true,
          filter: (item) => item.parsed.y != null,
          itemSort: (a, b) => (invert ? a.parsed.y - b.parsed.y : b.parsed.y - a.parsed.y),
          callbacks: {
            title: (items) => (items[0] ? fmtAnyDate(days[items[0].dataIndex]) : ''),
            label: (item) => ` ${short(item.dataset.label, 42)}: ${format(item.parsed.y)}`,
            labelColor: (item) => ({ borderColor: item.dataset.borderColor, backgroundColor: item.dataset.borderColor }),
          },
        },
      },
    };
  }, [colors, days, invert, format, shownCount, reduceMotion]);

  const size = fill ? { minHeight: height } : { height };
  if (!drawn.length) {
    return <div className={`flex items-center justify-center rounded-xl border border-dashed border-divider text-center text-xs text-subtle ${fill ? 'flex-1' : ''}`} style={size}>{emptyText}</div>;
  }

  const toggle = (key) => setHidden((cur) => {
    const next = new Set(cur);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

  return (
    <div className={`flex flex-col gap-2 ${fill ? 'min-h-0 flex-1' : ''}`}>
      {toggles && drawn.length > 1 && (
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Lines on the chart">
          <button type="button" onClick={() => setHidden(new Set())} disabled={!hidden.size} className="inline-flex items-center gap-1 rounded-full border border-divider-light px-2.5 py-1 text-[11px] font-semibold text-foreground hover:bg-card-hover disabled:opacity-40">
            <Eye size={12} /> All on
          </button>
          <button type="button" onClick={() => setHidden(new Set(drawn.map((s) => s.key)))} disabled={hidden.size === drawn.length} className="inline-flex items-center gap-1 rounded-full border border-divider-light px-2.5 py-1 text-[11px] font-semibold text-foreground hover:bg-card-hover disabled:opacity-40">
            <EyeOff size={12} /> All off
          </button>
          <span className="mx-0.5 h-4 w-px bg-divider" />
          {drawn.map((s) => {
            const on = !hidden.has(s.key);
            const color = colors?.series[(s.slot ?? 0) % 8];
            return (
              <button
                key={s.key}
                type="button"
                onClick={() => toggle(s.key)}
                aria-pressed={on}
                title={`${on ? 'Hide' : 'Show'} ${s.title}`}
                className={`inline-flex max-w-[15rem] items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] transition-colors ${on ? 'border-divider-light bg-background text-foreground hover:bg-card-hover' : 'border-dashed border-divider text-subtle line-through hover:text-muted'}`}
              >
                <span className="h-2.5 w-2.5 shrink-0 rounded-full border-2" style={{ borderColor: color, backgroundColor: on ? color : 'transparent' }} />
                <span className="truncate">{s.title}</span>
              </button>
            );
          })}
        </div>
      )}
      <div className={`relative w-full ${fill ? 'min-h-0 flex-1 overflow-hidden' : ''}`} style={size}>
        {data && options
          ? <Line data={data} options={options} plugins={[hoverLine, endLabels]} aria-label="Line chart" role="img" />
          : <div className="h-full w-full animate-pulse rounded-xl bg-card" />}
        {shownCount === 0 && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-xs text-subtle">All lines are off — switch some on above.</div>
        )}
      </div>
    </div>
  );
}
