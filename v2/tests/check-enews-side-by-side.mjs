/* Val's e-news beside ours, measured (FINDINGS-comms plan D9; Martin, 20 Oct:
 * "it must look exactly like the Mailchimp version on phone and computer").
 *
 *   node tests/check-enews-side-by-side.mjs                 (from v2/; no emulator)
 *   node tests/check-enews-side-by-side.mjs --val=<her saved page.html> [--out=<folder>]
 *
 * Draws an e-news shaped like Val's 15 Oct 2026 issue with egbc-mailblocks.js
 * and measures it in a browser at 375 and 600 by computed style - card
 * picture position, width and corners; how far in the card words sit; sizes,
 * line heights and paragraph spacing; the teal first bold line; the Sunday,
 * verse, top-bar and footer words; the "Dates for the diary" button; the
 * social icons' size and spacing - against HER numbers, kept here as numbers
 * only (tests/fixtures/val-15oct26-measure.json). Her page and any picture
 * of it are never in the repo (Martin, 20 Oct).
 *
 * With --val: measures her saved page now and records those numbers again,
 * then draws her own words and pictures through our code and saves both at
 * 375 and 600, side by side, into --out (default: OneDrive\Documents\New
 * hub\mocks\val-side-by-side, on Martin's PC).
 *
 * DELIBERATE BREAKS (each must turn this check red): --break=lineheight
 * (cards back to 150%), --break=inset (card words to the edge on a phone),
 * --break=icons (the social icons 32px).
 */
import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';

const V2 = path.resolve('.');
const FIX = path.join(V2, 'tests', 'fixtures', 'val-15oct26-measure.json');
const arg = n => (process.argv.find(a => a.startsWith('--' + n + '=')) || '').slice(n.length + 3);
const VAL = arg('val'), OUT = arg('out') || path.join(os.homedir(), 'OneDrive', 'Documents', 'New hub', 'mocks', 'val-side-by-side');
const BREAK = arg('break');
const BREAKS = {
  lineheight: ["replace('font-size:15px;line-height:150%', 'font-size:14px;line-height:125%')", "replace('font-size:15px', 'font-size:14px')"],
  inset: ['.ctext{display:block !important;width:100% !important;padding:9px 18px 0 18px !important;', '.ctext{display:block !important;width:100% !important;padding:9px 0 0 0 !important;'],
  icons: ['style="display:block;width:48px;height:48px;border:0;"', 'style="display:block;width:32px;height:32px;border:0;"']
};
if (BREAK && !BREAKS[BREAK]) { console.log('Unknown break: ' + BREAK); process.exit(2); }
let SRC = fs.readFileSync(path.join(V2, 'egbc-mailblocks.js'), 'utf8').replace(/\r\n/g, '\n');
if (BREAK) { const [a, b] = BREAKS[BREAK]; if (!SRC.includes(a)) { console.log('  FAIL  break "' + BREAK + '": that line is not in egbc-mailblocks.js any more'); process.exit(1); } SRC = SRC.split(a).join(b); }
const MB = (() => { const m = { exports: {} }; vm.runInNewContext(SRC, { module: m, exports: m.exports, Intl, Date }); return m.exports; })();
const R = [];
const ok = (n, v, x) => { R.push(!!v); console.log('  ' + (v ? 'PASS  ' : 'FAIL  ') + n + (v || x === undefined ? '' : '\n          ' + String(typeof x === 'string' ? x : JSON.stringify(x)).slice(0, 300))); };
const SERVE = 9006, PORT = 9799;

