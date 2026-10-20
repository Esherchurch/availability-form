/* The e-news on a phone and a computer, in a real browser (FINDINGS-comms
 * C-29; Martin, 20 Oct: "it must look exactly like the Mailchimp version on
 * phone and computer ... never a downgrade").
 *
 *   node tests/check-enews-layout.mjs        (from v2/; no emulator needed)
 *
 * Draws an e-news with egbc-mailblocks.js - made-up words, with the awkward
 * things real weeks bring: a full-size picture, a very long web address, a
 * very long word, a long title - in both looks, and asks at 320, 375, 414
 * and 600 wide: is ANY element wider than the screen? Then, at 375 and 600,
 * that it is Val's layout: 18px text on a phone and 15px on a computer,
 * an event's picture full width above its words on a phone and 176px
 * beside them on a computer.
 *
 * DELIBERATE BREAKS: --break=img drops the pictures' max-width;
 * --break=fixed makes the column a fixed 600px; --break=stack keeps the
 * computer layout on a phone. Each must turn this check red.
 */
import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import vm from 'node:vm';

const V2 = path.resolve('.');
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9792, SERVE = 9002;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const BREAK = (process.argv.find(a => a.startsWith('--break=')) || '').slice(8);
const BREAKS = {
  img: ["'style=\"display:block;width:100%;max-width:' + w + 'px;height:auto;", "'style=\"display:block;width:' + w + 'px;height:auto;"],
  fixed: ["class=\"wrap\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\" bgcolor=\"' + t.paper + '\" style=\"width:100%;max-width:600px;", "class=\"wrap\" width=\"600\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\" bgcolor=\"' + t.paper + '\" style=\"width:600px;"],
  stack: [".cimg{display:block !important;width:100% !important;padding:0 !important;}", ".cimg{}"]
};
if (BREAK && !BREAKS[BREAK]) { console.log('Unknown break: ' + BREAK); process.exit(2); }

let SRC = fs.readFileSync(path.join(V2, 'egbc-mailblocks.js'), 'utf8').replace(/\r\n/g, '\n');
if (BREAK) {
  const [from, to] = BREAKS[BREAK];
  if (!SRC.includes(from)) { console.log('  FAIL  break "' + BREAK + '": that line is not in egbc-mailblocks.js any more - update the break'); process.exit(1); }
  SRC = SRC.split(from).join(to);
}
const MB = (() => { const m = { exports: {} }; vm.runInNewContext(SRC, { module: m, exports: m.exports, Intl, Date }); return m.exports; })();

const R = [];
const ok = (n, v, x) => { R.push(!!v); console.log('  ' + (v ? 'PASS  ' : 'FAIL  ') + n + (v || x === undefined ? '' : '\n          ' + String(typeof x === 'string' ? x : JSON.stringify(x)).slice(0, 300))); };

/* Made-up words; the picture is the mock-ups' own (940 x 788, as Val's). */
const PIC = 'http://localhost:' + SERVE + '/design-mocks/comms/card-photo.svg';
const LONG = 'https://example.invalid/a/very/long/link/that/goes/on/and/on/and/never/stops/for/a/space/at/all?with=lots&of=bits&more=bits';
const issue = (template) => ({
  subject: 'Synthetic weekly news', preheader: 'What\u2019s happening this week at Synthetic Green', template,
  blocks: [
    { type: 'header', imageUrl: PIC, alt: 'A synthetic sunset' },
    { type: 'verse', text: 'Whatever you do, work at it with all your heart, as working for the Lord.', ref: 'Colossians 3:23', version: 'BSB', copyright: 'The Holy Bible, Berean Standard Bible, BSB is produced in cooperation with Bible Hub.' },
    { type: 'section', label: 'Coming up this week' },
    { type: 'sunday', date: 'Sunday 25 October', time: '10am', title: 'Morning Worship', speaker: 'Sam Synthetic' },
    { type: 'event', title: 'Synthetic harvest supper and barn dance with a long, long title', when: 'Saturday 31 October \u00b7 6:30pm', imageUrl: PIC, alt: 'Harvest',
      html: '<p>Bring a dish to share. Supercalifragilisticexpialidociousandthensomemoreletterswithoutanyspaces.</p><p>Details: <a href="' + LONG + '">' + LONG + '</a></p>', buttonLabel: 'Sign up here', buttonUrl: 'https://example.invalid/signup' },
    { type: 'event', title: 'Synthetic prayer evening', when: 'Monday 2 November \u00b7 8pm', html: '<p>All welcome.</p>' },
    { type: 'picture', url: PIC, alt: 'A card', caption: 'A caption under the card' },
    { type: 'button', label: 'Dates for the diary', url: 'https://example.invalid/diary' },
    { type: 'divider' },
    { type: 'text', title: 'Did you know?', html: '<p>Some words.</p>' }
  ]
});
const church = { name: 'Synthetic Green Church', email: 'office@example.invalid', address: '1 Test Lane, Testtown TT1 1TT', charityNo: '0000001', phone: '01234 567890', hours: 'Open 9 till 4, Monday to Thursday.' };
const pages = {};
for (const tpl of ['classic', 'green']) pages['/mail-' + tpl + '.html'] = MB.render(issue(tpl), { version: 'members', church, unsubscribeUrl: 'https://example.invalid/u?t=x', webUrl: 'https://example.invalid/web' });

