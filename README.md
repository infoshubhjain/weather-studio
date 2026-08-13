# 🌤️ Weather Studio

**PM Accelerator — AI Engineer Intern Technical Assessment**
**Completed: Tech Assessment #1 (Frontend) *and* Tech Assessment #2 (Backend)** — full-stack submission.

Author: **Shubh Jain** · shubhj3@illinois.edu

A weather app that takes free-form location input, resolves it against real geocoding
services, shows live conditions and a 5-day forecast, and persists location + date-range
weather records in SQLite with full CRUD, validation, and five export formats.

---

## Quick start

```bash
npm install
npm run dev          # http://localhost:3000
```

That's it. **No API keys are required** — every data source used by default is keyless.
The SQLite file is created automatically at `data/weather.db` on first write.

```bash
npm test             # offline unit tests (validation, CRUD, exports, advice)
npm run dev          # in terminal 1
npm run smoke        # in terminal 2 — end-to-end tests against the live API
npm run build && npm start   # production
```

Requirements: **Node.js ≥ 22.5** (uses the built-in `node:sqlite` module).
`package.json` is the requirements file — the only runtime dependencies are `next`,
`react`, and `react-dom`.

### Optional keys

Copy `.env.example` → `.env.local`. `YOUTUBE_API_KEY` upgrades the Discover tab's video
panel from search links to embedded videos; `GOOGLE_MAPS_API_KEY` swaps the OpenStreetMap
embed for a Google Maps embed. Both are strictly optional.

---

## Assessment #1 — Frontend

| Requirement | Where |
|---|---|
| Enter a location, get current weather | Search bar accepts **city, town, postal/ZIP code, landmark, or `lat,lon`** |
| Weather shown clearly with useful details | Temp, feels-like, humidity, wind + gusts + compass direction, pressure, cloud cover, precipitation, sunrise/sunset, UV, air quality |
| Weather at the user's current location | 📍 **Use my location** → browser Geolocation → reverse geocoded to a real place name |
| Icons / images | WMO weather-code → icon mapping for current, hourly, and daily conditions |
| **5-day forecast** (§1.1) | Responsive card grid, 5-up on desktop → 1-up on phones, each with hi/lo, condition, precip probability + total, wind, UV, daylight hours |
| **Error handling** (§1.2) | See below |

### Responsive design techniques used

Web-first, but it holds together from 320px to ultrawide:

- **`grid-template-columns: repeat(auto-fit, minmax(150px, 1fr))`** for the forecast and
  stat grids — cards reflow from 5-up to 1-up with **zero media queries**.
- **Fluid type and spacing via `clamp()`** (`font-size: clamp(1.4rem, 3.4vw, 2.1rem)`,
  `--gap: clamp(.75rem, 1.5vw, 1.25rem)`) so nothing needs a breakpoint just to be readable.
- **A handful of real breakpoints only where layout *structure* changes** — the search bar
  goes from stacked to inline at 640px, the hero at 720px, the Discover two-column at 900px.
- **Overflow containment**: the hourly strip scrolls horizontally with scroll-snap; tables
  live in an `overflow-x: auto` wrapper. The page body never scrolls sideways.
- **CSS custom properties + `prefers-color-scheme`** for a full dark mode.
- **Accessibility**: 44px minimum touch targets, visible `:focus-visible` rings, ARIA
  tablist/roles, `role="alert"` on errors, `aria-label`s on icon-only content, and
  `prefers-reduced-motion` disabling animation.

### Error handling — worked examples

1. **City not found** → `GET /api/weather?q=asdkjhqwlekjhasd` returns **404** with
   *"No location found matching "asdkjhqwlekjhasd". Try a city, postal code, landmark, or lat,lon."*
   rendered in a red alert banner. The page keeps working; nothing crashes.
2. **Upstream API failure** → both geocoders failing yields **502**
   *"Both geocoding services are unreachable."*; a slow weather service is aborted after 12s
   with *"The weather service timed out. Please try again."*
3. **Offline browser** → the fetch rejection is checked against `navigator.onLine` and shown
   as *"You appear to be offline. Reconnect and try again."*
4. **Geolocation denied / unavailable / timed out** → each `PositionError` code maps to its
   own message telling you what to do instead.
5. **Bad coordinates** → `?lat=999` returns **400** *"Coordinates out of range."*
6. **Air quality unavailable** → degrades silently; the rest of the forecast still renders
   (`Promise.allSettled`, not `Promise.all`).

---

## Assessment #2 — Backend

### §2.1 CRUD — SQLite via Node's built-in `node:sqlite`

