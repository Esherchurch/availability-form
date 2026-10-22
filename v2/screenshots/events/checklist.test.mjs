/* Event checklists, at least as good as ChurchSuite's (F-188). Events
   window. Invented people and events only, events emulators only, network
   guard, no email leaves the machine (the outbox is read instead).

     npx firebase emulators:exec --config firebase.events.json --only auth,firestore,storage \
       --project egbc-worship-planner "node screenshots/events/checklist.test.mjs"

   What it proves:
     1. a task with WHO does it, WHEN (days before the event) and a note;
        the person is TOLD BY EMAIL, once
     2. its due date is worked out from the event; the list says how far
        along it is; tasks move up and down and can be changed
     3. YOUR TASKS: the person signed in sees the tasks given to them,
        OVERDUE FIRST and in red, and opens the event on its checklist
     4. a template that is the DEFAULT FOR A CATEGORY: every new event in it
        starts with the list - who, when and notes, nothing ticked
     5. at 375px nothing scrolls sideways */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc, getDocs, collection, query, where } from 'firebase/firestore';
import puppeteer from 'puppeteer-core';
import { createGuard } from './guard.mjs';
const GUARD = createGuard();

const HERE = path.dirname(fileURLToPath(import.meta.url));
const V2 = path.resolve(HERE, '..', '..');
const PROJECT = 'egbc-worship-planner';
const cfg = JSON.parse(fs.readFileSync(path.join(V2, 'firebase.events.json'), 'utf8'));
if (cfg.emulators.firestore.port !== 8182 || cfg.emulators.auth.port !== 9098) throw new Error('Not the events emulators - refusing to write.');
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'egbc-checklist-'));
const STAMP = JSON.parse(fs.readFileSync(path.join(V2, 'version.json'), 'utf8').replace(/^\uFEFF/, '')).stamp;

const results = [];
function ok(name, pass, why) { results.push(!!pass); console.log((pass ? '  PASS  ' : '  FAIL  ') + name + (pass || !why ? '' : '\n          ' + String(why).slice(0, 600))); }
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function until(fn, ms = 15000) { const end = Date.now() + ms; let last; while (Date.now() < end) { try { last = await fn(); if (last) return last; } catch (e) { last = null; } await sleep(200); } return last; }
const J = (x) => JSON.stringify(x);
const pad = (n) => (n < 10 ? '0' : '') + n;
const iso = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes());
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const short = (d) => DAYS[d.getDay()] + ' ' + d.getDate() + ' ' + MONTHS[d.getMonth()];

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.css': 'text/css', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const f = path.join(V2, p === '/' ? 'index.html' : p);
  if (!f.startsWith(V2) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  fs.createReadStream(f).pipe(res);
});
await new Promise(r => server.listen(5601, 'localhost', r));
const URLB = 'http://localhost:5601/';

const env = await initializeTestEnvironment({ projectId: PROJECT,
  firestore: { rules: fs.readFileSync(path.join(V2, 'firestore.build.rules'), 'utf8'), host: '127.0.0.1', port: 8182 } });
await env.clearFirestore();
await fetch(`http://127.0.0.1:9098/emulator/v1/projects/${PROJECT}/accounts`, { method: 'DELETE' });

