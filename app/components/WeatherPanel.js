'use client';

import { useEffect, useRef } from 'react';
import { showTemp, showWind, advise, headline } from '@/lib/advice';
import TempChart from './TempChart';
import SunArc from './SunArc';
import BestDay from './BestDay';

const weekday = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short' });
const dayNum = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
const clock = (iso, tz) => new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', timeZone: tz });

/** Reveal children on scroll; degrades to always-visible without IntersectionObserver. */
function useReveal() {
  const root = useRef(null);
  useEffect(() => {
    const el = root.current;
    if (!el || !('IntersectionObserver' in window)) return;
    const items = [...el.querySelectorAll('[data-reveal]')];
    items.forEach((n) => n.classList.add('reveal'));
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => {
        if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
      }),
      { rootMargin: '0px 0px -8% 0px', threshold: 0.06 },
    );
    items.forEach((n) => io.observe(n));
    return () => io.disconnect();
  }, []);
  return root;
}

/** Pointer-tracked light sweep on the forecast cards. */
const trackLight = (e) => {
  const r = e.currentTarget.getBoundingClientRect();
  e.currentTarget.style.setProperty('--mx', `${((e.clientX - r.left) / r.width) * 100}%`);
  e.currentTarget.style.setProperty('--my', `${((e.clientY - r.top) / r.height) * 100}%`);
};

export default function WeatherPanel({ data, unit, onPickAlternative, onSave, saved }) {
  const { location, current, daily, hourly, airQuality, alternatives = [], timezone } = data;
  const tips = advise(data);
  const root = useReveal();

  return (
    <div ref={root}>
      <section className="hero">
        <div className="hero-place">
          <h2>{location.name}</h2>
          <button className="chip" onClick={onSave} disabled={saved}>
            {saved ? '★ In your wallet' : '☆ Save to wallet'}
          </button>
        </div>
        <p className="hero-sub">
          {[location.admin1, location.country].filter(Boolean).join(', ')} ·{' '}
          {location.lat.toFixed(2)}, {location.lon.toFixed(2)} · {clock(current.time, timezone)} local
        </p>

        <div className="hero-main">
          <div>
            <div className="now-temp">
              {unit === 'F' ? Math.round(current.temp * 9 / 5 + 32) : Math.round(current.temp)}
              <sup>°{unit}</sup>
            </div>
            <div className="now-cond">
              <span className="ico" role="img" aria-label={current.label}>{current.icon}</span>
              {current.label}
            </div>
            <p className="now-feels">Feels like {showTemp(current.feelsLike, unit)}</p>
          </div>
          <p className="headline">{headline(current, daily)}</p>
        </div>
      </section>

      {alternatives.length > 0 && (
        <section className="panel" data-reveal>
          <p className="eyebrow">Did you mean somewhere else?</p>
          <div className="chips">
            {alternatives.map((a, i) => (
              <button className="chip" key={i} onClick={() => onPickAlternative(a)}>{a.label}</button>
            ))}
          </div>
        </section>
      )}

      <section className="panel" data-reveal>
        <p className="eyebrow">Conditions now</p>
        <div className="stats">
          <div className="stat"><span>Humidity</span><b>{current.humidity}%</b></div>
          <div className="stat">
            <span>Wind</span><b>{showWind(current.windSpeed, unit)}</b>
            <div className="sub">{current.windCompass} · gusts {showWind(current.windGusts, unit)}</div>
          </div>
          <div className="stat"><span>Pressure</span><b>{current.pressure?.toFixed(0)}</b><div className="sub">hPa</div></div>
          <div className="stat"><span>Cloud cover</span><b>{current.cloudCover}%</b></div>
          <div className="stat"><span>Precipitation</span><b>{current.precipitation ?? 0}</b><div className="sub">mm last hour</div></div>
          {daily[0] && <div className="stat"><span>Sunrise</span><b>{clock(daily[0].sunrise, timezone)}</b></div>}
          {daily[0] && <div className="stat"><span>Sunset</span><b>{clock(daily[0].sunset, timezone)}</b></div>}
          {airQuality?.aqi != null && (
            <div className="stat">
              <span>Air quality</span>
              <b style={{ color: airQuality.band.color }}>{airQuality.aqi}</b>
              <div className="sub">{airQuality.band.label}{airQuality.pm25 != null ? ` · PM2.5 ${airQuality.pm25}` : ''}</div>
            </div>
          )}
        </div>
      </section>

      {tips.length > 0 && (
        <section className="panel" data-reveal>
          <p className="eyebrow">What this means for you</p>
          <ul className="advice">
            {tips.map((t, i) => (
              <li key={i} className={t.level === 'warn' ? 'warn' : ''}>
                <span className="ico" aria-hidden="true">{t.icon}</span>
                <span>{t.text}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="two-col" data-reveal>
        <section className="panel"><TempChart daily={daily} unit={unit} /></section>
        <section className="panel">
          <SunArc day={daily[0]} now={current.time} timezone={timezone} isDay={current.isDay} />
        </section>
      </div>

      <div data-reveal><BestDay daily={daily} unit={unit} /></div>

      <section className="panel" data-reveal>
        <div className="panel-head">
          <h2>Next 24 hours</h2>
          <span className="muted small">scroll →</span>
        </div>
        <div className="hourly">
          {hourly.map((h, i) => (
            <div className={`hour ${i === 0 ? 'now' : ''}`} key={h.time}>
              <div>{i === 0 ? 'Now' : clock(h.time, timezone)}</div>
              <span className="h-ico" role="img" aria-label={h.label}>{h.icon}</span>
              <div className="h-temp">{showTemp(h.temp, unit)}</div>
              <div className="h-pop">{h.precipProb ?? 0}%</div>
            </div>
          ))}
        </div>
      </section>

      <section className="panel" data-reveal>
        <div className="panel-head">
          <h2>{daily.length}-day forecast</h2>
          <span className="muted small">{location.name} · {timezone}</span>
        </div>
        <div className="forecast">
          {daily.map((d) => (
            <article className="day" key={d.date} onPointerMove={trackLight}>
              <div className="day-name">{weekday(d.date)} · {dayNum(d.date)}</div>
              <div className="day-ico" role="img" aria-label={d.label}>{d.icon}</div>
              <div className="day-cond">{d.label}</div>
              <div className="day-temps">
                <span className="day-hi">{showTemp(d.tempMax, unit)}</span>
                <span className="day-lo">{showTemp(d.tempMin, unit)}</span>
              </div>
              <div className="day-meta">
                <span>💧 {d.precipProb ?? 0}% · {d.precipSum ?? 0} mm</span>
                <span>💨 {showWind(d.windMax, unit)}</span>
                <span>☀️ UV {d.uvMax ?? '—'} · {d.daylightHours}h light</span>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
