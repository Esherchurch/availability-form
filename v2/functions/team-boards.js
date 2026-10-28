/* WHICH TEAM A PIN BOARD BELONGS TO, for the rules. A team's pin board is
   set in Teams & groups (teams/{id}.board); the rules can't read every team,
   so this keeps one record of the boards that belong to a single team:

     teamFlags/boards   { boards: { <board>: <team id> }, at }   (server only)

   worked out again whenever a team is written. A board several teams share
   (EGBC's Worship, AV and Choir on one) belongs to none of them here: those
   teams already read each other's things. With no board stored, a team has
   EGBC's (DEFAULT_BOARDS, the same as egbc-auth.js's TEAMS), so nothing
   changes for EGBC. The rules' boardGroup() reads this record. */
import { onDocumentWritten } from 'firebase-functions/v2/firestore';

/* EGBC's boards, as egbc-auth.js's TEAMS has them. */
export const DEFAULT_BOARDS = {
  'Worship Team': 'state', 'AV Team': 'state', 'Choir': 'state', 'Youth Worship': 'youth',
  'Kids Church': 'kids-church', 'Lazers': 'lazers', 'ReNu': 'renu', 'Core Team': 'core-team'
};

/**
 * The boards that belong to exactly one team, from the teams' records.
 * @param {{ id: string, board?: string, archived?: boolean, parent?: string }[]} teams
 * @returns {Object<string, string>} board -> team id
 */
export function boardsOf(teams) {
  const byId = Object.fromEntries(teams.map((t) => [t.id, t]));
  const ids = [...new Set(Object.keys(DEFAULT_BOARDS).concat(teams.map((t) => t.id)))];
  const owners = {};
  ids.forEach((id) => {
    const t = byId[id] || {};
    if (t.archived || t.parent) return;
    const board = typeof t.board === 'string' ? t.board : (DEFAULT_BOARDS[id] || '');
    if (board) (owners[board] = owners[board] || []).push(id);
  });
  return Object.fromEntries(Object.entries(owners).filter(([, o]) => o.length === 1).map(([b, o]) => [b, o[0]]));
}

/** Writes teamFlags/boards if it is not right. @param {object} db one church's database */
export async function syncBoards(db) {
  const all = (await db.collection('teams').limit(500).get()).docs.map((d) => Object.assign({ id: d.id }, d.data()));
  const boards = boardsOf(all), ref = db.collection('teamFlags').doc('boards');
  const was = (await ref.get()).data();
  if (was && JSON.stringify(was.boards || {}) === JSON.stringify(boards)) return { skipped: 'unchanged', boards };
  await ref.set({ boards, at: new Date().toISOString() });
  return { written: true, boards };
}

/* Only when a team's board, parent or archiving changed. */
export async function onTeamBoards(db, before, after) {
  const key = (t) => (t ? [t.board, t.parent, !!t.archived].join('|') : 'none');
  if (key(before) === key(after)) return { skipped: 'nothing that matters changed' };
  return syncBoards(db);
}

/* The trigger, for EGBC's top level and every church (index.js twins). */
export const makeBoardTriggers = (twins) => ({
  team: twins(onDocumentWritten, 'teams/{id}', async (ch, event) => {
    const b = event.data.before.exists ? event.data.before.data() : null;
    const a = event.data.after.exists ? event.data.after.data() : null;
    return onTeamBoards(ch.db, b, a);
  })
});
