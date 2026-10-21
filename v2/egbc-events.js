/* ===================================================================
   EGBC — events and sign-ups, the shared part
   ===================================================================

   Four pages share this: whatson.html, signup.html, my-signup.html and
   events-admin.html. Anything two of them both need lives here, so there
   is one answer to each question rather than four that drift.

   It uses the signed-in connection from egbc-auth.js (EGBCAuth.db) - the
   named 'egbc' app - and nothing else. No page in this module calls
   firebase.initializeApp.

   FOUR THINGS WORTH KNOWING BEFORE CHANGING ANY OF IT

   1. `audience` is what the rules judge a reader on, and audienceFor()
      below is the only thing that writes it. The rule refuses a document
      whose audience disagrees with its visibility and status, so a held
      event can never reach the public list even if a page asks it to.

   2. Every event carries startUtc, always. A Firestore orderBy silently
      drops documents that lack the field it is ordering by - the list
      does not error, it just comes back short, which has cost this build
      a day three times over. save() sets it on every write.

   3. Capacity lives in its own document and is moved in the same batch as
      the sign-up. The rules check the arithmetic with getAfter(), so two
      people cannot take the last place. A page must never "check then
      write" - it writes, and lets the rule refuse.

   4. The manage key IS the sign-up's document id. It is 32 random
      characters, it is the only way a guest reaches their booking, and
      nothing may ever list the collection to anyone but an admin.
   =================================================================== */

