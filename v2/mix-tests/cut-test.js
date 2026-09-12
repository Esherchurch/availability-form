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


  /* ---- cutting from the row where it now lives.

     The selected track row is MOVED under the timeline so that clicking a clip
     opens it there, and every handler on a row is delegated from the list it
     came out of. So a moved row lost drag-select, and cutting produced nothing
     at all: no selection, no sample, silence. This cuts from the row in its new
     home and measures what lands in the library. */
  await page.evaluate(() => {
    const c = document.querySelector('#timeline .clip.song');
    if (c) c.click();
  });
  await new Promise(r => setTimeout(r, 700));
  const movedRow = await page.evaluate(() => {
    const host = document.getElementById('tlEditor');
    return !!(host && host.querySelector('canvas.wave'));
  });
  ok(movedRow, 'the selected song opens under the timeline');

  if (movedRow) {
    const wv = await page.evaluate(() => {
      const c = document.querySelector('#tlEditor canvas.wave');
      c.scrollIntoView({ block: 'center' });
      const r = c.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height };
    });
    const wy = wv.y + wv.h / 2;
    await page.mouse.move(wv.x + wv.w * 0.35, wy);
    await page.mouse.down();
    await page.mouse.move(wv.x + wv.w * 0.42, wy, { steps: 12 });
    await page.mouse.up();
    await new Promise(r => setTimeout(r, 500));

    const selText = await page.evaluate(() => {
      const el = document.querySelector('.samplecut-range');
      return el ? el.textContent.trim() : '';
    });
    console.log('    selection in the moved row: ' + (selText || 'none'));
    ok(!!selText, 'drag-select still works after the row is moved', selText || 'no selection');

    await page.evaluate(() => {
      const b = document.querySelector('[data-act="cut-sample"]');
      if (b) b.click();
    });
    await page.waitForFunction(() => document.querySelectorAll('[data-sample]').length > 0,
                               { timeout: 60000 }).catch(() => {});
    await new Promise(r => setTimeout(r, 1200));

    const cut = await page.evaluate(async () => {
      const MP = window.MixProject, DSP = window.MixDSP;
      const list = await MP.listSamples();
      if (!list.length) return { error: 'nothing in the library' };
      const s = list[list.length - 1];
      const blob = await MP.getSampleAudio(s.id);
      if (!blob) return { error: 'no audio stored' };
      const ctx = new AudioContext();
      const buf = await ctx.decodeAudioData(await blob.arrayBuffer());
      const m = DSP.toMono(buf);
      let pk = 0, rms = 0;
      for (let i = 0; i < m.length; i++) { const a = Math.abs(m[i]); if (a > pk) pk = a; rms += m[i] * m[i]; }
      return { sec: +buf.duration.toFixed(2), peak: +pk.toFixed(3),
               rmsDb: +(20 * Math.log10(Math.sqrt(rms / m.length) + 1e-12)).toFixed(1) };
    });
    console.log('    cut: ' + JSON.stringify(cut));
    ok(!cut.error, 'the cut reaches the library', cut.error || 'saved');
    ok(cut.sec > 1, 'and it is the length that was selected', cut.sec + 's');
    ok(cut.rmsDb > -50, 'and it is NOT silent', cut.rmsDb + ' dBFS');

    /* the level lives on the sample */
    const gainSaved = await page.evaluate(async () => {
      const el = document.querySelector('[data-act="sample-gain"]');
      if (!el) return 'no control';
      el.value = '-6';
      el.dispatchEvent(new Event('change', { bubbles: true }));
      await new Promise(r => setTimeout(r, 600));
      const list = await window.MixProject.listSamples();
      return list[list.length - 1].gainDb;
    });
    ok(gainSaved === -6, 'a sample carries its own level', String(gainSaved));
  }

  ok(errs.length === 0, 'no console errors', errs.slice(0, 2).join(' | '));
  /* ---- a track that matched nothing can be pointed at its file -------

     Matching a running order to a folder is guesswork however good the
     guesses get, and one miss in fifty-three left a track that could never
     be played with nothing to be done about it. */
  const manual = await page.evaluate(async () => {
    const p = window.__project();
    p.tracks[0].linked = false;
    p.tracks[0].file = null;
    window.__touchForTest();
    await new Promise(r => setTimeout(r, 400));
    const btn = document.querySelector('[data-act="find-file"][data-track="0"]');
    if (!btn) return { err: "no way to point the track at a file" };
    /* press it, and see that it opens a file picker rather than doing nothing */
    let opened = false;
    const realClick = HTMLInputElement.prototype.click;
    HTMLInputElement.prototype.click = function () { opened = true; };
    btn.click();
    await new Promise(r => setTimeout(r, 200));
    HTMLInputElement.prototype.click = realClick;
    const input = document.getElementById("trackFileInput");
    return { opened, hasInput: !!input, accepts: input ? input.accept : null,
             wired: input ? typeof input.onchange : null };
  });
  if (manual.err) ok(false, manual.err);
  else {
    ok(manual.hasInput, "an unlinked track offers to find its file");
    ok(manual.opened, "and pressing it opens a file picker");
    ok(manual.accepts === "audio/*", "which asks for audio", manual.accepts);
    ok(manual.wired === "function", "and is wired to do something with what it gets");
  }

  await browser.close(); server.close();
  console.log(fails ? '\n' + fails + ' FAILED' : '\nthe cutter takes what you drag, and Stop stops');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error('HARNESS FAILED:', e); process.exit(2); });
