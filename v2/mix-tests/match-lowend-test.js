/* Match low end: thin records are raised to a target, nothing else moves,
   nothing gets louder, and one Undo puts it back.

   mix-app/node_modules/electron/dist/electron.exe v2/mix-tests/match-lowend-test.js */
const { app, BrowserWindow } = require('electron');
const path = require('path');

let fails = 0;
const ok = (c, m, x) => {
  console.log((c ? '  ok   ' : '  FAIL ') + m + (x ? '   — ' + x : ''));
  if (!c) fails++;
};

app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  setTimeout(() => { console.log('  FAIL  timed out'); app.exit(2); }, 240000);
  process.on('unhandledRejection', e => { console.log('  FAIL  page script threw: ' + (e && e.message)); app.exit(1); });
  const w = new BrowserWindow({ show: false, width: 1500, height: 1000, webPreferences: { offscreen: true } });
  const errs = [];
  w.webContents.on('console-message', (e, lvl, msg) => {
    if (lvl >= 2 && !/Security Warning|Content-Security-Policy/.test(msg)) errs.push(msg);
  });
  await w.loadFile(path.join(__dirname, '..', 'mix-builder.html'));
  await new Promise(r => setTimeout(r, 1200));

  const out = await w.webContents.executeJavaScript(`(async () => {
    const MP = window.MixProject, DSP = window.MixDSP;
    if (!window.__matchLowEndForTest) return { missing: true };
    const sr = 48000, secs = 60;
    const TAB = String.fromCharCode(9), NL = String.fromCharCode(10);
    /* low-end readings of +10, +4, +3, -2, -9 (50 Hz against 1 kHz) */
    const lows = [10, 4, 3, -2, -9];
    const names = ['Boomy', 'Full', 'Middle', 'Light', 'Hollow'];
    const rows = MP.parseRunningOrder(
      ['#', 'Track', 'Artist', 'BPM', 'Section', 'Mix', 'Note'].join(TAB) + NL +
      names.map((n2, i) => [String(i + 1), n2, 'X', '116', 'W', '', ''].join(TAB)).join(NL));
    const seeded = MP.seedProject(rows, [], null);
    const p = window.__project();
    p.tracks.length = 0; p.junctions.length = 0; p.placements = [];
    seeded.tracks.forEach(t => {
      t.durationSec = secs; t.entrySec = 0; t.exitSec = secs - 2; t.linked = true;
      t.sourceBpm = 116; t.downbeatSec = 0; t.peaks = new Array(1400).fill(0.3);
      p.tracks.push(t);
    });
    for (let k = 0; k < names.length - 1; k++) p.junctions.push({ type: 'blend', bars: 8, bassCutDb: 20 });
    const ctx = new OfflineAudioContext(2, sr, sr);
    lows.forEach((dB, k) => {
      const A = 0.1 * Math.pow(10, dB / 20), B = 0.1;
      const b = ctx.createBuffer(2, sr * secs, sr);
      for (let c = 0; c < 2; c++) { const d = b.getChannelData(c);
        for (let i = 0; i < d.length; i++) { const t = i / sr;
          d[i] = A * Math.sin(2 * Math.PI * 50 * t) + B * Math.sin(2 * Math.PI * 1000 * t); } }
      window.__buffersForTest().set(p.tracks[k].id, b);
    });
    window.__touchForTest('loaded');
    document.getElementById('normaliseBtn').click();
    await new Promise(r => setTimeout(r, 800));

    const read = () => p.tracks.map(t => {
      const b = window.__buffersForTest().get(t.id);
      return DSP.lowEndDb(DSP.lowEndProfile(DSP.toMono(b), sr, 0, secs - 2), t.subDb || 0);
    });
    const loud = () => p.tracks.map(t => {
      const b = window.__buffersForTest().get(t.id), m = DSP.toMono(b);
      const heard = t.subDb ? DSP.lowShelfArray(m, sr, DSP.SUB_SHELF_HZ, t.subDb) : m;
      return DSP.loudness(heard, sr, 0, secs - 2) + (t.gainDb || 0);
    });
    const res = { before: read(), subsBefore: p.tracks.map(t => t.subDb || 0) };

    /* to the middle: target is the median, +3 */
    const m1 = await window.__matchLowEndForTest('median');
    res.median = m1;
    res.afterMedian = read();
    res.subsMedian = p.tracks.map(t => t.subDb || 0);
    res.loudMedian = loud();
    res.statusMedian = (document.getElementById('status') || {}).textContent || '';

    /* undo: one step back to where it was */
    document.getElementById('undoBtn').click();
    await new Promise(r => setTimeout(r, 400));
    const p2 = window.__project();
    res.subsUndone = p2.tracks.map(t => t.subDb || 0);

    /* to the bassiest: +10, which the hollow one cannot reach */
    const m2 = await window.__matchLowEndForTest('max');
    const p3 = window.__project();
    res.max = m2;
    res.subsMax = p3.tracks.map(t => t.subDb || 0);
    res.statusMax = (document.getElementById('status') || {}).textContent || '';
    res.buttonThere = !!document.getElementById('matchLowBtn') && !!document.getElementById('matchLowTarget');
    return res;
  })()`);

  if (out.missing) { console.log('  FAIL  the match hook is missing'); app.exit(1); return; }
  const f = a => a.map(v => (v > 0 ? '+' : '') + v.toFixed(1)).join('  ');
  console.log('  readings before:        ' + f(out.before));
  console.log('  to the middle (+' + out.median.target.toFixed(1) + '): ' + f(out.afterMedian) + '    subs ' + out.subsMedian.join(' '));
  console.log('  ' + out.statusMedian.slice(0, 200));

  ok(out.buttonThere, 'the button and its target choice are on the page');
  ok(Math.abs(out.median.target - 3) < 0.6, 'the middle of the set is the median reading', out.median.target.toFixed(1));
  ok(out.subsMedian[0] === 0 && out.subsMedian[1] === 0 && out.subsMedian[2] === 0,
     'records at or above the target are left alone', out.subsMedian.slice(0, 3).join(' '));
  ok(out.subsMedian[3] > 0 && out.subsMedian[4] > 0, 'the thin ones are raised', out.subsMedian.slice(3).join(' '));
  /* Light can get there; Hollow cannot even at +12, and is reported short */
  ok(out.afterMedian[3] >= out.median.target - 0.3,
     'a thin record that can reach the target does', f([out.afterMedian[3]]));
  ok(out.subsMedian[4] === 12 && /Hollow \(-?[\d.]+ dB short\)/.test(out.statusMedian),
     'one that cannot is taken to +12 and named as short, not forced', 'Hollow at +' + out.subsMedian[4] + ', ' + f([out.afterMedian[4]]));
  ok(out.afterMedian[3] <= out.median.target + 1.6,
     'without overshooting it by more than a step of the slider', f([out.afterMedian[3]]));
  const lm = out.loudMedian;
  ok(Math.max(...lm) - Math.min(...lm) < 0.6,
     'and every record is still at the same loudness', lm.map(v => v.toFixed(1)).join(' '));
  ok(out.subsUndone.every(v => v === 0), 'one Undo takes every change back', out.subsUndone.join(' '));

  console.log('\n  to the bassiest: subs ' + out.subsMax.join(' '));
  console.log('  ' + out.statusMax.slice(0, 220));
  ok(out.subsMax[4] === 12, 'a record that cannot reach the bassiest stops at +12', 'Hollow at ' + out.subsMax[4]);
  ok(/Hollow/.test(out.statusMax) && /could not get all the way/.test(out.statusMax),
     'and is named as not getting there');
  ok(out.subsMax[0] === 0, 'the bassiest itself is untouched');
  ok(errs.length === 0, 'no console errors', errs.slice(0, 2).join(' | '));
  console.log(fails ? '\n' + fails + ' FAILED' : '\nthin records can be brought up to the rest, and put back');
  app.exit(fails ? 1 : 0);
});
