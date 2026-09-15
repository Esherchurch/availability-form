/* Cutting a sample: snapping, stopping, and keeping the zoom.

   Three faults reported together.

   1. Snapping "did not work". It worked, on whole BARS — two seconds at 120
      BPM. Zoomed in far enough to cut a stab you are looking at a few seconds
      of audio, so both ends of a short drag snapped to the same bar line and
      the selection collapsed to nothing.

   2. An audition could not be stopped. The Stop in the cut panel was drawn
      disabled whenever the panel was rebuilt while something was playing.

   3. Double-click zoomed the waveform back out. That gesture already means
      "play from here", so the zoom-reset I bound to it fought the audition and
      threw the view away at the same time. */
const http = require('http'), fs = require('fs'), path = require('path'), os = require('os');
const puppeteer = require('puppeteer-core');
const ROOT = path.join(__dirname, '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.wav': 'audio/wav' };
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
const ok = (c, m, x) => { console.log((c ? '  ok   ' : '  FAIL ') + m + (x ? '   — ' + x : '')); if (!c) fails++; };

function wav(file, secs, bpm) {
  const SR = 44100, n = Math.round(SR * secs), beat = SR * 60 / bpm;
  const d = new Float64Array(n);
  for (let k = 0; k * beat < n; k++) {
    const at = Math.round(k * beat);
    for (let i = 0; i < SR * 0.1 && at + i < n; i++) {
      const t = i / SR;
      d[at + i] += Math.sin(2 * Math.PI * (55 + 90 * Math.exp(-t / 0.02)) * t) * Math.exp(-t / 0.05) * 0.8;
    }
  }
  for (let i = 0; i < n; i++) d[i] += 0.2 * Math.sin(2 * Math.PI * 440 * i / SR);
  const buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22); buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 2, 28);
  buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) {
    buf.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(d[i] * 32767))), 44 + i * 2);
  }
  fs.writeFileSync(file, buf);
  return file;
}

