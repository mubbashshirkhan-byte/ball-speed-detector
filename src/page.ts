import { DETECTOR_JS } from './detector';

/**
 * The camera screen. It runs inside a WebView because that gives per-frame
 * access to camera pixels (getUserMedia + canvas) in Expo Go, with no native
 * build step. The page talks to the app through window.ReactNativeWebView:
 *   { type: 'speak', text }  -> the app says the text aloud.
 * The same page is published as the web version (scripts/build-web.mjs).
 * Keep the embedded code free of backticks and dollar-brace sequences.
 */
const STYLE = String.raw`
  :root {
    color-scheme: dark;
    --bg: #0B0F14; --card: #151B23; --text: #F2F5F8; --muted: #8A96A3;
    --accent: #2DD4A7; --danger: #F2645A; --border: #232B36; --line: #FFD24A;
  }
  * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
  [hidden] { display: none !important; }
  html, body { height: 100%; margin: 0; }
  body {
    background: var(--bg); color: var(--text);
    font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    font-size: 15px; overflow: hidden;
    padding: env(safe-area-inset-top, 0px) env(safe-area-inset-right, 0px)
             env(safe-area-inset-bottom, 0px) env(safe-area-inset-left, 0px);
    -webkit-user-select: none; user-select: none;
  }
  button, input, select, textarea { font: inherit; color: inherit; }
  button { cursor: pointer; }

  #app { height: 100%; display: flex; flex-direction: column; }
  #stage {
    flex: 1 1 42%; min-height: 0; min-width: 0; position: relative;
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
    flex: 1 1 58%; min-height: 0; overflow-y: auto; padding: 12px 14px 14px;
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
  #diag { color: var(--muted); font-size: 12px; margin-top: -6px; min-height: 1.3em; }

  .fields { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .field { min-width: 0; display: flex; flex-direction: column; gap: 4px; }
  .field.wide { grid-column: 1 / -1; }
  .field label, .field .label { color: var(--muted); font-size: 12.5px; }
  .field input[type="number"], .field input[type="text"], .field select {
    width: 100%; min-width: 0; height: 44px; border-radius: 10px; border: 1px solid var(--border);
    background: var(--card); color: var(--text); padding: 0 12px; font-size: 17px; font-weight: 600;
  }
  .field input { -webkit-user-select: text; user-select: text; }
  .field input[type="range"] { width: 100%; height: 32px; accent-color: var(--accent); }
  .inline { display: flex; gap: 8px; }
  .inline > :first-child { flex: 1; }
  .seg { display: flex; background: var(--card); border: 1px solid var(--border); border-radius: 10px; padding: 3px; height: 44px; }
  .seg button { flex: 1; border: 0; background: transparent; color: var(--muted); font-weight: 600; border-radius: 7px; }
  .seg button[aria-pressed="true"] { background: var(--accent); color: var(--bg); }

  .actions { display: flex; gap: 10px; }
  .btn { height: 50px; border-radius: 12px; border: 0; font-weight: 700; font-size: 16px; padding: 0 16px; }
  .btn:active { opacity: 0.7; }
  .btn.primary { background: var(--accent); color: var(--bg); }
  .btn.stop { background: var(--danger); color: var(--bg); }
  .btn.plain { background: var(--card); border: 1px solid var(--border); font-weight: 600; font-size: 15px; }
  .btn.small { height: 44px; }
  .actions .btn { flex: 1; }

  .rows { display: flex; flex-direction: column; gap: 6px; }
  .rows .row {
    display: flex; justify-content: space-between; align-items: center; gap: 8px; padding: 8px 12px;
    background: var(--card); border-radius: 10px; font-variant-numeric: tabular-nums;
  }
  .rows .row span { min-width: 0; }
  .rows .row small { display: block; color: var(--muted); font-size: 12px; }
  .rows .row b { flex: none; }
  .rows .row b.nb { color: var(--danger); }
  .rows .row b.ok { color: var(--accent); }
  .rows .empty { color: var(--muted); font-size: 13px; }

  /* Full-screen view: history */
  .view {
    position: fixed; inset: 0; z-index: 10; background: var(--bg); overflow-y: auto;
    padding: calc(env(safe-area-inset-top, 0px) + 16px) calc(env(safe-area-inset-right, 0px) + 16px)
             calc(env(safe-area-inset-bottom, 0px) + 16px) calc(env(safe-area-inset-left, 0px) + 16px);
  }
  .view-inner { max-width: 520px; margin: 0 auto; display: flex; flex-direction: column; gap: 14px; }
  .view h1 { font-size: 22px; margin: 0; }
  .view p { margin: 0; color: var(--muted); line-height: 1.5; }
  .view-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
  #summary {
    background: var(--card); border: 1px solid var(--border); border-radius: 12px;
    padding: 12px 14px; color: var(--text); line-height: 1.6;
  }

  @media (orientation: landscape) {
    #app { flex-direction: row; }
    #stage { flex: 1 1 62%; }
    #panel { flex: 0 0 38%; max-width: 380px; }
    #speed { font-size: 48px; }
  }
`;

