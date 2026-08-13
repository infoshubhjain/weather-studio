// Location resolution. Handles: "lat,lon", zip/postal codes, cities, towns,
// landmarks ("Eiffel Tower"), and free text. No API keys required.

import { cached } from './cache.js';

const UA = { 'User-Agent': 'pma-weather-assessment/1.0 (shubhj3@illinois.edu)' };

// Place names effectively never change; cache hard. This is what keeps the
// Location Wallet inside Nominatim's ~1 req/sec usage policy.
const GEO_TTL = 24 * 60 * 60 * 1000;

export class LocationError extends Error {
  constructor(message, status = 404) {
    super(message);
    this.status = status;
  }
}

async function getJSON(url, init) {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new LocationError(`Upstream API error (${res.status}) from ${new URL(url).host}`, 502);
  return res.json();
}

const COORD = /^\s*(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)\s*$/;

/** "40.7,-74" -> {lat, lon} or null */
export function parseCoords(q) {
  const m = COORD.exec(q);
  if (!m) return null;
  const lat = +m[1], lon = +m[2];
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { lat, lon };
}

/** Reverse geocode — used by the "use my location" button. */
export async function reverseGeocode(lat, lon) {
  // Round the cache key: two wallet cards a few metres apart are the same place.
  const key = `rev:${lat.toFixed(3)},${lon.toFixed(3)}`;
  const d = await cached(key, GEO_TTL, () => getJSON(
    `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}&zoom=12`,
    { headers: UA },
  )).catch(() => null);
  const a = d?.address ?? {};
  return {
    name: a.city || a.town || a.village || a.county || d?.name || 'Current location',
    admin1: a.state ?? '',
    country: a.country ?? '',
    countryCode: (a.country_code ?? '').toUpperCase(),
    lat, lon,
    label: d?.display_name ?? `${lat.toFixed(3)}, ${lon.toFixed(3)}`,
    source: 'nominatim',
  };
}

const fmt = (p) => [p.name, p.admin1, p.country].filter(Boolean).join(', ');

/**
 * Resolve a free-text query to candidate locations, best first.
 * Open-Meteo handles cities/postal codes; Nominatim handles landmarks and
 * everything else (fuzzy match), so between them almost any input resolves.
 */
export async function geocode(query, { limit = 5 } = {}) {
  const q = String(query ?? '').trim();
  if (!q) throw new LocationError('Please enter a location.', 400);
  if (q.length > 200) throw new LocationError('Location is too long.', 400);

  const coords = parseCoords(q);
  if (coords) return [{ ...(await reverseGeocode(coords.lat, coords.lon)), source: 'coordinates' }];

  const ck = q.toLowerCase();
  const [om, osm] = await Promise.allSettled([
    cached(`om:${ck}:${limit}`, GEO_TTL, () =>
      getJSON(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=${limit}&language=en&format=json`)),
    cached(`osm:${ck}:${limit}`, GEO_TTL, () =>
      getJSON(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=${limit}&addressdetails=1&q=${encodeURIComponent(q)}`, { headers: UA })),
  ]);

  const out = [];
  if (om.status === 'fulfilled') {
    for (const r of om.value?.results ?? []) {
      out.push({
        name: r.name, admin1: r.admin1 ?? '', country: r.country ?? '',
        countryCode: r.country_code ?? '', lat: r.latitude, lon: r.longitude,
        label: fmt(r), population: r.population ?? null,
        timezone: r.timezone ?? null, source: 'open-meteo',
      });
    }
  }
  if (osm.status === 'fulfilled') {
    for (const r of osm.value ?? []) {
      const a = r.address ?? {};
      out.push({
        name: r.name || r.display_name.split(',')[0],
        admin1: a.state ?? '', country: a.country ?? '',
        countryCode: (a.country_code ?? '').toUpperCase(),
        lat: +r.lat, lon: +r.lon, label: r.display_name,
        category: r.category ?? null, source: 'nominatim',
      });
    }
  }

  // Dedupe anything within ~11km of a better-ranked hit.
  const seen = [];
  const uniq = out.filter((c) => {
    if (seen.some((s) => Math.abs(s.lat - c.lat) < 0.1 && Math.abs(s.lon - c.lon) < 0.1)) return false;
    seen.push(c);
    return true;
  });

  if (!uniq.length) {
    if (om.status === 'rejected' && osm.status === 'rejected') {
      throw new LocationError('Both geocoding services are unreachable. Check your connection and try again.', 502);
    }
    throw new LocationError(`No location found matching "${q}". Try a city, postal code, landmark, or "lat,lon".`, 404);
  }
  return uniq.slice(0, limit);
}

/** Resolve to exactly one location (fuzzy: takes the top match). */
export async function resolveOne(query) {
  return (await geocode(query, { limit: 5 }))[0];
}
