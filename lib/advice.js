// The "what would a traveller actually want to know?" layer.
// Pure functions over the weather payload — no I/O, so they're trivially testable.

/** °C -> whichever unit the user picked. */
export const conv = (c, unit) => (c == null ? null : unit === 'F' ? c * 9 / 5 + 32 : c);
export const showTemp = (c, unit, digits = 0) =>
  c == null ? '—' : `${conv(c, unit).toFixed(digits)}°${unit}`;
export const showWind = (kmh, unit) =>
  kmh == null ? '—' : unit === 'F' ? `${(kmh * 0.621371).toFixed(0)} mph` : `${kmh.toFixed(0)} km/h`;

/** Wind chill / heat index territory — the number people actually feel. */
export function feelsGap(temp, feels) {
  if (temp == null || feels == null) return null;
  const d = feels - temp;
  if (Math.abs(d) < 3) return null;
  return d < 0
    ? `Wind makes it feel ${Math.abs(d).toFixed(0)}°C colder than the thermometer says.`
    : `Humidity makes it feel ${d.toFixed(0)}°C warmer than the thermometer says.`;
}

const UV_ADVICE = [
  [3, 'Low UV — no sun protection needed.'],
  [6, 'Moderate UV — sunscreen if you are out for a while.'],
  [8, 'High UV — SPF 30+, hat, sunglasses.'],
  [11, 'Very high UV — limit midday sun exposure.'],
  [Infinity, 'Extreme UV — avoid the sun between 10am and 4pm.'],
];

/**
 * Actionable tips from current conditions + the coming days.
 * Ordered most-urgent first; the UI just renders whatever comes back.
 */
export function advise({ current, daily = [], airQuality } = {}) {
  const tips = [];
  const c = current ?? {};

  if ([95, 96, 99].includes(c.code)) tips.push({ icon: '⚡', text: 'Thunderstorms right now — stay indoors and unplug sensitive electronics.', level: 'warn' });
  if ([56, 57, 66, 67].includes(c.code)) tips.push({ icon: '🧊', text: 'Freezing rain — roads and sidewalks are likely to be icy.', level: 'warn' });
  if (c.windGusts >= 60) tips.push({ icon: '💨', text: `Gusts to ${c.windGusts.toFixed(0)} km/h — expect travel disruption and secure loose objects.`, level: 'warn' });

  if (c.temp <= 0) tips.push({ icon: '🧥', text: 'Below freezing — layers, gloves, and covered ears.' });
  else if (c.temp <= 10) tips.push({ icon: '🧣', text: 'Cold — a proper coat, not just a hoodie.' });
  else if (c.temp >= 32) tips.push({ icon: '🥵', text: 'Heat stress range — drink water before you feel thirsty and avoid midday exertion.', level: 'warn' });
  else if (c.temp >= 26) tips.push({ icon: '🧴', text: 'Hot — light clothing and shade breaks.' });

  const gap = feelsGap(c.temp, c.feelsLike);
  if (gap) tips.push({ icon: '🌡️', text: gap });

  const rainSoon = daily.slice(0, 2).some((d) => (d.precipProb ?? 0) >= 50);
  if (rainSoon) tips.push({ icon: '☔', text: 'Rain likely within 48 hours — pack an umbrella.' });

  const uv = Math.max(...daily.slice(0, 2).map((d) => d.uvMax ?? 0), airQuality?.uv ?? 0);
  if (uv > 0) tips.push({ icon: '🕶️', text: UV_ADVICE.find(([t]) => uv < t)[1] });

  if (airQuality?.aqi != null && airQuality.aqi > 60) {
    tips.push({ icon: '😷', text: `Air quality is ${airQuality.band.label.toLowerCase()} (AQI ${airQuality.aqi}) — limit outdoor exercise if you're sensitive.`, level: 'warn' });
  }

  const spread = daily.length ? Math.max(...daily.map((d) => d.tempMax)) - Math.min(...daily.map((d) => d.tempMin)) : 0;
  if (spread >= 15) tips.push({ icon: '🎒', text: `The week swings ${spread.toFixed(0)}°C between its high and low — pack for both.` });

  const daylight = daily[0]?.daylightHours;
  if (daylight != null && daylight < 9) tips.push({ icon: '🌙', text: `Only ${daylight}h of daylight — plan outdoor sightseeing early.` });

  return tips;
}

