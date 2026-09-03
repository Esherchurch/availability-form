/* ===================================================================
   EGBC Team Hub
   ===================================================================

   The landing page is news, not choices - you arrive and read what has
   happened rather than picking a destination. Navigation lives in a
   slide-over panel reachable from anywhere, which is the fix for the
   old menu being hard to get back out of.

   Notices are one document each, with a `teams` array, so they can be
   aimed at particular teams and two people posting at once cannot
   overwrite each other. The old feed was a single array in a single
   document, which had both problems.
   =================================================================== */

/* Shown in any error message, so it is obvious which copy of this file the
   browser is actually running. */
const HUB_BUILD = 'v71';

/* egbc-auth.js owns a named app now, so the page's own default app is left
   alone. Reach for its handles, not firebase.firestore().

   If a cached egbc-auth.js is a version behind, EGBCAuth.db is undefined and
   every read below fails silently - the hub then sits on its loading
   skeletons for ever with nothing to say for itself. Fail loudly instead. */
if (typeof EGBCAuth === 'undefined' || !EGBCAuth.db) {
  document.addEventListener('DOMContentLoaded', function () {
    document.body.innerHTML =
      '<div style="min-height:100vh;display:flex;align-items:center;justify-content:center;' +
      'padding:24px;font-family:Montserrat,system-ui,sans-serif;background:#eef4f3;color:#14201f">' +
        '<div style="background:#fff;border:1px solid #dde7e6;border-radius:24px;padding:48px;' +
        'max-width:440px;text-align:center;box-shadow:0 18px 48px rgba(20,32,31,.12)">' +
          '<h1 style="font-size:19px;font-weight:900;margin:0 0 12px">Half of this page is out of date</h1>' +
          '<p style="font-size:14px;line-height:1.6;color:#3a4d4c;margin:0 0 24px">' +
          'Your browser is holding an old copy of one of the scripts. A hard refresh ' +
          '(Ctrl and F5 together) should clear it.</p>' +
          '<button onclick="location.reload(true)" style="background:#3d6263;color:#fff;border:none;' +
          'padding:12px 28px;border-radius:999px;font-size:10px;font-weight:900;text-transform:uppercase;' +
          'letter-spacing:.1em;cursor:pointer;font-family:inherit">Reload</button>' +
        '</div>' +
      '</div>';
  });
  throw new Error('hub-app.js: egbc-auth.js is missing or out of date');
}

const db = EGBCAuth.db;
const storage = EGBCAuth.storage();

const LOGO = 'https://firebasestorage.googleapis.com/v0/b/egbc-worship-planner.firebasestorage.app/o/copilot_image_1775806874083.jpeg?alt=media&token=7e9040a5-1d29-47e1-8f31-6e003db53ec8';

let ME = null, PAGES = [], NEWS = [], ACKED = new Set();

document.getElementById('logo').src = LOGO;

/* ---- WHICH TEAM ----------------------------------------------------
   People on one team never see a choice. People on several land on
   whichever they used last, with a switcher in the bar.

   The mode changes what you see FIRST - banner, panel, tool order. It
   never changes what exists: notices from every team you are on always
   appear, because a mode that hides things is how somebody ends up not
   knowing they were on the rota. */

const TEAM_KEY = 'egbc_hub_team';
let TEAM = null;

function availableTeams() {
  return EGBCAuth.isMaster()
    ? Object.keys(EGBCAuth.TEAMS).filter(t => !EGBCAuth.TEAMS[t].parent)
    : EGBCAuth.tabTeams();
}

function openTeamPicker() {
  closeTools();
  const teams = availableTeams();
  document.getElementById('pickLogo').src = LOGO;
  document.getElementById('pickTitle').textContent = TEAM ? 'Switch team' : 'Which team today?';
  document.getElementById('pickSub').textContent = TEAM
    ? 'Notices from all your teams show either way.'
    : "You're on more than one. You can switch whenever you like.";

  document.getElementById('pickList').innerHTML = teams.map(t => {
    const c = EGBCAuth.TEAMS[t] || { label: t, colour: 'var(--brand)' };
    const n = PAGES.filter(p => p.team === t && p.enabled !== false).length;
    return `<button class="pick-t" style="border-left-color:${c.colour}" onclick="chooseTeam('${t}')">
      <span style="width:34px;height:34px;border-radius:50%;background:${c.colour};flex-shrink:0"></span>
      <span><span class="nm">${esc(c.label)}</span><span class="ct">${n} tool${n === 1 ? '' : 's'}</span></span>
    </button>`;
  }).join('');

  document.getElementById('teamPicker').classList.add('on');
}

function chooseTeam(t) {
  TEAM = t;
  localStorage.setItem(TEAM_KEY, t);
  document.getElementById('teamPicker').classList.remove('on');
  applyTeam();
}

function applyTeam() {
  const c = EGBCAuth.TEAMS[TEAM] || { label: TEAM, colour: 'var(--brand)' };
  const btn = document.getElementById('teamSwitch');
  if (availableTeams().length > 1) {
    btn.style.display = '';
    btn.innerHTML = esc(c.label) + ' <span style="opacity:.5;font-size:9px">&#9662;</span>';
    btn.style.borderColor = c.colour;
    btn.style.color = c.colour;
  }
  loadHero();
  loadCharter();
  renderTeamPanels();
  renderNews();
  renderTools();
}

EGBCAuth.require().then(async profile => {
  ME = profile;
  document.getElementById('av').textContent = initials(profile.name || profile.email);

  if (EGBCAuth.isAdmin()) {
    document.getElementById('adminBtn').style.display = '';
    document.getElementById('editModeBtn').style.display = '';
  }

  await Promise.all([loadNews(), loadPages(), loadTeamPanels()]);

  const teams = availableTeams();
  const saved = localStorage.getItem(TEAM_KEY);
  if (teams.length === 1) { TEAM = teams[0]; }
  else if (saved && teams.includes(saved)) { TEAM = saved; }

  if (!TEAM && teams.length > 1) openTeamPicker();
  else applyTeam();
});

/* Editing is off until asked for. Admins spend most of their time reading
   the page like everyone else, and Edit buttons scattered about make it look
   like a construction site. */
let EDITING = false;

function toggleEditMode() {
  EDITING = !EDITING;
  document.body.classList.toggle('editing', EDITING);
  const he = document.getElementById('heroEdit');
  if (he) he.style.display = (EDITING && (EGBCAuth.isMaster() || (TEAM && EGBCAuth.isAdminOf(TEAM)))) ? '' : 'none';
  document.getElementById('editModeBtn').classList.toggle('on', EDITING);
  document.getElementById('editModeBtn').textContent = EDITING ? 'Done' : 'Edit mode';
  renderTeamPanels();
  renderNews();
}

/* ---- TEAM PANELS ---------------------------------------------------
   The hero and welcome are church-wide - this is the whole church's hub,
   not Worship and AV's. Anything team-specific goes in a panel below,
   one per team, so someone on Worship and Kids Church sees both rather
   than having to pick. */

let TEAMCONTENT = {};

async function loadTeamPanels() {
  try {
    const snap = await db.collection('teamContent').get();
    snap.docs.forEach(d => { TEAMCONTENT[d.id] = d.data(); });
  } catch (e) { console.error('Team panels failed', e); }
  renderTeamPanels();
}

function renderTeamPanels() {
  const el = document.getElementById('teamPanels');
  if (!el) return;

  /* Current team first, then anything else they are on - so a Kids Church
     notice is never out of sight just because Samy is in Worship mode. */
  const mine = availableTeams().sort((a, b) => (a === TEAM ? -1 : 0) - (b === TEAM ? -1 : 0));

  el.innerHTML = mine.map(t => {
    const c = EGBCAuth.TEAMS[t] || { label: t, colour: 'var(--brand)' };
    const d = TEAMCONTENT[t] || {};
    const canEdit = EGBCAuth.isAdminOf(t);
    if (!d.body && !(EDITING && canEdit)) return '';
    return `<div class="tp" style="border-left-color:${c.colour}">
      <div class="hd">
        <span class="nm" style="color:${c.colour}">${esc(c.label)}</span>
        ${EDITING && canEdit ? `<button class="btn" style="padding:5px 12px;margin-left:auto" onclick="editTeamPanel('${t}')">Edit</button>` : ''}
      </div>
      ${d.title ? `<h3 style="font-size:18px;font-weight:900;margin-bottom:8px">${esc(d.title)}</h3>` : ''}
      <div class="rich">${d.body ? safeHtml(d.body) : '<p style="color:var(--faint);font-style:italic">Nothing for this team yet.</p>'}</div>
    </div>`;
  }).join('');
}

async function editTeamPanel(team) {
  if (!EGBCAuth.isAdminOf(team)) { alert('That is not one of your teams.'); return; }
  PANEL_TEAM = team;
  const d = TEAMCONTENT[team] || {};
  document.getElementById('pnModalTitle').textContent = `${team} panel`;
  document.getElementById('pnTitle').value = d.title || '';
  document.getElementById('pnBody').value = htmlToText(d.body || '');
  document.getElementById('panelModal').classList.add('on');
  document.body.style.overflow = 'hidden';
}

let PANEL_TEAM = null;

function closePanelEditor() {
  document.getElementById('panelModal').classList.remove('on');
  document.body.style.overflow = '';
}

async function savePanel() {
  if (!PANEL_TEAM) return;
  const title = document.getElementById('pnTitle').value.trim();
  const body = textToHtml(document.getElementById('pnBody').value);
  try {
    await db.collection('teamContent').doc(PANEL_TEAM)
      .set({ title, body, updatedBy: ME.name || ME.email }, { merge: true });
    TEAMCONTENT[PANEL_TEAM] = { ...(TEAMCONTENT[PANEL_TEAM] || {}), title, body };
    closePanelEditor();
    renderTeamPanels();
  } catch (e) { alert('Could not save: ' + e.message); }
}

/* Nobody should have to type HTML. Blank lines become paragraphs on the way
   in, and paragraphs become blank lines on the way back out for editing. */
