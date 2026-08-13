// Export saved records to JSON / CSV / XML / Markdown / PDF.
// PDF is written by hand (~60 lines) rather than pulling in a PDF dependency.

const COLUMNS = [
  ['id', (r) => r.id],
  ['label', (r) => r.label],
  ['query', (r) => r.query],
  ['latitude', (r) => r.latitude],
  ['longitude', (r) => r.longitude],
  ['country', (r) => r.country ?? ''],
  ['start_date', (r) => r.startDate],
  ['end_date', (r) => r.endDate],
  ['days', (r) => r.summary?.days ?? ''],
  ['temp_min_c', (r) => r.summary?.tempMin ?? ''],
  ['temp_max_c', (r) => r.summary?.tempMax ?? ''],
  ['temp_avg_c', (r) => r.summary?.tempAvg ?? ''],
  ['precip_total_mm', (r) => r.summary?.precipTotal ?? ''],
  ['notes', (r) => r.notes ?? ''],
  ['created_at', (r) => r.createdAt],
];

export const FORMATS = {
  json: { ext: 'json', type: 'application/json' },
  csv: { ext: 'csv', type: 'text/csv' },
  xml: { ext: 'xml', type: 'application/xml' },
  md: { ext: 'md', type: 'text/markdown' },
  markdown: { ext: 'md', type: 'text/markdown' },
  pdf: { ext: 'pdf', type: 'application/pdf' },
};

export function exportRecords(records, format) {
  switch (format) {
    case 'json': return JSON.stringify({ exportedAt: new Date().toISOString(), count: records.length, records }, null, 2);
    case 'csv': return toCSV(records);
    case 'xml': return toXML(records);
    case 'md':
    case 'markdown': return toMarkdown(records);
    case 'pdf': return toPDF(records);
    default: throw Object.assign(new Error(`Unsupported format "${format}". Use: ${Object.keys(FORMATS).join(', ')}.`), { status: 400 });
  }
}

const csvCell = (v) => {
  const s = String(v ?? '');
  return /[",\n\r]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
};

function toCSV(records) {
  const lines = [COLUMNS.map(([h]) => h).join(',')];
  for (const r of records) lines.push(COLUMNS.map(([, get]) => csvCell(get(r))).join(','));
  return lines.join('\r\n');
}

const xmlEsc = (v) =>
  String(v ?? '').replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]));

function toXML(records) {
  const rows = records.map((r) => {
    const fields = COLUMNS.map(([h, get]) => `      <${h}>${xmlEsc(get(r))}</${h}>`).join('\n');
    const daily = (r.weather ?? [])
      .map((d) => `        <day date="${xmlEsc(d.date)}" tempMax="${d.tempMax}" tempMin="${d.tempMin}" condition="${xmlEsc(d.label)}"/>`)
      .join('\n');
    return `    <record id="${r.id}">\n${fields}\n      <daily>\n${daily}\n      </daily>\n    </record>`;
  });
  return `<?xml version="1.0" encoding="UTF-8"?>\n<weatherExport exportedAt="${new Date().toISOString()}" count="${records.length}">\n  <records>\n${rows.join('\n')}\n  </records>\n</weatherExport>`;
}

function toMarkdown(records) {
  const head = `# Weather Records Export\n\n_Exported ${new Date().toISOString()} — ${records.length} record(s)_\n`;
  const table = [
    '| ID | Location | Dates | Min °C | Max °C | Avg °C | Precip mm |',
    '| --- | --- | --- | --- | --- | --- | --- |',
    ...records.map((r) =>
      `| ${r.id} | ${r.label.replaceAll('|', '\\|')} | ${r.startDate} → ${r.endDate} | ${r.summary?.tempMin ?? ''} | ${r.summary?.tempMax ?? ''} | ${r.summary?.tempAvg ?? ''} | ${r.summary?.precipTotal ?? ''} |`),
  ].join('\n');
  const detail = records.map((r) => {
    const days = (r.weather ?? [])
      .map((d) => `- **${d.date}** ${d.icon} ${d.label} — ${d.tempMin}°C / ${d.tempMax}°C, ${d.precipSum ?? 0} mm`)
      .join('\n');
    return `\n## ${r.label} (#${r.id})\n\n- Coordinates: ${r.latitude}, ${r.longitude}\n- Range: ${r.startDate} → ${r.endDate}\n${r.notes ? `- Notes: ${r.notes}\n` : ''}\n${days}`;
  });
  return `${head}\n${table}\n${detail.join('\n')}\n`;
}

// --- Minimal PDF writer -----------------------------------------------------
// Single-font (Helvetica) text-only PDF. ponytail: hand-rolled beats adding a
// PDF dependency for this; swap in pdfkit if styled/graphical output is needed.
const pdfEsc = (s) => String(s).replace(/[\\()]/g, '\\$&').replace(/[^\x20-\x7E]/g, '');

function toPDF(records) {
  const lines = [`Weather Records Export`, `Exported ${new Date().toISOString()}  |  ${records.length} record(s)`, ''];
  for (const r of records) {
    lines.push(`#${r.id}  ${r.label}`);
    lines.push(`   ${r.latitude}, ${r.longitude}   ${r.startDate} to ${r.endDate}`);
    const s = r.summary ?? {};
    lines.push(`   Min ${s.tempMin}C / Max ${s.tempMax}C / Avg ${s.tempAvg}C / Precip ${s.precipTotal}mm over ${s.days} day(s)`);
    if (r.notes) lines.push(`   Notes: ${r.notes}`);
    for (const d of (r.weather ?? []).slice(0, 40)) {
      lines.push(`      ${d.date}  ${String(d.label).padEnd(22)} ${d.tempMin}C - ${d.tempMax}C  ${d.precipSum ?? 0}mm`);
    }
    lines.push('');
  }

  const PER_PAGE = 52;
  const pages = [];
  for (let i = 0; i < lines.length; i += PER_PAGE) pages.push(lines.slice(i, i + PER_PAGE));
  if (!pages.length) pages.push(['(no records)']);

  const objects = [];
  const add = (body) => objects.push(body) && objects.length; // 1-based object number

  const fontId = 1 + 2 + pages.length * 2; // catalog, pages, then page+content pairs
  const pageIds = pages.map((_, i) => 3 + i * 2);

  add(`<< /Type /Catalog /Pages 2 0 R >>`);
  add(`<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pages.length} >>`);
  pages.forEach((pageLines, i) => {
    const stream = `BT /F1 10 Tf 12 TL 48 744 Td\n${pageLines.map((l) => `(${pdfEsc(l)}) Tj T*`).join('\n')}\nET`;
    add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${4 + i * 2} 0 R >>`);
    add(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
  });
  add(`<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>`);

  let pdf = '%PDF-1.4\n';
  const offsets = [];
  objects.forEach((body, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) pdf += `${String(off).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf, 'latin1');
}
