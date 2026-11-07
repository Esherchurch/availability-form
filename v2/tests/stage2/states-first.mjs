/* THE FIRST-STAGE PAGES' SCREENS, DEEPER THAN A PAGE'S FIRST VIEW (the
 * going-live test, 4 Nov 2026), for tests/audit-everything.mjs --states.
 * Each is opened, its steps run in the page, and every control on it is
 * pressed by each of its people at 375 and 1440 (the steps run again after
 * every press). The records are tests/stage2/seed-first.mjs's.
 *
 * The first view of each page is pressed by everyone it is for; these are
 * the parts a press opens (an editor, an admin tab, a card) whose own
 * controls the first view never draws. The kids, safeguarding, Present,
 * ChurchShow and Youth Hub screens are tests/stage3/states.mjs's.
 *
 * roles: the kinds of person each screen is for.
 */
const click = (sel) => 'document.querySelector(' + JSON.stringify(sel) + ').click()';
const wait = (sel) => 'wait:' + sel;
/* n made-up songs (eight seconds of a tone with a beat at 120 bpm, as WAV) put in a file box, as choosing files does. */
const tones = (sel, n) => 'var dt=new DataTransfer();for(var k=0;k<' + n + ';k++){var sr=22050,len=sr*8,b=new ArrayBuffer(44+len*2),v=new DataView(b),w=function(o,t){for(var i=0;i<t.length;i++)v.setUint8(o+i,t.charCodeAt(i))};'
  + 'w(0,"RIFF");v.setUint32(4,36+len*2,true);w(8,"WAVE");w(12,"fmt ");v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);v.setUint32(24,sr,true);v.setUint32(28,sr*2,true);v.setUint16(32,2,true);v.setUint16(34,16,true);w(36,"data");v.setUint32(40,len*2,true);'
  + 'for(var i=0;i<len;i++){var beat=(i%(sr/2))<400?0.9:0;v.setInt16(44+i*2,Math.round(32767*(0.3*Math.sin(2*Math.PI*(220+110*k)*i/sr)+beat*Math.sin(2*Math.PI*60*i/sr))*0.8),true)}'
  + 'dt.items.add(new File([b],"Audit Song "+(k+1)+" Synthetic.wav",{type:"audio/wav"}))}var f=document.querySelector(' + JSON.stringify(sel) + ');f.files=dt.files;f.dispatchEvent(new Event("change",{bubbles:true}))';
/* Every fold on the page open: a fold's contents are never on screen while it is shut. */
const openFolds = 'document.querySelectorAll("details").forEach(function(d){d.open=true})';
/* The audit's Sunday (its seed: nine days from now) put in a date field, as a person picks it. */
const pickSunday = (sel) => 'var d=new Date(Date.now()+9*864e5),p=function(x){return String(x).padStart(2,"0")},e=document.querySelector(' + JSON.stringify(sel) + ');e.value=d.getFullYear()+"-"+p(d.getMonth()+1)+"-"+p(d.getDate());e.dispatchEvent(new Event("change",{bubbles:true}))';

/* The four knowledge bases are one page four times (COLLECTION and CAT_KEY
   differ). Their categories live in the browser (CAT_KEY), so a step puts
   the seeded item's category there and draws the page again. */
