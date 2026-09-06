/* "Hear the drums" — the button, clicked, at normal zoom, with sound coming
   out of it. Tuning a kit by numbers does not work, so this is checked the way
   it will be used: press it, and something audible must arrive quickly. */
const http = require('http'), fs = require('fs'), path = require('path');
const puppeteer = require('puppeteer-core');
const ROOT = path.join(__dirname, '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript' };
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
  await new Promise(r => server.listen(8779, r));
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new', args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required',
                            '--window-size=1500,1000']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1500, height: 1000 });
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await page.goto('http://localhost:8779/mix-builder.html', { waitUntil: 'networkidle0' });

  // Two tracks far enough apart in tempo that the junction is a bridge.
  await page.evaluate(async () => {
    const MP = window.MixProject;
    const rows = MP.parseRunningOrder(
      '#\tTrack\tArtist\tBPM\tSection\tMix\tNote\n' +
      '1\tSlow\tA\t89\tW\t\t\n2\tFast\tB\t128\tW\t\t\n');
    const p = MP.seedProject(rows, [], null);
    p.tracks.forEach(t => {
      t.durationSec = 200; t.entrySec = 2; t.exitSec = 190; t.bpmLocked = true;
      t.peaks = Array.from({ length: 400 }, (_, k) => 0.4 + 0.4 * Math.abs(Math.sin(k / 8)));
    });
    p.junctions[0] = { type: 'throw-bridge', beatBeats: 64, drumPattern: 'four',
                       preBeats: 8, carryMode: 'auto' };
    await MP.saveProject(p);
    location.reload();
  });
  await page.waitForFunction(() => document.querySelectorAll('[data-act="open-junction"], .jrow-btn').length > 0,
                             { timeout: 20000 });

  // open the junction the way a person does
  await page.evaluate(() => {
    const b = document.querySelector('.jrow-btn') ||
              document.querySelector('[data-act="open-junction"]');
    b.click();
  });
  await page.waitForSelector('[data-act="hear-drums"]', { timeout: 10000 });

  const box = await page.evaluate(() => {
    const b = document.querySelector('[data-act="hear-drums"]');
    b.scrollIntoView({ block: 'center' });
    const r = b.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height,
             onScreen: r.top >= 0 && r.bottom <= window.innerHeight, text: b.textContent.trim() };
  });
  ok(box.onScreen && box.w > 40, 'the button is on screen and clickable',
     '"' + box.text + '" ' + Math.round(box.w) + 'x' + Math.round(box.h));

  /* Catch what is played. The button hands a buffer to play(); wrapping the
     context's createBufferSource is how to see it without a speaker. */
  await page.evaluate(() => {
    window.__played = [];
    const proto = (window.AudioContext || window.webkitAudioContext).prototype;
    const orig = proto.createBufferSource;
    proto.createBufferSource = function () {
      const node = orig.call(this);
      const start = node.start.bind(node);
      node.start = function (...args) {
        if (node.buffer) {
          const d = node.buffer.getChannelData(0);
          let peak = 0, sum = 0;
          for (let i = 0; i < d.length; i += 3) { const a = Math.abs(d[i]); if (a > peak) peak = a; sum += d[i] * d[i]; }
          window.__played.push({ sec: node.buffer.duration, peak: peak,
                                 rms: Math.sqrt(sum / Math.ceil(d.length / 3)) });
        }
        return start(...args);
      };
      return node;
    };
  });

  const t0 = Date.now();
  await page.click('[data-act="hear-drums"]');
  await page.waitForFunction(() => window.__played && window.__played.length > 0, { timeout: 20000 })
            .catch(() => {});
  const took = Date.now() - t0;

  const played = await page.evaluate(() => window.__played);
  const status = await page.evaluate(() => (document.getElementById('jxStatus') || {}).textContent || '');
  console.log('    status: ' + status);

  ok(played.length > 0, 'pressing it plays something', played.length + ' buffer(s)');
  if (played.length) {
    const p = played[played.length - 1];
    console.log('    ' + p.sec.toFixed(1) + 's, peak ' + p.peak.toFixed(3) + ', rms ' + p.rms.toFixed(4));
    ok(p.sec > 3 && p.sec < 30, 'it is a few bars, not a fragment or a whole render',
       p.sec.toFixed(1) + 's');
    ok(p.rms > 0.01, 'and it is audible, not silence', 'rms ' + p.rms.toFixed(4));
    ok(p.peak <= 1.0, 'and it does not clip', 'peak ' + p.peak.toFixed(3));
  }
  ok(took < 15000, 'it comes back fast enough to tune with', (took / 1000).toFixed(1) + 's');

  // the volume control is there and reaches the project
  const volSaved = await page.evaluate(async () => {
    const el = document.querySelector('[data-jf="fillGainDb"]');
    if (!el) return 'missing';
    el.value = '-9';
    el.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise(r => setTimeout(r, 400));
    return (await window.MixProject.loadProject()).junctions[0].fillGainDb;
  });
  ok(volSaved === -9, 'the drum volume saves to the project', 'got ' + volSaved);

  // and changing it changes what you hear
  await page.evaluate(() => { window.__played = []; });
  await page.click('[data-act="hear-drums"]');
  await page.waitForFunction(() => window.__played && window.__played.length > 0, { timeout: 20000 })
            .catch(() => {});
  const quieter = await page.evaluate(() => window.__played[window.__played.length - 1]);
  if (played.length && quieter) {
    ok(quieter.rms < played[played.length - 1].rms * 0.85,
       'turning it down makes it quieter',
       played[played.length - 1].rms.toFixed(4) + ' → ' + quieter.rms.toFixed(4));
  }

  ok(errs.length === 0, 'no console errors', errs.slice(0, 2).join(' | '));
  await browser.close(); server.close();
  console.log(fails ? '\n' + fails + ' FAILED' : '\nthe drums can be heard before they are used');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error('HARNESS FAILED:', e); process.exit(2); });
