/* Cutting a sample precisely means seeing precisely.

   The waveform always showed the whole record in about a thousand pixels — a
   quarter of a second per pixel on a four minute track — so a drag could not
   pick out anything smaller than about a syllable. The window is zoomable now,
   and every mapping between a pixel and a second goes through one view, so the
   drawing, the drag and the markers cannot disagree about where a moment is. */
const http = require('http'), fs = require('fs'), path = require('path'), os = require('os');
const puppeteer = require('puppeteer-core');
const ROOT = path.join(__dirname, '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.wav': 'audio/wav' };
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

function wav(file, secs, bpm) {
  const SR = 44100, n = Math.round(SR * secs), beat = SR * 60 / bpm;
  const d = new Float64Array(n);
  for (let k = 0; k * beat < n; k++) {
    const at = Math.round(k * beat);
    for (let i = 0; i < SR * 0.1 && at + i < n; i++) {
      const t = i / SR;
      d[at + i] += Math.sin(2 * Math.PI * (55 + 90 * Math.exp(-t / 0.02)) * t) * Math.exp(-t / 0.05) * 0.8;
    }
  }
  for (let i = 0; i < n; i++) d[i] += 0.25 * Math.sin(2 * Math.PI * 330 * i / SR);
  const buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22); buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 2, 28);
  buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) {
    buf.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(d[i] * 32767))), 44 + i * 2);
  }
  fs.writeFileSync(file, buf);
  return file;
}

(async () => {
  await new Promise(r => server.listen(8858, r));
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new', protocolTimeout: 600000,
    args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required', '--window-size=1500,1000']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1500, height: 1000 });
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  await page.goto('http://localhost:8858/mix-builder.html', { waitUntil: 'networkidle0' });

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mixzoom-'));
  const f = wav(path.join(tmp, 'One.wav'), 240, 120);
  await (await page.$('#file')).uploadFile(f);
  await page.waitForFunction(() => document.querySelectorAll('#timeline .clip.song').length >= 1 &&
                                   !document.querySelector('#timeline .clip.song.unlinked'),
                             { timeout: 240000 });
  await page.evaluate(() => { const h = document.querySelector('.trk-head'); if (h) h.click(); });
  await page.waitForSelector('canvas.wave', { timeout: 30000 });

  const before = await page.evaluate(() => {
    const cv = document.querySelector('canvas.wave');
    cv.scrollIntoView({ block: 'center' });
    const dur = window.__project().tracks[0].durationSec;
    return { msPerPx: +(dur * 1000 / cv.clientWidth).toFixed(0), dur: +dur.toFixed(1),
             width: cv.clientWidth };
  });
  console.log('    a ' + before.dur + 's record across ' + before.width + ' pixels is ' +
              before.msPerPx + ' ms per pixel');
  ok(before.msPerPx > 100, 'unzoomed, a pixel is a long time', before.msPerPx + ' ms');

  /* zoom the way a person does: the wheel, over the point of interest */
  const zoomed = await page.evaluate(async () => {
    const cv = document.querySelector('canvas.wave');
    const r = cv.getBoundingClientRect();
    const x = Math.round(r.left + r.width * 0.5), y = Math.round(r.top + r.height / 2);
    for (let i = 0; i < 12; i++) {
      cv.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true,
                                                 deltaY: -120, clientX: x, clientY: y }));
      await new Promise(z => setTimeout(z, 20));
    }
    const dur = window.__project().tracks[0].durationSec;
    /* what the status line says it is showing, and what the canvas now covers */
    const said = (document.getElementById('status') || {}).textContent;
    return { said: said.slice(0, 90), dur };
  });
  const shown = /([\d.]+)\s*ms per pixel/.exec(zoomed.said);
  const msPerPx = shown ? parseFloat(shown[1]) : null;
  console.log('    after twelve notches of wheel: ' + (msPerPx == null ? '?' : msPerPx + ' ms per pixel'));
  ok(msPerPx != null && msPerPx < before.msPerPx / 10,
     'the wheel zooms in a long way, not a nudge',
     before.msPerPx + ' ms -> ' + msPerPx + ' ms per pixel');
  ok(msPerPx != null && msPerPx < 12,
     'far enough to place a cut inside a syllable', msPerPx + ' ms per pixel');

  /* and a drag still lands where it is put, in the zoomed view */
  const dragged = await page.evaluate(async () => {
    const cv = document.querySelector('canvas.wave');
    const r = cv.getBoundingClientRect();
    const y = Math.round(r.top + r.height / 2);
    const x1 = Math.round(r.left + r.width * 0.30);
    const x2 = Math.round(r.left + r.width * 0.60);
    cv.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: x1, clientY: y }));
    window.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: x2, clientY: y }));
    window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: x2, clientY: y }));
    await new Promise(z => setTimeout(z, 300));
    const el = document.querySelector('.samplecut-range');
    return { text: el ? el.textContent.trim() : null };
  });
  console.log('    the drag reads: ' + dragged.text);
  const secs = dragged.text ? parseFloat(dragged.text) : null;
  ok(secs != null && secs > 0 && secs < 5,
     'a drag across a third of the zoomed window is a short passage, not a minute',
     dragged.text);

  ok(errs.length === 0, 'no console errors', errs.slice(0, 2).join(' | '));
  await browser.close(); server.close();
  try { fs.unlinkSync(f); fs.rmdirSync(tmp); } catch (e) {}
  console.log(fails ? '\n' + fails + ' FAILED' : '\nthe waveform zooms, and a cut can be placed inside a word');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error('HARNESS FAILED:', e); process.exit(2); });
