// Location Wallet — the user's saved places, persisted in localStorage.
// A place is identified by rounded coordinates, so "Chicago" typed two
// different ways doesn't create two entries.

const KEY = 'weather.wallet.v1';
const UNIT = 'weather.unit';

export const placeId = (lat, lon) => `${lat.toFixed(3)},${lon.toFixed(3)}`;

const read = () => {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY));
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
};

const write = (list) => {
  localStorage.setItem(KEY, JSON.stringify(list));
  // Same-tab listeners; the native `storage` event only fires cross-tab.
  window.dispatchEvent(new CustomEvent('wallet:change', { detail: list }));
  return list;
};

export const getWallet = () => (typeof window === 'undefined' ? [] : read());

/** Add a place, or move it to the front if it's already saved. */
export function addPlace(location) {
  const id = placeId(location.lat, location.lon);
  const entry = {
    id,
    name: location.name,
    label: location.label,
    country: location.country ?? '',
    countryCode: location.countryCode ?? '',
    lat: location.lat,
    lon: location.lon,
    addedAt: Date.now(),
  };
  const rest = read().filter((p) => p.id !== id);
  return write([entry, ...rest].slice(0, 12)); // 12 is plenty; keeps the rail scannable
}

export const removePlace = (id) => write(read().filter((p) => p.id !== id));

export const hasPlace = (lat, lon) =>
  read().some((p) => p.id === placeId(lat, lon));

/** Move a place one slot left or right in the rail. */
export function reorder(id, dir) {
  const list = read();
  const i = list.findIndex((p) => p.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= list.length) return list;
  [list[i], list[j]] = [list[j], list[i]];
  return write(list);
}

export const getUnit = () =>
  (typeof window === 'undefined' ? 'C' : localStorage.getItem(UNIT) || 'C');
export const setUnit = (u) => localStorage.setItem(UNIT, u);
