/* ===================================================================
   Members' meetings: the votes (main window, 21 Oct 2026;
   design-mocks/members-meeting/PLAN.md, Martin's answers 21 Oct)
   ===================================================================

   Members only (the address book's "church member" tick), one vote each,
   secret or open per vote, results shown when it closes, who voted kept,
   how they voted never shown for a secret vote. No changing a vote, no
   proxies. The counts are shown; the chair types the outcome.

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

   WHO RUNS A MEETING: master admins, the Church office and the Elders
   (Martin, 21 Oct 2026). firestore.rules says the same (meetingRunner()).
   =================================================================== */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const REGION = 'europe-west2';
export const RUNNER_TEAMS = ['Church office', 'Elders'];

const ID = /^[A-Za-z0-9_-]{1,120}$/;
export const isRunner = (u) => !!u && u.status !== 'archived'
  && (u.masterAdmin === true || (Array.isArray(u.teams) && u.teams.some(t => RUNNER_TEAMS.includes(t))));
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
  const ballot = r.ballots.doc(u.memberId);
  await db.runTransaction(async (tx) => {
    const [v, b] = await Promise.all([tx.get(r.vote), tx.get(ballot)]);
    if (!v.exists) throw new HttpsError('not-found', 'There is no such vote.');
    const vd = v.data();
    if (vd.status !== 'open') throw new HttpsError('failed-precondition', vd.status === 'closed' ? 'This vote has closed.' : 'This vote has not opened yet.');
    if (!Array.isArray(vd.choices) || !vd.choices.includes(choice)) throw new HttpsError('invalid-argument', 'That is not one of the choices.');
    if (b.exists) throw new HttpsError('already-exists', 'You have already voted.');
    const rec = { at: new Date().toISOString(), name: String(u.name || '').slice(0, 80) };
    if (vd.secret === false) rec.choice = choice;
    tx.create(ballot, rec);
    tx.set(r.tally, { [choice]: FieldValue.increment(1) }, { merge: true });
    tx.update(r.vote, { voters: FieldValue.increment(1) });
  });
  return { ok: true };
}

export async function open({ db, uid, data }) {
  if (!isRunner(await who(db, uid))) throw new HttpsError('permission-denied', 'Only the Church office, the Elders and master admins run a members’ meeting.');
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
  if (!isRunner(await who(db, uid))) throw new HttpsError('permission-denied', 'Only the Church office, the Elders and master admins run a members’ meeting.');
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
  return fn({ db: getFirestore(), uid: req.auth.uid, data: req.data || {} });
});
export const castVote = call(cast);
export const voteOpen = call(open);
export const voteClose = call(close);
