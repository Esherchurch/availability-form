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

    { title: 'Worship & AV', url: 'Worshipteamcharter.html', icon: 'music',
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
            description: 'Sites, rooms and what is in them' }
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
    return true;
  }

  function prune(nodes, who) {
    const out = [];
    for (const node of nodes) {
      if (!visible(node, who)) continue;
      const kids = node.children ? prune(node.children, who) : null;
      /* A heading with nothing left under it and no page of its own is not
         drawn: an empty "Events and rooms" tells a member nothing except that
         there is something they cannot have. */
      if (node.children && (!kids || !kids.length) && !node.url) continue;
      out.push(kids && kids.length ? Object.assign({}, node, { children: kids }) : Object.assign({}, node, { children: undefined }));
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

  window.EGBCMenu = {
    TREE: TREE,
    OPENED_FROM_A_TOOL: OPENED_FROM_A_TOOL,
    /* who: { isCore, isAdmin } */
    forPerson: function (who) { return prune(TREE, who || {}); },
    allPages: function () { return flatten(TREE); },
    /* Straight from the signed-in profile, so every caller asks the same way. */
    who: function () {
      const p = (window.EGBCAuth && EGBCAuth.profile && EGBCAuth.profile()) || null;
      const teams = (p && p.teams) || [];
      return {
        isCore: teams.indexOf('Core Team') !== -1,
        isAdmin: !!(window.EGBCAuth && EGBCAuth.isAdmin && EGBCAuth.isAdmin())
      };
    }
  };
})();
