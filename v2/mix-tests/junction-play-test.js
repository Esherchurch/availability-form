/* Hearing a junction without bouncing the whole set.

   The junctions that most need hearing are the ones with no tempo match, and
   those were exactly the ones you could not hear: renderable required a common
   tempo, so Render was disabled, so Play stayed greyed out, and a full render
   to a WAV was the only way to find out what a junction sounded like. */
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
  await new Promise(r => server.listen(8782, r));
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
  await page.goto('http://localhost:8782/mix-builder.html', { waitUntil: 'networkidle0' });

  /* Drop the audio into an empty project so the tracks are made from the files
     themselves. Seeding a running order first and matching by name is a
     different feature with its own failure modes, and it is not the one under
     test here. */
  const input = await page.$('#file');
  await input.uploadFile(path.join(MUSIC, A), path.join(MUSIC, B));
  await page.waitForFunction(async () => {
    const p = await window.MixProject.loadProject();
    return p && (p.tracks || []).length >= 2 && p.tracks.every(t => t.linked && t.sourceBpm);
  }, { timeout: 240000 });

  // make the junction a bridge, and let the page pick that up
  await page.evaluate(async () => {
    const MP = window.MixProject;
    const p = await MP.loadProject();
    p.junctions[0] = { type: 'throw-bridge', beatBeats: 32, drumPattern: 'four',
                       preBeats: 8, carryMode: 'auto' };
    await MP.saveProject(p);
    location.reload();
  });
  await page.waitForFunction(() => document.querySelectorAll('.trk').length >= 2, { timeout: 60000 });

  /* Reloading drops the decoded audio, which is the point of the re-link step —
     put it back the same way. */
  const input2 = await page.$('#file');
  await input2.uploadFile(path.join(MUSIC, A), path.join(MUSIC, B));
  await page.waitForFunction(async () => {
    const p = await window.MixProject.loadProject();
    return p && (p.tracks || []).every(t => t.linked);
  }, { timeout: 240000 });
  await new Promise(r => setTimeout(r, 1500));

  // the tempos really are too far apart to blend
  const gap = await page.evaluate(async () => {
    const MP = window.MixProject;
    const p = await MP.loadProject();
    const lay = MP.layout(p);
    const j = lay.junctions[0];
    return { reachable: j.reachable, renderable: j.renderable,
             apartPct: j.apartPct ? +j.apartPct.toFixed(1) : null };
  });
  console.log('    junction: ' + JSON.stringify(gap));
  ok(gap.reachable === false, 'this junction genuinely has no common tempo',
     gap.apartPct + '% apart');
  ok(gap.renderable === true, 'and it is still renderable, because the drums carry it');

  // open it the way a person does
  await page.evaluate(() => {
    const b = document.querySelector('.jrow-btn') || document.querySelector('[data-act="open-jrow"]');
    if (b) b.click();
  });
  await page.waitForSelector('[data-act="render-junction"]', { timeout: 20000 });

  const btns = await page.evaluate(() => ({
    render: document.querySelector('[data-act="render-junction"]').disabled,
    play: document.querySelector('[data-act="play-junction"]').disabled
  }));
  if (btns.render) {
    const why = await page.evaluate(async () => {
      const p = await window.MixProject.loadProject();
      return p.tracks.map(t => ({ title: t.title, file: t.file, linked: t.linked,
                                  dur: t.durationSec, bpm: t.sourceBpm }));
    });
    console.log('    tracks: ' + JSON.stringify(why, null, 1));
  }
  ok(btns.render === false, 'the Render button is live on it', 'disabled=' + btns.render);

  // instrument playback
  await page.evaluate(() => {
    window.__nodes = [];
    const proto = (window.AudioContext || window.webkitAudioContext).prototype;
    const orig = proto.createBufferSource;
    proto.createBufferSource = function () {
      const n = orig.call(this);
      const rec = { started: false, sec: 0 };
      window.__nodes.push(rec);
      const s = n.start.bind(n);
      n.start = function (...a) { rec.started = true; rec.sec = n.buffer ? n.buffer.duration : 0; return s(...a); };
      return n;
    };
  });

  const t0 = Date.now();
  await page.click('[data-act="render-junction"]');
  await page.waitForFunction(
    () => !document.querySelector('[data-act="play-junction"]').disabled,
    { timeout: 180000 }).catch(() => {});
  const renderSec = (Date.now() - t0) / 1000;

  const afterRender = await page.evaluate(() => ({
    play: document.querySelector('[data-act="play-junction"]').disabled,
    status: (document.getElementById('jxStatus') || {}).textContent || ''
  }));
  console.log('    rendered in ' + renderSec.toFixed(1) + 's — ' + afterRender.status);
  ok(afterRender.play === false, 'and Play goes live once it has rendered');
  ok(renderSec < 120, 'without waiting for the whole set', renderSec.toFixed(1) + 's');

  await page.click('[data-act="play-junction"]');
  await new Promise(r => setTimeout(r, 800));
  const played = await page.evaluate(() => window.__nodes.filter(n => n.started));
  ok(played.length > 0, 'pressing Play plays the junction',
     played.length ? played[played.length - 1].sec.toFixed(1) + 's of audio' : 'nothing');
  if (played.length) {
    ok(played[played.length - 1].sec > 10,
       'and it is the junction in context, not a fragment',
       played[played.length - 1].sec.toFixed(1) + 's');
  }

  ok(errs.length === 0, 'no console errors', errs.slice(0, 2).join(' | '));
  await browser.close(); server.close();
  console.log(fails ? '\n' + fails + ' FAILED' : '\na junction with no tempo match can be heard in place');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error('HARNESS FAILED:', e); process.exit(2); });
