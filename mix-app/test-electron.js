/* The sample library, inside the real Electron runtime.

   Every other test runs the page in Chrome over http. The app is Electron and
   loads from file://, which is a different storage origin — and the failure
   this exists to catch WAS storage: a library with seven sample ids and two
   stored WAVs, and nothing anywhere saying that five of them had nothing
   behind them.

   So this runs the actual page, in the actual runtime, against its actual
   origin, in an offscreen window. Run it with:

     node_modules\.bin\electron test-electron.js

   It uses a scratch user-data directory, so a real project is never touched.  */
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

const PAGE = path.join(__dirname, '..', 'v2', 'mix-builder.html');
const udd = fs.mkdtempSync(path.join(os.tmpdir(), 'mixel-'));
app.setPath('userData', udd);

/* Never the real library.

   A sample called "Sir Duke horns" — a fixture from sample-test.js, saved with
   no audio on purpose — turned up in Martin's own library and was mistaken for
   a sample he had cut. Whatever the route, a test must not be able to reach the
   app's own storage, so this refuses to run if it ever resolves there. */
if (app.getPath('userData').indexOf('mixel-') < 0) {
  console.error('REFUSING TO RUN: userData is ' + app.getPath('userData') +
                ', which is not a scratch directory.');
  process.exit(2);
}

/* A window is still a window even when nobody is looking at it, and a session
   with no desktop cannot show one. Offscreen rendering needs neither. */
app.disableHardwareAcceleration();