function textToHtml(t) {
  return (t || '').split(/\n\s*\n/).map(p => p.trim()).filter(Boolean)
    .map(p => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`).join('');
}

function htmlToText(h) {
  if (!h) return '';
  const d = new DOMParser().parseFromString(h, 'text/html');
  d.querySelectorAll('br').forEach(b => b.replaceWith('\n'));
  return [...d.body.children].map(el => (el.textContent || '').trim()).filter(Boolean).join('\n\n')
    || (d.body.textContent || '').trim();
}


/* ---- CHARTER -------------------------------------------------------
   The charter is what the team is expected to do, so it belongs on the page
   people land on. Behind a link it becomes "I have never seen that". */

/* Every team gets a charter on its own hub landing page - the hub IS the
   landing page. Four already have a standalone page; the rest do not need
   one, because the charter lives here. */
const CHARTER_PAGE = {
  /* Worship and AV share one - it is the "Worship & AV Team Charter", which
     is why AVteamlandingpage.html carries no text of its own. Choir folds
     into Worship, so it never lands here under its own name. */
  'Worship Team': { id: 'wider-worship-charter', url: 'Worshipteamcharter.html' },
  'AV Team':      { id: 'wider-worship-charter', url: 'Worshipteamcharter.html' },
  'Youth Worship':{ id: 'youth-charter',         url: 'Youthcharter.html' },
  'Core Team':    { id: 'core-team-charter',     url: 'Coreteamcharter.html' },
  'Kids Church':  { id: 'kids-church-charter' },
  'Lazers':       { id: 'lazers-charter' },
  'ReNu':         { id: 'renu-charter' }
};

let CHARTER_OPEN = false;


/* ---- CHARTER DEFAULTS ----------------------------------------------
   The charter pages hold their text as a default inside the file, so it
   never reached Firestore. These are those exact defaults, lifted from
   the pages, so they can be written once and then edited normally.
   AVteamlandingpage.html has no default text - it starts empty. */

const CHARTER_DEFAULTS = {
 "wider-worship-charter": {
  "title": "Worship & AV Team Charter",
  "html": "<h2>Worship &amp; AV Team Charter</h2>\n<blockquote>We are worshippers first, team members second, musicians and technicians third.</blockquote>\n\n<h3>Who We Are</h3>\n<p>We are a family of worshippers who serve together with humility, joy, and unity. Every person — musician, vocalist, or AV — plays a vital role in helping the church encounter God.</p>\n\n<h3>When We Disagree</h3>\n<p>We understand that we may not always share the same theological views or ways of doing things. When differences arise, we commit to talking with love, respect, and humility, keeping Jesus at the centre. Unity is not about agreeing on everything — it's about choosing love in everything.</p>\n\n<h3>Living as Followers of Jesus</h3>\n<p>As people who serve visibly, our lives should reflect the way of Jesus — not perfectly, but sincerely. We aim to honour Him in our relationships, decisions, and behaviour.</p>\n<p>We recognise that lifestyle choices shaped by a hedonistic or self-centred approach to life do not align with the calling of serving in worship ministry. This applies to choices, not to identity or things people cannot control.</p>\n<p>We choose to grow, to be accountable, and to live lives that point others to Jesus.</p>\n\n<h3>How We Serve Together</h3>\n<ul>\n<li><strong>We prepare well</strong> — learning our parts, listening to the set, and arriving ready</li>\n<li><strong>We stay flexible</strong> — songs and arrangements may change</li>\n<li><strong>We honour one another</strong> — with kindness and encouragement</li>\n<li><strong>We communicate early</strong> — about availability or challenges</li>\n<li><strong>We follow the worship leader's direction</strong> — with unity and trust</li>\n<li><strong>We partner with AV as one team</strong> — not two</li>\n<li><strong>We pray together</strong> — because worship is spiritual before it is musical</li>\n</ul>\n\n<h3>Sunday Expression</h3>\n<ul>\n<li>We arrive prepared, prayerful, and ready to bless the church</li>\n<li>We support the worship leader and each other with unity</li>\n<li>We respond to the Holy Spirit with sensitivity and trust</li>\n<li>We serve with cheerful hearts, remembering our goal is to help others see Jesus</li>\n</ul>"
 },
 "core-team-charter": {
  "title": "Core Team Charter",
  "html": "<h2>Core Team Charter</h2>\n<blockquote>We lead not by talent or title, but by character, humility, and a servant heart.</blockquote>\n\n<h3>Our Identity &amp; How We Carry Ourselves</h3>\n<p>The Core Team exists to set the culture of the Worship &amp; AV Ministry. We model what we want the whole team to become: worshippers first, musicians second, servants always.</p>\n\n<h3>When We Disagree</h3>\n<p>We recognise that we may not always share the same theological views or ministry preferences. When differences arise, we commit to speaking with love, humility, and respect, keeping Jesus at the centre of every conversation. Our unity is not built on sameness, but on Christ-like love (John 13:35).</p>\n\n<h3>Visible Lives of Discipleship</h3>\n<p>Because we serve in a visible ministry, our lives should reflect the character and way of Jesus — not perfectly, but sincerely. We commit to living in a way that honours Christ in our relationships, choices, and conduct.</p>\n<p>We recognise that certain lifestyle choices that reflect a hedonistic or self-centred way of living are not compatible with the calling of leading others in worship. This applies to behaviours we choose, not to aspects of identity or circumstances people cannot control.</p>\n<p>We choose integrity, accountability, and holiness, seeking to grow in Christ.</p>\n\n<h3>How We Lead</h3>\n<ul>\n<li><strong>Servant leadership</strong> — we lead by example, not position</li>\n<li><strong>Visible support on Sundays</strong> — present, engaged, and encouraging</li>\n<li><strong>Teachable spirits</strong> — always willing to learn and grow</li>\n<li><strong>Culture carriers</strong> — we set the tone for the whole team</li>\n<li><strong>Spiritual sensitivity</strong> — attuned to God and to one another</li>\n</ul>\n\n<h3>Our Commitment</h3>\n<ul>\n<li>We lead by example</li>\n<li>We protect unity</li>\n<li>We champion others</li>\n<li>We communicate clearly</li>\n<li>We honour AV as equal partners</li>\n<li>We steward Sundays with prayer</li>\n</ul>"
 },
 "youth-charter": {
  "title": "Youth Worship & AV Charter",
  "html": "<h2>Youth Worship &amp; AV Team Charter</h2>\n<blockquote>We are a team of young worshippers who want to help our church meet with God.</blockquote>\n\n<h3>Who We Are</h3>\n<p>We serve with love, joy, and unity — on instruments, with our voices, or on the AV team. Every one of us matters.</p>\n\n<h3>When We Don't Agree</h3>\n<p>Sometimes we might see things differently about faith or worship. That's okay. What matters is that we talk kindly, listen well, and treat each other with respect, keeping Jesus at the centre.</p>\n\n<h3>Living Like Jesus Outside of Sundays</h3>\n<p>Because we're on a team that people can see, our lives should show that we follow Jesus — not perfectly, but honestly. We choose to live in ways that honour Him, including the choices we make and the things we do when no one is watching.</p>\n<p>A lifestyle that's all about pleasure, partying, or doing whatever we want doesn't fit with being part of a worship team. This is about choices, not identity or things people cannot control.</p>\n<p>We choose to grow, to ask for help when we need it, and to live in a way that points people to Jesus.</p>\n\n<h3>How We Serve</h3>\n<ul>\n<li><strong>We show up ready</strong> — prepared and on time</li>\n<li><strong>We stay flexible</strong> — things change, and that's okay</li>\n<li><strong>We encourage each other</strong> — words build up, not tear down</li>\n<li><strong>We follow the leader</strong> — with trust and unity</li>\n<li><strong>We work with AV as one team</strong> — everyone counts</li>\n<li><strong>We pray together</strong> — because this is about more than music</li>\n</ul>\n\n<h3>Sundays</h3>\n<ul>\n<li>We arrive early</li>\n<li>We support the leader</li>\n<li>We help create a joyful atmosphere</li>\n<li>We worship wholeheartedly</li>\n<li>We serve visibly and kindly</li>\n</ul>"
 }
};

/* Write every charter we have text for, in one go, rather than making
   somebody switch teams and press the same button three times. */
/* Some Worship pages are for the whole church - the pin board, the live rota.
   They stay under Worship but need to reach everyone, which is the `everyone`
   flag. */
const SHARED_PAGES = ['view-only-rota.html', 'stickynotes.html', 'resources.html', 'trainingportalhub.html'];

async function markSharedPages() {
  if (!EGBCAuth.isMaster()) { alert('Only a master admin can do this.'); return; }

  const hits = PAGES.filter(p => SHARED_PAGES.includes((p.url || '').toLowerCase()) && !p.everyone);
  if (!hits.length) { alert('Nothing to change - the shared pages are already open to everyone.'); return; }

  if (!confirm(`Open these to everyone, whatever team they are on?\n\n${hits.map(h => '\u2022 ' + h.title).join('\n')}`)) return;

  try {
    const batch = db.batch();
    hits.forEach(h => batch.update(db.collection('hubPages').doc(h.id), { everyone: true }));
    await batch.commit();
    await loadPages();
    renderTools();
    renderAdminPages();
    alert(`${hits.length} now open to everyone.`);
  } catch (e) { alert('Could not update: ' + e.message); }
}

async function importAllCharters() {
  if (!EGBCAuth.isMaster()) { alert('Only a master admin can do this.'); return; }
  const ids = Object.keys(CHARTER_DEFAULTS);
  if (!confirm(`Bring across ${ids.length} charters exactly as they appear on the charter pages?\n\nAnything already saved is left alone.`)) return;

  let done = 0, skipped = 0;
  for (const id of ids) {
    try {
      const existing = (await db.collection('pageContent').doc(id).get()).data();
      if (existing && existing.html) { skipped++; continue; }
      await db.collection('pageContent').doc(id)
        .set({ title: CHARTER_DEFAULTS[id].title, html: CHARTER_DEFAULTS[id].html }, { merge: true });
      done++;
    } catch (e) { console.error('Charter import failed for', id, e); }
  }
  loadCharter();
  alert(`${done} brought across${skipped ? `, ${skipped} already had text and were left alone` : ''}.`);
}

async function importCharter() {
  const cfg = CHARTER_PAGE[TEAM];
  if (!cfg) return;
  if (!EGBCAuth.isAdminOf(TEAM)) { alert('That is not one of your teams.'); return; }

  const def = CHARTER_DEFAULTS[cfg.id];
  if (!def) { alert('There is no saved text for this team to bring across - write it here instead.'); return; }

  if (!confirm(`Bring across the ${TEAM} charter as it appears on the charter page?\n\nYou can edit it afterwards.`)) return;

  try {
    await db.collection('pageContent').doc(cfg.id).set({ title: def.title, html: def.html }, { merge: true });
    loadCharter();
  } catch (e) { alert('Could not bring it across: ' + e.message); }
}

async function loadCharter() {
  const card = document.getElementById('charterCard');
  const cfg = CHARTER_PAGE[TEAM];
  if (!cfg) { card.style.display = 'none'; return; }

  let d = null;
  try {
    d = (await db.collection('pageContent').doc(cfg.id).get()).data();
  } catch (e) { console.error('Charter load failed', e); }

  const c = EGBCAuth.TEAMS[TEAM] || { label: TEAM, colour: 'var(--brand)' };
  document.getElementById('charterTeam').textContent = c.label;
  document.getElementById('charterTeam').style.color = c.colour;
  const link = document.getElementById('charterLink');
  if (cfg.url) { link.href = cfg.url; link.style.display = ''; }
  else { link.style.display = 'none'; }

  const body = document.getElementById('charterBody');
  const more = document.getElementById('charterMore');
  const edit = document.getElementById('charterEdit');

  CHARTER_HTML = (d && d.html) || '';

  if (!CHARTER_HTML) {
    /* The charter pages hold their text as a default in the file and only
       write to Firestore once someone edits there. So there may be nothing
       stored yet even though the page looks full. */
    if (!EGBCAuth.isAdminOf(TEAM)) { card.style.display = 'none'; return; }
    document.getElementById('charterTitle').textContent = (d && d.title) || `${c.label} charter`;
    body.classList.remove('short');
    const canImport = !!CHARTER_DEFAULTS[cfg.id];
    body.innerHTML = (canImport
        ? `<p style="color:var(--faint);font-style:italic;margin-bottom:14px">
             The charter page keeps its text inside the file, so it never reached the
             database. Bring it across and it will show here from now on.</p>
           <button class="btn solid" onclick="importCharter()">Bring across the existing charter</button>`
        : `<p style="color:var(--faint);font-style:italic;margin-bottom:14px">
             No charter for ${esc(c.label)} yet. This is where people land, so it is
             worth setting out what the team is expected to do.</p>
           <button class="btn solid" onclick="editCharter()">Write the charter</button>`);
    more.style.display = 'none';
    if (edit) edit.style.display = '';
    card.style.display = '';
    return;
  }

  document.getElementById('charterTitle').textContent = (d && d.title) || `${c.label} charter`;
  /* The charter text starts with its own heading, which would repeat the
     title above it. Drop the first one. */
  body.innerHTML = stripLeadingHeading(safeHtml(CHARTER_HTML));
  body.classList.add('short');
  card.style.display = '';

  requestAnimationFrame(() => {
    more.style.display = body.scrollHeight > 260 ? '' : 'none';
    more.textContent = 'Read it all';
  });
}

let CHARTER_HTML = '';

function stripLeadingHeading(html) {
  const d = new DOMParser().parseFromString(html, 'text/html');
  const first = d.body.firstElementChild;
  if (first && /^H[1-3]$/.test(first.tagName)) first.remove();
  return d.body.innerHTML;
}

function toggleCharter() {
  CHARTER_OPEN = !CHARTER_OPEN;
  document.getElementById('charterBody').classList.toggle('short', !CHARTER_OPEN);
  document.getElementById('charterMore').textContent = CHARTER_OPEN ? 'Show less' : 'Read it all';
}

function editCharter() {
  if (!EGBCAuth.isAdminOf(TEAM)) { alert('That is not one of your teams.'); return; }
  document.getElementById('chModalTitle').textContent = `${TEAM} charter`;
  document.getElementById('chTitle').value = document.getElementById('charterTitle').textContent || '';
  document.getElementById('chBody').value = htmlToText(CHARTER_HTML);
  document.getElementById('charterModal').classList.add('on');
  document.body.style.overflow = 'hidden';
}

function closeCharterEditor() {
  document.getElementById('charterModal').classList.remove('on');
  document.body.style.overflow = '';
}

async function saveCharter() {
  const cfg = CHARTER_PAGE[TEAM];
  if (!cfg) return;
  const title = document.getElementById('chTitle').value.trim();
  const html = textToHtml(document.getElementById('chBody').value);
  try {
    /* Written back to pageContent, so the charter page and the hub always
       show the same words. */
    await db.collection('pageContent').doc(cfg.id).set({ title, html }, { merge: true });
    closeCharterEditor();
    loadCharter();
  } catch (e) { alert('Could not save: ' + e.message); }
}

/* ---- HERO AND BODY -----------------------------------------------
   Kept on portal/dashboardContent, the same document the old hub page
   used, so nothing is lost and the phone app keeps reading it. */

async function loadHero() {
  try {
    const d = (await db.collection('portal').doc('dashboardContent').get()).data() || {};
    const church = d.hero || {};
    const t = (TEAMCONTENT[TEAM] || {});

    /* A team's own banner wins where it has one, so Kids Church do not land
       on a photograph of the worship band. */
    const title = t.heroTitle || church.title || 'EGBC Team Hub';
    const sub = t.heroSub !== undefined && t.heroSub !== '' ? t.heroSub : (church.subtitle || '');
    const img = t.heroImage || church.bgImage || '';

    document.getElementById('heroTitle').textContent = title;
    document.getElementById('heroSub').textContent = sub;

    const hero = document.getElementById('hero');
    const c = EGBCAuth.TEAMS[TEAM];
    if (c && c.colour) hero.style.background = c.colour;

    const bg = document.getElementById('heroBg');
    const usingTeam = !!t.heroImage;
    const zoom = usingTeam ? (t.heroZoom || 100) : (church.zoom || 100);
    const px = usingTeam ? (t.heroX === undefined ? 50 : t.heroX) : (church.bgX === undefined ? 50 : church.bgX);
    const py = usingTeam ? (t.heroY === undefined ? 30 : t.heroY) : (church.bgPosition === undefined ? 30 : church.bgPosition);
    bg.style.backgroundImage = img ? `url('${img}')` : '';
    bg.style.backgroundSize = `${zoom}% auto`;
    bg.style.backgroundRepeat = 'no-repeat';
    bg.style.backgroundPosition = `${px}% ${py}%`;

    document.getElementById('bodyContent').innerHTML = d.body ||
      '<p style="color:var(--faint);font-style:italic">Nothing here yet.</p>';
  } catch (e) {
    console.error('Hero load failed', e);
    document.getElementById('heroTitle').textContent = 'EGBC Team Hub';
    document.getElementById('bodyContent').innerHTML = '';
  }
}

/* Banner editing. Karen is not going to open Firebase, so the picture is
   uploaded here - drag one in or pick one - and the URL never appears. */

let HERO_SCOPE = 'team';   // 'team' or 'church'
let HERO_IMG = '';
/* Framing: zoom as a percentage, and the focal point as 0-100 across and down.
   Stored so the same crop is used on the real banner. */
let HERO_ZOOM = 100, HERO_X = 50, HERO_Y = 30;

function editHero() {
  const canTeam = TEAM && EGBCAuth.isAdminOf(TEAM);
  HERO_SCOPE = canTeam ? 'team' : 'church';

  if (canTeam && EGBCAuth.isMaster()) {
    HERO_SCOPE = confirm(
      `Which banner?\n\nOK - just ${TEAM}\nCancel - the church-wide one, used by any team without their own`
    ) ? 'team' : 'church';
  }

  const t = TEAMCONTENT[TEAM] || {};
  document.getElementById('heroModalTitle').textContent =
    HERO_SCOPE === 'team' ? `${TEAM} banner` : 'Church-wide banner';
  document.getElementById('heroScope').textContent = HERO_SCOPE === 'team'
    ? `Only ${TEAM} see this one.`
    : 'Every team without a banner of their own falls back to this.';

  if (HERO_SCOPE === 'team') {
    document.getElementById('hrTitle').value = t.heroTitle || '';
    document.getElementById('hrSub').value = t.heroSub || '';
    setHeroPreview(t.heroImage || '', t.heroZoom, t.heroX, t.heroY);
  } else {
    db.collection('portal').doc('dashboardContent').get().then(d => {
      const h = (d.data() || {}).hero || {};
      document.getElementById('hrTitle').value = h.title || '';
      document.getElementById('hrSub').value = h.subtitle || '';
      setHeroPreview(h.bgImage || '', h.zoom, h.bgX, h.bgPosition);
    });
  }

  document.getElementById('heroModal').classList.add('on');
  document.body.style.overflow = 'hidden';
}

function closeHeroEditor() {
  document.getElementById('heroModal').classList.remove('on');
  document.body.style.overflow = '';
}

function setHeroPreview(url, zoom, x, y) {
  HERO_IMG = url || '';
  if (zoom !== undefined) HERO_ZOOM = zoom || 100;
  if (x !== undefined) HERO_X = (x === null || x === undefined) ? 50 : x;
  if (y !== undefined) HERO_Y = (y === null || y === undefined) ? 30 : y;

  const has = !!HERO_IMG;
  document.getElementById('hrStage').style.display = has ? '' : 'none';
  document.getElementById('hrControls').style.display = has ? '' : 'none';
  document.getElementById('hrClear').style.display = has ? '' : 'none';
  document.getElementById('hrDrop').style.padding = has ? '14px' : '22px';
  document.getElementById('hrIcon').style.display = has ? 'none' : '';
  document.getElementById('hrLabel').textContent = has
    ? 'Click to choose a different photo'
    : 'Drop a photo here, or click to choose one';

  document.getElementById('hrZoom').value = HERO_ZOOM;
  drawStage();
}

/* The preview is the banner's real shape, so what is dragged into place is
   exactly what everyone sees. */
function drawStage() {
  const img = document.getElementById('hrStageImg');
  if (!img) return;
  HERO_ZOOM = parseInt(document.getElementById('hrZoom').value, 10) || 100;
  img.style.backgroundImage = HERO_IMG ? `url('${HERO_IMG}')` : '';
  img.style.backgroundSize = `${HERO_ZOOM}% auto`;
  img.style.backgroundPosition = `${HERO_X}% ${HERO_Y}%`;
  document.getElementById('hrStageTitle').textContent =
    document.getElementById('hrTitle').value || 'Heading';
  document.getElementById('hrStageSub').textContent =
    document.getElementById('hrSub').value || '';
}

function resetHeroFraming() {
  HERO_ZOOM = 100; HERO_X = 50; HERO_Y = 30;
  document.getElementById('hrZoom').value = 100;
  drawStage();
}

function clearHeroImage() { setHeroPreview('', 100, 50, 30); }

/* Drag the photo about inside the frame. */
(function () {
  const wire = () => {
    const st = document.getElementById('hrStage');
    if (!st) return;
    let dragging = false, sx = 0, sy = 0, ox = 50, oy = 30;

    const down = e => {
      if (!HERO_IMG) return;
      dragging = true; st.style.cursor = 'grabbing';
      const p = e.touches ? e.touches[0] : e;
      sx = p.clientX; sy = p.clientY; ox = HERO_X; oy = HERO_Y;
      e.preventDefault();
    };
    const move = e => {
      if (!dragging) return;
      const p = e.touches ? e.touches[0] : e;
      const r = st.getBoundingClientRect();
      HERO_X = Math.max(0, Math.min(100, ox - ((p.clientX - sx) / r.width) * 100));
      HERO_Y = Math.max(0, Math.min(100, oy - ((p.clientY - sy) / r.height) * 100));
      drawStage();
      e.preventDefault();
    };
    const up = () => { dragging = false; st.style.cursor = 'grab'; };

    st.addEventListener('mousedown', down);
    st.addEventListener('touchstart', down, { passive: false });
    window.addEventListener('mousemove', move);
    window.addEventListener('touchmove', move, { passive: false });
    window.addEventListener('mouseup', up);
    window.addEventListener('touchend', up);
  };
  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', wire) : wire();
})();

async function uploadHeroImage(file) {
  if (!file) return;
  if (!file.type.startsWith('image/')) { alert('That is not an image.'); return; }
  if (file.size > 8 * 1024 * 1024) { alert('That photo is over 8 MB. Please use a smaller one.'); return; }

  const prog = document.getElementById('hrProgress');
  const bar = document.getElementById('hrBar');
  const stat = document.getElementById('hrStatus');
  prog.style.display = '';
  stat.textContent = 'Uploading';

  try {
    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
    const who = HERO_SCOPE === 'team' ? TEAM.replace(/[^\w]/g, '-').toLowerCase() : 'church';
    const path = `banners/${who}-${Date.now()}.${ext}`;

    const task = storage.ref(path).put(file, { contentType: file.type, cacheControl: 'public,max-age=31536000' });
    task.on('state_changed', sn => {
      bar.style.width = Math.round((sn.bytesTransferred / sn.totalBytes) * 100) + '%';
    });
    await task;

    setHeroPreview(await storage.ref(path).getDownloadURL(), 100, 50, 30);
    stat.textContent = 'Done';
    setTimeout(() => { prog.style.display = 'none'; bar.style.width = '0%'; }, 900);
  } catch (e) {
    stat.textContent = 'Failed';
    alert('Could not upload that photo: ' + e.message);
  }
}

async function saveHero() {
  const title = document.getElementById('hrTitle').value.trim();
  const sub = document.getElementById('hrSub').value.trim();

  try {
    if (HERO_SCOPE === 'team') {
      const patch = { heroTitle: title, heroSub: sub, heroImage: HERO_IMG,
                      heroZoom: HERO_ZOOM, heroX: HERO_X, heroY: HERO_Y };
      await db.collection('teamContent').doc(TEAM).set(patch, { merge: true });
      TEAMCONTENT[TEAM] = { ...(TEAMCONTENT[TEAM] || {}), ...patch };
    } else {
      await db.collection('portal').doc('dashboardContent')
        .set({ hero: { title, subtitle: sub, bgImage: HERO_IMG,
                       zoom: HERO_ZOOM, bgX: HERO_X, bgPosition: HERO_Y } }, { merge: true });
    }
    closeHeroEditor();
    loadHero();
  } catch (e) { alert('Could not save: ' + e.message); }
}

/* Drag and drop onto the picture area */
(function () {
  const wire = () => {
    const z = document.getElementById('hrDrop');
    if (!z) return;
    ['dragenter', 'dragover'].forEach(ev => z.addEventListener(ev, e => {
      e.preventDefault(); z.style.borderColor = 'var(--brand)'; z.style.background = 'var(--tint)';
    }));
    ['dragleave', 'drop'].forEach(ev => z.addEventListener(ev, e => {
      e.preventDefault(); z.style.borderColor = ''; z.style.background = '';
    }));
    z.addEventListener('drop', e => { e.preventDefault(); uploadHeroImage(e.dataTransfer.files[0]); });
  };
  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', wire) : wire();
})();


async function editBody() {
  const d = (await db.collection('portal').doc('dashboardContent').get()).data() || {};
  const cur = d.body || '';
  const next = prompt('Main content. HTML is allowed - <h2>, <p>, <a href>, <img src>:', cur);
  if (next === null) return;
  try {
    await db.collection('portal').doc('dashboardContent').set({ body: next }, { merge: true });
    loadHero();
  } catch (e) { alert('Could not save: ' + e.message); }
}

/* ---- NEWS --------------------------------------------------------- */

function myTeams() {
  return EGBCAuth.isMaster() ? Object.keys(EGBCAuth.TEAMS) : EGBCAuth.effectiveTeams();
}

/* A notice with no teams goes to everyone. Otherwise it appears only for
   people on one of those teams - which is what lets youth news carrying
   places and times stay away from anyone who should not see it. */
function forMe(n) {
  if (!Array.isArray(n.teams) || !n.teams.length) return true;
  if (EGBCAuth.isMaster()) return true;
  const mine = myTeams();
  return n.teams.some(t => mine.includes(t));
}

async function loadNews() {
  try {
    const snap = await db.collection('news').orderBy('createdAt', 'desc').limit(60).get();
    NEWS = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(forMe);

    if (ME && ME.memberId) {
      const acks = await db.collection('news').where('ackedBy', 'array-contains', ME.memberId).get()
        .catch(() => ({ docs: [] }));
      ACKED = new Set(acks.docs.map(d => d.id));
    }
    renderNews();
  } catch (e) {
    console.error('News load failed', e);
    document.getElementById('newsTrack').innerHTML =
      '<div class="empty"><div class="i">&#128226;</div><div class="t">No news yet</div></div>';
  }
}


/* Notice bodies are HTML - the old feed held pasted emails, complete with
   <meta> and <style>. Render the formatting, drop anything structural or
   executable, and flatten the rest so a whole email does not bring its own
   layout into a 330px column. */
function safeHtml(raw) {
  if (!raw) return '';
  const doc = new DOMParser().parseFromString(raw, 'text/html');

  doc.querySelectorAll('script,style,meta,link,title,iframe,object,embed,form,input,button').forEach(n => n.remove());

  doc.querySelectorAll('*').forEach(n => {
    [...n.attributes].forEach(a => {
      const keep = a.name === 'href' || a.name === 'src' || a.name === 'alt';
      if (!keep || /^javascript:/i.test(a.value)) n.removeAttribute(a.name);
    });
    if (n.tagName === 'A') { n.setAttribute('target', '_blank'); n.setAttribute('rel', 'noopener'); }
  });

  // Email HTML is nearly always tables; unwrap them into plain blocks.
  doc.querySelectorAll('table,tbody,thead,tr').forEach(n => n.replaceWith(...n.childNodes));
  doc.querySelectorAll('td,th').forEach(n => {
    const d = doc.createElement('div');
    d.append(...n.childNodes);
    n.replaceWith(d);
  });

  return doc.body.innerHTML;
}

/* Plain text, for working out whether something needs collapsing. */
function textOf(raw) {
  const d = new DOMParser().parseFromString(raw || '', 'text/html');
  return (d.body.textContent || '').replace(/\s+/g, ' ').trim();
}

/* Karen may remove a Kids Church notice, not an AV one. Church-wide notices
   belong to master admins. */
function canEditNews(n) {
  if (EGBCAuth.isMaster()) return true;
  const teams = n.teams || [];
  if (!teams.length) return false;
  return teams.some(t => EGBCAuth.isAdminOf(t));
}

function renderNews() {
  const pinned = NEWS.filter(n => n.pinned && !(n.requireAck && ACKED.has(n.id)));
  const rest = NEWS.filter(n => !pinned.includes(n));

  document.getElementById('pinned').innerHTML = pinned.map(n => {
    const seen = (n.ackedBy || []).length;
    return `<div class="pin">
      <div class="tag">&#9733; Please read</div>
      <h3>${esc(n.title)}</h3>
      <div class="bd">${safeHtml(n.body)}</div>
      ${n.requireAck ? `<button class="btn gold" onclick="ackNews('${n.id}')">I've read it</button>
        ${EDITING && canEditNews(n) ? `<span class="seen">${seen} so far</span>` : ''}` : ''}
    </div>`;
  }).join('');

  const track = document.getElementById('newsTrack');

  if (!rest.length) {
    track.innerHTML = '<div class="empty"><div class="i">&#128226;</div><div class="t">Nothing new</div></div>';
    stopNewsScroll();
    return;
  }

  /* Notices for the team in context lead, then the rest. */
  const ordered = rest.slice().sort((a, b) => {
    const mine = n => (n.teams || []).includes(TEAM) ? 0 : 1;
    return mine(a) - mine(b);
  });

  track.innerHTML = ordered.map(n => newsCard(n)).join('');
  startNewsScroll();
}

function newsCard(n) {
  const tags = (n.teams || []).map(t => {
    const c = EGBCAuth.TEAMS[t] || { label: t, colour: '#6b8281' };
    return `<span class="t" style="background:${c.colour}">${esc(c.label)}</span>`;
  }).join('');
  return `<div class="nw">
    <div class="m">
      ${tags || '<span class="t" style="background:#6b8281">Everyone</span>'}
      <span class="d">${when(n.createdAt)}</span>
      ${EDITING && canEditNews(n) ? `<button class="del" onclick="deleteNews('${n.id}')">Remove</button>` : ''}
    </div>
    <h4>${esc(n.title)}</h4>
    <div class="bd">${safeHtml(n.body)}</div>
  </div>`;
}

/* Continuous vertical scroll, as the original portal does it. The whole track
   is duplicated so when the first copy has passed, the second is already in
   place and the jump back to zero is invisible. */

const NEWS_SCROLL_SPEED = 0.5;
let newsScrollPos = 0, newsScrollRAF = null, newsScrollPaused = false;

function stopNewsScroll() {
  if (newsScrollRAF) { cancelAnimationFrame(newsScrollRAF); newsScrollRAF = null; }
}

function startNewsScroll() {
  stopNewsScroll();
  newsScrollPos = 0;

  const wrapper = document.getElementById('newsWrapper');
  const track = document.getElementById('newsTrack');
  if (!wrapper || !track) return;

  track.querySelectorAll('.news-clone').forEach(c => c.remove());
  track.style.transform = 'translateY(0)';

  const kick = () => {
    const wrapperH = wrapper.clientHeight, trackH = track.scrollHeight;
    if (wrapperH < 10 || trackH < 10) return false;
    if (trackH <= wrapperH) return true;   // it all fits; nothing to scroll

    Array.from(track.children).forEach(c => {
      const clone = c.cloneNode(true);
      clone.classList.add('news-clone');
      track.appendChild(clone);
    });

    const halfH = track.scrollHeight / 2;
    const step = () => {
      if (!newsScrollPaused) {
        newsScrollPos += NEWS_SCROLL_SPEED;
        if (newsScrollPos >= halfH) newsScrollPos = 0;
        track.style.transform = `translateY(-${newsScrollPos}px)`;
      }
      newsScrollRAF = requestAnimationFrame(step);
    };
    newsScrollRAF = requestAnimationFrame(step);
    return true;
  };

  /* The wrapper may still be zero-height on first paint. */
  if (!kick()) {
    const ro = new ResizeObserver((e, obs) => {
      if (e[0].contentRect.height > 10) { obs.disconnect(); kick(); }
    });
    ro.observe(wrapper);
  }
}

(function () {
  const wire = () => {
    const w = document.getElementById('newsWrapper');
    if (!w) return;
    w.addEventListener('mouseenter', () => { newsScrollPaused = true; });
    w.addEventListener('mouseleave', () => { newsScrollPaused = false; });
  };
  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', wire) : wire();
})();


function openRead(id) {
  const n = NEWS.find(x => x.id === id);
  if (!n) return;

  document.getElementById('rdMeta').innerHTML =
    ((n.teams || []).map(t => {
      const c = EGBCAuth.TEAMS[t] || { label: t, colour: '#6b8281' };
      return `<span class="t" style="background:${c.colour};font-size:9px;font-weight:900;text-transform:uppercase;
              letter-spacing:.08em;padding:3px 10px;border-radius:99px;color:#fff">${esc(c.label)}</span>`;
    }).join('') || '<span class="t" style="background:#6b8281;font-size:9px;font-weight:900;text-transform:uppercase;letter-spacing:.08em;padding:3px 10px;border-radius:99px;color:#fff">Everyone</span>') +
    `<span style="font-size:11px;color:var(--faint);font-weight:700">${when(n.createdAt)}</span>`;

  document.getElementById('rdTitle').textContent = n.title;
  document.getElementById('rdBody').innerHTML = safeHtml(n.body);
  document.getElementById('readModal').classList.add('on');
  document.body.style.overflow = 'hidden';
}