/* ---- the measures: the same for her page and ours ------------------------ */
const MEASURE = `(function(V){
  function q(s){return document.querySelector(s)}
  function r(e){var x=e.getBoundingClientRect();return x}
  function deepest(start){var best=null;document.querySelectorAll('body *').forEach(function(e){if(e.children.length===0||[].every.call(e.children,function(c){return c.tagName==='BR'||c.tagName==='SPAN'||c.tagName==='STRONG'})){if((e.textContent||'').trim().indexOf(start)===0&&!best)best=e}});return best}
  var W=document.documentElement.clientWidth;
  var img=V?document.querySelectorAll('.mcnCaptionBlock')[1].querySelector('img'):q('.cimg img');
  var tx=V?document.querySelectorAll('.mcnCaptionBlock')[1].querySelector('.mcnTextContent'):q('.ctext');
  var p=tx.querySelectorAll('p')[0]||tx, strong=tx.querySelector('strong');
  var ts=getComputedStyle(tx), ps=getComputedStyle(p), ir=r(img), tr=r(tx);
  var sun=deepest('10.00am')||deepest('10am'); var sunBlock=sun; while(sunBlock&&!/mcnTextContent|(^| )t( |$)/.test(sunBlock.className||''))sunBlock=sunBlock.parentElement;
  /* The element that holds the verse's words themselves. */
  var tw=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT),n,verse=null;while((n=tw.nextNode())){if(/^\\s*Whatever you do/.test(n.nodeValue)){verse=n.parentElement;break}}
  var pre=V?deepest('What'):q('.pre');
  /* The gap from the week's picture to the verse's first line. */
  var hero=V?q('.mcnImageBlock img'):q('img.fluid[width="600"]');
  var verseGap=hero&&verse?Math.round(r(verse).top-r(hero).bottom):null;
  var diary=[].filter.call(document.querySelectorAll('a'),function(a){return /Dates for the diary/.test(a.textContent)})[0];
  var icons=V?[].slice.call(document.querySelectorAll('.mcnFollowBlock img')):[].slice.call(document.querySelectorAll('img[src*="/img/social/"]'));
  var foot=deepest('Copyright');
  function cs(e,k){return e?getComputedStyle(e)[k]:null}
  function bgOf(e){while(e&&e!==document.body){var b=getComputedStyle(e).backgroundColor;if(b&&b!=='rgba(0, 0, 0, 0)'&&b!=='transparent')return b;e=e.parentElement}return null}
  return { W:W,
    cardImgX:Math.round(ir.x), cardImgW:Math.round(ir.width), cardImgRadius:cs(img,'borderRadius'),
    cardTextLeft:Math.round(tr.x+parseFloat(ts.paddingLeft)), cardTextRight:Math.round(W-(tr.right-parseFloat(ts.paddingRight))),
    cardSize:ps.fontSize, cardLh:ps.lineHeight, cardPTop:ps.marginTop, cardPBottom:ps.marginBottom,
    titleColour:cs(strong,'color'), titleWeight:cs(strong,'fontWeight'),
    sundaySize:cs(sunBlock||sun,'fontSize'), sundayLh:cs(sunBlock||sun,'lineHeight'),
    verseGap:verseGap, verseSize:cs(verse,'fontSize'), verseWeight:cs(verse,'fontWeight'), verseAlign:verse?getComputedStyle(verse.closest('div,td,h3')||verse).textAlign:null,
    preSize:cs(pre,'fontSize'), footSize:cs(foot&&foot.closest('td'),'fontSize'),
    diary:!!diary, diaryBg:diary?bgOf(diary):null, diaryText:cs(diary,'color'),
    iconCount:icons.length, iconW:icons[0]?Math.round(r(icons[0]).width):null, iconGap:icons[1]?Math.round(r(icons[1]).x-r(icons[0]).right):null,
    iconsCentred:icons.length?Math.abs(Math.round(r(icons[0]).x)-Math.round(W-r(icons[icons.length-1]).right))<=2:null
  };})`;

/* ---- an e-news shaped like hers (made-up words; the picture is ours) ---- */
const PIC = 'http://localhost:' + SERVE + '/design-mocks/comms/card-photo.svg';
const shaped = {
  template: 'classic', preheader: 'What\u2019s happening this week at EGBC',
  blocks: [
    { type: 'header', imageUrl: PIC, alt: 'A picture' },
    { type: 'verse', text: 'Whatever you do, work at it with all your heart, as working for the Lord, not for men.', ref: 'Colossians 3:23', version: 'NIV' },
    { type: 'section', label: 'Coming up this week' },
    { type: 'sunday', date: 'Sunday 18 October', time: '10am', title: 'Sunday Service', text: 'This Sunday we continue our series. If you can\u2019t come to church you can watch online.' },
    { type: 'event', imageUrl: PIC, alt: 'One', html: '<p><strong>Synthetic film club</strong><br>Popcorn and a film for families. Book your free places on the website.</p><p>All welcome.</p>' },
    { type: 'event', imageUrl: PIC, alt: 'Two', html: '<p><strong>Synthetic men\u2019s day out</strong><br>A day out together, then an evening meal.</p>' }
  ]
};
const church = { name: 'Synthetic Green Church', email: 'office@example.invalid', address: '1 Test Lane, Testtown', charityNo: '0000001', phone: '01234 567890', hours: 'The office is open 9 till 1.',
  diaryUrl: 'https://example.invalid/whatson.html', social: ['facebook', 'instagram', 'website', 'email', 'youtube'].map(k => ({ kind: k, url: k === 'email' ? 'office@example.invalid' : 'https://example.invalid/' + k })) };
