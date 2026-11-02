/* GOING-LIVE TEST, STAGE 2: MOVING BETWEEN DATES ON EVERY PLANNER
 * (test-first-stage.md, "Added from the 1 Nov planner fault").
 *
 *   firebase emulators:exec --config firebase.spare.json --only firestore,auth --project egbc-worship-planner "node tests/stage2/planner-dates.mjs"
 *   ONLY=sunday,core ...   just those planners
 *
 * In a browser, with the locked rules, as a made-up worship leader, in one
 * session per planner, the way a person uses it: forwards and backwards with
 * ▶ ◀, the list, and "Pick another date", slowly and quickly, onto a date
 * with nothing on the rota and back. After every move the leader, the team,
 * the songs and the service box must be that date's, with nothing of any
 * other date's on screen. Then a save must land on that date's plan only.
 *
 * Every date has its own made-up names, so another date's on screen is
 * seen at once: Leader S2M, Singer S2M, Song S2M one, Notes S2M.
 */
import { serve, browser, person, signIn, put, all, wipe, sleep } from './harness.mjs';
import { EGBC_UNDER18 } from '../../functions/under18-teams.js';
import { boardsOf } from '../../functions/team-boards.js';

const SERVE = 8996, BASE = 'http://localhost:' + SERVE;
const ONLY = (process.env.ONLY || '').split(',').filter(Boolean);
const R = [], FAULTS = [];
const ok = (where, n, v, x) => {
  R.push(!!v);
  if (!v) FAULTS.push(where + ': ' + n);
  console.log('  ' + (v ? 'PASS  ' : 'FAIL  ') + n + (v || x === undefined ? '' : '\n          ' + String(x).slice(0, 400)));
};
const ymd = (d) => d.toISOString().slice(0, 10);
/* The next n days of the week w (0 Sunday) after today, as yyyy-mm-dd. */
function next(w, n) {
  const out = [], d = new Date(); d.setUTCHours(12, 0, 0, 0);
  do d.setUTCDate(d.getUTCDate() + 1); while (d.getUTCDay() !== w);
  for (let i = 0; i < n; i++) { out.push(ymd(d)); d.setUTCDate(d.getUTCDate() + 7); }
  return out;
}

/* ---- the made-up rota ---- */
const SUN = next(0, 4), FRI = next(5, 3), EMPTY = next(3, 1)[0];
const EVENTS = [];
const ev = (tag, date, type, startTime, teams, plan) => EVENTS.push({ tag, id: 'pd_' + tag, date, type, startTime, teams, plan });
ev('S1M', SUN[0], 'Sunday Morning Worship', '10:30', ['Worship Team', 'AV Team'], true);
ev('S2M', SUN[1], 'Sunday Morning Worship', '10:30', ['Worship Team', 'AV Team'], true);
ev('S2E', SUN[1], 'LOUD Worship', '18:30', ['Worship Team', 'AV Team'], true);
ev('S3M', SUN[2], 'Sunday Morning Worship', '10:30', ['Worship Team', 'AV Team'], false);
ev('S4M', SUN[3], 'Sunday Morning Worship', '10:30', ['Worship Team', 'AV Team'], true);
ev('Y1', FRI[0], 'Youth Service', '19:00', ['Youth Worship'], true);
ev('Y2', FRI[1], 'Youth Service', '19:00', ['Youth Worship'], false);
ev('Y3', FRI[2], 'Youth Service', '19:00', ['Youth Worship'], true);
const TAGS = EVENTS.map((e) => e.tag);

