/* THE KIDS CHURCH SUNDAY'S RECORDS, FOR THE AUDIT (the going-live test,
 * Stage 3). Made-up children, parents and events only.
 *
 *   node tests/audit-everything.mjs --emulators=events --every --seed=tests/stage3/seed-audit.mjs \
 *     --roles=master,kidsLead,groupLeader,sgLead,parent,kids,worship,core,everyone ...
 *
 * The audit makes each person's sign-in; this gives the Stage 3 people what
 * makes them who they are, and gives every Stage 3 page something to show:
 *   kidsLead     an admin of the site's children's team (kidsSettings)
 *   groupLeader  the leader of one children's group, and of its plan group
 *   sgLead       the site's safeguarding lead (bookingSettings, careRouting)
 *   parent       the family's email, so their family and child are theirs
 * plus one child, an under-18s event with a draft safeguarding assessment,
 * a standing risk, and a planned session.
 */

/**
 * Seeds the Stage 3 records.
 * @param {{ put: Function, roles: object, dayIso: Function }} o the audit's own writer, its people and its dates
 */
export default async function seedStage3({ put, roles, dayIso }) {
  const SITE = 'site_s3', mid = (k) => roles[k].member;
  await put('churchSettings/details', { name: "St Aidan's with St Hild, Testbury (synthetic)", shortName: "St Aidan's (synthetic)", enquiryEmail: 'office@example.invalid' });
  await put('sites/' + SITE, { name: 'St Hild (synthetic)', address: 'Invented Street, Testbury', active: true, order: 1 });
  await put('rooms/room_s3', { siteId: SITE, name: 'Hild Room (synthetic)', kind: 'room', active: true, order: 1, capacity: 30 });
  await put('bookingSettings/' + SITE, { bookingsAdmins: [], safeguardingLead: mid('sgLead'), safeguardingDeputy: '' });
  await put('careRouting/status', { leadIds: [mid('sgLead')] });
  await put('kidsSettings/' + SITE, { teams: ['Kids Church'] });
  await put('kidsGroups/g_s3', { siteId: SITE, name: 'Little ones (synthetic)', leaderIds: [mid('groupLeader')], years: ['Reception', 'Year 1'], day: 0, ratio: 4, order: 1, roomId: 'room_s3' });
  await put('kidsFamilies/f_s3', { siteId: SITE, parentName: roles.parent.name, email: roles.parent.email, phone: '07700 900123', familyCode: 'SYN234', collectors: [roles.parent.name] });
  await put('kidsChildren/c_s3', { siteId: SITE, familyId: 'f_s3', name: 'Ada Audit Synthetic', groupId: 'g_s3', status: 'registered', dob: '2020-03-01' });
  await put('kidsMedical/c_s3', { siteId: SITE, groupId: 'g_s3', familyId: 'f_s3', allergies: 'None (synthetic)' });
  await put('planGroups/pg_s3', { name: 'Little ones (synthetic)', kind: 'children', day: 0, time: '10:30', siteId: SITE, leaderIds: [mid('groupLeader'), mid('kidsLead')], teamName: 'Kids Church', order: 1, archived: false });
  await put('planSessions/ps_s3', { groupId: 'pg_s3', date: dayIso(5), title: 'Noah and the ark (synthetic)', parts: [], updatedBy: roles.groupLeader.uid || '' });
  const t = Date.now() + 10 * 86400000;
  await put('calEvents/ev_s3', { title: 'Holiday club (synthetic)', description: 'Synthetic.', category: 'children', visibility: 'members', status: 'confirmed', audience: ['members'],
    startLocal: new Date(t).toISOString().slice(0, 16), endLocal: new Date(t + 3 * 3600000).toISOString().slice(0, 16), startUtc: t, endUtc: t + 3 * 3600000, allDay: false,
    location: { kind: 'room', siteId: SITE, roomIds: ['room_s3'] }, under18: true, signupOn: false, createdBy: roles.kidsLead.uid || '',
    teamMemberIds: [mid('kidsLead')], teamUids: [roles.kidsLead.uid || ''] });
  /* the Sunday group as an activity in the register, with one standing risk, in the shapes the page writes */
  await put('sgActivities/a_s3', { siteId: SITE, kind: 'sunday', name: 'Little ones (synthetic)', link: { type: 'kidsGroup', id: 'g_s3' }, active: true });
  await put('sgRisks/r_s3', { siteId: SITE, activityId: 'a_s3', risk: 'Collection at the end (synthetic)', who: 'Children', l: 3, i: 4, rl: 2, ri: 3, controls: ['Collector list checked'], ownerName: 'Kids Church lead (synthetic)', reviewDue: dayIso(60), status: 'open', todo: [] });
}
