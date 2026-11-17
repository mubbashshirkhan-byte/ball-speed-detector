import { DETECTOR_JS } from './detector';

/**
 * The camera screen. It runs inside a WebView because that gives per-frame
 * access to camera pixels (getUserMedia + canvas) in Expo Go, with no native
 * build step. The page talks to the app through window.ReactNativeWebView:
 *   { type: 'speak', text }  -> the app says the text aloud.
 * Keep the embedded code free of backticks and dollar-brace sequences.
 */
const STYLE = String.raw`
  :root {
    color-scheme: dark;
    --bg: #0B0F14; --card: #151B23; --text: #F2F5F8; --muted: #8A96A3;
    --accent: #2DD4A7; --danger: #F2645A; --border: #232B36; --line: #FFD24A;
  }
  * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
  html, body { height: 100%; margin: 0; }
  body {
    background: var(--bg); color: var(--text);
    font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    font-size: 15px; display: flex; flex-direction: column; overflow: hidden;
    padding: env(safe-area-inset-top, 0px) env(safe-area-inset-right, 0px)
             env(safe-area-inset-bottom, 0px) env(safe-area-inset-left, 0px);
    -webkit-user-select: none; user-select: none;
  }
  button, input { font: inherit; color: inherit; }
  button { cursor: pointer; }

  #stage {
    flex: 1 1 45%; min-height: 0; min-width: 0; position: relative;
    display: flex; align-items: center; justify-content: center; background: #000;
  }
  #frame { position: relative; width: 100%; height: 100%; }
  #video { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: fill; }
  #overlay { position: absolute; inset: 0; width: 100%; height: 100%; touch-action: none; }
  #stage-msg {
    position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
    padding: 24px; text-align: center; color: var(--muted); line-height: 1.5;
  }
  #hint {
    position: absolute; left: 8px; right: 8px; bottom: 6px; text-align: center;
    font-size: 12px; color: #fff; text-shadow: 0 1px 3px #000; pointer-events: none;
  }

  #panel {
    flex: 1 1 55%; min-height: 0; overflow-y: auto; padding: 12px 14px 14px;
    display: flex; flex-direction: column; gap: 12px;
  }
  #readout {
    display: flex; align-items: center; justify-content: space-between; gap: 12px;
    background: var(--card); border: 1px solid var(--border); border-radius: 14px; padding: 10px 14px;
  }
  #readout.noball { background: var(--danger); border-color: var(--danger); color: #1A0503; }
  #readout.noball #unit-label, #readout.noball #verdict { color: #1A0503; }
  #speed { font-size: 60px; font-weight: 800; line-height: 1; font-variant-numeric: tabular-nums; }
  #unit-label { color: var(--muted); font-size: 16px; font-weight: 600; margin-left: 6px; }
  #verdict { font-size: 20px; font-weight: 800; text-align: right; color: var(--muted); }
  #verdict.legal { color: var(--accent); }

  #status { display: flex; align-items: center; gap: 8px; color: var(--muted); font-size: 13px; }
  #dot { flex: none; width: 8px; height: 8px; border-radius: 50%; background: var(--muted); }
  #dot.live { background: var(--accent); }
  #dot.problem { background: var(--danger); }

  .fields { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .field { min-width: 0; display: flex; flex-direction: column; gap: 4px; }
  .field.wide { grid-column: 1 / -1; }
  .field label, .field .label { color: var(--muted); font-size: 12.5px; }
  .field input[type="number"] {
    width: 100%; height: 44px; border-radius: 10px; border: 1px solid var(--border);
    background: var(--card); padding: 0 12px; font-size: 18px; font-weight: 700;
    -webkit-user-select: text; user-select: text;
  }
  .field input[type="range"] { width: 100%; height: 32px; accent-color: var(--accent); }
  .seg { display: flex; background: var(--card); border: 1px solid var(--border); border-radius: 10px; padding: 3px; height: 44px; }
  .seg button { flex: 1; border: 0; background: transparent; color: var(--muted); font-weight: 600; border-radius: 7px; }
  .seg button[aria-pressed="true"] { background: var(--accent); color: var(--bg); }

  .actions { display: flex; gap: 10px; }
  .btn { height: 50px; border-radius: 12px; border: 0; font-weight: 700; font-size: 16px; }
  .btn:active { opacity: 0.7; }
  #btn-toggle { flex: 1; background: var(--accent); color: var(--bg); }
  #btn-toggle.stop { background: var(--danger); }
  #btn-sound { flex: 0.8; background: var(--card); border: 1px solid var(--border); font-weight: 600; font-size: 15px; }

  #history { display: flex; flex-direction: column; gap: 6px; }
  #history .row {
    display: flex; justify-content: space-between; gap: 8px; padding: 8px 12px;
    background: var(--card); border-radius: 10px; font-variant-numeric: tabular-nums;
  }
  #history .row b.nb { color: var(--danger); }
  #history .row b.ok { color: var(--accent); }
  #history .empty { color: var(--muted); font-size: 13px; }

  @media (orientation: landscape) {
    body { flex-direction: row; }
    #stage { flex: 1 1 62%; }
    #panel { flex: 0 0 38%; max-width: 380px; }
    #speed { font-size: 48px; }
  }
`;

