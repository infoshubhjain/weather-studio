// Weather data. Open-Meteo forecast + air-quality + historical archive APIs.
// All keyless. Units are metric in the DB/API; the UI converts for display.

const BASE = 'https://api.open-meteo.com/v1/forecast';
const AIR = 'https://air-quality-api.open-meteo.com/v1/air-quality';
const ARCHIVE = 'https://archive-api.open-meteo.com/v1/archive';

export class WeatherError extends Error {
  constructor(message, status = 502) {
    super(message);
    this.status = status;
  }
}

async function getJSON(url) {
  let res;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(12_000) });
  } catch (e) {
    throw new WeatherError(
      e.name === 'TimeoutError' ? 'The weather service timed out. Please try again.' : 'Could not reach the weather service.',
    );
  }
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new WeatherError(body?.reason || `Weather service returned ${res.status}.`);
  return body;
}

// WMO weather interpretation codes -> label + icon.
export const WMO = {
  0: ['Clear sky', '☀️'], 1: ['Mainly clear', '🌤️'], 2: ['Partly cloudy', '⛅'], 3: ['Overcast', '☁️'],
  45: ['Fog', '🌫️'], 48: ['Rime fog', '🌫️'],
  51: ['Light drizzle', '🌦️'], 53: ['Drizzle', '🌦️'], 55: ['Heavy drizzle', '🌦️'],
  56: ['Freezing drizzle', '🌧️'], 57: ['Freezing drizzle', '🌧️'],
  61: ['Light rain', '🌧️'], 63: ['Rain', '🌧️'], 65: ['Heavy rain', '🌧️'],
  66: ['Freezing rain', '🌧️'], 67: ['Freezing rain', '🌧️'],
  71: ['Light snow', '🌨️'], 73: ['Snow', '🌨️'], 75: ['Heavy snow', '❄️'], 77: ['Snow grains', '🌨️'],
  80: ['Rain showers', '🌦️'], 81: ['Rain showers', '🌦️'], 82: ['Violent showers', '⛈️'],
  85: ['Snow showers', '🌨️'], 86: ['Heavy snow showers', '❄️'],
  95: ['Thunderstorm', '⛈️'], 96: ['Thunderstorm + hail', '⛈️'], 99: ['Severe thunderstorm', '⛈️'],
};
export const describe = (code) => {
  const [label, icon] = WMO[code] ?? ['Unknown', '❓'];
  return { code, label, icon };
};

const DAILY = [
  'weather_code', 'temperature_2m_max', 'temperature_2m_min', 'apparent_temperature_max',
  'apparent_temperature_min', 'precipitation_sum', 'precipitation_probability_max',
  'wind_speed_10m_max', 'wind_gusts_10m_max', 'wind_direction_10m_dominant',
  'uv_index_max', 'sunrise', 'sunset', 'daylight_duration',
];
const CURRENT = [
  'temperature_2m', 'apparent_temperature', 'relative_humidity_2m', 'is_day', 'precipitation',
  'rain', 'showers', 'snowfall', 'weather_code', 'cloud_cover', 'pressure_msl',
  'surface_pressure', 'wind_speed_10m', 'wind_direction_10m', 'wind_gusts_10m',
];
const HOURLY = ['temperature_2m', 'precipitation_probability', 'weather_code', 'apparent_temperature'];

const compass = (deg) =>
  ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'][
    Math.round(deg / 22.5) % 16
  ];

// US EPA-style bands applied to the European AQI value Open-Meteo returns.
const aqiBand = (v) =>
  v == null ? null
  : v <= 20 ? { label: 'Good', color: '#00c853' }
  : v <= 40 ? { label: 'Fair', color: '#aeea00' }
  : v <= 60 ? { label: 'Moderate', color: '#ffc400' }
  : v <= 80 ? { label: 'Poor', color: '#ff6d00' }
  : v <= 100 ? { label: 'Very poor', color: '#d50000' }
  : { label: 'Extremely poor', color: '#8e24aa' };

/**
 * Current conditions + 5-day forecast + hourly + air quality for a location.
 * Air quality is best-effort: if it fails the rest of the payload still returns.
 */
