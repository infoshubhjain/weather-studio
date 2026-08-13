'use client';

// "Which day should I go?" — scores the forecast against what an activity
// actually needs and names a winner, instead of leaving you to eyeball five
// cards of icons.

import { useState } from 'react';
import { ACTIVITIES, rankDays, whyBest } from '@/lib/advice';
import { showTemp } from '@/lib/advice';

const longDay = (iso) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, { weekday: 'long' });

export default function BestDay({ daily, unit }) {
  const [activity, setActivity] = useState('outdoors');
  if (!daily?.length) return null;

  const ranked = rankDays(daily, activity);
  const best = ranked[0];
  const byDate = new Map(ranked.map((d) => [d.date, d]));
  const reason = whyBest(best, activity);

  return (
    <section className="panel bestday">
      <header className="panel-head">
        <h2>Best day for…</h2>
        <div className="pills" role="tablist" aria-label="Activity">
          {Object.entries(ACTIVITIES).map(([key, a]) => (
            <button
              key={key}
              role="tab"
              aria-selected={activity === key}
              className="pill"
              onClick={() => setActivity(key)}
            >
              <span aria-hidden="true">{a.icon}</span> {a.label}
            </button>
          ))}
        </div>
      </header>

      <p className="verdict" aria-live="polite">
        <b>{longDay(best.date)}</b> is your best bet — {best.verdict.toLowerCase()} conditions
        {reason ? `, with ${reason}` : ''}.
      </p>

      <ol className="score-rows">
        {daily.map((d) => {
          const s = byDate.get(d.date);
          const isBest = s.date === best.date;
          return (
            <li key={d.date} className={isBest ? 'best' : ''}>
              <span className="row-day">{longDay(d.date).slice(0, 3)}</span>
              <span className="row-icon" aria-hidden="true">{d.icon}</span>
              <span className="row-bar">
                {/* Sequential encoding: one hue, opacity carries magnitude. */}
                <span className="row-fill" style={{ width: `${s.score}%` }} />
              </span>
              <span className="row-score">{s.score}</span>
              <span className="row-temp">{showTemp(d.tempMax, unit)}</span>
            </li>
          );
        })}
      </ol>
      <p className="muted small">
        Scored on temperature, rain probability, wind and daylight — weighted for the activity you picked.
      </p>
    </section>
  );
}
