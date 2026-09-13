/* The fade and the overlap are two different lengths, and either can be longer.

     fade  <  overlap : the record plays out at full level under the incoming
                        one and leaves at the very end — how you keep a last
                        word or a held note.
     fade  == overlap : the classic crossfade, one down as the other comes up.
     fade  >  overlap : it starts going before the next record arrives, which
                        is what a fade-out is.

   The third was impossible: the fade was hung off the START of the overlap, so
   it could never be longer than it. It hangs off the end of the record now. */
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
  await new Promise(r => server.listen(8852, r));
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new', protocolTimeout: 600000,
    args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required',
           '--js-flags=--max-old-space-size=4096']
  });
  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  await page.goto('http://localhost:8852/mix-builder.html', { waitUntil: 'networkidle0' });

  const out = await page.evaluate(async () => {
    const MP = window.MixProject, MR = window.MixRender;
    const sr = (new AudioContext()).sampleRate, secs = 40;
    const rec = () => {
      const b = new OfflineAudioContext(2, sr * secs, sr).createBuffer(2, sr * secs, sr);
      for (let c = 0; c < 2; c++) {
        const d = b.getChannelData(c);
        for (let i = 0; i < d.length; i++) d[i] = 0.35 * Math.sin(2 * Math.PI * 300 * i / sr);
      }
      return b;
    };
    const TAB = String.fromCharCode(9), NL = String.fromCharCode(10);
    const rows = MP.parseRunningOrder(
      ['#', 'Track', 'Artist', 'BPM', 'Section', 'Mix', 'Note'].join(TAB) + NL +
      ['1', 'One', 'A', '90', 'W', '', ''].join(TAB) + NL +
      ['2', 'Two', 'B', '140', 'W', '', ''].join(TAB));

    async function go(outFadeSec) {
      const p = MP.seedProject(rows, [], null);
      p.tracks.forEach(t => { t.durationSec = secs; t.entrySec = 0; t.exitSec = secs - 1;
                              t.linked = true; t.downbeatSec = 0; });
      p.tracks[0].sourceBpm = 90; p.tracks[1].sourceBpm = 140;
      p.junctions[0] = { type: 'crossfade', crossSec: 6 };
      if (outFadeSec != null) p.junctions[0].outFadeSec = outFadeSec;
      const bufs = new Map();
      bufs.set(p.tracks[0].id, rec());
      bufs.set(p.tracks[1].id, rec());
      const res = await MR.render(p, bufs, { ctx: new AudioContext(), measureAlignment: false });

      const ab = await res.blob.arrayBuffer(), dv = new DataView(ab);
      let pos = 12, dataAt = 0, ch = 2, rate = sr;
      while (pos + 8 <= ab.byteLength) {
        const id = String.fromCharCode(dv.getUint8(pos), dv.getUint8(pos + 1),
                                       dv.getUint8(pos + 2), dv.getUint8(pos + 3));
        const sz = dv.getUint32(pos + 4, true);
        if (id === 'fmt ') { ch = dv.getUint16(pos + 10, true); rate = dv.getUint32(pos + 12, true); }
        if (id === 'data') { dataAt = pos + 8; break; }
        pos += 8 + sz + (sz & 1);
      }
      const lvl = (fromSec, len) => {
        const i0 = Math.floor(fromSec * rate), nn = Math.floor(len * rate);
        let s = 0, m = 0;
        for (let i = 0; i < nn; i++) {
          const at = dataAt + (i0 + i) * ch * 2;
          if (at + 1 >= ab.byteLength) break;
          const x = dv.getInt16(at, true) / 32768; s += x * x; m++;
        }
        return 10 * Math.log10(s / Math.max(1, m) + 1e-12);
      };
      const ends = res.plan.tracks[0].startSec + res.plan.tracks[0].outSec;
      /* ten seconds out is BEFORE the six second overlap begins */
      /* eight seconds out is two seconds BEFORE the six second overlap starts,
         so nothing of the incoming record is in this window at all */
      return { tenOut: +lvl(ends - 8, 1).toFixed(1),
               threeOut: +lvl(ends - 3, 1).toFixed(1) };
    }

    return { matched: await go(6), longFade: await go(14), shortFade: await go(1.5) };
  });

  console.log('    fade 6s = overlap : ' + out.matched.tenOut + ' dB ten seconds out, ' +
              out.matched.threeOut + ' dB three out');
  console.log('    fade 14s > overlap: ' + out.longFade.tenOut + ' dB and ' +
              out.longFade.threeOut + ' dB');
  console.log('    fade 1.5s < overlap: ' + out.shortFade.tenOut + ' dB and ' +
              out.shortFade.threeOut + ' dB');

  ok(out.matched.tenOut - out.longFade.tenOut > 1.5,
     'a fade longer than the overlap has already begun before the next record arrives',
     (out.matched.tenOut - out.longFade.tenOut).toFixed(1) + ' dB lower before the overlap even starts');
  ok(out.shortFade.threeOut - out.matched.threeOut > 2,
     'and a fade shorter than it is still at full level three seconds from the end',
     (out.shortFade.threeOut - out.matched.threeOut).toFixed(1) + ' dB higher');

  ok(errs.length === 0, 'no console errors', errs.slice(0, 2).join(' | '));
  await browser.close(); server.close();
  console.log(fails ? '\n' + fails + ' FAILED'
                    : '\nthe fade can be shorter than the overlap, the same, or longer');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error('HARNESS FAILED:', e); process.exit(2); });
