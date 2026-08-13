# Product & Engineering Decisions

The assessment asks twice to *think like a user* and to consider *what isn't obvious*.
This document is that thinking: the decisions behind the build, what I rejected, and
what I deliberately left undone.

---

## The premise

Most weather apps answer **"what is the temperature?"** That question is almost never
the real one. People open a weather app because they are about to make a decision:

> *Do I need a jacket? Which day should we do the hike? Is this trip going to be
> ruined? Do I need to leave earlier?*

The temperature is an input to that decision, not the decision. So the guiding
principle here was: **every screen should move the user closer to a decision, not
just closer to the data.** Where a raw number and an interpretation both fit, the
interpretation wins.

That single choice explains most of what follows.

---

## Decision 1 — Location Wallet, not "favourites"

**What I built:** saved places as a horizontal rail of live cards. Each card fetches
its own conditions and paints itself with that location's sky — so Reykjavík renders
grey and overcast next to a black night-time Bhopal.

**What I rejected:** a favourites dropdown or a starred list.

**Why:** a favourites list optimises for *retrieval* — it assumes you know which city
you want and just want to get there quickly. But the actual behaviour is
**comparison**. People track a few places at once: home, where family lives, where
they're travelling next. A dropdown forces you to look at them one at a time and hold
the previous answer in your head.

Making each card carry live conditions means the wallet answers a question the user
never has to ask. You glance at the rail and you already know it's raining in London.

**Cost of this decision:** N cards means N API calls. That surfaced a real bug — see
Decision 7.

---

## Decision 2 — Activity scoring, not more numbers

**What I built:** a "Best day for…" panel that scores each forecast day 0–100 against
six activity profiles, names a winner, and explains *why* it won.

**What I rejected:** more meteorological detail (dew point, pressure trend, hourly
breakdowns per day).

**Why:** a five-day forecast is five cards of icons and numbers, and the user does the
scoring in their head — badly. They over-weight the icon and under-weight wind, or
forget that a 22°C day with 50 km/h gusts is unpleasant for a run.

The insight is that **"good weather" is not a property of the weather. It's a
relationship between the weather and the plan.** 30°C with strong sun is an excellent
beach day and a miserable running day. Same data, opposite answers. Once framed that
way, the activity has to be an input, so it became the control.

