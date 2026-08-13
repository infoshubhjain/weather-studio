'use client';

// About / colophon. The link list is data-driven and self-filtering: an entry
// with no `url` is simply not rendered, so there are never dead placeholder
// links on screen. To add your portfolio, fill in the `url` below — nothing
// else needs to change.

const LINKS = [
  {
    id: 'github',
    label: 'GitHub',
    handle: '@infoshubhjain',
    url: 'https://github.com/infoshubhjain',
    icon: (
      <path d="M12 2C6.48 2 2 6.58 2 12.25c0 4.53 2.87 8.37 6.84 9.73.5.1.68-.22.68-.49
               0-.24-.01-.87-.01-1.71-2.78.62-3.37-1.37-3.37-1.37-.45-1.19-1.11-1.5-1.11-1.5
               -.91-.64.07-.63.07-.63 1 .07 1.53 1.06 1.53 1.06.89 1.560 2.34 1.11 2.91.85
               .09-.66.35-1.11.63-1.37-2.22-.26-4.56-1.14-4.56-5.06 0-1.12.39-2.03 1.03-2.75
               -.1-.26-.45-1.3.1-2.71 0 0 .84-.28 2.75 1.05a9.3 9.3 0 0 1 5 0c1.91-1.33
               2.75-1.05 2.75-1.05.55 1.41.2 2.45.1 2.71.64.72 1.03 1.63 1.03 2.75 0 3.93
               -2.35 4.79-4.58 5.05.36.32.68.94.68 1.9 0 1.37-.01 2.48-.01 2.82 0 .27.18.6.69.49
               A10.03 10.03 0 0 0 22 12.25C22 6.58 17.52 2 12 2z" />
    ),
  },
  {
    id: 'repo',
    label: 'Source code',
    handle: 'weather-studio',
    url: 'https://github.com/infoshubhjain/weather-studio',
    icon: <path d="M8 5 2 12l6 7M16 5l6 7-6 7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />,
  },
  {
    id: 'email',
    label: 'Email',
    handle: 'shubhj3@illinois.edu',
    url: 'mailto:shubhj3@illinois.edu',
    icon: (
      <>
        <rect x="2.5" y="4.5" width="19" height="15" rx="2.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
        <path d="M3 7l9 6 9-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </>
    ),
  },
  {
    id: 'portfolio',
    label: 'Portfolio',
    handle: '',
    url: '',   // ← add your portfolio URL here and the card appears
    icon: (
      <>
        <circle cx="12" cy="12" r="9.2" fill="none" stroke="currentColor" strokeWidth="1.8" />
        <path d="M3 12h18M12 2.8c2.6 2.6 2.6 15.8 0 18.4M12 2.8c-2.6 2.6-2.6 15.8 0 18.4"
              fill="none" stroke="currentColor" strokeWidth="1.6" />
      </>
    ),
  },
  {
    id: 'linkedin',
    label: 'LinkedIn',
    handle: '',
    url: '',   // ← add your LinkedIn URL here and the card appears
    icon: (
      <>
        <rect x="2.5" y="2.5" width="19" height="19" rx="3" fill="none" stroke="currentColor" strokeWidth="1.8" />
        <path d="M7 10.5V17M7 7.4v.1M11 17v-3.6c0-1.3.9-2.2 2.1-2.2s2.1.9 2.1 2.2V17"
              fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </>
    ),
  },
];

export default function About() {
  const links = LINKS.filter((l) => l.url);

  return (
    <>
      <section className="panel">
        <p className="eyebrow">Colophon</p>
        <h2 style={{ marginBottom: '.6rem' }}>Weather Studio</h2>
        <p className="about-lede">
          Most weather apps tell you the temperature. This one tells you which day to go.
        </p>
        <p>
          Built by <b>Shubh Jain</b> for the Product Manager Accelerator AI Engineer Intern
          technical assessment — covering both halves of the brief: a responsive React/Next.js
          frontend (Assessment&nbsp;#1) and a REST API with SQLite persistence, full CRUD,
          validation and five export formats (Assessment&nbsp;#2).
        </p>

        <h3 className="about-sub">Find me</h3>
        <div className="linkgrid">
          {links.map((l) => (
            <a
              key={l.id}
              className="linkcard"
              href={l.url}
              target={l.url.startsWith('mailto:') ? undefined : '_blank'}
              rel="noreferrer"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">{l.icon}</svg>
              <span>
                <b>{l.label}</b>
                <small>{l.handle}</small>
              </span>
              <span className="linkcard-go" aria-hidden="true">↗</span>
            </a>
          ))}
        </div>

        <h3 className="about-sub">How it's built</h3>
        <ul className="about-list">
          <li><b>Frontend</b> — Next.js 15, React 19. The sky is a hand-written WebGL fragment shader driven by live cloud cover, solar elevation and condition code; no 3D library.</li>
          <li><b>Backend</b> — Next.js route handlers, libSQL/SQLite, per-IP rate limiting, a TTL cache with request coalescing, and a health endpoint.</li>
          <li><b>Data</b> — 10 APIs, all keyless by default: Open-Meteo (forecast · archive · air quality · geocoding), OpenStreetMap Nominatim, Wikipedia REST &amp; GeoSearch, World Bank, flagcdn, and YouTube.</li>
          <li><b>Reasoning</b> — the product decisions behind all of this, including what I rejected, are written up in <a href="https://github.com/infoshubhjain/weather-studio/blob/main/DECISIONS.md" target="_blank" rel="noreferrer">DECISIONS.md</a>.</li>
        </ul>
      </section>

      <section className="panel">
        <p className="eyebrow">About the program</p>
        <h2 style={{ marginBottom: '.6rem' }}>Product Manager Accelerator</h2>
        <p>
          The Product Manager Accelerator Program is designed to support PM professionals through
          every stage of their careers. From students looking for entry-level jobs to Directors
          seeking to take on a leadership role, PMA has helped hundreds of students fulfill their
          career aspirations. Its mission is to make product management accessible: hands-on
          training, real-world projects, resume and interview coaching, and a community of product
          leaders who guide members from their first PM role through to senior leadership.
        </p>
        <a
          className="chip"
          href="https://www.linkedin.com/school/pmaccelerator/"
          target="_blank"
          rel="noreferrer"
        >
          Product Manager Accelerator on LinkedIn ↗
        </a>
      </section>
    </>
  );
}
