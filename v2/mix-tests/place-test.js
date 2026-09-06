/* Drag a sample along the junction strip. The test is whether dragging moves
   it, where the pointer says, and whether what gets stored matches what was
   dragged — not whether the canvas exists. */
const http = require('http'), fs = require('fs'), path = require('path');
const puppeteer = require('puppeteer-core');
const ROOT = require('path').join(__dirname, '..');
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
  await new Promise(r => server.listen(8763, r));
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new', args: ['--no-sandbox', '--window-size=1500,1000']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1500, height: 1000 });
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await page.goto('http://localhost:8763/mix-builder.html', { waitUntil: 'networkidle0' });

  // A project with three tracks and a sample in the library, built through the
  // real model rather than by poking the DOM.
  await page.evaluate(async () => {
    const MP = window.MixProject;
    const rows = MP.parseRunningOrder(
      '#\tTrack\tArtist\tBPM\tSection\tMix\tNote\n' +
      '1\tOne\tA\t120\tWarm-up\t\t\n' +
      '2\tTwo\tB\t122\tWarm-up\t\t\n' +
      '3\tThree\tC\t124\tWarm-up\t\t\n');
    const p = MP.seedProject(rows, [], null);
    p.tracks.forEach((t, i) => {
      t.durationSec = 200; t.entrySec = 4; t.exitSec = 190; t.linked = true;
      t.peaks = Array.from({ length: 600 }, (_, k) => 0.3 + 0.5 * Math.abs(Math.sin(k / 9)));
    });
    await MP.saveProject(p);
    await MP.saveSample({
      id: 'smp_test', name: 'Sir Duke horns', bars: 3, sourceBpm: 120,
      durationSec: 6, createdFrom: 'One'
    }, null);
    location.reload();
  });
  await page.waitForFunction(() => !!document.querySelector('[data-sample]'), { timeout: 20000 });

  // Open the placer the way a person does.
  await page.evaluate(() => {
    document.querySelector('[data-act="sample-place"]').click();
  });
  await page.waitForSelector('#placeStrip', { timeout: 10000 });

  // Scroll it into view first: getBoundingClientRect is viewport-relative,
  // and a drag aimed below the fold lands on nothing at all.
  const box = await page.evaluate(() => {
    const cv = document.getElementById('placeStrip');
    cv.scrollIntoView({ block: 'center' });
    const r = cv.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height,
             onScreen: r.top >= 0 && r.bottom <= window.innerHeight };
  });
  ok(box.onScreen, 'the strip is on screen to be dragged', 'y=' + Math.round(box.y));
  ok(box.w > 200 && box.h > 40, 'the junction strip is drawn at a usable size',
     Math.round(box.w) + 'x' + Math.round(box.h));

  const inked = await page.evaluate(() => {
    const cv = document.getElementById('placeStrip');
    const g = cv.getContext('2d');
    const d = g.getImageData(0, 0, cv.width, cv.height).data;
    let n = 0;
    for (let i = 0; i < d.length; i += 4) {
      if (!(d[i] > 244 && d[i + 1] > 248 && d[i + 2] > 246)) n++;
    }
    return n;
  });
  ok(inked > 5000, 'it has waveform, bar lines and the block actually painted on it',
     inked + ' inked pixels');

  const before0 = await page.$eval('#placeBars', el => el.value);

  // Drag the block towards the join.
  const y = box.y + box.h / 2;
  const startX = box.x + box.w * 0.55;
  await page.mouse.move(startX, y);
  await page.mouse.down();
  await page.mouse.move(box.x + box.w * 0.75, y, { steps: 12 });
  await page.mouse.up();
  const afterRight = await page.$eval('#placeBars', el => el.value);
  ok(+afterRight < +before0, 'dragging towards the join places it later',
     before0 + ' bars → ' + afterRight + ' bars');

  // Drag it back, away from the join.
  await page.mouse.move(box.x + box.w * 0.75, y);
  await page.mouse.down();
  await page.mouse.move(box.x + box.w * 0.35, y, { steps: 12 });
  await page.mouse.up();
  const afterLeft = await page.$eval('#placeBars', el => el.value);
  ok(+afterLeft > +afterRight, 'dragging away from the join places it earlier',
     afterRight + ' bars → ' + afterLeft + ' bars');

  // It must not run past the join.
  await page.mouse.move(box.x + box.w * 0.5, y);
  await page.mouse.down();
  await page.mouse.move(box.x + box.w * 0.99, y, { steps: 10 });
  await page.mouse.up();
  const clamped = await page.$eval('#placeBars', el => el.value);
  ok(+clamped >= 0, 'it cannot be dragged past the join into the next track', clamped + ' bars');

  // Typing still works and moves the block.
  await page.evaluate(() => {
    const el = document.getElementById('placeBars');
    el.value = '12';
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  const movedByTyping = await page.evaluate(() => {
    const cv = document.getElementById('placeStrip');
    const g = cv.getContext('2d');
    const d = g.getImageData(0, 0, cv.width, cv.height).data;
    // the block is the only amber thing on the strip
    let first = -1;
    for (let x = 0; x < cv.width; x++) {
      const i = (Math.floor(cv.height / 2) * cv.width + x) * 4;
      if (d[i] > 150 && d[i] < 210 && d[i + 1] > 100 && d[i + 1] < 170 && d[i + 2] < 120) { first = x; break; }
    }
    return first;
  });
  ok(movedByTyping > 0, 'typing a number moves the block too', 'block starts at x=' + movedByTyping);

  // Place it, and check what was stored is what was on screen.
  const typed = await page.$eval('#placeBars', el => el.value);
  await page.evaluate(() => document.querySelector('[data-act="do-place"]').click());
  // The panel re-renders synchronously but the write to storage is async, so
  // wait for the stored project to actually carry it rather than for the UI.
  await page.waitForFunction(async () => {
    const p = await window.MixProject.loadProject();
    return !!(p && (p.placements || []).length);
  }, { timeout: 10000 }).catch(() => {});
  const stored = await page.evaluate(async () => {
    const p = await window.MixProject.loadProject();
    return (p.placements || []).map(x => ({ j: x.atJunction, bars: x.barsBeforeEntry, gain: x.gainDb }));
  });
  console.log('    stored: ' + JSON.stringify(stored));
  ok(stored.length === 1, 'the placement reaches the project', stored.length + ' placement(s)');
  ok(stored.length === 1 && String(stored[0].bars) === String(typed),
     'what was stored is where the block was', 'on screen ' + typed + ', stored ' + (stored[0] || {}).bars);

  ok(errs.length === 0, 'no console errors', errs.slice(0, 3).join(' | '));
  await browser.close(); server.close();
  console.log(fails ? '\n' + fails + ' FAILED' : '\nthe sample is placed by dragging it');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error('HARNESS FAILED:', e); process.exit(2); });
