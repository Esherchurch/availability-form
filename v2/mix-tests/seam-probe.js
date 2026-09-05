/* Can a seam be bit-identical? Measures (a) what a stretched buffer's first
   samples actually are, and (b) whether slicing before stretching restores
   continuity. Determines the whole design of the full render. */
const http = require('http'), fs = require('fs'), path = require('path');
const puppeteer = require('puppeteer-core');
const ROOT = path.join(__dirname, '..');
const server = http.createServer((q, r) => {
  if (q.url === '/favicon.ico') { r.writeHead(204); r.end(); return; }
  fs.readFile(path.join(ROOT, q.url.split('?')[0]), (e, b) => {
    if (e) { r.writeHead(404); r.end(''); return; }
    r.writeHead(200, { 'Content-Type': q.url.endsWith('.js') ? 'text/javascript' : 'text/html' });
    r.end(b);
  });
});

(async () => {
  await new Promise(r => server.listen(8738, r));
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new', args: ['--no-sandbox']
  });
  const page = await browser.newPage();
  page.on('pageerror', e => console.log('PAGEERROR', e.message));
  await page.goto('http://localhost:8738/mix-builder.html', { waitUntil: 'networkidle0' });

  const out = await page.evaluate(async () => {
    const DSP = window.MixDSP;
    const ctx = new AudioContext();
    const sr = ctx.sampleRate;
    const R = [];

    // Continuous music-like signal: no silence anywhere, so a seam failure is
    // purely the algorithm's doing.
    const n = sr * 30;
    const src = ctx.createBuffer(2, n, sr);
    for (let c = 0; c < 2; c++) {
      const d = src.getChannelData(c);
      for (let i = 0; i < n; i++) {
        const t = i / sr;
        d[i] = 0.4 * Math.sin(2 * Math.PI * 110 * t) + 0.2 * Math.sin(2 * Math.PI * 220.5 * t)
             + 0.1 * Math.sin(2 * Math.PI * 55 * t);
      }
    }

    // (a) What does stretch() put at sample 0?
    const st = DSP.stretch(ctx, src, 1.04);
    const head = Array.from(st.getChannelData(0).subarray(0, 6)).map(v => +v.toFixed(6));
    R.push({ q: 'first 6 samples of a stretched buffer', head,
             note: 'source starts at ' + src.getChannelData(0)[0].toFixed(6) });

    // (b) ratio exactly 1 short-circuits, so it should be bit-identical.
    const st1 = DSP.stretch(ctx, src, 1.0);
    R.push({ q: 'ratio 1.0 returns the same object', same: st1 === src });

    // (c) Slice-then-stretch WITHOUT a run-up: does it start at full level?
    const cut = 10.0;                                  // seconds into the source
    const sl = DSP.slice(ctx, src, cut, 4);
    const slSt = DSP.stretch(ctx, sl, 1.04);
    const srcAt = src.getChannelData(0)[Math.round(cut * sr)];
    R.push({ q: 'slice-then-stretch, no run-up',
             first: +slSt.getChannelData(0)[0].toFixed(6),
             wanted: +srcAt.toFixed(6) });

    // (d) Slice with a run-up, stretch, then trim the run-up back off.
    const LEAD = 4096;
    const leadSec = LEAD / sr;
    const sl2 = DSP.slice(ctx, src, cut - leadSec, 4 + leadSec);
    const st2 = DSP.stretch(ctx, sl2, 1.04);
    const trim = Math.round(leadSec / 1.04 * sr);
    const got = st2.getChannelData(0).subarray(trim, trim + 64);
    const want = src.getChannelData(0).subarray(Math.round(cut * sr), Math.round(cut * sr) + 64);
    let maxDiff = 0, rmsWant = 0;
    for (let i = 0; i < 64; i++) {
      maxDiff = Math.max(maxDiff, Math.abs(got[i] - want[i]));
      rmsWant += want[i] * want[i];
    }
    rmsWant = Math.sqrt(rmsWant / 64);
    R.push({ q: 'slice with run-up, stretched, trimmed',
             first: +got[0].toFixed(6), wanted: +want[0].toFixed(6),
             maxDiff: +maxDiff.toFixed(6),
             diffDb: +(20 * Math.log10((maxDiff + 1e-12) / (rmsWant + 1e-12))).toFixed(1) });

    // (e) How long does the CURRENT approach take? Whole-track stretch per junction.
    const long = ctx.createBuffer(2, sr * 240, sr);
    for (let c = 0; c < 2; c++) {
      const d = long.getChannelData(c);
      for (let i = 0; i < d.length; i++) d[i] = 0.3 * Math.sin(2 * Math.PI * 110 * i / sr);
    }
    let t0 = performance.now();
    DSP.stretch(ctx, long, 1.04);
    const wholeMs = performance.now() - t0;
    t0 = performance.now();
    DSP.stretch(ctx, DSP.slice(ctx, long, 100, 32), 1.04);
    const sliceMs = performance.now() - t0;
    R.push({ q: 'cost per junction', wholeTrackMs: Math.round(wholeMs),
             slicedMs: Math.round(sliceMs),
             projected46WholeSec: +(wholeMs * 2 * 46 / 1000).toFixed(1),
             projected46SlicedSec: +(sliceMs * 2 * 46 / 1000).toFixed(1) });

    return R;
  });

  await browser.close(); server.close();
  out.forEach(r => console.log(JSON.stringify(r)));
})().catch(e => { console.error(e); process.exit(2); });
