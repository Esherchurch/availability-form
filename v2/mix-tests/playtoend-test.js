/* Finishing a song at the end, and it STAYING finished.

   A track's mix-out is set to its last strong beat, so the outro — often ten
   or twenty seconds of real music, plainly visible on the waveform — is never
   played. "Play it to the end" moves the mix-out to the end of the record.

   The part that made it look broken: re-linking pulls a mix-out back to where
   the audio last rose above -34 dBFS, which on a record with a fade-out is
   exactly where "play it to the end" has just moved it away from. So the
   setting was made, and quietly undone on the next reopen. A mix-out set by
   hand is marked as such and left alone now, and this is the test of that. */
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

/* a record with a long fade-out on the end of it, which is the case that broke */
function fadingRecord(file, secs, bpm) {
  const SR = 44100, n = Math.round(SR * secs), beat = SR * 60 / bpm;
  const d = new Float64Array(n);
  const fadeFrom = Math.round(SR * (secs - 12));
  for (let k = 0; k * beat < n; k++) {
    const at = Math.round(k * beat);
    for (let i = 0; i < SR * 0.12 && at + i < n; i++) {
      const t = i / SR;
      d[at + i] += Math.sin(2 * Math.PI * (55 + 90 * Math.exp(-t / 0.02)) * t) * Math.exp(-t / 0.06) * 0.8;
    }
  }
  for (let i = 0; i < n; i++) {
    d[i] += 0.30 * Math.sin(2 * Math.PI * 330 * i / SR);
    if (i > fadeFrom) d[i] *= Math.max(0, 1 - (i - fadeFrom) / (n - fadeFrom));
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
  await new Promise(r => server.listen(8856, r));
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new', protocolTimeout: 600000,
    args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required', '--window-size=1500,1000']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1500, height: 1000 });
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  await page.goto('http://localhost:8856/mix-builder.html', { waitUntil: 'networkidle0' });

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mixend-'));
  const files = [fadingRecord(path.join(tmp, 'One.wav'), 60, 120),
                 fadingRecord(path.join(tmp, 'Two.wav'), 60, 120)];

  await (await page.$('#file')).uploadFile(files[0], files[1]);
  await page.waitForFunction(() => document.querySelectorAll('#timeline .clip.song').length >= 2 &&
                                   !document.querySelector('#timeline .clip.song.unlinked'),
                             { timeout: 240000 });

  const chose = await page.evaluate(() => {
    const t = window.__project().tracks[0];
    return { exit: +t.exitSec.toFixed(1), dur: +t.durationSec.toFixed(1) };
  });
  console.log('    the tool chose a mix-out of ' + chose.exit + 's on a ' + chose.dur + 's record');
  ok(chose.dur - chose.exit > 2,
     'the outro really is being left out to begin with',
     (chose.dur - chose.exit).toFixed(1) + 's unplayed');

  /* press it the way a person does */
  const pressed = await page.evaluate(async () => {
    const el = document.querySelector('#timeline .clip.song[data-index="0"]');
    const r = el.getBoundingClientRect();
    el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true,
      clientX: Math.round(r.left + 20), clientY: Math.round(r.top + 6) }));
    await new Promise(z => setTimeout(z, 300));
    const btn = document.querySelector('.clipmenu [data-cm="whole"]');
    if (!btn) return { err: 'no "play it to the end" on the song popup' };
    btn.click();
    await new Promise(z => setTimeout(z, 600));
    const t = window.__project().tracks[0];
    return { exit: +t.exitSec.toFixed(1), locked: !!t.exitLocked };
  });
  if (pressed.err) { ok(false, pressed.err); }
  else {
    ok(Math.abs(pressed.exit - chose.dur) < 0.5, 'Play it to the end reaches the end',
       pressed.exit + 's of ' + chose.dur + 's');
    ok(pressed.locked, 'and is marked as a decision, not a guess');
  }

  /* the part that actually broke: reopen and re-link */
  await page.reload({ waitUntil: 'networkidle0' });
  await page.waitForFunction(() => !!window.__project, { timeout: 60000 });
  await (await page.$('#file')).uploadFile(files[0], files[1]);
  await page.waitForFunction(() => document.querySelectorAll('#timeline .clip.song').length >= 2 &&
                                   !document.querySelector('#timeline .clip.song.unlinked'),
                             { timeout: 240000 });
  const after = await page.evaluate(() => {
    const t = window.__project().tracks[0];
    return { exit: +t.exitSec.toFixed(1), dur: +t.durationSec.toFixed(1), locked: !!t.exitLocked };
  });
  console.log('    after reopening and re-linking: mix-out ' + after.exit + 's of ' + after.dur + 's');
  ok(Math.abs(after.exit - after.dur) < 0.5,
     'and it is STILL at the end after reopening and re-linking the audio',
     after.exit + 's of ' + after.dur + 's');

  ok(errs.length === 0, 'no console errors', errs.slice(0, 2).join(' | '));
  await browser.close(); server.close();
  try { files.forEach(f => fs.unlinkSync(f)); fs.rmdirSync(tmp); } catch (e) {}
  console.log(fails ? '\n' + fails + ' FAILED' : '\na song can be finished at the end, and stays finished');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error('HARNESS FAILED:', e); process.exit(2); });
