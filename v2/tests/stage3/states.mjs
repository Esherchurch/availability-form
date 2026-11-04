/* THE KIDS CHURCH SUNDAY'S SCREENS, DEEPER THAN A PAGE'S FIRST VIEW (the
 * going-live test, Stage 3), for tests/audit-everything.mjs --states. Each
 * is opened, its steps run in the page, and every control on it is pressed
 * by each of its people at 375 and 1440 (the steps run again after every
 * press). The records are tests/stage3/seed-audit.mjs's.
 *
 * roles: the kinds of person each screen is for - the others are refused
 * the page, or never shown that part of it (their refusals are checked on
 * the page's first view).
 */
const click = (sel) => 'document.querySelector(' + JSON.stringify(sel) + ').click()';
const type = (sel, v) => 'var e=document.querySelector(' + JSON.stringify(sel) + ');e.value=' + JSON.stringify(v) + ';e.dispatchEvent(new Event("input",{bubbles:true}));e.dispatchEvent(new Event("change",{bubbles:true}))';
const wait = (sel) => 'wait:' + sel;
const tab = (t) => [wait('[data-tab="' + t + '"]'), click('[data-tab="' + t + '"]')];

const LEADS = ['master', 'kidsLead', 'sgLead'];
const PLANNERS = ['master', 'kidsLead', 'groupLeader'];
const SG = ['master', 'sgLead'];

