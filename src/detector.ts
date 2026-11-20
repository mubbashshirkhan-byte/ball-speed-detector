/**
 * Ball detector, shipped as plain JavaScript source because it runs inside the
 * camera WebView (see page.ts), not in the React Native runtime.
 * Keep it free of backticks and dollar-brace sequences.
 *
 * How it works, per camera frame:
 *  1. Compare each pixel in the watched area with a slowly updating background
 *     image; pixels that changed are "motion".
 *  2. Group motion pixels into blobs. Big blobs are people; small blobs that are
 *     not touching a big one are ball candidates.
 *  3. Link candidates across frames into tracks that move fast and steadily in
 *     one horizontal direction.
 *  4. When a track ends, decide whether it was a delivery. It must have been
 *     followed for several frames, moved in a straight line at a steady speed,
 *     kept its size, risen and fallen smoothly, and entered and left the picture
 *     the way a ball does. Anything else gives no reading.
 *  5. For a delivery, the slope of position against time is the speed in pixels
 *     per second. The page converts that to real speed using a known length:
 *     the ball's own diameter, or the distance between two calibration lines.
 */
export const DETECTOR_JS = String.raw`
function createDetector(width, height) {
  var n = width * height;
  var bg = new Float32Array(n);
  var mask = new Uint8Array(n);
  var stack = new Int32Array(n);
  var hasBg = false;
  var tracks = [];
  var cooldownUntil = -1;
  var pending = null;
  var largeCount = 0;        // moving things too big to be a ball, this frame
  var lastMiss = null;       // why the latest ball-like movement gave no reading
  var lastFrameT = -1;
  var frameDt = 0;           // typical time between frames (smoothed)

  var MIN_AREA = 3;
  var MAX_BLOB_W = Math.round(width * 0.3);               // allows for long motion-blur streaks
  var MAX_BLOB_H = Math.max(10, Math.round(height * 0.1));
  var NEAR_LARGE = Math.max(6, Math.round(width * 0.02)); // margin around big moving things
  var MIN_V = width * 0.25;                               // px/s; slower things are not a bowled ball
  var MAX_V = width * 20;
  var EXPIRE_S = 0.18;                                    // a track ends after this long unseen
  var COOLDOWN_S = 1.0;                                   // one reading per delivery
  var MIN_POINTS = 4;                                     // frames a ball must be followed for
  var MAX_FIT_POINTS = 14;
  var MAX_SMALL = 8;                                      // more small moving things than this = unstable picture
  var MAX_BLOBS = 40;
  var MAX_TRACKS = 30;
  var BG_RATE = 0.06;
  var BUSY_FRACTION = 0.12;                               // more motion than this = camera moved

  function reset() { hasBg = false; tracks = []; pending = null; }

  function median(a) {
    a.sort(function (p, q) { return p - q; });
    var h = a.length >> 1;
    return a.length % 2 ? a[h] : (a[h - 1] + a[h]) / 2;
  }
  function abs(v) { return v < 0 ? -v : v; }

  // ---------- blobs ----------
  function findBlobs(x0, x1) {
    var blobs = [], large = [];
    largeCount = 0;
    for (var y = 0; y < height; y++) {
      for (var x = x0; x < x1; x++) {
        var start = y * width + x;
        if (!mask[start]) continue;
        var sp = 0, area = 0, sumX = 0, sumY = 0;
        var minX = x, maxX = x, minY = y, maxY = y;
        stack[sp++] = start; mask[start] = 0;
        while (sp > 0) {
          var i = stack[--sp];
          var py = (i / width) | 0, px = i - py * width;
          area++; sumX += px; sumY += py;
          if (px < minX) minX = px; if (px > maxX) maxX = px;
          if (py < minY) minY = py; if (py > maxY) maxY = py;
          for (var oy = -1; oy <= 1; oy++) {
            var ny = py + oy;
            if (ny < 0 || ny >= height) continue;
            for (var ox = -1; ox <= 1; ox++) {
              var nx = px + ox;
              if (nx < x0 || nx >= x1) continue;
              var j = ny * width + nx;
              if (mask[j]) { mask[j] = 0; stack[sp++] = j; }
            }
          }
        }
        if (area < MIN_AREA) continue;
        var w = maxX - minX + 1, h = maxY - minY + 1;
        if (w > MAX_BLOB_W || h > MAX_BLOB_H) {
          largeCount++;
          if (large.length < 12) large.push([minX - NEAR_LARGE, maxX + NEAR_LARGE, minY - NEAR_LARGE, maxY + NEAR_LARGE]);
          continue;
        }
        if (blobs.length < MAX_BLOBS) blobs.push({ x: sumX / area, y: sumY / area, area: area, w: w, h: h });
      }
    }
    if (!large.length) return blobs;
    // A ball in flight is on its own. Small pieces touching a big moving thing
    // are parts of a person, so they are left out.
    return blobs.filter(function (b) {
      for (var q = 0; q < large.length; q++) {
        var L = large[q];
        if (b.x >= L[0] && b.x <= L[1] && b.y >= L[2] && b.y <= L[3]) return false;
      }
      return true;
    });
  }

  // ---------- tracks ----------
  function point(b, t, count) {
    return { t: t, x: b.x, y: b.y, w: b.w, h: b.h, area: b.area, others: count };
  }

  function updateTracks(blobs, t) {
    var i, k, count = blobs.length;
    // "Quiet" = nothing else is moving, so a small fast thing is very likely the ball.
    var quiet = largeCount === 0 && count <= 3;
    for (k = 0; k < tracks.length; k++) {
      var tr = tracks[k];
      var last = tr.pts[tr.pts.length - 1];
      var dt = t - last.t;
      if (dt <= 0) continue;
      var best = -1, bestScore = Infinity, bestV = 0;
      for (i = 0; i < count; i++) {
        var b = blobs[i];
        var dx = b.x - last.x;
        var v = dx / dt, av = abs(v);
        if (av < MIN_V || av > MAX_V) continue;
        var dy = abs(b.y - last.y);
        if (dy > abs(dx) * 0.9 + 6) continue;
        var score = dy / height;
        if (tr.pts.length >= 2) {
          if ((v > 0) !== (tr.vx > 0)) continue;
          var ratio = av / abs(tr.vx);
          if (ratio < 0.6 || ratio > 1.6) continue;
          score += ratio > 1 ? ratio - 1 : 1 - ratio;
        }
        if (score < bestScore) { bestScore = score; best = i; bestV = v; }
      }
      if (best >= 0) {
        tr.vx = tr.pts.length === 1 ? bestV : tr.vx * 0.5 + bestV * 0.5;
        tr.pts.push(point(blobs[best], t, count));
        if (!quiet) tr.quiet = false;
        tr.endLarge = largeCount > 0;
        blobs[best].linked = true;
      }
    }
    // Any blob that did not continue a track may be the start of one.
    for (i = 0; i < count; i++) {
      if (!blobs[i].linked) {
        tracks.push({
          pts: [point(blobs[i], t, count)], vx: 0, quiet: quiet,
          startLarge: largeCount > 0, endLarge: largeCount > 0
        });
      }
    }
    if (tracks.length > MAX_TRACKS) {
      tracks.sort(function (a, b) { return b.pts.length - a.pts.length; });
      tracks.length = MAX_TRACKS;
    }
  }

  // ---------- is this track a delivery? ----------
  // Positions are fitted against the frame number, not the clock, because frame
  // timestamps on phones jitter by several milliseconds while the camera itself
  // captures at an even rate. Returns null or the reason for rejection as a string.
  function judge(tr, x0, x1) {
    var all = tr.pts, roiW = x1 - x0;
    if (all.length < 3) return all.length === 2 ? 'few' : null;
    if (all.length < MIN_POINTS) return 'few';
    var m = Math.min(all.length, MAX_FIT_POINTS), pts = all.slice(0, m), i, j;

    // Frame number of each point (a dropped frame leaves a gap).
    var dt = frameDt > 0 ? frameDt : (pts[m - 1].t - pts[0].t) / (m - 1);
    var ks = [0];
    for (i = 1; i < m; i++) {
      var step = Math.round((pts[i].t - pts[i - 1].t) / dt);
      ks.push(ks[i - 1] + (step < 1 ? 1 : step));
    }

    // Straight line at a steady speed: Theil-Sen (median of pairwise slopes), which
    // a stray point cannot pull off, then count the points that sit on the line.
    var slopes = [];
    for (i = 0; i < m; i++) for (j = i + 1; j < m; j++) slopes.push((pts[j].x - pts[i].x) / (ks[j] - ks[i]));
    var slope = median(slopes);                       // pixels per frame
    var offsets = [];
    for (i = 0; i < m; i++) offsets.push(pts[i].x - slope * ks[i]);
    var intercept = median(offsets);
    var span = abs(slope) * ks[m - 1];
    if (abs(all[all.length - 1].x - all[0].x) < roiW * 0.3) return 'short';
    var tol = m <= 5 ? Math.max(2, span * 0.015) : Math.max(3, span * 0.02);
    var inliers = 0;
    for (i = 0; i < m; i++) if (abs(pts[i].x - (slope * ks[i] + intercept)) <= tol) inliers++;
    if (inliers < MIN_POINTS || inliers < m * 0.8) return 'unsteady';

    // Same size and shape throughout; flicker and stray pieces vary.
    var hs = [], fills = [], others = 0, same = 0;
    for (i = 0; i < m; i++) { hs.push(pts[i].h); fills.push(pts[i].area / (pts[i].w * pts[i].h)); others += pts[i].others; }
    var mh = median(hs.slice());
    for (i = 0; i < m; i++) if (hs[i] >= mh * 0.5 - 1 && hs[i] <= mh * 1.6 + 1) same++;
    if (same < m * 0.7 || median(fills) < 0.3) return 'unsteady';

    // Rises and falls smoothly. One sudden turn upward is a bounce; a sudden
    // turn downward, or more than one turn, is not a ball.
    var prev = null, turns = 0, turnTol = abs(slope) * 0.6 + 3;
    for (i = 1; i < m; i++) {
      var vy = (pts[i].y - pts[i - 1].y) / (ks[i] - ks[i - 1]);
      if (prev !== null) {
        if (vy - prev > turnTol) return 'unsteady';
        if (prev - vy > turnTol) turns++;
      }
      prev = vy;
    }
    if (turns > 1) return 'unsteady';

    // With several small things moving at once, a "path" among them can be chance.
    // A short track is only trusted when it was nearly alone.
    if (others / m > (m <= 5 ? 1.5 : 2.5)) return 'crowded';

    // Comes into the picture from a side (or out of a bowler's hand) and leaves by
    // a side, the top or bottom, or into a person. Something that starts and stops
    // in open space is not a delivery.
    var first = all[0], last = all[all.length - 1], reach = abs(slope) * 2.5;
    var entered = tr.startLarge || (slope > 0 ? first.x - reach <= x0 : first.x + reach >= x1);
    var left = tr.endLarge || (slope > 0 ? last.x + reach >= x1 : last.x - reach <= x0) ||
      last.y < height * 0.08 || last.y > height * 0.92;
    if (!entered || !left) return 'middle';

    // Speed: pixels per frame over seconds per frame. The long-run frame interval
    // is steadier than this track's own timestamps, so use it when they agree.
    var own = (pts[m - 1].t - pts[0].t) / ks[m - 1];
    var perFrame = frameDt > 0 && abs(own - frameDt) < frameDt * 0.12 ? frameDt : own;

    // Ball diameter in pixels: a fast ball smears into a streak along its path, but
    // the streak is still one ball wide across the path, so the blob's height gives
    // the diameter once the tilt of the path is allowed for.
    var sizes = [];
    for (i = 0; i < m; i++) {
      var a = pts[i > 0 ? i - 1 : 0], b = pts[i < m - 1 ? i + 1 : m - 1];
      var ddx = abs(b.x - a.x), ddy = abs(b.y - a.y);
      var tilt = ddx > 0 ? ddy / ddx : 0;
      if (tilt > 0.6) continue;
      var d = (pts[i].h - pts[i].w * tilt) / (1 - tilt);
      sizes.push(d < 1 ? 1 : d);
    }

    tr.result = {
      pxPerSec: abs(slope) / perFrame,
      direction: slope > 0 ? 1 : -1,
      ballPx: sizes.length ? median(sizes) : 0,
      points: all,
      inliers: inliers
    };
    return null;
  }

  function collectFinished(t, x0, x1) {
    var alive = [], k;
    for (k = 0; k < tracks.length; k++) {
      var tr = tracks[k];
      if (t - tr.pts[tr.pts.length - 1].t <= EXPIRE_S) { alive.push(tr); continue; }
      var why = judge(tr, x0, x1);
      if (why) {
        // Only explain a miss when the scene was quiet, i.e. it probably was the ball.
        if (tr.quiet || why === 'crowded') lastMiss = why;
        continue;
      }
      if (tr.result && (!pending || tr.result.inliers > pending.inliers)) {
        pending = tr.result;
        pending.at = t;
      }
    }
    tracks = alive;
    if (!pending) return null;
    // Hold the reading while another track is still being followed: a short
    // stray track can end before the real one does.
    if (t - pending.at < 0.6) {
      for (k = 0; k < alive.length; k++) if (alive[k].pts.length >= 3) return null;
    }
    var event = pending;
    pending = null;
    return event;
  }

  /**
   * rgba: Uint8ClampedArray of a width x height frame. t: frame time in seconds.
   * x0/x1: pixel columns bounding the watched area. threshold: 0-255 brightness change.
   * Returns { blobs, large, busy, noisy, event, miss }.
   */
  function process(rgba, t, x0, x1, threshold) {
    var result = { blobs: [], large: 0, event: null, busy: false, noisy: false, miss: null };
    x0 = Math.max(0, Math.min(width, Math.round(x0)));
    x1 = Math.max(0, Math.min(width, Math.round(x1)));
    if (x1 < x0) { var tmp = x0; x0 = x1; x1 = tmp; }
    var roiW = x1 - x0;
    if (roiW < 8) return result;

    // Typical frame interval, ignoring gaps (pauses, dropped frames).
    if (lastFrameT >= 0) {
      var gap = t - lastFrameT;
      if (gap > 0 && gap < 0.2) {
        if (!frameDt) frameDt = gap;
        else if (gap < frameDt * 1.5) frameDt += (gap - frameDt) * 0.05;
        else if (gap > frameDt * 3) frameDt = 0;          // the frame rate changed; learn it again
      }
    }
    lastFrameT = t;

    var x, y, i, p, g, d;
    if (!hasBg) {
      for (i = 0, p = 0; i < n; i++, p += 4) {
        bg[i] = (rgba[p] * 77 + rgba[p + 1] * 150 + rgba[p + 2] * 29) >> 8;
      }
      hasBg = true;
      return result;
    }

    var changed = 0;
    for (y = 0; y < height; y++) {
      i = y * width + x0; p = i * 4;
      for (x = x0; x < x1; x++, i++, p += 4) {
        g = (rgba[p] * 77 + rgba[p + 1] * 150 + rgba[p + 2] * 29) >> 8;
        d = g - bg[i];
        bg[i] += d * BG_RATE;
        if (d < 0) d = -d;
        if (d > threshold) { mask[i] = 1; changed++; } else { mask[i] = 0; }
      }
    }

    if (changed > roiW * height * BUSY_FRACTION) {
      // The whole view changed (camera bumped, light switched). Start over.
      reset();
      result.busy = true;
      return result;
    }

    var blobs = findBlobs(x0, x1);
    result.blobs = blobs;
    result.large = largeCount;
    if (t < cooldownUntil) { tracks = []; return result; }
    lastMiss = null;
    if (blobs.length > MAX_SMALL) {
      // Many small things moving at once (shaky phone, leaves, rain): any path
      // found among them would be chance, so nothing is followed.
      tracks = []; pending = null;
      result.noisy = true;
      return result;
    }

    updateTracks(blobs, t);
    var event = collectFinished(t, x0, x1);
    if (event) {
      result.event = event;
      cooldownUntil = t + COOLDOWN_S;
      tracks = [];
    } else if (lastMiss && !pending) {
      result.miss = lastMiss;   // 'few' | 'short' | 'unsteady' | 'crowded' | 'middle'
    }
    return result;
  }

  return { process: process, reset: reset };
}
`;
