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

    // --- refuses to render what it cannot
    let refused = false, msg = '';
    try {
      const bad = JSON.parse(JSON.stringify(project));
      bad.tracks[2].linked = false;
      await MR.render(bad, buffers, { ctx });
    } catch (e) { refused = true; msg = (e.message || '').split('\n')[0]; }
    log.push(['refuses a set with unlinked audio', msg, refused]);

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