export async function getWeather({ lat, lon, days = 5 }) {
  const qs = new URLSearchParams({
    latitude: lat, longitude: lon, timezone: 'auto', forecast_days: String(days),
    current: CURRENT.join(','), daily: DAILY.join(','), hourly: HOURLY.join(','),
  });
  const [w, air] = await Promise.allSettled([
    getJSON(`${BASE}?${qs}`),
    getJSON(`${AIR}?latitude=${lat}&longitude=${lon}&current=european_aqi,pm2_5,pm10,ozone,nitrogen_dioxide,uv_index&timezone=auto`),
  ]);
  if (w.status === 'rejected') throw w.reason;
  const d = w.value;
  const c = d.current;

  const now = Date.now();
  const hourly = d.hourly.time
    .map((t, i) => ({
      time: t,
      temp: d.hourly.temperature_2m[i],
      feelsLike: d.hourly.apparent_temperature[i],
      precipProb: d.hourly.precipitation_probability[i],
      ...describe(d.hourly.weather_code[i]),
    }))
    .filter((h) => new Date(h.time).getTime() >= now - 3600_000)
    .slice(0, 24);

  const a = air.status === 'fulfilled' ? air.value.current : null;

  return {
    timezone: d.timezone,
    elevation: d.elevation,
    units: { temp: '°C', wind: 'km/h', precip: 'mm', pressure: 'hPa' },
    current: {
      time: c.time,
      isDay: !!c.is_day,
      temp: c.temperature_2m,
      feelsLike: c.apparent_temperature,
      humidity: c.relative_humidity_2m,
      precipitation: c.precipitation,
      rain: c.rain, showers: c.showers, snowfall: c.snowfall,
      cloudCover: c.cloud_cover,
      pressure: c.pressure_msl,
      windSpeed: c.wind_speed_10m,
      windGusts: c.wind_gusts_10m,
      windDir: c.wind_direction_10m,
      windCompass: compass(c.wind_direction_10m),
      ...describe(c.weather_code),
    },
    airQuality: a && {
      aqi: a.european_aqi, band: aqiBand(a.european_aqi),
      pm25: a.pm2_5, pm10: a.pm10, ozone: a.ozone, no2: a.nitrogen_dioxide, uv: a.uv_index,
    },
    hourly,
    daily: d.daily.time.map((date, i) => ({
      date,
      tempMax: d.daily.temperature_2m_max[i],
      tempMin: d.daily.temperature_2m_min[i],
      feelsMax: d.daily.apparent_temperature_max[i],
      feelsMin: d.daily.apparent_temperature_min[i],
      precipSum: d.daily.precipitation_sum[i],
      precipProb: d.daily.precipitation_probability_max[i],
      windMax: d.daily.wind_speed_10m_max[i],
      gustMax: d.daily.wind_gusts_10m_max[i],
      windDir: d.daily.wind_direction_10m_dominant[i],
      uvMax: d.daily.uv_index_max[i],
      sunrise: d.daily.sunrise[i],
      sunset: d.daily.sunset[i],
      daylightHours: +(d.daily.daylight_duration[i] / 3600).toFixed(1),
      ...describe(d.daily.weather_code[i]),
    })),
  };
}

/**
 * Daily temperatures for an arbitrary date range (CREATE in the CRUD flow).
 * Open-Meteo's archive covers the past; the forecast endpoint covers up to
 * 16 days ahead, so we pick per-request and merge when a range straddles today.
 */
export async function getRange({ lat, lon, start, end }) {
  const today = new Date().toISOString().slice(0, 10);
  const fields = 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max';
  const calls = [];
  if (start < today) {
    calls.push(getJSON(`${ARCHIVE}?latitude=${lat}&longitude=${lon}&start_date=${start}&end_date=${end < today ? end : today}&daily=${fields}&timezone=auto`));
  }
  if (end >= today) {
    calls.push(getJSON(`${BASE}?latitude=${lat}&longitude=${lon}&start_date=${start > today ? start : today}&end_date=${end}&daily=${fields}&timezone=auto`));
  }

  const parts = await Promise.all(calls);
  const byDate = new Map();
  for (const p of parts) {
    p.daily.time.forEach((date, i) => {
      if (byDate.has(date)) return;
      byDate.set(date, {
        date,
        tempMax: p.daily.temperature_2m_max[i],
        tempMin: p.daily.temperature_2m_min[i],
        tempAvg: avg(p.daily.temperature_2m_max[i], p.daily.temperature_2m_min[i]),
        precipSum: p.daily.precipitation_sum[i],
        windMax: p.daily.wind_speed_10m_max[i],
        ...describe(p.daily.weather_code[i]),
      });
    });
  }
  const days = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
  if (!days.length) throw new WeatherError('No weather data available for that date range.', 404);
  return days;
}

const avg = (a, b) => (a == null || b == null ? null : +((a + b) / 2).toFixed(1));

/** Summary stats over a range — cheap, and it's what people actually read. */
export function summarize(days) {
  const maxes = days.map((d) => d.tempMax).filter((v) => v != null);
  const mins = days.map((d) => d.tempMin).filter((v) => v != null);
  return {
    days: days.length,
    tempMax: maxes.length ? Math.max(...maxes) : null,
    tempMin: mins.length ? Math.min(...mins) : null,
    tempAvg: maxes.length ? +([...maxes, ...mins].reduce((a, b) => a + b, 0) / (maxes.length + mins.length)).toFixed(1) : null,
    precipTotal: +days.reduce((a, d) => a + (d.precipSum ?? 0), 0).toFixed(1),
    wettestDay: days.reduce((a, d) => ((d.precipSum ?? 0) > (a?.precipSum ?? -1) ? d : a), null)?.date ?? null,
  };
}
