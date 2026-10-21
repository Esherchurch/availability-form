/* PRESENT: A CONVERTER THAT TAKES MORE THAN 5 MINUTES (F-259). Events window.
   Deploy day, 21 Oct: the 729 MB deck with its new light copy took over
   300 s; Node's fetch gave up at 300 s ("fetch failed"), the smoke tool
   cleaned up while the converter worked, and the converter, finishing at
   323 s, found its deck gone and answered 422 - with nothing in its log.
   A SLOW STAND-IN CONVERTER answers after 330 s. This takes about 6 minutes.

     npx firebase emulators:exec --config firebase.events.json --only auth,firestore,storage,functions \
       --project egbc-worship-planner "node screenshots/events/present-slow.test.mjs"

     1. the shared request (functions/longpost.js) waits the 330 s and gets the
        answer; plain fetch, alongside, gives up at about 300 s (the hazard)
     2. the hub's own presentConvert (on the functions emulator) waits past
        300 s and passes the converter's answer on - its caller never gives up
     3. the smoke tool, when its request fails, follows the deck to the end
        and only then cleans up (the converter's last write still lands)
     4. the converter's log says why it refused, every time */
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { postJson } from '../../functions/longpost.js';

const HERE = path.dirname(fileURLToPath(import.meta.url)), V2 = path.resolve(HERE, '..', '..');
const PROJECT = 'egbc-worship-planner', SLOW_S = 330;
if (process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8182' && process.env.FIRESTORE_EMULATOR_HOST !== 'localhost:8182') throw new Error('Not run under the events emulators');
const fnRequire = createRequire(path.join(V2, 'functions', 'index.js'));
const { initializeApp, getApps } = fnRequire('firebase-admin/app');
const { getFirestore } = fnRequire('firebase-admin/firestore');
const { getStorage } = fnRequire('firebase-admin/storage');
if (!getApps().length) initializeApp({ projectId: PROJECT, storageBucket: 'egbc-worship-planner.firebasestorage.app' });
const db = getFirestore(), bucket = getStorage().bucket();
const results = [];
const ok = (name, pass, why) => { results.push(!!pass); console.log((pass ? '  PASS  ' : '  FAIL  ') + name + (pass || why === undefined ? '' : '\n          ' + String(why).slice(0, 500))); };
const J = (x) => JSON.stringify(x);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* the slow stand-in converter: answers after SLOW_S seconds, and notes whether its caller gave up first */
const seen = [];
const slow = http.createServer((req, res) => {
  const rec = { url: req.url, at: Date.now(), gaveUpAfter: null }; seen.push(rec);
  let answered = false;
  req.on('data', () => {}); req.on('end', () => {});
  res.on('close', () => { if (!answered) rec.gaveUpAfter = Math.round((Date.now() - rec.at) / 1000); });
  setTimeout(() => { answered = true; if (!res.destroyed) { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(J({ count: 4 })); } }, SLOW_S * 1000);
});
await new Promise((r) => slow.listen(5616, '127.0.0.1', r));

try {
  /* the church, for the hub's own presentConvert */
  await fetch(`http://127.0.0.1:8182/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' });
  await fetch(`http://127.0.0.1:9098/emulator/v1/projects/${PROJECT}/accounts`, { method: 'DELETE' });
  const sign = await (await fetch('http://127.0.0.1:9098/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: J({ email: 'karen.slow@example.invalid', password: 'synthetic-only-123', returnSecureToken: true }) })).json();
  await db.collection('users').doc(sign.localId).set({ memberId: 'm_karen', name: 'Karen (invented)', teams: ['Kids Church'], adminFor: [], masterAdmin: false, status: 'active' });
  await db.collection('planGroups').doc('pg_kids').set({ name: 'Kids Church', leaderIds: ['m_karen'], teamName: 'Kids Church' });
  await db.collection('planSessions').doc('ps_1').set({ groupId: 'pg_kids', date: '2026-11-01', title: 'x', parts: [] });
  await db.collection('churchSettings').doc('launch').set({ rulesLocked: true });
  await db.collection('presentSettings').doc('test').set({ converterUrl: 'http://127.0.0.1:5616' });
  await db.collection('presentDecks').doc('dk_slow0001').set({ context: { type: 'session', groupId: 'pg_kids', sessionId: 'ps_1' }, name: 'x', status: 'uploaded', source: 'upload', by: sign.localId, byName: 'x', at: 'x' });

  /* 3 and 4 first (they are quick), while 1 and 2 wait */
  const t0 = Date.now();
  const p1 = postJson('http://127.0.0.1:5616/convert', { deckId: 'dk_direct' }).then((r) => ({ r, s: (Date.now() - t0) / 1000 }), (e) => ({ e: String(e.message || e), s: (Date.now() - t0) / 1000 }));
  const pFetch = fetch('http://127.0.0.1:5616/convert', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"deckId":"dk_fetch"}' }).then((r) => ({ status: r.status, s: (Date.now() - t0) / 1000 }), (e) => ({ e: String(e.message || e), cause: String((e.cause && e.cause.code) || ''), s: (Date.now() - t0) / 1000 }));
  const pFn = postJson('http://127.0.0.1:5102/' + PROJECT + '/europe-west2/presentConvert', { data: { deckId: 'dk_slow0001' } }, { headers: { Authorization: 'Bearer ' + sign.idToken } })
    .then((r) => ({ r, s: (Date.now() - t0) / 1000 }), (e) => ({ e: String(e.message || e), s: (Date.now() - t0) / 1000 }));

  /* 3. the smoke tool: a stand-in that drops the request at once, then finishes the deck 20 s later */
  const dropper = http.createServer((req, res) => {
    let raw = ''; req.on('data', (c) => (raw += c));
    req.on('end', async () => {
      const { deckId } = JSON.parse(raw || '{}');
      req.socket.destroy();                       /* the request fails, as on deploy day */
      await db.collection('presentDecks').doc(deckId).update({ status: 'video' });
      await sleep(20000);
      try { await db.collection('presentDecks').doc(deckId).update({ status: 'ready', count: 3, renderer: 'libreoffice', prepared: ['layout sample pictures taken off: 1'] }); dropper.lastWrite = 'landed'; }
      catch (e) { dropper.lastWrite = 'FAILED: ' + e.message; }
    });
  });
  await new Promise((r) => dropper.listen(5617, '127.0.0.1', r));
  const tool = await new Promise((done) => {
    const c = spawn(process.execPath, [path.join(V2, 'tools', 'converter-smoke.mjs'), '--live', '--write', '--url', 'http://127.0.0.1:5617'], { cwd: V2, env: process.env });
    let out = ''; c.stdout.on('data', (d) => (out += d)); c.stderr.on('data', (d) => (out += d)); c.on('close', (code) => done({ code, out }));
  });
  dropper.close();
  const left = (await bucket.getFiles({ prefix: 'present/smoke-' }))[0].length + (await db.collection('presentDecks').where('context.type', '==', 'smoke').get()).size;
  ok('3. THE SMOKE TOOL, when its request fails, follows the deck to "ready" before cleaning up', /request itself failed/.test(tool.out) && /the deck says ready/.test(tool.out) && /RESULT: the converter works/.test(tool.out) && tool.code === 0, tool.out.split('\n').slice(-14).join(' / '));
  ok('   so the converter’s last write lands (no deck pulled out from under it), and then nothing is left', dropper.lastWrite === 'landed' && left === 0, J({ lastWrite: dropper.lastWrite, left }));

  /* 4. the converter's log: a refusal says why */
  /* (runJob is what the converter's web service runs for every request) */
  const { runJob } = await import('../../converter/convert.mjs');
  const logged = [], was = console.error; console.error = (m) => logged.push(String(m));
  await db.collection('presentDecks').doc('dk_nofile01').set({ context: { type: 'smoke' }, status: 'uploaded' });
  const refused = await runJob({ db, bucket, deckId: 'dk_nofile01', render: async () => { throw new Error('should not get here'); } });
  console.error = was;
  ok('4. THE CONVERTER’S LOG says why it refused (deploy day: a 422 with no word)', refused.status === 422 && logged.some((m) => /convert dk_nofile01: REFUSED after \d+ s: .*(No such object|not found|404)/i.test(m)), J({ status: refused.status, logged }));

  /* 1 and 2: the slow ones */
  const [r1, rf, r2] = await Promise.all([p1, pFetch, pFn]);
  ok('1. THE SHARED REQUEST waits the whole ' + SLOW_S + ' s and gets the converter’s answer', r1.r && r1.r.status === 200 && r1.r.json.count === 4 && r1.s >= SLOW_S - 1, J(r1));
  ok('   while plain fetch, alongside, gives up at about 300 s (what happened on deploy day)', rf.e && rf.s >= 295 && rf.s < SLOW_S, J(rf));
  ok('2. THE HUB’S presentConvert waits past 300 s and passes the converter’s answer on', r2.r && r2.r.status === 200 && r2.r.json.result && r2.r.json.result.count === 4 && r2.s >= SLOW_S - 1, J(r2));
  const fnCall = seen.find((x) => x.url === '/convert' && x.gaveUpAfter === null && seen.indexOf(x) > 1) || seen[2];
  ok('   and the function never gave up on the converter first', seen.filter((x) => x.gaveUpAfter !== null).length === 1 && fnCall && fnCall.gaveUpAfter === null, J(seen.map((x) => ({ gaveUpAfter: x.gaveUpAfter }))));
} catch (e) {
  ok('the run finished', false, e.stack);
} finally { slow.close(); }
console.log('\n' + results.filter(Boolean).length + '/' + results.length + ' passed');
process.exit(results.every(Boolean) ? 0 : 1);
