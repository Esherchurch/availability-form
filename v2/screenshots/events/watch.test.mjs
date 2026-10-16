/* Watch (NEXT-BRIEF §24 item 5; F-163): the office's page and the app's
   "Listen & Watch". Events window. Invented people only, events emulators
   only, network guard (YouTube itself is never reached: the player's
   address is checked, not played), no email leaves the machine.

     npx firebase emulators:exec --config firebase.events.json --only auth,firestore,storage \
       --project egbc-worship-planner "node screenshots/events/watch.test.mjs"

   What it proves:
     1. the office (the person who looks after sermons) sets this week's live
        link, its show-until filled from the church's default (EGBC: Sunday
        4pm); adds full services (everyone signed in, and church members
        only); hides a channel video; saves the channel id
     2. "Listen & Watch" in the app, at 375px: the "Watch live" card plays in
        place; Watch lists the full services and the channel, newest first,
        never a hidden one; a church members' service only for a church
        member
     3. after show-until the card goes (the church chose "disappear"), or
        becomes "Watch again" (it chose that) until the second time
     4. NEVER SIGNED OUT: the live link and the members' services cannot be
        read; Home's helper (watchLive) gives nothing
     5. switched off (EGBCChurch.uses('watch') false): plain "Listen", no
        Watch and no live card */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, setDoc } from 'firebase/firestore';
import puppeteer from 'puppeteer-core';
import { createGuard } from './guard.mjs';
const GUARD = createGuard();

const HERE = path.dirname(fileURLToPath(import.meta.url));
const V2 = path.resolve(HERE, '..', '..');
const PROJECT = 'egbc-worship-planner';
const cfg = JSON.parse(fs.readFileSync(path.join(V2, 'firebase.events.json'), 'utf8'));
if (cfg.emulators.firestore.port !== 8182 || cfg.emulators.auth.port !== 9098) throw new Error('Not the events emulators - refusing to write.');
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'egbc-watch-'));
const STAMP = JSON.parse(fs.readFileSync(path.join(V2, 'version.json'), 'utf8').replace(/^\uFEFF/, '')).stamp;
const wctx = { window: {}, Intl, Date, Promise, encodeURIComponent, String, Object, Math }; wctx.self = wctx.window; vm.createContext(wctx);
vm.runInContext(fs.readFileSync(path.join(V2, 'egbc-watch.js'), 'utf8'), wctx);
const W = wctx.window.EGBCWatch;

const results = [];
function ok(name, pass, why) { results.push(!!pass); console.log((pass ? '  PASS  ' : '  FAIL  ') + name + (pass || !why ? '' : '\n          ' + String(why).slice(0, 500))); }
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function until(fn, ms = 15000) { const end = Date.now() + ms; let last; while (Date.now() < end) { try { last = await fn(); if (last) return last; } catch (e) { last = null; } await sleep(200); } return last; }
const J = (x) => JSON.stringify(x);

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
  firestore: { rules: fs.readFileSync(path.join(V2, 'firestore.rules'), 'utf8'), host: '127.0.0.1', port: 8182 } });
await env.clearFirestore();
await fetch(`http://127.0.0.1:9098/emulator/v1/projects/${PROJECT}/accounts`, { method: 'DELETE' });

