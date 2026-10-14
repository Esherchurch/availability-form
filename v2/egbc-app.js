/* ===================================================================
   EGBC Hub on the phone — the shell
   ===================================================================

   APP-DESIGN-BRIEF, the design Martin approved in design/app-mockup.html,
   and APP-A1.md for what each screen needs.

   STAGE 1: the shell itself - spaces, tabs, the chrome, the escaping
   contract and the redraw contract - plus every screen that is simply
   "open the page that already does this". A1 counted 11 of the 24 that
   way, which is why the app is useful from the first stage rather than
   after the last.

   Home, Me with My details, the family rule, Running things and Give come
   in later stages. Nothing here is a placeholder: a screen that is not
   ready yet is not registered, and an unregistered screen is not offered
   as a tab.

   WHAT THE SHELL OWNS, and a screen must not do for itself:
     the top bar, the row of spaces, the tab bar, sheets, toasts,
     the back behaviour, the scroll reset, and the safe-area padding.

   A SCREEN IS A FUNCTION RETURNING HTML, registered under space_tab:

     EGBCApp.screen('kids', 'today', function () { return '<div>…</div>'; });

   and it may ask to be redrawn, or watch something:

     EGBCApp.refresh('kids', 'today');     // no-op if they have moved on
     EGBCApp.screen('kids', 'today', draw, watch);   // watch returns a stop fn

   =================================================================== */

