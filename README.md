# 🌤️ Weather Studio

**Most weather apps tell you the temperature. This one tells you which day to go.**

**PM Accelerator — AI Engineer Intern Technical Assessment**
**Completed: Tech Assessment #1 (Frontend) *and* #2 (Backend)** — full-stack submission.

Author: **Shubh Jain** · shubhj3@illinois.edu

### ▶ [Live demo — shubh-weather-studio.vercel.app](https://shubh-weather-studio.vercel.app)

Deployed on Vercel. No sign-in, no API keys — it works the moment you open it.
Health check: [`/api/health`](https://shubh-weather-studio.vercel.app/api/health)

---

People don't open a weather app to learn a number — they open it to make a decision:
*do I need a jacket, which day should we hike, is this trip ruined?* So this app is
built to answer the decision, not just report the data. It scores each forecast day
against what you're actually planning to do, tells you whether today is unusual for
this date, shows you how much good light is left, and keeps the places you care about
side by side with live conditions.

The reasoning behind every major choice — including what I rejected and why — is in
**[DECISIONS.md](DECISIONS.md)**.

---

## Quick start

```bash
./start.sh
```

That's it. It checks your Node version, installs dependencies if needed, frees the port
if it's busy, and starts the server at **http://localhost:3000**.

```bash
./start.sh dev     # dev server (default)
./start.sh prod    # production build + start
./start.sh test    # unit tests, then end-to-end smoke tests
./start.sh check   # doctor: versions, config, health, dependency latency
```

Or the plain npm route:

```bash
npm install && npm run dev
```

**No API keys are required.** Every core feature uses keyless APIs. Optional upgrades
are documented in `.env.example` and each degrades gracefully when absent — clone this
repo with no configuration and everything below works except the AI box, which simply
doesn't render.

**Requirements:** Node.js 20+ (`package.json` is the requirements file — three runtime
dependencies: `next`, `react`, `react-dom`, plus `@libsql/client` for the database).

---

## What's here

| | |
|---|---|
| **Live procedural sky** | A hand-written WebGL fragment shader renders the background from real conditions — cloud cover drives cloud density, the sun sits at its computed solar elevation, storms flash, stars come out at night. Rain and snow are a particle layer scaled to measured precipitation. No 3D library. |
| **Best Day picker** | Scores all five days 0–100 against six activity profiles and names a winner *with reasons*. A beach day and a running day pick different winners from the same forecast. |
| **Climate normals** | *"4.7° warmer than this date normally is (15-year average: 43.2°C)."* The difference between knowing the number and knowing whether to be surprised. |
| **Location Wallet** | Saved places as live cards, each painting its own sky. See it raining in London without opening London. |
| **Daylight arc** | Sun position between sunrise and sunset with golden hours marked, and how much good light is left. |
| **AI search** *(optional)* | *"Is it beach weather in Barcelona this weekend?"* → structured query → the normal fast UI renders it. |
| **Weather archive** | Full CRUD over location + date-range records, with five export formats. |

---

## Assessment #1 — Frontend

| Requirement | Where |
|---|---|
| Enter a location (zip, coords, landmark, town, city) | Search accepts all five, plus fuzzy matching |
| Current weather, clearly, with useful details | Hero + 8 metrics incl. air quality, gusts, pressure |
| Weather for the user's current location | **The default on open**, with a fallback chain |
| Icons/images, design standards | WMO code → icon mapping, plus the procedural sky |
| **§1.1** 5-day forecast, organised | Responsive card grid + temperature ribbon chart |
| **§1.2** Error handling | Six documented paths — see below |
| JS framework, no Python/Java | Next.js 15 / React 19 |

### Responsive design techniques

Web-first, but it holds from 320px to ultrawide — verified at 390px and 1280px with
**zero horizontal overflow**:

- **`repeat(auto-fit, minmax(…, 1fr))`** for forecast, stat and video grids — they
  reflow 5-up → 1-up with **no media queries at all**.
- **Fluid type and spacing via `clamp()`** — the hero temperature scales 176px → 80px
  continuously; nothing needs a breakpoint just to be readable.
- **Breakpoints only where layout *structure* changes** — the search bar at 700px, the
  hero at 860px, two-column panels at 940px.
- **Overflow contained** — the hourly strip and wallet rail scroll with scroll-snap;
  tables live in `overflow-x: auto`. The body never scrolls sideways.
- **Design tokens + a single committed dark theme** (see DECISIONS.md #4).
- **Accessibility** — 44px touch targets, visible `:focus-visible` rings, ARIA
  tablists, `role="alert"` / `aria-live` on dynamic content, labelled icon-only
  controls, and `prefers-reduced-motion` freezing both canvases and all transitions.
- **Chart palette validated, not eyeballed** — `#3987e5` / `#d95926` / `#199e70` pass
  colour-blind separation (CVD ΔE 9.4), normal-vision separation (ΔE 26.5) and ≥3:1
  contrast against the page surface.

### Error handling (§1.2)

1. **City not found** → 404 with *"No location found matching «x». Try a city, postal code, landmark, or lat,lon."*
2. **Upstream API failure** → both geocoders down yields 502; a slow weather service aborts at 12s with a readable message.
3. **Offline browser** → checked against `navigator.onLine`, shown as *"You appear to be offline."*
4. **Geolocation denied / unavailable / timed out** → each `PositionError` code maps to its own next step.
5. **Bad coordinates** → 400 *"Coordinates out of range."*
6. **Partial failures degrade silently** → air quality, Wikipedia, country data and climate normals all return `null` rather than taking down the forecast (`Promise.allSettled`, not `all`).

---

## Assessment #2 — Backend

### §2.1 CRUD

| Op | Endpoint | Notes |
|---|---|---|
| **CREATE** | `POST /api/records` | Validates range, verifies the location exists, fetches daily temps, stores it |
| **READ** | `GET /api/records?search=` | Everyone's records (no RLS, per brief) + free-text search; `GET /api/records/:id` for one |
| **UPDATE** | `PUT /api/records/:id` | Changing location or dates **re-validates and re-fetches** — a record can't drift out of sync |
| **DELETE** | `DELETE /api/records/:id` | 404 if absent |

**Date validation:** required, `YYYY-MM-DD`, must be a real calendar date (`2023-02-31`
is rejected — `Date` silently rolls it into March, so the parse is round-tripped),
start ≤ end, not before 1940 (archive limit), not more than 16 days ahead (forecast
limit), max span 366 days.

**Location validation:** every write resolves through the geocoders first; unresolvable
input returns **404** and nothing is stored. Fuzzy matching is deliberate, so "eiffel
tower", "61801" and "41.88,-87.63" all work.

**Range handling:** past dates come from the historical archive, future from the
forecast API, and a range straddling today transparently merges both.

### §2.2 Additional API integration — 10 APIs

Open-Meteo (forecast · archive · air quality · geocoding) · OpenStreetMap Nominatim ·
Wikipedia REST · Wikipedia GeoSearch · World Bank (×2) · flagcdn · OSM/Google Maps
embeds · YouTube. All keyless by default.

### §2.3 Data export

`GET /api/export?format=json|csv|xml|md|pdf` — all five, downloadable from the UI, for
the whole table, a search result, or one record. CSV quoting and XML entity escaping
are tested; **the PDF is generated by hand** (object table and xref written directly)
rather than adding a PDF dependency.

### Production concerns

- **`GET /api/health`** — database backend + row count, per-dependency reachability and
  latency, cache and rate-limiter stats, and which optional integrations are configured
  (booleans only, never values). Returns 503 when degraded, so an uptime monitor can
  watch it.
- **Per-IP rate limiting** on every public route.
- **TTL cache with request coalescing** — concurrent callers for one key share a single
  upstream request. Repeat lookup: 1.82s → 0.017s. This is what keeps the Location
  Wallet inside Nominatim's ~1 req/sec usage policy.
- **Keys are server-side only.** Every secret is read inside a route handler; nothing is
  prefixed `NEXT_PUBLIC_`, so no key reaches the browser.

---

## Deploying

The one thing to know: **set `TURSO_DATABASE_URL` before deploying to a serverless
host.** Vercel and Netlify have an ephemeral filesystem — a local SQLite file is wiped
on every cold start and isn't shared between instances, so saved records silently
vanish. Turso is hosted libSQL with an identical SQL dialect and a free tier; set the
two env vars and the same code runs unchanged.

Locally, no configuration is needed — it writes `./data/weather.db` automatically.

---

## Testing

```bash
npm test    # 9 offline suites — no network
npm run smoke   # 19 end-to-end checks (needs a running server)
```

**Unit:** date-range edge cases including the Feb-30 rollover, id/notes validation,
summary extremes, a full CRUD round-trip against an in-memory database, every export
format including CSV quote-escaping and PDF structure, unit conversion, the advice
engine, activity scoring (verifying beach and running pick *different* days), and the
weather→shader parameter mapping.

**Smoke:** city / coordinate / landmark lookups, 404 and 400 paths, create → search →
update → delete, weather refetch on date change, all five exports with download
headers, and the Discover fan-out.

Both suites pass. Manual probing also covered SQL injection (parameterised), XSS (React
escaping), malformed JSON, oversized payloads, and rate-limit engagement.

---

## Project layout

```
app/
  page.js                    boot/geolocation, tabs, search, unit toggle
  components/
    SkyCanvas.js             WebGL procedural sky (GLSL shader inline)
    Precip.js                canvas rain/snow particle layer
    WeatherPanel.js          hero, conditions, advice, hourly, forecast
    TempChart.js             temperature ribbon + crosshair tooltip
    SunArc.js                daylight arc with golden hours
    BestDay.js               activity scoring UI
    LocationWallet.js        saved places with live conditions
    AskBox.js                AI natural-language search (optional)
    RecordsPanel.js          CRUD UI + exports
    DiscoverPanel.js         map, Wikipedia, country facts, POIs, videos
  api/
    weather/  records/  records/[id]/  export/  discover/  parse/  health/
lib/
  geo.js  weather.js  climate.js  sky.js  advice.js
  db.js  validate.js  export.js  cache.js  ratelimit.js  http.js
test/     offline unit tests
scripts/  end-to-end smoke tests
```

---

## About PM Accelerator

The Product Manager Accelerator Program is designed to support PM professionals through
every stage of their careers. From students looking for entry-level jobs to Directors
seeking to take on a leadership role, PMA has helped hundreds of students fulfill their
career aspirations. Its mission is to make product management accessible through
hands-on training, real-world projects, resume and interview coaching, and a community
of product leaders who guide members from their first PM role through to senior
leadership.

[Product Manager Accelerator on LinkedIn](https://www.linkedin.com/school/pmaccelerator/)

This description also appears in the app's **About** tab.
