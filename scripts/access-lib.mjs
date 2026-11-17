// Shared helpers for issuing time-limited access codes.
import { existsSync, readFileSync } from 'node:fs';

export const ROOT = new URL('..', import.meta.url);
export const PRIVATE_KEY_FILE = new URL('access-private-key.json', ROOT);
export const APP_URL = 'https://mubbashshirkhan-byte.github.io/ball-speed-detector/';
export const KEY_ALGORITHM = { name: 'ECDSA', namedCurve: 'P-256' };

const b64u = (bytes) => Buffer.from(bytes).toString('base64url');

export function loadPrivateJwk() {
  if (!existsSync(PRIVATE_KEY_FILE)) {
    throw new Error('No access-private-key.json found. Run: node scripts/setup-access-keys.mjs');
  }
  return JSON.parse(readFileSync(PRIVATE_KEY_FILE, 'utf8'));
}

/** Returns "<payload>.<signature>" for a name and an expiry time (ms since 1970). */
export async function makeCode(privateJwk, name, expiresAtMs) {
  const key = await crypto.subtle.importKey('jwk', privateJwk, KEY_ALGORITHM, false, ['sign']);
  const payload = new TextEncoder().encode(JSON.stringify({ n: name, e: Math.floor(expiresAtMs / 1000) }));
  const signature = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, payload);
  return b64u(payload) + '.' + b64u(new Uint8Array(signature));
}

/** "30" or "30d" = 30 days, "12h" = 12 hours, "45m" = 45 minutes. Returns milliseconds. */
export function parseDuration(text) {
  const m = /^(\d+(?:\.\d+)?)\s*([mhd]?)$/i.exec(String(text).trim());
  if (!m) throw new Error('Duration must look like 30d, 12h or 45m.');
  const unit = { m: 60e3, h: 3600e3, d: 86400e3 }[(m[2] || 'd').toLowerCase()];
  return Number(m[1]) * unit;
}
