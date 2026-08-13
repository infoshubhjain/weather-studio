'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import WeatherPanel from './components/WeatherPanel';
import RecordsPanel from './components/RecordsPanel';
import DiscoverPanel from './components/DiscoverPanel';
import LocationWallet from './components/LocationWallet';
import SkyCanvas from './components/SkyCanvas';
import Precip from './components/Precip';
import { skyParams, skyGradient } from '@/lib/sky';
import { addPlace, getWallet, hasPlace, getUnit, setUnit as persistUnit } from '@/lib/wallet';

const TABS = [
  ['now', 'Now'],
  ['wallet', 'Wallet'],
  ['archive', 'Archive'],
  ['discover', 'Discover'],
  ['about', 'About'],
];

const NEUTRAL = {
  horizon: [0.07, 0.10, 0.18], zenith: [0.03, 0.04, 0.08],
  cloud: 0.35, day: 0, sunY: -0.2, storm: 0, precip: 0, kind: 'none',
};

export default function Home() {
  const [query, setQuery] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [unit, setUnit] = useState('C');
  const [tab, setTab] = useState('now');
  const [saved, setSaved] = useState(false);
  const bootstrapped = useRef(false);

  const fetchWeather = useCallback(async (params, label) => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/weather?${new URLSearchParams(params)}`);
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status})`);
      setData(body);
      setSaved(hasPlace(body.location.lat, body.location.lon));
      if (label) localStorage.setItem('lastQuery', label);
      return body;
    } catch (e) {
      setError(navigator.onLine === false
        ? 'You appear to be offline. Reconnect and try again.'
        : e.message);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Boot order: your actual position first, because that is almost always what
   * you want. If permission is denied or unavailable we fall back to the first
   * place in your wallet, then your last search, then a sensible default —
   * so the page is never empty and never blocks on a permission dialog.
   */
  useEffect(() => {
    if (bootstrapped.current) return;
    bootstrapped.current = true;
    setUnit(getUnit());

    const fallback = () => {
      const wallet = getWallet();
      if (wallet.length) return fetchWeather({ lat: wallet[0].lat, lon: wallet[0].lon }, wallet[0].name);
      const last = localStorage.getItem('lastQuery');
      if (last) { setQuery(last); return fetchWeather({ q: last }, last); }
      return fetchWeather({ q: 'Chicago' }, null);
    };

    if (!navigator.geolocation) { fallback(); return; }

    let settled = false;
    // Don't leave the page loading forever if the user ignores the prompt.
    const timer = setTimeout(() => { if (!settled) { settled = true; fallback(); } }, 9000);

    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        if (settled) return;
        settled = true; clearTimeout(timer);
        fetchWeather({ lat: coords.latitude, lon: coords.longitude }, null);
      },
      () => {
        if (settled) return;
        settled = true; clearTimeout(timer);
        fallback();
      },
      { timeout: 8000, maximumAge: 300_000 },
    );
  }, [fetchWeather]);

  const search = (e) => {
    e?.preventDefault();
    const q = query.trim();
    if (!q) { setError('Enter a place to search for.'); return; }
    setTab('now');
    fetchWeather({ q }, q);
  };

  const useMyLocation = () => {
    if (!navigator.geolocation) { setError('This browser has no geolocation. Type a place instead.'); return; }
    setLoading(true); setError('');
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => { setTab('now'); fetchWeather({ lat: coords.latitude, lon: coords.longitude }, null); },
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

  const toggleUnit = () => setUnit((u) => {
    const next = u === 'C' ? 'F' : 'C';
    persistUnit(next);
    return next;
  });

  const saveCurrent = () => {
    if (!data) return;
    addPlace(data.location);
    setSaved(true);
  };

  const pickPlace = (p) => { setTab('now'); fetchWeather({ lat: p.lat, lon: p.lon }, p.name); };

  const sky = data ? skyParams(data, data.location) : NEUTRAL;
  const fallbackSky = data ? skyGradient(data, data.location) : 'linear-gradient(170deg,#0a0d16,#070a13)';

  return (
    <>
      <SkyCanvas params={sky} fallback={fallbackSky} />
      <Precip kind={sky.kind} intensity={sky.precip} wind={data?.current?.windSpeed ?? 0} />

      <main className="shell">
        <header className="masthead">
          <div className="brand">
            <div className="brand-mark" aria-hidden="true" />
            <div>
              <h1>Weather Studio</h1>
              <p>Shubh Jain · PM Accelerator assessment</p>
            </div>
          </div>
          <div className="row">
            <button onClick={toggleUnit} aria-label={`Switch to degrees ${unit === 'C' ? 'Fahrenheit' : 'Celsius'}`}>
              °C / °F
            </button>
          </div>
        </header>

        <form className="searchbar" onSubmit={search} role="search">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="City, postal code, landmark, or 41.88,-87.63"
            aria-label="Search for a location"
            autoComplete="off"
          />
          <button className="primary" disabled={loading}>{loading ? 'Loading…' : 'Search'}</button>
          <button type="button" onClick={useMyLocation} disabled={loading}>Use my location</button>
        </form>

        {error && <div className="alert error" role="alert"><span aria-hidden="true">⚠</span><span>{error}</span></div>}

        <nav className="tabs" role="tablist" aria-label="Sections">
          {TABS.map(([id, label]) => (
            <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>{label}</button>
          ))}
        </nav>

        {tab === 'now' && (
          loading && !data ? (
            <>
              <div className="hero" />
              <div className="panel"><div className="skeleton" /></div>
            </>
          ) : data ? (
            <WeatherPanel
              data={data}
              unit={unit}
              saved={saved}
              onSave={saveCurrent}
              onPickAlternative={(a) => fetchWeather({ lat: a.lat, lon: a.lon }, a.label)}
            />
          ) : !error && <div className="panel"><p className="muted">Search for a place to begin.</p></div>
        )}

        {tab === 'wallet' && (
          <LocationWallet current={data?.location} unit={unit} onPick={pickPlace} />
        )}

        {tab === 'archive' && <RecordsPanel unit={unit} initialLocation={data?.location?.name ?? ''} />}
        {tab === 'discover' && <DiscoverPanel query={data?.location?.name ?? ''} />}
        {tab === 'about' && <About />}

        <footer className="site">
          <p>
            <b>Data</b> — Open-Meteo (forecast · historical archive · air quality · geocoding) ·
            OpenStreetMap Nominatim · Wikipedia REST &amp; GeoSearch · World Bank · flagcdn · YouTube.
            All keyless.
          </p>
          <p>
            <b>Rendering</b> — the sky is a hand-written WebGL fragment shader driven by live cloud cover,
            solar elevation and condition code; precipitation is a canvas particle layer scaled to measured
            rainfall. No 3D library.
          </p>
        </footer>
      </main>
    </>
  );
}

function About() {
  return (
    <section className="panel">
      <p className="eyebrow">About</p>
      <h2 style={{ marginBottom: '.75rem' }}>Weather Studio</h2>
      <p><b>Shubh Jain</b> — shubhj3@illinois.edu</p>
      <p>
        A full-stack weather app covering both halves of the PM Accelerator AI Engineer Intern
        assessment: a responsive React/Next.js frontend (Assessment #1) and a REST API with SQLite
        persistence, full CRUD, validation and five export formats (Assessment #2).
      </p>

      <h3 style={{ margin: '1.5rem 0 .5rem' }}>Product Manager Accelerator</h3>
      <p>
        The Product Manager Accelerator Program is designed to support PM professionals through every
        stage of their careers. From students looking for entry-level jobs to Directors seeking to take
        on a leadership role, PMA has helped hundreds of students fulfill their career aspirations. Its
        mission is to make product management accessible: hands-on training, real-world projects, resume
        and interview coaching, and a community of product leaders who guide members from their first PM
        role through to senior leadership.
      </p>
      <p>
        <a href="https://www.linkedin.com/school/pmaccelerator/" target="_blank" rel="noreferrer">
          Product Manager Accelerator on LinkedIn →
        </a>
      </p>
    </section>
  );
}
