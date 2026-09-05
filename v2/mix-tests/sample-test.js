/* §6.6 samples and placements. The assertion that matters is the tempo one: a
   placement must read the INSTANTANEOUS tempo from the ramp at its own output
   position. Reading a per-track figure instead gives a plausible but wrong
   ratio, which drifts against the beat and sounds like a flam. */
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
  await new Promise(r => server.listen(8744, r));
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
  await page.goto('http://localhost:8744/mix-builder.html', { waitUntil: 'networkidle0' });

  const R = await page.evaluate(async () => {
    const DSP = window.MixDSP, MP = window.MixProject, MR = window.MixRender;
    const ctx = new AudioContext(), sr = ctx.sampleRate;
    const log = [];

    const tone = (hz, secs, amp) => {
      const n = Math.floor(sr * secs);
      const b = ctx.createBuffer(2, n, sr);
      for (let c = 0; c < 2; c++) {
        const d = b.getChannelData(c);
        for (let i = 0; i < n; i++) d[i] = (amp == null ? 0.3 : amp) * Math.sin(2 * Math.PI * hz * i / sr);
      }
      return b;
    };

    // ---------- storage round-trip
    const meta = { name: 'Sir Duke horns', tags: ['hook', 'brass'], sourceBpm: 120, bars: 4 };
    const wav = DSP.encodeWav(tone(440, 2));
    const saved = await MP.saveSample(meta, wav);
    const list = await MP.listSamples();
    const back = await MP.getSampleAudio(saved.id);
    log.push(['a sample round-trips through IndexedDB',
              list.length + ' in the library, audio ' + (back ? back.size + ' bytes' : 'missing'),
              list.some(s => s.id === saved.id) && back && back.size === wav.size]);

    // ---------- prepare: normalised to -1 dBFS, nothing else baked in
    const quiet = tone(300, 1, 0.05);
    const prepared = await DSP.prepareSample(ctx, quiet, { highPassHz: 0 });
    let pk = 0;
    const pd = prepared.getChannelData(0);
    for (let i = 0; i < pd.length; i++) pk = Math.max(pk, Math.abs(pd[i]));
    log.push(['prepare normalises to -1 dBFS',
              'peak ' + (20 * Math.log10(pk)).toFixed(2) + ' dBFS',
              Math.abs(20 * Math.log10(pk) + 1) < 0.15]);
    log.push(['and does not alter length (stretch is per-use, not baked in)',
              prepared.duration.toFixed(3) + 's vs ' + quiet.duration.toFixed(3) + 's',
              Math.abs(prepared.duration - quiet.duration) < 1e-6]);

    // ---------- THE TEMPO ASSERTION
    // One track ramping hard, so a per-track figure and the instantaneous
    // figure are far apart and a mistake would show.
    const pt = { r0: 0.94, r1: 1.06, outSec: 240, sourceBpm: 120, startSec: 0 };
    const fakePlan = { tracks: [pt, { startSec: 240, outSec: 100, r0: 1, r1: 1, sourceBpm: 120 }],
                       junctions: [{ targetBpm: 120, overlapSec: 8 }] };
    const early = MR.tempoAtMixTime(fakePlan, 10);
    const late = MR.tempoAtMixTime(fakePlan, 230);
    log.push(['tempo at a point is read from the ramp, not the track',
              'at 10s: ' + early.toFixed(2) + ' BPM, at 230s: ' + late.toFixed(2) + ' BPM',
              Math.abs(late - early) > 12]);
    const naive = pt.sourceBpm;   // what "the track's tempo" would have given
    log.push(['a per-track figure would be wrong by a real amount',
              'naive ' + naive + ' vs actual ' + late.toFixed(2) + ' at 230s (' +
              (Math.abs(late - naive) / naive * 100).toFixed(1) + '% out)',
              Math.abs(late - naive) / naive > 0.03]);

    // ---------- a real render with a placement in it
    function loop(bpm, tn, secs) {
      const n = Math.floor(sr * secs);
      const b = ctx.createBuffer(2, n, sr);
      const spb = 60 / bpm;
      for (let c = 0; c < 2; c++) {
        const d = b.getChannelData(c);
        for (let i = 0; i < n; i++) d[i] = 0.2 * Math.sin(2 * Math.PI * tn * i / sr);
        for (let k = 0; k * spb < secs; k++) {
          const at = Math.floor(k * spb * sr);
          for (let j = 0; j < sr * 0.08 && at + j < n; j++)
            d[at + j] += 0.55 * Math.exp(-j / (sr * 0.02)) * Math.sin(2 * Math.PI * 55 * j / sr);
        }
      }
      return b;
    }
    const buffers = new Map();
    const tracks = [110, 118, 126].map((bpm, i) => {
      buffers.set('s' + i, loop(bpm, 90 + i * 20, 40));
      return {
        id: 's' + i, title: 'S' + (i + 1), file: 's' + i + '.mp3', fileSize: 3 + i,
        sourceBpm: bpm, bpmMultiplier: 1, downbeatSec: 0,
        entrySec: 0, exitSec: 39.5, durationSec: 40, linked: true, regions: null
      };
    });
    const project = Object.assign(MP.emptyProject('samples'), { tracks });
    MP.rebuildJunctions(project, {});
    project.junctions.forEach(j => { if (j.type === 'blend') j.bars = 4; });

    const sampleBuffers = new Map([['smp_x', tone(660, 3)]]);
    const sampleMeta = new Map([['smp_x', { name: 'stab', sourceBpm: 116 }]]);
    MP.addPlacement(project, { sampleId: 'smp_x', atJunction: 0, barsBeforeEntry: 2, gainDb: -6 });
    MP.addPlacement(project, { sampleId: 'smp_x', atJunction: 1, barsBeforeEntry: 2, gainDb: -6 });

    const res = await MR.render(project, buffers, {
      ctx, sampleBuffers, sampleMeta, measureAlignment: true
    });
    const pl = res.report.placements || [];
    log.push(['both placements rendered', pl.length + ' placed', pl.length === 2]);
    log.push(['the same sample gets DIFFERENT ratios at different junctions',
              pl.map(p => p.ratio.toFixed(3) + ' @ ' + p.tempoThere.toFixed(1) + ' BPM').join(', '),
              pl.length === 2 && Math.abs(pl[0].ratio - pl[1].ratio) > 0.01]);
    // A sample far from the tempo where it lands cannot be stretched into
    // place. Clamping stops it sounding mangled but it is still at the wrong
    // tempo and will drift — that has to be said, not silently accepted.
    const farMeta = new Map([['smp_x', { name: 'stab', sourceBpm: 90 }]]);
    const farRes = await MR.render(project, buffers, { ctx, sampleBuffers, sampleMeta: farMeta });
    const clampedPl = (farRes.report.placements || []).filter(p => p.clamped);
    const clampWarn = (farRes.report.warnings || []).filter(w => w.placement);
    log.push(['an out-of-range sample is clamped AND flagged',
              clampedPl.length + ' clamped, ' + clampWarn.length + ' warnings',
              clampedPl.length > 0 && clampWarn.length === clampedPl.length]);
    log.push(['an in-range sample is not flagged',
              (res.report.warnings || []).filter(w => w.placement).length + ' warnings',
              (res.report.warnings || []).filter(w => w.placement).length === 0]);

    log.push(['ratios respect the sample stretch budget',
              'max |ratio-1| ' + Math.max(...pl.map(p => Math.abs(p.ratio - 1))).toFixed(3),
              pl.every(p => Math.abs(p.ratio - 1) <= (project.maxSampleStretch || 0.15) + 1e-9)]);

    const m = await MR.measure(res.blob, sr);
    log.push(['the mix with samples still does not clip',
              m.samplesAtFullScale + ' at full scale, peak ' + m.peak.toFixed(4),
              m.samplesAtFullScale === 0]);
    log.push(['and still has no flams', 'worst ' + res.report.worstLagMs + ' ms',
              res.report.flams === 0]);

    // A placement must actually be audible in the output — a silently dropped
    // overlay would pass every check above.
    const withOut = await MR.render(project, buffers, { ctx });   // no sampleBuffers
    const a1 = await res.blob.arrayBuffer(), a2 = await withOut.blob.arrayBuffer();
    const v1 = new DataView(a1), v2 = new DataView(a2);
    const n = Math.min(Math.floor((a1.byteLength - 44) / 4), Math.floor((a2.byteLength - 44) / 4));
    let diff = 0;
    for (let i = 0; i < n; i += 7) {
      diff = Math.max(diff, Math.abs(v1.getInt16(44 + i * 4, true) - v2.getInt16(44 + i * 4, true)) / 32768);
    }
    log.push(['the placement is actually present in the audio',
              'largest difference with/without samples ' + diff.toFixed(4), diff > 0.02]);

    // ---------- placements survive an edit, or are pruned honestly
    const pruned = MP.prunePlacements(project);
    log.push(['valid placements are not pruned', pruned + ' removed', pruned === 0]);
    MP.removeTrack(project, 2);
    const pruned2 = MP.prunePlacements(project);
    log.push(['a placement on a junction that no longer exists is dropped',
              pruned2 + ' removed after deleting a track', pruned2 === 1]);

    await MP.deleteSample(saved.id);
    const after = await MP.listSamples();
    log.push(['a sample can be deleted', after.length + ' left',
              !after.some(s => s.id === saved.id)]);

    return log;
  });

  await browser.close(); server.close();
  R.forEach(([n, d, p]) => { if (!p) fails++; console.log((p ? '  ok   ' : '  FAIL ') + n.padEnd(52) + d); });
  if (errs.length) { console.log('\npage errors:'); errs.forEach(e => console.log('  ' + e)); }
  console.log(fails || errs.length ? '\n' + (fails + errs.length) + ' FAILURES'
                                   : '\nall ' + R.length + ' sample checks passed');
  process.exit(fails || errs.length ? 1 : 0);
})().catch(e => { console.error('HARNESS FAILED:', e); process.exit(2); });
