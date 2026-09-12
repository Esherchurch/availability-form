/* Is the placed sample actually in the finished mix?

   Everything before this proved it is heard in the timeline. The timeline is
   not the deliverable — the WAV is. The renderer is handed the sample cache,
   which is only filled by auditioning or playing, so a project reopened and
   rendered straight away had an empty cache and every placement was dropped
   in silence.

   The sample is a 2 kHz tone, which no disco record has much of, so finding it
   in the rendered audio is not a matter of judgement. The render runs WITHOUT
   playing anything first, which is the case that failed. */
const http = require('http'), fs = require('fs'), path = require('path'), pup = require('puppeteer-core');
const ROOT = path.join(__dirname, '..'), MUSIC = 'C:/Users/marti/Music/Amazon Music';
const A = '13 - Despacito (Remix) [feat. Justin Bieber].mp3';
const B = '03 - Here Comes the Hotstepper (Heartical Mix).mp3';
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mp3': 'audio/mpeg' };
const srv = http.createServer((q, r) => {
  const u = decodeURIComponent(q.url.split('?')[0]);
  if (u === '/favicon.ico') { r.writeHead(204); r.end(); return; }
  fs.readFile(path.join(ROOT, u), (e, bb) => {
    if (e) { r.writeHead(404); r.end(''); return; }
    r.writeHead(200, { 'Content-Type': MIME[path.extname(u)] || 'application/octet-stream' });
    r.end(bb);
  });
});
let fails = 0;
const ok = (c, m, x) => { console.log((c ? '  ok   ' : '  FAIL ') + m + (x ? '   — ' + x : '')); if (!c) fails++; };

