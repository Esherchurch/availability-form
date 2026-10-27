/* ===================================================================
   THE TEAMS THAT WORK WITH UNDER-18s, for the rules (the reviewing
   window's job 2, item 8; F-265 section 9)
   ===================================================================
   The rules can't read every team, so this keeps one record of them:

     teamFlags/under18   { teams: [team ids], at }   (server only)

   worked out again whenever a team is written. A team works with
   under-18s when its record says so (teams/{id}.under18, ticked on Teams
   and groups), or it is one of EGBC's five, as egbc-auth.js's TEAMS
   (`d.under18 === true || base.under18 === true`). The rules' under18Teams()
   (main's) reads this record, and EGBC's five while it doesn't exist yet.
   For any church: its own ticked teams; at most 100.

   The events window's file. The triggers are made in index.js (twins).
   =================================================================== */
import { onDocumentWritten } from 'firebase-functions/v2/firestore';

/* EGBC's five, as egbc-auth.js and the rules' default */
export const EGBC_UNDER18 = ['Kids Church', 'Youth Worship', 'Lazers', 'ReNu', 'Kids & Youth Core Team'];

export function under18Of(teams) {
  return teams.filter((t) => !t.archived && (t.under18 === true || EGBC_UNDER18.includes(t.id))).map((t) => t.id).sort().slice(0, 100);
}

export async function syncUnder18(db) {
  const all = (await db.collection('teams').limit(500).get()).docs.map((d) => Object.assign({ id: d.id }, d.data()));
  const teams = under18Of(all), ref = db.collection('teamFlags').doc('under18');
  const was = (await ref.get()).data();
  if (was && JSON.stringify(was.teams || []) === JSON.stringify(teams)) return { skipped: 'unchanged', teams };
  await ref.set({ teams, at: new Date().toISOString() });
  return { written: true, teams };
}

/* only when a team's under-18s tick, or whether it is archived, changed */
export async function onTeamU18(db, before, after) {
  const was = !!(before && before.under18 === true) + '|' + !!(before && before.archived) + '|' + !!before;
  const now = !!(after && after.under18 === true) + '|' + !!(after && after.archived) + '|' + !!after;
  if (was === now) return { skipped: 'nothing that matters changed' };
  return syncUnder18(db);
}

export const makeUnder18Triggers = (twins) => ({
  team: twins(onDocumentWritten, 'teams/{id}', async (ch, event) => {
    const b = event.data.before.exists ? event.data.before.data() : null;
    const a = event.data.after.exists ? event.data.after.data() : null;
    return onTeamU18(ch.db, b, a);
  })
});
