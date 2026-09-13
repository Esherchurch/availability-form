/* The timeline has to sound like the file.

   The transport started and stopped clips at a fixed level and did nothing
   else, so a crossfade in the preview was two records playing at once at full
   level — no fade in, no fade out. The render has always written the fades;
   the transport never played them, and "it just overlaps the music" is exactly
   what that sounds like.

   Measured at the master, on the transport itself: the level of a clip as it
   goes through its own fade. */
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
const ok = (c, m, x) => { console.log((c ? '  ok   ' : '  FAIL ') + m + (x ? '   — ' + x : '')); if (!c) fails++; };

(async () => {
  await new Promise(r => server.listen(8850, r));
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new', protocolTimeout: 300000,
    args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required']
  });
  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  await page.goto('http://localhost:8850/mix-builder.html', { waitUntil: 'networkidle0' });

  const out = await page.evaluate(async () => {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    try { if (ctx.state !== 'running') await ctx.resume(); } catch (e) {}
    const dest = ctx.createGain();
    const an = ctx.createAnalyser();
    an.fftSize = 2048; an.smoothingTimeConstant = 0;
    dest.connect(an);

    const pv = window.MixPreview.create({ ctx: ctx, DSP: window.MixDSP, destination: dest });
    /* one steady tone, twelve seconds, with a four second fade out at the end */
    const n = ctx.sampleRate * 12;
    const buf = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = 0.5 * Math.sin(2 * Math.PI * 440 * i / ctx.sampleRate);

    pv.build({ tracks: [], junctions: [] }, new Map(), [
      { kind: 'track', index: 0, fromSec: 0, toSec: 12, buffer: buf, offsetSec: 0,
        rate0: 1, rate1: 1, gain: 1, fadeInSec: 3, fadeOutSec: 4 }
    ]);

    const td = new Float32Array(an.fftSize);
    const level = () => {
      an.getFloatTimeDomainData(td);
      let s = 0; for (let i = 0; i < td.length; i++) s += td[i] * td[i];
      return 20 * Math.log10(Math.sqrt(s / td.length) + 1e-12);
    };

    pv.seek(0); pv.play();
    const rows = [];
    const t0 = performance.now();
    while (performance.now() - t0 < 11500) {
      await new Promise(r => setTimeout(r, 120));
      rows.push({ t: +pv.at().toFixed(2), db: +level().toFixed(1) });
    }
    pv.pause();
    const near = (want) => {
      let best = rows[0];
      rows.forEach(r => { if (Math.abs(r.t - want) < Math.abs(best.t - want)) best = r; });
      return best ? best.db : null;
    };
    return { at0: near(0.4), at1_5: near(1.5), at3: near(3.2), at6: near(6),
             at9_5: near(9.5), at11_5: near(11.5), rows: rows.length };
  });

  console.log('    0.4s ' + out.at0 + '   1.5s ' + out.at1_5 + '   3.2s ' + out.at3 +
              '   6s ' + out.at6 + '   9.5s ' + out.at9_5 + '   11.5s ' + out.at11_5 + ' dB');

  ok(out.at6 - out.at0 > 6, 'a clip fades IN rather than arriving at full level',
     (out.at6 - out.at0).toFixed(1) + ' dB quieter at the start');
  ok(out.at6 - out.at1_5 > 2, 'and is still climbing half way through the fade',
     (out.at6 - out.at1_5).toFixed(1) + ' dB');
  ok(out.at6 - out.at11_5 > 6, 'and fades OUT rather than stopping dead',
     (out.at6 - out.at11_5).toFixed(1) + ' dB down at the end');
  ok(Math.abs(out.at6 - out.at3) < 4, 'holding full level in between',
     out.at3 + ' vs ' + out.at6 + ' dB');

  ok(errs.length === 0, 'no console errors', errs.slice(0, 2).join(' | '));
  await browser.close(); server.close();
  console.log(fails ? '\n' + fails + ' FAILED' : '\nthe timeline fades like the file does');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error('HARNESS FAILED:', e); process.exit(2); });
