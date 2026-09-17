/* The song panel has the record's Volume and Sub bass.

   "There is no bass slider under the tracks." There was one, in the
   right-click menu; the panel that opens under a song — the place anyone
   looks for a record's settings — had none. This opens that panel the way a
   user does, by clicking the song, and drives the sliders there.

   mix-app/node_modules/electron/dist/electron.exe v2/mix-tests/panel-tone-test.js */
const { app, BrowserWindow } = require('electron');
const path = require('path');

let fails = 0;
const ok = (c, m, x) => {
  console.log((c ? '  ok   ' : '  FAIL ') + m + (x ? '   — ' + x : ''));
  if (!c) fails++;
};

app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  setTimeout(() => { console.log('  FAIL  timed out'); app.exit(2); }, 180000);
  process.on('unhandledRejection', e => { console.log('  FAIL  page script threw: ' + (e && e.message)); app.exit(1); });
  const w = new BrowserWindow({ show: false, width: 1500, height: 1000, webPreferences: { offscreen: true } });
  const errs = [];
  w.webContents.on('console-message', (e, lvl, msg) => {
    if (/^STEP/.test(msg)) console.log('  ' + msg);
    if (lvl >= 2 && !/Security Warning|Content-Security-Policy/.test(msg)) errs.push(msg);
  });
  console.log('  STEP loading page');
  await w.loadFile(path.join(__dirname, '..', 'mix-builder.html'));
  console.log('  STEP page loaded');
  await new Promise(r => setTimeout(r, 1200));

  const out = await w.webContents.executeJavaScript(`(async () => {
    const MP = window.MixProject, DSP = window.MixDSP;
    const sr = 48000;
    const TAB = String.fromCharCode(9), NL = String.fromCharCode(10);
    const rows = MP.parseRunningOrder(
      ['#', 'Track', 'Artist', 'BPM', 'Section', 'Mix', 'Note'].join(TAB) + NL +
      ['1', 'Modern', 'A', '115', 'W', '', ''].join(TAB) + NL +
      ['2', 'Happy Birthday', 'B', '117', 'W', '', ''].join(TAB));
    const seeded = MP.seedProject(rows, [], null);
    const p = window.__project();
    p.tracks.length = 0; p.junctions.length = 0; p.placements = [];
    seeded.tracks.forEach(t => {
      t.durationSec = 120; t.entrySec = 0; t.exitSec = 110; t.linked = true;
      t.sourceBpm = 116; t.downbeatSec = 0; t.peaks = new Array(1400).fill(0.3);
      p.tracks.push(t);
    });
    p.junctions.push({ type: 'blend', bars: 8, bassCutDb: 20 });
    const ctx = new OfflineAudioContext(2, sr, sr);
    const rec = sub => {
      const b = ctx.createBuffer(2, sr * 120, sr);
      for (let c = 0; c < 2; c++) { const d = b.getChannelData(c);
        for (let i = 0; i < d.length; i++) { const t = i / sr;
          d[i] = sub * Math.sin(2 * Math.PI * 45 * t) + 0.2 * Math.sin(2 * Math.PI * 200 * t) + 0.1 * Math.sin(2 * Math.PI * 1000 * t); } }
      return b;
    };
    window.__buffersForTest().set(p.tracks[0].id, rec(0.3));
    window.__buffersForTest().set(p.tracks[1].id, rec(0.05));
    window.__touchForTest && window.__touchForTest('loaded');
    await new Promise(r => setTimeout(r, 300));
    /* levelled first, as the set is, so there is a real volume to compare */
    document.getElementById('normaliseBtn').click();
    await new Promise(r => setTimeout(r, 800));

    /* open the song the way a user does: click its row */
    /* The song on the timeline, as the page itself tells people to; the row
       header in the list does the same. Not the row itself — a click on the
       row's own box is ignored, only its header opens it. */
    const clip = document.querySelector('#timeline [data-track="1"]');
    const head = document.querySelector('.trk[data-track="1"] > .trk-head');
    const row = clip || head;
    console.log('STEP audio in, opening the song via ' + (clip ? 'the timeline' : head ? 'the list' : 'nothing'));
    const res = { rowFound: !!row };
    if (row) row.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await new Promise(r => setTimeout(r, 400));

    const sub = document.querySelector('input[data-tone="sub"][data-track="1"]');
    const vol = document.querySelector('input[data-tone="gain"][data-track="1"]');
    res.panelOpen = !!document.querySelector('.trk-body[data-track="1"]');
    res.hasSub = !!sub; res.hasVol = !!vol;
    if (!sub || !vol) return res;

    console.log('STEP panel open ' + !!sub + ' ' + !!vol);
    /* drag, then let go */
    const gainBefore = p.tracks[1].gainDb;
    sub.value = '6';
    sub.dispatchEvent(new Event('input', { bubbles: true }));
    res.liveReadout = (document.querySelector('[data-tone-val="sub"][data-track="1"]') || {}).textContent;
    res.liveSub = p.tracks[1].subDb;
    console.log('STEP dragged, letting go');
    sub.dispatchEvent(new Event('change', { bubbles: true }));
    console.log('STEP let go');
    await new Promise(r => setTimeout(r, 400));
    res.savedSub = p.tracks[1].subDb;
    res.gainBefore = gainBefore;
    res.gainAfter = p.tracks[1].gainDb;
    res.status = (document.getElementById('status') || {}).textContent || '';

    /* the panel is re-drawn on save: the slider must come back showing it */
    const sub2 = document.querySelector('input[data-tone="sub"][data-track="1"]');
    res.redrawnValue = sub2 ? sub2.value : null;

    /* volume from the panel */
    console.log('STEP volume');
    const vol2 = document.querySelector('input[data-tone="gain"][data-track="1"]');
    vol2.value = '-3';
    vol2.dispatchEvent(new Event('input', { bubbles: true }));
    vol2.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise(r => setTimeout(r, 300));
    res.volSaved = p.tracks[1].gainDb;
    res.otherUntouched = p.tracks[0].subDb || 0;
    return res;
  })()`);

  ok(out.rowFound && out.panelOpen, 'clicking a song opens its panel');
  ok(out.hasSub, 'the panel has a Sub bass slider');
  ok(out.hasVol, 'and a Volume slider');
  if (out.hasSub) {
    ok(out.liveSub === 6 && /\+6 dB/.test(out.liveReadout || ''),
       'dragging it changes the record straight away and shows the value',
       'readout "' + out.liveReadout + '"');
    ok(out.savedSub === 6, 'letting go keeps it', 'subDb ' + out.savedSub);
    ok(out.gainAfter < out.gainBefore,
       'and re-levels the record so it does not get louder',
       out.gainBefore + ' -> ' + out.gainAfter + ' dB');
    ok(/sub-bass \+6 dB, re-levelled/.test(out.status),
       'and says what it did', out.status.slice(0, 90));
    ok(out.redrawnValue === '6', 'the slider still shows +6 after the panel is redrawn', out.redrawnValue);
    ok(out.volSaved === -3, 'the Volume slider in the panel sets the level of the record', out.volSaved + ' dB');
    ok(out.otherUntouched === 0, 'and nothing happens to any other record');
  }
  ok(errs.length === 0, 'no console errors', errs.slice(0, 2).join(' | '));
  console.log(fails ? '\n' + fails + ' FAILED' : '\nthe sub-bass is where the rest of the settings for a record are');
  app.exit(fails ? 1 : 0);
});
