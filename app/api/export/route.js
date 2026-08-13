// GET /api/export?format=json|csv|xml|md|pdf[&id=3][&search=paris]
import { listRecords, getRecord } from '@/lib/db';
import { exportRecords, FORMATS } from '@/lib/export';
import { validateId } from '@/lib/validate';
import { rateLimit } from '@/lib/ratelimit';
import { fail } from '@/lib/http';

export const dynamic = 'force-dynamic';

export async function GET(req) {
  try {
    const limited = rateLimit(req, { max: 20, windowMs: 60_000, key: 'export' });
    if (limited) return limited;

    const p = req.nextUrl.searchParams;
    const format = (p.get('format') ?? 'json').toLowerCase();
    const meta = FORMATS[format];
    if (!meta) {
      throw Object.assign(new Error(`Unsupported format "${format}". Use: ${Object.keys(FORMATS).join(', ')}.`), { status: 400 });
    }

    let records;
    if (p.get('id')) {
      const id = validateId(p.get('id'));
      const r = await getRecord(id);
      if (!r) throw Object.assign(new Error(`No record with id ${id}.`), { status: 404 });
      records = [r];
    } else {
      records = (await listRecords({ search: p.get('search') ?? '', limit: 500 })).records;
    }

    const body = exportRecords(records, format);
    const name = `weather-export-${new Date().toISOString().slice(0, 10)}.${meta.ext}`;
    return new Response(body, {
      headers: {
        'Content-Type': `${meta.type}; charset=utf-8`,
        'Content-Disposition': `attachment; filename="${name}"`,
      },
    });
  } catch (e) {
    return fail(e);
  }
}
