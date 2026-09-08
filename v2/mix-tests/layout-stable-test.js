/* The page must not move while it plays.

   The clip light was display:none until it lit, so the meter grew taller the
   moment the mix clipped and shrank again when the level fell back — and the
   timeline below it moved down and up with it, several times a second on a mix
   that clips intermittently. Nothing that appears and disappears during
   playback may change the height of anything above the timeline. */
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
  await new Promise(r => server.listen(8803, r));
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new', args: ['--no-sandbox', '--window-size=1100,900']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1100, height: 900 });
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  await page.goto('http://localhost:8803/mix-builder.html', { waitUntil: 'networkidle0' });

  await page.evaluate(async () => {
    const MP = window.MixProject;
    const rows = MP.parseRunningOrder(
      ['#\tTrack\tArtist\tBPM\tSection\tMix\tNote',
       '1\tOne\tA\t120\tW\t\t', '2\tTwo\tB\t124\tW\t\t'].join('\n'));
    const p = MP.seedProject(rows, [], null);
    p.tracks.forEach(t => { t.durationSec = 200; t.entrySec = 0; t.exitSec = 190; t.linked = true; });
    await MP.saveProject(p);
    location.reload();
  });
  await page.waitForFunction(() => document.querySelectorAll('#timeline .clip').length > 0,
                             { timeout: 30000 });

  /* Flash the clip light the way a hot mix does, and watch what moves. */
  const moved = await page.evaluate(async () => {
    const ids = ['timeline', 'tlEditor', 'summary'];
    const read = () => ids.map(id => {
      const el = document.getElementById(id);
      return el ? Math.round(el.getBoundingClientRect().top) : 0;
    });
    const w = document.getElementById('vuClip');
    if (!w) return { error: 'no clip light' };
    const seen = {};
    ids.forEach((id, i) => { seen[id] = new Set(); });
    for (let k = 0; k < 12; k++) {
      if (k % 2) w.classList.add('show'); else w.classList.remove('show');
      await new Promise(r => requestAnimationFrame(r));
      const now = read();
      ids.forEach((id, i) => seen[id].add(now[i]));
    }
    w.classList.remove('show');
    const out = {};
    ids.forEach(id => { out[id] = [...seen[id]]; });
    return out;
  });

  if (moved.error) { ok(false, moved.error); }
  else {
    Object.keys(moved).forEach(id => {
      const vals = moved[id];
      const spread = Math.max(...vals) - Math.min(...vals);
      console.log('    ' + id.padEnd(10) + 'top took ' + vals.length + ' value(s), spread ' + spread + ' px');
      ok(spread <= 1, id + ' does not move when the clip light comes on and off',
         spread + ' px');
    });
  }

  /* And the editor must not accumulate copies of a row it has been given. */
  const dupes = await page.evaluate(async () => {
    const clip = document.querySelector('#timeline .clip.song');
    if (!clip) return -1;
    for (let i = 0; i < 4; i++) {
      clip.click();
      await new Promise(r => setTimeout(r, 250));
      document.querySelector('#timeline .clip.drums, #timeline .clip.song').click();
      await new Promise(r => setTimeout(r, 250));
    }
    return document.querySelectorAll('#tlEditor .trk-body, #tlEditor .trk').length;
  });
  ok(dupes <= 1, 'the editor panel holds one thing at a time, not a pile of them',
     dupes + ' in the panel');

  ok(errs.length === 0, 'no console errors', errs.slice(0, 2).join(' | '));
  await browser.close(); server.close();
  console.log(fails ? '\n' + fails + ' FAILED' : '\nthe page holds still while it plays');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error('HARNESS FAILED:', e); process.exit(2); });
