'use client';

import { showTemp, showWind, advise, headline } from '@/lib/advice';

const weekday = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
const clock = (iso, tz) => new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', timeZone: tz });

export default function WeatherPanel({ data, unit, onPickAlternative }) {
  const { location, current, daily, hourly, airQuality, alternatives = [], timezone } = data;
  const tips = advise(data);

  return (
    <>
      {alternatives.length > 0 && (
        <div className="card">
          <span className="muted">Not the right place? </span>
          <div className="chips" style={{ marginTop: '.4rem' }}>
            {alternatives.map((a, i) => (
              <button key={i} className="chip" onClick={() => onPickAlternative(a)}>
                {a.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <section className="card">
        <div className="spread">
          <div>
            <h2 style={{ marginBottom: '.15rem' }}>{location.label}</h2>
            <p className="muted">
              {location.lat.toFixed(3)}, {location.lon.toFixed(3)} · {timezone} · local time {clock(current.time, timezone)}
              {location.source === 'coordinates' && ' · from coordinates'}
            </p>
          </div>
          <span className="chip">{current.isDay ? '☀️ Daytime' : '🌙 Night'}</span>
        </div>

        <div className="now" style={{ marginTop: '1rem' }}>
          <div className="row" style={{ gap: '1rem', flexWrap: 'nowrap' }}>
            <span className="now-icon" role="img" aria-label={current.label}>{current.icon}</span>
            <div>
              <div className="now-temp">{showTemp(current.temp, unit)}</div>
              <div>{current.label} · feels like {showTemp(current.feelsLike, unit)}</div>
            </div>
          </div>
          <p className="muted" style={{ margin: 0 }}>{headline(current, daily)}</p>
        </div>

        <div className="stats" style={{ marginTop: '1rem' }}>
          <div className="stat"><span className="muted">Humidity</span><b>{current.humidity}%</b></div>
          <div className="stat"><span className="muted">Wind</span><b>{showWind(current.windSpeed, unit)} {current.windCompass}</b></div>
          <div className="stat"><span className="muted">Gusts</span><b>{showWind(current.windGusts, unit)}</b></div>
          <div className="stat"><span className="muted">Pressure</span><b>{current.pressure?.toFixed(0)} hPa</b></div>
          <div className="stat"><span className="muted">Cloud cover</span><b>{current.cloudCover}%</b></div>
          <div className="stat"><span className="muted">Precipitation</span><b>{current.precipitation ?? 0} mm</b></div>
          <div className="stat"><span className="muted">Sunrise</span><b>{daily[0] ? clock(daily[0].sunrise, timezone) : '—'}</b></div>
          <div className="stat"><span className="muted">Sunset</span><b>{daily[0] ? clock(daily[0].sunset, timezone) : '—'}</b></div>
          {airQuality?.aqi != null && (
            <div className="stat">
              <span className="muted">Air quality</span>
              <b style={{ color: airQuality.band.color }}>{airQuality.aqi} · {airQuality.band.label}</b>
            </div>
          )}
          {airQuality?.pm25 != null && <div className="stat"><span className="muted">PM2.5</span><b>{airQuality.pm25} µg/m³</b></div>}
        </div>
      </section>

      {tips.length > 0 && (
        <section className="card">
          <h2>What this actually means for you</h2>
          <ul style={{ margin: 0, paddingLeft: '1.1rem' }}>
            {tips.map((t, i) => (
              <li key={i} style={{ marginBottom: '.35rem', color: t.level === 'warn' ? 'var(--danger)' : undefined }}>
                <span aria-hidden="true">{t.icon}</span> {t.text}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="card">
        <h2>Next 24 hours</h2>
        <div className="hourly">
          {hourly.map((h) => (
            <div className="hour" key={h.time}>
              <div>{clock(h.time, timezone)}</div>
              <div style={{ fontSize: '1.4rem' }} role="img" aria-label={h.label}>{h.icon}</div>
              <div><b>{showTemp(h.temp, unit)}</b></div>
              <div className="muted">{h.precipProb ?? 0}%</div>
            </div>
          ))}
        </div>
      </section>

      <section className="card">
        <h2>{daily.length}-day forecast</h2>
        <div className="forecast">
          {daily.map((d) => (
            <div className="day" key={d.date}>
              <div>{weekday(d.date)}</div>
              <div className="icon" role="img" aria-label={d.label}>{d.icon}</div>
              <div style={{ fontSize: '.85rem' }}>{d.label}</div>
              <div><span className="hi">{showTemp(d.tempMax, unit)}</span> <span className="lo">{showTemp(d.tempMin, unit)}</span></div>
              <div className="muted" style={{ fontSize: '.8rem' }}>
                💧 {d.precipProb ?? 0}% · {d.precipSum ?? 0} mm<br />
                💨 {showWind(d.windMax, unit)}<br />
                ☀️ UV {d.uvMax ?? '—'} · {d.daylightHours}h light
              </div>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
