/* WHICH OF A SHARED SCRIPT'S CONTROLS A PAGE CAN EVER DRAW (the going-live
 * test, Stage 3). The control inventory credits a page with every control in
 * every script it loads. A script such as egbc-sg-dash.js serves two pages,
 * and each draws only part of it: the rest is "not on this page", and this
 * proves it from the code rather than by leaving it out.
 *
 * For a control in script S, loaded by page P:
 *   - its enclosing functions are found by parsing S (esprima);
 *   - S's functions that can run on P are: what runs when S loads (its top
 *     level, and the body of an immediately-called wrapper), and every
 *     function P (or another script P loads) calls through S's global
 *     (S's `window.X = { name: fn }`, called as `X.name`); then, again and
 *     again, every function of S a reachable function names;
 *   - the control can be drawn on P when any function it sits in is
 *     reachable. Otherwise it is listed with the reason: the function, and
 *     what P does use of S.
 * A script esprima cannot read is counted as fully drawn (never hidden).
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const V2 = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const esprima = createRequire(import.meta.url)(path.join(V2, 'node_modules', 'esprima'));
const read = (f) => fs.readFileSync(path.join(V2, f), 'utf8');

/* Each script parsed once: its named functions, its globals, its graph. */
const CACHE = {};
function model(file) {
  if (CACHE[file] !== undefined) return CACHE[file];
  let ast;
  try { ast = esprima.parseScript(read(file), { loc: true, range: true, tolerant: true }); } catch (e) { return (CACHE[file] = null); }
  const fns = [];            /* { name, node, start, end, iife } */
  const exportsOf = {};      /* global name -> { prop: fnName } */
  const walk = (node, parent, key) => {
    if (!node || typeof node.type !== 'string') return;
    if (/Function/.test(node.type)) {
      let name = node.id && node.id.name;
      if (!name && parent) {
        if (parent.type === 'VariableDeclarator' && parent.id && parent.id.name) name = parent.id.name;
        else if (parent.type === 'Property' && parent.key) name = parent.key.name || parent.key.value;
        else if (parent.type === 'AssignmentExpression' && parent.left) name = parent.left.type === 'MemberExpression' ? (parent.left.property.name || parent.left.property.value) : parent.left.name;
      }
      const iife = !!(parent && parent.type === 'CallExpression' && key === 'callee');
      fns.push({ name: name || '', node, start: node.loc.start.line, end: node.loc.end.line, iife });
    }
    /* window.X = { a: a } / global.X = { ... } / var X = window.X = { ... } */
    if (node.type === 'AssignmentExpression' && node.left.type === 'MemberExpression' && node.right.type === 'ObjectExpression'
        && node.left.object.type === 'Identifier' && /^(window|global|globalThis|root|self)$/.test(node.left.object.name)) {
      const g = node.left.property.name || node.left.property.value, map = exportsOf[g] = exportsOf[g] || {};
      for (const p of node.right.properties) {
        const k = p.key && (p.key.name || p.key.value);
        if (!k) continue;
        if (p.value.type === 'Identifier') map[k] = p.value.name;
        else if (/Function/.test(p.value.type)) map[k] = k;
      }
    }
    for (const k of Object.keys(node)) {
      if (k === 'loc' || k === 'range') continue;
      const v = node[k];
      if (Array.isArray(v)) v.forEach((c) => walk(c, node, k));
      else if (v && typeof v.type === 'string') walk(v, node, k);
    }
  };
  walk(ast, null, null);
  /* the names each function mentions (identifiers and property names) */
  const mentions = (node) => {
    const out = new Set();
    const go = (n) => {
      if (!n || typeof n.type !== 'string') return;
      if (n.type === 'Identifier') out.add(n.name);
      if (n.type === 'MemberExpression' && !n.computed && n.property) out.add(n.property.name);
      if (n.type === 'Literal' && typeof n.value === 'string' && /^[A-Za-z_$][\w$]*$/.test(n.value)) out.add(n.value);
      for (const k of Object.keys(n)) { if (k === 'loc' || k === 'range') continue; const v = n[k]; if (Array.isArray(v)) v.forEach(go); else if (v && typeof v.type === 'string') go(v); }
    };
    go(node.body || node);
    return out;
  };
  const names = new Set(fns.filter((f) => f.name).map((f) => f.name));
  /* What runs at load: the program outside any function, and the bodies of
     immediately-called wrappers (outside their own named inner functions). */
  const top = new Set();
  const topWalk = (n) => {
    if (!n || typeof n.type !== 'string') return;
    if (/Function/.test(n.type)) {
      const f = fns.find((x) => x.node === n);
      if (!(f && f.iife)) return;
    }
    if (n.type === 'Identifier' && names.has(n.name)) top.add(n.name);
    if (n.type === 'MemberExpression' && !n.computed && n.property && names.has(n.property.name)) top.add(n.property.name);
    /* an export object names functions without calling them */
    if (n.type === 'AssignmentExpression' && n.left.type === 'MemberExpression' && n.right.type === 'ObjectExpression'
        && n.left.object.type === 'Identifier' && /^(window|global|globalThis|root|self)$/.test(n.left.object.name)) return;
    for (const k of Object.keys(n)) { if (k === 'loc' || k === 'range') continue; const v = n[k]; if (Array.isArray(v)) v.forEach(topWalk); else if (v && typeof v.type === 'string') topWalk(v); }
  };
  topWalk(ast);
  const calls = {};
  for (const f of fns) if (f.name) calls[f.name] = new Set([...mentions(f.node)].filter((x) => names.has(x) && x !== f.name));
  return (CACHE[file] = { fns, exportsOf, names, top, calls });
}

