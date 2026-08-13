// Input validation at the API boundary. Never trust the client.

export class ValidationError extends Error {
  constructor(message, field) {
    super(message);
    this.status = 400;
    this.field = field;
  }
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const MAX_RANGE_DAYS = 366;
// Open-Meteo's archive starts 1940; forecast reaches 16 days out.
const MIN_DATE = '1940-01-01';
const addDays = (n) => new Date(Date.now() + n * 86400_000).toISOString().slice(0, 10);

/** Validates a date range and returns it normalized. Throws ValidationError. */
export function validateDateRange(start, end) {
  for (const [v, f] of [[start, 'startDate'], [end, 'endDate']]) {
    if (!v) throw new ValidationError(`${f} is required (YYYY-MM-DD).`, f);
    if (!ISO.test(v)) throw new ValidationError(`${f} must be formatted YYYY-MM-DD.`, f);
    const d = new Date(`${v}T00:00:00Z`);
    // Catches "2025-02-31" — Date rolls it over to March, so it won't round-trip.
    if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v) {
      throw new ValidationError(`${v} is not a real calendar date.`, f);
    }
  }
  if (start > end) throw new ValidationError('The start date must be on or before the end date.', 'startDate');
  if (start < MIN_DATE) throw new ValidationError(`Historical data only goes back to ${MIN_DATE}.`, 'startDate');

  const maxEnd = addDays(16);
  if (end > maxEnd) throw new ValidationError(`Forecasts only reach ${maxEnd} (16 days ahead).`, 'endDate');

  const span = (Date.parse(end) - Date.parse(start)) / 86400_000 + 1;
  if (span > MAX_RANGE_DAYS) throw new ValidationError(`Date range is ${Math.round(span)} days; the maximum is ${MAX_RANGE_DAYS}.`, 'endDate');

  return { start, end, days: span };
}

export function validateId(raw) {
  const id = Number(raw);
  if (!Number.isInteger(id) || id < 1) throw new ValidationError('Record id must be a positive integer.', 'id');
  return id;
}

export function validateNotes(notes) {
  if (notes == null || notes === '') return null;
  if (typeof notes !== 'string') throw new ValidationError('Notes must be text.', 'notes');
  if (notes.length > 2000) throw new ValidationError('Notes are limited to 2000 characters.', 'notes');
  return notes;
}