(async () => {
  const server = http.createServer((q, s) => {
    const url = decodeURIComponent(q.url.split('?')[0]);
    if (pages[url]) { s.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return s.end(pages[url]); }
    const f = path.join(V2, url.replace(/^\//, ''));
    if (!f.startsWith(V2) || !fs.existsSync(f)) { s.writeHead(404); return s.end(); }
    s.writeHead(200, { 'Content-Type': f.endsWith('.svg') ? 'image/svg+xml' : 'application/octet-stream' }); s.end(fs.readFileSync(f));
  }).listen(SERVE);
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'cdp-enews-layout-'));
  const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + PORT, '--user-data-dir=' + prof, '--no-first-run', 'about:blank'], { stdio: 'ignore' });
  const getJSON = p => new Promise((res, rej) => http.get({ host: '127.0.0.1', port: PORT, path: p }, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d))); }).on('error', rej));
  let tabs; for (let i = 0; i < 40; i++) { try { tabs = await getJSON('/json/list'); break; } catch { await sleep(500); } }
  const ws = new WebSocket(tabs.find(x => x.type === 'page').webSocketDebuggerUrl);
  let id = 0; const pend = new Map();
  const send = (m, p = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
  await new Promise(r => ws.onopen = r);
  ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result || {}); pend.delete(m.id); } };
  await send('Page.enable'); await send('Runtime.enable');
  const ev = async x => (await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true })).result.value;
  try {
    for (const tpl of ['classic', 'green']) {
      for (const w of [320, 375, 414, 600]) {
        await send('Emulation.setDeviceMetricsOverride', { width: w, height: 900, deviceScaleFactor: 1, mobile: w < 500 });
        await send('Page.navigate', { url: 'http://localhost:' + SERVE + '/mail-' + tpl + '.html' }); await sleep(1300);
        const wide = await ev(`(function(){var W=document.documentElement.clientWidth,out=[];document.querySelectorAll('body *').forEach(function(el){var r=el.getBoundingClientRect();if(r.width&&r.right>W+0.5)out.push(el.tagName+(el.className?'.'+el.className:'')+' '+Math.round(r.right))});return {sw:document.documentElement.scrollWidth,W:W,out:out.slice(0,5)}})()`);
        ok(tpl + ' at ' + w + 'px: nothing wider than the screen', wide.sw <= w && wide.out.length === 0, wide);
        if (tpl === 'classic' && (w === 375 || w === 600)) {
          const L = await ev(`(function(){var t=document.querySelector('.ctext'),i=document.querySelector('.cimg img'),st=getComputedStyle(t.querySelector('p:last-child')||t);var ri=i.getBoundingClientRect(),rt=t.getBoundingClientRect();return {size:st.fontSize,imgW:Math.round(ri.width),imgX:Math.round(ri.x),textX:Math.round(rt.x),textTop:Math.round(rt.top),imgBottom:Math.round(ri.bottom)}})()`);
          if (w === 375) ok('phone (375): 18px words, the event picture full width (339px) above them', L.size === '18px' && L.imgW === 339 && L.imgX === 18 && L.textTop >= L.imgBottom, L);
          else ok('computer (600): 14px card words (Val\u2019s), the event picture 176px beside them (18 / 230)', L.size === '14px' && L.imgW === 176 && L.imgX === 18 && L.textX === 230, L);
        }
      }
    }
  } catch (e) { ok('the run finished', false, e.message); }
  ws.close(); chrome.kill(); server.close();
  const fails = R.filter(v => !v).length;
  console.log('\n' + (R.length - fails) + '/' + R.length + ' passed' + (BREAK ? '   (deliberate break: ' + BREAK + ', so this run SHOULD be red)' : ''));
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
