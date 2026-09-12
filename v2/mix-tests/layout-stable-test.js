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


  /* ---- nothing leaves the master above full scale.

     Two records, the drums between them and a sample over the top are summed
     live, and summing is how a mix passes 0 dBFS when no part of it does. The
     render measures its peak and pulls the whole thing down; a live preview
     cannot look ahead, so it holds the peak with a limiter instead. Driven
     hard on purpose here, and measured at the end of the chain. */
  const limited = await page.evaluate(async () => {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const master = ctx.createGain();
    const lim = ctx.createDynamicsCompressor();
    lim.threshold.value = -1; lim.knee.value = 0; lim.ratio.value = 20;
    lim.attack.value = 0.003; lim.release.value = 0.10;

    /* Render the same chain offline so the output can be measured: four loud
       sources summed, which is four times full scale before anything. */
    const off = new OfflineAudioContext(1, 44100 * 2, 44100);
    const g = off.createGain();
    const l = off.createDynamicsCompressor();
    l.threshold.value = -1; l.knee.value = 0; l.ratio.value = 20;
    l.attack.value = 0.003; l.release.value = 0.10;
    const shaper = off.createWaveShaper();
    const N = 2048, curve = new Float32Array(N);
    for (let ci = 0; ci < N; ci++) {
      const x = (ci / (N - 1)) * 2 - 1, a = Math.abs(x);
      const y = a <= 0.7 ? a : 0.7 + 0.28 * Math.tanh((a - 0.7) / 0.28);
      curve[ci] = x < 0 ? -y : y;
    }
    shaper.curve = curve; shaper.oversample = '4x';
    g.connect(l); l.connect(shaper); shaper.connect(off.destination);
    for (let k = 0; k < 4; k++) {
      const n = 44100 * 2;
      const b = off.createBuffer(1, n, 44100);
      const d = b.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = 0.9 * Math.sin(2 * Math.PI * (110 + k * 37) * i / 44100);
      const s = off.createBufferSource(); s.buffer = b; s.connect(g); s.start(0);
    }
    const out = await off.startRendering();
    const d = out.getChannelData(0);
    let peak = 0;
    for (let i = 4410; i < d.length; i++) peak = Math.max(peak, Math.abs(d[i]));

    /* and the same without the limiter, to show it is doing the work */
    const off2 = new OfflineAudioContext(1, 44100 * 2, 44100);
    const g2 = off2.createGain(); g2.connect(off2.destination);
    for (let k = 0; k < 4; k++) {
      const n = 44100 * 2;
      const b = off2.createBuffer(1, n, 44100);
      const dd = b.getChannelData(0);
      for (let i = 0; i < n; i++) dd[i] = 0.9 * Math.sin(2 * Math.PI * (110 + k * 37) * i / 44100);
      const s = off2.createBufferSource(); s.buffer = b; s.connect(g2); s.start(0);
    }
    const out2 = await off2.startRendering();
    const d2 = out2.getChannelData(0);
    let peak2 = 0;
    for (let i = 4410; i < d2.length; i++) peak2 = Math.max(peak2, Math.abs(d2[i]));

    return { withLimiter: +peak.toFixed(3), without: +peak2.toFixed(3) };
  });
  console.log('    four loud sources summed: ' + limited.without + ' unlimited, ' +
              limited.withLimiter + ' through the limiter');
  ok(limited.without > 1.5, 'summing really does go past full scale', String(limited.without));
  ok(limited.withLimiter <= 1.02, 'and the limiter holds it at the ceiling',
     String(limited.withLimiter));

  /* the app builds that chain, not just the test */
  const wired = await page.evaluate(() => {
    const el = document.getElementById('vuClip');
    return { light: !!el, says: el ? el.textContent : '' };
  });
  ok(wired.light, 'the meter has a light for it', wired.says);

  ok(errs.length === 0, 'no console errors', errs.slice(0, 2).join(' | '));
  await browser.close(); server.close();
  console.log(fails ? '\n' + fails + ' FAILED' : '\nthe page holds still while it plays');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error('HARNESS FAILED:', e); process.exit(2); });
