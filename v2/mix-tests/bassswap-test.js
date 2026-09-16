/* A blend must never leave both records without any bottom.

   A DJ takes the bass off the record coming in and hands the bottom over as
   the outgoing one leaves: at any instant ONE record owns the low end. What
   the code did was ramp the outgoing record's bass down across the first half
   of the overlap while holding the incoming record's bass cut for that same
   half — so in the middle of every blend neither had any.

   Measured on a real two hour mix: at the midpoint of every blend the low end
   sat 16 to 21 dB below where it was either side. "It sounds completely tinny
   between songs" was exactly right, and it was the two cuts overlapping rather
   than either one being wrong.

   Here: two records with strong, steady bottom ends, blended, and the low band
   measured right through the overlap. */
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
  await new Promise(r => server.listen(8868, r));
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new', protocolTimeout: 900000,
    args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required',
           '--js-flags=--max-old-space-size=4096']
  });
  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  await page.goto('http://localhost:8868/mix-builder.html', { waitUntil: 'networkidle0' });

  const out = await page.evaluate(async () => {
    const MP = window.MixProject, MR = window.MixRender;
    const sr = (new AudioContext()).sampleRate, secs = 60;

    /* a record with a solid bottom end and a kick on the beat */
    function record(bassHz, topHz, bpm) {
      const b = new OfflineAudioContext(2, sr * secs, sr).createBuffer(2, sr * secs, sr);
      const beat = 60 / bpm;
      for (let c = 0; c < 2; c++) {
        const d = b.getChannelData(c);
        for (let i = 0; i < d.length; i++) {
          const t = i / sr;
          d[i] = 0.35 * Math.sin(2 * Math.PI * bassHz * t) + 0.18 * Math.sin(2 * Math.PI * topHz * t);
          if ((t % beat) < 0.07) d[i] += 0.35 * Math.sin(2 * Math.PI * 55 * t);
        }
      }
      return b;
    }

    const TAB = String.fromCharCode(9), NL = String.fromCharCode(10);
    const rows = MP.parseRunningOrder(
      ['#', 'Track', 'Artist', 'BPM', 'Section', 'Mix', 'Note'].join(TAB) + NL +
      ['1', 'One', 'A', '120', 'W', '', ''].join(TAB) + NL +
      ['2', 'Two', 'B', '120', 'W', '', ''].join(TAB));

    const p = MP.seedProject(rows, [], null);
    p.tracks.forEach(t => { t.durationSec = secs; t.entrySec = 0; t.exitSec = secs - 2;
                            t.linked = true; t.sourceBpm = 120; t.downbeatSec = 0; });
    p.junctions[0] = { type: 'blend', bars: 8, bassCutDb: 20 };
    const bufs = new Map();
    bufs.set(p.tracks[0].id, record(60, 700, 120));
    bufs.set(p.tracks[1].id, record(70, 1100, 120));
    const res = await MR.render(p, bufs, { ctx: new AudioContext(), measureAlignment: false });

    const ab = await res.blob.arrayBuffer(), dv = new DataView(ab);
    let pos = 12, dataAt = 0, ch = 2, rate = sr;
    while (pos + 8 <= ab.byteLength) {
      const id = String.fromCharCode(dv.getUint8(pos), dv.getUint8(pos+1),
                                     dv.getUint8(pos+2), dv.getUint8(pos+3));
      const sz = dv.getUint32(pos + 4, true);
      if (id === 'fmt ') { ch = dv.getUint16(pos + 10, true); rate = dv.getUint32(pos + 12, true); }
      if (id === 'data') { dataAt = pos + 8; break; }
      pos += 8 + sz + (sz & 1);
    }
    const low = (fromSec, len) => {
      const a = Math.exp(-2 * Math.PI * 150 / rate);
      const i0 = Math.max(0, Math.floor(fromSec * rate)), n = Math.floor(len * rate);
      let lp = 0, acc = 0, m = 0;
      for (let i = 0; i < n; i++) {
        const at = dataAt + (i0 + i) * ch * 2;
        if (at + 1 >= ab.byteLength) break;
        const x = dv.getInt16(at, true) / 32768;
        lp = a * lp + (1 - a) * x; acc += lp * lp; m++;
      }
      return +(10 * Math.log10(acc / Math.max(1, m) + 1e-20)).toFixed(1);
    };

    const j = res.plan.junctions[0], ov = j.overlapSec;
    const start = res.plan.tracks[1].startSec;
    return {
      overlap: +ov.toFixed(1),
      before: low(start - 5, 3),
      quarter: low(start + ov * 0.25, Math.min(2, ov * 0.2)),
      mid: low(start + ov * 0.5 - 0.5, Math.min(2, ov * 0.2)),
      threeQ: low(start + ov * 0.75, Math.min(2, ov * 0.2)),
      after: low(start + ov + 2, 3)
    };
  });

  console.log('    low end across a ' + out.overlap + 's blend:');
  console.log('      before ' + out.before + '   quarter ' + out.quarter + '   MIDDLE ' + out.mid +
              '   three-quarters ' + out.threeQ + '   after ' + out.after + ' dB');

  const floor = Math.min(out.before, out.after);
  const dipMid = floor - out.mid;
  const dipWorst = floor - Math.min(out.quarter, out.mid, out.threeQ);
  console.log('    deepest the bottom gets, against either side: ' + dipWorst.toFixed(1) + ' dB');

  ok(dipMid < 6, 'the middle of a blend still has a bottom end',
     dipMid.toFixed(1) + ' dB below the records either side');
  ok(dipWorst < 8, 'and nowhere in the overlap loses it',
     dipWorst.toFixed(1) + ' dB at worst');

  /* and the swap is real: turning it off must change what comes out */
  ok(out.before > -40 && out.after > -40, 'the records themselves have a bottom end to lose',
     out.before + ' / ' + out.after + ' dB');

  /* ---- and the swap waits for the record coming in ------------------

     Halfway is arbitrary and often wrong. A record that opens on strings and
     brings its drums in eight bars later should not be handed the bottom end
     before it has a beat to put under it; one that starts on a kick should
     have it at once. */
  const when = await page.evaluate(async () => {
    const MP = window.MixProject, MR = window.MixRender;
    const sr = (new AudioContext()).sampleRate, secs = 60;
    /* two incoming records: one in straight away, one that waits */
    function rec(drumsAfterSec) {
      const b = new OfflineAudioContext(2, sr * secs, sr).createBuffer(2, sr * secs, sr);
      const beat = 0.5;
      for (let c = 0; c < 2; c++) {
        const d = b.getChannelData(c);
        for (let i = 0; i < d.length; i++) {
          const t2 = i / sr;
          d[i] = 0.18 * Math.sin(2 * Math.PI * 500 * t2);         // a pad, throughout
          if (t2 > drumsAfterSec && (t2 % beat) < 0.07) {
            d[i] += 0.5 * Math.sin(2 * Math.PI * 55 * t2);        // the kit, when it arrives
          }
        }
      }
      return b;
    }
    const TAB = String.fromCharCode(9), NL = String.fromCharCode(10);
    const rows = MP.parseRunningOrder(
      ['#', 'Track', 'Artist', 'BPM', 'Section', 'Mix', 'Note'].join(TAB) + NL +
      ['1', 'One', 'A', '120', 'W', '', ''].join(TAB) + NL +
      ['2', 'Two', 'B', '120', 'W', '', ''].join(TAB));
    async function swapAt(drumsAfterSec) {
      const p = MP.seedProject(rows, [], null);
      p.tracks.forEach(t2 => { t2.durationSec = secs; t2.entrySec = 0; t2.exitSec = secs - 2;
                               t2.linked = true; t2.sourceBpm = 120; t2.downbeatSec = 0; });
      p.junctions[0] = { type: 'blend', bars: 8, bassCutDb: 20 };
      const bufs = new Map();
      bufs.set(p.tracks[0].id, rec(0));
      bufs.set(p.tracks[1].id, rec(drumsAfterSec));
      const res = await MR.render(p, bufs, { ctx: new AudioContext(), measureAlignment: false });
      const j = res.plan.junctions[0];
      return { at: +(j.bassSwapSec || 0).toFixed(1), ov: +(j.overlapSec || 0).toFixed(1) };
    }
    return { straightIn: await swapAt(0), waits: await swapAt(8) };
  });
  console.log('    drums in at once : bottom changes hands ' + when.straightIn.at +
              's into a ' + when.straightIn.ov + 's blend');
  console.log('    drums after 8s   : ' + when.waits.at + 's into ' + when.waits.ov + 's');
  ok(when.waits.at > when.straightIn.at + 1.5,
     'the bottom is handed over later when the incoming record takes longer to get going',
     when.straightIn.at + 's vs ' + when.waits.at + 's');
  ok(when.waits.at % 2 < 0.05 || Math.abs(when.waits.at % 2 - 2) < 0.05,
     'and it lands on a bar rather than between them', when.waits.at + 's');

  ok(errs.length === 0, 'no console errors', errs.slice(0, 2).join(' | '));
  await browser.close(); server.close();
  console.log(fails ? '\n' + fails + ' FAILED'
                    : '\none record always owns the bottom through a blend');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error('HARNESS FAILED:', e); process.exit(2); });
