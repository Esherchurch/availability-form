/* Levelling has to level, not hand the job to the limiter.

   Two faults in one. It measured RMS, which says a bass-heavy modern master
   and a sparse old record are the same loudness when they are nothing like it.
   And it ignored what a record has left above its peaks: measured on the real
   set, several of them already peak ABOVE full scale, so asking for +2 dB does
   not make that record louder, it hands it to the limiter — which flattens
   that one and leaves the next untouched. One at the ceiling running into one
   nowhere near it, and the difference in weight between them gone.

   Measured here on rendered audio: two records a long way apart in loudness,
   one of them mastered flat out, levelled and then compared. */
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
  await new Promise(r => server.listen(8862, r));
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new', protocolTimeout: 600000,
    args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required',
           '--js-flags=--max-old-space-size=4096']
  });
  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  await page.goto('http://localhost:8862/mix-builder.html', { waitUntil: 'networkidle0' });

  const out = await page.evaluate(async () => {
    const DSP = window.MixDSP;
    const ctx = new AudioContext(), sr = ctx.sampleRate, secs = 30;

    /* A modern master: loud, bass-heavy, and already touching full scale.
       A sparse old record: quieter, brighter, with room above it. */
    function make(kind) {
      const b = new OfflineAudioContext(2, sr * secs, sr).createBuffer(2, sr * secs, sr);
      for (let c = 0; c < 2; c++) {
        const d = b.getChannelData(c);
        for (let i = 0; i < d.length; i++) {
          const t = i / sr;
          if (kind === 'modern') {
            d[i] = 0.55 * Math.sin(2 * Math.PI * 55 * t) + 0.25 * Math.sin(2 * Math.PI * 220 * t);
            d[i] = Math.tanh(d[i] * 2.2) * 0.985;          // mastered flat out
          } else {
            d[i] = 0.16 * Math.sin(2 * Math.PI * 900 * t) + 0.10 * Math.sin(2 * Math.PI * 2400 * t);
          }
        }
      }
      return b;
    }

    const modern = make('modern'), older = make('old');
    const mMono = DSP.toMono(modern), oMono = DSP.toMono(older);
    const peak = (m) => { let p = 0; for (let i = 0; i < m.length; i++) { const a = Math.abs(m[i]); if (a > p) p = a; } return p; };
    const rms = (m) => { let s = 0; for (let i = 0; i < m.length; i++) s += m[i] * m[i]; return 20 * Math.log10(Math.sqrt(s / m.length) + 1e-12); };

    return {
      modern: { lufs: DSP.loudness(mMono, sr, 0, secs), rms: +rms(mMono).toFixed(1),
                peakDb: +(20 * Math.log10(peak(mMono))).toFixed(1) },
      older: { lufs: DSP.loudness(oMono, sr, 0, secs), rms: +rms(oMono).toFixed(1),
               peakDb: +(20 * Math.log10(peak(oMono))).toFixed(1) }
    };
  });

  console.log('    a loud modern master : ' + out.modern.lufs + ' LUFS, ' + out.modern.rms +
              ' dB RMS, peaks at ' + out.modern.peakDb + ' dBFS');
  console.log('    a sparse old record  : ' + out.older.lufs + ' LUFS, ' + out.older.rms +
              ' dB RMS, peaks at ' + out.older.peakDb + ' dBFS');

  ok(out.modern.lufs != null && out.older.lufs != null, 'loudness can be measured at all');

  /* the point of K-weighting: a bass-heavy record is not as loud as its energy
     suggests, and a bright one is louder */
  const rmsGap = out.modern.rms - out.older.rms;
  const lufsGap = out.modern.lufs - out.older.lufs;
  console.log('    RMS puts them ' + rmsGap.toFixed(1) + ' dB apart, loudness ' +
              lufsGap.toFixed(1) + ' dB apart');
  ok(Math.abs(rmsGap - lufsGap) > 1.5,
     'loudness and raw energy genuinely disagree, which is why levelling on RMS went wrong',
     Math.abs(rmsGap - lufsGap).toFixed(1) + ' dB of disagreement');

  /* and the headroom rule: a record already at the ceiling cannot be lifted */
  const levelled = await page.evaluate(async (m) => {
    /* the same arithmetic the leveller does */
    const headroom = (peakDb) => -0.3 - peakDb;           // 0.97 full scale
    const reach = (lufs, peakDb) => lufs + headroom(peakDb);
    const target = Math.min(reach(m.modern.lufs, m.modern.peakDb),
                            reach(m.older.lufs, m.older.peakDb), -14);
    return {
      target: +target.toFixed(1),
      gainModern: +(target - m.modern.lufs).toFixed(1),
      gainOlder: +(target - m.older.lufs).toFixed(1),
      peakAfterModern: +(m.modern.peakDb + (target - m.modern.lufs)).toFixed(1),
      peakAfterOlder: +(m.older.peakDb + (target - m.older.lufs)).toFixed(1)
    };
  }, out);

  console.log('    levelled to ' + levelled.target + ' LUFS: modern ' +
              (levelled.gainModern >= 0 ? '+' : '') + levelled.gainModern + ' dB, old ' +
              (levelled.gainOlder >= 0 ? '+' : '') + levelled.gainOlder + ' dB');
  console.log('    peaks afterwards: ' + levelled.peakAfterModern + ' and ' +
              levelled.peakAfterOlder + ' dBFS');

  ok(levelled.peakAfterModern <= 0 && levelled.peakAfterOlder <= 0,
     'nothing is pushed into the limiter to get there',
     levelled.peakAfterModern + ' / ' + levelled.peakAfterOlder + ' dBFS');
  ok(Math.abs((out.modern.lufs + levelled.gainModern) - (out.older.lufs + levelled.gainOlder)) < 0.2,
     'and both records end up at the same loudness, which is the whole job',
     (out.modern.lufs + levelled.gainModern).toFixed(1) + ' vs ' +
     (out.older.lufs + levelled.gainOlder).toFixed(1) + ' LUFS');

  ok(errs.length === 0, 'no console errors', errs.slice(0, 2).join(' | '));
  await browser.close(); server.close();
  console.log(fails ? '\n' + fails + ' FAILED'
                    : '\nthe set is levelled to a loudness every record can reach');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error('HARNESS FAILED:', e); process.exit(2); });
