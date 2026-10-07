/* E1 — the QR maker (egbc-events-qr.js), read back by an independent
   decoder. Events window. No emulator needed.

     npm i --no-save jsqr
     node screenshots/events/e1-qr.test.mjs

   Every QR size the maker can produce (versions 1 to 10), plain text, the
   real check-in code shape, and text with accents and a pound sign. A code
   that does not read back exactly is a failure. */

import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import jsQR from 'jsqr';

const V2 = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const load = (f) => { const ctx = { window: {} }; vm.createContext(ctx); vm.runInContext(fs.readFileSync(path.join(V2, f), 'utf8'), ctx); return ctx.window; };
const Q = load('egbc-events-qr.js').EGBCEventsQR;
const C = load('egbc-events-checkin.js').EGBCCheckin;

const samples = [
  C.codeFor('cev_abcdefghijklmn', 'k3j4h5g6f7aaaaaaaaaaaaaaaaaaaaaa', 0),
  C.codeFor('cev_zzzzzzzzzzzzzz', '0123456789abcdefghijklmnopqrstuv', 19),
  'x', 'Hello, world! 123', 'Café £5 — ünïcode'
];
for (let n = 1; n <= 210; n += 7) samples.push(Array.from({ length: n }, (_, i) => String.fromCharCode(33 + ((i * 7 + n) % 90))).join(''));

let failed = 0;
const versions = new Set();
for (const t of samples) {
  const m = Q.matrix(t), N = m.length, sc = 4, q = 4, W = (N + 2 * q) * sc;
  versions.add((N - 17) / 4);
  const px = new Uint8ClampedArray(W * W * 4).fill(255);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (m[y][x])
    for (let dy = 0; dy < sc; dy++) for (let dx = 0; dx < sc; dx++) {
      const i = (((y + q) * sc + dy) * W + (x + q) * sc + dx) * 4; px[i] = px[i + 1] = px[i + 2] = 0;
    }
  const r = jsQR(px, W, W);
  if (!r || r.data !== t) { failed++; console.log('  FAIL  ' + Buffer.byteLength(t) + ' bytes, version ' + (N - 17) / 4 + ': read ' + (r && JSON.stringify(r.data))); }
}
console.log('  ' + (failed ? 'FAIL' : 'PASS') + '  ' + (samples.length - failed) + '/' + samples.length + ' codes read back, versions ' + [...versions].sort((a, b) => a - b).join(','));

/* The code's own rules: it parses back, and it never holds the whole key. */
const code = C.codeFor('cev_x', 'abcdefghij0123456789abcdefghij01', 3);
const p = C.parseCode(code);
const parseOk = p && p.calEventId === 'cev_x' && p.keyPart === 'abcdefghij' && p.index === 3 && code.indexOf('abcdefghij01') < 0;
console.log('  ' + (parseOk ? 'PASS' : 'FAIL') + '  a check-in code parses back and carries only 10 characters of the key');
const junk = ['', 'EGBC1|x|short|0', 'OTHER|cev|abcdefghij|0', 'EGBC1|cev|abcdefghij|-1'].every(s => C.parseCode(s) === null);
console.log('  ' + (junk ? 'PASS' : 'FAIL') + '  anything else is not a check-in code');
process.exit(failed || !parseOk || !junk ? 1 : 0);
