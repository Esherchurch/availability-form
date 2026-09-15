/* Do the records actually arrive at the same volume in the finished mix?

   Not the arithmetic — the file. Two records a long way apart, one mastered
   flat out and one sparse and quiet, levelled through the real button and then
   rendered. The loudness is measured inside each record's own stretch of the
   output, which is the only place the question can honestly be answered. */
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

/* two records that would never sit together on their own */
function wav(file, kind, secs, bpm) {
  const SR = 44100, n = Math.round(SR * secs), beat = SR * 60 / bpm;
  const d = new Float64Array(n);
  for (let k = 0; k * beat < n; k++) {
    const at = Math.round(k * beat);
    for (let i = 0; i < SR * 0.1 && at + i < n; i++) {
      const t = i / SR;
      d[at + i] += Math.sin(2 * Math.PI * (55 + 90 * Math.exp(-t / 0.02)) * t) *
                   Math.exp(-t / 0.05) * (kind === 'modern' ? 0.9 : 0.35);
    }
  }
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    if (kind === 'modern') {
      d[i] += 0.55 * Math.sin(2 * Math.PI * 60 * t) + 0.20 * Math.sin(2 * Math.PI * 240 * t);
      d[i] = Math.tanh(d[i] * 2.0) * 0.985;          // mastered flat out
    } else {
      d[i] += 0.12 * Math.sin(2 * Math.PI * 900 * t) + 0.07 * Math.sin(2 * Math.PI * 2600 * t);
    }
  }
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
  await new Promise(r => server.listen(8864, r));
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new', protocolTimeout: 900000,
    args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required',
           '--window-size=1500,1000', '--js-flags=--max-old-space-size=4096']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1500, height: 1000 });
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  await page.goto('http://localhost:8864/mix-builder.html', { waitUntil: 'networkidle0' });

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mixvol-'));
  const files = [wav(path.join(tmp, 'A loud modern one.wav'), 'modern', 40, 120),
                 wav(path.join(tmp, 'B quiet old one.wav'), 'old', 40, 120)];

  await (await page.$('#file')).uploadFile(files[0], files[1]);
  await page.waitForFunction(() => document.querySelectorAll('#timeline .clip.song').length >= 2 &&
                                   !document.querySelector('#timeline .clip.song.unlinked'),
                             { timeout: 240000 });

  /* press the real button */
  const levelled = await page.evaluate(async () => {
    document.getElementById('normaliseBtn').click();
    await new Promise(z => setTimeout(z, 1500));
    const p = window.__project();
    return {
      said: (document.getElementById('status') || {}).textContent.slice(0, 190),
      tracks: p.tracks.map(t => ({ title: t.title, lufs: t.loudnessLufs,
                                   gain: t.gainDb, peak: t.peakDb }))
    };
  });
  console.log('    ' + levelled.said);
  levelled.tracks.forEach(t => console.log('      ' + (t.title || '').slice(0, 26).padEnd(26) +
    String(t.lufs).padStart(8) + ' LUFS, peak ' + String(t.peak).padStart(6) +
    ' dBFS, gain ' + (t.gain > 0 ? '+' : '') + t.gain + ' dB'));

  ok(levelled.tracks.every(t => t.gain != null),
     'every track is given a level of its own');
  const arrivedApart = Math.abs(levelled.tracks[0].lufs - levelled.tracks[1].lufs);
  ok(arrivedApart > 4, 'the two really did arrive a long way apart',
     arrivedApart.toFixed(1) + ' dB');

  /* now the only question that matters: in the rendered file */
  const measured = await page.evaluate(async () => {
    const MP = window.MixProject, MR = window.MixRender, DSP = window.MixDSP;
    const p = window.__project();
    p.junctions[0] = { type: 'crossfade', crossSec: 2 };
    const bufs = window.__buffersForTest ? window.__buffersForTest() : null;
    const res = await MR.render(p, bufs, { ctx: new AudioContext(), measureAlignment: false });

    const ab = await res.blob.arrayBuffer(), dv = new DataView(ab);
    let pos = 12, dataAt = 0, ch = 2, rate = 48000;
    while (pos + 8 <= ab.byteLength) {
      const id = String.fromCharCode(dv.getUint8(pos), dv.getUint8(pos+1), dv.getUint8(pos+2), dv.getUint8(pos+3));
      const sz = dv.getUint32(pos + 4, true);
      if (id === 'fmt ') { ch = dv.getUint16(pos + 10, true); rate = dv.getUint32(pos + 12, true); }
      if (id === 'data') { dataAt = pos + 8; break; }
      pos += 8 + sz + (sz & 1);
    }
    /* pull one record's stretch of the mix out as mono and measure it */
    const grab = (fromSec, toSec) => {
      const i0 = Math.floor(fromSec * rate), n = Math.floor((toSec - fromSec) * rate);
      const m = new Float32Array(Math.max(0, n));
      for (let i = 0; i < n; i++) {
        const at = dataAt + (i0 + i) * ch * 2;
        if (at + 1 >= ab.byteLength) break;
        m[i] = dv.getInt16(at, true) / 32768;
      }
      return m;
    };
    const t0 = res.plan.tracks[0], t1 = res.plan.tracks[1];
    /* well inside each record, clear of the crossfade at either end */
    const a = grab(t0.startSec + 4, t0.startSec + t0.outSec - 4);
    const b = grab(t1.startSec + 4, t1.startSec + t1.outSec - 4);
    return {
      first: DSP.loudness(a, rate, 0, a.length / rate),
      second: DSP.loudness(b, rate, 0, b.length / rate)
    };
  });

  console.log('    in the rendered mix: ' + measured.first + ' LUFS and ' +
              measured.second + ' LUFS');
  const gap = Math.abs(measured.first - measured.second);
  ok(gap < 1.5, 'and in the finished mix they are at the same volume',
     gap.toFixed(2) + ' dB apart, from ' + arrivedApart.toFixed(1) + ' dB');

  ok(errs.length === 0, 'no console errors', errs.slice(0, 2).join(' | '));
  await browser.close(); server.close();
  try { files.forEach(f => fs.unlinkSync(f)); fs.rmdirSync(tmp); } catch (e) {}
  console.log(fails ? '\n' + fails + ' FAILED' : '\nthe records arrive at the same volume');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error('HARNESS FAILED:', e); process.exit(2); });
