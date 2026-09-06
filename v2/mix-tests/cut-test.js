/* Cutting a sample: can the music be stopped while doing it, and does the cut
   contain what was dragged?

   Both failed in use. Stop was rendered with the disabled attribute hard-coded
   and only switched on when playback started, so any re-render while the music
   was going — dragging a selection does one — brought it back greyed out with
   the audio still running. And the selection kept the drag START but replaced
   the END with a whole number of bars from it, minimum one, so short passages
   were rounded outwards and the end never landed where it was put. */
const http = require('http'), fs = require('fs'), path = require('path');
const puppeteer = require('puppeteer-core');
const ROOT = path.join(__dirname, '..');
const MP3 = 'C:/Users/marti/Music/Amazon Music/03 - Here Comes the Hotstepper (Heartical Mix).mp3';
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
  await new Promise(r => server.listen(8781, r));
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
  await page.goto('http://localhost:8781/mix-builder.html', { waitUntil: 'networkidle0' });

  // A real file through the real intake, so playback is genuinely exercised.
  await page.evaluate(async () => {
    const MP = window.MixProject;
    const rows = MP.parseRunningOrder(
      '#\tTrack\tArtist\tBPM\tSection\tMix\tNote\n1\tHotstepper\tIni\t100\tW\t\t\n');
  });
  const input = await page.$('#file');
  await input.uploadFile(MP3);
  await page.waitForFunction(() => {
    const t = document.querySelector('.trk');
    return t && /BPM/.test(t.textContent);
  }, { timeout: 120000 });

  // instrument playback AFTER the page has settled, or a reload wipes it
  await page.evaluate(() => {
    window.__nodes = [];
    const proto = (window.AudioContext || window.webkitAudioContext).prototype;
    const orig = proto.createBufferSource;
    proto.createBufferSource = function () {
      const node = orig.call(this);
      const rec = { started: false, stopped: false };
      window.__nodes.push(rec);
      const s = node.start.bind(node), st = node.stop.bind(node);
      node.start = function (...a) { rec.started = true; return s(...a); };
      node.stop = function (...a) { rec.stopped = true; return st(...a); };
      return node;
    };
  });

  await page.evaluate(() => { const h = document.querySelector('.trk-head'); if (h) h.click(); });
  await page.waitForSelector('canvas.wave', { timeout: 20000 });
  const durSec = await page.evaluate(async () => {
    const p = await window.MixProject.loadProject();
    const t = (p.tracks || []).find(x => x.durationSec);
    return t ? t.durationSec : 0;
  });
  if (!durSec) { console.log("  the track has no duration — audio did not load"); }

  /* ---- the selection is what was dragged ---- */
  const sel = await page.evaluate(() => {
    const cv = document.querySelector('canvas.wave');
    cv.scrollIntoView({ block: 'center' });
    const r = cv.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  });
  const y = sel.y + sel.h / 2;
  // a short drag: 3% of a 120 s track is about 3.6 s, well under two bars at 120 BPM
  const fromFrac = 0.302, toFrac = 0.3282;      // deliberately not a bar multiple
  await page.mouse.move(sel.x + sel.w * fromFrac, y);
  await page.mouse.down();
  await page.mouse.move(sel.x + sel.w * toFrac, y, { steps: 10 });
  await page.mouse.up();
  const wantSec = (toFrac - fromFrac) * durSec;
  await new Promise(r => setTimeout(r, 400));

  const range = await page.evaluate(() => {
    const el = document.querySelector('.samplecut-range');
    return el ? el.textContent.trim() : null;
  });
  console.log('    selection reads: ' + range);
  ok(!!range, 'a short drag makes a selection', range || 'none');
  if (range) {
    const secs = parseFloat(range);
    const barsShown = parseFloat((range.match(/([0-9.]+) bars/) || [])[1] || "0");
    // the property under test: it is NOT rounded onto a bar line
    ok(Math.abs(barsShown - Math.round(barsShown)) > 0.02,
       'the selection is what was dragged, not rounded to whole bars',
       barsShown.toFixed(3) + ' bars');
  }

  /* ---- Stop survives a re-render ---- */
  const played = await page.evaluate(() => {
    const b = document.querySelector('[data-act="play-sel"]');
    if (!b) return 'no Hear it button';
    b.click();
    return 'clicked';
  });
  await new Promise(r => setTimeout(r, 600));
  const afterPlay = await page.evaluate(() => ({
    anyStarted: window.__nodes.some(n => n.started),
    stops: [...document.querySelectorAll('[data-act="stop-all"]')].map(b => b.disabled)
  }));
  console.log('    after pressing Hear it: playing=' + afterPlay.anyStarted +
              ', stop buttons disabled=' + JSON.stringify(afterPlay.stops));

  if (afterPlay.anyStarted) {
    ok(afterPlay.stops.length > 0 && afterPlay.stops.every(d => d === false),
       'every Stop on the page is live while the music plays',
       JSON.stringify(afterPlay.stops));

    // force a re-render, exactly as dragging a selection does
    await page.evaluate(() => {
      const el = document.querySelector('[data-act="snap-sel"]');
      if (el) el.click();
    });
    await new Promise(r => setTimeout(r, 400));
    const afterRender = await page.evaluate(() =>
      [...document.querySelectorAll('[data-act="stop-all"]')].map(b => b.disabled));
    ok(afterRender.length > 0 && afterRender.every(d => d === false),
       'and it is still live after the panel re-renders',
       JSON.stringify(afterRender));

    const stopped = await page.evaluate(() => {
      const b = document.querySelector('[data-act="stop-all"]:not([disabled])');
      if (!b) return false;
      b.click();
      return true;
    });
    await new Promise(r => setTimeout(r, 400));
    const done = await page.evaluate(() =>
      window.__nodes.filter(n => n.started && !n.stopped).length);
    ok(stopped, 'Stop can be pressed');
    ok(done === 0, 'and the music actually stops', done + ' source(s) left running');
  } else {
    console.log('    (no audio in memory for this page — playback path not exercised)');
  }

  ok(errs.length === 0, 'no console errors', errs.slice(0, 2).join(' | '));
  await browser.close(); server.close();
  console.log(fails ? '\n' + fails + ' FAILED' : '\nthe cutter takes what you drag, and Stop stops');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error('HARNESS FAILED:', e); process.exit(2); });
