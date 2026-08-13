'use client';

// Daylight arc — where the sun is right now between sunrise and sunset, with
// the golden hours marked. Most weather apps give you two timestamps; what you
// actually want to know is "how much good light is left?"

const clock = (iso, tz) =>
  new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', timeZone: tz });

const W = 460, H = 150, PAD = 26;

export default function SunArc({ day, now, timezone, isDay }) {
  if (!day?.sunrise || !day?.sunset) return null;

  const rise = new Date(day.sunrise).getTime();
  const set = new Date(day.sunset).getTime();
  const t = new Date(now).getTime();
  const span = set - rise;
  if (span <= 0) return null;

  // Progress through the day, clamped so pre-dawn and post-dusk park at the ends.
  const p = Math.max(0, Math.min(1, (t - rise) / span));

  // Golden hour: the first and last hour of sunlight.
  const goldenFrac = Math.min(0.35, 3600_000 / span);

  const cx = (f) => PAD + f * (W - PAD * 2);
  // Semicircular path; the sun rides it by angle so the motion reads as an arc.
  const cy = (f) => H - PAD - Math.sin(f * Math.PI) * (H - PAD * 2);

  const arc = Array.from({ length: 41 }, (_, i) => {
    const f = i / 40;
    return `${i ? 'L' : 'M'}${cx(f).toFixed(1)},${cy(f).toFixed(1)}`;
  }).join(' ');

  const remaining = Math.max(0, set - t);
  const hrs = Math.floor(remaining / 3600_000);
  const mins = Math.round((remaining % 3600_000) / 60_000);

  const inGolden = isDay && (p < goldenFrac || p > 1 - goldenFrac);

  return (
    <figure className="chart sunarc">
      <figcaption className="chart-head">
        <h3>Daylight</h3>
        <span className="muted">{day.daylightHours}h total</span>
      </figcaption>

      <svg viewBox={`0 0 ${W} ${H}`} role="img"
           aria-label={`Sun position: ${Math.round(p * 100)}% through the day. Sunrise ${clock(day.sunrise, timezone)}, sunset ${clock(day.sunset, timezone)}.`}>
        <defs>
          <linearGradient id="arcg" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#d95926" />
            <stop offset="15%" stopColor="#eda100" />
            <stop offset="50%" stopColor="#8ec5f0" />
            <stop offset="85%" stopColor="#eda100" />
            <stop offset="100%" stopColor="#d95926" />
          </linearGradient>
        </defs>

        {/* Horizon */}
        <line x1="8" x2={W - 8} y1={H - PAD} y2={H - PAD} className="grid" />

        {/* Golden-hour bands */}
        <rect x={cx(0)} y={PAD - 6} width={cx(goldenFrac) - cx(0)} height={H - PAD - PAD + 6} className="golden" />
        <rect x={cx(1 - goldenFrac)} y={PAD - 6} width={cx(1) - cx(1 - goldenFrac)} height={H - PAD - PAD + 6} className="golden" />

        <path d={arc} className="arc-track" />
        <path d={arc} className="arc-lit" stroke="url(#arcg)"
              strokeDasharray="1000" strokeDashoffset={1000 - p * 1000} />

        <circle cx={cx(p)} cy={cy(p)} r="9" className="sun-glow" />
        <circle cx={cx(p)} cy={cy(p)} r="5.5" className="sun-dot" />

        <text x={cx(0)} y={H - 8} className="axis" textAnchor="start">{clock(day.sunrise, timezone)}</text>
        <text x={cx(1)} y={H - 8} className="axis" textAnchor="end">{clock(day.sunset, timezone)}</text>
      </svg>

      <p className="sun-note">
        {inGolden ? (
          <><b className="gold">Golden hour now.</b> Best light of the day.</>
        ) : isDay ? (
          <><b>{hrs}h {mins}m</b> of daylight left · golden hour from {clock(new Date(set - 3600_000).toISOString(), timezone)}</>
        ) : (
          <>Sun is down. Next sunrise {clock(day.sunrise, timezone)}.</>
        )}
      </p>
    </figure>
  );
}
