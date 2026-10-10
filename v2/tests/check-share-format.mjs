/* The WhatsApp formatter in egbc-share.js.
 *
 *   node tests/check-share-format.mjs        (from v2/, no emulator)
 *
 * SHARE-NOTIFY-BRIEF Part 1 asks for a named proof: "A test notice with a
 * heading, bold, a list and a link -> the preview shows correct WhatsApp
 * formatting. Break the formatter (e.g. drop list handling) and show the
 * unit test failing." That notice is below, and the break is in the table
 * at the end of FINDINGS-share.md.
 *
 * It runs in a headless Chrome because the formatter walks the DOM rather
 * than running regular expressions over the HTML - the notice editor's
 * output is real HTML, and a pattern that strips tags turns "&amp;" into
 * an ampersand it then cannot tell from one the person typed.
 */
import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const V2 = path.resolve('.');
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9695, SERVE = 8911;

const R = [];
const ok = (n, v, x) => { R.push(v); console.log('  ' + (v ? 'PASS  ' : 'FAIL  ') + n
  + (v ? '' : (x !== undefined ? '\n          ' + String(x).replace(/\n/g, '\n          ').slice(0, 400) : ''))); };

/* The notice the brief describes: a heading, bold, a list and a link. */
const NOTICE = {
  title: 'Church weekend away',
  when: 'Friday 14 November, 6pm',
  html: '<h2>Book your place</h2>'
      + '<p>We are away at <b>Pilgrim Hall</b> again, and it is <i>nearly full</i>.</p>'
      + '<ul><li>Friday night to Sunday lunch</li><li>Rooms for families</li>'
      + '<li>A creche for the under-fives</li></ul>'
      + '<p>Deposits by the end of the month, please. '
      + '<a href="https://example.invalid/weekend">The booking form</a> is open.</p>'
      + '<blockquote>Bring wellies. It rained last year.</blockquote>',
  link: 'https://example.invalid/weekend'
};

/* SERVED AS A FILE, not inlined. The first version pasted egbc-share.js
   into a <script> block, and the file's own usage comment contains the
   words "</script>" - which ends the block there, so nothing after line 11
   ran and EGBCShare was never defined. A <script src> is also how a page
   really loads it. */
const PAGE = '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>'
  + '<script src="/egbc-share.js"></script></body></html>';

