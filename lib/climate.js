// Climate normals — "is this weather actually unusual?"
//
// Every weather app tells you it's 12°C. None of them tell you that 12°C is six
// degrees colder than this date normally is. That comparison is the thing a
// traveller actually reasons with, and the archive API we already use has the
// data going back to 1940.
//
// Method: for the target calendar date, pull a ±3-day window from each of the
// last N years and average. The window smooths out single freak days so one
// unusual year doesn't skew the baseline.

import { cached } from './cache.js';

const ARCHIVE = 'https://archive-api.open-meteo.com/v1/archive';
const YEARS = 15;                      // enough to be meaningful, few enough to stay polite
const WINDOW = 3;                      // days either side
const TTL = 30 * 24 * 60 * 60 * 1000;  // historical data never changes

const iso = (d) => d.toISOString().slice(0, 10);

async function getJSON(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(12_000) });
  if (!res.ok) throw new Error(`archive ${res.status}`);
  return res.json();
}

/**
 * Average high/low/precipitation for this calendar date across recent history.
 * Returns null rather than throwing — this is an enrichment, and a missing
 * baseline must never take down the forecast.
 */
export async function climateNormal({ lat, lon, date }) {
  const target = new Date(`${date}T12:00:00Z`);
  const thisYear = new Date().getUTCFullYear();
  const key = `norm:${(+lat).toFixed(1)},${(+lon).toFixed(1)}:${date.slice(5)}`;

  return cached(key, TTL, async () => {
    // One long request, filtered locally, rather than one request per year:
    // firing 15 parallel archive calls gets throttled (observed: 10 of 15
    // silently failed), and this is far kinder to a free API.
    const from = new Date(Date.UTC(thisYear - YEARS, target.getUTCMonth(), target.getUTCDate() - WINDOW));
    const to = new Date(Date.UTC(thisYear - 1, target.getUTCMonth(), target.getUTCDate() + WINDOW));

    const r = await getJSON(
      `${ARCHIVE}?latitude=${lat}&longitude=${lon}&start_date=${iso(from)}&end_date=${iso(to)}` +
      `&daily=temperature_2m_max,temperature_2m_min,precipitation_sum&timezone=auto`,
    );

    // Keep only days inside the ±WINDOW calendar window, any year.
    const md = (d) => (d.getUTCMonth() + 1) * 100 + d.getUTCDate();
    const wanted = new Set();
    for (let o = -WINDOW; o <= WINDOW; o++) {
      wanted.add(md(new Date(Date.UTC(2001, target.getUTCMonth(), target.getUTCDate() + o))));
    }

    const highs = [], lows = [], precip = [];
    const years = new Set();
    const times = r.daily?.time ?? [];
    for (let i = 0; i < times.length; i++) {
      const d = new Date(`${times[i]}T00:00:00Z`);
      if (!wanted.has(md(d))) continue;
      years.add(d.getUTCFullYear());
      const hi = r.daily.temperature_2m_max[i];
      const lo = r.daily.temperature_2m_min[i];
      const pr = r.daily.precipitation_sum[i];
      if (hi != null) highs.push(hi);
      if (lo != null) lows.push(lo);
      if (pr != null) precip.push(pr);
    }

    // Fewer than five sampled years isn't a baseline worth showing.
    if (highs.length < 5 || years.size < 5) return null;
    const results = { length: years.size };

    const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
    return {
      years: results.length,
      windowDays: WINDOW * 2 + 1,
      tempMax: +mean(highs).toFixed(1),
      tempMin: +mean(lows).toFixed(1),
      precip: +mean(precip).toFixed(2),
      // Share of sampled days that saw measurable rain.
      wetDayShare: +(precip.filter((p) => p >= 1).length / precip.length).toFixed(2),
    };
  }).catch(() => null);
}

/** Turn a normal + today's actual into a sentence worth reading. */
export function describeAnomaly(actual, normal) {
  if (!normal || actual?.tempMax == null) return null;
  const delta = actual.tempMax - normal.tempMax;
  const abs = Math.abs(delta);

  // Under 1.5° is noise, not a story.
  if (abs < 1.5) {
    return { delta: +delta.toFixed(1), level: 'normal', text: 'Right about average for this date.' };
  }
  const level = abs >= 8 ? 'extreme' : abs >= 4 ? 'notable' : 'mild';
  const dir = delta > 0 ? 'warmer' : 'colder';
  const qualifier = { extreme: 'far ', notable: '', mild: 'slightly ' }[level];

  return {
    delta: +delta.toFixed(1),
    level,
    text: `${abs.toFixed(1)}° ${qualifier}${dir} than this date normally is (${normal.years}-year average: ${normal.tempMax}°C).`,
  };
}
