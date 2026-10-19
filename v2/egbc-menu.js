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
 *   master: true   a master admin only
 *   adminOf: [..]  an admin of one of those areas, or a master admin
 *   bookings: true an admin, or a bookings admin for any site
 *   messages: true master admins, the Church office and team leaders -
 *                  who may email and post notices (WHO MAY, 16 Oct 2026)
 *   feature: 'x'   only when the church uses that part (HANDOVER-MAIN
 *                  rule 12, EGBCChurch.uses); everything is on until the
 *                  per-church switch exists
 * A heading with nothing visible under it is not drawn at all.
 *
 * A HEADING THAT IS ALSO A PAGE opens its charter - Worship & AV, Youth and
 * Core Team each do, exactly as on the original.
 */
(function () {
  'use strict';

  /* THE MENU BY JOB (Martin approved the mock-ups, 19 Oct 2026:
     design-mocks/navigation). The same in the website's Menu, the hub's
     left column and the app: the everyday things first, then a section
     for each job - Sundays, People and messages, Events and rooms, Church
     admin - then each team's own area, then Resources.

     A SECTION (`section: true`) is a label with its pages under it, always
     open. `fold: true` sections (Events and rooms, Church admin) fold away
     when they hold more than FOLD_OVER pages, so the office's Menu is not a
     wall; whoever has only a few of them sees them open. Each section is
     drawn only for somebody who can use something in it (prune()).

     Every page and every gate the 8 Oct Menu had is still here - nothing
     was taken away, only moved. Address book and Send an email follow WHO
     MAY (16 Oct): master admins, the Church office and team leaders
     (`messages: true`), which is what their pages' guards already say. */
  const TREE = [
    { title: 'Home', url: 'hub.html', icon: 'house',
      description: 'Your own page: what is coming up and what needs you' },
    { title: "What's on", url: 'whatson.html', icon: 'calendar-heart',
      description: 'Church events, and signing up' },
    /* WATCH & LISTEN for everyone (Martin, 15 Oct 2026). */
    { title: 'Watch & Listen', url: 'watch.html', icon: 'circle-play',
      description: 'Sunday services, videos and sermons' },
    /* No team on it: giving is for everybody signed in (the bank details
       are not readable until you have signed in). */
    { title: 'Give', url: 'give.html', icon: 'hand-coins',
      description: 'The church’s bank details, and Gift Aid' },
    /* GIFT AID (the events window's giftaid.html, F-169): your own
       declaration. Feature 'giftAid'. */
    { title: 'Gift Aid', url: 'giftaid.html', icon: 'receipt', feature: 'giftAid',
      description: 'Your Gift Aid declaration' },
    /* CARE & SUPPORT (Martin, 14 Oct 2026): pastoral care for yourself,
       "I'm worried about someone", and prayer. Gated on nothing but the
       church's switch; the readers' inbox for the Pastoral team and the
       safeguarding lead and deputy only. */
    { title: 'Care & support', url: 'care.html', icon: 'hand-heart', feature: 'care',
      description: 'Pastoral care for you, or tell us you are worried about someone' },
    { title: 'Care & support: what has come in', url: 'care-inbox.html', icon: 'inbox', feature: 'care', careReader: true,
      description: 'For the pastoral team and the safeguarding lead and deputy' },
    /* PRAYER (the events window's prayer.html, F-166). Feature 'prayer'. */
    { title: 'Prayer', url: 'prayer.html', icon: 'church', feature: 'prayer',
      description: 'Prayer requests and praise reports' },
    /* Phone notifications (FINDINGS-notify N-5): your own switches. */
    { title: 'Notifications', url: 'notifications.html', icon: 'bell-ring', feature: 'notifications',
      description: 'On this phone, and which ones you get' },

    { title: 'Sundays', section: true, icon: 'calendar-days', children: [
      /* anyTeam: the rota is for people on a team - the rules refuse it
         to anyone else. */
      { title: 'Rota', url: 'view-only-rota.html', icon: 'calendar-days', anyTeam: true,
        description: 'Who is on, week by week' },
      { title: 'Rota planner', url: 'Planner.html', icon: 'calendar-plus', core: true,
        description: 'Build the term, send the rotas' },
      { title: 'Sunday service plan', url: 'SundayServicePlanner.html', icon: 'list-ordered', core: true,
        description: 'Songs, keys and the order' },
      /* The Preaching plan (Ryan, the Pastor). */
      { title: 'Preaching plan', url: 'preaching-plan.html', icon: 'book-open', anyTeam: true, feature: 'preachingPlan',
        description: 'Speakers, readers, passages' },
      /* The events window's session planner (F-226): a plan group's
         leaders and team, and master admins. */
      { title: 'Session planner', url: 'session-planner.html', icon: 'notebook-pen', planGroup: true, feature: 'sessionPlanner',
        description: 'Plan each week’s session, with your team' },
      /* ROTA REPORTS (the events window's, F-210): admins of the rota
         teams and master admins. */
      { title: 'Rota reports', url: 'rota-reports.html', icon: 'clipboard-list', feature: 'rotaReports',
        adminOf: ['Worship Team', 'AV Team', 'Choir', 'Kids Church', 'Youth Worship', 'Core Team'],
        description: 'Clashes, gaps and who is serving how often' },
      { title: 'Availability form', url: 'index.html', icon: 'check-square', core: true,
        description: 'What the team fills in each term' }
    ] },

    { title: 'People and messages', section: true, icon: 'contact', children: [
      { title: 'Address book', url: 'addressbook.html', icon: 'book-user', messages: true,
        description: 'Who is on which team, and how to reach them' },
      { title: 'Send an email', url: 'EmailBuilder2.html', icon: 'mail', messages: true,
        description: 'Write to your team, or (the office) anyone' },
      /* The events window's team-mail.html (F-207): which address each
         team sends from. Master admins; feature 'teamMail'. */
      { title: 'Team emails', url: 'team-mail.html', icon: 'at-sign', master: true, feature: 'teamMail',
        description: 'Which address each team’s emails come from' },
      /* The hub's notices: post one (the editor opens), or manage them. */
      { title: 'Notices', url: 'hub.html?notices=1', icon: 'megaphone', messages: true,
        description: 'Post one, or manage them' },
      { title: 'Meetings', url: 'meeting.html', icon: 'video',
        description: 'Set one up, join a call, every meeting room' }
    ] },

    { title: 'Events and rooms', section: true, fold: true, icon: 'calendar-cog', children: [
      /* eventTeam (F-212): also for anybody on an event's team. */
      { title: 'Events', url: 'events-admin.html', icon: 'calendar-check', core: true, admin: true, eventTeam: true,
        description: 'Make an event, see who is coming' },
      /* The "bookings" part of Running things (F-226). */
      { title: 'Places', url: 'places-admin.html', icon: 'map-pin', runs: 'bookings',
        description: 'Sites, rooms and what is in them' },
      /* Not `admin`: a site's bookings admin often administers no team. */
      { title: 'Room bookings', url: 'bookings-admin.html', icon: 'calendar-check-2', bookings: true,
        description: 'Requests to approve, and what is booked' },
      { title: 'Check-in', url: 'checkin.html', icon: 'user-check', core: true, admin: true,
        description: 'Check people in at an event, with its tickets' },
      { title: 'Registers', url: 'attendance.html', icon: 'clipboard-check', core: true, admin: true,
        description: 'Who came to an event or a series, to download' },
      /* The Kids Church leads and master admins (F-226). */
      { title: 'Headcounts', url: 'headcounts.html', icon: 'chart-column', headcount: true,
        description: 'How many came on a Sunday, week by week' },
      /* F-176. */
      { title: 'Picture library', url: 'picture-library.html', icon: 'images', runs: 'bookings', feature: 'pictureLibrary',
        description: 'Pictures the church uses again and again' },
      /* For everybody: booking, hiring, and reporting something broken
         (the events window's maintenance.html, F-123). */
      { title: 'Book a room', url: 'rooms.html', icon: 'calendar-clock',
        description: 'See what is free and book it' },
      { title: 'Hire our rooms', url: 'hire.html', icon: 'door-open',
        description: 'What we have, and asking about it' },
      { title: 'Maintenance', url: 'maintenance.html', icon: 'wrench',
        description: 'Report something broken, and what is being fixed' }
    ] },

    { title: 'Church admin', section: true, fold: true, icon: 'settings', children: [
      { title: 'Church settings', url: 'church-settings.html', icon: 'sliders-horizontal', core: true, admin: true,
        description: 'The church\'s name and logo, giving details, and phone notifications on or off' },
      /* Master admins and the Church office (Martin, 15 Oct 2026). */
      { title: 'Teams and groups', url: 'teams-admin.html', icon: 'users-round', team: 'Church office',
        description: 'Add, rename, recolour, order and archive teams' },
      /* The money team, by its name (F-200), and master admins. */
      { title: 'Payments', url: 'payments.html', icon: 'credit-card', money: true,
        description: 'Card and bank payments through the church\'s own Stripe and GoCardless, with step-by-step guides' },
      /* The safeguarding lead and deputy and anybody who administers
         something (Martin, 14 Oct 2026). */
      { title: 'Safeguarding', url: 'safeguarding.html', icon: 'shield-check', sg: true,
        description: 'Leaders’ DBS checks and training, and exceptions' },
      { title: 'Safeguarding settings', url: 'safeguarding-settings.html', icon: 'settings-2', sg: true,
        description: 'Who the lead is, how long checks last, and the ratios' },
      { title: 'Due for deletion', url: 'retention.html', icon: 'trash-2', sg: true,
        description: 'Records whose keeping time is up, to check and delete' },
      /* Run by whoever administers a team. */
      { title: 'Small groups', url: 'groups-admin.html', icon: 'users-round', admin: true,
        description: 'Groups, their leaders, members and meetings' },
      { title: 'Forms', url: 'forms-admin.html', icon: 'list-checks', admin: true,
        description: 'Consent and sign-up forms, and their answers' },
      /* Master admins only (Martin, 15 Oct 2026). */
      { title: 'Emails sent', url: 'comms.html', icon: 'mail-check', core: true, admin: true, master: true,
        description: 'Every email the church sent, and any that failed' },
      /* Master admins and the people who look after sermons (F-164). */
      { title: 'Manage Watch', url: 'watch-admin.html', icon: 'tv', feature: 'watch', sermons: true,
        description: 'This week’s live link, the full services and the channel' },
      { title: 'Manage sermons', url: 'sermons-admin.html', icon: 'book-open-text', feature: 'sermons', sermons: true,
        description: 'The series and passages, and the podcast feed' },
      { title: 'Backup', url: 'data-tools.html', icon: 'database-backup', core: true, admin: true,
        description: 'Take a copy of everything, or put one back' }
    ] },

    /* EACH TEAM'S OWN AREA. A team heading: off the team, nothing under it
       either (prune()). Core Team still gets Worship & AV, through
       EGBCAuth.inTeam's cover (CORE_COVERS), not a list kept here. A
       heading that is also a page opens its charter. */
    { title: 'My teams', section: true, icon: 'users', children: [
      { title: 'Worship & AV', url: 'Worshipteamcharter.html', icon: 'music',
        team: ['Worship Team', 'AV Team'],
        description: 'What the team is for, and how it works',
        children: [
          { title: 'Play-Through', url: 'EGBC-PlayThrough.html', icon: 'play-circle',
            description: 'Listen through a song before Sunday' },
          { title: 'Worship Training', url: 'EGBC-Training-Worship.html', icon: 'graduation-cap',
            description: 'How we do what we do' },
          { title: 'Music Database', url: 'Library.html', icon: 'list-music',
            description: 'Every song, with its keys and files' },
          /* leaderOf: the page is for Worship leaders (data-role="leader"). */
          { title: 'Music Uploader', url: 'batchupload.html', icon: 'upload', leaderOf: 'Worship Team',
            description: 'Add several songs at once' },
          { title: 'How-To AV', url: 'EGBC-HowTo-AV.html', icon: 'book-open',
            description: 'Step by step, for the desk and the screens' },
          { title: 'AV Troubleshoot', url: 'EGBC-Troubleshoot-AV.html', icon: 'wrench',
            description: 'When something is not working' },
          /* leaderOf: the page is for AV leaders (data-role="leader"). */
          { title: 'Inventory', url: 'inventory-system-2.html', icon: 'boxes', leaderOf: 'AV Team',
            description: 'What we have and where it lives' },
          { title: 'AV Infrastructure Mapper', url: 'schematic.html', icon: 'network',
            description: 'What is plugged into what' },
          { title: 'Monitor Setup', url: 'MonitorStageMap.html', icon: 'speaker',
            description: 'Who hears what on stage' },
          /* Admins of AV or Worship only (FINDINGS-churchshow.md R1-R3). */
          { title: 'Connect ChurchShow', url: 'churchshow.html', icon: 'monitor-play',
            admin: true, adminOf: ['AV Team', 'Worship Team'],
            description: 'Sign the projection computers in to the hub' }
        ] },
      /* The youth teams and their leaders (Martin, 15 Oct 2026). */
      { title: 'Youth', url: 'Youthcharter.html', icon: 'users', team: ['Youth Worship', 'Lazers', 'ReNu'],
        description: 'What the youth team is for, and how it works',
        children: [
          { title: 'Youth Service Planner', url: 'youthserviceplanner.html', icon: 'clipboard-list', team: 'Youth Worship',
            description: 'Plan a youth service' }
        ] },
      /* KIDS CHURCH (F-089): the children's team's own area. */
      { title: 'Kids Church', icon: 'baby', team: 'Kids Church',
        description: "The children's team, and the children in their care",
        children: [
          { title: "Children's register", url: 'kids-admin.html', icon: 'clipboard-list', team: 'Kids Church',
            description: 'The children, their groups, and who may collect them' },
          { title: 'Sunday check-in', url: 'kids-checkin.html', icon: 'scan-line', team: 'Kids Church',
            description: 'The desk on a Sunday: check children in and out, labels and the fire roll-call' }
        ] },
      { title: 'Core Team', url: 'Coreteamcharter.html', icon: 'shield', core: true,
        description: 'What Core Team is for, and how it works',
        children: [
          { title: 'Music Upload', url: 'music-uploader.html', icon: 'file-music', core: true,
            description: 'Add one song, with its files' }
        ] }
    ] },

    { title: 'Resources', section: true, icon: 'folder-open', children: [
      /* anyTeam: for people who serve on a team (Martin, 15 Oct 2026). */
      { title: 'Pin boards', url: 'stickynotes.html', icon: 'sticky-note', anyTeam: true,
        description: 'Anything anybody wants to raise' },
      { title: 'Apps and downloads', url: 'hubresources.html', icon: 'smartphone',
        description: 'Put the apps on your phone, and the files you may need' },
      { title: 'Team Resources', url: 'resources.html', icon: 'file-text', anyTeam: true,
        description: 'Charters, policies and the papers that go with them' },
      { title: 'Team Videos', url: 'videos.html', icon: 'clapperboard', anyTeam: true,
        description: 'Recordings worth keeping' }
    ] }
  ];
  /* A fold section with more pages than this folds away. */
  const FOLD_OVER = 4;

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
    /* A part the church does not use is not drawn at all. A page without
       egbc-church.js counts it as used, which is what everything is until
       the per-church switch exists. */
    if (node.feature && window.EGBCChurch && EGBCChurch.uses && !EGBCChurch.uses(node.feature)) return false;
    /* On an event's team (F-212): that is enough for the entry that says so,
       whatever the flags below would say. */
    if (node.eventTeam && who.isEventTeam) return true;
    if (node.core && !who.isCore) return false;
    /* Section 21: members-only things do not appear for an Attender, with no
       locked door. prune() then drops a heading left with nothing under it,
       so there is not even an empty section to wonder about. Nothing in the
       tree carries this yet - members-only documents and notices need an
       audience field on resources and news first - but the Menu is where
       they will hang, and the mechanism is tested rather than waiting. */
    if (node.members && !who.isChurchMember) return false;
    if (node.admin && !who.isAdmin) return false;
    /* adminOf: an admin of one of these areas (or a master admin), the same
       test the page's own guard makes. Plain admin: true lets in an admin of
       ANY area, so a Kids Church admin on the AV team was shown Connect
       ChurchShow and then turned away by the page (Martin, 14 Oct 2026). */
    if (node.adminOf && !who.isMaster &&
        !node.adminOf.some(function (t) { return (who.adminFor || []).indexOf(t) !== -1; })) return false;
    if (node.bookings && !who.isAdmin && !who.isBookingsAdmin) return false;
    if (node.sermons && !who.isSermons) return false;
    if (node.careReader && !who.isCareReader) return false;
    /* Safeguarding: the lead and deputy (careRouting/status, kept by the
       server) or anybody who administers something. */
    if (node.sg && !who.isAdmin && !who.isSgLead) return false;
    /* On the money team, by whatever name the church gives it, or a master
       admin (who.isMaster honours "View the site as"). */
    if (node.money && !who.isMaster && (who.teams || []).indexOf(who.moneyTeam || 'Finance') === -1) return false;
    /* `runs` NAMES A RUNNING THINGS TAB (NEXT-BRIEF §25): the same four the
       app's Running things space has, answered by the same helper. A node
       carrying one is shown to whoever that tab is for, whatever else the
       flags above say - so the church administrator, who may be on no team
       and administer nothing, reaches the address book, and the Worship
       admin who is in no group does not. */
    if (node.runs && (who.runs || []).indexOf(node.runs) === -1) return false;
    /* On that team, or the person who administers it, or a master admin.
       Deliberately NOT "any admin": somebody who administers Worship is not
       the children's team, and a Menu that offers everybody everything is
       the wall this replaced. The page turns away anyone who gets there
       another way. */
    if (node.team && !onTeam(node.team, who)) return false;
    if (node.master && !who.isMaster) return false;
    /* A leader of that team, as the page's own guard decides it. */
    if (node.leaderOf && !who.isMaster && !(window.EGBCAuth && EGBCAuth.isLeaderOf && EGBCAuth.isLeaderOf(node.leaderOf))) return false;
    /* On any team, administering one, or a master admin. */
    if (node.anyTeam && !who.isMaster && !(who.teams || []).length && !(who.adminFor || []).length) return false;
    if (node.planGroup && !who.isPlanGroup) return false;
    if (node.headcount && !who.mayHeadcount) return false;
    if (node.messages && !who.mayMessage) return false;
    return true;
  }

  /* `team` is one team or a list of them; being on (or administering) any
     one of them is enough. */
  function onTeam(team, who) {
    if (who.isMaster) return true;
    return [].concat(team).some(function (t) {
      /* EGBCAuth.inTeam, so the Menu and every page guard answer this the
         same way. The difference it makes is Core Team: on the old portal
         the Core Team link showed every Worship & AV item plus Core's own
         (Martin, 11 Oct 2026, "core team cant see worship and AV"), and
         the cover for that lives in one place - CORE_COVERS in
         egbc-auth.js. The Menu used to carry its own copy of it.
         The fallback is the plain membership test, for the case where the
         Menu is drawn with no EGBCAuth on the page. It deliberately has
         NO cover in it: a quiet second copy of the rule is the thing this
         change exists to remove. */
      return (window.EGBCAuth && EGBCAuth.inTeam
                ? EGBCAuth.inTeam(t)
                : (who.teams || []).indexOf(t) !== -1)
        || (who.adminFor || []).indexOf(t) !== -1;
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
      /* A TEAM heading is different: not on the team means nothing under it
         either. Otherwise Worship & AV's ungated pages kept the heading on
         screen for Kids Church (Martin, 8 Oct 2026). */
      if (node.team && !onTeam(node.team, who)) continue;
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
    '  border:0;background:none;padding:0;cursor:pointer;min-width:44px;min-height:44px;justify-content:center;margin:-12px -10px -12px -6px}',
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
    '.egbc-menu .mt-empty{padding:22px 10px;text-align:center;font-size:13px;color:#6b7280}',
    /* Menu by job (19 Oct 2026): a section's label, and the two quick
       buttons at the top for whoever may email and post. */
    '.egbc-menu .sec-h{padding:16px 8px 4px;font:600 12px Inter,system-ui,sans-serif;color:#6b7280}',
    '.egbc-menu .quick{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:2px 0 8px}',
    '.egbc-menu .quick a{display:flex;align-items:center;gap:8px;min-height:44px;padding:8px 12px;border-radius:10px;background:#eef5f4;color:#111827;',
    '  font:600 14px Inter,system-ui,sans-serif;text-decoration:none}',
    '.egbc-menu .quick a:hover{background:#e2eeec}',
    '.egbc-menu .quick svg,.egbc-menu .quick i{color:#3d6263;flex-shrink:0}'
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

    /* The two jobs Home has buttons for, at the top of the Menu too, for
       whoever may do them (WHO MAY). Not while searching. */
    const quick = who.mayMessage && !opts.noQuick
      ? '<div class="quick">' +
          '<a href="EmailBuilder2.html">' + icon('mail', 16) + '<span>Send an email</span></a>' +
          '<a href="hub.html?notice=new">' + icon('megaphone', 16) + '<span>Post a notice</span></a>' +
        '</div>'
      : '';

    return quick + tree.map(function (n, i) {
      if (!n.children) return row(n, 0);
      const count = inner(n.children, 0).split('class="tool').length - 1;
      /* A SECTION: its label and its pages, open - unless it is one that
         folds and holds more than FOLD_OVER pages for this person, and not
         the page being looked at. */
      if (n.section && (opts.unfold || !(n.fold && count > FOLD_OVER && !holdsHere(n)))) {
        return '<div class="sec-h">' + esc(n.title) + '</div>' + inner(n.children, 0);
      }
      const open = holdsHere(n);
      /* A heading that is ALSO a page - Worship & AV, Youth, Core Team - opens
         its charter, as on the original. So the words are a link and the arrow
         is what expands it. */
      const head = n.url
        ? '<a class="grp-link" href="' + esc(n.url) + '" title="' + esc(n.description || '') + '">' + esc(n.title) + '</a>'
        : '<span>' + esc(n.title) + '</span>';
      return '<div class="grp' + (n.section ? ' fold' : '') + (open ? ' open' : '') + '">' +
          '<button class="arw" onclick="EGBCMenu.toggleGroup(this.parentElement)" aria-label="Show or hide ' + esc(n.title) + '">' +
            icon('chevron-right', 14) + '</button>' +
          (n.section ? '' : '<span class="dot"></span>') + head +
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


  /* ==== THE "YOU" MENU, under the initials (Martin, 13 Oct 2026) ========

     "Tapping the initials only offers Sign out - Notifications is the
     logical place." So the initials open a small menu of the person's own
     things, on the hub and every other page alike: ONE renderer, here,
     because two menus kept in step is how the Menu drifted before (A-024).

     The items and their order are Martin's:
       Notifications          feature 'notifications' (HANDOVER-MAIN rule 12)
       My details             read-only for now: what the church holds, and
                              "ask the office" - there is no page to edit
                              your own details yet (APP-A1 §2a)
       Add to my calendar     the hub's calendar sheet
       My availability        the form
       View the site as...    master admin only; takes you to the strip at
                              the bottom, which stays where it is
       Sign out               last

     A real menu for a keyboard and a screen reader: the initials are a
     button with aria-haspopup and aria-expanded, the items are menuitems,
     the arrows move between them, Escape and a tap outside close it, and
     focus goes back to the initials. */
  function youWho(p) {
    const A = window.EGBCAuth;
    return p || (A && A.profile && A.profile()) || {};
  }
  /* A PAGE'S OWN ITEMS, at the top (15 Oct 2026). The hub's top bar has no
     room on a phone for Latest notices, Edit and Administration, so on a
     phone they come here instead: window.EGBC_YOU_EXTRA() returns
     [{ key: 'x-...', label, sub, icon, run }]. */
  function youExtra() {
    try { return (typeof window.EGBC_YOU_EXTRA === 'function' ? window.EGBC_YOU_EXTRA() : []) || []; } catch (e) { return []; }
  }
  function youItems(p) {
    const me = youWho(p), items = [];
    youExtra().forEach(function (x) { items.push({ key: x.key, label: x.label, sub: x.sub || '', icon: x.icon || 'circle', act: x.key }); });
    if (!window.EGBCChurch || !EGBCChurch.uses || EGBCChurch.uses('notifications')) {
      items.push({ key: 'notifications', label: 'Notifications', sub: 'On this phone, and which ones you get', icon: 'bell-ring', href: 'notifications.html' });
    }
    items.push({ key: 'details', label: 'My details', sub: 'What the church has on file', icon: 'id-card', act: 'details' });
    /* MY MESSAGES (the events window's my-messages.html, R6/F-206): what the
       church has emailed me. */
    items.push({ key: 'messages', label: 'My messages', sub: 'What the church has emailed you', icon: 'inbox', href: 'my-messages.html' });
    /* My groups and Give, as on the app's Me tab (the reviewing window,
       13 Oct 2026). "Open the full website" stays the app's own. */
    items.push({ key: 'groups', label: 'My groups', sub: 'Your groups, and finding one', icon: 'users', href: 'groups.html' });
    items.push({ key: 'calendar', label: 'Add to my calendar', sub: 'Just me, my household, or the whole rota', icon: 'calendar-plus', act: 'calendar' });
    items.push({ key: 'availability', label: 'My availability', sub: 'Say which Sundays you can do', icon: 'calendar-check-2', href: 'index.html' });
    items.push({ key: 'give', label: 'Give', sub: 'The church’s bank details, and Gift Aid', icon: 'hand-coins', href: 'give.html' });
    /* The REAL record, not isMaster(): while looking at the site as a
       Worship member, isMaster() is false, and the way back must stay. */
    if (me.masterAdmin === true) {
      items.push({ key: 'viewas', label: 'View the site as\u2026', sub: 'See what a team sees', icon: 'eye', act: 'viewas' });
    }
    items.push({ key: 'signout', label: 'Sign out', sub: '', icon: 'log-out', act: 'signout' });
    return items;
  }

  const YOU_CSS = [
    '#egbc-you{position:fixed;z-index:9600;background:#fff;border:1px solid #e5e7eb;border-radius:12px;',
    'box-shadow:0 12px 32px rgba(17,24,39,.16);padding:6px;font-family:Inter,system-ui,sans-serif;color:#111827;',
    'box-sizing:border-box;max-height:calc(100vh - 80px);overflow-y:auto}',
    /* The heading stays at the top of the panel with its close (audit, 15 Oct
       2026: scrolled down on a phone there was no way to shut it but to
       guess and tap outside). */
    '#egbc-you .ey-h{position:sticky;top:-6px;z-index:1;background:#fff;display:flex;align-items:flex-start;gap:8px;padding:8px 4px 10px 10px;border-bottom:1px solid #e5e7eb;margin:-6px -6px 4px;border-radius:12px 12px 0 0}',
    '#egbc-you .ey-hw{flex:1;min-width:0}',
    '#egbc-you .ey-x{flex:none;width:44px;height:44px;display:inline-flex;align-items:center;justify-content:center;border:0;border-radius:10px;background:none;color:#6b7280;cursor:pointer}',
    '#egbc-you .ey-x:hover{background:#f3f4f6;color:#111827}',
    '#egbc-you .ey-h b{display:block;font-size:14px;font-weight:600;overflow-wrap:anywhere}',
    '#egbc-you .ey-h span{display:block;font-size:12px;color:#6b7280;overflow-wrap:anywhere}',
    '#egbc-you [role=menuitem]{display:flex;align-items:center;gap:10px;width:100%;box-sizing:border-box;min-height:48px;',
    'padding:8px 10px;border:0;border-radius:8px;background:none;font:inherit;font-size:14px;color:#111827;',
    'text-align:left;text-decoration:none;cursor:pointer}',
    '#egbc-you [role=menuitem]:hover,#egbc-you [role=menuitem]:focus{background:#eef4f3;outline:none}',
    '#egbc-you [role=menuitem]:focus-visible{box-shadow:0 0 0 2px #3d6263}',
    '#egbc-you .ey-t{display:flex;flex-direction:column;min-width:0}',
    '#egbc-you .ey-t small{font-size:12px;color:#6b7280}',
    '#egbc-you .ey-ic{flex:0 0 auto;color:#3d6263;display:flex}',
    '#egbc-you .ey-sep{height:1px;background:#e5e7eb;margin:4px 0}',
    '#egbc-you .ey-d{padding:6px 10px 10px;font-size:14px}',
    '#egbc-you .ey-d dt{font-size:12px;color:#6b7280;margin-top:8px}',
    '#egbc-you .ey-d dd{margin:2px 0 0;overflow-wrap:anywhere}',
    '#egbc-you .ey-d p{font-size:13px;color:#6b7280;margin:12px 0 0}'
  ].join('\n');

  function youCss() {
    if (document.getElementById('egbc-you-css')) return;
    const s = document.createElement('style');
    s.id = 'egbc-you-css';
    s.textContent = YOU_CSS;
    document.head.appendChild(s);
  }
  const youIc = (n) => '<span class="ey-ic"><i data-lucide="' + n + '" style="width:18px;height:18px"></i></span>';

  let YOU = null;   /* { panel, button, profile, onKey, onDown } while open */

  function youPosition() {
    if (!YOU) return;
    const r = YOU.button.getBoundingClientRect();
    const w = Math.min(300, window.innerWidth - 16);
    YOU.panel.style.width = w + 'px';
    YOU.panel.style.top = Math.round(r.bottom + 6) + 'px';
    YOU.panel.style.right = Math.max(8, Math.round(window.innerWidth - r.right)) + 'px';
  }
  function youFocusables() {
    return YOU ? [].slice.call(YOU.panel.querySelectorAll('[role=menuitem]')) : [];
  }
  function youDraw(view) {
    const me = youWho(YOU.profile);
    let html = '<div class="ey-h"><div class="ey-hw"><b>' + esc(me.name || 'You') + '</b><span>' + esc(me.email || '') + '</span></div>'
      + '<button type="button" class="ey-x" data-you="close" aria-label="Close">' + youIc('x') + '</button></div>';
    if (view === 'details') {
      const A = window.EGBCAuth;
      const teams = (me.teams || []).map((t) => (A && A.TEAMS && A.TEAMS[t] && A.TEAMS[t].label) || t);
      html += '<dl class="ey-d">'
        + '<dt>Name</dt><dd>' + esc(me.name || 'Not given') + '</dd>'
        + '<dt>Email</dt><dd>' + esc(me.email || '') + '</dd>'
        + '<dt>Teams</dt><dd>' + esc(teams.length ? teams.join(', ') : 'None yet') + '</dd>'
        + '<p>To change anything here, ask the church office.</p></dl>'
        + '<button type="button" role="menuitem" data-you="back">' + youIc('arrow-left') + '<span class="ey-t">Back</span></button>';
    } else {
      youItems(YOU.profile).forEach((it) => {
        if (it.key === 'signout') html += '<div class="ey-sep" role="separator"></div>';
        const inner = youIc(it.icon) + '<span class="ey-t">' + esc(it.label) + (it.sub ? '<small>' + esc(it.sub) + '</small>' : '') + '</span>';
        html += it.href
          ? '<a role="menuitem" data-you="' + it.key + '" href="' + it.href + '">' + inner + '</a>'
          : '<button type="button" role="menuitem" data-you="' + it.key + '">' + inner + '</button>';
      });
    }
    YOU.panel.innerHTML = html;
    if (window.EGBCUI && EGBCUI.icons) EGBCUI.icons();
    const first = youFocusables()[0];
    if (first) first.focus();
  }
  function youClose(refocus) {
    if (!YOU) return;
    const b = YOU.button;
    document.removeEventListener('keydown', YOU.onKey, true);
    document.removeEventListener('pointerdown', YOU.onDown, true);
    window.removeEventListener('resize', youPosition);
    YOU.panel.remove();
    b.setAttribute('aria-expanded', 'false');
    YOU = null;
    if (refocus) b.focus();
  }
  function youAct(key) {
    if (key === 'back') { youDraw('menu'); return; }
    if (String(key).indexOf('x-') === 0) {
      const x = youExtra().filter(function (i) { return i.key === key; })[0];
      youClose(false);
      if (x && x.run) x.run();
      return;
    }
    if (key === 'details') { youDraw('details'); return; }
    if (key === 'close') { youClose(true); return; }
    if (key === 'signout') { youClose(false); if (window.EGBCAuth) EGBCAuth.signOut(); return; }
    if (key === 'calendar') {
      youClose(false);
      /* On the hub the sheet is right here; anywhere else, the hub opens it. */
      if (typeof window.openMyCalendar === 'function') window.openMyCalendar();
      else location.href = 'hub.html?calendar=1';
      return;
    }
    if (key === 'viewas') {
      youClose(false);
      const sel = document.getElementById('egbc-va-team');
      if (sel) { sel.scrollIntoView({ block: 'nearest' }); sel.focus(); }
    }
  }
  function youOpen(button, profile) {
    youCss();
    const panel = document.createElement('div');
    panel.id = 'egbc-you';
    panel.setAttribute('role', 'menu');
    panel.setAttribute('aria-label', 'You');
    if (!button.id) button.id = 'egbc-you-btn';
    panel.setAttribute('aria-labelledby', button.id);
    document.body.appendChild(panel);
    YOU = { panel, button, profile };
    button.setAttribute('aria-expanded', 'true');
    button.setAttribute('aria-controls', 'egbc-you');
    panel.addEventListener('click', (e) => {
      const el = e.target.closest('[data-you]');
      if (!el) return;
      const key = el.getAttribute('data-you');
      if (el.tagName === 'A') { youClose(false); return; }   /* let the link go */
      e.preventDefault();
      youAct(key);
    });
    YOU.onKey = (e) => {
      if (!YOU) return;
      const items = youFocusables();
      const i = items.indexOf(document.activeElement);
      if (e.key === 'Escape') { e.preventDefault(); youClose(true); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); (items[(i + 1) % items.length] || items[0]).focus(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); (items[(i - 1 + items.length) % items.length] || items[0]).focus(); }
      else if (e.key === 'Home') { e.preventDefault(); items[0] && items[0].focus(); }
      else if (e.key === 'End') { e.preventDefault(); items[items.length - 1] && items[items.length - 1].focus(); }
      else if (e.key === 'Tab') { youClose(false); }
    };
    YOU.onDown = (e) => {
      if (!YOU) return;
      if (YOU.panel.contains(e.target) || YOU.button.contains(e.target)) return;
      youClose(false);
    };
    document.addEventListener('keydown', YOU.onKey, true);
    document.addEventListener('pointerdown', YOU.onDown, true);
    window.addEventListener('resize', youPosition);
    youPosition();
    youDraw('menu');
  }
  /* The initials' click. A second tap on the initials closes it. */
  function toggleYou(button, profile) {
    if (YOU && YOU.button === button) { youClose(true); return; }
    youClose(false);
    youOpen(button, profile);
  }

  window.EGBCMenu = {
    /* The "you" menu under the initials, and what it offers (for checks). */
    toggleYou: toggleYou,
    youItems: function (p) { return youItems(p).map(function (i) { return i.key; }); },

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
        isChurchMember: !!(A && A.isChurchMember && A.isChurchMember()),
        isAdmin: !!(A && A.isAdmin && A.isAdmin()),
        /* THE SAME ANSWER THE PHONE USES (NEXT-BRIEF §25). One helper, so
           somebody cannot be offered the address book on the computer and
           refused it in the app. runsTabs() honours view-as itself, so the
           preview is right here too without a second rule. */
        runs: (A && A.runsTabs) ? A.runsTabs() : [],
        /* Who looks after a site's bookings is a list of member ids inside
           bookingSettings, which means a read. Whoever draws the Menu does
           that read and sets this before drawing; unset means "not one",
           which is the safe way round. */
        isBookingsAdmin: !previewing && window.EGBC_BOOKINGS_ADMIN === true,
        /* sermonShow/access, read with the profile by egbc-auth.js. */
        isSermons: !previewing && !!(A && A.isSermonsAdmin && A.isSermonsAdmin()),
        isEventTeam: !!(A && A.isOnEventTeam && A.isOnEventTeam()),
        /* WHO MAY email and post a notice (16 Oct 2026): master admins, the
           Church office, and anybody who leads a team - adminFor as seen,
           so View as answers for the person being viewed as. */
        mayMessage: !!(A && A.isMaster && A.isMaster()) || !!(A && A.inTeam && A.inTeam('Church office')) || adminFor.length > 0,
        isPlanGroup: !!(A && A.isOnPlanGroup && A.isOnPlanGroup()),
        mayHeadcount: !!(A && A.mayHeadcount && A.mayHeadcount()),
        isCareReader: !!(A && A.isCareReader && A.isCareReader()),
        isSgLead: !previewing && !!(A && A.isSafeguardingLead && A.isSafeguardingLead()),
        moneyTeam: (A && A.moneyTeam && A.moneyTeam()) || 'Finance'
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
