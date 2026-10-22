/* THE ONE REAL CALL (F-265 step 5) - only when the reviewing window says so.
   It sends one description to Anthropic's API through the hub's own code
   (functions/sg-ai.js callModel and sg-ai-core.cjs), with the counts given
   here, and prints the draft as the hub would save it. It writes NOTHING:
   no database, no file. The key comes from Secret Manager into this one
   command only:

     SG_AI_KEY="$(gcloud secrets versions access latest --secret=CHQ_ANTHROPIC_API_KEY --project egbc-worship-planner)" \
       node screenshots/events/sg-ai-smoke.mjs --live --text-file brazil.txt \
       --children 30 --under8 0 --leaders 2 --cleared 2 --kind trip --days 10

   It checks: the answer parses into the hub's shape; the overall (the hub's
   sums) is red; there is a "must not go ahead" item; and, when the leaders
   given are short for the ratio, the hub's own row is there. It prints the
   token counts. Exit 0 when all hold. */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const V2 = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const AI = createRequire(path.join(V2, 'functions', 'index.js'))('./sg-ai-core.cjs');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
if (!process.argv.includes('--live')) { console.log('Not run: this makes one real call to Anthropic. Add --live, only when the reviewing window says so.'); process.exit(2); }
const key = String(process.env.SG_AI_KEY || '').trim();
if (!key || key === 'NOT-SET') { console.log('Not run: SG_AI_KEY is empty (see the comment at the top for how to fill it from Secret Manager).'); process.exit(2); }
const text = arg('text-file') ? fs.readFileSync(arg('text-file'), 'utf8').trim() : String(arg('text', '')).trim();
if (!text) { console.log('Not run: give the description with --text-file <file> or --text "<words>".'); process.exit(2); }
const facts = { children: +arg('children', 0), under8: +arg('under8', 0), leaders: +arg('leaders', 0), cleared: +arg('cleared', 0), ratioAll: +arg('ratio', 5), ratioUnder8: +arg('ratio-under8', 4), kind: arg('kind', 'trip'), days: +arg('days', 1) };

const pc = AI.personalCheck(text, []);
if (pc.refuse) { console.log('Refused before sending, as the hub would: ' + AI.WORDS[pc.refuse]); process.exit(1); }
if (pc.warn) console.log('(The hub would ask first: ' + AI.WORDS.medical + ')');

const { callModel } = await import('../../functions/sg-ai.js');
const t0 = Date.now();
const res = await callModel({ apiKey: key, facts, text });
const secs = ((Date.now() - t0) / 1000).toFixed(1);
console.log('\nstop_reason: ' + res.stop_reason + ' · ' + secs + ' s · tokens in ' + res.usage.input_tokens + ' (cache read ' + (res.usage.cache_read_input_tokens || 0) + '), out ' + res.usage.output_tokens);
if (res.stop_reason === 'refusal') { console.log(AI.WORDS.refused); process.exit(1); }
let parsed = null;
try { parsed = JSON.parse(res.content.filter((b) => b.type === 'text').map((b) => b.text).join('')); } catch (e) { parsed = null; }
const n = AI.normalise(parsed, facts);
if (!n.ok) { console.log(AI.WORDS.incomplete); process.exit(1); }
const W = { red: 'High', amber: 'Medium', green: 'Low' };
console.log('\nOverall, by the hub’s sums: ' + W[n.overall] + ' (the AI said: ' + (parsed.overall || '?') + ')\n');
n.risks.forEach((r, i) => console.log((i + 1) + '. ' + (r.mustNot ? '[MUST NOT GO AHEAD] ' : '') + (r.from === 'hub' ? '[from the hub’s numbers] ' : '') + r.risk +
  '\n   who: ' + r.who + ' · before ' + W[AI.rating(r.l, r.i)] + ' ' + r.l * r.i + ' · after ' + W[AI.rating(r.rl, r.ri)] + ' ' + r.rl * r.ri + ' · owner: ' + (r.owner || '') +
  '\n   controls: ' + r.controls.map((c) => c.text || c.kind).join('; ')));
if (n.mustNot.length) console.log('\nThis must not go ahead as described:\n- ' + n.mustNot.join('\n- '));
if (n.questions.length) console.log('\nQuestions before sign-off:\n- ' + n.questions.join('\n- '));

const short = AI.hubRisks(facts).length > 0;
const checks = [
  ['the answer parses into the hub’s shape', n.ok],
  ['overall red', n.overall === 'red'],
  ['a "must not go ahead" item', n.mustNot.length > 0 || n.risks.some((r) => r.mustNot)],
  [short ? 'the hub’s own "not enough leaders" row' : '(leaders not short: no hub row expected)', !short || n.risks[0].from === 'hub']
];
console.log('');
checks.forEach(([k, v]) => console.log((v ? '  PASS  ' : '  FAIL  ') + k));
process.exit(checks.every((c) => c[1]) ? 0 : 1);
