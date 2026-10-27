/* ===================================================================
   Members' meetings: the votes (main window, 21 Oct 2026;
   design-mocks/members-meeting/PLAN.md, Martin's answers 21 Oct)
   ===================================================================

   Members only (the address book's "church member" tick), one vote each,
   secret or open per vote, results shown when it closes, who voted kept,
   how they voted never shown for a secret vote. No changing a vote. The
   counts are shown; the chair types the outcome.
   PROXIES (Martin, 21 Oct 2026; design-mocks/members-meeting/PROXIES.md):
   a member appoints one other member to vote for them at one meeting,
   until its first vote opens. proxies/{givingMemberId}: { holderId,
   holderName, giverName, at, by }. The holder casts the giver's ballot
   (castVote with `for`); it is the giver's ballot, marked castBy, and on
   a secret vote it holds no choice, like every other.

   NO PAGE WRITES A BALLOT, an opening or a closing. Everything that decides
   a vote happens here, in a transaction:

     castVote   { meeting, vote, choice }  a church member, once, while open
                  ballots/{memberId}: { at, name } and, only for an OPEN
                  vote, the choice. For a SECRET vote the choice goes into
                  tally/count and nowhere else - never beside a name, so
                  nobody (the office, a master admin, this server's logs)
                  can ever find out how anyone voted. It is not stored.
     voteOpen   { meeting, vote }  whoever runs the meeting: draft -> open
     voteClose  { meeting, vote }  open -> closed; the tally becomes
                  `results` on the vote, which members can read.

   WHO RUNS A MEETING: master admins, and the teams doing the office or
   the trustees job (Martin, 21 Oct 2026; by job, H-9). firestore.rules
   says the same (meetingRunner(): raOffice() || onTrustees()).
   =================================================================== */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { churchOf } from './church-scope.js';
import { readTeamJobs, teamsFor } from './team-jobs.js';

const REGION = 'europe-west2';
/* The teams running meetings: the office job's and the trustees job's. */
export async function runnerTeams(db) {
  const tj = await readTeamJobs(db);
  return teamsFor(tj.map, 'office', tj.set).concat(teamsFor(tj.map, 'trustees', tj.set));
}

const ID = /^[A-Za-z0-9_-]{1,120}$/;
export const isRunner = (u, teams) => !!u && u.status !== 'archived'
  && (u.masterAdmin === true || (Array.isArray(u.teams) && u.teams.concat(u.covers || []).some(t => teams.includes(t))));
const RUNS = 'Only the church office, the trustees and master admins run a members’ meeting.';
export const isVoter = (u) => !!u && u.status === 'active' && u.churchMember === true && !!u.memberId;

async function who(db, uid) {
  const s = await db.collection('users').doc(uid).get();
  return s.exists ? s.data() : null;
}
function refs(db, data) {
  const m = String((data && data.meeting) || ''), v = String((data && data.vote) || '');
  if (!ID.test(m) || !ID.test(v)) throw new HttpsError('invalid-argument', 'Which vote?');
  const vote = db.collection('churchMeetings').doc(m).collection('votes').doc(v);
  return { vote, tally: vote.collection('tally').doc('count'), ballots: vote.collection('ballots') };
}

export async function cast({ db, uid, data }) {
  const u = await who(db, uid);
  if (!isVoter(u)) throw new HttpsError('permission-denied', 'Only church members can vote. If you have joined the church, ask the office to tick it against your record.');
  const r = refs(db, data);
  const choice = String((data && data.choice) || '');
  /* For whom: yourself, or the member whose proxy you hold. */
  const forId = data && data.for ? String(data.for) : '';
  if (forId && (!ID.test(forId) || forId === u.memberId)) throw new HttpsError('invalid-argument', 'Whose vote is this?');
  const whose = forId || u.memberId;
  const ballot = r.ballots.doc(whose);
  const proxy = proxiesOf(db, data).doc(whose);
  await db.runTransaction(async (tx) => {
    const [v, b, p] = await Promise.all([tx.get(r.vote), tx.get(ballot), tx.get(proxy)]);
    const pd = p.exists ? p.data() : null;
    if (forId && (!pd || pd.holderId !== u.memberId)) throw new HttpsError('permission-denied', 'You are not voting for them at this meeting.');
    if (!forId && pd) throw new HttpsError('failed-precondition', 'You asked ' + (pd.holderName || 'someone') + ' to vote for you at this meeting.');
    if (!v.exists) throw new HttpsError('not-found', 'There is no such vote.');
    const vd = v.data();
    if (vd.status !== 'open') throw new HttpsError('failed-precondition', vd.status === 'closed' ? 'This vote has closed.' : 'This vote has not opened yet.');
    if (!Array.isArray(vd.choices) || !vd.choices.includes(choice)) throw new HttpsError('invalid-argument', 'That is not one of the choices.');
    if (b.exists) throw new HttpsError('already-exists', forId ? 'Their vote has already been cast.' : 'You have already voted.');
    const rec = forId
      ? { at: new Date().toISOString(), name: String(pd.giverName || '').slice(0, 80), castBy: String(u.name || '').slice(0, 80), proxy: true }
      : { at: new Date().toISOString(), name: String(u.name || '').slice(0, 80) };
    if (vd.secret === false) rec.choice = choice;
    tx.create(ballot, rec);
    tx.set(r.tally, { [choice]: FieldValue.increment(1) }, { merge: true });
    tx.update(r.vote, forId ? { voters: FieldValue.increment(1), byProxy: FieldValue.increment(1) } : { voters: FieldValue.increment(1) });
  });
  return { ok: true };
}