export default [
  /* ---- the children's register ---- */
  { name: 'register: registration tab', url: 'kids-admin.html', roles: LEADS, steps: tab('registration') },
  { name: 'register: groups tab', url: 'kids-admin.html', roles: LEADS, steps: tab('groups') },
  { name: 'register: a new group', url: 'kids-admin.html', roles: LEADS, steps: tab('groups').concat([wait('#g-new'), click('#g-new')]) },
  { name: 'register: editing a group', url: 'kids-admin.html', roles: LEADS, steps: tab('groups').concat([wait('[data-gedit]'), click('[data-gedit]')]) },
  { name: 'register: settings', url: 'kids-admin.html?tab=settings', roles: LEADS, steps: [] },
  { name: 'register: a child opened', url: 'kids-admin.html', roles: LEADS.concat(['groupLeader']), steps: [wait('[data-open]'), click('[data-open]')] },

  /* ---- Sunday check-in ---- */
  { name: 'check-in: the desk, a family found', url: 'kids-checkin.html', roles: LEADS, steps: [wait('#d-q'), type('#d-q', 'Audit'), wait('[data-fam]')] },
  { name: 'check-in: checking a child out', url: 'kids-checkin.html', roles: LEADS, steps: [wait('#d-q'), type('#d-q', 'Audit'), wait('[data-out]'), click('[data-out]')] },
  { name: 'check-in: first time here', url: 'kids-checkin.html', roles: LEADS, steps: tab('visitor') },
  { name: 'check-in: groups', url: 'kids-checkin.html', roles: LEADS.concat(['groupLeader']), steps: tab('groups') },
  { name: 'check-in: a child\'s details', url: 'kids-checkin.html', roles: LEADS.concat(['groupLeader']), steps: tab('groups').concat([wait('[data-more]'), click('[data-more]')]) },
  { name: 'check-in: roll-call', url: 'kids-checkin.html', roles: LEADS, steps: tab('roll') },
  { name: 'check-in: registers', url: 'kids-checkin.html', roles: LEADS, steps: tab('register') },
  { name: 'check-in: visitors', url: 'kids-checkin.html', roles: LEADS, steps: tab('visitors') },

  /* ---- the session planner ---- */
  { name: 'planner: a plan opened', url: 'session-planner.html?s=ps_s3', roles: PLANNERS, steps: [wait('#sTitle')] },
  { name: 'planner: choosing a passage', url: 'session-planner.html?s=ps_s3', roles: PLANNERS, steps: [wait('#pickPassage'), click('#pickPassage')] },
  { name: 'planner: adding a step', url: 'session-planner.html?s=ps_s3', roles: PLANNERS, steps: [wait('[data-addstep]'), click('[data-addstep]')] },

  /* ---- Present (the presenter, then the quiz) ---- */
  { name: 'present: a session', url: 'present.html?s=ps_s3', roles: PLANNERS, steps: [wait('#pzStage')] },
  { name: 'present: presenting', url: 'present.html?s=ps_s3', roles: PLANNERS, steps: [wait('[data-start]'), click('[data-start]')] },
  { name: 'present: the quiz, teams on the TV', url: 'present.html?s=ps_s3', roles: PLANNERS, steps: [wait('[data-start]'), click('[data-start]'), wait('[data-qtv]'), click('[data-qtv]')] },
  { name: 'present: the quiz, on phones', url: 'present.html?s=ps_s3', roles: PLANNERS, steps: [wait('[data-start]'), click('[data-start]'), wait('[data-qphones]'), click('[data-qphones]')] },

  /* ---- the safeguarding risk register ---- */
  { name: 'risks: standing risks', url: 'safeguarding-risk.html?tab=risks', roles: SG, steps: [] },
  { name: 'risks: editing a risk', url: 'safeguarding-risk.html?tab=risks', roles: SG, steps: [wait('[data-edit]'), click('[data-edit]')] },
  { name: 'risks: adding a risk', url: 'safeguarding-risk.html?tab=risks', roles: SG, steps: [wait('[data-addrisk]'), click('[data-addrisk]')] },
  { name: 'risks: from the starter list', url: 'safeguarding-risk.html?tab=risks', roles: SG, steps: [wait('[data-starter]'), click('[data-starter]')] },
  { name: 'risks: event assessments', url: 'safeguarding-risk.html?tab=events', roles: SG, steps: [] },
  { name: 'risks: an event assessment opened', url: 'safeguarding-risk.html?tab=events', roles: SG, steps: [wait('[data-sgev]'), click('[data-sgev] button')] },
  { name: 'risks: warnings', url: 'safeguarding-risk.html?tab=warnings', roles: SG, steps: [] },
  { name: 'risks: annual review', url: 'safeguarding-risk.html?tab=review', roles: SG, steps: [] },
  { name: 'risks: snapshots', url: 'safeguarding-risk.html?tab=snaps', roles: SG, steps: [] },
  { name: 'risks: taking a snapshot', url: 'safeguarding-risk.html?tab=snaps', roles: SG, steps: [wait('#snapGo'), click('#snapGo')] },

  /* ---- safeguarding for an event ---- */
  { name: 'safeguarding: the holiday club', url: 'safeguarding.html?event=ev_s3', roles: SG.concat(['kidsLead']), steps: [] },
  { name: 'safeguarding: a draft assessment', url: 'safeguarding.html?event=ev_s3d', roles: SG.concat(['kidsLead']), steps: [] },
  { name: 'safeguarding: a signed assessment', url: 'safeguarding.html?event=ev_s3e', roles: SG.concat(['kidsLead']), steps: [] },
  { name: 'safeguarding: a leader\'s checks', url: 'safeguarding.html?event=ev_s3', roles: SG, steps: [wait('[onclick^="checksModal"]'), click('[onclick^="checksModal"]')] },
  { name: 'safeguarding: recording an incident', url: 'safeguarding.html?event=ev_s3', roles: SG.concat(['kidsLead']), steps: [wait('#addInc'), click('#addInc')] },
  { name: 'safeguarding: a concern', url: 'safeguarding.html?event=ev_s3', roles: SG.concat(['kidsLead']), steps: [wait('[onclick^="concernModal"]'), click('[onclick^="concernModal"]')] },
  { name: 'safeguarding: report a concern (anyone)', url: 'safeguarding.html', roles: 'all', steps: [] },

  /* ---- event risk assessment ---- */
  { name: 'event RA: a draft', url: 'event-ra.html?event=ev_s3', roles: ['master', 'kidsLead'], steps: [] },
  { name: 'event RA: signed, to approve', url: 'event-ra.html?event=ev_s3b', roles: ['master', 'kidsLead'], steps: [] },
  { name: 'event RA: approved', url: 'event-ra.html?event=ev_s3c', roles: ['master', 'kidsLead'], steps: [] },

  /* ---- printing ---- */
  { name: 'print: an event', url: 'sg-print.html?event=ev_s3e', roles: SG.concat(['kidsLead']), steps: [] },
  { name: 'print: the register', url: 'sg-print.html?register=site_s3', roles: SG, steps: [] },

  /* ---- ChurchShow: the paired computer ---- */
  { name: 'ChurchShow: the computers', url: 'churchshow.html', roles: ['master'], steps: [] },
  { name: 'ChurchShow: a computer\'s job', url: 'churchshow.html', roles: ['master'], steps: [wait('[data-act="job"]'), click('[data-act="job"]')] },
  { name: 'ChurchShow: renaming', url: 'churchshow.html', roles: ['master'], steps: [wait('[data-act="rename"]'), click('[data-act="rename"]')] },

  /* ---- the young person's phone ---- */
  { name: 'Youth Hub: home', url: 'youthapp2.html', roles: ['youth', 'master'], steps: ['localStorage.setItem("egbc_youth_hub_toured_home","1")'] },
  { name: 'Youth Hub: planner', url: 'youthapp2.html', roles: ['youth', 'master'], steps: ['localStorage.setItem("egbc_youth_hub_toured_home","1")', 'openSection("planner")'] },
  { name: 'Youth Hub: board', url: 'youthapp2.html', roles: ['youth', 'master'], steps: ['localStorage.setItem("egbc_youth_hub_toured_home","1")', 'openSection("board")'] },
  { name: 'Youth Hub: a new note', url: 'youthapp2.html', roles: ['youth', 'master'], steps: ['localStorage.setItem("egbc_youth_hub_toured_home","1")', 'openSection("board")', 'openAddNote()'] },
  { name: 'Youth Hub: worship', url: 'youthapp2.html', roles: ['youth', 'master'], steps: ['localStorage.setItem("egbc_youth_hub_toured_home","1")', 'openSection("worship")'] },
  { name: 'Youth Hub: library', url: 'youthapp2.html', roles: ['youth', 'master'], steps: ['localStorage.setItem("egbc_youth_hub_toured_home","1")', 'openSection("library")'] },
  { name: 'Youth Hub: upload', url: 'youthapp2.html', roles: ['youth', 'master'], steps: ['localStorage.setItem("egbc_youth_hub_toured_home","1")', 'openSection("upload")'] },
  { name: 'Youth Hub: news', url: 'youthapp2.html', roles: ['youth', 'master'], steps: ['localStorage.setItem("egbc_youth_hub_toured_home","1")', 'openSection("news")'] },
  { name: 'Youth Hub: mine', url: 'youthapp2.html', roles: ['youth', 'master'], steps: ['localStorage.setItem("egbc_youth_hub_toured_home","1")', 'openSection("mine")'] },
  { name: 'youth access: a code', url: 'youth-access.html', roles: ['youth'], steps: [] },

  /* ---- the youth charter: admin mode needs the page's password ---- */
  { name: 'Youth charter: the password box', url: 'Youthcharter.html', roles: ['master'], steps: [wait('[onclick^="openPwModal"]'), click('[onclick^="openPwModal"]')] }
];
