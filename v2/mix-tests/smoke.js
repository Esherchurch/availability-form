/* Boot the real page over http in the real Chrome, drive it, and report
   anything the console complains about. */
const http = require('http'), fs = require('fs'), path = require('path');
const puppeteer = require('puppeteer-core');

const ROOT = require('path').join(__dirname, '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json' };

const server = http.createServer((req, res) => {
  if (req.url === '/favicon.ico') { res.writeHead(204); res.end(); return; }
  const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  fs.readFile(p, (err, buf) => {
    if (err) { res.writeHead(404); res.end('nope'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' });
    res.end(buf);
  });
});

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';

(async () => {
  await new Promise(r => server.listen(8731, r));
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: 'new',
    args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required']
  });
  const page = await browser.newPage();
  const errors = [], warnings = [], logs = [];
  page.on('console', m => {
    const t = m.type(), txt = m.text();
    if (t === 'error') errors.push(txt);
    else if (t === 'warning') warnings.push(txt);
    else logs.push(t + ': ' + txt);
  });
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  page.on('requestfailed', r => errors.push('REQUEST FAILED: ' + r.url()));
  page.on('response', r => { if (r.status() === 404) errors.push('404: ' + r.url()); });

  await page.goto('http://localhost:8731/mix-builder.html', { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 600));

  // The three modules must be present.
  const globals = await page.evaluate(() => ({
    dsp: typeof window.MixDSP, proj: typeof window.MixProject, ui: typeof window.MixUI,
    types: window.MixDSP && window.MixDSP.TYPES
  }));

  // Drive a real import of the real running order through the page's own path.
  const rows = require('./running-order.json').tracks.filter(t => t.BPM);
  const result = await page.evaluate(async (rows) => {
    const MP = window.MixProject;
    const parsed = MP.parseRunningOrder(rows);
    const fakeFiles = parsed.map((r, i) => ({
      name: String(i + 1).padStart(2, '0') + ' ' + r.title + '.mp3', size: 4000000 + i
    }));
    const p = MP.seedProject(parsed, fakeFiles);
    p.tracks.forEach((t, i) => {
      t.durationSec = 200 + i; t.entrySec = 0.5; t.exitSec = 190 + i; t.downbeatSec = 0.5;
    });
    // Round-trip it through IndexedDB, which is the thing file:// cannot do.
    await MP.saveProject(p, true);
    const back = await MP.loadProject();
    const l = MP.layout(back);
    return {
      persisted: back.tracks.length, junctions: back.junctions.length,
      total: l.totalSec, warnings: l.warnings.length,
      unrenderable: l.junctions.filter(j => !j.renderable).length,
      idbWorks: back.tracks.length === p.tracks.length,
      cacheKey: MP.junctionCacheKey(back, 20)
    };
  }, rows);

  // Render the UI with that project and check the timeline actually drew.
  const painted = await page.evaluate(async () => {
    const MP = window.MixProject;
    window.MixUI.init();
    await new Promise(r => setTimeout(r, 400));
    return {
      tlTracks: document.querySelectorAll('.tl-track').length,
      tlJunctions: document.querySelectorAll('.tl-junction').length,
      trackRows: document.querySelectorAll('.trk').length,
      summary: (document.getElementById('summary') || {}).textContent,
      warnRows: document.querySelectorAll('.warn-row').length
    };
  });

  // Click a junction and confirm the editor opens.
  await page.evaluate(() => {
    const j = document.querySelector('.tl-junction[data-junction="20"]');
    if (j) j.click();
  });
  await new Promise(r => setTimeout(r, 300));
  const editor = await page.evaluate(() => {
    const el = document.getElementById('junction');
    return { open: !el.classList.contains('hidden'), heading: (el.querySelector('h3') || {}).textContent,
             buttons: el.querySelectorAll('.seg button').length,
             fields: el.querySelectorAll('[data-jf]').length };
  });

  await browser.close();
  server.close();

  console.log('globals:', JSON.stringify(globals));
  console.log('import + IndexedDB round-trip:', JSON.stringify(result, null, 1));
  console.log('painted:', JSON.stringify(painted, null, 1));
  console.log('junction editor:', JSON.stringify(editor, null, 1));
  console.log('\nconsole errors (' + errors.length + '):');
  errors.forEach(e => console.log('  ' + e));
  if (warnings.length) { console.log('warnings (' + warnings.length + '):'); warnings.slice(0, 5).forEach(w => console.log('  ' + w)); }
  process.exit(errors.length ? 1 : 0);
})().catch(e => { console.error('HARNESS FAILED:', e); process.exit(2); });
