'use client';

import { useCallback, useEffect, useState } from 'react';
import WeatherPanel from './components/WeatherPanel';
import RecordsPanel from './components/RecordsPanel';
import DiscoverPanel from './components/DiscoverPanel';

const TABS = [
  ['weather', '🌤️ Weather'],
  ['records', '🗂️ Saved records (CRUD)'],
  ['discover', '🗺️ Discover'],
  ['about', 'ℹ️ About'],
];

export default function Home() {
  const [query, setQuery] = useState('');
  const [submitted, setSubmitted] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [unit, setUnit] = useState('C');
  const [tab, setTab] = useState('weather');

  const fetchWeather = useCallback(async (params, label) => {
    setLoading(true); setError(''); setData(null);
    try {
      const res = await fetch(`/api/weather?${new URLSearchParams(params)}`);
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status})`);
      setData(body);
      setSubmitted(label ?? body.location.name);
    } catch (e) {
      // Covers both a real API error response and a dead network connection.
      setError(navigator.onLine === false ? 'You appear to be offline. Reconnect and try again.' : e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  // Remember the last place across reloads — nobody wants to retype it.
  useEffect(() => {
    const last = localStorage.getItem('lastQuery');
    const u = localStorage.getItem('unit');
    if (u) setUnit(u);
    if (last) { setQuery(last); fetchWeather({ q: last }, last); }
  }, [fetchWeather]);

  const search = (e) => {
    e?.preventDefault();
    const q = query.trim();
    if (!q) { setError('Please enter a location to search.'); return; }
    localStorage.setItem('lastQuery', q);
    fetchWeather({ q }, q);
  };

  const useMyLocation = () => {
    if (!navigator.geolocation) { setError('Your browser does not support geolocation. Type a location instead.'); return; }
    setLoading(true); setError('');
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => fetchWeather({ lat: coords.latitude, lon: coords.longitude }, 'My location'),
      (err) => {
        setLoading(false);
        setError({
          1: 'Location permission denied. Type a place name instead.',
          2: 'Your position is unavailable right now. Try typing a location.',
          3: 'Timed out getting your position. Try again or type a location.',
        }[err.code] ?? 'Could not get your location.');
      },
      { timeout: 10_000, maximumAge: 300_000 },
    );
  };

  const toggleUnit = () => setUnit((u) => { const n = u === 'C' ? 'F' : 'C'; localStorage.setItem('unit', n); return n; });

  return (
    <main className="wrap">
      <header className="top">
        <div className="spread">
          <div>
            <h1>🌤️ Weather Studio</h1>
            <p className="muted" style={{ margin: 0 }}>
              Built by <b>Shubh Jain</b> for the PM Accelerator AI Engineer Intern assessment (Tech Assessment #1 + #2).
            </p>
          </div>
          <button onClick={toggleUnit} aria-label="Toggle temperature units">Show °{unit === 'C' ? 'F' : 'C'}</button>
        </div>
      </header>

      <form className="card searchbar" onSubmit={search} role="search">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="City, town, postal code, landmark, or 41.88,-87.63"
          aria-label="Location"
          autoComplete="off"
        />
        <button className="primary" disabled={loading}>{loading ? 'Loading…' : 'Get weather'}</button>
        <button type="button" onClick={useMyLocation} disabled={loading}>📍 Use my location</button>
      </form>

      {error && <div className="alert error" role="alert">⚠️ {error}</div>}

      <nav className="tabs" role="tablist">
        {TABS.map(([id, label]) => (
          <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>{label}</button>
        ))}
      </nav>

      {tab === 'weather' && (
        loading ? <div className="card"><div className="skeleton" /></div>
        : data ? <WeatherPanel data={data} unit={unit} onPickAlternative={(a) => fetchWeather({ lat: a.lat, lon: a.lon }, a.label)} />
        : !error && <div className="card"><p className="muted">Search a location above, or use your current position.</p></div>
      )}

      {tab === 'records' && <RecordsPanel unit={unit} initialLocation={submitted} />}
      {tab === 'discover' && <DiscoverPanel query={submitted} />}
      {tab === 'about' && <About />}

      <footer className="muted" style={{ marginTop: '1.5rem' }}>
        Data: Open-Meteo (forecast, archive, air quality) · Open-Meteo Geocoding · OpenStreetMap Nominatim ·
        Wikipedia REST &amp; GeoSearch · World Bank · flagcdn · YouTube.
      </footer>
    </main>
  );
}

function About() {
  return (
    <section className="card">
      <h2>About this project</h2>
      <p><b>Author:</b> Shubh Jain — shubhj3@illinois.edu</p>
      <p>
        A full-stack weather app covering both halves of the assessment: a responsive React/Next.js frontend
        (Assessment #1) and a REST API with SQLite persistence, CRUD, validation and multi-format export
        (Assessment #2).
      </p>
      <h3>About PM Accelerator</h3>
      <p>
        The Product Manager Accelerator Program is designed to support PM professionals through every stage of
        their careers. From students looking for entry-level jobs to Directors seeking to take on a leadership
        role, PMA has helped hundreds of students fulfill their career aspirations. Its mission is to make
        product management accessible: hands-on training, real-world projects, resume and interview coaching,
        and a community of product leaders who guide members from their first PM role through to senior
        leadership.
      </p>
      <p>
        <a href="https://www.linkedin.com/school/pmaccelerator/" target="_blank" rel="noreferrer">
          Product Manager Accelerator on LinkedIn →
        </a>
      </p>
    </section>
  );
}
