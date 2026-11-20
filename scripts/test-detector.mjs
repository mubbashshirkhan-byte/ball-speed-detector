// Runs the ball detector against synthetic camera frames with a known answer.
// Usage: node scripts/test-detector.mjs
import { DETECTOR_JS } from '../src/detector.ts';

const createDetector = new Function(DETECTOR_JS + '; return createDetector;')();

let seed = 1234;
const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);

function scene(W, H) {
  // Static textured background (grass-like), reused for every frame.
  const base = new Uint8Array(W * H);
  for (let i = 0; i < base.length; i++) base[i] = 90 + Math.floor(rand() * 40);

  return function frame({ ball, person }) {
    const rgba = new Uint8ClampedArray(W * H * 4);
    for (let i = 0; i < W * H; i++) {
      const v = base[i] + Math.floor(rand() * 7) - 3; // sensor noise
      rgba[i * 4] = rgba[i * 4 + 1] = rgba[i * 4 + 2] = v;
      rgba[i * 4 + 3] = 255;
    }
    const set = (x, y, v) => {
      if (x < 0 || y < 0 || x >= W || y >= H) return;
      const p = (y * W + x) * 4;
      rgba[p] = rgba[p + 1] = rgba[p + 2] = v;
    };
    if (person) {
      for (let y = Math.round(person.y - 55); y < person.y + 55; y++)
        for (let x = Math.round(person.x - 14); x < person.x + 14; x++) set(x, y, 30);
    }
    if (ball) {
      // A round ball smeared along its path for the length of the exposure.
      const r = ball.d / 2;
      const steps = Math.max(1, Math.ceil((Math.hypot(ball.vx, ball.vy) * ball.exposure) / 0.5));
      for (let s = 0; s <= steps; s++) {
        const k = (s / steps - 0.5) * ball.exposure;
        const cx = ball.x + ball.vx * k;
        const cy = ball.y + ball.vy * k;
        for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++)
          for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++)
            if ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= r * r) set(x, y, 235);
      }
    }
    return rgba;
  };
}

function run(c) {
  const { W = 640, H = 360, fps, v, withPerson, direction = 1, d = 4, exposure = 0, lines = true } = c;
  const frame = scene(W, H);
  const det = createDetector(W, H);
  const x0 = lines ? W * 0.16 : 0;
  const x1 = lines ? W * 0.84 : W;
  const events = [];
  const releaseT = 1.0;
  const bounceX = W * 0.6; // distance travelled before the bounce
  for (let f = 0; f < Math.round(fps * 3); f++) {
    const t = f / fps;
    let ball = null;
    if (v && t >= releaseT) {
      const dt = t - releaseT;
      const x = (direction > 0 ? W * 0.05 : W * 0.95) + direction * v * dt;
      const bounceT = bounceX / v;
      // Falls, bounces, rises again.
      const fall = W * 0.25;
      const rise = W * 0.48;
      const y = dt < bounceT ? H * 0.33 + fall * (dt / bounceT) ** 2 : H * 0.33 + fall - rise * (dt - bounceT);
      const vy = dt < bounceT ? (2 * fall * dt) / bounceT ** 2 : -rise;
      if (x > 0 && x < W && y > 0 && y < H) ball = { x, y, vx: direction * v, vy, d, exposure };
    }
    // A bowler following through: big, slow, jittery.
    const person = withPerson ? { x: W * 0.17 + 60 * t + Math.sin(t * 20) * 3, y: H * 0.7 } : null;
    const r = det.process(frame({ ball, person }), t, x0, x1, 22);
    if (r.event) events.push(r.event);
    if (r.miss) events.miss = r.miss;
  }
  return events;
}

const cases = [
  { name: '30 fps, 900 px/s, bowler in view', fps: 30, v: 900, withPerson: true },
  { name: '30 fps, 1500 px/s, bowler in view', fps: 30, v: 1500, withPerson: true },
  { name: '60 fps, 1500 px/s, right to left', fps: 60, v: 1500, withPerson: true, direction: -1 },
  { name: '30 fps, 1200 px/s, motion blur', fps: 30, v: 1200, withPerson: false, exposure: 1 / 60 },
  { name: 'bowler only, no ball', fps: 30, v: 0, withPerson: true },
  { name: 'empty scene', fps: 30, v: 0, withPerson: false },
  // Automatic scale: whole frame watched, ball size must come out right too.
  { name: 'auto: 960 wide, 14 px ball, 2400 px/s', W: 960, H: 540, fps: 30, v: 2400, d: 14, exposure: 1 / 500, lines: false, size: true },
  { name: 'auto: 14 px ball, heavy blur', W: 960, H: 540, fps: 30, v: 2400, d: 14, exposure: 1 / 120, lines: false, size: true },
  { name: 'auto: fast ball, 4 frames in view', W: 960, H: 540, fps: 30, v: 6500, d: 20, exposure: 1 / 500, lines: false, size: true },
  { name: 'auto: 60 fps, 8 px ball, bowler in view', W: 960, H: 540, fps: 60, v: 3000, d: 8, exposure: 1 / 500, lines: false, size: true, withPerson: true },
  { name: 'auto: bowler only, no ball', W: 960, H: 540, fps: 30, v: 0, withPerson: true, lines: false },
  { name: 'auto: phone upright, 12 picture-widths per second', W: 540, H: 960, fps: 60, v: 6480, d: 16, exposure: 1 / 1000, lines: false, size: true },
  { name: 'auto: too fast to measure is reported, not guessed', W: 960, H: 540, fps: 30, v: 16000, d: 16, exposure: 1 / 1000, lines: false, expectMiss: 'few' },
];

let failed = 0;
for (const c of cases) {
  const events = run(c);
  let ok;
  let detail;
  if (c.expectMiss) {
    ok = events.length === 0 && events.miss === c.expectMiss;
    detail = `${events.length} readings, reason given: ${events.miss ?? 'none'}`;
  } else if (c.v) {
    const e = events[0];
    const err = e ? Math.abs(e.pxPerSec - c.v) / c.v : 1;
    const sizeErr = e && c.size ? Math.abs(e.ballPx - c.d) / c.d : 0;
    ok = events.length === 1 && err < 0.03 && sizeErr < 0.15 && e.direction === (c.direction ?? 1);
    detail = e
      ? `speed ${e.pxPerSec.toFixed(0)} px/s (${(err * 100).toFixed(1)}% off), ${e.points.length} points` +
        (c.size ? `, ball ${e.ballPx.toFixed(1)} px (true ${c.d})` : '') + `, ${events.length} event`
      : 'no detection';
  } else {
    ok = events.length === 0;
    detail = `${events.length} false detections`;
  }
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${c.name}: ${detail}`);
}
process.exit(failed ? 1 : 0);