async function seed() {
  await wipe();
  await put('teamFlags/under18', { teams: EGBC_UNDER18.slice().sort() });
  await put('teamFlags/boards', { boards: boardsOf([]) });
  for (const e of EVENTS) {
    await put('events/' + e.id, { date: e.date, type: e.type, startTime: e.startTime, endTime: '', teams: e.teams, archived: false, draft: false,
      description: 'Desc ' + e.tag, roles: ['Worship Leader', 'Vocals', 'Sound'],
      assignments: { 'Worship Leader': { name: 'Leader ' + e.tag, id: '' }, Vocals: { name: 'Singer ' + e.tag, id: '' }, Sound: { name: 'Sound ' + e.tag, id: '' } } });
    if (e.plan) await put('services/plan_' + e.tag, { date: e.date, eventId: e.id, worshipLeader: 'Leader ' + e.tag, serviceNotes: 'Notes ' + e.tag,
      introText: 'Intro ' + e.tag, outroText: '', roleNotes: {},
      order: [{ type: 'song', title: 'Song ' + e.tag + ' one', keys: ['G'], notes: '' }, { type: 'item', title: 'Welcome' }, { type: 'song', title: 'Song ' + e.tag + ' two', keys: [], notes: '' }] });
  }
  return person({ key: 'pd_lead', name: 'Planner Lead Synthetic', teams: ['Worship Team', 'AV Team', 'Core Team', 'Youth Worship'], adminFor: ['Worship Team', 'Youth Worship', 'AV Team'] });
}

/* ---- the planners ---- */
const PAGE = { date: '#serviceDate', sel: '#eventSelect', leader: '#leaderName', team: '#teamBody', songs: '#service-order .song-title', notes: '#serviceTypeNotes', intro: '#introBox' };
const SP = { date: '#spDate', sel: '#spEventSelect', leader: '#spLeaderName', team: '#spTeamBody', songs: '#sp-order .song-title', notes: '#spTypeNotes', intro: '#spIntro' };
const PLANNERS = [
  Object.assign({ key: 'sunday', name: 'Sunday Service Planner', url: 'SundayServicePlanner.html', picker: true, save: 'button[onclick^="saveSchedule"]' }, PAGE),
  Object.assign({ key: 'youth', name: 'Youth Service Planner', url: 'youthserviceplanner.html', picker: true, save: 'button[onclick^="saveSchedule"]' }, PAGE),
  Object.assign({ key: 'core', name: 'Core Team app planner', url: 'CoreTeamApp.html', picker: true, save: 'button[onclick^="spSave"]',
    open: async (page) => { await page.waitForFunction(() => typeof openSection === 'function', { timeout: 30000 }); await sleep(1500); await page.evaluate(() => { try { if (typeof endTour === 'function') endTour(); } catch (e) {} openSection('service'); }); } }, SP),
  Object.assign({ key: 'app', name: 'app.html "This Sunday"', url: 'app.html', picker: true, save: 'button[onclick^="spSave"]',
    open: async (page) => { await page.waitForFunction(() => window.EGBCApp && EGBCApp.go, { timeout: 30000 }); await sleep(2500); await page.evaluate(() => EGBCApp.go('core', 'plan')); } }, SP),
  Object.assign({ key: 'training', name: 'Training Sunday planner', url: 'training Sunday planner.html', picker: false, save: 'button[onclick^="saveSchedule"]', store: 'session',
    /* It shows trainees an example in the service box, and reloads once with its version on the address. */
    noPlanNotes: 'Communion Service', open: async (page) => { await page.waitForFunction(() => /[?&]v=/.test(location.search) && typeof window.selectEvent === 'function', { timeout: 30000 }); await sleep(1500); } }, PAGE),
  Object.assign({ key: 'youthhub', name: 'Youth Hub planner', url: 'youthapp2.html', picker: false, save: '#planner-save-btn',
    open: async (page) => { await page.waitForFunction(() => typeof openSection === 'function', { timeout: 30000 }); await sleep(1500); await page.evaluate(() => { try { if (typeof endTour === 'function') endTour(); } catch (e) {} openSection('planner'); }); } },
    PAGE, { songs: '#service-order .song-title-input' }),
].filter((p) => !ONLY.length || ONLY.includes(p.key));

