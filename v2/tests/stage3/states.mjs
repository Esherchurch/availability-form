/* THE KIDS CHURCH SUNDAY'S SCREENS, DEEPER THAN A PAGE'S FIRST VIEW (the
 * going-live test, Stage 3), for tests/audit-everything.mjs --states. Each
 * is opened, its steps run in the page, and every control on it is pressed
 * by each of its people at 375 and 1440 (the steps run again after every
 * press). The records are tests/stage3/seed-audit.mjs's.
 *
 * roles: the kinds of person each screen is for - the others are refused
 * the page, or never shown that part of it (their refusals are checked on
 * the page's first view).
 * 'scope' (a step): a pop-up is open, so only its own controls are pressed;
 * the page under it is pressed on the screens without it.
 */
const click = (sel) => 'document.querySelector(' + JSON.stringify(sel) + ').click()';
const type = (sel, v) => 'var e=document.querySelector(' + JSON.stringify(sel) + ');e.value=' + JSON.stringify(v) + ';e.dispatchEvent(new Event("input",{bubbles:true}));e.dispatchEvent(new Event("change",{bubbles:true}))';
const pick = (sel, v) => 'var e=document.querySelector(' + JSON.stringify(sel) + ');e.value=' + JSON.stringify(v) + ';e.dispatchEvent(new Event("change",{bubbles:true}))';
const tick = (sel) => 'var e=document.querySelector(' + JSON.stringify(sel) + ');if(!e.checked)e.click()';
const wait = (sel) => 'wait:' + sel;
/* a button found by its words, for those with no other handle */
const press = (words) => '[].slice.call(document.querySelectorAll("button")).filter(function(b){return b.textContent.trim()===' + JSON.stringify(words) + '})[0].click()';
const tab = (t) => [wait('[data-tab="' + t + '"]'), click('[data-tab="' + t + '"]')];

const LEADS = ['master', 'kidsLead', 'sgLead'];
const PLANNERS = ['master', 'kidsLead', 'groupLeader'];
const SG = ['master', 'sgLead'];

/* ---- the planner: the part opened, then a kind of step chosen ---- */
const PART = [wait('[data-toggle]'), click('[data-toggle]'), wait('[data-addstep]')];
const stepForm = (kind) => PART.concat([pick('[data-addstep]', kind), wait('#stAdd'), 'scope']);

/* ---- Present: nobody presenting first (as "Stop" leaves it), then Present pressed ---- */
/* .catch: a refused reset was an "Uncaught PERMISSION_DENIED" counted against the page (4 Nov 2026) */
const FREE = [wait('#app *'), 'EGBCAuth.db.collection("presentNow").doc("ps_ps_s3").update({presenterUid:"",presenterName:"",blank:false}).catch(function(){})'];
const PRESENTING = FREE.concat([wait('[data-start]'), click('[data-start]')]);
/* the quiz is the second slide: its choices are drawn when the presenter reaches it */
const QUIZ = PRESENTING.concat([wait('[data-go]'), click('[data-go]')]);
/* phones: the quiz started, and a player joined from "their phone" (quiz.html's own request); the
   presenter's panel shows the code in capitals, CODE 975 543 */
const JOIN = 'var m=/code (\\d{3}) (\\d{3})/i.exec(document.body.innerText);if(m)fetch("http://localhost:5102/egbc-worship-planner/europe-west2/quizJoin",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({code:m[1]+m[2],name:"Sam Synthetic"})})';
const PHONES = QUIZ.concat([wait('[data-qphones]'), click('[data-qphones]'), wait('[data-qopen="0"]'), JOIN, wait('[data-qkick]')]);

/* ---- the charter's hidden gesture: three quick clicks on the right of its top bar ---- */
const GESTURE = [wait('#admin-bar'), 'var b=document.getElementById("admin-bar"),r=b.getBoundingClientRect();for(var i=0;i<3;i++)b.dispatchEvent(new MouseEvent("click",{bubbles:true,clientX:r.right-5,clientY:r.top+r.height/2}))', wait('body.admin-mode')];

/* ---- the Youth Hub, with its first-visit tour already seen ---- */
const HUB = ['localStorage.setItem("egbc_youth_hub_toured_home","1")'];

