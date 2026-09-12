/* The whole journey, in the real app, with real records.

   Everything until now was measured in Chrome over http. The app is Electron
   and loads its page from file://, which is a different storage origin with
   different blob handling — and the failure was in storage. So this drives the
   actual Mix Builder window: cut a sample, RELOAD so nothing is left in
   memory, re-link the audio, place it, and listen at the master.

   It runs against its own user-data directory, so the real project is not
   touched. */
const path = require('path'), fs = require('fs'), os = require('os');
const { spawn } = require('child_process');
/* Electron turns an uncaught require failure into a modal dialog on the
   user's screen. This needs puppeteer-core, which lives with the test
   harnesses rather than here, so say so and stop rather than popping up. */
let pup;
try { pup = require('puppeteer-core'); }
catch (e) {
  console.error('puppeteer-core is not installed for this script. Run it with
' +
                '  NODE_PATH=<folder containing puppeteer-core> node test-app-journey.js');
  process.exit(0);
}

const EXE = 'C:/GitHub/availability-form/mix-app/dist/win-unpacked/Mix Builder.exe';
const MUSIC = 'C:/Users/marti/Music/Amazon Music';
const A = '13 - Despacito (Remix) [feat. Justin Bieber].mp3';
const B = '03 - Here Comes the Hotstepper (Heartical Mix).mp3';

let fails = 0;
const ok = (c, m, x) => { console.log((c ? '  ok   ' : '  FAIL ') + m + (x ? '   — ' + x : '')); if (!c) fails++; };

