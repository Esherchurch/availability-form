/* ===================================================================
   THE CONVERTER, PROVED LIVE (F-257): for deploy day, by the reviewer
   ===================================================================
   Present will not make slides before switch-over (the live Storage is not
   private yet), so the deployed converter is proved directly: an INVENTED
   deck (fixtures/present-fidelity.pptx), or a share link, sent to it as the
   hub's functions would, the result checked, and everything it made deleted.

     node tools/converter-smoke.mjs                       a dry run: what it would do
     node tools/converter-smoke.mjs --live --write        the invented deck, for real
     node tools/converter-smoke.mjs --live --write --link "<OneDrive/SharePoint link>"
     ... --compare      also score each slide against PowerPoint's own picture
                        (the invented deck only: its references are in the repo)
     ... --keep         leave the result (for a look in the console); default: deleted
     node tools/converter-smoke.mjs --live --write --delete smoke-<time>   delete a kept one
     ... --url http://localhost:<port>   a converter on this machine (no Google sign-in;
                        with the emulators, to check this tool itself)

   Needs (the reviewer's machine): gcloud signed in with run.invoker on the
   converter, and Application Default Credentials for the project (Firestore
   and Storage). Writes, while it runs: presentDecks/smoke-<time>,
   presentNotes/smoke-<time>, Storage present/smoke-<time>/ - all deleted at
   the end, whatever happens (unless --keep). context.type is 'smoke', so no
   page shows it and no sweep touches it.
   =================================================================== */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const V2 = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PROJECT = 'egbc-worship-planner', REGION = 'europe-west2', BUCKET = 'egbc-worship-planner.firebasestorage.app';
