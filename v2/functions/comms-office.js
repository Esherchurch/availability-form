/* =====================================================================
   EGBC — who the comms functions count as the office (comms window; H-9)
   ---------------------------------------------------------------------
   Master admins, and the church's own teams for the office job
   (churchSettings/teamJobs, through main's team-jobs.js). EGBC's Church
   office only when nothing is stored - so nothing changes for EGBC, and a
   parish's "Parish office" is its office. Never a team name here.

     officeTeams(db)      -> the office job's teams
     isOfficeIn(p, teams) -> a users/{uid} record on one of them, or a
                             master admin (active only)
     isOffice(db, p)      -> the two together
   ===================================================================== */
import { readTeamJobs, teamsFor } from './team-jobs.js';

export async function officeTeams(db) {
  const tj = await readTeamJobs(db);
  return teamsFor(tj.map, 'office', tj.set);
}
export function isOfficeIn(p, teams) {
  if (!p || p.status !== 'active') return false;
  if (p.masterAdmin === true) return true;
  return (p.teams || []).concat(p.covers || []).some((t) => teams.includes(t));
}
export async function isOffice(db, p) {
  return isOfficeIn(p, await officeTeams(db));
}