const BODY = String.raw`
  <div id="app">
    <div id="stage">
      <div id="frame">
        <video id="video" playsinline muted autoplay></video>
        <canvas id="overlay"></canvas>
        <div id="hint"></div>
      </div>
      <div id="stage-msg">Starting camera…</div>
    </div>

    <div id="panel">
      <div id="readout">
        <div><span id="speed">--</span><span id="unit-label">km/h</span></div>
        <div id="verdict">Waiting</div>
      </div>

      <div id="status"><span id="dot"></span><span id="status-text">Starting camera…</span></div>
      <div id="diag"></div>

      <div class="fields">
        <div class="field wide">
          <label for="bowler">Bowler</label>
          <div class="inline">
            <select id="bowler"></select>
            <button class="btn plain small" id="btn-add-bowler" type="button">Add</button>
          </div>
        </div>
        <div class="field wide" id="bowler-add" hidden>
          <label for="bowler-name">New bowler's name</label>
          <div class="inline">
            <input id="bowler-name" type="text" maxlength="30" autocomplete="off">
            <button class="btn primary small" id="btn-save-bowler" type="button">Save</button>
          </div>
        </div>
        <div class="field">
          <label for="limit" id="limit-label">Max speed (km/h)</label>
          <input id="limit" type="number" inputmode="decimal" min="1" step="1">
        </div>
        <div class="field">
          <label for="pitch">Scale</label>
          <select id="pitch">
            <option value="auto">Automatic</option>
            <option value="standard">Crease lines · 17.68 m</option>
            <option value="custom">Lines · other distance</option>
          </select>
        </div>
        <div class="field wide" id="ball-field">
          <label for="ball">Ball (its size sets the scale automatically)</label>
          <select id="ball">
            <option value="cricket">Cricket ball · 7.2 cm</option>
            <option value="tennis">Tennis or tape ball · 6.7 cm</option>
          </select>
        </div>
        <div class="field wide" id="distance-field" hidden>
          <label for="distance">Distance between the two lines (m)</label>
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
        <button class="btn plain" id="btn-sound" type="button">Test sound</button>
        <button class="btn stop" id="btn-toggle" type="button">Pause</button>
      </div>

      <div class="rows" id="recent"></div>
      <button class="btn plain" id="btn-history" type="button">Full history</button>

    </div>
  </div>

  <div class="view" id="history-view" hidden>
    <div class="view-inner">
      <div class="view-head">
        <h1>History</h1>
        <button class="btn plain small" id="btn-history-close" type="button">Close</button>
      </div>
      <div class="field">
        <label for="history-bowler">Bowler</label>
        <select id="history-bowler"></select>
      </div>
      <div id="summary"></div>
      <div class="rows" id="history-rows"></div>
      <button class="btn plain" id="btn-history-delete" type="button">Delete these records</button>
    </div>
  </div>
`;

