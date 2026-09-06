/* Hearing a section of the mix in place — the records, the drum fill between
   them, and anything placed over them — without exporting a file.

   "Play from…" used to refuse outright and tell you to download the WAV, on the
   grounds that an 80-minute buffer is too big to decode. True of a whole set,
   false of a range of two or three tracks, which is what anyone auditioning a
   junction has actually rendered. The analyser next door has always just kept
   its render as a buffer and played it. */
const http = require('http'), fs = require('fs'), path = require('path');
const puppeteer = require('puppeteer-core');
const ROOT = path.join(__dirname, '..');
const MUSIC = 'C:/Users/marti/Music/Amazon Music';
const A = '13 - Despacito (Remix) [feat. Justin Bieber].mp3';
const B = '03 - Here Comes the Hotstepper (Heartical Mix).mp3';
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mp3': 'audio/mpeg' };
const server = http.createServer((q, r) => {
  const u = decodeURIComponent(q.url.split('?')[0]);
  if (u === '/favicon.ico') { r.writeHead(204); r.end(); return; }
  fs.readFile(path.join(ROOT, u), (e, b) => {
    if (e) { r.writeHead(404); r.end(''); return; }
    r.writeHead(200, { 'Content-Type': MIME[path.extname(u)] || 'application/octet-stream' });
    r.end(b);
  });
});

let fails = 0;
const ok = (c, m, x) => { console.log((c ? '  ok   ' : '  FAIL ') + m + (x ? '   ' + x : '')); if (!c) fails++; };

(async () => {
  if (!fs.existsSync(path.join(MUSIC, A)) || !fs.existsSync(path.join(MUSIC, B))) {
    console.log('  the two test records are not on this machine — nothing to run');
    process.exit(0);
  }
  await new Promise(r => server.listen(8783, r));
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new', args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required',
                            '--window-size=1500,1000', '--js-flags=--max-old-space-size=4096']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1500, height: 1000 });
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await page.goto('http://localhost:8783/mix-builder.html', { waitUntil: 'networkidle0' });

  const input = await page.$('#file');
  await input.uploadFile(path.join(MUSIC, A), path.join(MUSIC, B));
  await page.waitForFunction(async () => {
    const p = await window.MixProject.loadProject();
    return p && (p.tracks || []).length >= 2 && p.tracks.every(t => t.linked && t.sourceBpm);
  }, { timeout: 240000 });

  /* A bridge at the junction, and a sample placed over the outgoing record —
     the case that prompted this: a cut over Despacito, then wanting to hear
     the link with it in. */
  await page.evaluate(async () => {
    const MP = window.MixProject;
    const p = await MP.loadProject();
    p.junctions[0] = { type: 'throw-bridge', beatBeats: 32, drumPattern: 'four',
                       preBeats: 8, carryMode: 'auto' };
    await MP.saveSample({ id: 'smp_sec', name: 'Test stab', bars: 2,
                          sourceBpm: p.tracks[0].sourceBpm, durationSec: 4 }, null);
    MP.addPlacement(p, { sampleId: 'smp_sec', atJunction: 0, mode: 'over',
                         barsBeforeEntry: 8, gainDb: -6 });
    await MP.saveProject(p);
    location.reload();
  });
  await page.waitForFunction(() => document.querySelectorAll('.trk').length >= 2, { timeout: 60000 });
  const input2 = await page.$('#file');
  await input2.uploadFile(path.join(MUSIC, A), path.join(MUSIC, B));
  await page.waitForFunction(async () => {
    const p = await window.MixProject.loadProject();
    return p && (p.tracks || []).every(t => t.linked);
  }, { timeout: 240000 });
  await new Promise(r => setTimeout(r, 1500));

  // instrument playback
  await page.evaluate(() => {
    window.__played = [];
    const proto = (window.AudioContext || window.webkitAudioContext).prototype;
    const orig = proto.createBufferSource;
    proto.createBufferSource = function () {
      const n = orig.call(this);
      const s = n.start.bind(n);
      n.start = function (...a) {
        if (n.buffer && n.buffer.duration > 5) window.__played.push(n.buffer.duration);
        return s(...a);
      };
      return n;
    };
  });

  const btn = await page.evaluate(() => !!document.getElementById('playRangeBtn'));
  ok(btn, 'there is a control that renders a range and plays it');

  const t0 = Date.now();
  await page.evaluate(() => {
    document.getElementById('renderFrom').value = '1';
    document.getElementById('renderTo').value = '2';
    document.getElementById('playRangeBtn').click();
  });
  await page.waitForFunction(() => window.__played.length > 0, { timeout: 300000 }).catch(() => {});
  const took = (Date.now() - t0) / 1000;

  const played = await page.evaluate(() => window.__played);
  const say = await page.evaluate(() =>
    (document.getElementById('renderStatus') || document.getElementById('status') || {}).textContent || '');
  console.log('    took ' + took.toFixed(1) + 's — ' + say);

  ok(played.length > 0, 'it plays the rendered section',
     played.length ? played[0].toFixed(1) + 's of audio' : 'nothing played');
  if (played.length) {
    ok(played[0] > 60, 'and it is the section, not a fragment', played[0].toFixed(1) + 's');
  }

  // Stop reaches it, even though this button lives outside the track list
  const stopped = await page.evaluate(() => {
    const b = [...document.querySelectorAll('[data-act="stop-all"]')].find(x => !x.disabled);
    if (!b) return 'no live Stop button';
    b.click();
    return 'clicked';
  });
  ok(stopped === 'clicked', 'and Stop is live for it', stopped);

  // playing again must not decode a second time
  const t1 = Date.now();
  await page.evaluate(() => { window.__played = []; document.getElementById('playMixBtn').click(); });
  await page.waitForFunction(() => window.__played.length > 0, { timeout: 60000 }).catch(() => {});
  const again = (Date.now() - t1) / 1000;
  ok(again < 3, 'playing it again is instant, not another decode', again.toFixed(2) + 's');

  ok(errs.length === 0, 'no console errors', errs.slice(0, 2).join(' | '));
  await browser.close(); server.close();
  console.log(fails ? '\n' + fails + ' FAILED' : '\na section of the mix can be heard without exporting it');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error('HARNESS FAILED:', e); process.exit(2); });
