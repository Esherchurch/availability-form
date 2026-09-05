/* Can a person actually REACH the transition controls by clicking, at normal
   zoom, without knowing the code?

   This does not check that markup renders. It finds things the way a person
   would — visible text, real bounding boxes — clicks them with the mouse at
   their centre point, and checks the value actually changed in the saved
   project. A control smaller than a finger, or one that renders but does
   nothing when clicked, fails here. */
const http = require('http'), fs = require('fs'), path = require('path');
const puppeteer = require('puppeteer-core');
const ROOT = path.join(__dirname, '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json' };
const server = http.createServer((q, r) => {
  if (q.url === '/favicon.ico') { r.writeHead(204); r.end(); return; }
  fs.readFile(path.join(ROOT, q.url.split('?')[0]), (e, b) => {
    if (e) { r.writeHead(404); r.end(''); return; }
    r.writeHead(200, { 'Content-Type': MIME[path.extname(q.url.split('?')[0])] || 'application/octet-stream' });
    r.end(b);
  });
});

let fails = 0;
const ok = (c, m) => { if (!c) { console.log('  FAIL ' + m); fails++; } else console.log('  ok   ' + m); };
const MIN_HIT = 24;          // a control smaller than this is not clickable in practice

(async () => {
  await new Promise(r => server.listen(8746, r));
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new', args: ['--no-sandbox', '--window-size=1440,900']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  page.on('console', m => {
    const w = (m.location() && m.location().url) || '';
    if (m.type() === 'error' && !/favicon/.test(w)) errs.push(m.text());
  });

  await page.goto('http://localhost:8746/mix-builder.html', { waitUntil: 'networkidle0' });

  // A realistic set: three tracks, so there are two junctions.
  await page.evaluate(async () => {
    const MP = window.MixProject;
    const p = MP.emptyProject('reach test');
    p.tracks = [120, 124, 128].map((bpm, i) => ({
      id: 'r' + i, title: 'Track ' + (i + 1), file: 'r' + i + '.mp3', fileSize: 100 + i,
      sourceBpm: bpm, bpmMultiplier: 1, downbeatSec: 0,
      entrySec: 0, exitSec: 200, durationSec: 210, linked: false, regions: null
    }));
    MP.rebuildJunctions(p, {});
    await MP.saveProject(p, true);
  });
  await page.reload({ waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 700));

  console.log('\n— is there anything between the tracks? —');
  const rows = await page.$$('.jrow-btn');
  ok(rows.length === 2, 'a transition row appears between each pair (' + rows.length + ' rows for 3 tracks)');

  const label = await page.evaluate(() =>
    document.querySelector('.jrow-btn') ? document.querySelector('.jrow-btn').innerText.replace(/\s+/g, ' ').trim() : '');
  ok(/blend|bridge|cut/i.test(label), 'it says what the transition is: "' + label + '"');

  const box = await rows[0].boundingBox();
  ok(box && box.height >= MIN_HIT && box.width > 200,
     'and it is a real click target: ' + Math.round(box.width) + ' x ' + Math.round(box.height) + ' px');

  console.log('\n— click it like a person would —');
  // Click the middle of the row, which is a <span>, not the button itself.
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await new Promise(r => setTimeout(r, 400));
  const opened = await page.evaluate(() => {
    const panel = document.getElementById('junction');
    const inRow = !!(panel && panel.closest('.jrow'));
    return {
      visible: !!(panel && !panel.classList.contains('hidden')),
      insideTheRow: inRow,
      heading: panel && panel.querySelector('h3') ? panel.querySelector('h3').innerText : ''
    };
  });
  ok(opened.visible, 'the editor opens');
  ok(opened.insideTheRow, 'and it opens IN the row, not somewhere else on the page');
  ok(/Track 1/.test(opened.heading), 'showing the right junction: ' + opened.heading);

  console.log('\n— every control reachable and working —');
  // Switch to a beat bridge by clicking the segmented button by its visible text.
  const clickByText = async (sel, text) => {
    const els = await page.$$(sel);
    for (const el of els) {
      const t = await page.evaluate(n => n.innerText.trim(), el);
      if (t.toLowerCase() === text.toLowerCase()) {
        const b = await el.boundingBox();
        if (!b || b.height < MIN_HIT) return { clicked: false, tooSmall: true, box: b };
        await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
        return { clicked: true, box: b };
      }
    }
    return { clicked: false, notFound: true };
  };

  const bridgeBtn = await clickByText('#junction .seg button', 'Bridge');
  await new Promise(r => setTimeout(r, 400));
  ok(bridgeBtn.clicked, 'the "Bridge" button is findable by its label and big enough' +
     (bridgeBtn.box ? ' (' + Math.round(bridgeBtn.box.width) + 'x' + Math.round(bridgeBtn.box.height) + ')' : ''));

  const typeNow = await page.evaluate(async () => (await window.MixProject.loadProject()).junctions[0].type);
  ok(typeNow === 'throw-bridge', 'clicking it actually changed the junction type (' + typeNow + ')');

  // Now the five controls the bridge is supposed to expose.
  const wanted = ['Music out', 'Reverb tail (bars)', 'Beat alone (bars)',
                  'Mids cut (dB)', 'Highs cut (dB)', 'B overlaps by (bars)'];
  const found = await page.evaluate(() => {
    const out = [];
    document.querySelectorAll('#junction .grid > div').forEach(d => {
      const l = d.querySelector('label'), f = d.querySelector('[data-jf]');
      if (l && f) {
        const r = f.getBoundingClientRect();
        out.push({ label: l.innerText.trim(), field: f.dataset.jf,
                   w: Math.round(r.width), h: Math.round(r.height) });
      }
    });
    return out;
  });
  wanted.forEach(w => {
    const hit = found.find(f => f.label.toLowerCase() === w.toLowerCase());
    ok(!!hit && hit.h >= MIN_HIT - 6 && hit.w > 40,
       '"' + w + '" is present and usable' + (hit ? ' (' + hit.w + 'x' + hit.h + ')' : ' — MISSING'));
  });

  /* Type into them and confirm it persists — a field that renders but does not
     save is the same as no field. Click, select all, retype: what a person does
     to change a number. (Triple-click does not reliably select inside a number
     input, which is a quirk of the input type, not of the page.) */
  const setField = async (name, value) => {
    const el = await page.$('#junction [data-jf="' + name + '"]');
    if (!el) return false;
    const b = await el.boundingBox();
    await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
    await page.keyboard.down('Control');
    await page.keyboard.press('KeyA');
    await page.keyboard.up('Control');
    await page.keyboard.type(String(value));
    await page.keyboard.press('Tab');
    await new Promise(r => setTimeout(r, 500));
    return true;
  };

  await setField('beatBars', 6);
  const savedBeat = await page.evaluate(async () => (await window.MixProject.loadProject()).junctions[0].beatBars);
  ok(savedBeat === 6, 'typing into "Beat alone (bars)" saves to the project (got ' + savedBeat + ')');

  await setField('midCutDb', 18);
  const savedMid = await page.evaluate(async () => (await window.MixProject.loadProject()).junctions[0].midCutDb);
  ok(savedMid === 18, 'and so does "Mids cut (dB)" (got ' + savedMid + ')');

  console.log('\n— the row reflects what you set —');
  const rowText = await page.evaluate(() =>
    document.querySelector('.jrow-btn').innerText.replace(/\s+/g, ' ').trim());
  ok(/beat bridge/i.test(rowText) && /6 bars/i.test(rowText),
     'the closed row summarises it: "' + rowText + '"');

  console.log('\n— it closes again —');
  const again = await page.$('.jrow-btn');
  const ab = await again.boundingBox();
  await page.mouse.click(ab.x + 40, ab.y + ab.height / 2);
  await new Promise(r => setTimeout(r, 400));
  const closed = await page.evaluate(() => {
    const p = document.getElementById('junction');
    return { hidden: p.classList.contains('hidden'), backHome: p.parentNode.id === 'junctionHome' };
  });
  ok(closed.hidden, 'clicking the row again closes it');
  ok(closed.backHome, 'and the panel goes back where it came from');

  console.log('\n— the zoom slider —');
  const slider = await page.$('#tlZoom');
  ok(!!slider, 'a zoom slider exists');
  const sb = await slider.boundingBox();
  ok(sb && sb.width >= 150, 'and is draggable: ' + Math.round(sb.width) + ' px wide');
  const before = await page.evaluate(() => {
    const t = document.querySelector('.tl-scroll > div');
    return t ? t.getBoundingClientRect().width : 0;
  });
  // Drag the handle to the far right.
  await page.mouse.move(sb.x + sb.width * 0.1, sb.y + sb.height / 2);
  await page.mouse.down();
  await page.mouse.move(sb.x + sb.width, sb.y + sb.height / 2, { steps: 10 });
  await page.mouse.up();
  await new Promise(r => setTimeout(r, 400));
  const after = await page.evaluate(() => {
    const t = document.querySelector('.tl-scroll > div');
    return { w: t ? t.getBoundingClientRect().width : 0,
             label: (document.getElementById('tlZoomVal') || {}).textContent };
  });
  ok(after.w > before * 2, 'dragging it widens the timeline: ' +
     Math.round(before) + ' -> ' + Math.round(after.w) + ' px');
  ok(/%$/.test(after.label || ''), 'and it reports the level: ' + after.label);

  // The marker line stays 3 px, but its hit area should not.
  const jhit = await page.evaluate(() => {
    const j = document.querySelector('.tl-junction');
    if (!j) return 0;
    const cs = getComputedStyle(j, '::before');
    return j.getBoundingClientRect().width - parseFloat(cs.left || 0) * 2;
  });
  ok(jhit >= 14, 'a timeline junction marker is clickable too: ' + jhit.toFixed(0) + ' px hit area');

  await browser.close(); server.close();
  if (errs.length) { console.log('\npage errors:'); errs.forEach(e => console.log('  ' + e)); }
  console.log(fails || errs.length ? '\n' + (fails + errs.length) + ' FAILURES'
                                   : '\neverything reachable by clicking at 100% zoom');
  process.exit(fails || errs.length ? 1 : 0);
})().catch(e => { console.error('HARNESS FAILED:', e); process.exit(2); });
