/**
 * Ball detector, shipped as plain JavaScript source because it runs inside the
 * camera WebView (see page.ts), not in the React Native runtime.
 * Keep it free of backticks and dollar-brace sequences.
 *
 * How it works, per camera frame:
 *  1. Compare each pixel between the two calibration lines with a slowly
 *     updating background image; pixels that changed are "motion".
 *  2. Group motion pixels into blobs and keep only small ones (a ball), which
 *     drops the bowler, batter and other large moving things.
 *  3. Link small blobs across frames into tracks that move fast and steadily
 *     in one horizontal direction.
 *  4. When a track ends, fit a straight line to position-vs-time. The slope is
 *     the ball's speed in pixels per second; the page converts it to real
 *     speed using the known distance between the two lines.
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

  var MIN_AREA = 3;
  var MAX_BLOB_W = Math.round(width * 0.16);            // allows for motion-blur streaks
  var MAX_BLOB_H = Math.max(10, Math.round(height * 0.1));
  var MIN_V = width * 0.25;                             // px/s; slower things are not a bowled ball
  var MAX_V = width * 8;
  var EXPIRE_S = 0.18;                                  // a track ends after this long unseen
  var COOLDOWN_S = 1.0;                                 // one reading per delivery
  var MIN_POINTS = 3;
  var MAX_FIT_POINTS = 14;
  var MAX_BLOBS = 40;
  var MAX_TRACKS = 30;
  var BG_RATE = 0.06;
  var BUSY_FRACTION = 0.12;                             // more motion than this = camera moved

  function reset() { hasBg = false; tracks = []; pending = null; }

  function median(a) {
    a.sort(function (p, q) { return p - q; });
    var h = a.length >> 1;
    return a.length % 2 ? a[h] : (a[h - 1] + a[h]) / 2;
  }

  // Theil-Sen fit: the median of all pairwise slopes. Unlike least squares it is
  // not pulled off by a stray point (e.g. a fragment of the bowler joining the track).
  function fit(pts) {
    var m = Math.min(pts.length, MAX_FIT_POINTS);
    var slopes = [], i, j;
    for (i = 0; i < m; i++) {
      for (j = i + 1; j < m; j++) {
        var dt = pts[j].t - pts[i].t;
        if (dt > 0) slopes.push((pts[j].x - pts[i].x) / dt);
      }
    }
    if (!slopes.length) return null;
    var slope = median(slopes);
    var offsets = [];
    for (i = 0; i < m; i++) offsets.push(pts[i].x - slope * pts[i].t);
    var intercept = median(offsets);
    var span = slope * (pts[m - 1].t - pts[0].t); if (span < 0) span = -span;
    var tol = Math.max(3, span * 0.02);
    var inliers = 0;
    for (i = 0; i < m; i++) {
      var r = pts[i].x - (slope * pts[i].t + intercept);
      if ((r < 0 ? -r : r) <= tol) inliers++;
    }
    return { slope: slope, inliers: inliers, count: m };
  }

  // The ball's diameter in pixels, used to work out the picture's scale without
  // any calibration. A fast ball smears into a streak along its path, but the
  // streak is still one ball wide across the path, so the blob's height gives the
  // diameter once the tilt of the path is allowed for.
  function ballSize(pts) {
    var m = Math.min(pts.length, MAX_FIT_POINTS), sizes = [];
    for (var i = 0; i < m; i++) {
      var a = pts[i > 0 ? i - 1 : 0], b = pts[i < m - 1 ? i + 1 : m - 1];
      var dx = b.x - a.x, dy = b.y - a.y;
      if (dx < 0) dx = -dx; if (dy < 0) dy = -dy;
      var tilt = dx > 0 ? dy / dx : 0;
      if (tilt > 0.6) continue;
      var d = (pts[i].h - pts[i].w * tilt) / (1 - tilt);
      sizes.push(d < 1 ? 1 : d);
    }
    return sizes.length ? median(sizes) : 0;
  }

  function findBlobs(x0, x1) {
    var blobs = [];
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
        if (area >= MIN_AREA && (maxX - minX + 1) <= MAX_BLOB_W && (maxY - minY + 1) <= MAX_BLOB_H
            && blobs.length < MAX_BLOBS) {
          blobs.push({ x: sumX / area, y: sumY / area, area: area, w: maxX - minX + 1, h: maxY - minY + 1 });
        }
      }
    }
    return blobs;
  }

  function updateTracks(blobs, t) {
    var i, k;
    for (k = 0; k < tracks.length; k++) {
      var tr = tracks[k];
      var last = tr.pts[tr.pts.length - 1];
      var dt = t - last.t;
      if (dt <= 0) continue;
      var best = -1, bestScore = Infinity, bestV = 0;
      for (i = 0; i < blobs.length; i++) {
        var b = blobs[i];
        var dx = b.x - last.x;
        var v = dx / dt, av = v < 0 ? -v : v;
        if (av < MIN_V || av > MAX_V) continue;
        var dy = b.y - last.y; if (dy < 0) dy = -dy;
        if (dy > (dx < 0 ? -dx : dx) * 0.9 + 6) continue;
        var score = dy / height;
        if (tr.pts.length >= 2) {
          if ((v > 0) !== (tr.vx > 0)) continue;
          var ratio = av / (tr.vx < 0 ? -tr.vx : tr.vx);
          if (ratio < 0.55 || ratio > 1.8) continue;
          score += ratio > 1 ? ratio - 1 : 1 - ratio;
        }
        if (score < bestScore) { bestScore = score; best = i; bestV = v; }
      }
      if (best >= 0) {
        tr.vx = tr.pts.length === 1 ? bestV : tr.vx * 0.5 + bestV * 0.5;
        tr.pts.push({ t: t, x: blobs[best].x, y: blobs[best].y, w: blobs[best].w, h: blobs[best].h });
        blobs[best].linked = true;
      }
    }
    // Any blob that did not continue a track may be the start of one.
    for (i = 0; i < blobs.length; i++) {
      if (!blobs[i].linked) {
        tracks.push({ pts: [{ t: t, x: blobs[i].x, y: blobs[i].y, w: blobs[i].w, h: blobs[i].h }], vx: 0 });
      }
    }
    if (tracks.length > MAX_TRACKS) {
      tracks.sort(function (a, b) { return b.pts.length - a.pts.length; });
      tracks.length = MAX_TRACKS;
    }
  }

  function collectFinished(t, roiW) {
    var alive = [], k;
    for (k = 0; k < tracks.length; k++) {
      var tr = tracks[k];
      var pts = tr.pts;
      if (t - pts[pts.length - 1].t <= EXPIRE_S) { alive.push(tr); continue; }
      if (pts.length < MIN_POINTS) continue;
      var span = pts[pts.length - 1].x - pts[0].x; if (span < 0) span = -span;
      if (span < roiW * 0.2) continue;
      var f = fit(pts);
      if (!f || f.inliers < MIN_POINTS || f.inliers < f.count * 0.7) continue;
      if (!pending || f.inliers > pending.inliers) {
        pending = {
          pxPerSec: f.slope < 0 ? -f.slope : f.slope,
          direction: f.slope > 0 ? 1 : -1,
          ballPx: ballSize(pts),
          points: pts,
          inliers: f.inliers,
          at: t
        };
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
   * x0/x1: pixel columns of the two calibration lines. threshold: 0-255 brightness change.
   */
  function process(rgba, t, x0, x1, threshold) {
    var result = { blobs: [], event: null, busy: false };
    x0 = Math.max(0, Math.min(width, Math.round(x0)));
    x1 = Math.max(0, Math.min(width, Math.round(x1)));
    if (x1 < x0) { var tmp = x0; x0 = x1; x1 = tmp; }
    var roiW = x1 - x0;
    if (roiW < 8) return result;

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
    if (t < cooldownUntil) { tracks = []; return result; }

    updateTracks(blobs, t);
    var event = collectFinished(t, roiW);
    if (event) {
      result.event = event;
      cooldownUntil = t + COOLDOWN_S;
      tracks = [];
    }
    return result;
  }

  return { process: process, reset: reset };
}
`;
