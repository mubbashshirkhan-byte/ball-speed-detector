// Issues a time-limited access code for one person.
// Usage: node scripts/make-access.mjs "Name" 30d      (also 12h, 45m; a bare number means days)
import { APP_URL, loadPrivateJwk, makeCode, parseDuration } from './access-lib.mjs';

const [name, duration = '30d'] = process.argv.slice(2);
if (!name) {
  console.error('Usage: node scripts/make-access.mjs "Name" 30d');
  process.exit(1);
}
const expires = Date.now() + parseDuration(duration);
const code = await makeCode(loadPrivateJwk(), name.trim(), expires);
console.log('Name:    ' + name.trim());
console.log('Expires: ' + new Date(expires).toString());
console.log('Link:    ' + APP_URL + '#k=' + code);
console.log('Code:    ' + code);
