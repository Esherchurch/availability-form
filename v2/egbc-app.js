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
      label: 'Me and my family', colour: '#3d6263',
      tabs: [['home', 'Home', 'house'], ['whatson', "What's on", 'calendar-days'],
             ['listen', 'Listen', 'headphones'], ['me', 'Me', 'circle-user']]
    },
    worship: {
      label: 'Worship & AV', colour: '#4a5f7a',
      teams: ['Worship Team', 'AV Team', 'Choir'],
      tabs: [['rota', 'Rota', 'calendar-check'], ['sunday', 'Sunday', 'list-music'],
             ['learn', 'Learn', 'graduation-cap'], ['team', 'Team', 'users']]
    },
    kids: {
      label: 'Kids Church', colour: '#7a5f4a', teams: ['Kids Church'],
      tabs: [['today', 'Today', 'sun'], ['children', 'Children', 'baby'],
             ['rota', 'Rota', 'calendar-check'], ['team', 'Team', 'users']]
    },
    youth: { label: 'Youth', colour: '#5f7a4a', teams: ['Youth Worship'], tabs: SIMPLE_TABS },
    lazers: { label: 'Lazers', colour: '#8a4a3d', teams: ['Lazers'], tabs: SIMPLE_TABS },
    renu: { label: 'ReNu', colour: '#3d6b5f', teams: ['ReNu'], tabs: SIMPLE_TABS },
    maint: {
      label: 'Maintenance', colour: '#4f5a66', teams: ['Maintenance'],
      tabs: [['jobs', 'Jobs', 'wrench'], ['rooms', 'Rooms', 'door-closed'],
             ['team', 'Team', 'users']]
    },
    office: {
      label: 'Running things', colour: '#111827', runsThings: true,
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
    return /^(close|tab:[a-z-]+|sheet:[a-z-]+|go:[a-z]+:[a-z-]+|open:[A-Za-z0-9._%&=?-]+|toast:.{1,120})$/
      .test(String(a || ''));
  }

  /* A list row. title and sub are TEXT and are escaped; right is HTML. */
  function row(icon, title, sub, right, act, colour) {
    var a = actOk(act) ? ' data-act="' + esc(act) + '"' : '';
    var c = colour ? ' style="--c:' + esc(colour) + '"' : '';
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
  function next(day, mon, title, sub, actions, colour) {
    return '<div class="card next"' + (colour ? ' style="--c:' + esc(colour) + '"' : '') + '>'
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

  function who() {
    var p = (global.EGBCAuth && EGBCAuth.profile && EGBCAuth.profile()) || {};
    var teams = (global.EGBCAuth && EGBCAuth.effectiveTeams && EGBCAuth.effectiveTeams()) || p.teams || [];
    return {
      first: String(p.name || '').split(/\s+/)[0] || 'there',
      name: p.name || '',
      teams: teams,
      adminFor: p.adminFor || [],
      isMaster: !!(global.EGBCAuth && EGBCAuth.isMaster && EGBCAuth.isMaster()),
      isAdmin: !!(global.EGBCAuth && EGBCAuth.isAdmin && EGBCAuth.isAdmin()),
      churchMember: !!p.churchMember,
      /* Which Running things tabs, from the groups this person is in
         (§25). The shell never works this out for itself - one answer,
         shared with the Menu. */
      runs: (global.EGBCAuth && EGBCAuth.runsTabs) ? EGBCAuth.runsTabs() : []
    };
  }

  /* A person only ever sees their OWN teams (§2). Somebody on no team sees
     no row of spaces at all, which is the Attender case and is deliberate -
     not an empty row, no row. */
  function spacesFor(me) {
    var out = ['me'];
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
      var mine = (s.teams || []).some(function (t) {
        return me.teams.indexOf(t) !== -1 || me.adminFor.indexOf(t) !== -1;
      });
      if (mine || me.isMaster) out.push(k);
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
    /* Running things shows ONLY the tabs this person runs (§25). Somebody
       in the Bookings group gets one tab, not four with three refusals
       behind them - "a tab someone sees must actually work". */
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
      + '<div class="top-row"><span class="logo">EGBC</span>'
      + '<span class="top-title">EGBC Hub</span></div>';

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
    if (a === 'close') { S.sheet = null; return draw(); }
    if (a.indexOf('tab:') === 0) { S.tab = a.slice(4); S.sheet = null; return draw(); }
    if (a.indexOf('sheet:') === 0) { S.sheet = a.slice(6); return draw(); }
    if (a.indexOf('go:') === 0) { var g = a.split(':'); return go(g[1], g[2]); }
    /* open: a page that already does the job (§5). The app does not rebuild
       what v2 already has; it opens it. */
    if (a.indexOf('open:') === 0) { location.href = a.slice(5); return; }
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
    state: function () { return { space: S.space, tab: S.tab, sheet: S.sheet }; },
    start: function () { S.space = 'me'; S.tab = 'home'; draw(); }
  };
})(window);
