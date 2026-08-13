'use client';

// The brand mark. Previously this was an empty gradient <div> — a blank blue
// square with nothing in it, which is what looked broken.
//
// The motif is the product's own idea rather than generic sun-behind-cloud
// clipart: an instrument dial with a sun tracking an arc over a horizon, the
// same shape as the daylight-arc feature. The sun creeps along the arc, so the
// logo is quietly alive without ever pulling focus.

export default function Logo({ size = 38, animated = true }) {
  return (
    <svg
      className={`logo ${animated ? 'logo-live' : ''}`}
      width={size}
      height={size}
      viewBox="0 0 64 64"
      role="img"
      aria-label="Weather Studio"
    >
      <defs>
        <linearGradient id="lg-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#1e40af" />
          <stop offset="55%" stopColor="#2563eb" />
          <stop offset="100%" stopColor="#0b1c44" />
        </linearGradient>
        <linearGradient id="lg-sun" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#fff3c4" />
          <stop offset="100%" stopColor="#ffc247" />
        </linearGradient>
        <radialGradient id="lg-glow">
          <stop offset="0%" stopColor="#ffd98c" stopOpacity=".85" />
          <stop offset="100%" stopColor="#ffd98c" stopOpacity="0" />
        </radialGradient>
        {/* Keeps the arc and sun inside the rounded badge. */}
        <clipPath id="lg-clip">
          <rect width="64" height="64" rx="16" />
        </clipPath>
      </defs>

      <rect width="64" height="64" rx="16" fill="url(#lg-sky)" />

      <g clipPath="url(#lg-clip)">
        {/* Instrument rings */}
        <circle cx="32" cy="46" r="26" className="lg-ring" />
        <circle cx="32" cy="46" r="18" className="lg-ring" />

        {/* The daylight arc */}
        <path d="M8 46 A24 24 0 0 1 56 46" className="lg-arc" />

        {/* Sun: glow + disc, travelling the arc */}
        <g className="lg-sun-travel">
          <circle cx="0" cy="0" r="11" fill="url(#lg-glow)" />
          <circle cx="0" cy="0" r="5.5" fill="url(#lg-sun)" />
        </g>

        {/* Horizon */}
        <line x1="4" y1="46" x2="60" y2="46" className="lg-horizon" />

        {/* Ground haze below the horizon */}
        <rect x="0" y="46" width="64" height="18" fill="#050a18" opacity=".55" />
      </g>

      {/* Specular edge — the glass highlight that makes it read as a physical badge */}
      <rect width="64" height="64" rx="16" className="lg-edge" />
    </svg>
  );
}
