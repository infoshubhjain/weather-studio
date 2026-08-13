'use client';

// Temperature ribbon: the band between each day's low and high, with both
// series drawn as lines and a crosshair + tooltip on hover.
//
// Two series (High, Low) → categorical slots 1 and 2, legend always present.
// Palette validated against the #0d1220 surface: CVD ΔE 9.4, normal-vision
// ΔE 26.5, contrast ≥ 3:1 — see the dataviz validator run.

import { useState } from 'react';
import { showTemp } from '@/lib/advice';

const W = 760, H = 220, PAD = { t: 26, r: 20, b: 30, l: 44 };

const weekday = (iso) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short' });

export default function TempChart({ daily, unit }) {
  const [hover, setHover] = useState(null);
  if (!daily?.length) return null;

  const highs = daily.map((d) => d.tempMax);
  const lows = daily.map((d) => d.tempMin);
  // Pad the domain so the ribbon never touches the frame.
  const min = Math.min(...lows) - 2;
  const max = Math.max(...highs) + 2;

  const iw = W - PAD.l - PAD.r;
  const ih = H - PAD.t - PAD.b;
  const x = (i) => PAD.l + (daily.length === 1 ? iw / 2 : (i / (daily.length - 1)) * iw);
  const y = (v) => PAD.t + ih - ((v - min) / (max - min)) * ih;

  const line = (vals) => vals.map((v, i) => `${i ? 'L' : 'M'}${x(i)},${y(v)}`).join(' ');
  const ribbon = `${line(highs)} L${x(daily.length - 1)},${y(lows.at(-1))} ${
    lows.map((v, i) => `L${x(lows.length - 1 - i)},${y(lows.at(-1 - i))}`).slice(1).join(' ')
  } Z`;

  // Four gridlines is enough to read values without becoming wallpaper.
  const ticks = Array.from({ length: 4 }, (_, i) => min + ((max - min) / 3) * i);

  const onMove = (e) => {
    const box = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - box.left) / box.width) * W;
    const i = Math.max(0, Math.min(daily.length - 1,
      Math.round(((px - PAD.l) / iw) * (daily.length - 1))));
    setHover(i);
  };

  const d = hover != null ? daily[hover] : null;

  return (
    <figure className="chart">
      <figcaption className="chart-head">
        <h3>Temperature range</h3>
        <div className="legend">
          <span><i style={{ background: 'var(--series-1)' }} />High</span>
          <span><i style={{ background: 'var(--series-2)' }} />Low</span>
        </div>
      </figcaption>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`Daily high and low temperatures for the next ${daily.length} days`}
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id="ribbon" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--series-1)" stopOpacity="0.30" />
            <stop offset="100%" stopColor="var(--series-2)" stopOpacity="0.16" />
          </linearGradient>
        </defs>

        {ticks.map((t, i) => (
          <g key={i}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} className="grid" />
            <text x={PAD.l - 10} y={y(t) + 4} className="axis" textAnchor="end">
              {showTemp(t, unit)}
            </text>
          </g>
        ))}

        <path d={ribbon} fill="url(#ribbon)" />
        <path d={line(lows)} className="serie" stroke="var(--series-2)" />
        <path d={line(highs)} className="serie" stroke="var(--series-1)" />

        {daily.map((day, i) => (
          <text key={day.date} x={x(i)} y={H - 8} className="axis" textAnchor="middle">
            {weekday(day.date)}
          </text>
        ))}

        {/* Direct-label the extremes only — never a number on every point. */}
        <text x={x(highs.indexOf(Math.max(...highs)))} y={y(Math.max(...highs)) - 10}
              className="peak" textAnchor="middle">{showTemp(Math.max(...highs), unit)}</text>
        <text x={x(lows.indexOf(Math.min(...lows)))} y={y(Math.min(...lows)) + 18}
              className="peak" textAnchor="middle">{showTemp(Math.min(...lows), unit)}</text>

        {d && (
          <g className="cross">
            <line x1={x(hover)} x2={x(hover)} y1={PAD.t} y2={PAD.t + ih} />
            <circle cx={x(hover)} cy={y(d.tempMax)} r="4.5" fill="var(--series-1)" />
            <circle cx={x(hover)} cy={y(d.tempMin)} r="4.5" fill="var(--series-2)" />
          </g>
        )}
      </svg>

      {d && (
        <div
          className="tip"
          style={{ left: `${(x(hover) / W) * 100}%` }}
          role="status"
        >
          <b>{new Date(`${d.date}T12:00:00`).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}</b>
          <span>{d.icon} {d.label}</span>
          <span>High {showTemp(d.tempMax, unit)} · Low {showTemp(d.tempMin, unit)}</span>
          <span>{d.precipProb ?? 0}% chance of rain</span>
        </div>
      )}
    </figure>
  );
}
