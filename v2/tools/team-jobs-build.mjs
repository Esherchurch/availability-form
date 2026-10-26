/* functions/team-jobs.js, built from egbc-team-jobs.js (FINDINGS-churchhq
 * H-9), so the pages and the server give the same answers from one source.
 *
 *   node tools/team-jobs-build.mjs        (from v2/)
 *
 * Functions are deployed from functions/ alone, so they cannot load the
 * page's file; this copies it in, unchanged, and adds the one thing only
 * the server needs: reading a church's mapping and settings. Run it after
 * any change to egbc-team-jobs.js; tests/check-team-jobs.mjs fails while
 * the copy is out of date.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const V2 = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const SOURCE = 'egbc-team-jobs.js';
export const BUILT = 'functions/team-jobs.js';
const CALL = "})(typeof window !== 'undefined' ? window : globalThis);";

export function buildTeamJobs(src) {
  const text = src.replace(/\r\n/g, '\n');
  if (text.split(CALL).length !== 2) throw new Error(SOURCE + ' no longer ends with its one call: the build needs looking at');
  return '// GENERATED from ' + SOURCE + ' by tools/team-jobs-build.mjs - do not edit; change ' + SOURCE + ' and rebuild.\n'
    + 'const G = {};\n'
    + text.replace(CALL, '})(G);') + '\n'
    + 'export const { JOBS, MOST, teamsFor, jobsOf, onJob, label, validate, job } = G.EGBCTeamJobs;\n\n'
    + '/* A church\'s mapping and the three settings it falls back on, from its\n'
    + '   own data (db is the church-scoped db from churchOf, or EGBC\'s). */\n'
    + 'export async function readTeamJobs(db) {\n'
    + '  const get = (c, d) => db.collection(c).doc(d).get().then((s) => (s.exists ? s.data() : null), () => null);\n'
    + '  const [map, pay, sg, pr] = await Promise.all([get(\'churchSettings\', \'teamJobs\'), get(\'paymentSettings\', \'public\'), get(\'safeguardingSettings\', \'defaults\'), get(\'prayerSettings\', \'main\')]);\n'
    + '  const set = {};\n'
    + '  if (pay && pay.moneyTeam !== undefined) set.moneyTeam = pay.moneyTeam;\n'
    + '  if (sg && sg.trusteeTeam !== undefined) set.trusteeTeam = sg.trusteeTeam;\n'
    + '  if (pr && pr.prayerTeam !== undefined) set.prayerTeam = pr.prayerTeam;\n'
    + '  return { map: map || null, set };\n'
    + '}\n';
}

/* And functions/permissions-core.js from egbc-permissions.js (H-14), the
   same way: the page's rules, unchanged, with the team jobs passed in. */
export const PERMS_SOURCE = 'egbc-permissions.js';
export const PERMS_BUILT = 'functions/permissions-core.js';
export function buildPermissions(src) {
  const text = src.replace(/\r\n/g, '\n');
  if (text.split(CALL).length !== 2) throw new Error(PERMS_SOURCE + ' no longer ends with its one call: the build needs looking at');
  return '// GENERATED from ' + PERMS_SOURCE + ' by tools/team-jobs-build.mjs - do not edit; change ' + PERMS_SOURCE + ' and rebuild.\n'
    + "import * as TJ from './team-jobs.js';\n"
    + 'const G = {};\n'
    + text.replace(CALL, '})(G);') + '\n'
    + 'const P = G.EGBCPermissions;\n'
    + 'export const { SECTIONS, ACTIONS, LATER, READ_ONLY, MOST, ruleFor, ending, validate, current, action } = P;\n'
    + '/* On the server the team jobs come from team-jobs.js. */\n'
    + 'export const may = (person, id, o) => P.may(person, id, Object.assign({ TJ }, o || {}));\n'
    + 'export const allowed = (person, o) => P.allowed(person, Object.assign({ TJ }, o || {}));\n';
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const out = buildTeamJobs(fs.readFileSync(path.join(V2, SOURCE), 'utf8'));
  fs.writeFileSync(path.join(V2, BUILT), out);
  console.log('wrote ' + BUILT + ': ' + Buffer.byteLength(out) + ' bytes');
  const perms = buildPermissions(fs.readFileSync(path.join(V2, PERMS_SOURCE), 'utf8'));
  fs.writeFileSync(path.join(V2, PERMS_BUILT), perms);
  console.log('wrote ' + PERMS_BUILT + ': ' + Buffer.byteLength(perms) + ' bytes');
}
