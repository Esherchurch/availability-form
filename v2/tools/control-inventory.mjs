/* EVERY CONTROL, FROM THE CODE (the going-live test, Stage 2; the reviewer,
 * 2 Nov 2026: "every button, link, form and tab... generate the list from the
 * code and report N of N controls, not screens").
 *
 *   node tools/control-inventory.mjs                  the list (tests/out/controls.json)
 *   node tools/control-inventory.mjs --report         joined with what the audit reached
 *                                                     (tests/out/controls-reached.json) ->
 *                                                     tests/out/controls-report.md, N of N
 *
 * For each first-stage page (the parts in tools/rules-coverage.mjs FIRST,
 * plus hub.html and app.html) it reads the page and the local scripts it
 * loads, and lists every control they can draw. One element is one control,
 * keyed by the first of:
 *   fn:name       its onclick handler            act:value   its data-act (act:verb:* when built)
 *   tab:value     its data-tab                   href:page   the page it links to
 *   id:value      its id                         field:name  a field's name
 *   text:words    a <button>'s words
 * Handlers attached in script (x.onclick = fn) count too. Scripts shared by
 * many pages (the shell, the Menu, help, care...) are read once, as "shared".
 * The audit (tests/audit-everything.mjs --every) works out every key for
 * each control it presses or fills (KEYS_JS, run in the page), so a coded
 * control is "reached" when some kind of person used it at some size. One
 * never reached is listed, with where it is in the code.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const V2 = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(V2, 'tests', 'out');
const read = (f) => fs.readFileSync(path.join(V2, f), 'utf8');

/* Scripts that draw the same chrome on every page: counted once, as "shared". */
export const SHARED = ['egbc-shell.js', 'egbc-menu.js', 'egbc-help.js', 'egbc-care.js', 'egbc-ui.js', 'egbc-appmode.js', 'egbc-guard.js',
  'egbc-auth.js', 'egbc-poweredby.js', 'egbc-church.js'];

/** The first-stage pages: the parts' own (egbc-parts.js), Communications' three, the hub and the app. */
export function firstStagePages() {
  createRequire(import.meta.url)(path.join(V2, 'egbc-parts.js'));
  const P = globalThis.EGBCParts;
  const disk = Object.fromEntries(fs.readdirSync(V2).filter((f) => f.endsWith('.html')).map((f) => [f.toLowerCase(), f]));
  const out = new Set(['hub.html', 'app.html']);
  for (const id of ['rota', 'worship', 'kids', 'safeguarding', 'churchShow', 'comms']) {
    const part = P.PARTS.find((p) => p.id === id);
    const pages = id === 'comms' ? ['comms.html', 'emailbuilder2.html', 'emailcompilerinstructions.html'] : part.pages;
    for (const p of pages) if (disk[p]) out.add(disk[p]);
  }
  return [...out];
}

