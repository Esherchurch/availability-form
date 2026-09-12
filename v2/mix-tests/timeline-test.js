/* One timeline: click a thing to work on it, drag its end to shorten it, press
   play and watch the cursor move. Nothing rendered, nothing exported, no
   separate panel to go and find. */
const http = require('http'), fs = require('fs'), path = require('path');
const puppeteer = require('puppeteer-core');
const ROOT = path.join(__dirname, '..');
const MUSIC = 'C:/Users/marti/Music/Amazon Music';
const A = '13 - Despacito (Remix) [feat. Justin Bieber].mp3';
const B = '03 - Here Comes the Hotstepper (Heartical Mix).mp3';
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mp3': 'audio/mpeg' };
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
const ok = (c, m, x) => { console.log((c ? '  ok   ' : '  FAIL ') + m + (x ? '   ' + x : '')); if (!c) fails++; };

(async () => {
  if (!fs.existsSync(path.join(MUSIC, A)) || !fs.existsSync(path.join(MUSIC, B))) {
    console.log('  the two test records are not on this machine — nothing to run');
    process.exit(0);
  }
  await new Promise(r => server.listen(8797, r));
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    /* Deliberately WITHOUT --autoplay-policy=no-user-gesture-required. A real
       browser suspends an AudioContext until someone interacts with the page,
       and granting the exemption here is what let a play button that never
       resumed the context pass every test while doing nothing in the app. */
    headless: 'new', args: ['--no-sandbox',
                            '--window-size=1600,1100', '--js-flags=--max-old-space-size=4096']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 1100 });
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await page.goto('http://localhost:8797/mix-builder.html', { waitUntil: 'networkidle0' });

  const input = await page.$('#file');
  await input.uploadFile(path.join(MUSIC, A), path.join(MUSIC, B));
  await page.waitForFunction(() => document.querySelectorAll('#timeline .clip.song').length >= 2,
                             { timeout: 240000 });
  await page.waitForFunction(() => document.querySelectorAll('#timeline .clip.drums').length >= 1,
                             { timeout: 120000 }).catch(() => {});
  // fit it all on screen
  await page.evaluate(() => {
    const z = document.getElementById('tlZoom');
    z.value = '3'; z.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await new Promise(r => setTimeout(r, 800));

  const shape = await page.evaluate(() => ({
    songs: document.querySelectorAll('.clip.song').length,
    drums: document.querySelectorAll('.clip.drums').length,
    lanes: document.querySelectorAll('.tl-lane').length,
    scrolls: (() => { const s = document.getElementById('tlscroll'); return !!s && s.scrollWidth > s.clientWidth; })(),
    decks: [...document.querySelectorAll('.clip.song')].map(c => c.closest('.tl-lane').dataset.lane)
  }));
  console.log('    ' + shape.songs + ' songs on decks [' + shape.decks.join(', ') + '], ' +
              shape.drums + ' drum clip(s), ' + shape.lanes + ' lanes');
  ok(shape.songs === 2 && shape.drums >= 1, 'one timeline carries songs and the drums between them');
  ok(shape.decks[0] !== shape.decks[1],
     'consecutive songs sit on different decks, so the overlap is visible',
     shape.decks.join(' / '));

  /* ---- clicking a clip opens that thing underneath ---- */
  await page.evaluate(() => document.querySelector('.clip.drums').click());
  await new Promise(r => setTimeout(r, 600));
  const drumsOpen = await page.evaluate(() => {
    const host = document.getElementById('tlEditor');
    const jx = document.getElementById('junction');
    return { inHost: !!(host && jx && host.contains(jx)),
             visible: !!(jx && !jx.classList.contains('hidden')),
             text: jx ? jx.textContent.slice(0, 60) : '' };
  });
  console.log('    clicked the drums: ' + drumsOpen.text.replace(/\s+/g, ' ').trim());
  ok(drumsOpen.inHost && drumsOpen.visible,
     'clicking the drums opens that junction under the timeline');

  await page.evaluate(() => document.querySelector('.clip.song').click());
  await new Promise(r => setTimeout(r, 600));
  const songOpen = await page.evaluate(() => {
    const host = document.getElementById('tlEditor');
    /* Only the body moves under the timeline now; the head stays in the
       list so the track can still be reordered from there. */
    return { row: !!(host && host.querySelector('.trk-body')),
             wave: !!(host && host.querySelector('canvas.wave')) };
  });
  ok(songOpen.row, 'clicking a song opens that song under the timeline');
  ok(songOpen.wave, 'with its waveform');

  /* ---- dragging the end of a clip shortens the record ---- */
  const before = await page.evaluate(async () =>
    (await window.MixProject.loadProject()).tracks[0].exitSec);
  const box = await page.evaluate(() => {
    const c = document.querySelector('.clip.song');
    const r = c.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  });
  await page.mouse.move(box.x + box.w - 2, box.y + box.h / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.w - 90, box.y + box.h / 2, { steps: 14 });
  await page.mouse.up();
  await new Promise(r => setTimeout(r, 700));
  const after = await page.evaluate(async () =>
    (await window.MixProject.loadProject()).tracks[0].exitSec);
  console.log('    dragged the end in 90 px: mix-out ' + before.toFixed(1) + 's → ' + after.toFixed(1) + 's');
  ok(after < before - 5, 'dragging the end of a clip shortens the record',
     before.toFixed(1) + 's → ' + after.toFixed(1) + 's');

  const undone = await page.evaluate(async () => {
    document.getElementById('undoBtn').click();
    await new Promise(r => setTimeout(r, 500));
    return (await window.MixProject.loadProject()).tracks[0].exitSec;
  });
  ok(Math.abs(undone - before) < 0.5, 'and undo puts it back', undone.toFixed(1) + 's');

  /* ---- play, with the cursor moving along the timeline ---- */
  await page.evaluate(() => {
    window.__live = 0;
    const proto = (window.AudioContext || window.webkitAudioContext).prototype;
    const orig = proto.createBufferSource;
    proto.createBufferSource = function () {
      const n = orig.call(this); const s = n.start.bind(n), st = n.stop.bind(n);
      let c = false;
      n.start = function (...a) { window.__live++; c = true; return s(...a); };
      n.stop = function (...a) { if (c) { window.__live--; c = false; } return st(...a); };
      n.addEventListener('ended', () => { if (c) { window.__live--; c = false; } });
      return n;
    };
  });
  const ruler = await page.evaluate(() => {
    const r = document.getElementById('tlRuler').getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  });
  await page.mouse.click(ruler.x + Math.min(ruler.w * 0.4, 500), ruler.y + ruler.h / 2);
  await new Promise(r => setTimeout(r, 500));
  const cursorAt = await page.evaluate(() => ({
    pos: (document.getElementById('mixPos') || {}).textContent,
    ph: (document.getElementById('tlPlayhead') || {}).style.left
  }));
  console.log('    clicked the ruler: ' + cursorAt.pos + ', playhead at ' + cursorAt.ph);
  ok(!/^0:00/.test(cursorAt.pos), 'clicking the ruler moves the cursor', cursorAt.pos);
  ok(parseInt(cursorAt.ph, 10) > 10, 'and the playhead is drawn there', cursorAt.ph);

  await page.click('#previewBtn');
  await page.waitForFunction(() => window.__live > 0, { timeout: 60000 }).catch(() => {});
  await new Promise(r => setTimeout(r, 2200));
  const playing = await page.evaluate(() => ({
    live: window.__live,
    pos: (document.getElementById('mixPos') || {}).textContent,
    ph: (document.getElementById('tlPlayhead') || {}).style.left
  }));
  ok(playing.live > 0, 'it plays from the cursor with nothing rendered', playing.live + ' sources');
  ok(playing.ph !== cursorAt.ph, 'and the playhead moves along the timeline',
     cursorAt.ph + ' → ' + playing.ph);
  /* The context must actually be RUNNING after pressing play, not merely have
     had things scheduled onto it. A suspended context accepts every call and
     makes no sound. */
  const ctxState = await page.evaluate(() =>
    window.__mixCtxForTest ? window.__mixCtxForTest.state : "unknown");
  ok(ctxState === "running", "the audio context is running, not suspended", ctxState);

  await page.click('#previewStopBtn');


  /* ---- dragging clips along the timeline.

     A song has no position of its own: where it starts comes from the junction
     before it, so dragging a song edits that junction. The drums move by how
     far ahead of the join they start. A sample moves freely — a stab is placed
     by ear, and a quarter of a beat late is often where it wants to be. */
  const dragBy = async (sel, px) => {
    const b = await page.evaluate((s) => {
      const c = document.querySelector(s);
      if (!c) return null;
      const r = c.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height };
    }, sel);
    if (!b) return false;
    await page.mouse.move(b.x + b.w / 2, b.y + b.h / 2);
    await page.mouse.down();
    await page.mouse.move(b.x + b.w / 2 + px, b.y + b.h / 2, { steps: 14 });
    await page.mouse.up();
    await new Promise(r => setTimeout(r, 700));
    return true;
  };

  const j0before = await page.evaluate(async () => {
    const p = await window.MixProject.loadProject();
    return JSON.parse(JSON.stringify(p.junctions[0]));
  });
  await dragBy('.clip.song[data-index="1"]', 120);
  const j0after = await page.evaluate(async () =>
    (await window.MixProject.loadProject()).junctions[0]);
  const beatsBefore = j0before.beatBeats != null ? j0before.beatBeats : (j0before.bars || 0);
  const beatsAfter = j0after.beatBeats != null ? j0after.beatBeats : (j0after.bars || 0);
  console.log('    dragged the second song 120 px later: ' + beatsBefore + ' → ' + beatsAfter);
  ok(beatsAfter !== beatsBefore,
     'dragging a song changes the junction that decides where it starts',
     beatsBefore + ' → ' + beatsAfter);

  const preBefore = await page.evaluate(async () => {
    const p = await window.MixProject.loadProject();
    return p.junctions[0].preBeats == null ? 8 : p.junctions[0].preBeats;
  });
  await dragBy('.clip.drums', -60);
  const preAfter = await page.evaluate(async () => {
    const p = await window.MixProject.loadProject();
    return p.junctions[0].preBeats == null ? 8 : p.junctions[0].preBeats;
  });
  console.log('    dragged the drums 60 px earlier: preBeats ' + preBefore + ' → ' + preAfter);
  ok(preAfter > preBefore, 'dragging the drums changes how early they start',
     preBefore + ' → ' + preAfter);
  ok(Number.isInteger(preAfter), 'and it lands on a whole beat', String(preAfter));

  /* a sample, placed then moved */
  await page.evaluate(async () => {
    const MP = window.MixProject;
    const p = await MP.loadProject();
    await MP.saveSample({ id: 'smp_drag', name: 'Drag me', bars: 2,
                          sourceBpm: p.tracks[0].sourceBpm, durationSec: 5 }, null);
    MP.addPlacement(p, { sampleId: 'smp_drag', atJunction: 0, mode: 'over',
                         barsBeforeEntry: 8, gainDb: -6 });
    await MP.saveProject(p);
  });
  await page.reload({ waitUntil: 'networkidle0' });
  await page.waitForFunction(() => document.querySelectorAll('#timeline .clip.sample').length >= 1,
                             { timeout: 60000 });
  /* Reloading drops the decoded audio — that is the re-link step working as
     designed. Put it back, or everything after this is measuring a project
     with no sound in it. */
  const input3 = await page.$('#file');
  await input3.uploadFile(path.join(MUSIC, A), path.join(MUSIC, B));
  await page.waitForFunction(() => {
    const all = document.querySelectorAll('#timeline .clip.song');
    const miss = document.querySelectorAll('#timeline .clip.song.unlinked');
    return all.length >= 2 && miss.length === 0;
  }, { timeout: 240000 });
  await page.evaluate(() => {
    const z = document.getElementById('tlZoom');
    z.value = '3'; z.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await new Promise(r => setTimeout(r, 600));

  const sBefore = await page.evaluate(async () =>
    (await window.MixProject.loadProject()).placements[0].barsBeforeEntry);
  await dragBy('.clip.sample', 40);
  const sAfter = await page.evaluate(async () =>
    (await window.MixProject.loadProject()).placements[0].barsBeforeEntry);
  console.log('    dragged the sample 40 px later: ' + sBefore + ' → ' + sAfter + ' bars');
  ok(sAfter !== sBefore, 'a sample can be dragged too', sBefore + ' → ' + sAfter);
  ok(Math.abs(sAfter - Math.round(sAfter)) > 0.001,
     'and it lands where it was put, not snapped to a bar', String(sAfter));


  /* ---- levelling the tracks, and hearing a sample on the timeline ---- */
  const gainsBefore = await page.evaluate(async () => {
    const p = await window.MixProject.loadProject();
    return p.tracks.map(t => t.gainDb == null ? null : t.gainDb);
  });
  const state = await page.evaluate(() => ({
    btn: !!document.getElementById("normaliseBtn"),
    songs: document.querySelectorAll("#timeline .clip.song").length,
    unlinked: document.querySelectorAll("#timeline .clip.song.unlinked").length,
    waves: [...document.querySelectorAll("#timeline .clip.song canvas")].length
  }));
  console.log("    before levelling: " + JSON.stringify(state));
  await page.evaluate(() => document.getElementById("normaliseBtn").click());
  await new Promise(r => setTimeout(r, 1500));
  const levelled = await page.evaluate(async () => {
    const p = await window.MixProject.loadProject();
    return { gains: p.tracks.map(t => t.gainDb), meas: p.tracks.map(t => t.measuredDb),
             status: (document.getElementById("status") || {}).textContent || "" };
  });
  console.log("    " + levelled.status);
  console.log("    measured " + JSON.stringify(levelled.meas) + " -> gains " + JSON.stringify(levelled.gains));
  ok(levelled.gains.every(g => typeof g === "number"), "every track gets a level", JSON.stringify(levelled.gains));
  ok(levelled.meas.every(m => m < 0), "measured from the audio, not guessed", JSON.stringify(levelled.meas));
  ok(levelled.gains.some((g, i) => g !== gainsBefore[i]), "and it changed something");

  /* a number field must not change when the page is scrolled over it */
  const wheelSafe = await page.evaluate(async () => {
    const el = document.querySelector("input[type=number]");
    if (!el) return "no number field";
    el.focus();
    const was = el.value;
    el.dispatchEvent(new WheelEvent("wheel", { deltaY: -120, bubbles: true }));
    await new Promise(r => setTimeout(r, 100));
    return el.value === was ? "unchanged" : (was + " -> " + el.value);
  });
  ok(wheelSafe === "unchanged" || wheelSafe === "no number field",
     "scrolling over a number field does not change it", wheelSafe);
  ok(errs.length === 0, 'no console errors', errs.slice(0, 2).join(' | '));
  await browser.close(); server.close();
  console.log(fails ? '\n' + fails + ' FAILED' : '\none timeline: click it, drag it, play it');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error('HARNESS FAILED:', e); process.exit(2); });