function closeRead() {
  document.getElementById('readModal').classList.remove('on');
  document.body.style.overflow = '';
}

async function ackNews(id) {
  if (!ME || !ME.memberId) { alert('We do not know who you are yet.'); return; }
  try {
    await db.collection('news').doc(id)
      .update({ ackedBy: firebase.firestore.FieldValue.arrayUnion(ME.memberId) });
    ACKED.add(id);
    const n = NEWS.find(x => x.id === id);
    if (n) n.ackedBy = [...(n.ackedBy || []), ME.memberId];
    renderNews();
  } catch (e) { alert('Could not record that: ' + e.message); }
}

async function deleteNews(id) {
  const n = NEWS.find(x => x.id === id);
  if (!confirm(`Remove "${n ? n.title : 'this notice'}"?`)) return;
  try { await db.collection('news').doc(id).delete(); await loadNews(); }
  catch (e) { alert('Could not remove: ' + e.message); }
}

function openNewsEditor(id) {
  const n = id ? NEWS.find(x => x.id === id) : null;
  document.getElementById('newsModalTitle').textContent = n ? 'Edit notice' : 'New notice';
  document.getElementById('nwId').value = n ? n.id : '';
  document.getElementById('nwTitle').value = n ? n.title : '';
  document.getElementById('nwBody').value = n ? n.body : '';
  document.getElementById('nwPinned').checked = n ? !!n.pinned : false;
  document.getElementById('nwAck').checked = n ? !!n.requireAck : false;

  /* An admin may only post to areas they manage - Karen to Kids Church,
     Core Team to Worship and AV.

     The team you are currently in is preselected, not Everyone. Broadcasting
     to the whole church should be a deliberate act - otherwise every notice
     goes to everybody and people stop reading them. Everyone is still there
     for the things that genuinely are church-wide, like the bulletin. */
  const areas = EGBCAuth.isMaster() ? Object.keys(EGBCAuth.TEAMS) : EGBCAuth.adminAreas();
  const selectable = areas.filter(t => !EGBCAuth.TEAMS[t].parent);

  let on;
  if (n) {
    on = new Set(n.teams || []);
  } else if (TEAM && selectable.includes(TEAM)) {
    on = new Set([TEAM]);
  } else {
    on = new Set();
  }

  document.getElementById('nwTeams').innerHTML =
    selectable.map(t =>
      `<button class="chip ${on.has(t) ? 'on' : ''}" data-team="${t}" onclick="pickTeam(this)">${esc(EGBCAuth.TEAMS[t].label)}</button>`
    ).join('') +
    `<button class="chip ${!on.size ? 'on' : ''}" data-team="" onclick="pickTeam(this)"
      style="margin-left:6px;border-style:dashed">Everyone</button>`;

  document.getElementById('newsModal').classList.add('on');
}
function closeNewsEditor() { document.getElementById('newsModal').classList.remove('on'); }