/* ---- proxies ---- */
export const MAX_HELD = 1;
function proxiesOf(db, data) {
  const m = String((data && data.meeting) || '');
  if (!ID.test(m)) throw new HttpsError('invalid-argument', 'Which meeting?');
  return db.collection('churchMeetings').doc(m).collection('proxies');
}
/* Appointing and cancelling stop when the meeting's first vote opens. */
async function voting(db, data) {
  const s = await db.collection('churchMeetings').doc(String(data.meeting)).collection('votes').where('status', 'in', ['open', 'closed']).limit(1).get();
  return !s.empty;
}
export async function appoint({ db, uid, data }) {
  const u = await who(db, uid);
  if (!isVoter(u)) throw new HttpsError('permission-denied', 'Only church members can appoint someone to vote for them.');
  const proxies = proxiesOf(db, data);
  const meeting = await db.collection('churchMeetings').doc(String(data.meeting)).get();
  if (!meeting.exists) throw new HttpsError('not-found', 'There is no such meeting.');
  if (await voting(db, data)) throw new HttpsError('failed-precondition', 'Voting has started, so proxies can no longer be changed.');
  const holderId = String((data && data.holder) || '');
  if (!ID.test(holderId) || holderId === u.memberId) throw new HttpsError('invalid-argument', 'Choose another church member.');
  const h = await db.collection('addressBook').doc(holderId).get();
  const hd = h.exists ? h.data() : null;
  if (!hd || hd.churchMember !== true || hd.archived === true || hd.isMinor === true || hd.under18 === true) {
    throw new HttpsError('failed-precondition', 'Only an adult church member can vote for you.');
  }
  const holderName = String(hd.name || hd.fullName || '').slice(0, 80);
  await db.runTransaction(async (tx) => {
    const [own, held] = await Promise.all([tx.get(proxies.doc(holderId)), tx.get(proxies.where('holderId', '==', holderId))]);
    if (own.exists) throw new HttpsError('failed-precondition', holderName + ' has asked someone else to vote for them, so cannot hold a proxy.');
    if (held.docs.filter((d) => d.id !== u.memberId).length >= MAX_HELD) throw new HttpsError('failed-precondition', holderName + ' is already voting for someone else at this meeting.');
    tx.set(proxies.doc(u.memberId), { holderId, holderName, giverName: String(u.name || '').slice(0, 80), at: new Date().toISOString(), by: uid });
  });
  return { ok: true, holderName };
}
/* Whom a member may choose: adult church members, names only, never an
   address - a member cannot read the address book, and needs no more. */
export async function people({ db, uid }) {
  const u = await who(db, uid);
  if (!isVoter(u)) throw new HttpsError('permission-denied', 'Only church members can appoint someone to vote for them.');
  const s = await db.collection('addressBook').where('churchMember', '==', true).get();
  return { people: s.docs.filter((d) => d.id !== u.memberId).map((d) => ({ id: d.id, ...d.data() }))
    .filter((m) => m.archived !== true && m.isMinor !== true && m.under18 !== true)
    .map((m) => ({ id: m.id, name: String(m.name || m.fullName || '').slice(0, 80) })).filter((m) => m.name)
    .sort((a, b) => a.name.localeCompare(b.name)) };
}
export async function unappoint({ db, uid, data }) {
  const u = await who(db, uid);
  if (!isVoter(u)) throw new HttpsError('permission-denied', 'Only church members have a vote to give.');
  const proxies = proxiesOf(db, data);
  if (await voting(db, data)) throw new HttpsError('failed-precondition', 'Voting has started, so proxies can no longer be changed.');
  await proxies.doc(u.memberId).delete();
  return { ok: true };
}

export async function open({ db, uid, data }) {
  if (!isRunner(await who(db, uid), await runnerTeams(db))) throw new HttpsError('permission-denied', RUNS);
  const r = refs(db, data);
  await db.runTransaction(async (tx) => {
    const v = await tx.get(r.vote);
    if (!v.exists) throw new HttpsError('not-found', 'There is no such vote.');
    if (v.data().status !== 'draft') throw new HttpsError('failed-precondition', 'Only a vote that has not started can be opened.');
    tx.update(r.vote, { status: 'open', openedAt: new Date().toISOString(), openedBy: uid, voters: 0 });
  });
  return { ok: true };
}

export async function close({ db, uid, data }) {
  if (!isRunner(await who(db, uid), await runnerTeams(db))) throw new HttpsError('permission-denied', RUNS);
  const r = refs(db, data);
  await db.runTransaction(async (tx) => {
    const [v, t] = await Promise.all([tx.get(r.vote), tx.get(r.tally)]);
    if (!v.exists) throw new HttpsError('not-found', 'There is no such vote.');
    const vd = v.data();
    if (vd.status !== 'open') throw new HttpsError('failed-precondition', 'Only an open vote can be closed.');
    const counts = t.exists ? t.data() : {};
    const results = {};
    (vd.choices || []).forEach(c => { results[c] = Number(counts[c] || 0); });
    tx.update(r.vote, { status: 'closed', closedAt: new Date().toISOString(), closedBy: uid, results });
  });
  return { ok: true };
}

const call = (fn) => onCall({ region: REGION }, async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Please sign in.');
  /* The church from the sign-in (H-5): its meetings, votes and people. */
  return fn({ db: churchOf(req, getFirestore()).db, uid: req.auth.uid, data: req.data || {} });
});
export const castVote = call(cast);
export const voteOpen = call(open);
export const voteClose = call(close);
export const proxyAppoint = call(appoint);
export const proxyCancel = call(unappoint);
export const proxyPeople = call(people);