/** The scripts a page loads (local, by src), in order. */
export function scriptsOf(page) {
  const t = read(page), out = [];
  for (const m of t.matchAll(/<script[^>]+src="([\w.-]+\.js)[^"]*"/g)) if (fs.existsSync(path.join(V2, m[1]))) out.push(m[1]);
  return [...new Set(out)];
}

/**
 * Whether a control in a shared script can be drawn on a page.
 * @param {string} page the page file
 * @param {{ file: string, at: number, key: string }} c the control (file: its script, at: its line)
 * @returns {{ drawn: boolean, reason?: string }}
 */
export function drawnOn(page, c) {
  if (c.file === page) return { drawn: true };
  const m = model(c.file);
  if (!m) return { drawn: true };
  /* What the page, and its other scripts, use of this script's globals. */
  const others = [page].concat(scriptsOf(page).filter((s) => s !== c.file)).map(read).join('\n');
  const used = new Set();
  for (const [g, map] of Object.entries(m.exportsOf)) {
    /* the global by its own name, and by any short name a page gives it
       (var K = window.EGBCKids; E = EGBCEvents, ...) */
    const aliases = new Set([g]);
    for (const a of others.matchAll(new RegExp('\\b([A-Za-z_$][\\w$]*)\\s*=\\s*(?:window\\.|global\\.)?' + g + '\\b(?!\\s*\\.)', 'g'))) aliases.add(a[1]);
    for (const al of aliases) for (const mm of others.matchAll(new RegExp('(?:^|[^\\w$.])' + al.replace(/\$/g, '\\$') + '\\s*\\.\\s*([A-Za-z_$][\\w$]*)', 'g'))) if (map[mm[1]]) used.add(map[mm[1]]);
  }
  /* reachable: what runs at load, what others call, and what those name */
  const reach = new Set([...m.top, ...used]);
  for (let grew = true; grew;) {
    grew = false;
    for (const n of [...reach]) for (const x of (m.calls[n] || [])) if (!reach.has(x)) { reach.add(x); grew = true; }
  }
  const around = m.fns.filter((f) => f.start <= c.at && c.at <= f.end && !f.iife);
  if (!around.length) return { drawn: true };
  const named = around.filter((f) => f.name);
  if (!named.length || named.some((f) => reach.has(f.name))) return { drawn: true };
  /* the outermost: a click handler inside wireReview() is named by wireReview, not 'onclick' (4 Nov 2026) */
  const inner = named.sort((a, b) => (b.end - b.start) - (a.end - a.start))[0];
  const api = Object.entries(m.exportsOf).map(([g, map]) => g + ': ' + (Object.keys(map).filter((k) => used.has(map[k])).join(', ') || 'nothing')).join('; ');
  return { drawn: false, reason: 'drawn by ' + c.file + ' ' + inner.name + '(), which nothing on ' + page + ' can call (it uses ' + api + ')' };
}
