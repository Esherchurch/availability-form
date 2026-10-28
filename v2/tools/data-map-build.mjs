/* THE DATA MAP, FOR THE SERVER. Each window keeps its own map in
 * v2/data-map/<area>.json (ENGINEERING.md section 1). Functions are deployed
 * from functions/ alone, so this joins every map into
 * functions/data-map.json, which the server's tidying after a delete
 * (functions/data-links.js) and orphanSweep read.
 *
 *   node tools/data-map-build.mjs          writes functions/data-map.json
 *   node tools/data-map-build.mjs --check  says whether it is up to date
 *
 * It refuses a map that would lose records: a cascade into a legal record
 * (safeguarding, health and safety, accident, finance), a rule it doesn't
 * know, or a collection two maps both claim.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const V2 = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = path.join(V2, 'data-map'), OUT = path.join(V2, 'functions', 'data-map.json');
const RULES = ['cascade', 'block', 'keep-history', 'archive'];
const SELF = ['delete', 'archive', 'retention'];

/** Joins the maps; returns { map, problems }. @param {string} dir */
export function joinMaps(dir) {
  const collections = {}, problems = [];
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.json')).sort()) {
    const m = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    for (const [name, c] of Object.entries(m.collections || {})) {
      if (collections[name]) { problems.push(name + ': in both ' + collections[name].owner + ' and ' + m.owner); continue; }
      if (!SELF.includes(c.self)) problems.push(name + ': self must be one of ' + SELF.join(', '));
      for (const l of c.links || []) {
        if (!RULES.includes(l.rule)) problems.push(name + '.' + l.field + ': rule must be one of ' + RULES.join(', '));
        if (l.rule === 'cascade' && c.legal) problems.push(name + ': a legal record never cascades (' + l.field + ' -> ' + l.to + ')');
        if (!l.why) problems.push(name + '.' + l.field + ': say why');
      }
      collections[name] = Object.assign({ owner: m.owner }, c);
    }
  }
  return { map: { built: 'by tools/data-map-build.mjs from data-map/*.json; edit those, not this', collections }, problems };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { map, problems } = joinMaps(DIR);
  if (problems.length) { console.error('The data map has problems:\n  ' + problems.join('\n  ')); process.exit(1); }
  const text = JSON.stringify(map, null, 1) + '\n';
  if (process.argv.includes('--check')) {
    const now = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';
    console.log(now === text ? 'functions/data-map.json is up to date.' : 'functions/data-map.json is out of date: run node tools/data-map-build.mjs');
    process.exit(now === text ? 0 : 1);
  }
  fs.writeFileSync(OUT, text);
  console.log('functions/data-map.json: ' + Object.keys(map.collections).length + ' collections.');
}
