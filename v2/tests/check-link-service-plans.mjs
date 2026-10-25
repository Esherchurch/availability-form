/* The migration that links each saved plan to its service
 * (tools/link-service-plans.mjs; FINDINGS-churchhq H-11 item 0), on the
 * spare emulator with made-up plans. Never the live project.
 *
 *   firebase emulators:exec --config firebase.spare.json --only firestore \
 *     --project egbc-worship-planner "node tests/check-link-service-plans.mjs"
 *
 * - The dry run writes nothing, and prints each plan -> its service, and
 *   the dates it can't place.
 * - Archived services don't count: a date with one live service and
 *   archived copies (as nine of EGBC's dates have) links automatically.
 * - Two live services on a date, or none: listed, never guessed.
 * - --apply backs each plan up first, then adds eventId and nothing else.
 * - Run again, it changes nothing.
 */
import http from 'node:http';
import { spawnSync } from 'node:child_process';

const HOST = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8171';
if (!process.env.FIRESTORE_EMULATOR_HOST) { console.log('Run it under emulators:exec (FIRESTORE_EMULATOR_HOST is not set): it must never reach the live project.'); process.exit(2); }
const [H, P] = HOST.split(':');
const DOCS = '/v1/projects/egbc-worship-planner/databases/(default)/documents';
const OWNER = { Authorization: 'Bearer owner' };
const R = [];
const ok = (n, v, x) => { R.push(v); console.log('  ' + (v ? 'PASS  ' : 'FAIL  ') + n + (v || x === undefined ? '' : '\n          ' + String(x).slice(0, 400))); };
const req = (method, p, body) => new Promise((res, rej) => {
  const d = body === undefined ? null : JSON.stringify(body);
  const r = http.request({ host: H, port: Number(P), method, path: p, headers: Object.assign(d ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(d) } : {}, OWNER) },
    s => { let x = ''; s.on('data', c => x += c); s.on('end', () => res({ status: s.statusCode, body: x })); });
  r.on('error', rej); r.end(d);
});
const val = (v) => typeof v === 'boolean' ? { booleanValue: v } : Array.isArray(v) ? { arrayValue: { values: v.map(val) } }
  : v && typeof v === 'object' ? { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, val(x)])) } } : { stringValue: String(v) };
const put = (p, o) => req('PATCH', DOCS + '/' + p, { fields: Object.fromEntries(Object.entries(o).map(([k, v]) => [k, val(v)])) });
const get = async (p) => { const r = await req('GET', DOCS + '/' + p); return r.status === 200 ? JSON.parse(r.body).fields : null; };
const list = async (c) => JSON.parse((await req('GET', DOCS + '/' + c + '?pageSize=300')).body || '{}').documents || [];
const run = (...args) => spawnSync(process.execPath, ['tools/link-service-plans.mjs', ...args], { encoding: 'utf8', env: process.env });

const song = (t) => [{ type: 'song', title: t, keys: ['G'], notes: '' }];
/* A plain date; a date with archived copies; two live services; no service. */
await put('events/lk_plain', { date: '2026-12-06', type: 'Sunday Morning Worship', startTime: '10:00', archived: false });
await put('services/sp_plain', { date: '2026-12-06', worshipLeader: 'Synthetic', order: song('Plain Synthetic') });
await put('events/lk_live', { date: '2026-12-13', type: 'Sunday Morning Worship', startTime: '10:00', archived: false });
for (const n of [1, 2, 3]) await put('events/lk_arch' + n, { date: '2026-12-13', type: 'Sunday Morning Worship', archived: true });
await put('services/sp_dupes', { date: '2026-12-13', worshipLeader: 'Synthetic', order: song('Dupes Synthetic') });
await put('events/lk_am', { date: '2026-12-20', type: 'Sunday Morning Worship', startTime: '10:00', archived: false });
await put('events/lk_pm', { date: '2026-12-20', type: 'Evening Service', startTime: '18:30', archived: false });
await put('services/sp_two', { date: '2026-12-20', worshipLeader: 'Synthetic', order: song('Two Synthetic') });
await put('services/sp_none', { date: '2026-12-27', worshipLeader: 'Synthetic', order: song('None Synthetic') });
await put('services/sp_linked', { date: '2026-12-06', eventId: 'lk_plain', worshipLeader: 'Synthetic', order: song('Already Synthetic') });

console.log('The dry run');
const dry = run();
const out = dry.stdout + dry.stderr;
ok('it says it is a dry run, against the emulator', /DRY RUN \(writes nothing\) against the EMULATOR/.test(out), out.slice(0, 200));
ok('  each placeable plan -> its service', /LINK\s+2026-12-06\s+plan sp_plain\s+->\s+event lk_plain/.test(out) && /LINK\s+2026-12-13\s+plan sp_dupes\s+->\s+event lk_live\s+\(3 archived on that date, ignored\)/.test(out), out);
ok('  two live services: listed, not guessed', /ASK\s+2026-12-20\s+plan\(s\) sp_two\s+-\s+2 live services: lk_am .*lk_pm/.test(out), out);
ok('  no live service: listed', /ASK\s+2026-12-27\s+plan\(s\) sp_none\s+-\s+no live service on that date/.test(out), out);
ok('  a plan already linked is left out', !/sp_linked/.test(out), out);
ok('  nothing was written', !(await get('services/sp_plain')).eventId && (await list('servicesBackups')).length === 0);

console.log('\n--apply');
const ap = run('--apply');
ok('it links the two it can place', /Linked 2 plan\(s\)/.test(ap.stdout), ap.stdout + ap.stderr);
ok('  sp_plain now has its service', ((await get('services/sp_plain')).eventId || {}).stringValue === 'lk_plain');
ok('  sp_dupes has the live one, not an archived copy', ((await get('services/sp_dupes')).eventId || {}).stringValue === 'lk_live');
ok('  the two it could not place are untouched', !(await get('services/sp_two')).eventId && !(await get('services/sp_none')).eventId);
const plainNow = await get('services/sp_plain');
ok('  only eventId was added: the songs are as they were', JSON.stringify(plainNow.order).includes('Plain Synthetic') && Object.keys(plainNow).sort().join() === 'date,eventId,order,worshipLeader', Object.keys(plainNow).join());
const backups = await list('servicesBackups');
ok('  each was backed up first, as it was', backups.length === 2 && backups.every((b) => !b.fields.plan.mapValue.fields.eventId && /Synthetic/.test(JSON.stringify(b.fields.plan))), backups.length + ' backups');

console.log('\nRun again');
const again = run('--apply');
ok('nothing more to link; nothing changed', /0 to link/.test(again.stdout) && /Linked 0 plan\(s\)/.test(again.stdout) && (await list('servicesBackups')).length === 2, again.stdout);

console.log('\n' + R.filter(Boolean).length + '/' + R.length + ' passed');
process.exit(R.every(Boolean) ? 0 : 1);
