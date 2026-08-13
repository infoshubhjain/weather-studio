'use client';

// A soft light that follows the pointer, painted as one fixed layer behind the
// content. Cheap on purpose: the handler only writes two CSS variables and the
// actual work is a single rAF-throttled repaint, so it costs nothing per element.
//
// Skipped entirely on touch devices (no pointer to follow) and under
// prefers-reduced-motion.

import { useEffect, useRef } from 'react';

export default function CursorGlow() {
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    // A coarse pointer means touch — there is no hover to track.
    if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;

    let raf = 0, x = 0, y = 0, pending = false;

    const paint = () => {
      pending = false;
      el.style.setProperty('--cx', `${x}px`);
      el.style.setProperty('--cy', `${y}px`);
    };

    const onMove = (e) => {
      x = e.clientX;
      y = e.clientY;
      if (!pending) { pending = true; raf = requestAnimationFrame(paint); }
    };

    const onLeave = () => { el.style.opacity = '0'; };
    const onEnter = () => { el.style.opacity = '1'; };

    window.addEventListener('pointermove', onMove, { passive: true });
    document.addEventListener('mouseleave', onLeave);
    document.addEventListener('mouseenter', onEnter);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('pointermove', onMove);
      document.removeEventListener('mouseleave', onLeave);
      document.removeEventListener('mouseenter', onEnter);
    };
  }, []);

  return <div className="cursor-glow" ref={ref} aria-hidden="true" />;
}
