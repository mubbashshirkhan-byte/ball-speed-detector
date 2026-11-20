// Runs the ball detector against synthetic camera frames with a known answer.
// Usage: node scripts/test-detector.mjs
// DETECTOR=<path to another detector.ts> runs the same tests against that copy.
const { DETECTOR_JS } = await import(
  process.env.DETECTOR ? new URL('file:///' + process.env.DETECTOR.replace(/\\/g, '/')).href : '../src/detector.ts'
);

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
    // Phones report frame times a few milliseconds early or late.
    const stamped = t + (c.jitter ? (rand() * 2 - 1) * c.jitter : 0);
    const r = det.process(frame({ ball, person }), stamped, x0, x1, 22);
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
  { name: 'auto: frame times off by up to 6 ms', W: 960, H: 540, fps: 30, v: 2400, d: 14, exposure: 1 / 500, lines: false, size: true, jitter: 0.006 },
  { name: 'auto: fast ball, frame times off by up to 6 ms', W: 960, H: 540, fps: 30, v: 5000, d: 18, exposure: 1 / 500, lines: false, size: true, jitter: 0.006 },
  { name: 'lines: bowler in view, frame times off by up to 6 ms', fps: 30, v: 1500, withPerson: true, jitter: 0.006 },
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
    ok = events.length === 1 && err < (c.jitter ? 0.05 : 0.03) && sizeErr < 0.15 && e.direction === (c.direction ?? 1);
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

// ---- Movement that is NOT a delivery must give no reading ----
function runNoise(kind, { W = 960, H = 540, fps = 30, seconds = 20 } = {}) {
  const det = createDetector(W, H);
  // Blocky background, so a shifted picture changes only along block edges.
  const base = new Uint8Array(W * H);
  const blocks = new Map();
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const key = (x >> 5) + ',' + (y >> 5);
      if (!blocks.has(key)) blocks.set(key, 70 + Math.floor(rand() * 120));
      base[y * W + x] = blocks.get(key);
    }
  const fixed = Array.from({ length: 6 }, () => ({ x: 40 + rand() * (W - 80), y: 40 + rand() * (H - 80) }));
  let events = 0;
  for (let f = 0; f < fps * seconds; f++) {
    const t = f / fps;
    const sx = kind === 'shake' ? Math.floor(rand() * 5) - 2 : 0;
    const sy = kind === 'shake' ? Math.floor(rand() * 5) - 2 : 0;
    const rgba = new Uint8ClampedArray(W * H * 4);
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const bx = Math.min(W - 1, Math.max(0, x + sx));
        const by = Math.min(H - 1, Math.max(0, y + sy));
        const v = base[by * W + bx] + Math.floor(rand() * 7) - 3;
        const p = (y * W + x) * 4;
        rgba[p] = rgba[p + 1] = rgba[p + 2] = v; rgba[p + 3] = 255;
      }
    const rect = (cx, cy, w, h, v) => {
      for (let y = Math.max(0, Math.round(cy - h / 2)); y < Math.min(H, Math.round(cy + h / 2)); y++)
        for (let x = Math.max(0, Math.round(cx - w / 2)); x < Math.min(W, Math.round(cx + w / 2)); x++) {
          const p = (y * W + x) * 4;
          rgba[p] = rgba[p + 1] = rgba[p + 2] = v;
        }
    };
    const flicker = /^flicker(\d+)$/.exec(kind);
    if (flicker) for (let k = 0; k < Number(flicker[1]); k++) rect(rand() * W, rand() * H, 6, 6, 240);
    if (kind === 'twinkle') for (const s of fixed) if (rand() < 0.5) rect(s.x, s.y, 7, 7, 240);
    if (kind === 'wave') {
      // Someone close to the camera moving about, with small pieces showing beside them.
      const px = W / 2 + Math.sin(t * 5) * W * 0.3;
      rect(px, H * 0.6, 90, 260, 25);
      for (let k = 0; k < 3; k++) rect(px + (k - 1) * 70 + rand() * 20, H * 0.3 + rand() * H * 0.5, 7, 7, 240);
    }
    if (kind === 'walker') rect(W * 0.1 + t * W * 0.04, H * 0.5, 8, 18, 30); // someone far away, strolling
    const r = det.process(rgba, t, 0, W, 22);
    if (r.event) events++;
  }
  return events;
}
for (const kind of ['flicker1', 'flicker2', 'flicker4', 'flicker8', 'twinkle', 'shake', 'wave', 'walker']) {
  const events = runNoise(kind);
  if (events) failed++;
  console.log(`${events ? 'FAIL' : 'PASS'}  no delivery, ${kind}: ${events} false readings in 20 s`);
}
process.exit(failed ? 1 : 0);
