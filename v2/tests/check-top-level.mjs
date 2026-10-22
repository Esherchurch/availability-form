/* Nothing new at the top of Firestore (multi-church step 2).
   Every church's data lives under churches/{cid}. The collections already at
   the top are listed in tests/top-level-collections.json: EGBC's as they are
   today, and Church HQ's own few with their reasons. This fails when
   firestore.rules opens a top-level collection that is not on that list, or
   when the list names one the rules no longer have (so it cannot go stale).

     node tests/check-top-level.mjs                      (from v2)
*/
import fs from 'node:fs';

const rules = fs.readFileSync(process.env.RULES_FILE || 'firestore.rules', 'utf8').replace(/\r\n/g, '\n');
const list = JSON.parse(fs.readFileSync('tests/top-level-collections.json', 'utf8'));
const known = new Set([...Object.keys(list.hq), ...list.egbc]);

// Top level inside "match /databases/{database}/documents" is four spaces in.
const inRules = new Set([...rules.matchAll(/^ {4}match \/([A-Za-z0-9_]+)\//gm)].map(m => m[1]));

const results = [];
const check = (name, ok, why) => results.push({ name, ok, why });

const added = [...inRules].filter(c => !known.has(c));
check('no top-level collection outside churches/{cid} without a stated reason', added.length === 0,
  added.length ? 'new: ' + added.join(', ') + ' - put it under churches/{cid}, or give it a reason in tests/top-level-collections.json' : '');
const gone = [...known].filter(c => !inRules.has(c));
check('every listed collection is still in the rules', gone.length === 0, gone.length ? 'gone: ' + gone.join(', ') : '');
check('churches/{cid} is there', inRules.has('churches'), '');
check('every hq entry has a reason', Object.values(list.hq).every(r => typeof r === 'string' && r.length > 10), '');

for (const r of results) console.log((r.ok ? '  PASS  ' : '  FAIL  ') + r.name + (r.why ? '\n          ' + r.why : ''));
const failed = results.filter(r => !r.ok).length;
console.log('\n' + (results.length - failed) + '/' + results.length + ' passed');
process.exit(failed ? 1 : 0);
