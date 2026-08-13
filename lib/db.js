// SQLite persistence via libSQL.
//
// One code path, two deployments:
//   · No env vars      → a local file at ./data/weather.db (zero config, just clone and run)
//   · TURSO_* env vars → hosted Turso, same SQL dialect
//
// The hosted option matters because serverless platforms (Vercel, Netlify)
// have an ephemeral filesystem: a local SQLite file is wiped on every cold
// start and is not shared between instances, so CRUD appears to work and then
// silently loses records. Turso is the smallest fix that keeps the SQL identical.

import { createClient } from '@libsql/client';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

/**
 * Serverless platforms mount the deployment read-only; only /tmp is writable.
 * Without this, every write fails with SQLITE_READONLY and CRUD is dead in
 * production. /tmp is a safety net, not a fix: it is per-container and wiped on
 * cold start, so records survive a demo session and nothing longer. Set
 * TURSO_DATABASE_URL for real persistence.
 */
export const isEphemeral = () =>
  !process.env.TURSO_DATABASE_URL &&
  Boolean(process.env.VERCEL || process.env.NETLIFY || process.env.AWS_LAMBDA_FUNCTION_NAME);

function defaultFile() {
  if (process.env.WEATHER_DB) return process.env.WEATHER_DB;
  if (isEphemeral()) return '/tmp/weather.db';
  return path.join(process.cwd(), 'data', 'weather.db');
}

function connect() {
  const url = process.env.TURSO_DATABASE_URL;
  if (url) {
    return createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN });
  }
  const file = defaultFile();
  if (file !== ':memory:') {
    try {
      mkdirSync(path.dirname(file), { recursive: true });
    } catch {
      // Read-only filesystem — /tmp already exists, so this is safe to ignore.
    }
  }
  return createClient({ url: file === ':memory:' ? ':memory:' : `file:${file}` });
}

// Next dev-mode hot reload re-evaluates modules; reuse the handle so we don't
// leak connections. ponytail: globalThis cache is the standard Next idiom.
const db = (globalThis.__weatherDb ??= connect());

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS records (
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
   )`,
  `CREATE INDEX IF NOT EXISTS idx_records_created ON records(created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_records_label   ON records(label)`,
];

// Run migrations once per process, and make every query await the same promise
// so concurrent first-requests can't race each other to CREATE TABLE.
const ready = (globalThis.__weatherDbReady ??= (async () => {
  for (const sql of SCHEMA) await db.execute(sql);
})());

const hydrate = (r) =>
  r && {
    id: Number(r.id),
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

export async function createRecord(r) {
  await ready;
  const res = await db.execute({
    sql: `INSERT INTO records (query,label,latitude,longitude,country,start_date,end_date,notes,summary_json,weather_json)
          VALUES (?,?,?,?,?,?,?,?,?,?)`,
    args: [r.query, r.label, r.latitude, r.longitude, r.country ?? null, r.startDate, r.endDate,
           r.notes ?? null, JSON.stringify(r.summary), JSON.stringify(r.weather)],
  });
  return getRecord(Number(res.lastInsertRowid));
}

export async function getRecord(id) {
  await ready;
  const res = await db.execute({ sql: 'SELECT * FROM records WHERE id = ?', args: [id] });
  return hydrate(res.rows[0]);
}

/** READ with optional free-text search over label/query/notes. */
export async function listRecords({ search = '', limit = 100, offset = 0 } = {}) {
  await ready;
  const where = search ? 'WHERE label LIKE ? OR query LIKE ? OR notes LIKE ?' : '';
  const like = `%${search}%`;
  const filterArgs = search ? [like, like, like] : [];

  const [rows, count] = await Promise.all([
    db.execute({
      sql: `SELECT * FROM records ${where} ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`,
      args: [...filterArgs, Math.min(Number(limit) || 100, 500), Math.max(Number(offset) || 0, 0)],
    }),
    db.execute({ sql: `SELECT COUNT(*) AS n FROM records ${where}`, args: filterArgs }),
  ]);

  return { total: Number(count.rows[0].n), records: rows.rows.map(hydrate) };
}

/** UPDATE. Only whitelisted columns are writable. */
const WRITABLE = {
  query: 'query', label: 'label', latitude: 'latitude', longitude: 'longitude',
  country: 'country', startDate: 'start_date', endDate: 'end_date', notes: 'notes',
  summary: 'summary_json', weather: 'weather_json',
};

export async function updateRecord(id, patch) {
  await ready;
  if (!(await getRecord(id))) return null;

  const sets = [], args = [];
  for (const [k, col] of Object.entries(WRITABLE)) {
    if (!(k in patch)) continue;
    sets.push(`${col} = ?`);
    args.push(k === 'summary' || k === 'weather' ? JSON.stringify(patch[k]) : patch[k]);
  }
  if (!sets.length) return getRecord(id);

  sets.push(`updated_at = datetime('now')`);
  await db.execute({ sql: `UPDATE records SET ${sets.join(', ')} WHERE id = ?`, args: [...args, id] });
  return getRecord(id);
}

export async function deleteRecord(id) {
  await ready;
  const res = await db.execute({ sql: 'DELETE FROM records WHERE id = ?', args: [id] });
  return res.rowsAffected > 0;
}

/** Health probe: row count + which backend is live. */
export async function dbStatus() {
  await ready;
  const res = await db.execute('SELECT COUNT(*) AS n FROM records');
  return {
    backend: process.env.TURSO_DATABASE_URL ? 'turso' : isEphemeral() ? 'ephemeral-tmp' : 'local-file',
    records: Number(res.rows[0].n),
    // Surfaced so a deploy that will silently lose data is obvious at a glance.
    warning: isEphemeral()
      ? 'Using /tmp: records are wiped on cold start and not shared between instances. Set TURSO_DATABASE_URL for durable storage.'
      : undefined,
  };
}

export default db;
