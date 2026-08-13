'use client';

// Location Wallet — saved places as a rail of live cards. Each card fetches its
// own current conditions and paints itself with that place's sky, so the wallet
// reads at a glance: you can see it's raining in London without opening London.

import { useEffect, useState } from 'react';
import { getWallet, removePlace, reorder } from '@/lib/wallet';
import { skyGradient } from '@/lib/sky';
import { showTemp } from '@/lib/advice';

function WalletCard({ place, active, unit, onPick, onRemove, onMove, index, total }) {
  const [data, setData] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/weather?lat=${place.lat}&lon=${place.lon}&days=1`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('failed'))))
      .then((b) => !cancelled && setData(b))
      .catch(() => !cancelled && setFailed(true));
    return () => { cancelled = true; };
  }, [place.lat, place.lon]);

  const bg = data ? skyGradient(data, place) : 'linear-gradient(170deg,#131a2c,#0a0d16)';
  const local = data
    ? new Date(data.current.time).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', timeZone: data.timezone })
    : '';

  return (
    <article className={`wcard ${active ? 'is-active' : ''}`} style={{ background: bg }}>
      <button className="wcard-hit" onClick={() => onPick(place)} aria-label={`Show weather for ${place.label}`}>
        <header>
          <h3>{place.name}</h3>
          <p>{place.country}</p>
        </header>
        <div className="wcard-now">
          {data ? (
            <>
              <span className="wcard-icon" aria-hidden="true">{data.current.icon}</span>
              <span className="wcard-temp">{showTemp(data.current.temp, unit)}</span>
            </>
          ) : failed ? (
            <span className="wcard-fail">unavailable</span>
          ) : (
            <span className="wcard-skel" />
          )}
        </div>
        <footer>
          {data ? `${data.current.label} · ${local}` : failed ? 'Could not load' : 'Loading…'}
        </footer>
      </button>

      <div className="wcard-tools">
        <button onClick={() => onMove(place.id, -1)} disabled={index === 0} aria-label="Move left">‹</button>
        <button onClick={() => onRemove(place.id)} aria-label={`Remove ${place.name}`}>✕</button>
        <button onClick={() => onMove(place.id, 1)} disabled={index === total - 1} aria-label="Move right">›</button>
      </div>
      {active && <span className="wcard-flag">Viewing</span>}
    </article>
  );
}

export default function LocationWallet({ current, unit, onPick }) {
  const [places, setPlaces] = useState([]);

  useEffect(() => {
    setPlaces(getWallet());
    const sync = (e) => setPlaces(e.detail ?? getWallet());
    window.addEventListener('wallet:change', sync);
    window.addEventListener('storage', sync); // other tabs
    return () => {
      window.removeEventListener('wallet:change', sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  if (!places.length) {
    return (
      <section className="panel wallet-empty">
        <h2>Location Wallet</h2>
        <p className="muted">
          Save the places you care about and they'll live here with their current conditions —
          so you can see all of them without searching. Hit <b>Save to wallet</b> on any location.
        </p>
      </section>
    );
  }

  const activeId = current ? `${current.lat.toFixed(3)},${current.lon.toFixed(3)}` : null;

  return (
    <section className="panel wallet">
      <header className="panel-head">
        <h2>Location Wallet</h2>
        <span className="muted">{places.length} saved · live conditions</span>
      </header>
      <div className="rail">
        {places.map((p, i) => (
          <WalletCard
            key={p.id}
            place={p}
            index={i}
            total={places.length}
            active={p.id === activeId}
            unit={unit}
            onPick={onPick}
            onRemove={(id) => setPlaces(removePlace(id))}
            onMove={(id, d) => setPlaces(reorder(id, d))}
          />
        ))}
      </div>
    </section>
  );
}