const BODY = String.raw`
  <div id="stage">
    <div id="frame">
      <video id="video" playsinline muted autoplay></video>
      <canvas id="overlay"></canvas>
      <div id="hint">Drag lines A and B onto two marks on the pitch</div>
    </div>
    <div id="stage-msg">Starting camera…</div>
  </div>

  <div id="panel">
    <div id="readout">
      <div><span id="speed">--</span><span id="unit-label">km/h</span></div>
      <div id="verdict">Waiting</div>
    </div>

    <div id="status"><span id="dot"></span><span id="status-text">Starting camera…</span></div>

    <div class="fields">
      <div class="field">
        <label for="limit" id="limit-label">Max speed (km/h)</label>
        <input id="limit" type="number" inputmode="decimal" min="1" step="1">
      </div>
      <div class="field">
        <label for="distance">A to B distance (m)</label>
        <input id="distance" type="number" inputmode="decimal" min="0.5" step="0.1">
      </div>
      <div class="field">
        <span class="label">Unit</span>
        <div class="seg" role="group" aria-label="Speed unit">
          <button id="unit-kmh" type="button" data-unit="km/h">km/h</button>
          <button id="unit-mph" type="button" data-unit="mph">mph</button>
        </div>
      </div>
      <div class="field">
        <label for="sens">Sensitivity</label>
        <input id="sens" type="range" min="1" max="10" step="1">
      </div>
    </div>

    <div class="actions">
      <button class="btn" id="btn-sound" type="button">Test sound</button>
      <button class="btn stop" id="btn-toggle" type="button">Pause</button>
    </div>

    <div id="history"><div class="empty">Deliveries will be listed here.</div></div>
  </div>
`;

