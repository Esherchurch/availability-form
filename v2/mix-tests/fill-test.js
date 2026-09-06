/* The beat fill: beats of drums inserted BETWEEN two records, with the tempo
   walking from one record's to the other's.

   Tempo is measured by autocorrelating a low-band envelope over a narrow band
   of lags around the expected beat, NOT with analyseBeat. On mid-scooped drums
   analyseBeat picks a different metrical level and reads 104 where the audio
   is plainly 89 — the same octave ambiguity that shows up everywhere else. A
   narrow window cannot make that mistake, and the question here is whether the
   period walks, not what a detector calls it. */
const http = require('http'), fs = require('fs'), path = require('path');
const puppeteer = require('puppeteer-core');

const ROOT = path.join(__dirname, '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript' };
const server = http.createServer((q, r) => {
  const u = decodeURIComponent(q.url.split('?')[0]);
  if (u === '/favicon.ico') { r.writeHead(204); r.end(); return; }
  fs.readFile(path.join(ROOT, u), (e, b) => {
    if (e) { r.writeHead(404); r.end(''); return; }
    r.writeHead(200, { 'Content-Type': MIME[path.extname(u)] || 'application/octet-stream' });
    r.end(b);
  });
});

let fails = 0;
const ok = (c, m, x) => { console.log((c ? '  ok   ' : '  FAIL ') + m + (x ? '   ' + x : '')); if (!c) fails++; };

