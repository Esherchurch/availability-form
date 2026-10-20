/* The e-news footer's social icons (FINDINGS-comms plan B5), as PNG
 * pictures: Outlook shows pictures, not icon fonts or SVG.
 *
 *   node tools/make-social-icons.mjs        (from v2/; writes img/social/*.png)
 *
 * Val's Mailchimp footer has 48px circles in each network's colour with a
 * white mark; these are drawn the same way at 96px (sharp on a phone) and
 * shown at 48. Simple marks drawn here, not copies of anyone's artwork.
 */
import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const OUT = path.resolve('img', 'social');
fs.mkdirSync(OUT, { recursive: true });
const W = 'stroke="#fff" stroke-width="6" fill="none" stroke-linecap="round" stroke-linejoin="round"';
const TEXT = (s, size, y) => `<text x="48" y="${y}" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-weight="700" font-size="${size}" fill="#fff">${s}</text>`;
const ICONS = {
  facebook: ['#3b5998', TEXT('f', 62, 71)],
  instagram: ['#e1306c', `<rect x="27" y="27" width="42" height="42" rx="12" ${W}/><circle cx="48" cy="48" r="10" ${W}/><circle cx="60" cy="36" r="3" fill="#fff"/>`],
  youtube: ['#cd201f', `<rect x="24" y="31" width="48" height="34" rx="10" fill="#fff"/><path d="M43 39 L57 48 L43 57 Z" fill="#cd201f"/>`],
  website: ['#5bb974', `<path d="M44 52 L52 44" ${W}/><path d="M41 47 L35 53 a8 8 0 0 0 11 11 L52 58" ${W}/><path d="M55 49 L61 43 a8 8 0 0 0 -11 -11 L44 38" ${W}/>`],
  email: ['#4fb6d8', `<rect x="26" y="33" width="44" height="30" rx="4" ${W}/><path d="M28 36 L48 51 L68 36" ${W}/>`],
  x: ['#000000', `<path d="M33 31 L63 65 M63 31 L33 65" ${W}/>`],
  tiktok: ['#000000', TEXT('♪', 54, 67)],
  whatsapp: ['#25d366', `<path d="M48 26 a22 22 0 1 1 -11 41 L27 70 L30 60 a22 22 0 0 1 18 -34 Z" ${W}/>`],
  linkedin: ['#0a66c2', TEXT('in', 46, 64)]
};
/* A black circle gets a thin white ring, or it vanishes on a dark footer. */
const svg = (bg, mark) => `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96"><circle cx="48" cy="48" r="48" fill="${bg}"/>${bg === '#000000' ? '<circle cx="48" cy="48" r="45.5" fill="none" stroke="#fff" stroke-width="3"/>' : ''}${mark}</svg>`;
const page = '<!doctype html><html><body style="margin:0;background:transparent">' + Object.entries(ICONS).map(([k, [bg, m]]) => `<div id="${k}" style="width:96px;height:96px">${svg(bg, m)}</div>`).join('') + '</body></html>';
const file = path.join(os.tmpdir(), 'social-icons-' + process.pid + '.html');
fs.writeFileSync(file, page);

const PORT = 9798, prof = fs.mkdtempSync(path.join(os.tmpdir(), 'cdp-icons-'));
const chrome = spawn(process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', '--remote-debugging-port=' + PORT, '--user-data-dir=' + prof, '--no-first-run', 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const getJSON = p => new Promise((res, rej) => http.get({ host: '127.0.0.1', port: PORT, path: p }, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d))); }).on('error', rej));
let tabs; for (let i = 0; i < 40; i++) { try { tabs = await getJSON('/json/list'); break; } catch { await sleep(400); } }
const ws = new WebSocket(tabs.find(t => t.type === 'page').webSocketDebuggerUrl); await new Promise(r => ws.onopen = r);
let id = 0; const pend = new Map(); ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result || {}); pend.delete(m.id); } };
const send = (m, p = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
await send('Page.enable');
await send('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } });
await send('Emulation.setDeviceMetricsOverride', { width: 200, height: 96 * Object.keys(ICONS).length, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: 'file:///' + file.split(path.sep).join('/') }); await sleep(1500);
let i = 0;
for (const k of Object.keys(ICONS)) {
  const r = await send('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 96 * i++, width: 96, height: 96, scale: 1 } });
  fs.writeFileSync(path.join(OUT, k + '.png'), Buffer.from(r.data, 'base64'));
}
ws.close(); chrome.kill(); fs.unlinkSync(file);
console.log('wrote ' + Object.keys(ICONS).length + ' icons to img/social/');
process.exit(0);