const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  for (const f of [EXE, path.join(MUSIC, A), path.join(MUSIC, B)]) {
    if (!fs.existsSync(f)) { console.error('missing: ' + f); process.exit(2); }
  }
  const udd = fs.mkdtempSync(path.join(os.tmpdir(), 'mixe2e-'));
  console.log('running the real app against a scratch profile\n');

  /* ELECTRON_RUN_AS_NODE is set in this shell, which makes any Electron binary
     behave as plain Node and exit at once. That is why the app appeared not to
     launch at all. */
  const env = Object.assign({}, process.env);
  delete env.ELECTRON_RUN_AS_NODE;
  /* The app must be pointed away from its own data before it is launched, or
     a test writes into the real library — which is how a fixture sample ended
     up in Martin's. */
  if (!/mixe2e-/.test(udd)) { console.error('REFUSING: not a scratch profile'); process.exit(2); }
  const child = spawn(EXE, ['--remote-debugging-port=9333', '--user-data-dir=' + udd],
                      { stdio: 'ignore', detached: false, env: env });
  let browser = null;
  for (let i = 0; i < 60 && !browser; i++) {
    await sleep(1000);
    try { browser = await pup.connect({ browserURL: 'http://127.0.0.1:9333', defaultViewport: null }); }
    catch (e) {}
  }
  if (!browser) { child.kill(); console.error('could not attach to the app'); process.exit(2); }

  let page = null;
  for (let i = 0; i < 30 && !page; i++) {
    const pages = await browser.pages();
    page = pages.find(pp => /mix-builder\.html/.test(pp.url()));
    if (!page) await sleep(500);
  }
  if (!page) { console.error('no Mix Builder window'); child.kill(); process.exit(2); }
  console.log('attached to ' + page.url().replace(/^.*\//, '') + '\n');

  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });

  const hook = () => {
    const realCreate = window.MixPreview.create;
    window.MixPreview.create = function (o) {
      window.__dest = o.destination; window.__ctx = o.ctx;
      const api = realCreate(o); window.__preview = api; return api;
    };
  };
  await page.evaluate(hook);

  /* ---- 1. load two real records ---- */
  await (await page.$('#file')).uploadFile(path.join(MUSIC, A), path.join(MUSIC, B));
  await page.waitForFunction(() => document.querySelectorAll('#timeline .clip.song').length >= 2 &&
                                   !document.querySelector('#timeline .clip.song.unlinked'),
                             { timeout: 300000 });
  ok(true, 'two records load and analyse in the real app');

  /* ---- 2. cut a sample through the interface ---- */
  await page.evaluate(() => { const h = document.querySelector('.trk-head'); if (h) h.click(); });
  await page.waitForSelector('canvas.wave', { timeout: 30000 });
  const geo = await page.evaluate(() => {
    const cv = document.querySelector('canvas.wave');
    cv.scrollIntoView({ block: 'center' });
    const r = cv.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  });
  await page.mouse.move(geo.x + geo.w * 0.40, geo.y + geo.h / 2);
  await page.mouse.down();
  await page.mouse.move(geo.x + geo.w * 0.437, geo.y + geo.h / 2, { steps: 12 });
  await page.mouse.up();
  await sleep(500);

  const cut = await page.evaluate(async () => {
    const before = (await window.MixProject.listSamples()).length;
    const btn = document.querySelector('[data-act="cut-sample"]');
    if (!btn) return { err: 'no cut button' };
    btn.click();
    for (let k = 0; k < 80; k++) {
      await new Promise(z => setTimeout(z, 300));
      const now = await window.MixProject.listSamples();
      if (now.length > before) return { id: now[now.length - 1].id, name: now[now.length - 1].name };
    }
    return { err: 'no sample appeared', said: (document.getElementById('status') || {}).textContent };
  });
  ok(!cut.err, 'a sample can be cut in the real app', cut.err || cut.name);
  if (cut.err) { console.log('    status said: ' + cut.said); }

  /* ---- 3. is the AUDIO really stored, under file:// ---- */
  const stored = await page.evaluate(async (id) => {
    const ks = await window.MixProject.keys('sampleAudio');
    const blob = await window.MixProject.getSampleAudio(id);
    return { keys: (ks || []).length, has: (ks || []).indexOf(id) >= 0,
             bytes: blob ? (blob.size || blob.byteLength || 0) : 0 };
  }, cut.id);
  ok(stored.has, 'its audio is in the library, not just its name',
     stored.bytes + ' bytes, ' + stored.keys + ' stored in all');

  /* ---- 4. RELOAD — nothing left in memory. This is where it broke ---- */
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!window.MixProject && !!document.querySelector('[data-act="sample-place"]'),
                             { timeout: 60000 });
  await page.evaluate(hook);
  const survived = await page.evaluate(async (id) => {
    const blob = await window.MixProject.getSampleAudio(id);
    return blob ? (blob.size || blob.byteLength || 0) : 0;
  }, cut.id);
  ok(survived > 1000, 'and it is still there after the app is reopened',
     survived + ' bytes');

  /* re-link the audio the way a person does */
  await (await page.$('#file')).uploadFile(path.join(MUSIC, A), path.join(MUSIC, B));
  await page.waitForFunction(() => document.querySelectorAll('#timeline .clip.song').length >= 2 &&
                                   !document.querySelector('#timeline .clip.song.unlinked'),
                             { timeout: 300000 });
  ok(true, 'the records re-link after reopening');

  /* ---- 5. no false warning on a good sample ---- */
  const warned = await page.evaluate(() => ({
    rows: document.querySelectorAll('.bench-item.no-audio').length,
    clips: document.querySelectorAll('#timeline .clip.sample.no-audio').length
  }));
  ok(warned.rows === 0, 'a sample that IS stored carries no warning', warned.rows + ' flagged');

  /* ---- 6. place it over the music and hear it ---- */
  const placed = await page.evaluate(async (id) => {
    document.querySelector('[data-act="sample-place"][data-sample="' + id + '"]').click();
    await new Promise(r => setTimeout(r, 900));
    const bars = document.getElementById('placeBars');
    if (bars) { bars.value = '2'; bars.dispatchEvent(new Event('change', { bubbles: true })); }
    const g = document.getElementById('placeGain');
    if (g) { g.value = '0'; g.dispatchEvent(new Event('change', { bubbles: true })); }
    document.querySelector('[data-act="do-place"]').click();
    await new Promise(r => setTimeout(r, 1200));
    return (window.__project().placements || []).length;
  }, cut.id);
  ok(placed === 1, 'it can be placed', placed + ' placement(s)');

  const where = await page.evaluate(async () => {
    await window.__buildPreview();
    const cl = window.__preview.state.clips;
    const s = cl.find(c => c.kind === 'sample');
    if (!s) return { err: 'the transport has no sample clip' };
    const mid = (s.fromSec + s.toSec) / 2;
    const under = cl.filter(c => c.kind === 'track' && c.fromSec <= mid && c.toSec > mid);
    return { from: +s.fromSec.toFixed(1), to: +s.toSec.toFixed(1), gain: +s.gain.toFixed(3),
             hasBuffer: !!s.buffer, under: under.length,
             said: (document.getElementById('status') || {}).textContent.slice(0, 90) };
  });
  if (where.err) ok(false, where.err);
  else {
    ok(where.hasBuffer, 'the transport has its audio', where.from + '-' + where.to + 's');
    ok(!/cannot be played/.test(where.said), 'and nothing reports it as unplayable', where.said);
  }

  /* ---- 7. LISTEN at the master ---- */
  const heard = where.err ? null : await page.evaluate(async (at) => {
    const ctx = window.__ctx, dest = window.__dest;
    try { if (ctx.state !== 'running') await ctx.resume(); } catch (e) {}
    const an = ctx.createAnalyser(); an.fftSize = 2048; an.smoothingTimeConstant = 0;
    dest.connect(an);
    const td = new Float32Array(an.fftSize);
    const rows = [];
    window.__preview.seek(Math.max(0, at - 2));
    window.__preview.play();
    const t0 = performance.now();
    while (performance.now() - t0 < 8000) {
      await new Promise(r => setTimeout(r, 100));
      an.getFloatTimeDomainData(td);
      let s = 0; for (let i = 0; i < td.length; i++) s += td[i] * td[i];
      rows.push({ t: +window.__preview.at().toFixed(2),
                  db: Math.round(20 * Math.log10(Math.sqrt(s / td.length) + 1e-12)),
                  live: window.__preview.state.live.map(l => l.clip.kind).join('+') });
    }
    window.__preview.pause();
    return rows;
  }, where.from);

  if (heard) {
    const withS = heard.filter(r => r.live.indexOf('sample') >= 0);
    const overMusic = withS.filter(r => r.live.indexOf('track') >= 0);
    const lvl = a => a.length ? Math.round(a.reduce((s, r) => s + r.db, 0) / a.length) : null;
    console.log('    frames: ' + heard.length + ', with the sample ' + withS.length +
                ', of those over a record ' + overMusic.length);
    ok(withS.length > 5, 'the sample actually sounds in the timeline',
       withS.length + ' frames at ' + lvl(withS) + ' dB');
    ok(overMusic.length > 5, 'and it sounds OVER the music, not in a gap',
       overMusic.length + ' frames at ' + lvl(overMusic) + ' dB');
    ok(lvl(withS) !== null && lvl(withS) > -40, 'at a level you can hear', lvl(withS) + ' dB');
  }

  /* ---- 8. the right-click controls ---- */
  const menu = await page.evaluate(async () => {
    const el = document.querySelector('#timeline .clip.sample');
    const r = el.getBoundingClientRect();
    el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true,
      clientX: Math.round(r.left + 4), clientY: Math.round(r.top + 4) }));
    await new Promise(z => setTimeout(z, 300));
    const m = document.querySelector('.clipmenu');
    if (!m) return { err: 'no popup on the sample' };
    const fields = [...m.querySelectorAll('[data-cm]')].map(e => e.dataset.cm);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    const d = document.querySelector('#timeline .clip.drums');
    let drumFields = [];
    if (d) {
      const dr = d.getBoundingClientRect();
      d.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true,
        clientX: Math.round(dr.left + 6), clientY: Math.round(dr.top + 6) }));
      await new Promise(z => setTimeout(z, 300));
      const dm = document.querySelector('.clipmenu');
      drumFields = dm ? [...dm.querySelectorAll('[data-cm]')].map(e => e.dataset.cm) : [];
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    }
    return { fields, drumFields };
  });
  if (menu.err) ok(false, menu.err);
  else {
    ok(menu.fields.indexOf('gain') >= 0, 'right-click a sample gives its volume',
       menu.fields.join(','));
    ok(menu.drumFields.indexOf('weight') >= 0 && menu.drumFields.indexOf('reverb') >= 0,
       'right-click the drums gives Weight and reverb', menu.drumFields.join(','));
  }

  ok(errs.length === 0, 'no errors in the real app', errs.slice(0, 3).join(' | '));

  await browser.disconnect();
  try { child.kill(); } catch (e) {}
  console.log(fails ? '\n' + fails + ' FAILED' : '\nthe whole journey works in the real app');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error('HARNESS FAILED:', e); process.exit(2); });