const KB = [['EGBC-HowTo-AV.html', 'AV how-to'], ['EGBC-Troubleshoot-AV.html', 'AV troubleshooting'], ['EGBC-Training-Worship.html', 'Worship training'], ['EGBC-PlayThrough.html', 'Play-through']];
const kbCats = [wait('[onclick^="openCard"]'), 'localStorage.setItem(CAT_KEY, JSON.stringify(["Audit Category"])); categories = ["Audit Category"]; renderContent(allAssets); updateCatDropdowns()'];
const kbStates = KB.flatMap(([url, name]) => [
  { name: name + ': in its category', url, roles: ['master', 'worship'], steps: kbCats },
  { name: name + ': a card opened', url, roles: ['master', 'worship'], steps: kbCats.concat([click('[onclick^="openCard"]')]) },
  { name: name + ': admin, adding', url, roles: ['master'], steps: kbCats.concat(['toggleAdmin()']) },
  { name: name + ': admin, categories', url, roles: ['master'], steps: kbCats.concat(['toggleAdmin()', 'showAdminTab("categories")']) },
  { name: name + ': admin, managing', url, roles: ['master'], steps: kbCats.concat(['toggleAdmin()', 'showAdminTab("manage")', wait('[onclick^="editItem"]')]) },
  { name: name + ': editing an item', url, roles: ['master'], steps: kbCats.concat(['toggleAdmin()', 'showAdminTab("manage")', wait('[onclick^="editItem"]'), click('[onclick^="editItem"]')]) }
]);

