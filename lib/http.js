// One place that turns thrown errors into JSON responses, so every route
// fails the same way instead of each one inventing its own shape.
export function fail(err) {
  const status = err?.status ?? 500;
  if (status >= 500) console.error('[api]', err);
  return Response.json(
    { error: err?.message ?? 'Unexpected server error.', field: err?.field, status },
    { status },
  );
}

export const ok = (data, init) => Response.json(data, init);

/**
 * Shared-cache headers for a successful GET.
 *
 * The in-process cache in lib/cache.js is per-instance and dies on every cold
 * start, so on a serverless host it misses far more than it hits. This puts the
 * response in the CDN instead, where a repeat request is served without waking
 * the function at all. `stale-while-revalidate` means the refresh happens
 * behind an already-served response rather than in front of the user.
 */
export const cacheFor = (seconds, swr = seconds * 6) => ({
  headers: { 'Cache-Control': `public, s-maxage=${seconds}, stale-while-revalidate=${swr}` },
});
