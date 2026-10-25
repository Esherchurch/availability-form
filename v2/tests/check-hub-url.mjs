/* The hub's own address in the server's emails (functions/notify.js
 * hubUrl; 25 Oct 2026, Comms asked). No emulator.
 *
 *   node tests/check-hub-url.mjs          (from v2/)
 *   BREAK=1 node tests/check-hub-url.mjs  a church with no address getting EGBC's: must fail
 *
 * EGBC's own data (the top level, no church id): EGBC's address until one
 * is set, as today. Any other church: its own address, or '' (not set
 * yet) - never EGBC's, never another church's.
 */
import { hubUrl } from '../functions/notify.js';
import { scopedDb } from '../functions/church-scope.js';

const R = [];
const ok = (n, v, x) => { R.push(v); console.log('  ' + (v ? 'PASS  ' : 'FAIL  ') + n + (v || x === undefined ? '' : '\n          ' + JSON.stringify(x))); };
/* A pretend database: churchSettings/details per path. */
const fakeDb = (docs) => {
  const at = (p) => ({ get: async () => ({ exists: p in docs, data: () => docs[p] }) });
  return { collection: (c) => ({ doc: (d) => at(c + '/' + d) }), doc: (p) => at(p) };
};
const nested = (docs) => {
  const db = fakeDb(docs);
  db.collection = (c) => ({ doc: (d) => ({ collection: (c2) => ({ doc: (d2) => ({ get: async () => ({ exists: (c + '/' + d + '/' + c2 + '/' + d2) in docs, data: () => docs[c + '/' + d + '/' + c2 + '/' + d2] }) }) }), get: async () => ({ exists: (c + '/' + d) in docs, data: () => docs[c + '/' + d] }) }) });
  return db;
};
let fn = hubUrl;
if (process.env.BREAK) fn = async (db) => (await hubUrl(db)) || 'https://esherchurch.github.io/availability-form/v2/';

ok('EGBC with no address set: EGBC\'s address, as today', /esherchurch\.github\.io\/availability-form\/v2\/$/.test(await fn(nested({}))));
ok('EGBC with one set: that one, ending in /', (await fn(nested({ 'churchSettings/details': { hubUrl: 'https://hub.example.org' } }))) === 'https://hub.example.org/');
const alpha = (docs) => scopedDb(nested(docs), 'mc-alpha');
const none = await fn(alpha({}));
ok('a church with no address set: not set yet (\'\'), never EGBC\'s', none === '', none);
ok('  a church with its own: that one', (await fn(alpha({ 'churches/mc-alpha/churchSettings/details': { hubUrl: 'https://st-aidan.example.com/' } }))) === 'https://st-aidan.example.com/');
ok('  an address that is not https:// is not used', (await fn(alpha({ 'churches/mc-alpha/churchSettings/details': { hubUrl: 'http://plain.example.com/' } }))) === '');
console.log('\n' + R.filter(Boolean).length + '/' + R.length + ' passed');
process.exit(R.every(Boolean) ? 0 : 1);