**How it's built:** transparent weighted curves, not a model. Each profile is a few
lines of arithmetic over temperature, precipitation probability, wind and daylight.
This was deliberate — a user can be told *why* Monday won ("little chance of rain and
light winds"), and I can unit-test that a beach day and a run day pick different
winners. A black box would score better on novelty and worse on trust.

---

## Decision 3 — Geolocation first, with a chain of fallbacks

**What I built:** on open, ask for position immediately. If that fails or stalls, fall
back to the first wallet place → last search → a default city.

**Why:** the overwhelmingly common case is "what's it doing *here*". Making that the
default removes the most frequent interaction entirely.

**The non-obvious part:** the failure path matters more than the happy path. A
permission dialog can sit open indefinitely, and users routinely ignore it. So there's
a 9-second timeout, and the fallback chain never leaves the page empty. **The app must
never be blocked on a dialog the user has decided not to answer.**

This decision caused the worst bug in the project — see Decision 8.

---

## Decision 4 — The sky *is* the data visualisation

**What I built:** a procedural WebGL sky as the page background, driven by live cloud
cover, computed solar elevation, condition code and time of day. Cloud cover raises a
noise threshold (so 30% reads as distinct puffs, 100% as a solid sheet); the sun disc
sits at the real solar elevation; storms flash; rain and snow are a particle layer
scaled to measured precipitation.

**What I rejected:** static condition illustrations, a stock video loop, three.js.

**Why:** the brief asks for icons or images and for design standards. A static
illustration is decoration — it carries no information the icon didn't already. But if
the background is *generated from the data*, then aesthetics and information become the
same thing. You can tell it's overcast before reading a single number.

Rejecting three.js was a deliberate engineering call: the entire effect is one
full-screen triangle and a fragment shader. A 3D library would have added ~600KB to
render a background with no geometry in it.

**The trade-off I accepted:** this makes the app dark-only. A light theme would fight
the sky for the same pixels. I decided a single committed look beat two mediocre ones.

---

## Decision 5 — Climate normals: the "is this normal?" layer

**What I built:** every forecast is compared against a 15-year average for that
calendar date (±3 days), producing lines like *"4.7° warmer than this date normally
is."*

**Why:** this is the clearest example of the guiding principle. "43°C in Dubai" is
data. "4.7° above normal for this date" is *meaning* — it's the difference between
knowing the number and knowing whether to be surprised by it.

It's also the single most useful thing for the traveller in the brief: a visitor has
no intuition for what a place is normally like in August, and that intuition is exactly
what locals use to interpret a forecast.

**Engineering note:** the first implementation fired 15 parallel archive requests, one
per year. Ten of them silently failed under throttling and the average was computed
from five years while claiming to be robust. Rewritten as **one long-range request
filtered locally** — fewer calls, kinder to a free API, and it now reports the true
sample size.

---

## Decision 6 — AI as a front door, not a chat bot

**What I built:** one endpoint that turns *"is it beach weather in Barcelona this
weekend?"* into `{location, startDate, endDate, activity, unit}`, which then drives the
same code path as a normal search.

**What I rejected:** a conversational weather assistant.

**Why:** a chat bot would be the obvious move for an "AI Engineer" assessment and I
think it would be the wrong product. Weather has a *fast* interface already — you type
a city and read a number. Wrapping that in a conversation makes the common case slower.

Where language genuinely helps is the part the UI is bad at: **compound intent.** "Beach
weather in Barcelona this weekend" contains a place, a date range, and an activity
preference. Three controls, one sentence. So the AI translates intent into structure and
then gets out of the way — the answer is rendered by the normal, fast UI.

**Design consequences:**
- Structured output with a JSON schema, not free text — the model returns data, not prose.
- Model output is treated as untrusted input and re-validated server-side (dates checked,
  activity checked against a whitelist, strings length-capped).
- The feature is entirely optional: with no API key the box doesn't render, and the app
  is unchanged. **An evaluator cloning this repo with no keys sees a fully working app.**

---

## Decision 7 — Caching, forced by a policy limit

Nominatim's usage policy is roughly **one request per second**, and they block
violators. Decision 1 (a wallet of live cards) meant a user with eight saved places
fired eight simultaneous reverse-geocodes on render — an instant policy breach that
would have taken down the deployed app's IP.

**The fix:** a TTL cache where concurrent callers for the same key share a single
in-flight promise. Eight cards asking for the same city now produce exactly one
upstream request. Measured effect on a repeat lookup: **1.82s → 0.017s.**

Worth recording because it's a case of a *product* decision creating an
*infrastructure* constraint. The wallet was the right call; it just wasn't free.

---

## Decision 8 — The bug that mattered most

The geolocation bootstrap (Decision 3) had a race: if you typed a search **while the
permission prompt was still open**, geolocation would resolve seconds later and
silently overwrite your search. Reproduced reliably — searching "Reykjavik" 0.4s after
load left the page on the geolocated city permanently, with no error.

This is the worst class of bug: **no crash, no error message, the app just quietly
ignores you.**

The fix is a flag recording whether the user has done anything deliberate; the
geolocation callback yields if so. The principle: **an automatic action must never
override an explicit one, no matter which finishes first.**

---

## What I deliberately did not build

Listing these because knowing what to leave out is part of the job.

| Not built | Why |
|---|---|
| User accounts | The brief explicitly says row-level security isn't needed. Auth would have consumed time better spent on the weather features that are actually being assessed. |
| A conversational chat bot | See Decision 6 — slower than the UI for the common case. |
| Native mobile app | Brief says web-first. Responsive covers it. |
| Push notifications / severe weather alerts | Genuinely useful, but needs a background job and a subscription store — disproportionate for an assessment. Noted as future work. |
| Dual-provider weather comparison | Interesting (showing where two forecasts disagree is honest about uncertainty) but requires a second keyed API, which conflicts with keyless-by-default. |
| A charting library | The three charts here are ~100 lines of SVG each. Recharts would have been 500KB to draw a line. |

---

## Known limitations

Being explicit about these rather than hoping nobody looks:

- **PDF export is ASCII-only.** The hand-rolled PDF writer strips non-Latin characters,
  so "Zürich" exports as "Zrich". Correct fix is a font-embedding library; I judged the
  dependency not worth it versus documenting the ceiling.
- **Rate limiting is per-process.** Fine for a single instance; on a multi-instance
  deploy the counters stop summing to a real limit and this needs Redis.
- **Solar elevation is approximate.** Good enough to place a sun believably; not
  navigation-grade.
- **The 15-year climate baseline is short** by climatological standards (30 is the WMO
  norm). Chosen to keep the archive request to a sensible size.
- **`hourly[0]` is labelled "Now"** but can be up to 59 minutes old, since the upstream
  data is hourly.

---

## If I had another week

In priority order — each is chosen because it removes a decision from the user, not
because it adds a feature:

1. **Compare mode** — two wallet cities side by side. "Denver or Austin this weekend?"
   is a real question the wallet currently makes you answer by flipping back and forth.
2. **Severe weather alerts** (NWS, keyless) — the only category where being wrong has
   real consequences.
3. **Forecast confidence** — showing where models disagree, instead of implying a
   single number is certain.
4. **Trip planning across the archive** — "when should I visit Kyoto?" answered from
   climate normals rather than a 16-day forecast.
