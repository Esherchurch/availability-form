/* Canva (FINDINGS-comms C-15): connecting, the tokens, listing, importing
 * and disconnecting, against a PRETEND Canva - nothing here talks to the
 * real one, and no real account is used.
 *
 *   node tests/check-canva.mjs        (from v2/)
 *
 * Runs functions/canva-core.js with the Firestore emulator in
 * firebase.comms.json (an emulator of your own) and a small local server
 * that answers like Canva's API. Files "saved" are only written down.
 *
 * DELIBERATE BREAKS: each loads a copy of canva-core.js with one line
 * changed and must turn a named check red: a sign-in link used twice; the
 * refresh not claimed first (two imports spending one refresh token);
 * a wider permission asked of Canva.
 */
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const V2 = path.resolve('.');
const C1 = JSON.parse(fs.readFileSync(process.env.EGBC_FIREBASE_CONFIG || 'firebase.comms.json', 'utf8'));
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:' + C1.emulators.firestore.port;
const requireFn = createRequire(path.join(V2, 'functions', 'package.json'));
const { initializeApp } = requireFn('firebase-admin/app');
const { getFirestore } = requireFn('firebase-admin/firestore');
initializeApp({ projectId: 'egbc-worship-planner' });
const db = getFirestore();

async function loadCopy(from, to) {
  const src = fs.readFileSync(path.join(V2, 'functions', 'canva-core.js'), 'utf8');
  if (from && !src.includes(from)) throw new Error('the line to break is not in functions/canva-core.js any more - update the break');
  const tmp = path.join(V2, 'functions', '.check-' + process.pid + '-canva-core.js');
  fs.writeFileSync(tmp, from ? src.replace(from, to) : src);
  try { return await import(pathToFileURL(tmp).href + '?' + Date.now() + Math.random()); } finally { fs.unlinkSync(tmp); }
}

/* ---- the pretend Canva ------------------------------------------------- */
const FAKE = { codes: {}, refreshUsed: new Set(), refreshCalls: 0, revoked: [], exports: {}, lastAuth: '' };
const GIF = Buffer.from('R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==', 'base64');
let nextTok = 1;
const fake = http.createServer((q, s) => {
  let body = ''; q.on('data', c => body += c); q.on('end', () => {
    const u = new URL(q.url, 'http://x'), j = (code, o) => { s.writeHead(code, { 'Content-Type': 'application/json' }); s.end(JSON.stringify(o)); };
    if (u.pathname === '/oauth/token') {
      FAKE.lastAuth = q.headers.authorization || '';
      const f = new URLSearchParams(body);
      if (q.headers.authorization !== 'Basic ' + Buffer.from('test-client:test-secret').toString('base64')) return j(401, { error: 'invalid_client' });
      if (f.get('grant_type') === 'authorization_code') {
        const c = FAKE.codes[f.get('code')];
        if (!c || createHash('sha256').update(f.get('code_verifier') || '').digest('base64url') !== c.challenge) return j(400, { error: 'invalid_grant', error_description: 'PKCE did not match' });
        delete FAKE.codes[f.get('code')];
        return j(200, { access_token: 'acc' + nextTok, refresh_token: 'ref' + (nextTok++), expires_in: 14400, scope: c.scope });
      }
      if (f.get('grant_type') === 'refresh_token') {
        FAKE.refreshCalls++;
        const r = f.get('refresh_token');
        if (FAKE.refreshUsed.has(r)) return j(400, { error: 'invalid_grant', error_description: 'refresh token already used' });
        FAKE.refreshUsed.add(r);
        return setTimeout(() => j(200, { access_token: 'acc' + nextTok, refresh_token: 'ref' + (nextTok++), expires_in: 14400 }), 1500);   /* slow, like a real network: two callers overlap */
      }
    }
    if (u.pathname === '/oauth/revoke') { FAKE.revoked.push(new URLSearchParams(body).get('token')); return j(200, {}); }
    /* Export links are pre-signed: no sign-in needed to fetch the file. */
    if (u.pathname === '/file.gif') { s.writeHead(200, { 'Content-Type': 'image/gif' }); return s.end(GIF); }
    if (!/^Bearer acc\d+$/.test(q.headers.authorization || '')) return j(401, { code: 'invalid_access_token' });
    if (u.pathname === '/designs') return j(200, { items: [{ id: 'DAFharvest1', title: 'Harvest supper 2026', thumbnail: { url: 'http://127.0.0.1:' + fake.address().port + '/thumb.png', width: 200, height: 168 }, updated_at: 1760000000 }], continuation: u.searchParams.get('continuation') ? '' : 'page2' });
    if (u.pathname === '/exports' && q.method === 'POST') {
      const b = JSON.parse(body || '{}'), id = 'job' + Object.keys(FAKE.exports).length;
      FAKE.exports[id] = { polls: 0, design: b.design_id, format: b.format };
      return j(200, { job: { id, status: 'in_progress' } });
    }
    const m = /^\/exports\/(job\d+)$/.exec(u.pathname);
    if (m) {
      const x = FAKE.exports[m[1]]; x.polls++;
      if (x.design === 'DAFpaid') return j(200, { job: { id: m[1], status: 'failed', error: { code: 'license_required', message: 'license' } } });
      return j(200, { job: x.polls < 2 ? { id: m[1], status: 'in_progress' } : { id: m[1], status: 'success', urls: ['http://127.0.0.1:' + fake.address().port + '/file.gif'] } });
    }
    j(404, {});
  });
}).listen(0);
await new Promise(r => fake.on('listening', r));
const BASE = 'http://127.0.0.1:' + fake.address().port;

