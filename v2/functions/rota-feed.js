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
export function buildFeed({ events, memberId, member, now = new Date() }) {
  const dtstamp = now.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';

  const mine = (events || [])
    /* Archived is last term, draft is not agreed yet. Neither belongs in
       anybody's calendar. */
    .filter(ev => !ev.archived && !ev.draft)
    .filter(ev => isInvitedTo(ev, memberId, member))
    .sort((a, b) => String(a.date).localeCompare(String(b.date)) ||
                    String(a.startTime || '').localeCompare(String(b.startTime || '')));

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//EGBC Worship & AV//Rota//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:EGBC Rota',
    'X-WR-TIMEZONE:Europe/London',
    /* How often a calendar should come back. Both spellings, because Apple
       reads one and Google the other. */
    'REFRESH-INTERVAL;VALUE=DURATION:PT4H',
    'X-PUBLISHED-TTL:PT4H'
  ];

  for (const ev of mine) {
    const roles = rolesFor(ev, memberId);
    /* Keyed on the event id ALONE. The email attachment puts the date in the
       UID, which is fine for a one-off file; in a subscription it means moving
       an event from the 11th to the 18th leaves the old entry behind and adds
       a second one, so the person has it twice. */
    const uid = `egbc-rota-${ev.id}@esherchurch.org`;
    const summary = `EGBC: ${roles.length ? roles.join(', ') : (ev.type || 'Rota')}`;
    const description = `${ev.type || ''}${ev.description ? ' — ' + ev.description : ''}`.trim();
    const video = videoLinkFor(ev);
    const fullDescription = video ? `${description}\n\nJoin the video call: ${video}` : description;

    lines.push('BEGIN:VEVENT', `UID:${uid}`, `DTSTAMP:${dtstamp}`);
    if (ev.startTime) {
      lines.push(`DTSTART;TZID=Europe/London:${stamp(ev.date, ev.startTime)}`,
                 `DTEND;TZID=Europe/London:${stamp(ev.date, ev.endTime || ev.startTime)}`);
    } else {
      lines.push(`DTSTART;VALUE=DATE:${stamp(ev.date, null)}`,
                 `DTEND;VALUE=DATE:${dayAfter(ev.date)}`);
    }
    lines.push(fold(`SUMMARY:${esc(summary)}`));
    if (fullDescription) lines.push(fold(`DESCRIPTION:${esc(fullDescription)}`));
    if (video) lines.push(fold(`LOCATION:${esc(video)}`), fold(`URL:${video}`));
    lines.push('END:VEVENT');
  }

  lines.push('END:VCALENDAR');
  return lines.join(CRLF) + CRLF;
}
