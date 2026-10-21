/* EVERY FUNCTION THAT READS A SECRET DECLARES IT (the reviewer, 21 Oct:
   m365Status read MS_HQ_CLIENT_SECRET through settings() without declaring
   it, so live it was always empty and the card said "Not available yet";
   fixed in a4fe8d92). On the emulator the secret is never read, so only
   reading the code catches it. For the events window's functions files:
   each defineSecret, each helper that reads one (VAR.value()), and each
   exported trigger (onCall / onRequest / onSchedule) that reads it, directly
   or through such a helper, must list it in its secrets: [...].
     node screenshots/events/functions-secrets.test.mjs */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const FN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'functions');
const FILES = ['microsoft.js', 'present.js', 'quiz.js'];
const results = [];
const ok = (name, pass, why) => { results.push(!!pass); console.log((pass ? '  PASS  ' : '  FAIL  ') + name + (pass || why === undefined ? '' : '\n          ' + why)); };

/* the code split into its top-level pieces: "function x(" / "async function x(" / "export const X = on...(" */
export function triggersMissingSecrets(src) {
  const secrets = [...src.matchAll(/(?:export\s+)?const\s+(\w+)\s*=\s*defineSecret\(/g)].map((m) => m[1]);
  if (!secrets.length) return { secrets, missing: [], triggers: [] };
  const starts = [...src.matchAll(/^(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\(|^export\s+const\s+(\w+)\s*=\s*(onCall|onRequest|onSchedule)\s*\(/gm)]
    .map((m) => ({ name: m[1] || m[2], trigger: !!m[3], at: m.index }));
  const pieces = starts.map((s, i) => Object.assign(s, { body: src.slice(s.at, i + 1 < starts.length ? starts[i + 1].at : src.length) }));
  /* which helpers read which secrets (directly, then through other helpers) */
  const reads = {};
  for (const p of pieces) if (!p.trigger) reads[p.name] = new Set(secrets.filter((v) => new RegExp('\\b' + v + '\\.value\\(').test(p.body)));
  for (let round = 0; round < 5; round++) for (const p of pieces) if (!p.trigger) for (const [h, set] of Object.entries(reads)) if (h !== p.name && new RegExp('\\b' + h + '\\(').test(p.body)) set.forEach((v) => reads[p.name].add(v));
  const missing = [], triggers = [];
  for (const p of pieces.filter((x) => x.trigger)) {
    const needs = new Set(secrets.filter((v) => new RegExp('\\b' + v + '\\.value\\(').test(p.body)));
    for (const [h, set] of Object.entries(reads)) if (new RegExp('\\b' + h + '\\(').test(p.body)) set.forEach((v) => needs.add(v));
    const opts = (p.body.match(/^export\s+const\s+\w+\s*=\s*on\w+\s*\(\s*(\{[^}]*\})/) || [])[1] || '';
    const declared = new Set(((opts.match(/secrets\s*:\s*\[([^\]]*)\]/) || [])[1] || '').split(',').map((x) => x.trim()).filter(Boolean));
    triggers.push({ name: p.name, needs: [...needs], declared: [...declared] });
    for (const v of needs) if (!declared.has(v)) missing.push(p.name + ' reads ' + v + ' but does not declare it');
  }
  return { secrets, missing, triggers };
}

for (const f of FILES) {
  const r = triggersMissingSecrets(fs.readFileSync(path.join(FN, f), 'utf8'));
  ok(f + ': every function that reads a secret declares it' + (r.secrets.length ? ' (' + r.secrets.join(', ') + ')' : ' (no secrets)'), r.missing.length === 0, r.missing.join('; '));
}
/* and the check itself bites: m365Status as it was before a4fe8d92 */
const before = fs.readFileSync(path.join(FN, 'microsoft.js'), 'utf8').replace(/export const m365Status = onCall\(\{[^}]*\}/, "export const m365Status = onCall({ region: REGION }");
const r0 = triggersMissingSecrets(before);
ok('the check bites: m365Status as it was (no secrets) is caught', r0.missing.some((m) => /^m365Status reads MS_HQ_CLIENT_SECRET/.test(m)), r0.missing.join('; ') || 'nothing caught');
const t = triggersMissingSecrets(fs.readFileSync(path.join(FN, 'microsoft.js'), 'utf8')).triggers.map((x) => x.name + (x.needs.length ? ' needs ' + x.needs.join(',') : ''));
ok('   it sees m365Start, m365Callback and m365Status needing the secret (through settings())', ['m365Start', 'm365Callback', 'm365Status'].every((n) => t.some((x) => x.startsWith(n + ' needs MS_HQ_CLIENT_SECRET'))), t.join(' | '));
console.log('\n' + results.filter(Boolean).length + '/' + results.length + ' passed');
process.exit(results.every(Boolean) ? 0 : 1);