/* What the page shows now. */
function shown(page, P) {
  return page.evaluate((P) => {
    const q = (s) => document.querySelector(s);
    const sel = q(P.sel), opt = sel && sel.selectedIndex > 0 ? sel.options[sel.selectedIndex].text : '';
    return { date: (q(P.date) || {}).value || '', service: opt, leader: ((q(P.leader) || {}).textContent || '').trim(),
      team: ((q(P.team) || {}).textContent || '').replace(/\s+/g, ' ').trim(),
      songs: [...document.querySelectorAll(P.songs)].map((t) => t.value).filter(Boolean),
      notes: (q(P.notes) || {}).value || '', intro: (q(P.intro) || {}).value || '',
      roles: [...document.querySelectorAll('input[id^="role"]')].map((i) => i.value).filter(Boolean).join(' '),
      list: (() => { const i = q(P.date); const o = i && i.parentNode && i.parentNode.hasAttribute('data-uk-date') ? i.parentNode : i; const w = o && o.previousElementSibling; const l = w && w.querySelector && w.querySelector('[data-uk="list"]'); return l ? l.value : null; })() };
  }, P);
}
/* The event a screen is showing: its date, and the service chosen. */
function eventFor(s) {
  const day = EVENTS.filter((e) => e.date === s.date && s.service && s.service.indexOf(e.type) === 0);
  return (day.length > 1 ? day.find((e) => s.service.includes(e.startTime)) : day[0]) || null;
}
/* Everything on screen is this event's, and nothing is any other date's. */
function judge(s, e, P) {
  const bad = [];
  const others = TAGS.filter((t) => !e || t !== e.tag);
  const text = [s.leader, s.team, s.songs.join(' '), s.notes, s.intro, s.roles].join(' | ');
  const stray = others.filter((t) => new RegExp('\\b' + t + '\\b').test(text));
  if (stray.length) bad.push('shows another date\'s ' + stray.join(', '));
  if (e) {
    if (s.leader !== 'Leader ' + e.tag) bad.push('leader ' + JSON.stringify(s.leader));
    if (!s.team.includes('Singer ' + e.tag)) bad.push('team ' + JSON.stringify(s.team.slice(0, 80)));
    const songs = e.plan ? ['Song ' + e.tag + ' one', 'Song ' + e.tag + ' two'] : [];
    if (JSON.stringify(s.songs) !== JSON.stringify(songs)) bad.push('songs ' + JSON.stringify(s.songs));
    const notes = e.plan ? 'Notes ' + e.tag : (P.noPlanNotes || 'Desc ' + e.tag);
    if (s.notes !== notes) bad.push('service box ' + JSON.stringify(s.notes));
    /* The date list says the same service as the screen. */
    if (s.list !== null && s.list !== e.date + '|' + e.type) bad.push('the list says ' + JSON.stringify(s.list));
  }
  return bad;
}
/* Waits for the page to settle on what it should show, then a little longer
   in case a late answer from the previous date lands on top. */
async function settle(page, P, want) {
  let s, e, bad;
  for (let i = 0; i < 24; i++) {
    await sleep(400);
    s = await shown(page, P); e = eventFor(s);
    if (want && s.date !== want) continue;
    bad = judge(s, e, P);
    if (e && !bad.length) break;
    if (!e && want === EMPTY && !bad.length) break;
  }
  await sleep(1500);
  s = await shown(page, P); e = eventFor(s);
  return { s, e, bad: judge(s, e, P) };
}

/* A first-visit tour that starts on a timer covers the page: tapped away, as a person does. */
const dismissTour = (page) => page.evaluate(() => { const d = document.querySelector('#tour-overlay.active [onclick*="endTour"]'); if (d) { d.click(); return true; } return false; }).catch(() => false);

/* ---- the moves ---- */
const wrapOf = (P) => `(() => { const i = document.querySelector(${JSON.stringify(P.date)}); const o = i.parentNode && i.parentNode.hasAttribute('data-uk-date') ? i.parentNode : i; return o.previousElementSibling; })()`;
async function arrow(page, P, which) {
  return page.evaluate((w, which) => { const b = eval(w).querySelector('[data-uk="' + which + '"]'); if (!b || b.disabled) return false; b.click(); return true; }, wrapOf(P), which);
}
async function listPick(page, P, value) {
  return page.evaluate((w, v) => { const s = eval(w).querySelector('[data-uk="list"]'); s.value = v; s.dispatchEvent(new Event('change', { bubbles: true })); return s.value === v; }, wrapOf(P), value);
}
/* "Pick another date", then a date from the calendar (the box's value and its change, as the browser's calendar does). */
async function pickAnother(page, P, date) {
  return page.evaluate((w, sel, d) => {
    const o = eval(w).querySelector('[data-uk="other"]'); if (o) o.click();
    const i = document.querySelector(sel); i.value = d; i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new Event('change', { bubbles: true })); return true;
  }, wrapOf(P), P.date, date);
}
/* On a page with a plain date box and a service list: the date, then the service. */
async function plainDate(page, P, date) {
  await page.evaluate((sel, d) => { const i = document.querySelector(sel); i.value = d; i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new Event('change', { bubbles: true })); }, P.date, date);
}
async function plainService(page, P, e) {
  for (let i = 0; i < 30; i++) {
    const done = await page.evaluate((sel, type, time) => {
      const s = document.querySelector(sel); if (!s) return false;
      const o = [...s.options].filter((x) => x.value !== '' && x.text.indexOf(type) === 0);
      const hit = o.length > 1 ? o.find((x) => x.text.includes(time)) : o[0];
      if (!hit) return false;
      s.value = hit.value; s.dispatchEvent(new Event('change', { bubbles: true })); return true;
    }, P.sel, e.type, e.startTime);
    if (done) return true;
    await sleep(200);
  }
  return false;
}