const P = { martin: { email: 'martin.master@example.invalid', name: 'Martin Master', mid: 'm_martin', master: true, teams: ['Core Team'] } };
for (const k of Object.keys(P)) {
  P[k].uid = (await (await fetch('http://127.0.0.1:9098/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: P[k].email, password: 'synthetic-only-123', returnSecureToken: true }) })).json()).localId;
}
const at = (days, h) => { const d = new Date(); d.setDate(d.getDate() + days); d.setHours(h, 0, 0, 0); return d; };
const EV = (title, when, extra) => ({ title, description: '', category: 'social', labels: [], visibility: 'public', status: 'confirmed', audience: ['public', 'members'], teams: [],
  featured: false, startLocal: iso(when), startUtc: when.getTime(), endLocal: iso(new Date(when.getTime() + 2 * 3600e3)), endUtc: when.getTime() + 2 * 3600e3, allDay: false,
  location: { kind: 'online' }, organiserName: 'Karen', overseers: [], overseerUids: [], signupOn: false, capacity: 0, image: '', createdBy: 'x', updatedAt: 'x', ...(extra || {}) });
const EVDAY = at(10, 18), SOON = at(1, 18);
await env.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  for (const k of Object.keys(P)) {
    const x = P[k];
    await setDoc(doc(db, 'addressBook', x.mid), { name: x.name, email: x.email, markers: x.teams, adminFor: [], masterAdmin: !!x.master });
    await setDoc(doc(db, 'users', x.uid), { memberId: x.mid, linkedBy: 'admin', name: x.name, email: x.email, teams: x.teams, adminFor: [], masterAdmin: !!x.master, attender: true, status: 'active' });
  }
  await setDoc(doc(db, 'addressBook', 'm_alice'), { name: 'Alice Helper (invented)', email: 'alice@example.invalid', markers: ['Welcome'], adminFor: [], masterAdmin: false });
  await setDoc(doc(db, 'churchSettings', 'details'), { name: 'Test Green Church', enquiryEmail: 'office@example.invalid', logoUrl: '', logoPath: '' });
  await setDoc(doc(db, 'calEvents', 'ev_ck'), EV('Harvest supper (invented)', EVDAY));
  /* Tomorrow's event: a task for Martin due 2 days before - so already late. */
  await setDoc(doc(db, 'calEvents', 'ev_soon'), EV('Quiz night (invented)', SOON));
  await setDoc(doc(db, 'eventChecklists', 'ev_soon'), { tasks: [{ text: 'Print the answer sheets', who: 'm_martin', whoName: 'Martin Master', dueDays: 2, note: '', done: false }], assignees: ['m_martin'], calEventId: 'ev_soon', startUtc: SOON.getTime(), title: 'Quiz night (invented)' });
});
const get = async (c, id) => { let out = null; await env.withSecurityRulesDisabled(async (x) => { const s = await getDoc(doc(x.firestore(), c, id)); out = s.exists() ? s.data() : null; }); return out; };

const errors = [], browsers = [];
async function browser(who, width) {
  const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', userDataDir: fs.mkdtempSync(path.join(TMP, who + '-')), args: ['--no-first-run'] });
  GUARD.watchBrowser(b); browsers.push(b);
  const p = await b.newPage();
  await GUARD.protect(p, who);
  await p.evaluateOnNewDocument((k) => { try { sessionStorage.setItem(k, '1'); } catch (e) {} }, 'egbc_fresh_' + STAMP);
  await p.setViewport({ width: width || 1100, height: 900 });
  p.on('pageerror', e => errors.push(who + ': ' + e.message));
  p.on('dialog', d => d.accept());
  await p.goto(URLB + 'whatson.html', { waitUntil: 'networkidle2' });
  await p.waitForFunction(() => window.firebase && firebase.apps.some(a => a.name === 'egbc'));
  if ((await p.evaluate(() => EGBCAuth.db._delegate._settings.host)) !== 'localhost:8182') throw new Error('Not on the events emulator');
  if (P[who]) await p.evaluate((e) => firebase.auth(firebase.app('egbc')).signInWithEmailAndPassword(e, 'synthetic-only-123'), P[who].email);
  return p;
}
const text = (p, sel) => p.$eval(sel || 'body', e => e.innerText.replace(/\s+/g, ' '));
const val = (p, sel, v) => p.$eval(sel, (e, v) => { e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); }, v);
const tasks = async () => ((await get('eventChecklists', 'ev_ck')) || {}).tasks || [];
const openChecklist = async (M) => {
  await M.goto(URLB + 'events-admin.html', { waitUntil: 'networkidle2' });
  await until(() => M.$('.open[data-id="ev_ck"]'));
  await M.$eval('.open[data-id="ev_ck"]', e => e.click());
  await until(() => M.$('[data-tab="checklist"]'));
  await M.$eval('[data-tab="checklist"]', e => e.click());
  await until(() => M.$$eval('#ckPeople option', o => o.length > 0));
};
const addTask = async (M, t, who, when, note) => {
  await val(M, '#ckNew', t); await val(M, '#ckWho', who || ''); await M.select('#ckWhen', when); await val(M, '#ckNote', note || '');
  const n = (await tasks()).length;
  await M.$eval('#ckAdd', b => b.click());
  await until(async () => (await tasks()).length === n + 1);
  await until(() => M.$('#ckNew'));
};

