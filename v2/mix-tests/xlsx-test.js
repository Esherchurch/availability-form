/* Reading the running order straight from the .xlsx, in a real browser.
   Run against the real sheets rather than a synthesised one: the header is not
   on row 1, the Mix column carries the junction decisions, and the whole point
   is that this file works, not that a file works. */
const http = require('http'), fs = require('fs'), path = require('path');
const puppeteer = require('puppeteer-core');

const ROOT = path.join(__dirname, '..');
const SHEETS = [
  'C:/Users/marti/Downloads/disco_mix_running_order.xlsx',
  'C:/Users/marti/Downloads/disco_mix_running_order_1.xlsx',
  'C:/Users/marti/Downloads/disco_mix_running_order_2.xlsx',
  'C:/Users/marti/Downloads/disco_mix_running_order_3.xlsx'
].filter(f => fs.existsSync(f));

const MIME = { '.html': 'text/html', '.js': 'text/javascript' };
const server = http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0]);
  if (u === '/favicon.ico') { res.writeHead(204); res.end(); return; }
  if (u === '/sheets.json') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(SHEETS.map(f => path.basename(f))));
    return;
  }
  const p = u.startsWith('/sheet/')
    ? SHEETS.find(f => path.basename(f) === u.slice(7))
    : path.join(ROOT, u);
  if (!p) { res.writeHead(404); res.end(''); return; }
  fs.readFile(p, (err, buf) => {
    if (err) { res.writeHead(404); res.end(''); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' });
    res.end(buf);
  });
});

let fails = 0;
const ok = (c, m, extra) => {
  console.log((c ? '  ok   ' : '  FAIL ') + m + (extra ? '   ' + extra : ''));
  if (!c) fails++;
};

(async () => {
  if (!SHEETS.length) { console.log('  no running-order spreadsheets found — nothing to test'); process.exit(0); }
  await new Promise(r => server.listen(8761, r));
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new', args: ['--no-sandbox']
  });
  const page = await browser.newPage();
  page.on('pageerror', e => console.log('  PAGEERR', e.message));
  await page.goto('http://localhost:8761/mix-builder.html', { waitUntil: 'networkidle0' });

  const results = await page.evaluate(async () => {
    const MP = window.MixProject;
    const names = await (await fetch('/sheets.json')).json();
    const out = [];
    for (const n of names) {
      try {
        const ab = await (await fetch('/sheet/' + encodeURIComponent(n))).arrayBuffer();
        const wb = await MP.readWorkbook(ab);
        const rows = MP.parseRunningOrder(wb);
        const seeded = MP.seedProject(rows, [], null);
        out.push({
          name: n, sheets: wb.sheets, used: wb.sheetUsed,
          rawRows: wb.tracks.length, rows: rows.length,
          withBpm: rows.filter(r => r.bpm).length,
          withMix: rows.filter(r => r.mix).length,
          // older drafts of the sheet carry one "Mix note" column instead
          // of separate Mix and Note, and have no junction keywords at all
          hasMixCol: wb.tracks.some(t => Object.keys(t).some(k => /^mix$/i.test(k.trim()))),
          first: rows[0] || null,
          junctions: seeded.junctions.length,
          types: seeded.junctions.reduce((a, j) => { a[j.type] = (a[j.type] || 0) + 1; return a; }, {}),
          pinned: seeded.tracks.filter(t => t.pinned).length,
          locked: seeded.tracks.filter(t => t.bpmLocked).length
        });
      } catch (e) { out.push({ name: n, error: e.message }); }
    }
    return out;
  });

  results.forEach(r => {
    console.log('\n  ' + r.name);
    if (r.error) { ok(false, 'read it', r.error); return; }
    console.log('    sheets: ' + r.sheets.join(', '));
    console.log('    read "' + r.used + '" — ' + r.rawRows + ' data rows, ' + r.rows + ' with a title');
    if (r.first) {
      console.log('    first row: ' + JSON.stringify(r.first));
    }
    console.log('    junctions: ' + JSON.stringify(r.types) +
                ', pinned ' + r.pinned + ', tempo fixed by the sheet ' + r.locked);
    ok(r.rows >= 10, 'imports a full running order', r.rows + ' tracks');
    ok(!!(r.first && r.first.title), 'the first row has a title', r.first && r.first.title);
    if (r.hasMixCol) ok(r.withMix > 0, 'the Mix column comes through', r.withMix + ' rows carry a mix instruction');
    else console.log('    (this draft has no Mix column - nothing to check)');
    ok(r.junctions === r.rows - 1, 'a junction between every pair', r.junctions + ' junctions');
  });

  await browser.close(); server.close();
  console.log(fails ? '\n' + fails + ' FAILED' : '\nthe running order imports straight from the spreadsheet');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error('HARNESS FAILED:', e); process.exit(2); });
