// Maps real weather into the palette and parameters the sky shader renders.
// Pure functions — the shader just consumes numbers.

const hex = (h) => [
  parseInt(h.slice(1, 3), 16) / 255,
  parseInt(h.slice(3, 5), 16) / 255,
  parseInt(h.slice(5, 7), 16) / 255,
];

// Time-of-day palettes: [horizon, zenith]. Chosen to stay dark enough that
// white UI text holds contrast over any of them.
const PHASES = {
  night:    ['#0d1b3a', '#04060f'],
  twilight: ['#3a2a5c', '#0a0d22'],
  dawn:     ['#c9633f', '#16264f'],
  morning:  ['#7fb3e8', '#1c4f96'],
  midday:   ['#8ec5f0', '#1b62c4'],
  golden:   ['#e88a3c', '#26407e'],
  dusk:     ['#8a3f6b', '#101638'],
};

// Overcast, fog and storms desaturate toward grey regardless of hour.
const GREY = ['#5a6472', '#20262f'];
const STORM = ['#3b4250', '#0c0f16'];

/**
 * Solar elevation, roughly. Good enough to place a sun disc believably —
 * this drives art direction, not navigation.
 */
export function sunElevation(date, lat, lon) {
  const d = new Date(date);
  const start = Date.UTC(d.getUTCFullYear(), 0, 0);
  const dayOfYear = (Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - start) / 86400_000;
  const decl = -23.44 * Math.cos((2 * Math.PI / 365) * (dayOfYear + 10)) * (Math.PI / 180);
  const hours = d.getUTCHours() + d.getUTCMinutes() / 60;
  const hourAngle = ((hours - 12) * 15 + lon) * (Math.PI / 180);
  const la = lat * (Math.PI / 180);
  const sin = Math.sin(la) * Math.sin(decl) + Math.cos(la) * Math.cos(decl) * Math.cos(hourAngle);
  return Math.asin(Math.max(-1, Math.min(1, sin))) * (180 / Math.PI);
}

const phaseFor = (elev, isDay) => {
  if (elev > 45) return 'midday';
  if (elev > 15) return 'morning';
  if (elev > 4) return 'golden';
  if (elev > -2) return isDay ? 'golden' : 'dusk';
  if (elev > -8) return 'twilight';
  return 'night';
};

/** Everything the shader and the precipitation layer need, from one weather payload. */
export function skyParams(weather, location) {
  const c = weather?.current;
  if (!c) return { horizon: hex(PHASES.night[0]), zenith: hex(PHASES.night[1]), cloud: 0.3, day: 0, sunY: -0.3, storm: 0, precip: 0, kind: 'none', phase: 'night' };

  const elev = sunElevation(c.time, location.lat, location.lon);
  const phase = phaseFor(elev, c.isDay);
  const code = c.code;

  const overcast = [3, 45, 48].includes(code) || c.cloudCover > 85;
  const storming = [95, 96, 99, 82, 65, 75, 86].includes(code);

  let pair = PHASES[phase];
  if (storming) pair = STORM;
  else if (overcast) pair = c.isDay ? GREY : PHASES.night;

  const snowing = [71, 73, 75, 77, 85, 86].includes(code);
  const raining = [51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99].includes(code);

  return {
    horizon: hex(pair[0]),
    zenith: hex(pair[1]),
    cloud: Math.min(1, (c.cloudCover ?? 0) / 100 * (overcast ? 1.15 : 0.9)),
    day: c.isDay ? 1 : 0,
    // Map elevation (-15°..75°) into shader space, above the horizon line.
    sunY: Math.max(-0.25, Math.min(0.95, (elev + 12) / 80)),
    storm: storming ? 1 : 0,
    precip: Math.min(1, ((c.precipitation ?? 0) + (c.snowfall ?? 0) * 3) / 4 + (raining || snowing ? 0.35 : 0)),
    kind: snowing ? 'snow' : raining ? 'rain' : 'none',
    phase,
  };
}

/** CSS gradient used as the no-WebGL fallback and for the small wallet cards. */
export function skyGradient(weather, location) {
  const p = skyParams(weather, location);
  const to255 = (v) => v.map((x) => Math.round(x * 255)).join(',');
  return `linear-gradient(170deg, rgb(${to255(p.zenith)}) 0%, rgb(${to255(p.horizon)}) 100%)`;
}
