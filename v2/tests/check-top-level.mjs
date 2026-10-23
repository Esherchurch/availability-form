/* Every collection is a church's too, and nothing else is at the top of
   the church ruleset (multi-church step 4 part 1; FINDINGS-churchhq H-6,
   H-7). firestore.rules is EGBC's own, top level by nature; the church
   ruleset is generated from it (tools/rules-build.mjs). So the question
   since 23 Oct 2026 is no longer "did anyone add a top-level collection" -
   any collection added to firestore.rules is fine - but:
     - does every collection in firestore.rules have its copy under
       churches/{cid} in firestore.churches.rules (generated, so a miss
       means the generator has gone wrong);
     - is the church ruleset's top level only Church HQ's directory,
       churches/{cid} and the closed catch-all - each with its reason in
       tests/top-level-collections.json ('hq').

     node tests/check-top-level.mjs                      (from v2/)
     CHURCH_RULES=<file> runs it against another copy, for a deliberate break
*/
import fs from 'node:fs';
import { churchCollections } from '../tools/rules-build.mjs';

const rules = fs.readFileSync('firestore.rules', 'utf8');
const church = fs.readFileSync(process.env.CHURCH_RULES || 'firestore.churches.rules', 'utf8').replace(/\r\n/g, '\n');
const list = JSON.parse(fs.readFileSync('tests/top-level-collections.json', 'utf8'));
/* The built church ruleset has no indentation: its top level is what comes
   before 'match /churches/{cid} {' and from the closing catch-all on. */
const opened = (text) => new Set([...text.matchAll(/^match \/([A-Za-z0-9_]+)\//gm)].map(m => m[1]));

const egbc = churchCollections(rules);
const at = church.indexOf('\nmatch /churches/{cid} {');
const end = church.lastIndexOf('\nmatch /{document=**}');
const results = [];
const check = (name, ok, why) => results.push({ name, ok, why });
check('the church ruleset has churches/{cid}', at >= 0 && end > at, '');
const under = opened(church.slice(at + 1, end));
const top = opened(church.slice(0, at + 1) + church.slice(end + 1));
top.delete('churches');
top.delete('databases');   // match /databases/{database}/documents, the wrapper

const missing = egbc.filter(c => !under.has(c));
check('every collection in firestore.rules (' + egbc.length + ') is under churches/{cid} in the church ruleset', missing.length === 0, 'missing: ' + missing.join(', '));
const stray = [...top].filter(c => !(c in list.hq));
check('the church ruleset\'s top level is only the directory (each with its reason)', stray.length === 0, 'at the top: ' + stray.join(', ') + ' - under churches/{cid}, or a reason in tests/top-level-collections.json');
check('every hq entry has a reason', Object.values(list.hq).every(r => typeof r === 'string' && r.length > 10), '');
check("EGBC's own file does not hold churches/{cid} (the church ruleset does)", !egbc.includes('churches'), '');

for (const r of results) console.log((r.ok ? '  PASS  ' : '  FAIL  ') + r.name + (r.ok || !r.why ? '' : '\n          ' + r.why));
const failed = results.filter(r => !r.ok).length;
console.log('\n' + (results.length - failed) + '/' + results.length + ' passed');
process.exit(failed ? 1 : 0);
