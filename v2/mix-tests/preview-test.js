/* Playing the mix without rendering it.

   The mix already exists as scheduled audio — the plan says where every track
   starts, what part of it plays and what tempo it needs, and the drums between
   two records are a few hundred milliseconds of synthesis. Rendering first, and
   then playing a file, was never necessary to put a cursor somewhere and press
   play; it only stopped you doing it. */
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
  await new Promise(r => server.listen(8784, r));
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
  await page.goto('http://localhost:8784/mix-builder.html', { waitUntil: 'networkidle0' });

  const input = await page.$('#file');
  await input.uploadFile(path.join(MUSIC, A), path.join(MUSIC, B));
  await page.waitForFunction(async () => {
    const p = await window.MixProject.loadProject();
    return p && (p.tracks || []).length >= 2 && p.tracks.every(t => t.linked && t.sourceBpm);
  }, { timeout: 240000 });

  await page.evaluate(async () => {
    const MP = window.MixProject;
    const p = await MP.loadProject();
    p.junctions[0] = { type: 'throw-bridge', beatBeats: 32, drumPattern: 'four',
                       preBeats: 8, carryMode: 'auto' };
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

  // count how many sources are running, to prove real scheduling
  await page.evaluate(() => {
    window.__live = 0; window.__everStarted = 0;
    const proto = (window.AudioContext || window.webkitAudioContext).prototype;
    const orig = proto.createBufferSource;
    proto.createBufferSource = function () {
      const n = orig.call(this);
      const s = n.start.bind(n), st = n.stop.bind(n);
      let counted = false;
      n.start = function (...a) { window.__live++; window.__everStarted++; counted = true; return s(...a); };
      n.stop = function (...a) { if (counted) { window.__live--; counted = false; } return st(...a); };
      n.addEventListener('ended', () => { if (counted) { window.__live--; counted = false; } });
      return n;
    };
  });

  ok(await page.evaluate(() => !!document.getElementById('previewBtn')),
     'there is a transport that plays the mix');

  // press play — no render first
  const t0 = Date.now();
  await page.click('#previewBtn');
  await page.waitForFunction(() => window.__live > 0, { timeout: 120000 }).catch(() => {});
  const startedIn = (Date.now() - t0) / 1000;
  await new Promise(r => setTimeout(r, 900));

  const playing = await page.evaluate(() => ({
    live: window.__live,
    pos: (document.getElementById('mixPos') || {}).textContent,
    label: (document.getElementById('previewBtn') || {}).textContent
  }));
  console.log('    started in ' + startedIn.toFixed(1) + 's — ' + playing.pos +
              ', ' + playing.live + ' source(s) sounding');
  ok(playing.live > 0, 'it plays without rendering anything', playing.live + ' sources');
  ok(startedIn < 30, 'and starts promptly', startedIn.toFixed(1) + 's');
  ok(/Pause/.test(playing.label), 'the button becomes Pause while it plays', playing.label);

  // pause, and check the cursor stays put
  await page.click('#previewBtn');
  await new Promise(r => setTimeout(r, 500));
  const paused = await page.evaluate(() => ({
    live: window.__live,
    pos: (document.getElementById('mixPos') || {}).textContent,
    label: (document.getElementById('previewBtn') || {}).textContent
  }));
  console.log('    paused at ' + paused.pos);
  ok(paused.live === 0, 'pause stops the audio', paused.live + ' sources left');
  ok(/Play/.test(paused.label), 'and the button goes back to Play', paused.label);

  const wasAt = paused.pos;
  await new Promise(r => setTimeout(r, 700));
  const stillThere = await page.evaluate(() => (document.getElementById('mixPos') || {}).textContent);
  ok(stillThere === wasAt, 'the cursor stays where it was paused', stillThere);

  // move the cursor a long way in and play from there
  await page.evaluate(() => {
    const sc = document.getElementById('mixScrub');
    sc.value = '1200';
    sc.dispatchEvent(new Event('input', { bubbles: true }));
    sc.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await new Promise(r => setTimeout(r, 400));
  const moved = await page.evaluate(() => (document.getElementById('mixPos') || {}).textContent);
  console.log('    cursor moved to ' + moved);
  ok(moved !== wasAt, 'the cursor can be put anywhere', moved);

  await page.click('#previewBtn');
  await page.waitForFunction(() => window.__live > 0, { timeout: 60000 }).catch(() => {});
  // the readout is m:ss, so give it long enough to tick over a whole second
  await new Promise(r => setTimeout(r, 2600));
  const resumed = await page.evaluate(() => ({
    live: window.__live, pos: (document.getElementById('mixPos') || {}).textContent
  }));
  ok(resumed.live > 0, 'and it plays from there', resumed.pos);
  ok(resumed.pos !== moved, 'the playhead advances', moved + ' → ' + resumed.pos);

  await page.click('#previewStopBtn');
  await new Promise(r => setTimeout(r, 400));
  const stopped = await page.evaluate(() => ({
    live: window.__live, pos: (document.getElementById('mixPos') || {}).textContent
  }));
  ok(stopped.live === 0, 'Stop stops it', stopped.live + ' sources left');
  ok(/^0:00/.test(stopped.pos), 'and returns the cursor to the start', stopped.pos);


  /* ---- the timeline itself: click to put the cursor, drag the ruler to
     mark a section. Ported from Videoeditor.html, which has worked this way
     from the start. */
  const tl = await page.evaluate(() => {
    const inner = document.querySelector("#timeline .tl-inner");
    if (!inner) return null;
    inner.scrollIntoView({ block: "center" });
    const r = inner.getBoundingClientRect();
    const ru = document.querySelector("#timeline .tl-ruler");
    const rr = ru ? ru.getBoundingClientRect() : null;
    return { x: r.x, y: r.y, w: r.width, h: r.height,
             ruler: rr ? { x: rr.x, y: rr.y, w: rr.width, h: rr.height } : null };
  });
  ok(!!tl, "the timeline is on screen");
  if (tl) {
    // the ruler is what seeks, exactly as in the editor: clicking a clip
    // in the body selects it there and opens a track here
    await page.mouse.click(tl.ruler.x + tl.ruler.w * 0.62, tl.ruler.y + tl.ruler.h / 2);
    await new Promise(r => setTimeout(r, 900));
    const clicked = await page.evaluate(() => ({
      pos: (document.getElementById("mixPos") || {}).textContent,
      ph: (document.getElementById("tlPlayhead") || {}).style.left
    }));
    console.log("    clicked the ruler at 62% — " + clicked.pos + ", playhead at " + clicked.ph);
    ok(!/^0:00/.test(clicked.pos), "clicking the timeline moves the cursor", clicked.pos);
    ok(parseFloat(clicked.ph) > 40, "and the playhead moves with it", clicked.ph);

    if (tl.ruler) {
      await page.mouse.move(tl.ruler.x + tl.ruler.w * 0.20, tl.ruler.y + tl.ruler.h / 2);
      await page.mouse.down();
      await page.mouse.move(tl.ruler.x + tl.ruler.w * 0.40, tl.ruler.y + tl.ruler.h / 2, { steps: 12 });
      await page.mouse.up();
      await new Promise(r => setTimeout(r, 400));
      const marked = await page.evaluate(() => ({
        range: (document.getElementById("tlRange") || {}).style.display,
        width: (document.getElementById("tlRange") || {}).style.width,
        status: (document.getElementById("status") || {}).textContent
      }));
      console.log("    " + marked.status);
      ok(marked.range === "block", "dragging the ruler marks a section", marked.width);
    }
  }
  ok(errs.length === 0, 'no console errors', errs.slice(0, 2).join(' | '));
  await browser.close(); server.close();
  console.log(fails ? '\n' + fails + ' FAILED' : '\nthe mix plays from anywhere, with no render');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error('HARNESS FAILED:', e); process.exit(2); });
