/* Turning the rota into one person's calendar.
 *
 * Kept apart from index.js so it can be read and tested on its own: everything
 * here is a plain function of its arguments, with no Firestore and no network.
 *
 * THE RULE ABOUT WHO IS IN AN EVENT IS NOT INVENTED HERE. It is the one the
 * rota emails and today's .ics attachments already use - Planner.html's
 * isInvitedTo, line 62. If that rule ever changes, this has to change with it,
 * or a person's calendar and their rota email will disagree and nobody will
 * know which is right.
 */

/* An assignment is sometimes one person and sometimes a list of them:
   Planner.html writes `{id,name}` for a single role and `[{id,name},…]` for a
   shared one. Reading only the first shape silently loses everybody in a
   shared role, which is the sort of thing nobody notices until a Sunday. */
export const peopleIn = (raw) => (Array.isArray(raw) ? raw : [raw]).filter(Boolean);

export const isMeeting = (ev) => /Meeting/.test(ev.type || '');

/* "Youth" on an event means "Youth Worship" on a person - the two lists were
   never renamed to match. Same allowance as Planner.html. */
export function inEventTeams(member, ev) {
  if (!member) return false;
  const markers = member.markers || [];
  const teams = ev.teams || [];
  return teams.some(t => markers.includes(t)) ||
         (teams.includes('Youth') && markers.includes('Youth Worship'));
}

export function isInvitedTo(ev, memberId, member) {
  const assigned = Object.values(ev.assignments || {})
    .some(raw => peopleIn(raw).some(a => a && a.id === memberId));
  return assigned || (isMeeting(ev) && inEventTeams(member, ev));
}

/* Their own roles, in the order the event lists them, so a person reading
   "Guitar, Sound" sees it the same way twice running. */
export function rolesFor(ev, memberId) {
  const order = ev.roles || Object.keys(ev.assignments || {});
  const mine = Object.entries(ev.assignments || {})
    .filter(([, raw]) => peopleIn(raw).some(p => p && p.id === memberId))
    .map(([role]) => role);
  mine.sort((a, b) => {
    const ia = order.indexOf(a), ib = order.indexOf(b);
    return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
  });
  return mine;
}

/* ============ WHO AND WHAT, FOR THE OTHER TWO FEEDS (NEXT-BRIEF 18) =====

   Martin: "we need to let them choose. for example we need a feed for the
   whole family, or for the full rota if they prefer. Karen as an example
   needs to know if Oliver is on."

   Three feeds, each with its own link: just me, my household, the full rota.
   What follows is the household rule and the visibility rule, and NEITHER IS
   INVENTED HERE. Both are copies of a rule that already runs in the browser,
   and a copy is a thing that can drift, so each says where the original is
   and there is a check that makes them answer the same question.         */

/* EVERYONE IN THIS PERSON'S HOUSEHOLD.

   The original is EGBCRotaPdf.householdIds in egbc-rota-pdf.js, which the
   household PDF uses - 18 says to use the same one, so that a person's
   calendar and their printed rota never disagree about who is in the house.

   The address book records a household two ways. Some point at a head: both
   of the Prosser young people point at Martin, and Martin points at nobody.
   Others point at each other. Following one link from the person - find the
   head, then everyone under the head - handles the first and loses people in
   the second. So follow every link, both directions, until nothing new turns
   up: a household is the group joined by those pointers. */
export function householdIds(addressBook, memberId) {
  const seen = { [memberId]: true };
  const queue = [memberId];
  while (queue.length) {
    const id = queue.shift();
    const person = (addressBook || []).find(m => m.id === id);
    if (person && person.householdId && !seen[person.householdId]) {
      seen[person.householdId] = true;
      queue.push(person.householdId);
    }
    (addressBook || []).forEach(m => {
      if (m.householdId === id && !seen[m.id]) { seen[m.id] = true; queue.push(m.id); }
    });
  }
  /* Only ids that are really in the book - a pointer can outlive a record. */
  return (addressBook || []).filter(m => seen[m.id]).map(m => m.id);
}

/* WHICH TEAM A ROLE BELONGS TO, and WHICH TEAMS A PERSON MAY SEE.

   The originals are roleTeam() and visibleRoleTeams() in egbc-auth.js, which
   is what view-only-rota.html filters its table with. 18 is explicit: the
   full-rota feed "may only include the teams that person is allowed to see on
   the read-only rota", so a feed can never show more than the page does.

   This runs on the server because the server is what answers a calendar app,
   and a calendar app has nobody signed in. */
