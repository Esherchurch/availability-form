/* A record's sub-bass, and the timeline keeping up with the tempo curve.

   "Happy Birthday sounds thin against the tracks either side." Measured in the
   finished mix, it was 9 dB short of Dai Dai below 60 Hz with everything above
   that in line — so each record gets a sub-bass control, and it has to:

     - raise what is below 70 Hz and leave the rest alone
     - be the SAME filter in the file as on the timeline, or the timeline lies
     - keep the record at the level of its neighbours: fuller, not louder

   And, found on the way: when records started returning to their own speed
   between blends, the timeline kept playing them on the old straight ramp, and
   worked out where to start after a click as time x speed. On the curve that
   is most of a beat out. The timeline must follow the plan's curve exactly.

   mix-app/node_modules/electron/dist/electron.exe v2/mix-tests/sub-and-seek-test.js */
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
  const w = new BrowserWindow({ show: false, webPreferences: { offscreen: true } });
  const errs = [];
  w.webContents.on('console-message', (e, lvl, msg) => {
    if (lvl >= 2 && !/Security Warning|Content-Security-Policy/.test(msg)) errs.push(msg);
  });
  await w.loadFile(path.join(__dirname, '..', 'mix-builder.html'));
  await new Promise(r => setTimeout(r, 1200));

  const out = await w.webContents.executeJavaScript(`(async () => {
    const DSP = window.MixDSP, MR = window.MixRender, MP = window.MixProject;
    if (!DSP.lowShelfArray || !DSP.lowShelfBuffer) return { missing: 'lowShelf' };
    const sr = 48000, res = {};

    /* ---- 1. the render's shelf against the browser's own ---- */
    let seed = 7;
    const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff - 0.5; };
    const n = sr * 4;
    const noise = new Float32Array(n);
    for (let i = 0; i < n; i++) noise[i] = 0.3 * rnd();
    const mine = DSP.lowShelfArray(noise, sr, DSP.SUB_SHELF_HZ, 6);
    const off = new OfflineAudioContext(1, n, sr);
    const b = off.createBuffer(1, n, sr); b.copyToChannel(noise, 0);
    const src = off.createBufferSource(); src.buffer = b;
    const bq = off.createBiquadFilter(); bq.type = 'lowshelf';
    bq.frequency.value = DSP.SUB_SHELF_HZ; bq.gain.value = 6;
    src.connect(bq); bq.connect(off.destination); src.start();
    const theirs = (await off.startRendering()).getChannelData(0);
    let worst = 0, ref = 0;
    for (let i = 0; i < n; i++) { worst = Math.max(worst, Math.abs(mine[i] - theirs[i])); ref = Math.max(ref, Math.abs(theirs[i])); }
    res.shelfMatch = { worst: worst, relDb: 20 * Math.log10(worst / ref + 1e-12) };

    /* ---- 2. what it does to the spectrum ---- */
    function bandDb(x, lo, hi) {
      const N = 32768, re = new Float64Array(N), im = new Float64Array(N);
      for (let i = 0; i < N; i++) { const wd = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / N); re[i] = x[i] * wd; im[i] = 0; }
      for (let i = 1, j = 0; i < N; i++) { let bit = N >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit;
        if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; } }
      for (let len = 2; len <= N; len <<= 1) { const ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang);
        for (let i = 0; i < N; i += len) { let cr = 1, ci = 0;
          for (let k = 0; k < len / 2; k++) { const ur = re[i + k], ui = im[i + k];
            const vr = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci, vi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
            re[i + k] = ur + vr; im[i + k] = ui + vi; re[i + k + len / 2] = ur - vr; im[i + k + len / 2] = ui - vi;
            const ncr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = ncr; } } }
      let s = 0; for (let i = 1; i < N / 2; i++) { const f = i * sr / N; if (f >= lo && f < hi) s += re[i] * re[i] + im[i] * im[i]; }
      return 10 * Math.log10(s + 1e-30);
    }
    res.lift = {
      sub: +(bandDb(mine, 30, 50) - bandDb(noise, 30, 50)).toFixed(2),
      mid: +(bandDb(mine, 500, 2000) - bandDb(noise, 500, 2000)).toFixed(2),
      top: +(bandDb(mine, 4000, 12000) - bandDb(noise, 4000, 12000)).toFixed(2)
    };

    /* ---- 3. fuller, not louder: the real Level button with a raised sub ---- */
    const TAB = String.fromCharCode(9), NL = String.fromCharCode(10);
    const rows = MP.parseRunningOrder(
      ['#', 'Track', 'Artist', 'BPM', 'Section', 'Mix', 'Note'].join(TAB) + NL +
      ['1', 'Modern', 'A', '110', 'W', '', ''].join(TAB) + NL +
      ['2', 'Old', 'B', '115', 'W', '', ''].join(TAB) + NL +
      ['3', 'Next', 'C', '120', 'W', '', ''].join(TAB));
    const seeded = MP.seedProject(rows, [], null);
    const p = window.__project();
    p.tracks.length = 0; p.junctions.length = 0; p.placements = [];
    const bpms = [110, 115, 120];
    seeded.tracks.forEach((t, i) => {
      t.durationSec = 300; t.entrySec = 0; t.exitSec = 280;
      t.linked = true; t.sourceBpm = bpms[i]; t.downbeatSec = 0;
      p.tracks.push(t);
    });
    p.junctions.push({ type: 'blend', bars: 8, bassCutDb: 20 }, { type: 'blend', bars: 8, bassCutDb: 20 });
    const ctx = new OfflineAudioContext(2, sr, sr);
    function rec(subAmp) {
      const bb = ctx.createBuffer(2, sr * 300, sr);
      for (let c = 0; c < 2; c++) { const d = bb.getChannelData(c);
        for (let i = 0; i < d.length; i++) { const t = i / sr;
          d[i] = subAmp * Math.sin(2 * Math.PI * 45 * t) + 0.2 * Math.sin(2 * Math.PI * 180 * t) +
                 0.12 * Math.sin(2 * Math.PI * 900 * t) + 0.05 * Math.sin(2 * Math.PI * 3200 * t); } }
      return bb;
    }
    const bufs = window.__buffersForTest();
    bufs.set(p.tracks[0].id, rec(0.30));
    bufs.set(p.tracks[1].id, rec(0.06));      // thin: little below 60 Hz
    bufs.set(p.tracks[2].id, rec(0.25));
    document.getElementById('normaliseBtn').click();
    await new Promise(r => setTimeout(r, 1500));
    const flatGain = p.tracks[1].gainDb;
    p.tracks[1].subDb = 8;
    document.getElementById('normaliseBtn').click();
    await new Promise(r => setTimeout(r, 1500));
    const subGain = p.tracks[1].gainDb;
    res.relevel = { flatGain: flatGain, subGain: subGain };

    /* render just the thin one, both ways, and measure */
    const render = async (sub) => {
      p.tracks[1].subDb = sub;
      document.getElementById('normaliseBtn').click();
      await new Promise(r => setTimeout(r, 1500));
      const r = await MR.render(JSON.parse(JSON.stringify(p)), bufs,
        { ctx: new AudioContext({ sampleRate: sr }), measureAlignment: false, fromTrack: 1, toTrack: 1 });
      const ab = await r.blob.arrayBuffer(), dv = new DataView(ab);
      let pos = 12, dataAt = 0, ch = 2;
      while (pos + 8 <= ab.byteLength) {
        const id = String.fromCharCode(dv.getUint8(pos), dv.getUint8(pos + 1), dv.getUint8(pos + 2), dv.getUint8(pos + 3));
        const sz = dv.getUint32(pos + 4, true);
        if (id === 'fmt ') ch = dv.getUint16(pos + 10, true);
        if (id === 'data') { dataAt = pos + 8; break; }
        pos += 8 + sz + (sz & 1);
      }
      const tot = Math.floor((ab.byteLength - dataAt) / (ch * 2));
      const i0 = Math.floor(tot * 0.4), len = sr * 20;
      const x = new Float32Array(len);
      for (let i = 0; i < len; i++) x[i] = dv.getInt16(dataAt + (i0 + i) * ch * 2, true) / 32768;
      return { lufs: DSP.loudness(x, sr, 0, 20), sub: bandDb(x, 30, 60), mid: bandDb(x, 400, 2000) };
    };
    const flat = await render(0);
    const full = await render(8);
    res.heard = {
      lufsFlat: +flat.lufs.toFixed(2), lufsFull: +full.lufs.toFixed(2),
      subLift: +((full.sub - full.mid) - (flat.sub - flat.mid)).toFixed(1)
    };

    /* ---- 4. the timeline follows the plan's curve, and starts in the right place ---- */
    p.tracks[1].subDb = 3;
    await window.__buildPreview();
    const pv = window.__previewForTest();
    const plan = MR.buildPlan(JSON.parse(JSON.stringify(p)));
    const pt = plan.tracks[1];
    let worstSrc = 0, worstRate = 0, worstOld = 0;
    for (let k = 0; k <= 60; k++) {
      const t = pt.outSec * k / 60;
      const got = pv.__trackAt(1, t);
      const wantSrc = (pt.sourceFromSec || 0) + MR.sourceConsumedBy(pt, t);
      const wantRate = MR.ratioAtOutput(pt, t);
      worstSrc = Math.max(worstSrc, Math.abs(got.source - wantSrc));
      worstRate = Math.max(worstRate, Math.abs(got.rate - wantRate));
      /* what the old time-times-speed start would have been */
      const lin = pt.r0 + (pt.r1 - pt.r0) * (t / pt.outSec);
      worstOld = Math.max(worstOld, Math.abs(((pt.sourceFromSec || 0) + t * lin) - wantSrc));
    }
    res.seek = { worstSrcMs: +(worstSrc * 1000).toFixed(3), worstRate: worstRate,
                 oldWorstMs: +(worstOld * 1000).toFixed(0), shaped: pt.shaped,
                 sub: pv.__trackAt(1, 10).sub, beatMs: +(60000 / 115).toFixed(0) };
    return res;
  })()`);

  if (out.missing) { console.log('  FAIL  missing ' + out.missing); app.exit(1); return; }

  console.log('  the filter:');
  ok(out.shelfMatch.relDb < -80,
     'the file and the timeline use the same sub-bass filter, sample for sample',
     'largest difference ' + out.shelfMatch.relDb.toFixed(0) + ' dB below the signal');
  ok(out.lift.sub > 5 && out.lift.sub < 7,
     '+6 dB lifts what is below 60 Hz by about 6 dB', out.lift.sub + ' dB at 30-50 Hz');
  ok(Math.abs(out.lift.mid) < 0.3 && Math.abs(out.lift.top) < 0.3,
     'and leaves the mids and the top alone', 'mid ' + out.lift.mid + ' dB, top ' + out.lift.top + ' dB');

  console.log('\n  a thin record with its sub raised by 8 dB:');
  console.log('    Level gives it ' + out.relevel.flatGain + ' dB flat, ' + out.relevel.subGain + ' dB with the sub raised');
  console.log('    rendered: ' + out.heard.lufsFlat + ' LUFS flat, ' + out.heard.lufsFull + ' LUFS with the sub');
  ok(out.relevel.subGain < out.relevel.flatGain,
     'Level pays for the extra weight with a little less gain',
     out.relevel.flatGain + ' -> ' + out.relevel.subGain + ' dB');
  ok(Math.abs(out.heard.lufsFull - out.heard.lufsFlat) < 0.5,
     'so it comes out at the same loudness — fuller, not louder',
     Math.abs(out.heard.lufsFull - out.heard.lufsFlat).toFixed(2) + ' dB apart');
  ok(out.heard.subLift > 4,
     'and it really is fuller in the finished file',
     'sub-to-mid balance up ' + out.heard.subLift + ' dB');

  console.log('\n  the timeline against the plan, on a shaped record:');
  ok(out.seek.shaped, 'the record has the hold-glide-own-speed curve');
  ok(out.seek.worstSrcMs < 1,
     'wherever you click, the timeline starts the record at the right point in the song',
     'worst ' + out.seek.worstSrcMs + ' ms out, where time x speed was ' + out.seek.oldWorstMs +
     ' ms out (a beat is ' + out.seek.beatMs + ' ms)');
  ok(out.seek.worstRate < 1e-6, 'and plays it at the speed the file does', 'worst ' + out.seek.worstRate);
  ok(out.seek.sub === 3, 'the timeline carries the sub-bass setting', 'sub ' + out.seek.sub + ' dB');
  ok(errs.length === 0, 'no console errors', errs.slice(0, 2).join(' | '));

  console.log(fails ? '\n' + fails + ' FAILED'
                    : '\na thin record can be made fuller without getting louder, and the timeline sounds like the file');
  app.exit(fails ? 1 : 0);
});
