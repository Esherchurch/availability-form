/* THE FIRST-STAGE PAGES' RECORDS, FOR THE AUDIT (the going-live test,
 * 4 Nov 2026). Made-up records only, on the spare emulators.
 *
 *   node tests/audit-everything.mjs --emulators=spare --every --sizes=375,1440 --no-app \
 *     --seed=tests/stage2/seed-first.mjs --states=tests/stage2/states-first.mjs --pages=...
 *
 * The audit's own seed makes each person and one Sunday. This gives every
 * screen in tests/stage2/states-first.mjs something to show, so each
 * control on it is drawn: one published item in each of the four
 * knowledge bases (a category, a transcript with times, a summary). The
 * training portal needs none: with nothing saved it draws its default menu.
 */

/** One knowledge-base item, in the shape the four KB pages read (cardHTML, editItem). */
const kbItem = (dayIso, extra) => Object.assign({
  title: 'Audit How-to Synthetic', category: 'Audit Category', published: true, createdAt: new Date(dayIso(-1) + 'T10:00:00Z'),
  assetType: 'video', contentURL: 'https://example.invalid/audit.mp4', directURL: 'https://example.invalid/audit.mp4',
  tags: 'audit', description: 'A synthetic item for the audit.', bullets: ['First synthetic point', 'Second synthetic point'].join(String.fromCharCode(10)),
  transcript: '[00:00] Synthetic opening.\n[00:05] Synthetic next part.', timestampStart: 0
}, extra || {});

/**
 * @param {{ put: Function, dayIso: Function }} api the audit's writer (owner access) and its date helper
 */
export default async function ({ put, dayIso }) {
  await put('kb_howto_av/audit_kb1', kbItem(dayIso));
  await put('kb_troubleshoot_av/audit_kb1', kbItem(dayIso));
  await put('kb_training_worship/audit_kb1', kbItem(dayIso));
  await put('kb_playthrough/audit_kb1', kbItem(dayIso, { songTitle: 'Audit Song Synthetic', ourKey: 'G', songSection: 'Verse', instrument: 'Keys' }));

  /* The hub: a pinned notice everyone must confirm (the notice reader, I've
     read it, Delete), a long charter (Read it all), someone signed in with
     an address the address book does not hold (Who is this?, Link), a youth
     code sent and not used (Revoke, Resend), and a page on its Menu (Edit). */
  await put('news/audit_notice', { title: 'Audit Notice Synthetic', body: '<p>A synthetic notice for the audit.</p>', teams: [], pinned: true, requireAck: true,
    createdAt: new Date(dayIso(-1) + 'T09:00:00Z'), author: 'Audit Synthetic', ackedBy: [] });
  const long = '<h2>Audit charter</h2>' + Array.from({ length: 12 }, (_, i) => '<p>Synthetic charter paragraph ' + (i + 1) + ', long enough to need Read it all.</p>').join('');
  await put('pageContent/wider-worship-charter', { title: 'Audit Worship Charter Synthetic', html: long });
  await put('pageContent/core-team-charter', { title: 'Audit Core Charter Synthetic', html: long });
  await put('users/audit_unlinked', { uid: 'audit_unlinked', email: 'audit.unlinked@example.invalid', name: 'Audit Unlinked Synthetic', status: 'pending', teams: [] });
  await put('youthGrants/AUDIT1', { memberId: 'ab_audit_youth', memberName: 'Audit Youth Synthetic', sentTo: 'audit.youth@example.invalid', issuedAt: new Date(dayIso(-2) + 'T09:00:00Z'), active: true });
  await put('hubPages/audit_page', { title: 'Audit Page Synthetic', url: 'Library.html', icon: '\u{1F4C4}', teams: ['Worship Team'], order: 99, enabled: true });

  /* The song library (a song to open and edit), the team videos (one in a
     section, with a transcript to seek in) and the AV schematic (two places,
     a signal and a hop between them, so each list has its Edit and Delete). */
  await put('songs/audit_song', { title: 'Audit Song Synthetic', artist: 'Audit Artist Synthetic', key: 'G', lyrics: 'Synthetic lyrics line one\nSynthetic line two', files: [], youtube: '', ccli: '' });
  await put('teamVideos/audit_video', { team: 'Worship Team', title: 'Audit Video Synthetic', category: 'Audit Section', published: true, createdAt: new Date(dayIso(-1) + 'T09:00:00Z'),
    url: 'https://example.invalid/audit.mp4', transcript: '[00:00] Synthetic start.\n[00:04] Synthetic part two.' });
  await put('videoSections/worship-team', { team: 'Worship Team', names: ['Audit Section'] });
  await put('av_schematic/locations', { list: ['Audit Stage', 'Audit Desk'] });
  await put('av_schematic/signals', { list: [{ label: 'Audit Vocal 1', desk: 'FOH', paths: ['Audit Stage 1'], stereo: false, stereoPartner: null, direction: 'to-desk' }] });
  await put('av_schematic/hops', { list: [{ aLoc: 'Audit Stage', aCh: '1', bLoc: 'Audit Desk', bCh: '1', direction: 'a-to-b', id: 'audit1' }] });

  /* The Core app's service plan for the audit's Sunday: a song and a
     reading in its order, so its rows, the song editor and Email Team draw. */
  await put('services/audit_service', { date: dayIso(9), type: 'Sunday Morning Worship', eventId: 'audit_sunday', worshipLeader: 'Audit Worship member Synthetic', archived: false,
    order: [{ type: 'song', title: 'Audit Song Synthetic', key: 'G', notes: '' }, { type: 'reading', title: 'Audit Reading Synthetic', notes: '' }] });

  /* The rota planners: a Sunday in a term already archived, so Archived
     Terms and its Restore draw. */
  /* The email builders: a saved draft (Load, Delete, Overwrite). */
  await put('emailDrafts/audit_draft', { name: 'Audit Draft Synthetic', template: false, subject: 'Audit Subject Synthetic', html: '<p>Synthetic draft.</p>',
    createdBy: 'Audit', updatedBy: 'Audit', createdAt: new Date(dayIso(-1) + 'T09:00:00Z'), updatedAt: new Date(dayIso(-1) + 'T09:00:00Z') });
  await put('events/audit_archived', { date: dayIso(30), type: 'Sunday Morning Worship', termLabel: 'Audit Archived', teams: ['Worship Team', 'AV Team'], roles: ['Vocals'], archived: true, draft: false, assignments: {} });
}
