// SQLite persistence via Node's built-in node:sqlite (Node >= 22.5) — no
// native module to compile, no ORM. The file lives at ./data/weather.db.

import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

const file = process.env.WEATHER_DB ?? path.join(process.cwd(), 'data', 'weather.db');

function open() {
  if (file !== ':memory:') mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS records (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      query         TEXT    NOT NULL,
      label         TEXT    NOT NULL,
      latitude      REAL    NOT NULL,
      longitude     REAL    NOT NULL,
      country       TEXT,
      start_date    TEXT    NOT NULL,
      end_date      TEXT    NOT NULL,
      notes         TEXT,
      summary_json  TEXT    NOT NULL,
      weather_json  TEXT    NOT NULL,
      created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at    TEXT    NOT NULL DEFAULT (datetime('now')),
      CHECK (start_date <= end_date)
    );
    CREATE INDEX IF NOT EXISTS idx_records_created ON records(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_records_label   ON records(label);
  `);
  return db;
}

// Next dev-mode hot reload re-evaluates modules; reuse the handle so we don't
// leak connections. ponytail: globalThis cache is the standard Next idiom.
const db = (globalThis.__weatherDb ??= open());

const hydrate = (r) =>
  r && {
    id: r.id,
    query: r.query,
    label: r.label,
    latitude: r.latitude,
    longitude: r.longitude,
    country: r.country,
    startDate: r.start_date,
    endDate: r.end_date,
    notes: r.notes,
    summary: JSON.parse(r.summary_json),
    weather: JSON.parse(r.weather_json),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };

export function createRecord(r) {
  const { lastInsertRowid } = db
    .prepare(
      `INSERT INTO records (query,label,latitude,longitude,country,start_date,end_date,notes,summary_json,weather_json)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
    )
    .run(r.query, r.label, r.latitude, r.longitude, r.country ?? null, r.startDate, r.endDate,
         r.notes ?? null, JSON.stringify(r.summary), JSON.stringify(r.weather));
  return getRecord(Number(lastInsertRowid));
}

export const getRecord = (id) => hydrate(db.prepare('SELECT * FROM records WHERE id = ?').get(id));

/** READ with optional free-text search over label/query/notes. */
export function listRecords({ search = '', limit = 100, offset = 0 } = {}) {
  const where = search ? 'WHERE label LIKE :q OR query LIKE :q OR notes LIKE :q' : '';
  const params = search ? { q: `%${search}%` } : {};
  const rows = db
    .prepare(`SELECT * FROM records ${where} ORDER BY created_at DESC, id DESC LIMIT ${+limit} OFFSET ${+offset}`)
    .all(params);
  const { n } = db.prepare(`SELECT COUNT(*) AS n FROM records ${where}`).get(params);
  return { total: n, records: rows.map(hydrate) };
}

/** UPDATE. Only whitelisted columns are writable. */
const WRITABLE = {
  query: 'query', label: 'label', latitude: 'latitude', longitude: 'longitude',
  country: 'country', startDate: 'start_date', endDate: 'end_date', notes: 'notes',
  summary: 'summary_json', weather: 'weather_json',
};

export function updateRecord(id, patch) {
  if (!getRecord(id)) return null;
  const sets = [], vals = [];
  for (const [k, col] of Object.entries(WRITABLE)) {
    if (!(k in patch)) continue;
    sets.push(`${col} = ?`);
    vals.push(k === 'summary' || k === 'weather' ? JSON.stringify(patch[k]) : patch[k]);
  }
  if (!sets.length) return getRecord(id);
  sets.push(`updated_at = datetime('now')`);
  db.prepare(`UPDATE records SET ${sets.join(', ')} WHERE id = ?`).run(...vals, id);
  return getRecord(id);
}

export const deleteRecord = (id) => db.prepare('DELETE FROM records WHERE id = ?').run(id).changes > 0;

export default db;