(function (global) {
  'use strict';

  /* ---- the spaces ---------------------------------------------------
     One per team the person is on, plus "Me and my family" always first
     and "Running things" for whoever runs things.

     The tabs and keys are the contract given to the events window in
     A-050, and they are not renamed without telling them.

     WHICH SPACES CAN EXIST AT ALL is decided by which teams exist. The
     mock-up draws Welcome and Tea & Coffee as examples; neither is a team
     yet (APP-DESIGN-BRIEF §6 lists them as ones to confirm with Martin),
     so neither is offered. When the office can add teams - teams as data,
     a later stage - a new team gets a space with the simple three tabs
     and no code change at all. That is the shape this table is in. */

  var SIMPLE_TABS = [
    ['rota', 'Rota', 'calendar-check'],
    ['sunday', 'This Sunday', 'sun'],
    ['team', 'Team', 'users']
  ];

  var SPACES = {
    me: {
      label: 'Me and my family', colour: '#3d6263', tint: '#eef5f4',
      tabs: [['home', 'Home', 'house'], ['whatson', "What's on", 'calendar-days'],
             ['listen', 'Listen', 'headphones'], ['me', 'Me', 'circle-user']]
    },
    worship: {
      label: 'Worship & AV', colour: '#4a5f7a', tint: '#e9eef5',
      teams: ['Worship Team', 'AV Team', 'Choir'],
      tabs: [['rota', 'Rota', 'calendar-check'], ['sunday', 'Sunday', 'list-music'],
             ['learn', 'Learn', 'graduation-cap'], ['team', 'Team', 'users']]
    },
    kids: {
      label: 'Kids Church', colour: '#7a5f4a', tint: '#f4ede7', teams: ['Kids Church'],
      tabs: [['today', 'Today', 'sun'], ['children', 'Children', 'baby'],
             ['rota', 'Rota', 'calendar-check'], ['team', 'Team', 'users']]
    },
    youth: { label: 'Youth', colour: '#5a4a7a', tint: '#efebf6', teams: ['Youth Worship'], tabs: SIMPLE_TABS },
    lazers: { label: 'Lazers', colour: '#8a4a5e', tint: '#f6ebef', teams: ['Lazers'], tabs: SIMPLE_TABS },
    renu: { label: 'ReNu', colour: '#6b5a3a', tint: '#f2ede4', teams: ['ReNu'], tabs: SIMPLE_TABS },
    maint: {
      label: 'Maintenance', colour: '#4f5a66', tint: '#eceff2', teams: ['Maintenance'],
      tabs: [['jobs', 'Jobs', 'wrench'], ['rooms', 'Rooms', 'door-closed'],
             ['team', 'Team', 'users']]
    },
    /* CORE TEAM (§7b). Martin, 10 Oct 2026: "why isnt there a core team
       area in the phone app? They will be doing the sunday service plans
       from the phone app. Look at the current core team phone app!" The
       mock-up left it out and the shell copied the omission.

       It is a TEAM space, not Running things: everyone on Core Team gets
       it, and whether they also run the office is §25's separate
       question. A Core Team member therefore has this AND Worship & AV,
       because Core Team covers Worship & AV everywhere else too
       (CORE_COVERS, 11 Oct).

       The green is its own - no other space uses it - because the whole
       point of the mock-up's colours is telling the spaces apart at a
       glance. The four tabs are §7b's, in its order. */
    core: {
      label: 'Core Team', colour: '#4a7a5f', tint: '#e8f2ec', teams: ['Core Team'],
      tabs: [['plan', 'Plan', 'clipboard-list'], ['rota', 'Rota', 'calendar-check'],
             ['meetings', 'Meetings', 'video'], ['team', 'Team', 'users']]
    },
    office: {
      label: 'Running things', colour: '#111827', tint: '#e3e8e6', runsThings: true,
      tabs: [['today', 'Today', 'layout-dashboard'], ['people', 'People', 'contact'],
             ['bookings', 'Bookings', 'door-open'], ['send', 'Send', 'send']]
    }
  };

  /* NEVER MORE THAN FOUR (§2). Checked here rather than trusted, because a
     fifth tab is the kind of thing that arrives one request at a time. */
  Object.keys(SPACES).forEach(function (k) {
    if (SPACES[k].tabs.length > 4) {
      throw new Error('egbc-app: ' + k + ' has ' + SPACES[k].tabs.length
        + ' tabs. Four is the limit (APP-DESIGN-BRIEF §2) - use a sheet.');
    }
  });

  /* ---- the escaping contract (F-130) --------------------------------
     The mock-up's helpers escape nothing, so a song title with a script
     tag in it would run. Every call there passes a literal, which is the
     only reason it never showed.

     So THE HELPERS ESCAPE, and a screen cannot forget. `right` and `inner`
     are HTML on purpose - they carry pills and cards - and the caller owns
     them. Nothing can be both.

     esc() covers the apostrophe as well as & < > ". The mock-up's did not;
     every attribute it builds is double-quoted so nothing could break out,
     but the next helper somebody writes with single quotes makes it live
     and it costs one character. */

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* A Lucide name, or nothing. Not escaped - validated, because it goes
     into an attribute the browser acts on. */
  function icName(n) {
    return /^[a-z0-9-]{1,40}$/.test(String(n || '')) ? String(n) : 'circle';
  }

  function ic(n, size) {
    var s = Number(size) || 18;
    return '<i data-lucide="' + icName(n) + '" style="width:' + s + 'px;height:' + s + 'px"></i>';
  }

  /* An action, or nothing. Only the shapes the shell knows how to do, so a
     screen cannot smuggle anything into the attribute. */
  function actOk(a) {
    /* copycal:, makecal: and viewas: are the Me screen's, added when the
       calendar choices and "View as" moved off the website and onto a
       sheet (§7d). Each is a fixed word and a short key - no free text
       goes into the attribute, which is the whole point of this list.

       WHICH OF THESE IS LOAD-BEARING, said plainly because I got this
       wrong once already with the !v guard in runsTabs(): this list only
       gates actions that go through row() and sec(). The viewas: rows do,
       so viewas: here is load-bearing. The calendar sheet's buttons are
       hand-written HTML in app.html, so copycal: and makecal: never reach
       this function at all - they are listed for consistency, and taking
       them out breaks nothing. Deliberately removing makecal: from this
       list caught nothing in check-app-calendar.mjs, which is the honest
       evidence for that sentence. The gate that does hold for the
       calendar sheet is idFromKey() in app.html: an unrecognised key
       makes nothing. */
    /* newevent is Core Team ▸ Rota's "+" (§7b). It IS load-bearing,
       unlike copycal:/makecal: above: the row is built by row(), so
       without it here the button loses its action and does nothing. */
    /* copygive: is the Give sheet's Copy buttons (§Give). Like copycal:
       and makecal: above it is hand-written in app.html, so it never
       reaches here either - listed so the shape of every action in the
       app is written down in one place, not because it gates anything.
       What actually gates it is giveValue(): an unrecognised key returns
       nothing and the button says there is nothing to copy. The row that
       OPENS the sheet does go through row(), and sheet:[a-z-]+ covers
       it, which is the load-bearing half. */
    return /^(close|newevent|tab:[a-z-]+|sheet:[a-z-]+|go:[a-z]+:[a-z-]+|open:[A-Za-z0-9._%&=?-]+|toast:.{1,120}|copycal:[a-z]+|makecal:[a-z]+|copygive:[a-z]+|viewas:[a-z]+)$/
      .test(String(a || ''));
  }

  /* A list row. title and sub are TEXT and are escaped; right is HTML. */
  function row(icon, title, sub, right, act, colour, tint) {
    var a = actOk(act) ? ' data-act="' + esc(act) + '"' : '';
    /* --c AND --ct, as the mock-up does: the icon box is the tint and the
       glyph is the colour. One grey tint behind every row is a good part
       of why the cards all looked the same (§7e). */
    var c = colour ? ' style="--c:' + esc(colour) + (tint ? ';--ct:' + esc(tint) : '') + '"' : '';
    return '<button class="row"' + a + c + '><span class="ic">' + ic(icon) + '</span>'
      + '<span class="tx"><b>' + esc(title) + '</b>'
      + (sub ? '<small>' + esc(sub) + '</small>' : '') + '</span>'
      + (right || '<span class="chev">' + ic('chevron-right', 16) + '</span>') + '</button>';
  }

  /* A titled section. title is TEXT; inner is HTML. */
  function sec(title, inner, more) {
    return '<section class="sec"><div class="sec-h"><h3>' + esc(title) + '</h3>'
      + (more && actOk(more[1]) ? '<button data-act="' + esc(more[1]) + '">' + esc(more[0]) + '</button>' : '')
      + '</div>' + (inner || '') + '</section>';
  }

  /* The "next thing" card. Everything but actions is TEXT. */
  function next(day, mon, title, sub, actions, colour, tint) {
    return '<div class="card next"'
      + (colour ? ' style="--c:' + esc(colour) + (tint ? ';--ct:' + esc(tint) : '') + '"' : '') + '>'
      + '<div class="next-top"><div class="date"><b>' + esc(day) + '</b><span>' + esc(mon) + '</span></div>'
      + '<div><h4>' + esc(title) + '</h4><p>' + esc(sub) + '</p></div></div>'
      + (actions ? '<div class="actions">' + actions + '</div>' : '') + '</div>';
  }

  function card(inner) { return '<div class="card list">' + (inner || '') + '</div>'; }
  function head(title, sub) {
    return '<div><p class="hello">' + esc(title) + '</p>'
      + (sub ? '<p class="sub">' + esc(sub) + '</p>' : '') + '</div>';
  }
  function empty(icon, words) {
    return '<p class="empty">' + ic(icon, 26) + esc(words) + '</p>';
  }

  /* ---- who is looking ------------------------------------------------ */

  /* How many notices this person has not seen. The screens own the
     notices - they know the team filter and the show-until - so the
     shell asks rather than working it out a second time. Nothing
     registered yet, or nothing unseen: no dot. */
  function unseenNotices() {
    try {
      return (global.EGBCAppNotices && EGBCAppNotices.unseen && EGBCAppNotices.unseen()) || 0;
    } catch (e) { return 0; }
  }

  function who() {
    var p = (global.EGBCAuth && EGBCAuth.profile && EGBCAuth.profile()) || {};
    var teams = (global.EGBCAuth && EGBCAuth.effectiveTeams && EGBCAuth.effectiveTeams()) || p.teams || [];
    return {
      first: String(p.name || '').split(/\s+/)[0] || 'there',
      name: p.name || '',
      /* Home matches this against each event's assignments to find what
         somebody is serving on. It is the address book id, which is what
         the rota stores - never the uid. */
      memberId: p.memberId || '',
      /* THE SIGN-IN ACCOUNT, which is a different thing from memberId and
         is what the DATABASE knows somebody by. Two screens need it and
         neither could have it before: a comment on a pin board is stored
         with the uid that wrote it (7f), and the Sunday plan's audience
         is a list of uids. Both were quietly doing nothing - the comment
         box in the app said "you need to be signed in" to somebody who
         was, and Home showed no plan to a preacher who was on one.
         The comment above still stands: the ROTA is keyed by memberId,
         and this is not that. */
      uid: (global.EGBCAuth && EGBCAuth.user && EGBCAuth.user()
            && EGBCAuth.user().uid) || '',
      teams: teams,
      adminFor: p.adminFor || [],
      isMaster: !!(global.EGBCAuth && EGBCAuth.isMaster && EGBCAuth.isMaster()),
      isAdmin: !!(global.EGBCAuth && EGBCAuth.isAdmin && EGBCAuth.isAdmin()),
      churchMember: !!p.churchMember,
      /* Which Running things tabs, from the groups this person is in
         (§25). The shell never works this out for itself - one answer,
         shared with the Menu. */
      runs: (global.EGBCAuth && EGBCAuth.runsTabs) ? EGBCAuth.runsTabs() : [],
      /* Let in as a parent only (N-5.5): Home and Me, nothing else. */
      parentOnly: !!p.parentOnly
    };
  }

  /* A person only ever sees their OWN teams (§2). Somebody on no team sees
     no row of spaces at all, which is the Attender case and is deliberate -
     not an empty row, no row. */
  function spacesFor(me) {
    var out = ['me'];
    if (me.parentOnly) return out;
    Object.keys(SPACES).forEach(function (k) {
      var s = SPACES[k];
      if (k === 'me') return;
      if (s.runsThings) {
        /* NOT "is an admin of anything, or on Core Team" any more
           (NEXT-BRIEF §25). That was wrong both ways: the church
           administrator may not be on Core Team, and a Worship admin should
           not get People and Send because they look after Worship. The
           answer comes from the groups a person is in, and the computer's
           Menu asks the same function, so the two cannot disagree. */
        if (me.runs.length) out.push(k);
        return;
      }
      /* EGBCAuth.inTeam, not me.teams.indexOf. The difference is Core Team:
         on the old portal the Core Team link showed every Worship & AV item
         plus Core's own, and inTeam() is where that cover lives
         (CORE_COVERS, 11 Oct). Asking it here rather than repeating the
         list means the app's spaces, the Menu and every page guard answer
         the same question the same way. It honours "View as" too, because
         inTeam reads effectiveTeams. */
      var mine = (s.teams || []).some(function (t) {
        return (global.EGBCAuth && EGBCAuth.inTeam ? EGBCAuth.inTeam(t)
                                                   : me.teams.indexOf(t) !== -1)
          || me.adminFor.indexOf(t) !== -1;
      });
      /* A MASTER ADMIN IS NO EXCEPTION (§7e). `|| me.isMaster` gave Martin
         all nine spaces, where the mock-up gives him three - and that is
         most of "it is now as confusing as the church suite one". He sees
         the teams he is actually on; to look at another team's space he
         uses "View as" on the Me tab, which is one row rather than a strip
         on every screen. */
      if (mine) out.push(k);
    });
    return out;
  }

  /* ---- the screens --------------------------------------------------- */

  var V = {};          /* space_tab -> { draw, watch } */
  var stopWatching = null;
  /* Which space_tab the live watcher belongs to, so a redraw of the same
     screen leaves it alone. See the note in draw(). */
  var watchingKey = null;

  function screen(space, tab, draw, watch) {
    V[space + '_' + tab] = { draw: draw, watch: watch || null };
  }

  /* Is there a screen behind this tab? A row that leads to a tab nothing
     has registered does nothing when tapped, which reads as a broken app -
     so a screen that offers such a row asks first, rather than the row
     being commented out and forgotten when the screen arrives. */
  function has(space, tab) { return !!V[space + '_' + tab]; }

  /* A tab with no screen behind it is not drawn. A tab that leads nowhere
     is worse than a missing one: it reads as a broken app. */
  function tabsFor(space) {
    var tabs = (SPACES[space].tabs || []).filter(function (t) { return !!V[space + '_' + t[0]]; });
    /* "LISTEN & WATCH" when the church uses Watch (F-164): one tab, two
       things. Switched off, it is plain Listen, as before. */
    if (space === 'me' && global.EGBCChurch && EGBCChurch.uses && EGBCChurch.uses('watch')) {
      tabs = tabs.map(function (t) { return t[0] === 'listen' ? [t[0], 'Listen & Watch', t[2]] : t; });
    }
    /* Running things shows ONLY the tabs this person runs (§25). Somebody
       in the Bookings group gets one tab, not four with three refusals
       behind them - "a tab someone sees must actually work". */
    /* A parent who is not in the address book has Home and Me only
       (N-5.5): What's on and Listen read things the rules keep for people
       the church knows. */
    if (space === 'me' && who().parentOnly) {
      tabs = tabs.filter(function (t) { return t[0] === 'home' || t[0] === 'me'; });
    }
    if (SPACES[space].runsThings) {
      var runs = who().runs;
      tabs = tabs.filter(function (t) { return runs.indexOf(t[0]) !== -1; });
    }
    return tabs;
  }

  /* ---- where we are -------------------------------------------------- */

  var S = { space: 'me', tab: 'home', sheet: null, toast: null };
  var SHEETS = {};
  function sheet(name, html) { SHEETS[name] = html; }

  var toastTimer = null;

  function refresh(space, tab) {
    if (space && (space !== S.space || (tab && tab !== S.tab))) return;
    draw();
  }

  function go(space, tab) {
    if (!SPACES[space]) return;
    var me = who();
    if (spacesFor(me).indexOf(space) === -1) return;
    S.space = space;
    var tabs = tabsFor(space);
    S.tab = (tab && V[space + '_' + tab]) ? tab : (tabs[0] ? tabs[0][0] : null);
    S.sheet = null;
    draw();
  }

  /* ---- drawing -------------------------------------------------------- */

  function draw() {
    var app = document.getElementById('egbc-app');
    if (!app) return;
    var me = who();
    var mine = spacesFor(me);

    if (mine.indexOf(S.space) === -1) { S.space = 'me'; S.tab = 'home'; }
    var space = SPACES[S.space];
    var tabs = tabsFor(S.space);
    if (!V[S.space + '_' + S.tab]) S.tab = tabs[0] ? tabs[0][0] : null;

    var html = '<div class="top" style="--sp:' + esc(space.colour) + '">'
      /* The mock-up's header: a filled logo square, the title at 16px/600
         in ink, then the buttons. Mine was letter-spaced small caps and a
         muted 13px title, which read as a website strip. */
      + '<div class="top-row"><span class="logo">EGBC</span>'
      /* "EGBC Hub", as the mock-up has it. The space is named in the
         pills below; putting it in the title too said the same thing
         twice and lost the app's name. */
      + '<span class="top-title">EGBC Hub</span>'
      /* "I'M WORRIED ABOUT SOMEONE", on EVERY space (NEXT-BRIEF §24):
         Me and my family, every team space, and Running things. It sits in
         the top bar rather than on a screen for exactly that reason - a
         screen belongs to one space, and somebody who notices that a
         neighbour has stopped coming should not have to find the right tab
         first. An icon with a label, because an unlabelled heart is a
         guess. */
      /* THE BELL, with a red dot (Martin, 12 Oct 2026: "harder to
         ignore a red dot on a small screen"). The count is the notices
         this person has not seen, and the app does not work it out -
         the screens do, and hand it over here, so the bar and the sheet
         cannot disagree about how many there are. No notices and
         nothing unseen: a plain bell, which still opens the list. */
      + '<button class="icon-btn" data-act="sheet:notices" aria-label="Notices'
      + (unseenNotices() ? ', ' + unseenNotices() + ' you have not seen' : '') + '">'
      + ic('bell', 17)
      + (unseenNotices() ? '<span class="badge">' + (unseenNotices() > 9 ? '9+' : unseenNotices())
          + '</span>' : '')
      + '</button>'
      /* CARE & SUPPORT (Martin, 14 Oct 2026) replaces "Worried?": the
         same short choice as the website (egbc-care.js), as a sheet, in
         words - "Care" on a narrow phone. Never hidden by a person's own
         Home choices; only by the church switching off the whole care
         part (feature 'care'). */
      + ((global.EGBCChurch && EGBCChurch.uses && !EGBCChurch.uses('care')) ? ''
        : '<button class="worry" data-act="sheet:care" aria-label="Care and support" aria-haspopup="dialog">'
          + ic('hand-heart', 17) + '<span class="wl">Care &amp; support</span><span class="ws">Care</span></button>')
      + '</div>';

    /* The row of spaces, only when there is more than one. Somebody on no
       team gets no row, not an empty one. */
    if (mine.length > 1) {
      html += '<div class="spaces" role="group" aria-label="Your spaces">'
        + mine.map(function (k) {
            return '<button class="space" style="--sp:' + esc(SPACES[k].colour) + '"'
              + ' data-space="' + esc(k) + '" aria-pressed="' + (k === S.space) + '">'
              + '<span class="dot" style="background:' + esc(SPACES[k].colour) + '"></span>'
              + esc(SPACES[k].label) + '</button>';
          }).join('') + '</div>';
    }
    html += '</div>';

    var entry = V[S.space + '_' + S.tab];
    html += '<main class="content" id="egbc-content">'
      + (entry ? entry.draw(me) : empty('circle-help', 'Nothing here yet.'))
      + '</main>';

    html += '<nav class="tabs" style="--n:' + tabs.length + ';--sp:' + esc(space.colour) + '"'
      + ' aria-label="' + esc(space.label) + '">'
      + tabs.map(function (t) {
          return '<button class="tab" data-tab="' + esc(t[0]) + '"'
            + (t[0] === S.tab ? ' aria-current="page"' : '') + '>'
            + ic(t[2], 22) + '<span>' + esc(t[1]) + '</span></button>';
        }).join('') + '</nav>';

    if (S.sheet && SHEETS[S.sheet]) {
      html += '<div class="sheet-back" data-act="close"><div class="sheet" role="dialog" aria-modal="true">'
        + '<div class="grab"></div>' + SHEETS[S.sheet] + '</div></div>';
    }
    if (S.toast) html += '<div class="toast" role="status">' + esc(S.toast) + '</div>';

    app.innerHTML = html;
    /* What this render was for. A check cannot tell "has it drawn for this
       person yet?" by looking for an element: between a navigate and its
       commit the previous page is still on screen, and asking the app who
       is signed in is answered by whichever page is live, not by whichever
       render drew what is being measured. Only draw() can write this, so
       waiting for it is waiting for the render. A-049, fifth time. */
    app.setAttribute("data-drawn",
      ((global.EGBCAuth && EGBCAuth.user && EGBCAuth.user()) ? EGBCAuth.user().uid : "-")
      + ":" + S.space + ":" + S.tab + ":" + mine.length);
    if (global.lucide) global.lucide.createIcons();

    /* One listener per screen, torn down when the screen goes away. A
       screen is re-rendered from scratch on every navigation, so an
       onSnapshot started inside draw() would be started again each time
       and never stopped (F-131). */
    /* ONCE PER SCREEN, NOT ONCE PER DRAW (F-141.2, the events window).
       This used to stop and restart the watcher on every draw - including
       the redraws refresh() itself causes. A Firestore listener answers as
       soon as it starts, so a screen that redraws on new data looped: draw,
       watch, answer, refresh, draw. The events window worked around it by
       not using watch() at all.

       The watcher is keyed to the space and tab it was started for, and is
       left alone while that is what is on screen. Navigating away stops it,
       which is what F-131 promised. */
    var hereKey = S.space + '_' + S.tab;
    if (watchingKey !== hereKey) {
      if (stopWatching) { try { stopWatching(); } catch (e) {} stopWatching = null; }
      watchingKey = null;
      if (entry && entry.watch) {
        var here = S.space, there = S.tab;
        try {
          stopWatching = entry.watch(function () { refresh(here, there); }) || null;
          watchingKey = hereKey;
        } catch (e) { console.warn('egbc-app: watch failed for ' + hereKey, e); }
      } else {
        /* No watcher on this screen, but remember we are here, so moving
           to a screen that has one still starts it. */
        watchingKey = hereKey;
      }
    }
  }

  /* ---- leaving the app, and coming back (§7d A) -----------------------

     A page the app opens wears the app's header and tab bar instead of
     the website's. Three things are handed over before the tap lands,
     because the page cannot work any of them out for itself:

       ?app=1        turns app mode on, and egbc-appmode.js remembers it
                     so a link INSIDE the page keeps you in the app
       where to go   back to the exact tab you left, not whatever the
                     browser's history happens to hold
       which tabs    this person's own tabs for this space. The page has
                     no idea who they are on; guessing would offer tabs
                     they do not have, and go() refuses a space you are
                     not in, so the guess would end in a dead tap.

     THE ONE PAGE THAT IS NOT OPENED IN APP MODE IS THE HUB. §7d says the
     app never opens the website's home except by "Open the full website"
     on Me, and that row means what it says - so this clears app mode on
     the way out rather than dressing the website up as the app. */

  var WEBSITE = { 'hub.html': true };

  function openPage(target) {
    var page = String(target).split('?')[0].split('#')[0];
    if (WEBSITE[page]) {
      if (global.EGBCAppMode) EGBCAppMode.leave();
      location.href = target.indexOf('?') === -1 ? target + '?app=0' : target + '&app=0';
      return;
    }
    if (global.EGBCAppMode) {
      EGBCAppMode.remember('app.html#' + S.space + ':' + S.tab, {
        space: S.space, tab: S.tab, tabs: tabsFor(S.space),
        colour: (SPACES[S.space] || {}).colour || ''
      });
    }
    location.href = target + (target.indexOf('?') === -1 ? '?app=1' : '&app=1');
  }

  /* Coming back: app.html#space:tab. Only a space this person really has
     - the hash is typed-in text as far as this is concerned, and go()
     refuses the rest anyway. */
  function fromHash() {
    var h = String(location.hash || '').replace(/^#/, '');
    if (!/^[a-z]+:[a-z-]+$/.test(h)) return false;
    var bits = h.split(':');
    if (!SPACES[bits[0]]) return false;
    go(bits[0], bits[1]);
    return true;
  }

  /* ---- what a tap does ------------------------------------------------
     Navigation is the shell's, so the back behaviour and the scroll reset
     live in one place. A screen's own buttons use their own handlers -
     delegated, because the DOM is rebuilt on every render (F-131). */

  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-space],[data-tab],[data-act]');
    if (!b) return;

    if (b.dataset.space) return go(b.dataset.space);
    if (b.dataset.tab) {
      S.tab = b.dataset.tab; S.sheet = null; draw();
      var c = document.getElementById('egbc-content');
      if (c) c.scrollTop = 0;
      return;
    }

    var a = b.dataset.act || '';
    if (a === 'close') {
      /* THE BACKDROP CLOSES THE SHEET ONLY WHEN THE TAP LANDS ON THE
         BACKDROP. The backdrop carries data-act="close", so closest()
         found it from anything inside the panel that has no action of its
         own - and the calendar sheet's "Apple / iPhone", "Google" and
         "Outlook" are real <a> links, which have none. The sheet shut
         under the person's finger as they tapped the thing they wanted.
         A Close button inside the panel still works: it carries the
         action itself, so b is the button, not the backdrop. */
      if (b.className && String(b.className).indexOf('sheet-back') !== -1 && e.target !== b) return;
      S.sheet = null; return draw();
    }
    if (a.indexOf('tab:') === 0) { S.tab = a.slice(4); S.sheet = null; return draw(); }
    if (a.indexOf('sheet:') === 0) { S.sheet = a.slice(6); return draw(); }
    if (a.indexOf('go:') === 0) { var g = a.split(':'); return go(g[1], g[2]); }
    /* open: a page that already does the job (§5). The app does not rebuild
       what v2 already has; it opens it - IN APP MODE (§7d A), so the
       person does not land on the website halfway through a job. */
    if (a.indexOf('open:') === 0) { return openPage(a.slice(5)); }
    if (a.indexOf('toast:') === 0) {
      S.toast = a.slice(6); draw();
      clearTimeout(toastTimer);
      toastTimer = setTimeout(function () { S.toast = null; draw(); }, 3200);
    }
  });

  global.EGBCApp = {
    SPACES: SPACES,
    screen: screen, has: has, sheet: sheet, refresh: refresh, go: go, draw: draw,
    who: who, spacesFor: spacesFor, tabsFor: tabsFor,
    esc: esc, ic: ic, row: row, sec: sec, next: next, card: card,
    head: head, empty: empty,
    /* A screen's own code sometimes has something to say - "Link copied"
       - without a button to hang a toast: action on. Same toast, same
       timer, so there is one of them rather than two. */
    toast: function (words) {
      S.toast = String(words || ''); S.sheet = null; draw();
      clearTimeout(toastTimer);
      toastTimer = setTimeout(function () { S.toast = null; draw(); }, 3200);
    },
    state: function () { return { space: S.space, tab: S.tab, sheet: S.sheet }; },
    /* COMING BACK FROM A PAGE lands on app.html#space:tab, and that is
       where the person should be - not on Home, which is where they were
       several taps ago (§7d A: "back to where you were in the app").
       Anything else, or a hash naming a space they are not in, starts on
       Home exactly as before. */
    start: function () {
      if (fromHash()) return;
      S.space = 'me'; S.tab = 'home'; draw();
    }
  };
})(window);
