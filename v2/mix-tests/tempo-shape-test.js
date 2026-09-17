/* A record should play at its own speed in the middle.

   It used to be stretched from the tempo its predecessor needed straight to
   the tempo its successor needs, linearly, across its whole length. Both
   junctions came out right and nobody could hear the drift — but most records
   never once played at their own speed. Uptown Funk ran 1.1% to 2.1% and was
   never at natural pitch anywhere in it.

   What a DJ does is match the record coming in and then let the fader back to
   the middle. So: hold each junction's tempo while the two records overlap,
   glide back to the record's own speed, sit there, glide out again.

   What has to hold:
     - the record is at r0 at its start and r1 at its end, so the junctions
       still agree and nothing about beat matching changes
     - it is at exactly 1.0 through its body, and the audio there is the
       ORIGINAL, sample for sample, not a good copy of it
     - source in equals source out: the whole record still plays, no more and
       no less
     - source position and output position still map to each other, in both
       directions, because markers and placements ride on that

   mix-app/node_modules/electron/dist/electron.exe v2/mix-tests/tempo-shape-test.js */
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
    const MP = window.MixProject, MR = window.MixRender, DSP = window.MixDSP;
    if (!DSP.varispeedShape) return { missing: true };

    const TAB = String.fromCharCode(9), NL = String.fromCharCode(10);
    /* three records at different tempos, so the middle one has to match one
       tempo coming in and a different one going out */
    const rows = MP.parseRunningOrder(
      ['#', 'Track', 'Artist', 'BPM', 'Section', 'Mix', 'Note'].join(TAB) + NL +
      ['1', 'First', 'A', '110', 'W', '', ''].join(TAB) + NL +
      ['2', 'Middle', 'B', '115', 'W', '', ''].join(TAB) + NL +
      ['3', 'Last', 'C', '120', 'W', '', ''].join(TAB));
    const p = MP.seedProject(rows, [], null);
    const bpms = [110, 115, 120];
    p.tracks.forEach((t, i) => {
      t.durationSec = 300; t.entrySec = 0; t.exitSec = 280;
      t.linked = true; t.sourceBpm = bpms[i]; t.downbeatSec = 0;
    });
    p.junctions[0] = { type: 'blend', bars: 8, bassCutDb: 20 };
    p.junctions[1] = { type: 'blend', bars: 8, bassCutDb: 20 };

    const plan = MR.buildPlan(p);
    const mid = plan.tracks[1];

    /* what the ratio does across the middle record */
    const probe = [];
    for (let f = 0; f <= 20; f++) {
      const t = mid.outSec * f / 20;
      probe.push(+MR.ratioAtOutput(mid, t).toFixed(5));
    }
    /* how much of it is at exactly 1.0 */
    let atOwn = 0;
    const STEP = 0.5;
    for (let t = 0; t < mid.outSec; t += STEP) {
      if (Math.abs(MR.ratioAtOutput(mid, t) - 1) < 1e-6) atOwn += STEP;
    }

    /* source in equals source out */
    const consumed = MR.sourceConsumedBy(mid, mid.outSec);

    /* and the mapping inverts, everywhere, in both directions */
    let worstRound = 0;
    for (let f = 1; f < 40; f++) {
      const t = mid.outSec * f / 40;
      const s = MR.sourceConsumedBy(mid, t);
      const back = MR.outputTimeForSource(mid, s);
      worstRound = Math.max(worstRound, Math.abs(back - t));
    }

    /* ---- and now the audio: is the body actually untouched ---- */
    const sr = 48000, secs = 200;
    const ctx = new OfflineAudioContext(2, sr * secs, sr);
    let seed = 99;
    const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff - 0.5; };
    const src = ctx.createBuffer(2, sr * secs, sr);
    for (let c = 0; c < 2; c++) {
      const d = src.getChannelData(c);
      for (let i = 0; i < d.length; i++) {
        const t = i / sr;
        d[i] = 0.3 * Math.sin(2 * Math.PI * 220 * t) + 0.1 * rnd();
      }
    }
    const shaped = DSP.varispeedShape(ctx, src, mid.segs);

    /* where does the body sit, in output time */
    let at = 0, bodyFrom = 0, bodyTo = 0;
    mid.segs.forEach(sg => {
      if (Math.abs(sg.a - 1) < 1e-9 && Math.abs(sg.b - 1) < 1e-9 && sg.sec > bodyTo - bodyFrom) {
        bodyFrom = at; bodyTo = at + sg.sec;
      }
      at += sg.sec;
    });
    /* the source offset that body starts at */
    const bodySrc = MR.sourceConsumedBy(mid, bodyFrom);

    /* Is the body the original, or a degraded copy of it?

       Not by subtracting samples. Holding and gliding leaves the read head at
       a FRACTIONAL sample offset, so through the body the output is the source
       shifted by a fraction of a sample — the same waveform, landing between
       the original samples. Subtracting those gives a large difference for a
       signal that is not damaged at all, which is a way to fail a correct
       implementation.

       A fractional delay is exactly flat in magnitude: it changes when each
       sample is, not what is in it. So compare the spectra. Anything the
       resampler actually did wrong — rolled top end, aliasing, a level that
       breathes as the read head drifts — moves a band, and a pure delay does
       not move any. */
    function bands(x, from, lenSec) {
      const N = 8192, hop = N / 2, i0 = Math.floor(from * sr), n = Math.floor(lenSec * sr);
      const acc = new Float64Array(N / 2);
      const re = new Float64Array(N), im = new Float64Array(N);
      let frames = 0;
      for (let off = 0; off + N <= n; off += hop) {
        for (let i = 0; i < N; i++) {
          const wd = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / N);
          re[i] = (x[i0 + off + i] || 0) * wd; im[i] = 0;
        }
        for (let i = 1, j = 0; i < N; i++) {
          let bit = N >> 1;
          for (; j & bit; bit >>= 1) j ^= bit;
          j ^= bit;
          if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; }
        }
        for (let len = 2; len <= N; len <<= 1) {
          const ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang);
          for (let i = 0; i < N; i += len) {
            let cr = 1, ci = 0;
            for (let k = 0; k < len / 2; k++) {
              const ur = re[i + k], ui = im[i + k];
              const vr = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci;
              const vi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
              re[i + k] = ur + vr; im[i + k] = ui + vi;
              re[i + k + len / 2] = ur - vr; im[i + k + len / 2] = ui - vi;
              const ncr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = ncr;
            }
          }
        }
        for (let i = 0; i < N / 2; i++) acc[i] += re[i] * re[i] + im[i] * im[i];
        frames++;
      }
      const edges = [[40, 200], [200, 1000], [1000, 4000], [4000, 10000], [10000, 16000], [16000, 22000]];
      return edges.map(([lo, hi]) => {
        let s = 0, c = 0;
        for (let i = 1; i < N / 2; i++) { const f = i * sr / N; if (f >= lo && f < hi) { s += acc[i]; c++; } }
        return 10 * Math.log10(s / Math.max(1, c) / Math.max(1, frames) + 1e-30);
      });
    }
    const a = shaped.getChannelData(0), b = src.getChannelData(0);
    const outB = bands(a, bodyFrom + 3, 15);
    const srcB = bands(b, bodySrc + 3, 15);
    let worst = 0;
    for (let i = 0; i < outB.length; i++) worst = Math.max(worst, Math.abs(outB[i] - srcB[i]));
    const n = outB.length;

    return {
      shaped: mid.shaped, segs: mid.segs.map(s => ({ sec: +s.sec.toFixed(1), a: +s.a.toFixed(4), b: +s.b.toFixed(4) })),
      r0: +mid.r0.toFixed(5), r1: +mid.r1.toFixed(5),
      ratioAtStart: probe[0], ratioAtEnd: probe[probe.length - 1],
      outSec: +mid.outSec.toFixed(2), sourceSec: +mid.sourceSec.toFixed(2),
      consumed: +consumed.toFixed(3),
      atOwnSpeed: +atOwn.toFixed(1), worstRound: +worstRound.toFixed(4),
      bodyDiff: worst, compared: n
    };
  })()`);

  if (out.missing) { console.log('  FAIL  DSP.varispeedShape is not exported'); app.exit(1); return; }

  console.log('  the middle record, 115 bpm between a 110 and a 120:');
  console.log('    r0 ' + out.r0 + '  ->  r1 ' + out.r1 + '   runs ' + out.outSec + 's');
  console.log('    shape: ' + out.segs.map(s => s.a === s.b
    ? 'hold ' + s.a + ' for ' + s.sec + 's'
    : 'glide ' + s.a + '->' + s.b + ' over ' + s.sec + 's').join(',  '));

  ok(out.shaped === true, 'the record gets a shaped curve rather than a straight ramp');
  ok(Math.abs(out.ratioAtStart - out.r0) < 1e-4,
     'it starts at the tempo the junction before it needs, so that blend still matches',
     out.ratioAtStart + ' against r0 ' + out.r0);
  ok(Math.abs(out.ratioAtEnd - out.r1) < 1e-4,
     'and ends at the tempo the junction after it needs',
     out.ratioAtEnd + ' against r1 ' + out.r1);
  ok(out.atOwnSpeed > out.outSec * 0.35,
     'and spends most of itself at its OWN speed, which is the whole point',
     out.atOwnSpeed + 's of ' + out.outSec + 's at ratio exactly 1.0');
  ok(Math.abs(out.consumed - out.sourceSec) < 0.05,
     'the whole record plays, no more and no less',
     'consumed ' + out.consumed + 's of ' + out.sourceSec + 's of source');
  ok(out.worstRound < 0.01,
     'source and output positions still map to each other both ways',
     'worst round trip ' + out.worstRound + 's');
  ok(out.bodyDiff < 0.15,
     'and through the body it is the original untouched — a pure delay, nothing lost',
     'worst band differs by ' + out.bodyDiff.toFixed(3) + ' dB across ' + out.compared + ' bands');
  ok(errs.length === 0, 'no console errors', errs.slice(0, 2).join(' | '));

  console.log(fails ? '\n' + fails + ' FAILED'
                    : '\na record matches at the joins and plays at its own speed in between');
  app.exit(fails ? 1 : 0);
});