const arg = (n) => process.argv.includes('--' + n);
const val = (n) => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : ''; };
const LIVE = arg('live') && arg('write'), LINK = val('link'), KEEP = arg('keep'), COMPARE = arg('compare');
const DECK = path.join(V2, 'screenshots', 'events', 'fixtures', 'present-fidelity.pptx');
const DELETE = val('delete');
const id = DELETE && /^smoke-\d{14}$/.test(DELETE) ? DELETE : 'smoke-' + new Date().toISOString().replace(/[-:T.Z]/g, '').slice(0, 14);
const sh = (c) => execSync(c, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

let url = val('url');
if (!url) try { url = sh('gcloud run services describe egbc-converter --region ' + REGION + ' --project ' + PROJECT + ' --format="value(status.url)"'); } catch (e) { url = ''; }
console.log('\nConverter: ' + (url || 'NOT FOUND (deploy it first: FINDINGS F-257)'));
console.log('Deck:      ' + (LINK ? 'the link ' + LINK.slice(0, 80) + (LINK.length > 80 ? '...' : '') : 'the invented fixture ' + path.relative(V2, DECK)));
console.log('Writes:    presentDecks/' + id + ', presentNotes/' + id + ', Storage present/' + id + '/ ' + (KEEP ? '(KEPT: --keep)' : '(all deleted at the end)'));
if (!LIVE) { console.log('\nDRY RUN. Nothing written. Add --live --write to run it.\n'); process.exit(0); }
if (!url && !DELETE) process.exit(1);

const fnRequire = createRequire(path.join(V2, 'functions', 'index.js'));
const { initializeApp } = fnRequire('firebase-admin/app');
const { getFirestore } = fnRequire('firebase-admin/firestore');
const { getStorage } = fnRequire('firebase-admin/storage');
initializeApp({ projectId: PROJECT, storageBucket: BUCKET });
const db = getFirestore(), bucket = getStorage().bucket(), ref = db.collection('presentDecks').doc(id);
const t0 = Date.now(), secs = () => ((Date.now() - t0) / 1000).toFixed(1) + ' s';
let failed = false;
if (DELETE) { await bucket.deleteFiles({ prefix: 'present/' + id + '/' }).catch(() => {}); await db.collection('presentNotes').doc(id).delete().catch(() => {}); await ref.delete().catch(() => {}); console.log('Deleted ' + id + '.'); process.exit(0); }
try {
  await ref.set({ context: { type: 'smoke' }, name: 'Converter smoke test (invented)', status: 'uploaded', source: LINK ? 'onedrive' : 'upload', by: 'smoke', byName: 'smoke test', at: new Date().toISOString() });
  if (!LINK) await bucket.file('present/' + id + '/source.pptx').save(fs.readFileSync(DECK), { contentType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' });
  const token = /^http:\/\/(localhost|127\.0\.0\.1)[:/]/.test(url) ? 'local' : sh('gcloud auth print-identity-token');
  console.log('\nCalling the converter... (a deck with a video can take minutes)');
  const watch = setInterval(async () => { const d = (await ref.get()).data() || {}; console.log('  ' + secs() + '  ' + (d.status || '?') + (d.size ? '  ' + Math.round(d.size / 1048576) + ' MB' : '')); }, 15000);
  const r = await fetch(url + '/convert', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify(LINK ? { deckId: id, link: LINK } : { deckId: id }) });
  clearInterval(watch);
  const body = await r.json().catch(() => ({}));
  const d = (await ref.get()).data() || {};
  console.log('\nHTTP ' + r.status + ' in ' + secs() + ': ' + JSON.stringify(body));
  console.log('status:   ' + d.status + (d.why ? ' - ' + d.why : ''));
  console.log('slides:   ' + d.count + '   renderer: ' + d.renderer + (d.fallbackWhy ? '   (fell back: ' + d.fallbackWhy + ')' : ''));
  console.log('tidy-up:  ' + ((d.prepared || []).join(' | ') || 'nothing to change'));
  for (const m of d.media || []) console.log('media:    slide ' + (m.shown + 1) + ' ' + m.kind + ' ' + (m.src || m.link) + (m.light ? ' + light ' + m.light : '') + ' ' + m.seconds + ' s ' + m.start + (m.playable === false ? ' NOT PLAYABLE: ' + m.why : ''));
  const [files] = await bucket.getFiles({ prefix: 'present/' + id + '/' });
  console.log('files:    ' + files.map((f) => f.name.split('/').pop() + ' ' + Math.round((+f.metadata.size || 0) / 1024) + ' KB').join(', '));
  failed = !(r.ok && d.status === 'ready' && d.count > 0);
  if (!LINK && (d.count !== 3 || !(d.prepared || []).some((x) => /layout sample pictures taken off/.test(x)) && d.renderer !== 'microsoft')) { failed = true; console.log('EXPECTED: 3 slides, and (LibreOffice) the layout sample picture taken off'); }
  if (COMPARE && !LINK && !failed) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'smoke-'));
    for (let n = 1; n <= d.count; n++) await bucket.file('present/' + id + '/s' + n + '.jpg').download({ destination: path.join(dir, 's' + n + '.jpg') });
    const puppeteer = createRequire(path.join(V2, 'package.json'))('puppeteer-core');
    const b = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new' });
    try {
      const pg = await b.newPage(); await pg.setContent('<html><body></body></html>');
      const scores = await pg.evaluate(async (pairs) => {
        const load = (src) => new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = src; });
        const px = (img) => { const c = document.createElement('canvas'); c.width = 192; c.height = 108; c.getContext('2d').drawImage(img, 0, 0, 192, 108); return c.getContext('2d').getImageData(0, 0, 192, 108).data; };
        const out = [];
        for (const [a, r] of pairs) { const A = px(await load(a)), R = px(await load(r)); let bad = 0; for (let k = 0; k < A.length; k += 4) if (Math.abs(A[k] - R[k]) > 48 || Math.abs(A[k + 1] - R[k + 1]) > 48 || Math.abs(A[k + 2] - R[k + 2]) > 48) bad++; out.push(Math.round(bad / (192 * 108) * 1000) / 10); }
        return out;
      }, Array.from({ length: d.count }, (_, k) => ['data:image/jpeg;base64,' + fs.readFileSync(path.join(dir, 's' + (k + 1) + '.jpg')).toString('base64'), 'data:image/png;base64,' + fs.readFileSync(path.join(V2, 'screenshots', 'events', 'fixtures', 'present-fidelity-ppt-s' + (k + 1) + '.png')).toString('base64')]));
      console.log('fidelity: % of each slide clearly different from PowerPoint\'s own picture: ' + scores.join(', ') + '  (under 6 is a match)');
      if (scores.some((s) => s >= 6)) failed = true;
    } finally { await b.close(); fs.rmSync(dir, { recursive: true, force: true }); }
  }
} catch (e) {
  failed = true; console.log('\nFAILED: ' + (e.stack || e));
} finally {
  if (!KEEP) {
    await bucket.deleteFiles({ prefix: 'present/' + id + '/' }).catch(() => {});
    await db.collection('presentNotes').doc(id).delete().catch(() => {});
    await ref.delete().catch(() => {});
    const [left] = await bucket.getFiles({ prefix: 'present/' + id + '/' }).catch(() => [[]]);
    console.log('\nCleaned up: ' + (left.length ? left.length + ' FILES LEFT - delete present/' + id + '/ by hand' : 'nothing left'));
  } else console.log('\nKEPT (--keep): delete later with:  node tools/converter-smoke.mjs --live --write --delete ' + id);
}
console.log(failed ? '\nRESULT: NOT RIGHT - see above.\n' : '\nRESULT: the converter works.\n');
process.exit(failed ? 1 : 0);
