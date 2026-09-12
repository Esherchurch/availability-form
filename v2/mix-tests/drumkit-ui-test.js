/* Two faults reported together, both measurable:

   1. The drum loops were not in the Kit list, so a library full of them could
      not be used.
   2. The carry into the next record ignored the number of beats set for it.
      "Auto" stops the drums when the incoming record's own drums arrive and
      pays no attention to the figure, so twenty-four beats of carry produced
      none — and nothing said so.

   (Stop not stopping the mix is covered in clipmenu-test, where there is a
   real transport with real records in it to stop.) */
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

/* a loop with a kick and a hat, so it has a top end to tell it apart by */
function loopWav(file, bpm, beats) {
  const SR = 44100, n = Math.round(SR * beats * 60 / bpm), beat = SR * 60 / bpm;
  const d = new Float64Array(n);
  for (let k = 0; k < beats; k++) {
    const at = Math.round(k * beat);
    for (let i = 0; i < SR * 0.1 && at + i < n; i++) {
      const t = i / SR;
      d[at + i] += Math.sin(2 * Math.PI * (50 + 80 * Math.exp(-t / 0.02)) * t) *
                   Math.exp(-t / 0.05) * 0.8;
    }
    const off = Math.round((k + 0.5) * beat);
    for (let i = 0; i < SR * 0.05 && off + i < n; i++) {
      d[off + i] += (Math.random() * 2 - 1) * Math.exp(-(i / SR) / 0.012) * 0.35;
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
  await new Promise(r => server.listen(8840, r));
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new', protocolTimeout: 600000,
    args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required', '--window-size=1500,1000']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1500, height: 1000 });
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  await page.goto('http://localhost:8840/mix-builder.html', { waitUntil: 'networkidle0' });

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mixkit-'));
  const f = loopWav(path.join(tmp, 'house break 124 bpm.wav'), 124, 16);

  await (await page.$('#drumImport')).uploadFile(f);
  await page.waitForFunction(() => document.querySelectorAll('#drumloops [data-loop]').length > 0,
                             { timeout: 60000 });
  const lib = await page.evaluate(async () => {
    const l = (await window.MixProject.listDrumLoops())[0];
    return { name: l.name, bpm: l.bpm, beats: l.beats, exact: l.exactTempo };
  });
  ok(Math.abs(lib.bpm - 124) < 0.5 && lib.beats === 16,
     'an imported loop is analysed correctly', lib.bpm + ' BPM, ' + lib.beats + ' beats');
  ok(lib.exact === true, 'and its tempo is exact, not a detector estimate');

  /* a project with a junction to hang drums on */
  await page.evaluate(async () => {
    const MP = window.MixProject;
    const rows = MP.parseRunningOrder(
      '#\tTrack\tArtist\tBPM\tSection\tMix\tNote\n' +
      '1\tOne\tA\t120\tW\t\t\n2\tTwo\tB\t124\tW\t\t');
    const p = MP.seedProject(rows, [], null);
    p.tracks.forEach(t => { t.durationSec = 240; t.entrySec = 0; t.exitSec = 230;
                            t.linked = true; t.downbeatSec = 0; });
    p.junctions[0] = { type: 'throw-bridge', beatBeats: 32, preBeats: 8 };
    await MP.saveProject(p);
    location.reload();
  });
  await page.waitForFunction(() => document.querySelectorAll('#timeline .clip.drums').length > 0,
                             { timeout: 60000 });
  await new Promise(r => setTimeout(r, 800));

  const menu = await page.evaluate(async () => {
    const el = document.querySelector('#timeline .clip.drums');
    const r = el.getBoundingClientRect();
    el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true,
      clientX: Math.round(r.left + 6), clientY: Math.round(r.top + 6) }));
    await new Promise(z => setTimeout(z, 350));
    const m = document.querySelector('.clipmenu');
    if (!m) return { err: 'no drum popup' };
    const kit = m.querySelector('[data-cm="kit"]');
    return { fields: [...m.querySelectorAll('[data-cm]')].map(e => e.dataset.cm),
             kitOptions: kit ? [...kit.options].map(o => o.textContent) : [] };
  });
  if (menu.err) { ok(false, menu.err); }
  else {
    ok(menu.kitOptions.length >= 3, 'the Kit list offers the loops, not just the synth kit',
       menu.kitOptions.join(' | '));
    ok(menu.kitOptions.some(o => /house break/i.test(o)), 'including the one just imported');
    ok(menu.fields.indexOf('carry') >= 0 && menu.fields.indexOf('over') >= 0,
       'and the carry into the next record is on the popup');
  }

  const carry = await page.evaluate(async () => {
    const m = document.querySelector('.clipmenu');
    const over = m.querySelector('[data-cm="over"]');
    over.value = '24';
    over.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise(z => setTimeout(z, 600));
    const j = window.__project().junctions[0];
    return { overBeats: j.overBeats, mode: j.carryMode };
  });
  ok(carry.overBeats === 24, 'the beats asked for are stored', String(carry.overBeats));
  ok(carry.mode === 'fixed',
     'and typing a number means it, rather than being ignored by auto', String(carry.mode));

  /* the fill really is longer for it — the whole point of the setting */
  const lengths = await page.evaluate(async () => {
    const DSP = window.MixDSP, sr = 48000;
    const rec = new OfflineAudioContext(1, sr * 20, sr).createBuffer(1, sr * 20, sr);
    const rd = rec.getChannelData(0);
    for (let i = 0; i < rd.length; i++) rd[i] = (Math.random() * 2 - 1) * 0.7;
    const base = { source: rec, atSec: 20, downbeatSec: 0, beats: 32, preBeats: 8,
                   fromBpm: 120, toBpm: 124, sampleRate: sr, patternId: 'four' };
    const none = await DSP.buildBeatFill(Object.assign({}, base, { overBeats: 0 }));
    const carried = await DSP.buildBeatFill(Object.assign({}, base, { overBeats: 24 }));
    return { none: +none.duration.toFixed(2), carried: +carried.duration.toFixed(2),
             want: +(24 * 60 / 124).toFixed(2) };
  });
  const grew = lengths.carried - lengths.none;
  console.log('    fill ' + lengths.none + 's without a carry, ' + lengths.carried +
              's with 24 beats — grew ' + grew.toFixed(2) + 's, asked for ' + lengths.want + 's');
  ok(Math.abs(grew - lengths.want) < 0.3,
     'and 24 beats of carry is 24 beats of drums under the next record',
     grew.toFixed(2) + 's');

  /* ---- the loop should suit the record coming in, not just its tempo ----

     Tempo alone put a one-drop under a four-to-the-floor record: the right
     speed and the wrong record entirely. A pattern that does not match now
     costs about as much as being a fifth out on tempo, so feel decides and
     tempo breaks the tie between loops that feel the same. */
  const chosen = await page.evaluate(() => {
    const MP = window.MixProject;
    const loops = [
      { id: 'a', name: 'one drop, spot on tempo', bpm: 124, patternId: 'onedrop' },
      { id: 'b', name: 'four on the floor, a bit slower', bpm: 118, patternId: 'four' },
      { id: 'c', name: 'four on the floor, miles off', bpm: 96, patternId: 'four' }
    ];
    return {
      noPattern: (MP.pickDrumLoop(loops, 124) || {}).id,
      wantFour: (MP.pickDrumLoop(loops, 124, 'four') || {}).id,
      wantDrop: (MP.pickDrumLoop(loops, 124, 'onedrop') || {}).id
    };
  });
  ok(chosen.noPattern === 'a', 'with nothing to match, the nearest tempo wins', chosen.noPattern);
  ok(chosen.wantFour === 'b',
     'a four-to-the-floor record gets a four-to-the-floor loop, not the nearest tempo',
     chosen.wantFour);
  ok(chosen.wantDrop === 'a', 'and a one-drop record gets the one-drop', chosen.wantDrop);
  ok(chosen.wantFour !== 'c',
     'but feel does not beat tempo by any distance — 96 against 124 is still too far',
     chosen.wantFour);

  ok(errs.length === 0, 'no console errors', errs.slice(0, 2).join(' | '));
  await browser.close(); server.close();
  try { fs.unlinkSync(f); fs.rmdirSync(tmp); } catch (e) {}
  console.log(fails ? '\n' + fails + ' FAILED' : '\nthe kit is pickable and the carry carries');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error('HARNESS FAILED:', e); process.exit(2); });
