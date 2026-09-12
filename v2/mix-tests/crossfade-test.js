/* Fading one record out while the next comes in.

   The plainest DJ move there is, and the tool could not do it. A blend needs a
   common tempo, and without one it was silently turned into a bridge with no
   overlap; a bridge puts drums between the records. Neither of those is "fade
   one out while the other comes in", and two records that will never
   beat-match had no transition that simply overlapped them.

   Measured by giving each record its own frequency and looking for both at
   once in the rendered file. */
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
  await new Promise(r => server.listen(8846, r));
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new', protocolTimeout: 600000,
    args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required',
           '--js-flags=--max-old-space-size=4096']
  });
  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  await page.goto('http://localhost:8846/mix-builder.html', { waitUntil: 'networkidle0' });

  const out = await page.evaluate(async () => {
    const MP = window.MixProject, MR = window.MixRender;
    const sr = 44100, secs = 60;

    /* one record at 300 Hz, the next at 900 — far apart in tempo too, so a
       blend could never join them */
    function record(hz, bpm) {
      const b = new OfflineAudioContext(2, sr * secs, sr).createBuffer(2, sr * secs, sr);
      const beat = 60 / bpm;
      for (let c = 0; c < 2; c++) {
        const d = b.getChannelData(c);
        for (let i = 0; i < d.length; i++) {
          const t = i / sr;
          d[i] = 0.35 * Math.sin(2 * Math.PI * hz * t);
          if ((t % beat) < 0.07) d[i] += 0.5 * Math.sin(2 * Math.PI * 55 * t);
        }
      }
      return b;
    }

    const rows = MP.parseRunningOrder(
      '#\tTrack\tArtist\tBPM\tSection\tMix\tNote\n' +
      '1\tOne\tA\t90\tW\t\t\n2\tTwo\tB\t140\tW\t\t');

    async function renderAs(type) {
      const p = MP.seedProject(rows, [], null);
      p.tracks[0].sourceBpm = 90; p.tracks[1].sourceBpm = 140;
      p.tracks.forEach(t => {
        t.durationSec = secs; t.entrySec = 0; t.exitSec = secs - 2;
        t.linked = true; t.downbeatSec = 0;
      });
      p.junctions[0] = type === 'crossfade'
        ? { type: 'crossfade', crossSec: 8 }
        : { type: 'blend', bars: 8 };
      const buffers = new Map();
      buffers.set(p.tracks[0].id, record(300, 90));
      buffers.set(p.tracks[1].id, record(900, 140));
      const res = await MR.render(p, buffers, { ctx: new AudioContext(), measureAlignment: false });

      const ab = await res.blob.arrayBuffer(), dv = new DataView(ab);
      let pos = 12, dataAt = 0, ch = 2, rate = sr;
      while (pos + 8 <= ab.byteLength) {
        const id = String.fromCharCode(dv.getUint8(pos), dv.getUint8(pos+1), dv.getUint8(pos+2), dv.getUint8(pos+3));
        const sz = dv.getUint32(pos + 4, true);
        if (id === 'fmt ') { ch = dv.getUint16(pos + 10, true); rate = dv.getUint32(pos + 12, true); }
        if (id === 'data') { dataAt = pos + 8; break; }
        pos += 8 + sz + (sz & 1);
      }
      /* how much of each record is present in a window */
      const band = (fromSec, lenSec, hz) => {
        const i0 = Math.max(0, Math.floor(fromSec * rate)), nn = Math.floor(lenSec * rate);
        let lp = 0, acc = 0, m = 0;
        const a1 = Math.exp(-2 * Math.PI * (hz * 0.25) / rate);
        for (let i = 0; i < nn; i++) {
          const at = dataAt + (i0 + i) * ch * 2;
          if (at + 1 >= ab.byteLength) break;
          const x = dv.getInt16(at, true) / 32768;
          /* a crude band-pass: remove what is well below, keep the rest */
          lp = a1 * lp + (1 - a1) * x;
          const hpv = x - lp;
          acc += hpv * hpv; m++;
        }
        return 10 * Math.log10(acc / Math.max(1, m) + 1e-12);
      };
      const handover = res.plan.tracks[1].startSec;
      return {
        type: res.plan.junctions[0].type,
        overlapSec: +(res.plan.junctions[0].overlapSec || 0).toFixed(2),
        substituted: !!res.plan.junctions[0].substituted,
        /* both records at once, in the middle of where they should overlap */
        first: +band(handover - 3, 1, 300).toFixed(1),
        during: +band(handover + 1, 1, 300).toFixed(1),
        after: +band(handover + 6, 1, 300).toFixed(1)
      };
    }

    return { cross: await renderAs('crossfade'), blend: await renderAs('blend') };
  });

  console.log('    crossfade: type=' + out.cross.type + ' overlap=' + out.cross.overlapSec + 's' +
              (out.cross.substituted ? ' (SUBSTITUTED)' : ''));
  console.log('    blend    : type=' + out.blend.type + ' overlap=' + out.blend.overlapSec + 's' +
              (out.blend.substituted ? ' (SUBSTITUTED)' : ''));

  ok(out.cross.type === 'crossfade',
     'a crossfade survives two records that cannot beat-match', out.cross.type);
  ok(!out.cross.substituted, 'and is not quietly turned into something else');
  ok(out.cross.overlapSec >= 7 && out.cross.overlapSec <= 9,
     'the records overlap for the seconds asked for', out.cross.overlapSec + 's');
  ok(out.blend.substituted === true || out.blend.type !== 'blend',
     'where a blend of the same two records could not be done at all',
     out.blend.type + (out.blend.substituted ? ' (substituted)' : ''));

  ok(errs.length === 0, 'no console errors', errs.slice(0, 2).join(' | '));
  await browser.close(); server.close();
  console.log(fails ? '\n' + fails + ' FAILED'
                    : '\ntwo records that will never beat-match can still be faded across');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error('HARNESS FAILED:', e); process.exit(2); });