async function run(b, lead, P) {
  console.log('\n' + P.name);
  const page = await b.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  const said = [];
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|favicon/.test(m.text())) said.push(m.text().slice(0, 200)); });
  page.on('pageerror', (e) => said.push('pageerror: ' + String(e.stack || e.message).slice(0, 500)));
  await signIn(page, BASE, lead, P.url);
  if (P.open) await P.open(page);
  await sleep(1000); await dismissTour(page);
  const where = P.name;
  const ready = await page.waitForSelector(P.date, { timeout: 30000 }).then(() => true, () => false);
  ok(where, 'the planner opens', ready, said.join(' | '));
  if (!ready) { await page.close(); return; }
  const step = async (label, want, act) => {
    if (act) await act();
    const r = await settle(page, P, want);
    ok(where, label + ' -> ' + (r.e ? r.e.tag : r.s.date || 'no date') + ': team, songs and service box are that date\'s', !r.bad.length && (want !== undefined ? r.s.date === want : !!r.e),
      r.bad.join('; ') + ' [shown ' + JSON.stringify(r.s).slice(0, 300) + ']');
    return r;
  };

  if (P.picker) {
    /* It opens on a coming service. */
    await page.waitForFunction((w) => { const s = eval(w); return s && s.querySelector('[data-uk="list"]').options.length > 1; }, { timeout: 20000 }, wrapOf(P)).catch(() => {});
    let r = await step('opening', undefined);
    const list = await page.evaluate((w) => [...eval(w).querySelector('[data-uk="list"]').options].map((o) => o.value).filter(Boolean), wrapOf(P));
    ok(where, 'the list holds every coming service (' + list.length + ')', EVENTS.every((e) => list.includes(e.date + '|' + e.type)), JSON.stringify(list));
    const idx = (d) => list.findIndex((v) => v.split('|')[0] === d);
    /* Where k steps from the service the list is on now lands. */
    const from = (k) => { const i = list.indexOf(r.s.list); return (list[Math.max(0, Math.min(list.length - 1, i + k))] || '').split('|')[0]; };
    /* Slowly: forwards twice, back once. */
    for (const [w, k] of [['next', 1], ['next', 1], ['prev', -1]]) r = await step('▶◀ slowly ' + w, from(k), () => arrow(page, P, w));
    /* Quickly: three forwards in a row, then two back. */
    r = await step('▶▶▶ quickly', from(3), async () => { for (let n = 0; n < 3; n++) { await arrow(page, P, 'next'); await sleep(60); } });
    r = await step('◀◀ quickly', from(-2), async () => { for (let n = 0; n < 2; n++) { await arrow(page, P, 'prev'); await sleep(60); } });
    /* The list: the evening service on a two-service Sunday, then a jump. */
    const s2e = EVENTS.find((e) => e.tag === 'S2E');
    r = await step('the list: ' + s2e.type + ' on ' + s2e.date, s2e.date, () => listPick(page, P, s2e.date + '|' + s2e.type));
    ok(where, 'the list chose the evening service, not the morning', r.e && r.e.tag === 'S2E', JSON.stringify(r.s.service));
    const last = list[list.length - 1];
    r = await step('the list: the last service', last.split('|')[0], () => listPick(page, P, last));
    /* The list quickly: two choices in a row. */
    r = await step('the list quickly: S1 then S4', SUN[3], async () => { await listPick(page, P, SUN[0] + '|Sunday Morning Worship'); await sleep(80); await listPick(page, P, SUN[3] + '|Sunday Morning Worship'); });
    /* Pick another date: one with nothing on the rota, then back to a real one. */
    r = await step('"Pick another date": ' + EMPTY + ' (nothing on the rota)', EMPTY, () => pickAnother(page, P, EMPTY));
    ok(where, 'a date with nothing on it shows no service as chosen', !r.e && !r.s.service, JSON.stringify(r.s.service));
    ok(where, 'and nothing of another date on screen', !r.s.team && !r.s.songs.length && !r.s.notes, JSON.stringify(r.s));
    const asked = await page.evaluate(() => (window.__asked || []).length);
    const services0 = JSON.stringify(await all('services'));
    await page.click(P.save).catch(() => {});
    await sleep(2500);
    ok(where, 'saving on a date with nothing on it changes no plan', JSON.stringify(await all('services')) === services0);
    void asked;
    r = await step('"Pick another date": ' + SUN[2], SUN[2], () => pickAnother(page, P, SUN[2]));
    { const i = idx(SUN[2]); r = await step('◀ from a picked date', list[i - 1].split('|')[0], () => arrow(page, P, 'prev')); }
    /* One Sunday, two services: morning then evening at once. */
    r = await step('the list quickly on one day: morning then evening', SUN[1], async () => { await listPick(page, P, SUN[1] + '|Sunday Morning Worship'); await sleep(30); await listPick(page, P, SUN[1] + '|LOUD Worship'); });
    ok(where, 'the evening service is the one shown', r.e && r.e.tag === 'S2E', JSON.stringify(r.s.service));
    /* Quickly back and forth through every date, ending on S2's morning. */
    r = await step('▶◀▶◀ quickly', undefined, async () => { for (const w of ['next', 'prev', 'next', 'prev', 'next', 'prev']) { await arrow(page, P, w); await sleep(40); } });
    if (idx(r.s.date) < 0) ok(where, 'ended on a date in the list', false, r.s.date);
    /* The youth planner saves youth services only: end on one. */
    if (P.key === 'youth') r = await step('the list: ' + FRI[2], FRI[2], () => listPick(page, P, FRI[2] + '|Youth Service'));
    await finalSave(page, P, where, r, said);
  } else {
    /* A plain date box and a service list: the date, then the service. */
    const go = async (e, label, quick) => step(label + ' ' + e.tag, e.date, async () => {
      if (quick) { await plainDate(page, P, quick.date); await sleep(60); }
      await plainDate(page, P, e.date); await plainService(page, P, e);
    });
    const E = (t) => EVENTS.find((e) => e.tag === t);
    let r;
    for (const t of ['S1M', 'S2M', 'S2E', 'S3M', 'Y1', 'Y2', 'S1M']) r = await go(E(t), 'slowly to', null);
    r = await go(E('S4M'), 'quickly (via S2) to', E('S2M'));
    r = await go(E('Y3'), 'quickly (via Y1) to', E('Y1'));
    r = await go(E('S3M'), 'quickly (via S4) to', E('S4M'));
    /* One Sunday, two services: morning then evening at once. */
    r = await step('one day quickly: morning then evening', SUN[1], async () => { await plainDate(page, P, SUN[1]); await plainService(page, P, E('S2M')); await sleep(30); await plainService(page, P, E('S2E')); });
    ok(where, 'the evening service is the one shown', r.e && r.e.tag === 'S2E', JSON.stringify(r.s.service));
    r = await step('a date with nothing on it ' + EMPTY, EMPTY, () => plainDate(page, P, EMPTY));
    r = await go(E(P.key === 'youthhub' ? 'Y3' : 'S2E'), 'back to', null);
    await finalSave(page, P, where, r, said);
  }
  ok(where, 'no errors on the page', !said.length, said.join(' | '));
  await page.close();
}

