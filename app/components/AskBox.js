'use client';

// Natural-language search. Renders only when the server reports an AI key is
// configured, so a clone with no key never shows a dead feature — the normal
// search box below it does the job.

import { useEffect, useState } from 'react';

const EXAMPLES = [
  'Is it beach weather in Barcelona this weekend?',
  'Best day to hike near Denver next week',
  'Will it rain in Tokyo tomorrow?',
];

export default function AskBox({ onParsed }) {
  const [configured, setConfigured] = useState(null); // null = still checking
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  useEffect(() => {
    fetch('/api/parse')
      .then((r) => r.json())
      .then((b) => setConfigured(Boolean(b.configured)))
      .catch(() => setConfigured(false));
  }, []);

  if (!configured) return null; // also covers the still-checking state

  const ask = async (e) => {
    e?.preventDefault();
    const q = text.trim();
    if (!q) return;
    setBusy(true); setError(''); setResult(null);
    try {
      const res = await fetch('/api/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: q }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? 'Could not parse that.');
      setResult(body);
      onParsed(body);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="panel askbox">
      <p className="eyebrow">Ask in plain English <span className="badge">AI</span></p>
      <form onSubmit={ask} className="ask-row">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="e.g. Is it beach weather in Barcelona this weekend?"
          aria-label="Ask a weather question in plain English"
          maxLength={300}
        />
        <button className="primary" disabled={busy}>{busy ? 'Thinking…' : 'Ask'}</button>
      </form>

      {!result && !error && (
        <div className="chips" style={{ marginTop: '.6rem' }}>
          {EXAMPLES.map((ex) => (
            <button type="button" key={ex} className="chip" onClick={() => { setText(ex); }}>
              {ex}
            </button>
          ))}
        </div>
      )}

      {error && <div className="alert error" role="alert"><span aria-hidden="true">⚠</span><span>{error}</span></div>}

      {result && (
        <p className="ask-result" aria-live="polite">
          Understood as <b>{result.location}</b>
          {result.activity && <> · activity <b>{result.activity}</b></>}
          {result.startDate && <> · {result.startDate}{result.endDate && result.endDate !== result.startDate ? ` → ${result.endDate}` : ''}</>}
        </p>
      )}
    </section>
  );
}