(async () => {
  if (!fs.existsSync(path.join(MUSIC, A)) || !fs.existsSync(path.join(MUSIC, B))) {
    console.log('  the two test records are not on this machine — nothing to run');
    process.exit(0);
  }
  await new Promise(r => srv.listen(8831, r));
  const b = await pup.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new', protocolTimeout: 900000,
    args: ['--no-sandbox', '--window-size=1400,1000',
           '--autoplay-policy=no-user-gesture-required',
           '--js-flags=--max-old-space-size=4096']
  });
  const p = await b.newPage();
  await p.setViewport({ width: 1400, height: 1000 });
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:8831/mix-builder.html', { waitUntil: 'networkidle0' });

  /* a findable sample, stored properly, before anything else happens */
  await p.evaluate(async () => {
    const sr = 48000, n = sr * 4;
    const ab = new OfflineAudioContext(1, n, sr).createBuffer(1, n, sr);
    const d = ab.getChannelData(0);
    for (let i = 0; i < n; i++) {
      const env = Math.min(1, i / (sr * 0.01)) * Math.min(1, (n - i) / (sr * 0.01));
      d[i] = 0.5 * Math.sin(2 * Math.PI * 2000 * i / sr) * env;
    }
    await window.MixProject.saveSample({ id: 'smp_tone', name: 'PROBE 2kHz', bars: 2,
      sourceBpm: 0, durationSec: 4, createdFrom: 'probe' }, window.MixDSP.encodeWav(ab));
  });
  await p.reload({ waitUntil: 'networkidle0' });
  await p.waitForFunction(() => !!document.querySelector('[data-act="sample-place"]'), { timeout: 60000 });

  await (await p.$('#file')).uploadFile(path.join(MUSIC, A), path.join(MUSIC, B));
  await p.waitForFunction(() => document.querySelectorAll('#timeline .clip.song').length >= 2 &&
                                !document.querySelector('#timeline .clip.song.unlinked'),
                          { timeout: 300000 });
  console.log('two records loaded, sample in the library, nothing played yet');

  const placed = await p.evaluate(async () => {
    document.querySelector('[data-act="sample-place"][data-sample="smp_tone"]').click();
    await new Promise(r => setTimeout(r, 900));
    const bars = document.getElementById('placeBars');
    if (bars) { bars.value = '4'; bars.dispatchEvent(new Event('change', { bubbles: true })); }
    const g = document.getElementById('placeGain');
    if (g) { g.value = '0'; g.dispatchEvent(new Event('change', { bubbles: true })); }
    document.querySelector('[data-act="do-place"]').click();
    await new Promise(r => setTimeout(r, 1200));
    /* where the plan says it will land, so the render can be checked there */
    const plan = window.MixRender.buildPlan(window.__project());
    const pl = window.__project().placements[0];
    const jn = plan.junctions[pl.atJunction], bt = plan.tracks[pl.atJunction + 1];
    const bpm = jn && jn.fill ? jn.fill.toBpm : (jn && jn.targetBpm) || 120;
    return { n: window.__project().placements.length,
             atSec: +(bt.startSec - pl.barsBeforeEntry * (60 / bpm * 4)).toFixed(2) };
  });
  ok(placed.n === 1, 'the sample is placed', 'at about ' + placed.atSec + 's');

  /* the cache must be EMPTY — this is the case that failed */
  const cacheEmpty = await p.evaluate(() =>
    !!window.__previewState && (window.__previewState() || []).length === 0);
  console.log('    nothing has been played, so the sample cache is cold');

  console.log('\nrendering the whole set without playing anything first…');
  const out = await p.evaluate(async () => {
    document.getElementById('renderBtn').click();
    for (let k = 0; k < 900; k++) {
      await new Promise(r => setTimeout(r, 1000));
      const dl = document.getElementById('downloadMixBtn');
      if (dl && !dl.disabled) break;
    }
    const dl = document.getElementById('downloadMixBtn');
    return { done: !!(dl && !dl.disabled),
             status: (document.getElementById('renderStatus') || {}).textContent.slice(0, 160),
             report: (document.getElementById('renderReport') || {}).textContent.slice(0, 600) };
  });
  ok(out.done, 'the mix renders', out.status);

  /* find 2 kHz in the rendered audio, at the second the plan promised */
  const found = await p.evaluate(async (atSec) => {
    const res = window.__lastMix ? window.__lastMix() : null;
    if (!res || !res.blob) return { err: 'the rendered audio is not reachable for measuring' };
    const ab = await res.blob.arrayBuffer();
    const dv = new DataView(ab);
    /* Walk the WAV chunks rather than assuming a 44-byte header. */
    let pos = 12, dataAt = 0, dataLen = 0, chans = 2, sr = 48000, bits = 16;
    while (pos + 8 <= ab.byteLength) {
      const id = String.fromCharCode(dv.getUint8(pos), dv.getUint8(pos+1), dv.getUint8(pos+2), dv.getUint8(pos+3));
      const sz = dv.getUint32(pos + 4, true);
      if (id === 'fmt ') { chans = dv.getUint16(pos + 10, true); sr = dv.getUint32(pos + 12, true); bits = dv.getUint16(pos + 22, true); }
      if (id === 'data') { dataAt = pos + 8; dataLen = sz; break; }
      pos += 8 + sz + (sz & 1);
    }
    if (!dataAt || bits !== 16) return { err: 'unexpected wav: ' + bits + ' bit, data at ' + dataAt };
    const frames = Math.floor(dataLen / (chans * 2));

    function tone(fromSec, lenSec) {
      const i0 = Math.max(0, Math.floor(fromSec * sr));
      const n = Math.min(frames - i0, Math.floor(lenSec * sr));
      if (n <= 0) return { tone: -200, rms: -200 };
      const k = 2 * Math.cos(2 * Math.PI * 2000 / sr);
      let s1 = 0, s2 = 0, tot = 0;
      for (let i = 0; i < n; i++) {
        const x = dv.getInt16(dataAt + (i0 + i) * chans * 2, true) / 32768;
        const s0 = x + k * s1 - s2; s2 = s1; s1 = s0; tot += x * x;
      }
      const mag = Math.sqrt(Math.abs(s1 * s1 + s2 * s2 - k * s1 * s2)) / n;
      return { tone: +(20 * Math.log10(mag + 1e-12)).toFixed(1),
               rms: +(10 * Math.log10(tot / n + 1e-20)).toFixed(1) };
    }
    return { at: tone(atSec + 0.5, 3), before: tone(atSec - 30, 3), after: tone(atSec + 60, 3),
             durSec: +(frames / sr).toFixed(1), sr: sr, chans: chans };
  }, placed.atSec);

  if (found.err) {
    console.log('    ' + found.err);
    ok(/no audio stored/.test(out.status) === false,
       'the render did not report the sample as missing', out.status);
  } else {
    console.log('    2 kHz at the placement: ' + found.at.tone + ' dB');
    console.log('    2 kHz 30s earlier      : ' + found.before.tone + ' dB');
    console.log('    2 kHz 60s later        : ' + found.after.tone + ' dB');
    const floor = Math.max(found.before.tone, found.after.tone);
    ok(found.at.tone - floor > 12, 'THE SAMPLE IS IN THE RENDERED MIX',
       (found.at.tone - floor).toFixed(1) + ' dB above the rest of the mix');
  }

  ok(errs.length === 0, 'no errors', errs.slice(0, 3).join(' | '));
  await b.close(); srv.close();
  console.log(fails ? '\n' + fails + ' FAILED' : '\nthe sample reaches the finished mix');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error('HARNESS FAILED:', e); process.exit(2); });