/* Save what is shown, and check it landed on that date's plan only. */
async function finalSave(page, P, where, r, said) {
  if (!r.e) { ok(where, 'a service to save', false, JSON.stringify(r.s)); return; }
  const mark = 'Saved for ' + r.e.tag + ' ' + Date.now();
  await page.evaluate((sel, m) => { const t = document.querySelector(sel); t.value = m; t.dispatchEvent(new Event('input', { bubbles: true })); }, P.intro, mark);
  const before = await all('services');
  if (process.env.SAVE_DEBUG) console.log('   debug save', JSON.stringify(await page.evaluate((sel) => { const b = document.querySelector(sel); const r = b && b.getBoundingClientRect(); const top = r && document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    return { found: !!b, visible: !!(b && b.offsetParent), rect: r && [r.x, r.y, r.width, r.height], top: top && (top.id || top.className || top.tagName), fn: typeof window.saveSchedule, youth: typeof isYouthService !== 'undefined' ? isYouthService : '?', shown: typeof planShownFor !== 'undefined' ? planShownFor : '?' }; }, P.save)));
  await dismissTour(page);
  /* As a person does: the button scrolled to the middle of the screen, then tapped where they see it. */
  await page.evaluate((sel) => { const b = document.querySelector(sel); if (b) b.scrollIntoView({ block: 'center' }); }, P.save);
  await sleep(300);
  const onTop = await page.evaluate((sel) => { const b = document.querySelector(sel); if (!b) return 'no button'; const r = b.getBoundingClientRect(); const t = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return t === b || b.contains(t) ? '' : 'covered by ' + (t ? t.outerHTML.slice(0, 160) + ' parent ' + (t.parentElement ? t.parentElement.outerHTML.slice(0, 160) : '') + ' pos ' + getComputedStyle(t).position + ' z ' + getComputedStyle(t).zIndex : 'nothing'); }, P.save);
  if (onTop) ok(where, 'the Save button can be tapped', false, onTop);
  const clicked = await page.click(P.save).then(() => true, (e) => String(e.message));
  let after = before;
  for (let i = 0; i < 30; i++) { await sleep(500); after = await all('services'); if (P.store === 'session' || after.some((d) => (d.introText || '') === mark)) break; }
  await sleep(1000); after = await all('services');
  if (P.store === 'session') {
    const kept = await page.evaluate((d) => Object.keys(sessionStorage).filter((k) => k.endsWith('_' + d)).map((k) => sessionStorage.getItem(k)), r.e.date);
    ok(where, 'Save (training): kept on this device for ' + r.e.date + ', no plan in the database changed', clicked === true && kept.some((v) => v.includes(mark)) && JSON.stringify(after) === JSON.stringify(before), clicked + ' ' + JSON.stringify(kept).slice(0, 200));
    return;
  }
  const mine = after.filter((d) => (d.introText || '') === mark);
  const others = after.filter((d) => (d.introText || '') !== mark);
  const unchanged = others.every((d) => JSON.stringify(d) === JSON.stringify(before.find((x) => x.id === d.id)));
  const right = mine.length === 1 && mine[0].date === r.e.date && (mine[0].eventId === r.e.id || !mine[0].eventId) && (mine[0].order || []).filter((o) => o.type === 'song').every((o) => !o.title || o.title.includes(r.e.tag));
  ok(where, 'Save -> landed on ' + r.e.tag + ' (' + r.e.date + ') only, with that date\'s songs', clicked === true && right && unchanged,
    clicked + ' ' + JSON.stringify(mine).slice(0, 300) + ' unchanged others: ' + unchanged + ' page said: ' + JSON.stringify(await page.evaluate(() => (window.__asked || []).slice(-3)).catch(() => [])) + ' ' + said.join(' | '));
}

const lead = await seed();
const server = await serve(SERVE);
const b = await browser();
try {
  for (const P of PLANNERS) {
    try { await run(b, lead, P); } catch (e) { ok(P.name, 'the run itself', false, e && e.stack || e); }
  }
} finally { await b.close(); server.close(); }
console.log('\n' + R.filter(Boolean).length + ' of ' + R.length + ' checks passed');
if (FAULTS.length) console.log('Failed:\n  ' + FAULTS.join('\n  '));
process.exit(R.every(Boolean) ? 0 : 1);