/** The local scripts a page loads (not the shared ones). */
function pageScripts(page) {
  const t = read(page), out = [];
  for (const m of t.matchAll(/<script[^>]+src="([\w.-]+\.js)[^"]*"/g)) if (!SHARED.includes(m[1]) && fs.existsSync(path.join(V2, m[1]))) out.push(m[1]);
  for (const m of t.matchAll(/(?:from|import\()\s*['"]\.\/([\w.-]+\.js)['"]/g)) if (!SHARED.includes(m[1]) && m[1] !== 'egbc-db.js' && fs.existsSync(path.join(V2, m[1]))) out.push(m[1]);
  return [...new Set(out)];
}

const NOT_FN = /^(if|return|event|this|var|let|const|function|document|window|location|alert|confirm|setTimeout|try|async|await)$/;
const TAG = /<([a-zA-Z]+)\b((?:[^>"']|"[^"]*"|'[^']*')*)>/g;
const RE = {
  fn: /onclick=\\?["']\s*(?:(?:event|this)[^;"']*;\s*)*(?:window\.)?([A-Za-z_$][\w$]*)\s*\(/,
  act: /data-(?:act|lact|mact)=\\?["']([\w:.#\/-]*)(\\?["']|'\s*\+|"\s*\+)/,
  tab: /data-tab=\\?["']([\w-]*)(\\?["']|'\s*\+)/,
  href: /\shref=\\?["']([\w%&. -]+\.html)/,
  id: /\sid=\\?["']([A-Za-z][\w-]*)(\\?["']|'\s*\+|"\s*\+)/,
  name: /\sname=\\?["']([A-Za-z][\w-]*)\\?["']/
};

/** The coded controls in one file's text: [{ key, kind, at }] (at: line). */
export function controlsIn(text) {
  const out = [], seen = new Set();
  const lineOf = (i) => text.slice(0, i).split('\n').length;
  const add = (key, kind, i) => { if (!key || seen.has(key)) return; seen.add(key); out.push({ key, kind, at: lineOf(i) }); };
  for (const m of text.matchAll(TAG)) {
    const tag = m[1].toLowerCase(), at = m[2];
    const control = /^(button|a|input|select|textarea|summary)$/.test(tag) || /\s(onclick|data-act|data-lact|data-mact|data-tab)=/.test(at) || /role=\\?["'](button|tab)/.test(at);
    if (!control) continue;
    if (tag === 'input' && /type=\\?["']hidden/.test(at)) continue;
    if (tag === 'a' && !/\shref=/.test(at) && !/onclick=|data-act=/.test(at)) continue;
    const kind = /^(input|select|textarea)$/.test(tag) ? 'field' : (/data-tab=/.test(at) || /role=\\?["']tab/.test(at)) ? 'tab' : tag === 'a' ? 'link' : 'button';
    const fn = RE.fn.exec(at), act = RE.act.exec(at), tb = RE.tab.exec(at), href = RE.href.exec(at), id = RE.id.exec(at), name = RE.name.exec(at);
    let key = '';
    if (fn && !NOT_FN.test(fn[1])) key = 'fn:' + fn[1];
    else if (act) key = 'act:' + (/\+/.test(act[2]) ? act[1] + '*' : act[1]);
    else if (tb) key = 'tab:' + (/\+/.test(tb[2]) ? tb[1] + '*' : tb[1]);
    else if (href) { try { key = 'href:' + decodeURIComponent(href[1].trim()); } catch (e) { key = 'href:' + href[1].trim(); } }
    else if (id) key = 'id:' + id[1] + (/\+/.test(id[2]) ? '*' : '');
    else if (name && kind === 'field') key = 'field:' + name[1];
    else if (tag === 'button') {
      const w = (text.slice(m.index + m[0].length, m.index + m[0].length + 60).split('<')[0] || '').replace(/\s+/g, ' ').trim();
      if (w && !/\$\{|'\s*\+/.test(w)) key = 'text:' + w;
    }
    add(key, kind, m.index);
  }
  for (const m of text.matchAll(/\.onclick\s*=\s*(?:async\s*)?(?:\([^)]*\)\s*=>\s*\{?\s*|function\s*\([^)]*\)\s*\{\s*)?(?:await\s+)?(?:window\.)?([A-Za-z_$][\w$]*)\s*\(/g)) if (!NOT_FN.test(m[1])) add('fn:' + m[1], 'button', m.index);
  return out;
}

/** The whole list: { pages: { page: [controls] }, shared: [controls] }. */
export function inventory() {
  const pages = {};
  for (const p of firstStagePages()) {
    const list = [];
    for (const f of [p].concat(pageScripts(p))) for (const c of controlsIn(read(f))) if (!list.some((x) => x.key === c.key)) list.push(Object.assign({ file: f }, c));
    pages[p] = list;
  }
  const shared = [];
  for (const f of SHARED.filter((s) => fs.existsSync(path.join(V2, s)))) for (const c of controlsIn(read(f))) if (!shared.some((x) => x.key === c.key)) shared.push(Object.assign({ file: f }, c));
  return { pages, shared };
}

/* Every key a control in the page could have (run in the page by the audit). */
export const KEYS_JS = `function (el) {
  var keys = [], oc = el.getAttribute('onclick') || '';
  var m = /^\\s*(?:(?:event|this)[^;]*;\\s*)*(?:window\\.)?([A-Za-z_$][\\w$]*)\\s*\\(/.exec(oc); if (m) keys.push('fn:' + m[1]);
  if (el.__audFn) keys.push('fn:' + el.__audFn);
  var a = el.getAttribute('data-act') || el.getAttribute('data-lact') || el.getAttribute('data-mact');
  if (a) { keys.push('act:' + a); var p = a.split(':'); for (var i = p.length - 1; i > 0; i--) keys.push('act:' + p.slice(0, i).join(':') + ':*'); keys.push('act:' + p[0] + '*'); }
  var t = el.getAttribute('data-tab'); if (t) keys.push('tab:' + t);
  var h = el.tagName === 'A' ? (el.getAttribute('href') || '') : ''; var hm = /^([\\w%&. -]+\\.html)/.exec(h);
  if (hm) { try { keys.push('href:' + decodeURIComponent(hm[1].trim())); } catch (e) { keys.push('href:' + hm[1].trim()); } }
  if (el.id) keys.push('id:' + el.id);
  if (/^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName) && el.name) keys.push('field:' + el.name);
  if (el.tagName === 'BUTTON') { var w = (el.textContent || '').replace(/\\s+/g, ' ').trim(); if (w) keys.push('text:' + w); }
  return keys;
}`;

/** Joins the list with what the audit reached ([{ page, role, size, keys }]). */
export function report(inv, reached) {
  const by = {};
  for (const r of reached) for (const k of r.keys) {
    for (const p of [r.page, '(shared)']) { const key = p + '\u0000' + k; (by[key] = by[key] || new Set()).add(r.role + '@' + r.size); }
  }
  /* A key ending in * was built in script (an id with a number on it): any used key starting with it. */
  const who = (page, key) => {
    if (!key.endsWith('*')) return [...(by[page + '\u0000' + key] || [])];
    const pre = page + '\u0000' + key.slice(0, -1), out = new Set();
    for (const k of Object.keys(by)) if (k.startsWith(pre)) by[k].forEach((x) => out.add(x));
    return [...out];
  };
  const rows = [];
  for (const [page, list] of Object.entries(inv.pages)) for (const c of list) rows.push(Object.assign({ page }, c, { by: who(page, c.key) }));
  for (const c of inv.shared) rows.push(Object.assign({ page: '(shared)' }, c, { by: who('(shared)', c.key) }));
  return { total: rows.length, reached: rows.filter((r) => r.by.length).length, rows };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  fs.mkdirSync(OUT, { recursive: true });
  const inv = inventory();
  const n = Object.values(inv.pages).reduce((s, l) => s + l.length, 0) + inv.shared.length;
  fs.writeFileSync(path.join(OUT, 'controls.json'), JSON.stringify(inv, null, 1));
  console.log(Object.keys(inv.pages).length + ' pages, ' + n + ' coded controls (' + inv.shared.length + ' shared).');
  if (process.argv.includes('--report')) {
    const reached = JSON.parse(fs.readFileSync(path.join(OUT, 'controls-reached.json'), 'utf8'));
    const skippedFile = path.join(OUT, 'controls-reached-skipped.json');
    const skipped = fs.existsSync(skippedFile) ? JSON.parse(fs.readFileSync(skippedFile, 'utf8')) : [];
    const r = report(inv, reached);
    /* WHAT THE AUDIT SAW (the reviewer, 3 Nov 2026: "prove every control
       credited from a shared script that a page never draws, and list it
       separately with the reason"). Seen = pressed or filled (reached) or on
       screen and left alone with a reason (skipped). A control from a script
       several pages load, seen on another of them but never on this page by
       any kind of person at any size, is that script's, not this page's: it
       is listed apart, with where it is drawn. One seen nowhere stays in
       "Not reached". */
    const seen = {}, why = {};
    const mark = (page, keys, w) => keys.forEach((k) => { (seen[page] = seen[page] || new Set()).add(k); if (w) (why[page + '\u0000' + k] = why[page + '\u0000' + k] || new Set()).add(w); });
    reached.forEach((x) => mark(x.page, x.keys));
    skipped.forEach((x) => mark(x.page, x.keys, x.why));
    const seenOn = (page, key) => { const s = seen[page]; if (!s) return false; if (!key.endsWith('*')) return s.has(key); const pre = key.slice(0, -1); return [...s].some((k) => k.startsWith(pre)); };
    const loads = (f) => Object.keys(inv.pages).filter((p) => p === f || inv.pages[p].some((c) => c.file === f));
    const notReached = r.rows.filter((x) => !x.by.length);
    const elsewhere = [], open = [];
    for (const x of notReached) {
      const others = x.page !== '(shared)' && x.file !== x.page && /\.js$/.test(x.file) && !seenOn(x.page, x.key)
        ? loads(x.file).filter((p) => p !== x.page && seenOn(p, x.key)) : [];
      if (others.length) elsewhere.push(Object.assign({ drawnOn: others }, x)); else open.push(x);
    }
    const reason = (x) => { const w = why[x.page + '\u0000' + x.key] || (x.page === '(shared)' ? null : null); if (w && w.size) return [...w].join('; '); return seenOn(x.page, x.key) ? 'on screen, not pressed (no reason recorded)' : 'never on screen for any kind of person at either size'; };
    const total = r.total - elsewhere.length;
    const md = ['# Every control in the first-stage pages, from the code', '',
      '**' + r.reached + ' of ' + total + ' coded controls reached** (pressed, or filled, by at least one kind of person at some size). '
        + elsewhere.length + ' more are in scripts several pages load and are drawn only on another of them: listed apart below, not counted.', '',
      'Made by `node tools/control-inventory.mjs --report` from tests/out/controls-reached.json and controls-reached-skipped.json (`tests/audit-everything.mjs --every`).', '',
      '## Not reached (' + open.length + ')', '', '| Page | Control | Kind | Where in the code | Why |', '|---|---|---|---|---|'];
    for (const x of open) md.push('| ' + x.page + ' | `' + x.key.replace(/\|/g, '/') + '` | ' + x.kind + ' | ' + x.file + ':' + x.at + ' | ' + reason(x).replace(/\|/g, '/') + ' |');
    md.push('', '## In a shared script, never drawn on this page (' + elsewhere.length + ')', '',
      'Never on screen on this page for any kind of person at either size; drawn by the same script on the pages named.', '',
      '| Page | Control | Script | Drawn on |', '|---|---|---|---|');
    for (const x of elsewhere) md.push('| ' + x.page + ' | `' + x.key.replace(/\|/g, '/') + '` | ' + x.file + ':' + x.at + ' | ' + x.drawnOn.join(', ') + ' |');
    md.push('', '## Reached, by whom', '', '| Page | Control | Kinds of person @ size |', '|---|---|---|');
    for (const x of r.rows.filter((x) => x.by.length)) md.push('| ' + x.page + ' | `' + x.key.replace(/\|/g, '/') + '` | ' + x.by.sort().join(', ') + ' |');
    fs.writeFileSync(path.join(OUT, 'controls-report.md'), md.join('\n'));
    console.log(r.reached + ' of ' + total + ' coded controls reached; ' + open.length + ' not reached; ' + elsewhere.length + ' drawn only on another page. tests/out/controls-report.md');
  }
}
