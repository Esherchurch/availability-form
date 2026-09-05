/* Is stretch() actually compressing the content, or just producing a shorter
   buffer? Measure real onset spacing rather than trusting the tempo estimator. */
const http = require('http'), fs = require('fs'), path = require('path');
const puppeteer = require('puppeteer-core');
const ROOT = require('path').join(__dirname, '..');
const server = http.createServer((req, res) => {
  if (req.url === '/favicon.ico') { res.writeHead(204); res.end(); return; }
  fs.readFile(path.join(ROOT, req.url.split('?')[0]), (e, b) => {
    if (e) { res.writeHead(404); res.end(''); return; }
    res.writeHead(200, { 'Content-Type': req.url.endsWith('.js') ? 'text/javascript' : 'text/html' });
    res.end(b);
  });
});

(async () => {
  await new Promise(r => server.listen(8733, r));
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new', args: ['--no-sandbox']
  });
  const page = await browser.newPage();
  page.on('pageerror', e => console.log('PAGEERROR', e.message));
  await page.goto('http://localhost:8733/mix-builder.html', { waitUntil: 'networkidle0' });

  const out = await page.evaluate(async () => {
    const DSP = window.MixDSP;
    const ctx = new AudioContext();
    const sr = ctx.sampleRate;

    // Clean impulse train: one sharp click per beat, nothing else. The spacing
    // between clicks IS the tempo, so it can be measured exactly.
    function clicks(bpm, seconds) {
      const n = Math.floor(sr * seconds);
      const buf = ctx.createBuffer(1, n, sr);
      const d = buf.getChannelData(0);
      const spb = 60 / bpm;
      for (let b = 0; b * spb < seconds; b++) {
        const at = Math.floor(b * spb * sr);
        for (let k = 0; k < 200 && at + k < n; k++) {
          d[at + k] = Math.exp(-k / 40) * Math.sin(2 * Math.PI * 1000 * k / sr);
        }
      }
      return buf;
    }

    // Find click positions by simple threshold on a rectified, decimated signal.
    function onsets(data) {
      const out = [];
      let last = -1e9;
      for (let i = 0; i < data.length; i++) {
        if (Math.abs(data[i]) > 0.25 && i - last > sr * 0.1) { out.push(i); last = i; }
      }
      return out;
    }

    const report = [];
    for (const ratio of [1.05, 1.5, 2.0, 0.8]) {
      const src = clicks(120, 20);
      const st = DSP.stretch(ctx, src, ratio);
      const oSrc = onsets(src.getChannelData(0));
      const oSt = onsets(st.getChannelData(0));
      const gap = arr => {
        const g = [];
        for (let i = 1; i < arr.length; i++) g.push(arr[i] - arr[i - 1]);
        g.sort((a, b) => a - b);
        return g[Math.floor(g.length / 2)];       // median gap
      };
      const gSrc = gap(oSrc), gSt = gap(oSt);
      report.push({
        ratio,
        srcClicks: oSrc.length, stClicks: oSt.length,
        srcBpm: +(60 * sr / gSrc).toFixed(2),
        stBpm: gSt ? +(60 * sr / gSt).toFixed(2) : null,
        wantBpm: +(120 * ratio).toFixed(2),
        lenRatio: +(src.length / st.length).toFixed(4)
      });
    }

    // And what the tempo estimator says about a genuinely faster signal,
    // to separate "stretch is broken" from "estimator resolution is coarse".
    const fast = clicks(126, 30);
    const est = await DSP.analyseBeat(DSP.toMono(fast), sr);
    const slow = clicks(120, 30);
    const est2 = await DSP.analyseBeat(DSP.toMono(slow), sr);
    return { sr, report, estOf126: +est.bpm.toFixed(2), estOf120: +est2.bpm.toFixed(2) };
  });

  await browser.close(); server.close();
  console.log('sampleRate', out.sr);
  console.log('\nstretch(): does the CONTENT actually change tempo?');
  console.log('ratio   len ratio   src BPM   out BPM   wanted');
  out.report.forEach(r => console.log(
    String(r.ratio).padEnd(8) + String(r.lenRatio).padEnd(11) +
    String(r.srcBpm).padEnd(10) + String(r.stBpm).padEnd(10) + r.wantBpm));
  console.log('\nanalyseBeat() resolution:');
  console.log('  a true 120 BPM click track reads as', out.estOf120);
  console.log('  a true 126 BPM click track reads as', out.estOf126);
})().catch(e => { console.error(e); process.exit(2); });
