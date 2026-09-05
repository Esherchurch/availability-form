/* Offline capability, reordering, the bench and the sequencer — driven through
   the real page in real Chrome. The offline half is the point: kill the network
   entirely, reload, and the tool and your saved project must both still be
   there. */
const http = require('http'), fs = require('fs'), path = require('path');
const puppeteer = require('puppeteer-core');

const ROOT = path.join(__dirname, '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json' };
let served = 0;
const server = http.createServer((req, res) => {
  if (req.url === '/favicon.ico') { res.writeHead(204); res.end(); return; }
  served++;
  const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  fs.readFile(p, (err, buf) => {
    if (err) { res.writeHead(404); res.end(''); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' });
    res.end(buf);
  });
});

let fails = 0;
const ok = (c, m) => { if (!c) { console.log('  FAIL ' + m); fails++; } else console.log('  ok   ' + m); };

const seed = async (page, rows) => page.evaluate(async (rows) => {
  const MP = window.MixProject;
  const parsed = MP.parseRunningOrder(rows);
  const files = parsed.map((r, i) => ({ name: (i + 1) + ' ' + r.title + '.mp3', size: 4e6 + i }));
  const p = MP.seedProject(parsed, files);
  p.tracks.forEach((t, i) => {
    t.durationSec = 200 + i; t.entrySec = 0.5; t.exitSec = 190 + i;
    t.downbeatSec = 0.5; t.linked = true;
  });
  await MP.saveProject(p, true);
  return p.tracks.length;
}, rows);

(async () => {
  await new Promise(r => server.listen(8734, r));
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new', args: ['--no-sandbox']
  });
  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
  page.on('console', m => {
    // The URL is on location(), not in the message text.
    const where = (m.location() && m.location().url) || '';
    if (m.type() === 'error' && !/favicon/.test(where)) errs.push(m.text() + ' @ ' + where);
  });

  const rows = require('./running-order.json').tracks.filter(t => t.BPM);
  const URL_ = 'http://localhost:8734/mix-builder.html';

  console.log('\n— service worker —');
  await page.goto(URL_, { waitUntil: 'networkidle0' });
  await page.evaluate(() => navigator.serviceWorker.ready);
  const swState = await page.evaluate(async () => {
    const r = await navigator.serviceWorker.getRegistration();
    return { active: !!(r && r.active), scope: r && r.scope };
  });
  ok(swState.active, 'a service worker is active (' + swState.scope + ')');

  const cached = await page.evaluate(async () => {
    const names = await caches.keys();
    const shell = names.find(n => n.startsWith('mix-shell'));
    if (!shell) return { names, files: [] };
    const c = await caches.open(shell);
    const keys = await c.keys();
    return { names, files: keys.map(r => r.url.split('/').pop()) };
  });
  ok(cached.files.length >= 4,
     'the app shell is precached: ' + cached.files.join(', '));
  ['mix-builder.html', 'mix-dsp.js', 'mix-project.js', 'mix-ui.js'].forEach(f => {
    ok(cached.files.indexOf(f) !== -1, '  cached ' + f);
  });

  console.log('\n— save a project, then pull the plug —');
  const n = await seed(page, rows);
  ok(n === 47, 'seeded and saved a 47-track project');

  await page.setOfflineMode(true);
  server.close();                       // belt and braces: the origin is gone too
  const before = served;

  const reloaded = await page.goto(URL_, { waitUntil: 'domcontentloaded' })
    .then(r => ({ ok: true, status: r && r.status() }))
    .catch(e => ({ ok: false, err: e.message }));
  ok(reloaded.ok, 'the page reloads with the network off and the server stopped');

  await new Promise(r => setTimeout(r, 800));
  const offlineState = await page.evaluate(async () => {
    const MP = window.MixProject;
    const p = await MP.loadProject();
    const l = MP.layout(p);
    return {
      modules: [typeof window.MixDSP, typeof window.MixProject, typeof window.MixUI].join(','),
      tracks: p.tracks.length,
      junctions: p.junctions.length,
      total: Math.round(l.totalSec),
      painted: document.querySelectorAll('.tl-track').length
    };
  });
  ok(offlineState.modules === 'object,object,object', 'all three modules loaded from cache');
  ok(offlineState.tracks === 47, 'the saved project is intact offline (' + offlineState.tracks + ' tracks)');
  ok(offlineState.painted === 47, 'and the timeline painted from it');

  /* The badge is driven by navigator.onLine and the online/offline events.
     Chrome's offline EMULATION does not carry navigator.onLine across a
     navigation — it reads true in the reloaded page even with the network cut —
     so asserting on it after a reload would be testing the emulator, not the
     page. Drive the real signal instead. */
  const badge = await page.evaluate(() => {
    const el = document.getElementById('offline');
    const start = el.hidden;
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
    window.dispatchEvent(new Event('offline'));
    const whenOffline = el.hidden;
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
    window.dispatchEvent(new Event('online'));
    return { start, whenOffline, whenBack: el.hidden };
  });
  ok(badge.whenOffline === false, 'the offline badge appears when the connection drops');
  ok(badge.whenBack === true, 'and clears when it returns');

  console.log('\n— editing and saving while offline —');
  const edited = await page.evaluate(async () => {
    const MP = window.MixProject;
    const p = await MP.loadProject();
    const was = p.tracks[5].title;
    MP.moveTrack(p, 5, 30);
    p.name = 'Edited with no network';
    await MP.saveProject(p, true);
    const back = await MP.loadProject();
    return { was, movedTo: back.tracks[30].title, name: back.name, n: back.tracks.length };
  });
  ok(edited.movedTo === edited.was, 'a track can be moved offline and the move persists');
  ok(edited.name === 'Edited with no network', 'the project saves offline');
  ok(edited.n === 47, 'nothing was lost');

  await page.setOfflineMode(false);
  console.log('  (served ' + before + ' requests before going offline, ' +
              (served - before) + ' after)');

  console.log('\n— reorder keeps rendered junctions —');
  const reorder = await page.evaluate(async (rows) => {
    const MP = window.MixProject;
    const parsed = MP.parseRunningOrder(rows);
    const files = parsed.map((r, i) => ({ name: (i + 1) + ' ' + r.title + '.mp3', size: 4e6 + i }));
    const p = MP.seedProject(parsed, files);
    p.tracks.forEach((t, i) => {
      t.durationSec = 200 + i; t.entrySec = 0.5; t.exitSec = 190 + i; t.downbeatSec = 0.5;
    });
    const keysBefore = [];
    for (let i = 0; i < p.junctions.length; i++) keysBefore.push(MP.junctionCacheKey(p, i));
    MP.moveTrack(p, 40, 44);
    const keysAfter = [];
    for (let i = 0; i < p.junctions.length; i++) keysAfter.push(MP.junctionCacheKey(p, i));
    const survived = keysAfter.filter(k => keysBefore.indexOf(k) !== -1).length;
    return { total: keysBefore.length, survived };
  }, rows);
  ok(reorder.survived >= reorder.total - 8,
     'moving one track invalidated only its neighbourhood: ' +
     reorder.survived + '/' + reorder.total + ' junction renders still valid');

  console.log('\n— UI: reorder controls —');
  await page.goto(URL_.replace('8734', '8735'), { waitUntil: 'domcontentloaded' }).catch(() => {});
  // Re-serve so we can drive the live UI.
  const server2 = http.createServer((req, res) => {
    if (req.url === '/favicon.ico') { res.writeHead(204); res.end(); return; }
    const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
    fs.readFile(p, (e, b) => {
      if (e) { res.writeHead(404); res.end(''); return; }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' });
      res.end(b);
    });
  });
  await new Promise(r => server2.listen(8734, r));
  await page.goto(URL_, { waitUntil: 'networkidle0' });
  await seed(page, rows);
  await page.reload({ waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 500));

  const firstTitle = await page.evaluate(() =>
    document.querySelector('.trk[data-track="1"] .trk-title').textContent);
  await page.click('.trk[data-track="1"] button[data-act="down"]');
  await new Promise(r => setTimeout(r, 400));
  const afterDown = await page.evaluate(() =>
    document.querySelector('.trk[data-track="2"] .trk-title').textContent);
  ok(afterDown === firstTitle, '"Move down" moved the right track ("' + firstTitle + '")');

  const pinnedBefore = await page.evaluate(() =>
    document.querySelectorAll('.pin.on').length);
  await page.click('.trk[data-track="5"] button[data-act="pin"]');
  await new Promise(r => setTimeout(r, 300));
  const pinnedAfter = await page.evaluate(() => document.querySelectorAll('.pin.on').length);
  ok(pinnedAfter === pinnedBefore + 1, 'pinning a track works (' + pinnedBefore + ' -> ' + pinnedAfter + ')');

  console.log('\n— UI: bench and swap —');
  await page.click('.trk[data-track="10"] button[data-act="bench"]');
  await new Promise(r => setTimeout(r, 400));
  const benched = await page.evaluate(() => ({
    tracks: document.querySelectorAll('.trk').length,
    bench: document.querySelectorAll('.bench-item').length
  }));
  ok(benched.tracks === 46, 'removing a track takes it out of the set');
  ok(benched.bench === 1, 'and puts it on the bench');

  await page.click('.trk[data-track="10"] button[data-act="swap"]');
  await new Promise(r => setTimeout(r, 300));
  const swapUI = await page.evaluate(() =>
    !!document.querySelector('.bench-item button[data-act="do-swap"]'));
  ok(swapUI, 'Swap offers the bench as replacements');
  await page.click('.bench-item button[data-act="do-swap"]');
  await new Promise(r => setTimeout(r, 400));
  const afterSwap = await page.evaluate(() => ({
    tracks: document.querySelectorAll('.trk').length,
    bench: document.querySelectorAll('.bench-item').length
  }));
  ok(afterSwap.tracks === 46 && afterSwap.bench === 1,
     'a swap is one-for-one and the outgoing track goes to the bench');

  console.log('\n— UI: suggested order —');
  await page.click('#suggestBtn');
  await new Promise(r => setTimeout(r, 500));
  const sug = await page.evaluate(() => {
    const el = document.getElementById('suggestPanel');
    return {
      open: !el.classList.contains('hidden'),
      stats: el.querySelectorAll('.sug-stat').length,
      rows: el.querySelectorAll('.sug-row').length,
      heading: (el.querySelector('h3') || {}).textContent
    };
  });
  ok(sug.open, 'the suggestion panel opens');
  ok(sug.stats === 4, 'it shows the four before/after figures');
  ok(sug.rows === 46, 'and previews the whole running order');
  console.log('       ' + sug.heading);

  const applied = await page.evaluate(async () => {
    const btn = document.querySelector('[data-act="apply-suggest"]');
    if (btn.disabled) return { skipped: true };
    btn.click();
    await new Promise(r => setTimeout(r, 500));
    const MP = window.MixProject;
    const p = await MP.loadProject();
    return { n: p.tracks.length, hidden: document.getElementById('suggestPanel').classList.contains('hidden') };
  });
  if (applied.skipped) ok(true, 'nothing to apply — order already optimal');
  else {
    ok(applied.n === 46, 'applying keeps every track (' + applied.n + ')');
    ok(applied.hidden, 'and closes the panel');
  }

  await browser.close();
  server2.close();

  if (errs.length) { console.log('\npage errors:'); errs.forEach(e => console.log('  ' + e)); }
  console.log(fails || errs.length ? '\n' + (fails + errs.length) + ' FAILURES'
                                   : '\nall assertions passed');
  process.exit(fails || errs.length ? 1 : 0);
})().catch(e => { console.error('HARNESS FAILED:', e); process.exit(2); });