/* A church keeps each team's rota places on the team (teams/{id}.places,
   [{ name, skill }], Teams & groups). With none stored, a team takes these:
   EGBC's, the same place names as TEAM_SKILLS in egbc-auth.js, which the
   server cannot read. Only the names matter here: which team a place is.
   A sub-team's places count as its parent's (Choir is part of Worship). */
const BUILT_IN_ROLES = {
  'Worship Team': ['Worship Leader', 'Keyboard', 'Guitar', 'Drums', 'Bass', 'Violin', 'Congas', '2nd Guitar', '2nd Keys',
    'Electric Guitar', 'Oboe', 'Trumpet', 'Cahon', 'Singer 1', 'Singer 2', 'Singer 3', 'Other', 'Other 2', 'Other 3'],
  'AV Team': ['Sound', 'Words', 'Cameras'],
  'Choir': ['Choir'],
  'Kids Church': ['Session Leader', 'Leader (Younger)', 'Leader (Older)', 'Leader (Creche)',
    'Assistant (Younger)', 'Assistant (Older)', 'Assistant (Creche)',
    'Helper 1', 'Helper 2', 'Helper 3', 'Helper 4', 'Helper 5']
};
const BUILT_IN_PARENT = { Choir: 'Worship Team' };
/* "Helper 7" goes with "Helper 1": numbered places are one family. */
const roleBase = (r) => String(r || '').replace(/\s+\d+$/, '');

/**
 * Which team each rota place belongs to, from the church's teams: each
 * team's stored places, else its built-in ones. The same answer as
 * EGBCAuth.roleTeamOf in egbc-auth.js.
 * @param {Array<{id: string, data: object}>} [teams] the church's teams collection
 * @param {string} [otherTeam] the team a place no team lists belongs to: the
 *   first team doing the worship job
 * @returns {{ lists: Array<[string, string[]]>, other: string }}
 */
export function roleTeams(teams = [], otherTeam = teamsFor(null, 'worship')[0] || '') {
  const byId = Object.fromEntries(teams.map((t) => [t.id, t.data || {}]));
  const ids = [...new Set(Object.keys(BUILT_IN_ROLES).concat(teams.map((t) => t.id)))];
  const lists = ids.map((id) => {
    const d = byId[id] || {};
    /* Skills and places are saved together: either stored means stored. */
    const stored = Array.isArray(d.places) || Array.isArray(d.skills);
    const roles = stored ? (Array.isArray(d.places) ? d.places : []).map((x) => (x && typeof x.name === 'string' ? x.name : '')).filter(Boolean)
      : (BUILT_IN_ROLES[id] || []);
    return [d.parent || BUILT_IN_PARENT[id] || id, roles];
  });
  return { lists, other: otherTeam };
}
const ROLE_TEAMS = roleTeams();

/**
 * The team a rota place belongs to.
 * @param {string} r the place
 * @param {{ lists: Array<[string, string[]]>, other: string }} [rt] roleTeams()' answer (none: EGBC's)
 */
export function roleTeam(r, rt = ROLE_TEAMS) {
  const hit = rt.lists.find(([, roles]) => roles.indexOf(r) !== -1)
    || rt.lists.find(([, roles]) => roles.some((x) => roleBase(x) === roleBase(r)));
  return hit ? hit[0] : rt.other;
}

/* Worship and AV serve the same service and share a charter, so somebody on
   one sees the other's slots. The youth team has no places of its own - the
   young people play drums and keys on an ordinary Sunday morning - so scoping
   them to their own team would show them an empty rota they are actually on;
   the worship core team sees the worship side too. A sub-team (a choir)
   folds into its parent. Same allowances as egbc-auth.js and
   view-only-rota.html, from the church's team jobs and teams. */
/**
 * The teams whose rota places this person may see on the full rota.
 * @param {object} user their users record (teams, adminFor, masterAdmin)
 * @param {{ jobs?: { map?: object, set?: object }, teams?: Array<{id: string, data: object}> }} [church]
 *   the church's team jobs (readTeamJobs) and teams collection; none: EGBC's defaults
 * @returns {string[]|null} team ids; null for all of them; [] for nobody
 */
