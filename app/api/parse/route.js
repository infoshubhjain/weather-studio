// Natural-language query parsing.
//
//   "weather for my ski trip to Tahoe next weekend"
//     → { location: "Lake Tahoe", startDate: "...", endDate: "...", activity: "hiking" }
//
// SECURITY MODEL — the whole point of this file living on the server:
//   · The API key is read from process.env inside a route handler, so it never
//     reaches the browser. Never rename these to NEXT_PUBLIC_* — that would
//     inline the key into the client bundle for every visitor to read.
//   · The endpoint is public, so it is rate limited per IP and caps both input
//     length and output tokens. An unprotected LLM proxy is a billing incident
//     waiting to happen.
//   · Responses are cached: weather questions repeat heavily.
//
// PROVIDER-AGNOSTIC: works with any OpenAI-compatible endpoint. Set AI_BASE_URL
// and AI_API_KEY and it works with Cerebras, Groq, OpenAI, OpenRouter, Together,
// or a local Ollama — no code change. With no key set, the route reports
// `configured: false` and the UI quietly falls back to the normal search box.

import { rateLimit } from '@/lib/ratelimit';
import { cached } from '@/lib/cache';
import { ACTIVITIES } from '@/lib/advice';
import { fail, ok } from '@/lib/http';

export const dynamic = 'force-dynamic';

const MAX_INPUT = 300;
const CACHE_TTL = 60 * 60 * 1000;

const isConfigured = () => Boolean(process.env.AI_API_KEY);

const SYSTEM = `You convert a person's weather question into structured JSON.

Rules:
- "location" is the single clearest place name. Never invent one: if no place is named, use null.
- Resolve relative dates against the TODAY value given in the user message. Use YYYY-MM-DD.
- "startDate"/"endDate" are only for explicit ranges or named periods ("next weekend", "this week"). Otherwise null.
- "activity" must be one of: ${Object.keys(ACTIVITIES).join(', ')} — or null if none is implied.
- "unit" is "F" only if the user clearly signals US units, else null.
Answer with JSON only.`;

/** JSON Schema, enforced by the provider where supported. */
const SCHEMA = {
  type: 'object',
  properties: {
    location: { type: ['string', 'null'] },
    startDate: { type: ['string', 'null'] },
    endDate: { type: ['string', 'null'] },
    activity: { type: ['string', 'null'], enum: [...Object.keys(ACTIVITIES), null] },
    unit: { type: ['string', 'null'], enum: ['C', 'F', null] },
  },
  required: ['location', 'startDate', 'endDate', 'activity', 'unit'],
  additionalProperties: false,
};

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** Never trust model output — clamp it to the shape the rest of the app expects. */
function sanitize(raw) {
  const str = (v, max) =>
    typeof v === 'string' && v.trim() && v.trim().toLowerCase() !== 'null'
      ? v.trim().slice(0, max)
      : null;

  const date = (v) => (typeof v === 'string' && ISO.test(v) && !Number.isNaN(Date.parse(v)) ? v : null);

  let start = date(raw?.startDate);
  let end = date(raw?.endDate);
  if (start && end && start > end) [start, end] = [end, start];

  return {
    location: str(raw?.location, 120),
    startDate: start,
    endDate: end,
    activity: Object.keys(ACTIVITIES).includes(raw?.activity) ? raw.activity : null,
    unit: raw?.unit === 'F' || raw?.unit === 'C' ? raw.unit : null,
  };
}

export async function GET() {
  // Lets the UI decide whether to render the AI box at all.
  return ok({ configured: isConfigured(), provider: process.env.AI_MODEL ?? null });
}

export async function POST(req) {
  try {
    // 20 parses/minute/IP is generous for a human and useless for a script.
    const limited = rateLimit(req, { max: 20, windowMs: 60_000, key: 'parse' });
    if (limited) return limited;

    if (!isConfigured()) {
      return ok({ configured: false, error: 'AI parsing is not configured on this server.' }, { status: 501 });
    }

    const body = await req.json().catch(() => ({}));
    const text = String(body.text ?? '').trim();
    if (!text) throw Object.assign(new Error('Ask a question first.'), { status: 400 });
    if (text.length > MAX_INPUT) {
      throw Object.assign(new Error(`Keep it under ${MAX_INPUT} characters.`), { status: 400 });
    }

    const today = new Date().toISOString().slice(0, 10);
    const parsed = await cached(`parse:${today}:${text.toLowerCase()}`, CACHE_TTL, () => callModel(text, today));

    return ok({ configured: true, query: text, ...parsed });
  } catch (e) {
    return fail(e);
  }
}

async function callModel(text, today) {
  const base = (process.env.AI_BASE_URL ?? 'https://api.cerebras.ai/v1').replace(/\/$/, '');
  const model = process.env.AI_MODEL ?? 'llama-3.3-70b';

  let res;
  try {
    res = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.AI_API_KEY}`,
      },
      body: JSON.stringify({
        model,
        max_tokens: 200,          // the answer is a tiny JSON object; cap the blast radius
        temperature: 0,           // extraction, not creativity
        messages: [
          { role: 'system', content: SYSTEM },
          { role: 'user', content: `TODAY is ${today}.\n\nQuestion: ${text}` },
        ],
        response_format: {
          type: 'json_schema',
          json_schema: { name: 'weather_query', strict: true, schema: SCHEMA },
        },
      }),
      signal: AbortSignal.timeout(15_000),
    });
  } catch (e) {
    throw Object.assign(
      new Error(e.name === 'TimeoutError' ? 'The AI service timed out.' : 'Could not reach the AI service.'),
      { status: 502 },
    );
  }

  if (res.status === 429) {
    throw Object.assign(new Error('The AI service is rate limited right now. Use the normal search box.'), { status: 429 });
  }
  if (!res.ok) {
    // Deliberately vague: upstream error bodies can echo the key or account details.
    console.error('[parse] upstream', res.status, (await res.text()).slice(0, 300));
    throw Object.assign(new Error('The AI service rejected that request.'), { status: 502 });
  }

  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) throw Object.assign(new Error('The AI service returned nothing usable.'), { status: 502 });

  let raw;
  try {
    raw = JSON.parse(content);
  } catch {
    // Some providers ignore json_schema and wrap the object in prose.
    const m = content.match(/\{[\s\S]*\}/);
    if (!m) throw Object.assign(new Error('Could not understand that question.'), { status: 422 });
    raw = JSON.parse(m[0]);
  }

  const clean = sanitize(raw);
  if (!clean.location) {
    throw Object.assign(new Error('No place name found in that question. Try naming a city.'), { status: 422 });
  }
  return clean;
}
