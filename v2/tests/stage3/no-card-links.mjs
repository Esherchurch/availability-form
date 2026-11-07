/* NOBODY SEES A LINK THAT ENDS ON "THIS PAGE ISN'T FOR YOU" (Martin, 6 Nov 2026:
 * "the card is only for someone who types an address or follows an old link").
 *
 *   firebase emulators:exec --config firebase.spare.json --only firestore,auth,functions \
 *     --project egbc-worship-planner "node tests/stage3/no-card-links.mjs"
 *
 * For each kind of person the audit uses (everyone, worship, kids, core, area
 * admin, master), at 375 and 1440: from the hub and every page their Menu
 * offers, every visible link to another v2 page, and the Menu's own links;
 * and from every app screen they have, its links and the pages it opens. Each
 * target is opened once, as that person, and must not end on a refusal card
 * ("This page isn't for you", "This page is for...", or any page egbc-auth has
 * blocked). Reports N of N links, and lists every one that ends on a card with
 * where it was seen and what it said. Made-up people only.
 */
import fs from 'node:fs';
import path from 'node:path';
import { serve, browser, person, signIn, wipe, inChurch, sleep, V2 } from '../stage2/harness.mjs';

const KINDS = {
  everyone: { teams: [] },
  worship: { teams: ['Worship Team'] },
  kids: { teams: ['Kids Church'] },
  core: { teams: ['Core Team'] },
  areaAdmin: { teams: ['Worship Team'], adminFor: ['Worship Team'] },
  master: { teams: ['Core Team'], adminFor: ['Core Team'], master: true }
};
const SIZES = [[375, 812], [1440, 900]];
const CARD = /This page isn[’']t for you|This page is for |is only for |only for people|Admins only|No access|You do not have access/i;
const PAGES = new Set(fs.readdirSync(V2).filter((f) => f.endsWith('.html')).map((f) => f.toLowerCase()));

await wipe();
inChurch(null);
const people = {};
for (const [k, v] of Object.entries(KINDS)) {
  people[k] = await person({ key: 'ncl_' + k.toLowerCase(), name: 'No-card ' + k + ' (synthetic)', teams: v.teams, adminFor: v.adminFor || [], master: !!v.master, book: v.master ? { masterAdmin: true } : {} });
}
const server = await serve(8978);
const base = 'http://localhost:8978';
const b = await browser();

/** What a person ends on at url: { card, text }. */
async function landing(page, url) {
  await page.goto(base + '/' + url, { waitUntil: 'domcontentloaded' }).catch(() => {});
  await page.waitForFunction(() => document.body && (document.body.getAttribute('data-egbc-blocked') || (window.EGBCAuth && EGBCAuth.profile && EGBCAuth.profile()) || /isn.t for you|This page is for /.test(document.body.innerText)), { timeout: 15000 }).catch(() => {});
  await sleep(800);
  /* A refusal card is the page blocked, or a card that starts with its lock (egbc-auth.js's
     refusedCard and E.notForYou). Words alone are not: "worried about someone" and the booking
     pages say "is for" and "only for" in their own text, and were taken for cards (7 Nov 2026). */
  const look = () => page.evaluate((re) => {
    const t = (document.body && document.body.innerText) || '', s = t.replace(/\s+/g, ' ').trim();
    const lock = /^🔒/.test(s) || [...document.querySelectorAll('h1,h2,h3,.card,[role=alert]')].some((h) => /^🔒/.test((h.innerText || '').trim()) && new RegExp(re, 'i').test(h.parentElement ? h.parentElement.innerText : ''));
    return { card: !!(document.body && document.body.getAttribute('data-egbc-blocked')) || lock, offline: /client is offline/i.test(s), text: s.slice(0, 140) };
  }, CARD.source);
  let r = await look();
  /* The emulator dropping a page's connection (A-090: "client is offline") is not a refusal: once more. */
  if (r.offline) {
    await sleep(1500);
    await page.goto(base + '/' + url, { waitUntil: 'domcontentloaded' }).catch(() => {});
    await sleep(2500);
    r = await look();
  }
  return r;
}

/** The visible links on the page now: [{ to, words }] to v2 pages. */
async function linksHere(page) {
  return page.evaluate(() => [...document.querySelectorAll('a[href]')].filter((a) => {
    const r = a.getBoundingClientRect(); if (r.width < 1 || r.height < 1) return false;
    for (let p = a; p; p = p.parentElement) { const s = getComputedStyle(p); if (s.display === 'none' || s.visibility === 'hidden') return false; }
    return true;
  }).map((a) => { let u; try { u = new URL(a.getAttribute('href'), location.href); } catch (e) { return null; }
    if (u.origin !== location.origin) return null;
    return { to: decodeURIComponent(u.pathname.split('/').pop()), words: (a.innerText || a.getAttribute('aria-label') || a.title || '').replace(/\s+/g, ' ').trim().slice(0, 50) };
  }).filter(Boolean));
}

let checked = 0;
const bad = [];
try {
  for (const [kind, p] of Object.entries(people)) {
    for (const [w, h] of SIZES) {
      const page = await b.newPage();
      await page.setViewport({ width: w, height: h });
      await signIn(page, base, p, 'hub.html');
      await page.waitForFunction(() => window.EGBCMenu && window.EGBCAuth && EGBCAuth.profile && EGBCAuth.profile(), { timeout: 30000 }).catch(() => {});
      await sleep(1500);
      /* The Menu's own links for this person: links they are shown. */
      const menu = await page.evaluate(() => { const out = []; const walk = (n) => n.forEach((x) => { if (x.url) out.push({ to: String(x.url).split('?')[0].split('#')[0], words: x.title || '' }); if (x.children) walk(x.children); }); walk(EGBCMenu.forPerson(EGBCMenu.who())); return out; });
      const seen = new Map();   /* target -> [where, words] */
      const note = (from, l) => { const t = l.to.toLowerCase(); if (!PAGES.has(t) || seen.has(t)) return; seen.set(t, [from, l.words, l.to]); };
      menu.forEach((l) => note('the Menu', l));
      /* The hub and every page the Menu offers: their visible links. */
      for (const start of ['hub.html'].concat(menu.map((l) => l.to)).filter((v, i, a) => a.indexOf(v) === i && PAGES.has(v.toLowerCase()))) {
        const here = await landing(page, start);
        if (here.card) continue;   /* a Menu page that refuses them is the Menu's link, judged below */
        (await linksHere(page)).forEach((l) => note(start, l));
      }
      /* THE APP (7 Nov 2026): every screen the app offers this person, its visible links and its
         "open:" buttons (egbc-app.js opens those pages inside the app, ?app=1). Followed in the app. */
      await landing(page, 'app.html');
      await page.waitForFunction(() => window.EGBCApp && EGBCApp.who && EGBCApp.who(), { timeout: 20000 }).catch(() => {});
      const screens = await page.evaluate(() => { const out = []; try { const me = EGBCApp.who(); EGBCApp.spacesFor(me).forEach((s) => (EGBCApp.tabsFor(s) || []).forEach((t) => out.push([s, t[0]]))); } catch (e) {} return out; });
      for (const [space, tab] of screens) {
        await page.evaluate((s, t) => { const b = document.createElement('button'); b.setAttribute('data-act', 'go:' + s + ':' + t); b.style.display = 'none'; document.body.appendChild(b); b.click(); b.remove(); }, space, tab);
        await sleep(1200);
        const here = 'app: ' + space + ' / ' + tab;
        const opens = await page.evaluate(() => [...document.querySelectorAll('[data-act^="open:"]')].filter((b) => { const r = b.getBoundingClientRect(); return r.width > 0 && r.height > 0; })
          .map((b) => ({ to: b.getAttribute('data-act').slice(5).split('?')[0].split('#')[0], words: (b.innerText || b.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim().slice(0, 50) })));
        opens.concat(await linksHere(page)).forEach((l) => { const t = l.to.toLowerCase(); if (!PAGES.has(t) || t === 'app.html' || seen.has('app:' + t)) return; seen.set('app:' + t, [here, l.words, l.to, true]); });
      }
      for (const [, [from, words, to, inApp]] of seen) {
        checked++;
        const end = await landing(page, inApp ? to + '?app=1' : to);
        if (end.card) bad.push({ kind, size: w, from, words, to: to + (inApp ? ' (in the app)' : ''), said: end.text });
      }
      console.log('  ' + kind + ' at ' + w + ': ' + seen.size + ' links followed (' + screens.length + ' app screens)');
      await page.close();
    }
  }
} catch (e) {
  console.log('  FAIL  the run finished\n          ' + e.stack);
  bad.push({ kind: '(run)', said: String(e.message) });
}
await b.close().catch(() => {});
server.close();
console.log('\n' + (checked - bad.length) + ' of ' + checked + ' links end where they should, not on a "this page isn\'t for you" card');
for (const x of bad) console.log('  FAIL  ' + x.kind + ' at ' + x.size + ': "' + x.words + '" on ' + x.from + ' -> ' + x.to + '\n          ' + x.said);
fs.writeFileSync(path.join(V2, 'tests', 'out', 'no-card-links.json'), JSON.stringify({ checked, bad }, null, 1));
process.exit(bad.length ? 1 : 0);
