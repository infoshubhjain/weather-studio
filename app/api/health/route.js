// GET /api/health — one call that answers "is this deploy actually working?"
//
// Checks the database and each upstream dependency, and reports which optional
// integrations are configured. Returns 200 when everything essential is up and
// 503 when it isn't, so an uptime monitor can watch it directly.

import { dbStatus } from '@/lib/db';
import { cacheStats } from '@/lib/cache';
import { limiterStats } from '@/lib/ratelimit';

export const dynamic = 'force-dynamic';

const started = Date.now();

/** Probe a dependency without letting a slow one hold up the whole report. */
async function probe(name, url, essential = true) {
  const t0 = Date.now();
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    return { name, ok: res.ok, status: res.status, ms: Date.now() - t0, essential };
  } catch (e) {
    return { name, ok: false, error: e.name === 'TimeoutError' ? 'timeout' : 'unreachable', ms: Date.now() - t0, essential };
  }
}

export async function GET() {
  const [db, ...deps] = await Promise.all([
    dbStatus().then((s) => ({ ok: true, ...s })).catch((e) => ({ ok: false, error: e.message })),
    probe('open-meteo-forecast', 'https://api.open-meteo.com/v1/forecast?latitude=0&longitude=0&current=temperature_2m'),
    probe('open-meteo-geocoding', 'https://geocoding-api.open-meteo.com/v1/search?name=paris&count=1'),
    probe('open-meteo-archive', 'https://archive-api.open-meteo.com/v1/archive?latitude=0&longitude=0&start_date=2020-01-01&end_date=2020-01-02&daily=temperature_2m_max', false),
    probe('nominatim', 'https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=paris', false),
  ]);

  const healthy = db.ok && deps.every((d) => d.ok || !d.essential);

  return Response.json(
    {
      status: healthy ? 'ok' : 'degraded',
      uptimeSeconds: Math.round((Date.now() - started) / 1000),
      checkedAt: new Date().toISOString(),
      database: db,
      dependencies: deps,
      cache: cacheStats(),
      rateLimiter: limiterStats(),
      integrations: {
        // Booleans only — never report key values from a public endpoint.
        aiParsing: Boolean(process.env.AI_API_KEY),
        youtube: Boolean(process.env.YOUTUBE_API_KEY),
        googleMaps: Boolean(process.env.GOOGLE_MAPS_API_KEY),
        turso: Boolean(process.env.TURSO_DATABASE_URL),
      },
    },
    {
      status: healthy ? 200 : 503,
      headers: { 'Cache-Control': 'no-store' },
    },
  );
}
