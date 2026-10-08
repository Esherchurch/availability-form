/* The Menu, as Martin approved it on 8 October 2026 (NEXT-BRIEF §16).
 *
 * ONE STRUCTURE, NOT THREE. The Menu, the hub's sidebar and its "Where to?"
 * list all read this. They had drifted apart - the Menu grouped pages by team
 * while the original portal groups them by what they are for, and two pages
 * that are only ever opened from inside the Sunday Service Planner had turned
 * up in it as if they were places to go. Martin could not find things.
 *
 * NAMES, ORDER AND HEADINGS ARE THE ORIGINAL PORTAL'S. NAV-AUDIT.md records
 * what the church actually uses, read off the live portal. This is not a
 * tidier arrangement somebody preferred; it is the one the team already knows.
 * If a change looks like an improvement, it goes in FINDINGS-app.md for Martin,
 * not in here.
 *
 * WHO SEES WHAT COMES FROM THE LOGIN, NOT FROM A LINK.
 *   (nothing)      everyone who is signed in
 *   core: true     somebody on Core Team
 *   admin: true    somebody who administers at least one area
 *   bookings: true an admin, or a bookings admin for any site
 * A heading with nothing visible under it is not drawn at all.
 *
 * A HEADING THAT IS ALSO A PAGE opens its charter - Worship & AV, Youth and
 * Core Team each do, exactly as on the original.
 */
