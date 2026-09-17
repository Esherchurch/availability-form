/* Moving a record in time must not keep taking the top end off it.

   "It dips and sounds underwater in places", and the places were in the middle
   of a record rather than at the joins — which is where the only thing acting
   on the audio is the time adjustment.

   The trap this test exists to close is that an AVERAGE said there was nothing
   wrong. Measured across eighteen seconds, WSOLA cost 0.8 dB of top end, which
   is nothing. Measured every 100 ms against the same moment of the source, a
   fifth of the record was more than 3 dB down and it stayed down for up to
   eight tenths of a second at a time. A mean cannot see that, so this asserts
   on the WORST stretch, not the typical one.

   Runs under the app's own Electron:
     mix-app/node_modules/electron/dist/electron.exe v2/mix-tests/stretch-dip-test.js */
const { app, BrowserWindow } = require('electron');
const path = require('path');

let fails = 0;
const ok = (c, m, x) => {
  console.log((c ? '  ok   ' : '  FAIL ') + m + (x ? '   — ' + x : ''));
  if (!c) fails++;
};

app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  const w = new BrowserWindow({ show: false, webPreferences: { offscreen: true } });
  const errs = [];
  w.webContents.on('console-message', (e, lvl, msg) => {
    if (lvl >= 2 && !/Security Warning|Content-Security-Policy/.test(msg)) errs.push(msg);
  });
  await w.loadFile(path.join(__dirname, '..', 'mix-builder.html'));
  await new Promise(r => setTimeout(r, 1200));

  const out = await w.webContents.executeJavaScript(`(async () => {
    const DSP = window.MixDSP;
    if (!DSP.timeAdjust || !DSP.varispeedRamp) return { missing: true };
    const sr = 48000, secs = 24;
    const ctx = new OfflineAudioContext(2, sr * secs, sr);

    /* Dense, full band, with plenty above 4 kHz and no single dominant pitch —
       the material a correlation search has the most trouble with, which is
       what a real record is. Deterministic, so a failure is reproducible. */
    let seed = 12345;
    const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff - 0.5; };
    function record() {
      const b = ctx.createBuffer(2, sr * secs, sr);
      for (let c = 0; c < 2; c++) {
        const d = b.getChannelData(c);
        let hp = 0, prev = 0;
        for (let i = 0; i < d.length; i++) {
          const t = i / sr;
          let v = 0.22 * Math.sin(2 * Math.PI * 82 * t) +
                  0.14 * Math.sin(2 * Math.PI * 247 * t) +
                  0.10 * Math.sin(2 * Math.PI * 523 * t) +
                  0.07 * Math.sin(2 * Math.PI * 1319 * t);
          /* A steady broadband bed UNDER the hats, not hats alone.

             Impulsive top end makes this measurement jump on frame alignment
             rather than on anything the stretch did: resampling shifts the
             timeline, the comparison frame lands half a hat out, and a clean
             resample reads as 10 dB down. A continuous bed is always there to
             be compared, so what moves is what the processing did to it. */
          const n = rnd();
          hp = 0.75 * (hp + n - prev); prev = n;
          v += 0.11 * hp;
          if ((t % 0.25) < 0.02) v += 0.9 * hp;
          d[i] = v * 0.5;
        }
      }
      return b;
    }
    const src = record();
    const copy = () => {
      const b = ctx.createBuffer(2, src.length, sr);
      for (let c = 0; c < 2; c++) b.copyToChannel(src.getChannelData(c).slice(0), c);
      return b;
    };
    const mono = b => {
      const N = b.length, o = new Float32Array(N), C = b.numberOfChannels;
      for (let c = 0; c < C; c++) { const d = b.getChannelData(c);
        for (let i = 0; i < N; i++) o[i] += d[i] / C; }
      return o;
    };
    function frames(x) {
      const W = Math.floor(sr * 0.1), res = [];
      for (let o = 0; o + W <= x.length; o += W) {
        let hp = 0, prev = 0, s = 0, tot = 0;
        for (let i = 0; i < W; i++) {
          const v = x[o + i];
          tot += v * v;
          hp = 0.62 * (hp + v - prev); prev = v; s += hp * hp;
        }
        res.push([10 * Math.log10(s / W + 1e-20), 10 * Math.log10(tot / W + 1e-20)]);
      }
      return res;
    }
    const base = frames(mono(src));

    function judge(buf, ratio) {
      const f = frames(mono(buf));
      const rows = [];
      for (let k = 0; k < f.length; k++) {
        const j = Math.round(k * ratio);
        if (j >= base.length) break;
        if (base[j][1] < -45) continue;
        rows.push((f[k][0] - base[j][0]) - (f[k][1] - base[j][1]));
      }
      let run = 0, longest = 0;
      rows.forEach(v => { if (v < -3) { run++; if (run > longest) longest = run; } else run = 0; });
      const sorted = rows.slice().sort((a, b) => a - b);
      return { longestDipSec: +(longest / 10).toFixed(1),
               pctDull: +(100 * rows.filter(v => v < -3).length / rows.length).toFixed(1),
               median: +sorted[Math.floor(sorted.length / 2)].toFixed(2) };
    }

    /* The old way is measured alongside, on the same material, because an
       absolute threshold here would only be describing this signal. What has
       to hold is that the new route is materially better than the one that
       produced the complaint. */
    const RATIOS = [1.007, 1.016, 0.9667, 1.0437];
    const res = { ratios: [] };
    for (const r of RATIOS) {
      const adj = DSP.timeAdjust(ctx, copy(), r, r);
      const old = DSP.stretchRamp(ctx, copy(), r, r);
      res.ratios.push({ r: r, want: Math.round(src.length / r), got: adj.length,
                        ...judge(adj, r), was: judge(old, r) });
    }
    /* and the stretcher still takes over when the gap is too wide for a fader */
    const wide = DSP.timeAdjust(ctx, copy(), 1.25, 1.25);
    const narrow = DSP.timeAdjust(ctx, copy(), 1.02, 1.02);
    const vs = DSP.varispeedRamp(ctx, copy(), 1.02, 1.02);
    let same = narrow.length === vs.length;
    if (same) {
      const a = narrow.getChannelData(0), b = vs.getChannelData(0);
      for (let i = 0; i < a.length; i += 977) if (Math.abs(a[i] - b[i]) > 1e-6) { same = false; break; }
    }
    return { ...res, limit: DSP.VARISPEED_LIMIT, usedVarispeedAt2pct: same,
             wideLen: wide.length, wideWant: Math.round(src.length / 1.25) };
  })()`);

  if (out.missing) { console.log('  FAIL  DSP.timeAdjust / varispeedRamp not exported'); app.exit(1); return; }

  console.log('  moving a record in time, measured every 100 ms against the source:');
  console.log('    ratio      length      dull >3dB          longest dip        median');
  console.log('                          now      was      now      was');
  out.ratios.forEach(r => console.log('    ' + String(r.r).padEnd(10) +
    (r.got === r.want ? 'exact ' : 'WRONG ') +
    String(r.pctDull + '%').padStart(9) + String(r.was.pctDull + '%').padStart(9) +
    String(r.longestDipSec + 's').padStart(9) + String(r.was.longestDipSec + 's').padStart(9) +
    String(r.median).padStart(12)));

  const worstDip = Math.max.apply(null, out.ratios.map(r => r.longestDipSec));
  const oldDip = Math.max.apply(null, out.ratios.map(r => r.was.longestDipSec));
  const worstPct = Math.max.apply(null, out.ratios.map(r => r.pctDull));
  const oldPct = Math.max.apply(null, out.ratios.map(r => r.was.pctDull));

  ok(worstDip <= 0.2,
     'the top end never stays down long enough to hear as a dip',
     'longest unbroken dip ' + worstDip + 's, where the stretcher held it down for ' + oldDip + 's');
  ok(worstPct < oldPct * 0.6,
     'and the record is dull for far less of its length than the stretcher left it',
     worstPct + '% of frames against the stretcher\'s ' + oldPct + '%');
  ok(out.ratios.every(r => r.got === r.want),
     'every ratio still produces exactly the length the plan expects',
     out.ratios.map(r => r.got + '/' + r.want).join(' '));
  ok(out.ratios.every(r => Math.abs(r.median) < 1),
     'and nothing is dulled on average either',
     out.ratios.map(r => r.median).join(' / ') + ' dB');
  ok(out.usedVarispeedAt2pct === true,
     'a 2% move goes through the pitch fader, not the stretcher');
  ok(out.wideLen === out.wideWant,
     'and a gap too wide for a fader still falls back to the stretcher and comes out the right length',
     'limit is ' + (out.limit * 100) + '%; 25% gave ' + out.wideLen + ' of ' + out.wideWant);
  ok(errs.length === 0, 'no console errors', errs.slice(0, 2).join(' | '));

  console.log(fails ? '\n' + fails + ' FAILED'
                    : '\nrecords are moved in time without the top end dipping in and out');
  app.exit(fails ? 1 : 0);
});