export default kbStates.concat([

  /* ---- the hub ---- */
  { name: 'hub: a notice open', url: 'hub.html', roles: ['master', 'worship'], steps: [wait('#newsTrack'), 'openRead("audit_notice")'] },
  { name: 'hub: edit mode', url: 'hub.html', roles: ['master'], steps: [wait('#newsTrack'), 'toggleEditMode()'] },
  { name: 'hub: the banner editor', url: 'hub.html', roles: ['master'], steps: [wait('#newsTrack'), 'toggleEditMode()', 'editHero()'] },
  { name: 'hub: a team panel editor', url: 'hub.html', roles: ['master'], steps: [wait('#newsTrack'), 'toggleEditMode()', wait('[onclick^="editTeamPanel"]'), click('[onclick^="editTeamPanel"]')] },
  { name: 'hub: admin, people', url: 'hub.html', roles: ['master'], steps: [wait('#newsTrack'), 'openAdmin()', wait('[onclick^="linkPerson"]')] },
  { name: 'hub: admin, pages', url: 'hub.html', roles: ['master'], steps: [wait('#newsTrack'), 'openAdmin()', 'adminTab("pages")', wait('[onclick^="editPage"]')] },
  { name: 'hub: admin, editing a page', url: 'hub.html', roles: ['master'], steps: [wait('#newsTrack'), 'openAdmin()', 'adminTab("pages")', wait('[onclick^="editPage"]'), click('[onclick^="editPage"]')] },
  { name: 'hub: admin, notices', url: 'hub.html', roles: ['master'], steps: [wait('#newsTrack'), 'openAdmin()', 'adminTab("news")'] },
  { name: 'hub: admin, youth codes', url: 'hub.html', roles: ['master'], steps: [wait('#newsTrack'), 'openAdmin()', 'adminTab("youth")', wait('[onclick^="revokeGrant"]')] },

  /* ---- the song library, team videos ---- */
  { name: 'library: a song open', url: 'Library.html', roles: ['master', 'worship'], steps: [wait('.song'), click('.song')] },
  { name: 'videos: a video open', url: 'videos.html', roles: ['master', 'worship'], steps: [wait('[onclick^="openVideo"]'), click('[onclick^="openVideo"]')] },
  { name: 'videos: adding one', url: 'videos.html', roles: ['master', 'worship'], steps: [wait('[onclick^="openVideo"]'), 'openAdder()'] },
  { name: 'videos: more', url: 'videos.html', roles: ['master', 'worship'], steps: [wait('[onclick^="openVideo"]'), 'toggleMore()'] },

  /* ---- the team charters: their admins' edit mode (mayEdit, no password) ---- */
  { name: 'AV charter: edit mode', url: 'AVteamlandingpage.html', roles: ['master'], steps: [wait('#admin-bar'), 'unlockAdmin()'] },
  { name: 'core charter: edit mode', url: 'Coreteamcharter.html', roles: ['master'], steps: [wait('#admin-bar'), 'unlockAdmin()'] },
  { name: 'worship charter: edit mode', url: 'Worshipteamcharter.html', roles: ['master'], steps: [wait('#admin-bar'), 'unlockAdmin()'] },

  /* ---- the AV schematic ---- */
  { name: 'schematic: signals', url: 'schematic.html', roles: ['master', 'worship'], steps: ['showTab("signals")'] },
  { name: 'schematic: hops', url: 'schematic.html', roles: ['master', 'worship'], steps: ['showTab("hops")'] },
  { name: 'schematic: paths', url: 'schematic.html', roles: ['master', 'worship'], steps: ['showTab("paths")'] },
  { name: 'schematic: settings', url: 'schematic.html', roles: ['master'], steps: ['showTab("settings")'] },

  /* ---- the Core app (its own installed app; the hub app's Core space is the audit's) ----
     Its name is asked for once ("Who are you?"); a step gives it one first,
     except on the screen that asks. */
  ...coreStates(),

  /* ---- the rota planner and its practice copy ----
     An event's row opened (its teams, roles and Delete), the sheets the
     header's buttons open, and the date stepper the "+ Service" sheet's
     date carries. */
  ...['Planner.html'].flatMap((url) => {
    const nm = url === 'Planner.html' ? 'rota planner' : 'practice rota planner', R = ['master', 'areaAdmin'];
    const row = [wait('[onclick^="toggleEventExpand"]'), click('[onclick^="toggleEventExpand"]')];
    /* The practice planner keeps its rows in the tab's session storage, and these
       steps add rows: a fresh session before each opening, or every press adds
       another term of practices (6 Nov 2026: gigabytes in a minute). */
    const fresh = url === 'trainingrotaplanner.html';
    return [
      { name: nm + ': an event opened', url, roles: R, steps: row, fresh },
      { name: nm + ': adding practices', url, roles: R, steps: [wait('[onclick^="toggleEventExpand"]'), url === 'Planner.html' ? 'addPractices()' : 'addThursdayPractices()'], fresh },
      { name: nm + ': gathering availability', url, roles: R, steps: [wait('[onclick^="toggleEventExpand"]'), 'gatherTermAvailability()'], fresh },
      { name: nm + ': a new service', url, roles: R, steps: [wait('[onclick^="toggleEventExpand"]'), 'addSingleLine()'], fresh },
      { name: nm + ': sending the rotas', url, roles: R, steps: [wait('[onclick^="toggleEventExpand"]'), 'prepareDistributionPackage()'], fresh }
    ];
  }),
  /* ---- the Email Builder ---- */
  { name: 'email builder: who are you', url: 'EmailBuilder2.html', roles: ['master'], steps: [wait('#toolbar'), "document.getElementById('whoModal').classList.add('active')"] },
  { name: 'email builder: review and send', url: 'EmailBuilder2.html', roles: ['master'], steps: [wait('#toolbar'), 'openReview()'] },
  { name: 'email builder: drafts', url: 'EmailBuilder2.html', roles: ['master'], steps: [wait('#toolbar'), 'openDraftsModal()', wait('[onclick^="loadDraft"]')] },
  { name: 'email builder: picking people', url: 'EmailBuilder2.html', roles: ['master'], steps: [wait('#toolbar'), 'openPeople()'] },
  { name: 'email builder: sent', url: 'EmailBuilder2.html', roles: ['master'], steps: [wait('#toolbar'), 'openSent()'] },
  { name: 'email builder: making a GIF', url: 'EmailBuilder2.html', roles: ['master'], steps: [wait('#toolbar'), 'openGifModal()'] },
  /* ---- Performance notes: the audit's Sunday loaded, as a person does it ---- */
  ...['a service loaded', 'the song list', 'the monitor mix'].map((n, k) => ({ name: 'performance notes: ' + n, url: 'Performancenotes.html', roles: ['master', 'worship'],
    steps: [wait('#dateInput'), pickSunday('#dateInput'), wait('#roleSelect option:nth-child(2)'),
      "var r=document.getElementById('roleSelect');r.value=r.options[1].value", 'loadService()', wait('#songScreen .menu-item, #menu .menu-item')].concat(k === 1 ? ['toggleMenu()'] : k === 2 ? ['openMonitor()'] : []) })),
  /* ---- the monitor stage map: the audit's Sunday picked (its people, Save, Clear), and its setup ---- */
  ...(() => { const picked = [wait('#svcDate'), pickSunday('#svcDate'), wait('#svcPick option:nth-child(2)'),
    "var s=document.getElementById('svcPick');s.value=s.options[1].value;s.dispatchEvent(new Event('change',{bubbles:true}))", wait('.person')];
    return [
      { name: 'stage map: a service picked', url: 'MonitorStageMap.html', roles: ['master', 'worship'], steps: picked },
      { name: 'stage map: a person chosen', url: 'MonitorStageMap.html', roles: ['master', 'worship'], steps: picked.concat([click('.person')]) },
      { name: 'stage map: setup, a wedge and a group added', url: 'MonitorStageMap.html', roles: ['master'], steps: ['showTab("setup")', 'addWedge()', 'addGroup()'] }
    ]; })(),
  /* ---- the invitation maker: each fold open (a press opens one, and the page is opened again before the next press) ---- */
  { name: 'invitations: every fold open', url: 'birthday.html', roles: ['master', 'core'], steps: [wait('details.sect'), openFolds] },
  { name: 'invitations: the email, its account open', url: 'birthday.html', roles: ['master', 'core'], steps: [wait('details.sect'), 'openEmail()', wait('#resend-settings'), openFolds] },
  /* ---- the mix tools (master admins): made-up audio in their file box ---- */
  { name: 'mix analyser: two tracks in', url: 'mix-analyser.html', roles: ['master'], steps: [wait('#file'), tones('#file', 2), wait('#deckB option:nth-child(2)')] },
  { name: 'mix builder: two songs in', url: 'mix-builder.html', roles: ['master'], steps: [wait('#file'), tones('#file', 2), wait('[data-act="pin"], [data-act="up"]')] },
  { name: 'mix builder: importing', url: 'mix-builder.html', roles: ['master'], steps: [wait('#importBtn'), click('#importBtn')] },
  { name: 'rota planner: the More sheet (phone)', url: 'Planner.html', roles: ['master', 'areaAdmin'], steps: [wait('.pp-more'), click('.pp-more')] }
]);

