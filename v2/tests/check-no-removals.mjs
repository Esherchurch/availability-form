/* NOTHING REMOVED, RENAMED OR SENT SOMEWHERE NEW WITHOUT MARTIN'S OK
 * (CLAUDE.md section 0; the reviewer for Martin, 6 Nov 2026: "build the guard").
 *
 *   node tests/check-no-removals.mjs                       (from v2/) compare with the baseline
 *   node tests/check-no-removals.mjs --write-baseline [--pending=a.html,b.html]
 *                                                          save today's pages as the baseline
 *
 * THE BASELINE (tests/baseline-controls.json) is every v2 page and, on each, every
 * button, link, tab and field the page and the scripts it loads can draw: what it
 * is called and where it goes. Scripts many pages share (the shell, the Menu,
 * Help...) are read once, as "shared".
 *
 * IT FAILS when, against the baseline:
 *   - a page is gone;
 *   - a control is gone (or fewer of it are drawn);
 *   - a control's words changed (renamed);
 *   - a link or a button that opens a page goes to a different page;
 * unless that change is approved: its line below, in backticks, in
 * v2/APPROVED-CHANGES.md (only the reviewing window adds to it, from Martin's
 * own words). Every failure prints the exact line to approve.
 * New pages and new controls are not failures (adding is not removing).
 *
 * A control's identity: its id; else its handler, data-act or data-tab with its
 * words; else a link's words; else a button's words. Words built in script
 * (${...}, ' + x + ') count as no words. Pages pending Martin's decision are
 * left out of the baseline (--pending) until he decides, and listed in it.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const V2 = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASELINE = path.join(V2, 'tests', 'baseline-controls.json');
const APPROVED = path.join(V2, 'APPROVED-CHANGES.md');

/* --commit=<sha> (the pre-push hook): the pages as that commit has them, read from
   git, not the files on disk - a clone with other work in progress is judged on what
   is being pushed. Everything else reads the files. */