export function visibleRoleTeams(user, church = {}) {
  if (!user) return [];
  if (user.masterAdmin === true) return null;          /* null means all of them */
  const jobs = church.jobs || {};
  const of = (...js) => [...new Set(js.flatMap((j) => teamsFor(jobs.map || null, j, jobs.set || {})))];
  const byId = Object.fromEntries((church.teams || []).map((t) => [t.id, t.data || {}]));
  const parentOf = (t) => (byId[t] && byId[t].parent) || BUILT_IN_PARENT[t] || '';
  /* Core teams as core-teams.js has them: what Teams & groups stored, else EGBC's. */
  const coreFor = (t) => (byId[t] && Array.isArray(byId[t].coreFor) ? byId[t].coreFor : (DEFAULT_CORES[t] || []));
  const worship = of('worship'), sides = of('worship', 'av');
  const worshipCores = [...new Set(Object.keys(DEFAULT_CORES).concat(Object.keys(byId)))]
    .filter((t) => !(byId[t] && byId[t].archived === true) && coreFor(t).some((c) => worship.includes(c)));
  const worshipSide = sides.concat(of('youth'), worshipCores);
  const out = [];
  const add = t => { if (t && out.indexOf(t) === -1) out.push(t); };
  (user.teams || []).forEach(t => add(parentOf(t) || t));
  (user.adminFor || []).forEach(add);
  if (!out.length) return null;
  if (worshipSide.some(t => out.indexOf(t) !== -1)) sides.forEach(add);
  if (worship.some(t => out.indexOf(t) !== -1)) of('choir').forEach(add);
  return out;
}

/* The team choice on a full-rota link. "Everything" still means everything
   THIS PERSON may see, not everything there is. */
/**
 * The full-rota choices, from the church's own team jobs: "worship" is the
 * teams doing the worship, AV and choir jobs, "kids" the children's job.
 * @param {{ map?: object, set?: object }} [jobs] readTeamJobs' answer (none: the job defaults)
 * @param {(team: string) => string} [labelOf] a team's label
 */
export function fullScopes(jobs = {}, labelOf = (t) => t) {
  const of = (...js) => [...new Set(js.flatMap((j) => teamsFor(jobs.map || null, j, jobs.set || {})))];
  const named = (teams) => teams.map(labelOf).join(' & ');
  const worship = of('worship', 'av', 'choir'), kids = of('children');
  return {
    worship: { label: named(of('worship', 'av')) || named(worship), teams: worship },
    kids: { label: named(kids), teams: kids },
    all: { label: 'Everything', teams: null }
  };
}
export const FULL_SCOPES = fullScopes();

/* The roles of an event this person may be shown, after both filters. */
export function rolesVisible(ev, allowedTeams, scope, scopes = FULL_SCOPES, rt = ROLE_TEAMS) {
  const wanted = (scopes[scope] || scopes.all).teams;
  return (ev.roles || Object.keys(ev.assignments || {})).filter(r => {
    const t = roleTeam(r, rt);
    if (allowedTeams && allowedTeams.indexOf(t) === -1) return false;
    if (wanted && wanted.indexOf(t) === -1) return false;
    return true;
  });
}

/* "Oliver", from "Oliver Synthetic". The summary line of a household entry
   has to fit in a phone's month view, so it carries first names; the
   description underneath carries the whole name. */
export const firstName = (n) => String(n || '').trim().split(/\s+/)[0] || '';

import { EGBC_BY_TYPE, HUB } from './video.js';
import { teamsFor } from './team-jobs.js';
import { DEFAULT_CORES } from './core-teams.js';

/* The church's short name in front of each entry, so it stands out in a
   calendar that holds other things; nothing when it is unknown. */
const tag = (church) => (church ? church + ': ' : '');

/* The meeting's page on the hub, not a Daily address (21 Oct 2026: every
   church's rooms are Church HQ's now, made per church, and the hub page is
   where the host gets their key). videoRoom absent means "use the default
   for this kind of event"; videoRoom set to '' means "no call", which is not
   the same thing and must not be collapsed into it. The defaults are the
   one list in video.js. */
export function videoLinkFor(ev, byType = EGBC_BY_TYPE) {
  const room = ev.videoRoom !== undefined ? ev.videoRoom : (byType[ev.type] || '');
  return room ? HUB + '/meeting.html?room=' + encodeURIComponent(room) + (ev.id ? '&event=' + encodeURIComponent(ev.id) : '') : '';
}

/* ------------------------------------------------------------ the calendar */

const CRLF = '\r\n';

const stamp = (dateStr, timeStr) => {
  const [y, m, d] = String(dateStr).split('-');
  if (timeStr) {
    const [h, min] = String(timeStr).split(':');
    return `${y}${m}${d}T${h}${min}00`;
  }
  return `${y}${m}${d}`;
};

/* RFC 5545: a backslash, semicolon or comma in a value has to be escaped, and
   a newline becomes \n. Miss this and a song title with a comma in it ends the
   line early and the entry after it disappears. */