const P = {
  pat: { email: 'pat.office@example.invalid', name: 'Pat Office', mid: 'm_pat' },
  wes: { email: 'wes.attender@example.invalid', name: 'Wes Attender', mid: 'm_wes' },
  cam: { email: 'cam.member@example.invalid', name: 'Cam Member', mid: 'm_cam', churchMember: true }
};
for (const k of Object.keys(P)) {
  P[k].uid = (await (await fetch('http://127.0.0.1:9098/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: P[k].email, password: 'synthetic-only-123', returnSecureToken: true }) })).json()).localId;
}
const LIVE_URL = 'https://www.youtube.com/live/llllllllll1?feature=share', MEM = 'https://youtu.be/mmmmmmmmmm1', CMV = 'https://www.youtube.com/watch?v=cccccccccc1';
await env.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  for (const k of Object.keys(P)) {
    const x = P[k];
    await setDoc(doc(db, 'addressBook', x.mid), { name: x.name, email: x.email, markers: [], adminFor: [], masterAdmin: false, churchMember: !!x.churchMember });
    await setDoc(doc(db, 'users', x.uid), { memberId: x.mid, linkedBy: 'admin', name: x.name, email: x.email, teams: [], adminFor: [], masterAdmin: false, attender: true, churchMember: !!x.churchMember, status: 'active' });
  }
  await setDoc(doc(db, 'sermonShow', 'access'), { memberIds: ['m_pat'], updatedAt: 'x', updatedBy: 'x' });
  await setDoc(doc(db, 'churchSettings', 'details'), { name: 'Test Green Church', enquiryEmail: 'office@example.invalid', logoUrl: '', logoPath: '' });
  /* The channel, as the hub function writes it: three videos, newest last here. */
  const YT = (id, title, pub) => ({ source: 'feed', videoId: id, title, published: pub, thumb: '', description: '', hidden: false, createdAt: 'x', updatedAt: 'x' });
  await setDoc(doc(db, 'videos', 'yt_aaaaaaaaaa1'), YT('aaaaaaaaaa1', 'Harvest Sunday (invented)', '2026-10-04T10:30:00Z'));
  await setDoc(doc(db, 'videos', 'yt_bbbbbbbbbb2'), YT('bbbbbbbbbb2', 'A video to hide (invented)', '2026-10-08T10:30:00Z'));
  await setDoc(doc(db, 'videos', 'yt_dddddddddd4'), YT('dddddddddd4', 'Newest: youth night (invented)', '2026-10-11T19:00:00Z'));
  await setDoc(doc(db, 'watchShow', 'feedStatus'), { lastReadAt: 'x', ok: true, videos: 3, channelTitle: 'Test Green Church (invented)' });
});
const readDb = async (fn) => { let out; await env.withSecurityRulesDisabled(async (c) => { out = await fn(c.firestore()); }); return out; };
const { getDoc } = await import('firebase/firestore');
const get = (c, id) => readDb(db => getDoc(doc(db, c, id)).then(s => s.exists() ? s.data() : null));

const errors = [], browsers = [];
async function as(who) {
  const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', userDataDir: fs.mkdtempSync(path.join(TMP, who + '-')), args: ['--no-first-run'] });
  GUARD.watchBrowser(b); browsers.push(b);
  const p = await b.newPage();
  await GUARD.protect(p, who);
  await p.evaluateOnNewDocument((k) => { try { sessionStorage.setItem(k, '1'); } catch (e) {} }, 'egbc_fresh_' + STAMP);
  await p.setViewport({ width: 375, height: 812 });
  p.on('pageerror', e => errors.push(who + ': ' + e.message));
  p.on('dialog', d => d.accept());
  await p.goto(URLB + 'whatson.html', { waitUntil: 'networkidle2' });
  await p.waitForFunction(() => window.firebase && firebase.apps.some(a => a.name === 'egbc'));
  if ((await p.evaluate(() => EGBCAuth.db._delegate._settings.host)) !== 'localhost:8182') throw new Error('Not on the events emulator');
  if (who !== 'guest') await p.evaluate((e) => firebase.auth(firebase.app('egbc')).signInWithEmailAndPassword(e, 'synthetic-only-123'), P[who].email);
  return p;
}
const tap = (p, sel) => p.$eval(sel, e => e.click());
const val = (p, sel, v) => p.$eval(sel, (e, v) => { e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); }, v);
const text = (p, sel) => p.$eval(sel || 'body', e => e.innerText.replace(/\s+/g, ' '));
const app = 'screenshots/events/app-harness.html?space=me&tab=listen';
const boxOf = (ms) => { const d = new Date(ms), z = (n) => (n < 10 ? '0' : '') + n; return d.getFullYear() + '-' + z(d.getMonth() + 1) + '-' + z(d.getDate()) + 'T' + z(d.getHours()) + ':' + z(d.getMinutes()); };

