// Tiny in-process TTL cache for upstream API responses.
//
// Two reasons this exists, both real:
//   1. Nominatim's usage policy is ~1 request/second and they block violators.
//      The Location Wallet renders N cards at once, each triggering a reverse
//      geocode — without this, a wallet of 8 places is an instant policy breach.
//   2. Weather doesn't change second to second. Re-fetching Chicago for every
//      visitor is wasted latency and burns the free-tier quota.
//
// ponytail: a Map is the right size for this. Swap for Redis only when the app
// runs on more than one instance and the duplicate upstream calls actually cost
// something.

const store = new Map();

/** Evict expired entries, and bound the map so a long-lived process can't grow forever. */
function sweep(max = 500) {
  const now = Date.now();
  for (const [k, v] of store) if (v.expires <= now) store.delete(k);
  if (store.size > max) {
    // Oldest-inserted first — Map preserves insertion order.
    for (const k of [...store.keys()].slice(0, store.size - max)) store.delete(k);
  }
}

/**
 * Run `fn` and cache its result under `key` for `ttlMs`.
 * Concurrent callers for the same key share one in-flight promise, so ten
 * wallet cards asking for the same city produce exactly one upstream request.
 */
export function cached(key, ttlMs, fn) {
  const hit = store.get(key);
  if (hit && hit.expires > Date.now()) return hit.value;

  const value = Promise.resolve()
    .then(fn)
    .catch((err) => {
      // Never cache a failure — otherwise one blip poisons the key for the
      // whole TTL.
      store.delete(key);
      throw err;
    });

  store.set(key, { value, expires: Date.now() + ttlMs });
  sweep();
  return value;
}

export const cacheStats = () => ({ size: store.size });

/** Test seam. */
export const clearCache = () => store.clear();
