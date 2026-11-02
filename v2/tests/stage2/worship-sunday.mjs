/* GOING-LIVE TEST, STAGE 2: A WORSHIP SUNDAY, START TO FINISH
 * (test-first-stage.md, Stage 2: the checklist journeys).
 *
 *   APPDATA=<empty folder> CLOUDSDK_CONFIG=<empty folder> XDG_CONFIG_HOME=<empty folder> \
 *     firebase emulators:exec --config firebase.spare.json --only firestore,auth,storage,functions --project egbc-worship-planner "node tests/stage2/worship-sunday.mjs"
 *   ONLY=signin,availability ...   just those journeys
 *
 * The empty folders hide this computer's Google sign-in from the emulator.
 * Without them the functions emulator fetches every secret (Resend, Daily,
 * Unsplash...) from the live project, and anything it does not emulate
 * reaches production. With them it says "Unable to access secret", which is
 * what a test wants.
 *
 * In a browser, with the locked rules, on the spare emulators, made-up people
 * only. Each journey uses the pages the way a person does, in one session:
 * the clicks, the boxes, the lists. Nothing is sent: on the functions
 * emulator every email is an emailOutbox row, read here.
 *
 * Each journey is a list of checks; a journey that cannot start says why, and
 * its checks are counted as not reached, never skipped quietly.
 */
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { serve, browser, person, signIn, put, get, all, wipe, sleep, req, PORTS, PROJECT } from './harness.mjs';
import { EGBC_UNDER18 } from '../../functions/under18-teams.js';
import { boardsOf } from '../../functions/team-boards.js';

const SERVE = 8997, BASE = 'http://localhost:' + SERVE;
const ONLY = (process.env.ONLY || '').split(',').filter(Boolean);
const R = [], FAULTS = [], NOT_REACHED = [];
let WHERE = '';
const ok = (n, v, x) => {
  R.push(!!v);
  if (!v) FAULTS.push(WHERE + ': ' + n);
  console.log('  ' + (v ? 'PASS  ' : 'FAIL  ') + n + (v || x === undefined ? '' : '\n          ' + String(x).slice(0, 500)));
  return !!v;
};
const notReached = (what, why) => { NOT_REACHED.push(WHERE + ': ' + what + ' (' + why + ')'); console.log('  NOT REACHED  ' + what + ' - ' + why); };
/** Polls fn until it gives something truthy, or ms pass. */
async function until(fn, ms = 15000) { const end = Date.now() + ms; let last; while (Date.now() < end) { try { last = await fn(); if (last) return last; } catch (e) { last = null; } await sleep(250); } return last; }
const ymd = (d) => d.toISOString().slice(0, 10);
/* The next n days of the week w (0 Sunday) after today, as yyyy-mm-dd. */
function next(w, n) {
  const out = [], d = new Date(); d.setUTCHours(12, 0, 0, 0);
  do d.setUTCDate(d.getUTCDate() + 1); while (d.getUTCDay() !== w);
  for (let i = 0; i < n; i++) { out.push(ymd(d)); d.setUTCDate(d.getUTCDate() + 7); }
  return out;
}

/* ---- the made-up church ---- */
const SUN = next(0, 6);
const P = {};
async function seed() {
  await wipe();
  await put('teamFlags/under18', { teams: EGBC_UNDER18.slice().sort() });
  await put('teamFlags/boards', { boards: boardsOf([]) });
  P.lead = await person({ key: 'ws_lead', name: 'Wendy Leader Synthetic', teams: ['Worship Team', 'AV Team'], adminFor: ['Worship Team', 'AV Team'], book: { primaryInstruments: ['Worship Leader', 'Guitar'] } });
  P.singer = await person({ key: 'ws_singer', name: 'Sam Singer Synthetic', teams: ['Worship Team'], book: { primaryInstruments: ['Singer'], maxFrequency: 1 } });
  P.drums = await person({ key: 'ws_drums', name: 'Dan Drums Synthetic', teams: ['Worship Team'], book: { primaryInstruments: ['Drums'] } });
  P.sound = await person({ key: 'ws_sound', name: 'Sue Sound Synthetic', teams: ['AV Team'], book: { primaryInstruments: ['Sound'] } });
  P.young = await person({ key: 'ws_young', name: 'Yan Young Synthetic', teams: ['Worship Team'], minor: true, book: { primaryInstruments: ['Singer'] } });
  P.kids = await person({ key: 'ws_kids', name: 'Kim Kids Synthetic', teams: ['Kids Church'] });
  /* In the address book only: their first sign-in, with Google, links them (whoAmI). */
  P.google = { key: 'ws_google', name: 'Gail Google Synthetic', email: 'ws_google@example.invalid', member: 'ab_ws_google' };
  await put('addressBook/ab_ws_google', { name: P.google.name, email: P.google.email, markers: ['AV Team'], adminFor: [], churchMember: true, archived: false, isMinor: false, primaryInstruments: ['Projection'] });
  P.office = await person({ key: 'ws_office', name: 'Olive Office Synthetic', teams: ['Core Team'], master: true, book: { masterAdmin: true } });
}

/* ---- the pages ---- */
let B;
/* A fresh context is a different person's browser: no sign-in carried over. */
async function open(p, url, wait, fresh) {
  const page = fresh ? await (await B.createBrowserContext()).newPage() : await B.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  page.__said = [];
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|favicon|Could not reach Cloud Firestore backend/.test(m.text())) page.__said.push(m.text().slice(0, 200)); });
  if (process.env.CONSOLE) page.on('console', (m) => console.log('    [console ' + m.type() + '] ' + m.text().slice(0, 300)));
  page.on('pageerror', (e) => page.__said.push('pageerror: ' + String(e.stack || e.message).slice(0, 400)));
  if (p) await signIn(page, BASE, p, url); else await page.goto(BASE + '/' + url, { waitUntil: 'domcontentloaded' });
  if (wait) await page.waitForSelector(wait, { timeout: 30000 }).catch(() => {});
  return page;
}
const asked = (page) => page.evaluate(() => window.__asked || []);
/* The auth emulator's own records: sign-in links, and the accounts. */
const oob = async () => JSON.parse((await req(PORTS.auth, 'GET', '/emulator/v1/projects/' + PROJECT + '/oobCodes')).body || '{}').oobCodes || [];

/* ================= the journeys ================= */
const JOURNEYS = {};

/* 1. Sign in with email (a link), and with Google. */
JOURNEYS.signin = async () => {
  /* Email: the link the emulator would have sent, opened in the same browser. */
  const page = await open(null, 'login.html', '#chooseView', true);
  await page.evaluate(() => route('adult'));
  await page.type('#emailInput', P.singer.email);
  await page.click('#linkBtn');
  ok('email: "check your email" is shown', await until(() => page.$eval('#sentView', (e) => !e.classList.contains('hidden'))), page.__said.join(' | '));
  const link = (await oob()).filter((c) => c.email === P.singer.email && c.requestType === 'EMAIL_SIGNIN').pop();
  ok('email: a sign-in link was made for that address', !!link, JSON.stringify(await oob()).slice(0, 300));
  if (link) {
    await page.goto(link.oobLink.replace(/^https?:\/\/[^/]+/, BASE).replace('/emulator/action', '/login.html'), { waitUntil: 'domcontentloaded' }).catch(() => {});
    const landed = await until(() => page.evaluate(() => /hub\.html/.test(location.pathname) ? location.pathname : ''), 20000);
    ok('email: the link signs in and lands on the hub', !!landed, await page.evaluate(() => location.href + ' ' + (document.body ? document.body.innerText : '').slice(0, 200)));
    const who = await until(() => page.evaluate(() => window.EGBCAuth && EGBCAuth.profile && EGBCAuth.profile() && EGBCAuth.profile().name), 20000);
    ok('email: the hub knows who it is (' + who + ')', who === P.singer.name);
  }
  await page.close();

  /* Google: the emulator's own account screen stands in for Google's. */
  const g = await open(null, 'login.html', '#chooseView', true);
  await g.evaluate(() => route('adult'));
  await g.click('#googleBtn');
  const onWidget = await until(() => g.evaluate(() => /emulator\/auth\/handler/.test(location.href) ? location.href : ''), 20000);
  ok('Google: the sign-in screen opens (the emulator\'s, in place of Google\'s)', !!onWidget, await g.evaluate(() => location.href));
  if (onWidget) {
    await g.waitForSelector('#add-account-button', { timeout: 10000 }).catch(() => {});
    await g.click('#add-account-button').catch(() => {});
    await g.waitForSelector('#email-input', { timeout: 10000 }).catch(() => {});
    await g.type('#email-input', P.google.email).catch(() => {});
    await g.type('#display-name-input', P.google.name).catch(() => {});
    /* Its Sign in button, once the screen's own script has set it up (a press before that posts the form bare). */
    const signBtn = await until(() => g.evaluate(() => { const b = [...document.querySelectorAll('#add-user button')].find((x) => /Sign in with/i.test(x.textContent)); return b && !b.disabled ? true : false; }), 10000);
    await sleep(800);
    if (signBtn) await g.evaluate(() => [...document.querySelectorAll('#add-user button')].find((x) => /Sign in with/i.test(x.textContent)).click());
    const landed = await until(() => g.evaluate(() => /hub\.html/.test(location.pathname) ? location.pathname : ''), 30000);
    ok('Google: back on the hub, signed in', !!landed, await g.evaluate(() => location.href + ' ' + (document.body ? document.body.innerText : '').slice(0, 300)));
    const who = await until(() => g.evaluate(() => window.EGBCAuth && EGBCAuth.profile && EGBCAuth.profile() && EGBCAuth.profile().name), 20000);
    ok('Google: a first sign-in is linked to their address-book record (' + who + ')', who === P.google.name, g.__said.join(' | '));
    const u = (await all('users')).find((x) => x.email === P.google.email);
    ok('Google: their access record lists their team', !!u && (u.teams || []).includes('AV Team'), JSON.stringify(u));
  }
  ok('no errors on the sign-in pages', !g.__said.length, g.__said.join(' | '));
  await g.close();
};