function pickTeam(el) {
  if (el.dataset.team === '') {
    document.querySelectorAll('#nwTeams .chip').forEach(c => c.classList.toggle('on', c === el));
  } else {
    el.classList.toggle('on');
    document.querySelector('#nwTeams .chip[data-team=""]').classList.remove('on');
  }
}

async function saveNews() {
  const title = document.getElementById('nwTitle').value.trim();
  const body = document.getElementById('nwBody').value.trim();
  if (!title) { alert('It needs a title.'); return; }

  const teams = Array.from(document.querySelectorAll('#nwTeams .chip.on'))
    .map(c => c.dataset.team).filter(Boolean);

  if (!teams.length && !confirm('This will go to everyone in the church, on every team.\n\nPost it church-wide?')) return;

  const data = {
    title, body, teams,
    pinned: document.getElementById('nwPinned').checked,
    requireAck: document.getElementById('nwAck').checked,
    postedBy: ME.name || ME.email
  };

  try {
    const id = document.getElementById('nwId').value;
    if (id) {
      await db.collection('news').doc(id).update(data);
    } else {
      data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
      data.ackedBy = [];
      await db.collection('news').add(data);
    }
    closeNewsEditor();
    await loadNews();
  } catch (e) { alert('Could not post: ' + e.message); }
}

/* ---- TOOLS PANEL --------------------------------------------------- */