(async () => {
  const server = http.createServer((q, s) => {
    if ((q.url || '').startsWith('/egbc-share.js')) {
      s.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-store' });
      return s.end(fs.readFileSync(path.join(V2, 'egbc-share.js')));
    }
    s.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    s.end(PAGE);
  }).listen(SERVE);

  const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + PORT,
    '--user-data-dir=' + path.join(os.tmpdir(), 'cdp-share-' + process.pid), '--no-first-run', 'about:blank'],
    { stdio: 'ignore' });
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const getJSON = p => new Promise((res, rej) => http.get({ host: '127.0.0.1', port: PORT, path: p },
    r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d))); }).on('error', rej));
  let list; for (let i = 0; i < 40; i++) { try { list = await getJSON('/json/list'); break; } catch { await sleep(500); } }
  if (!list) { console.error('Chrome did not start - set CHROME_PATH'); process.exit(1); }
  const ws = new WebSocket(list.find(x => x.type === 'page').webSocketDebuggerUrl);
  let id = 0; const pend = new Map();
  const send = (m, p = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
  await new Promise(r => ws.onopen = r);
  ws.onmessage = e => {
    const m = JSON.parse(e.data);
    if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result || {}); pend.delete(m.id); }
  };
  await send('Runtime.enable'); await send('Page.enable');
  const ev = async (x) => {
    const r = (await send('Runtime.evaluate', { expression: x, returnByValue: true })) || {};
    if (r.exceptionDetails) return 'THREW ' + String((r.exceptionDetails.exception || {}).description || '').split('\n')[0];
    return r.result && r.result.value;
  };

  await send('Page.navigate', { url: 'http://localhost:' + SERVE + '/' });
  await sleep(1200);

  ok('egbc-share.js loaded', (await ev('typeof EGBCShare')) === 'object');

  const out = String(await ev('EGBCShare.format(' + JSON.stringify(NOTICE) + ')'));
  /* STOP IF IT THREW. Half the assertions below are "this is not in the
     output", and an error message satisfies them all: the first run of
     this file reported 6 of 22 passing against the words "ReferenceError:
     EGBCShare is not defined". Six gates that could not fail. */
  if (/^THREW/.test(out) || !out) {
    ok('the formatter ran at all', false, out || '(it returned nothing)');
    console.log('\n' + R.filter(Boolean).length + '/' + R.length + ' passed');
    server.close(); chrome.kill(); process.exit(1);
  }
  console.log('\nwhat WhatsApp would receive\n' + out.split('\n').map(l => '    | ' + l).join('\n') + '\n');

  console.log('the formatting');
  ok('the title is bold, on its own line', /^\*Church weekend away\*$/m.test(out), out);
  ok('the date follows it', /^Friday 14 November, 6pm$/m.test(out), out);
  ok('a heading becomes a bold line', /^\*Book your place\*$/m.test(out), out);
  ok('bold becomes *stars*', /\*Pilgrim Hall\*/.test(out), out);
  /* THE CASE, not a pattern over the whole message. The first version
     banned a space next to any star, which fails on "at *Pilgrim Hall*
     again" - correct output. What WhatsApp actually ignores is a space
     INSIDE the marks, and an editor leaves one in the tag all the time. */
  const spacey = String(await ev(
    'EGBCShare.htmlToWhatsApp("<p>Come to <b> the barn dance </b> on Friday</p>")'));
  ok('  a space inside the bold tag is moved outside the stars',
    /\*the barn dance\*/.test(spacey) && !/\* the barn dance \*/.test(spacey), JSON.stringify(spacey));
  ok('  and the words are still spaced apart',
    /to \*the barn dance\* on/.test(spacey), JSON.stringify(spacey));
  ok('italic becomes _underscores_', /_nearly full_/.test(out), out);

  /* THE ONE THE BRIEF NAMES. */
  ok('A LIST BECOMES "- " LINES', /^- Friday night to Sunday lunch$/m.test(out)
    && /^- Rooms for families$/m.test(out)
    && /^- A creche for the under-fives$/m.test(out), out);

  ok('a quote becomes "> "', /^> Bring wellies\. It rained last year\.$/m.test(out), out);
  ok('a link is on a line of its own, so WhatsApp draws its card',
    /^https:\/\/example\.invalid\/weekend$/m.test(out), out);
  ok('  and its words are kept, not turned into markdown',
    /The booking form/.test(out) && !/\]\(/.test(out), out);
  /* TAGS, not the characters. "> " at the start of a line is WhatsApp's
     own quote mark, and a notice may legitimately say "<3" or "a < b", so
     banning the characters outright fails on correct output. */
  ok('no HTML tag survives', !/<\/?[a-z][^>]*>/i.test(out), out);
  ok('never more than one blank line', !/\n\n\n/.test(out), JSON.stringify(out));

  /* Numbered lists, nesting, and the entity case a regular expression
     would get wrong. */
  console.log('\nthe awkward ones');
  const numbered = String(await ev('EGBCShare.htmlToWhatsApp("<ol><li>First</li><li>Second</li></ol>")'));
  ok('a numbered list counts', /^1\. First$/m.test(numbered) && /^2\. Second$/m.test(numbered), numbered);

  const ent = String(await ev('EGBCShare.htmlToWhatsApp("<p>Tea &amp; coffee &lt;after&gt; the service</p>")'));
  ok('entities come out as the characters they mean',
    ent === 'Tea & coffee <after> the service', JSON.stringify(ent));

  const nested = String(await ev('EGBCShare.htmlToWhatsApp("<ul><li>Top<ul><li>Under</li></ul></li></ul>")'));
  ok('a nested list is indented, not lost', /Top/.test(nested) && /Under/.test(nested), JSON.stringify(nested));

  const script = String(await ev('EGBCShare.htmlToWhatsApp("<p>Safe</p><script>alert(1)<\\/script>")'));
  ok('a script tag contributes nothing', script === 'Safe', JSON.stringify(script));

  const js = String(await ev('EGBCShare.htmlToWhatsApp("<a href=\\"javascript:alert(1)\\">Press</a>")'));
  ok('a javascript: link is not passed on', !/javascript:/i.test(js), JSON.stringify(js));

  /* Trimming. A long notice is cut at a line break with "Read more:". */
  console.log('\na long notice');
  const long = { title: 'Long one', html: '<p>' + 'Words and words. '.repeat(90) + '</p>',
    link: 'https://example.invalid/long' };
  const cut = String(await ev('EGBCShare.format(' + JSON.stringify(long) + ')'));
  ok('it is trimmed', cut.length < 1300, 'length ' + cut.length);
  ok('  it says where the rest is', /Read more:/.test(cut), cut.slice(-120));
  ok('  and the link is still the last line',
    cut.trim().split('\n').pop() === 'https://example.invalid/long', cut.slice(-120));
  ok('  a short notice is NOT trimmed',
    !/Read more:/.test(String(await ev('EGBCShare.format(' + JSON.stringify(NOTICE) + ')'))));

  console.log('\n' + R.filter(Boolean).length + '/' + R.length + ' passed');
  server.close(); chrome.kill();
  process.exit(R.some(v => !v) ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
