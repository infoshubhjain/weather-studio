// Extra API integration (assessment §2.2). Everything here is keyless by
// default; set YOUTUBE_API_KEY / GOOGLE_MAPS_API_KEY in .env.local to upgrade
// the video and map panels from links/OSM to the real Google products.
//
// GET /api/discover?q=Paris  (or ?lat=..&lon=..)
//   - Wikipedia REST      : summary + thumbnail for the place
//   - Wikipedia GeoSearch : nearby points of interest
//   - World Bank + flagcdn: country facts (capital, region, population, flag)
//   - OpenStreetMap       : embeddable map + directions links
//   - YouTube             : real search results with a key, links without
import { resolveOne, reverseGeocode } from '@/lib/geo';
import { fail, ok } from '@/lib/http';

export const dynamic = 'force-dynamic';

const UA = { 'User-Agent': 'pma-weather-assessment/1.0 (shubhj3@illinois.edu)' };
const soft = async (url, init) => {
  try {
    const r = await fetch(url, { ...init, signal: AbortSignal.timeout(8000) });
    return r.ok ? await r.json() : null;
  } catch {
    return null; // Enrichment is optional — never fail the request over it.
  }
};

export async function GET(req) {
  try {
    const p = req.nextUrl.searchParams;
    const location = p.get('lat') && p.get('lon')
      ? await reverseGeocode(Number(p.get('lat')), Number(p.get('lon')))
      : await resolveOne(p.get('q'));

    const { lat, lon, name, country, countryCode } = location;

    const [wiki, nearby, countryInfo, videos] = await Promise.all([
      soft(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(name)}`, { headers: UA }),
      soft(`https://en.wikipedia.org/w/api.php?action=query&list=geosearch&gscoord=${lat}|${lon}&gsradius=10000&gslimit=8&format=json&origin=*`, { headers: UA }),
      countryFacts(countryCode),
      youtube(name, country),
    ]);

    const d = 0.05;
    return ok({
      location,
      wikipedia: wiki?.type === 'standard' ? {
        title: wiki.title,
        extract: wiki.extract,
        thumbnail: wiki.thumbnail?.source ?? null,
        url: wiki.content_urls?.desktop?.page ?? null,
      } : null,
      nearby: (nearby?.query?.geosearch ?? []).map((g) => ({
        title: g.title, lat: g.lat, lon: g.lon, distanceM: g.dist,
        url: `https://en.wikipedia.org/wiki/${encodeURIComponent(g.title.replaceAll(' ', '_'))}`,
      })),
      country: countryInfo,
      map: {
        embedUrl: process.env.GOOGLE_MAPS_API_KEY
          ? `https://www.google.com/maps/embed/v1/place?key=${process.env.GOOGLE_MAPS_API_KEY}&q=${lat},${lon}&zoom=12`
          : `https://www.openstreetmap.org/export/embed.html?bbox=${lon - d},${lat - d},${lon + d},${lat + d}&layer=mapnik&marker=${lat},${lon}`,
        provider: process.env.GOOGLE_MAPS_API_KEY ? 'google' : 'openstreetmap',
        googleMapsUrl: `https://www.google.com/maps/search/?api=1&query=${lat},${lon}`,
        directionsUrl: `https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}`,
      },
      videos,
    });
  } catch (e) {
    return fail(e);
  }
}

/** World Bank country API + population indicator; flag image from flagcdn. */
async function countryFacts(code) {
  if (!code) return null;
  const year = new Date().getFullYear() - 2; // the most recent year with complete data
  const [meta, pop] = await Promise.all([
    soft(`https://api.worldbank.org/v2/country/${code}?format=json`),
    soft(`https://api.worldbank.org/v2/country/${code}/indicator/SP.POP.TOTL?format=json&per_page=1&date=${year}`),
  ]);
  const c = meta?.[1]?.[0];
  if (!c) return null;
  return {
    name: c.name,
    capital: c.capitalCity || null,
    region: c.region?.value ?? null,
    incomeLevel: c.incomeLevel?.value ?? null,
    population: pop?.[1]?.[0]?.value ?? null,
    populationYear: pop?.[1]?.[0]?.date ?? null,
    flag: `https://flagcdn.com/w80/${code.toLowerCase()}.png`,
  };
}

async function youtube(name, country) {
  const q = `${name} ${country ?? ''} travel guide`.trim();
  const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`;
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) return { query: q, searchUrl, items: [], note: 'Set YOUTUBE_API_KEY in .env.local for inline results.' };

  const data = await soft(
    `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=6&q=${encodeURIComponent(q)}&key=${key}`,
  );
  return {
    query: q,
    searchUrl,
    items: (data?.items ?? []).map((v) => ({
      id: v.id.videoId,
      title: v.snippet.title,
      channel: v.snippet.channelTitle,
      thumbnail: v.snippet.thumbnails?.medium?.url,
      url: `https://www.youtube.com/watch?v=${v.id.videoId}`,
      embedUrl: `https://www.youtube.com/embed/${v.id.videoId}`,
    })),
  };
}