async function loadPages() {
  try {
    const snap = await db.collection('hubPages').orderBy('order').get();
    PAGES = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (e) { console.error('Pages load failed', e); PAGES = []; }
}

/* Pages built for a phone or tablet. They are installed from the home screen
   and are not much use in a desktop tools list. */
const MOBILE_APPS = ['coreteamapp.html', 'worshiphubapp.html', 'youthapp2.html', 'performancenotes.html'];

/* Charters live on the landing page now, so a link to them here is noise. */
function isCharterPage(url) {
  const u = (url || '').toLowerCase();
  if (!u) return false;
  /* Choir, Kids Church, Lazers and ReNu have a charter but no standalone
     page, so their entries carry no url. */
  if (Object.values(CHARTER_PAGE).some(c => c.url && c.url.toLowerCase() === u)) return true;
  /* AVteamlandingpage is the AV charter page. It is not in CHARTER_PAGE,
     because AV point at the shared Worship & AV charter - which left it as
     the one charter that still showed as a tile, leading to a page with no
     text on it. */
  return EXTRA_CHARTER_PAGES.includes(u);
}


/* ---- IMPORT THE EXISTING MENU ---------------------------------------
   portal/menuItems is the real navigation: nested parent/child, with a
   `role` of worship or core. Importing it keeps the structure people
   already know instead of inventing a new arrangement. */

async function importOldMenu() {
  if (!EGBCAuth.isMaster()) { alert('Only a master admin can do this.'); return; }

  let items;
  try {
    const d = (await db.collection('portal').doc('menuItems').get()).data() || {};
    items = d.items || d.menu || (Array.isArray(d) ? d : null);
  } catch (e) { alert('Could not read the menu: ' + e.message); return; }

  if (!items || !items.length) { alert('No menu found in portal/menuItems.'); return; }

  /* 'none' is how the original stores "no parent" - treating it as a real id
     orphans the item and it never renders. */
  const clean = items.map(it => ({
    id: String(it.id || ''),
    name: it.name || '',
    url: it.url || '',
    icon: it.icon || '',
    role: it.role || '',
    parent: (!it.parent || it.parent === 'none') ? '' : String(it.parent)
  }));

  const byId = {};
  clean.forEach(it => { byId[it.id] = it; });

  /* The original menu has exactly two levels of visibility: `worship` and
     `core`. `worship` does NOT mean the Worship Team - it means everyone
     signed in. Rota, the music databases, Youth Worship and AV Team are all
     marked worship, because they are shared. Only Core Team and what sits
     under it is restricted. */
  const isCore = it => {
    let cur = it, guard = 0;
    while (cur && guard++ < 8) {
      if (cur.role === 'core') return true;
      cur = cur.parent ? byId[cur.parent] : null;
    }
    return false;
  };

  const tidyUrl = u => {
    if (!u || u === 'landing' || u === '#') return '';
    return u.replace(/^https?:\/\/esherchurch\.github\.io\/availability-form\/+/, '').replace(/^\/+/, '');
  };

  const ICONS = { home: '\u{1F3E0}', calendar: '\u{1F4C5}', music: '\u{1F3B5}', users: '\u{1F465}',
                  mail: '\u2709', settings: '\u2699', book: '\u{1F4D8}', video: '\u{1F3AC}',
                  tool: '\u{1F6E0}', file: '\u{1F4C4}' };

  /* Build the whole thing before touching anything, so a menu that yields
     nothing cannot wipe what is already there. */
  const rows = [];
  clean.forEach((it, i) => {
    const url = tidyUrl(it.url);
    const hasKids = clean.some(x => x.parent === it.id);
    if (!url && !hasKids) return;
    const core = isCore(it);
    rows.push({
      title: it.name || 'Untitled',
      url,
      description: '',
      icon: ICONS[it.icon] || '\u{1F4C4}',
      team: core ? 'Core Team' : 'Worship Team',
      everyone: !core,
      legacyId: it.id,
      legacyParent: it.parent,
      heading: !url,
      order: (i + 1) * 10,
      enabled: true
    });
  });

  const pages = rows.filter(r => !r.heading).length;
  if (!pages) {
    alert(`Found ${items.length} menu entries but none of them point at a page, so nothing has been changed.\n\nThe menu may only contain headings.`);
    return;
  }

  const shared = rows.filter(r => r.everyone && !r.heading).length;
  const coreOnly = pages - shared;

  if (!confirm(`Found ${pages} page${pages === 1 ? '' : 's'} and ${rows.length - pages} heading${rows.length - pages === 1 ? '' : 's'}.\n\n` +
    `${shared} open to everyone\n${coreOnly} for Core Team only\n\n` +
    'That is how the menu has them: everything marked "worship" is shared, ' +
    'and only what sits under Core Team is restricted.' +
    (PAGES.length ? `\n\nThis replaces the ${PAGES.length} currently listed.` : '')
  )) return;

  try {
    const batch = db.batch();
    PAGES.forEach(p => batch.delete(db.collection('hubPages').doc(p.id)));
    rows.forEach(r => batch.set(db.collection('hubPages').doc(), r));
    await batch.commit();

    await loadPages();
    renderTools();
    renderAdminPages();
    alert(`${pages} brought across - ${shared} open to everyone, ${coreOnly} for Core Team.\n\nYour menu only covers part of the suite, so add whatever is missing.`);
  } catch (e) { alert('Could not import: ' + e.message); }
}


/* ---- THE REST OF THE SUITE ------------------------------------------
   The old menu covers about a dozen pages. The other thirty-odd were
   reachable only from SharePoint, which means the day SharePoint goes off
   they exist but nobody can get to them - and nobody reports a page that
   never errors, they just stop using it.

   This is the migration checklist. Adding is additive: anything already
   registered, by url, is left exactly as it is. Run it as often as you
   like; run it again after adding a page by hand.

   Deliberately absent, so their absence is a decision rather than an
   oversight:
     studio, sitemaker, socialmaker, photoeditor - Calla Design. A
       production suite, not EGBC team content.
     birthday, Videoeditor                       - out of scope.
     Handover                                    - not part of this suite.
     hubresources                                - superseded by resources.html,
       and it carries a password in plain source.
     SharepointHeader                            - the iframe header inside the
       old site. Dies with it.
   None of them are guarded or deleted by leaving them out. They stay
   reachable by bookmark exactly as they are today.

   hub, login and youth-access are absent too - they are the way in, not
   destinations. */

const WORSHIP_AV = ['Worship Team', 'AV Team'];

const REGISTRY = [

  /* -- everyone signed in -------------------------------------------- */
  { url: 'view-only-rota.html', title: 'Live Rota', icon: '\u{1F4C5}', team: 'Worship Team', everyone: true,
    description: 'Who is on, and when' },
  { url: 'resources.html', title: 'Team Resources', icon: '\u{1F4C1}', team: 'Worship Team', everyone: true,
    description: 'Documents and links for your teams' },
  /* One page for every team, like the hub itself. It shows whichever team
     you are on, so it is a single entry rather than one per team. */
  { url: 'videos.html', title: 'Team Videos', icon: '\u{1F3AC}', team: 'Worship Team', everyone: true,
    description: 'Watch your team\'s videos, and search inside them' },

  /* -- worship -------------------------------------------------------
     The song library goes to AV as well: Worship need the songs, AV need
     the lyrics. It stops there - Kids Church and Lazers do not see it. */
  { url: 'Library.html', title: 'Song Library', icon: '\u{1F3B5}', team: 'Worship Team', teams: WORSHIP_AV,
    description: 'Every song, with keys and usage' },
  { url: 'sundayplannersonglibrary.html', title: 'Song Library - quick view', icon: '\u{1F3B5}',
    team: 'Worship Team', teams: WORSHIP_AV, description: 'Cut-down list for a Sunday' },
  { url: 'song-summary.html', title: 'Song Summary', icon: '\u{1F4CA}', team: 'Worship Team', teams: WORSHIP_AV,
    description: 'What we have sung, and how often' },
  { url: 'Performancenotes.html', title: 'Performance Notes', icon: '\u{1F4DD}', team: 'Worship Team',
    description: 'Notes against a service' },
  { url: 'EGBC-PlayThrough.html', title: 'Play Through', icon: '\u{1F3AC}', team: 'Worship Team',
    description: 'Practice videos' },
  { url: 'EGBC-Training-Worship.html', title: 'Worship Training', icon: '\u{1F4D8}', team: 'Worship Team',
    description: 'Training material for the worship team' },
  { url: 'stickynotes.html', title: 'Suggestions Board', icon: '\u{1F4CC}', team: 'Worship Team', everyone: true,
    description: 'Song suggestions and notices' },
  { url: 'worshiphubapp.html', title: 'Worship Hub', icon: '\u{1F4F1}', team: 'Worship Team',
    description: 'The phone app' },
  { url: 'Worshipteamcharter.html', title: 'Worship & AV Team Charter', icon: '\u{1F4DC}', team: 'Worship Team',
    description: 'How we serve together' },
  /* Registered only because it is still the sole editor for the news feed.
     It comes out the day that moves into the hub. */
  { url: 'EGBCWorship&AV.html', title: 'Worship & AV Hub (old)', icon: '\u{1F310}', team: 'Worship Team',
    adminOnly: true, description: 'The old SharePoint hub - still the only news editor' },

  /* -- AV ------------------------------------------------------------- */
  { url: 'EGBC-Troubleshoot-AV.html', title: 'AV Troubleshoot', icon: '\u{1F6E0}', team: 'AV Team',
    description: 'When something is not working' },
  { url: 'EGBC-HowTo-AV.html', title: 'How To AV', icon: '\u{1F4D8}', team: 'AV Team',
    description: 'Running the desk, step by step' },
  { url: 'schematic.html', title: 'AV Infrastructure Mapper', icon: '\u{1F50C}', team: 'AV Team',
    description: 'What is plugged into what' },
  { url: 'MonitorStageMap.html', title: 'Monitor Setup', icon: '\u{1F39A}', team: 'AV Team',
    description: 'Stage monitor positions and mixes' },
  /* AV read the Worship & AV charter, so this page carries no text of its
     own. It is the AV landing page, not a tool - see AV_CHARTER_PAGES. */
  { url: 'AVteamlandingpage.html', title: 'AV Team Charter', icon: '\u{1F4DC}', team: 'AV Team',
    description: 'Shared with the worship team' },

  /* -- youth worship, adult leaders ----------------------------------- */
  { url: 'youthserviceplanner.html', title: 'Youth Service Planner', icon: '⛪', team: 'Youth Worship',
    description: 'Planning a youth-led service' },
  { url: 'youthapp2.html', title: 'Youth Hub', icon: '\u{1F4F1}', team: 'Youth Worship',
    description: 'The phone app' },
  { url: 'Youthcharter.html', title: 'Youth Charter', icon: '\u{1F4DC}', team: 'Youth Worship',
    description: 'How the youth team serve' },

  /* -- core team, build tools ----------------------------------------- */
  { url: 'Planner.html', title: 'Master Rota Planner', icon: '\u{1F4C5}', team: 'Core Team',
    description: 'Build and send the rota' },
  { url: 'SundayServicePlanner.html', title: 'Sunday Service Planner', icon: '⛪', team: 'Core Team',
    description: 'Plan the running order' },
  { url: 'music-uploader.html', title: 'Music Upload', icon: '\u{1F3B5}', team: 'Core Team',
    description: 'Add a song and its files' },
  { url: 'batchupload.html', title: 'Batch Music Importer', icon: '\u{1F4E4}', team: 'Core Team',
    description: 'Add many songs at once' },

  /* -- core team, administration -------------------------------------- */
  { url: 'addressbook.html', title: 'Address Book', icon: '\u{1F465}', team: 'Core Team', adminOnly: true,
    description: 'People, households and teams' },
  { url: 'EmailBuilder2.html', title: 'Email Compiler', icon: '✉', team: 'Core Team',
    description: 'Write and send to a team' },
  { url: 'inventory-system-2.html', title: 'EGBC Inventory', icon: '\u{1F4E6}', team: 'Core Team',
    description: 'Equipment and where it lives' },
  { url: 'index.html', title: 'Availability Form', icon: '\u{1F4CB}', team: 'Core Team',
    description: 'The public form - this is the link to send out' },
  { url: 'data-tools.html', title: 'Backup & Restore', icon: '\u{1F4BE}', team: 'Core Team', adminOnly: true,
    description: 'Take a copy of everything, or put one back' },
  /* Its <title> is "EGBC Worship Planner", which collides with the Sunday
     planner. Named for what it is instead. */
  { url: 'CoreTeamApp.html', title: 'Core Team App', icon: '\u{1F4F1}', team: 'Core Team',
    description: 'The phone app - rota editing by tapping' },
  { url: 'Coreteamcharter.html', title: 'Core Team Charter', icon: '\u{1F4DC}', team: 'Core Team',
    description: 'How the core team work' },

  /* -- core team, training copies -------------------------------------- */
  { url: 'trainingportalhub.html', title: 'Training Portal', icon: '\u{1F4DA}', team: 'Core Team', everyone: true,
    description: 'Practice copies of the main tools' },
  { url: 'trainingrotaplanner.html', title: 'Training - Rota Planner', icon: '\u{1F4DA}', team: 'Core Team',
    description: 'Practice copy. Nothing here reaches the real rota' },
  { url: 'training Sunday planner.html', title: 'Training - Sunday Planner', icon: '\u{1F4DA}', team: 'Core Team',
    description: 'Practice copy' },
  { url: 'trainingbatchimporter.html', title: 'Training - Batch Importer', icon: '\u{1F4DA}', team: 'Core Team',
    description: 'Practice copy' },
  /* Its own title is "Song Library - TRAINING". It is not a separate music
     database. */
  { url: 'trainingmusicdatabase.html', title: 'Training - Song Library', icon: '\u{1F4DA}', team: 'Core Team',
    description: 'Practice copy. Edits are kept in your browser only' },

  /* -- instructions ----------------------------------------------------
     These attach to the tool they explain rather than sitting as tiles of
     their own. Nothing in the repo linked to any of them, so they existed
     without being findable. */
  { url: 'rotaplannerinstructions.html', title: 'How to use the Rota Planner', icon: '❓',
    team: 'Core Team', helpFor: 'Planner.html' },
  { url: 'Serviceplannerinstructions.html', title: 'How to use the Sunday Planner', icon: '❓',
    team: 'Core Team', helpFor: 'SundayServicePlanner.html' },
  { url: 'emailcompilerinstructions.html', title: 'How to use the Email Compiler', icon: '❓',
    team: 'Core Team', helpFor: 'EmailBuilder2.html' },
  /* This page is headed "Batch Music Importer - How to use". I had it on
     music-uploader.html, which is a different tool - so the ? on Music Upload
     opened the guide to something else. The old SharePoint menu made the same
     mistake in reverse, labelling batchupload.html as "Music Uploader". */
  { url: 'uploaderinstructions.html', title: 'How to use the Batch Music Importer', icon: '❓',
    team: 'Core Team', helpFor: 'batchupload.html' }
];

/* AVteamlandingpage carries no text of its own, so a tile pointing at it
   leads to a blank page. It belongs on the AV landing page like the other
   charters. */
const EXTRA_CHARTER_PAGES = ['avteamlandingpage.html'];


/* ---- IS THE FILENAME RIGHT? -----------------------------------------
   Casing and spaces are fatal on GitHub Pages and silent in the browser -
   a wrong name gives a 404 nobody reports. Rather than trust this list,
   ask the server. */

async function headCheck(url) {
  try {
    const r = await fetch(url, { method: 'HEAD', cache: 'no-store' });
    return r.ok;
  } catch (e) { return false; }
}

/* Small batches - forty at once upsets some browsers, and this is not a
   race. */
async function checkUrls(urls, onProgress) {
  const bad = [];
  for (let i = 0; i < urls.length; i += 6) {
    const slice = urls.slice(i, i + 6);
    const results = await Promise.all(slice.map(headCheck));
    slice.forEach((u, n) => { if (!results[n]) bad.push(u); });
    if (onProgress) onProgress(Math.min(i + 6, urls.length), urls.length);
  }
  return bad;
}

async function checkRegistryLinks() {
  if (!EGBCAuth.isAdmin()) { alert('Only an admin can do this.'); return; }
  const urls = PAGES.filter(p => p.url && !p.heading).map(p => p.url);
  if (!urls.length) { alert('Nothing registered yet.'); return; }

  const btn = document.getElementById('btnCheckLinks');
  const was = btn ? btn.textContent : '';
  const say = (a, b) => { if (btn) btn.textContent = `Checking ${a}/${b}`; };

  try {
    const bad = await checkUrls(urls, say);
    if (btn) btn.textContent = was;
    if (!bad.length) { alert(`All ${urls.length} links work.`); return; }
    alert(`${bad.length} of ${urls.length} do not load:\n\n` +
      bad.map(u => '• ' + u).join('\n') +
      '\n\nUsually the filename is spelt or capitalised differently in the repo. ' +
      'Edit the entry rather than deleting it.');
  } catch (e) {
    if (btn) btn.textContent = was;
    alert('Could not check: ' + e.message);
  }
}


/* ---- ADD THE MISSING PAGES ------------------------------------------ */

async function seedRegistry() {
  if (!EGBCAuth.isMaster()) { alert('Only a master admin can do this.'); return; }

  const have = new Set(PAGES.map(p => (p.url || '').toLowerCase()).filter(Boolean));
  const missing = REGISTRY.filter(r => !have.has(r.url.toLowerCase()));

  if (!missing.length) {
    alert(`Nothing to add - all ${REGISTRY.length} pages are already registered.`);
    return;
  }

  const btn = document.getElementById('btnSeed');
  const was = btn ? btn.textContent : '';

  /* Check before writing, not after. A registry full of 404s is worse than
     an incomplete one, because it looks finished. */
  let bad = [];
  try {
    if (btn) btn.textContent = 'Checking...';
    bad = await checkUrls(missing.map(r => r.url),
      (a, b) => { if (btn) btn.textContent = `Checking ${a}/${b}`; });
  } catch (e) { /* offline or blocked - fall through and let the admin decide */ }
  if (btn) btn.textContent = was;

  const badSet = new Set(bad);
  const good = missing.filter(r => !badSet.has(r.url));

  let msg = `${missing.length} page${missing.length === 1 ? '' : 's'} not yet registered.\n\n`;
  if (bad.length) {
    msg += `${bad.length} of them did not load and will be SKIPPED:\n` +
           bad.map(u => '• ' + u).join('\n') +
           '\n\nThat is almost always a filename spelt differently in the repo.\n\n';
  }
  if (!good.length) { alert(msg + 'Nothing left to add.'); return; }
  msg += `Add the remaining ${good.length}?\n\n` +
         `Nothing already registered is changed, and nothing is deleted.`;
  if (!confirm(msg)) return;

  /* Order after whatever is already there, so an import that ran first keeps
     its arrangement. */
  let next = PAGES.reduce((m, p) => Math.max(m, p.order || 0), 0) + 10;

  try {
    const batch = db.batch();
    good.forEach(r => {
      const row = {
        title: r.title,
        url: r.url,
        description: r.description || '',
        icon: r.icon || '\u{1F4C4}',
        team: r.team,
        everyone: !!r.everyone,
        adminOnly: !!r.adminOnly,
        order: next,
        enabled: true
      };
      if (r.teams) row.teams = r.teams;
      if (r.helpFor) row.helpFor = r.helpFor;
      batch.set(db.collection('hubPages').doc(), row);
      next += 10;
    });
    await batch.commit();

    await loadPages();
    renderTools();
    renderAdminPages();

    const tiles = good.filter(r => !r.helpFor).length;
    alert(`${good.length} added.\n\n` +
      `${tiles} as tiles, ${good.length - tiles} attached to the tool they explain.` +
      (bad.length ? `\n\n${bad.length} skipped - see above.` : ''));
  } catch (e) { alert('Could not add: ' + e.message); }
}


/* ---- REBUILD FROM THE VERIFIED LIST ---------------------------------
   Adding is not enough on its own. The old SharePoint menu carries wrong
   links - it has "Worship Planner" and "Rota Planner" pointing at the same
   file, and labels batchupload.html as "Music Uploader" - and because
   seedRegistry matches on url, it steps straight over every one of them.
   The result looks complete and still sends people to the wrong page.

   So this replaces the lot. Every url below has been checked against the
   live site and every title read off the page itself.

   Reversible: "Bring across the old menu" writes the old arrangement back
   from portal/menuItems, which this never touches. */

async function rebuildRegistry() {
  if (!EGBCAuth.isMaster()) { alert('Only a master admin can do this.'); return; }

  const btn = document.getElementById('btnRebuild');
  const was = btn ? btn.textContent : '';

  let bad = [];
  try {
    if (btn) btn.textContent = 'Checking...';
    bad = await checkUrls(REGISTRY.map(r => r.url),
      (a, b) => { if (btn) btn.textContent = `Checking ${a}/${b}`; });
  } catch (e) { /* offline - let the admin decide below */ }
  if (btn) btn.textContent = was;

  const badSet = new Set(bad);
  const good = REGISTRY.filter(r => !badSet.has(r.url));
  if (!good.length) { alert('None of the pages loaded. Nothing has been changed.'); return; }

  /* Name what disappears, by name, before doing it. */
  const keeping = new Set(good.map(r => r.url.toLowerCase()));
  const dropped = PAGES.filter(p => p.url && !p.heading && !keeping.has((p.url || '').toLowerCase()));

  let msg = `Replace all ${PAGES.length} entries with the ${good.length} checked ones?\n\n`;
  if (bad.length) {
    msg += `${bad.length} did not load and will be left out:\n` +
           bad.map(u => '• ' + u).join('\n') + '\n\n';
  }
  if (dropped.length) {
    msg += `These ${dropped.length} will no longer be listed:\n` +
           dropped.slice(0, 12).map(p => `• ${p.title} (${p.url})`).join('\n') +
           (dropped.length > 12 ? `\n• ...and ${dropped.length - 12} more` : '') + '\n\n';
  }
  msg += 'Nothing is deleted from the site - only the hub listing changes.\n' +
         '"Bring across the old menu" puts the old arrangement back.';

  if (!confirm(msg)) return;

  try {
    const batch = db.batch();
    PAGES.forEach(p => batch.delete(db.collection('hubPages').doc(p.id)));
    good.forEach((r, i) => {
      const row = {
        title: r.title,
        url: r.url,
        description: r.description || '',
        icon: r.icon || '\u{1F4C4}',
        team: r.team,
        everyone: !!r.everyone,
        adminOnly: !!r.adminOnly,
        teams: r.teams || [],
        order: (i + 1) * 10,
        enabled: true
      };
      if (r.helpFor) row.helpFor = r.helpFor;
      batch.set(db.collection('hubPages').doc(), row);
    });
    await batch.commit();

    await loadPages();
    renderTools();
    renderAdminPages();

    const tiles = good.filter(r => !r.helpFor).length;
    alert(`Rebuilt: ${good.length} entries, ${tiles} of them tiles.` +
      (bad.length ? `\n\n${bad.length} left out - see above.` : ''));
  } catch (e) { alert('Could not rebuild: ' + e.message); }
}


/* An entry may name several teams. The song library is the case that forced
   it: Worship need the songs and AV need the lyrics, but Kids Church and
   Lazers should not see either. `everyone` was too wide and one `team` was
   too narrow, so `teams` sits between them.

   `team` stays the single owning team - it decides which group the tile
   appears under and which admin may edit the entry. `teams`, when present,
   only widens who can SEE it. */
function pageTeams(p) {
  if (Array.isArray(p.teams) && p.teams.length) return p.teams;
  return p.team ? [p.team] : [];
}

/* Reasons an entry exists but is not a tile of its own. */
function isTile(p) {
  if (p.enabled === false) return false;
  if (p.mobileOnly || MOBILE_APPS.includes((p.url || '').toLowerCase())) return false;
  if (p.heading) return false;
  if (p.helpFor) return false;        /* shows as ? on the tool it explains */
  if (isCharterPage(p.url)) return false;
  return true;
}

function visibleOne(p) {
  if (!isTile(p)) return false;
  if (p.adminOnly && !EGBCAuth.isAdminOf(p.team)) return false;
  if (p.everyone) return true;
  const mine = myTeams(), admin = EGBCAuth.adminAreas();
  return pageTeams(p).some(t => mine.includes(t) || admin.includes(t));
}

function visibleTools() {
  const mine = myTeams();
  const admin = EGBCAuth.adminAreas();
  return PAGES.filter(p => {
    if (!isTile(p)) return false;
    if (p.adminOnly && !EGBCAuth.isAdminOf(p.team)) return false;
    /* Help and training is not a team's tool - anyone may need to learn how
       the system works. */
    if (p.everyone) return true;
    return pageTeams(p).some(t => mine.includes(t) || admin.includes(t));
  });
}

function renderTools() {
  const el = document.getElementById('toolList');
  if (!el) return;

  /* Also offered here, because the one in the bar can end up underneath the
     overlay depending on the browser. */
  const sw = document.getElementById('panelTeam');
  if (sw) {
    const teams = availableTeams();
    const c = EGBCAuth.TEAMS[TEAM] || { label: TEAM || '-', colour: 'var(--brand)' };
    sw.innerHTML = teams.length > 1
      ? `<button class="switch-row" onclick="openTeamPicker()" style="border-left:4px solid ${c.colour}">
           <span style="flex:1">
             <span class="lbl">Team</span><br>
             <span class="val">${esc(c.label)}</span>
           </span>
           <span style="font-size:10px;font-weight:900;text-transform:uppercase;letter-spacing:.08em;color:var(--brand)">Switch</span>
         </button>`
      : '';
  }

  const bd = document.getElementById('panelBuild');
  if (bd) bd.textContent = `build ${HUB_BUILD}`;

  const q = (document.getElementById('toolSearch').value || '').toLowerCase();

  let tools = [];
  try {
    tools = visibleTools().filter(p =>
      !q || ((p.title || '') + ' ' + (p.description || '')).toLowerCase().includes(q));
  } catch (e) {
    console.error('Tools render failed', e);

    /* Work out which entry is at fault, so this is fixable rather than just
       reported. */
    let culprit = '';
    for (const p of PAGES) {
      try { visibleOne(p); }
      catch (x) { culprit = `${p.title || '(no title)'} - ${JSON.stringify(p).slice(0, 160)}`; break; }
    }

    el.innerHTML = `<div class="empty"><div class="t">Could not build the list</div>
      <div style="font-size:11px;font-weight:600;margin-top:8px">${esc(e.message)}</div>
      <div style="font-size:10px;margin-top:6px;opacity:.7">build ${HUB_BUILD} &middot; ${PAGES.length} registered</div>
      ${culprit ? `<div style="font-size:10px;margin-top:8px;text-align:left;word-break:break-all">${esc(culprit)}</div>` : ''}
    </div>`;
    return;
  }

  console.info(`Tools: ${PAGES.length} registered, ${tools.length} visible, team ${TEAM}`);

  if (!tools.length) {
    el.innerHTML = `<div class="empty"><div class="i">&#128269;</div>
      <div class="t">${q ? 'Nothing matches' : 'Nothing here'}</div>
      ${!q ? `<div style="font-size:12px;font-weight:600;margin-top:10px;line-height:1.6">
        ${PAGES.length
          ? `${PAGES.length} registered, but none for <strong>${esc(TEAM || 'this team')}</strong>.`
          : 'Nothing is registered yet.'}
        ${EGBCAuth.isAdmin() ? '<br>Open <strong>&#9881;</strong> and go to <strong>Tools</strong>.' : ''}</div>` : ''}
    </div>`;
    return;
  }

  const byTeam = {};
  tools.forEach(p => {
    const key = p.everyone ? '__help' : p.team;
    (byTeam[key] = byTeam[key] || []).push(p);
  });

  /* Current team first, help last. */
  const order = Object.keys(byTeam).sort((a, b) => {
    const rank = k => k === '__help' ? 0 : (k === TEAM ? 1 : 2);
    return rank(a) - rank(b);
  });

  /* One group open at a time - the team you are in. Everything expanded at
     once is the wall of text this replaced. Searching opens them all. */
  el.innerHTML = order.map((team, i) => {
    const c = team === '__help'
      ? { label: 'Everyone', colour: '#6b8281' }
      : (EGBCAuth.TEAMS[team] || { label: team, colour: '#6b8281' });
    const open = q ? true : (team === TEAM || (i === 0 && !order.includes(TEAM)));
    return `<button class="grp ${open ? 'open' : ''}" onclick="toggleGroup(this)" style="border-left:4px solid ${c.colour}">
        <span class="arw">&#9654;</span>
        <span>${esc(c.label)}</span>
        <span class="cnt">${byTeam[team].length}</span>
      </button>
      <div class="grp-body ${open ? 'open' : ''}">
        ${nestTools(byTeam[team])}
      </div>`;
  }).join('');
}

/* The imported menu nests - Worship > Music Databases > Music Database. Keep
   that shape: a sub-heading with its pages indented beneath. */
function nestTools(list) {
  const headings = PAGES.filter(p => p.heading);
  const childrenOf = id => list.filter(p => p.legacyParent === id);
  const top = list.filter(p => !p.legacyParent || !headings.some(h => h.legacyId === p.legacyParent));

  /* An instruction page belongs on the tool it explains, not beside it. The
     four we have were never linked from anywhere, so nobody could find them
     even though they exist. */
  const mine = myTeams(), admin = EGBCAuth.adminAreas();
  const mayOpen = p => {
    if (p.adminOnly && !EGBCAuth.isAdminOf(p.team)) return false;
    if (p.everyone) return true;
    return pageTeams(p).some(t => mine.includes(t) || admin.includes(t));
  };

  const help = {};
  PAGES.forEach(p => {
    /* Only offer the ? to someone who can actually open it. Today every
       instruction page and its tool are both Core Team, so this never
       bites - but a help page narrower than its tool would otherwise put a
       dead link on the tile. */
    if (p.helpFor && p.enabled !== false && p.url && mayOpen(p)) {
      help[String(p.helpFor).toLowerCase()] = p;
    }
  });

  const row = p => {
    const tile = `<a class="tool" href="${esc(p.url)}" title="${esc(p.description || '')}">
      <span class="ic">${p.icon || '&#128196;'}</span>
      <span class="nm">${esc(p.title)}</span>
    </a>`;
    const h = help[(p.url || '').toLowerCase()];
    if (!h) return tile;
    return `<div class="toolrow">${tile}<a class="toolhelp" href="${esc(h.url)}"
      title="${esc(h.title)}" aria-label="${esc(h.title)}">?</a></div>`;
  };

  const sub = h => {
    const kids = childrenOf(h.legacyId);
    if (!kids.length) return '';
    return `<div class="subgrp">
        <div class="sublab">${esc(h.title)}</div>
        ${kids.map(row).join('')}
      </div>`;
  };

  const usedHeadings = headings.filter(h => childrenOf(h.legacyId).length);

  return top.map(row).join('') + usedHeadings.map(sub).join('');
}

function toggleGroup(btn) {
  const body = btn.nextElementSibling;
  const open = btn.classList.toggle('open');
  body.classList.toggle('open', open);
}

function openTools() {
  renderTools();
  document.getElementById('scrim').classList.add('on');
  document.getElementById('panel').classList.add('on');
  document.body.style.overflow = 'hidden';
  setTimeout(() => document.getElementById('toolSearch').focus(), 220);
}
function closeTools() {
  document.getElementById('scrim').classList.remove('on');
  document.getElementById('panel').classList.remove('on');
  document.body.style.overflow = '';
}
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeTools(); });

