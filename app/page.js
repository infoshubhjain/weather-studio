'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import WeatherPanel from './components/WeatherPanel';
import RecordsPanel from './components/RecordsPanel';
import DiscoverPanel from './components/DiscoverPanel';
import LocationWallet from './components/LocationWallet';
import AskBox from './components/AskBox';
import Logo from './components/Logo';
import CursorGlow from './components/CursorGlow';
import About from './components/About';
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

/**
 * Renders a tab's contents once it has been opened, then hides it with CSS
 * instead of unmounting. Keeping the subtree alive is what makes going back to
 * a tab instant: its state, and everything it already fetched, survives.
 * `inert` keeps a hidden pane out of the tab order and away from screen
 * readers, which `display: none` already does but is worth being explicit
 * about for the keyboard path.
 */
function Pane({ id, tab, visited, children }) {
  if (!visited.has(id)) return null;
  const active = tab === id;
  return (
    <div
      role="tabpanel"
      id={`panel-${id}`}
      aria-labelledby={`tab-${id}`}
      hidden={!active}
      inert={!active}
      style={active ? undefined : { display: 'none' }}
    >
      {children}
    </div>
  );
}

export default function Home() {
  const [query, setQuery] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [unit, setUnit] = useState('F');   // see lib/wallet.js getUnit()
  const [tab, setTab] = useState('now');
  const [saved, setSaved] = useState(false);
  const bootstrapped = useRef(false);
  // Bumped on every weather fetch. The climate-normals follow-up carries the
  // value it started with, so a slow reply for a place the user has already
  // navigated away from is discarded instead of overwriting the current one.
  const fetchSeq = useRef(0);
  // A tab is rendered from the first time it is opened and then only hidden,
  // never unmounted. Unmounting threw away the panel's state, so every return
  // to Discover re-ran its five-API fan-out and every return to Wallet
  // re-fetched one request per saved card.
  const [visited, setVisited] = useState(() => new Set(['now']));
  // Set as soon as the user does anything deliberate. The geolocation callback
  // can resolve seconds after boot — without this it silently overwrites a
  // search the user already typed, and their query just vanishes.
  const userActed = useRef(false);

  /**
   * The "is this normal for this date?" line. Split out of /api/weather
   * because the 15-year archive lookup behind it costs seconds and the
   * forecast should never wait on an enrichment — it arrives a moment later
   * and fills itself in.
   */
  const fetchNormals = useCallback(async (body, seq) => {
    const day = body.daily?.[0];
    if (!day) return;
    try {
      const res = await fetch(`/api/normals?${new URLSearchParams({
        lat: body.location.lat, lon: body.location.lon, date: day.date, tempMax: day.tempMax,
      })}`);
      if (!res.ok) return;                       // enrichment: stay silent
      const { normal, anomaly } = await res.json();
      if (!normal || !anomaly) return;
      if (seq !== fetchSeq.current) return;      // a newer search already won
      setData((d) => (d === body ? { ...d, climate: { normal, anomaly } } : d));
    } catch {
      /* enrichment only — a missing baseline must never surface as an error */
    }
  }, []);

  const fetchWeather = useCallback(async (params, label) => {
    const seq = ++fetchSeq.current;
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/weather?${new URLSearchParams(params)}`);
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status})`);
      if (seq !== fetchSeq.current) return null;
      setData(body);
      setSaved(hasPlace(body.location.lat, body.location.lon));
      if (label) localStorage.setItem('lastQuery', label);
      fetchNormals(body, seq);                   // deliberately not awaited
      return body;
    } catch (e) {
      setError(navigator.onLine === false
        ? 'You appear to be offline. Reconnect and try again.'
        : e.message);
      return null;
    } finally {
      setLoading(false);
    }
  }, [fetchNormals]);

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
      if (userActed.current) return null;   // the user already chose; don't fight them
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
        // The permission prompt can sit open for a long time. If the user got
        // bored and searched for somewhere in the meantime, that wins.
        if (userActed.current) return;
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

  const openTab = useCallback((id) => {
    setVisited((v) => (v.has(id) ? v : new Set(v).add(id)));
    setTab(id);
  }, []);

  const search = (e) => {
    e?.preventDefault();
    const q = query.trim();
    if (!q) { setError('Enter a place to search for.'); return; }
    userActed.current = true;
    openTab('now');
    fetchWeather({ q }, q);
  };

  const useMyLocation = () => {
    if (!navigator.geolocation) { setError('This browser has no geolocation. Type a place instead.'); return; }
    userActed.current = true;
    setLoading(true); setError('');
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => { openTab('now'); fetchWeather({ lat: coords.latitude, lon: coords.longitude }, null); },
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

  /** A parsed natural-language question drives the same code path as a search. */
  const handleParsed = (p) => {
    userActed.current = true;
    openTab('now');
    if (p.unit) { setUnit(p.unit); persistUnit(p.unit); }
    setQuery(p.location);
    fetchWeather({ q: p.location }, p.location);
  };

  const pickPlace = (p) => {
    userActed.current = true;
    openTab('now');
    fetchWeather({ lat: p.lat, lon: p.lon }, p.name);
  };

  const sky = data ? skyParams(data, data.location) : NEUTRAL;
  const fallbackSky = data ? skyGradient(data, data.location) : 'linear-gradient(170deg,#0a0d16,#070a13)';

  return (
    <>
      <SkyCanvas params={sky} fallback={fallbackSky} />
      <Precip kind={sky.kind} intensity={sky.precip} wind={data?.current?.windSpeed ?? 0} />
      <CursorGlow />

      <main className="shell">
        <header className="masthead">
          <div className="brand">
            <Logo size={38} />
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

        <AskBox onParsed={handleParsed} />

        {error && <div className="alert error" role="alert"><span aria-hidden="true">⚠</span><span>{error}</span></div>}

        <nav className="tabs" role="tablist" aria-label="Sections">
          {TABS.map(([id, label]) => (
            <button
              key={id}
              id={`tab-${id}`}
              role="tab"
              aria-selected={tab === id}
              aria-controls={`panel-${id}`}
              onClick={() => openTab(id)}
            >
              {label}
            </button>
          ))}
        </nav>

        <Pane id="now" tab={tab} visited={visited}>
          {loading && !data ? (
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
          ) : !error && <div className="panel"><p className="muted">Search for a place to begin.</p></div>}
        </Pane>

        <Pane id="wallet" tab={tab} visited={visited}>
          <LocationWallet current={data?.location} unit={unit} onPick={pickPlace} />
        </Pane>

        <Pane id="archive" tab={tab} visited={visited}>
          <RecordsPanel unit={unit} initialLocation={data?.location?.name ?? ''} />
        </Pane>

        <Pane id="discover" tab={tab} visited={visited}>
          <DiscoverPanel query={data?.location?.name ?? ''} />
        </Pane>

        <Pane id="about" tab={tab} visited={visited}>
          <About />
        </Pane>

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