const COMMIT = ((process.argv.find((x) => x.startsWith('--commit=')) || '').slice(9)) || '';
let TREE = null;
function gitFiles() {
  if (TREE) return TREE;
  const out = execFileSync('git', ['ls-tree', '-r', '--name-only', COMMIT, '--', 'v2/'], { cwd: V2, encoding: 'utf8', maxBuffer: 64 << 20 });
  TREE = new Set(out.split('\n').filter(Boolean).map((f) => f.replace(/^v2\//, '')));
  return TREE;
}
const exists = (f) => (COMMIT ? gitFiles().has(f) : fs.existsSync(path.join(V2, f)));
const read = (f) => (COMMIT ? execFileSync('git', ['show', COMMIT + ':v2/' + f], { cwd: V2, encoding: 'utf8', maxBuffer: 64 << 20 }) : fs.readFileSync(path.join(V2, f), 'utf8'));
const topPages = () => (COMMIT ? [...gitFiles()].filter((f) => !f.includes('/') && f.endsWith('.html')) : fs.readdirSync(V2).filter((x) => x.endsWith('.html'))).sort();

/* Scripts that draw the same chrome on every page, counted once (as tools/control-inventory.mjs). */
const SHARED = ['egbc-shell.js', 'egbc-menu.js', 'egbc-help.js', 'egbc-care.js', 'egbc-ui.js', 'egbc-appmode.js', 'egbc-guard.js',
  'egbc-auth.js', 'egbc-poweredby.js', 'egbc-church.js'];

const TAG = /<([a-zA-Z]+)\b((?:[^>"']|"[^"]*"|'[^']*')*)>/g;
const attr = (at, name) => { const m = new RegExp('\\s' + name + '=\\\\?(["\'])([^"\']*)\\\\?\\1').exec(at); return m ? m[2] : ''; };
/* Words built in script, or code the tag pattern caught (a "> 0) {" inside a script): no words. */
const dynamic = (w) => /\$\{|'\s*\+|"\s*\+|\+\s*'|\+\s*"|[{};]|=>|\)\s*\{/.test(w);
const clean = (w) => String(w || '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#\d+;|&\w+;/g, '').replace(/\s+/g, ' ').trim().slice(0, 80);

/** The local scripts a page loads (not the shared ones). @param {string} text */
function pageScripts(text) {
  const out = [];
  for (const m of text.matchAll(/<script[^>]+src="([\w.-]+\.js)[^"]*"/g)) if (!SHARED.includes(m[1]) && exists(m[1])) out.push(m[1]);
  for (const m of text.matchAll(/(?:from|import\()\s*['"]\.\/([\w.-]+\.js)['"]/g)) if (!SHARED.includes(m[1]) && exists(m[1])) out.push(m[1]);
  return [...new Set(out)];
}

/**
 * The controls in one file's text, each { id, kind, words, to, count }.
 * @param {string} text
 */
export function controlsIn(text) {
  const map = new Map();
  for (const m of text.matchAll(TAG)) {
    const tag = m[1].toLowerCase(), at = m[2];
    const isControl = /^(button|a|input|select|textarea|summary)$/.test(tag) || /\s(onclick|data-act|data-lact|data-mact|data-tab)=/.test(at) || /role=\\?["'](button|tab)/.test(at);
    if (!isControl) continue;
    if (tag === 'input' && /type=\\?["']hidden/.test(at)) continue;
    if (tag === 'a' && !/\shref=/.test(at) && !/onclick=|data-act=/.test(at)) continue;
    const kind = /^(input|select|textarea)$/.test(tag) ? 'field' : (/data-tab=/.test(at) || /role=\\?["']tab/.test(at)) ? 'tab' : tag === 'a' ? 'link' : 'button';
    /* What it says: aria-label, else title, else the words before the next tag, else a field's placeholder or name. */
    const inner = text.slice(m.index + m[0].length, m.index + m[0].length + 120).split('<')[0];
    let words = attr(at, 'aria-label') || attr(at, 'title') || inner || attr(at, 'placeholder') || attr(at, 'value');
    words = dynamic(words) ? '' : clean(words);
    /* Where it goes: a link's page, or the page a button's onclick sends to. */
    let to = '';
    const href = /\shref=\\?["']([^"'#?$]+\.html)/.exec(at);
    if (href) to = decodeURIComponent(href[1].trim());
    const nav = /(?:location(?:\.href)?\s*=|location\.(?:assign|replace)\()\s*\\?["']([^"'#?]+\.html)/.exec(attr(at, 'onclick') || '');
    if (!to && nav) to = nav[1];
    const fn = /onclick=\\?["']\s*(?:(?:event|this)[^;"']*;\s*)*(?:window\.)?([A-Za-z_$][\w$]*)\s*\(/.exec(at);
    const act = /data-(?:act|lact|mact)=\\?["']([\w:.#\/-]*)/.exec(at), tb = /data-tab=\\?["']([\w-]*)/.exec(at);
    const id = /\sid=\\?["']([A-Za-z][\w-]*)\\?["']/.exec(at);
    /* Known by what does not change when it is repaired: a button by what it does
       (its handler, data-act or tab), then its id, then its words; a link by its
       id, then its words, then where it goes; a field by its id, then its name.
       A label or an id added to a control is a repair, not a removal. */
    const fnName = fn && !/^(if|return|event|this|var|let|const|function|document|window|location|alert|confirm|setTimeout|try|async|await)$/.test(fn[1]) ? fn[1] : '';
    let key;
    if (kind === 'link') key = id ? 'id:' + id[1] : words ? 'link:"' + words + '"' : to ? 'link-to:' + to : fnName ? 'fn:' + fnName : '';
    else if (kind === 'field') key = id ? 'id:' + id[1] : attr(at, 'name') ? 'field:' + attr(at, 'name') : '';
    else key = fnName ? 'fn:' + fnName : act ? 'act:' + act[1] : tb ? 'tab:' + tb[1] : id ? 'id:' + id[1] : words ? kind + ':"' + words + '"' : '';
    if (!key) continue;   /* nothing to know it by: built entirely in script */
    /* One control drawn more than once (one handler, two buttons): every wording kept. */
    const was = map.get(key);
    if (was) { was.count++; if (words && !was.words.includes(words)) was.words.push(words); continue; }
    map.set(key, { id: key, kind, words: words ? [words] : [], to, count: 1 });
  }
  return [...map.values()];
}

/** Every v2 page (the top folder's .html files) and its controls; the shared chrome once. */
export function snapshot() {
  const pages = {};
  for (const f of topPages()) {
    const text = read(f), all = new Map();
    for (const src of [f].concat(pageScripts(text))) for (const c of controlsIn(read(src))) {
      const was = all.get(c.id);
      if (was) { was.count = Math.max(was.count, c.count); c.words.forEach((w) => { if (!was.words.includes(w)) was.words.push(w); }); } else all.set(c.id, c);
    }
    pages[f] = [...all.values()];
  }
  const shared = new Map();
  for (const s of SHARED.filter((x) => exists(x))) for (const c of controlsIn(read(s))) if (!shared.has(c.id)) shared.set(c.id, c);
  return { pages, shared: [...shared.values()] };
}

/** The approved lines: everything in backticks in APPROVED-CHANGES.md. */
function approvals() {
  if (!exists('APPROVED-CHANGES.md')) return new Set();
  return new Set([...read('APPROVED-CHANGES.md').matchAll(/`([^`]+)`/g)].map((m) => m[1].trim()));
}

/**
 * The differences between the baseline and now, each { line, what } (line: the text to approve).
 * @param {object} base @param {object} now
 */
export function differences(base, now) {
  const out = [];
  const compare = (where, was, is) => {
    const here = new Map(is.map((c) => [c.id, c]));
    for (const c of was) {
      const n = here.get(c.id);
      if (!n) { out.push({ line: where + ' :: ' + c.id, what: 'gone' + (c.to ? ' (it went to ' + c.to + ')' : '') }); continue; }
      if (n.count < c.count) out.push({ line: where + ' :: ' + c.id + ' :: ' + c.count + ' -> ' + n.count, what: 'fewer drawn (' + c.count + ' then, ' + n.count + ' now)' });
      /* Renamed: a wording it had is no longer among its wordings. */
      for (const w of c.words) if (!n.words.includes(w)) out.push({ line: where + ' :: ' + c.id + ' :: renamed "' + w + '"', what: 'renamed: "' + w + '" is now ' + (n.words.length ? n.words.map((x) => '"' + x + '"').join(' / ') : 'no words') });
      if (c.to && n.to !== c.to) out.push({ line: where + ' :: ' + c.id + ' :: goes to ' + (n.to || 'nowhere'), what: 'goes to ' + (n.to || 'no page') + ' (it went to ' + c.to + ')' });
    }
  };
  for (const [page, list] of Object.entries(base.pages)) {
    if (!now.pages[page]) { out.push({ line: page, what: 'the page is gone' }); continue; }
    compare(page, list, now.pages[page]);
  }
  compare('shared', base.shared, now.shared);
  return out;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const arg = (n) => { const a = process.argv.find((x) => x.startsWith('--' + n + '=')); return a ? a.slice(n.length + 3) : null; };
  if (process.argv.includes('--write-baseline')) {
    const snap = snapshot(), pending = (arg('pending') || '').split(',').map((s) => s.trim()).filter(Boolean);
    for (const p of pending) delete snap.pages[p];
    const n = Object.values(snap.pages).reduce((t, l) => t + l.length, 0) + snap.shared.length;
    fs.writeFileSync(BASELINE, JSON.stringify({ made: new Date().toISOString().slice(0, 10), pending, pages: snap.pages, shared: snap.shared }, null, 1) + '\n');
    console.log('baseline: ' + Object.keys(snap.pages).length + ' pages, ' + n + ' controls' + (pending.length ? '; pending Martin\'s decision, left out: ' + pending.join(', ') : ''));
    process.exit(0);
  }
  if (!exists('tests/baseline-controls.json')) { console.error('No baseline: node tests/check-no-removals.mjs --write-baseline'); process.exit(1); }
  const base = JSON.parse(read('tests/baseline-controls.json')), ok = approvals();
  const diffs = differences(base, snapshot());
  const bad = diffs.filter((d) => !ok.has(d.line)), fine = diffs.length - bad.length;
  const n = Object.values(base.pages).reduce((t, l) => t + l.length, 0) + base.shared.length;
  if (!bad.length) {
    console.log('PASS  nothing removed, renamed or sent somewhere new: ' + Object.keys(base.pages).length + ' pages, ' + n + ' controls' + (fine ? ' (' + fine + ' approved change' + (fine === 1 ? '' : 's') + ')' : ''));
    process.exit(0);
  }
  console.log('FAIL  ' + bad.length + ' change' + (bad.length === 1 ? '' : 's') + ' Martin has not approved (CLAUDE.md section 0). Put it back, or ask him; once he says yes the reviewing window adds the line in backticks to v2/APPROVED-CHANGES.md:\n');
  for (const d of bad) console.log('  ' + d.what + '\n    `' + d.line + '`');
  process.exit(1);
}
