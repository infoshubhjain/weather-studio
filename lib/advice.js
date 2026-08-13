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

/** One-line verdict used as the page's headline summary. */
export function headline(current, daily = []) {
  if (!current) return '';
  const next = daily.find((d) => (d.precipProb ?? 0) >= 60);
  if (next) return `${current.label} now; wet weather expected ${next.date}.`;
  if (daily.every((d) => (d.precipProb ?? 0) < 20)) return `${current.label} now, and dry through the forecast.`;
  return `${current.label} now, mixed conditions ahead.`;
}