(async () => {
  await new Promise(r => server.listen(8772, r));
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new', args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required']
  });
  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  await page.goto('http://localhost:8772/mix-builder.html', { waitUntil: 'networkidle0' });

  const out = await page.evaluate(async () => {
    const DSP = window.MixDSP, MP = window.MixProject, MR = window.MixRender;
    const ctx = new AudioContext(), sr = ctx.sampleRate;

    // A plain 90 BPM loop: kick on every beat, snare on 2 and 4.
    function loop(bpm, secs) {
      const n = Math.floor(sr * secs), buf = ctx.createBuffer(2, n, sr), spb = 60 / bpm;
      for (let c = 0; c < 2; c++) {
        const d = buf.getChannelData(c);
        for (let i = 0; i < n; i++) d[i] = 0.10 * Math.sin(2 * Math.PI * 110 * i / sr);
        for (let b = 0; b * spb < secs; b++) {
          const at = Math.floor(b * spb * sr);
          for (let k = 0; k < sr * 0.09 && at + k < n; k++)
            d[at + k] += 0.85 * Math.exp(-k / (sr * 0.02)) * Math.sin(2 * Math.PI * 55 * k / sr);
          if (b % 4 === 1 || b % 4 === 3)
            for (let k = 0; k < sr * 0.07 && at + k < n; k++)
              d[at + k] += 0.45 * Math.exp(-k / (sr * 0.015)) * (Math.random() * 2 - 1);
        }
      }
      return buf;
    }

    const FROM = 90, TO = 120, BEATS = 128;   // 32 bars, said in beats
    const src = loop(FROM, 90);
    const fill = await DSP.buildBeatFill({
      source: src, atSec: 88, downbeatSec: 0, beats: BEATS,
      fromBpm: FROM, toBpm: TO, loopBars: 2, midCutDb: 24, highCutDb: 0, sampleRate: sr
    });
    const m = DSP.toMono(fill);

    function periodAt(centreSec, wantBpm) {
      const half = 8;
      const a = Math.max(0, Math.floor((centreSec - half) * sr));
      const b = Math.min(m.length, Math.floor((centreSec + half) * sr));
      const hop = Math.round(sr * 0.005);
      const env = [];
      for (let i = a; i + hop < b; i += hop) {
        let s = 0;
        for (let k = 0; k < hop; k++) s += m[i + k] * m[i + k];
        env.push(Math.sqrt(s / hop));
      }
      let mean = 0; env.forEach(v => mean += v); mean /= env.length;
      const e = env.map(v => v - mean), fps = sr / hop, wantLag = 60 / wantBpm * fps;
      let best = -1, bestLag = 0;
      for (let lag = Math.round(wantLag * 0.82); lag <= Math.round(wantLag * 1.22); lag++) {
        let s = 0, n = 0;
        for (let i = 0; i + lag < e.length; i++) { s += e[i] * e[i + lag]; n++; }
        const v = n ? s / n : 0;
        if (v > best) { best = v; bestLag = lag; }
      }
      return +(60 * fps / bestLag).toFixed(1);
    }

    const tempos = DSP.fillTempos(BEATS, FROM, TO);
    const wantAt = (at) => {
      let acc = 0;
      for (let i = 0; i < tempos.length; i++) {
        const len = 60 / tempos[i];
        if (acc + len > at) return tempos[i];
        acc += len;
      }
      return tempos[tempos.length - 1];
    };
    const pts = [0.1, 0.5, 0.9].map(f => {
      const at = fill.duration * f;
      const want = wantAt(at);
      return { at: +at.toFixed(1), want: +want.toFixed(1), got: periodAt(at, want) };
    });

    // Holes: 50 ms windows under -50 dBFS
    const W = Math.floor(sr * 0.05);
    let worst = 0, cur = 0;
    for (let w = 0; w * W + W < m.length; w++) {
      let s = 0;
      for (let k = 0; k < W; k++) s += m[w * W + k] * m[w * W + k];
      if (10 * Math.log10(s / W + 1e-20) < -50) { cur += 0.05; worst = Math.max(worst, cur); }
      else cur = 0;
    }

    /* ---- carrying on under the next record.
       A record that opens on a pad, a fade or a spoken intro has no drums for
       the first few seconds, and a fill that stops the moment it starts leaves
       exactly the hole it was there to prevent. Measured on the real set,
       Hotstepper's own drums arrive 4.5s after its entry point. */
    function intro(bpm, secs, quietSecs) {
      const n = Math.floor(sr * secs), buf = ctx.createBuffer(2, n, sr), spb = 60 / bpm;
      for (let c = 0; c < 2; c++) {
        const d = buf.getChannelData(c);
        // a pad that fades in, no drums at all until quietSecs
        for (let i = 0; i < n; i++) d[i] = 0.08 * Math.sin(2 * Math.PI * 220 * i / sr);
        for (let b = 0; b * spb < secs; b++) {
          const t = b * spb;
          if (t < quietSecs) continue;
          const at = Math.floor(t * sr);
          for (let k = 0; k < sr * 0.09 && at + k < n; k++)
            d[at + k] += 0.85 * Math.exp(-k / (sr * 0.02)) * Math.sin(2 * Math.PI * 55 * k / sr);
        }
      }
      return buf;
    }
    const late = intro(120, 60, 8);
    const detected = DSP.drumsInSec(DSP.toMono(late), sr, 0, 32);

    const carried = await DSP.buildBeatFill({
      source: src, atSec: 88, downbeatSec: 0, beats: 32, overBeats: 20,
      fromBpm: FROM, toBpm: TO, patternId: 'four', sampleRate: sr
    });
    const plain = await DSP.buildBeatFill({
      source: src, atSec: 88, downbeatSec: 0, beats: 32, overBeats: 0,
      fromBpm: FROM, toBpm: TO, patternId: 'four', sampleRate: sr
    });

    /* And the plan: a junction that cannot be beat-matched must now carry a
       gap the length of the fill, rather than butting the records together. */
    const rows = MP.parseRunningOrder(
      '#\tTrack\tArtist\tBPM\tSection\tMix\tNote\n' +
      '1\tSlow\tA\t89\tW\t\t\n2\tFast\tB\t148\tW\t\t\n');
    const p = MP.seedProject(rows, [], null);
    p.tracks.forEach(t => { t.durationSec = 200; t.entrySec = 2; t.exitSec = 190; t.bpmLocked = true; });
    p.junctions[0] = { type: 'throw-bridge', reverbBars: 2, beatBeats: 64, midCutDb: 24,
                       highCutDb: 0, isolation: 'eq', overlapBars: 1, cutStyle: 'throw' };
    const plan = MR.buildPlan(p);

    return {
      durSec: +fill.duration.toFixed(2),
      plannedSec: +DSP.beatFillSec(BEATS, FROM, TO).toFixed(2),
      pts, worstHole: +worst.toFixed(2),
      planGap: +plan.junctions[0].gapSec.toFixed(2),
      planFill: plan.junctions[0].fill,
      drumsInDetected: +detected.toFixed(2),
      carriedSec: +(carried.duration - carried.gapSec).toFixed(2),
      carriedGapSec: +carried.gapSec.toFixed(2),
      plainGapSec: +plain.gapSec.toFixed(2),
      plainSec: +plain.duration.toFixed(2)
    };
  });

  console.log('  fill is ' + out.durSec + 's for 128 beats, 90 -> 120 BPM');
  out.pts.forEach(p => console.log('    at ' + (p.at + 's').padStart(7) +
    ' should be ' + (p.want + '').padStart(5) + ' BPM, measured ' + p.got));

  ok(Math.abs(out.durSec - out.plannedSec) < 0.05,
     'the fill is exactly as long as the plan said it would be',
     out.durSec + 's vs ' + out.plannedSec + 's');
  /* A drum kit is silent between hits — that is what makes it a drum kit. The
     old threshold of 0.15s came from the fill being a filtered record, which
     had music running underneath it the whole time. What matters now is that
     the pulse never stops: no gap longer than a bar at the slowest tempo. */
  ok(out.worstHole < 1.0, 'the beat keeps coming, never a bar of nothing',
     'longest quiet run ' + out.worstHole + 's');
  out.pts.forEach(p => ok(Math.abs(p.got - p.want) < 3,
    'tempo at ' + p.at + 's is where it should be', p.got + ' vs ' + p.want));
  ok(out.pts[2].got - out.pts[0].got > 20, 'the tempo genuinely travels across the fill',
     out.pts[0].got + ' -> ' + out.pts[2].got + ' BPM');
  ok(out.planGap > 30 && out.planFill,
     'an unmatchable junction is planned as a fill, not as butted records',
     out.planGap + 's gap for ' + (out.planFill ? out.planFill.beats : 0) + ' beats');
  ok(Math.abs(out.drumsInDetected - 8) < 2,
     'a record whose drums start late is spotted',
     'drums detected at ' + out.drumsInDetected + 's, put there at 8s');
  ok(out.carriedSec > 8, 'the fill keeps playing under the next record',
     out.carriedSec + 's carried past the gap');
  ok(Math.abs(out.carriedGapSec - out.plainGapSec) < 0.05,
     'and carrying it does not move where the next record starts',
     'gap ' + out.carriedGapSec + 's either way');
  ok(Math.abs(out.plainSec - out.plainGapSec) < 0.05,
     'with nothing to carry, the fill ends at the gap',
     out.plainSec + 's for a ' + out.plainGapSec + 's gap');

  ok(errs.length === 0, 'no console errors', errs.slice(0, 2).join(' | '));

  await browser.close(); server.close();
  console.log(fails ? '\n' + fails + ' FAILED' : '\nthe fill carries the beat and the tempo across');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error('HARNESS FAILED:', e); process.exit(2); });
