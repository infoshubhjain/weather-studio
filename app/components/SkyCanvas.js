'use client';

// Procedural sky, drawn with a hand-written fragment shader. No 3D library —
// the whole thing is one full-screen triangle and ~120 lines of GLSL, which is
// smaller and faster than pulling in three.js for a background.
//
// Falls back to a CSS gradient if WebGL is unavailable, and freezes entirely
// under prefers-reduced-motion.

import { useEffect, useRef } from 'react';

const VERT = `
attribute vec2 p;
void main() { gl_Position = vec4(p, 0.0, 1.0); }
`;

const FRAG = `
precision highp float;

uniform vec2  uRes;
uniform float uTime;
uniform vec3  uHorizon;
uniform vec3  uZenith;
uniform float uCloud;
uniform float uDay;
uniform float uSunY;
uniform float uStorm;

// -- noise ------------------------------------------------------------------
float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);          // smoothstep interpolation
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}

// Fractal brownian motion — five octaves is enough for cloud structure.
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) {
    v += a * noise(p);
    p = p * 2.02 + vec2(11.3, 7.7);
    a *= 0.5;
  }
  return v;
}

void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  float aspect = uRes.x / uRes.y;

  // -- base gradient --------------------------------------------------------
  // Curved so the horizon glow stays low and the zenith reads as deep sky.
  float grad = pow(clamp(uv.y, 0.0, 1.0), 0.75);
  vec3 col = mix(uHorizon, uZenith, grad);

  // -- sun / moon -----------------------------------------------------------
  vec2 sunPos = vec2(0.72, uSunY);
  vec2 d = (uv - sunPos) * vec2(aspect, 1.0);
  float dist = length(d);

  // Broad atmospheric bloom around the light source, then the disc itself.
  float bloom = exp(-dist * (uDay > 0.5 ? 4.5 : 9.0));
  vec3 lightCol = uDay > 0.5 ? vec3(1.0, 0.92, 0.75) : vec3(0.80, 0.86, 1.0);
  col += lightCol * bloom * (uDay > 0.5 ? 0.55 : 0.22) * (1.0 - uCloud * 0.75);

  float disc = smoothstep(0.030, 0.020, dist);
  col = mix(col, lightCol, disc * (1.0 - uCloud * 0.85) * (uSunY > -0.1 ? 1.0 : 0.0));

  // -- stars ----------------------------------------------------------------
  if (uDay < 0.5) {
    vec2 sp = uv * vec2(aspect, 1.0) * 140.0;
    float star = hash(floor(sp));
    float bright = smoothstep(0.9975, 1.0, star);
    // Each star twinkles on its own phase offset.
    float twinkle = 0.55 + 0.45 * sin(uTime * 1.6 + star * 90.0);
    col += vec3(0.85, 0.9, 1.0) * bright * twinkle * (1.0 - uCloud) * uv.y;
  }

  // -- clouds ---------------------------------------------------------------
  // Two layers drifting at different speeds gives parallax without geometry.
  vec2 cuv = vec2(uv.x * aspect, uv.y);
  float t = uTime * 0.012;
  float far  = fbm(cuv * 2.6 + vec2(t, 0.0));
  float near = fbm(cuv * 4.4 + vec2(t * 2.1, -t * 0.4) + far * 0.5);
  float clouds = mix(far, near, 0.55);

  // Cloud cover raises the threshold rather than the opacity, so partly-cloudy
  // reads as distinct puffs and overcast reads as a solid sheet.
  float cover = smoothstep(1.0 - uCloud * 0.95, 1.05 - uCloud * 0.55, clouds + uCloud * 0.35);
  // Clouds thin out toward the horizon, as they do in life.
  cover *= smoothstep(0.0, 0.45, uv.y);

  vec3 cloudLit = mix(vec3(0.30, 0.33, 0.40), vec3(1.0, 0.98, 0.95), uDay);
  cloudLit = mix(cloudLit, cloudLit * 0.45, uStorm);
  // Underside shading: the side facing the light source is brighter.
  cloudLit *= 0.75 + 0.45 * exp(-dist * 2.0);
  col = mix(col, cloudLit, cover * 0.85);

  // -- lightning ------------------------------------------------------------
  if (uStorm > 0.5) {
    float strike = step(0.985, hash(vec2(floor(uTime * 2.3), 4.0)));
    float decay = fract(uTime * 2.3);
    col += vec3(0.7, 0.75, 0.95) * strike * (1.0 - decay) * 0.55 * cover;
  }

  // -- finish ---------------------------------------------------------------
  float vig = 1.0 - 0.55 * pow(length((uv - 0.5) * vec2(aspect, 1.0)) * 0.95, 2.2);
  col *= vig;
  // Film grain — breaks up banding in the gradient, which is very visible on
  // large flat areas of dark blue.
  col += (hash(uv * uRes + uTime) - 0.5) * 0.022;

  gl_FragColor = vec4(col, 1.0);
}
`;

