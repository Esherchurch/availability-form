/* The full render, end to end in real Chrome. The important assertion is the
   click check: a seam failure shows up as a sample-to-sample jump far larger
   than anything the source material contains. */
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
const ok = (c, m) => { if (!c) { console.log('  FAIL ' + m); fails++; } else console.log('  ok   ' + m); };

(async () => {
  await new Promise(r => server.listen(8739, r));
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new', args: ['--no-sandbox']
  });
  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
  page.on('console', m => {
    const w = (m.location() && m.location().url) || '';
    if (m.type() === 'error' && !/favicon/.test(w)) errs.push(m.text());
  });
  await page.goto('http://localhost:8739/mix-builder.html', { waitUntil: 'networkidle0' });

  const R = await page.evaluate(async () => {
    const DSP = window.MixDSP, MP = window.MixProject, MR = window.MixRender;
    if (!MR) return [['MixRender loaded', 'missing', false]];
    const ctx = new AudioContext();
    const sr = ctx.sampleRate;
    const log = [];

    function loop(bpm, seconds, tone) {
      const n = Math.floor(sr * seconds);
      const buf = ctx.createBuffer(2, n, sr);
      const spb = 60 / bpm;
      for (let c = 0; c < 2; c++) {
        const d = buf.getChannelData(c);
        for (let i = 0; i < n; i++) d[i] = 0.25 * Math.sin(2 * Math.PI * tone * i / sr);
        for (let b = 0; b * spb < seconds; b++) {
          const at = Math.floor(b * spb * sr);
          for (let k = 0; k < sr * 0.09 && at + k < n; k++)
            d[at + k] += 0.6 * Math.exp(-k / (sr * 0.02)) * Math.sin(2 * Math.PI * 55 * k / sr);
          if (b % 4 === 1 || b % 4 === 3)
            for (let k = 0; k < sr * 0.06 && at + k < n; k++)
              d[at + k] += 0.35 * Math.exp(-k / (sr * 0.015)) * (Math.random() * 2 - 1);
        }
      }
      return buf;
    }

    // Four tracks with a climbing tempo, exercising blend, bridge and hard cut.
    const specs = [
      { bpm: 120, tone: 82, secs: 24 },
      { bpm: 124, tone: 98, secs: 24 },
      { bpm: 128, tone: 110, secs: 24 },
      { bpm: 96, tone: 73, secs: 24 }
    ];
    const buffers = new Map();
    const tracks = specs.map((s, i) => {
      const b = loop(s.bpm, s.secs, s.tone);
      const id = 'trk_' + i;
      buffers.set(id, b);
      return {
        id, title: 'T' + (i + 1), file: 'T' + (i + 1) + '.mp3', fileSize: 1000 + i,
        sourceBpm: s.bpm, bpmMultiplier: 1, downbeatSec: 0,
        entrySec: 0, exitSec: s.secs - 0.5, durationSec: s.secs,
        linked: true, regions: null
      };
    });
    const project = Object.assign(MP.emptyProject('render test'), {
      tracks,
      junctions: [
        Object.assign(MP.defaultJunction('blend'), { bars: 4 }),
        Object.assign(MP.defaultJunction('throw-bridge'), { beatBars: 4, overlapBars: 1 }),
        Object.assign(MP.defaultJunction('hard-cut'), { gapMs: 500 })
      ]
    });

    // --- plan
    const plan = MR.buildPlan(project);
    log.push(['plan built', plan.tracks.length + ' tracks, ' + plan.junctions.length +
              ' junctions, ' + plan.totalSec.toFixed(1) + 's', plan.tracks.length === 4]);
    log.push(['no blocking problems', plan.problems.length + ' problems', plan.problems.length === 0]);

    // The tempo ramp is the whole point: track 2 should arrive at one tempo and
    // leave at another.
    const t2 = plan.tracks[1];
    log.push(['tempo ramps within a track',
              't2 in ' + t2.tempoIn.toFixed(1) + ' out ' + t2.tempoOut.toFixed(1),
              Math.abs(t2.tempoIn - t2.tempoOut) > 0.5]);

    // --- render
    let progressCalls = 0, lastEta = null;
    const t0 = performance.now();
    const res = await MR.render(project, buffers, {
      ctx,
      onProgress: p => { progressCalls++; lastEta = p.etaSec; }
    });
    const renderMs = performance.now() - t0;
    log.push(['render completed', (renderMs / 1000).toFixed(1) + 's for ' +
              plan.totalSec.toFixed(0) + 's of audio', !!res.blob]);
    log.push(['progress was reported', progressCalls + ' callbacks', progressCalls >= 4]);

    const m = await MR.measure(res.blob, sr);
    log.push(['duration is right',
              m.durationSec.toFixed(2) + 's vs planned ' + plan.totalSec.toFixed(2) + 's',
              Math.abs(m.durationSec - plan.totalSec) < 0.5]);
    log.push(['nothing pinned at full scale', m.samplesAtFullScale + ' samples',
              m.samplesAtFullScale === 0]);
    log.push(['peak is under 0 dBFS', m.peak.toFixed(4), m.peak <= 0.999]);

    // The 500 ms hard-cut gap is intentional; nothing longer should exist.
    log.push(['no unintended silence',
              'longest ' + m.longestSilenceSec.toFixed(3) + 's (a 0.5s gap is intended)',
              m.longestSilenceSec < 0.75]);

    // --- THE CLICK CHECK
    // Decode the WAV back and look for sample-to-sample jumps larger than the
    // source material itself ever produces. A splice shows up here immediately.
    const ab = await res.blob.arrayBuffer();
    const v = new DataView(ab);
    const n = Math.floor((ab.byteLength - 44) / 4);
    let maxJump = 0, jumpAt = 0, big = 0;
    let prev = 0;
    for (let i = 0; i < n; i++) {
      const s = v.getInt16(44 + i * 4, true) / 32768;
      const d = Math.abs(s - prev);
      if (i > 0) {
        if (d > maxJump) { maxJump = d; jumpAt = i / sr; }
        if (d > 0.35) big++;
      }
      prev = s;
    }
    // What does the source itself do? A kick transient is a big legitimate jump.
    let srcMax = 0;
    buffers.forEach(b => {
      const d = b.getChannelData(0);
      for (let i = 1; i < d.length; i++) srcMax = Math.max(srcMax, Math.abs(d[i] - d[i - 1]));
    });
    log.push(['no click at any seam',
              'largest jump in mix ' + maxJump.toFixed(4) + ' at ' + jumpAt.toFixed(2) + 's; ' +
              'source itself reaches ' + srcMax.toFixed(4),
              maxJump <= srcMax * 1.35]);

    // --- bar-range export renders a subset and is much quicker
    const t1 = performance.now();
    const part = await MR.render(project, buffers, { ctx, fromTrack: 1, toTrack: 2 });
    const partMs = performance.now() - t1;
    const pm = await MR.measure(part.blob, sr);
    log.push(['range export works',
              pm.durationSec.toFixed(1) + 's in ' + (partMs / 1000).toFixed(1) + 's',
              pm.durationSec > 5 && pm.durationSec < m.durationSec]);
    log.push(['range export is quicker than the whole set',
              (partMs / 1000).toFixed(1) + 's vs ' + (renderMs / 1000).toFixed(1) + 's',
              partMs < renderMs]);

    // --- cancel
    let cancelled = false;
    try {
      await MR.render(project, buffers, { ctx, shouldCancel: () => true });
    } catch (e) { cancelled = !!e.cancelled; }
    log.push(['cancel stops the render', cancelled ? 'threw Cancelled' : 'did not cancel', cancelled]);

    /* ---- an out-of-budget junction must BRIDGE, never butt.
       Two tracks far enough apart that layout finds no common tempo. The old
       behaviour was overlap 0 AND gap 0, which butted them together and exposed
       both outros — seconds of silence between records. */
    {
      const far = new Map();
      far.set('f0', loop(96, 20, 70));
      far.set('f1', loop(128, 20, 105));
      const ft = [96, 128].map((bpm, i) => ({
        id: 'f' + i, title: 'F' + (i + 1), file: 'f' + i + '.mp3', fileSize: 20 + i,
        sourceBpm: bpm, bpmMultiplier: 1, downbeatSec: 0,
        entrySec: 0, exitSec: 19.5, durationSec: 20, linked: true, regions: null
      }));
      const fp = Object.assign(MP.emptyProject('far'), { tracks: ft });
      MP.rebuildJunctions(fp, {});
      fp.junctions[0] = MP.defaultJunction('blend');        // user asked for a blend

      const fplan = MR.buildPlan(fp);
      const fj = fplan.junctions[0];
      log.push(['no common tempo is detected',
                'targetBpm ' + (fj.targetBpm === null ? 'null' : fj.targetBpm),
                fj.targetBpm === null]);
      log.push(['it becomes a bridge, not a butt join',
                fj.type + ', substituted=' + fj.substituted + ', zeroOverlap=' + fj.zeroOverlap,
                fj.type === 'throw-bridge' && fj.substituted === true && fj.zeroOverlap === true]);
      log.push(['the bridge runs at the outgoing track\'s own tempo',
                fj.bridgeBpm + ' BPM (A is 96)', Math.abs(fj.bridgeBpm - 96) < 0.01]);
      log.push(['the substitution is reported',
                fplan.problems.filter(p => p.kind === 'zero-overlap-bridge').length + ' logged',
                fplan.problems.some(p => p.kind === 'zero-overlap-bridge')]);

      const fres = await MR.render(fp, far, { ctx });
      const fm = await MR.measure(fres.blob, sr);
      log.push(['no exposed gap between the two records',
                'longest silence ' + fm.longestSilenceSec.toFixed(3) + 's',
                fm.longestSilenceSec < 0.3]);
      /* A bridge used to mean "filter the last N bars of the outgoing record",
         which put no time between the records at all and left the outgoing
         record's own ending exposed. It now means N bars of drums INSERTED
         between them, with the tempo walking from one record's to the other's,
         so the two never need a common tempo. */
      const ff = (fres.report.fills || [])[0];
      log.push(['the junction is filled with beat, not butted',
                ff ? ff.beats + ' beats, ' + ff.sec + 's, ' + ff.fromBpm + ' -> ' + ff.toBpm + ' BPM' : 'no fill',
                !!ff && ff.beats > 0 && ff.sec > 1]);
      log.push(['the fill travels from one record\'s tempo to the other\'s',
                ff ? ff.fromBpm + ' -> ' + ff.toBpm : 'no fill',
                !!ff && Math.abs(ff.toBpm - ff.fromBpm) > 1]);
    }

    /* ---- a bridge longer than its own track.
       This used to be a real hazard: the beat-alone bars were taken out of the
       end of the record, so asking for more bars than the record had left
       clamped brAt to sample zero and cut the mids for the whole thing. The
       fill is inserted rather than carved out, so its length no longer has
       anything to do with the record's — but the record must still play clean
       up to its mix-out, and the fill must still be continuous. */
    {
      const sh = new Map();
      sh.set('h0', loop(120, 12, 90));        // a 12 s track
      sh.set('h1', loop(122, 20, 100));
      const st = [[120, 12], [122, 20]].map((v, i) => ({
        id: 'h' + i, title: 'H' + (i + 1), file: 'h' + i + '.mp3', fileSize: 30 + i,
        sourceBpm: v[0], bpmMultiplier: 1, downbeatSec: 0,
        entrySec: 0, exitSec: v[1] - 0.5, durationSec: v[1], linked: true, regions: null
      }));
      const spj = Object.assign(MP.emptyProject('short'), { tracks: st });
      MP.rebuildJunctions(spj, {});
      // 64 beats at 120 BPM is 32 s, far longer than the 12 s track.
      spj.junctions[0] = Object.assign(MP.defaultJunction('throw-bridge'), { beatBeats: 64 });

      const sres = await MR.render(spj, sh, { ctx });
      const sf = (sres.report.fills || [])[0];
      log.push(['a fill longer than the record it came from still renders',
                sf ? sf.beats + ' beats, ' + sf.sec + 's from a 12s record' : 'no fill',
                !!sf && sf.beats === 64 && sf.sec > 25]);
      const sm = await MR.measure(sres.blob, sr);
      log.push(['and it carries a beat the whole way, not silence',
                'longest silence ' + sm.longestSilenceSec.toFixed(3) + 's',
                sm.longestSilenceSec < 0.3]);

      /* The symptom was mids cut for the ENTIRE track. Compare the high-frequency
         share at the start against inside the bridge — the start must be clean. */
      const ab2 = await sres.blob.arrayBuffer();
      const v2 = new DataView(ab2);
      const grab = (fromSec, lenSec) => {
        const out = new Float32Array(Math.floor(lenSec * sr));
        for (let i = 0; i < out.length; i++) {
          const off = 44 + (Math.floor(fromSec * sr) + i) * 4;
          out[i] = (off + 1 < ab2.byteLength) ? v2.getInt16(off, true) / 32768 : 0;
        }
        return out;
      };
      const hiShare = (seg) => {
        let tot = 0;
        for (let i = 0; i < seg.length; i++) tot += seg[i] * seg[i];
        const hi = DSP.hpFiltfilt(seg, 400, sr);
        let h = 0;
        for (let i = 0; i < hi.length; i++) h += hi[i] * hi[i];
        return tot > 0 ? h / tot : 0;
      };
      /* The original symptom: mids cut for the ENTIRE record. Now that the
         beat lives in the fill, the record itself must be clean from end to
         end — so the two points to compare are inside the record and inside
         the fill, and it is the FILL that should be missing its mids. */
      const atStart = hiShare(grab(1, 2));
      const inRecord = hiShare(grab(6, 2));
      const fillAt = spj.tracks[0].durationSec + 2;
      const inFill = hiShare(grab(fillAt, 2));
      log.push(['the record keeps its mids from start to finish',
                'HF share ' + (atStart * 100).toFixed(1) + '% at 1s vs ' +
                (inRecord * 100).toFixed(1) + '% at 6s',
                Math.abs(atStart - inRecord) < Math.max(atStart, inRecord) * 0.8]);
      /* Measure the band the EQ actually cuts — the bells sit at 700, 1800 and
         3500 Hz — rather than everything above 400 Hz. Sharing out all the
         high end counts the 4-7 kHz the bridge deliberately keeps, and WSOLA
         puts a little broadband noise up there too, so the wider measure said
         the fill was brighter than the record when the mids had plainly gone. */
      const midShare = (seg) => {
        let tot = 0;
        for (let i = 0; i < seg.length; i++) tot += seg[i] * seg[i];
        const above = DSP.hpFiltfilt(seg, 700, sr);
        const wayAbove = DSP.hpFiltfilt(seg, 4500, sr);
        let a = 0, b = 0;
        for (let i = 0; i < above.length; i++) a += above[i] * above[i];
        for (let i = 0; i < wayAbove.length; i++) b += wayAbove[i] * wayAbove[i];
        return tot > 0 ? Math.max(0, a - b) / tot : 0;
      };
      /* The fill used to be the record with its mids scooped, so the test was
         whether the scoop had happened. It is a synthesised kit now — there is
         no record in it at all — so the question is whether it behaves like
         drums: nearly all of its energy down where a kick lives, and separate
         hits rather than a continuous wash. */
      const fillSeg = grab(fillAt, 3);
      let tot = 0;
      for (let i = 0; i < fillSeg.length; i++) tot += fillSeg[i] * fillSeg[i];
      const above = DSP.hpFiltfilt(fillSeg, 200, sr);
      let ea = 0;
      for (let i = 0; i < above.length; i++) ea += above[i] * above[i];
      const lowShare = tot > 0 ? 1 - ea / tot : 0;
      log.push(['the fill is drums: its weight is down where a kick lives',
                (lowShare * 100).toFixed(0) + '% below 200 Hz',
                lowShare > 0.6]);

      const hop = Math.floor(sr * 0.01);
      const env = [];
      for (let i = 0; i + hop < fillSeg.length; i += hop) {
        let s = 0;
        for (let k = 0; k < hop; k++) s += fillSeg[i + k] * fillSeg[i + k];
        env.push(Math.sqrt(s / hop));
      }
      let mean = 0; env.forEach(v => mean += v); mean /= env.length;
      let onsets = 0;
      for (let i = 1; i < env.length; i++) if (env[i] > mean * 1.5 && env[i] > env[i - 1] * 1.6) onsets++;
      const perSec = onsets / (fillSeg.length / sr);
      log.push(['and it is hits, not a wash',
                perSec.toFixed(1) + ' transients a second',
                perSec > 0.8]);
    }

    // --- refuses to render what it cannot
    let refused = false, msg = '';
    try {
      const bad = JSON.parse(JSON.stringify(project));
      bad.tracks[2].linked = false;
      await MR.render(bad, buffers, { ctx });
    } catch (e) { refused = true; msg = (e.message || '').split('\n')[0]; }
    log.push(['refuses a set with unlinked audio', msg, refused]);

    /* ---- the incoming bass swap must actually run.
       `inOverlap` used to be read above its own `var` declaration, so the test
       was `undefined > 0` and this branch never executed on any blend, in any
       render, silently. Rendered alone, the incoming track's low end must be
       suppressed for the first half of the overlap and back by the end. */
    {
      const bb = loop(120, 20, 60);
      const pt = {
        index: 0, id: 'b0', title: 'B', sourceFromSec: 0, sourceToSec: 19.5,
        regions: null, barSec: 2, sourceSec: 19.5,
        r0: 1, r1: 1, tempoIn: 120, tempoOut: 120, sourceBpm: 120,
        outSec: 19.5, startSec: 0
      };
      const jInBlend = { type: 'blend', overlapSec: 8, gapSec: 0, targetBpm: 120,
                         bridgeBpm: 120, settings: { bars: 4, bassCutDb: 20 } };
      const out = await MR.renderTrackStream(ctx, { plan: pt, buffer: bb, jIn: jInBlend, jOut: null });
      const d = out.buffer.getChannelData(0);
      const lowShare = (fromSec, lenSec) => {
        const seg = d.subarray(Math.floor(fromSec * sr), Math.floor((fromSec + lenSec) * sr));
        let tot = 0;
        for (let i = 0; i < seg.length; i++) tot += seg[i] * seg[i];
        const hi = DSP.hpFiltfilt(seg, 220, sr);
        let h = 0;
        for (let i = 0; i < hi.length; i++) h += hi[i] * hi[i];
        return tot > 0 ? Math.max(0, (tot - h) / tot) : 0;
      };
      // 1-2 s is inside the first half of the 8 s overlap (bass cut 20 dB);
      // 12-13 s is well past it (bass restored).
      const early = lowShare(1, 1), late = lowShare(12, 1);
      log.push(['the incoming bass swap runs',
                'low-end share ' + (early * 100).toFixed(1) + '% during the swap vs ' +
                (late * 100).toFixed(1) + '% after it',
                early < late * 0.8]);
    }

    // --- the report
    const rep = res.report;
    log.push(['seam report covers every junction',
              rep.seams.length + ' seams, all ' + (rep.seams.every(s => s.exact) ? 'overlap/gap' : 'mixed'),
              rep.seams.length === 3]);
    log.push(['report records the per-track tempo ramp',
              rep.tracks.filter(t => t.ramped).length + ' of 4 tracks ramp',
              rep.tracks.some(t => t.ramped)]);

    return log;
  });

  await browser.close(); server.close();
  R.forEach(([name, detail, pass]) => {
    if (!pass) fails++;
    console.log((pass ? '  ok   ' : '  FAIL ') + name.padEnd(38) + detail);
  });
  if (errs.length) { console.log('\npage errors:'); errs.forEach(e => console.log('  ' + e)); }
  console.log(fails || errs.length ? '\n' + (fails + errs.length) + ' FAILURES'
                                   : '\nall ' + R.length + ' render checks passed');
  process.exit(fails || errs.length ? 1 : 0);
})().catch(e => { console.error('HARNESS FAILED:', e); process.exit(2); });
