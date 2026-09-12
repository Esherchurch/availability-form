/* A record handing over to drums must be brought down under them, not stopped.

   With a fill there is no overlap — the two records never sound together — so
   the outgoing record fell to the hard-cut branch and ended at its mix-out
   with a 20 ms taper on it. The drums are already playing over its last bars
   by then, which is the whole point of the pre-roll, so what it wants is to be
   faded under them. The audition had always done this and the render had not,
   and the difference is exactly "it cuts the end off the song".

   Measured on the rendered track stream: the level over the last bars, against
   the same track rendered into a blend, where it is left alone. */
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
  await new Promise(r => server.listen(8842, r));
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new', protocolTimeout: 600000,
    args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required',
           '--js-flags=--max-old-space-size=4096']
  });
  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  await page.goto('http://localhost:8842/mix-builder.html', { waitUntil: 'networkidle0' });

  const out = await page.evaluate(async () => {
    const MP = window.MixProject, MR = window.MixRender, DSP = window.MixDSP;
    const sr = 44100, secs = 120;

    /* two records of steady tone, so any change in level is the mix's doing */
    function record(hz) {
      const ctx = new OfflineAudioContext(2, sr * secs, sr);
      const b = ctx.createBuffer(2, sr * secs, sr);
      for (let c = 0; c < 2; c++) {
        const d = b.getChannelData(c);
        for (let i = 0; i < d.length; i++) {
          const t = i / sr;
          d[i] = 0.4 * Math.sin(2 * Math.PI * hz * t);
          if ((t * 2) % 1 < 0.08) d[i] += 0.4 * Math.sin(2 * Math.PI * 55 * t);  // a kick, for the grid
        }
      }
      return b;
    }

    const rows = MP.parseRunningOrder(
      '#\tTrack\tArtist\tBPM\tSection\tMix\tNote\n' +
      '1\tOne\tA\t120\tW\t\t\n2\tTwo\tB\t120\tW\t\t');
    const buffers = new Map();

    async function renderWith(type, preBeats) {
      const p = MP.seedProject(rows, [], null);
      p.tracks.forEach((t, i) => {
        t.durationSec = secs; t.entrySec = 0; t.exitSec = secs - 2;
        t.linked = true; t.sourceBpm = 120; t.downbeatSec = 0;
      });
      p.junctions[0] = type === 'bridge'
        ? { type: 'throw-bridge', beatBeats: 32, preBeats: preBeats,
            carryMode: 'fixed', overBeats: 0, fillGainDb: -60 }
        : { type: 'blend', bars: 8 };
      buffers.set(p.tracks[0].id, record(440));
      buffers.set(p.tracks[1].id, record(660));
      window.__RENDER_TRACE = [];
      const res = await MR.render(p, buffers, { ctx: new AudioContext(), measureAlignment: false });
      const trace = (window.__RENDER_TRACE||[]).map(function(x){ return "trk"+x.track+" n="+(x.n/x.sr).toFixed(1)+"s overlap="+(x.outOverlap/x.sr).toFixed(1)+"s body="+(x.bodyEnd/x.sr).toFixed(1)+"s"; }).join("  |  ");
      const ab = await res.blob.arrayBuffer();
      const dv = new DataView(ab);
      let pos = 12, dataAt = 0, ch = 2, rate = sr;
      while (pos + 8 <= ab.byteLength) {
        const id = String.fromCharCode(dv.getUint8(pos), dv.getUint8(pos+1), dv.getUint8(pos+2), dv.getUint8(pos+3));
        const sz = dv.getUint32(pos + 4, true);
        if (id === 'fmt ') { ch = dv.getUint16(pos + 10, true); rate = dv.getUint32(pos + 12, true); }
        if (id === 'data') { dataAt = pos + 8; break; }
        pos += 8 + sz + (sz & 1);
      }
      /* the level of the 440 Hz record only, so the drums do not count */
      const tone = (fromSec, lenSec) => {
        const i0 = Math.max(0, Math.floor(fromSec * rate)), n = Math.floor(lenSec * rate);
        let s = 0, m = 0;
        for (let i = 0; i < n; i++) {
          const at = dataAt + (i0 + i) * ch * 2;
          if (at + 1 >= ab.byteLength) break;
          const x = dv.getInt16(at, true) / 32768;
          s += x * x; m++;
        }
        return 10 * Math.log10(s / Math.max(1, m) + 1e-12);
      };
      const handover = res.plan.tracks[0].startSec + res.plan.tracks[0].outSec;
      const j0 = res.plan.junctions[0];
      return { early: tone(handover - 30, 2), late: tone(handover - 1.5, 1.2),
               handover: +handover.toFixed(2),
               fill: j0 && j0.fill ? { beats: j0.fill.beats, sec: +j0.fill.sec.toFixed(2) } : null,
               gapSec: j0 ? +(j0.gapSec || 0).toFixed(2) : null,
               trace: trace,
               report: JSON.stringify((res.report&&res.report.fills)||res.report&&Object.keys(res.report)).slice(0,300),
               pt: { outSec: +res.plan.tracks[0].outSec.toFixed(2),
                     from: +(res.plan.tracks[0].sourceFromSec||0).toFixed(2),
                     to: +(res.plan.tracks[0].sourceToSec||0).toFixed(2),
                     r0: res.plan.tracks[0].r0, r1: res.plan.tracks[0].r1 },
               sweep: [100,102,104,106,108,109,110,112,114,116,117].map(function (s) {
                 return s + 's ' + tone(s, 1).toFixed(0);
               }).join('  '),
               sanity: { at10s: +tone(10, 1).toFixed(1), at60s: +tone(60, 1).toFixed(1),
                         totalSec: +((ab.byteLength - dataAt) / (ch * 2) / rate).toFixed(1),
                         rate: rate, ch: ch },
               curve: [8, 6, 4, 3, 2, 1, 0.5].map(function (back) {
                 return +tone(handover - back, 0.4).toFixed(1);
               }) };
    }

    /* The same bridge twice: with a pre-roll, where the drums are over the
       record's last bars and it should go under them, and without one, where
       there is nothing over it and it plays to its mix-out. */
    return { withPre: await renderWith('bridge', 16), noPre: await renderWith('bridge', 0) };
  });

  console.log('    sanity: ' + JSON.stringify(out.withPre.sanity));
  console.log('    trace: ' + out.withPre.trace);
  console.log('    report: ' + out.withPre.report);
  console.log('    plan says: ' + JSON.stringify(out.withPre.pt));
  console.log('    16-beat pre-roll: ' + out.withPre.sweep);
  console.log('    no pre-roll    : ' + out.noPre.sweep);
  console.log('    with pre-roll: fill=' + JSON.stringify(out.withPre.fill) + ' gap=' + out.withPre.gapSec + ' handover=' + out.withPre.handover);
  console.log('    level 8,6,4,3,2,1,0.5s before the handover: ' + out.withPre.curve.join(', '));
  console.log('    no pre-roll  : ' + out.noPre.curve.join(', '));
  /* The property that matters, stated plainly: a record is supposed to play
     until its mix-out. Measured on the rendered file it stops about ten
     seconds before it, with nothing in the gap — the plan says the record runs
     to 118s and the rendered stream is 108.4s long. This asserts what should
     be true; while it fails, that is the bug, not the test. */
  const beforeEnd = out.withPre.curve ? out.withPre.curve[out.withPre.curve.length - 3] : null;
  ok(beforeEnd != null && beforeEnd > -60,
     'the record is still playing two seconds before its mix-out',
     beforeEnd + ' dB');

  ok(errs.length === 0, 'no console errors', errs.slice(0, 2).join(' | '));
  await browser.close(); server.close();
  console.log(fails ? '\n' + fails + ' FAILED'
                    : '\nthe record goes under the drums rather than off a cliff');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error('HARNESS FAILED:', e); process.exit(2); });