try {
  const M = await browser('martin');
  await openChecklist(M);
  /* ---------- 1. who, when, a note; told by email ---------- */
  await M.evaluate(() => { window.__egbcOutbox.length = 0; });
  await addTask(M, 'Chairs out in the hall', 'Alice Helper (invented)', '2', 'The stacking ones by the stage');
  const t1 = (await tasks())[0];
  ok('1. A TASK WITH WHO, WHEN AND A NOTE', t1.text === 'Chairs out in the hall' && t1.who === 'm_alice' && t1.whoName === 'Alice Helper (invented)' && t1.dueDays === 2 && t1.note === 'The stacking ones by the stage' && !t1.done, J(t1));
  ok('   and the checklist knows Alice has a task on it', J(((await get('eventChecklists', 'ev_ck')) || {}).assignees) === '["m_alice"]');
  const due2 = new Date(EVDAY); due2.setHours(0, 0, 0, 0); due2.setDate(due2.getDate() - 2);
  const mail = await until(() => M.evaluate(() => (window.__egbcOutbox || []).map(e => e.payload).find(p => p && /^A task for Harvest supper/.test(p.subject))));
  ok('   ALICE IS TOLD BY EMAIL: the task, by when, and the note', mail && J(mail.to) === '["alice@example.invalid"]' && /Chairs out in the hall/.test(mail.html) && /The stacking ones/.test(mail.html) && /By /.test(mail.html), J(mail).slice(0, 400));
  await addTask(M, 'Book the AV desk', 'Martin Master', '7', '');
  await addTask(M, 'Urn on', '', '0', '');
  /* ---------- 2. due dates, progress, order, change ---------- */
  const row0 = await text(M, '[data-task="0"]');
  ok('2. ITS DUE DATE, from the event: 2 days before', row0.includes('Due ' + short(due2)) && /Alice Helper/.test(row0), row0);
  ok('   the list says how far along it is', /0 of 3 done/.test(await text(M, '#ckSum')));
  await M.$eval('.ck-up[data-i="2"]', b => b.click());
  await until(async () => (await tasks())[1].text === 'Urn on');
  ok('   tasks move up and down', (await tasks()).map(t => t.text).join('|') === 'Chairs out in the hall|Urn on|Book the AV desk');
  await until(() => M.$('.ck-edit[data-i="0"]'));
  await M.evaluate(() => { window.__egbcOutbox.length = 0; });
  await M.$eval('.ck-edit[data-i="0"]', b => b.click());
  await until(async () => (await M.$eval('#ckNew', e => e.value)) === 'Chairs out in the hall');
  await M.select('#ckWhen', '3');
  await M.$eval('#ckAdd', b => b.click());
  await until(async () => (await tasks())[0].dueDays === 3);
  await sleep(600);
  ok('   CHANGED: now 3 days before; Alice is not emailed again for the same task', (await tasks())[0].dueDays === 3 && (await tasks()).length === 3 &&
    !(await M.evaluate(() => (window.__egbcOutbox || []).some(e => e.payload && /^A task for/.test(e.payload.subject)))));
  await until(() => M.$('.ck[data-i="1"]'));
  await M.$eval('.ck[data-i="1"]', c => c.click());
  await until(async () => (await tasks())[1].done === true);
  await until(async () => /1 of 3 done/.test(await text(M, '#ckSum')));
  ok('   ticked: "1 of 3 done", with who and when', /1 of 3 done/.test(await text(M, '#ckSum')) && (await tasks())[1].by === 'Martin Master');
  await M.screenshot({ path: path.join(HERE, 'checklist-tab.png'), fullPage: true });

  /* ---------- 3. Your tasks ---------- */
  await M.goto(URLB + 'events-admin.html', { waitUntil: 'networkidle2' });
  await until(() => M.$('[data-mytask]'));
  const mine = await M.$$eval('[data-mytask]', r => r.map(x => x.innerText.replace(/\s+/g, ' ')));
  ok('3. YOUR TASKS: the two given to Martin, overdue first and marked', mine.length === 2 && /Print the answer sheets.*Quiz night.*Overdue:/.test(mine[0]) && /Book the AV desk.*Harvest supper.*Due /.test(mine[1]), J(mine));
  ok('   in red', await M.$eval('[data-mytask] span[style*="danger"]', e => /Overdue/.test(e.textContent)));
  await M.$eval('.mt-open[data-ev="ev_soon"]', b => b.click());
  await until(() => M.$('#ckSum'));
  ok('   "Open" opens the event on its checklist', /Print the answer sheets/.test(await text(M, '#ckList')));

  /* ---------- 4. a category's default template ---------- */
  await openChecklist(M);
  await val(M, '#ckTplName', 'Social evening (invented)');
  await M.$eval('#ckTplCat', c => { if (!c.checked) c.click(); });
  await M.$eval('#ckTplSave', b => b.click());
  let tpl = null;
  await until(async () => { await env.withSecurityRulesDisabled(async (x) => { const s = await getDocs(collection(x.firestore(), 'checklistTemplates')); tpl = s.docs[0] ? s.docs[0].data() : null; }); return tpl; });
  ok('4. A TEMPLATE, THE DEFAULT FOR SOCIAL EVENTS, keeps who, when and notes', tpl && tpl.category === 'social' && tpl.tasks.length === 3 && tpl.tasks[0].who === 'm_alice' && tpl.tasks[0].dueDays === 3, J(tpl));
  await M.goto(URLB + 'events-admin.html', { waitUntil: 'networkidle2' });
  await until(() => M.$('#newEv'));
  await M.$eval('#newEv', b => b.click());
  await M.waitForSelector('#f_title');
  await val(M, '#f_title', 'Barn dance (invented)');
  await val(M, '#f_start', iso(at(20, 19))); await val(M, '#f_end', iso(at(20, 22)));
  await M.select('#f_cat', 'social');
  await M.$eval('#save', b => b.click());
  let made = null;
  await until(async () => { await env.withSecurityRulesDisabled(async (x) => { const s = await getDocs(query(collection(x.firestore(), 'calEvents'), where('title', '==', 'Barn dance (invented)'))); made = s.docs[0] ? s.docs[0].id : null; }); return made; });
  const newList = made ? await until(async () => { const c = await get('eventChecklists', made); return c && c.tasks.length === 3 ? c : null; }) : null;
  ok('   A NEW SOCIAL EVENT STARTS WITH IT: who, when and notes, nothing ticked', newList && newList.tasks.every(t => !t.done) && newList.tasks[0].who === 'm_alice' && newList.tasks[0].note === 'The stacking ones by the stage' && J(newList.assignees.sort()) === '["m_alice","m_martin"]', J(newList));

  /* ---------- 5. at 375px ---------- */
  const S = await browser('martin', 375);
  await openChecklist(S);
  ok('5. at 375px nothing scrolls sideways', (await S.evaluate(() => document.scrollingElement.scrollWidth - innerWidth)) <= 0);
  await S.screenshot({ path: path.join(HERE, 'checklist-375.png'), fullPage: true });

  ok('no page errors', errors.length === 0, errors.join(' | '));
} catch (e) {
  ok('the run finished', false, e.stack || e.message);
} finally {
  for (const b of browsers) await b.close().catch(() => {});
  await env.cleanup(); server.close();
  const leaks = GUARD.leaks();
  ok('nothing left the machine', leaks.length === 0, leaks.join(' | '));
}
const passed = results.filter(Boolean).length;
console.log('\n' + passed + '/' + results.length + ' passed');
process.exit(passed === results.length ? 0 : 1);