// --- Best Day picker --------------------------------------------------------
// Scores each forecast day against what a given activity actually needs, so the
// answer to "which day should I go?" is a number rather than a vibe.
// Each profile returns 0–100; the weights are deliberately simple and legible.

export const ACTIVITIES = {
  outdoors: { label: 'Being outside', icon: '🌳' },
  beach:    { label: 'Beach day',     icon: '🏖️' },
  hiking:   { label: 'Hiking',        icon: '🥾' },
  photos:   { label: 'Photography',   icon: '📷' },
  running:  { label: 'Running',       icon: '🏃' },
  stargaze: { label: 'Stargazing',    icon: '🔭' },
};

// Triangular preference curve: 100 at `ideal`, falling to 0 at `ideal ± span`.
const band = (v, ideal, span) =>
  v == null ? 50 : Math.max(0, 100 - (Math.abs(v - ideal) / span) * 100);

const dry = (d) => 100 - Math.min(100, (d.precipProb ?? 0));
const calm = (d, max) => Math.max(0, 100 - ((d.windMax ?? 0) / max) * 100);

const PROFILES = {
  outdoors: (d) => 0.40 * band(d.tempMax, 22, 16) + 0.35 * dry(d) + 0.25 * calm(d, 45),
  beach:    (d) => 0.40 * band(d.tempMax, 29, 12) + 0.30 * dry(d) + 0.15 * calm(d, 35)
                 + 0.15 * Math.min(100, (d.uvMax ?? 0) * 14),
  hiking:   (d) => 0.35 * band(d.tempMax, 17, 14) + 0.35 * dry(d) + 0.20 * calm(d, 40)
                 + 0.10 * Math.max(0, 100 - (d.uvMax ?? 0) * 9),
  running:  (d) => 0.45 * band(d.tempMax, 13, 14) + 0.30 * dry(d) + 0.25 * calm(d, 35),
  // Clear skies matter more than comfort for these two.
  photos:   (d) => 0.45 * band(d.tempMax, 18, 22) + 0.25 * dry(d)
                 + 0.30 * Math.min(100, (d.daylightHours ?? 10) * 8),
  stargaze: (d) => 0.55 * dry(d) + 0.25 * calm(d, 40)
                 + 0.20 * Math.max(0, 100 - (d.daylightHours ?? 12) * 6),
};

const VERDICT = [
  [85, 'Excellent'], [70, 'Very good'], [55, 'Decent'], [40, 'Mediocre'], [0, 'Poor'],
];

/** Scores every forecast day for one activity, best first. */
export function rankDays(daily, activity = 'outdoors') {
  const score = PROFILES[activity] ?? PROFILES.outdoors;
  return daily
    .map((d) => {
      const value = Math.round(Math.max(0, Math.min(100, score(d))));
      return { ...d, score: value, verdict: VERDICT.find(([t]) => value >= t)[1] };
    })
    .sort((a, b) => b.score - a.score || a.date.localeCompare(b.date));
}

/** Why the winning day won — the two factors that moved it most. */
export function whyBest(day, activity) {
  const reasons = [];
  if ((day.precipProb ?? 0) <= 20) reasons.push('little chance of rain');
  else if ((day.precipProb ?? 0) >= 60) reasons.push('rain is likely');
  if ((day.windMax ?? 0) < 18) reasons.push('light winds');
  else if ((day.windMax ?? 0) > 40) reasons.push('it will be windy');
  if (activity === 'stargaze' && (day.precipProb ?? 0) < 20) reasons.push('clear skies');
  if (activity === 'beach' && day.tempMax >= 26) reasons.push('genuinely warm');
  if (activity === 'running' && day.tempMax <= 16) reasons.push('cool enough to push');
  return reasons.slice(0, 2).join(' and ');
}

/** One-line verdict used as the page's headline summary. */
export function headline(current, daily = []) {
  if (!current) return '';
  const next = daily.find((d) => (d.precipProb ?? 0) >= 60);
  if (next) {
    const when = next === daily[0]
      ? 'later today'
      : `on ${new Date(`${next.date}T12:00:00`).toLocaleDateString(undefined, { weekday: 'long' })}`;
    return `${current.label} now; wet weather expected ${when}.`;
  }
  if (daily.every((d) => (d.precipProb ?? 0) < 20)) return `${current.label} now, and dry through the forecast.`;
  return `${current.label} now, mixed conditions ahead.`;
}
