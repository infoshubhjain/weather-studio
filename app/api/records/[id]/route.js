// READ / UPDATE / DELETE (single record).
import { resolveOne } from '@/lib/geo';
import { getRange, summarize } from '@/lib/weather';
import { getRecord, updateRecord, deleteRecord } from '@/lib/db';
import { validateDateRange, validateNotes, validateId, ValidationError } from '@/lib/validate';
import { fail, ok } from '@/lib/http';

export const dynamic = 'force-dynamic';

const notFound = (id) => Object.assign(new Error(`No record with id ${id}.`), { status: 404 });

export async function GET(_req, { params }) {
  try {
    const id = validateId((await params).id);
    return ok(getRecord(id) ?? (() => { throw notFound(id); })());
  } catch (e) {
    return fail(e);
  }
}

/**
 * PATCH-style PUT: send any of { location, startDate, endDate, notes }.
 * Changing the location or either date re-validates and re-fetches the weather,
 * so a stored record can never drift out of sync with what it claims to be.
 */
export async function PUT(req, { params }) {
  try {
    const id = validateId((await params).id);
    const existing = getRecord(id);
    if (!existing) throw notFound(id);

    const body = await req.json().catch(() => {
      throw new ValidationError('Request body must be valid JSON.');
    });

    const patch = {};
    if ('notes' in body) patch.notes = validateNotes(body.notes);

    const locationChanged = 'location' in body && String(body.location).trim() !== existing.query;
    const datesChanged =
      ('startDate' in body && body.startDate !== existing.startDate) ||
      ('endDate' in body && body.endDate !== existing.endDate);

    if (locationChanged || datesChanged) {
      const { start, end } = validateDateRange(
        body.startDate ?? existing.startDate,
        body.endDate ?? existing.endDate,
      );
      const query = String(body.location ?? existing.query).trim();
      if (!query) throw new ValidationError('Location cannot be empty.', 'location');

      const loc = await resolveOne(query);
      const days = await getRange({ lat: loc.lat, lon: loc.lon, start, end });
      Object.assign(patch, {
        query, label: loc.label, latitude: loc.lat, longitude: loc.lon, country: loc.country,
        startDate: start, endDate: end, summary: summarize(days), weather: days,
      });
    }

    if (!Object.keys(patch).length) throw new ValidationError('Nothing to update. Send location, startDate, endDate, or notes.');
    return ok(updateRecord(id, patch));
  } catch (e) {
    return fail(e);
  }
}

export async function DELETE(_req, { params }) {
  try {
    const id = validateId((await params).id);
    if (!deleteRecord(id)) throw notFound(id);
    return ok({ deleted: id });
  } catch (e) {
    return fail(e);
  }
}