const APP_JS = String.raw`
(function () {
  var UNITS = { 'km/h': 3.6, 'mph': 2.236936 };
  var VERSION = 8;             // shown on screen, to tell which build a phone is running
  var PROC_MAX = 960;          // longest side of the frame the detector sees
  var KEY = 'ball-speed-settings-v3';
  var BALL_M = { cricket: 0.072, tennis: 0.067 };  // ball diameters in metres
  var MIN_BALL_PX = 4;         // below this the ball is too small to size reliably
  var RECORDS_KEY = 'ball-speed-records-v1';
  var MAX_RECORDS = 3000;

  // Popping crease to popping crease on a standard 22-yard pitch: the bowler
  // releases at one, the batsman stands at the other.
  var STANDARD_PITCH_M = 17.68;

  var settings = {
    // pitch: 'auto' = scale from the ball's size; 'standard' / 'custom' = scale from two lines
    limit: 100, unit: 'km/h', pitch: 'auto', ball: 'cricket', distance: 15, a: 0.1, b: 0.9, sens: 6,
    bowlers: ['Bowler 1'], bowler: 'Bowler 1'
  };
  function readJson(key) { try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch (e) { return null; } }
  function writeJson(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) {} }
  var saved = readJson(KEY);
  if (saved) for (var k in settings) if (saved[k] != null) settings[k] = saved[k];
  if (!settings.bowlers.length) settings.bowlers = ['Bowler 1'];
  if (settings.bowlers.indexOf(settings.bowler) < 0) settings.bowler = settings.bowlers[0];
  function save() { writeJson(KEY, settings); }
  if (!BALL_M[settings.ball]) settings.ball = 'cricket';
  if (['auto', 'standard', 'custom'].indexOf(settings.pitch) < 0) settings.pitch = 'auto';
  function isAuto() { return settings.pitch === 'auto'; }
  function lineDistance() { return settings.pitch === 'custom' ? settings.distance : STANDARD_PITCH_M; }

  // Every delivery: { t: time (ms), b: bowler, mps: speed, lim: limit in m/s, nb: no ball }
  var records = readJson(RECORDS_KEY);
  if (!Array.isArray(records)) records = [];
  function saveRecords() { writeJson(RECORDS_KEY, records); }

  var $ = function (id) { return document.getElementById(id); };
  var video = $('video'), overlay = $('overlay'), frameEl = $('frame'), stage = $('stage');
  var octx = overlay.getContext('2d');
  var proc = document.createElement('canvas');
  var pctx = proc.getContext('2d', { willReadFrequently: true });

  var detector = null, running = true, cameraOk = false, busy = false, loopGen = 0;
  var lastT = -1, fps = 0, blobs = [], lastTrack = null, lastTrackAt = 0;

  var pad = function (v) { return String(v).padStart(2, '0'); };
  function fmtTime(ms) { var d = new Date(ms); return pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds()); }
  function fmtDate(ms) { return new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }); }
  function fmtSpeed(mps) { return (mps * UNITS[settings.unit]).toFixed(1) + ' ' + settings.unit; }

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
    if (!sw || !sh) return;
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

  // ---------- overlay: crease lines, detected ball ----------
  function drawOverlay() {
    var w = overlay.width, h = overlay.height;
    if (!w) return;
    var dpr = window.devicePixelRatio || 1;
    octx.clearRect(0, 0, w, h);
    var xa = settings.a * w, xb = settings.b * w;
    var lo = Math.min(xa, xb), hi = Math.max(xa, xb);
    if (!isAuto()) {
      octx.fillStyle = 'rgba(0,0,0,0.45)';
      octx.fillRect(0, 0, lo, h);
      octx.fillRect(hi, 0, w - hi, h);
    }

    octx.lineWidth = 2 * dpr;
    octx.font = 'bold ' + (12 * dpr) + 'px system-ui, sans-serif';
    octx.textAlign = 'center';
    (isAuto() ? [] : [['Bowler', xa], ['Batsman', xb]]).forEach(function (l) {
      octx.strokeStyle = '#FFD24A';
      octx.beginPath(); octx.moveTo(l[1], 0); octx.lineTo(l[1], h); octx.stroke();
      // Name tag, kept inside the picture even when the line is near an edge.
      var tw = octx.measureText(l[0]).width + 12 * dpr, th = 20 * dpr;
      var tx = Math.max(2 * dpr, Math.min(w - tw - 2 * dpr, l[1] - tw / 2));
      octx.fillStyle = '#FFD24A';
      octx.fillRect(tx, 6 * dpr, tw, th);
      octx.fillStyle = '#0B0F14';
      octx.fillText(l[0], tx + tw / 2, 6 * dpr + 14 * dpr);
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
    if (isAuto()) return;
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
    else if (note && performance.now() < noteUntil) { dot.className = 'problem'; text = note; }
    else { dot.className = 'live'; text = 'Watching for the ball' + (fps ? ' · ' + Math.round(fps) + ' frames/s' : ''); }
    $('status-text').textContent = text;
    var btn = $('btn-toggle');
    btn.textContent = running ? 'Pause' : 'Start';
    btn.className = 'btn ' + (running ? 'stop' : 'primary');
  }

  function fillSelect(select, values, labels, current) {
    select.textContent = '';
    values.forEach(function (v, i) {
      var o = document.createElement('option');
      o.value = v; o.textContent = labels ? labels[i] : v;
      select.appendChild(o);
    });
    select.value = current;
  }

  function renderSettings() {
    $('limit').value = settings.limit;
    $('pitch').value = settings.pitch;
    $('distance-field').hidden = settings.pitch !== 'custom';
    $('ball-field').hidden = !isAuto();
    $('ball').value = settings.ball;
    $('hint').hidden = false;
    $('hint').textContent = isAuto()
      ? 'Stand the phone side-on to the ball, 2 to 4 m from its path, and keep it still'
      : 'Drag the two lines onto the bowler\'s and the batsman\'s crease';
    $('distance').value = settings.distance;
    $('sens').value = settings.sens;
    $('limit-label').textContent = 'Max speed (' + settings.unit + ')';
    $('unit-label').textContent = settings.unit;
    $('unit-kmh').setAttribute('aria-pressed', String(settings.unit === 'km/h'));
    $('unit-mph').setAttribute('aria-pressed', String(settings.unit === 'mph'));
    fillSelect($('bowler'), settings.bowlers, null, settings.bowler);
  }

  function recordRow(r, withDate) {
    var row = document.createElement('div'); row.className = 'row';
    var left = document.createElement('span');
    left.textContent = r.b + ' · ' + fmtSpeed(r.mps);
    var when = document.createElement('small');
    when.textContent = (withDate ? fmtDate(r.t) + ', ' : '') + fmtTime(r.t) +
      (withDate && r.lim ? ' · limit ' + fmtSpeed(r.lim) : '');
    left.appendChild(when);
    var right = document.createElement('b');
    right.className = r.nb ? 'nb' : 'ok';
    right.textContent = r.nb ? 'NO BALL' : 'Legal';
    row.appendChild(left); row.appendChild(right);
    return row;
  }
  function emptyRow(text) {
    var empty = document.createElement('div');
    empty.className = 'empty'; empty.textContent = text;
    return empty;
  }

  function renderRecent() {
    var box = $('recent');
    box.textContent = '';
    if (!records.length) { box.appendChild(emptyRow('Deliveries will be listed here.')); return; }
    records.slice(0, 5).forEach(function (r) { box.appendChild(recordRow(r, false)); });
  }

  var note = '', noteUntil = 0; // a short-lived message on the status line
  var useMediaTime = true, lastMediaTime = -1, stuckFrames = 0;
  var framesSeen = 0, smallSeen = 0, largeSeen = 0, busySeen = false; // for the diagnostics line
  var MISS_TEXT = {
    few: 'Something crossed too fast to measure (seen in only 2 frames). Move the phone further back.',
    short: 'Movement seen, but it did not travel far enough across the picture.',
    unsteady: 'Movement seen, but not along a steady path. Try again.'
  };
  var shownRecord = null; // the delivery on the big readout (this session only)
  function renderLast() {
    var d = shownRecord;
    $('readout').className = d && d.nb ? 'noball' : '';
    $('speed').textContent = d ? (d.mps * UNITS[settings.unit]).toFixed(1) : '--';
    $('verdict').className = d && !d.nb ? 'legal' : '';
    $('verdict').textContent = d ? (d.nb ? 'NO BALL' : 'Legal') : 'Waiting';
  }

  function onDelivery(event) {
    var mps;
    if (isAuto()) {
      // Scale from the ball itself: it is a known size, so its width in pixels
      // tells how many metres one pixel covers at the ball's distance.
      if (!(event.ballPx >= MIN_BALL_PX)) {
        note = 'The ball looks too small to measure. Move the phone closer to its path.';
        noteUntil = performance.now() + 6000;
        renderStatus();
        return;
      }
      mps = event.pxPerSec * BALL_M[settings.ball] / event.ballPx;
    } else {
      var gapPx = Math.abs(settings.b - settings.a) * proc.width;
      var metres = lineDistance();
      if (gapPx < 8 || !(metres > 0)) return;
      mps = event.pxPerSec * metres / gapPx;
    }
    note = '';
    var limitMps = settings.limit / UNITS[settings.unit];
    var record = { t: Date.now(), b: settings.bowler, mps: mps, lim: limitMps, nb: mps > limitMps };
    records.unshift(record);
    if (records.length > MAX_RECORDS) records.length = MAX_RECORDS;
    saveRecords();
    shownRecord = record;
    lastTrack = event.points; lastTrackAt = performance.now();
    if (record.nb) speak('No ball');
    renderLast(); renderRecent();
  }

  // ---------- history view ----------
  var ALL = '__all__';
  var historyFilter = ALL;
  function filteredRecords() {
    return historyFilter === ALL ? records : records.filter(function (r) { return r.b === historyFilter; });
  }
  function renderHistoryView() {
    var names = settings.bowlers.slice();
    records.forEach(function (r) { if (names.indexOf(r.b) < 0) names.push(r.b); });
    if (historyFilter !== ALL && names.indexOf(historyFilter) < 0) historyFilter = ALL;
    fillSelect($('history-bowler'), [ALL].concat(names), ['All bowlers'].concat(names), historyFilter);

    var list = filteredRecords();
    var summary = $('summary');
    if (!list.length) {
      summary.textContent = 'No deliveries recorded yet.';
    } else {
      var fastest = 0, total = 0, noBalls = 0;
      list.forEach(function (r) { if (r.mps > fastest) fastest = r.mps; total += r.mps; if (r.nb) noBalls++; });
      summary.textContent = '';
      [
        list.length + (list.length === 1 ? ' delivery' : ' deliveries'),
        'Fastest ' + fmtSpeed(fastest),
        'Average ' + fmtSpeed(total / list.length),
        noBalls + (noBalls === 1 ? ' no ball' : ' no balls')
      ].forEach(function (line) {
        var d = document.createElement('div'); d.textContent = line; summary.appendChild(d);
      });
    }

    var box = $('history-rows');
    box.textContent = '';
    list.slice(0, 500).forEach(function (r) { box.appendChild(recordRow(r, true)); });
    if (list.length > 500) box.appendChild(emptyRow('Showing the latest 500 of ' + list.length + '.'));
    var del = $('btn-history-delete');
    del.hidden = !list.length;
    del.textContent = 'Delete these records';
    del.className = 'btn plain';
    deleteArmed = false;
  }
  var deleteArmed = false;
  $('btn-history').addEventListener('click', function () {
    historyFilter = ALL;
    renderHistoryView();
    $('history-view').hidden = false;
  });
  $('btn-history-close').addEventListener('click', function () { $('history-view').hidden = true; });
  $('history-bowler').addEventListener('change', function () { historyFilter = this.value; renderHistoryView(); });
  $('btn-history-delete').addEventListener('click', function () {
    if (!deleteArmed) {
      // Two taps, so records are not lost to a slip of the thumb.
      deleteArmed = true;
      this.textContent = 'Tap again to delete ' + filteredRecords().length + ' records for good';
      this.className = 'btn stop';
      return;
    }
    records = historyFilter === ALL ? [] : records.filter(function (r) { return r.b !== historyFilter; });
    saveRecords();
    if (shownRecord && records.indexOf(shownRecord) < 0) shownRecord = null;
    renderHistoryView(); renderRecent(); renderLast();
  });

  // ---------- frame loop ----------
  function threshold() { return 46 - settings.sens * 4; } // sensitivity 1..10 -> 42..6

  function onFrame(gen, now, meta) {
    if (gen !== loopGen) return;
    schedule(gen);
    if (!cameraOk || !running || !detector || video.readyState < 2) return;
    // Frame time: the camera's own timestamp is the most exact, but some browsers
    // do not advance it for a live camera. If it stands still, use the clock instead.
    var t = now / 1000;
    if (useMediaTime && meta && typeof meta.mediaTime === 'number') {
      if (meta.mediaTime > lastMediaTime) { lastMediaTime = meta.mediaTime; stuckFrames = 0; t = meta.mediaTime; }
      else if (++stuckFrames >= 5) { useMediaTime = false; lastT = -1; fps = 0; detector.reset(); }
      else return;
    } else {
      useMediaTime = false;
    }
    if (t <= lastT) return;
    if (lastT >= 0) {
      var inst = 1 / (t - lastT);
      fps = fps ? fps * 0.9 + inst * 0.1 : inst;
    }
    lastT = t;
    pctx.drawImage(video, 0, 0, proc.width, proc.height);
    var img = pctx.getImageData(0, 0, proc.width, proc.height);
    var auto = isAuto();
    var r = detector.process(img.data, t, auto ? 0 : settings.a * proc.width, auto ? proc.width : settings.b * proc.width, threshold());
    blobs = r.blobs;
    framesSeen++;
    if (r.blobs.length) smallSeen = r.blobs.length;
    if (r.large) largeSeen = r.large;
    if (r.busy) busySeen = true;
    if (r.busy !== busy) { busy = r.busy; renderStatus(); }
    if (r.event) onDelivery(r.event);
    else if (r.miss) {
      note = MISS_TEXT[r.miss] || '';
      noteUntil = performance.now() + 6000;
      renderStatus();
    }
    drawOverlay();
  }
  function schedule(gen) {
    if (video.requestVideoFrameCallback) video.requestVideoFrameCallback(function (now, meta) { onFrame(gen, now, meta); });
    else requestAnimationFrame(function (now) { onFrame(gen, now, null); });
  }
  // Once a second: refresh the status and the "what the camera sees" line.
  setInterval(function () {
    if (cameraOk && running && !busy) renderStatus();
    var text = 'Version ' + VERSION;
    if (cameraOk) {
      text += ' · camera ' + video.videoWidth + '×' + video.videoHeight +
        ' · ' + (useMediaTime ? 'camera clock' : 'device clock');
      if (running) {
        text += framesSeen
          ? ' · moving now: ' + (busySeen ? 'the whole picture' : smallSeen + ' small, ' + largeSeen + ' large')
          : ' · no frames arriving';
      }
    }
    $('diag').textContent = text;
    framesSeen = 0; smallSeen = 0; largeSeen = 0; busySeen = false;
  }, 1000);

  // ---------- controls ----------
  $('limit').addEventListener('change', function () {
    var v = parseFloat(this.value);
    if (v > 0) { settings.limit = v; save(); } else { this.value = settings.limit; }
  });
  $('distance').addEventListener('change', function () {
    var v = parseFloat(this.value);
    if (v > 0) { settings.distance = v; save(); } else { this.value = settings.distance; }
  });
  $('pitch').addEventListener('change', function () {
    settings.pitch = ['auto', 'standard', 'custom'].indexOf(this.value) < 0 ? 'auto' : this.value;
    if (detector) detector.reset();
    save(); renderSettings(); drawOverlay();
  });
  $('ball').addEventListener('change', function () {
    settings.ball = BALL_M[this.value] ? this.value : 'cricket';
    save();
  });
  $('sens').addEventListener('input', function () { settings.sens = parseInt(this.value, 10) || 6; save(); });
  ['unit-kmh', 'unit-mph'].forEach(function (id) {
    $(id).addEventListener('click', function () {
      var next = this.getAttribute('data-unit');
      if (next === settings.unit) return;
      // Keep the limit meaning the same real speed when the unit changes.
      settings.limit = Math.round(settings.limit / UNITS[settings.unit] * UNITS[next]);
      settings.unit = next;
      save(); renderSettings(); renderLast(); renderRecent();
    });
  });
  $('bowler').addEventListener('change', function () { settings.bowler = this.value; save(); });
  $('btn-add-bowler').addEventListener('click', function () {
    var box = $('bowler-add');
    box.hidden = !box.hidden;
    if (!box.hidden) { $('bowler-name').value = ''; $('bowler-name').focus(); }
  });
  function saveBowler() {
    var name = $('bowler-name').value.replace(/\s+/g, ' ').trim();
    if (!name) return;
    var existing = settings.bowlers.filter(function (b) { return b.toLowerCase() === name.toLowerCase(); })[0];
    if (!existing) {
      // The starter name is only a placeholder until a real bowler is added.
      var starterUnused = settings.bowlers.length === 1 && settings.bowlers[0] === 'Bowler 1' &&
        !records.some(function (r) { return r.b === 'Bowler 1'; });
      if (starterUnused) settings.bowlers = [];
      settings.bowlers.push(name);
    }
    settings.bowler = existing || name;
    save(); renderSettings();
    $('bowler-add').hidden = true;
  }
  $('btn-save-bowler').addEventListener('click', saveBowler);
  $('bowler-name').addEventListener('keydown', function (e) { if (e.key === 'Enter') saveBowler(); });
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
    $('stage-msg').hidden = false;
    $('stage-msg').textContent = 'Starting camera…';
    frameEl.hidden = true;
    renderStatus();
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      cameraError('This device does not give the app access to the camera.');
      return;
    }
    var gen = ++loopGen;
    navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: { ideal: 'environment' },
        width: { ideal: 1280 }, height: { ideal: 720 },
        frameRate: { ideal: 60 }
      }
    }).then(function (stream) {
      if (gen !== loopGen) { stream.getTracks().forEach(function (t) { t.stop(); }); return; }
      video.srcObject = stream;
      return video.play().then(function () {
        if (gen !== loopGen) return;
        cameraOk = true;
        if (detector) detector.reset();
        $('stage-msg').hidden = true;
        frameEl.hidden = false;
        layout(); renderStatus(); schedule(gen);
      });
    }).catch(function (err) {
      if (gen !== loopGen) return;
      var denied = err && (err.name === 'NotAllowedError' || err.name === 'SecurityError');
      cameraError(denied
        ? 'Camera permission was refused. Allow camera access for this app in your phone settings, then reopen it.'
        : 'Could not start the camera' + (err && err.message ? ': ' + err.message : '.'));
    });
  }

  // ---------- start ----------
  frameEl.hidden = true;
  renderSettings(); renderLast(); renderRecent(); renderStatus();
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
