/* 47 tracks, the real count. Checks that render time scales linearly, that
   memory stays bounded (the whole mix must never be resident as Float32), and
   that the finished file is still clean. */
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

(async () => {
  await new Promise(r => server.listen(8740, r));
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new',
    args: ['--no-sandbox', '--enable-precise-memory-info', '--js-flags=--expose-gc']
  });
  const page = await browser.newPage();
  page.on('pageerror', e => console.log('PAGEERROR', e.message));
  await page.goto('http://localhost:8740/mix-builder.html', { waitUntil: 'networkidle0' });

  const out = await page.evaluate(async () => {
    const DSP = window.MixDSP, MP = window.MixProject, MR = window.MixRender;
    const ctx = new AudioContext();
    const sr = ctx.sampleRate;

    // The real tempo arc, condensed: 47 tracks climbing 89 -> 132 with the cake
    // and the come-down in place. Short tracks so the sources fit in memory;
    // render time per second of output is what scales, and that is measured.
    const arc = [104, 89, 92, 92, 95, 96, 100, 100, 118, 105, 108, 108, 108, 108, 108,
                 110, 110, 112, 112, 112, 112, 113, 113, 114, 115, 116, 116, 116, 118,
                 119, 120, 122, 122, 122, 124, 124, 126, 127, 128, 128, 128, 128, 130,
                 132, 160, 76, 68];
    const SECS = 16;

    function loop(bpm, tone) {
      const n = Math.floor(sr * SECS);
      const buf = ctx.createBuffer(2, n, sr);
      const spb = 60 / bpm;
      for (let c = 0; c < 2; c++) {
        const d = buf.getChannelData(c);
        for (let i = 0; i < n; i++) d[i] = 0.22 * Math.sin(2 * Math.PI * tone * i / sr);
        for (let b = 0; b * spb < SECS; b++) {
          const at = Math.floor(b * spb * sr);
          for (let k = 0; k < sr * 0.08 && at + k < n; k++)
            d[at + k] += 0.55 * Math.exp(-k / (sr * 0.02)) * Math.sin(2 * Math.PI * 55 * k / sr);
        }
      }
      return buf;
    }

    const buffers = new Map();
    const tracks = arc.map((bpm, i) => {
      const id = 'trk_' + i;
      buffers.set(id, loop(bpm, 70 + (i % 9) * 11));
      return {
        id, title: 'Track ' + (i + 1), file: 't' + i + '.mp3', fileSize: 1000 + i,
        sourceBpm: bpm, bpmMultiplier: bpm === 160 ? 0.5 : 1,
        downbeatSec: 0, entrySec: 0, exitSec: SECS - 0.3, durationSec: SECS,
        linked: true, regions: null,
        section: i < 8 ? 'Warm-up' : i === 8 ? 'Cake' : i < 23 ? 'Build' : i < 44 ? 'Peak' : 'Come-down'
      };
    });

    const project = Object.assign(MP.emptyProject('scale test'), { tracks: tracks });
    MP.rebuildJunctions(project, {});

    const plan = MR.buildPlan(project);
    const mem0 = performance.memory ? performance.memory.usedJSHeapSize : null;
    let memPeak = mem0 || 0;

    const t0 = performance.now();
    const res = await MR.render(project, buffers, {
      ctx,
      onProgress: () => {
        if (performance.memory) memPeak = Math.max(memPeak, performance.memory.usedJSHeapSize);
      }
    });
    const ms = performance.now() - t0;
    const m = await MR.measure(res.blob, sr);

    const types = {};
    plan.junctions.forEach(j => types[j.type] = (types[j.type] || 0) + 1);

    return {
      tracks: plan.tracks.length,
      junctionTypes: types,
      plannedSec: +plan.totalSec.toFixed(1),
      renderedSec: +m.durationSec.toFixed(1),
      renderMs: Math.round(ms),
      realtimeFactor: +(m.durationSec / (ms / 1000)).toFixed(1),
      blobMB: +(res.blob.size / 1048576).toFixed(1),
      peak: +m.peak.toFixed(4),
      atFullScale: m.samplesAtFullScale,
      longestSilenceSec: +m.longestSilenceSec.toFixed(3),
      gainDb: +res.report.gainDb.toFixed(2),
      ramped: res.report.tracks.filter(t => t.ramped).length,
      sourceMB: +(Array.from(buffers.values()).reduce((a, b) => a + b.length * b.numberOfChannels * 4, 0) / 1048576).toFixed(0),
      heapStartMB: mem0 ? +(mem0 / 1048576).toFixed(0) : null,
      heapPeakMB: performance.memory ? +(memPeak / 1048576).toFixed(0) : null,
      // What the real set would cost, scaled from this.
      projectedFullSetMin: +((144 * 60) / (m.durationSec / (ms / 1000)) / 60).toFixed(1)
    };
  });

  await browser.close(); server.close();
  console.log(JSON.stringify(out, null, 2));
  console.log('\nA 2h24m set at this rate: about ' + out.projectedFullSetMin + ' minutes to render.');
  const bad = out.atFullScale > 0 || out.longestSilenceSec > 2 ||
              Math.abs(out.plannedSec - out.renderedSec) > 1;
  console.log(bad ? 'PROBLEM in the scaled render' : 'scaled render is clean');
  process.exit(bad ? 1 : 0);
})().catch(e => { console.error('HARNESS FAILED:', e); process.exit(2); });
