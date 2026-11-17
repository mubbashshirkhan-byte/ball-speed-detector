// Builds the web version (docs/index.html) from the same camera screen the app uses.
// GitHub Pages serves the docs/ folder, so the page can be opened in a phone browser.
// Usage: node scripts/build-web.mjs
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { DETECTOR_JS } from '../src/detector.ts';

const root = new URL('..', import.meta.url);
const src = readFileSync(new URL('src/page.ts', root), 'utf8');
const block = (name) => {
  const m = src.match(new RegExp('const ' + name + ' = String\\.raw`([\\s\\S]*?)`;'));
  if (!m) throw new Error('Could not find ' + name + ' in src/page.ts');
  return m[1];
};

const appJs = block('APP_JS');
for (const js of [DETECTOR_JS, appJs]) new Function(js); // fail the build on a syntax error

const html =
  '<!doctype html><html lang="en"><head><meta charset="utf-8">' +
  '<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover">' +
  '<meta name="apple-mobile-web-app-capable" content="yes">' +
  '<meta name="mobile-web-app-capable" content="yes">' +
  '<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">' +
  '<meta name="apple-mobile-web-app-title" content="Ball Speed">' +
  '<meta name="theme-color" content="#0B0F14">' +
  '<title>Ball Speed Detector</title><style>' + block('STYLE') + '</style></head><body>' +
  block('BODY') +
  '<script>' + DETECTOR_JS + '</script><script>' + appJs + '</script></body></html>\n';

mkdirSync(new URL('docs/', root), { recursive: true });
writeFileSync(new URL('docs/index.html', root), html);
writeFileSync(new URL('docs/.nojekyll', root), '');
console.log('Wrote docs/index.html (' + html.length + ' chars)');
