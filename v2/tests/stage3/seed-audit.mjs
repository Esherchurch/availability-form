/* THE KIDS CHURCH SUNDAY'S RECORDS, FOR THE AUDIT (the going-live test,
 * Stage 3). Made-up children, parents and events only.
 *
 *   node tests/audit-everything.mjs --emulators=events --every --press-all --seed=tests/stage3/seed-audit.mjs \
 *     --states=tests/stage3/states.mjs --roles=master,kidsLead,groupLeader,sgLead,parent,youth,kids,worship,core,everyone ...
 *
 * The audit makes each person's sign-in; this gives the Stage 3 people what
 * makes them who they are, and gives every Stage 3 screen something to show,
 * so each control on it is drawn (tests/stage3/states.mjs opens them):
 *   kidsLead     an admin of the children's team; runs the holiday club
 *   groupLeader  the leader of one children's group, and of its plan group
 *   sgLead       the safeguarding lead (bookingSettings, careRouting)
 *   parent       the family's email, so their family and children are theirs
 *   youth        a young person's code: their youthAccess, in date
 * Two sites (so the site choice shows); the registration form from the
 * real template, one answer waiting to be added and one request not back;
 * two children, one checked in today; a planned session with a part, a
 * step and a quiz; a paired ChurchShow computer; holiday clubs with a draft,
 * a signed and an approved event risk assessment, and safeguarding
 * assessments not started, in draft and signed; a concern and an incident;
 * a standing risk on the Sunday group's activity.
 */
import fs from 'node:fs';
import vm from 'node:vm';
/* The forms script is a page script (v2's .js files load as modules): run it with a window of its own. */
const W = {};
vm.runInNewContext(fs.readFileSync(new URL('../../egbc-events-forms.js', import.meta.url), 'utf8'), { window: W });
const F = W.EGBCForms;

/**
 * Seeds the Stage 3 records.
 * @param {{ put: Function, roles: object, dayIso: Function }} o the audit's own writer, its people and its dates
 */
