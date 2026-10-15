/* Sending as a team (R9; F-208). Events window. Invented people only,
   events emulators only (with the hub's functions), network guard. Nothing
   is emailed: on the emulator every email lands in emailOutbox.

     npx firebase emulators:exec --config firebase.events.json --only auth,firestore,storage,functions \
       --project egbc-worship-planner "node screenshots/events/team-mail.test.mjs"

   What it proves:
     1. SHUT until switch-over: the settings page says so; nothing saves;
        nobody can send as a team (the live site's state)
     2. ONE LIST OF TEAMS: until Teams & Groups lands, the hub's built-in
        teams plus Martin's ten; once `teams` has teams, exactly those, by
        their names, archived ones left out. Nothing here adds, renames or
        removes a team. A master admin names the Pastor and the office
        admin, and sets a team's address, leads and deputies
     3. WHO MAY SEND: leads and deputies; the Pastor and the office admin
        for every team but Safeguarding. SAFEGUARDING: its lead and deputy
        ONLY - the Pastor, the office admin and a master admin are refused
     4. a Safeguarding email: one per person, replies to the team's address,
        a copy to its mailbox, and the hub keeps the OUTLINE ONLY
     5. a team with no address: replies go to the sender; no copy; the
        email is kept as usual
     6. events-admin "Email everyone": "Send as" lists only the teams the
        person may use; sent as the Worship team
     7. Emails sent shows "Team email: Safeguarding", sent by Sally (as the
        Safeguarding team)
     8. renamed or archived on Teams & Groups: team emails follow; clear a
        team's settings; only a master admin may change anything; no page
        may write the settings directly; others can't read them
     9. bad addresses dropped, the same person once, at most 300 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';
import { createGuard } from './guard.mjs';
const GUARD = createGuard();

const HERE = path.dirname(fileURLToPath(import.meta.url));
const V2 = path.resolve(HERE, '..', '..');
const PROJECT = 'egbc-worship-planner';
if (process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8182' && process.env.FIRESTORE_EMULATOR_HOST !== 'localhost:8182') throw new Error('Not run under the events emulators: ' + process.env.FIRESTORE_EMULATOR_HOST);
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'egbc-teammail-'));
const STAMP = JSON.parse(fs.readFileSync(path.join(V2, 'version.json'), 'utf8').replace(/^\uFEFF/, '')).stamp;
const fnRequire = createRequire(path.join(V2, 'functions', 'index.js'));
const { initializeApp } = fnRequire('firebase-admin/app');
const { getFirestore } = fnRequire('firebase-admin/firestore');
initializeApp({ projectId: PROJECT });
const db = getFirestore();

const results = [];
function ok(name, pass, why) { results.push(!!pass); console.log((pass ? '  PASS  ' : '  FAIL  ') + name + (pass || !why ? '' : '\n          ' + String(why).slice(0, 700))); }
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function until(fn, ms = 20000) { const end = Date.now() + ms; let last; while (Date.now() < end) { try { last = await fn(); if (last) return last; } catch (e) { last = null; } await sleep(250); } return last; }
const J = (x) => JSON.stringify(x);
const pad = (n) => (n < 10 ? '0' : '') + n;
const iso = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes());

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

/* ---------- invented church ---------- */
await fetch(`http://127.0.0.1:8182/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' });
await fetch(`http://127.0.0.1:9098/emulator/v1/projects/${PROJECT}/accounts`, { method: 'DELETE' });
const P = {
  martin: { email: 'martin.master@example.invalid', name: 'Martin Master', mid: 'm_martin', master: true, teams: ['Core Team'] },
  sally:  { email: 'sally.sglead@example.invalid', name: 'Sally Sglead (invented)', mid: 'm_sally', teams: [] },
  dave:   { email: 'dave.deputy@example.invalid', name: 'Dave Deputy (invented)', mid: 'm_dave', teams: [] },
  pat:    { email: 'pat.pastor@example.invalid', name: 'Pat Pastor (invented)', mid: 'm_pat', teams: ['Core Team'] },
  olive:  { email: 'olive.office@example.invalid', name: 'Olive Office (invented)', mid: 'm_olive', teams: ['Office'], adminFor: ['Office'] },
  wendy:  { email: 'wendy.worship@example.invalid', name: 'Wendy Worship (invented)', mid: 'm_wendy', teams: ['Worship Team'] },
  sam:    { email: 'sam.someone@example.invalid', name: 'Sam Someone (invented)', mid: 'm_sam', teams: [] }
};
for (const k of Object.keys(P)) {
  P[k].uid = (await (await fetch('http://127.0.0.1:9098/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: P[k].email, password: 'synthetic-only-123', returnSecureToken: true }) })).json()).localId;
  const x = P[k];
  await db.collection('addressBook').doc(x.mid).set({ name: x.name, email: x.email, markers: x.teams, adminFor: x.adminFor || [], masterAdmin: !!x.master });
  await db.collection('users').doc(x.uid).set({ memberId: x.mid, linkedBy: 'admin', name: x.name, email: x.email, teams: x.teams, adminFor: x.adminFor || [], masterAdmin: !!x.master, attender: true, status: 'active' });
}
await db.collection('churchSettings').doc('details').set({ name: 'Test Green Church', enquiryEmail: 'office@example.invalid' });
await db.collection('churchSettings').doc('launch').set({ rulesLocked: true, opensOn: '' });
const start = new Date(); start.setDate(start.getDate() + 6); start.setHours(19, 0, 0, 0);
await db.collection('calEvents').doc('ev_quiz').set({ title: 'Quiz night (invented)', description: '', category: 'social', labels: [], visibility: 'public', status: 'confirmed', audience: ['public', 'members'], teams: [],
  featured: false, startLocal: iso(start), startUtc: start.getTime(), endLocal: iso(new Date(start.getTime() + 2 * 3600e3)), endUtc: start.getTime() + 2 * 3600e3, allDay: false,
  location: { kind: 'online' }, organiserName: 'Olive', overseers: [], overseerUids: [], signupOn: true, capacity: 30, allowSelfCancel: true, donationsOn: false, signupScope: 'date', image: '', createdBy: P.olive.uid, updatedAt: 'x' });
await db.collection('capacity').doc('ev_quiz').set({ calEventId: 'ev_quiz', taken: 2, capacity: 30 });
for (const [k, n, e] of [['su_a_00000000000000000000000000', 'Amy Attendee (invented)', 'amy.attendee@example.invalid'], ['su_b_00000000000000000000000000', 'Ben Attendee (invented)', 'ben.attendee@example.invalid']]) {
  await db.collection('signups').doc(k).set({ calEventId: 'ev_quiz', personKind: 'guest', personId: '', name: n, email: e, phone: '', attendees: [{ name: n }], answers: {}, places: 1, ticketTypeId: '', status: 'confirmed', donation: 0, notes: '', memberUid: '', createdAt: new Date().toISOString() });
}
await sleep(3000); /* the sign-ups' own confirmations go first */
const SHUTDOC = db.collection('teamMailSettings').doc('config');

const errors = [], browsers = [];
async function browser(who, width) {
  const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', userDataDir: fs.mkdtempSync(path.join(TMP, who + '-')), args: ['--no-first-run'] });
  GUARD.watchBrowser(b); browsers.push(b);
  const pg = await b.newPage();
  await GUARD.protect(pg, who);
  await pg.evaluateOnNewDocument((k) => { try { sessionStorage.setItem(k, '1'); } catch (e) {} }, 'egbc_fresh_' + STAMP);
  await pg.setViewport({ width: width || 1100, height: 900 });
  pg.on('pageerror', e => errors.push(who + ': ' + e.message));
  pg.on('dialog', d => d.accept());
  await pg.goto(URLB + 'whatson.html', { waitUntil: 'networkidle2' });
  await pg.waitForFunction(() => window.firebase && firebase.apps.some(a => a.name === 'egbc'));
  if ((await pg.evaluate(() => EGBCAuth.db._delegate._settings.host)) !== 'localhost:8182') throw new Error('Not on the events emulator');
  await pg.evaluate((e) => firebase.auth(firebase.app('egbc')).signInWithEmailAndPassword(e, 'synthetic-only-123'), P[who].email);
  return pg;
}
const text = (pg, sel) => pg.$eval(sel || 'body', e => e.innerText.replace(/\s+/g, ' '));
const call = (pg, name, data) => pg.evaluate((n, d) => EGBCAuth.call(n, d).then(r => ({ ok: true, r }), e => ({ ok: false, code: e.code, msg: e.message })), name, data);
const teams = async () => (await db.collection('teamMailboxes').get()).docs.map(d => ({ id: d.id, ...d.data() }));
const outbox = async (filter) => (await db.collection('emailOutbox').get()).docs.map(d => d.data()).filter(m => m.source === 'team-mail' && (!filter || filter(m)));

try {
  /* ---------- 1. shut ---------- */
  await SHUTDOC.set({ shutForTest: true });
  const M = await browser('martin');
  await M.goto(URLB + 'team-mail.html', { waitUntil: 'networkidle2' });
  await until(() => M.$('#shut'));
  ok('1. SHUT UNTIL SWITCH-OVER: the page says "Team emails open when the church switches over to the new hub"', /Team emails open when the church switches over to the new hub/.test(await text(M, '#shut')));
  await until(() => M.$('[data-team="Safeguarding"] .tSave'));
  await M.$eval('[data-team="Safeguarding"] .tSave', b => b.click());
  await until(async () => /switches over/.test(await text(M, '[data-team="Safeguarding"] .tMsg')));
  ok('   nothing saves (refused, in those words)', (await teams()).length === 0 && /switches over/.test(await text(M, '[data-team="Safeguarding"] .tMsg')));
  await db.collection('teamMailboxes').doc('Worship Team').set({ address: '', leads: ['m_wendy'], deputies: [], safeguarding: false });
  const W0 = await browser('wendy');
  const pre = await call(W0, 'sendAsTeam', { teamId: 'Worship Team', subject: 'x', text: 'x', to: [{ email: 'amy.attendee@example.invalid' }] });
  ok('   and nobody can send as a team, even its lead', !pre.ok && /switches over/.test(pre.msg) && (await outbox()).length === 0, J(pre));
  await db.collection('teamMailboxes').doc('Worship Team').delete();
  await SHUTDOC.set({ shutForTest: false });

  /* ---------- 2. one list of teams; the settings ---------- */
  await M.goto(URLB + 'team-mail.html', { waitUntil: 'networkidle2' });
  await until(() => M.$('[data-team]'));
  ok('2. SWITCHED OVER: no shut note', !(await M.$('#shut')));
  const cards0 = await M.$$eval('[data-team]', cs => cs.map(c => c.getAttribute('data-team')));
  ok('   UNTIL TEAMS & GROUPS LANDS (no teams yet): the hub\'s built-in teams plus Martin\'s ten, each once', ['Worship Team', 'AV Team', 'Kids Church', 'Maintenance', 'Safeguarding', 'Pastoral', 'Church office', 'Welcome team'].every(t => cards0.includes(t)) && new Set(cards0).size === cards0.length, J(cards0));
  ok('   NO WAY TO ADD, RENAME OR REMOVE A TEAM HERE; it says where', !(await M.$('#addTeam')) && !(await M.$('#usual')) && !(await M.$('.tRemove')) && !(await M.$('input.tName')) && /Teams & Groups/.test(await text(M, '#teamsFrom')));
  /* The main window's Teams & Groups page lands: the one list. */
  for (const [id, x] of [['Safeguarding', { name: 'Safeguarding', label: 'Safeguarding', rota: false, order: 1 }], ['Worship Team', { name: 'Worship Team', label: 'Worship', rota: true, order: 2 }],
    ['Office', { name: 'Office', label: 'Office', rota: false, order: 3 }], ['Old Group', { name: 'Old Group', label: 'Old Group', rota: false, archived: true, order: 4 }]]) await db.collection('teams').doc(id).set(x);
  await M.goto(URLB + 'team-mail.html', { waitUntil: 'networkidle2' });
  await until(() => M.$('[data-team]'));
  const cards1 = await M.$$eval('[data-team]', cs => cs.map(c => c.getAttribute('data-team') + '=' + c.querySelector('.tName').textContent));
  ok('   ONCE IT LANDS: exactly its teams, by their names (Worship Team shows as "Worship"), the archived one left out', J(cards1) === J(['Safeguarding=Safeguarding', 'Worship Team=Worship', 'Office=Office']), J(cards1));
  await M.select('#pastor', 'm_pat'); await M.select('#office', 'm_olive');
  await M.$eval('#saveWho', b => b.click());
  await until(async () => /Saved/.test(await text(M, '#whoMsg')));
  const who = (await db.collection('teamMailSettings').doc('main').get()).data();
  ok('   the Pastor and the office admin, named people', who.pastor === 'm_pat' && who.officeAdmin === 'm_olive', J(who));
  const SG = 'Safeguarding';
  const card = '[data-team="' + SG + '"]';
  await M.$eval(card + ' .tAddr', e => { e.value = 'safeguarding@example.invalid'; });
  await M.select(card + ' [data-add="leads"]', 'm_sally');
  await M.select(card + ' [data-add="deputies"]', 'm_dave');
  await M.$eval(card + ' .tSafe', c => { if (!c.checked) c.click(); });
  ok('   Safeguarding says who may send: "Only its lead and deputy ... not the Pastor, the office admin or a master admin"', /Only its lead and deputy may send as this team: not the Pastor, the office admin or a master admin/.test(await text(M, card)));
  await M.$eval(card + ' .tSave', b => b.click());
  await until(async () => /Saved/.test(await text(M, card + ' .tMsg')));
  const sg = (await db.collection('teamMailboxes').doc(SG).get()).data();
  ok('   saved under the team\'s own id: the address, Sally as lead, Dave as deputy - and no team name kept here', sg.address === 'safeguarding@example.invalid' && J(sg.leads) === J(['m_sally']) && J(sg.deputies) === J(['m_dave']) && sg.safeguarding === true && !('name' in sg), J(sg));
  await M.screenshot({ path: path.join(HERE, 'team-mail-settings.png'), fullPage: true });
  const WO = 'Worship Team';
  const w1 = await call(M, 'teamMailSave', { team: { id: WO, address: '', leads: ['m_wendy'], deputies: [], safeguarding: false } });
  ok('   Worship: Wendy leads, no address', w1.ok, J(w1));

  /* ---------- 3. who may send ---------- */
  const mine = async (who) => { const pg = await browser(who); const r = await call(pg, 'teamMailMine', {}); return { pg, names: r.ok ? r.r.teams.map(t => t.name) : r.msg }; };
  const S = await mine('sally'), D = await mine('dave'), PT = await mine('pat'), O = await mine('olive'), W = await mine('wendy'), SM = await mine('sam');
  const MM = { pg: M, names: (await call(M, 'teamMailMine', {})).r.teams.map(t => t.name) };
  const nine = ['Worship', 'Office'];
  ok('3. WHO MAY SEND: Sally and Dave - Safeguarding only; Wendy - Worship only', J(S.names) === J(['Safeguarding']) && J(D.names) === J(['Safeguarding']) && J(W.names) === J(['Worship']), J([S.names, D.names, W.names]));
  ok('   the Pastor and the office admin: every team BUT Safeguarding', J(PT.names) === J(nine) && J(O.names) === J(nine), J([PT.names, O.names]));
  ok('   a master admin, as such, and someone on nothing: no team', J(MM.names) === '[]' && J(SM.names) === '[]', J([MM.names, SM.names]));
  const body = { teamId: SG, subject: 'A note from safeguarding', text: 'Hello.', to: [{ email: 'amy.attendee@example.invalid', name: 'Amy' }] };
  const rp = await call(PT.pg, 'sendAsTeam', body), rm = await call(M, 'sendAsTeam', body), ro = await call(O.pg, 'sendAsTeam', body);
  ok('   SAFEGUARDING: THE PASTOR IS REFUSED', !rp.ok && /can't send as the Safeguarding team/.test(rp.msg), J(rp));
  ok('   SAFEGUARDING: A MASTER ADMIN IS REFUSED', !rm.ok && /can't send as the Safeguarding team/.test(rm.msg), J(rm));
  ok('   SAFEGUARDING: the office admin is refused', !ro.ok && /can't send as the Safeguarding team/.test(ro.msg), J(ro));
  const rw = await call(M, 'sendAsTeam', { ...body, teamId: WO });
  ok('   and a master admin can\'t send as Worship either (not a lead, the Pastor or the office admin)', !rw.ok && /can't send as the Worship team/.test(rw.msg), J(rw));
  ok('   nothing was sent by any of them', (await outbox()).length === 0);

  /* ---------- 4. a safeguarding email ---------- */
  const r4 = await call(S.pg, 'sendAsTeam', { teamId: SG, subject: 'Your DBS check', text: 'Please bring your ID on Sunday.\nThank you.', to: [{ email: 'amy.attendee@example.invalid', name: 'Amy' }, { email: 'ben.attendee@example.invalid', name: 'Ben' }] });
  const sgRows = await until(async () => { const r = await outbox(m => m.asTeam === 'Safeguarding'); return r.length === 3 ? r : null; }) || await outbox(m => m.asTeam === 'Safeguarding');
  const each = sgRows.filter(m => m.kind === 'team email'), copy = sgRows.find(m => m.kind === 'team email copy');
  ok('4. SALLY SENDS AS SAFEGUARDING: one email per person (nobody sees the other), "Safeguarding: Your DBS check"', r4.ok && r4.r.sent === 2 && each.length === 2 && each.every(m => m.to.length === 1 && m.subject === 'Safeguarding: Your DBS check'), J(r4) + J(each.map(m => m.to)));
  ok('   replies go to the team\'s address', sgRows.every(m => m.replyTo === 'safeguarding@example.invalid'));
  ok('   a copy to the team\'s mailbox', copy && J(copy.to) === J(['safeguarding@example.invalid']) && r4.r.copied === true);
  ok('   THE HUB KEEPS THE OUTLINE ONLY: when, who, subject - no email', sgRows.every(m => m.html === '' && m.at && m.subject && m.sentBy === 'Sally Sglead (invented)') && !J(sgRows).includes('bring your ID'), J(sgRows).slice(0, 300));

  /* ---------- 5. no address ---------- */
  const r5 = await call(W.pg, 'sendAsTeam', { teamId: WO, subject: 'Practice moved', text: 'Thursday at 8.', to: [{ email: 'amy.attendee@example.invalid' }] });
  const wr = await until(async () => { const r = await outbox(m => m.asTeam === 'Worship'); return r.length ? r : null; }) || [];
  ok('5. A TEAM WITH NO ADDRESS: replies go to the sender (Wendy); no copy', r5.ok && r5.r.copied === false && wr.length === 1 && wr[0].replyTo === P.wendy.email, J(wr.map(m => [m.to, m.replyTo, m.kind])));
  ok('   the email is kept as usual, and says it is from the Worship team', /From the Worship team, Test Green Church/.test(wr[0] && wr[0].html) && /Reply to this email to reach Wendy Worship/.test(wr[0].html), wr[0] && wr[0].html.slice(0, 300));

  /* ---------- 6. events-admin ---------- */
  await O.pg.goto(URLB + 'events-admin.html', { waitUntil: 'networkidle2' });
  await until(() => O.pg.$('.open[data-id="ev_quiz"]'));
  await O.pg.$eval('.open[data-id="ev_quiz"]', e => e.click());
  await until(() => O.pg.$('[data-tab="people"]'));
  await O.pg.$eval('[data-tab="people"]', e => e.click());
  await until(() => O.pg.$('#mailAll'));
  await O.pg.$eval('#mailAll', b => b.click());
  await until(() => O.pg.$('#mailAs'));
  const asOpts = await O.pg.$$eval('#mailAs option', os => os.map(o => o.textContent));
  ok('6. EVENTS "Email everyone": Send as lists Myself and the teams Olive may use - never Safeguarding', asOpts[0] === 'Myself (replies come to me)' && asOpts.length === 3 && !asOpts.some(o => /Safeguarding/.test(o)) && asOpts.includes('The Worship team (replies come to me)'), J(asOpts));
  await O.pg.screenshot({ path: path.join(HERE, 'team-mail-send-as.png') });
  await O.pg.select('#mailAs', WO);
  await O.pg.$eval('#mailText', e => { e.value = 'See you on Friday.'; });
  await O.pg.$eval('#mailSend', b => b.click());
  const qr = await until(async () => { const r = await outbox(m => m.asTeam === 'Worship' && m.sentBy === 'Olive Office (invented)'); return r.length === 2 ? r : null; }) || [];
  ok('   sent as the Worship team to the 2 people coming, by Olive, replies to Olive', qr.length === 2 && qr.every(m => m.subject === 'Worship: Quiz night (invented)' && m.replyTo === P.olive.email && m.calEventId === 'ev_quiz'), J(qr.map(m => [m.to, m.subject, m.replyTo])));

  /* ---------- 7. Emails sent ---------- */
  await M.goto(URLB + 'comms.html', { waitUntil: 'networkidle2' });
  await until(() => M.$('[data-row]'));
  const rows = await M.$$eval('[data-row]', r => r.map(x => x.innerText.replace(/\s+/g, ' ')));
  ok('7. EMAILS SENT: "Team email: Safeguarding", sent by Sally (as the Safeguarding team)', rows.some(r => /Team email: Safeguarding/.test(r) && /Sally Sglead \(invented\) \(as the Safeguarding team\)/.test(r)), J(rows.slice(0, 4)));

  /* ---------- 8. renamed or archived on Teams & Groups; cleared ---------- */
  await db.collection('teams').doc('Worship Team').update({ label: 'Worship & Music' });
  await db.collection('teams').doc('Office').update({ archived: true });
  const W8 = (await call(W.pg, 'teamMailMine', {})).r.teams.map(t => t.name), O8 = (await call(O.pg, 'teamMailMine', {})).r.teams.map(t => t.name);
  const ro8 = await call(O.pg, 'sendAsTeam', { teamId: 'Office', subject: 'x', text: 'x', to: [{ email: 'amy.attendee@example.invalid' }] });
  ok('8. RENAMED ON TEAMS & GROUPS ("Worship & Music") and ARCHIVED (Office): team emails follow, and nobody sends as an archived team', J(W8) === J(['Worship & Music']) && J(O8) === J(['Worship & Music']) && !ro8.ok && /archived/.test(ro8.msg), J([W8, O8, ro8.msg]));
  await M.goto(URLB + 'team-mail.html', { waitUntil: 'networkidle2' });
  await until(() => M.$('[data-team]'));
  ok('   and the settings page shows the new name, without the archived team', J(await M.$$eval('[data-team] .tName', t => t.map(x => x.textContent))) === J(['Safeguarding', 'Worship & Music']));
  await M.$eval('[data-team="Worship Team"] .tClear', b => b.click());
  await until(async () => !(await db.collection('teamMailboxes').doc('Worship Team').get()).exists);
  ok('   "Clear these settings": the mail settings go; the team stays on the one list', !(await db.collection('teamMailboxes').doc('Worship Team').get()).exists && (await db.collection('teams').doc('Worship Team').get()).exists);
  const nm = await call(PT.pg, 'teamMailSave', { team: { id: SG, name: 'Safeguarding', address: '', leads: ['m_pat'], deputies: [], safeguarding: true } });
  ok('   ONLY A MASTER ADMIN may change anything (the Pastor can\'t make themselves Safeguarding lead)', !nm.ok && /Only a master admin/.test(nm.msg) && J((await db.collection('teamMailboxes').doc(SG).get()).data().leads) === J(['m_sally']), J(nm));
  const direct = await M.evaluate((id) => EGBCAuth.db.collection('teamMailboxes').doc(id).update({ leads: ['m_martin'] }).then(() => 'written', e => e.code), SG);
  const peek = await W.pg.evaluate(() => EGBCAuth.db.collection('teamMailboxes').get().then(() => 'read', e => e.code));
  ok('   no page may write the settings, a master admin included; others can\'t read them', /permission/.test(direct) && /permission/.test(peek), J([direct, peek]));

  /* ---------- 9. recipients ---------- */
  const before9 = (await outbox()).length;
  const r9 = await call(S.pg, 'sendAsTeam', { teamId: SG, subject: 'Check', text: 'x', to: [{ email: 'amy.attendee@example.invalid' }, { email: 'AMY.attendee@example.invalid' }, { email: 'not-an-address' }] });
  const many = await call(S.pg, 'sendAsTeam', { teamId: SG, subject: 'Check', text: 'x', to: Array.from({ length: 301 }, (_, i) => ({ email: 'p' + i + '@example.invalid' })) });
  await sleep(1500);
  ok('9. THE SAME PERSON ONCE, a bad address dropped; more than 300: refused', r9.ok && r9.r.sent === 1 && !many.ok && /At most 300/.test(many.msg) && (await outbox()).length === before9 + 2, J([r9, many.msg]));

  ok('no page errors', errors.length === 0, errors.join(' | '));
} catch (e) {
  ok('the run finished', false, e.stack || e.message);
} finally {
  for (const b of browsers) await b.close().catch(() => {});
  server.close();
  const leaks = GUARD.leaks();
  ok('nothing left the machine', leaks.length === 0, leaks.join(' | '));
}
const passed = results.filter(Boolean).length;
console.log('\n' + passed + '/' + results.length + ' passed');
process.exit(passed === results.length ? 0 : 1);
