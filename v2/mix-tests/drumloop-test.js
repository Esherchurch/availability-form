/* The drums between two records, played by a real loop.

   The synthesised kit measured as almost all kick — its hats 24 dB down —
   which is why nothing on the drum controls made much difference. A loop out
   of a pack is a better drummer, and the fill is built from it the same way it
   was built from the kit: beat by beat, each at its own tempo, walking from
   the record it leaves to the one it joins. */
const http = require('http'), fs = require('fs'), path = require('path');
const puppeteer = require('puppeteer-core');
const ROOT = path.join(__dirname, '..');
const LOOPS = 'C:/Users/marti/OneDrive/Documents/drums for claude';
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.wav': 'audio/wav' };
const server = http.createServer((q, r) => {
  const u = decodeURIComponent(q.url.split('?')[0]);
  if (u === '/favicon.ico') { r.writeHead(204); r.end(); return; }
  const base = u.startsWith('/loops/') ? LOOPS : ROOT;
  const rel = u.startsWith('/loops/') ? u.slice(7) : u;
  fs.readFile(path.join(base, rel), (e, b) => {
    if (e) { r.writeHead(404); r.end(''); return; }
    r.writeHead(200, { 'Content-Type': MIME[path.extname(u)] || 'application/octet-stream' });
    r.end(b);
  });
});
let fails = 0;
const ok = (c, m, x) => { console.log((c ? '  ok   ' : '  FAIL ') + m + (x ? '   — ' + x : '')); if (!c) fails++; };

(async () => {
  if (!fs.existsSync(LOOPS)) { console.log('  no loop folder on this machine — nothing to run'); process.exit(0); }
  const pick = fs.readdirSync(LOOPS).filter(f => /126-bpm|124-bpm/i.test(f))[0] ||
               fs.readdirSync(LOOPS).filter(f => /\.wav$/i.test(f))[0];
  await new Promise(r => server.listen(8838, r));
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new', protocolTimeout: 600000,
    args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required',
           '--js-flags=--max-old-space-size=4096']
  });
  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  await page.goto('http://localhost:8838/mix-builder.html', { waitUntil: 'networkidle0' });
  console.log('    using ' + pick);

  const out = await page.evaluate(async (name) => {
    const DSP = window.MixDSP, sr = 48000;
    const res = await fetch('/loops/' + encodeURIComponent(name));
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const loopBuf = await ctx.decodeAudioData(await res.arrayBuffer());

    /* the record the fill is levelled against */
    const rec = new OfflineAudioContext(1, sr * 20, sr).createBuffer(1, sr * 20, sr);
    const rd = rec.getChannelData(0);
    for (let i = 0; i < rd.length; i++) rd[i] = (Math.random() * 2 - 1) * 0.9;

    const base = { source: rec, atSec: 20, downbeatSec: 0, beats: 32, preBeats: 8,
                   overBeats: 0, fromBpm: 100, toBpm: 120, sampleRate: sr };

    const beats = Math.round(loopBuf.duration / (60 / 126)) || 16;
    const exactBpm = beats * 60 / loopBuf.duration;

    const synth = await DSP.buildBeatFill(Object.assign({}, base, { patternId: 'four' }));
    const looped = await DSP.buildBeatFill(Object.assign({}, base, {
      loop: { buffer: loopBuf, bpm: exactBpm, beats: beats, downbeatSec: 0, name: name }
    }));

    const band = (buf, fq) => {
      const d = buf.getChannelData(0), s = buf.sampleRate;
      const k = 2 * Math.cos(2 * Math.PI * fq / s);
      let s1 = 0, s2 = 0;
      for (let i = 0; i < d.length; i++) { const s0 = d[i] + k * s1 - s2; s2 = s1; s1 = s0; }
      return +(20 * Math.log10(Math.sqrt(Math.abs(s1*s1 + s2*s2 - k*s1*s2)) / d.length + 1e-12)).toFixed(1);
    };
    const look = b => ({ dur: +b.duration.toFixed(3), name: b.matchedName,
                         kick: band(b, 60), snare: band(b, 900), hat: band(b, 6000) });
    const loopSelf = { kick: band(loopBuf, 60), snare: band(loopBuf, 900), hat: band(loopBuf, 6000) };

    /* how long the fill SHOULD be: the beats it was asked for, at the tempos
       they walk through, plus the pre-roll at the outgoing tempo */
    const want = DSP.beatFillSec(32, 100, 120) + 8 * (60 / 100);
    return { synth: look(synth), loop: look(looped), loopSelf: loopSelf, want: +want.toFixed(3),
             loopDur: +loopBuf.duration.toFixed(3), beats: beats, exactBpm: +exactBpm.toFixed(2) };
  }, pick);

  console.log('    loop: ' + out.loopDur + 's = ' + out.beats + ' beats = ' + out.exactBpm + ' BPM');
  console.log('    synth kit:  ' + out.synth.dur + 's   60Hz ' + out.synth.kick +
              '  900Hz ' + out.synth.snare + '  6kHz ' + out.synth.hat);
  console.log('    real loop:  ' + out.loop.dur + 's   60Hz ' + out.loop.kick +
              '  900Hz ' + out.loop.snare + '  6kHz ' + out.loop.hat);

  ok(Math.abs(out.loop.dur - out.want) < 0.25,
     'the fill is the length the tempo walk asks for', out.loop.dur + 's vs ' + out.want + 's');
  ok(Math.abs(out.loop.dur - out.synth.dur) < 0.25,
     'the same length the synthesised kit would have been');
  /* The fill must sound like the loop it was handed, not like a generic kit.
     Asserted as a TILT — the gap between two bands — because the level stage
     moves the whole thing to sit against the record, so absolute levels say
     nothing about whether the right drums are playing. */
  const loopTilt = out.loopSelf.snare - out.loopSelf.kick;
  const fillTilt = out.loop.snare - out.loop.kick;
  const synthTilt = out.synth.snare - out.synth.kick;
  console.log('    tilt (900Hz minus 60Hz): loop ' + loopTilt.toFixed(1) +
              ', fill from it ' + fillTilt.toFixed(1) + ', synth kit ' + synthTilt.toFixed(1));
  ok(Math.abs(fillTilt - loopTilt) < 12,
     "the fill has the loop own balance, not a generic one",
     fillTilt.toFixed(1) + " vs the loop at " + loopTilt.toFixed(1));
  ok(out.loop.snare - out.synth.snare > 10,
     'and there is a kit in the midrange where the synth had nothing',
     (out.loop.snare - out.synth.snare).toFixed(1) + ' dB more at 900 Hz');
  ok(/\w/.test(out.loop.name || ''), 'and it says which loop played it', out.loop.name);

  ok(errs.length === 0, 'no console errors', errs.slice(0, 2).join(' | '));
  await browser.close(); server.close();
  console.log(fails ? '\n' + fails + ' FAILED' : '\nthe drums between records are played by a real kit');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error('HARNESS FAILED:', e); process.exit(2); });