(async () => {
  await new Promise(r => server.listen(8866, r));
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new', protocolTimeout: 600000,
    args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required', '--window-size=1500,1000']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1500, height: 1000 });
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  await page.goto('http://localhost:8866/mix-builder.html', { waitUntil: 'networkidle0' });

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mixcut-'));
  const f = wav(path.join(tmp, 'One.wav'), 120, 120);
  await (await page.$('#file')).uploadFile(f);
  await page.waitForFunction(() => document.querySelectorAll('#timeline .clip.song').length >= 1 &&
                                   !document.querySelector('#timeline .clip.song.unlinked'),
                             { timeout: 240000 });
  await page.evaluate(() => { const h = document.querySelector('.trk-head'); if (h) h.click(); });
  await page.waitForSelector('canvas.wave', { timeout: 30000 });

  /* zoom in, then drag a short selection — under a bar long */
  const sel = await page.evaluate(async () => {
    const cv = document.querySelector('canvas.wave');
    cv.scrollIntoView({ block: 'center' });
    const r0 = cv.getBoundingClientRect();
    const x = Math.round(r0.left + r0.width / 2), y = Math.round(r0.top + r0.height / 2);
    for (let i = 0; i < 8; i++) {
      cv.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true,
                                                 deltaY: -120, clientX: x, clientY: y }));
      await new Promise(z => setTimeout(z, 15));
    }
    const r = cv.getBoundingClientRect();
    const a = Math.round(r.left + r.width * 0.40), b = Math.round(r.left + r.width * 0.52);
    cv.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: a, clientY: y }));
    window.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: b, clientY: y }));
    window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: b, clientY: y }));
    await new Promise(z => setTimeout(z, 300));
    const el = document.querySelector('.samplecut-range');
    return { text: el ? el.textContent.trim() : null };
  });
  const lenOf = s => s ? parseFloat(s) : null;
  console.log('    zoomed, unsnapped drag: ' + sel.text);
  ok(lenOf(sel.text) > 0.05 && lenOf(sel.text) < 2,
     'a short drag while zoomed is a short selection', sel.text);

  /* now snap to the beat: it must round, and must not collapse */
  const snapped = await page.evaluate(async () => {
    const s = document.querySelector('[data-act="snap-sel"]');
    if (!s) return { err: 'no snap control' };
    const modes = [...s.options].map(o => o.value);
    s.value = 'beat';
    s.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise(z => setTimeout(z, 400));
    const el = document.querySelector('.samplecut-range');
    return { modes: modes, text: el ? el.textContent.trim() : null };
  });
  if (snapped.err) ok(false, snapped.err);
  else {
    console.log('    snapped to the beat  : ' + snapped.text);
    ok(snapped.modes.join(',') === 'off,beat,bar',
       'snapping offers the beat as well as the bar', snapped.modes.join(','));
    const beats = /([\d.]+) beats/.exec(snapped.text || '');
    const len = lenOf(snapped.text);
    ok(len > 0.05, 'and a snapped selection is not empty', snapped.text);
    ok(beats ? Math.abs(parseFloat(beats[1]) - Math.round(parseFloat(beats[1]))) < 0.02
             : Math.abs(len / 0.5 - Math.round(len / 0.5)) < 0.05,
       'it lands on whole beats', snapped.text);
  }

  /* the Stop is always pressable */
  const stopping = await page.evaluate(async () => {
    const play = document.querySelector('[data-act="play-sel"]');
    const stop = document.querySelector('[data-act="stop-all"]');
    if (!play || !stop) return { err: 'no play or stop in the cut panel' };
    const disabledBefore = stop.disabled;
    play.click();
    await new Promise(z => setTimeout(z, 500));
    const disabledWhilePlaying = stop.disabled;
    stop.click();
    await new Promise(z => setTimeout(z, 300));
    return { disabledBefore, disabledWhilePlaying,
             said: (document.getElementById('status') || {}).textContent.slice(0, 40) };
  });
  if (stopping.err) ok(false, stopping.err);
  else {
    ok(stopping.disabledWhilePlaying === false, 'Stop is pressable while it plays');
    ok(stopping.disabledBefore === false, 'and does not need something playing first to exist');
    ok(/Stopped/.test(stopping.said), 'and pressing it stops', stopping.said);
  }

  /* double-click plays from a point and does NOT throw the zoom away */
  const kept = await page.evaluate(async () => {
    const cv = document.querySelector('canvas.wave');
    const r = cv.getBoundingClientRect();
    const before = window.__waveSpanForTest ? window.__waveSpanForTest(0) : null;
    cv.dispatchEvent(new MouseEvent('dblclick', { bubbles: true,
      clientX: Math.round(r.left + r.width / 2), clientY: Math.round(r.top + r.height / 2) }));
    await new Promise(z => setTimeout(z, 400));
    const after = window.__waveSpanForTest ? window.__waveSpanForTest(0) : null;
    document.querySelector('[data-act="stop-all"]').click();
    return { before, after };
  });
  ok(kept.before != null && kept.after != null &&
     Math.abs(kept.after - kept.before) < 0.5,
     'double-clicking to play keeps the zoom where it was',
     kept.before + 's -> ' + kept.after + 's on screen');

  /* ---- moving along the record while zoomed in ----------------------

     Zooming in is done in order to work on a particular moment, so not being
     able to move along — and a selection sliding off the edge as the view
     closes in — makes the zoom useless. */
  const panned = await page.evaluate(async () => {
    const cv = document.querySelector('canvas.wave');
    const at = () => window.__waveWindowForTest(0);
    const before = at();
    document.querySelector('[data-act="pan-right"]').click();
    await new Promise(z => setTimeout(z, 250));
    const right = at();
    document.querySelector('[data-act="pan-left"]').click();
    document.querySelector('[data-act="pan-left"]').click();
    await new Promise(z => setTimeout(z, 250));
    const left = at();
    return { before, right, left };
  });
  console.log('    window ' + JSON.stringify(panned.before) + ' -> right ' +
              JSON.stringify(panned.right) + ' -> left ' + JSON.stringify(panned.left));
  ok(panned.right.from > panned.before.from + 0.2,
     'the view moves on along the record', panned.before.from + ' -> ' + panned.right.from);
  ok(panned.left.from < panned.right.from - 0.2,
     'and back the other way', panned.right.from + ' -> ' + panned.left.from);
  ok(Math.abs((panned.right.to - panned.right.from) - (panned.before.to - panned.before.from)) < 0.1,
     'without changing how close in it is');

  /* a selection made at the very edge must not be left off screen */
  const stayed = await page.evaluate(async () => {
    const cv = document.querySelector('canvas.wave');
    const r = cv.getBoundingClientRect();
    const y = Math.round(r.top + r.height / 2);
    /* drag right at the left-hand edge, then snap, which can push it further */
    const a2 = Math.round(r.left + 3), b2 = Math.round(r.left + r.width * 0.06);
    cv.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: a2, clientY: y }));
    window.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: b2, clientY: y }));
    window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: b2, clientY: y }));
    await new Promise(z => setTimeout(z, 400));
    const w = window.__waveWindowForTest(0);
    const s = window.__selectionForTest ? window.__selectionForTest() : null;
    return { w, s };
  });
  if (!stayed.s) ok(false, 'no selection to check');
  else {
    console.log('    selection ' + stayed.s.fromSec.toFixed(2) + '-' + stayed.s.toSec.toFixed(2) +
                's, window ' + stayed.w.from + '-' + stayed.w.to + 's');
    ok(stayed.s.fromSec >= stayed.w.from - 0.01 && stayed.s.toSec <= stayed.w.to + 0.01,
       'a selection made at the edge is still on screen afterwards');
  }

  /* and there is a button for going back out */
  const buttons = await page.evaluate(() =>
    ['zoom-in', 'zoom-out', 'zoom-sel', 'zoom-all', 'pan-left', 'pan-right']
      .filter(a => !!document.querySelector('[data-act="' + a + '"]')));
  ok(buttons.length === 6, 'zoom and panning are on buttons, not only the wheel', buttons.join(','));

  ok(errs.length === 0, 'no console errors', errs.slice(0, 2).join(' | '));
  await browser.close(); server.close();
  try { fs.unlinkSync(f); fs.rmdirSync(tmp); } catch (e) {}
  console.log(fails ? '\n' + fails + ' FAILED' : '\nthe cut panel snaps, stops, and keeps its zoom');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error('HARNESS FAILED:', e); process.exit(2); });
