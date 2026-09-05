/* §6.4 edit lists. The assertion that matters is order of operations: regions
   must be assembled at source tempo and stretched once, not stretched and then
   joined. A stretched-then-joined edit list clicks at every join, so the same
   jump test that validated the full render catches it here. */
const http = require('http'), fs = require('fs'), path = require('path');
const puppeteer = require('puppeteer-core');
const ROOT = path.join(__dirname, '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json' };
const server = http.createServer((q, r) => {
  if (q.url === '/favicon.ico') { r.writeHead(204); r.end(); return; }
  fs.readFile(path.join(ROOT, q.url.split('?')[0]), (e, b) => {
    if (e) { r.writeHead(404); r.end(''); return; }
    r.writeHead(200, { 'Content-Type': MIME[path.extname(q.url.split('?')[0])] || 'application/octet-stream' });
    r.end(b);
  });
});

let fails = 0;
(async () => {
  await new Promise(r => server.listen(8743, r));
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new', args: ['--no-sandbox']
  });
  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  page.on('console', m => {
    const w = (m.location() && m.location().url) || '';
    if (m.type() === 'error' && !/favicon/.test(w)) errs.push(m.text());
  });
  await page.goto('http://localhost:8743/mix-builder.html', { waitUntil: 'networkidle0' });

  const R = await page.evaluate(async () => {
    const DSP = window.MixDSP, MP = window.MixProject, MR = window.MixRender;
    const ctx = new AudioContext(), sr = ctx.sampleRate;
    const log = [];
    const BPM = 120, barSec = 60 / BPM * 4;   // 2 s per bar

    // A source where every bar is identifiable: bar N carries a tone at
    // 200 + N*20 Hz, over a continuous bass so a join has something to click on.
    const SECS = 64;
    const src = ctx.createBuffer(2, Math.floor(sr * SECS), sr);
    for (let c = 0; c < 2; c++) {
      const d = src.getChannelData(c);
      for (let i = 0; i < d.length; i++) {
        const t = i / sr;
        const bar = Math.floor(t / barSec);
        d[i] = 0.3 * Math.sin(2 * Math.PI * (200 + bar * 20) * t)
             + 0.25 * Math.sin(2 * Math.PI * 60 * t);
      }
    }

    // --- assembled length
    const regions = [{ startSec: 16, bars: 4 }, { startSec: 4, bars: 6 }];
    const wantSec = (4 + 6) * barSec - DSP.REGION_JOIN_SEC;
    const gotSec = DSP.assembledSourceSec(regions, barSec);
    log.push(['assembled length accounts for the joins',
              gotSec.toFixed(3) + 's vs ' + wantSec.toFixed(3) + 's',
              Math.abs(gotSec - wantSec) < 1e-6]);

    const asm = DSP.assembleRegions(ctx, src, regions, barSec);
    log.push(['assembled buffer matches that length',
              asm.duration.toFixed(3) + 's',
              Math.abs(asm.duration - wantSec) < 0.002]);

    // --- the join must not click
    const jump = (data) => {
      let mx = 0, at = 0;
      for (let i = 1; i < data.length; i++) {
        const d = Math.abs(data[i] - data[i - 1]);
        if (d > mx) { mx = d; at = i; }
      }
      return { mx, at };
    };
    const srcJump = jump(src.getChannelData(0)).mx;
    const asmJump = jump(asm.getChannelData(0));
    log.push(['the region join does not click',
              'largest jump ' + asmJump.mx.toFixed(5) + ' at ' +
              (asmJump.at / sr).toFixed(2) + 's; source reaches ' + srcJump.toFixed(5),
              asmJump.mx <= srcJump * 1.35]);

    /* Proof the ORDER matters. The artifact from stretching each region and
       joining afterwards is NOT a click — a stretched buffer fades in from zero
       and out to zero, so the join is smooth. It is a DROPOUT: the level falls
       to silence and back at every join. Measure the RMS across the join, not
       the sample jump, or the test looks clean while the audio has a hole in
       it. */
    const bad = [
      DSP.stretch(ctx, DSP.slice(ctx, src, 16, 4 * barSec), 1.04),
      DSP.stretch(ctx, DSP.slice(ctx, src, 4, 6 * barSec), 1.04)
    ];
    const badLen = bad[0].length + bad[1].length;
    const badBuf = ctx.createBuffer(2, badLen, sr);
    for (let c = 0; c < 2; c++) {
      badBuf.getChannelData(c).set(bad[0].getChannelData(c), 0);
      badBuf.getChannelData(c).set(bad[1].getChannelData(c), bad[0].length);
    }
    const good = DSP.stretchRamp(ctx, DSP.assembleRegions(ctx, src, regions, barSec), 1.04, 1.04);

    // Lowest short-window RMS anywhere in the middle of the buffer, as a
    // fraction of the buffer's typical level. A dropout shows up immediately.
    const dip = (buf) => {
      const d = buf.getChannelData(0);
      const W = Math.round(sr * 0.005);
      let overall = 0;
      for (let i = 0; i < d.length; i++) overall += d[i] * d[i];
      overall = Math.sqrt(overall / d.length);
      let lowest = Infinity;
      // Skip the first and last 100 ms: every stretched buffer tapers at its
      // ends by design, and that is not a join.
      const skip = Math.round(sr * 0.1);
      for (let i = skip; i + W < d.length - skip; i += W) {
        let s = 0;
        for (let k = 0; k < W; k++) s += d[i + k] * d[i + k];
        lowest = Math.min(lowest, Math.sqrt(s / W));
      }
      return lowest / (overall || 1);
    };
    const badDip = dip(badBuf), goodDip = dip(good);
    log.push(['stretch-then-join drops out at the join',
              'level falls to ' + (badDip * 100).toFixed(1) + '% of normal',
              badDip < 0.3]);
    log.push(['assemble-then-stretch holds its level',
              'lowest ' + (goodDip * 100).toFixed(1) + '% of normal, vs ' +
              (badDip * 100).toFixed(1) + '% the wrong way round',
              goodDip > badDip * 2 && goodDip > 0.4]);
    const goodJump = jump(good.getChannelData(0));
    log.push(['assemble-first survives the stretch cleanly',
              'largest jump ' + goodJump.mx.toFixed(4) + '; source reaches ' + srcJump.toFixed(4),
              goodJump.mx <= srcJump * 1.4]);

    // --- layout and plan agree about an edit list
    const tracks = [0, 1, 2].map(i => ({
      id: 't' + i, title: 'T' + (i + 1), file: 't' + i + '.mp3', fileSize: 7 + i,
      sourceBpm: BPM + i * 2, bpmMultiplier: 1, downbeatSec: 0,
      entrySec: 0, exitSec: 40, durationSec: SECS, linked: true,
      regions: i === 1 ? regions : null
    }));
    const project = Object.assign(MP.emptyProject('regions'), { tracks });
    MP.rebuildJunctions(project, {});
    project.junctions.forEach(j => { if (j.type === 'blend') j.bars = 2; });

    const lay = MP.layout(project);
    const plan = MR.buildPlan(project);
    // Track 1 runs at 122 BPM, not 120, so its bars are shorter — the expected
    // length has to use the track's own tempo, not the one the source was
    // written at.
    const bar1 = 60 / tracks[1].sourceBpm * 4;
    const want1 = DSP.assembledSourceSec(regions, bar1);
    log.push(['layout measures the edit list at the track\'s own tempo',
              'layout ' + lay.tracks[1].bodySec.toFixed(3) + 's, plan ' +
              plan.tracks[1].sourceSec.toFixed(3) + 's, expected ' + want1.toFixed(3) + 's',
              Math.abs(lay.tracks[1].bodySec - want1) < 0.01 &&
              Math.abs(plan.tracks[1].sourceSec - want1) < 0.01]);
    log.push(['layout and plan agree with each other',
              (lay.tracks[1].bodySec - plan.tracks[1].sourceSec).toExponential(1) + 's apart',
              Math.abs(lay.tracks[1].bodySec - plan.tracks[1].sourceSec) < 1e-6]);

    // --- a full render with an edit list in it
    const buffers = new Map();
    tracks.forEach(t => buffers.set(t.id, src));
    const res = await MR.render(project, buffers, { ctx, measureAlignment: true });
    const m = await MR.measure(res.blob, sr);
    log.push(['a set containing an edit list renders',
              m.durationSec.toFixed(2) + 's, planned ' + plan.totalSec.toFixed(2) + 's',
              Math.abs(m.durationSec - plan.totalSec) < 0.3]);
    log.push(['still no clipping', m.samplesAtFullScale + ' samples at full scale',
              m.samplesAtFullScale === 0]);
    log.push(['still no flams', 'worst ' + res.report.worstLagMs + ' ms',
              res.report.flams === 0]);

    // Region joins must survive into the finished mix.
    const ab = await res.blob.arrayBuffer();
    const v = new DataView(ab);
    const n = Math.floor((ab.byteLength - 44) / 4);
    let mixJump = 0, prev = 0;
    for (let i = 0; i < n; i++) {
      const s = v.getInt16(44 + i * 4, true) / 32768;
      if (i > 0) mixJump = Math.max(mixJump, Math.abs(s - prev));
      prev = s;
    }
    log.push(['no click anywhere in the finished mix',
              'largest jump ' + mixJump.toFixed(4) + '; source reaches ' + srcJump.toFixed(4),
              mixJump <= srcJump * 1.4]);

    return log;
  });

  await browser.close(); server.close();
  R.forEach(([n, d, p]) => { if (!p) fails++; console.log((p ? '  ok   ' : '  FAIL ') + n.padEnd(46) + d); });
  if (errs.length) { console.log('\npage errors:'); errs.forEach(e => console.log('  ' + e)); }
  console.log(fails || errs.length ? '\n' + (fails + errs.length) + ' FAILURES'
                                   : '\nall ' + R.length + ' region checks passed');
  process.exit(fails || errs.length ? 1 : 0);
})().catch(e => { console.error('HARNESS FAILED:', e); process.exit(2); });
