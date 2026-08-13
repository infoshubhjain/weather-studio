// GET /api/weather?q=Chicago            -> resolve + current + 5-day forecast
// GET /api/weather?lat=..&lon=..         -> same, from coordinates (geolocation)
// GET /api/weather?q=..&days=7           -> longer forecast
import { geocode, reverseGeocode, LocationError } from '@/lib/geo';
import { getWeather } from '@/lib/weather';
import { fail, ok } from '@/lib/http';

export const dynamic = 'force-dynamic';

export async function GET(req) {
  try {
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
    return ok({ location, alternatives, ...weather });
  } catch (e) {
    return fail(e);
  }
}
