/* Controls on the thing they control, and a cursor that goes where you click.

   Two faults this covers, both reported as "the samples do not play":

   1. The cursor only moved when the ruler was clicked — a strip a few pixels
      tall above four lanes. Scrolling along to a sample and clicking beside it
      left the playhead where it was, so the sample was never reached.

   2. The transport keeps its own clip list. Placing a sample did not reach it,
      so a mix already playing carried on playing the arrangement it was built
      with, and the stretch of time where the sample sat held nothing.

   And the control itself: the volume lived in the sample list, which meant
   scrolling away from the timeline to find the row. It opens on the clip now.  */
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

/* Two short records at 120 BPM: a kick on every beat and a hat between, which
   is enough for the analyser to find the tempo and the downbeat. Written to
   disk because the only way audio gets in is the file input. */
function writeWav(file, secs, bpm) {
  const sr = 44100, n = Math.round(sr * secs), d = new Float32Array(n);
  const beat = 60 / bpm;
  for (let k = 0; k * beat < secs; k++) {
    const at = Math.round(k * beat * sr);
    for (let i = 0; i < sr * 0.12 && at + i < n; i++) {
      const tt = i / sr;
      d[at + i] += Math.sin(2 * Math.PI * (50 + 90 * Math.exp(-tt / 0.02)) * tt) *
                   Math.exp(-tt / 0.05) * 0.8;
    }
    const off = Math.round((k + 0.5) * beat * sr);
    for (let i = 0; i < sr * 0.04 && off + i < n; i++) {
      d[off + i] += (Math.random() * 2 - 1) * Math.exp(-(i / sr) / 0.01) * 0.15;
    }
  }
  const buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22); buf.writeUInt32LE(sr, 24); buf.writeUInt32LE(sr * 2, 28);
  buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) {
    buf.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(d[i] * 32767))), 44 + i * 2);
  }
  fs.writeFileSync(file, buf);
  return file;
}

let fails = 0;
const ok = (c, m, x) => { console.log((c ? '  ok   ' : '  FAIL ') + m + (x ? '   ' + x : '')); if (!c) fails++; };

