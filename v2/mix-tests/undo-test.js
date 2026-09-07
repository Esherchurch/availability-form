/* Undo, ported from Videoeditor.html. Forty-seven tracks and no way back from
   a mis-drag was the largest risk left in the tool. */
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
  await new Promise(r => server.listen(8792, r));
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new', args: ['--no-sandbox', '--window-size=1500,1000']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1500, height: 1000 });
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await page.goto('http://localhost:8792/mix-builder.html', { waitUntil: 'networkidle0' });

  await page.evaluate(async () => {
    const MP = window.MixProject;
    const rows = MP.parseRunningOrder(
      ['#\tTrack\tArtist\tBPM\tSection\tMix\tNote',
       '1\tOne\tA\t120\tW\t\t',
       '2\tTwo\tB\t122\tW\t\t',
       '3\tThree\tC\t124\tW\t\t'].join('\n'));
    const p = MP.seedProject(rows, [], null);
    p.tracks.forEach(t => { t.durationSec = 200; t.entrySec = 0; t.exitSec = 190; t.linked = true; });
    await MP.saveProject(p);
    location.reload();
  });
  await page.waitForFunction(() => document.querySelectorAll('.trk').length >= 3, { timeout: 30000 });

  const order0 = await page.evaluate(async () =>
    (await window.MixProject.loadProject()).tracks.map(t => t.title).join(','));
  console.log('    order at the start: ' + order0);

  ok(await page.evaluate(() => !!document.getElementById('undoBtn')), 'there is an Undo control');
  ok(await page.evaluate(() => document.getElementById('undoBtn').disabled),
     'and it is greyed out before anything has been done');

  /* Two real edits through the real control. They have to be DIFFERENT edits:
     moving the last track up twice walks it past the one above and then that
     one past it, landing back where it started, which says nothing about
     whether anything was recorded. */
  const moveUp = async (nth) => {
    await page.evaluate((n) => {
      const btns = [...document.querySelectorAll('[data-act="up"]:not([disabled])')];
      btns[n].click();
    }, nth);
    await new Promise(r => setTimeout(r, 400));
  };
  await moveUp(1);                       // third track up one
  const orderA = await page.evaluate(async () =>
    (await window.MixProject.loadProject()).tracks.map(t => t.title).join(','));
  console.log('    after one move: ' + orderA);
  ok(orderA !== order0, 'the order changed', orderA);

  await moveUp(0);                       // and the second track up one
  const order1 = await page.evaluate(async () =>
    (await window.MixProject.loadProject()).tracks.map(t => t.title).join(','));
  console.log('    after a second, different move: ' + order1);
  ok(order1 !== orderA, 'and changed again', order1);

  const state = await page.evaluate(() => ({
    undo: document.getElementById('undoBtn').disabled,
    count: (document.getElementById('undoCount') || {}).textContent
  }));
  ok(state.undo === false, 'Undo is live once something has been done', state.count);

  await page.click('#undoBtn');
  await new Promise(r => setTimeout(r, 500));
  const order2 = await page.evaluate(async () =>
    (await window.MixProject.loadProject()).tracks.map(t => t.title).join(','));
  console.log('    after one undo: ' + order2);
  ok(order2 === orderA, 'undo takes the last change back', order2 + ' vs ' + orderA);

  await page.click('#undoBtn');
  await new Promise(r => setTimeout(r, 500));
  const order3 = await page.evaluate(async () =>
    (await window.MixProject.loadProject()).tracks.map(t => t.title).join(','));
  console.log('    after two undos: ' + order3);
  ok(order3 === order0, 'undoing everything gets back to where it started',
     order3 + ' vs ' + order0);

  // redo
  const redoLive = await page.evaluate(() => !document.getElementById('redoBtn').disabled);
  ok(redoLive, 'Redo is live after an undo');
  await page.click('#redoBtn');
  await new Promise(r => setTimeout(r, 500));
  const order4 = await page.evaluate(async () =>
    (await window.MixProject.loadProject()).tracks.map(t => t.title).join(','));
  ok(order4 !== order3, 'redo puts it back', order4);

  // Ctrl+Z
  await page.keyboard.down('Control');
  await page.keyboard.press('KeyZ');
  await page.keyboard.up('Control');
  await new Promise(r => setTimeout(r, 500));
  const order5 = await page.evaluate(async () =>
    (await window.MixProject.loadProject()).tracks.map(t => t.title).join(','));
  ok(order5 === order3, 'Ctrl+Z undoes too', order5);

  /* Peaks are deliberately kept out of the stack; they must survive a restore
     rather than being wiped by it, or every waveform would blank on undo. */
  const peaksKept = await page.evaluate(() => {
    const rows = document.querySelectorAll('.trk');
    return rows.length;
  });
  ok(peaksKept >= 3, 'the track list still renders after restoring', peaksKept + ' rows');

  ok(errs.length === 0, 'no console errors', errs.slice(0, 2).join(' | '));
  await browser.close(); server.close();
  console.log(fails ? '\n' + fails + ' FAILED' : '\nundo and redo work');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error('HARNESS FAILED:', e); process.exit(2); });