/* 2. Build a term in the Rota planner: Populate makes every Sunday of it. */
const T = {};
JOURNEYS.term = async () => {
  const page = await open(P.lead, 'Planner.html', '#termSelect');
  /* Ready when the page's own code has filled the Term box with years. */
  await until(() => page.evaluate(() => typeof generateTerm === 'function' && /d{4}/.test((document.querySelectorAll('#termSelect option')[3] || {}).value || '')), 30000);
  /* The term after next: every Sunday in it is still to come. */
  T.label = await page.evaluate(() => { const s = document.getElementById('termSelect'); s.value = s.options[3].value; s.dispatchEvent(new Event('change', { bubbles: true })); return s.value; });
  await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => x.getAttribute('onclick') === 'generateTerm()'); b.click(); });
  /* Every Sunday of the term's months, as Populate should make them. */
  const want = (() => { const [nm, yr] = T.label.split(' '); const mm = { Spring: [1, 4], Summer: [5, 8], Autumn: [9, 12] }[nm]; const out = [];
    for (let d = new Date(Date.UTC(+yr, mm[0] - 1, 1, 12)); d.getUTCMonth() + 1 <= mm[1] && d.getUTCFullYear() === +yr; d.setUTCDate(d.getUTCDate() + 1)) if (d.getUTCDay() === 0) out.push(ymd(d));
    return out; })();
  const evs = await until(async () => { const b = (await all('events')).filter((e) => e.termLabel === T.label); return b.length >= want.length ? b : null; }, 60000) || (await all('events')).filter((e) => e.termLabel === T.label);
  T.events = evs.sort((a, b) => a.date < b.date ? -1 : 1);
  ok('Populate made the term\'s Sundays (' + T.label + ': ' + evs.length + ')', evs.length >= 12 && evs.every((e) => new Date(e.date + 'T12:00Z').getUTCDay() === 0), JSON.stringify(evs.map((e) => e.date)));
  const [y, name] = [T.label.split(' ')[1], T.label.split(' ')[0]];
  const m = { Spring: ['01', '04'], Summer: ['05', '08'], Autumn: ['09', '12'] }[name];
  ok('every Sunday of the term (' + want.length + '), and none outside it', JSON.stringify(evs.map((e) => e.date)) === JSON.stringify(want), void m || void y || JSON.stringify(evs.map((e) => e.date)));
  ok('each is a service for the worship and AV teams, with its places', evs.every((e) => (e.teams || []).includes('Worship Team') && (e.teams || []).includes('AV Team') && (e.roles || []).length > 0), JSON.stringify(evs[0]));
  const shown = await until(() => page.evaluate((d) => document.querySelectorAll('[data-date="' + d + '"]').length, T.events[0].date));
  ok('the planner shows them', !!shown);
  ok('no errors on the planner', !page.__said.length, page.__said.join(' | '));
  await page.close();
};

/* 3. Availability: the button changes at once, and Confirm counts it. */
const YES = 'button[onclick^="setStatus"][onclick$="\'avail\')"]', NO = 'button[onclick^="setStatus"][onclick$="\'not-avail\')"]';
JOURNEYS.availability = async () => {
  if (!T.events) return notReached('availability for the term', 'the term was not built');
  const page = await open(null, 'index.html', '#memberEmail', true);
  await page.type('#memberEmail', P.singer.email);
  await page.evaluate(() => loginMember());
  const n = await until(() => page.evaluate((s) => document.querySelectorAll(s).length, YES), 20000);
  ok('signed in by email address, the term\'s dates are listed (' + n + ')', n === T.events.length, n + ' vs ' + T.events.length + ' ' + page.__said.join(' | '));
  const press = (s, i) => page.evaluate((s, i) => document.querySelectorAll(s)[i].click(), s, i);
  await press(YES, 0);
  ok('the ✓ button changes the moment it is pressed', await page.evaluate((s) => document.querySelectorAll(s)[0].getAttribute('aria-pressed') === 'true', YES));
  await press(NO, 1);
  ok('the ✗ button too', await page.evaluate((s) => document.querySelectorAll(s)[1].getAttribute('aria-pressed') === 'true', NO));
  const saved = await until(async () => { const a = (await all('availability')).filter((x) => x.memberId === P.singer.member); return a.length >= 2 ? a : null; });
  ok('each answer is saved as it is pressed', !!saved && saved.find((x) => x.eventId === T.events[0].id).status === 'avail' && saved.find((x) => x.eventId === T.events[1].id).status === 'not-avail', JSON.stringify(saved));
  /* Confirm with dates left: it says how many, and leaves them blank. */
  await page.evaluate(() => { window.__confirm = false; window.__asked.length = 0; submitAll(); });
  await sleep(800);
  const q = (await asked(page)).find((a) => a[0] === 'confirm');
  ok('Confirm with dates unanswered says how many (' + (T.events.length - 2) + ')', !!q && q[1].includes('You still have ' + (T.events.length - 2) + ' date(s)'), JSON.stringify(await asked(page)));
  /* Every date answered: Confirm counts them all and asks nothing. */
  /* At a person's pace: a tap every quarter of a second. */
  await page.evaluate(() => { const a = window.alert; window.alert = (m) => { (window.__tapAlerts = window.__tapAlerts || []).push(m); a(m); }; });
  for (let i = 2; i < T.events.length; i++) { await press(YES, i); await sleep(250); }
  await sleep(2000);
  const tapAlerts = await page.evaluate(() => window.__tapAlerts || []);
  ok('tapping down the list, every answer saves (no message)', !tapAlerts.length, JSON.stringify(tapAlerts));
  /* Confirm thanks, then reloads: what it said is kept past the reload. */
  await page.evaluate(() => { window.__confirm = true; window.__asked.length = 0; const a = window.alert, c = window.confirm;
    window.alert = (m) => { sessionStorage.setItem('__said', 'alert:' + m); a(m); }; window.confirm = (m) => { sessionStorage.setItem('__asked_confirm', m); return c(m); }; });
  await page.evaluate(() => submitAll());
  const thanks = await until(() => page.evaluate(() => sessionStorage.getItem('__said')), 20000);
  const conf = await page.evaluate(() => sessionStorage.getItem('__asked_confirm')).catch(() => 'unknown');
  ok('every date answered: Confirm asks nothing and says thank you', /submitted/.test(thanks || '') && !conf, thanks + ' / ' + conf);
  const mine = (await all('availability')).filter((x) => x.memberId === P.singer.member);
  ok('every answer is on record, once each (' + mine.length + ' of ' + T.events.length + ')', mine.length === T.events.length && new Set(mine.map((x) => x.eventId)).size === mine.length);
  /* Opened again: the answers are still shown. */
  const again = await open(null, 'index.html', '#memberEmail', true);
  await again.type('#memberEmail', P.singer.email); await again.evaluate(() => loginMember());
  const back = await until(() => again.evaluate(() => document.querySelectorAll('button[onclick^="setStatus"][aria-pressed="true"]').length), 20000);
  ok('opened again, every answer is shown', back === T.events.length, back);
  ok('no errors on the form', !page.__said.length && !again.__said.length, page.__said.concat(again.__said).join(' | '));
  await page.close(); await again.close();
  /* The others' answers, put straight in (their form is the same). Dan can't do the second Sunday. */
  for (const who of [P.lead, P.drums, P.sound, P.young]) for (const [i, e] of T.events.entries()) {
    await put('availability/' + who.member + '_' + e.id, { memberId: who.member, eventId: e.id, status: who === P.drums && i === 1 ? 'not-avail' : 'avail' });
  }
};

