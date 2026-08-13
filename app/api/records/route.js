// CREATE + READ (collection).
// GET  /api/records?search=&limit=&offset=
// POST /api/records  { location, startDate, endDate, notes? }
import { resolveOne } from '@/lib/geo';
import { getRange, summarize } from '@/lib/weather';
import { createRecord, listRecords } from '@/lib/db';
import { validateDateRange, validateNotes, ValidationError } from '@/lib/validate';
import { fail, ok } from '@/lib/http';

export const dynamic = 'force-dynamic';

export async function GET(req) {
  try {
    const p = req.nextUrl.searchParams;
    return ok(listRecords({
      search: p.get('search') ?? '',
      limit: Math.min(Number(p.get('limit') ?? 100) || 100, 500),
      offset: Math.max(Number(p.get('offset') ?? 0) || 0, 0),
    }));
  } catch (e) {
    return fail(e);
  }
}

export async function POST(req) {
  try {
    const body = await req.json().catch(() => {
      throw new ValidationError('Request body must be valid JSON.');
    });

    const query = String(body.location ?? '').trim();
    if (!query) throw new ValidationError('A location is required.', 'location');

    const { start, end } = validateDateRange(body.startDate, body.endDate);
    const notes = validateNotes(body.notes);

    // Throws 404 if the location doesn't exist; top fuzzy match otherwise.
    const loc = await resolveOne(query);
    const days = await getRange({ lat: loc.lat, lon: loc.lon, start, end });

    return ok(
      createRecord({
        query, label: loc.label, latitude: loc.lat, longitude: loc.lon, country: loc.country,
        startDate: start, endDate: end, notes, summary: summarize(days), weather: days,
      }),
      { status: 201 },
    );
  } catch (e) {
    return fail(e);
  }
}
