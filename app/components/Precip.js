'use client';

// Rain / snow particle layer over the sky. Canvas 2D, no dependency.
// Particle count scales with actual measured precipitation, so a drizzle looks
// like a drizzle and a downpour looks like one.

import { useEffect, useRef } from 'react';

export default function Precip({ kind, intensity, wind = 0 }) {
  const ref = useRef(null);
  const cfg = useRef({ kind, intensity, wind });
  cfg.current = { kind, intensity, wind };

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const ctx = canvas.getContext('2d');
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let w = 0, h = 0, raf, running = true;
    let particles = [];

    const resize = () => {
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const spawn = (snow) => ({
      x: Math.random() * w,
      y: Math.random() * -h,
      z: 0.35 + Math.random() * 0.65,       // depth → size, speed and opacity
      len: snow ? 0 : 8 + Math.random() * 22,
      r: snow ? 0.8 + Math.random() * 2.0 : 0,
      drift: Math.random() * Math.PI * 2,   // snow only: lateral sway phase
    });

    const sync = () => {
      const { kind: k, intensity: i } = cfg.current;
      const want = k === 'none' ? 0 : Math.round((k === 'snow' ? 130 : 220) * Math.min(1, i));
      while (particles.length < want) particles.push(spawn(k === 'snow'));
      if (particles.length > want) particles.length = want;
    };

    let t = 0;
    const frame = () => {
      if (!running) return;
      resize();
      sync();
      ctx.clearRect(0, 0, w, h);
      t += 1 / 60;

      const { kind: k, wind: windKmh } = cfg.current;
      const slant = Math.max(-0.6, Math.min(0.6, windKmh / 90));

      if (k === 'snow') {
        ctx.fillStyle = '#fff';
        for (const p of particles) {
          p.y += (12 + p.z * 26) / 60;
          p.x += (Math.sin(t * 0.7 + p.drift) * 14 + slant * 40) / 60;
          if (p.y > h) { p.y = -8; p.x = Math.random() * w; }
          ctx.globalAlpha = 0.18 + p.z * 0.55;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.r * p.z, 0, Math.PI * 2);
          ctx.fill();
        }
      } else if (k === 'rain') {
        ctx.lineCap = 'round';
        for (const p of particles) {
          const speed = (380 + p.z * 620) / 60;
          p.y += speed;
          p.x += speed * slant;
          if (p.y > h) { p.y = -30; p.x = Math.random() * w - slant * h; }
          ctx.globalAlpha = 0.10 + p.z * 0.32;
          ctx.strokeStyle = '#cfe0ff';
          ctx.lineWidth = 0.6 + p.z * 0.9;
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p.x - p.len * p.z * slant, p.y - p.len * p.z);
          ctx.stroke();
        }
      }
      ctx.globalAlpha = 1;
      raf = requestAnimationFrame(frame);
    };
    frame();

    const onVis = () => {
      running = document.visibilityState === 'visible';
      if (running) frame();
    };
    document.addEventListener('visibilitychange', onVis);

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, []);

  return <canvas className="precip" ref={ref} aria-hidden="true" />;
}