function compile(gl, type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    console.error('[sky]', gl.getShaderInfoLog(s));
    return null;
  }
  return s;
}

export default function SkyCanvas({ params, fallback }) {
  const ref = useRef(null);
  // Live target values; the render loop eases toward them so a location change
  // dissolves between skies instead of cutting.
  const target = useRef(params);
  target.current = params;

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;

    const gl = canvas.getContext('webgl', { antialias: false, alpha: false, powerPreference: 'low-power' });
    if (!gl) return; // CSS fallback stays visible underneath

    const prog = gl.createProgram();
    const vs = compile(gl, gl.VERTEX_SHADER, VERT);
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) return;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return;
    gl.useProgram(prog);

    // One oversized triangle covers the viewport with no seam down the middle.
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'p');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    const u = Object.fromEntries(
      ['uRes', 'uTime', 'uHorizon', 'uZenith', 'uCloud', 'uDay', 'uSunY', 'uStorm']
        .map((n) => [n, gl.getUniformLocation(prog, n)]),
    );

    // Half-resolution render: the shader is noise-heavy and the output is a
    // soft gradient, so nobody can tell — and it keeps laptops quiet.
    const SCALE = 0.55;
    const resize = () => {
      const w = Math.max(1, Math.floor(canvas.clientWidth * SCALE));
      const h = Math.max(1, Math.floor(canvas.clientHeight * SCALE));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
        gl.viewport(0, 0, w, h);
      }
    };

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const cur = { ...target.current };
    let raf, running = true, start = performance.now();

    const lerp = (a, b, k) => a + (b - a) * k;

    const frame = () => {
      if (!running) return;
      resize();
      const t = (performance.now() - start) / 1000;
      const g = target.current;

      // Ease every parameter toward its target — this is what makes switching
      // cities feel like a dissolve rather than a jump cut.
      const k = 0.045;
      for (let i = 0; i < 3; i++) {
        cur.horizon[i] = lerp(cur.horizon[i], g.horizon[i], k);
        cur.zenith[i] = lerp(cur.zenith[i], g.zenith[i], k);
      }
      cur.cloud = lerp(cur.cloud, g.cloud, k);
      cur.day = lerp(cur.day, g.day, k);
      cur.sunY = lerp(cur.sunY, g.sunY, k);
      cur.storm = lerp(cur.storm, g.storm, k);

      gl.uniform2f(u.uRes, canvas.width, canvas.height);
      gl.uniform1f(u.uTime, reduced ? 12.0 : t);
      gl.uniform3fv(u.uHorizon, cur.horizon);
      gl.uniform3fv(u.uZenith, cur.zenith);
      gl.uniform1f(u.uCloud, cur.cloud);
      gl.uniform1f(u.uDay, cur.day);
      gl.uniform1f(u.uSunY, cur.sunY);
      gl.uniform1f(u.uStorm, cur.storm);
      gl.drawArrays(gl.TRIANGLES, 0, 3);

      // Reduced motion: draw one frame, then only redraw when params change.
      raf = requestAnimationFrame(reduced ? () => {} : frame);
    };
    frame();

    // Don't burn GPU on a background tab.
    const onVis = () => {
      running = document.visibilityState === 'visible';
      if (running) { start = performance.now() - 1000; frame(); }
    };
    document.addEventListener('visibilitychange', onVis);

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      document.removeEventListener('visibilitychange', onVis);
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    };
  }, []);

  return (
    <div className="sky" aria-hidden="true" style={{ background: fallback }}>
      <canvas ref={ref} />
      <div className="sky-fade" />
    </div>
  );
}