export default async function seedStage3({ put, roles, dayIso }) {
  const SITE = 'site_s3', SITE2 = 'site_s3b', mid = (k) => roles[k].member, uid = (k) => roles[k].uid || '';
  const now = new Date(), iso = now.toISOString(), today = dayIso(0);
  await put('churchSettings/details', { name: "St Aidan's with St Hild, Testbury (synthetic)", shortName: "St Aidan's (synthetic)", enquiryEmail: 'office@example.invalid', serviceDay: 'Sunday', mainSiteId: SITE });
  /* the hub is "live" here, so the quiz on phones and the rest that waits for it are drawn */
  await put('churchSettings/launch', { rulesLocked: true });
  await put('sites/' + SITE, { name: 'St Hild (synthetic)', address: 'Invented Street, Testbury', active: true, order: 1 });
  await put('sites/' + SITE2, { name: 'St Aidan (synthetic)', address: 'Made-up Lane, Testbury', active: true, order: 2 });
  await put('rooms/room_s3', { siteId: SITE, name: 'Hild Room (synthetic)', kind: 'room', active: true, order: 1, capacity: 30 });
  for (const s of [SITE, SITE2]) await put('bookingSettings/' + s, { bookingsAdmins: [], safeguardingLead: mid('sgLead'), safeguardingDeputy: '' });
  await put('careRouting/status', { leadSet: true, leadIds: [mid('sgLead')] });
  await put('safeguardingSettings/defaults', { leadSiteId: SITE, trusteeTeam: 'Elders' });
  /* the registration form, from the real template, as kids-admin makes it */
  const t = F.fromTemplate('parent', null), formId = 'form_kids_' + SITE;
  await put('forms/' + formId, { title: 'Children\'s registration', purpose: t.purpose, siteId: SITE, team: 'Kids Church', validity: t.validity, retentionMonths: t.retentionMonths,
    fields: t.fields, template: 'parent', kind: t.kind || 'consent', version: 1, updatedAt: iso, updatedBy: uid('master') });
  await put('kidsSettings/' + SITE, { teams: ['Kids Church'], formId, formTitle: 'Children\'s registration', screenPaging: true });
  await put('kidsSettings/' + SITE2, { teams: ['Kids Church'] });
  await put('kidsGroups/g_s3', { siteId: SITE, name: 'Little ones (synthetic)', leaderIds: [mid('groupLeader')], years: ['Reception', 'Year 1'], day: 0, start: '10:30', end: '12:00', ratio: 4, order: 1, roomId: 'room_s3', active: true });
  await put('kidsFamilies/f_s3', { siteId: SITE, parentName: roles.parent.name, email: roles.parent.email, phone: '07700 900123', familyCode: 'SYN234', collectors: [roles.parent.name] });
  for (const [id, name, dob] of [['c_s3', 'Ada Audit Synthetic', '2020-03-01'], ['c_s3b', 'Ben Audit Synthetic', '2019-05-01']]) {
    await put('kidsChildren/' + id, { siteId: SITE, familyId: 'f_s3', name, groupId: 'g_s3', status: 'registered', dob, year: 'Year 1', parentName: roles.parent.name, phone: '07700 900123',
      flags: { allergies: true, medical: false }, photo: true, film: true, consentUntil: dayIso(300), responseId: 'resp_s3' });
    await put('kidsMedical/' + id, { siteId: SITE, groupId: 'g_s3', familyId: 'f_s3', allergies: 'Peanuts (synthetic)' });
  }
  /* Ada is in today */
  const ck = 'kid_c_s3_' + today;
  const kid = { calEventId: 'kids_g_s3_' + today, signupKey: 'c_s3', attendeeIndex: 0, name: 'Ada Audit Synthetic', kind: 'child', state: 'in', inAt: iso, inBy: uid('kidsLead'),
    roomId: 'room_s3', day: today, groupId: 'g_s3', siteId: SITE, familyId: 'f_s3', childId: 'c_s3', screenNo: '214' };
  await put('checkins/' + ck, kid);
  await put('kidsRoll/' + ck, Object.assign({ updatedAt: iso }, kid));
  /* an answer waiting to be added to the register, and a request not back */
  await put('formResponses/resp_s3new', { formId, formVersion: 1, siteId: SITE, requestKey: 'req_s3new_000000000000', calEventId: '', email: 'dee.new@example.invalid', name: 'Dee New (synthetic)',
    submittedAt: iso, validUntil: dayIso(365), deleteAfter: dayIso(800), hasSensitive: false,
    answers: { children: [{ name: 'Cal New Synthetic', dob: '2019-09-01', photo: 'Yes', film: 'Yes', firstaid: 'Yes' }], parentName: 'Dee New (synthetic)', parentPhone: '07700 900456',
      emergency: 'Eve New 07700 900457', collectors: 'Dee New (synthetic)', sign: { name: 'Dee New (synthetic)', agreed: true, at: iso } } });
  await put('formRequests/req_s3new_000000000000', { formId, siteId: SITE, status: 'done', responseId: 'resp_s3new', name: 'Dee New (synthetic)', email: 'dee.new@example.invalid', sentAt: iso, completedAt: iso, calEventId: '' });
  await put('formRequests/req_s3wait_00000000000', { formId, siteId: SITE, status: 'open', name: 'Cara Waiting (synthetic)', email: 'cara.wait@example.invalid', sentAt: iso, calEventId: '', reminders: [] });
  /* the session planner: a part with a step, and a quiz */
  await put('planGroups/pg_s3', { name: 'Little ones (synthetic)', kind: 'children', day: 0, time: '10:30', siteId: SITE, leaderIds: [mid('groupLeader'), mid('kidsLead')], teamName: 'Kids Church', order: 1, archived: false });
  const QS = [{ q: 'How many of each animal went in? (synthetic)', answers: ['Two', 'One', 'Three', 'Four'], right: 0, seconds: 20 },
    { q: 'What did Noah build? (synthetic)', answers: ['An ark', 'A tower', 'A wall', 'A road'], right: 0, seconds: 20 }];
  await put('planSessions/ps_s3', { groupId: 'pg_s3', date: dayIso(5), title: 'Noah and the ark (synthetic)', updatedBy: uid('groupLeader'),
    parts: [{ id: 'p1', title: 'Welcome (synthetic)', kind: 'Welcome', show: [{ id: 's1', type: 'text', words: 'Welcome, everyone (synthetic)' },
      { id: 's2', type: 'quiz', name: 'Noah quiz (synthetic)', questions: QS, title: '2 questions' }] }] });
  /* a paired ChurchShow computer in St Hild */
  await put('devices/churchshow-dev_s3', { kind: 'churchshow', siteId: SITE, name: 'Hall PC (synthetic)', active: true, pairedAt: iso, pairedBy: uid('master'), jobs: { services: true, lessonGroups: ['Kids Church'] } });
  /* holiday clubs: one to start, one signed, one approved (event risk assessments), and the health and safety lead */
  const at = Date.now() + 10 * 86400000;
  const EV = (title, extra) => Object.assign({ title, description: 'Synthetic.', category: 'children', visibility: 'members', status: 'confirmed', audience: ['members'],
    startLocal: new Date(at).toISOString().slice(0, 16), endLocal: new Date(at + 3 * 3600000).toISOString().slice(0, 16), startUtc: at, endUtc: at + 3 * 3600000, allDay: false,
    location: { kind: 'room', siteId: SITE, roomIds: ['room_s3'] }, under18: true, signupOn: false, createdBy: uid('kidsLead'),
    teamMemberIds: [mid('kidsLead')], teamUids: [uid('kidsLead')] }, extra || {});
  for (const id of ['ev_s3', 'ev_s3b', 'ev_s3c', 'ev_s3d', 'ev_s3e']) await put('calEvents/' + id, EV('Holiday club ' + id.slice(-1) + ' (synthetic)', { sgKind: 'daytrip' }));
  await put('raSiteRoles/' + SITE, { hsLead: mid('master'), hsDeputy: '' });
  await put('raEvents/ev_s3b', { status: 'signed', version: 1, flags: {}, answers: {}, risks: [], signedBy: uid('kidsLead'), signedByName: 'Kids lead (synthetic)', signedAt: iso, updatedAt: iso });
  await put('raEvents/ev_s3c', { status: 'approved', version: 1, flags: {}, answers: {}, risks: [], signedBy: uid('kidsLead'), signedAt: iso, approvedBy: uid('master'), approvedAt: iso, updatedAt: iso });
  /* its leaders, and safeguarding assessments: ev_s3 none yet, ev_s3d in draft, ev_s3e signed */
  for (const id of ['ev_s3', 'ev_s3d', 'ev_s3e']) await put('eventLeaders/' + id, { siteId: SITE, leaderIds: [mid('kidsLead')], leaderUids: [uid('kidsLead')], leaders: ['Kids lead (synthetic)'],
    leaderInfo: { [mid('kidsLead')]: { name: 'Kids lead (synthetic)', role: 'Leader', uid: uid('kidsLead') } } });
  await put('sgAssessments/ev_s3d', { calEventId: 'ev_s3d', siteId: SITE, status: 'draft', version: 1, templateId: 'daytrip', answers: {}, risks: [], flags: {}, updatedAt: iso });
  await put('sgAssessments/ev_s3e', { calEventId: 'ev_s3e', siteId: SITE, status: 'signed', version: 1, templateId: 'daytrip', answers: {}, risks: [], flags: {},
    signedBy: uid('sgLead'), signedByName: 'Safeguarding lead (synthetic)', signedByRole: 'Safeguarding lead', signedAt: iso, updatedAt: iso });
  /* a concern and an incident at the holiday club (general words only) */
  await put('concerns/cn_s3', { calEventId: 'ev_s3', siteId: SITE, words: 'A worry raised at drop-off (synthetic)', by: uid('kidsLead'), byName: 'Kids lead (synthetic)', at: iso, status: 'new' });
  await put('incidents/in_s3', { calEventId: 'ev_s3', siteId: SITE, when: iso, who: 'A child (synthetic)', what: 'A grazed knee (synthetic)', firstAid: true, reportedBy: uid('kidsLead'), at: iso });
  /* the Sunday group as an activity in the register, with one standing risk, in the shapes the page writes */
  await put('sgActivities/a_s3', { siteId: SITE, kind: 'sunday', name: 'Little ones (synthetic)', link: { type: 'kidsGroup', id: 'g_s3' }, active: true });
  await put('sgRisks/r_s3', { siteId: SITE, activityId: 'a_s3', risk: 'Collection at the end (synthetic)', who: 'Children', l: 3, i: 4, rl: 2, ri: 3, controls: ['Collector list checked'],
    ownerName: 'Kids Church lead (synthetic)', reviewDue: dayIso(60), status: 'open', todo: [] });
  /* the young person's code: in date, theirs alone */
  if (roles.youth && roles.youth.uid) await put('youthAccess/' + roles.youth.uid, { active: true, expiresAt: new Date(Date.now() + 30 * 86400000), memberName: 'Yan Youth Synthetic', memberId: 'ab_audit_youth', redeemedAt: now });
}
