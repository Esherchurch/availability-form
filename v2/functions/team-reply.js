/* WHERE A TEAM'S EMAILS ARE ANSWERED. Rota emails, service plans and youth
   codes are sent for a job (worship, youth...), and a reply should reach that
   team's own address - the one set for it in Team mail - so a parent's answer
   to a youth code goes to the youth team, not the office. Only master admins
   may read Team mail's settings, so a page asks here; it gets one address
   back and nothing else. With no address set for any of the job's teams, the
   church's enquiry email; with neither, none. */
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { churchOf } from './church-scope.js';
import { readTeamJobs, teamsFor, JOBS } from './team-jobs.js';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * The reply address for a job's emails: its first team's own address, else
 * the church's enquiry email, else ''.
 * @param {object} db one church's database
 * @param {string} job a team job id
 * @returns {Promise<{ address: string, from: 'team'|'church'|'' , team?: string }>}
 */
export async function replyToFor(db, job) {
  const jobs = await readTeamJobs(db);
  const teams = teamsFor(jobs.map, job, jobs.set);
  const boxes = teams.length ? await db.getAll(...teams.map((t) => db.collection('teamMailboxes').doc(t))) : [];
  for (let i = 0; i < boxes.length; i++) {
    const a = String((boxes[i].exists && boxes[i].data().address) || '').trim();
    if (EMAIL.test(a)) return { address: a, from: 'team', team: teams[i] };
  }
  const d = await db.collection('churchSettings').doc('details').get();
  const e = String((d.exists && d.data().enquiryEmail) || '').trim();
  return EMAIL.test(e) ? { address: e, from: 'church' } : { address: '', from: '' };
}

/* Signed-in, active people only: they are the ones who send these emails. */
export const teamReplyTo = onCall({ region: 'europe-west2' }, async (req) => {
  if (!req.auth || !req.auth.uid) throw new HttpsError('unauthenticated', 'Sign in first.');
  const job = String((req.data || {}).job || '');
  if (!JOBS.some((j) => j.id === job)) throw new HttpsError('invalid-argument', 'There is no job called ' + job + '.');
  const { db } = churchOf(req, getFirestore());
  const u = await db.collection('users').doc(req.auth.uid).get();
  if (!u.exists || u.data().status !== 'active') throw new HttpsError('permission-denied', 'Only an active member of the church can ask.');
  const r = await replyToFor(db, job);
  return { address: r.address };
});
