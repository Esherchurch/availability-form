/* NO MAIL LINK LEAVES THE TEST BROWSER (7 Nov 2026: a run opened Martin's Outlook).
 *
 *   node tests/stage3/no-mail-out.mjs          (no emulators: a page of its own)
 *
 * The harness's browser (tests/stage2/harness.mjs, with tests/no-mail-out.mjs):
 *   1. every way a page sends someone to another app - a mailto: link, location.href,
 *      location.assign (tel:), location.replace (sms:), window.open, a webcal: link
 *      clicked by script, a form whose action is mailto: - is stopped in the page and
 *      written down as "opened a mail link to ...";
 *   2. none of them reaches the browser (the tripwire, CDP Page.frameRequestedNavigation,
 *      sees no such address);
 *   3. the tripwire does see a navigation the page asks for (an ordinary one, here: a
 *      mail one is never let through to prove it, as that would open the mail app);
 *   4. ordinary links still work.
 * The audit's own browser has the same stop, proved by its self-test (the mailout page).
 */
import http from 'node:http';
import { browser, sleep } from '../stage2/harness.mjs';
import { mailOutOf } from '../no-mail-out.mjs';

const R = [];
const ok = (n, v, x) => { R.push(!!v); console.log('  ' + (v ? 'PASS  ' : 'FAIL  ') + n + (v || x === undefined ? '' : '\n          ' + String(x).slice(0, 400))); };
const J = (x) => JSON.stringify(x);

const PAGE = `<!doctype html><meta charset="utf-8"><title>Mail links</title><body>
<a id="l" href="mailto:link@example.invalid">Email link</a>
<button id="h" onclick="location.href='mailto:href@example.invalid'">by href</button>
<button id="t" onclick="location.assign('tel:+440000000000')">Call</button>
<button id="s" onclick="location.replace('sms:+440000000000')">Text</button>
<button id="o" onclick="window.open('mailto:open@example.invalid')">new window</button>
<button id="w" onclick="var a=document.createElement('a');a.href='webcal:example.invalid/cal.ics';document.body.appendChild(a);a.click();a.remove()">calendar</button>
<form id="f" action="mailto:form@example.invalid" method="post"><button id="fb">by form</button></form>
<button id="fs" onclick="document.getElementById('f').submit()">form.submit()</button>
<a id="web" href="/other">An ordinary link</a>
<iframe id="fr" srcdoc="<a id=in href='mailto:frame@example.invalid'>in a frame</a>"></iframe>
</body>`;
const server = http.createServer((q, s) => { s.writeHead(200, { 'Content-Type': 'text/html' }); s.end(q.url === '/other' ? '<!doctype html><title>Other</title><p id=other>Other page</p>' : PAGE); });
await new Promise((r) => server.listen(8975, r));
const b = await browser();
try {
  const page = await b.newPage();
  const asked = [];
  const cdp = await page.createCDPSession(); await cdp.send('Page.enable');
  cdp.on('Page.frameRequestedNavigation', (e) => asked.push(e.url));
  await page.goto('http://localhost:8975/', { waitUntil: 'load' });
  for (const id of ['l', 'h', 't', 's', 'o', 'w', 'fb', 'fs']) { await page.click('#' + id).catch(() => {}); await sleep(250); }
  const fr = page.frames().find((f) => f !== page.mainFrame());
  if (fr) { await fr.click('#in').catch(() => {}); await sleep(250); }
  const main = await mailOutOf(page);
  const inFrame = fr ? await fr.evaluate(() => (window.__mailOut || []).slice()).catch(() => []) : [];
  const got = main.concat(inFrame).map((x) => x.to);
  const want = ['link@', 'href@', 'tel:', 'sms:', 'open@', 'webcal:', 'form@', 'frame@'];
  ok('1. Every way to another app is stopped and written down (' + want.filter((w) => got.some((g) => g.includes(w))).length + ' of ' + want.length + ')', want.every((w) => got.some((g) => g.includes(w))), J(got));
  ok('   and form.submit() too, not only the button (two entries for form@)', got.filter((g) => g.includes('form@')).length >= 2, J(got));
  ok('   the page stayed where it was', page.url() === 'http://localhost:8975/', page.url());
  const away = asked.filter((u) => !/^(https?|about|data|blob|javascript|chrome-error):/i.test(u));
  ok('2. None of them reached the browser (the tripwire saw none)', away.length === 0 && page.mailEscaped.length === 0, J({ away, escaped: page.mailEscaped }));
  await page.click('#web'); await page.waitForSelector('#other', { timeout: 5000 }).catch(() => {});
  ok('3. The tripwire does see a navigation the page asks for (the ordinary link)', asked.some((u) => /\/other$/.test(u)), J(asked));
  ok('4. Ordinary links still work', /\/other$/.test(page.url()) && !!(await page.$('#other')), page.url());
} catch (e) {
  ok('the run finished', false, e.stack);
}
await b.close().catch(() => {});
server.close();
const pass = R.filter(Boolean).length;
console.log('\n' + pass + '/' + R.length + ' passed');
process.exit(pass === R.length ? 0 : 1);
