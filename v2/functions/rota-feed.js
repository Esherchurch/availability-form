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
const AV_ROLES = ['Sound', 'Words', 'Cameras'];
const KIDS_ROLES = ['Session Leader',
  'Leader (Younger)', 'Leader (Older)', 'Leader (Creche)',
  'Assistant (Younger)', 'Assistant (Older)', 'Assistant (Creche)',
  'Helper 1', 'Helper 2', 'Helper 3', 'Helper 4', 'Helper 5'];

export function roleTeam(r) {
  if (AV_ROLES.indexOf(r) !== -1) return 'AV Team';
  if (KIDS_ROLES.indexOf(r) !== -1 || /^Helper \d+$/.test(r)) return 'Kids Church';
  return 'Worship Team';
}

/* Worship and AV serve the same service and share a charter, so somebody on
   one sees the other's slots. Youth Worship has no roles of its own - the
   young people play drums and keys on an ordinary Sunday morning - so scoping
   them to "Youth Worship" would show them an empty rota they are actually on.
   Choir folds into Worship. Same allowances as egbc-auth.js and
   view-only-rota.html. */
const WORSHIP_SIDE = ['Worship Team', 'AV Team', 'Youth Worship', 'Core Team'];
const TEAM_PARENT = { Choir: 'Worship Team' };

export function visibleRoleTeams(user) {
  if (!user) return [];
  if (user.masterAdmin === true) return null;          /* null means all of them */
  const out = [];
  const add = t => { if (t && out.indexOf(t) === -1) out.push(t); };
  (user.teams || []).forEach(t => add(TEAM_PARENT[t] || t));
  (user.adminFor || []).forEach(add);
  if (!out.length) return null;
  if (WORSHIP_SIDE.some(t => out.indexOf(t) !== -1)) { add('Worship Team'); add('AV Team'); }
  if (out.indexOf('Worship Team') !== -1) add('Choir');
  return out;
}

/* The team choice on a full-rota link. "Everything" still means everything
   THIS PERSON may see, not everything there is. */
export const FULL_SCOPES = {
  worship: { label: 'Worship & AV', teams: ['Worship Team', 'AV Team', 'Choir'] },
  kids: { label: 'Kids Church', teams: ['Kids Church'] },
  all: { label: 'Everything', teams: null }
};

/* The roles of an event this person may be shown, after both filters. */
export function rolesVisible(ev, allowedTeams, scope) {
  const wanted = (FULL_SCOPES[scope] || FULL_SCOPES.all).teams;
  return (ev.roles || Object.keys(ev.assignments || {})).filter(r => {
    const t = roleTeam(r);
    if (allowedTeams && allowedTeams.indexOf(t) === -1) return false;
    if (wanted && wanted.indexOf(t) === -1) return false;
    return true;
  });
}

/* "Oliver", from "Oliver Synthetic". The summary line of a household entry
   has to fit in a phone's month view, so it carries first names; the
   description underneath carries the whole name. */
export const firstName = (n) => String(n || '').trim().split(/\s+/)[0] || '';

const VIDEO_BASE = 'https://egbc.daily.co/';
/* Same defaults as Planner.html. videoRoom absent means "use the default for
   this kind of event"; videoRoom set to '' means "no call", which is not the
   same thing and must not be collapsed into it. */
const VIDEO_DEFAULT_BY_TYPE = {
  'Core Team Meeting': 'worship-core-team',
  'Worship and AV Team Meeting': 'Worship-AV',
  'Worship Team Meeting': 'Worship-AV',
  'AV Team Meeting': 'Worship-AV'
};
export function videoLinkFor(ev) {
  const room = ev.videoRoom !== undefined ? ev.videoRoom : (VIDEO_DEFAULT_BY_TYPE[ev.type] || '');
  return room ? VIDEO_BASE + room : '';
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
    'PRODID:-//EGBC Worship & AV//Rota//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:' + esc(calName || 'EGBC Rota'),
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
  const uid = 'egbc-rota-' + ev.id + (uidSuffix ? '-' + uidSuffix : '') + '@esherchurch.org';
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

export function buildFeed({ events, memberId, member, calName = 'My EGBC rota', now = new Date() }) {
  const dtstamp = now.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  const lines = calendarHead(calName);

  const mine = liveEvents(events).filter(ev => isInvitedTo(ev, memberId, member));

  for (const ev of mine) {
    const roles = rolesFor(ev, memberId);
    const summary = 'EGBC: ' + (roles.length ? roles.join(', ') : (ev.type || 'Rota'));
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
export function buildHouseholdFeed({ events, members, calName = 'Our household rota', now = new Date() }) {
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

    const summary = 'EGBC: ' + on
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
export function buildFullFeed({ events, allowedTeams, scope = 'all',
                                calName, now = new Date() }) {
  const dtstamp = now.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  const cfg = FULL_SCOPES[scope] || FULL_SCOPES.all;
  const lines = calendarHead(calName || ('EGBC rota \u2014 ' + cfg.label));

  for (const ev of liveEvents(events)) {
    const roles = rolesVisible(ev, allowedTeams, scope);
    const filled = roles
      .map(r => ({ role: r, names: namesIn((ev.assignments || {})[r]) }))
      .filter(x => x.names);
    if (!filled.length) continue;

    const summary = 'EGBC: ' + (ev.type || 'Rota') +
      (ev.description ? ' \u2014 ' + ev.description : '');
    const description = filled.map(x => x.role + ': ' + x.names).join('\n');

    lines.push(...vevent({ ev, dtstamp, summary, description, uidSuffix: 'full-' + scope }));
  }

  lines.push('END:VCALENDAR');
  return lines.join(CRLF) + CRLF;
}