async function scenario(C) {
  const out = [];
  const t = (n, v, x) => out.push({ n, v: !!v, x });
  try {
  for (const c of ['integrationSecrets', 'pictureLibrary']) for (const d of (await db.collection(c).get()).docs) await d.ref.delete();
  FAKE.refreshUsed.clear(); FAKE.refreshCalls = 0; FAKE.revoked = [];
  const saved = [];
  const deps = { db, fetchFn: fetch, clientId: 'test-client', secret: 'test-secret', apiBase: BASE, redirectUri: 'http://127.0.0.1:5101/cb',
    save: async (p, bytes, type) => { saved.push({ p, n: bytes.length, type }); return 'https://store.invalid/' + p; } };

  /* Connecting */
  const s1 = await C.start(Object.assign({}, deps, { uid: 'u_office' }));
  const u = new URL(s1.url);
  t('the sign-in goes to Canva’s own page', u.origin + u.pathname === 'https://www.canva.com/api/oauth/authorize');
  t('it asks only to read designs and export them (two permissions)', u.searchParams.get('scope') === 'design:meta:read design:content:read', u.searchParams.get('scope'));
  t('PKCE, the S256 way', u.searchParams.get('code_challenge_method') === 's256' && (u.searchParams.get('code_challenge') || '').length >= 43);
  const st = (await db.collection('integrationSecrets').doc('canvaState_' + s1.state).get()).data() || {};
  FAKE.codes.code1 = { challenge: u.searchParams.get('code_challenge'), scope: u.searchParams.get('scope') };
  let err = '';
  try { await C.finish(Object.assign({}, deps, { code: 'code1', state: 'made-up-state-0000000000000' })); } catch (e) { err = e.message; }
  t('a sign-in link the hub did not make is refused', /not one|never started/.test(err), err);
  await C.finish(Object.assign({}, deps, { code: 'code1', state: s1.state }));
  const tok = (await db.collection('integrationSecrets').doc('canva').get()).data() || {};
  t('connected: the tokens are kept on the server', /^acc\d+$/.test(tok.access) && /^ref\d+$/.test(tok.refresh) && tok.connectedBy === 'u_office');
  t('the secret went to Canva only as the Basic header', FAKE.lastAuth === 'Basic ' + Buffer.from('test-client:test-secret').toString('base64'));
  err = '';
  FAKE.codes.code2 = FAKE.codes.code1 || { challenge: u.searchParams.get('code_challenge') };
  try { await C.finish(Object.assign({}, deps, { code: 'code2', state: s1.state })); } catch (e) { err = e.message; }
  t('a sign-in link works once', /already been used|never started/.test(err), err);
  const s2 = await C.start(Object.assign({}, deps, { uid: 'u_office', now: Date.now() - 20 * 60000 }));
  err = '';
  try { await C.finish(Object.assign({}, deps, { code: 'x', state: s2.state })); } catch (e) { err = e.message; }
  t('a sign-in left over 15 minutes is refused', /too long/.test(err), err);
  t('status says connected', (await C.status(deps)).connected === true);

  /* Listing */
  const L = await C.designs(deps, { query: 'harvest' });
  t('designs are listed, with a thumbnail', L.items.length === 1 && L.items[0].title === 'Harvest supper 2026' && /thumb\.png$/.test(L.items[0].thumb) && L.continuation === 'page2');

  /* The refresh token works once: two imports at once after it runs out. */
  await db.collection('integrationSecrets').doc('canva').update({ expires: Date.now() - 1000 });
  const both = await Promise.all([C.accessToken(Object.assign({}, deps, { waitMs: 200 })), C.accessToken(Object.assign({}, deps, { waitMs: 200 }))]).catch(e => [e.message]);
  t('two at once after the token runs out: Canva is asked to refresh ONCE', FAKE.refreshCalls === 1 && both.length === 2 && both[0] === both[1], { calls: FAKE.refreshCalls, both });
  const tok2 = (await db.collection('integrationSecrets').doc('canva').get()).data() || {};
  t('the new refresh token is saved', tok2.refresh && tok2.refresh !== tok.refresh && !tok2.refreshingUntil);

  /* Importing */
  const pic = await C.importDesign(Object.assign({}, deps), { designId: 'DAFharvest1', kind: 'gif', title: 'Harvest supper 2026', uid: 'u_office', pollMs: 20 });
  t('import: exported as GIF, waited for, copied into the church’s own storage', saved.length === 1 && saved[0].type === 'image/gif' && /^library\/pic_canva_[A-Za-z0-9]+\/canva\.gif$/.test(saved[0].p) && saved[0].n === GIF.length, saved);
  const lib = (await db.collection('pictureLibrary').doc(pic.id).get()).data() || {};
  t('import: in the picture library as an animated picture, pointing at our copy (not Canva’s 24-hour link)', lib.kind === 'animated' && lib.source === 'canva' && lib.url.startsWith('https://store.invalid/') && lib.name === 'Harvest supper 2026');
  err = '';
  try { await C.importDesign(deps, { designId: 'DAFpaid', kind: 'png', uid: 'u', pollMs: 5 }); } catch (e) { err = e.message; }
  t('a design with paid Canva elements: said plainly', /paid Canva elements/.test(err), err);
  err = '';
  try { await C.importDesign(deps, { designId: '../etc', kind: 'gif', uid: 'u' }); } catch (e) { err = e.message; }
  t('a made-up design id is refused before Canva is asked', /not a Canva design/.test(err), err);

  /* Disconnecting */
  await C.disconnect(deps);
  t('disconnect: Canva is told, and the hub forgets the tokens', FAKE.revoked.length === 1 && !(await db.collection('integrationSecrets').doc('canva').get()).exists && (await C.status(deps)).connected === false);
  } catch (e) { t('the run finished', false, e.message); }
  return out;
}