try {
  /* ---------- 1. the office ---------- */
  const O = await as('pat');
  await O.goto(URLB + 'watch-admin.html', { waitUntil: 'networkidle2' });
  await O.waitForSelector('#lv-url');
  const want = W.defaultTimes({}, new Date());
  const shownUntil = await O.$eval('#lv-until', e => e.value);
  ok('1. THE OFFICE: show-until starts at the church\'s default, the coming Sunday at 4pm', shownUntil === boxOf(want.showUntil) && /T16:00$/.test(shownUntil), shownUntil + ' vs ' + boxOf(want.showUntil));
  const shownFrom = await O.$eval('#lv-from', e => e.value);
  ok('   ON THE DAY (Martin, 14 Oct): show-from starts at the start of that Sunday, not now', shownFrom === boxOf(want.showFrom) && /T00:00$/.test(shownFrom) && shownFrom.slice(0, 10) === shownUntil.slice(0, 10), shownFrom);
  /* The rest of the test is "on the day": from now. */
  await val(O, '#lv-from', boxOf(Date.now() - 60000));
  await val(O, '#lv-url', LIVE_URL);
  await val(O, '#lv-title', 'Sunday morning (invented)');
  await tap(O, '#lv-go');
  const live = await until(async () => { const l = await get('watchShow', 'live'); return l && l.url ? l : null; });
  ok('   the live link is saved: its video, from now, until that Sunday 4pm, then it disappears', live && live.videoId === 'llllllllll1' && Math.abs(live.showUntil - want.showUntil) < 60000 && live.after === 'disappear', J(live));
  await O.waitForSelector('#lv-state.ok');
  ok('   the page says it is showing as "Watch live", and when it goes', /Showing as “Watch live” until .*then it disappears/.test(await text(O, '#lv-state')), await text(O, '#lv-state'));
  await val(O, '#mv-url', 'https://example.invalid/not-youtube');
  await val(O, '#mv-title', 'Nope');
  await tap(O, '#mv-go');
  await sleep(800);
  ok('   a link that is not YouTube is refused, and nothing is saved', !(await get('videos', 'mv_')) && /not a YouTube video link/.test(await text(O, '#mv-msg')), await text(O, '#mv-msg'));
  await val(O, '#mv-url', MEM); await val(O, '#mv-title', 'Full service, 11 Oct (invented)'); await val(O, '#mv-date', '2026-10-11');
  await tap(O, '#mv-go');
  await until(() => get('videos', 'mv_mmmmmmmmmm1'));
  await O.waitForSelector('#mv-url');
  await val(O, '#mv-url', CMV); await val(O, '#mv-title', 'Church meeting (invented)'); await val(O, '#mv-date', '2026-10-12');
  await O.select('#mv-who', 'churchMembers');
  await tap(O, '#mv-go');
  const cm = await until(() => get('videos', 'mv_cccccccccc1'));
  ok('   adds a full service for everyone signed in, and one for church members only', (await get('videos', 'mv_mmmmmmmmmm1')).audience === 'signedIn' && cm.audience === 'churchMembers');
  await O.waitForSelector('[data-yt="yt_bbbbbbbbbb2"]');
  ok('   the page says plainly that an unlisted link can be passed on', /an unlisted link can still be passed on/.test(await text(O, '#members')));
  await tap(O, '[data-yt="yt_bbbbbbbbbb2"]');
  ok('   hides a channel video', !!(await until(async () => (await get('videos', 'yt_bbbbbbbbbb2')).hidden === true)));
  await O.waitForSelector('#ch-id');
  await val(O, '#ch-id', 'UCf7lMnb24HfNJKGpMeYdQXQ');
  await tap(O, '#ch-go');
  ok('   saves the church\'s channel id', !!(await until(async () => ((await get('watchShow', 'settings')) || {}).channelId === 'UCf7lMnb24HfNJKGpMeYdQXQ')));

  /* ---------- 2. the app ---------- */
  const A = await as('wes');
  await A.goto(URLB + app, { waitUntil: 'networkidle2' });
  await until(() => A.$('[data-l="live"]'));
  const head = await text(A, '#egbc-content');
  ok('2. THE APP: "Listen & Watch", with a Listen / Watch switch', /Listen & Watch/.test(head) && !!(await A.$('[data-lact="part:watch"]')), head.slice(0, 200));
  ok('   the "Watch live" card, with its name', /Watch live/.test(await text(A, '[data-l="live"]')) && /Sunday morning \(invented\)/.test(await text(A, '[data-l="live"]')));
  await A.screenshot({ path: path.join(HERE, 'watch-live-375.png'), fullPage: true });
  /* F-219 (main window; Martin, 15 Oct): no sermons yet, so it opens on Watch, with "Latest" on top. */
  await until(() => A.$('[data-l="latest"]'));
  ok('   NO SERMONS YET: it opens on WATCH, not an empty Listen', (await A.$eval('[data-lact="part:watch"]', b => b.getAttribute('aria-pressed'))) === 'true' && !!(await A.$('[data-l="channel"], [data-l="members"]')));
  const lat = await text(A, '[data-l="latest"]');
  ok('   a "Latest" strip on top: the newest video', /Latest video/.test(lat) && /Newest: youth night/.test(lat), lat);
  await A.evaluate(() => document.querySelector('[data-lact="part:listen"]').click());
  await until(async () => /Sermons will appear here once they are put up/.test(await text(A, '#egbc-content')));
  ok('   Listen, chosen: "Sermons will appear here once they are put up."', /Sermons will appear here once they are put up\./.test(await text(A, '#egbc-content')));
  await A.evaluate(() => document.querySelector('[data-lact="part:watch"]').click());
  await sleep(300);
  await A.evaluate(() => document.querySelector('[data-lact="vlive"]').click());
  await until(() => A.$('#lis-video'));
  const src = await A.$eval('#lis-video', e => e.getAttribute('src'));
  ok('   tapped, it plays in place: YouTube\'s no-cookie player, this week\'s video', src.indexOf('https://www.youtube-nocookie.com/embed/llllllllll1?') === 0, src);
  await A.evaluate(() => document.querySelector('[data-lact="vclose"]').click());
  await A.evaluate(() => document.querySelector('[data-lact="part:watch"]').click());
  await until(() => A.$('[data-l="channel"]'));
  const mem = await text(A, '[data-l="members"]'), chan = await text(A, '[data-l="channel"]');
  ok('   Watch: the full service for everyone signed in', /Full service, 11 Oct \(invented\)/.test(mem), mem);
  ok('   NOT the church members\' one, for an attender', !/Church meeting/.test(mem));
  ok('   the channel, newest first, never the hidden one', /Newest: youth night.*Harvest Sunday/.test(chan) && !/to hide/.test(chan), chan);
  await A.evaluate(() => document.querySelector('[data-l="channel"] [data-lact="video:dddddddddd4"]').click());
  await until(async () => /dddddddddd4/.test(await A.$eval('#lis-video', e => e.getAttribute('src')).catch(() => '')));
  ok('   a channel video plays in place too', (await A.$eval('#lis-video', e => e.getAttribute('src'))).indexOf('/embed/dddddddddd4?') > 0);
  const shape = await A.evaluate(() => { const f = document.getElementById('lis-video').getBoundingClientRect(), c = document.querySelector('[data-l="player"] [data-lact="vclose"]').getBoundingClientRect();
    const card = document.querySelector('[data-l="player"]').getBoundingClientRect();
    return { ratio: Math.round(f.height / f.width * 100) / 100, w: Math.round(f.width), close: c.height > 0 && c.top >= f.bottom, holds: card.bottom >= c.bottom - 1 && card.height >= f.height + c.height,
      dbg: (function () { const el = document.querySelector('[data-l="player"]'), cs = getComputedStyle(el), pcs = getComputedStyle(el.parentElement), ifr = document.getElementById('lis-video'), ics = getComputedStyle(ifr);
        return { cardH: Math.round(card.height), ifrH: Math.round(f.height), cardCss: [cs.display, cs.height, cs.maxHeight, cs.overflow].join(' '), parent: [el.parentElement.tagName, el.parentElement.className, pcs.display, pcs.gridTemplateRows || ''].join(' ').slice(0, 160), ifr: [ics.position, ics.height, ics.aspectRatio].join(' ') }; })() }; });
  ok('   the player is a whole 16:9 picture, full width, with its name and Close under it', shape.ratio === 0.56 && shape.w > 300 && shape.close && shape.holds, J(shape));
  ok('   nothing scrolls sideways at 375px', (await A.evaluate(() => document.scrollingElement.scrollWidth - window.innerWidth)) <= 0);
  await A.screenshot({ path: path.join(HERE, 'watch-375.png'), fullPage: true });

  /* ---------- 2b. FULL SCREEN (Martin, 15 Oct: "it doesn't go landscape and then you can't close it") ---------- */
  const vsrc = await A.$eval('#lis-video', e => e.getAttribute('src'));
  ok('2b. FULL SCREEN: YouTube\'s own full-screen button is taken away (fs=0) - inside it there was no way back', /[?&]fs=0(&|$)/.test(vsrc), vsrc);
  await A.evaluate(() => { document.getElementById('lis-video').__same = 'yes'; });
  const appUrl = A.url();
  const big = async () => A.evaluate(() => {
    const box = document.getElementById('lis-vbox'), inn = document.getElementById('lis-vin'), x = box.querySelector('.lis-vx'), r = box.getBoundingClientRect(), xr = x.getBoundingClientRect();
    const hit = (px, py) => { const e = document.elementFromPoint(px, py); return !!e && box.contains(e); };
    return { big: box.classList.contains('big'), rot: box.classList.contains('rot'), full: Math.round(r.left) <= 0 && Math.round(r.top) <= 0 && Math.round(r.width) >= innerWidth && Math.round(r.height) >= innerHeight,
      wide: inn.offsetWidth > inn.offsetHeight, inW: inn.offsetWidth, inH: inn.offsetHeight, xSeen: xr.width >= 44 && xr.height >= 44 && hit(xr.left + xr.width / 2, xr.top + xr.height / 2),
      onTop: hit(innerWidth / 2, innerHeight - 20) && hit(innerWidth / 2, 20), same: document.getElementById('lis-video').__same === 'yes', lisBig: !!(history.state && history.state.lisBig) };
  });
  const fsBtn = await A.$('[data-l="player"] [data-lact="vbig"]');
  ok('   a "Full screen" button under the video, big enough to tap', !!fsBtn && (await fsBtn.boundingBox()).height >= 44);
  await A.click('[data-l="player"] [data-lact="vbig"]');
  await sleep(600);
  let b1 = await big();
  ok('   tapped, upright: the video fills the whole screen, over the header and the tab bar', b1.big && b1.full && b1.onTop, J(b1));
  ok('   AND GOES LANDSCAPE: the picture is wide (' + b1.inW + ' by ' + b1.inH + '), turned to fill the upright phone', b1.rot && b1.wide && b1.inW >= 800 && b1.inH >= 370, J(b1));
  ok('   a close button is always there, 44px or more, and nothing covers it', b1.xSeen, J(b1));
  ok('   the same player carries on (not reloaded)', b1.same);
  await A.screenshot({ path: path.join(HERE, 'watch-full-375.png') });
  await A.click('#lis-vbox .lis-vx');
  await sleep(500);
  let b2 = await big();
  ok('   AND IT CLOSES: tapping the close button puts the video back in its card, still playing', !b2.big && !b2.rot && !b2.full && b2.same && !(await A.evaluate(() => !!document.fullscreenElement)), J(b2));
  ok('   and leaves nothing behind for back to trip over', !b2.lisBig && A.url() === appUrl, A.url());
  await A.click('[data-l="player"] [data-lact="vbig"]'); await sleep(400);
  await A.keyboard.press('Escape'); await sleep(500);
  ok('   Esc closes it too (a computer)', !(await big()).big);
  await A.click('[data-l="player"] [data-lact="vbig"]'); await sleep(400);
  ok('   (open again)', (await big()).big);
  await A.goBack(); await sleep(700);
  const b3 = await big();
  ok('   the phone\'s BACK closes it too, and stays in the app (does not leave it)', !b3.big && b3.same && A.url() === appUrl, J(b3) + ' ' + A.url());
  await A.setViewport({ width: 812, height: 375 }); await sleep(300);
  await A.click('[data-l="player"] [data-lact="vbig"]'); await sleep(500);
  const b4 = await big();
  ok('   held sideways: fills the screen, not turned again', b4.big && b4.full && !b4.rot && b4.wide && b4.xSeen, J(b4));
  await A.click('#lis-vbox .lis-vx'); await sleep(400);
  await A.setViewport({ width: 375, height: 812 }); await sleep(300);
  ok('   and back to the card', !(await big()).big);
  /* AN IPHONE: no full screen for a page's own box, so ours has to cover
     the header and tab bar by itself, and still turn and still close. */
  await A.evaluate(() => { Element.prototype.requestFullscreen = undefined; Element.prototype.webkitRequestFullscreen = undefined; });
  await A.click('[data-l="player"] [data-lact="vbig"]'); await sleep(500);
  const b5 = await big();
  ok('   ON AN IPHONE (no real full screen): it still covers the header and tab bar, goes landscape, and the close button shows', b5.big && b5.full && b5.onTop && b5.rot && b5.wide && b5.xSeen && b5.same, J(b5));
  await A.click('#lis-vbox .lis-vx'); await sleep(400);
  ok('   and closes', !(await big()).big && !(await A.evaluate(() => !!(history.state && history.state.lisBig))));

  const home =await A.evaluate(() => EGBCEventsHome.watchLive().then(r => r && { state: r.state, videoId: r.videoId, embed: r.embed }));
  ok('   Home\'s helper: "live", for the main window\'s card', home && home.state === 'live' && home.videoId === 'llllllllll1', J(home));
  const C = await as('cam');
  await C.goto(URLB + app, { waitUntil: 'networkidle2' });
  await until(() => C.$('[data-lact="part:watch"]'));
  await C.evaluate(() => document.querySelector('[data-lact="part:watch"]').click());
  await until(() => C.$('[data-l="members"]'));
  ok('   a church member sees the church members\' one too', /Church meeting \(invented\)/.test(await text(C, '[data-l="members"]')));

  /* ---------- 3. after show-until ---------- */
  const after = live.showUntil + 60000;
  await A.goto(URLB + app, { waitUntil: 'networkidle2' });
  await A.evaluate((t) => { EGBCAppListen.clock = () => t; EGBCApp.refresh('me'); }, after);
  await until(() => A.$('[data-lact="part:watch"]'));
  await sleep(1500);
  ok('3. AFTER SHOW-UNTIL, the church chose "disappear": no card', !(await A.$('[data-l="live"]')));
  ok('   nor from Home\'s helper', (await A.evaluate((t) => EGBCEventsHome.watchLive(new Date(t)), after)) === null);
  await readDb(db => setDoc(doc(db, 'watchShow', 'live'), { ...live, after: 'again', againUntil: live.showUntil + 3 * 864e5 }));
  await A.goto(URLB + app, { waitUntil: 'networkidle2' });
  await A.evaluate((t) => { EGBCAppListen.clock = () => t; EGBCApp.refresh('me'); }, after);
  await until(() => A.$('[data-l="live"]'));
  ok('   it chose "Watch again": "Watch again" until the second time', /Watch again/.test(await text(A, '[data-l="live"]')));
  ok('   and gone after that', (await A.evaluate((t) => EGBCEventsHome.watchLive(new Date(t)), live.showUntil + 3 * 864e5 + 1000)) === null);

  /* ---------- 4. signed out ---------- */
  const G = await as('guest');
  const refused = await G.evaluate(() => Promise.all([
    EGBCAuth.db.collection('watchShow').doc('live').get().then(() => 'read', e => e.code),
    EGBCAuth.db.collection('videos').doc('mv_mmmmmmmmmm1').get().then(() => 'read', e => e.code),
    EGBCAuth.db.collection('videos').where('source', '==', 'members').get().then(() => 'read', e => e.code),
    EGBCAuth.db.collection('videos').doc('yt_aaaaaaaaaa1').get().then(() => 'read', e => e.code)
  ]));
  ok('4. SIGNED OUT: the live link, a members\' service and their list are refused', refused[0] === 'permission-denied' && refused[1] === 'permission-denied' && refused[2] === 'permission-denied', J(refused));
  ok('   (a channel video is public: it is on YouTube already)', refused[3] === 'read', J(refused));
  await G.addScriptTag({ url: URLB + 'egbc-events-home.js' });
  const gHome = await G.evaluate(() => typeof EGBCEventsHome === 'undefined' ? 'no helper' : EGBCEventsHome.watchLive().then(r => r === null ? 'nothing' : 'GAVE: ' + JSON.stringify(r)));
  ok('   Home\'s helper gives nothing signed out', gHome === 'nothing', gHome);

  /* ---------- 5. switched off ---------- */
  await A.goto(URLB + app, { waitUntil: 'networkidle2' });
  await A.evaluate(() => { EGBCChurch.uses = (n) => n !== 'watch'; });
  await until(() => A.$('.hello'));
  await A.evaluate(() => EGBCApp.refresh('me'));
  await sleep(800);
  const off = await text(A, '#egbc-content');
  ok('5. SWITCHED OFF: plain "Listen", no Watch switch, no live card', /Listen/.test(off) && !/Listen & Watch/.test(off) && !(await A.$('[data-lact="part:watch"]')) && !(await A.$('[data-l="live"]')), off.slice(0, 200));

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