(function (global) {
  'use strict';

  var DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  function db() { return EGBCAuth.db; }

  /* Unguessable, and unguessable without depending on anything exotic:
     crypto.getRandomValues is in every browser this suite supports. */
  function key(n) {
    var chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    var out = '', a = new Uint8Array(n || 32);
    (global.crypto || global.msCrypto).getRandomValues(a);
    for (var i = 0; i < a.length; i++) out += chars[a[i] % chars.length];
    return out;
  }

  /* ---- dates -------------------------------------------------------
     UK throughout: Tue 20 Oct 2026, 19:30. Times are stored twice - a
     local ISO string people can read in the database, and a UTC number
     to sort and compare by. */

  function toDate(v) {
    if (!v && v !== 0) return null;
    if (v instanceof Date) return v;
    if (typeof v === 'number') return new Date(v);
    var d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
  }

  function fmtDate(v) {
    var d = toDate(v); if (!d) return '';
    return DAYS[d.getDay()] + ' ' + d.getDate() + ' ' + MONTHS[d.getMonth()] + ' ' + d.getFullYear();
  }

  function fmtDateShort(v) {
    var d = toDate(v); if (!d) return '';
    return DAYS[d.getDay()] + ' ' + d.getDate() + ' ' + MONTHS[d.getMonth()];
  }

  function fmtTime(v) {
    var d = toDate(v); if (!d) return '';
    return (d.getHours() < 10 ? '0' : '') + d.getHours() + ':' + (d.getMinutes() < 10 ? '0' : '') + d.getMinutes();
  }

  /* "Tue 20 Oct 2026, 19:30 – 21:00", or without the end if there is
     none, or just the date if it runs all day. */
  function fmtWhen(ev) {
    if (!ev) return '';
    var s = toDate(ev.startLocal || ev.startUtc);
    var e = toDate(ev.endLocal || ev.endUtc);
    if (!s) return '';
    if (ev.allDay) {
      if (e && fmtDate(e) !== fmtDate(s)) return fmtDate(s) + ' – ' + fmtDate(e);
      return fmtDate(s) + ', all day';
    }
    if (e && fmtDate(e) !== fmtDate(s)) return fmtDate(s) + ', ' + fmtTime(s) + ' – ' + fmtDate(e) + ', ' + fmtTime(e);
    return fmtDate(s) + ', ' + fmtTime(s) + (e ? ' – ' + fmtTime(e) : '');
  }

  /* An ISO local string ("2026-12-20T18:00") from a datetime-local input,
     and the UTC milliseconds that go beside it. */
  function utcOf(localIso) {
    var d = toDate(localIso);
    return d ? d.getTime() : null;
  }

  /* ---- who may see it ----------------------------------------------
     The rules read this field and nothing else, so this function is the
     access decision. Keep it and the rule in step: a held event is never
     public, a public event always carries 'public', and a team-only one
     carries its team names.  */
  function audienceFor(ev) {
    var vis = ev.visibility || 'members';
    /* NOT LISTED (§24 item 13; F-165): in nobody's list, public or members'.
       No reader asks for 'unlisted', so only the admins the rules already
       let read every event see it (events-admin). Held or not. */
    if (vis === 'unlisted') return ['unlisted'];
    /* Church members only (§21): held or not, never wider. */
    if (vis === 'churchMembers') return ['churchMembers'];
    var held = (ev.status || 'confirmed') === 'pending';
    if (held) return ['members'];
    if (vis === 'public') return ['public', 'members'];
    if (vis === 'team') {
      var teams = (ev.teams || []).filter(Boolean);
      return teams.length ? teams.slice() : ['members'];
    }
    return ['members'];
  }

  /* ---- reading ------------------------------------------------------ */

  function signedIn() {
    return typeof EGBCAuth !== 'undefined' && !!EGBCAuth.profile && !!EGBCAuth.profile();
  }

  /* ---- THE EVENT TEAM (F-212) ----------------------------------------
     Martin, 15 Oct: "if I run Film Club only me, Natasha and Val should be
     able to edit things and download lists". Each event names its team
     (teamMemberIds, teamUids, teamNames). Being on it needs no admin role.
     The same answer as the rules' runsThisEvent(): a master admin, the
     event's team, or (for an event made before teams) the admin who made
     it. Being an admin of some area is not enough. */
  /* VIEW AS (audit 15 Oct, section 4): a master admin previewing someone
     else must get that person's page, not their own. EGBCAuth answers
     isMaster / isAdmin / adminAreas / effectiveTeams as the person being
     viewed; but the profile and the sign-in are still the master admin's,
     and a page that read those for WHO MAY SEE THIS showed its full admin
     view. So every access decision on the events pages comes through
     here: while viewing as, no personal ids at all (nobody's event team,
     nobody's leader, nobody's safeguarding lead - the Menu never previews
     into those either), and only the viewed team's rights.
     Writes still carry the real uid (the rules check it); only "who may
     see this" changes. */
  function viewing() { return !!(typeof EGBCAuth !== 'undefined' && EGBCAuth.viewingAs && EGBCAuth.viewingAs()); }
  function asSeen(p) {
    p = p || (typeof EGBCAuth !== 'undefined' && EGBCAuth.profile && EGBCAuth.profile()) || {};
    if (!viewing()) return p;
    return { name: p.name || '', email: p.email || '', status: p.status, memberId: '', masterAdmin: false, viewingAs: true,
      adminFor: (EGBCAuth.adminAreas && EGBCAuth.adminAreas()) || [], teams: (EGBCAuth.effectiveTeams && EGBCAuth.effectiveTeams()) || [] };
  }
  /* The page's start, after the sign-in check. A page the guard turned
     away (egbc-guard.js data-admin..., marked data-egbc-blocked on the body)
     goes no further: its own code would only write into the elements the
     "Admins only" screen replaced - the audit's "Cannot set properties of
     null" (15 Oct). The promise never settles, so nothing after it runs.
     It asks with the same rule as the page's guard tag (data-admin,
     data-team, data-also-team): a bare require() answers at once, before
     the guard has turned anyone away, and the page ran on regardless. */
  function guardOpts() {
    var g = document.querySelector('script[src*="egbc-guard.js"]'), o = {};
    if (!g) return undefined;
    if (g.getAttribute('data-admin') === 'any') o.adminAny = true;
    if (g.getAttribute('data-team')) o.team = g.getAttribute('data-team');
    if (g.getAttribute('data-also-team')) o.alsoTeam = g.getAttribute('data-also-team');
    return Object.keys(o).length ? o : undefined;
  }
  function ready(opts) {
    var blocked = function () { return !!(document.body && document.body.hasAttribute('data-egbc-blocked')); };
    var never = function () { return new Promise(function () {}); };
    return EGBCAuth.require(opts || guardOpts()).then(function (p) { return blocked() ? never() : p; },
      function (e) { if (blocked()) return never(); throw e; });
  }
  /* THE PAGE TURNED SOMEONE AWAY (audit 16 Oct, access): the page's own
     words stay as they are; this marks the page refused the way the shared
     guard does (data-egbc-blocked), so a checker - and anything else that
     looks - can tell "not for you" from a page that opened. */
  function refused() { if (document.body) document.body.setAttribute('data-egbc-blocked', 'refused by the page'); }
  /* WHO MAY OPEN WHICH ADMIN PAGE (Martin, 16 Oct; the Menu asks the same):
       - Places and the Picture library: the church office, master admins
         and bookings admins - everyone EGBCAuth gives the "bookings" part
         of Running things (master admins, the office group, any site's
         bookings admin)
       - Headcounts: the Kids Church leads (who administer a team the
         children's settings name) and master admins
     Both follow View as, through EGBCAuth's own answers. */
  function mayRunPlaces() {
    if (EGBCAuth.isMaster && EGBCAuth.isMaster()) return true;
    return !!(EGBCAuth.runsTabs && EGBCAuth.runsTabs().indexOf('bookings') >= 0);
  }
  function mayHeadcount() {
    if (EGBCAuth.isMaster && EGBCAuth.isMaster()) return Promise.resolve(true);
    var areas = (EGBCAuth.adminAreas && EGBCAuth.adminAreas()) || [];
    if (!areas.length) return Promise.resolve(false);
    return db().collection('kidsSettings').get().then(function (s) {
      return s.docs.some(function (d) { return ((d.data() || {}).teams || []).some(function (t) { return areas.indexOf(t) >= 0; }); });
    }, function () { return false; });
  }
  function myUid() { if (viewing()) return ''; var u = typeof EGBCAuth !== 'undefined' && EGBCAuth.user ? EGBCAuth.user() : null; return (u && u.uid) || ''; }
  function myIds() {
    var p = signedIn() ? asSeen() : null;
    return { mid: (p && p.memberId) || '', uid: myUid(), master: !!(EGBCAuth.isMaster && EGBCAuth.isMaster()), admin: !!(EGBCAuth.isAdmin && EGBCAuth.isAdmin()) };
  }
  function onTeam(ev) {
    var me = myIds();
    return !!ev && ((me.mid && (ev.teamMemberIds || []).indexOf(me.mid) >= 0) || (me.uid && (ev.teamUids || []).indexOf(me.uid) >= 0));
  }
  function runsEvent(ev) {
    var me = myIds();
    return !!ev && (me.master || onTeam(ev) || (me.admin && !!me.uid && ev.createdBy === me.uid));
  }
  /* "Events I run": every event whose team I am on, soonest first. */
  function eventsIRun() {
    var me = myIds(), c = db().collection('calEvents'), qs = [];
    if (me.mid) qs.push(c.where('teamMemberIds', 'array-contains', me.mid).get());
    if (me.uid) qs.push(c.where('teamUids', 'array-contains', me.uid).get());
    return Promise.all(qs.map(function (q) { return q.catch(function () { return { docs: [] }; }); })).then(function (r) {
      var seen = {}, out = [];
      r.forEach(function (s) { s.docs.forEach(function (d) { if (!seen[d.id]) { seen[d.id] = 1; out.push(Object.assign({ id: d.id }, d.data())); } }); });
      return out.sort(function (a, b) { return (a.startUtc || 0) - (b.startUtc || 0); });
    });
  }

  /* The audiences this reader may ask for. Signed out it is one value;
     signed in it is 'members' plus their teams, which is what makes an
     array-contains-any query come back with only documents the rules
     will allow - the whole query is refused otherwise, not filtered. */
  function myAudiences() {
    if (!signedIn()) return ['public'];
    var p = EGBCAuth.profile() || {};
    var out = ['public', 'members'];
    (p.teams || []).forEach(function (t) { if (out.indexOf(t) === -1) out.push(t); });
    (p.adminFor || []).forEach(function (t) { if (out.indexOf(t) === -1) out.push(t); });
    /* Church members only (§21): asked for only by those who may come, so it
       is never shown to anyone else - not even as a locked door. Admins may
       read every event (the rules say so), so they ask for it too. */
    if (p.churchMember === true || (EGBCAuth.isAdmin && EGBCAuth.isAdmin())) out.push('churchMembers');
    /* A master admin may read any event - the rules say so - but a query
       only returns documents whose audience it asked for, so asking for
       their own teams alone left another team's event invisible to the one
       person who is meant to see everything. Caught by a signed-in walk,
       not by the rules tests: the rules were right and the question was
       wrong. */
    if (EGBCAuth.isMaster && EGBCAuth.isMaster()) {
      Object.keys(EGBCAuth.TEAMS || {}).forEach(function (t) { if (out.indexOf(t) === -1) out.push(t); });
    }
    return out.slice(0, 30);   /* array-contains-any takes at most 30 */
  }

  /* Events from now on, soonest first. `limit` is a number of documents,
     not of days. */
  function listUpcoming(opts) {
    opts = opts || {};
    var from = opts.from === undefined ? Date.now() - 6 * 3600 * 1000 : opts.from;
    var q = db().collection('calEvents')
      .where('audience', 'array-contains-any', myAudiences())
      .where('startUtc', '>=', from)
      .orderBy('startUtc')
      .limit(opts.limit || 200);
    return q.get().then(function (snap) {
      return snap.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); });
    });
  }

  /* One event, with the parts of it the sign-up form needs. */
  function load(id) {
    var out = {};
    return db().collection('calEvents').doc(id).get().then(function (s) {
      if (!s.exists) return null;
      out.ev = Object.assign({ id: s.id }, s.data());
      return Promise.all([
        db().collection('calEvents').doc(id).collection('ticketTypes').get(),
        db().collection('calEvents').doc(id).collection('questions').get(),
        db().collection('capacity').doc(id).get()
      ]).then(function (r) {
        out.ticketTypes = r[0].docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); })
          .sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
        out.questions = r[1].docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); })
          .sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
        out.capacity = r[2].exists ? r[2].data() : null;
        return out;
      });
    });
  }

  function placesLeft(cap) {
    if (!cap) return null;
    var n = (cap.capacity || 0) - (cap.taken || 0);
    return n < 0 ? 0 : n;
  }

  /* ---- writing a sign-up -------------------------------------------
     One batch: the person (if they are new), the sign-up, and the
     counter. If the counter has moved since the page read it, the rules
     refuse the whole batch - which is the behaviour we want, and the
     reason this does not check first and write afterwards. */

  function signUp(o) {
    var ev = o.ev;
    var places = Math.max(1, parseInt(o.places || 1, 10));
    var waiting = o.status === 'waiting';
    var batch = db().batch();
    var manageKey = key(32);

    var personKind, personId;
    var p = signedIn() ? EGBCAuth.profile() : null;
    if (p && p.memberId) {
      personKind = 'addressBook';
      personId = p.memberId;
    } else {
      personKind = 'contacts';
      personId = 'c_' + key(16);
      batch.set(db().collection('contacts').doc(personId), {
        name: o.name, email: (o.email || '').toLowerCase().trim(),
        phone: o.phone || '', source: 'signup', createdAt: new Date().toISOString()
      });
    }

    var doc = {
      calEventId: ev.id,
      personKind: personKind,
      personId: personId,
      name: o.name,
      email: (o.email || '').toLowerCase().trim(),
      phone: o.phone || '',
      attendees: o.attendees || [],
      answers: o.answers || {},
      places: places,
      ticketTypeId: o.ticketTypeId || '',
      status: waiting ? 'waiting' : 'confirmed',
      donation: o.donation || 0,
      notes: o.notes || '',
      memberUid: (p && EGBCAuth.user && EGBCAuth.user()) ? EGBCAuth.user().uid : '',
      createdAt: new Date().toISOString()
    };
    batch.set(db().collection('signups').doc(manageKey), doc);

    /* A waiting-list place takes no seat, so it does not touch the
       counter - and the rules know that, so do not "helpfully" move it. */
    var work = waiting
      ? Promise.resolve()
      : db().collection('capacity').doc(ev.id).get().then(function (c) {
          if (!c.exists) throw new Error('Sign-ups are not set up for this event yet.');
          batch.update(db().collection('capacity').doc(ev.id), { taken: (c.data().taken || 0) + places });
        });

    return work.then(function () { return batch.commit(); })
      .then(function () { return { manageKey: manageKey, signup: doc }; });
  }

  /* THE WHOLE SERIES (F-184; ChurchSuite's "sign up to the whole series").
     One sign-up for each date, each with its own key and its own place on
     that date's counter - so the door, the registers and cancelling one
     date all work exactly as for a single date. A date that is already
     full puts this person on its waiting list instead. Beside each one,
     seriesSignups/{its key} lists every key in the booking, so the email
     can be ONE email for all the dates and "my place" can cancel them all.
     Everything is one write: all of it happens, or none of it. */
  function seriesDates(ev) {
    if (!ev || !ev.seriesId) return Promise.resolve([ev]);
    return listUpcoming({ from: Date.now() - 6 * 3600 * 1000, limit: 300 }).then(function (list) {
      var mine = list.filter(function (e) { return e.seriesId === ev.seriesId && e.status !== 'cancelled' && e.status !== 'pending'; });
      if (!mine.some(function (e) { return e.id === ev.id; })) mine.push(ev);
      return mine.sort(function (a, b) { return (a.startUtc || 0) - (b.startUtc || 0); });
    });
  }
  function signUpSeries(o, dates) {
    var places = Math.max(1, parseInt(o.places || 1, 10));
    var batch = db().batch();
    var p = signedIn() ? EGBCAuth.profile() : null, personKind, personId;
    if (p && p.memberId) { personKind = 'addressBook'; personId = p.memberId; }
    else {
      personKind = 'contacts'; personId = 'c_' + key(16);
      batch.set(db().collection('contacts').doc(personId), {
        name: o.name, email: (o.email || '').toLowerCase().trim(), phone: o.phone || '', source: 'signup', createdAt: new Date().toISOString()
      });
    }
    var keys = dates.map(function () { return key(32); });
    return Promise.all(dates.map(function (ev) { return db().collection('capacity').doc(ev.id).get(); })).then(function (caps) {
      var docs = dates.map(function (ev, i) {
        var c = caps[i];
        if (!c.exists) throw new Error('Sign-ups are not set up for ' + fmtDate(ev.startLocal || ev.startUtc) + ' yet.');
        var cap = c.data(), waiting = (cap.taken || 0) + places > (cap.capacity || 0);
        var d = {
          calEventId: ev.id, personKind: personKind, personId: personId, name: o.name,
          email: (o.email || '').toLowerCase().trim(), phone: o.phone || '', attendees: o.attendees || [], answers: o.answers || {},
          places: places, ticketTypeId: o.ticketTypeId || '', status: waiting ? 'waiting' : 'confirmed', donation: i === 0 ? (o.donation || 0) : 0,
          notes: o.notes || '', memberUid: (p && EGBCAuth.user && EGBCAuth.user()) ? EGBCAuth.user().uid : '', createdAt: new Date().toISOString()
        };
        batch.set(db().collection('signups').doc(keys[i]), d);
        if (!waiting) batch.update(db().collection('capacity').doc(ev.id), { taken: (cap.taken || 0) + places });
        return d;
      });
      var group = { seriesId: dates[0].seriesId || '', keys: keys, calEventIds: dates.map(function (e) { return e.id; }),
        email: (o.email || '').toLowerCase().trim(), createdAt: new Date().toISOString() };
      keys.forEach(function (k) { batch.set(db().collection('seriesSignups').doc(k), group); });
      return batch.commit().then(function () { return { keys: keys, signups: docs }; });
    });
  }

  /* Cancelling gives the place back. The counter rule insists the write
     names the sign-up that was cancelled and that it really is cancelled
     in the same batch, so lastCancelled is not decoration. */
  function cancel(manageKey) {
    var ref = db().collection('signups').doc(manageKey);
    return ref.get().then(function (s) {
      if (!s.exists) throw new Error('That booking could not be found.');
      var d = s.data();
      if (d.status === 'cancelled') return { already: true, signup: d };
      var batch = db().batch();
      batch.update(ref, { status: 'cancelled', cancelledAt: new Date().toISOString() });
      if (d.status === 'confirmed') {
        return db().collection('capacity').doc(d.calEventId).get().then(function (c) {
          if (c.exists) {
            batch.update(db().collection('capacity').doc(d.calEventId), {
              taken: Math.max(0, (c.data().taken || 0) - (d.places || 1)),
              lastCancelled: manageKey
            });
          }
          return batch.commit().then(function () { return { signup: d }; });
        });
      }
      return batch.commit().then(function () { return { signup: d }; });
    });
  }

  /* ---- where it is -------------------------------------------------- */

  function locationText(ev, lookup) {
    if (!ev) return '';
    var loc = ev.location || {};
    if (loc.kind === 'online') return 'Online' + (loc.videoRoom ? ' (' + loc.videoRoom + ')' : '');
    if (loc.kind === 'venue') return (lookup && lookup.venues && lookup.venues[loc.venueId]) || loc.venueName || 'Outside venue';
    var names = (loc.roomIds || []).map(function (id) {
      return (lookup && lookup.rooms && lookup.rooms[id]) || '';
    }).filter(Boolean);
    var site = (lookup && lookup.sites && lookup.sites[loc.siteId]) || loc.siteName || '';
    if (!names.length) return site;
    return names.join(', ') + (site ? ', ' + site : '');
  }

  /* EVENT CATEGORIES (F-180). Every church starts with these eight. Once an
     admin saves the church's own list (events-admin, "Event categories"),
     eventCategories/{id} holds it - name, colour, order, retired - and
     CATEGORIES becomes that list, changed in place so every page that
     already holds it sees the new one. A retired category is not offered
     for a new event, but events already in it still show its name. The
     list is loaded with lookups(), which every page showing events waits
     for. */
  var DEFAULT_CATEGORIES = [
    { id: 'service', name: 'Service', colour: '#3d6263' },
    { id: 'social', name: 'Social', colour: '#b07d2e' },
    { id: 'kids', name: 'Kids and families', colour: '#9bc34a' },
    { id: 'youth', name: 'Youth', colour: '#6366f1' },
    { id: 'prayer', name: 'Prayer', colour: '#0ea5e9' },
    { id: 'music', name: 'Music', colour: '#ec4899' },
    { id: 'community', name: 'Community', colour: '#15803d' },
    { id: 'other', name: 'Other', colour: '#6b7280' }
  ];
  var CATEGORIES = DEFAULT_CATEGORIES.map(function (c) { return Object.assign({}, c); });
  var catsLoaded = null;
  function loadCategories(again) {
    if (catsLoaded && !again) return catsLoaded;
    catsLoaded = db().collection('eventCategories').get().then(function (s) {
      var list = s.docs.map(function (d) {
        var x = d.data();
        return { id: d.id, name: x.name || d.id, colour: x.colour || '#6b7280', order: x.order || 0, retired: x.retired === true };
      }).sort(function (a, b) { return a.order - b.order || a.name.localeCompare(b.name); });
      if (list.length) CATEGORIES.splice.apply(CATEGORIES, [0, CATEGORIES.length].concat(list));
      return CATEGORIES;
    }).catch(function () { return CATEGORIES; });
    return catsLoaded;
  }
  /* An event's category; one the church no longer has reads as "Other". */
  function catOf(id) {
    id = id || 'other';
    return CATEGORIES.filter(function (c) { return c.id === id; })[0] ||
      CATEGORIES.filter(function (c) { return c.id === 'other'; })[0] || { id: 'other', name: 'Other', colour: '#6b7280' };
  }

  /* Sites, rooms and venues as id -> name, for the pages that show where
     something is. Rooms are referred to by id everywhere, exactly so a
     rename does not break anything - this is where the name is fetched.
     Signed out, only the active ones are readable, and the query has to
     say so or it is refused outright. */
  function lookups() {
    var out = { sites: {}, rooms: {}, venues: {} };
    var sites = signedIn() ? db().collection('sites').get()
                           : db().collection('sites').where('active', '==', true).get();
    var rooms = signedIn() ? db().collection('rooms').get()
                           : db().collection('rooms').where('active', '==', true).get();
    var venues = signedIn() ? db().collection('venues').get() : Promise.resolve({ docs: [] });
    return Promise.all([sites, rooms, venues, loadCategories()]).then(function (r) {
      r[0].docs.forEach(function (d) { out.sites[d.id] = (d.data().name || ''); });
      r[1].docs.forEach(function (d) { out.rooms[d.id] = (d.data().name || ''); });
      (r[2].docs || []).forEach(function (d) { out.venues[d.id] = (d.data().name || ''); });
      return out;
    }).catch(function () { return out; });
  }

  /* ---- the calendar file and the confirmation ----------------------- */

  function icsFor(ev, where) {
    return EGBCICS.build({
      /* Left as it was (F-068): a calendar treats a new UID as a new entry. */
      uid: 'egbc-event-' + ev.id + '@esherchurch.org',
      title: ev.title,
      /* The words as plain text: a calendar shows "<p>" as it is. */
      description: plainText(ev.description || ''),
      location: where || '',
      start: ev.startLocal || ev.startUtc,
      end: ev.endLocal || ev.endUtc,
      allDay: !!ev.allDay,
      url: location.origin + location.pathname.replace(/[^/]*$/, '') + 'signup.html?event=' + ev.id,
      status: ev.status === 'cancelled' ? 'cancelled' : 'confirmed'
    });
  }

  /* ---- the words, safely, and Share on WhatsApp ----------------------
     An event's words are the editor's HTML. Two things here read them
     WITHOUT EVER PUTTING THEM IN THE PAGE: DOMParser makes a separate
     document that runs no scripts and loads no pictures, so a bad
     <img onerror> in an old event can do nothing. */

  function parsed(html) {
    if (!html || typeof DOMParser === 'undefined') return null;
    return new DOMParser().parseFromString('<div id="r">' + html + '</div>', 'text/html').getElementById('r');
  }

  /* The words as plain text, a blank line between paragraphs. For the app
     and the calendar, which show text, not HTML. */
  function plainText(html) {
    var root = parsed(html);
    if (!root) return String(html || '');
    root.querySelectorAll('br').forEach(function (b) { b.replaceWith('\n'); });
    root.querySelectorAll('li').forEach(function (b) { b.prepend('- '); b.append('\n'); });
    root.querySelectorAll('p,h1,h2,h3,h4,h5,h6,blockquote,div,ul,ol').forEach(function (b) { b.append('\n\n'); });
    return root.textContent.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  }

  /* The words cut down to what a WhatsApp message can carry: the editor's
     small set of tags, no attributes but a web link's href, no pictures. */
  var KEEP_TAGS = { P: 1, BR: 1, B: 1, STRONG: 1, I: 1, EM: 1, U: 1, S: 1, UL: 1, OL: 1, LI: 1, H2: 1, H3: 1, BLOCKQUOTE: 1, A: 1 };
  function cleaned(html, pictures) {
    var root = parsed(html);
    if (!root) return '';
    (function walk(node) {
      Array.prototype.slice.call(node.childNodes).forEach(function (n) {
        if (n.nodeType === 8) { n.remove(); return; }
        if (n.nodeType !== 1) return;
        var tag = n.tagName;
        if (/^(SCRIPT|STYLE|IFRAME|OBJECT|EMBED|SVG|MATH|TEMPLATE|NOSCRIPT|FORM|INPUT|BUTTON|TEXTAREA|SELECT|LINK|META|BASE)$/.test(tag)) { n.remove(); return; }
        if (tag === 'IMG') {
          var src = n.getAttribute('src') || '', alt = n.getAttribute('alt') || '';
          if (!pictures || !/^(https?:|data:image\/(png|jpeg|gif|webp);)/i.test(src)) { n.remove(); return; }
          Array.prototype.slice.call(n.attributes).forEach(function (a) { n.removeAttribute(a.name); });
          n.setAttribute('src', src); n.setAttribute('alt', alt);
          return;
        }
        walk(n);
        if (!KEEP_TAGS[tag]) { n.replaceWith.apply(n, n.childNodes); return; }
        var href = tag === 'A' ? n.getAttribute('href') || '' : '';
        Array.prototype.slice.call(n.attributes).forEach(function (a) { n.removeAttribute(a.name); });
        if (/^(https?:\/\/|mailto:)/i.test(href)) {
          n.setAttribute('href', href);
          if (pictures) { n.setAttribute('target', '_blank'); n.setAttribute('rel', 'noopener'); }
        }
      });
    })(root);
    return root.innerHTML;
  }
  /* For WhatsApp: no pictures (the poster goes as a file instead). */
  function shareHtml(html) { return cleaned(html, false); }
  /* For showing on a page: the editor's tags and pictures, nothing that
     can run. The editor cleans the words when they are saved; this cleans
     them again when they are shown, because the rules cannot check HTML. */
  function safeHtml(html) { return cleaned(html, true); }

  function pageBase() { return location.origin + location.pathname.replace(/[^/]*$/, ''); }
  /* Beside this file, which sits with the events pages, so the link is
     right from the app too, wherever the app page is. */
  function eventUrl(id) { return (HERE || pageBase()) + 'signup.html?event=' + encodeURIComponent(id); }

  /* What goes to WhatsApp for an event: its title, when and where, the
     words, and the link to its page. Never who has signed up. */
  function shareItem(ev, where) {
    var when = [fmtWhen(ev), where].filter(Boolean).join(' · ');
    return {
      title: ev.title || 'Event',
      when: (ev.status === 'cancelled' ? 'CANCELLED · ' : '') + when,
      html: shareHtml(ev.description || ''),
      link: eventUrl(ev.id),
      image: ev.image || ''
    };
  }

  /* The one shared helper, egbc-share.js (the main window's), fetched the
     first time it is needed if the page has not loaded it. Beside this
     file, wherever that is. */
  var HERE = (function () {
    var s = global.document && global.document.currentScript;
    return s && s.src ? s.src.replace(/[^/]*$/, '').replace(/\?.*$/, '') : '';
  })();
  var shareLoading = null;
  function shareReady() {
    if (global.EGBCShare) return Promise.resolve(global.EGBCShare);
    if (!shareLoading) shareLoading = new Promise(function (res, rej) {
      var s = document.createElement('script');
      s.src = HERE + 'egbc-share.js?v=202610212300';
      s.onload = function () { global.EGBCShare ? res(global.EGBCShare) : rej(new Error('Sharing could not be loaded.')); };
      s.onerror = function () { shareLoading = null; rej(new Error('Sharing could not be loaded. Check the signal and try again.')); };
      document.head.appendChild(s);
    });
    return shareLoading;
  }

  /* The picture as a file, so the phone can send it with the words. A
     picture that will not come in 5 seconds is left out, and the preview
     says so: the words still go. */
  function pictureFile(url) {
    if (!url || typeof fetch === 'undefined' || typeof File === 'undefined') return Promise.resolve(null);
    var t = new Promise(function (res) { setTimeout(function () { res(null); }, 5000); });
    var f = fetch(url).then(function (r) {
      if (!r.ok) return null;
      return r.blob().then(function (b) {
        if (!/^image\//.test(b.type)) return null;
        return new File([b], 'picture.' + (b.type.split('/')[1] || 'jpg').replace('jpeg', 'jpg'), { type: b.type });
      });
    }).catch(function () { return null; });
    return Promise.race([f, t]);
  }

  /* Open the preview. Nothing is sent: the person picks the group in
     WhatsApp and presses send there. */
  function share(item) {
    return Promise.all([shareReady(), pictureFile(item.image)]).then(function (r) {
      return r[0].open(Object.assign({}, item, { file: r[1] }));
    });
  }

  function manageUrl(manageKey) {
    return location.origin + location.pathname.replace(/[^/]*$/, '') + 'my-signup.html?key=' + manageKey;
  }

  /* PAY ON THE DAY (F-183): what a place costs is its ticket's price times
     the places. A waiting-list or cancelled place owes nothing. Worked out
     from the event's own ticket types every time, never stored on the
     sign-up, so a price corrected later is what the door sees. */
  function money(n) { return '£' + (Math.round((Number(n) || 0) * 100) / 100).toFixed(2); }
  function toPay(su, ticketTypes) {
    if (!su || su.status === 'cancelled' || su.status === 'waiting') return 0;
    var t = (ticketTypes || []).filter(function (x) { return x.id === su.ticketTypeId; })[0] || (ticketTypes || [])[0];
    var price = t ? Number(t.price) || 0 : 0;
    return Math.round(price * Math.max(1, parseInt(su.places || 1, 10)) * 100) / 100;
  }

  /* How a ticket may be paid (F-181): on the day, card (the church's own
     Stripe), bank (the church's own GoCardless), any mix. Unset: on the day. */
  function payBy(t) { var p = (t && Array.isArray(t.payBy) && t.payBy.length) ? t.payBy : ['day']; return p; }
  /* One of the hub's functions, signed in or not (a guest paying for a
     ticket is not signed in, so EGBCAuth.call cannot be used). */
  function callPublic(name, data) {
    var o = (global.firebase && firebase.app('egbc').options) || {};
    var local = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
    var base = local ? 'http://localhost:' + (location.port === '5601' ? 5102 : 5101) + '/' + o.projectId + '/europe-west2/'
      : 'https://europe-west2-' + o.projectId + '.cloudfunctions.net/';
    var u = EGBCAuth.user && EGBCAuth.user();
    return (u ? u.getIdToken() : Promise.resolve('')).then(function (t) {
      var h = { 'Content-Type': 'application/json' }; if (t) h.Authorization = 'Bearer ' + t;
      return fetch(base + name, { method: 'POST', headers: h, body: JSON.stringify({ data: data || {} }) });
    }).then(function (r) { return r.json(); }).then(function (j) {
      if (j && j.error) {
        var e = new Error(j.error.message || 'That could not be done.');
        if (j.error.status) e.code = String(j.error.status).toLowerCase().replace(/_/g, '-');
        e.shut = !!(j.error.details && j.error.details.shut);
        throw e;
      }
      return j ? j.result : null;
    });
  }

  /* ---- Subscribe in your own calendar (R7, F-182; phones F-197, F-198) ----
     One card for whatson.html and the app's What's on. The host keeps the
     state { signedIn, mine, cats, msg, copied } and draws subscribeHtml
     again after subscribeAct. Buttons and boxes carry ATTR="sub:...".
       iPhone    one big "Add to my phone's calendar" (webcal://): iPhone's
                 Calendar asks "Subscribe?"
       Android   NO webcal button: Android has no webcal handler, and
                 neither Google Calendar nor Outlook can subscribe from a
                 link on the phone (Martin's phone, 15 Oct). It leads with
                 "Everything coming up is always in What's on"; then, as
                 optional, add it once on a computer: the steps, a big
                 Copy, and "Email me the link" (own address only)
       computer  Google / Apple or Outlook / Copy, as before */
  function feedBase() {
    var o = (global.firebase && firebase.apps.some(function (a) { return a.name === 'egbc'; }) ? firebase.app('egbc').options : {}) || {};
    var h = global.location.hostname, local = h === 'localhost' || h === '127.0.0.1';
    return local ? 'http://localhost:' + (global.location.port === '5601' ? 5102 : 5101) + '/' + o.projectId + '/europe-west2/eventsFeed'
      : 'https://europe-west2-' + o.projectId + '.cloudfunctions.net/eventsFeed';
  }
  function feedUrl(st) {
    var mine = st.signedIn && st.mine;
    return feedBase() + (mine ? '?k=' + encodeURIComponent(st.mine) : '?church=1') + (st.cats && st.cats.length ? '&cat=' + st.cats.join(',') : '');
  }
  function deviceKind() {
    var ua = (global.navigator && navigator.userAgent) || '';
    if (/Android/i.test(ua)) return 'android';
    if (/iPhone|iPad|iPod/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return 'iphone';
    return 'computer';
  }
  function isPhone() { return deviceKind() !== 'computer'; }
  /* Callables need the sign-in settled: straight after a page opens it is
     not yet, and EGBCAuth.call then fails (seen as a flake in
     phone-subscribe.test, 15 Oct). */
  function whenSignedIn() {
    return new Promise(function (resolve) {
      try { var a = firebase.auth(firebase.app('egbc')), off = a.onAuthStateChanged(function (u) { off(); resolve(u); }); }
      catch (e) { resolve(null); }
    });
  }
  function callSignedIn(name, data) {
    return whenSignedIn().then(function (u) { if (!u) throw new Error('Sign in first.'); return global.EGBCAuth.call(name, data); });
  }
  function subscribeHtml(st, used, attr, kind) {
    attr = attr || 'data-sub'; kind = kind || deviceKind();
    var mine = !!(st.signedIn && st.mine), url = feedUrl(st), web = url.replace(/^https?:/, 'webcal:');
    var google = 'https://calendar.google.com/calendar/r?cid=' + encodeURIComponent(web);
    var tick = 'style="display:flex;gap:8px;align-items:center;min-height:44px"';
    var big = 'display:flex;width:100%;justify-content:center;align-items:center;min-height:52px;font-size:16px;margin-top:10px;text-decoration:none';
    var copy = function (cls, style) { return '<button class="btn ' + cls + '" id="subCopy" ' + attr + '="sub:copy"' + (style ? ' style="' + style + '"' : '') + '>' + (st.copied ? 'Copied' : 'Copy the link') + '</button>'; };
    var reset = mine ? '<button class="btn ghost" id="subReset" ' + attr + '="sub:reset">Reset my link</button>' : '';
    var ways;
    if (kind === 'iphone') ways =
      '<a class="btn primary" id="subPhone" href="' + esc(web) + '" style="' + big + ';margin-top:12px">Add to my phone\'s calendar</a>' +
      '<p class="hint" style="margin:6px 0 0">Tap Subscribe when your iPhone asks.</p>' +
      '<div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:8px">' +
        '<a class="btn sec" id="subGoogle" target="_blank" rel="noopener" href="' + esc(google) + '">Google Calendar</a>' + copy('sec') + reset + '</div>';
    else if (kind === 'android') ways =
      '<div id="subAndroid" style="margin-top:12px">' +
      '<p class="hint" style="margin:0">On Android, add it once on a computer and it appears on your phone. Google Calendar and Outlook can\'t add it from a link on the phone itself.</p>' +
      copy('sec', big) +
      (st.signedIn ? '<button class="btn sec" id="subEmail" ' + attr + '="sub:email" style="' + big + ';margin-top:8px">Email me the link</button>' +
        '<p class="hint" style="margin:4px 0 0">It goes to your own email address, so you can open it on a computer.</p>' : '') +
      '<p style="margin:12px 0 2px;font-weight:600">Google Calendar, on a computer</p><ol style="margin:0;padding-left:22px">' +
        '<li>Go to calendar.google.com</li><li>Next to "Other calendars", click +, then "From URL"</li><li>Paste the link and click "Add calendar"</li></ol>' +
      '<p style="margin:10px 0 2px;font-weight:600">Outlook, on a computer</p><ol style="margin:0;padding-left:22px">' +
        '<li>Go to outlook.com and open Calendar</li><li>Click "Add calendar", then "Subscribe from web"</li><li>Paste the link, give it a name, and click "Import"</li></ol>' +
      '<p style="margin:10px 0 0"><b>Then on your phone:</b> Google Calendar &gt; Settings &gt; the new calendar &gt; Sync on.</p>' +
      (reset ? '<div style="margin-top:8px">' + reset + '</div>' : '') + '</div>';
    else ways =
      '<div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:10px">' +
        '<a class="btn" id="subGoogle" target="_blank" rel="noopener" href="' + esc(google) + '">Add to Google Calendar</a>' +
        '<a class="btn sec" id="subApple" href="' + esc(web) + '">Apple or Outlook</a>' + copy('sec') + reset + '</div>';
    /* Martin, 15 Oct: on Android, lead with the app; the calendar set-up is
       optional, never a second app required, and never the one-off .ics
       offered as "subscribe". */
    var head = kind === 'android'
      ? '<p id="subLead" style="margin:0 0 14px;font-weight:600;font-size:17px;color:var(--ink,#111827)">' + (attr === 'data-wact' ? 'Everything coming up is always in What\'s on in this app.' : 'Everything coming up is always here, in What\'s on.') + '</p>' +
        '<h2 style="margin:0 0 6px;font-size:15px">Also in Google Calendar or Outlook (optional)</h2>'
      : '<h2 style="margin:0 0 6px;font-size:16px">Subscribe in your own calendar</h2>';
    return head +
      '<p class="hint" style="margin:0 0 8px">Your calendar app keeps it up to date by itself: new events appear, and changes and cancellations follow. Google can take a few hours to catch up; that is Google.</p>' +
      (st.signedIn ? '<label class="check" ' + tick + '><input type="radio" name="subWho" value="public" ' + attr + '="sub:who:public"' + (mine ? '' : ' checked') + '>Public events only</label>' +
        '<label class="check" ' + tick + '><input type="radio" name="subWho" value="mine" ' + attr + '="sub:who:mine"' + (mine ? ' checked' : '') + '>Everything I can see here (my own link)</label>' : '') +
      '<p style="margin:8px 0 4px;font-weight:600">Which events</p><div style="display:flex;flex-wrap:wrap;gap:10px">' +
        CATEGORIES.filter(function (c) { return used[c.id]; }).map(function (c) {
          return '<label class="check" style="display:flex;gap:6px;align-items:center;min-height:44px"><input type="checkbox" class="subCat" value="' + esc(c.id) + '" ' + attr + '="sub:cat:' + esc(c.id) + '"' + ((st.cats || []).indexOf(c.id) >= 0 ? ' checked' : '') + '>' + esc(c.name) + '</label>'; }).join('') +
      '</div><p class="hint" style="margin:0">None ticked: everything.</p>' + ways +
      '<p class="hint" id="subUrl" style="overflow-wrap:anywhere;margin:8px 0 0">' + esc(url) + '</p><p class="hint" id="subMsg" role="status">' + esc(st.msg || '') + '</p>' +
      (mine ? '<p class="hint" style="margin:4px 0 0">Your own link shows members\' and team events, so keep it to yourself. Reset makes a new one and the old one stops working.</p>' : '');
  }
  /* ---- An event's picture, WHOLE (Martin, 15 Oct: a wide banner cut off
     the Bereavement Cafe poster's times; "it needs the full image when you
     open it, without making the page too big"). Used by signup.html and
     the app's event view.
       picFigure(src)  the whole picture (never cropped), on a blurred,
                       darkened copy of itself; a button: tap to open
       picOpen(btn)    full screen: the whole picture on dark, X and Esc
                       close it, and the focus goes back to the picture
     Only a web address is ever drawn (safePic). */
  function safePic(u) { u = String(u || '').trim(); return /^(https?:\/\/|\/|[a-z0-9_-]+\/)/i.test(u) ? u : ''; }
  function picStyle() {
    if (document.getElementById('egbc-pic-css')) return;
    var st = document.createElement('style'); st.id = 'egbc-pic-css';
    st.textContent = '.egbc-pic{position:relative;display:block;width:100%;padding:0;margin:0 0 14px;border:0;border-radius:14px;overflow:hidden;background:#1f2937;cursor:zoom-in;line-height:0}' +
      '.egbc-pic .bg{position:absolute;inset:-24px;width:calc(100% + 48px);height:calc(100% + 48px);object-fit:cover;filter:blur(20px) brightness(.5);transform:scale(1.05)}' +
      '.egbc-pic .whole{position:relative;display:block;margin:0 auto;max-width:100%;max-height:50vh;width:auto;height:auto;object-fit:contain}' +
      '.egbc-pic:focus-visible{outline:3px solid #3d6263;outline-offset:3px}' +
      '#egbc-picview{position:fixed;inset:0;z-index:9999;background:rgba(10,12,16,.94);display:flex;align-items:center;justify-content:center;padding:16px}' +
      '#egbc-picview img{max-width:100%;max-height:100%;object-fit:contain}' +
      '#egbc-picview button{position:absolute;top:12px;right:12px;width:48px;height:48px;border-radius:24px;border:0;background:rgba(255,255,255,.16);color:#fff;font:600 24px/48px Inter,system-ui,sans-serif;cursor:pointer}' +
      '#egbc-picview button:focus-visible{outline:3px solid #fff}';
    document.head.appendChild(st);
  }
  function picFigure(src, attrs) {
    src = safePic(src); if (!src) return '';
    picStyle();
    return '<button type="button" class="egbc-pic" data-pic="' + esc(src) + '" aria-label="See the whole picture"' + (attrs ? ' ' + attrs : '') + '>' +
      '<img class="bg" src="' + esc(src) + '" alt="" aria-hidden="true"><img class="whole" src="' + esc(src) + '" alt=""></button>';
  }
  function picOpen(btn) {
    var src = btn && safePic(btn.getAttribute('data-pic')); if (!src) return;
    picStyle();
    var old = document.getElementById('egbc-picview'); if (old) old.remove();
    var v = document.createElement('div'); v.id = 'egbc-picview';
    v.setAttribute('role', 'dialog'); v.setAttribute('aria-modal', 'true'); v.setAttribute('aria-label', 'The picture');
    v.innerHTML = '<img src="' + esc(src) + '" alt=""><button type="button" aria-label="Close">✕</button>';
    var key = function (e) { if (e.key === 'Escape') { e.preventDefault(); close(); } else if (e.key === 'Tab') { e.preventDefault(); v.querySelector('button').focus(); } };
    var close = function () {
      document.removeEventListener('keydown', key, true); v.remove();
      /* The page may have drawn itself again meanwhile: the same picture's button. */
      var back = document.body.contains(btn) ? btn : document.querySelector('.egbc-pic');
      if (back) back.focus();
    };
    v.addEventListener('click', function (e) { e.stopPropagation(); if (e.target === v || e.target.tagName === 'BUTTON') close(); });
    document.addEventListener('keydown', key, true);
    document.body.appendChild(v);
    v.querySelector('button').focus();
  }

  /* ---- Is a sign-up question about health? (Until switch-over, F-203) ----
     The live database can be read by anybody until the locked rules
     deploy, so answers about health are not saved before then. By the
     question's words (check-in's medical words, plus diet), as check-in's
     downloads do: leaving out too much is the safe way to be wrong. */
  var HEALTH_WORDS = /allerg|medic|health|condition|asthma|diabet|epilep|epi-?pen|disabilit|additional need|first aid|diet|food|intoleran/i;
  function isHealthQuestion(q) { return !!q && (q.health === true || HEALTH_WORDS.test(String(q.label || ''))); }
  function healthLaterWords(opensOn) {
    return 'Please tell the organiser about any health needs (allergies, medical, dietary) directly until ' + (opensOn ? opensOn : 'the new church hub opens') + '.';
  }

  /* What a "sub:..." does to the state. Resolves when it is time to draw again. */
  function subscribeAct(a, st) {
    a = String(a || '').replace(/^sub:/, ''); st.msg = ''; st.copied = false;
    if (a.indexOf('cat:') === 0) {
      var c = a.slice(4), i = (st.cats = st.cats || []).indexOf(c);
      if (i >= 0) st.cats.splice(i, 1); else st.cats.push(c);
      return Promise.resolve();
    }
    if (a === 'who:public') { st.mine = ''; return Promise.resolve(); }
    if (a === 'who:mine') return callSignedIn('myEventsFeed', {}).then(function (x) { st.mine = x.key; }, function (e) { st.msg = e.message || String(e); });
    if (a === 'copy') {
      var url = feedUrl(st);
      return (global.navigator && navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject()).then(function () {
        st.copied = true; st.msg = 'Copied. In Google Calendar on a computer: Other calendars, +, From URL, then paste it.';
      }, function () { st.msg = 'Copy this link: ' + url; });
    }
    if (a === 'email') {
      return callSignedIn('emailMyFeedLink', { mine: !!(st.signedIn && st.mine), cats: (st.cats || []).slice() }).then(function () {
        st.msg = 'Sent to your email. Open it on a computer and follow the steps.';
      }, function (e) { st.msg = e.message || String(e); });
    }
    if (a === 'reset') {
      if (!global.confirm('Make a new link? The old one stops working, in every calendar it is in.')) return Promise.resolve();
      return callSignedIn('myEventsFeed', { reset: true }).then(function (x) { st.mine = x.key; st.msg = 'A new link: add it to your calendar again.'; }, function (e) { st.msg = e.message || String(e); });
    }
    return Promise.resolve();
  }
  /* PAYMENTS SHUT UNTIL SWITCH-OVER (bcbe6d7e, payments-gate.js): the server
     refuses with failed-precondition and the mark shut. EGBCAuth.call keeps
     the code but not the mark, so the gate's own words count too. Other
     failed-preconditions ("This ticket is not paid by card") keep their own
     words. */
  var CLOSED_WORDS = 'Online payments open when the hub goes live.';
  function paymentsClosed(e) {
    return !!(e && (e.shut || (/failed-precondition/i.test(e.code || '') && /goes live|switches over/i.test(e.message || ''))));
  }
  function payProblem(e) { return paymentsClosed(e) ? CLOSED_WORDS : ((e && e.message) || String(e)); }

  function confirmationEmail(o) {
    var ev = o.ev, where = o.where || '', waiting = o.status === 'waiting';
    /* The whole series (F-184): one email listing every date. */
    var dates = o.dates && o.dates.length > 1 ? o.dates : null;
    var body =
      '<p>' + (waiting
        ? 'You are on the waiting list for <strong>' + esc(ev.title) + '</strong>. We will be in touch if a place comes free.'
        : 'You are signed up to <strong>' + esc(ev.title) + '</strong>' + (dates ? ', every date in the series' : '') + '.') + '</p>' +
      (dates ? '<p><strong>The ' + dates.length + ' dates:</strong><br>' + dates.map(function (d) {
        return esc(fmtWhen(d.ev)) + (d.status === 'waiting' ? ' - on the waiting list' : ''); }).join('<br>') + '</p>' +
        '<p style="color:#6b7280;font-size:13px">Each date has its own place, and its own check-in code on your page. You can cancel one date, or all of them.</p>' : '') +
      '<p><strong>When:</strong> ' + esc(fmtWhen(ev)) + '<br>' +
      (where ? '<strong>Where:</strong> ' + esc(where) + '<br>' : '') +
      '<strong>Places:</strong> ' + (o.places || 1) + '</p>' +
      (!waiting && o.toPay > 0 ? '<p><strong>To pay on the day:</strong> ' + money(o.toPay) + '</p>' : '') +
      (o.attendees && o.attendees.length
        ? '<p><strong>Who is coming:</strong><br>' + o.attendees.map(function (a) { return esc(a.name); }).join('<br>') + '</p>'
        : '') +
      '<p><a href="' + manageUrl(o.manageKey) + '" style="display:inline-block;background:#3d6263;color:#fff;' +
      'text-decoration:none;padding:10px 16px;border-radius:8px;font:500 14px Inter,Arial,sans-serif">View or cancel your place</a></p>' +
      '<p style="color:#6b7280;font-size:13px">The calendar file attached adds it to your diary.</p>';
    var qr = checkinCodes(o);
    if (qr.length) {
      body += '<p><strong>Checking in:</strong> show ' + (qr.length > 1 ? 'these codes' : 'this code') +
        ' at the door. ' + (qr.length > 1 ? 'There is one for each person, attached' : 'It is attached') +
        ', and on the page behind the button above.</p>';
    }
    return {
      to: [o.email],
      subject: (waiting ? 'Waiting list: ' : 'You are signed up: ') + ev.title + (dates ? ' (' + dates.length + ' dates)' : ''),
      html: EGBCChurch.wrap(waiting ? 'You are on the waiting list' : 'You are signed up', body,
        (global.EGBCChurch && EGBCChurch.name() ? esc(EGBCChurch.name()) + ' &middot; ' : '') + 'If this was not you, ignore this message.'),
      attachments: [{
        filename: 'event.ics',
        content: EGBCICS.base64(icsFor(ev, where)),
        type: 'text/calendar'
      }].concat(qr),
      log: { calEventId: ev.id, kind: 'confirmation' }
    };
  }

  /* One QR code per person coming, as PNG attachments (Chunk 3). Only for
     a confirmed place - a waiting-list place has nothing to check in to -
     and only on pages that load the two check-in files, so a page that
     does not is unchanged. */
  function checkinCodes(o) {
    if (o.status === 'waiting' || !o.manageKey || !global.EGBCEventsQR || !global.EGBCCheckin) return [];
    var people = (o.attendees && o.attendees.length) ? o.attendees : [{ name: o.name || 'you' }];
    try {
      return people.map(function (a, i) {
        return {
          filename: 'check-in ' + String(a.name || ('person ' + (i + 1))).replace(/[^a-z0-9 \-]/gi, '').trim().slice(0, 40) + '.png',
          content: EGBCEventsQR.pngBase64(EGBCCheckin.codeFor(o.ev.id, o.manageKey, i), 8),
          type: 'image/png'
        };
      });
    } catch (e) { return []; }
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  /* ---- WHO CAN COME (Martin, NEXT-BRIEF §21) -------------------------
     The same four choices on events, forms and small groups. An event keeps
     its list in `audience`; a form or a group in `canCome`. */
  var WHO = [['public', 'Everyone'], ['members', 'Attenders (signed in)'], ['churchMembers', 'Church members only'], ['team', 'One or more teams']];
  /* EVENTS ONLY (small groups and forms keep WHO): NOT LISTED FIRST, and the
     default for a new event (Martin, §24 item 13): a church meeting, a
     refugee group or AA must never appear by accident. "Everyone" is the
     only one that reaches the public What's on and the website's embeds. */
  var EVENT_WHO = [['unlisted', 'Not listed: only the organisers and admins see it'], ['public', 'Everyone (public, on the church website too)'], ['members', 'Attenders (signed in)'],
    ['churchMembers', 'Church members only'], ['team', 'One or more teams']];
  function canComeFor(vis, teams) {
    if (vis === 'unlisted') return ['unlisted'];
    if (vis === 'public') return ['public', 'members'];
    if (vis === 'churchMembers') return ['churchMembers'];
    if (vis === 'team') { var t = (teams || []).filter(Boolean).slice(0, 10); return t.length ? t : ['members']; }
    return ['members'];
  }
  function whoText(vis, teams) {
    if (vis === 'unlisted') return 'Not listed';
    if (vis === 'public') return 'Everyone';
    if (vis === 'churchMembers') return 'Church members only';
    if (vis === 'team') return (teams || []).join(', ') || 'A team';
    return 'Attenders';
  }
  /* May this person come? (The rules decide; this is for what a page says.) */
  function mayCome(list, profile) {
    list = list || ['public'];
    if (list.indexOf('public') >= 0) return true;
    var p = profile || null;
    if (!p || p.status !== 'active') return false;
    if (p.masterAdmin || (p.adminFor || []).length) return true;
    if (list.indexOf('members') >= 0) return true;
    if (list.indexOf('churchMembers') >= 0 && p.churchMember === true) return true;
    return (p.teams || []).some(function (t) { return list.indexOf(t) >= 0; });
  }

  global.EGBCEvents = {
    WHO: WHO, EVENT_WHO: EVENT_WHO, canComeFor: canComeFor, whoText: whoText, mayCome: mayCome,
    key: key,
    esc: esc,
    fmtDate: fmtDate,
    fmtDateShort: fmtDateShort,
    fmtTime: fmtTime,
    fmtWhen: fmtWhen,
    utcOf: utcOf,
    audienceFor: audienceFor,
    myAudiences: myAudiences,
    signedIn: signedIn,
    onTeam: onTeam, ready: ready, refused: refused, mayRunPlaces: mayRunPlaces, mayHeadcount: mayHeadcount, viewing: viewing, asSeen: asSeen, myUid: myUid,
    runsEvent: runsEvent,
    eventsIRun: eventsIRun,
    listUpcoming: listUpcoming,
    load: load,
    placesLeft: placesLeft,
    signUp: signUp,
    seriesDates: seriesDates,
    signUpSeries: signUpSeries,
    cancel: cancel,
    locationText: locationText,
    lookups: lookups,
    icsFor: icsFor,
    manageUrl: manageUrl,
    plainText: plainText,
    shareHtml: shareHtml,
    safeHtml: safeHtml,
    eventUrl: eventUrl,
    shareItem: shareItem,
    shareReady: shareReady,
    share: share,
    confirmationEmail: confirmationEmail,
    checkinCodes: checkinCodes,
    CATEGORIES: CATEGORIES,
    DEFAULT_CATEGORIES: DEFAULT_CATEGORIES,
    catOf: catOf,
    money: money,
    payBy: payBy,
    callPublic: callPublic,
    feedUrl: feedUrl,
    isPhone: isPhone,
    deviceKind: deviceKind,
    safePic: safePic,
    isHealthQuestion: isHealthQuestion,
    healthLaterWords: healthLaterWords,
    picFigure: picFigure,
    picOpen: picOpen,
    subscribeHtml: subscribeHtml,
    subscribeAct: subscribeAct,
    CLOSED_WORDS: CLOSED_WORDS,
    paymentsClosed: paymentsClosed,
    payProblem: payProblem,
    toPay: toPay,
    loadCategories: loadCategories
  };

})(window);
