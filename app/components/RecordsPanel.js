'use client';

import { useEffect, useRef, useState } from 'react';
import { showTemp } from '@/lib/advice';

const today = () => new Date().toISOString().slice(0, 10);
const plus = (n) => new Date(Date.now() + n * 86400_000).toISOString().slice(0, 10);
const EXPORTS = ['json', 'csv', 'xml', 'md', 'pdf'];

/** CRUD over saved location + date-range weather records. */
export default function RecordsPanel({ unit, initialLocation = '' }) {
  const [form, setForm] = useState({ location: initialLocation, startDate: plus(-6), endDate: today(), notes: '' });
  const [records, setRecords] = useState([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [okMsg, setOkMsg] = useState('');
  const touchedLocation = useRef(false);
  const [editing, setEditing] = useState(null); // { id, location, startDate, endDate, notes }
  const [openId, setOpenId] = useState(null);

  const set = (k) => (e) => {
    if (k === 'location') touchedLocation.current = true;
    setForm((f) => ({ ...f, [k]: e.target.value }));
  };

  // This panel used to be unmounted whenever you left the tab, so it re-seeded
  // its location field from the current search every time you came back. It
  // stays mounted now, so keep that convenience explicitly — but never
  // overwrite a location the user typed themselves.
  useEffect(() => {
    if (touchedLocation.current || !initialLocation) return;
    setForm((f) => (f.location === initialLocation ? f : { ...f, location: initialLocation }));
  }, [initialLocation]);

  async function load(q = search) {
    try {
      const res = await fetch(`/api/records?search=${encodeURIComponent(q)}`);
      const body = await res.json();
      if (!res.ok) throw new Error(body.error);
      setRecords(body.records);
      setTotal(body.total);
    } catch (e) {
      setError(e.message);
    }
  }

  useEffect(() => { load(''); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  // Without this, every keystroke fired its own request — so typing "chicago"
  // sent seven, and they could land out of order and show stale results.
  const searchTimer = useRef(null);
  const debouncedLoad = (q) => {
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => load(q), 250);
  };
  useEffect(() => () => clearTimeout(searchTimer.current), []);

  async function send(url, options, successMsg) {
    setBusy(true); setError(''); setOkMsg('');
    try {
      const res = await fetch(url, options);
      const body = res.status === 204 ? {} : await res.json();
      if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status})`);
      setOkMsg(successMsg);
      await load();
      return body;
    } catch (e) {
      setError(e.message);
      return null;
    } finally {
      setBusy(false);
    }
  }

  const create = (e) => {
    e.preventDefault();
    send('/api/records', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    }, 'Record saved.').then((r) => r && setForm((f) => ({ ...f, notes: '' })));
  };

  const saveEdit = (e) => {
    e.preventDefault();
    send(`/api/records/${editing.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editing),
    }, `Record #${editing.id} updated.`).then((r) => r && setEditing(null));
  };

  const remove = (id) => {
    if (!confirm(`Delete record #${id}? This cannot be undone.`)) return;
    send(`/api/records/${id}`, { method: 'DELETE' }, `Record #${id} deleted.`);
  };

  return (
    <>
      <section className="panel">
        <h2>Save a weather record</h2>
        <p className="muted">
          Enter any location — city, postal code, landmark, or <code>lat,lon</code> — plus a date range.
          The server validates the dates, verifies the place exists, fetches the daily temperatures
          (historical archive for past dates, forecast for future ones) and stores the lot in SQLite.
        </p>
        <form onSubmit={create}>
          <div className="form-grid">
            <label>Location<br />
              <input required value={form.location} onChange={set('location')} placeholder="e.g. 61801, Eiffel Tower, or 40.71,-74.01" style={{ width: '100%' }} />
            </label>
            <label>Start date<br />
              <input required type="date" value={form.startDate} onChange={set('startDate')} max={plus(16)} style={{ width: '100%' }} />
            </label>
            <label>End date<br />
              <input required type="date" value={form.endDate} onChange={set('endDate')} max={plus(16)} style={{ width: '100%' }} />
            </label>
          </div>
          <label style={{ display: 'block', marginTop: '.6rem' }}>Notes (optional)<br />
            <textarea value={form.notes} onChange={set('notes')} placeholder="Why are you looking this up? e.g. Scouting a March trip." />
          </label>
          <div className="row" style={{ marginTop: '.6rem' }}>
            <button className="primary" disabled={busy}>{busy ? 'Working…' : 'Save record'}</button>
            <span className="muted">Range limit: 366 days, up to 16 days into the future.</span>
          </div>
        </form>
        {error && <div className="alert error" role="alert">⚠️ {error}</div>}
        {okMsg && <div className="alert ok" role="status">✅ {okMsg}</div>}
      </section>

      <section className="panel">
        <div className="spread">
          <h2 style={{ margin: 0 }}>Saved records ({total})</h2>
          <div className="row">
            <input
              placeholder="Search label, query, or notes"
              value={search}
              onChange={(e) => { setSearch(e.target.value); debouncedLoad(e.target.value); }}
              aria-label="Search records"
            />
            <span className="muted">Export:</span>
            {EXPORTS.map((f) => (
              <a key={f} className="chip" href={`/api/export?format=${f}&search=${encodeURIComponent(search)}`}>{f.toUpperCase()}</a>
            ))}
          </div>
        </div>

        {records.length === 0 ? (
          <p className="muted" style={{ marginTop: '.8rem' }}>No records yet. Save one above.</p>
        ) : (
          <div className="tablewrap" style={{ marginTop: '.8rem' }}>
            <table>
              <thead>
                <tr>
                  <th>#</th><th>Location</th><th>Range</th><th>Min</th><th>Max</th><th>Avg</th><th>Precip</th><th>Notes</th><th></th>
                </tr>
              </thead>
              <tbody>
                {records.map((r) => (
                  <tr key={r.id}>
                    <td>{r.id}</td>
                    <td title={r.label} style={{ maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.label}</td>
                    <td>{r.startDate} → {r.endDate}</td>
                    <td>{showTemp(r.summary.tempMin, unit)}</td>
                    <td>{showTemp(r.summary.tempMax, unit)}</td>
                    <td>{showTemp(r.summary.tempAvg, unit)}</td>
                    <td>{r.summary.precipTotal} mm</td>
                    <td style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.notes ?? '—'}</td>
                    <td>
                      <div className="row" style={{ flexWrap: 'nowrap' }}>
                        <button className="sm" onClick={() => setOpenId(openId === r.id ? null : r.id)}>{openId === r.id ? 'Hide' : 'Days'}</button>
                        <button className="sm" onClick={() => setEditing({ id: r.id, location: r.query, startDate: r.startDate, endDate: r.endDate, notes: r.notes ?? '' })}>Edit</button>
                        <button className="sm danger" onClick={() => remove(r.id)}>Delete</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {openId && (() => {
          const r = records.find((x) => x.id === openId);
          return r ? (
            <div style={{ marginTop: '.8rem' }}>
              <h3>Daily detail — {r.label}</h3>
              <div className="forecast">
                {r.weather.map((d) => (
                  <div className="day" key={d.date}>
                    <div>{d.date}</div>
                    <div className="day-ico" role="img" aria-label={d.label}>{d.icon}</div>
                    <div style={{ fontSize: '.85rem' }}>{d.label}</div>
                    <div><span className="day-hi">{showTemp(d.tempMax, unit)}</span> <span className="day-lo">{showTemp(d.tempMin, unit)}</span></div>
                    <div className="muted" style={{ fontSize: '.8rem' }}>💧 {d.precipSum ?? 0} mm</div>
                  </div>
                ))}
              </div>
              <div className="row" style={{ marginTop: '.6rem' }}>
                <span className="muted">Export just this record:</span>
                {EXPORTS.map((f) => <a key={f} className="chip" href={`/api/export?format=${f}&id=${r.id}`}>{f.toUpperCase()}</a>)}
              </div>
            </div>
          ) : null;
        })()}
      </section>

      {editing && (
        <section className="panel">
          <h2>Editing record #{editing.id}</h2>
          <p className="muted">Changing the location or dates re-validates the input and re-fetches the weather, so a stored record can never go stale.</p>
          <form onSubmit={saveEdit}>
            <div className="form-grid">
              <label>Location<br /><input required value={editing.location} onChange={(e) => setEditing({ ...editing, location: e.target.value })} style={{ width: '100%' }} /></label>
              <label>Start date<br /><input required type="date" value={editing.startDate} onChange={(e) => setEditing({ ...editing, startDate: e.target.value })} style={{ width: '100%' }} /></label>
              <label>End date<br /><input required type="date" value={editing.endDate} onChange={(e) => setEditing({ ...editing, endDate: e.target.value })} style={{ width: '100%' }} /></label>
            </div>
            <label style={{ display: 'block', marginTop: '.6rem' }}>Notes<br />
              <textarea value={editing.notes} onChange={(e) => setEditing({ ...editing, notes: e.target.value })} />
            </label>
            <div className="row" style={{ marginTop: '.6rem' }}>
              <button className="primary" disabled={busy}>Save changes</button>
              <button type="button" onClick={() => setEditing(null)}>Cancel</button>
            </div>
          </form>
        </section>
      )}
    </>
  );
}
