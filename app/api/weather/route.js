// GET /api/weather?q=Chicago            -> resolve + current + 5-day forecast
// GET /api/weather?lat=..&lon=..         -> same, from coordinates (geolocation)
// GET /api/weather?q=..&days=7           -> longer forecast
import { geocode, reverseGeocode, LocationError } from '@/lib/geo';
import { getWeather } from '@/lib/weather';
import { climateNormal, describeAnomaly } from '@/lib/climate';
import { rateLimit } from '@/lib/ratelimit';
import { fail, ok } from '@/lib/http';

export const dynamic = 'force-dynamic';

export async function GET(req) {
  try {
    const limited = rateLimit(req, { max: 60, windowMs: 60_000, key: 'weather' });
    if (limited) return limited;

    const p = req.nextUrl.searchParams;
    const q = p.get('q');
    const lat = p.get('lat'), lon = p.get('lon');
    const days = Math.min(Math.max(Number(p.get('days') ?? 5), 1), 16);

    let location, alternatives = [];
    if (lat != null && lon != null) {
      const la = Number(lat), lo = Number(lon);
      if (!Number.isFinite(la) || Math.abs(la) > 90 || !Number.isFinite(lo) || Math.abs(lo) > 180) {
        throw new LocationError('Coordinates out of range: latitude ±90, longitude ±180.', 400);
      }
      location = await reverseGeocode(la, lo);
    } else {
      const matches = await geocode(q, { limit: 5 });
      [location, ...alternatives] = matches;
    }

    const weather = await getWeather({ lat: location.lat, lon: location.lon, days });

    // "Is this normal?" — best-effort enrichment. `normals` is opt-out via
    // ?normals=0 because it fans out to 15 archive years on a cold cache.
    let climate = null;
    if (p.get('normals') !== '0' && weather.daily?.[0]) {
      const normal = await climateNormal({
        lat: location.lat, lon: location.lon, date: weather.daily[0].date,
      });
      const anomaly = describeAnomaly(weather.daily[0], normal);
      if (normal && anomaly) climate = { normal, anomaly };
    }

    return ok({ location, alternatives, climate, ...weather });
  } catch (e) {
    return fail(e);
  }
}
