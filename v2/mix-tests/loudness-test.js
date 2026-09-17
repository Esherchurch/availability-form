/* The set must arrive at the loudness it was asked for, and still match.

   Levelling used to pick the loudest point the least forgiving record in the
   set could reach with not one sample clipping. On Martin's real set that
   record was "Get Down on It" — sparse funk, -22.5 LUFS, peaks already at
   -1.1 dBFS, so 0.9 dB of room — and it pulled all 44 tracks down with it. The
   finished two hour mix measured -22.2 LUFS against its target: 7.6 dB
   thrown away, which then has to be found again on the amplifier. "The quality
   is up and down... almost like it is mega compressed" was the sound of a mix
   played 8 dB harder than it should ever need to be.

   Levelling is still levelling: every record gets its own gain so they all
   land on the same number. The limiter only catches the transient peaks of the
   few records that would clip once they are correctly levelled — measured on
   the real set at -20, two of forty-four, the worst by 1.6 dB.

   Runs under the app's own Electron, because that is what ships:
     mix-app/node_modules/electron/dist/electron.exe v2/mix-tests/loudness-test.js */
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
    /* Electron prints a CSP warning on every unpackaged window; it is about the
       harness, not the app, and it goes away once packaged. */
    if (lvl >= 2 && !/Electron Security Warning|Content-Security-Policy/.test(msg)) errs.push(msg);
  });
  await w.loadFile(path.join(__dirname, '..', 'mix-builder.html'));
  await new Promise(r => setTimeout(r, 1200));

  /* ---------------- the limiter on its own ---------------- */
  const lim = await w.webContents.executeJavaScript(`(() => {
    const DSP = window.MixDSP;
    if (!DSP || !DSP.limitPeaks) return { missing: true };
    const sr = 48000, ctx = new OfflineAudioContext(2, sr, sr);
    const CEIL = 0.85;
    const make = (fn, secs) => {
      const b = ctx.createBuffer(2, Math.floor(sr * secs), sr);
      for (let c = 0; c < 2; c++) {
        const d = b.getChannelData(c);
        for (let i = 0; i < d.length; i++) d[i] = fn(i / sr, c);
      }
      return b;
    };
    const peak = b => {
      let p = 0;
      for (let c = 0; c < b.numberOfChannels; c++) {
        const d = b.getChannelData(c);
        for (let i = 0; i < d.length; i++) { const a = Math.abs(d[i]); if (a > p) p = a; }
      }
      return p;
    };
    /* The level of the quiet part BETWEEN the transients.
       Measuring the whole signal cannot answer this: the transients are the
       part the limiter is supposed to bring down, so their reduction swamps
       the bed's gain and the number says nothing about either. This looks
       only at the last third of each half second, well clear of the hit and
       of the recovery after it. */
    const bedRms = b => {
      const d = b.getChannelData(0), sr2 = b.sampleRate;
      let s = 0, c = 0;
      for (let i = 0; i < d.length; i++) {
        const ph = (i / sr2) % 0.5;
        if (ph > 0.32 && ph < 0.49) { s += d[i] * d[i]; c++; }
      }
      return Math.sqrt(s / Math.max(1, c));
    };
    const out = {};

    /* a quiet bed with hard transients over it: the shape of a dynamic record */
    const spiky = make((t, c) => {
      let v = 0.08 * Math.sin(2 * Math.PI * 110 * t) * (c ? 0.7 : 1);
      if ((t % 0.5) < 0.004) v += 0.85 * Math.sin(2 * Math.PI * 900 * t);
      return v;
    }, 4);
    const bedBefore = bedRms(spiky);
    /* 6 dB over: MAX_LIMIT_DB is what the app will ever ask of it */
    const r1 = DSP.limitPeaks(spiky, CEIL, { preGain: 2 });
    out.held = { pk: +peak(spiky).toFixed(4), ceiling: CEIL, reduced: +r1.limitedDb.toFixed(1) };
    out.bedGainDb = +(20 * Math.log10(bedRms(spiky) / bedBefore)).toFixed(2);

    /* a record with room must be left exactly alone */
    const calm = make(t => 0.1 * Math.sin(2 * Math.PI * 220 * t), 1);
    const r2 = DSP.limitPeaks(calm, CEIL, { preGain: 2 });
    out.calm = { worked: r2.worked, pk: +peak(calm).toFixed(4) };

    /* a tone pushed past the ceiling must come back a tone, not a square one */
    const sine = make(t => 0.5 * Math.sin(2 * Math.PI * 100 * t), 2);
    DSP.limitPeaks(sine, CEIL, { preGain: 2.4 });
    const d = sine.getChannelData(0);
    const N = 16384, re = new Float64Array(N), im = new Float64Array(N);
    for (let i = 0; i < N; i++) {
      const wd = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / N);
      re[i] = d[sr + i] * wd; im[i] = 0;
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
    const mag = k => Math.sqrt(re[k] * re[k] + im[k] * im[k]);
    const bin = Math.round(100 * N / sr);
    let fund = 0, harm = 0;
    for (let h = 1; h <= 8; h++) {
      let m = 0;
      for (let k = bin * h - 3; k <= bin * h + 3; k++) m += mag(k) * mag(k);
      if (h === 1) fund = m; else harm += m;
    }
    out.thdPct = +(100 * Math.sqrt(harm / fund)).toFixed(2);

    /* one gain curve for every channel, or the image steps sideways */
    const st = make((t, c) => (c ? 0.5 : 1) * (0.1 * Math.sin(2 * Math.PI * 110 * t) +
      ((t % 0.4) < 0.004 ? 0.9 * Math.sin(2 * Math.PI * 800 * t) : 0)), 2);
    DSP.limitPeaks(st, CEIL, { preGain: 3 });
    let sl = 0, sr2 = 0;
    const L = st.getChannelData(0), R = st.getChannelData(1);
    for (let i = 0; i < st.length; i++) { sl += L[i] * L[i]; sr2 += R[i] * R[i]; }
    out.imageDb = +(10 * Math.log10(sl / sr2)).toFixed(2);
    return out;
  })()`);

  if (lim.missing) { console.log('  FAIL  DSP.limitPeaks is not exported'); app.exit(1); return; }

  console.log('  the limiter:');
  ok(lim.held.pk <= lim.held.ceiling + 1e-4,
     'nothing gets past the ceiling, driven the full 6 dB over',
     'peak ' + lim.held.pk + ' against a ceiling of ' + lim.held.ceiling);
  ok(lim.bedGainDb > 5.5,
     'and the quiet part of the record keeps all of its level',
     'the bed came up ' + lim.bedGainDb + ' dB of the 6 asked for');
  ok(lim.calm.worked === false && Math.abs(lim.calm.pk - 0.2) < 1e-4,
     'a record with room to spare is left completely alone',
     'peak ' + lim.calm.pk + ', limiter ran: ' + lim.calm.worked);
  ok(lim.thdPct < 1.5,
     'a tone pushed past the ceiling comes back a tone, not a square',
     lim.thdPct + '% distortion');
  ok(Math.abs(lim.imageDb - 6.02) < 0.25,
     'both channels get the same gain, so the stereo image holds still',
     lim.imageDb + ' dB L over R, and it started at 6.02');

  /* ------- end to end: one dynamic record must not flatten the set ------- */
  const mix = await w.webContents.executeJavaScript(`(async () => {
    const MP = window.MixProject, MR = window.MixRender, DSP = window.MixDSP;
    const sr = 48000, secs = 30;
    function rec(kind) {
      const b = new OfflineAudioContext(2, sr * secs, sr).createBuffer(2, sr * secs, sr);
      for (let c = 0; c < 2; c++) {
        const d = b.getChannelData(c);
        for (let i = 0; i < d.length; i++) {
          const t = i / sr;
          if (kind === 'dense') {
            /* a modern master: loud, dense, nothing left above the peaks */
            d[i] = 0.62 * Math.sin(2 * Math.PI * 70 * t) +
                   0.25 * Math.sin(2 * Math.PI * 640 * t) +
                   0.08 * Math.sin(2 * Math.PI * 2100 * t);
          } else {
            /* sparse funk: quiet average, transients almost at full scale */
            d[i] = 0.16 * Math.sin(2 * Math.PI * 90 * t) +
                   0.09 * Math.sin(2 * Math.PI * 700 * t);
            if ((t % 0.5) < 0.03) d[i] += 0.72 * Math.sin(2 * Math.PI * 1200 * t);
          }
        }
      }
      return b;
    }
    const TAB = String.fromCharCode(9), NL = String.fromCharCode(10);
    const rows = MP.parseRunningOrder(
      ['#', 'Track', 'Artist', 'BPM', 'Section', 'Mix', 'Note'].join(TAB) + NL +
      ['1', 'Dense', 'A', '120', 'W', '', ''].join(TAB) + NL +
      ['2', 'Sparse', 'B', '120', 'W', '', ''].join(TAB));
    const p = MP.seedProject(rows, [], null);
    p.tracks.forEach(t => {
      t.durationSec = secs; t.entrySec = 0; t.exitSec = secs - 1;
      t.linked = true; t.sourceBpm = 120; t.downbeatSec = 0;
    });
    p.junctions[0] = { type: 'blend', bars: 4, bassCutDb: 20 };
    const bufs = new Map();
    bufs.set(p.tracks[0].id, rec('dense'));
    bufs.set(p.tracks[1].id, rec('sparse'));

    /* level them the way the app does */
    const TARGET = -20, MAX_LIMIT = 6;
    const info = [];
    p.tracks.forEach(t => {
      const b = bufs.get(t.id), mono = DSP.toMono(b);
      const lufs = DSP.loudness(mono, sr, 0, secs - 1);
      let pk = 0;
      for (let i = 0; i < mono.length; i++) { const a = Math.abs(mono[i]); if (a > pk) pk = a; }
      const head = 20 * Math.log10(0.97 / pk);
      const g = Math.max(-24, Math.min(12, Math.min(TARGET - lufs, head + MAX_LIMIT)));
      t.gainDb = Math.round(g * 10) / 10;
      info.push({ title: t.title, lufs: +lufs.toFixed(1), head: +head.toFixed(1), gain: t.gainDb });
    });

    const res = await MR.render(p, bufs, { ctx: new AudioContext(), measureAlignment: false });
    const ab = await res.blob.arrayBuffer(), dv = new DataView(ab);
    let pos = 12, dataAt = 0, ch = 2, rate = sr;
    while (pos + 8 <= ab.byteLength) {
      const id = String.fromCharCode(dv.getUint8(pos), dv.getUint8(pos + 1),
                                     dv.getUint8(pos + 2), dv.getUint8(pos + 3));
      const sz = dv.getUint32(pos + 4, true);
      if (id === 'fmt ') { ch = dv.getUint16(pos + 10, true); rate = dv.getUint32(pos + 12, true); }
      if (id === 'data') { dataAt = pos + 8; break; }
      pos += 8 + sz + (sz & 1);
    }
    const total = Math.floor((ab.byteLength - dataAt) / (ch * 2));
    const grab = (fromSec, lenSec) => {
      const i0 = Math.floor(fromSec * rate), n = Math.min(Math.floor(lenSec * rate), total - i0);
      const x = new Float32Array(Math.max(0, n));
      for (let i = 0; i < n; i++) x[i] = dv.getInt16(dataAt + (i0 + i) * ch * 2, true) / 32768;
      return x;
    };
    let filePeak = 0;
    for (let i = 0; i < total * ch; i++) {
      const a = Math.abs(dv.getInt16(dataAt + i * 2, true) / 32768);
      if (a > filePeak) filePeak = a;
    }
    const t2 = res.plan.tracks[1].startSec;
    return {
      info: info,
      denseLufs: +DSP.loudness(grab(2, 18), rate, 0, 18).toFixed(1),
      sparseLufs: +DSP.loudness(grab(t2 + 6, 18), rate, 0, 18).toFixed(1),
      filePeak: +filePeak.toFixed(3)
    };
  })()`);

  console.log('\n  end to end, a dense master next to a sparse dynamic record:');
  mix.info.forEach(i => console.log('    ' + i.title.padEnd(8) + ' ' + i.lufs + ' LUFS, ' +
    i.head + ' dB of room, levelled ' + (i.gain > 0 ? '+' : '') + i.gain + ' dB'));
  console.log('    rendered: dense ' + mix.denseLufs + ' LUFS, sparse ' + mix.sparseLufs +
              ' LUFS, file peaks ' + mix.filePeak);

  ok(mix.denseLufs > -22.5,
     'the set reaches the loudness it was asked for',
     'came out at ' + mix.denseLufs + ' LUFS against a -20 target');
  ok(Math.abs(mix.denseLufs - mix.sparseLufs) < 3.0,
     'and the sparse record sits alongside it rather than dragging it down',
     Math.abs(mix.denseLufs - mix.sparseLufs).toFixed(1) + ' dB apart');
  ok(mix.filePeak < 0.995, 'nothing clips', 'the file peaks at ' + mix.filePeak);
  ok(errs.length === 0, 'no console errors', errs.slice(0, 2).join(' | '));

  /* ---- the real button, not a copy of its arithmetic ---- */
  const ui = await w.webContents.executeJavaScript(`(async () => {
    const MP = window.MixProject;
    if (!window.__project || !window.__buffersForTest) return { noHooks: true };
    const sr = 48000, secs = 20;
    function rec(kind) {
      const b = new OfflineAudioContext(2, sr * secs, sr).createBuffer(2, sr * secs, sr);
      for (let c = 0; c < 2; c++) {
        const d = b.getChannelData(c);
        for (let i = 0; i < d.length; i++) {
          const t2 = i / sr;
          if (kind === 'dense') {
            d[i] = 0.62 * Math.sin(2 * Math.PI * 70 * t2) + 0.25 * Math.sin(2 * Math.PI * 640 * t2);
          } else {
            d[i] = 0.16 * Math.sin(2 * Math.PI * 90 * t2) + 0.09 * Math.sin(2 * Math.PI * 700 * t2);
            if ((t2 % 0.5) < 0.03) d[i] += 0.72 * Math.sin(2 * Math.PI * 1200 * t2);
          }
        }
      }
      return b;
    }
    const TAB = String.fromCharCode(9), NL = String.fromCharCode(10);
    const rows = MP.parseRunningOrder(
      ['#', 'Track', 'Artist', 'BPM', 'Section', 'Mix', 'Note'].join(TAB) + NL +
      ['1', 'Dense', 'A', '120', 'W', '', ''].join(TAB) + NL +
      ['2', 'Sparse', 'B', '120', 'W', '', ''].join(TAB));
    const seeded = MP.seedProject(rows, [], null);
    /* __project hands back the LIVE project object, so filling it in place is
       how a test gets a set into the running app without driving the file
       pickers. Replacing the reference would leave the app on the old one. */
    const p = window.__project();
    p.tracks.length = 0; p.junctions.length = 0;
    seeded.tracks.forEach(function (t3) {
      t3.durationSec = secs; t3.entrySec = 0; t3.exitSec = secs - 1;
      t3.linked = true; t3.sourceBpm = 120; t3.downbeatSec = 0;
      p.tracks.push(t3);
    });
    p.junctions.push({ type: 'blend', bars: 4, bassCutDb: 20 });
    const bufs = window.__buffersForTest();
    bufs.set(p.tracks[0].id, rec('dense'));
    bufs.set(p.tracks[1].id, rec('sparse'));

    const btn = document.getElementById('normaliseBtn');
    if (!btn) return { noButton: true };
    btn.click();
    await new Promise(function (r) { setTimeout(r, 400); });
    const st = document.getElementById('status');
    return { gains: p.tracks.map(function (x) { return x.gainDb; }),
             lufs: p.tracks.map(function (x) { return x.loudnessLufs == null ? null : +x.loudnessLufs.toFixed(1); }),
             status: st ? st.textContent.slice(0, 320) : '' };
  })()`);

  console.log('\n  the Normalise button itself:');
  if (ui.noHooks || ui.noButton) {
    ok(false, 'the levelling button can be driven at all', JSON.stringify(ui));
  } else {
    console.log('    ' + ui.status);
    const landed = ui.lufs.map(function (l, i) { return l == null ? null : +(l + ui.gains[i]).toFixed(1); });
    console.log('    measured ' + ui.lufs.join(' / ') + ' LUFS, given ' + ui.gains.join(' / ') +
                ' dB, so they land on ' + landed.join(' / '));
    ok(ui.gains[0] !== ui.gains[1],
       'each record is given a gain of its own, which is what levelling is',
       ui.gains.join(' and '));
    ok(landed.every(function (v) { return v != null && Math.abs(v + 20) < 0.15; }),
       'and every one of them lands on the target',
       landed.join(' / ') + ' against -20');
    ok(!/cannot go higher without clipping/.test(ui.status),
       'no single record is allowed to set the level for all the others');
  }

  console.log(fails ? '\n' + fails + ' FAILED'
                    : '\nthe set arrives at the level it was asked for, and nothing is squashed to get there');
  app.exit(fails ? 1 : 0);
});