export default [
  /* ---- the children's register ---- */
  { name: 'register: registration tab', url: 'kids-admin.html', roles: LEADS, steps: tab('registration') },
  { name: 'register: groups tab', url: 'kids-admin.html', roles: LEADS, steps: tab('groups') },
  { name: 'register: a new group', url: 'kids-admin.html', roles: LEADS, steps: tab('groups').concat([wait('#g-new'), click('#g-new'), wait('#g-form input')]) },
  { name: 'register: editing a group', url: 'kids-admin.html', roles: LEADS, steps: tab('groups').concat([wait('[data-gedit]'), click('[data-gedit]'), wait('[data-unlead]')]) },
  { name: 'register: settings', url: 'kids-admin.html?tab=settings', roles: LEADS, steps: [] },
  { name: 'register: a child opened', url: 'kids-admin.html', roles: LEADS.concat(['groupLeader']), steps: [wait('[data-open]'), click('[data-open]')] },

  /* ---- Sunday check-in ---- */
  { name: 'check-in: the desk, a family found', url: 'kids-checkin.html', roles: LEADS, steps: [wait('#d-q'), type('#d-q', 'Audit'), wait('[data-fam]')] },
  { name: 'check-in: the desk, a visitor family (consent run out)', url: 'kids-checkin.html', roles: LEADS, steps: [wait('#d-q'), type('#d-q', 'Visitor'), wait('[data-renew]')] },
  /* A pop-up open ends with 'scope': its own controls are pressed, not the page under the backdrop
     ("covered: Check in is under DIV#back", 4 Nov 2026). Each waits for the pop-up first, so scope
     never falls back to the View-as bar. */
  { name: 'check-in: the renewal QR code', url: 'kids-checkin.html', roles: LEADS, steps: [wait('#d-q'), type('#d-q', 'Visitor'), wait('[data-renew]'), click('[data-renew]'), wait('#m-done'), 'scope'] },
  { name: 'check-in: the desk, labels to print', url: 'kids-checkin.html', roles: LEADS, steps: [wait('#d-q'), type('#d-q', 'Visitor'), wait('[data-checkin]'), click('[data-checkin]'), wait('#l-print')] },
  { name: 'check-in: checking a child out', url: 'kids-checkin.html', roles: LEADS, steps: [wait('#d-q'), type('#d-q', 'Visitor'), wait('[data-checkin]'), click('[data-checkin]'), wait('[data-out]'), click('[data-out]'), wait('[name="o-who"]'), 'scope'] },
  { name: 'check-in: collected with the code', url: 'kids-checkin.html', roles: LEADS, steps: [wait('#d-q'), type('#d-q', 'Visitor'), wait('[data-checkin]'), click('[data-checkin]'), wait('[data-out]'), click('[data-out]'), wait('[name="o-who"][value="__code"]'), click('[name="o-who"][value="__code"]'), wait('#o-name'), 'scope'] },
  { name: 'check-in: first time here', url: 'kids-checkin.html', roles: LEADS, steps: tab('visitor') },
  { name: 'check-in: groups', url: 'kids-checkin.html', roles: LEADS.concat(['groupLeader']), steps: tab('groups') },
  { name: 'check-in: a child checked in from the group', url: 'kids-checkin.html', roles: LEADS.concat(['groupLeader']), steps: tab('groups').concat([wait('#g-pick'), pick('#g-pick', 'g_s3'), wait('[data-gin]'), click('[data-gin]'), wait('#m-print')]) },
  { name: 'check-in: a child\'s details', url: 'kids-checkin.html', roles: LEADS.concat(['groupLeader']), steps: tab('groups').concat([wait('#g-pick'), pick('#g-pick', 'g_s3'), wait('[data-more="c_s3"]'), click('[data-more="c_s3"]'), wait('#m-call'), 'scope']) },
  { name: 'check-in: calling a parent to the screen', url: 'kids-checkin.html', roles: LEADS.concat(['groupLeader']), steps: tab('groups').concat([wait('#g-pick'), pick('#g-pick', 'g_s3'), wait('[data-more="c_s3"]'), click('[data-more="c_s3"]'), wait('#m-screen'), click('#m-screen'), wait('#m-screen-yes'), 'scope']) },
  { name: 'check-in: a call on the screen', url: 'kids-checkin.html', roles: LEADS.concat(['groupLeader']), steps: tab('groups').concat([wait('#g-pick'), pick('#g-pick', 'g_s3'), wait('[data-more="c_s3"]'), click('[data-more="c_s3"]'), wait('#m-screen'), click('#m-screen'), wait('#m-screen-yes'), click('#m-screen-yes'), wait('[data-pdone]'), 'scope']) },
  { name: 'check-in: roll-call', url: 'kids-checkin.html', roles: LEADS, steps: tab('roll') },
  { name: 'check-in: registers', url: 'kids-checkin.html', roles: LEADS, steps: tab('register') },
  { name: 'check-in: registers, chosen dates', url: 'kids-checkin.html', roles: LEADS, steps: tab('register').concat([wait('#reg-period'), pick('#reg-period', 'custom'), wait('#reg-from')]) },
  { name: 'check-in: visitors', url: 'kids-checkin.html', roles: LEADS, steps: tab('visitors').concat([wait('[data-vfam]')]) },

  /* ---- the session planner ---- */
  { name: 'planner: a plan opened', url: 'session-planner.html?s=ps_s3', roles: PLANNERS, steps: [wait('#sTitle')] },
  { name: 'planner: a special week', url: 'session-planner.html?s=ps_s3', roles: PLANNERS, steps: [wait('#sSpecial'), pick('#sSpecial', 'note'), wait('#sSpecialText')] },
  { name: 'planner: a sermon plan', url: 'session-planner.html?s=ps_s3s', roles: ['master', 'kidsLead'], steps: [wait('#sSeries')] },
  { name: 'planner: choosing a passage', url: 'session-planner.html?s=ps_s3', roles: PLANNERS, steps: [wait('#pickPassage'), click('#pickPassage'), wait('#bpShow'), 'scope'] },
  { name: 'planner: a passage to import', url: 'session-planner.html?s=ps_s3', roles: PLANNERS, steps: [wait('#pickPassage'), click('#pickPassage'), wait('#bpRef'), type('#bpRef', 'John 3:16'), wait('#bpVer option[value]'), click('#bpShow'), wait('#bpUse'), 'scope'] },
  { name: 'planner: a Bible Gateway link', url: 'session-planner.html?s=ps_s3', roles: PLANNERS, steps: [wait('#pickPassage'), click('#pickPassage'), wait('[data-src="biblegateway"]'), click('[data-src="biblegateway"]'), type('#bpRef', 'John 3:16'), click('#bpShow'), wait('#bpUse'), 'scope'] },
  { name: 'planner: a part opened', url: 'session-planner.html?s=ps_s3', roles: PLANNERS, steps: PART },
  { name: 'planner: a video step', url: 'session-planner.html?s=ps_s3', roles: PLANNERS, steps: stepForm('video') },
  { name: 'planner: a picture step', url: 'session-planner.html?s=ps_s3', roles: PLANNERS, steps: stepForm('picture') },
  { name: 'planner: a YouTube step', url: 'session-planner.html?s=ps_s3', roles: PLANNERS, steps: stepForm('youtube') },
  { name: 'planner: a song step', url: 'session-planner.html?s=ps_s3', roles: PLANNERS, steps: stepForm('song') },
  { name: 'planner: a timer step', url: 'session-planner.html?s=ps_s3', roles: PLANNERS, steps: stepForm('timer') },
  { name: 'planner: a words step', url: 'session-planner.html?s=ps_s3', roles: PLANNERS, steps: stepForm('text') },
  { name: 'planner: a quiz step', url: 'session-planner.html?s=ps_s3', roles: PLANNERS, steps: stepForm('quiz') },
  { name: 'planner: a PowerPoint step', url: 'session-planner.html?s=ps_s3', roles: PLANNERS, steps: stepForm('pptx') },
  { name: 'planner: a link step', url: 'session-planner.html?s=ps_s3', roles: PLANNERS, steps: stepForm('link') },

  /* ---- Present (the presenter, then the quiz) ---- */
  { name: 'present: a session', url: 'present.html?s=ps_s3', roles: PLANNERS, steps: FREE.concat([wait('[data-start]')]) },
  { name: 'present: presenting', url: 'present.html?s=ps_s3', roles: PLANNERS, steps: PRESENTING },
  { name: 'present: someone else presenting', url: 'present.html?s=ps_s3b', roles: PLANNERS, steps: [wait('[data-browse]')] },
  { name: 'present: browsing on my own', url: 'present.html?s=ps_s3b', roles: PLANNERS, steps: [wait('[data-browse]'), click('[data-browse]'), wait('[data-back]')] },
  { name: 'present: the quiz, teams on the TV', url: 'present.html?s=ps_s3', roles: PLANNERS, steps: QUIZ.concat([wait('[data-qtv]'), click('[data-qtv]'), wait('[data-qgo]')]) },
  { name: 'present: the quiz, a question on the TV', url: 'present.html?s=ps_s3', roles: PLANNERS, steps: QUIZ.concat([wait('[data-qtv]'), click('[data-qtv]'), wait('[data-qgo]'), click('[data-qgo]'), wait('[data-qnext]')]) },
  { name: 'present: the quiz, final scores', url: 'present.html?s=ps_s3', roles: PLANNERS, steps: QUIZ.concat([wait('[data-qtv]'), click('[data-qtv]'), wait('[data-qgo]'), click('[data-qgo]'), wait('[data-qnext]'), click('[data-qnext]'), wait('[data-qnext]'), click('[data-qnext]'), wait('[data-qclose]')]) },
  { name: 'present: the quiz, on phones', url: 'present.html?s=ps_s3', roles: PLANNERS, steps: PHONES },
  { name: 'present: phones, removing a player', url: 'present.html?s=ps_s3', roles: PLANNERS, steps: PHONES.concat([click('[data-qkick]'), wait('[data-qkickyes]')]) },
  { name: 'present: phones, a question open', url: 'present.html?s=ps_s3', roles: PLANNERS, steps: PHONES.concat([click('[data-qopen="0"]'), wait('[data-qreveal]')]) },
  { name: 'present: phones, the answer showing', url: 'present.html?s=ps_s3', roles: PLANNERS, steps: PHONES.concat([click('[data-qopen="0"]'), wait('[data-qreveal]'), click('[data-qreveal]'), wait('[data-qboard]')]) },
  { name: 'present: phones, the last answer', url: 'present.html?s=ps_s3', roles: PLANNERS, steps: PHONES.concat([click('[data-qopen="0"]'), wait('[data-qreveal]'), click('[data-qreveal]'), wait('[data-qopen="1"]'), click('[data-qopen="1"]'), wait('[data-qreveal]'), click('[data-qreveal]'), wait('[data-qfinal]')]) },
  { name: 'quiz: a quiz that has ended', url: 'quiz.html', roles: 'all', steps: [wait('#code'), 'sessionStorage.setItem("egbc_quiz_player",JSON.stringify({runId:"ended_s3",pid:"p",key:"k",name:"Sam"}));location.reload()', wait('#again')] },

  /* ---- the safeguarding risk register ---- */
  { name: 'risks: standing risks', url: 'safeguarding-risk.html', roles: SG, steps: [...tab('risks'), ] },
  { name: 'risks: editing a risk', url: 'safeguarding-risk.html', roles: ['sgLead'], steps: [...tab('risks'), wait('[data-edit]'), click('[data-edit]'), wait('#eMoreTodo'), 'scope'] },
  { name: 'risks: adding a risk', url: 'safeguarding-risk.html', roles: ['sgLead'], steps: [...tab('risks'), wait('[data-addrisk]'), click('[data-addrisk]'), 'scope'] },
  { name: 'risks: from the starter list', url: 'safeguarding-risk.html', roles: ['sgLead'], steps: [...tab('risks'), wait('[data-starter]'), click('[data-starter]'), 'scope'] },
  { name: 'risks: event assessments', url: 'safeguarding-risk.html', roles: SG, steps: [...tab('events'), ] },
  { name: 'risks: an event assessment opened', url: 'safeguarding-risk.html', roles: SG, steps: [...tab('events'), wait('[data-sgev]'), click('[data-sgev] button'), wait('#back .sheet button'), 'scope'] },
  { name: 'risks: an event assessment read', url: 'safeguarding-risk.html', roles: SG, steps: [...tab('events'), wait('[data-viewsga]'), click('[data-viewsga]'), wait('#sgaView .sga'), 'scope'] },
  { name: 'risks: warnings', url: 'safeguarding-risk.html', roles: SG, steps: [...tab('warnings'), ] },
  { name: 'risks: annual review', url: 'safeguarding-risk.html', roles: SG, steps: [...tab('review'), ] },
  { name: 'risks: recording a review item', url: 'safeguarding-risk.html', roles: ['sgLead'], steps: [...tab('review'), wait('#rvList button, .card button'), press('Record it'), wait('#rvNote'), 'scope'] },
  { name: 'risks: snapshots', url: 'safeguarding-risk.html', roles: SG, steps: [...tab('snaps'), ] },
  { name: 'risks: taking a snapshot', url: 'safeguarding-risk.html', roles: SG, steps: [...tab('snaps'), wait('#snapGo'), click('#snapGo'), wait('#snGo'), 'scope'] },
  { name: 'risks: a snapshot opened', url: 'safeguarding-risk.html', roles: SG, steps: [...tab('snaps'), wait('[data-opensnap]'), click('[data-opensnap]'), wait('#snapView'), 'scope'] },

  /* ---- safeguarding for an event ---- */
  { name: 'safeguarding: the holiday club', url: 'safeguarding.html?event=ev_s3', roles: SG.concat(['kidsLead']), steps: [wait('#sgAssessCard')] },
  { name: 'safeguarding: a draft assessment', url: 'safeguarding.html?event=ev_s3d', roles: SG.concat(['kidsLead']), steps: [wait('#sgaSave')] },
  { name: 'safeguarding: a signed assessment', url: 'safeguarding.html?event=ev_s3e', roles: SG.concat(['kidsLead']), steps: [wait('#sgaSigned')] },
  { name: 'safeguarding: a leader\'s checks', url: 'safeguarding.html?event=ev_s3', roles: SG, steps: [wait('.recCheck'), click('.recCheck'), wait('#cDbs'), 'scope'] },
  { name: 'safeguarding: adding a leader', url: 'safeguarding.html?event=ev_s3', roles: SG.concat(['kidsLead']), steps: [wait('#addLeader'), click('#addLeader'), wait('#lq'), type('#lq', 'lead'), wait('.pick'), 'scope'] },
  { name: 'safeguarding: leaders from the rota', url: 'safeguarding.html?event=ev_s3', roles: SG.concat(['kidsLead']), steps: [wait('#fromRota'), click('#fromRota'), wait('#rpAdd'), 'scope'] },
  { name: 'safeguarding: recording an incident', url: 'safeguarding.html?event=ev_s3', roles: SG.concat(['kidsLead']), steps: [wait('#addInc'), click('#addInc'), wait('#iSave'), 'scope'] },
  { name: 'safeguarding: an incident\'s follow-up', url: 'safeguarding.html?event=ev_s3', roles: SG, steps: [wait('.followUp'), click('.followUp'), wait('#fuSave'), 'scope'] },
  { name: 'safeguarding: a concern', url: 'safeguarding.html?event=ev_s3', roles: SG.concat(['kidsLead']), steps: [wait('#concernBtn'), click('#concernBtn'), wait('#cSend'), 'scope'] },
  { name: 'safeguarding: a concern\'s notes', url: 'safeguarding.html', roles: ['sgLead'], steps: [wait('.cNote'), click('.cNote'), wait('#cnSave'), 'scope'] },
  { name: 'safeguarding: report a concern (anyone)', url: 'safeguarding.html', roles: 'all', steps: [] },

  /* ---- event risk assessment ---- */
  { name: 'event RA: a draft', url: 'event-ra.html?event=ev_s3', roles: ['master', 'kidsLead'], steps: [] },
  { name: 'event RA: a trip (the venue)', url: 'event-ra.html?event=ev_s3f', roles: ['master', 'kidsLead'], steps: [wait('#vName')] },
  { name: 'event RA: ready to sign', url: 'event-ra.html?event=ev_s3f', roles: ['master', 'kidsLead'], steps: [wait('#saveGo'), tick('input[name="care"][value="no"]'),
    'document.querySelectorAll("input[id^=q_]").forEach(function(e){e.value="N/A: a synthetic test event";e.dispatchEvent(new Event("input",{bubbles:true}))})', click('#saveGo'), wait('#signGo')] },
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
  { name: 'Youth Hub: home', url: 'youthapp2.html', roles: ['youth', 'master'], steps: HUB },
  { name: 'Youth Hub: planner', url: 'youthapp2.html', roles: ['youth', 'master'], steps: HUB.concat(['openSection("planner")']) },
  { name: 'Youth Hub: planner, a song and an item', url: 'youthapp2.html', roles: ['master'], steps: HUB.concat(['openSection("planner")', 'addSong()', 'addItem()', wait('.song-block .remove-btn')]) },
  { name: 'Youth Hub: planner, a song suggested', url: 'youthapp2.html', roles: ['master'], steps: HUB.concat(['openSection("planner")', 'addSong()', wait('.song-title-input'), type('.song-title-input', 'Here'), wait('.suggest-item')]) },
  { name: 'Youth Hub: planner, emailing the team', url: 'youthapp2.html', roles: ['master'], steps: HUB.concat(['openSection("planner")', type('#serviceDate', '2026-12-06'), wait('#eventSelect option[value="0"]'), pick('#eventSelect', '0'), 'emailSchedule()', wait('#emailModal.active'), 'scope']) },
  { name: 'Youth Hub: board', url: 'youthapp2.html', roles: ['youth', 'master'], steps: HUB.concat(['openSection("board")']) },
  { name: 'Youth Hub: an idea opened', url: 'youthapp2.html', roles: ['youth', 'master'], steps: HUB.concat(['openSection("board")', wait('[onclick*="openNoteDetail"]'), 'openNoteDetail("n_s3")', 'scope']) },
  { name: 'Youth Hub: a new note', url: 'youthapp2.html', roles: ['youth', 'master'], steps: HUB.concat(['openSection("board")', 'openAddNote()', 'scope']) },
  { name: 'Youth Hub: worship', url: 'youthapp2.html', roles: ['youth', 'master'], steps: HUB.concat(['openSection("worship")']) },
  { name: 'Youth Hub: a play-through card', url: 'youthapp2.html', roles: ['youth', 'master'], steps: HUB.concat(['openSection("worship")', wait('[onclick*="openKbCard"]'), 'openKbCard("kb_s3","playthrough")', wait('#kb-modal.open'), 'scope']) },
  { name: 'Youth Hub: library', url: 'youthapp2.html', roles: ['youth', 'master'], steps: HUB.concat(['openSection("library")']) },
  { name: 'Youth Hub: upload', url: 'youthapp2.html', roles: ['youth', 'master'], steps: HUB.concat(['openSection("upload")']) },
  { name: 'Youth Hub: news', url: 'youthapp2.html', roles: ['youth', 'master'], steps: HUB.concat(['openSection("news")']) },
  { name: 'Youth Hub: mine', url: 'youthapp2.html', roles: ['youth', 'master'], steps: HUB.concat(['openSection("mine")']) },
  { name: 'youth access: a code', url: 'youth-access.html', roles: ['youth'], steps: [] },

  /* ---- the youth charter: editing opens for the youth team's admins and master admins ---- */
  { name: 'Youth charter: the admin box', url: 'Youthcharter.html', roles: ['master'], steps: [wait('[onclick^="openPwModal"]'), click('[onclick^="openPwModal"]')] },
  { name: 'Youth charter: editing', url: 'Youthcharter.html', roles: ['master'], steps: GESTURE },
  { name: 'Youth charter: the title', url: 'Youthcharter.html', roles: ['master'], steps: GESTURE.concat(['toggleTitleEdit()', wait('#page-title-input')]) },
  { name: 'Youth charter: the words', url: 'Youthcharter.html', roles: ['master'], steps: GESTURE.concat([click('[onclick="openHtmlEditor()"]'), wait('#html-editor-wrap[style*="flex"]')]) }
];