/* ---- ADMIN --------------------------------------------------------- */

function openAdmin() { document.getElementById('adminModal').classList.add('on'); document.body.style.overflow = 'hidden'; adminTab('people'); }
function closeAdmin() { document.getElementById('adminModal').classList.remove('on'); document.body.style.overflow = ''; }

function adminTab(t) {
  ['people', 'pages', 'news', 'youth'].forEach(x => {
    document.getElementById('tab-' + x).style.display = x === t ? '' : 'none';
    document.getElementById('ta-' + x).classList.toggle('on', x === t);
  });
  if (t === 'people') renderAdminPeople();
  if (t === 'pages') renderAdminPages();
  if (t === 'news') renderAdminNews();
  if (t === 'youth') renderAdminYouth();
}

/* The old feed was an array inside portal/dashboardContent. This copies it
   into one document per notice so items can be aimed at teams and two people
   posting at once cannot overwrite each other. Runs once, by hand. */
async function migrateOldNews() {
  if (!EGBCAuth.isMaster()) { alert('Only a master admin can do this.'); return; }
  try {
    const d = (await db.collection('portal').doc('dashboardContent').get()).data() || {};
    const items = d.newsItems || [];
    if (!items.length) { alert('Nothing to bring across.'); return; }
    if (!confirm(`Bring ${items.length} old notice(s) across?\n\nThe originals are left alone, so the phone app keeps working until it is updated.`)) return;

    const batch = db.batch();
    items.forEach((it, i) => {
      batch.set(db.collection('news').doc(), {
        title: it.title || 'Untitled',
        body: it.body || '',
        teams: [],
        pinned: false,
        requireAck: false,
        ackedBy: [],
        postedBy: 'imported',
        legacyDate: it.date || '',
        createdAt: firebase.firestore.Timestamp.fromMillis(Date.now() - (items.length - i) * 86400000)
      });
    });
    await batch.commit();
    await loadNews();
    alert(`${items.length} brought across. They are visible to everyone - edit any that should be team-only.`);
    renderAdminNews();
  } catch (e) { alert('Could not import: ' + e.message); }
}

function renderAdminNews() {
  const el = document.getElementById('tab-news');
  const mine = NEWS.filter(n => EGBCAuth.isMaster() ||
    !(n.teams || []).length || (n.teams || []).some(t => EGBCAuth.isAdminOf(t)));

  el.innerHTML = `<p style="font-size:12px;color:var(--muted);margin:0 0 14px;line-height:1.6">
      Notices you can manage. Pinned ones sit at the top of the page for everyone they are aimed at.
    </p>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px">
      <button class="btn solid" onclick="closeAdmin();openNewsEditor()">+ New notice</button>
      ${EGBCAuth.isMaster() ? '<button class="btn" onclick="migrateOldNews()">Bring across old news</button>' : ''}
    </div>` +
    (mine.length ? mine.map(n => {
      const acks = (n.ackedBy || []).length;
      return `<div style="display:flex;gap:11px;align-items:center;flex-wrap:wrap;background:var(--surface-2);
                border:1px solid var(--line);border-radius:12px;padding:12px 15px;margin-bottom:7px">
        <div style="flex:1;min-width:170px">
          <div style="font-size:13px;font-weight:800;color:var(--ink)">${n.pinned ? '&#9733; ' : ''}${esc(n.title)}</div>
          <div style="font-size:10px;color:var(--faint);font-weight:700;margin-top:2px">
            ${(n.teams || []).length ? esc(n.teams.join(', ')) : 'Everyone'} &middot; ${when(n.createdAt)}
            ${n.requireAck ? ` &middot; ${acks} confirmed` : ''}
          </div>
        </div>
        <button class="btn" style="padding:6px 13px" onclick="closeAdmin();openNewsEditor('${n.id}')">Edit</button>
        <button class="btn" style="padding:6px 13px;color:#b0392c;border-color:#f0d4d0" onclick="deleteNews('${n.id}')">Remove</button>
      </div>`;
    }).join('') : '<div class="empty"><div class="t">Nothing posted yet</div></div>');
}

/* Only the areas this person manages. A master admin gets everything;
   Karen gets Kids Church; Core Team get Worship and AV. Choir is included
   because it must stay tickable even though it has no tab. */
function adminTeams(){
  return EGBCAuth.adminAreas();
}

/* ---- helpers ------------------------------------------------------- */

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function initials(s) {
  return (s || '?').split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();
}

function when(ts) {
  if (!ts || !ts.toDate) return '';
  const d = ts.toDate(), days = Math.floor((Date.now() - d) / 86400000);
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return days + ' days ago';
  if (days < 14) return 'last week';
  if (days < 60) return Math.floor(days / 7) + ' weeks ago';
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}



let BOOK=[];

let YOUTH=[];

const GRANT_WEEKS=6;

const SEND_FUNCTION_URL='https://sendemail-irkwdhx3xq-uc.a.run.app';

async function loadPeople(){
  const list=document.getElementById('peopleList');
  list.innerHTML='<div class="text-sm opacity-50 italic py-4">Loading…</div>';
  try{
    const [users,book]=await Promise.all([
      db.collection('users').orderBy('email').get(),
      db.collection('addressBook').get()
    ]);
    PEOPLE=users.docs.map(d=>({id:d.id,...d.data()}));
    BOOK=book.docs.map(d=>({id:d.id,...d.data()}))
      .filter(m=>!m.archived)
      .sort((a,b)=>(a.name||'').localeCompare(b.name||''));
    renderPeople();
  }catch(e){list.innerHTML=`<div class="text-sm text-red-600 py-4">Could not load people: ${esc(e.message)}</div>`;}
}