/* 4. Auto-fill uses the skills and the limits. */
JOURNEYS.autofill = async () => {
  if (!T.events) return notReached('auto-fill', 'the term was not built');
  const page = await open(P.lead, 'Planner.html', '#termSelect');
  await until(() => page.evaluate((d) => typeof autoFillAllEvents === 'function' && document.querySelectorAll('[data-date="' + d + '"]').length, T.events[0].date), 30000);
  await sleep(2000);
  await page.evaluate(() => { window.__asked.length = 0; [...document.querySelectorAll('button')].find((x) => x.getAttribute('onclick') === 'autoFillAllEvents()').click(); });
  const done = await until(async () => (await asked(page)).find((a) => a[0] === 'alert'), 60000);
  ok('Auto-Populate finishes and says so', !!done && /Auto-fill complete/.test(done[1]), JSON.stringify(await asked(page)));
  const evs = (await all('events')).filter((e) => e.termLabel === T.label).sort((a, b) => a.date < b.date ? -1 : 1);
  const av = await all('availability');
  const said = (m, e) => (av.find((a) => a.memberId === m && a.eventId === e) || {}).status;
  const book = Object.fromEntries((await all('addressBook')).map((b) => [b.id, b]));
  const slots = evs.flatMap((e) => Object.entries(e.assignments || {}).flatMap(([role, raw]) => (Array.isArray(raw) ? raw : [raw]).map((p) => ({ e, role, p }))));
  ok('places were filled (' + slots.length + ')', slots.length > 0);
  ok('only people who said they are available', slots.every((x) => said(x.p.id, x.e.id) === 'avail'), JSON.stringify(slots.filter((x) => said(x.p.id, x.e.id) !== 'avail').map((x) => x.e.date + ' ' + x.role + ' ' + x.p.name)));
  ok('Dan is not on the Sunday he can\'t do', !slots.some((x) => x.e.id === evs[1].id && x.p.id === P.drums.member));
  const skillBad = await page.evaluate((slots, book) => slots.filter((x) => !EGBCAuth.hasSkill(book[x.p.id] || {}, EGBCAuth.placeSkill(x.role.replace(/ \d+$/, '')), false)).map((x) => x.role + ' ' + x.p.name), slots.map((x) => ({ role: x.role, p: x.p })), book);
  ok('each place has someone with its skill', !skillBad.length, JSON.stringify(skillBad));
  ok('Drums go to the drummer, sound to the sound person', slots.filter((x) => x.role === 'Drums').every((x) => x.p.id === P.drums.member) && slots.filter((x) => x.role === 'Sound').every((x) => x.p.id === P.sound.member) && slots.some((x) => x.role === 'Drums'));
  const perMonth = {};
  slots.forEach((x) => { const k = x.p.id + ' ' + x.e.date.slice(0, 7); perMonth[k] = (perMonth[k] || 0) + 1; });
  const over = Object.entries(perMonth).filter(([k, n]) => n > (parseInt((book[k.split(' ')[0]] || {}).maxFrequency) || 2));
  ok('nobody serves more often than their limit (Sam once a month, others twice)', !over.length, JSON.stringify(over));
  ok('Sam\'s limit of once a month is used, not ignored', Object.entries(perMonth).some(([k, n]) => k.startsWith(P.singer.member) && n === 1));
  ok('no errors on the planner', !page.__said.length, page.__said.join(' | '));
  await page.close();
};