(function () {
  'use strict';

  const TREE = [
    { title: 'Dashboard', url: 'hub.html', icon: 'layout-dashboard',
      description: 'Your own page: what is coming up and what needs you' },
    { title: 'Rota', url: 'view-only-rota.html', icon: 'calendar-days',
      description: 'Who is on, week by week' },
    { title: 'Meetings', url: 'meeting.html', icon: 'video',
      description: 'Set one up, join a call, every meeting room' },
    { title: "What's on", url: 'whatson.html', icon: 'calendar-heart',
      description: 'Church events, and signing up' },
    { title: 'Hire our rooms', url: 'hire.html', icon: 'door-open',
      description: 'What we have, and asking about it' },
    { title: 'Book a room', url: 'rooms.html', icon: 'calendar-clock',
      description: 'See what is free and book it' },

    /* Worship and AV people (Choir folds into Worship), and Core Team, who
       run them. Not Kids Church (Martin, 8 Oct 2026: "Kids church still sees
       all the menu items for worship"). */
    { title: 'Worship & AV', url: 'Worshipteamcharter.html', icon: 'music',
      team: ['Worship Team', 'AV Team', 'Core Team'],
      description: 'What the team is for, and how it works',
      children: [
        { title: 'Worship', icon: 'mic-vocal', children: [
          { title: 'Play-Through', url: 'EGBC-PlayThrough.html', icon: 'play-circle',
            description: 'Listen through a song before Sunday' },
          { title: 'Worship Training', url: 'EGBC-Training-Worship.html', icon: 'graduation-cap',
            description: 'How we do what we do' },
          { title: 'Music Databases', icon: 'library', children: [
            { title: 'Music Database', url: 'Library.html', icon: 'list-music',
              description: 'Every song, with its keys and files' },
            { title: 'Music Uploader', url: 'batchupload.html', icon: 'upload',
              description: 'Add several songs at once' }
          ] }
        ] },
        { title: 'AV', icon: 'sliders-horizontal', children: [
          { title: 'How-To AV', url: 'EGBC-HowTo-AV.html', icon: 'book-open',
            description: 'Step by step, for the desk and the screens' },
          { title: 'AV Troubleshoot', url: 'EGBC-Troubleshoot-AV.html', icon: 'wrench',
            description: 'When something is not working' },
          { title: 'Equipment', icon: 'package', children: [
            { title: 'Inventory', url: 'inventory-system-2.html', icon: 'boxes',
              description: 'What we have and where it lives' },
            { title: 'AV Infrastructure Mapper', url: 'schematic.html', icon: 'network',
              description: 'What is plugged into what' },
            { title: 'Monitor Setup', url: 'MonitorStageMap.html', icon: 'speaker',
              description: 'Who hears what on stage' }
          ] }
        ] }
      ] },

    { title: 'Youth', url: 'Youthcharter.html', icon: 'users',
      description: 'What the youth team is for, and how it works',
      children: [
        { title: 'Youth Service Planner', url: 'youthserviceplanner.html', icon: 'clipboard-list',
          description: 'Plan a youth service' }
      ] },

    /* KIDS CHURCH, beside Youth rather than inside Core Team.

       F-089 asked for "Children's register ... near Safeguarding", and
       Safeguarding was pencilled in under Core Team > Events and rooms
       (F-031). That heading is for rooms and events - Events, Places, Room
       bookings - and a children's register is neither. More to the point,
       THE PEOPLE WHO NEED IT ARE NOT ON CORE TEAM: a Kids Church leader
       would reach their own register through a heading called Core Team and
       another called Events and rooms, neither of which is about their work
       or says what they are looking for. That is the exact complaint Martin
       made about the old Menu.

       Room bookings already had to be bent into that shape - it sits under
       those two headings and is not gated on `core`, so its people get
       through headings that are not theirs. Once is a workaround; twice
       would be the wrong structure.

       So: a team heading, like Worship & AV and Youth. Kids Church has a
       charter but no page of its own, so the heading is only a heading.
       Safeguarding and Check-in belong here too when they ship. */
    { title: 'Kids Church', icon: 'baby', team: 'Kids Church',
      description: "The children's team, and the children in their care",
      children: [
        { title: "Children's register", url: 'kids-admin.html', icon: 'clipboard-list', team: 'Kids Church',
          description: 'The children, their groups, and who may collect them' }
        /* Safeguarding and Check-in go here when the events window ships
           them (F-031, F-090), not under Events and rooms. */
      ] },

    { title: 'Core Team', url: 'Coreteamcharter.html', icon: 'shield', core: true,
      description: 'What Core Team is for, and how it works',
      children: [
        { title: 'Planning', icon: 'calendar-range', core: true, children: [
          { title: 'Rota Planner', url: 'Planner.html', icon: 'calendar-plus', core: true,
            description: 'Build the term and send the rotas' },
          { title: 'Sunday Service Planner', url: 'SundayServicePlanner.html', icon: 'list-ordered', core: true,
            description: 'The order of service, songs and keys' },
          { title: 'Availability form', url: 'index.html', icon: 'check-square', core: true,
            description: 'What the team fills in each term' }
        ] },
        { title: 'People and email', icon: 'contact', core: true, children: [
          { title: 'Address Book', url: 'addressbook.html', icon: 'book-user', core: true,
            description: 'Who is on which team, and how to reach them' },
          { title: 'Email Compiler', url: 'EmailBuilder2.html', icon: 'mail', core: true,
            description: 'Write and send to a team' }
        ] },
        { title: 'Music', icon: 'music-2', core: true, children: [
          { title: 'Music Upload', url: 'music-uploader.html', icon: 'file-music', core: true,
            description: 'Add one song, with its files' }
        ] },
        /* The events window's pages go here (F-031): Check-in, Registers and
           Safeguarding under this heading when they ship. */
        { title: 'Events and rooms', icon: 'calendar-cog', core: true, admin: true, children: [
          { title: 'Events', url: 'events-admin.html', icon: 'calendar-check', core: true, admin: true,
            description: 'Make an event, see who is coming' },
          { title: 'Places', url: 'places-admin.html', icon: 'map-pin', core: true, admin: true,
            description: 'Sites, rooms and what is in them' },
          /* Not `admin`: a site's bookings admin looks after that site's
             bookings without administering a team, and gating this on admin
             alone hid the page from the very people it is for. The page turns
             anybody else away politely, so a wrong guess here is a wasted
             click and not a leak. */
          { title: 'Room bookings', url: 'bookings-admin.html', icon: 'calendar-check-2', bookings: true,
            description: 'Requests to approve, and what is booked' }
        ] },
        { title: 'Admin', icon: 'settings', core: true, admin: true, children: [
          { title: 'Backup & Restore', url: 'data-tools.html', icon: 'database-backup', core: true, admin: true,
            description: 'Take a copy of everything, or put one back' }
        ] }
      ] },

    { title: 'Resources', icon: 'folder-open', children: [
      { title: "Idea's pin board", url: 'stickynotes.html', icon: 'sticky-note',
        description: 'Anything anybody wants to raise' },
      { title: 'Apps and downloads', url: 'hubresources.html', icon: 'smartphone',
        description: 'Put the apps on your phone, and the files you may need' },
      { title: 'Team Resources', url: 'resources.html', icon: 'file-text',
        description: 'Charters, policies and the papers that go with them' },
      { title: 'Team Videos', url: 'videos.html', icon: 'clapperboard',
        description: 'Recordings worth keeping' }
      /* "Report a concern" goes here, for everyone, when it ships (F-031). */
    ] }
  ];

  /* Pages that are NOT in the Menu, and the reason, so nobody puts them back
     without knowing why. Each opens from inside the tool that needs it. */
  const OPENED_FROM_A_TOOL = {
    'sundayplannersonglibrary.html': 'the Sunday Service Planner\'s "songs database viewer" button',
    'song-summary.html': 'the Sunday Service Planner',
    'Serviceplannerinstructions.html': 'the Sunday Service Planner\'s ? button',
    'rotaplannerinstructions.html': 'the Rota Planner\'s ? button',
    'emailcompilerinstructions.html': 'the Email Compiler\'s ? button',
    'uploaderinstructions.html': 'the uploader\'s ? button'
  };

  /* What this person may see. `isCore` is membership of Core Team; `isAdmin`
     is administering at least one area. Both come from the signed-in profile,
     which is mirrored from the address book - never from which link was used
     to arrive, which is how the original portal did it and how somebody ended
     up with a Core Team menu by pasting a URL. */
  function visible(node, who) {
    if (node.core && !who.isCore) return false;
    if (node.admin && !who.isAdmin) return false;
    if (node.bookings && !who.isAdmin && !who.isBookingsAdmin) return false;
    /* On that team, or the person who administers it, or a master admin.
       Deliberately NOT "any admin": somebody who administers Worship is not
       the children's team, and a Menu that offers everybody everything is
       the wall this replaced. The page turns away anyone who gets there
       another way. */
    if (node.team && !onTeam(node.team, who)) return false;
    return true;
  }

  /* `team` is one team or a list of them; being on (or administering) any
     one of them is enough. */
  function onTeam(team, who) {
    if (who.isMaster) return true;
    return [].concat(team).some(function (t) {
      return (who.teams || []).indexOf(t) !== -1 ||
             (who.adminFor || []).indexOf(t) !== -1;
    });
  }

  function prune(nodes, who) {
    const out = [];
    for (const node of nodes) {
      /* Look under a heading BEFORE deciding about the heading. Somebody who
         looks after a site's room bookings is often not on Core Team, and
         Room bookings lives under Core Team > Events and rooms - testing the
         heading first hid the page from exactly the people it is for.

         A heading that is only opened by what is under it loses its own page:
         that person may reach Room bookings, and must not thereby be handed
         the Core Team charter. */
      const kids = node.children ? prune(node.children, who) : null;
      const hasKids = !!(kids && kids.length);
      const self = visible(node, who);
      if (!self && !hasKids) continue;

      /* A heading with nothing left under it and no page of its own is not
         drawn: an empty "Events and rooms" tells a member nothing except that
         there is something they cannot have. */
      if (node.children && !hasKids && !node.url) continue;

      const copy = Object.assign({}, node, { children: hasKids ? kids : undefined });
      if (!self) copy.url = undefined;
      out.push(copy);
    }
    return out;
  }

  /* Every page in the tree, flat, for anything that wants to ask "is this
     page in the Menu at all". */
  function flatten(nodes, acc) {
    acc = acc || [];
    for (const n of nodes || []) {
      if (n.url) acc.push(n);
      if (n.children) flatten(n.children, acc);
    }
    return acc;
  }

  /* ============ ONE MENU, DRAWN ONE WAY, ON EVERY PAGE ================

     Martin, 9 Oct 2026: the Menu differs between pages. hub.html loaded this
     file and drew the approved structure; every other page got egbc-shell.js,
     which still built its own groups out of the registry - Apps, Everyone, AV,
     Core Team, Worship. Two arrangements of the same pages, which is the whole
     thing Step N exists to stop, and he found it on the live site.

     So the markup AND the look live here, and both the hub's panel and the
     shell's call them. Not "the same structure drawn twice" - the same
     function, so there is nowhere for them to drift apart.

     The container needs class="egbc-menu"; css() puts the rules in once. */

  const CSS = [
    '.egbc-menu .grp{display:flex;align-items:center;gap:8px;width:100%;padding:12px 8px 6px;margin:4px 0 0;border:0;background:none;cursor:pointer;',
    '  font:600 12px Inter,system-ui,sans-serif;color:#6b7280;text-align:left;border-radius:6px}',
    '.egbc-menu .grp:hover{color:#111827}',
    '.egbc-menu .grp .cnt{margin-left:auto;font-weight:500;color:#9ca3af}',
    '.egbc-menu .grp .arw{display:inline-flex;align-items:center;color:#9ca3af;transition:transform .18s;',
    '  border:0;background:none;padding:0;cursor:pointer}',
    '.egbc-menu .grp.open .arw{transform:rotate(90deg)}',
    /* A heading that is also a page: the words open the charter, the arrow
       expands the group. */
    /* A heading that is also a page has to LOOK like something you can press.
       With no underline it read as a heading, and the three charters - Worship
       & AV, Youth, Core Team - were links nobody could tell were links. That
       is the fault Martin hit from the other side when he could not find the
       charters at all. Dotted at rest, solid on hover: visible, not shouty. */
    '.egbc-menu .grp .grp-link{color:inherit;text-decoration:underline;text-decoration-style:dotted;text-underline-offset:3px;text-decoration-color:#9ca3af}',
    '.egbc-menu .grp .grp-link:hover{color:#111827;text-decoration-style:solid;text-decoration-color:currentColor}',
    '.egbc-menu .grp .dot{width:8px;height:8px;border-radius:50%;background:#3d6263}',
    '.egbc-menu .grp-body{overflow:hidden;max-height:0;transition:max-height .22s ease}',
    '.egbc-menu .grp-body.open{max-height:2400px}',
    /* A heading inside a group - Worship, AV, Music Databases, Planning.
       Quieter than the group above it and than the pages below it, so the
       three levels read as three levels. */
    '.egbc-menu .grp-body .sub{font-size:12px;font-weight:500;color:#9ca3af;margin:10px 0 2px;letter-spacing:.01em}',
    '.egbc-menu .tool{display:flex;align-items:center;gap:12px;padding:8px;border-radius:8px;text-decoration:none;color:#111827;transition:background .12s;min-width:0}',
    '.egbc-menu .tool:hover{background:#f3f4f6}',
    '.egbc-menu .tool.on{background:#eef5f4}',
    '.egbc-menu .tool .ic{width:34px;height:34px;border-radius:8px;border:1px solid #e5e7eb;background:#fff;display:flex;align-items:center;justify-content:center;color:#3d6263;flex-shrink:0}',
    '.egbc-menu .tool .nm{font-size:14px;font-weight:500;line-height:1.3}',
    '.egbc-menu .tool .ds{display:block;font-size:12px;color:#6b7280;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.egbc-menu .tool .tx{min-width:0}',
    /* Beside the name, not under it. As a block it made the row three lines
       tall, and the icon no longer sat level with the first of them - which
       is exactly what the icon check calls "icon on its own line", and it
       said so. */
    '.egbc-menu .tool em{font-size:11px;font-style:normal;color:#3d6263;font-weight:600;margin-left:6px}',
    '.egbc-menu .mt-empty{padding:22px 10px;text-align:center;font-size:13px;color:#6b7280}'
  ].join('\n');

  function css() {
    if (document.getElementById('egbc-menu-css')) return;
    var s = document.createElement('style');
    s.id = 'egbc-menu-css';
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  function esc(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/[&<>"]/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
      });
  }

  /* An icon, however the page draws them. The hub has Lucide loaded and
     swaps <i data-lucide> in place; a page without it still gets the element
     and simply shows nothing, which is what it did before. */
  function icon(name, size) {
    return '<i data-lucide="' + esc(name || 'file') + '" style="width:' +
      (size || 18) + 'px;height:' + (size || 18) + 'px"></i>';
  }

  /* THE MENU AS HTML.
   *
   *   who         from EGBCMenu.who(), or passed in for a test
   *   query       what is typed in the search box; searching flattens the
   *               tree, because when you are hunting for one page the
   *               headings are in the way
   *   here        the file name of the page being looked at, so it can say
   *               "You are here"
   *   switchedOff a function(url) -> true for a page an admin has disabled.
   *               The registry still decides what is switched ON; this
   *               decides where it sits.
   */
  function panelHtml(opts) {
    opts = opts || {};
    const who = opts.who || api.who();
    const q = String(opts.query || '').trim().toLowerCase();
    const here = String(opts.here || '').toLowerCase();
    const off = opts.switchedOff || function () { return false; };

    const matches = (n) =>
      !q || ((n.title || '') + ' ' + (n.description || '')).toLowerCase().indexOf(q) !== -1;

    function filterTree(nodes) {
      const out = [];
      for (const n of nodes) {
        if (n.url && off(n.url)) continue;
        const kids = n.children ? filterTree(n.children) : null;
        if (!(matches(n) || (kids && kids.length))) continue;
        out.push(kids && kids.length ? Object.assign({}, n, { children: kids })
                                     : Object.assign({}, n, { children: undefined }));
      }
      return out;
    }

    const tree = filterTree(prune(TREE, who));
    if (!tree.length) {
      return '<div class="mt-empty">' + (q ? 'Nothing matches that.' : 'Nothing here.') + '</div>';
    }

    const isHere = (n) => here && String(n.url || '').toLowerCase() === here;

    /* One row, whether it is a page or a heading that is also a page. */
    const row = (n, depth) =>
      '<a class="tool' + (isHere(n) ? ' on' : '') + '" href="' + esc(n.url) +
        '" title="' + esc(n.description || '') + '"' +
        (depth ? ' style="padding-left:' + (14 + depth * 14) + 'px"' : '') + '>' +
        '<span class="ic">' + icon(n.icon, 18) + '</span>' +
        '<span class="tx"><span class="nm">' + esc(n.title) + '</span>' +
        (isHere(n) ? '<em>You are here</em>' : '') +
        '<span class="ds">' + esc(n.description || '') + '</span></span>' +
      '</a>';

    /* Searching flattens it. */
    if (q) {
      const flat = [];
      (function walk(nodes) {
        nodes.forEach(function (n) {
          if (n.url && matches(n)) flat.push(n);
          if (n.children) walk(n.children);
        });
      })(tree);
      return flat.length ? flat.map(function (n) { return row(n, 0); }).join('')
                         : '<div class="mt-empty">Nothing matches that.</div>';
    }

    function inner(nodes, depth) {
      return nodes.map(function (n) {
        if (!n.children) return row(n, depth);
        return '<div class="sub" style="padding-left:' + (14 + depth * 14) + 'px">' +
                 esc(n.title) + '</div>' +
               (n.url ? row(n, depth + 1) : '') +
               inner(n.children, depth + 1);
      }).join('');
    }

    /* Which group opens itself: the one holding the page being looked at,
       otherwise Core Team for Core Team and Worship & AV for everybody else -
       the section each person lives in. Everything open at once is the wall
       this replaced. */
    const holdsHere = (n) => {
      let found = false;
      (function walk(nodes) {
        nodes.forEach(function (c) {
          if (isHere(c)) found = true;
          if (c.children) walk(c.children);
        });
      })(n.children || []);
      return found || isHere(n);
    };

    return tree.map(function (n, i) {
      if (!n.children) return row(n, 0);
      const open = holdsHere(n) || (who.isCore ? n.title === 'Core Team' : n.title === 'Worship & AV');
      const count = inner(n.children, 0).split('class="tool').length - 1;
      /* A heading that is ALSO a page - Worship & AV, Youth, Core Team - opens
         its charter, as on the original. So the words are a link and the arrow
         is what expands it. */
      const head = n.url
        ? '<a class="grp-link" href="' + esc(n.url) + '" title="' + esc(n.description || '') + '">' + esc(n.title) + '</a>'
        : '<span>' + esc(n.title) + '</span>';
      return '<div class="grp' + (open ? ' open' : '') + '">' +
          '<button class="arw" onclick="EGBCMenu.toggleGroup(this.parentElement)" aria-label="Show or hide ' + esc(n.title) + '">' +
            icon('chevron-right', 14) + '</button>' +
          '<span class="dot"></span>' + head +
          '<span class="cnt">' + count + '</span>' +
        '</div>' +
        '<div class="grp-body' + (open ? ' open' : '') + '">' + inner(n.children, 0) + '</div>';
    }).join('');
  }

  /* Draw it into an element, put the CSS in, and let the page swap its icons.
     Both the hub and the shell call this and nothing else. */
  function paint(el, opts) {
    if (!el) return;
    css();
    el.classList.add('egbc-menu');
    el.innerHTML = panelHtml(opts);
    /* §19: "Powered by Church HQ", under the last item. Here rather than in
       the two panels, so the shell's Menu and the hub's cannot end up with
       one having it and the other not. Quiet by design: the church's own
       name and logo are the brand everywhere else on the screen.

       A page that has not loaded the snippet simply has no credit, which is
       better than the Menu failing to draw. */
    if (window.EGBCPoweredBy) {
      el.insertAdjacentHTML('beforeend', EGBCPoweredBy.html({ padding: '18px 12px 10px' }));
    }
    if (window.EGBCUI && EGBCUI.icons) EGBCUI.icons();
    else if (window.lucide && lucide.createIcons) lucide.createIcons();
  }

  function toggleGroup(grp) {
    if (!grp) return;
    const body = grp.nextElementSibling;
    const open = grp.classList.toggle('open');
    if (body) body.classList.toggle('open', open);
  }

  window.EGBCMenu = {

    TREE: TREE,
    OPENED_FROM_A_TOOL: OPENED_FROM_A_TOOL,
    /* who: { isCore, isAdmin } */
    forPerson: function (who) { return prune(TREE, who || {}); },
    allPages: function () { return flatten(TREE); },
    /* Straight from the signed-in profile, so every caller asks the same way. */
    who: function () {
      /* effectiveTeams, isMaster and isAdmin honour "View the site as", so a
         master admin previewing as a Worship member sees that member's Menu
         (Martin, 8 Oct 2026: "If i am in as a worship team, i shouldnt even
         see the links for core team"). The raw profile ignored the preview. */
      const A = window.EGBCAuth;
      const p = (A && A.profile && A.profile()) || null;
      const previewing = !!(A && A.viewingAs && A.viewingAs());
      const teams = (A && A.effectiveTeams) ? A.effectiveTeams() : ((p && p.teams) || []);
      /* adminAreas honours the preview the same way: a master admin looking
         as a Worship member administers Worship and nothing else. */
      const adminFor = (A && A.adminAreas) ? A.adminAreas() : ((p && p.adminFor) || []);
      return {
        teams: teams,
        adminFor: adminFor,
        isMaster: !!(A && A.isMaster && A.isMaster()),
        isCore: teams.indexOf('Core Team') !== -1 || !!(A && A.isMaster && A.isMaster()),
        isAdmin: !!(A && A.isAdmin && A.isAdmin()),
        /* Who looks after a site's bookings is a list of member ids inside
           bookingSettings, which means a read. Whoever draws the Menu does
           that read and sets this before drawing; unset means "not one",
           which is the safe way round. */
        isBookingsAdmin: !previewing && window.EGBC_BOOKINGS_ADMIN === true
      };
    },

    /* The Menu as HTML, and the one way of drawing it. Both the hub's panel
       and egbc-shell.js's call paint() - not two renderers agreeing, one
       renderer. */
    panelHtml: panelHtml,
    paint: paint,
    css: css,
    toggleGroup: toggleGroup
  };
  const api = window.EGBCMenu;
})();
