// GET /api/normals?lat=..&lon=..&date=YYYY-MM-DD&tempMax=..
//
// "Is today unusual for this date?" — split out of /api/weather because the
// 15-year archive fetch behind it measured 1.4-3.6s and was running serially
// after the forecast, tripling the time to first useful pixel. The forecast no
// longer waits for it; the client asks for it once the page is drawn.
//
// tempMax is optional: pass the day's high and the response includes the
// rendered anomaly sentence, so the client does no formatting of its own.
import { climateNormal, describeAnomaly } from '@/lib/climate';
import { rateLimit } from '@/lib/ratelimit';
import { ValidationError } from '@/lib/validate';
import { fail, ok, cacheFor } from '@/lib/http';

export const dynamic = 'force-dynamic';

const ISO = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(req) {
  try {
    const limited = rateLimit(req, { max: 60, windowMs: 60_000, key: 'normals' });
    if (limited) return limited;

    const p = req.nextUrl.searchParams;
    const lat = Number(p.get('lat')), lon = Number(p.get('lon'));
    const date = p.get('date');

    if (!Number.isFinite(lat) || Math.abs(lat) > 90 || !Number.isFinite(lon) || Math.abs(lon) > 180) {
      throw new ValidationError('Coordinates out of range: latitude ±90, longitude ±180.', 'lat');
    }
    if (!date || !ISO.test(date)) throw new ValidationError('date is required (YYYY-MM-DD).', 'date');

    const normal = await climateNormal({ lat, lon, date });

    const raw = p.get('tempMax');
    const tempMax = raw == null || raw === '' ? null : Number(raw);
    const anomaly = Number.isFinite(tempMax) ? describeAnomaly({ tempMax }, normal) : null;

    // A normal for a given calendar date is fixed history — it is the same
    // answer tomorrow as today. Cache it hard.
    return ok({ normal, anomaly }, cacheFor(86_400));
  } catch (e) {
    return fail(e);
  }
}
