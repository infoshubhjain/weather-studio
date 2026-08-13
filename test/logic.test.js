// Offline checks for the logic that has branches worth breaking:
// date-range validation, CRUD against a real in-memory SQLite db, exports,
// and the advice engine. Network-dependent code is exercised by the smoke
// script (npm run smoke) instead of being mocked here.
//
//   node --test test/
process.env.WEATHER_DB = ':memory:';

import test from 'node:test';
import assert from 'node:assert/strict';
import { validateDateRange, validateId, validateNotes, ValidationError } from '../lib/validate.js';
import { createRecord, getRecord, listRecords, updateRecord, deleteRecord } from '../lib/db.js';
import { exportRecords } from '../lib/export.js';
import { summarize } from '../lib/weather.js';
import { advise, showTemp, showWind, feelsGap } from '../lib/advice.js';

const iso = (n) => new Date(Date.now() + n * 86400_000).toISOString().slice(0, 10);
const throwsWith = (fn, re) => assert.throws(fn, (e) => e instanceof ValidationError && e.status === 400 && re.test(e.message));

test('date range validation', () => {
  assert.deepEqual(validateDateRange('2024-01-01', '2024-01-03').days, 3);
  throwsWith(() => validateDateRange('2024-01-05', '2024-01-01'), /on or before/);
  throwsWith(() => validateDateRange('2023-02-31', '2023-03-01'), /not a real calendar date/); // rollover caught
  throwsWith(() => validateDateRange('01/02/2024', '2024-01-03'), /YYYY-MM-DD/);
  throwsWith(() => validateDateRange('', '2024-01-03'), /required/);
  throwsWith(() => validateDateRange('1900-01-01', '1900-01-02'), /only goes back/);
  throwsWith(() => validateDateRange(iso(1), iso(40)), /16 days ahead/);
  throwsWith(() => validateDateRange('2020-01-01', '2023-01-01'), /maximum is 366/);
});

test('id and notes validation', () => {
  assert.equal(validateId('7'), 7);
  throwsWith(() => validateId('abc'), /positive integer/);
  throwsWith(() => validateId('-1'), /positive integer/);
  assert.equal(validateNotes(''), null);
  throwsWith(() => validateNotes('x'.repeat(2001)), /2000 characters/);
});

const days = [
  { date: '2024-01-01', tempMax: 5, tempMin: -1, precipSum: 2.5, label: 'Rain', icon: '🌧️' },
  { date: '2024-01-02', tempMax: 9, tempMin: 3, precipSum: 0, label: 'Clear sky', icon: '☀️' },
];

test('summarize picks true extremes across the range', () => {
  const s = summarize(days);
  assert.equal(s.tempMax, 9);
  assert.equal(s.tempMin, -1);
  assert.equal(s.precipTotal, 2.5);
  assert.equal(s.wettestDay, '2024-01-01');
  assert.equal(s.days, 2);
});

test('CRUD round-trip', () => {
  const made = createRecord({
    query: 'Chicago', label: 'Chicago, Illinois, United States',
    latitude: 41.85, longitude: -87.65, country: 'United States',
    startDate: '2024-01-01', endDate: '2024-01-02', notes: 'trip',
    summary: summarize(days), weather: days,
  });

  assert.ok(made.id > 0);
  assert.equal(getRecord(made.id).label, made.label);
  assert.deepEqual(getRecord(made.id).weather, days); // JSON survives the round-trip

  assert.equal(listRecords({ search: 'chicago' }).total, 1);
  assert.equal(listRecords({ search: 'nowhere' }).total, 0);

  const updated = updateRecord(made.id, { notes: 'changed', label: 'Chicago, IL' });
  assert.equal(updated.notes, 'changed');
  assert.equal(updated.label, 'Chicago, IL');
  assert.equal(updateRecord(999_999, { notes: 'x' }), null);

  assert.equal(deleteRecord(made.id), true);
  assert.equal(deleteRecord(made.id), false); // second delete is a no-op, not a crash
  assert.equal(getRecord(made.id), undefined);
});

test('exports produce well-formed output in every format', () => {
  const r = createRecord({
    query: 'x', label: 'Comma, "quoted" place', latitude: 1, longitude: 2, country: 'C',
    startDate: '2024-01-01', endDate: '2024-01-02', notes: 'a & b <tag>',
    summary: summarize(days), weather: days,
  });
  const all = listRecords().records;

  assert.equal(JSON.parse(exportRecords(all, 'json')).count, all.length);

  const csv = exportRecords(all, 'csv');
  assert.match(csv.split('\r\n')[0], /^id,label,query/);
  assert.match(csv, /"Comma, ""quoted"" place"/); // escaping holds

  const xml = exportRecords(all, 'xml');
  assert.match(xml, /^<\?xml version="1\.0"/);
  assert.match(xml, /a &amp; b &lt;tag&gt;/);

  assert.match(exportRecords(all, 'md'), /^# Weather Records Export/);

  const pdf = exportRecords(all, 'pdf');
  assert.ok(Buffer.isBuffer(pdf));
  assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
  assert.match(pdf.toString('latin1'), /startxref\n\d+\n%%EOF/);

  assert.throws(() => exportRecords(all, 'docx'), /Unsupported format/);
  deleteRecord(r.id);
});

test('unit formatting', () => {
  assert.equal(showTemp(0, 'C'), '0°C');
  assert.equal(showTemp(100, 'F'), '212°F');
  assert.equal(showTemp(null, 'C'), '—');
  assert.equal(showWind(100, 'C'), '100 km/h');
  assert.equal(showWind(100, 'F'), '62 mph');
  assert.equal(feelsGap(10, 11), null);
  assert.match(feelsGap(10, 2), /colder/);
  assert.match(feelsGap(30, 38), /warmer/);
});

test('advice reacts to conditions', () => {
  const tips = advise({
    current: { code: 95, temp: 34, feelsLike: 41, windGusts: 70 },
    daily: [{ tempMax: 34, tempMin: 20, precipProb: 90, uvMax: 11, daylightHours: 13 }],
    airQuality: { aqi: 85, band: { label: 'Very poor' } },
  }).map((t) => t.text).join(' ');

  assert.match(tips, /Thunderstorms/);
  assert.match(tips, /Heat stress/);
  assert.match(tips, /Gusts/);
  assert.match(tips, /umbrella/);
  assert.match(tips, /Extreme UV/);
  assert.match(tips, /Air quality is very poor/);

  assert.equal(advise({ current: { code: 0, temp: 18, feelsLike: 18 }, daily: [] }).length, 0);
});
