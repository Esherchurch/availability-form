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
    return Promise.all([sites, rooms, venues]).then(function (r) {
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
      description: ev.description || '',
      location: where || '',
      start: ev.startLocal || ev.startUtc,
      end: ev.endLocal || ev.endUtc,
      allDay: !!ev.allDay,
      url: location.origin + location.pathname.replace(/[^/]*$/, '') + 'signup.html?event=' + ev.id,
      status: ev.status === 'cancelled' ? 'cancelled' : 'confirmed'
    });
  }

  function manageUrl(manageKey) {
    return location.origin + location.pathname.replace(/[^/]*$/, '') + 'my-signup.html?key=' + manageKey;
  }

  function confirmationEmail(o) {
    var ev = o.ev, where = o.where || '', waiting = o.status === 'waiting';
    var body =
      '<p>' + (waiting
        ? 'You are on the waiting list for <strong>' + esc(ev.title) + '</strong>. We will be in touch if a place comes free.'
        : 'You are signed up to <strong>' + esc(ev.title) + '</strong>.') + '</p>' +
      '<p><strong>When:</strong> ' + esc(fmtWhen(ev)) + '<br>' +
      (where ? '<strong>Where:</strong> ' + esc(where) + '<br>' : '') +
      '<strong>Places:</strong> ' + (o.places || 1) + '</p>' +
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
      subject: (waiting ? 'Waiting list: ' : 'You are signed up: ') + ev.title,
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
  function canComeFor(vis, teams) {
    if (vis === 'public') return ['public', 'members'];
    if (vis === 'churchMembers') return ['churchMembers'];
    if (vis === 'team') { var t = (teams || []).filter(Boolean).slice(0, 10); return t.length ? t : ['members']; }
    return ['members'];
  }
  function whoText(vis, teams) {
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
    WHO: WHO, canComeFor: canComeFor, whoText: whoText, mayCome: mayCome,
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
    listUpcoming: listUpcoming,
    load: load,
    placesLeft: placesLeft,
    signUp: signUp,
    cancel: cancel,
    locationText: locationText,
    lookups: lookups,
    icsFor: icsFor,
    manageUrl: manageUrl,
    confirmationEmail: confirmationEmail,
    checkinCodes: checkinCodes,
    CATEGORIES: [
      { id: 'service', name: 'Service', colour: '#3d6263' },
      { id: 'social', name: 'Social', colour: '#b07d2e' },
      { id: 'kids', name: 'Kids and families', colour: '#9bc34a' },
      { id: 'youth', name: 'Youth', colour: '#6366f1' },
      { id: 'prayer', name: 'Prayer', colour: '#0ea5e9' },
      { id: 'music', name: 'Music', colour: '#ec4899' },
      { id: 'community', name: 'Community', colour: '#15803d' },
      { id: 'other', name: 'Other', colour: '#6b7280' }
    ]
  };

})(window);