| Op | Endpoint | Notes |
|---|---|---|
| **CREATE** | `POST /api/records` | Body `{ location, startDate, endDate, notes? }`. Validates the range, verifies the location exists, fetches **daily temperatures for that range**, stores everything. |
| **READ** | `GET /api/records?search=&limit=&offset=` | Lists all records (everyone's — no row-level security, per the spec) with free-text search over label/query/notes. `GET /api/records/:id` for one. |
| **UPDATE** | `PUT /api/records/:id` | Any of `location`, `startDate`, `endDate`, `notes`. |
| **DELETE** | `DELETE /api/records/:id` | 404 if it doesn't exist. |

**Date-range validation** (`lib/validate.js`): required, `YYYY-MM-DD` format, must be a real
calendar date (`2023-02-31` is rejected — `Date` silently rolls it into March, so the code
round-trips the parse to catch it), start ≤ end, not before 1940-01-01 (archive limit), not
more than 16 days ahead (forecast limit), max span 366 days.

**Location validation**: every write resolves the input through the geocoders first. If
nothing matches, the request fails with **404** and the record is never created. Fuzzy
matching is deliberate — the top-ranked match wins, so "eiffel tower", "61801" and
"41.88,-87.63" all resolve.

**Update integrity**: changing the location or either date **re-validates and re-fetches the
weather**, so a stored record can never claim a range it doesn't hold data for. Only
whitelisted columns are writable. Notes are capped at 2000 chars.

**Range handling**: past dates come from the Open-Meteo **historical archive**, future dates
from the **forecast** endpoint, and a range straddling today transparently merges both.

### §2.2 Additional API integration — the Discover tab

`GET /api/discover?q=Kyoto` fans out to, in parallel:

- **Wikipedia REST** — summary and thumbnail for the place
- **Wikipedia GeoSearch** — nearby points of interest within 10km, with distances
- **World Bank API** (×2) — capital, region, income level, latest population
- **flagcdn** — country flag
- **OpenStreetMap embed** (or **Google Maps Embed** with a key) — map, plus deep links to
  Google Maps and turn-by-turn directions
- **YouTube** — real search results with a key; a prepared search link without one

Enrichment is best-effort: any of these failing returns `null` for that panel rather than
failing the request.

### §2.3 Data export

`GET /api/export?format=json|csv|xml|md|pdf` — all five, all downloadable from the UI, for
the whole table, a search result, or a single record (`&id=3`). CSV quotes and escapes
correctly, XML escapes entities, and **the PDF is generated by hand** (~60 lines writing the
object table and xref by hand) rather than adding a PDF dependency.

---

## Going beyond the brief

The prompt asked what a user needs that isn't obvious. This is that part:

- **"What this actually means for you"** — a rules engine (`lib/advice.js`) turns raw numbers
  into decisions: thunderstorm and freezing-rain warnings, wind-gust travel disruption, heat
  stress vs. "just hot", *"wind makes it feel 8°C colder than the thermometer says"*,
  UV-indexed sun protection advice, an umbrella heads-up when rain is ≥50% likely in 48h,
  air-quality exercise guidance, *"the week swings 21°C — pack for both"*, and a short-daylight
  warning for planning sightseeing.
- **Ambiguity is surfaced, not hidden.** "Eiffel Tower" also matches a hamlet in Alberta —
  the app shows alternate matches as one-click chips instead of silently guessing.
- **°C/°F toggle** that converts wind to mph too, persisted in `localStorage` along with your
  last search, so a reload doesn't make you retype.
- **Air quality** (AQI + PM2.5/PM10/ozone/NO₂) — the thing most weather apps bury.
- **Sunrise/sunset and daylight hours**, which matter more than temperature when planning a day.
- **24-hour hourly strip** in addition to the required 5-day view.

## Testing

- `npm test` — 7 suites, no network: date validation edge cases (including the Feb-31
  rollover), id/notes validation, summary extremes, a full CRUD round-trip against an
  in-memory database, every export format including CSV quote-escaping and PDF structure,
  unit conversion, and the advice engine.
- `npm run smoke` — 19 end-to-end checks against a running server: city / coordinate /
  landmark lookups, 404 and 400 error paths, create → search → update → delete, weather
  refetch on date change, all five exports with their download headers, and the Discover
  fan-out.

Both pass.

## Project layout

```
app/
  page.js                    tabs, search, geolocation, unit toggle, error surface
  components/
    WeatherPanel.js          current conditions, advice, hourly, 5-day forecast
    RecordsPanel.js          CRUD UI + export buttons
    DiscoverPanel.js         map, Wikipedia, country facts, nearby POIs, videos
  api/
    weather/route.js         GET  current + forecast (by query or coordinates)
    records/route.js         GET  list/search · POST create
    records/[id]/route.js    GET  one · PUT update · DELETE
    export/route.js          GET  json | csv | xml | md | pdf
    discover/route.js        GET  Wikipedia + World Bank + maps + YouTube
  globals.css                responsive system, dark mode, tokens
lib/
  geo.js       location resolution (coords / Open-Meteo / Nominatim) + dedupe
  weather.js   forecast, air quality, historical range, WMO icon map, summaries
  db.js        node:sqlite schema + CRUD
  validate.js  date range / id / notes validation
  export.js    five export formats incl. a hand-rolled PDF writer
  advice.js    unit conversion + the "what this means for you" rules engine
  http.js      one error-to-JSON response shape for every route
test/          offline unit tests
scripts/       end-to-end smoke test
```

## Data sources

Open-Meteo (forecast · historical archive · air quality · geocoding) · OpenStreetMap
Nominatim · Wikipedia REST & GeoSearch · World Bank · flagcdn · YouTube. All keyless by
default.

## About PM Accelerator

The Product Manager Accelerator Program is designed to support PM professionals through
every stage of their careers. From students looking for entry-level jobs to Directors
seeking to take on a leadership role, PMA has helped hundreds of students fulfill their
career aspirations. Its mission is to make product management accessible through hands-on
training, real-world projects, resume and interview coaching, and a community of product
leaders who guide members from their first PM role through to senior leadership.

[Product Manager Accelerator on LinkedIn](https://www.linkedin.com/school/pmaccelerator/)

This description is also shown in the app's **About** tab.