/* 5. Email the rota: each person's own dates; it arrives; its links open the right page. */
JOURNEYS.emailrota = async () => {
  if (!T.events) return notReached('emailing the rota', 'the term was not built');
  const page = await open(P.lead, 'Planner.html', '#sendTermSelect');
  await until(() => page.evaluate((d) => typeof autoFillAllEvents === 'function' && document.querySelectorAll('[data-date="' + d + '"]').length, T.events[0].date), 30000);
  await sleep(1500);
  /* Each team marks its part done on the term heading. */
  for (let i = 0; i < 4; i++) {
    const n = await page.evaluate((t) => { const b = [...document.querySelectorAll('button')].find((x) => (x.getAttribute('onclick') || '').includes("setSignoff('" + t + "'") && (x.getAttribute('onclick') || '').endsWith(',true)') && !x.disabled); if (b) b.click(); return !!b; }, T.label);
    if (!n) break; await sleep(1500);
  }
  await page.evaluate((t) => { const s = document.getElementById('sendTermSelect'); s.value = t; s.dispatchEvent(new Event('change', { bubbles: true })); }, T.label);
  const before = new Set((await all('emailOutbox')).map((m) => m.id));
  await page.evaluate(() => { window.__asked.length = 0; prepareDistributionPackage(); });
  const toast = await until(() => page.evaluate(() => { const t = [...document.querySelectorAll('div')].find((d) => /Rotas sent to all|Done: /.test(d.textContent || '') && d.style.position === 'fixed'); return t ? t.textContent : ''; }), 600000);
  ok('Send all rotas finishes, with no failures (' + toast + ')', /Rotas sent to all/.test(toast || ''), JSON.stringify(await asked(page)) + ' ' + page.__said.join(' | '));
  const conf = (await asked(page)).find((a) => a[0] === 'confirm');
  ok('before sending, it names who is under 18 and not emailed', !!conf && conf[1].includes('Not emailed, because the hub never emails under-18s: ' + P.young.name), conf && conf[1]);
  ok('and says so again when it is done', /Not emailed \(under 18\): Yan Young Synthetic/.test(toast || ''), toast);
  const mail = (await all('emailOutbox')).filter((m) => !before.has(m.id));
  const evs = (await all('events')).filter((e) => e.termLabel === T.label);
  const placesOf = (id) => evs.flatMap((e) => Object.entries(e.assignments || {}).filter(([, r]) => (Array.isArray(r) ? r : [r]).some((p) => p.id === id)).map(([role]) => ({ date: e.date, role })));
  const onRota = [...new Set(evs.flatMap((e) => Object.values(e.assignments || {}).flatMap((r) => (Array.isArray(r) ? r : [r]).map((p) => p.id))))];
  const book = Object.fromEntries((await all('addressBook')).map((b) => [b.id, b]));
  const to = (m) => JSON.stringify(m.to || m.recipients || '');
  const adults = onRota.filter((id) => !book[id].isMinor);
  ok('one email to each adult on the rota (' + mail.length + ' for ' + adults.length + ')', mail.length === adults.length && adults.every((id) => mail.some((m) => to(m).includes(book[id].email))), JSON.stringify(mail.map(to)));
  ok('none to the under-18', !mail.some((m) => to(m).includes(P.young.email)));
  /* Each email lists that person's own dates and places, and nobody else's. */
  const wrong = [];
  for (const id of adults) {
    const m = mail.find((x) => to(x).includes(book[id].email)); if (!m) continue;
    const html = String(m.html || '');
    const mine = placesOf(id);
    const rows = (html.match(/<tr><td[^>]*>[^<]*<\/td><td[^>]*>[^<]*<\/td><\/tr>/g) || []).length;
    if (rows !== new Set(mine.map((x) => x.date)).size) wrong.push(book[id].name + ': ' + rows + ' rows for ' + new Set(mine.map((x) => x.date)).size + ' dates');
    for (const x of mine) if (!html.includes(x.role)) wrong.push(book[id].name + ': missing ' + x.role);
  }
  ok('each email lists that person\'s own dates and places', !wrong.length, wrong.join('; '));
  const att = (m) => (m.attachments || m.attachmentNames || []).map((a) => typeof a === 'string' ? a : a.filename || a.name);
  ok('each carries the rota PDFs and the calendar file', mail.every((m) => att(m).some((n) => /Individual_Rota\.pdf$/.test(n)) && att(m).some((n) => /My_Rota\.ics$/.test(n))), JSON.stringify(mail.map(att)));
  ok('the subject names the term', mail.every((m) => String(m.subject || '').includes(T.label)), JSON.stringify(mail.map((m) => m.subject)));
  /* Its link: "Open your rota", at the church's own address, to the Rota screen of the person's own team jobs. */
  const hub = await page.evaluate(() => EGBCAuth.call('hubAddress', {}).then((r) => String((r && r.url) || '').replace(/\/?$/, '/')));
  const linksOf = (m) => [...String(m.html || '').matchAll(/<a href="([^"]+)"[^>]*>Open your rota<\/a>/g)].map((x) => x[1].replace(/&amp;/g, '&'));
  ok('each email has one "Open your rota" link, at the church\'s own address (' + hub + ')', /^https:\/\//.test(hub) && mail.every((m) => linksOf(m).length === 1 && linksOf(m)[0].startsWith(hub + 'app.html')), JSON.stringify(mail.map(linksOf)));
  const want = { [P.singer.member]: '#worship:rota', [P.drums.member]: '#worship:rota', [P.sound.member]: '#worship:rota', [P.lead.member]: '#worship:rota' };
  ok('each opens the Rota screen of that person\'s own teams (worship and AV: #worship:rota)', adults.every((id) => { const m = mail.find((x) => to(x).includes(book[id].email)); return !m || !want[id] || linksOf(m)[0] === hub + 'app.html' + want[id]; }), JSON.stringify(mail.map((m) => [m.to, linksOf(m)])));
  /* Followed, as Sam on a phone: the app opens on the Rota, with Sam's own dates. */
  const samMail = mail.find((m) => to(m).includes(P.singer.email));
  if (samMail) {
    const link = linksOf(samMail)[0] || '';
    /* Sam's own phone: a browser of its own, so Wendy's planner tab stays signed in as Wendy. */
    const p2 = await open(P.singer, link.replace(/^https?:\/\/[^/]+\//, ''), null, true);
    await p2.setViewport({ width: 390, height: 844 });
    const mineEv = evs.filter((e) => Object.values(e.assignments || {}).some((r) => (Array.isArray(r) ? r : [r]).some((p) => p.id === P.singer.member))).sort((a, b) => a.date < b.date ? -1 : 1)[0];
    const [d1, m1] = mineEv ? [new Date(mineEv.date + 'T12:00Z').getUTCDate(), new Date(mineEv.date + 'T12:00Z').toLocaleString('en-GB', { month: 'short', timeZone: 'UTC' })] : [];
    const shown = await until(() => p2.evaluate(() => { const t = document.querySelector('[data-tab="rota"]'); const x = document.body.innerText.replace(/\s+/g, ' '); return t && t.getAttribute('aria-current') === 'page' && !/Finding the rota/.test(x) ? x : ''; }), 30000) || '';
    ok('following Sam\'s link opens the app on the Rota, with Sam\'s next date (' + d1 + ' ' + m1 + ')', !!mineEv && shown.includes(d1 + ' ' + m1), shown.slice(0, 300));
    ok('no errors on the app', !p2.__said.length, p2.__said.join(' | '));
    await p2.close();
  } else notReached('following the rota link', 'Sam had no email');
  T.rotaMail = mail;
  /* One person's rota (Send, by name): the same link; the under-18 is refused by name. */
  const before1 = new Set((await all('emailOutbox')).map((m) => m.id));
  await page.evaluate(() => { window.__toasts = []; new MutationObserver(() => document.querySelectorAll('body > div').forEach((d) => { if (d.style.position === 'fixed' && d.textContent && window.__toasts[window.__toasts.length - 1] !== d.textContent) window.__toasts.push(d.textContent); })).observe(document.body, { childList: true, subtree: true, characterData: true }); });
  await page.evaluate((id) => { window.__confirm = true; window.__asked.length = 0; sendSingleRota(id); }, P.singer.member);
  const single = await until(async () => (await all('emailOutbox')).filter((m) => !before1.has(m.id) && m.source === 'hub:rota')[0], 300000);
  ok('one person\'s rota sent by name carries the same link', !!single && linksOf(single)[0] === hub + 'app.html#worship:rota',
    single ? JSON.stringify(linksOf(single)) : JSON.stringify(await asked(page)) + ' toasts: ' + JSON.stringify(await page.evaluate(() => window.__toasts)) + ' ' + page.__said.join(' | '));
  const before2 = new Set((await all('emailOutbox')).map((m) => m.id));
  await page.evaluate((id) => { window.__asked.length = 0; sendSingleRota(id); }, P.young.member);
  await sleep(1500);
  const said = (await asked(page)).find((a) => a[0] === 'alert');
  ok('sending Yan (under 18) his rota by name is refused, saying why', !!said && /never emails under-18s/.test(said[1]) && !(await all('emailOutbox')).some((m) => !before2.has(m.id)), JSON.stringify(await asked(page)));
  console.log('    (outbox row fields: ' + Object.keys(mail[0] || {}).join(', ') + ')');
  ok('no errors on the planner', !page.__said.length, page.__said.join(' | '));
  await page.close();
};

/* 6. The rota on the hub, on the app, and in a calendar feed. */
const longish = (ymd) => { const d = new Date(ymd + 'T12:00Z'); return [d.getUTCDate(), d.toLocaleString('en-GB', { month: 'short', timeZone: 'UTC' })]; };
JOURNEYS.onhub = async () => {
  if (!T.events) return notReached('the rota on the hub, app and calendar', 'the term was not built');
  const evs = (await all('events')).filter((e) => e.termLabel === T.label).sort((a, b) => a.date < b.date ? -1 : 1);
  const mineOf = (id) => evs.filter((e) => Object.values(e.assignments || {}).some((r) => (Array.isArray(r) ? r : [r]).some((p) => p.id === id)));
  const mine = mineOf(P.singer.member), others = evs.filter((e) => !mine.includes(e));
  if (!mine.length) return notReached('Sam\'s dates on the hub', 'auto-fill gave Sam no date');
  const roleOn = (e) => Object.entries(e.assignments || {}).find(([, r]) => (Array.isArray(r) ? r : [r]).some((p) => p.id === P.singer.member))[0];
  const first = mine[0], [day, mon] = longish(first.date);
  /* The hub's "My serving". */
  const hub = await open(P.singer, 'hub.html', '#servingCard');
  const card = await until(() => hub.evaluate(() => (document.getElementById('servingCard') || {}).innerText || '').then((t) => /\d/.test(t) ? t.replace(/\s+/g, ' ') : ''), 20000) || '';
  ok('the hub\'s My serving shows Sam\'s next date and place (' + day + ' ' + mon + ', ' + roleOn(first) + ')', card.includes(String(day)) && card.includes(mon) && card.includes(roleOn(first)), card.slice(0, 300));
  ok('and no date Sam is not on', !others.filter((e) => e.date < (mine[mine.length - 1] || {}).date).some((e) => { const [d, m] = longish(e.date); return new RegExp('\\b' + m + ' ' + d + '\\b|\\b' + d + ' ' + m + '\\b').test(card); }), card.slice(0, 300));
  ok('no errors on the hub', !hub.__said.length, hub.__said.join(' | '));
  await hub.close();
  /* The app's Rota tab, at phone width. */
  const app = await open(P.singer, 'app.html');
  await app.setViewport({ width: 390, height: 844 });
  await until(() => app.evaluate(() => !!document.querySelector('[data-tab="rota"]')), 20000);
  await app.evaluate(() => document.querySelector('[data-tab="rota"]').click());
  const rota = await until(() => app.evaluate(() => document.body.innerText.replace(/\s+/g, ' ')).then((t) => t.includes('Singer') ? t : ''), 20000) || '';
  ok('the app\'s Rota shows Sam\'s next date and place', rota.includes(day + ' ' + mon) && rota.includes(roleOn(first)), rota.slice(0, 400));
  /* The calendar feed, set up from the app (Me > Add to my calendar). */
  /* Switch > Just me > Me, as a person gets there. */
  await app.evaluate(() => document.querySelector('[data-act="mode:switch"]').click());
  await until(() => app.evaluate(() => { const b = document.querySelector('[data-mode-go="me"]'); if (b) b.click(); return !!b; }), 10000);
  await until(() => app.evaluate(() => { const b = document.querySelector('[data-tab="me"]'); if (b) b.click(); return !!b; }), 10000);
  const row = await until(() => app.evaluate(() => { const b = document.querySelector('[data-act="sheet:calendar"]'); if (b) b.click(); return !!b; }), 15000);
  ok('the app offers "Add to my calendar"', !!row);
  const make = await until(() => app.evaluate(() => { const b = document.querySelector('.sheet [data-act^="makecal:"]'); if (b) { const a = b.getAttribute('data-act'); b.click(); return a; } return ''; }), 15000);
  const href = await until(() => app.evaluate(() => { const a = [...document.querySelectorAll('.sheet a[href^="webcal:"]')][0]; return a ? a.getAttribute('href') : ''; }), 20000);
  ok('one tap makes the feed, with Apple, Google and Outlook buttons (' + make + ')', !!href && /rotaFeed\?k=/.test(href), href || await app.evaluate(() => (document.querySelector('.sheet') || {}).innerText));
  if (href) {
    const url = href.replace(/^webcal:\/\//, 'http://');
    const ics = await new Promise((res) => fetch(url).then((r) => r.text()).then(res, (e) => res('FETCH ' + e.message)));
    const dates = [...ics.matchAll(/DTSTART[^:]*:(\d{8})/g)].map((m) => m[1]);
    const want = mine.map((e) => e.date.replace(/-/g, ''));
    ok('the feed is a calendar with Sam\'s ' + want.length + ' dates', ics.startsWith('BEGIN:VCALENDAR') && want.every((d) => dates.includes(d)), ics.slice(0, 200) + ' dates ' + dates.join(','));
    ok('and none of anyone else\'s', dates.every((d) => want.includes(d) || !evs.some((e) => e.date.replace(/-/g, '') === d)) && !others.some((e) => dates.includes(e.date.replace(/-/g, ''))), dates.join(','));
    ok('each entry names Sam\'s place', mine.every((e) => ics.includes(roleOn(e))));
    const bad = await new Promise((res) => fetch(url.replace(/k=[^&]+/, 'k=not-a-real-key')).then((r) => res(r.status), () => res('error')));
    ok('a made-up key gets nothing (' + bad + ')', bad >= 400, bad);
  }
  ok('no errors on the app', !app.__said.length, app.__said.join(' | '));
  await app.close();
};

/* 7. The reminder the day before: the 5pm timer, once each, to the right people. */
const runTimer = async (name) => {
  const base = '/' + PROJECT + '/europe-west2/' + name;
  const a = await req(PORTS.functions, 'POST', base + '-0', {});
  return a.status !== 404 ? a : req(PORTS.functions, 'POST', base, {});
};
const londonDay = (n) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(Date.now() + n * 864e5));
JOURNEYS.reminder = async () => {
  /* Tomorrow's service: Wendy leads (no phone set up: an email), Sue on sound (her phone). Dan is not on it. */
  const tomorrow = londonDay(1);
  await put('events/ws_tomorrow', { date: tomorrow, type: 'Sunday Morning Worship', startTime: '10:30', endTime: '12:00', teams: ['Worship Team', 'AV Team'], archived: false, draft: false,
    roles: ['Worship Leader', 'Sound'], assignments: { 'Worship Leader': { id: P.lead.member, name: P.lead.name }, Sound: { id: P.sound.member, name: P.sound.name } }, termLabel: 'Now' });
  await put('pushTokens/ws_sue_phone', { uid: P.sound.uid, token: 'test-token-sue', at: new Date().toISOString() });
  /* Phone notifications start switched off; the master admin turns them on in Church settings. */
  const before0 = new Set((await all('emailOutbox')).map((m) => m.id));
  await runTimer('rotaReminders');
  await sleep(2000);
  ok('switched off (as a church starts), the timer sends nothing', !(await all('emailOutbox')).some((m) => !before0.has(m.id)));
  const page = await open(P.office, 'church-settings.html', '#n-switch');
  const sw = await until(() => page.$('#n-switch'), 20000);
  if (!sw) { notReached('the reminder', 'Church settings has no notifications switch for the master admin: ' + (await page.evaluate(() => location.href + ' ' + document.body.innerText.replace(/s+/g, ' ').slice(0, 300))) + ' ' + page.__said.join(' | ')); await page.close(); return; }
  await page.evaluate(() => { window.__confirm = true; document.getElementById('n-switch').click(); });
  const on = await until(() => page.evaluate(() => document.getElementById('n-switch').getAttribute('aria-checked') === 'true'), 15000);
  ok('the master admin turns phone notifications on in Church settings', !!on, page.__said.join(' | '));
  await page.close();
  const before = new Set((await all('emailOutbox')).map((m) => m.id));
  const r = await runTimer('rotaReminders');
  ok('the 5pm timer runs (' + r.status + ')', r.status === 200, r.body.slice(0, 200));
  await sleep(2500);
  const mail = (await all('emailOutbox')).filter((m) => !before.has(m.id));
  const to = (m) => JSON.stringify(m.to || '');
  const wm = mail.find((m) => to(m).includes(P.lead.email));
  ok('Wendy, with no phone set up, gets it by email', !!wm, JSON.stringify(mail.map((m) => [m.to, m.subject])));
  ok('it names tomorrow\'s place (Worship Leader)', !!wm && /Worship Leader/.test(String(wm.html || '') + wm.subject), wm && (wm.subject + ' ' + String(wm.html).slice(0, 300)));
  const log = (await all('notifyLog')).filter((l) => !l.dryRun && l.type === 'rota');
  ok('Sue gets it on her phone, not by email', !mail.some((m) => to(m).includes(P.sound.email)) && log.some((l) => l.type === 'rota' && l.phones >= 1), JSON.stringify(log));
  ok('nobody else gets one (Dan, Sam: not serving tomorrow)', mail.every((m) => to(m).includes(P.lead.email)), JSON.stringify(mail.map((m) => m.to)));
  /* Its link opens the hub. */
  const link = wm && (String(wm.html).match(/href="([^"]+)"/) || [])[1];
  if (link) {
    const path = link.replace(/^https?:\/\/[^/]+\//, '');
    ok('the email\'s link is this hub\'s app (' + link + ')', /app\.html|hub\.html/.test(path), link);
    const p2 = await open(P.lead, path);
    const t = await until(() => p2.evaluate(() => document.body && document.body.innerText.length > 50), 20000);
    ok('and opens for Wendy', !!t && !/404/.test(await p2.title()));
    await p2.close();
  } else notReached('the reminder email\'s link', 'no email to follow');
  /* Run again (a retry): nothing twice. */
  const before2 = new Set((await all('emailOutbox')).map((m) => m.id));
  await runTimer('rotaReminders'); await sleep(2500);
  ok('run again, nobody gets it twice', !(await all('emailOutbox')).some((m) => !before2.has(m.id)));
};

/* ---- songs, with real files in the storage emulator ---- */
const BUCKET = 'egbc-worship-planner.firebasestorage.app';
const PDF = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[]/Count 0>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n');
/** Puts a file in the storage emulator, as the server can; its download address back. */
function uploadFile(name, body) {
  return new Promise((res, rej) => {
    const r = http.request({ host: '127.0.0.1', port: PORTS.storage, method: 'POST', path: '/v0/b/' + BUCKET + '/o?uploadType=media&name=' + encodeURIComponent(name),
      headers: { 'Content-Type': 'application/pdf', 'Content-Length': body.length, Authorization: 'Bearer owner' } }, (s) => {
      let x = ''; s.on('data', (c) => (x += c)); s.on('end', () => { try { const j = JSON.parse(x); res('http://127.0.0.1:' + PORTS.storage + '/v0/b/' + BUCKET + '/o/' + encodeURIComponent(name) + '?alt=media&token=' + j.downloadTokens); } catch (e) { rej(new Error(x.slice(0, 200))); } });
    });
    r.on('error', rej); r.end(body);
  });
}
const SONGS = [['Morning Light Synthetic', 'G'], ['Steadfast Synthetic', 'D']];
async function seedSongs() {
  for (const [title, key] of SONGS) {
    const id = title.toLowerCase().replace(/\s+/g, '-'), name = title + '-chords-' + key + '.pdf';
    const url = await uploadFile('songs/' + id + '/' + name, PDF);
    await put('songs/' + id, { title, normalized: title.toLowerCase(), youtube: '', ccli: '', files: [{ name, url, type: 'Chord Sheet', key }] });
  }
}

/* 8. The Sunday plan: choose songs and keys, then send it to the team. */
JOURNEYS.plan = async () => {
  if (!T.events) return notReached('the Sunday plan', 'the term was not built');
  await seedSongs();
  const evs = (await all('events')).filter((e) => e.termLabel === T.label).sort((a, b) => a.date < b.date ? -1 : 1);
  const has = (e, id) => Object.values(e.assignments || {}).some((r) => (Array.isArray(r) ? r : [r]).some((p) => p.id === id));
  /* A Sunday with the under-18 on it, if there is one: the plan's email must leave him out. */
  const ev = evs.find((e) => has(e, P.young.member)) || evs[0];
  T.planDate = ev.date;
  const page = await open(P.lead, 'SundayServicePlanner.html', '.uk-pick select');
  await until(() => page.evaluate((v) => [...document.querySelectorAll('.uk-pick select option')].some((o) => o.value === v), ev.date + '|' + ev.type), 30000);
  await page.evaluate((v) => { const s = document.querySelector('.uk-pick select'); s.value = v; s.dispatchEvent(new Event('change', { bubbles: true })); }, ev.date + '|' + ev.type);
  const shown = await until(() => page.evaluate((d) => document.getElementById('serviceDate').value === d && (document.getElementById('teamBody') || {}).textContent.trim().length > 0 && document.querySelectorAll('#service-order .song-title').length > 0, ev.date), 30000);
  ok('the planner opens that Sunday, with its team (' + ev.date + ')', !!shown, page.__said.join(' | '));
  /* Song 1: typed, picked from the library, key chosen. */
  const pick = async (n, typed, title, key) => {
    const ids = await page.evaluate(() => [...document.querySelectorAll('#service-order .song-block')].map((b) => (b.querySelector('[id^="files-"]') || {}).id.slice(6)));
    const id = ids[n];
    const box = '#service-order .song-block:nth-of-type(' + 0 + ')';
    void box;
    await page.evaluate((id) => { const i = document.getElementById('suggest-' + id).closest('.song-block').querySelector('.song-title'); i.value = ''; i.focus(); }, id);
    await page.keyboard.type(typed, { delay: 30 });
    const offered = await until(() => page.evaluate((id, t) => [...document.querySelectorAll('#suggest-' + id + ' [onclick^="selectSong"]')].some((x) => x.textContent.trim() === t), id, title), 10000);
    ok('typing "' + typed + '" offers ' + title + ' from the music database', !!offered);
    await page.evaluate((id, t) => [...document.querySelectorAll('#suggest-' + id + ' [onclick^="selectSong"]')].find((x) => x.textContent.trim() === t).click(), id, title);
    const keys = await until(() => page.evaluate((id) => (document.getElementById('keyinfo-' + id) || {}).innerText || '', id), 10000);
    ok('it shows the keys on file (' + key + ')', (keys || '').includes(key), keys);
    await page.evaluate((id, k) => { const s = document.getElementById('files-' + id).closest('.song-block').querySelector('.song-key'); s.value = k; s.dispatchEvent(new Event('change', { bubbles: true })); }, id, key);
    const link = await until(() => page.evaluate((id) => { const a = [...document.querySelectorAll('#files-' + id + ' a[href]')].find((x) => /alt=media/.test(x.href)); return a ? a.href : ''; }, id), 10000);
    ok('choosing ' + key + ' brings up its chord sheet', !!link, await page.evaluate((id) => document.getElementById('files-' + id).innerText, id));
    if (link) { const r = await fetch(link); ok('and the chord sheet opens (' + r.status + ')', r.ok && (await r.text()).startsWith('%PDF')); }
  };
  await pick(0, 'Morning', SONGS[0][0], SONGS[0][1]);
  await pick(1, 'Steadf', SONGS[1][0], SONGS[1][1]);
  /* Save, then check it landed on this Sunday only. */
  const before = await all('services');
  await page.evaluate(() => { window.__asked.length = 0; [...document.querySelectorAll('button')].find((b) => b.getAttribute('onclick') === 'saveSchedule()').click(); });
  const saved = await until(async () => (await all('services')).find((s) => s.date === ev.date && (s.order || []).some((i) => i.title === SONGS[0][0])), 20000);
  const keysOf = (t) => { const i = ((saved || {}).order || []).find((x) => x.title === t) || {}; return [].concat(i.keys || i.key || []); };
  ok('Save keeps both songs and their keys on that Sunday', !!saved && keysOf(SONGS[0][0]).includes('G') && keysOf(SONGS[1][0]).includes('D'), JSON.stringify(saved && saved.order));
  ok('and on no other Sunday', (await all('services')).filter((s) => s.date !== ev.date).length === before.filter((s) => s.date !== ev.date).length);
  /* Send it to the team. */
  const mailBefore = new Set((await all('emailOutbox')).map((m) => m.id));
  await page.evaluate(() => { [...document.querySelectorAll('button')].find((b) => b.getAttribute('onclick') === 'emailSchedule()').click(); });
  await page.waitForSelector('#modalTeamBtn', { visible: true, timeout: 20000 }).catch(() => {});
  await page.evaluate(() => document.getElementById('modalTeamBtn').click());
  const status = await until(() => page.evaluate(() => { const t = document.getElementById('modalStatus').textContent; return /Sent|Could not/.test(t) ? t : ''; }), 60000);
  const onIt = Object.values(ev.assignments || {}).flatMap((r) => (Array.isArray(r) ? r : [r]).map((p) => p.id));
  const book = Object.fromEntries((await all('addressBook')).map((b) => [b.id, b]));
  const youngOn = onIt.includes(P.young.member);
  ok('"Email Whole Team" says Sent' + (youngOn ? ', and names Yan as under 18 and not emailed' : ''), youngOn ? status === 'Sent. Not emailed (under 18): ' + P.young.name : status === 'Sent', status);
  const mail = (await all('emailOutbox')).filter((m) => !mailBefore.has(m.id) && m.source === 'hub:servicePlan');
  const to = (m) => JSON.stringify(m.to || '');
  const adults = onIt.filter((id) => !book[id].isMinor);
  ok('everyone on that Sunday gets the plan (' + mail.length + ')', adults.every((id) => mail.some((m) => to(m).includes(book[id].email))), JSON.stringify(mail.map(to)));
  ok('not the under-18', !mail.some((m) => to(m).includes(P.young.email)));
  const html = String((mail[0] || {}).html || '');
  const long = new Date(ev.date + 'T12:00Z').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).replace(',', '');
  ok('it names the Sunday (' + long + ') and both songs with their keys', html.includes(long) && html.includes(SONGS[0][0]) && html.includes(SONGS[1][0]) && />\s*G\s*</.test(html) && />\s*D\s*</.test(html), html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 500));
  const links = [...new Set([...html.matchAll(/href="([^"]+)"/g)].map((x) => x[1]).filter((l) => !/^mailto:/.test(l)))];
  ok('it has links (' + links.length + ')', links.length > 0);
  T.planLinks = links;
  for (const l of links.filter((x) => /\.html/.test(x)).slice(0, 4)) {
    const path = l.replace(/^https?:\/\/[^/]+\//, '');
    const p2 = await open(P.singer, path);
    const txt = await until(() => p2.evaluate(() => document.body && document.body.innerText).then((t) => t && t.includes('Synthetic') ? t : ''), 20000) || '';
    ok('its link ' + path.slice(0, 60) + ' opens that Sunday\'s songs for a team member', txt.includes(SONGS[0][0]), (await p2.evaluate(() => location.href)) + ' ' + txt.replace(/\s+/g, ' ').slice(0, 200));
    await p2.close();
  }
  ok('no errors on the planner', !page.__said.length, page.__said.join(' | '));
  await page.close();
};

/* 9. The music database: open a song and its files. */
JOURNEYS.musicdb = async () => {
  if (!(await get('songs/morning-light-synthetic'))) await seedSongs();
  const page = await open(P.singer, 'Library.html', '#list');
  const listed = await until(() => page.evaluate((t) => [...document.querySelectorAll('#list .song')].some((s) => s.innerText.includes(t)), SONGS[0][0]), 20000);
  ok('a team member sees the songs listed', !!listed, page.__said.join(' | '));
  await page.type('#search', 'morning');
  await page.evaluate(() => { const s = document.getElementById('search'); s.dispatchEvent(new Event('input', { bubbles: true })); if (typeof searchSongs === 'function') searchSongs(); });
  const found = await until(() => page.evaluate((t) => { const l = [...document.querySelectorAll('#list .song')]; return l.length >= 1 && l.every((s) => s.innerText.includes(t)); }, SONGS[0][0]), 10000);
  ok('searching finds it, and only it', !!found);
  await page.evaluate((t) => [...document.querySelectorAll('#list .song')].find((s) => s.innerText.includes(t)).click(), SONGS[0][0]);
  const opened = await until(() => page.evaluate(() => { const t = document.getElementById('display-title').innerText; return t === 'Select a Song' ? '' : t; }), 10000);
  ok('opening it shows the song (' + opened + ')', opened === SONGS[0][0]);
  const files = await until(() => page.evaluate(() => [...document.querySelectorAll('#files-container .file-item')].map((f) => ({ name: f.querySelector('input').value, key: f.querySelector('select').value, href: (f.querySelector('a.view-link') || {}).href || '' }))), 10000) || [];
  ok('and its files, with their keys', files.length >= 1 && files.some((f) => f.key === 'G'), JSON.stringify(files));
  for (const f of files) { const r = await fetch(f.href).catch(() => ({ ok: false, status: 'error' })); ok('the file ' + f.name + ' opens (' + r.status + ')', r.ok); }
  ok('no errors on the music database', !page.__said.length, page.__said.join(' | '));
  await page.close();
};

/* 10. The batch uploader, with names as people's files have them. */
JOURNEYS.batch = async () => {
  if (!(await get('songs/morning-light-synthetic'))) await seedSongs();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stage2-batch-'));
  const NAMES = { newKey: 'Morning Light Synthetic-chords-A.pdf', newSong: 'Harbour Lights Synthetic-lead-D.pdf', empty: 'Quiet Waters Synthetic-chords-C.pdf' };
  fs.writeFileSync(path.join(dir, NAMES.newKey), PDF); fs.writeFileSync(path.join(dir, NAMES.newSong), PDF); fs.writeFileSync(path.join(dir, NAMES.empty), Buffer.alloc(0));
  const page = await open(P.lead, 'batchupload.html', '#fileInput');
  const input = await page.$('#fileInput');
  await input.uploadFile(...Object.values(NAMES).map((n) => path.join(dir, n)));
  const rows = await until(() => page.evaluate(() => { const r = [...document.querySelectorAll('#table tr')]; return r.length >= 3 ? r.map((t) => t.innerText.replace(/\s+/g, ' ')) : null; }), 20000) || [];
  ok('the three files are read into rows', rows.length >= 3, page.__said.join(' | '));
  const rowOf = (n) => rows.find((r) => r.includes(n.replace(/\.pdf$/, ''))) || rows.find((r) => r.includes(n)) || '';
  ok('"' + NAMES.newKey + '": the existing song, key A, chord sheet', /Morning Light Synthetic/.test(rowOf(NAMES.newKey)) && /\bA\b/.test(rowOf(NAMES.newKey)) && /Chord/.test(rowOf(NAMES.newKey)), rowOf(NAMES.newKey));
  ok('"' + NAMES.newSong + '": a new song, key D, lead sheet', /NEW/i.test(rowOf(NAMES.newSong)) && /\bD\b/.test(rowOf(NAMES.newSong)) && /Lead/.test(rowOf(NAMES.newSong)), rowOf(NAMES.newSong));
  ok('"' + NAMES.empty + '": refused as empty, on its row', /EMPTY|empty/.test(rowOf(NAMES.empty)), rowOf(NAMES.empty));
  await page.evaluate(() => { window.__asked.length = 0; processAll(); });
  const done = await until(async () => (await asked(page)).find((a) => a[0] === 'alert'), 60000);
  ok('Upload says what went and what did not (2 uploaded, the empty one not)', !!done && /Uploaded: 2/.test(done[1]) && done[1].includes(NAMES.empty) && /empty/.test(done[1]), done && done[1]);
  const ml = await get('songs/morning-light-synthetic');
  ok('the existing song now has key A as well as G', !!ml && ml.files.some((f) => f.key === 'A' && f.type === 'Chord Sheet') && ml.files.some((f) => f.key === 'G'), JSON.stringify(ml && ml.files));
  const hl = await get('songs/harbour-lights-synthetic');
  ok('the new song is in the database with its lead sheet in D', !!hl && hl.title === 'Harbour Lights Synthetic' && hl.files.some((f) => f.key === 'D' && f.type === 'Lead Sheet'), JSON.stringify(hl));
  ok('the empty file made no song', !(await get('songs/quiet-waters-synthetic')));
  for (const f of [...((ml || {}).files || []), ...((hl || {}).files || [])]) { const r = await fetch(f.url).catch(() => ({ ok: false })); ok('the uploaded ' + f.name + ' opens', r.ok); }
  ok('no errors on the uploader', !page.__said.length, page.__said.join(' | '));
  await page.close();
  fs.rmSync(dir, { recursive: true, force: true });
};

/* Whether the page let this person in (egbc-guard.js marks a refusal on the body). */
const blocked = (page) => until(() => page.evaluate(() => document.body && (document.body.getAttribute('data-egbc-blocked') ? 'blocked' : (window.EGBC_READY ? 'in' : ''))), 20000);

/* 11. Play-Through, Performance notes, the AV guides, Inventory and the mappers. */
JOURNEYS.worshipav = async () => {
  if (!(await get('songs/morning-light-synthetic'))) await seedSongs();
  /* As the pages save them: published, with a created date (each page lists newest first). */
  const now = new Date().toISOString();
  await put('kb_playthrough/pt_ml', { title: 'Morning Light Synthetic', songTitle: 'Morning Light Synthetic', ourKey: 'G', published: true, category: 'Worship', createdAt: now,
    sectionMarkers: [{ label: 'Verse 1', seconds: 0 }, { label: 'Chorus', seconds: 30 }], contentURL: '', tags: 'synthetic', bullets: 'Soft keys intro' });
  await put('kb_howto_av/ht_desk', { title: 'Set up the mixing desk (synthetic)', published: true, createdAt: now, category: 'Sound', tags: 'set up mixing desk', bullets: 'Power on the desk. Recall the Sunday scene.', contentURL: '' });
  await put('kb_troubleshoot_av/ts_sound', { title: 'No sound from the speakers (synthetic)', published: true, createdAt: now, category: 'Sound', tags: 'no sound', bullets: 'Check the main fader. Check the amp is on.', contentURL: '' });
  const text = (page) => page.evaluate(() => document.body.innerText.replace(/\s+/g, ' '));
  /* Play-Through: a singer searches for the song and opens it. */
  let page = await open(P.singer, 'EGBC-PlayThrough.html', '#searchInput');
  ok('Play-Through opens for a worship team member', await blocked(page) === 'in');
  await until(() => page.evaluate(() => typeof doSearch === 'function'), 15000);
  await page.type('#searchInput', 'Morning');
  await page.evaluate(() => doSearch());
  const hit = await until(() => page.evaluate(() => { const r = document.getElementById('searchResults'); return r && !r.classList.contains('hidden') && r.innerText.includes('Morning Light Synthetic'); }), 15000);
  ok('searching "Morning" finds the published play-through', !!hit, (await text(page)).slice(0, 300));
  /* A result with sections offers a button per section (Verse 1, Chorus): the first. */
  await page.evaluate(() => { const c = document.querySelector('#searchResults [onclick*="pt_ml"]'); if (c) c.click(); });
  const modal = await until(() => page.evaluate(() => { const m = document.getElementById('modal'); return m && !m.classList.contains('hidden') && document.getElementById('modalContent').innerText; }), 10000) || '';
  ok('opening it shows the song with its sections', modal.includes('Morning Light Synthetic') && /Verse 1/.test(modal), modal.slice(0, 200));
  ok('no errors on Play-Through', !page.__said.length, page.__said.join(' | '));
  await page.close();

  /* Performance notes: the singer loads the Sunday that was planned. */
  if (T.planDate) {
    page = await open(P.singer, 'Performancenotes.html', '#dateInput');
    ok('Performance notes opens for a worship team member', await blocked(page) === 'in');
    await until(() => page.evaluate(() => typeof loadRota === 'function' && typeof loadService === 'function'), 15000);
    await page.evaluate((d) => { const i = document.getElementById('dateInput'); i.value = d; i.dispatchEvent(new Event('change', { bubbles: true })); }, T.planDate);
    const roles = await until(() => page.evaluate(() => [...document.querySelectorAll('#roleSelect option')].map((o) => o.value).filter(Boolean)).then((r) => r.length ? r : null), 15000) || [];
    const role = roles.find((r) => /sing|vocal/i.test(r)) || roles[0];
    await page.evaluate((r) => { const s = document.getElementById('roleSelect'); s.value = r; s.dispatchEvent(new Event('change', { bubbles: true })); }, role);
    await sleep(1000);
    await page.evaluate(() => loadService());
    const songs = await until(() => page.evaluate(() => { const s = document.getElementById('songScreen'); return s && s.style.display === 'flex' ? document.body.innerText : ''; }), 20000) || '';
    ok('picking the planned Sunday and a part (' + role + '), Load Service shows its songs', songs.includes('Morning Light Synthetic'), (await text(page)).slice(0, 300) + ' roles ' + JSON.stringify(roles));
    ok('no errors on Performance notes', !page.__said.length, page.__said.join(' | '));
    await page.close();
  } else notReached('Performance notes with a planned Sunday', 'the plan journey did not run');

  /* The AV guides: for AV, and for worship (one team). A quick link opens guides. */
  for (const [file, name] of [['EGBC-HowTo-AV.html', 'How-To AV'], ['EGBC-Troubleshoot-AV.html', 'AV Troubleshoot']]) {
    for (const who of [P.sound, P.singer]) {
      page = await open(who, file);
      const st = await blocked(page);
      await until(() => page.evaluate(() => typeof quickSearch === 'function' && !!document.querySelector('[onclick^="quickSearch"]')), 15000);
      await sleep(1000);
      const before = (await text(page)).length;
      const quick = await page.evaluate(() => { const q = document.querySelector('[onclick^="quickSearch"]'); if (q) { q.click(); return q.innerText.trim(); } return ''; });
      const after = await until(async () => { const n = (await text(page)).length; return n > before + 150 ? n : 0; }, 10000);
      ok(name + ' opens for ' + who.name.split(' ')[0] + ' (' + (who === P.sound ? 'AV' : 'worship') + '), and its quick link "' + quick + '" brings up guides', st === 'in' && !!quick && !!after, st + ' ' + before + ' -> ' + after);
      ok('no errors on ' + name, !page.__said.length, page.__said.join(' | '));
      await page.close();
    }
  }

  /* Inventory: an AV leader adds an item; an AV member is not let in. */
  page = await open(P.lead, 'inventory-system-2.html');
  ok('Inventory opens for an AV leader', await blocked(page) === 'in');
  await until(() => page.evaluate(() => typeof openAddModal === 'function'), 15000);
  await page.evaluate(() => openAddModal());
  await page.waitForSelector('#fieldName', { visible: true, timeout: 10000 }).catch(() => {});
  await page.type('#fieldName', 'Synthetic DI Box');
  await page.evaluate(() => { const c = document.getElementById('fieldCondition'); c.value = [...c.options].map((o) => o.value).filter(Boolean)[0]; });
  await page.type('#fieldLocation', 'Synthetic cupboard');
  await page.evaluate(() => saveItem());
  const item = await until(async () => (await all('inventory')).find((x) => x.name === 'Synthetic DI Box'), 15000);
  ok('Add item saves it', !!item, (await text(page)).slice(0, 300));
  ok('and it is listed', !!(await until(() => page.evaluate(() => document.body.innerText.includes('Synthetic DI Box')), 10000)));
  ok('no errors on Inventory', !page.__said.length, page.__said.join(' | '));
  await page.close();
  page = await open(P.sound, 'inventory-system-2.html');
  ok('an AV member (not a leader) is not let into Inventory', await blocked(page) === 'blocked');
  await page.close();

  /* The AV Infrastructure Mapper: a member can look but not change it; a leader adds a location. */
  page = await open(P.sound, 'schematic.html', '#reg-name');
  ok('the AV Infrastructure Mapper opens for an AV member', await blocked(page) === 'in');
  await until(() => page.evaluate(() => typeof registerLocation === 'function' && document.getElementById('sync-status').textContent.includes('Live')), 15000);
  await page.evaluate(() => { window.__asked.length = 0; document.getElementById('reg-name').value = 'Synthetic Stage Left'; registerLocation(); });
  await sleep(1500);
  const told = (await asked(page)).find((a) => a[0] === 'alert');
  ok('an AV member who tries to add a location is told only AV leaders can change it', !!told && /Only AV leaders/.test(told[1]), JSON.stringify(await asked(page)));
  const left = await page.evaluate(() => document.getElementById('registry-list').innerText);
  ok('and nothing is saved, or left on their screen', !JSON.stringify(await all('av_schematic')).includes('Synthetic Stage Left') && !left.includes('Synthetic Stage Left'), JSON.stringify(await all('av_schematic')) + ' / screen: ' + left);
  ok('no errors on the mapper (member)', !page.__said.length, page.__said.join(' | '));
  await page.close();
  page = await open(P.lead, 'schematic.html', '#reg-name');
  ok('the mapper opens for an AV leader', await blocked(page) === 'in');
  await until(() => page.evaluate(() => typeof registerLocation === 'function' && document.getElementById('sync-status').textContent.includes('Live')), 15000);
  await page.evaluate(() => { document.getElementById('reg-name').value = 'Synthetic Stage Left'; registerLocation(); });
  const loc = await until(async () => JSON.stringify(await all('av_schematic')).includes('Synthetic Stage Left'), 15000);
  ok('an AV leader adds a location, and it is saved', !!loc, JSON.stringify(await asked(page)) + ' ' + page.__said.join(' | '));
  ok('and the list shows it', !!(await until(() => page.evaluate(() => document.getElementById('registry-list').innerText.includes('Synthetic Stage Left')), 10000)));
  ok('no errors on the mapper (leader)', !page.__said.length, page.__said.join(' | '));
  await page.close();

  /* Monitor Setup: a member is told; a leader adds a wedge and saves. */
  page = await open(P.sound, 'MonitorStageMap.html', '#saveCfgBtn');
  ok('Monitor Setup opens for an AV member', await blocked(page) === 'in');
  await until(() => page.evaluate(() => typeof addWedge === 'function'), 15000);
  await page.evaluate(() => { addWedge(); saveConfig(); });
  const toastSaid = await until(() => page.evaluate(() => /Only AV leaders/.test(document.body.innerText) ? 'told' : ''), 5000);
  ok('an AV member who presses Save Setup is told only AV leaders can change it', !!toastSaid, (await text(page)).slice(-200));
  ok('and nothing is saved', !(await get('egbc-config/monitor-mix')));
  await page.close();
  page = await open(P.lead, 'MonitorStageMap.html', '#saveCfgBtn');
  ok('Monitor Setup opens for an AV leader', await blocked(page) === 'in');
  await until(() => page.evaluate(() => typeof addWedge === 'function'), 15000);
  await page.evaluate(() => { addWedge(); saveConfig(); });
  const cfg = await until(async () => { const c = await get('egbc-config/monitor-mix'); return c && (c.wedges || []).length >= 1 ? c : null; }, 15000);
  ok('an AV leader adds a wedge, and Save Setup saves it', !!cfg, (await text(page)).slice(-200) + ' ' + page.__said.join(' | '));
  ok('no errors on Monitor Setup', !page.__said.length, page.__said.join(' | '));
  await page.close();
  /* The stage page reads it back. */
  if (T.planDate && cfg) {
    page = await open(P.singer, 'Performancenotes.html', '#dateInput');
    const read = await page.evaluate(() => import('./egbc-db.js').then((m) => import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js').then((f) => f.getDoc(f.doc(m.db, 'egbc-config', 'monitor-mix')).then((s) => (s.data().wedges || []).length, (e) => 'refused ' + e.code))));
    ok('a worship team member\'s Performance notes can read the monitor setup (' + read + ' wedge)', read >= 1, read);
    await page.close();
  }
};

/* 12. The Schematic and Performance apps, still there for worship and AV (Apps and downloads). */
JOURNEYS.apps = async () => {
  await put('hub_resources/ws_schem_apk', { name: 'Schematic Synthetic App', type: 'apk', downloadUrl: 'https://example.invalid/schematic.apk', version: '1.0.0', order: 1 });
  await put('hub_resources/ws_schem_web', { name: 'Schematic Synthetic App', type: 'link', url: 'https://example.invalid/schematic.html', order: 2 });
  await put('hub_resources/ws_perf_apk', { name: 'Performance Synthetic App', type: 'apk', downloadUrl: 'https://example.invalid/performance.apk', version: '1.0.0', order: 3 });
  await put('hub_resources/ws_perf_web', { name: 'Performance Synthetic App', type: 'link', url: 'https://example.invalid/Performancenotes.html', order: 4 });
  await put('hub_resources/ws_link', { name: 'Everyone Synthetic Link', type: 'link', url: 'https://example.invalid/everyone', order: 5 });
  const look = async (who) => {
    const page = await open(who, 'hubresources.html');
    const text = await until(() => page.evaluate(() => document.body.innerText.replace(/\s+/g, ' ')).then((t) => /Everyone Synthetic Link/.test(t) ? t : ''), 20000) || '';
    const cards = await page.evaluate(() => [...document.querySelectorAll('#team-apps .resource-card')].map((c) => ({ name: (c.querySelector('.card-name') || {}).textContent, links: [...c.querySelectorAll('a')].map((a) => a.getAttribute('href')) })));
    const said = page.__said.slice(); await page.close();
    return { text, cards, said };
  };
  for (const who of [P.singer, P.sound]) {
    const r = await look(who);
    const s = r.cards.find((c) => c.name === 'Schematic Synthetic App'), p = r.cards.find((c) => c.name === 'Performance Synthetic App');
    const team = who === P.sound ? 'AV' : 'worship';
    ok('the Schematic app is there for ' + team + ', with its download and its page', !!s && s.links.includes('https://example.invalid/schematic.apk') && s.links.includes('https://example.invalid/schematic.html'), JSON.stringify(r.cards) + ' ' + r.text.slice(0, 200));
    ok('the Performance app is there for ' + team + ', with its download and its page', !!p && p.links.includes('https://example.invalid/performance.apk') && p.links.includes('https://example.invalid/Performancenotes.html'), JSON.stringify(r.cards));
    ok('no errors on Apps and downloads', !r.said.length, r.said.join(' | '));
  }
  const kid = await look(P.kids);
  ok('someone on neither team does not see them', /Everyone Synthetic Link/.test(kid.text) && !/Schematic Synthetic App|Performance Synthetic App/.test(kid.text), kid.text.slice(0, 300));
};

/* 13. A notice for the worship team, and a team email with the under-18 left out. */
JOURNEYS.notices = async () => {
  /* The notice: Wendy posts it to the Worship Team from the hub. */
  let page = await open(P.lead, 'hub.html?notice=new', '#nwTitle');
  const editor = await until(() => page.evaluate(() => { const m = document.getElementById('nwTitle'); return m && m.offsetParent !== null; }), 20000);
  ok('"Post a notice" opens the editor for a team leader', !!editor, page.__said.join(' | '));
  await page.type('#nwTitle', 'Synthetic rehearsal moved to 7pm');
  await page.evaluate(() => { const b = document.querySelector('#newsModal [contenteditable="true"], #nwBody [contenteditable="true"], .ql-editor'); if (b) b.innerHTML = '<p>Same room, an hour later.</p>'; });
  const chips = await page.evaluate(() => [...document.querySelectorAll('#nwTeams .chip')].map((c) => c.textContent.trim() + (c.classList.contains('on') ? '*' : '')));
  await page.evaluate(() => { document.querySelectorAll('#nwTeams .chip.on').forEach((c) => c.click()); const w = [...document.querySelectorAll('#nwTeams .chip')].find((c) => /^Worship/.test(c.textContent.trim())); if (w) w.click(); });
  ok('the leader can only aim it at their own teams (' + chips.join(', ') + ')', chips.length > 0 && chips.every((c) => /Worship|AV/.test(c)), JSON.stringify(chips));
  await page.evaluate(() => saveNews());
  const n = await until(async () => (await all('news')).find((x) => x.title === 'Synthetic rehearsal moved to 7pm'), 15000);
  ok('Post saves it, for the Worship Team only', !!n && JSON.stringify(n.teams) === JSON.stringify(['Worship Team']), JSON.stringify(n) + ' ' + JSON.stringify(await asked(page)));
  ok('no errors on the hub (posting)', !page.__said.length, page.__said.join(' | '));
  await page.close();
  const sees = async (who) => { const p = await open(who, 'hub.html'); const t = await until(() => p.evaluate(() => document.body.innerText.includes('Synthetic rehearsal moved to 7pm')), 15000); const said = p.__said.slice(); await p.close(); return { t: !!t, said }; };
  const sam = await sees(P.singer);
  ok('Sam (Worship Team) sees it on the hub', sam.t, sam.said.join(' | '));
  const kim = await sees(P.kids);
  ok('Kim (Kids Church) does not', !kim.t);

  /* The team email: Wendy writes to the Worship Team. */
  page = await open(P.lead, 'EmailBuilder2.html', '#subjectInput');
  await page.evaluate(() => { const b = document.querySelector('[onclick^="saveWhoAndContinue"]'); if (b && b.offsetParent !== null) b.click(); });
  const ticks = await until(() => page.evaluate(() => [...document.querySelectorAll('.team-filter')].map((c) => c.value)).then((v) => v.length ? v : null), 20000) || [];
  ok('"Send an email" offers the leader their teams (' + ticks.join(', ') + ')', ticks.includes('Worship Team') && !ticks.includes('Kids Church') && !ticks.includes('Everyone'), JSON.stringify(ticks));
  await page.evaluate(() => { const c = [...document.querySelectorAll('.team-filter')].find((x) => x.value === 'Worship Team'); c.checked = true; c.dispatchEvent(new Event('change', { bubbles: true })); });
  await page.type('#subjectInput', 'Synthetic team news');
  await page.evaluate(() => { document.getElementById('editable-body').innerHTML = '<p>Thank you all for Sunday.</p>'; });
  await page.evaluate(() => { window.__asked.length = 0; openReview(); });
  const chipsR = await until(() => page.evaluate(() => [...document.querySelectorAll('#reviewChips .chip')].map((c) => c.textContent.trim())).then((c) => c.length ? c : null), 10000) || [];
  const book = Object.fromEntries((await all('addressBook')).map((b) => [b.id, b]));
  const worship = Object.values(book).filter((b) => (b.markers || []).includes('Worship Team'));
  const adults = worship.filter((b) => !b.isMinor).map((b) => b.name), young = worship.filter((b) => b.isMinor).map((b) => b.name);
  ok('the review lists the Worship Team\'s adults (' + chipsR.length + ')', adults.every((a) => chipsR.includes(a)), JSON.stringify(chipsR) + ' ' + JSON.stringify(await asked(page)));
  ok('and leaves out the under-18 (' + young.join(', ') + ')', young.length > 0 && !young.some((y) => chipsR.includes(y)), JSON.stringify(chipsR));
  const before = new Set((await all('emailOutbox')).map((m) => m.id));
  await page.evaluate(() => sendAll());
  const mail = await until(async () => { const m = (await all('emailOutbox')).filter((x) => !before.has(x.id)); return m.length >= adults.length ? m : null; }, 60000) || (await all('emailOutbox')).filter((x) => !before.has(x.id));
  const to = (m) => JSON.stringify(m.to || '');
  ok('one email each to the team\'s adults (' + mail.length + ')', worship.filter((b) => !b.isMinor).every((b) => mail.some((m) => to(m).includes(b.email))), JSON.stringify(mail.map(to)));
  ok('none to the under-18, or to anyone off the team', !mail.some((m) => to(m).includes(P.young.email) || to(m).includes(P.kids.email)));
  ok('with the subject and the words written', mail.every((m) => m.subject === 'Synthetic team news' && String(m.html).includes('Thank you all for Sunday.')), JSON.stringify(mail.map((m) => m.subject)));
  const done = await until(() => page.evaluate(() => { const r = document.getElementById('sendResults'); return r && r.offsetParent !== null ? r.innerText.replace(/\s+/g, ' ') : ''; }), 20000) || '';
  ok('and the page says it went (' + done.slice(0, 80) + ')', /Everyone received it/.test(done), done);
  ok('no errors on Send an email', !page.__said.length, page.__said.join(' | '));
  await page.close();
};

/* ================= the run ================= */
const server = await serve(SERVE);
B = await browser();
try {
  await seed();
  for (const [k, fn] of Object.entries(JOURNEYS)) {
    if (ONLY.length && !ONLY.includes(k)) continue;
    WHERE = k; console.log('\n' + k);
    try { await fn(); } catch (e) { ok('the journey ran to the end', false, e && e.stack || e); }
  }
} finally { await B.close(); server.close(); }
console.log('\n' + R.filter(Boolean).length + ' of ' + R.length + ' checks passed');
if (FAULTS.length) console.log('Failed:\n  ' + FAULTS.join('\n  '));
if (NOT_REACHED.length) console.log('Not reached:\n  ' + NOT_REACHED.join('\n  '));
process.exit(R.every(Boolean) ? 0 : 1);