const esc = (s) => String(s || '').replace(/[\\;,]/g, c => '\\' + c).replace(/\r?\n/g, '\\n');

/* RFC 5545: no line over 75 octets. Long video links break Outlook otherwise.
   Folded with a leading space, which is what the standard asks for. */
const fold = (line) => line.length <= 75 ? line : line.match(/.{1,74}/gu).join(CRLF + ' ');

/* The day after, for an all-day entry: DTEND is exclusive, so an event on the
   11th ends on the 12th. Getting this wrong makes every all-day entry a
   zero-length one, which some calendars simply do not draw. */
function dayAfter(dateStr) {
  const [y, m, d] = String(dateStr).split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + 1));
  return [dt.getUTCFullYear(),
          String(dt.getUTCMonth() + 1).padStart(2, '0'),
          String(dt.getUTCDate()).padStart(2, '0')].join('');
}

/* One person's calendar.
 *
 *   events   every event, as stored
 *   memberId the address book id of the person this feed belongs to
 *   member   their address book record, for the meetings rule
 *   now      passed in rather than read, so a test gets the same bytes twice
 */
/* The same opening lines for all three feeds, so they cannot drift apart.
   The name is what a calendar app puts in its sidebar, and it is the only
   way somebody with two of these subscribed can tell which is which. */
function calendarHead(calName) {
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Church HQ//Rota//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:' + esc(calName || 'Rota'),
    'X-WR-TIMEZONE:Europe/London',
    /* How often a calendar should come back. Both spellings, because Apple
       reads one and Google the other. */
    'REFRESH-INTERVAL;VALUE=DURATION:PT4H',
    'X-PUBLISHED-TTL:PT4H'
  ];
}

/* Events worth putting in anybody's calendar: not last term's, not a draft,
   and in the order they happen. */
function liveEvents(events) {
  return (events || [])
    .filter(ev => !ev.archived && !ev.draft)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)) ||
                    String(a.startTime || '').localeCompare(String(b.startTime || '')));
}

/* One VEVENT. Every feed builds its own summary and description and hands
   them here, so the date handling, the folding and the escaping are written
   once. uidSuffix keeps the three feeds' entries apart in a calendar that
   holds two of them: without it, subscribing to "just me" and "my household"
   would have the second quietly replace the first, because they would share
   a UID. */
function vevent({ ev, dtstamp, summary, description, uidSuffix }) {
  const out = [];
  const uid = 'rota-' + ev.id + (uidSuffix ? '-' + uidSuffix : '') + '@churchhq.co.uk';
  const video = videoLinkFor(ev);
  const full = video ? (description ? description + '\n\n' : '') + 'Join the video call: ' + video : description;

  out.push('BEGIN:VEVENT', 'UID:' + uid, 'DTSTAMP:' + dtstamp);
  if (ev.startTime) {
    out.push('DTSTART;TZID=Europe/London:' + stamp(ev.date, ev.startTime),
             'DTEND;TZID=Europe/London:' + stamp(ev.date, ev.endTime || ev.startTime));
  } else {
    out.push('DTSTART;VALUE=DATE:' + stamp(ev.date, null),
             'DTEND;VALUE=DATE:' + dayAfter(ev.date));
  }
  out.push(fold('SUMMARY:' + esc(summary)));
  if (full) out.push(fold('DESCRIPTION:' + esc(full)));
  if (video) out.push(fold('LOCATION:' + esc(video)), fold('URL:' + video));
  out.push('END:VEVENT');
  return out;
}

/* Who is in a role, as "Name" or "Name and Name". */
function namesIn(raw) {
  const people = peopleIn(raw).map(p => (p && p.name) || '').filter(Boolean);
  if (!people.length) return '';
  if (people.length === 1) return people[0];
  return people.slice(0, -1).join(', ') + ' and ' + people[people.length - 1];
}

export function buildFeed({ events, memberId, member, church = '', calName = 'My ' + (church ? church + ' ' : '') + 'rota', now = new Date() }) {
  const dtstamp = now.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  const lines = calendarHead(calName);

  const mine = liveEvents(events).filter(ev => isInvitedTo(ev, memberId, member));

  for (const ev of mine) {
    const roles = rolesFor(ev, memberId);
    const summary = tag(church) + (roles.length ? roles.join(', ') : (ev.type || 'Rota'));
    const description = (String(ev.type || '') +
      (ev.description ? ' \u2014 ' + ev.description : '')).trim();
    /* Keyed on the event id ALONE. The email attachment puts the date in the
       UID, which is fine for a one-off file; in a subscription it means moving
       an event from the 11th to the 18th leaves the old entry behind and adds
       a second one, so the person has it twice. */
    lines.push(...vevent({ ev, dtstamp, summary, description }));
  }

  lines.push('END:VCALENDAR');
  return lines.join(CRLF) + CRLF;
}