const R = [];
(await scenario(await loadCopy())).forEach(r => { R.push(r.v); console.log('  ' + (r.v ? 'PASS  ' : 'FAIL  ') + r.n + (r.v || r.x === undefined ? '' : '\n          ' + JSON.stringify(r.x).slice(0, 300))); });
console.log('-- deliberate breaks --');
const BREAKS = [
  ['a sign-in link used twice', '  await ref.delete();\n  const s = st.data();', '  const s = st.data();', 'a sign-in link works once'],
  ['the refresh not claimed first', "      if ((t.refreshingUntil || 0) > t0) return { wait: true };", '', 'refresh ONCE'],
  ['a wider permission asked of Canva', "export const SCOPES = ['design:meta:read', 'design:content:read'];", "export const SCOPES = ['design:meta:read', 'design:content:read', 'design:content:write'];", 'two permissions']
];
for (const [what, from, to, expect] of BREAKS) {
  let red = [];
  try { red = (await scenario(await loadCopy(from.replace(/\n/g, fs.readFileSync(path.join(V2, 'functions', 'canva-core.js'), 'utf8').includes('\r\n') ? '\r\n' : '\n'), to.replace(/\n/g, fs.readFileSync(path.join(V2, 'functions', 'canva-core.js'), 'utf8').includes('\r\n') ? '\r\n' : '\n')))).filter(r => !r.v).map(r => r.n); }
  catch (e) { console.log('          ' + e.message); }
  const hit = red.some(n => n.includes(expect));
  R.push(hit);
  console.log('  ' + (hit ? 'PASS  ' : 'FAIL  ') + 'break caught: ' + what + (hit ? '' : '  - NOTHING CAUGHT IT'));
}
fake.close();
const fails = R.filter(v => !v).length;
console.log('\n' + (R.length - fails) + '/' + R.length + ' passed');
process.exit(fails ? 1 : 0);
