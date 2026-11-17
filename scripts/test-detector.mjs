// Runs the ball detector against synthetic camera frames with a known answer.
// Usage: node scripts/test-detector.mjs
import { DETECTOR_JS } from '../src/detector.ts';

const createDetector = new Function(DETECTOR_JS + '; return createDetector;')();

const W = 640;
const H = 360;

let seed = 1234;
const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);

// Static textured background (grass-like), reused for every frame.
const base = new Uint8Array(W * H);
for (let i = 0; i < base.length; i++) base[i] = 90 + Math.floor(rand() * 40);

function frame({ ball, person }) {
  const rgba = new Uint8ClampedArray(W * H * 4);
  for (let i = 0; i < W * H; i++) {
    const v = base[i] + Math.floor(rand() * 7) - 3; // sensor noise
    rgba[i * 4] = rgba[i * 4 + 1] = rgba[i * 4 + 2] = v;
    rgba[i * 4 + 3] = 255;
  }
  const rect = (cx, cy, w, h, v) => {
    for (let y = Math.max(0, Math.round(cy - h / 2)); y < Math.min(H, Math.round(cy + h / 2)); y++)
      for (let x = Math.max(0, Math.round(cx - w / 2)); x < Math.min(W, Math.round(cx + w / 2)); x++) {
        const p = (y * W + x) * 4;
        rgba[p] = rgba[p + 1] = rgba[p + 2] = v;
      }
  };
  if (person) rect(person.x, person.y, 28, 110, 30);
  if (ball) rect(ball.x, ball.y, ball.streak ?? 4, 4, 235);
  return rgba;
}

function run({ fps, ballPxPerSec, withPerson, direction = 1, streak }) {
  const det = createDetector(W, H);
  const x0 = 100;
  const x1 = 540;
  const events = [];
  const total = Math.round(fps * 3);
  const releaseT = 1.0;
  for (let f = 0; f < total; f++) {
    const t = f / fps;
    let ball = null;
    if (ballPxPerSec && t >= releaseT) {
      const dt = t - releaseT;
      const startX = direction > 0 ? 60 : 580;
      const x = startX + direction * ballPxPerSec * dt;
      // Falls, bounces two thirds of the way along, rises again.
      const bounceT = 380 / ballPxPerSec;
      const y = dt < bounceT ? 120 + 160 * (dt / bounceT) ** 2 : 280 - 300 * (dt - bounceT);
      if (x > 0 && x < W && y > 0 && y < H) ball = { x, y, streak };
    }
    // A bowler following through: big, slow, jittery.
    const person = withPerson ? { x: 110 + 60 * t + Math.sin(t * 20) * 3, y: 250 } : null;
    const r = det.process(frame({ ball, person }), t, x0, x1, 22);
    if (r.event) events.push(r.event);
  }
  return events;
}

const cases = [
  { name: '30 fps, 900 px/s, bowler in view', fps: 30, ballPxPerSec: 900, withPerson: true },
  { name: '30 fps, 1500 px/s, bowler in view', fps: 30, ballPxPerSec: 1500, withPerson: true },
  { name: '60 fps, 1500 px/s, right to left', fps: 60, ballPxPerSec: 1500, withPerson: true, direction: -1 },
  { name: '30 fps, 1200 px/s, motion-blur streak', fps: 30, ballPxPerSec: 1200, withPerson: false, streak: 24 },
  { name: 'bowler only, no ball', fps: 30, ballPxPerSec: 0, withPerson: true },
  { name: 'empty scene', fps: 30, ballPxPerSec: 0, withPerson: false },
];

let failed = 0;
for (const c of cases) {
  const events = run(c);
  let ok;
  let detail;
  if (c.ballPxPerSec) {
    const e = events[0];
    const err = e ? Math.abs(e.pxPerSec - c.ballPxPerSec) / c.ballPxPerSec : 1;
    ok = events.length === 1 && err < 0.03 && e.direction === (c.direction ?? 1);
    detail = e
      ? `measured ${e.pxPerSec.toFixed(0)} px/s (${(err * 100).toFixed(1)}% off, ${e.points.length} points, ${events.length} event)`
      : 'no detection';
  } else {
    ok = events.length === 0;
    detail = `${events.length} false detections`;
  }
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${c.name}: ${detail}`);
}
process.exit(failed ? 1 : 0);