/* ---------------------------------------------------- MY HOUSEHOLD (18) --

   Martin: "Karen as an example needs to know if Oliver is on."

   Every event anybody in the household is on, with who, on the line Karen
   sees in her month view: "Oliver: Drums". The description underneath names
   everybody in full with their roles that day.

   WHO IS IN THE HOUSEHOLD IS WORKED OUT WHEN THE CALENDAR APP ASKS, not when
   the link was made - 18 is explicit about that. So somebody joining or
   leaving the household changes the feed on its next refresh, with nothing to
   reset and nobody to tell.

   It carries names and roles, and nothing else: no addresses, no telephone
   numbers, no notes. The link is the password, so what is behind it is kept
   to what a rota is.

   members: the address book records of the household, in book order.
*/
export function buildHouseholdFeed({ events, members, church = '', calName = 'Our household rota', now = new Date() }) {
  const dtstamp = now.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  const lines = calendarHead(calName);
  const people = (members || []).filter(m => m && m.id);

  for (const ev of liveEvents(events)) {
    /* Who in this house is on, and doing what. Somebody with no named role -
       invited to a meeting because of their team - still belongs here, and
       is shown by name with the meeting as their "role". */
    const on = people.map(m => {
      const roles = rolesFor(ev, m.id);
      if (roles.length) return { m, roles };
      if (isMeeting(ev) && inEventTeams(m, ev)) return { m, roles: [] };
      return null;
    }).filter(Boolean);
    if (!on.length) continue;

    const summary = tag(church) + on
      .map(x => firstName(x.m.name) + (x.roles.length ? ': ' + x.roles.join(', ') : ''))
      .join(' \u00b7 ');

    const who = on
      .map(x => (x.m.name || firstName(x.m.name)) +
                (x.roles.length ? ' \u2014 ' + x.roles.join(', ') : ' \u2014 ' + (ev.type || 'invited')))
      .join('\n');
    const what = (String(ev.type || '') +
      (ev.description ? ' \u2014 ' + ev.description : '')).trim();
    const description = (what ? what + '\n\n' : '') + who;

    /* A different UID from the "just me" feed, so somebody subscribed to both
       gets both rather than one quietly replacing the other. */
    lines.push(...vevent({ ev, dtstamp, summary, description, uidSuffix: 'household' }));
  }

  lines.push('END:VCALENDAR');
  return lines.join(CRLF) + CRLF;
}

/* ---------------------------------------------------- THE FULL ROTA (18) --

   Every service, with the whole team in the description, for people who would
   rather see the lot than only their own slots.

   TWO FILTERS, AND THE FIRST IS NOT NEGOTIABLE.

   allowedTeams is what this person may see on the read-only rota, worked out
   from their record WHEN THE CALENDAR APP ASKS - so somebody who leaves a team
   stops seeing it, without anybody remembering to reset a link. null means
   they may see everything, which is what a master admin gets.

   scope is their own choice of 'worship', 'kids' or 'all', and it can only
   ever narrow. "Everything" means everything they may see, never everything
   there is.

   An event where nothing is visible is left out altogether, rather than
   appearing as an empty entry that says a Kids Church service happened.
*/
export function buildFullFeed({ events, allowedTeams, scope = 'all', scopes = FULL_SCOPES, church = '',
                                calName, now = new Date(), roleTeams: rt = ROLE_TEAMS }) {
  const dtstamp = now.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  const cfg = scopes[scope] || scopes.all;
  const lines = calendarHead(calName || ((church ? church + ' rota' : 'Rota') + ' \u2014 ' + cfg.label));

  for (const ev of liveEvents(events)) {
    const roles = rolesVisible(ev, allowedTeams, scope, scopes, rt);
    const filled = roles
      .map(r => ({ role: r, names: namesIn((ev.assignments || {})[r]) }))
      .filter(x => x.names);
    if (!filled.length) continue;

    const summary = tag(church) + (ev.type || 'Rota') +
      (ev.description ? ' \u2014 ' + ev.description : '');
    const description = filled.map(x => x.role + ': ' + x.names).join('\n');

    lines.push(...vevent({ ev, dtstamp, summary, description, uidSuffix: 'full-' + scope }));
  }

  lines.push('END:VCALENDAR');
  return lines.join(CRLF) + CRLF;
}
