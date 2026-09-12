/* Importing a sample, rather than cutting one out of a record.

   An air horn is not on any of the records. Loading one as a track and then
   clipping a clip out of it is work for nothing, and it puts a thing that is
   not a song into the running order. */
const http = require('http'), fs = require('fs'), path = require('path'), os = require('os');
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

/* a horn: two notes a fourth apart, nearly sawtooth, nothing down the bottom */
function horn(file) {
  const SR = 48000, LEN = 1.6, n = Math.round(SR * LEN);
  const L = new Float64Array(n), R = new Float64Array(n);
  const notes = [{ hz: 415.3, g: 1 }, { hz: 554.4, g: 0.85 }];
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const env = Math.min(1, t / 0.018) * (t > LEN - 0.22 ? Math.max(0, (LEN - t) / 0.22) : 1);
    let l = 0, r = 0;
    for (const nt of notes) {
      const f0 = nt.hz * (1 - 0.035 * Math.exp(-t / 0.05));
      for (let h = 1; h * f0 < SR / 2.2; h++) {
        const a = Math.sin(2 * Math.PI * h * f0 * t) / Math.pow(h, 0.92);
        l += a * nt.g * 0.16; r += a * nt.g * 0.16;
      }
    }
    L[i] = Math.tanh(l * env * 2.2) * 0.72; R[i] = Math.tanh(r * env * 2.2) * 0.72;
  }
  const bytes = n * 4, buf = Buffer.alloc(44 + bytes);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + bytes, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(2, 22); buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 4, 28);
  buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(bytes, 40);
  for (let i = 0; i < n; i++) {
    buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, L[i])) * 32767), 44 + i * 4);
    buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, R[i])) * 32767), 44 + i * 4 + 2);
  }
  fs.writeFileSync(file, buf);
  return file;
}

(async () => {
  await new Promise(r => server.listen(8836, r));
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new', protocolTimeout: 300000,
    args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required', '--window-size=1400,1000']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 1000 });
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  await page.goto('http://localhost:8836/mix-builder.html', { waitUntil: 'networkidle0' });

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mixim-'));
  const f = horn(path.join(tmp, 'Rave horn.wav'));

  ok(!!(await page.$('#sampleImport')), 'there is a way to import a sample at all');

  await (await page.$('#sampleImport')).uploadFile(f);
  await page.waitForFunction(() => document.querySelectorAll('[data-sample]').length > 0,
                             { timeout: 20000 });
  await new Promise(r => setTimeout(r, 800));

  const got = await page.evaluate(async () => {
    const list = await window.MixProject.listSamples();
    const s = list[0];
    const blob = await window.MixProject.getSampleAudio(s.id);
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const buf = await ctx.decodeAudioData(await blob.arrayBuffer());
    const d = buf.getChannelData(0), sr = buf.sampleRate;
    const band = fq => {
      const k = 2 * Math.cos(2 * Math.PI * fq / sr);
      let s1 = 0, s2 = 0;
      for (let i = 0; i < d.length; i++) { const s0 = d[i] + k * s1 - s2; s2 = s1; s1 = s0; }
      return +(20 * Math.log10(Math.sqrt(Math.abs(s1 * s1 + s2 * s2 - k * s1 * s2)) / d.length + 1e-12)).toFixed(0);
    };
    return { name: s.name, bpm: s.sourceBpm, bytes: blob.size || blob.byteLength,
             dur: +buf.duration.toFixed(2), low: band(60), mid: band(415), top: band(1660),
             said: (document.getElementById('status') || {}).textContent.slice(0, 80) };
  });

  ok(got.name === 'Rave horn', 'it is named after the file, not "track 1"', got.name);
  ok(got.bytes > 1000, 'its audio is stored', got.bytes + ' bytes');
  ok(Math.abs(got.dur - 1.6) < 0.05, 'the whole of it is stored, not a clip of it', got.dur + 's');
  ok(got.bpm === 0, 'with no tempo, so a one-shot is not stretched to the mix', String(got.bpm));
  console.log('    60Hz ' + got.low + '   415Hz ' + got.mid + '   1660Hz ' + got.top);
  ok(got.mid - got.low > 30, 'and it is the sound that went in, not a rumble',
     (got.mid - got.low) + ' dB more at 415 Hz than at 60');

  const noTrack = await page.evaluate(async () => {
    const p = await window.MixProject.loadProject();
    return (p.tracks || []).length;
  });
  ok(noTrack === 0, 'and nothing was added to the running order', noTrack + ' tracks');

  ok(errs.length === 0, 'no console errors', errs.slice(0, 2).join(' | '));
  await browser.close(); server.close();
  try { fs.unlinkSync(f); fs.rmdirSync(tmp); } catch (e) {}
  console.log(fails ? '\n' + fails + ' FAILED' : '\na sample can be imported without pretending it is a song');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error('HARNESS FAILED:', e); process.exit(2); });
