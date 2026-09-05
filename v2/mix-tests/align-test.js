/* §14.3. Two things:
     1. The ramp maths round-trip (source <-> output on a quadratic mapping).
     2. The flam detector actually detects a flam — a test that only ever
        reports "tight" is worthless, so this deliberately misaligns a pair and
        checks the number moves. */
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
  await new Promise(r => server.listen(8742, r));
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
  await page.goto('http://localhost:8742/mix-builder.html', { waitUntil: 'networkidle0' });

  const R = await page.evaluate(async () => {
    const DSP = window.MixDSP, MP = window.MixProject, MR = window.MixRender;
    const ctx = new AudioContext(), sr = ctx.sampleRate;
    const log = [];

    // ---------- 1. the ramp maths
    const pt = { r0: 0.94, r1: 1.06, outSec: 200, sourceBpm: 120 };
    // Round-trip a spread of source offsets through the quadratic and back.
    let worst = 0;
    for (let s = 0; s <= 200; s += 7) {
      const t = MR.outputTimeForSource(pt, s);
      const back = MR.sourceConsumedBy(pt, t);
      worst = Math.max(worst, Math.abs(back - s));
    }
    log.push(['source <-> output round-trips', 'worst error ' + worst.toExponential(2) + 's', worst < 1e-6]);

    // Total source consumed must equal the track's source length exactly.
    const totalSrc = MR.sourceConsumedBy(pt, pt.outSec);
    const wanted = pt.outSec * (pt.r0 + pt.r1) / 2;
    log.push(['the ramp consumes exactly the source it should',
              totalSrc.toFixed(6) + ' vs ' + wanted.toFixed(6),
              Math.abs(totalSrc - wanted) < 1e-9]);

    // Multiplying instead of integrating is WRONG, and by how much matters —
    // if it were negligible the integration would not be worth having.
    const mid = pt.outSec / 2;
    const naive = MR.sourceConsumedBy(pt, mid);
    const linear = mid * ((pt.r0 + pt.r1) / 2);
    log.push(['integrating differs from multiplying',
              'at the midpoint: ' + naive.toFixed(3) + 's vs ' + linear.toFixed(3) + 's naive (' +
              Math.abs(naive - linear).toFixed(3) + 's out)',
              Math.abs(naive - linear) > 0.05]);

    // Instantaneous tempo tracks the ramp.
    log.push(['tempo at the start of the ramp', MR.tempoAtOutput(pt, 0).toFixed(2) + ' BPM',
              Math.abs(MR.tempoAtOutput(pt, 0) - 120 * 0.94) < 0.01]);
    log.push(['tempo at the end of the ramp', MR.tempoAtOutput(pt, 200).toFixed(2) + ' BPM',
              Math.abs(MR.tempoAtOutput(pt, 200) - 120 * 1.06) < 0.01]);

    // A flat ratio must still work (no divide-by-zero on r1 === r0).
    const flat = { r0: 1, r1: 1, outSec: 100, sourceBpm: 120 };
    log.push(['a flat ratio is not a special case',
              MR.outputTimeForSource(flat, 40).toFixed(3) + 's',
              Math.abs(MR.outputTimeForSource(flat, 40) - 40) < 1e-6]);

    // ---------- 2. the flam detector
    function kicks(bpm, seconds, offsetSec) {
      const n = Math.floor(sr * seconds);
      const buf = new Float32Array(n);
      const spb = 60 / bpm;
      for (let b = 0; (b * spb + offsetSec) < seconds; b++) {
        const at = Math.floor((b * spb + offsetSec) * sr);
        if (at < 0) continue;
        for (let k = 0; k < sr * 0.09 && at + k < n; k++)
          buf[at + k] += 0.8 * Math.exp(-k / (sr * 0.02)) * Math.sin(2 * Math.PI * 55 * k / sr);
      }
      return buf;
    }

    const fakePlan = { junctions: [{ type: 'blend', overlapSec: 6 }] };
    const check = (offsetMs) => {
      const a = kicks(120, 6, 0);
      const b = kicks(120, 6, offsetMs / 1000);
      const res = MR.measureOverlapAlignment(
        [{ tail: a, head: null }, { head: b, tail: null }], fakePlan, sr);
      return res[0];
    };

    const aligned = check(0);
    log.push(['perfectly aligned kicks read as tight',
              aligned.lagMs + ' ms, ' + aligned.verdict + ' (confidence ' + aligned.confidence + ')',
              Math.abs(aligned.lagMs) <= 10 && aligned.verdict === 'tight']);

    const off8 = check(8);
    log.push(['an 8 ms offset is measured',
              off8.lagMs + ' ms, ' + off8.verdict,
              Math.abs(off8.lagMs - 8) < 6]);

    const off30 = check(30);
    log.push(['a 30 ms offset is called a FLAM',
              off30.lagMs + ' ms, ' + off30.verdict,
              off30.verdict === 'FLAM' && Math.abs(Math.abs(off30.lagMs) - 30) < 8]);

    const offNeg = check(-25);
    log.push(['the sign of the offset is right',
              offNeg.lagMs + ' ms, ' + offNeg.verdict,
              offNeg.lagMs < -12]);

    // ---------- 3. a real render should come out tight
    function loop(bpm, tone, secs) {
      const n = Math.floor(sr * secs);
      const buf = ctx.createBuffer(2, n, sr);
      const spb = 60 / bpm;
      for (let c = 0; c < 2; c++) {
        const d = buf.getChannelData(c);
        for (let i = 0; i < n; i++) d[i] = 0.18 * Math.sin(2 * Math.PI * tone * i / sr);
        for (let b = 0; b * spb < secs; b++) {
          const at = Math.floor(b * spb * sr);
          for (let k = 0; k < sr * 0.09 && at + k < n; k++)
            d[at + k] += 0.6 * Math.exp(-k / (sr * 0.02)) * Math.sin(2 * Math.PI * 55 * k / sr);
        }
      }
      return buf;
    }
    const bpms = [118, 120, 122, 124];
    const buffers = new Map();
    const tracks = bpms.map((bpm, i) => {
      buffers.set('t' + i, loop(bpm, 80 + i * 13, 30));
      return {
        id: 't' + i, title: 'T' + (i + 1), file: 't' + i + '.mp3', fileSize: 5 + i,
        sourceBpm: bpm, bpmMultiplier: 1, downbeatSec: 0,
        entrySec: 0, exitSec: 29.5, durationSec: 30, linked: true, regions: null
      };
    });
    const project = Object.assign(MP.emptyProject('align'), { tracks });
    MP.rebuildJunctions(project, {});
    project.junctions.forEach(j => { if (j.type === 'blend') j.bars = 4; });

    const res = await MR.render(project, buffers, { ctx, measureAlignment: true });
    const al = res.report.alignment || [];
    log.push(['a real render reports alignment per junction',
              al.map(a => a.lagMs + 'ms/' + a.verdict).join(', '),
              al.length === 3]);
    log.push(['no flams in a clean render',
              'worst ' + res.report.worstLagMs + ' ms, ' + res.report.flams + ' flams',
              res.report.flams === 0]);
    log.push(['overlaps are tight, not merely non-clicking',
              'worst lag ' + res.report.worstLagMs + ' ms',
              res.report.worstLagMs <= 12]);

    return log;
  });

  await browser.close(); server.close();
  R.forEach(([n, d, p]) => { if (!p) fails++; console.log((p ? '  ok   ' : '  FAIL ') + n.padEnd(44) + d); });
  if (errs.length) { console.log('\npage errors:'); errs.forEach(e => console.log('  ' + e)); }
  console.log(fails || errs.length ? '\n' + (fails + errs.length) + ' FAILURES'
                                   : '\nall ' + R.length + ' alignment checks passed');
  process.exit(fails || errs.length ? 1 : 0);
})().catch(e => { console.error('HARNESS FAILED:', e); process.exit(2); });
