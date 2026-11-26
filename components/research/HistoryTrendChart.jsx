'use client';

import { useMemo } from 'react';
import { CategoryScale, Chart as ChartJS, LinearScale, LineController, LineElement, PointElement, Tooltip } from 'chart.js';
import { Line } from 'react-chartjs-2';
import { compact } from '@/lib/research/format';
import { hoverLine, useThemeColors } from './LineChart';

ChartJS.register(LineController, LineElement, PointElement, CategoryScale, LinearScale, Tooltip);

// One product's measure per step (day / week / month) with its trend — the
// Details window's chart (ProductHistoryModal). One series, so no legend box:
// the title names it, and a small key under it tells the solid line (the
// values) from the dashed one (the straight best-fit trend). Marks: 2px line,
// 8px dots with a 2px surface ring, hairline solid grid; hover = a guide line
// + one tooltip with the value and the trend at that step. Colours come from
// the validated theme palette (--series-1 for the values, muted ink for the
// trend — a reference line, never a status colour).
// `labels` = the steps' names, `values` = the step values (null = a gap),
// `trend` = trendOf(values) (or null), `invert` = rank (#1 at the top).
export default function HistoryTrendChart({ labels, values, trend, invert = false, format = (v) => String(v), name, height = 240 }) {
  const colors = useThemeColors();
  const reduceMotion = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const has = values.some((v) => v != null);

  const data = useMemo(() => {
    if (!colors) return null;
    const color = colors.series[0];
    return {
      labels,
      datasets: [
        {
          label: name,
          data: values,
          borderColor: color,
          backgroundColor: color,
          borderWidth: 2,
          tension: 0.2,
          spanGaps: false,
          pointRadius: 4,
          pointHoverRadius: 6,
          pointBorderColor: colors.surface,
          pointBorderWidth: 2,
          pointHoverBorderWidth: 2,
          order: 1,
        },
        ...(trend ? [{
          label: 'Trend',
          data: trend.line,
          borderColor: colors.muted,
          backgroundColor: colors.muted,
          borderWidth: 1.5,
          borderDash: [6, 4],
          tension: 0,
          pointRadius: 0,
          pointHoverRadius: 0,
          order: 2,
        }] : []),
      ],
    };
  }, [colors, labels, values, trend, name]);

  const options = useMemo(() => {
    if (!colors) return null;
    return {
      responsive: true,
      maintainAspectRatio: false,
      animation: reduceMotion ? false : { duration: 250 },
      interaction: { mode: 'index', intersect: false },
      layout: { padding: { top: 6, right: 8 } },
      scales: {
        x: {
          grid: { display: false },
          border: { color: colors.grid },
          ticks: { color: colors.text, maxRotation: 0, autoSkip: true, maxTicksLimit: 8, font: { size: 10.5 } },
        },
        y: {
          reverse: invert,
          grace: '8%',
          grid: { color: colors.grid },
          border: { display: false },
          ticks: { color: colors.text, maxTicksLimit: 6, font: { size: 10.5 }, callback: (v) => (invert ? `#${Math.round(v)}` : compact(v)) },
        },
      },
      plugins: {
        legend: { display: false },
        hoverLine: { color: colors.text },
        tooltip: {
          backgroundColor: colors.surface,
          titleColor: colors.ink,
          bodyColor: colors.ink,
          borderColor: colors.grid,
          borderWidth: 1,
          padding: 10,
          boxPadding: 4,
          filter: (item) => item.parsed.y != null,
          callbacks: {
            // Values lead, names follow.
            label: (item) => ` ${format(item.parsed.y)}  ${item.dataset.label === 'Trend' ? 'trend' : item.dataset.label}`,
            labelColor: (item) => ({ borderColor: item.dataset.borderColor, backgroundColor: item.dataset.borderColor }),
          },
        },
      },
    };
  }, [colors, invert, format, reduceMotion]);

  if (!has) {
    return <div className="flex items-center justify-center rounded-xl border border-dashed border-divider text-center text-xs text-subtle" style={{ height }}>No values for this in the period yet — they build up day by day.</div>;
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="relative w-full" style={{ height }}>
        {data && options
          ? <Line data={data} options={options} plugins={[hoverLine]} aria-label={`${name} per step, with its trend line`} role="img" />
          : <div className="h-full w-full animate-pulse rounded-xl bg-card" />}
      </div>
      <div className="flex flex-wrap items-center gap-4 text-[11px] text-muted" aria-hidden>
        <span className="inline-flex items-center gap-1.5">
          <svg width="22" height="8"><line x1="0" y1="4" x2="22" y2="4" stroke="var(--series-1)" strokeWidth="2" /><circle cx="11" cy="4" r="3" fill="var(--series-1)" /></svg>
          {name}
        </span>
        {trend && (
          <span className="inline-flex items-center gap-1.5">
            <svg width="22" height="8"><line x1="0" y1="4" x2="22" y2="4" stroke="var(--color-muted)" strokeWidth="1.5" strokeDasharray="6 4" /></svg>
            Trend (straight best-fit line)
          </span>
        )}
      </div>
    </div>
  );
}
