// End-to-end smoke test against a running server (needs network).
//   npm run dev   # in one terminal
//   npm run smoke # in another
const BASE = process.env.BASE ?? 'http://localhost:3000';
let failures = 0;

async function check(name, fn) {
  try {
    await fn();
    console.log(`✔ ${name}`);
  } catch (e) {
    failures++;
    console.error(`✖ ${name}\n   ${e.message}`);
  }
}

const call = async (path, init) => {
  const res = await fetch(BASE + path, init);
  const ct = res.headers.get('content-type') ?? '';
  return { res, body: ct.includes('json') ? await res.json() : await res.text() };
};
const expect = (cond, msg) => { if (!cond) throw new Error(msg); };
const json = (method, data) => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
const iso = (n) => new Date(Date.now() + n * 86400_000).toISOString().slice(0, 10);

await check('GET /api/weather?q=Chicago', async () => {
  const { res, body } = await call('/api/weather?q=Chicago');
  expect(res.ok, body.error);
  expect(body.daily.length === 5, 'expected a 5-day forecast');
  expect(typeof body.current.temp === 'number', 'missing current temperature');
});

await check('GET /api/weather by coordinates', async () => {
  const { res, body } = await call('/api/weather?lat=48.8584&lon=2.2945');
  expect(res.ok, body.error);
  expect(body.location.country === 'France', `expected France, got ${body.location.country}`);
});

await check('GET /api/weather for a landmark', async () => {
  const { body } = await call('/api/weather?q=Eiffel%20Tower');
  expect(Math.abs(body.location.lat - 48.86) < 0.2, 'landmark did not resolve near Paris');
});

await check('unknown location returns 404 with a helpful message', async () => {
  const { res, body } = await call('/api/weather?q=asdkjhqwlekjhasd');
  expect(res.status === 404, `expected 404, got ${res.status}`);
  expect(/No location found/.test(body.error), body.error);
});

await check('out-of-range coordinates return 400', async () => {
  const { res } = await call('/api/weather?lat=999&lon=0');
  expect(res.status === 400, `expected 400, got ${res.status}`);
});

let id;
await check('POST /api/records creates a record', async () => {
  const { res, body } = await call('/api/records', json('POST', {
    location: '61801', startDate: iso(-5), endDate: iso(2), notes: 'smoke test',
  }));
  expect(res.status === 201, body.error);
  expect(body.weather.length === 8, `expected 8 days, got ${body.weather?.length}`);
  expect(body.summary.tempMax >= body.summary.tempMin, 'summary extremes inverted');
  id = body.id;
});

await check('POST rejects a reversed date range', async () => {
  const { res, body } = await call('/api/records', json('POST', { location: 'Paris', startDate: iso(3), endDate: iso(-3) }));
  expect(res.status === 400 && /on or before/.test(body.error), JSON.stringify(body));
});

await check('POST rejects a nonexistent location', async () => {
  const { res } = await call('/api/records', json('POST', { location: 'zzzqqqxxx999', startDate: iso(-1), endDate: iso(0) }));
  expect(res.status === 404, `expected 404, got ${res.status}`);
});

await check('GET /api/records lists and searches', async () => {
  const { body } = await call('/api/records?search=61801');
  expect(body.total >= 1, 'search returned nothing');
});

await check('PUT updates notes and refetches on date change', async () => {
  const { res, body } = await call(`/api/records/${id}`, json('PUT', { notes: 'updated', endDate: iso(4) }));
  expect(res.ok, body.error);
  expect(body.notes === 'updated' && body.endDate === iso(4), JSON.stringify(body));
  expect(body.weather.at(-1).date === iso(4), 'weather was not refetched for the new range');
});

await check('PUT rejects an invalid date', async () => {
  const { res } = await call(`/api/records/${id}`, json('PUT', { startDate: '2024-13-45' }));
  expect(res.status === 400, `expected 400, got ${res.status}`);
});

for (const fmt of ['json', 'csv', 'xml', 'md', 'pdf']) {
  await check(`GET /api/export?format=${fmt}`, async () => {
    const res = await fetch(`${BASE}/api/export?format=${fmt}&id=${id}`);
    expect(res.ok, `status ${res.status}`);
    expect(/attachment; filename=/.test(res.headers.get('content-disposition') ?? ''), 'missing download header');
    expect((await res.arrayBuffer()).byteLength > 50, 'export was suspiciously empty');
  });
}

await check('GET /api/export rejects an unknown format', async () => {
  const { res } = await call('/api/export?format=docx');
  expect(res.status === 400, `expected 400, got ${res.status}`);
});

await check('GET /api/discover enriches a location', async () => {
  const { res, body } = await call('/api/discover?q=Kyoto');
  expect(res.ok, body.error);
  expect(body.map.embedUrl.includes('http'), 'no map embed');
  expect(body.country?.name === 'Japan', `expected Japan, got ${body.country?.name}`);
});

await check('DELETE removes the record', async () => {
  const { res } = await call(`/api/records/${id}`, { method: 'DELETE' });
  expect(res.ok, 'delete failed');
  const again = await call(`/api/records/${id}`, { method: 'DELETE' });
  expect(again.res.status === 404, 'deleting twice should 404');
});

console.log(failures ? `\n${failures} check(s) failed.` : '\nAll smoke checks passed.');
process.exit(failures ? 1 : 0);