function renderPeople(){
  const q=(document.getElementById('peopleSearch').value||'').toLowerCase();
  const teams=adminTeams();
  const list=document.getElementById('peopleList');

  const unmatched=PEOPLE.filter(p=>!p.memberId);
  const noTeams=PEOPLE.filter(p=>p.memberId&&p.status!=='active');
  const banner=document.getElementById('pendingBanner');
  const bits=[];
  if(unmatched.length)bits.push(`${unmatched.length} sign-${unmatched.length===1?'in is':'ins are'} not linked to an address book record`);
  if(noTeams.length)bits.push(`${noTeams.length} ${noTeams.length===1?'person has':'people have'} no teams ticked`);
  if(bits.length){
    banner.classList.remove('hidden');
    banner.querySelector('span').textContent=bits.join(' · ')+'.';
  }else banner.classList.add('hidden');

  const shown=PEOPLE
    .filter(p=>!q||(p.name||'').toLowerCase().includes(q)||(p.email||'').toLowerCase().includes(q))
    .sort((a,b)=>{
      const rank=x=>!x.memberId?0:(x.status!=='active'?1:2);
      return rank(a)-rank(b)||(a.name||a.email||'').localeCompare(b.name||b.email||'');
    });
  if(!shown.length){list.innerHTML='<div class="text-sm opacity-50 italic py-4">Nobody matches that.</div>';return;}

  list.innerHTML=shown.map(p=>{
    const chips=teams.map(t=>{
      const cfg=EGBCAuth.TEAMS[t];
      const on=(p.teams||[]).includes(t);
      const role=(p.roles||{})[t]||'member';
      return `<div class="flex items-center gap-2">
        <label class="flex items-center gap-2 cursor-pointer px-3 py-1.5 rounded-full border transition-all"
          style="${on?`background:${cfg.colour};border-color:${cfg.colour};color:#fff`:'background:#fff;border-color:#dde7e6'}">
          <input type="checkbox" ${on?'checked':''} onchange="toggleTeam('${p.id}','${t}',this.checked)" class="w-3.5 h-3.5 accent-white">
          <span class="text-[10px] font-black uppercase tracking-widest">${cfg.label}</span>
        </label>
        ${on?`<select onchange="setRole('${p.id}','${t}',this.value)" class="px-3 py-1.5 rounded-full border border-[#dde7e6] bg-white text-[10px] font-black uppercase">
          <option value="member"${role==='member'?' selected':''}>Member</option>
          <option value="leader"${role==='leader'?' selected':''}>Leader</option>
          <option value="admin"${role==='admin'?' selected':''}>Admin</option>
        </select>`:''}
      </div>`;
    }).join('');

    const initials=(p.name||p.email||'?').split(/\s+/).map(w=>w[0]).join('').slice(0,2).toUpperCase();
    const linked=!!p.memberId;

    const cands=Array.isArray(p.candidates)?p.candidates:[];
    const picker=`<div class="mt-4 bg-white rounded-2xl border border-[#e8d9b8] p-4">
      <div class="text-[11px] font-black uppercase tracking-widest text-[#8a5f1e] mb-1">Who is this?</div>
      <div class="text-[11px] opacity-55 mb-3 leading-relaxed">${cands.length
        ? 'This address is on '+cands.length+' records: <strong>'+cands.map(c=>esc(c.name)).join('</strong>, <strong>')+'</strong>. Only you can decide which of them signed in - check before choosing, since it grants that person\'s access.'
        : 'They signed in with an address the address book does not hold. Pick their record and it will be remembered.'}</div>
      <div class="flex gap-2 flex-wrap">
        <select id="link-${p.id}" class="flex-grow min-w-[200px] px-4 py-2.5 rounded-full border border-[#dde7e6] bg-[#f0f6f6] font-semibold text-[12px]">
          <option value="">Choose a person…</option>
          ${BOOK.map(m=>`<option value="${m.id}">${esc(m.name||'(no name)')}${Array.isArray(m.markers)&&m.markers.includes('Core Team')?' [ADMIN]':''}${m.email?' — '+esc(m.email):''}</option>`).join('')}
        </select>
        <button onclick="linkPerson('${p.id}',document.getElementById('link-${p.id}').value)" class="bg-[#3d6263] text-white px-6 py-2.5 rounded-full font-black text-[10px] uppercase tracking-widest hover:bg-black transition-all">Link</button>
      </div>
    </div>`;

    return `<div class="bg-[#f0f6f6] rounded-[1.25rem] border ${linked?'border-[#dde7e6]':'border-[#e8d9b8]'} p-5">
      <div class="flex items-start gap-4 flex-wrap">
        <div class="w-10 h-10 rounded-full ${linked?'bg-[#3d6263]':'bg-[#b07d2e]'} text-white flex items-center justify-center text-[11px] font-black flex-shrink-0">${initials}</div>
        <div class="flex-grow min-w-[180px]">
          <div class="font-black text-sm">${esc(p.name||'(not linked yet)')}</div>
          <div class="text-[11px] opacity-50">${esc(p.email)}</div>
        </div>
        ${p.status==='ambiguous'?'<span class="bg-[#f6efe1] text-[#8a5f1e] border border-[#e8d9b8] px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest">Shared address</span>':''}
        ${!linked?'<span class="bg-[#f6efe1] text-[#8a5f1e] border border-[#e8d9b8] px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest">Needs linking</span>':
          (p.status!=='active'?'<span class="bg-[#f6efe1] text-[#8a5f1e] border border-[#e8d9b8] px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest">No teams</span>':
          `<button onclick="unlinkPerson('${p.id}')" class="text-[9px] font-black uppercase tracking-widest opacity-30 hover:opacity-100 hover:text-red-600 transition-all">Unlink</button>`)}
      </div>
      ${linked?`<div class="flex gap-2 flex-wrap mt-4">${chips}</div>
        <div class="flex items-center justify-between gap-3 flex-wrap mt-3">
          <div class="text-[10px] opacity-40">Teams are ticked in the address book. Changing them here updates it there too.</div>
          <button onclick="repoint('${p.id}')" class="text-[9px] font-black uppercase tracking-widest opacity-30 hover:opacity-100 transition-opacity">Wrong person?</button>
        </div>`:picker}
    </div>`;
  }).join('');
}


async function toggleTeam(uid,team,on){
  const p=PEOPLE.find(x=>x.id===uid);if(!p)return;
  const teams=new Set(p.teams||[]);
  const roles=Object.assign({},p.roles||{});
  if(on){teams.add(team);if(!roles[team])roles[team]='member';}
  else{teams.delete(team);delete roles[team];}
  await savePerson(p,Array.from(teams),roles);
}


async function setRole(uid,team,role){
  const p=PEOPLE.find(x=>x.id===uid);if(!p)return;
  const roles=Object.assign({},p.roles||{});roles[team]=role;
  await savePerson(p,p.teams||[],roles);
}


async function savePerson(p,teams,roles){
  if(!EGBCAuth.isMaster()){
    const mine=EGBCAuth.adminAreas();
    const touched=[...new Set([...(p.teams||[]),...teams])];
    const outside=touched.filter(t=>!mine.includes(t));
    if(outside.length){alert('You can only change teams you administer. Not yours: '+outside.join(', '));return;}
  }
  const patch={teams,roles,status:teams.length?'active':'pending'};
  try{
    await db.collection('users').doc(p.id).update(patch);
    if(p.memberId){
      // Write back to `markers` - the field Planner, CoreTeamApp, EmailBuilder2
      // and the Sunday Service Planner all read for team membership.
      await db.collection('addressBook').doc(p.memberId).update({markers:teams,roles}).catch(()=>{});
    }
    Object.assign(p,patch);
    renderPeople();
  }catch(e){alert('Could not save: '+e.message);}
}


async function linkPerson(uid,memberId){
  if(!memberId)return;
  const u=PEOPLE.find(x=>x.id===uid);
  const m=BOOK.find(x=>x.id===memberId);
  if(!u||!m)return;

  const isAdminRecord=Array.isArray(m.markers)&&m.markers.includes('Core Team');
  const warn=isAdminRecord
    ? `\n\nWARNING: ${m.name||'this person'} is Core Team, so linking gives this sign-in FULL ADMINISTRATOR access to the address book and every tool. Only do this if you are certain ${u.email} belongs to them.`
    : '\n\nThey will get whatever teams are ticked against that record.';
  if(!confirm(`Link the sign-in ${u.email} to ${m.name||'this record'}?`+warn))return;

  try{
    const extra=Array.isArray(m.signInEmails)?m.signInEmails.slice():[];
    if(!extra.includes(u.email))extra.push(u.email);
    await db.collection('addressBook').doc(memberId).update({signInEmails:extra});

    const teams=Array.isArray(m.markers)?m.markers:[];
    await db.collection('users').doc(uid).update({
      memberId,
      name:(m.name||u.name||'').trim(),
      teams,
      status:teams.length?'active':'pending',
      // A person decided this, so it is not re-checked on later sign-ins.
      linkedBy:'admin'
    });
    await loadPeople();
  }catch(e){alert('Could not link: '+e.message);}
}


async function unlinkPerson(uid){
  const u=PEOPLE.find(x=>x.id===uid);
  if(!u||!u.memberId)return;
  if(!confirm(`Unlink ${u.email} from their address book record?`))return;
  try{
    const m=BOOK.find(x=>x.id===u.memberId);
    if(m&&Array.isArray(m.signInEmails)&&m.signInEmails.includes(u.email)){
      await db.collection('addressBook').doc(u.memberId)
        .update({signInEmails:m.signInEmails.filter(e=>e!==u.email)});
    }
    await db.collection('users').doc(uid).update({memberId:null,teams:[],status:'pending',linkedBy:firebase.firestore.FieldValue.delete()});
    await loadPeople();
  }catch(e){alert('Could not unlink: '+e.message);}
}


async function repoint(uid){
  const u=PEOPLE.find(x=>x.id===uid);
  if(!u)return;
  if(!confirm(`Detach ${u.email} from ${u.name||'this record'}?\n\nYou can then link it to the right person.`))return;
  try{
    if(u.memberId){
      const m=BOOK.find(x=>x.id===u.memberId);
      if(m&&Array.isArray(m.signInEmails)&&m.signInEmails.includes(u.email)){
        await db.collection('addressBook').doc(u.memberId)
          .update({signInEmails:m.signInEmails.filter(e=>e!==u.email)});
      }
    }
    await db.collection('users').doc(uid).update({memberId:null,teams:[],status:'pending',linkedBy:firebase.firestore.FieldValue.delete()});
    await loadPeople();
  }catch(e){alert('Could not detach: '+e.message);}
}


function fillTeamSelect(){
  const sel=document.getElementById('pgTeam');
  sel.innerHTML=adminTeams()
    .filter(t=>!EGBCAuth.TEAMS[t].parent)
    .map(t=>`<option value="${t}">${EGBCAuth.TEAMS[t].label}</option>`).join('');
}


function renderPagesList(){
  const teams=adminTeams();
  const list=document.getElementById('pagesList');
  const cnt=document.getElementById('pagesCount');
  if(cnt){
    const pages=PAGES.filter(p=>!p.heading).length, heads=PAGES.length-pages;
    cnt.textContent=PAGES.length
      ? `${pages} page${pages===1?'':'s'}${heads?` and ${heads} heading${heads===1?'':'s'}`:''} registered.`
      : 'Nothing registered - the Tools panel will be empty.';
  }
  const mine=PAGES.filter(p=>teams.includes(p.team));
  if(!mine.length){list.innerHTML='<div class="empty"><div class="t">Nothing registered yet</div><div style="font-size:12px;font-weight:600;margin-top:6px">Use <strong>Bring across the old menu</strong> to start from the menu people already know.</div></div>';return;}
  list.innerHTML=mine.map(p=>{
    const cfg=EGBCAuth.TEAMS[p.team]||{label:p.team,colour:'#3d6263'};
    /* Say who sees it and why it might not be a tile, so an entry that looks
       missing from the Tools panel explains itself here. */
    const seen = p.everyone ? 'everyone'
      : (Array.isArray(p.teams) && p.teams.length>1
          ? p.teams.map(t=>(EGBCAuth.TEAMS[t]||{label:t}).label).join(' + ')
          : cfg.label);
    const why = p.helpFor ? ` · help for ${p.helpFor}`
      : (isCharterPage(p.url) ? ' · on the landing page'
      : (MOBILE_APPS.includes((p.url||'').toLowerCase()) ? ' · phone app' : ''));
    return `<div class="flex items-center gap-3 flex-wrap bg-[#f0f6f6] rounded-[1rem] px-5 py-3 border border-[#dde7e6] ${p.enabled===false?'opacity-50':''}">
      <span class="text-lg">${esc(p.icon||'📄')}</span>
      <div class="flex-grow min-w-0">
        <div class="font-bold text-sm truncate">${esc(p.title)}</div>
        <div class="text-[10px] opacity-50">${esc(p.url)} · ${esc(seen)}${p.adminOnly?' · admin only':''}${esc(why)}${p.enabled===false?' · hidden':''}</div>
      </div>
      <button onclick="editPage('${p.id}')" class="bg-white border border-[#dde7e6] px-4 py-2 rounded-full font-black text-[10px] uppercase tracking-widest hover:bg-[#3d6263] hover:text-white transition-all">Edit</button>
    </div>`;
  }).join('');
}


function newPage(){
  document.getElementById('pgId').value='';
  ['pgTitle','pgUrl','pgDesc','pgIcon'].forEach(i=>document.getElementById(i).value='');
  document.getElementById('pgOrder').value=(PAGES.length+1)*10;
  document.getElementById('pgEnabled').checked=true;
  document.getElementById('pgAdminOnly').checked=false;
  document.getElementById('pgSeenBy').value='team';
  document.getElementById('pgDelete').classList.add('hidden');
  document.getElementById('pageEditor').classList.remove('hidden');
}


function editPage(id){
  const p=PAGES.find(x=>x.id===id);if(!p)return;
  document.getElementById('pgId').value=id;
  document.getElementById('pgTitle').value=p.title||'';
  document.getElementById('pgUrl').value=p.url||'';
  document.getElementById('pgDesc').value=p.description||'';
  document.getElementById('pgIcon').value=p.icon||'';
  document.getElementById('pgOrder').value=p.order||0;
  document.getElementById('pgTeam').value=p.team||'';
  document.getElementById('pgAdminOnly').checked=!!p.adminOnly;
  document.getElementById('pgEnabled').checked=p.enabled!==false;
  document.getElementById('pgSeenBy').value =
    p.everyone ? 'all' : ((Array.isArray(p.teams) && p.teams.length>1) ? 'pair' : 'team');
  document.getElementById('pgDelete').classList.remove('hidden');
  document.getElementById('pageEditor').classList.remove('hidden');
}


function cancelPage(){document.getElementById('pageEditor').classList.add('hidden');}

/* This was defined twice, identically. The second won, so an edit to the
   first did nothing at all - which is the sort of thing that eats an
   afternoon. One copy now. */
async function savePage(){
  const id=document.getElementById('pgId').value;
  const seen=document.getElementById('pgSeenBy').value;   /* team | pair | all */
  const data={
    title:document.getElementById('pgTitle').value.trim(),
    url:document.getElementById('pgUrl').value.trim(),
    description:document.getElementById('pgDesc').value.trim(),
    icon:document.getElementById('pgIcon').value.trim()||'📄',
    team:document.getElementById('pgTeam').value,
    adminOnly:document.getElementById('pgAdminOnly').checked,
    order:parseInt(document.getElementById('pgOrder').value,10)||0,
    enabled:document.getElementById('pgEnabled').checked,
    everyone:seen==='all'
  };

  /* Written every time, including the empty case, so narrowing an entry back
     to one team actually takes. update() merges, so a field left out here
     keeps whatever it had - which is why this cannot be conditional. */
  data.teams = seen==='pair' ? WORSHIP_AV : [];

  if(!data.title||!data.url||!data.team){alert('Title, filename and team are required.');return;}
  try{
    if(id)await db.collection('hubPages').doc(id).update(data);
    else await db.collection('hubPages').add(data);
    cancelPage();await loadPages();renderPagesList();renderTools();
  }catch(e){alert('Save failed: '+e.message);}
}


async function deletePage(){
  const id=document.getElementById('pgId').value;
  if(!id||!confirm('Remove this tile from the hub?'))return;
  try{
    await db.collection('hubPages').doc(id).delete();
    cancelPage();await loadPages();renderPagesList();renderTools();
  }catch(e){alert('Delete failed: '+e.message);}
}




function youngPeople(){
  return BOOK.filter(m=>m.isMinor===true&&m.householdId);
}


function canIssueCodes(){
  return EGBCAuth.isMaster()||['Kids Church','Youth Worship','Lazers','ReNu']
    .some(t=>EGBCAuth.isAdminOf(t));
}


function parentFor(member){
  const head=BOOK.find(m=>m.id===member.householdId);
  return head&&head.email?{email:head.email,name:head.name||''}:null;
}


async function loadYouth(){
  const list=document.getElementById('youthList');
  list.innerHTML='<div class="text-sm opacity-50 italic py-4">Loading…</div>';
  if(!BOOK.length)await loadPeople();

  try{
    const [grants,access]=await Promise.all([
      db.collection('youthGrants').orderBy('issuedAt','desc').get(),
      db.collection('youthAccess').get()
    ]);
    const acc={};
    access.docs.forEach(d=>{acc[d.data().grantCode]={uid:d.id,...d.data()};});
    YOUTH=grants.docs.map(d=>({code:d.id,...d.data(),access:acc[d.id]||null}));
    fillYouthPicker();
    renderYouth();
  }catch(e){
    list.innerHTML=`<div class="text-sm text-red-600 py-4">Could not load: ${esc(e.message)}</div>`;
  }
}


function fillYouthPicker(){
  const sel=document.getElementById('youthWho');
  const people=youngPeople().sort((a,b)=>(a.name||'').localeCompare(b.name||''));
  if(!people.length){
    sel.innerHTML='<option value="">Nobody is flagged Under 16 yet</option>';
    document.getElementById('youthTo').innerHTML='Tick <strong>Under 16</strong> against young people in the address book and they will appear here.';
    return;
  }
  sel.innerHTML='<option value="">Choose a young person…</option>'+people.map(m=>{
    const p=parentFor(m);
    return `<option value="${m.id}"${p?'':' disabled'}>${esc(m.name||'(no name)')}${p?'':' — no parent email'}</option>`;
  }).join('');
  sel.onchange=()=>{
    const m=BOOK.find(x=>x.id===sel.value);
    const p=m?parentFor(m):null;
    document.getElementById('youthTo').innerHTML=p
      ?`The code will be emailed to <strong>${esc(p.name||'their household')}</strong> at ${esc(p.email)}.`
      :'';
  };
}


function daysLeft(g){
  if(!g.access||!g.access.expiresAt)return null;
  return Math.ceil((g.access.expiresAt.toDate()-new Date())/86400000);
}


function renderYouth(){
  const list=document.getElementById('youthList');
  if(!YOUTH.length){list.innerHTML='<div class="text-sm opacity-50 italic py-4">No codes sent yet.</div>';return;}

  const soon=YOUTH.filter(g=>{const d=daysLeft(g);return g.active!==false&&d!==null&&d>0&&d<=14;});
  const box=document.getElementById('youthExpiring');
  if(soon.length){
    box.classList.remove('hidden');
    box.querySelector('div').textContent=`${soon.length} ${soon.length===1?'code expires':'codes expire'} within two weeks.`;
  }else box.classList.add('hidden');

  list.innerHTML=YOUTH.map(g=>{
    const d=daysLeft(g);
    let badge,tone;
    if(g.active===false){badge='Revoked';tone='bg-red-50 text-red-700 border-red-200';}
    else if(!g.redeemedAt){badge='Not used yet';tone='bg-[#f6efe1] text-[#8a5f1e] border-[#e8d9b8]';}
    else if(d!==null&&d<=0){badge='Expired';tone='bg-gray-100 text-gray-500 border-gray-200';}
    else if(d!==null&&d<=14){badge=d+' days left';tone='bg-[#f6efe1] text-[#8a5f1e] border-[#e8d9b8]';}
    else {badge=d+' days left';tone='bg-green-50 text-green-700 border-green-200';}

    return `<div class="flex items-center gap-3 flex-wrap bg-[#f0f6f6] rounded-[1rem] px-5 py-3 border border-[#dde7e6] ${g.active===false?'opacity-50':''}">
      <div class="flex-grow min-w-0">
        <div class="font-bold text-sm truncate">${esc(g.memberName||'(unknown)')}</div>
        <div class="text-[10px] opacity-50">${g.redeemedAt?'Used':'Sent'} · to ${esc(g.sentTo||'')}</div>
      </div>
      <span class="px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border ${tone}">${badge}</span>
      ${g.active!==false?`<button onclick="revokeGrant('${g.code}')" class="text-[9px] font-black uppercase tracking-widest text-red-400 hover:text-red-600 transition-colors">Revoke</button>`:''}
      ${!g.redeemedAt&&g.active!==false?`<button onclick="resendCode('${g.code}')" class="text-[9px] font-black uppercase tracking-widest opacity-40 hover:opacity-100 transition-opacity">Resend</button>`:''}
    </div>`;
  }).join('');
}


function makeCode(){
  const A='ACDEFGHJKLMNPQRTUVWXY2346789';
  let out='';
  for(let i=0;i<8;i++)out+=A[Math.floor(Math.random()*A.length)];
  return out.slice(0,4)+'-'+out.slice(4);
}


function codeEmail(name,code,parentName){
  return `<div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px">
    <p style="font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:3px;color:#3d6263;margin:0 0 18px">Esher Green Baptist Church</p>
    <p style="font-size:15px;color:#3a4d4c;line-height:1.6">Hi${parentName?' '+esc(parentName):''},</p>
    <p style="font-size:15px;color:#3a4d4c;line-height:1.6">Here is an access code so ${esc(name)} can use the Youth Hub on their phone. It works once, on one device, and lasts six weeks - we will send a new one after that.</p>
    <div style="background:#f0f6f6;border:1px solid #dde7e6;border-radius:16px;padding:24px;text-align:center;margin:24px 0">
      <div style="font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:2px;color:#6b8281;margin-bottom:10px">Access code</div>
      <div style="font-size:26px;font-weight:900;letter-spacing:5px;color:#14201f">${code}</div>
    </div>
    <p style="text-align:center;margin:24px 0">
      <a href="https://esherchurch.github.io/availability-form/youth-access.html" style="background:#5f7a4a;color:#fff;padding:14px 32px;border-radius:999px;font-size:11px;font-weight:900;text-transform:uppercase;letter-spacing:2px;text-decoration:none">Enter the code</a>
    </p>
    <p style="font-size:13px;color:#6b8281;line-height:1.6">Please pass this to ${esc(name)} rather than forwarding the email. If you would rather they did not have access, simply do not use it - and let us know.</p>
    <p style="font-size:12px;color:#93a8a6;line-height:1.6;margin-top:24px;border-top:1px solid #dde7e6;padding-top:16px">Sent by the youth team at Esher Green Baptist Church.</p>
  </div>`;
}


async function issueCode(member,parent,silent){
  const code=makeCode();
  await db.collection('youthGrants').doc(code).set({
    memberId:member.id,
    memberName:member.name||'',
    sentTo:parent.email,
    issuedBy:ME.name||ME.email,
    issuedAt:firebase.firestore.FieldValue.serverTimestamp(),
    redeemedAt:null,
    uid:null,
    active:true
  });

  const resp=await fetch(SEND_FUNCTION_URL,{
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({
      to:[parent.email],
      subject:`Youth Hub access code for ${member.name||'your child'}`,
      html:codeEmail(member.name||'your child',code,parent.name),
      replyTo:'youth@esherchurch.org'
    })
  });
  const r=await resp.json();
  if(!r.ok)throw new Error(r.error||'The email did not send');
  return code;
}


async function sendCode(){
  const sel=document.getElementById('youthWho');
  const member=BOOK.find(x=>x.id===sel.value);
  if(!member){alert('Choose a young person first.');return;}
  const parent=parentFor(member);
  if(!parent){alert('No parent email on their household record.');return;}

  if(!confirm(`Email an access code for ${member.name} to ${parent.email}?`))return;

  const btn=document.getElementById('sendCodeBtn');btn.disabled=true;btn.textContent='Sending…';
  try{
    await issueCode(member,parent);
    sel.value='';document.getElementById('youthTo').innerHTML='';
    await loadYouth();
  }catch(e){alert('Could not send: '+e.message);}
  btn.disabled=false;btn.textContent='Send code';
}


async function resendCode(code){
  const g=YOUTH.find(x=>x.code===code);
  if(!g)return;
  if(!confirm(`Resend the same code to ${g.sentTo}?`))return;
  try{
    const resp=await fetch(SEND_FUNCTION_URL,{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({to:[g.sentTo],subject:`Youth Hub access code for ${g.memberName||'your child'}`,html:codeEmail(g.memberName||'your child',code,''),replyTo:'youth@esherchurch.org'})
    });
    const r=await resp.json();
    if(!r.ok)throw new Error(r.error||'The email did not send');
    alert('Sent again.');
  }catch(e){alert('Could not resend: '+e.message);}
}


async function revokeGrant(code){
  const g=YOUTH.find(x=>x.code===code);
  if(!g)return;
  if(!confirm(`Revoke access for ${g.memberName||'this person'}?\n\nTheir device stops working straight away.`))return;
  try{
    await db.collection('youthGrants').doc(code).update({active:false});
    if(g.access)await db.collection('youthAccess').doc(g.access.uid).update({active:false});
    await loadYouth();
  }catch(e){alert('Could not revoke: '+e.message);}
}


async function renewExpiring(){
  const soon=YOUTH.filter(g=>{const d=daysLeft(g);return g.active!==false&&d!==null&&d>0&&d<=14;});
  if(!soon.length)return;
  if(!confirm(`Send ${soon.length} renewal code(s)? The old ones keep working until they expire.`))return;

  let ok=0,failed=[];
  for(const g of soon){
    const member=BOOK.find(x=>x.id===g.memberId);
    const parent=member?parentFor(member):null;
    if(!member||!parent){failed.push(g.memberName||g.code);continue;}
    try{await issueCode(member,parent);ok++;}
    catch(e){failed.push(g.memberName||g.code);}
  }
  await loadYouth();
  alert(failed.length?`${ok} sent. Could not send for: ${failed.join(', ')}.`:`${ok} renewal code(s) sent.`);
}


/* ---- CARRIED ADMIN PANELS ------------------------------------------
   People, Tools and Youth codes are unchanged from the previous build -
   they work, and rewriting them would only risk breaking the linking and
   the code issuing. They render into containers created on demand. */

function renderAdminPeople(){
  const el=document.getElementById('tab-people');
  if(!el.dataset.built){
    el.dataset.built='1';
    el.innerHTML=`
      <div style="display:flex;align-items:center;justify-content:space-between;gap:14px;flex-wrap:wrap;margin-bottom:14px">
        <p style="font-size:12px;color:var(--muted);margin:0;line-height:1.6;max-width:520px">
          People appear here once they sign in. Anyone using an address the address book does not hold needs linking - they are listed first.
        </p>
        <input id="peopleSearch" class="fld" style="width:190px;margin:0" placeholder="Search&hellip;" oninput="renderPeople()">
      </div>
      <div id="pendingBanner" style="display:none;background:var(--gold-tint);border:1px solid var(--gold-line);border-radius:14px;padding:13px 17px;margin-bottom:14px">
        <span style="font-size:12px;font-weight:800;color:var(--gold-ink)"></span>
      </div>
      <div id="peopleList"></div>`;
  }
  loadPeople();
}

function renderAdminPages(){
  const el=document.getElementById('tab-pages');
  if(!el.dataset.built){
    el.dataset.built='1';
    el.innerHTML=`
      <div style="display:flex;align-items:center;justify-content:space-between;gap:14px;flex-wrap:wrap;margin-bottom:14px">
        <p style="font-size:12px;color:var(--muted);margin:0;line-height:1.6;max-width:480px">
          What appears in the Tools panel, and who sees it.
          <span id="pagesCount" style="display:block;margin-top:4px;font-weight:700"></span>
        </p>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn solid" id="btnRebuild" onclick="rebuildRegistry()">Rebuild from the verified list</button>
          <button class="btn" id="btnSeed" onclick="seedRegistry()">Add the missing pages</button>
          <button class="btn" id="btnCheckLinks" onclick="checkRegistryLinks()">Check every link</button>
          <button class="btn" onclick="importOldMenu()">Bring across the old menu</button>
          <button class="btn" onclick="importAllCharters()">Bring across all charters</button>
          <button class="btn" onclick="markSharedPages()">Open shared pages to everyone</button>
          <button class="btn" onclick="newPage()">+ Add</button>
        </div>
      </div>
      <div id="pageEditor" style="display:none;background:var(--surface-2);border:2px solid var(--brand);border-radius:18px;padding:20px;margin-bottom:18px">
        <input type="hidden" id="pgId">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:9px">
          <input class="fld" id="pgTitle" placeholder="Name">
          <input class="fld" id="pgUrl" placeholder="filename.html">
        </div>
        <input class="fld" id="pgDesc" placeholder="One line describing it">
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:9px">
          <input class="fld" id="pgIcon" placeholder="Icon">
          <select class="fld" id="pgTeam"></select>
          <input class="fld" id="pgOrder" type="number" placeholder="Order">
        </div>
        <select class="fld" id="pgSeenBy">
          <option value="team">Seen by that team only</option>
          <option value="pair">Seen by Worship and AV</option>
          <option value="all">Seen by everyone signed in</option>
        </select>
        <label style="display:flex;gap:9px;align-items:center;cursor:pointer;margin:4px 0 12px">
          <input type="checkbox" id="pgAdminOnly" style="width:16px;height:16px;accent-color:var(--brand)">
          <span style="font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.08em;color:var(--muted)">Admins only</span>
        </label>
        <label style="display:flex;gap:9px;align-items:center;cursor:pointer;margin-bottom:14px">
          <input type="checkbox" id="pgEnabled" checked style="width:16px;height:16px;accent-color:var(--brand)">
          <span style="font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.08em;color:var(--muted)">Visible</span>
        </label>
        <div style="display:flex;gap:9px;flex-wrap:wrap">
          <button class="btn solid" onclick="savePage()">Save</button>
          <button class="btn" onclick="cancelPage()">Cancel</button>
          <button class="btn" id="pgDelete" style="display:none;margin-left:auto;color:#b0392c;border-color:#f0d4d0" onclick="deletePage()">Delete</button>
        </div>
      </div>
      <div id="pagesList"></div>`;
  }
  fillTeamSelect(); renderPagesList();
}

function renderAdminYouth(){
  const el=document.getElementById('tab-youth');
  if(!canIssueCodes()){
    el.innerHTML='<div class="empty"><div class="t">Codes are issued by whoever administers Kids Church, Youth, Lazers or ReNu</div></div>';
    return;
  }
  if(!el.dataset.built){
    el.dataset.built='1';
    el.innerHTML=`
      <p style="font-size:12px;color:var(--muted);margin:0 0 14px;line-height:1.6;max-width:560px">
        Under 16s cannot have accounts, so a code goes to their parent instead. It works once, on one device, and lasts 6 weeks.
      </p>
      <div id="youthExpiring" style="display:none;background:var(--gold-tint);border:1px solid var(--gold-line);border-radius:14px;padding:13px 17px;margin-bottom:14px">
        <div style="font-size:12px;font-weight:800;color:var(--gold-ink);margin-bottom:9px"></div>
        <button class="btn gold" onclick="renewExpiring()">Send renewals</button>
      </div>
      <div style="background:var(--surface-2);border:1px solid var(--line);border-radius:16px;padding:17px;margin-bottom:18px">
        <div class="lab">Send a code</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <select id="youthWho" class="fld" style="flex:1;min-width:210px;margin:0"></select>
          <button class="btn solid" id="sendCodeBtn" onclick="sendCode()">Send</button>
        </div>
        <div id="youthTo" style="font-size:11px;color:var(--muted);margin-top:10px;font-weight:600"></div>
      </div>
      <div id="youthList"></div>`;
  }
  loadYouth();
}