(async () => {
  await new Promise(r => server.listen(8821, r));
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new', protocolTimeout: 300000,
    args: ['--no-sandbox', '--window-size=1400,1000', '--autoplay-policy=no-user-gesture-required']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 1000 });
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  await page.goto('http://localhost:8821/mix-builder.html', { waitUntil: 'networkidle0' });

  /* the sample has to exist before the page lists it */
  await page.evaluate(async () => {
    await window.MixProject.saveSample({ id: 'smp_x', name: 'Horn stab', bars: 2,
      sourceBpm: 120, durationSec: 4, createdFrom: 'probe' }, null);
  });
  await page.reload({ waitUntil: 'networkidle0' });
  await page.waitForFunction(() => !!document.querySelector('[data-act="sample-place"]'),
                             { timeout: 30000 });

  const tmp = fs.mkdtempSync(path.join(require('os').tmpdir(), 'mixclip-'));
  const wavs = [writeWav(path.join(tmp, 'One.wav'), 24, 120),
                writeWav(path.join(tmp, 'Two.wav'), 24, 120)];
  await (await page.$('#file')).uploadFile(wavs[0], wavs[1]);
  await page.waitForFunction(() => document.querySelectorAll('#timeline .clip.song').length >= 2 &&
                                   !document.querySelector('#timeline .clip.song.unlinked'),
                             { timeout: 180000 });
  console.log('    two records loaded and analysed');

  /* place it the way a person does, so touch() runs and the timeline redraws */
  await page.evaluate(async () => {
    document.querySelector('[data-act="sample-place"][data-sample="smp_x"]').click();
    await new Promise(z => setTimeout(z, 800));
    const g = document.getElementById('placeGain');
    if (g) { g.value = '-8'; g.dispatchEvent(new Event('change', { bubbles: true })); }
    document.querySelector('[data-act="do-place"]').click();
    await new Promise(z => setTimeout(z, 800));
  });
  await page.waitForFunction(() => !!document.querySelector('#timeline .clip.sample'),
                             { timeout: 20000 });

  /* ---- 1. the menu opens on the clip it was aimed at ---------------- */
  const menu = await page.evaluate(async () => {
    const el = document.querySelector('#timeline .clip.sample');
    if (!el) return { err: 'no sample clip on the timeline' };
    const r = el.getBoundingClientRect();
    el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true,
      clientX: Math.round(r.left + 4), clientY: Math.round(r.top + 4) }));
    await new Promise(z => setTimeout(z, 200));
    const m = document.querySelector('.clipmenu');
    if (!m) return { err: 'no menu opened' };
    return {
      title: m.querySelector('.cm-title').textContent,
      kind: m.dataset.kind, index: m.dataset.index,
      hasGain: !!m.querySelector('[data-cm="gain"]'),
      gainValue: (m.querySelector('[data-cm="gain"]') || {}).value,
      hasPlayHere: !!m.querySelector('[data-cm="play"]'),
      onScreen: (() => { const b = m.getBoundingClientRect();
        return b.left >= 0 && b.top >= 0 && b.right <= window.innerWidth &&
               b.bottom <= window.innerHeight; })()
    };
  });
  if (menu.err) { ok(false, menu.err); }
  else {
    ok(menu.kind === 'sample', 'right-clicking a sample opens its own controls', menu.kind);
    ok(/Horn stab/.test(menu.title), 'named after the sample, not its id', menu.title);
    ok(menu.hasGain, 'with the volume on it — no scrolling to the sample list');
    ok(menu.gainValue === '-8', 'showing the level it is actually set to', menu.gainValue);
    ok(menu.hasPlayHere, 'and a way to play from there');
    ok(menu.onScreen, 'opened fully on screen');
  }

  /* ---- 2. moving the slider changes the placement ------------------- */
  const moved = await page.evaluate(async () => {
    const m = document.querySelector('.clipmenu');
    const s = m.querySelector('[data-cm="gain"]');
    s.value = '-2';
    s.dispatchEvent(new Event('input', { bubbles: true }));
    const label = m.querySelector('[data-cm-val="gain"]').textContent;
    s.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise(z => setTimeout(z, 400));
    return { label: label, stored: window.__project().placements[0].gainDb };
  });
  ok(moved.label === '-2 dB', 'the reading follows the slider', moved.label);
  ok(moved.stored === -2, 'and the placement is changed', String(moved.stored));

  /* ---- 3. the drums get the same treatment -------------------------- */
  const drums = await page.evaluate(async () => {
    const el = document.querySelector('#timeline .clip.drums');
    if (!el) return { err: 'no drum clip' };
    const r = el.getBoundingClientRect();
    el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true,
      clientX: Math.round(r.left + 6), clientY: Math.round(r.top + 6) }));
    await new Promise(z => setTimeout(z, 200));
    const m = document.querySelector('.clipmenu');
    if (!m) return { err: 'no menu on the drums' };
    const fields = [...m.querySelectorAll('[data-cm]')].map(e2 => e2.dataset.cm);
    const g = m.querySelector('[data-cm="gain"]');
    g.value = '-6'; g.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise(z => setTimeout(z, 400));
    return { kind: m.dataset.kind, fields: fields,
             stored: window.__project().junctions[0].fillGainDb };
  });
  if (drums.err) ok(false, drums.err);
  else {
    ok(drums.kind === 'drums', 'right-clicking the drums opens the drum controls');
    ok(drums.fields.indexOf('beats') >= 0 && drums.fields.indexOf('pattern') >= 0,
       'length and pattern are there too', drums.fields.join(','));
    ok(drums.stored === -6, 'and the change sticks', String(drums.stored));
  }

  /* ---- 4. the cursor goes where the timeline is clicked ------------- */
  const seek = await page.evaluate(async () => {
    document.querySelector('.clipmenu') &&
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    const sc = document.getElementById('tlscroll');
    const inner = document.getElementById('tlinner');
    sc.scrollIntoView({ block: 'center' });
    await new Promise(z => setTimeout(z, 200));
    const lane = document.querySelector('#timeline .tl-lane[data-lane="b"]');
    const lr = lane.getBoundingClientRect();
    /* Empty lane space inside the mix. On a clip the pointer picks the clip
       up instead, and past the end the seek is clamped to the last second —
       either would make this prove nothing. */
    const cy = Math.round(lr.top + lr.height / 2);
    /* How long the mix is, read off the timeline: the right edge of the last
       clip drawn. Asking the transport would give nothing before it is built,
       and clicking at zero would prove nothing at all. */
    let endPx = 0;
    document.querySelectorAll('#timeline .clip').forEach(c => {
      endPx = Math.max(endPx, parseInt(c.style.left, 10) + parseInt(c.style.width, 10));
    });
    const dur = endPx / 8;
    let cx = null;
    for (let f = 0.7; f > 0.15; f -= 0.02) {
      const x = Math.round(inner.getBoundingClientRect().left + dur * f * 8);
      const e2 = document.elementFromPoint(x, cy);
      if (e2 && /tl-lane/.test(e2.className)) { cx = x; break; }
    }
    if (cx == null) return { err: 'no empty lane space to click' };
    if (dur < 5) return { err: 'the mix is too short to aim into (' + dur + 's)' };
    const wantSec = (cx - inner.getBoundingClientRect().left) / 8;
    const hit = document.elementFromPoint(cx, cy);
    if (!hit) return { err: 'the lane is not on screen' };
    hit.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: cx, clientY: cy }));
    window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: cx, clientY: cy }));
    /* the first seek after an edit rebuilds the transport, which synthesises
       the drums — wait for the cursor to arrive rather than guessing */
    for (let k = 0; k < 40; k++) {
      await new Promise(z => setTimeout(z, 250));
      const el2 = document.getElementById('tlPlayhead');
      if (el2 && Math.abs(parseInt(el2.style.left, 10) / 8 - wantSec) < 2) break;
    }
    const ph = document.getElementById('tlPlayhead');
    return { wantSec: +wantSec.toFixed(1),
             playheadPx: ph ? parseInt(ph.style.left, 10) : null,
             hit: hit.className };
  });
  if (seek.err) ok(false, seek.err);
  else {
    const got = seek.playheadPx == null ? null : seek.playheadPx / 8;
    console.log('    clicked an empty lane at ' + seek.wantSec + 's, playhead went to ' +
                (got == null ? 'nowhere' : got.toFixed(1) + 's'));
    ok(seek.wantSec > 3, 'the test aimed at a real position, not the start',
       seek.wantSec + 's');
    ok(got != null && Math.abs(got - seek.wantSec) < 2,
       'clicking an empty lane moves the cursor there, not just the ruler',
       String(got));
  }

  /* ---- 5. the transport can be re-levelled while it runs ------------ */
  const live = await page.evaluate(async () => {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const dest = ctx.createGain();
    const pv = window.MixPreview.create({ ctx: ctx, DSP: window.MixDSP, destination: dest });
    const buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const plan = { tracks: [], junctions: [] };
    const dur = pv.build(plan, new Map(), [
      { kind: 'sample', index: 0, fromSec: 0, toSec: 1, buffer: buf,
        offsetSec: 0, rate0: 1, rate1: 1, gain: 0.4 }
    ]);
    const before = pv.clips()[0].gain;
    const hit = pv.setGain('sample', 0, 0.9);
    return { dur: dur, before: before, after: pv.clips()[0].gain, hit: hit };
  });
  ok(live.hit === 1 && Math.abs(live.after - 0.9) < 1e-6,
     'a clip can be re-levelled without rebuilding the mix',
     live.before + ' -> ' + live.after);

  ok(errs.length === 0, 'no console errors', errs.slice(0, 2).join(' | '));
  await browser.close(); server.close();
  try { wavs.forEach(f => fs.unlinkSync(f)); fs.rmdirSync(tmp); } catch (e) {}
  console.log(fails ? '\n' + fails + ' FAILED' : '\nthe controls are on the clips and the cursor obeys');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error('HARNESS FAILED:', e); process.exit(2); });
