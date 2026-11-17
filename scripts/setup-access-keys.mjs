// One-time setup for sign-in. Creates the key pair that signs access codes:
//  - access-private-key.json  (secret, git-ignored) used to issue codes
//  - access-admin.html        (secret, git-ignored) a page you open on this PC to issue codes
//  - the public key is written into src/page.ts so the app can check codes
// Running it again with --force replaces the keys, which cancels every code issued so far.
// Usage: node scripts/setup-access-keys.mjs [--force]
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { APP_URL, KEY_ALGORITHM, PRIVATE_KEY_FILE, ROOT } from './access-lib.mjs';

let privateJwk;
let publicJwk;
if (existsSync(PRIVATE_KEY_FILE) && !process.argv.includes('--force')) {
  privateJwk = JSON.parse(readFileSync(PRIVATE_KEY_FILE, 'utf8'));
  console.log('Keeping the existing key (use --force to replace it and cancel all issued codes).');
} else {
  const pair = await crypto.subtle.generateKey(KEY_ALGORITHM, true, ['sign', 'verify']);
  privateJwk = await crypto.subtle.exportKey('jwk', pair.privateKey);
  writeFileSync(PRIVATE_KEY_FILE, JSON.stringify(privateJwk, null, 2) + '\n');
  console.log('Created access-private-key.json. Keep it secret and keep a backup.');
}
publicJwk = { kty: 'EC', crv: 'P-256', x: privateJwk.x, y: privateJwk.y };

// Put the public key into the app.
const pageFile = new URL('src/page.ts', ROOT);
const page = readFileSync(pageFile, 'utf8');
const marker = /var ACCESS_PUBLIC_KEY = .*; \/\/ access-public-key/;
if (!marker.test(page)) throw new Error('Could not find the access-public-key line in src/page.ts');
writeFileSync(pageFile, page.replace(marker, 'var ACCESS_PUBLIC_KEY = ' + JSON.stringify(publicJwk) + '; // access-public-key'));
console.log('Wrote the public key into src/page.ts.');

// Build the local page for issuing codes.
const admin = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Issue access - Ball Speed Detector</title>
<style>
  body { font-family: system-ui, "Segoe UI", sans-serif; background: #0B0F14; color: #F2F5F8; margin: 0; padding: 24px 16px; }
  main { max-width: 560px; margin: 0 auto; display: flex; flex-direction: column; gap: 16px; }
  h1 { font-size: 22px; margin: 0; }
  p { margin: 0; color: #8A96A3; line-height: 1.5; }
  label { display: block; color: #8A96A3; font-size: 13px; margin-bottom: 4px; }
  input, select, textarea, button { font: inherit; color: inherit; }
  input, select, textarea { width: 100%; box-sizing: border-box; background: #151B23; border: 1px solid #232B36; border-radius: 10px; padding: 10px 12px; }
  textarea { min-height: 96px; word-break: break-all; resize: vertical; }
  .row { display: flex; gap: 10px; } .row > div { flex: 1; }
  button { background: #2DD4A7; color: #0B0F14; border: 0; border-radius: 10px; padding: 12px 18px; font-weight: 700; cursor: pointer; }
  button.plain { background: #151B23; color: #F2F5F8; border: 1px solid #232B36; font-weight: 600; }
  #out { display: flex; flex-direction: column; gap: 12px; }
  .warn { color: #F2645A; }
</style></head><body><main>
  <h1>Issue access</h1>
  <p>Creates a sign-in link for one person that stops working after the time you choose. <span class="warn">Keep this file private: anyone who has it can issue access.</span></p>
  <div><label for="name">Person's name</label><input id="name" maxlength="40" autocomplete="off"></div>
  <div class="row">
    <div><label for="amount">Access lasts</label><input id="amount" type="number" min="1" step="1" value="30"></div>
    <div><label for="unit">&nbsp;</label><select id="unit"><option value="86400000">days</option><option value="3600000">hours</option><option value="60000">minutes</option></select></div>
  </div>
  <button id="make" type="button">Create link</button>
  <div id="out" hidden>
    <p id="expires"></p>
    <div><label for="link">Link to send (opens the app signed in)</label><textarea id="link" readonly></textarea></div>
    <button class="plain" id="copy-link" type="button">Copy link</button>
    <div><label for="code">Code only (to paste on the sign-in screen)</label><textarea id="code" readonly></textarea></div>
    <button class="plain" id="copy-code" type="button">Copy code</button>
  </div>
  <p id="error" class="warn"></p>
</main>
<script>
(function () {
  var PRIVATE_KEY = ${JSON.stringify(privateJwk)};
  var APP_URL = ${JSON.stringify(APP_URL)};
  var $ = function (id) { return document.getElementById(id); };
  function b64u(bytes) {
    var bin = ''; for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin).replace(/\\+/g, '-').replace(/\\//g, '_').replace(/=+$/, '');
  }
  $('make').addEventListener('click', function () {
    $('error').textContent = '';
    var name = $('name').value.replace(/\\s+/g, ' ').trim();
    var amount = parseFloat($('amount').value);
    if (!name) { $('error').textContent = "Enter the person's name."; return; }
    if (!(amount > 0)) { $('error').textContent = 'Enter how long the access should last.'; return; }
    var expires = Date.now() + amount * parseInt($('unit').value, 10);
    var payload = new TextEncoder().encode(JSON.stringify({ n: name, e: Math.floor(expires / 1000) }));
    crypto.subtle.importKey('jwk', PRIVATE_KEY, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign'])
      .then(function (key) { return crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, payload); })
      .then(function (sig) {
        var code = b64u(payload) + '.' + b64u(new Uint8Array(sig));
        $('code').value = code;
        $('link').value = APP_URL + '#k=' + code;
        $('expires').textContent = 'Access for ' + name + ' ends on ' + new Date(expires).toLocaleString() + '.';
        $('out').hidden = false;
      })
      .catch(function (e) { $('error').textContent = 'Could not create the link: ' + e.message; });
  });
  function copier(button, field) {
    $(button).addEventListener('click', function () {
      var el = $(field), btn = this, label = btn.textContent;
      el.select();
      (navigator.clipboard ? navigator.clipboard.writeText(el.value) : Promise.reject())
        .catch(function () { document.execCommand('copy'); })
        .then(function () { btn.textContent = 'Copied'; setTimeout(function () { btn.textContent = label; }, 1500); });
    });
  }
  copier('copy-link', 'link'); copier('copy-code', 'code');
})();
</script></body></html>
`;
writeFileSync(new URL('access-admin.html', ROOT), admin);
console.log('Wrote access-admin.html. Open it in a browser on this PC to issue access.');
