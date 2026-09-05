/* End-to-end DSP test in real Chrome. Synthesises two drum loops at known
   tempos, runs them through analyseBeat, then renders each transition type and
   measures the result. Catches a broken lift far better than reading the code. */
const http = require('http'), fs = require('fs'), path = require('path');
const puppeteer = require('puppeteer-core');

const ROOT = require('path').join(__dirname, '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript' };
const server = http.createServer((req, res) => {
  if (req.url === '/favicon.ico') { res.writeHead(204); res.end(); return; }
  const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  fs.readFile(p, (err, buf) => {
    if (err) { res.writeHead(404); res.end(''); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' });
    res.end(buf);
  });
});

(async () => {
  await new Promise(r => server.listen(8732, r));
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new', args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required']
  });
  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await page.goto('http://localhost:8732/mix-builder.html', { waitUntil: 'networkidle0' });

  const out = await page.evaluate(async () => {
    const DSP = window.MixDSP;
    const ctx = new AudioContext();
    const sr = ctx.sampleRate;
    const log = [];

    /* A kick on every beat, a snare on 2 and 4, a hat on eighths, plus a
       sustained bass note — enough structure for onset detection to lock on and
       for the EQ bridge to have something to keep. */
    function makeLoop(bpm, seconds, tone) {
      const n = Math.floor(sr * seconds);
      const buf = ctx.createBuffer(2, n, sr);
      const spb = 60 / bpm;
      for (let ch = 0; ch < 2; ch++) {
        const d = buf.getChannelData(ch);
        for (let i = 0; i < n; i++) {
          const t = i / sr;
          d[i] = 0.12 * Math.sin(2 * Math.PI * tone * t);       // sustained bass
        }
        for (let b = 0; b * spb < seconds; b++) {
          const at = Math.floor(b * spb * sr);
          for (let k = 0; k < sr * 0.09 && at + k < n; k++) {    // kick
            const e = Math.exp(-k / (sr * 0.02));
            d[at + k] += 0.85 * e * Math.sin(2 * Math.PI * 55 * (k / sr));
          }
          if (b % 4 === 1 || b % 4 === 3) {                      // snare
            for (let k = 0; k < sr * 0.07 && at + k < n; k++) {
              const e = Math.exp(-k / (sr * 0.015));
              d[at + k] += 0.5 * e * (Math.random() * 2 - 1);
            }
          }
          const off = Math.floor((b + 0.5) * spb * sr);          // hat
          for (let k = 0; k < sr * 0.02 && off + k < n; k++) {
            const e = Math.exp(-k / (sr * 0.004));
            d[off + k] += 0.22 * e * (Math.random() * 2 - 1);
          }
        }
      }
      return buf;
    }

    const A = makeLoop(120, 40, 82);
    const B = makeLoop(126, 40, 110);

    // --- analysis
    const monoA = DSP.toMono(A), monoB = DSP.toMono(B);
    const ra = await DSP.analyseBeat(monoA, sr);
    const rb = await DSP.analyseBeat(monoB, sr);
    log.push(['analyse A', 'want 120, got ' + ra.bpm.toFixed(2) +
              ' (conf ' + ra.confidence.toFixed(2) + ')', Math.abs(ra.bpm - 120) < 1.5]);
    log.push(['analyse B', 'want 126, got ' + rb.bpm.toFixed(2) +
              ' (conf ' + rb.confidence.toFixed(2) + ')', Math.abs(rb.bpm - 126) < 1.5]);

    // --- contentEndSec must not just return the file length
    const withTail = ctx.createBuffer(1, sr * 30, sr);
    withTail.getChannelData(0).set(monoA.subarray(0, sr * 20));   // 20s audio, 10s silence
    const ce = DSP.contentEndSec(withTail.getChannelData(0), sr);
    log.push(['contentEndSec', 'want ~20s, got ' + ce.toFixed(2) + 's', ce > 19 && ce < 21]);

    // --- stretch: length scales, pitch does not collapse, no NaNs
    const st = DSP.stretch(ctx, A, 126 / 120);
    const wantLen = A.length / (126 / 120);
    const stMono = DSP.toMono(st);
    let nan = 0, peak = 0;
    for (let i = 0; i < stMono.length; i++) {
      if (!isFinite(stMono[i])) nan++;
      const a = Math.abs(stMono[i]); if (a > peak) peak = a;
    }
    log.push(['stretch length', 'want ~' + Math.round(wantLen) + ', got ' + st.length,
              Math.abs(st.length - wantLen) < sr * 0.2]);
    log.push(['stretch is clean', nan + ' non-finite, peak ' + peak.toFixed(3),
              nan === 0 && peak > 0.05 && peak < 8]);
    /* Measure the stretched tempo from actual kick spacing, not by running the
       tempo estimator over it. The estimator quantises to integer lag (a true
       126 BPM signal can only ever read 125.00 at this hop) and the tool never
       analyses stretched audio anyway — analysis runs on source files, stretch
       happens at render. Kick spacing is exact and is what beat-matching
       actually depends on. */
    function kickSpacing(data, sampleRate) {
      const hits = [];
      let last = -1e9;
      let pk = 0;
      for (let i = 0; i < data.length; i++) pk = Math.max(pk, Math.abs(data[i]));
      for (let i = 0; i < data.length; i++) {
        if (Math.abs(data[i]) > pk * 0.55 && i - last > sampleRate * 0.15) {
          hits.push(i); last = i;
        }
      }
      const gaps = [];
      for (let i = 1; i < hits.length; i++) gaps.push(hits[i] - hits[i - 1]);
      gaps.sort((a, b) => a - b);
      return gaps.length ? 60 * sampleRate / gaps[Math.floor(gaps.length / 2)] : 0;
    }
    const srcBpm = kickSpacing(monoA, sr);
    const outBpm = kickSpacing(stMono, sr);
    log.push(['stretch hits target',
              'source ' + srcBpm.toFixed(1) + ' -> ' + outBpm.toFixed(1) + ', want 126',
              Math.abs(outBpm - 126) < 2]);

    // --- the deck shape the UI passes in
    const mk = (buf, bpm, r) => ({
      buffer: buf, bpm: bpm, downbeatSec: r.downbeatSec,
      entrySec: r.downbeatSec, exitSec: DSP.contentEndSec(DSP.toMono(buf), sr)
    });
    const deckA = mk(A, 120, ra), deckB = mk(B, 126, rb);

    const measure = (res, name) => {
      const b = res.buffer;
      const m = DSP.toMono(b);
      let pk = 0, bad = 0, sum = 0;
      for (let i = 0; i < m.length; i++) {
        const v = m[i];
        if (!isFinite(v)) bad++;
        const a = Math.abs(v); if (a > pk) pk = a;
        sum += v * v;
      }
      const rms = Math.sqrt(sum / m.length);
      return { name, dur: b.duration, peak: pk, rms, bad,
               clipped: pk > 1.0, silent: rms < 0.001 };
    };

    // --- blend
    const blend = await DSP.renderBlend({
      ctx, a: deckA, b: deckB, targetBpm: 123, bars: 8, bassCutDb: 20
    });
    const mB = measure(blend, 'blend');
    log.push(['blend renders', mB.dur.toFixed(1) + 's, peak ' + mB.peak.toFixed(3) +
              ', rms ' + mB.rms.toFixed(4), !mB.silent && !mB.clipped && mB.bad === 0]);

    // --- bridge (EQ isolation — the default, and the one that matters)
    const bridge = await DSP.renderBridge({
      ctx, a: deckA, b: deckB, targetBpm: 123,
      cutStyle: 'throw', reverbBars: 2, beatBars: 8, isolation: 'eq',
      midCutDb: 24, highCutDb: 0, overlapBars: 1
    });
    const mR = measure(bridge, 'bridge');
    log.push(['bridge renders', mR.dur.toFixed(1) + 's, peak ' + mR.peak.toFixed(3) +
              ', beat ' + bridge.info.beatDb.toFixed(1) + ' dBFS',
              !mR.silent && !mR.clipped && mR.bad === 0]);
    log.push(['bridge beat is audible', bridge.info.quiet ? 'flagged quiet' : 'audible',
              !bridge.info.quiet]);

    /* The lesson that cost the most: the isolated beat must KEEP its low end.
       Straight HPSS left 1% of energy below 200 Hz against 52% in the source.
       Measure the bridge's beat-only stretch and check the bass survived. */
    function bandEnergy(data, from, to, sampleRate) {
      // crude Goertzel-ish band sum over an FFT-free estimate: filter twice
      const lo = DSP.hpFiltfilt(data, from, sampleRate);
      if (!to) { let s = 0; for (let i = 0; i < lo.length; i++) s += lo[i] * lo[i]; return s; }
      let s = 0;
      for (let i = 0; i < data.length; i++) s += data[i] * data[i];
      let sh = 0;
      for (let i = 0; i < lo.length; i++) sh += lo[i] * lo[i];
      return s - sh;    // energy below `from`
    }
    const barSec = 60 / 123 * 4;
    const beatStart = bridge.info.transitionAtSec + 0.03;
    const seg = DSP.slice(ctx, bridge.buffer, beatStart, Math.min(8 * barSec, 6));
    const segMono = DSP.toMono(seg);
    let total = 0; for (let i = 0; i < segMono.length; i++) total += segMono[i] * segMono[i];
    const below200 = bandEnergy(segMono, 200, true, sr);
    const pctLow = total > 0 ? below200 / total * 100 : 0;
    log.push(['bridge keeps its low end', pctLow.toFixed(1) + '% of energy below 200 Hz',
              pctLow > 15]);

    // --- hard cut
    const cut = await DSP.renderHardCut({ ctx, a: deckA, b: deckB, gapMs: 0 });
    const mC = measure(cut, 'hard-cut');
    log.push(['hard cut renders', mC.dur.toFixed(1) + 's, peak ' + mC.peak.toFixed(3),
              !mC.silent && !mC.clipped && mC.bad === 0]);
    const cutGap = await DSP.renderHardCut({ ctx, a: deckA, b: deckB, gapMs: 1500 });
    log.push(['hard cut honours the gap',
              (cutGap.buffer.duration - cut.buffer.duration).toFixed(2) + 's longer',
              Math.abs((cutGap.buffer.duration - cut.buffer.duration) - 1.5) < 0.05]);

    // --- finalise must actually pull a hot buffer down
    const hot = ctx.createBuffer(1, sr, sr);
    const hd = hot.getChannelData(0);
    for (let i = 0; i < sr; i++) hd[i] = 1.8 * Math.sin(2 * Math.PI * 220 * i / sr);
    const fin = DSP.finalise(hot);
    let newPeak = 0;
    for (let i = 0; i < sr; i++) newPeak = Math.max(newPeak, Math.abs(hd[i]));
    log.push(['finalise tames a hot buffer', 'peak 1.80 -> ' + newPeak.toFixed(3),
              newPeak <= 0.99 && newPeak > 0.9]);

    // --- WAV export is a real RIFF file of the right length
    const wav = DSP.encodeWav(cut.buffer);
    const head = new Uint8Array(await wav.slice(0, 12).arrayBuffer());
    const riff = String.fromCharCode.apply(null, head.subarray(0, 4));
    const wave = String.fromCharCode.apply(null, head.subarray(8, 12));
    const expect = 44 + cut.buffer.length * 2 * 2;
    log.push(['wav export', riff + '/' + wave + ', ' + wav.size + ' bytes',
              riff === 'RIFF' && wave === 'WAVE' && wav.size === expect]);

    return log;
  });

  await browser.close();
  server.close();

  let fails = 0;
  out.forEach(([name, detail, pass]) => {
    if (!pass) fails++;
    console.log((pass ? '  ok   ' : '  FAIL ') + name.padEnd(28) + detail);
  });
  if (errs.length) { console.log('\npage errors:'); errs.forEach(e => console.log('  ' + e)); }
  console.log(fails ? '\n' + fails + ' of ' + out.length + ' FAILED' : '\nall ' + out.length + ' DSP checks passed');
  process.exit(fails || errs.length ? 1 : 0);
})().catch(e => { console.error('HARNESS FAILED:', e); process.exit(2); });
