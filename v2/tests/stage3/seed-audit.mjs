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
  /* its ChurchShow computer is connected, so a parent can be called to the screen */
  await put('sites/' + SITE, { name: 'St Hild (synthetic)', address: 'Invented Street, Testbury', active: true, order: 1, churchShowConnected: true });
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
  /* a second group, so the check-in's group picker is drawn */
  await put('kidsGroups/g_s3b', { siteId: SITE, name: 'Big ones (synthetic)', leaderIds: [mid('kidsLead')], years: ['Year 5', 'Year 6'], day: 0, start: '10:30', end: '12:00', ratio: 8, order: 2, roomId: 'room_s3', active: true });
  /* a family here for the first time this week: to welcome, its form not back and its consent missing (the renewal QR code) */
  await put('kidsFamilies/f_s3v', { siteId: SITE, parentName: 'Vera Visitor (synthetic)', email: 'vera.visitor@example.invalid', phone: '07700 900789', familyCode: 'SYN567', collectors: ['Vera Visitor (synthetic)'], visitor: true, firstVisit: today });
  await put('kidsChildren/c_s3v', { siteId: SITE, familyId: 'f_s3v', name: 'Vic Visitor Synthetic', groupId: 'g_s3', status: 'visitor', dob: '2020-06-01', year: 'Reception', parentName: 'Vera Visitor (synthetic)', phone: '07700 900789',
    flags: {}, photo: false, film: false, consentUntil: dayIso(-1) });
  /* Ada is in today */
  /* the id the page looks it up by (egbc-events-kids.js checkinIdFor) */
  const ck = 'kids_g_s3_' + today + '__c_s3__0';
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
    parts: [{ id: 'p1', title: 'Welcome (synthetic)', kind: 'Welcome', files: [{ name: 'Ark song (synthetic).mp4', type: 'video/mp4', url: 'about:blank', path: '' }, { name: 'Ark (synthetic).png', type: 'image/png', url: 'about:blank', path: '' }],
      show: [{ id: 's1', type: 'text', words: 'Welcome, everyone (synthetic)' },
      { id: 's2', type: 'quiz', name: 'Noah quiz (synthetic)', questions: QS, title: '2 questions' }] }] });
  /* a sermon plan group, so the planner's sermon fields (the series) are drawn */
  await put('planGroups/pg_s3s', { name: 'Sunday sermons (synthetic)', kind: 'sermon', day: 0, time: '10:30', siteId: SITE, leaderIds: [mid('kidsLead')], order: 2, archived: false });
  await put('planSessions/ps_s3s', { groupId: 'pg_s3s', date: dayIso(5), title: 'Faith (synthetic)', series: 'Hebrews (synthetic)', updatedBy: uid('kidsLead'), parts: [] });
  /* a paired ChurchShow computer in St Hild */
  await put('devices/churchshow-dev_s3', { kind: 'churchshow', siteId: SITE, name: 'Hall PC (synthetic)', active: true, pairedAt: iso, pairedBy: uid('master'), jobs: { services: true, lessonGroups: ['pg_s3'] } });  /* a plan group's id, as the job form saves it */
  /* holiday clubs: one to start, one signed, one approved (event risk assessments), and the health and safety lead */
  const at = Date.now() + 10 * 86400000;
  const EV = (title, extra) => Object.assign({ title, description: 'Synthetic.', category: 'children', visibility: 'members', status: 'confirmed', audience: ['members'],
    startLocal: new Date(at).toISOString().slice(0, 16), endLocal: new Date(at + 3 * 3600000).toISOString().slice(0, 16), startUtc: at, endUtc: at + 3 * 3600000, allDay: false,
    location: { kind: 'room', siteId: SITE, roomIds: ['room_s3'] }, under18: true, signupOn: false, createdBy: uid('kidsLead'),
    teamMemberIds: [mid('kidsLead')], teamUids: [uid('kidsLead')] }, extra || {});
  /* a holiday club is a kind the safeguarding lead signs off (egbc-sg-templates.js SG_KINDS; 'daytrip' is
     not one, so no assessment was drawn); ev_s3f is a trip, away from the church, so event-ra asks about the venue */
  for (const id of ['ev_s3', 'ev_s3b', 'ev_s3c', 'ev_s3d', 'ev_s3e']) await put('calEvents/' + id, EV('Holiday club ' + id.slice(-1) + ' (synthetic)', { sgKind: 'holidayclub' }));
  await put('calEvents/ev_s3f', EV('Trip to the farm (synthetic)', { sgKind: 'trip' }));
  await put('raSiteRoles/' + SITE, { hsLead: mid('master'), hsDeputy: '' });
  /* in the shape event-ra.html writes (its blank()): ev_s3 a draft the AI has made a suggestion for ("Use it"),
     ev_s3b signed by the organiser, ev_s3c approved */
  const RA = (id, extra) => Object.assign({ calEventId: id, siteId: SITE, approverSiteId: SITE, title: 'Holiday club (synthetic)', kind: 'general', flags: {}, care: { support: '' },
    people: 0, marked: false, venue: { name: '' }, sections: {}, hazards: [], actions: [], answers: {}, version: 1, status: 'draft', updatedAt: iso }, extra);
  await put('raEvents/ev_s3', RA('ev_s3', { suggested: { weather: 'Indoors if it rains (synthetic)' } }));
  await put('raEvents/ev_s3b', RA('ev_s3b', { status: 'signed', signedVersion: 1, signedBy: uid('kidsLead'), signedByName: 'Kids lead (synthetic)', signedAt: iso }));
  await put('raEvents/ev_s3c', RA('ev_s3c', { status: 'approved', signedVersion: 1, signedBy: uid('kidsLead'), signedByName: 'Kids lead (synthetic)', signedAt: iso, approvedBy: uid('master'), approvedByName: 'Master (synthetic)', approvedAt: iso }));
  /* its leaders, and safeguarding assessments: ev_s3 none yet, ev_s3d in draft, ev_s3e signed */
  /* in the shape the page writes (egbc-events-safeguarding.js whoIs): leaders as records, under-18s going */
  for (const id of ['ev_s3', 'ev_s3d', 'ev_s3e']) await put('eventLeaders/' + id, { siteId: SITE, under18: true, leaderIds: [mid('kidsLead')], leaderUids: [uid('kidsLead')],
    leaders: [{ name: 'Kids lead (synthetic)', role: 'leader' }],
    leaderInfo: { [mid('kidsLead')]: { name: 'Kids lead (synthetic)', role: 'leader', uid: uid('kidsLead') } } });
  /* the rota on the holiday club's day, so "From the rota" has someone to offer */
  await put('events/rota_s3', { date: new Date(at).toISOString().slice(0, 10), assignments: { 'Kids leader': [{ id: mid('groupLeader'), name: 'Group leader (synthetic)' }] } });
  /* the draft has a risk still high after its controls (the lead says why it can go ahead), and a host's list read
     but not yet checked, with more of its pages to read (the host's controls) */
  await put('sgAssessments/ev_s3d', { calEventId: 'ev_s3d', siteId: SITE, status: 'draft', version: 1, templateId: 'holidayclub', answers: {}, flags: {}, updatedAt: iso,
    risks: [{ id: 'rk_s3', risk: 'Deep water nearby (synthetic)', who: 'Children', l: 5, i: 5, rl: 4, ri: 5, controls: [], todo: [] }],
    host: { name: 'Hilltop Farm (synthetic)', confirmed: false, file: { name: 'requirements (synthetic).pdf', path: '' }, items: [{ id: 'h1', q: 'Is every adult briefed on the farm rules? (synthetic)' }],
      web: { starts: ['https://farm.example.invalid/help'], pages: [{ url: 'https://farm.example.invalid/help/a', title: 'Rules (synthetic)' }], next: ['https://farm.example.invalid/help/b'] } } });
  await put('sgAssessments/ev_s3e', { calEventId: 'ev_s3e', siteId: SITE, status: 'signed', version: 1, templateId: 'holidayclub', answers: {}, risks: [], flags: {},
    signedBy: uid('sgLead'), signedByName: 'Safeguarding lead (synthetic)', signedByRole: 'Safeguarding lead', signedAt: iso, updatedAt: iso });
  /* a concern and an incident at the holiday club (general words only) */
  await put('concerns/cn_s3', { calEventId: 'ev_s3', siteId: SITE, words: 'A worry raised at drop-off (synthetic)', by: uid('kidsLead'), byName: 'Kids lead (synthetic)', at: iso, status: 'new' });
  await put('incidents/in_s3', { calEventId: 'ev_s3', siteId: SITE, when: iso, who: 'A child (synthetic)', what: 'A grazed knee (synthetic)', firstAid: true, reportedBy: uid('kidsLead'), at: iso, createdAt: iso });
  /* each holiday club's booking gate (the function writes it as the assessment changes): the register's
     Event assessments tab lists the events that have one */
  for (const id of ['ev_s3', 'ev_s3d', 'ev_s3e']) await put('sgGate/' + id, { siteId: SITE, open: id === 'ev_s3e', updatedAt: iso });
  /* the Sunday group as an activity in the register, with one standing risk, in the shapes the page writes */
  await put('sgActivities/a_s3', { siteId: SITE, kind: 'sunday', name: 'Little ones (synthetic)', link: { type: 'kidsGroup', id: 'g_s3' }, active: true });
  await put('sgRisks/r_s3', { siteId: SITE, activityId: 'a_s3', risk: 'Collection at the end (synthetic)', who: 'Children', l: 3, i: 4, rl: 2, ri: 3, controls: ['Collector list checked'],
    ownerName: 'Kids Church lead (synthetic)', reviewDue: dayIso(60), status: 'open', todo: [] });
  /* a snapshot of the register already taken, to open and print */
  await put('sgSnapshots/snap_s3', { siteId: SITE, banner: 'Safeguarding risk register: St Hild (synthetic)', by: uid('sgLead'), byName: 'Safeguarding lead (synthetic)', at: now, note: 'Synthetic', risks: [] });
  /* Present: nobody presenting the plan (one person's run must not leave it presenting for the next), and a
     second plan someone else is presenting, so following, browsing and taking over are drawn */
  await put('presentNow/ps_ps_s3', { context: { type: 'session', groupId: 'pg_s3', sessionId: 'ps_s3' }, slide: 0, presenterUid: '', presenterName: '', blank: false, quiz: null });
  await put('planSessions/ps_s3b', { groupId: 'pg_s3', date: dayIso(12), title: 'Jonah (synthetic)', updatedBy: uid('groupLeader'),
    parts: [{ id: 'p1', title: 'Welcome (synthetic)', kind: 'Welcome', show: [{ id: 's1', type: 'text', words: 'One (synthetic)' }, { id: 's2', type: 'text', words: 'Two (synthetic)' }] }] });
  await put('presentNow/ps_ps_s3b', { context: { type: 'session', groupId: 'pg_s3', sessionId: 'ps_s3b' }, slide: 0, presenterUid: 'uid_someone_s3', presenterName: 'Someone else (synthetic)', blank: false });
  /* a youth service on the rota (6 Dec 2026), so the Youth Hub's plan can be emailed to its team */
  await put('events/rota_y3', { date: '2026-12-06', type: 'Youth service', description: 'Youth service (synthetic)', assignments: { 'Worship leader': [{ id: mid('master'), name: 'Master (synthetic)' }] } });
  /* the Youth Hub: an idea on the youth board, and a play-through card in its library */
  await put('worshipBoardState/youth', { pages: [{ id: 'main', title: 'General Board' }], notes: [{ id: 'n_s3', pageId: 'main', cat: 'idea', title: 'A games night (synthetic)', body: 'Synthetic.', createdAt: Date.now(), author: 'Yan (synthetic)', reactions: {} }] });
  await put('kb_playthrough/kb_s3', { published: true, createdAt: now, title: 'Here I am to worship (synthetic)', bullets: 'Count in\nPlay it through', description: 'Synthetic.' });
  /* the young person's code: in date, theirs alone */
  /* in the youth group whose board is 'youth' (teamFlags/boards), so the board is theirs to read and suggest to */
  await put('teamFlags/boards', { boards: { youth: 'Youth Worship' } });
  if (roles.youth && roles.youth.uid) await put('youthAccess/' + roles.youth.uid, { active: true, expiresAt: new Date(Date.now() + 30 * 86400000), memberName: 'Yan Youth Synthetic', memberId: 'ab_audit_youth', redeemedAt: now, groups: ['Youth Worship'] });
}
