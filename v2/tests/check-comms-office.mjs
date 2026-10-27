/* Who the comms functions count as the office: the office JOB, never a team
 * name (H-9; the reviewing window, 27 Oct 2026).
 *
 *   node tests/check-comms-office.mjs        (from v2/)
 *
 * Runs functions/comms-office.js (main's team-jobs.js underneath) against
 * the Firestore emulator in firebase.comms.json (an emulator of your own:
 * this clears it). Synthetic people only.
 *
 * Asks: with nothing stored (EGBC), the Church office and master admins
 * are the office; with a parish's mapping (office: "Parish office"), its
 * Parish office is, and EGBC's "Church office" isn't; the real "Preview
 * web version" lets the Parish office in; and none of the six comms
 * functions types a team name for it.
 *
 * DELIBERATE BREAK: a copy of comms-office.js with "Church office" typed in
 * instead of the job must turn the parish's checks red.
 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const V2 = path.resolve('.');
const C1 = JSON.parse(fs.readFileSync(process.env.EGBC_FIREBASE_CONFIG || 'firebase.comms.json', 'utf8'));
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:' + C1.emulators.firestore.port;
process.env.FUNCTIONS_EMULATOR = 'true';
process.env.GCLOUD_PROJECT = 'egbc-worship-planner';
const { initializeApp } = await import(pathToFileURL(path.join(V2, 'functions', 'node_modules', 'firebase-admin', 'lib', 'app', 'index.js')).href);
const { getFirestore } = await import(pathToFileURL(path.join(V2, 'functions', 'node_modules', 'firebase-admin', 'lib', 'firestore', 'index.js')).href);
initializeApp({ projectId: 'egbc-worship-planner' });
const db = getFirestore();

const R = [];
const ok = (n, v, x) => { R.push(!!v); console.log('  ' + (v ? 'PASS  ' : 'FAIL  ') + n + (v || x === undefined ? '' : '\n          ' + JSON.stringify(x).slice(0, 300))); };

const SRC = fs.readFileSync(path.join(V2, 'functions', 'comms-office.js'), 'utf8');
const JOB = "teamsFor(tj.map, 'office', tj.set)";
async function loadCopy(from, to) {
  if (from && !SRC.includes(from)) throw new Error('the line to break is not in functions/comms-office.js any more - update the break');
  const tmp = path.join(V2, 'functions', '.check-' + process.pid + '-comms-office.js');
  fs.writeFileSync(tmp, from ? SRC.replace(from, to) : SRC);
  try { return await import(pathToFileURL(tmp).href + '?' + Date.now() + Math.random()); } finally { fs.unlinkSync(tmp); }
}

const P = {
  office: { status: 'active', teams: ['Church office'] },
  parish: { status: 'active', teams: ['Parish office'] },
  covers: { status: 'active', teams: ['Youth'], covers: ['Parish office'] },
  master: { status: 'active', teams: [], masterAdmin: true },
  away:   { status: 'pending', teams: ['Parish office'] },
  choir:  { status: 'active', teams: ['Choir'] }
};

async function scenario(O) {
  const out = [];
  const t = (n, v, x) => out.push({ n, v: !!v, x });
  await db.collection('churchSettings').doc('teamJobs').delete();
  t('nothing stored (EGBC): the Church office is the office', await O.isOffice(db, P.office));
  t('nothing stored (EGBC): a master admin is', await O.isOffice(db, P.master));
  t('nothing stored (EGBC): a "Parish office" team is not', !(await O.isOffice(db, P.parish)));
  await db.collection('churchSettings').doc('teamJobs').set({ office: ['Parish office'], trustees: ['PCC'] });
  t('a church’s own team name for the office job: its Parish office is the office', await O.isOffice(db, P.parish));
  t('a church’s own team name for the office job: covering the Parish office counts', await O.isOffice(db, P.covers));
  t('…and EGBC’s "Church office" is not that church’s office', !(await O.isOffice(db, P.office)));
  t('…nor the choir, nor someone not yet active', !(await O.isOffice(db, P.choir)) && !(await O.isOffice(db, P.away)));
  t('…a master admin still is', await O.isOffice(db, P.master));
  return out;
}

try { await db.collection('churchSettings').doc('ping').get(); } catch (e) { console.log('  FAIL  no Firestore emulator on ' + process.env.FIRESTORE_EMULATOR_HOST); process.exit(1); }
(await scenario(await loadCopy())).forEach(r => ok(r.n, r.v, r.x));

/* The real callable gate: "Preview web version" as the parish's office. */
for (const [uid, p] of Object.entries(P)) await db.collection('users').doc('co_' + uid).set(p);
const U = await import(pathToFileURL(path.join(V2, 'functions', 'enews-preview.js')).href);
const pv = await U.runPreview({ db, uid: 'co_parish', data: { issueId: 'none' }, hub: 'https://testbury.churchhq.example' });
ok('the real "Preview web version" lets the parish’s Parish office in (no "For the church office")', pv.error !== 'permission-denied', pv);
const pv2 = await U.runPreview({ db, uid: 'co_office', data: { issueId: 'none' }, hub: 'https://testbury.churchhq.example' });
ok('…and refuses EGBC’s "Church office" there', pv2.error === 'permission-denied', pv2);

/* No team name in the six comms functions' office checks. */
const strip = s => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[\s;{}(),])\/\/[^\n]*/g, '$1');
const FILES = ['enews.js', 'enews-send.js', 'enews-preview.js', 'unsplash.js', 'social.js', 'canva.js'];
const named = FILES.filter(f => /'Church office'|"Church office"/.test(strip(fs.readFileSync(path.join(V2, 'functions', f), 'utf8'))));
const using = FILES.filter(f => /from '\.\/comms-office\.js'/.test(fs.readFileSync(path.join(V2, 'functions', f), 'utf8')));
ok('none of the six comms functions types a team name for the office; each asks comms-office.js', !named.length && using.length === FILES.length, { named, using });
await db.collection('churchSettings').doc('teamJobs').delete();

console.log('-- deliberate break --');
const red = (await scenario(await loadCopy(JOB, "['Church office']"))).filter(r => !r.v).map(r => r.n);
const hit = red.some(n => n.includes('a church’s own team name for the office job'));
R.push(hit);
console.log('  ' + (hit ? 'PASS  ' : 'FAIL  ') + 'break caught: "Church office" typed in, not the job' + (hit ? '  (red: ' + red.join('; ') + ')' : '  - NOTHING CAUGHT IT'));
await db.collection('churchSettings').doc('teamJobs').delete();

const pass = R.filter(Boolean).length;
console.log('\n' + pass + '/' + R.length + ' passed');
process.exit(pass === R.length ? 0 : 1);
