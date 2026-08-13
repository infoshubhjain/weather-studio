'use client';

import { useEffect, useState } from 'react';

/** §2.2 extra API integration: Wikipedia, REST Countries, maps, YouTube. */
export default function DiscoverPanel({ query }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!query) return;
    let cancelled = false;
    setData(null); setError('');
    fetch(`/api/discover?q=${encodeURIComponent(query)}`)
      .then(async (r) => {
        const b = await r.json();
        if (!r.ok) throw new Error(b.error);
        if (!cancelled) setData(b);
      })
      .catch((e) => !cancelled && setError(e.message));
    return () => { cancelled = true; };
  }, [query]);

  if (!query) return <div className="card"><p className="muted">Search for a location first — this tab enriches whatever you looked up.</p></div>;
  if (error) return <div className="card"><div className="alert error" role="alert">⚠️ {error}</div></div>;
  if (!data) return <div className="card"><div className="skeleton" /></div>;

  const { wikipedia, nearby, country, map, videos, location } = data;

  return (
    <>
      <div className="two-col">
        <section className="card">
          <h2>Map</h2>
          <iframe src={map.embedUrl} title={`Map of ${location.label}`} loading="lazy" />
          <div className="row" style={{ marginTop: '.6rem' }}>
            <a className="chip" href={map.googleMapsUrl} target="_blank" rel="noreferrer">Open in Google Maps</a>
            <a className="chip" href={map.directionsUrl} target="_blank" rel="noreferrer">Directions</a>
            <span className="chip">source: {map.provider}</span>
          </div>
        </section>

        <section className="card">
          <h2>About {location.name}</h2>
          {wikipedia ? (
            <>
              {wikipedia.thumbnail && <img src={wikipedia.thumbnail} alt={wikipedia.title} style={{ float: 'right', marginLeft: '.75rem', maxWidth: 140 }} />}
              <p>{wikipedia.extract}</p>
              <a href={wikipedia.url} target="_blank" rel="noreferrer">Read on Wikipedia →</a>
            </>
          ) : <p className="muted">No Wikipedia article matched this place.</p>}

          {country && (
            <div style={{ clear: 'both', marginTop: '.8rem' }}>
              <h3>{country.flag && <img src={country.flag} alt="" style={{ height: 16, verticalAlign: 'middle', marginRight: 6 }} />}{country.name}</h3>
              <div className="chips">
                {country.capital && <span className="chip">🏛️ Capital: {country.capital}</span>}
                {country.region && <span className="chip">🌍 {country.region}</span>}
                {country.incomeLevel && <span className="chip">💰 {country.incomeLevel}</span>}
                {country.population && <span className="chip">👥 {country.population.toLocaleString()} ({country.populationYear})</span>}
              </div>
            </div>
          )}
        </section>
      </div>

      {nearby.length > 0 && (
        <section className="card">
          <h2>Nearby points of interest</h2>
          <div className="chips">
            {nearby.map((n) => (
              <a className="chip" key={n.title} href={n.url} target="_blank" rel="noreferrer">
                📍 {n.title} · {(n.distanceM / 1000).toFixed(1)} km
              </a>
            ))}
          </div>
        </section>
      )}

      <section className="card">
        <h2>Videos</h2>
        {videos.items.length ? (
          <div className="videos">
            {videos.items.map((v) => (
              <div key={v.id}>
                <iframe src={v.embedUrl} title={v.title} loading="lazy" allowFullScreen />
                <div style={{ fontSize: '.85rem' }}>{v.title}</div>
                <div className="muted">{v.channel}</div>
              </div>
            ))}
          </div>
        ) : (
          <p className="muted">
            {videos.note} Meanwhile: <a href={videos.searchUrl} target="_blank" rel="noreferrer">search YouTube for “{videos.query}” →</a>
          </p>
        )}
      </section>
    </>
  );
}
