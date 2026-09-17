/* The low-end meter reads true, follows the slider, and is in both places.

   Asked for as "a marker of what the bass currently is, so I can keep
   consistency against the bassiest track". Three records built so their
   30-100 Hz against their own mids is known exactly — a 50 Hz tone against a
   1 kHz tone, at chosen amplitudes — so the reading can be held to the
   arithmetic rather than to itself.

   mix-app/node_modules/electron/dist/electron.exe v2/mix-tests/lowend-meter-test.js */
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
    if (lvl >= 2 && !/Security Warning|Content-Security-Policy/.test(msg)) errs.push(msg);
  });
  await w.loadFile(path.join(__dirname, '..', 'mix-builder.html'));
  await new Promise(r => setTimeout(r, 1200));

  const out = await w.webContents.executeJavaScript(`(async () => {
    const MP = window.MixProject, DSP = window.MixDSP;
    if (!DSP.lowEndProfile || !DSP.lowEndDb) return { missing: true };
    const sr = 48000, secs = 90;
    const TAB = String.fromCharCode(9), NL = String.fromCharCode(10);
    const names = ['Bassy', 'Middling', 'Thin'];
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
    p.junctions.push({ type: 'blend', bars: 8, bassCutDb: 20 }, { type: 'blend', bars: 8, bassCutDb: 20 });
    const ctx = new OfflineAudioContext(2, sr, sr);
    /* low tone amplitude A at 50 Hz, mid tone B at 1 kHz: reading = 20 log10(A/B) */
    const amps = [[0.30, 0.10], [0.10, 0.10], [0.02, 0.10]];
    amps.forEach(([A, B], k) => {
      const b = ctx.createBuffer(2, sr * secs, sr);
      for (let c = 0; c < 2; c++) { const d = b.getChannelData(c);
        for (let i = 0; i < d.length; i++) { const t = i / sr;
          d[i] = A * Math.sin(2 * Math.PI * 50 * t) + B * Math.sin(2 * Math.PI * 1000 * t); } }
      window.__buffersForTest().set(p.tracks[k].id, b);
    });
    window.__touchForTest('loaded');
    document.getElementById('normaliseBtn').click();
    await new Promise(r => setTimeout(r, 1000));

    const res = { expect: amps.map(([A, B]) => 20 * Math.log10(A / B)) };
    res.read = p.tracks.map(t => {
      const b = window.__buffersForTest().get(t.id);
      return DSP.lowEndDb(DSP.lowEndProfile(DSP.toMono(b), sr, 0, secs - 2), 0);
    });

    /* what a +6 dB shelf does to a 50 Hz tone, from the filter itself */
    const off = new OfflineAudioContext(1, sr, sr);
    const tb = off.createBuffer(1, sr, sr);
    const td = tb.getChannelData(0);
    for (let i = 0; i < sr; i++) td[i] = Math.sin(2 * Math.PI * 50 * i / sr);
    const shelved = DSP.lowShelfArray(td, sr, DSP.SUB_SHELF_HZ, 6);
    let e0 = 0, e1 = 0; for (let i = sr / 2; i < sr; i++) { e0 += td[i] * td[i]; e1 += shelved[i] * shelved[i]; }
    res.shelfAt50 = 10 * Math.log10(e1 / e0);

    /* ---- the panel ---- */
    document.querySelector('.trk[data-track="2"] > .trk-head').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await new Promise(r => setTimeout(r, 1500));      // let the rest of the set be measured
    const panel = document.querySelector('.trk-body [data-lowend="2"], [data-lowend="2"]');
    res.panelHas = !!panel;
    if (!panel) return res;
    res.panelText = panel.querySelector('.le-text').textContent;
    const mark = () => parseFloat(panel.querySelector('.le-mark').style.left);
    res.bestShown = !panel.querySelector('.le-best').hidden;
    res.bestLeft = parseFloat(panel.querySelector('.le-best').style.left);
    res.prevShown = !panel.querySelector('.le-prev').hidden;
    const barEl = panel.querySelector('.le-bar');
    res.scale = (+barEl.dataset.max) - (+barEl.dataset.min);
    res.markBefore = mark();

    /* drag the panel's sub slider: the marker has to move while dragging */
    const sub = document.querySelector('input[data-tone="sub"][data-track="2"]');
    sub.value = '6';
    sub.dispatchEvent(new Event('input', { bubbles: true }));
    res.markDuring = mark();
    res.textDuring = panel.querySelector('.le-text').textContent;
    sub.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise(r => setTimeout(r, 500));

    /* ---- the right-click pop-up shows the same ---- */
    const clip = document.querySelector('#timeline .clip[data-clip="song"][data-index="2"]');
    res.clipFound = !!clip;
    if (clip) {
      const r = clip.getBoundingClientRect();
      clip.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true,
        clientX: r.left + 5, clientY: r.top + 5 }));
      await new Promise(r2 => setTimeout(r2, 400));
      const pop = document.querySelector('.clipmenu [data-lowend="2"]');
      res.popHas = !!pop;
      if (pop) res.popText = pop.querySelector('.le-text').textContent;
    }
    return res;
  })()`);

  if (out.missing) { console.log('  FAIL  DSP.lowEndProfile / lowEndDb missing'); app.exit(1); return; }

  console.log('  the reading, against the arithmetic:');
  ['Bassy', 'Middling', 'Thin'].forEach((nm, i) =>
    console.log('    ' + nm.padEnd(10) + 'expected ' + out.expect[i].toFixed(1).padStart(6) +
                ' dB   read ' + (out.read[i] == null ? 'null' : out.read[i].toFixed(1)).padStart(6) + ' dB'));
  ok(out.read.every((v, i) => v != null && Math.abs(v - out.expect[i]) < 0.6),
     'each record reads its true low end, within half a dB');
  ok(out.read[0] > out.read[1] && out.read[1] > out.read[2], 'and they rank in the right order');

  console.log('\n  the panel under "Thin":');
  console.log('    ' + (out.panelText || '').replace(/\s+/g, ' ').slice(0, 160));
  ok(out.panelHas, 'the song panel shows the meter');
  ok(/Bassy/.test(out.panelText || '') && out.bestShown && out.bestLeft > out.markBefore,
     'it names the bassiest record and marks it above this one', 'bassiest mark at ' + out.bestLeft.toFixed(0) + '%, this at ' + out.markBefore.toFixed(0) + '%');
  ok(out.prevShown, 'and marks the record before it');
  const moved = out.markDuring - out.markBefore;
  const movedDb = moved / 100 * out.scale;
  ok(movedDb > out.shelfAt50 - 0.7 && movedDb < out.shelfAt50 + 0.7,
     'dragging Sub bass moves the marker live, by what the filter really does',
     'moved ' + movedDb.toFixed(1) + ' dB; the shelf gives ' + out.shelfAt50.toFixed(1) + ' dB at 50 Hz');
  ok(/This record/.test(out.textDuring || ''), 'and the number updates with it', (out.textDuring || '').slice(0, 40));

  ok(out.clipFound && out.popHas, 'the right-click pop-up shows it too');
  if (out.popHas) {
    const num = s => { const m = /This record ([+-]?[\d.]+)/.exec(s || ''); return m ? parseFloat(m[1]) : NaN; };
    ok(Math.abs(num(out.popText) - (out.expect[2] + out.shelfAt50)) < 0.8,
       'showing the reading with the new setting in it',
       (out.popText || '').replace(/\s+/g, ' ').slice(0, 70));
  }
  ok(errs.length === 0, 'no console errors', errs.slice(0, 2).join(' | '));
  console.log(fails ? '\n' + fails + ' FAILED' : '\nthe low end of each record can be seen, compared and matched');
  app.exit(fails ? 1 : 0);
});
