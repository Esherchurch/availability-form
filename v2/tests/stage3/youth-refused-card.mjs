/* A YOUNG PERSON ON A LEADERS' PAGE (Martin, 5 Nov 2026): someone signed in
 * with a Youth Hub code (the youth claim, no sign-in record of their own)
 * gets the plain "This page isn't for you" card with a way back to the Youth
 * Hub - never "Something went wrong" or a raw permission error - and
 * nothing goes to the console. An ordinary volunteer still gets the page.
 *
 *   firebase emulators:exec --config firebase.spare.json --only firestore,auth \
 *     --project egbc-worship-planner "node tests/stage3/youth-refused-card.mjs"
 *
 * Made-up people only; the spare emulators with the locked rules.
 */
import { serve, browser, person, put, get, wipe, inChurch, req, PORTS, PROJECT, PW, sleep } from '../stage2/harness.mjs';
const J = (x) => JSON.stringify(x);

const R = [];
const ok = (n, v, x) => { R.push(!!v); console.log('  ' + (v ? 'PASS  ' : 'FAIL  ') + n + (v || x === undefined ? '' : '\n          ' + String(x).slice(0, 400))); };
const PAGES = ['safeguarding.html', 'kids-admin.html', 'rota-reports.html', 'addressbook.html', 'event-ra.html'];

await wipe();
inChurch(null);
/* The young person, as youth-redeem.js makes one: no email, signed in with
   a custom token carrying { youth: true }, no users record. The Auth
   emulator takes an unsigned custom token. */
const YUID = 'yr_youth_' + Date.now();
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const now = Math.floor(Date.now() / 1000);
const YTOKEN = b64({ alg: 'none', typ: 'JWT' }) + '.' + b64({ iss: 'test@example.invalid', sub: 'test@example.invalid',
  aud: 'https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit', iat: now, exp: now + 3600, uid: YUID, claims: { youth: true } }) + '.';
const email = '__youth__';
/* expiresAt a real timestamp, as youth-redeem.js writes it (the Youth Hub reads .toDate()). */
await req(PORTS.firestore, 'PATCH', '/v1/projects/' + PROJECT + '/databases/(default)/documents/youthAccess/' + YUID,
  { fields: { active: { booleanValue: true }, firstName: { stringValue: 'Yan' }, expiresAt: { timestampValue: new Date(Date.now() + 864e5).toISOString() } } }, { Authorization: 'Bearer owner' });
const vol = await person({ key: 'yr_vol', name: 'Val Volunteer (synthetic)', teams: ['Worship Team'] });

const PORT = 8974;
const server = await serve(PORT);
const base = 'http://localhost:' + PORT;
const b = await browser();

async function open(who, pw, url, width) {
  const page = await b.newPage();
  await page.setViewport({ width, height: 800 });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + String(e.message).slice(0, 200)));
  /* Which address a "Failed to load resource" was. The test server has no
     favicon.ico (the browser asks once), and Firestore's open channel is
     cut when the page closes: neither is the page's doing. */
  const bad = [];
  page.on('response', (r) => { if (r.status() >= 400 && !/\/favicon\.ico$/.test(r.url())) bad.push('HTTP ' + r.status() + ' ' + r.url().slice(0, 160)); });
  await page.goto(base + '/__signin.html?church=egbc', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.EGBCAuth && window.firebase && firebase.auth(EGBCAuth.app), { timeout: 30000 });
  await page.evaluate((e, p, t) => firebase.auth(EGBCAuth.app).signOut().then(() => e === '__youth__'
    ? firebase.auth(EGBCAuth.app).signInWithCustomToken(t) : firebase.auth(EGBCAuth.app).signInWithEmailAndPassword(e, p)).then(() => 1), who, pw, YTOKEN);
  await page.goto(base + '/' + url, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => /isn’t for you|isn't for you|Something went wrong/.test(document.body.innerText) || (window.EGBCAuth && EGBCAuth.profile && EGBCAuth.profile()), { timeout: 20000 }).catch(() => {});
  await sleep(1500);
  const seen = await page.evaluate(() => {
    const links = [...document.querySelectorAll('a,button')].filter((x) => x.offsetParent !== null).map((x) => (x.innerText || '').trim() + '|' + (x.getAttribute('href') || ''));
    return { text: document.body.innerText, links };
  });
  await page.close();
  /* A 404 the console reports is counted only when a response was one of the page's own. */
  const real = errors.filter((x) => !(/^Failed to load resource: the server responded with a status of 404/.test(x) && !bad.length)).concat(bad);
  return Object.assign(seen, { errors: real });
}

try {
  for (const w of [375, 1280]) {
    for (const p of PAGES) {
      const s = await open(email, PW, p, w);
      const back = s.links.find((l) => /Back to the Youth Hub/.test(l));
      ok('A YOUNG PERSON on ' + p + ' (' + w + '): "This page isn’t for you", back to the Youth Hub, no Sign out, no raw error, nothing in the console',
        /This page isn’t for you/.test(s.text) && back && /youthapp2\.html/.test(back) && !s.links.some((l) => /^Sign out/i.test(l))
          && !/Something went wrong|insufficient permissions|permission-denied/i.test(s.text) && s.errors.length === 0,
        s.text.slice(0, 200) + ' | ' + JSON.stringify(s.links) + ' | ' + JSON.stringify(s.errors));
    }
  }
  ok('no sign-in record was written for the young person by any of those pages', (await get('users/' + YUID)) === null, J(await get('users/' + YUID)));
  const hubY = await open(email, PW, 'youthapp2.html', 375);
  ok('and the Youth Hub itself still opens for them, with no card', !/isn’t for you|Something went wrong|We do not recognise/.test(hubY.text), hubY.text.slice(0, 200));
  const v = await open(vol.email, PW, 'safeguarding.html', 1280);
  ok('a volunteer on safeguarding.html still gets the page, not the card', !/isn’t for you|Something went wrong/.test(v.text), v.text.slice(0, 200));
} catch (e) {
  ok('the run finished', false, e.stack);
}
await b.close().catch(() => {});
server.close();
const pass = R.filter(Boolean).length;
console.log('\n' + pass + '/' + R.length + ' passed');
process.exit(pass === R.length ? 0 : 1);
