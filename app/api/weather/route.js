// GET /api/weather?q=Chicago            -> resolve + current + 5-day forecast
// GET /api/weather?lat=..&lon=..         -> same, from coordinates (geolocation)
// GET /api/weather?q=..&days=7           -> longer forecast
//
// Climate normals deliberately are NOT here — see app/api/normals/route.js.
// They cost a 15-year archive fetch (measured 1.4-3.6s) and used to run
// *after* the forecast, so every search paid for an enrichment nobody was
// waiting on. The client fetches them separately once the forecast is drawn.
import { geocode, reverseGeocode, LocationError } from '@/lib/geo';
import { getWeather } from '@/lib/weather';
import { rateLimit } from '@/lib/ratelimit';
import { fail, ok, cacheFor } from '@/lib/http';

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

    // Open-Meteo refreshes ~every 15 min, so a 10-minute edge cache never
    // serves anything staler than the upstream already is. This is what makes
    // a repeat lookup cheap in production: the in-process cache dies with each
    // serverless instance, the CDN doesn't.
    return ok({ location, alternatives, ...weather }, cacheFor(600));
  } catch (e) {
    return fail(e);
  }
}