let fails = 0;
const ok = (c, m, x) => {
  console.log((c ? '  ok   ' : '  FAIL ') + m + (x ? '   — ' + x : ''));
  if (!c) fails++;
};

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    show: false, width: 1400, height: 1000,
    webPreferences: { offscreen: true, contextIsolation: true, sandbox: false }
  });

  const errs = [];
  win.webContents.on('console-message', (e, level, message) => {
    /* Electron's own development warning about CSP says, in its own text, that
       it does not appear once the app is packaged. It is not the app talking. */
    if (level >= 2 && !/Electron Security Warning/.test(message)) errs.push(message);
  });

  await win.loadFile(PAGE);
  await new Promise(r => setTimeout(r, 2500));

  const run = js => win.webContents.executeJavaScript(js, true);

  console.log('\nrunning inside Electron ' + process.versions.electron +
              ', origin ' + (await run('location.origin')) + '\n');

  ok(await run('!!window.MixProject && !!window.MixDSP && !!window.MixPreview && !!window.MixRender'),
     'every module loads under file://');

  /* ---- the thing that actually broke: storing a sample's audio ---- */
  const saved = await run(`(async () => {
    const sr = 48000, n = sr * 3;
    const ab = new OfflineAudioContext(1, n, sr).createBuffer(1, n, sr);
    const d = ab.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = 0.4 * Math.sin(2 * Math.PI * 2000 * i / sr);
    const wav = window.MixDSP.encodeWav(ab);
    let err = null, rec = null;
    try { rec = await window.MixProject.saveSample(
      { id: 'smp_el', name: 'Electron probe', bars: 2, sourceBpm: 120, durationSec: 3 }, wav);
    } catch (e) { err = e.message || String(e); }
    const back = await window.MixProject.getSampleAudio('smp_el');
    const keys = await window.MixProject.keys('sampleAudio');
    return { err, id: rec && rec.id, wavBytes: wav.size || wav.byteLength || 0,
             storedBytes: back ? (back.size || back.byteLength || 0) : 0,
             keys: (keys || []).length };
  })()`);
  ok(!saved.err, 'a sample saves without error', saved.err || (saved.wavBytes + ' bytes written'));
  ok(saved.storedBytes > 1000, 'and its AUDIO is really in the store under file://',
     saved.storedBytes + ' bytes read back, ' + saved.keys + ' in the store');

  /* ---- it must survive the window being closed and reopened ---- */
  const win2 = new BrowserWindow({
    show: false, width: 1400, height: 1000,
    webPreferences: { offscreen: true, contextIsolation: true, sandbox: false }
  });
  await win2.loadFile(PAGE);
  await new Promise(r => setTimeout(r, 2000));
  const survived = await win2.webContents.executeJavaScript(`(async () => {
    const b = await window.MixProject.getSampleAudio('smp_el');
    const list = await window.MixProject.listSamples();
    return { bytes: b ? (b.size || b.byteLength || 0) : 0,
             listed: list.some(s => s.id === 'smp_el') };
  })()`, true);
  ok(survived.bytes > 1000, 'it is still there after the app is closed and reopened',
     survived.bytes + ' bytes');
  ok(survived.listed, 'and it is still listed');

  /* ---- it decodes to audio, not to rubbish ---- */
  const decoded = await win2.webContents.executeJavaScript(`(async () => {
    const blob = await window.MixProject.getSampleAudio('smp_el');
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const buf = await ctx.decodeAudioData(await blob.arrayBuffer());
    const d = buf.getChannelData(0);
    let sum = 0, pk = 0;
    for (let i = 0; i < d.length; i++) { sum += d[i] * d[i]; const a = Math.abs(d[i]); if (a > pk) pk = a; }
    return { dur: +buf.duration.toFixed(2), rms: +Math.sqrt(sum / d.length).toFixed(4), peak: +pk.toFixed(3) };
  })()`, true);
  ok(decoded.dur > 2.5 && decoded.rms > 0.05,
     'the stored audio decodes back to the sound that went in',
     decoded.dur + 's, rms ' + decoded.rms + ', peak ' + decoded.peak);

  /* ---- a half-saved sample must refuse, here too ---- */
  const half = await win2.webContents.executeJavaScript(`(async () => {
    let threw = null;
    try { await window.MixProject.saveSample({ name: 'Half a sample' }, function () {}); }
    catch (e) { threw = e.message || String(e); }
    const list = await window.MixProject.listSamples();
    return { threw, listed: list.some(s => s.name === 'Half a sample') };
  })()`, true);
  ok(!!half.threw, 'a sample whose audio will not store reports it', half.threw || 'said nothing');
  ok(half.listed === false, 'and is not left listed with nothing behind it');

  /* ---- and a placement with no audio is flagged, not skipped quietly ---- */
  const flagged = await win2.webContents.executeJavaScript(`(async () => {
    const MP = window.MixProject;
    const rows = MP.parseRunningOrder(
      '#\\tTrack\\tArtist\\tBPM\\tSection\\tMix\\tNote\\n' +
      '1\\tOne\\tA\\t120\\tW\\t\\t\\n2\\tTwo\\tB\\t120\\tW\\t\\t');
    const proj = MP.seedProject(rows, [], null);
    proj.tracks.forEach(t => { t.durationSec = 200; t.entrySec = 0; t.exitSec = 190;
                               t.linked = true; t.bpm = 120; t.downbeatSec = 0; });
    proj.placements = [{ sampleId: 'smp_missing', atJunction: 0, barsBeforeEntry: 4,
                         mode: 'over', gainDb: -8 }];
    await MP.saveSample({ id: 'smp_missing', name: 'Nothing behind it', bars: 2,
                          sourceBpm: 120, durationSec: 3 }, null);
    await MP.saveProject(proj);
    return true;
  })()`, true);
  ok(flagged === true, 'a project with a silent placement can be set up');

  const win3 = new BrowserWindow({
    show: false, width: 1400, height: 1000,
    webPreferences: { offscreen: true, contextIsolation: true, sandbox: false }
  });
  await win3.loadFile(PAGE);
  await new Promise(r => setTimeout(r, 3000));
  const warn = await win3.webContents.executeJavaScript(`(async () => {
    return { rows: document.querySelectorAll('.bench-item.no-audio').length,
             clips: document.querySelectorAll('#timeline .clip.sample.no-audio').length,
             labels: [...document.querySelectorAll('#timeline .clip.sample')].map(e => e.title) };
  })()`, true);
  ok(warn.rows >= 1, 'the library row warns that it has no audio', warn.rows + ' flagged');
  ok(warn.clips >= 1, 'and the clip on the timeline is marked silent',
     warn.clips + ' marked: ' + warn.labels.join(' | '));

  /* ---- one good sample and one broken one, which is the real case ----

     Both of Martin's placements pointed at the same junction: one sample with
     audio and one without. A warning that lands on both is worth nothing, and
     the timeline is drawn at startup before the library has been read, so
     until it is drawn again everything looks silent. */
  const mixed = await win3.webContents.executeJavaScript(`(async () => {
    const MP = window.MixProject, sr = 48000, n = sr * 2;
    const ab = new OfflineAudioContext(1, n, sr).createBuffer(1, n, sr);
    const d = ab.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = 0.4 * Math.sin(2 * Math.PI * 1000 * i / sr);
    await MP.saveSample({ id: 'smp_good', name: 'Has audio', bars: 2, sourceBpm: 120,
                          durationSec: 2 }, window.MixDSP.encodeWav(ab));
    const proj = await MP.loadProject();
    proj.placements = [
      { sampleId: 'smp_good', atJunction: 0, barsBeforeEntry: 8, mode: 'over', gainDb: -4 },
      { sampleId: 'smp_missing', atJunction: 0, barsBeforeEntry: 3, mode: 'over', gainDb: 3 }
    ];
    await MP.saveProject(proj);
    return true;
  })()`, true);
  ok(mixed === true, 'a project with one good sample and one broken one is set up');

  const win4 = new BrowserWindow({
    show: false, width: 1400, height: 1000,
    webPreferences: { offscreen: true, contextIsolation: true, sandbox: false }
  });
  await win4.loadFile(PAGE);
  await new Promise(r => setTimeout(r, 3500));
  const marks = await win4.webContents.executeJavaScript(`(() => {
    const clips = [...document.querySelectorAll('#timeline .clip.sample')];
    return clips.map(c => ({ title: c.title, silent: c.classList.contains('no-audio') }));
  })()`, true);
  console.log('    clips: ' + JSON.stringify(marks));
  const bad = marks.filter(m => m.silent), good = marks.filter(m => !m.silent);
  ok(marks.length === 2, 'both placements are drawn', marks.length + ' clips');
  ok(bad.length === 1 && /no audio/.test(bad[0].title),
     'exactly the broken one is marked silent', bad.map(m => m.title).join(','));
  ok(good.length === 1 && !/no audio/.test(good[0].title),
     'and the good one is left alone', good.map(m => m.title).join(','));

  ok(errs.length === 0, 'no errors in the real runtime', errs.slice(0, 3).join(' | '));

  console.log(fails ? '\n' + fails + ' FAILED in Electron' : '\nthe sample library works in the real runtime');
  app.exit(fails ? 1 : 0);
}).catch(e => { console.error('HARNESS FAILED:', e); app.exit(2); });