/** The Core app's screens: the service plan and its editors, the email builder's sheets. */
function coreStates() {
  const named = ['localStorage.setItem("egbc_planner_user", "Audit")', 'currentUser = "Audit"'];
  const svc = named.concat(['openSection("service")', wait('[onclick^="openServiceDetail"]'), click('[onclick^="openServiceDetail"]'), wait(".order-item")]);
  const R = ['master', 'core'], url = 'CoreTeamApp.html';
  return [
    { name: 'core app: who are you', url, roles: R, steps: ['localStorage.removeItem("egbc_planner_user")', 'currentUser = ""', 'openModal("modal-who")'] },
    { name: 'core app: a service plan', url, roles: R, steps: svc },
    { name: 'core app: adding a song', url, roles: R, steps: svc.concat(['openSongModal()']) },
    { name: 'core app: adding an item', url, roles: R, steps: svc.concat(['openItemModal()']) },
    { name: 'core app: the service details', url, roles: R, steps: svc.concat(['openEditServiceMeta()']) },
    { name: 'core app: Email Team', url, roles: R, steps: svc.concat(['emailTeam()']) },
    { name: 'core app: a new service', url, roles: R, steps: named.concat(['openSection("service")', 'openNewServiceModal()']) },
    { name: 'core app: the email builder', url, roles: R, steps: named.concat(['openSection("email")']) },
    { name: 'core app: drafts', url, roles: R, steps: named.concat(['openSection("email")', 'openDraftsSheet()']) },
    { name: 'core app: mailing list', url, roles: R, steps: named.concat(['openSection("email")', 'openMailingSheet()']) }
  ];
}
