/* Pictures of the comms mock-ups on a 375px phone (device emulation, not a
 * narrow window: headless Chrome won't lay out below ~500px).
 *
 *   node design-mocks/comms/shoot.mjs [name ...]     (from v2/)
 *
 * Not a check. Writes <name>.png beside each <name>-375.html. Chrome gets a
 * throwaway profile in the temp folder, never the real one. A page can ask
 * for a taller picture with data-h="1400" on <body>; otherwise 812.
 */
import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9781;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const names = process.argv.slice(2).length ? process.argv.slice(2)
  : fs.readdirSync(DIR).filter(f => /-375\.html$/.test(f)).map(f => f.replace(/\.html$/, ''));

(async () => {
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'cdp-comms-'));
  const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + PORT, '--user-data-dir=' + prof,
    '--no-first-run', '--hide-scrollbars', 'about:blank'], { stdio: 'ignore' });
  const getJSON = p => new Promise((res, rej) => http.get({ host: '127.0.0.1', port: PORT, path: p }, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d))); }).on('error', rej));
  let list; for (let i = 0; i < 40; i++) { try { list = await getJSON('/json/list'); break; } catch { await sleep(500); } }
  const ws = new WebSocket(list.find(x => x.type === 'page').webSocketDebuggerUrl);
  let id = 0; const pend = new Map();
  const send = (m, p = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
  await new Promise(r => ws.onopen = r);
  ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result || {}); pend.delete(m.id); } };
  await send('Page.enable'); await send('Runtime.enable');
  for (const n of names) {
    const html = fs.readFileSync(path.join(DIR, n + '.html'), 'utf8');
    const h = Number((/data-h="(\d+)"/.exec(html) || [])[1]) || 812;
    await send('Emulation.setDeviceMetricsOverride', { width: 375, height: h, deviceScaleFactor: 2, mobile: true });
    await send('Page.navigate', { url: pathToFileURL(path.join(DIR, n + '.html')).href }); await sleep(1500);
    const w = (await send('Runtime.evaluate', { expression: 'document.documentElement.scrollWidth', returnByValue: true })).result.value;
    const r = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(DIR, n + '.png'), Buffer.from(r.data, 'base64'));
    console.log(n + '.png' + (w > 375 ? '  SIDEWAYS SCROLL: ' + w + 'px' : '  fits 375'));
  }
  ws.close(); chrome.kill(); process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
