// Fixed-window per-IP rate limiter.
//
// This exists because every route here fans out to third-party APIs that have
// their own quotas (Nominatim ~1 req/sec, Open-Meteo ~10k/day, and any LLM key
// costs real money). Without a limit, one script can burn the whole quota and
// take the app down for everyone — or run up a bill.
//
// ponytail: in-memory fixed window is the right size for a single-instance
// deploy. Move to Upstash/Redis only when running more than one instance, where
// per-process counters stop adding up to a real limit.

const buckets = new Map();

/** Best-effort client IP. Proxies (Vercel, Cloudflare) set these headers. */
export function clientIp(req) {
  const h = req.headers;
  return (
    h.get('x-forwarded-for')?.split(',')[0].trim() ||
    h.get('x-real-ip') ||
    h.get('cf-connecting-ip') ||
    'unknown'
  );
}

/**
 * Returns null when the request is allowed, or a 429 Response when it isn't.
 *
 *   const limited = rateLimit(req, { max: 30, windowMs: 60_000 });
 *   if (limited) return limited;
 */
export function rateLimit(req, { max = 60, windowMs = 60_000, key = 'global' } = {}) {
  const now = Date.now();
  const id = `${key}:${clientIp(req)}`;
  const b = buckets.get(id);

  if (!b || b.reset <= now) {
    buckets.set(id, { count: 1, reset: now + windowMs });
    if (buckets.size > 5000) sweep(now);
    return null;
  }

  b.count += 1;
  if (b.count <= max) return null;

  const retryAfter = Math.ceil((b.reset - now) / 1000);
  return Response.json(
    {
      error: `Too many requests. Try again in ${retryAfter}s.`,
      status: 429,
    },
    {
      status: 429,
      headers: {
        'Retry-After': String(retryAfter),
        'X-RateLimit-Limit': String(max),
        'X-RateLimit-Remaining': '0',
        'X-RateLimit-Reset': String(Math.ceil(b.reset / 1000)),
      },
    },
  );
}

function sweep(now) {
  for (const [k, v] of buckets) if (v.reset <= now) buckets.delete(k);
}

export const limiterStats = () => ({ trackedClients: buckets.size });