const APP_JS = String.raw`
(function () {
  var UNITS = { 'km/h': 3.6, 'mph': 2.236936 };
  var PROC_MAX = 640;          // longest side of the frame the detector sees
  var KEY = 'ball-speed-settings-v1';

  var settings = { limit: 100, unit: 'km/h', distance: 10, a: 0.2, b: 0.8, sens: 6 };
  try {
    var saved = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (saved) for (var k in settings) if (saved[k] != null) settings[k] = saved[k];
  } catch (e) {}
  function save() { try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch (e) {} }

  var $ = function (id) { return document.getElementById(id); };
  var video = $('video'), overlay = $('overlay'), frameEl = $('frame'), stage = $('stage');
  var octx = overlay.getContext('2d');
  var proc = document.createElement('canvas');
  var pctx = proc.getContext('2d', { willReadFrequently: true });

  var detector = null, running = true, cameraOk = false, busy = false;
  var lastT = -1, fps = 0, blobs = [], lastTrack = null, lastTrackAt = 0;
  var history = [];

  function speak(text) {
    if (window.ReactNativeWebView) {
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'speak', text: text }));
    } else if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
      var u = new SpeechSynthesisUtterance(text);
      u.lang = 'en'; u.volume = 1;
      window.speechSynthesis.speak(u);
    }
  }
  // In a browser (the web version), iOS Safari only lets a page speak after the
  // person has touched it once, so unlock the voice on the first touch.
  if (!window.ReactNativeWebView && window.speechSynthesis) {
    var unlock = function () {
      document.removeEventListener('pointerdown', unlock, true);
      var u = new SpeechSynthesisUtterance(' ');
      u.volume = 0;
      window.speechSynthesis.speak(u);
    };
    document.addEventListener('pointerdown', unlock, true);
  }

  // ---------- layout: fit the video frame inside the stage ----------
  function layout() {
    var vw = video.videoWidth, vh = video.videoHeight;
    if (!vw || !vh) return;
    var sw = stage.clientWidth, sh = stage.clientHeight;
    var scale = Math.min(sw / vw, sh / vh);
    var w = Math.floor(vw * scale), h = Math.floor(vh * scale);
    frameEl.style.width = w + 'px';
    frameEl.style.height = h + 'px';
    var dpr = window.devicePixelRatio || 1;
    overlay.width = Math.round(w * dpr);
    overlay.height = Math.round(h * dpr);

    var ps = PROC_MAX / Math.max(vw, vh);
    var pw = Math.round(vw * ps), ph = Math.round(vh * ps);
    if (proc.width !== pw || proc.height !== ph) {
      proc.width = pw; proc.height = ph;
      detector = createDetector(pw, ph);
    }
    drawOverlay();
  }
  window.addEventListener('resize', layout);
  video.addEventListener('loadedmetadata', layout);
  video.addEventListener('resize', layout);

  // ---------- overlay: calibration lines, detected ball ----------
  function drawOverlay() {
    var w = overlay.width, h = overlay.height;
    if (!w) return;
    var dpr = window.devicePixelRatio || 1;
    octx.clearRect(0, 0, w, h);
    var xa = settings.a * w, xb = settings.b * w;
    var lo = Math.min(xa, xb), hi = Math.max(xa, xb);
    octx.fillStyle = 'rgba(0,0,0,0.45)';
    octx.fillRect(0, 0, lo, h);
    octx.fillRect(hi, 0, w - hi, h);

    octx.lineWidth = 2 * dpr;
    octx.font = 'bold ' + (14 * dpr) + 'px system-ui, sans-serif';
    octx.textAlign = 'center';
    [['A', xa], ['B', xb]].forEach(function (l) {
      octx.strokeStyle = '#FFD24A';
      octx.beginPath(); octx.moveTo(l[1], 0); octx.lineTo(l[1], h); octx.stroke();
      octx.fillStyle = '#FFD24A';
      octx.beginPath(); octx.arc(l[1], 18 * dpr, 13 * dpr, 0, Math.PI * 2); octx.fill();
      octx.fillStyle = '#0B0F14';
      octx.fillText(l[0], l[1], 23 * dpr);
    });

    var sx = w / proc.width, sy = h / proc.height, i;
    octx.strokeStyle = '#2DD4A7';
    for (i = 0; i < blobs.length; i++) {
      octx.beginPath(); octx.arc(blobs[i].x * sx, blobs[i].y * sy, 6 * dpr, 0, Math.PI * 2); octx.stroke();
    }
    if (lastTrack && performance.now() - lastTrackAt < 4000) {
      octx.strokeStyle = '#FFFFFF';
      octx.lineWidth = 3 * dpr;
      octx.beginPath();
      for (i = 0; i < lastTrack.length; i++) {
        var px = lastTrack[i].x * sx, py = lastTrack[i].y * sy;
        if (i === 0) octx.moveTo(px, py); else octx.lineTo(px, py);
      }
      octx.stroke();
    }
  }

  var dragging = null;
  function pointerX(e) {
    var r = overlay.getBoundingClientRect();
    return Math.max(0.02, Math.min(0.98, (e.clientX - r.left) / r.width));
  }
  overlay.addEventListener('pointerdown', function (e) {
    var x = pointerX(e);
    dragging = Math.abs(x - settings.a) <= Math.abs(x - settings.b) ? 'a' : 'b';
    settings[dragging] = x;
    overlay.setPointerCapture(e.pointerId);
    $('hint').hidden = true;
    drawOverlay();
  });
  overlay.addEventListener('pointermove', function (e) {
    if (!dragging) return;
    settings[dragging] = pointerX(e);
    drawOverlay();
  });
  function endDrag() {
    if (!dragging) return;
    dragging = null;
    if (detector) detector.reset();
    save();
  }
  overlay.addEventListener('pointerup', endDrag);
  overlay.addEventListener('pointercancel', endDrag);

  // ---------- readout ----------
  function renderStatus() {
    var dot = $('dot'), text;
    if (!cameraOk) { dot.className = 'problem'; text = $('stage-msg').textContent; }
    else if (!running) { dot.className = ''; text = 'Paused'; }
    else if (busy) { dot.className = 'problem'; text = 'Camera is moving. Keep the phone still.'; }
    else { dot.className = 'live'; text = 'Watching for the ball' + (fps ? ' · ' + Math.round(fps) + ' frames/s' : ''); }
    $('status-text').textContent = text;
    var btn = $('btn-toggle');
    btn.textContent = running ? 'Pause' : 'Start';
    btn.className = 'btn' + (running ? ' stop' : '');
  }

  function renderSettings() {
    $('limit').value = settings.limit;
    $('distance').value = settings.distance;
    $('sens').value = settings.sens;
    $('limit-label').textContent = 'Max speed (' + settings.unit + ')';
    $('unit-label').textContent = settings.unit;
    $('unit-kmh').setAttribute('aria-pressed', String(settings.unit === 'km/h'));
    $('unit-mph').setAttribute('aria-pressed', String(settings.unit === 'mph'));
  }

  function renderHistory() {
    var box = $('history');
    box.textContent = '';
    if (!history.length) {
      var empty = document.createElement('div');
      empty.className = 'empty';
      empty.textContent = 'Deliveries will be listed here.';
      box.appendChild(empty);
      return;
    }
    history.forEach(function (d) {
      var row = document.createElement('div'); row.className = 'row';
      var left = document.createElement('span');
      left.textContent = d.time + '  ·  ' + (d.mps * UNITS[settings.unit]).toFixed(1) + ' ' + settings.unit;
      var right = document.createElement('b');
      right.className = d.noBall ? 'nb' : 'ok';
      right.textContent = d.noBall ? 'NO BALL' : 'Legal';
      row.appendChild(left); row.appendChild(right);
      box.appendChild(row);
    });
  }

  function renderLast() {
    var d = history[0];
    $('readout').className = d && d.noBall ? 'noball' : '';
    $('speed').textContent = d ? (d.mps * UNITS[settings.unit]).toFixed(1) : '--';
    $('verdict').className = d && !d.noBall ? 'legal' : '';
    $('verdict').textContent = d ? (d.noBall ? 'NO BALL' : 'Legal') : 'Waiting';
  }

  function onDelivery(event) {
    var gapPx = Math.abs(settings.b - settings.a) * proc.width;
    if (gapPx < 8 || !(settings.distance > 0)) return;
    var mps = event.pxPerSec * settings.distance / gapPx;
    var shown = mps * UNITS[settings.unit];
    var noBall = shown > settings.limit;
    var now = new Date();
    var pad = function (v) { return String(v).padStart(2, '0'); };
    history.unshift({
      mps: mps, noBall: noBall,
      time: pad(now.getHours()) + ':' + pad(now.getMinutes()) + ':' + pad(now.getSeconds())
    });
    if (history.length > 8) history.pop();
    lastTrack = event.points; lastTrackAt = performance.now();
    if (noBall) speak('No ball');
    renderLast(); renderHistory();
  }

  // ---------- frame loop ----------
  function threshold() { return 46 - settings.sens * 4; } // sensitivity 1..10 -> 42..6

  function onFrame(now, meta) {
    schedule();
    if (!cameraOk || !running || !detector || video.readyState < 2) return;
    var t = meta && typeof meta.mediaTime === 'number' ? meta.mediaTime : now / 1000;
    if (t <= lastT) return;
    if (lastT >= 0) {
      var inst = 1 / (t - lastT);
      fps = fps ? fps * 0.9 + inst * 0.1 : inst;
    }
    lastT = t;
    pctx.drawImage(video, 0, 0, proc.width, proc.height);
    var img = pctx.getImageData(0, 0, proc.width, proc.height);
    var r = detector.process(img.data, t, settings.a * proc.width, settings.b * proc.width, threshold());
    blobs = r.blobs;
    if (r.busy !== busy) { busy = r.busy; renderStatus(); }
    if (r.event) onDelivery(r.event);
    drawOverlay();
  }
  function schedule() {
    if (video.requestVideoFrameCallback) video.requestVideoFrameCallback(onFrame);
    else requestAnimationFrame(function (now) { onFrame(now, null); });
  }
  setInterval(function () { if (cameraOk && running && !busy) renderStatus(); }, 1000);

  // ---------- controls ----------
  $('limit').addEventListener('change', function () {
    var v = parseFloat(this.value);
    if (v > 0) { settings.limit = v; save(); } else { this.value = settings.limit; }
  });
  $('distance').addEventListener('change', function () {
    var v = parseFloat(this.value);
    if (v > 0) { settings.distance = v; save(); } else { this.value = settings.distance; }
  });
  $('sens').addEventListener('input', function () { settings.sens = parseInt(this.value, 10) || 6; save(); });
  ['unit-kmh', 'unit-mph'].forEach(function (id) {
    $(id).addEventListener('click', function () {
      var next = this.getAttribute('data-unit');
      if (next === settings.unit) return;
      // Keep the limit meaning the same real speed when the unit changes.
      settings.limit = Math.round(settings.limit / UNITS[settings.unit] * UNITS[next]);
      settings.unit = next;
      save(); renderSettings(); renderLast(); renderHistory();
    });
  });
  $('btn-toggle').addEventListener('click', function () {
    running = !running;
    blobs = []; lastT = -1; fps = 0;
    if (detector) detector.reset();
    renderStatus(); drawOverlay();
  });
  $('btn-sound').addEventListener('click', function () { speak('No ball'); });

  // ---------- camera ----------
  function cameraError(message) {
    cameraOk = false;
    $('stage-msg').hidden = false;
    $('stage-msg').textContent = message;
    frameEl.hidden = true;
    renderStatus();
  }

  function startCamera() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      cameraError('This device does not give the app access to the camera.');
      return;
    }
    navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: { ideal: 'environment' },
        width: { ideal: 1280 }, height: { ideal: 720 },
        frameRate: { ideal: 60 }
      }
    }).then(function (stream) {
      video.srcObject = stream;
      return video.play();
    }).then(function () {
      cameraOk = true;
      $('stage-msg').hidden = true;
      frameEl.hidden = false;
      layout(); renderStatus(); schedule();
    }).catch(function (err) {
      var denied = err && (err.name === 'NotAllowedError' || err.name === 'SecurityError');
      cameraError(denied
        ? 'Camera permission was refused. Allow camera access for this app in your phone settings, then reopen it.'
        : 'Could not start the camera' + (err && err.message ? ': ' + err.message : '.'));
    });
  }

  frameEl.hidden = true;
  renderSettings(); renderLast(); renderHistory(); renderStatus();
  startCamera();
})();
`;

export const PAGE_HTML =
  '<!doctype html><html><head><meta charset="utf-8">' +
  '<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">' +
  '<title>Ball Speed</title><style>' +
  STYLE +
  '</style></head><body>' +
  BODY +
  '<script>' +
  DETECTOR_JS +
  '</script><script>' +
  APP_JS +
  '</script></body></html>';