const ours = MB.render(shaped, { version: 'everyone', church, unsubscribeUrl: 'https://example.invalid/u', webUrl: 'https://example.invalid/w', assetBase: 'http://localhost:' + SERVE });

/* What has to agree, and how closely. Pixels: within 1. */
const KEYS = ['verseGap', 'verseSize', 'verseWeight', 'verseAlign', 'cardImgX', 'cardImgW', 'cardImgRadius', 'cardTextLeft', 'cardTextRight', 'cardSize', 'cardLh', 'cardPTop', 'cardPBottom', 'titleColour', 'titleWeight',
  'sundaySize', 'sundayLh', 'preSize', 'footSize', 'diary', 'diaryBg', 'diaryText', 'iconW', 'iconGap', 'iconsCentred'];
/* A measure both pages failed to find is not agreement. */
const same = (a, b) => (a === null || a === undefined || b === null || b === undefined) ? false : (typeof a === 'number' && typeof b === 'number') ? Math.abs(a - b) <= 1 : a === b;

(async () => {
  const pages = { '/ours.html': ours };
  const server = http.createServer((q, s) => {
    const url = decodeURIComponent(q.url.split('?')[0]);
    if (pages[url]) { s.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return s.end(pages[url]); }
    const f = path.join(V2, url.replace(/^\//, ''));
    if (!f.startsWith(V2) || !fs.existsSync(f)) { s.writeHead(404); return s.end(); }
    s.writeHead(200, { 'Content-Type': f.endsWith('.svg') ? 'image/svg+xml' : f.endsWith('.png') ? 'image/png' : 'application/octet-stream' }); s.end(fs.readFileSync(f));
  }).listen(SERVE);
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'cdp-enews-sbs-'));
  const chrome = spawn(process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', '--remote-debugging-port=' + PORT, '--user-data-dir=' + prof, '--no-first-run', '--hide-scrollbars', 'about:blank'], { stdio: 'ignore' });
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const getJSON = p => new Promise((res, rej) => http.get({ host: '127.0.0.1', port: PORT, path: p }, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d))); }).on('error', rej));
  let tabs; for (let i = 0; i < 40; i++) { try { tabs = await getJSON('/json/list'); break; } catch { await sleep(400); } }
  const ws = new WebSocket(tabs.find(t => t.type === 'page').webSocketDebuggerUrl); await new Promise(r => ws.onopen = r);
  let id = 0; const pend = new Map(); ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result || {}); pend.delete(m.id); } };
  const send = (m, p = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
  const ev = async x => (await send('Runtime.evaluate', { expression: x, returnByValue: true })).result.value;
  await send('Page.enable');
  const at = async (url, W, v) => {
    await send('Emulation.setDeviceMetricsOverride', { width: W, height: 900, deviceScaleFactor: 1, mobile: W < 500 });
    await send('Page.navigate', { url }); await sleep(2500);
    return ev(MEASURE + '(' + (v ? 'true' : 'false') + ')');
  };
  const shoot = async (url, W) => {
    await send('Emulation.setDeviceMetricsOverride', { width: W, height: 900, deviceScaleFactor: 1, mobile: W < 500 });
    await send('Page.navigate', { url }); await sleep(3000);
    const h = await ev('document.documentElement.scrollHeight');
    await send('Emulation.setDeviceMetricsOverride', { width: W, height: Math.min(h, 12000), deviceScaleFactor: 1, mobile: W < 500 }); await sleep(800);
    return Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64');
  };
  try {
    /* With her saved page: record her numbers again, and save the pictures. */
    if (VAL) {
      const valUrl = 'file:///' + path.resolve(VAL).split(path.sep).join('/');
      const rec = { recorded: new Date().toISOString().slice(0, 10), from: 'Val\u2019s 15 Oct 2026 e-news (her saved page; numbers only)' };
      for (const W of [375, 600]) rec[W] = await at(valUrl, W, true);
      fs.mkdirSync(path.dirname(FIX), { recursive: true });
      fs.writeFileSync(FIX, JSON.stringify(rec, null, 1) + '\n');
      console.log('  recorded her numbers in tests/fixtures/val-15oct26-measure.json');
      /* Her own words and pictures through our code, for the pictures. */
      await send('Emulation.setDeviceMetricsOverride', { width: 600, height: 900, deviceScaleFactor: 1, mobile: false });
      await send('Page.navigate', { url: valUrl }); await sleep(2500);
      const vb = await ev(`[].map.call(document.querySelectorAll('.mcnCaptionBlock'),function(b){var i=b.querySelector('img'),t=b.querySelector('.mcnTextContent');return {img:i&&i.getAttribute('src'),html:t?t.innerHTML:''}})`);
      /* Her top too: the week's picture, the verse and Sunday, her words. */
      const top = await ev(`(function(){var hero=document.querySelector('.mcnImageBlock img');var tb=[].slice.call(document.querySelectorAll('.mcnTextBlock .mcnTextContent'));var v=tb.filter(function(e){return /Whatever you do/.test(e.textContent)})[0];var sun=tb.filter(function(e){return /Sunday/.test(e.textContent)&&!/Whatever/.test(e.textContent)})[0];var vt=v?v.textContent.replace(/\\s+/g,' ').trim():'';var m=/^(.*)\\(([^)]*)\\)\\s*$/.exec(vt);return {hero:hero&&hero.getAttribute('src'),verse:m?m[1].trim():vt,ref:m?m[2].trim():'',sunday:sun?sun.innerHTML:''}})()`);
      const her = Object.assign({}, shaped, { blocks: [{ type: 'header', imageUrl: top.hero, alt: '' }, { type: 'verse', text: top.verse, ref: top.ref }, shaped.blocks[2], { type: 'text', html: top.sunday }, { type: 'divider' }].concat(vb.map(c => ({ type: 'event', imageUrl: c.img, html: c.html }))) });
      pages['/hers-through-ours.html'] = MB.render(her, { version: 'everyone', church, unsubscribeUrl: 'https://example.invalid/u', webUrl: 'https://example.invalid/w', assetBase: 'http://localhost:' + SERVE });
      fs.mkdirSync(OUT, { recursive: true });
      for (const W of [375, 600]) {
        fs.writeFileSync(path.join(OUT, 'val-' + W + '.png'), await shoot(valUrl, W));
        fs.writeFileSync(path.join(OUT, 'ours-' + W + '.png'), await shoot('http://localhost:' + SERVE + '/hers-through-ours.html', W));
      }
      console.log('  pictures saved in ' + OUT);
    }
    if (!fs.existsSync(FIX)) { ok('Val\u2019s numbers are recorded (run once with --val=<her saved page>)', false); throw new Error('no fixture'); }
    const VALN = JSON.parse(fs.readFileSync(FIX, 'utf8'));
    for (const W of [375, 600]) {
      const o = await at('http://localhost:' + SERVE + '/ours.html', W, false), v = VALN[W];
      const off = KEYS.filter(k => !same(o[k], v[k])).map(k => k + ': ours ' + o[k] + ', Val\u2019s ' + v[k]);
      ok(W + ' wide: the same as Val\u2019s (' + KEYS.length + ' measures)', off.length === 0, off);
      if (W === 375) ok('375: nothing wider than the phone', await ev('document.documentElement.scrollWidth') <= 375);
      ok(W + ' wide: five social icons, as hers', o.iconCount === 5 && v.iconCount === 5, [o.iconCount, v.iconCount]);
    }
  } catch (e) { if (e.message !== 'no fixture') ok('the run finished', false, e.message); }
  ws.close(); chrome.kill(); server.close();
  const fails = R.filter(v => !v).length;
  console.log('\n' + (R.length - fails) + '/' + R.length + ' passed' + (BREAK ? '   (deliberate break: ' + BREAK + ', so this run SHOULD be red)' : ''));
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
