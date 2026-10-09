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
const HUB_BUILD = 'v108';

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
          '<h1 style="font-size:19px;font-weight:600;margin:0 0 12px">Half of this page is out of date</h1>' +
          '<p style="font-size:14px;line-height:1.6;color:#3a4d4c;margin:0 0 24px">' +
          'Your browser is holding an old copy of one of the scripts. A hard refresh ' +
          '(Ctrl and F5 together) should clear it.</p>' +
          '<button onclick="location.reload(true)" style="background:#3d6263;color:#fff;border:none;' +
          'padding:12px 28px;border-radius:8px;font-size:12px;font-weight:600;' +
          'cursor:pointer;font-family:inherit">Reload</button>' +
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
    /* No "N tools" any more. It counted registry entries whose team matched,
       and it read 0 for every team, because this picker opens before the
       registry has loaded. It would be wrong even once it loaded: since Step N
       the Menu is not grouped by team - everybody sees the same structure, and
       only Core Team adds to it - so a per-team count says nothing true. What
       the team changes is which notices you see, which the line below says. */
    return `<button class="pick-t" onclick="chooseTeam('${t}')">
      <span style="width:10px;height:10px;border-radius:50%;background:${c.colour};flex-shrink:0;margin:0 4px"></span>
      <span style="flex:1"><span class="nm">${esc(c.label)}</span></span>
      <i data-lucide="chevron-right" style="width:16px;height:16px;color:var(--faint)"></i>
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
    btn.innerHTML = `<span class="dot" style="background:${c.colour}"></span><span>${esc(c.label)}</span>` +
      '<i data-lucide="chevron-down" style="width:15px;height:15px;color:var(--muted)"></i>';
  }
  loadHero();
  loadCharter();
  renderTeamPanels();
  renderNews();
  renderWaiting();
  renderServing();
  renderMyEvents();
  renderTools();
  renderNavigation();
}

EGBCAuth.require().then(async profile => {
  ME = profile;
  document.getElementById('av').textContent = initials(profile.name || profile.email);
  document.getElementById('whoName').textContent = profile.name || '';
  document.getElementById('whoEmail').textContent = profile.email || '';

  if (EGBCAuth.isAdmin()) {
    document.getElementById('adminBtn').style.display = '';
    document.getElementById('editModeBtn').style.display = '';
    setEditButton();
  }

  await Promise.all([loadNews(), loadPages(), loadTeamPanels(), loadMeetings(), loadBookingsAdmin()]);

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
  setEditButton();
  renderTeamPanels();
  renderNews();
}

function setEditButton() {
  const b = document.getElementById('editModeBtn');
  b.classList.toggle('on', EDITING);
  b.innerHTML = EDITING
    ? '<i data-lucide="check" style="width:16px;height:16px"></i><span class="hide-sm">Done</span>'
    : '<i data-lucide="pencil" style="width:16px;height:16px"></i><span class="hide-sm">Edit</span>';
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
    return `<div class="tp">
      <div class="hd">
        <span class="nm"><span class="dot" style="background:${c.colour}"></span>${esc(c.label)}</span>
        ${EDITING && canEdit ? `<button class="btn sm ghost" style="margin-left:auto" onclick="editTeamPanel('${t}')"><i data-lucide="pencil" style="width:15px;height:15px"></i>Edit</button>` : ''}
      </div>
      ${d.title ? `<h3 style="font-size:17px;font-weight:600;margin-bottom:8px">${esc(d.title)}</h3>` : ''}
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
  "html": "<h2>Worship &amp; AV Team Charter</h2>\n<blockquote>We are worshippers first, team members second, musicians and technicians third.</blockquote>\n\n<h3>Who We Are</h3>\n<p>We are a family of worshippers who serve together with humility, joy, and unity. Every person â€” musician, vocalist, or AV â€” plays a vital role in helping the church encounter God.</p>\n\n<h3>When We Disagree</h3>\n<p>We understand that we may not always share the same theological views or ways of doing things. When differences arise, we commit to talking with love, respect, and humility, keeping Jesus at the centre. Unity is not about agreeing on everything â€” it's about choosing love in everything.</p>\n\n<h3>Living as Followers of Jesus</h3>\n<p>As people who serve visibly, our lives should reflect the way of Jesus â€” not perfectly, but sincerely. We aim to honour Him in our relationships, decisions, and behaviour.</p>\n<p>We recognise that lifestyle choices shaped by a hedonistic or self-centred approach to life do not align with the calling of serving in worship ministry. This applies to choices, not to identity or things people cannot control.</p>\n<p>We choose to grow, to be accountable, and to live lives that point others to Jesus.</p>\n\n<h3>How We Serve Together</h3>\n<ul>\n<li><strong>We prepare well</strong> â€” learning our parts, listening to the set, and arriving ready</li>\n<li><strong>We stay flexible</strong> â€” songs and arrangements may change</li>\n<li><strong>We honour one another</strong> â€” with kindness and encouragement</li>\n<li><strong>We communicate early</strong> â€” about availability or challenges</li>\n<li><strong>We follow the worship leader's direction</strong> â€” with unity and trust</li>\n<li><strong>We partner with AV as one team</strong> â€” not two</li>\n<li><strong>We pray together</strong> â€” because worship is spiritual before it is musical</li>\n</ul>\n\n<h3>Sunday Expression</h3>\n<ul>\n<li>We arrive prepared, prayerful, and ready to bless the church</li>\n<li>We support the worship leader and each other with unity</li>\n<li>We respond to the Holy Spirit with sensitivity and trust</li>\n<li>We serve with cheerful hearts, remembering our goal is to help others see Jesus</li>\n</ul>"
 },
 "core-team-charter": {
  "title": "Core Team Charter",
  "html": "<h2>Core Team Charter</h2>\n<blockquote>We lead not by talent or title, but by character, humility, and a servant heart.</blockquote>\n\n<h3>Our Identity &amp; How We Carry Ourselves</h3>\n<p>The Core Team exists to set the culture of the Worship &amp; AV Ministry. We model what we want the whole team to become: worshippers first, musicians second, servants always.</p>\n\n<h3>When We Disagree</h3>\n<p>We recognise that we may not always share the same theological views or ministry preferences. When differences arise, we commit to speaking with love, humility, and respect, keeping Jesus at the centre of every conversation. Our unity is not built on sameness, but on Christ-like love (John 13:35).</p>\n\n<h3>Visible Lives of Discipleship</h3>\n<p>Because we serve in a visible ministry, our lives should reflect the character and way of Jesus â€” not perfectly, but sincerely. We commit to living in a way that honours Christ in our relationships, choices, and conduct.</p>\n<p>We recognise that certain lifestyle choices that reflect a hedonistic or self-centred way of living are not compatible with the calling of leading others in worship. This applies to behaviours we choose, not to aspects of identity or circumstances people cannot control.</p>\n<p>We choose integrity, accountability, and holiness, seeking to grow in Christ.</p>\n\n<h3>How We Lead</h3>\n<ul>\n<li><strong>Servant leadership</strong> â€” we lead by example, not position</li>\n<li><strong>Visible support on Sundays</strong> â€” present, engaged, and encouraging</li>\n<li><strong>Teachable spirits</strong> â€” always willing to learn and grow</li>\n<li><strong>Culture carriers</strong> â€” we set the tone for the whole team</li>\n<li><strong>Spiritual sensitivity</strong> â€” attuned to God and to one another</li>\n</ul>\n\n<h3>Our Commitment</h3>\n<ul>\n<li>We lead by example</li>\n<li>We protect unity</li>\n<li>We champion others</li>\n<li>We communicate clearly</li>\n<li>We honour AV as equal partners</li>\n<li>We steward Sundays with prayer</li>\n</ul>"
 },
 "youth-charter": {
  "title": "Youth Worship & AV Charter",
  "html": "<h2>Youth Worship &amp; AV Team Charter</h2>\n<blockquote>We are a team of young worshippers who want to help our church meet with God.</blockquote>\n\n<h3>Who We Are</h3>\n<p>We serve with love, joy, and unity â€” on instruments, with our voices, or on the AV team. Every one of us matters.</p>\n\n<h3>When We Don't Agree</h3>\n<p>Sometimes we might see things differently about faith or worship. That's okay. What matters is that we talk kindly, listen well, and treat each other with respect, keeping Jesus at the centre.</p>\n\n<h3>Living Like Jesus Outside of Sundays</h3>\n<p>Because we're on a team that people can see, our lives should show that we follow Jesus â€” not perfectly, but honestly. We choose to live in ways that honour Him, including the choices we make and the things we do when no one is watching.</p>\n<p>A lifestyle that's all about pleasure, partying, or doing whatever we want doesn't fit with being part of a worship team. This is about choices, not identity or things people cannot control.</p>\n<p>We choose to grow, to ask for help when we need it, and to live in a way that points people to Jesus.</p>\n\n<h3>How We Serve</h3>\n<ul>\n<li><strong>We show up ready</strong> â€” prepared and on time</li>\n<li><strong>We stay flexible</strong> â€” things change, and that's okay</li>\n<li><strong>We encourage each other</strong> â€” words build up, not tear down</li>\n<li><strong>We follow the leader</strong> â€” with trust and unity</li>\n<li><strong>We work with AV as one team</strong> â€” everyone counts</li>\n<li><strong>We pray together</strong> â€” because this is about more than music</li>\n</ul>\n\n<h3>Sundays</h3>\n<ul>\n<li>We arrive early</li>\n<li>We support the leader</li>\n<li>We help create a joyful atmosphere</li>\n<li>We worship wholeheartedly</li>\n<li>We serve visibly and kindly</li>\n</ul>"
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
  const cardTitle = document.getElementById('charterTitle').textContent;
  const clean = stripLeadingHeading(safeHtml(CHARTER_HTML), cardTitle);

  /* 17b: folded to its section headings. Martin: "you have to scroll quite a
     way down to see the team charter" - it was the tallest thing on the page
     by a long way. Each heading opens its own section; nothing is taken away,
     it is put away. A charter with no headings has nothing to fold, so it
     keeps the old "Read it all". */
  const secs = charterSections(clean);
  if (secs.length > 1) {
    body.classList.remove('short');
    body.innerHTML = secs.map((s, i) =>
      `<div class="chsec">
        <button class="chsec-h" onclick="toggleCharterSection(${i})" aria-expanded="false">
          <span>${esc(s.heading)}</span>
          <i data-lucide="chevron-down" style="width:16px;height:16px"></i>
        </button>
        <div class="chsec-b rich" id="chsec${i}" hidden>${s.html}</div>
      </div>`).join('');
    more.style.display = '';
    more.textContent = 'Open them all';
    CHARTER_OPEN = false;
    card.style.display = '';
    if (window.EGBCUI && EGBCUI.icons) EGBCUI.icons();
    return;
  }

  body.innerHTML = clean;
  body.classList.add('short');
  card.style.display = '';

  requestAnimationFrame(() => {
    more.style.display = body.scrollHeight > 260 ? '' : 'none';
    more.textContent = 'Read it all';
  });
}

/* The charter, cut at its headings. Anything before the first heading is kept
   under the heading "In short", so a charter that opens with a paragraph does
   not quietly lose it. */
function charterSections(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const out = [];
  let cur = null;
  [...doc.body.children].forEach(el => {
    if (/^H[1-3]$/.test(el.tagName)) {
      cur = { heading: (el.textContent || '').trim() || 'More', html: '' };
      out.push(cur);
      return;
    }
    if (!cur) {
      if (!(el.textContent || '').trim()) return;
      cur = { heading: 'In short', html: '' };
      out.push(cur);
    }
    cur.html += el.outerHTML;
  });
  return out.filter(s => s.heading);
}

function toggleCharterSection(i) {
  const b = document.getElementById('chsec' + i);
  if (!b) return;
  const open = b.hasAttribute('hidden');
  if (open) b.removeAttribute('hidden'); else b.setAttribute('hidden', '');
  const h = b.previousElementSibling;
  if (h) { h.setAttribute('aria-expanded', open ? 'true' : 'false'); h.classList.toggle('on', open); }
}

let CHARTER_HTML = '';

function stripLeadingHeading(html, title) {
  const d = new DOMParser().parseFromString(html, 'text/html');
  const first = d.body.firstElementChild;
  if (!first || !/^H[1-3]$/.test(first.tagName)) return d.body.innerHTML;
  /* Only if it says the same thing as the title above it. A charter whose
     first heading is a section of its own keeps it: folding the charter made
     that difference matter, because a dropped heading took its section's
     name with it. */
  const same = (s) => String(s || '').replace(/[^a-z0-9]+/gi, ' ').trim().toLowerCase();
  if (title === undefined || same(first.textContent) === same(title)) first.remove();
  return d.body.innerHTML;
}

function toggleCharter() {
  CHARTER_OPEN = !CHARTER_OPEN;
  const body = document.getElementById('charterBody');
  const secs = body.querySelectorAll('.chsec-b');
  if (secs.length) {
    secs.forEach((b, i) => {
      if (CHARTER_OPEN) b.removeAttribute('hidden'); else b.setAttribute('hidden', '');
      const h = b.previousElementSibling;
      if (h) { h.setAttribute('aria-expanded', CHARTER_OPEN ? 'true' : 'false'); h.classList.toggle('on', CHARTER_OPEN); }
    });
    document.getElementById('charterMore').textContent = CHARTER_OPEN ? 'Close them all' : 'Open them all';
    return;
  }
  body.classList.toggle('short', !CHARTER_OPEN);
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
    const title = t.heroTitle || church.title || 'EGBC Hub';
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

    renderWelcome(d.body);
  } catch (e) {
    console.error('Hero load failed', e);
    document.getElementById('heroTitle').textContent = 'EGBC Hub';
    renderWelcome('');
  }
}

/* The welcome words, which are church-wide and are usually empty.

   Martin, on the live hub as Core Team: an empty card saying "Nothing here
   yet." sat in the bottom right of the home page. It was telling everybody in
   the church about a gap only an admin can fill, on the one page that is
   supposed to fit on a screen.

   So: no words and cannot edit - no card at all. No words and CAN edit - the
   card, saying what it is for and offering to fill it, which is the only way
   an admin would ever find out the feature exists. */
function renderWelcome(html) {
  const card = document.getElementById('bodyCard');
  const body = document.getElementById('bodyContent');
  if (!card || !body) return;

  const words = String(html || '').replace(/<[^>]*>/g, '').trim();
  const canEdit = !!(window.EGBCAuth && EGBCAuth.isAdmin && EGBCAuth.isAdmin());

  if (words) { card.style.display = ''; body.innerHTML = html; return; }

  if (!canEdit) { card.style.display = 'none'; body.innerHTML = ''; return; }

  card.style.display = '';
  body.innerHTML = '<p style="color:var(--faint);font-style:italic;margin:0">' +
    'No welcome words yet. This is the first thing people read on the hub - ' +
    'a sentence about what is going on is enough.</p>' +
    '<button class="btn sm solid" style="margin-top:12px" onclick="editBody()">Add a welcome</button>';
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
/* "Show until". A notice can take itself off the page on a day the person
   posting it chooses - the original portal's news panel could do this and the
   hub's could not, so last term's notice stayed up until somebody remembered
   to delete it.

   An expired notice is hidden, not deleted: it stays in the Notices list
   marked hidden, so it can be given a new date or removed properly. The
   comparison is on the plain yyyy-mm-dd string the date field gives us, so
   "until today" means it is still showing today and gone tomorrow. */
function todayIso() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function isNewsExpired(n) { return !!(n && n.until && n.until < todayIso()); }

function forMe(n) {
  if (!Array.isArray(n.teams) || !n.teams.length) return true;
  if (EGBCAuth.isMaster()) return true;
  const mine = myTeams();
  return n.teams.some(t => mine.includes(t));
}

/* Video meetings. Rota events can carry a Daily.co room (events.videoRoom,
   set in the Rota Planner); meeting types get a default room when none was
   picked. Keep these rules in step with CoreTeamApp.html and Planner.html.
   Only the plain knock-to-join links live here - host links carry owner
   tokens and must never be in this public repo. */
const VIDEO_BASE = 'https://egbc.daily.co/';
const VIDEO_DEFAULT_BY_TYPE = {
  'Core Team Meeting': 'worship-core-team', 'Worship and AV Team Meeting': 'Worship-AV',
  'Worship Team Meeting': 'Worship-AV', 'AV Team Meeting': 'Worship-AV',
};
const videoRoomFor = ev => ev.videoRoom !== undefined ? ev.videoRoom : (VIDEO_DEFAULT_BY_TYPE[ev.type] || '');
const VIDEO_ROOM_LABELS = {
  'Worship-AV': 'Worship & AV', 'worship-core-team': 'Worship Core Team', 'Prayer': 'Prayer',
  'Eldership': 'Eldership', 'CMM': 'CMM', 'kids-ministries': 'Kids Ministries', 'interviews': 'Interviews',
};
let MEETINGS = [];
let UPCOMING = [];   /* every rota date from today on, before the meetings filter */

/* Mine if it is for one of my teams (the rota calls Youth Worship "Youth"),
   or I have a role on it. */
function meetingForMe(ev) {
  if (EGBCAuth.isMaster()) return true;
  const mine = myTeams();
  if ((ev.teams || []).some(t => mine.includes(t === 'Youth' ? 'Youth Worship' : t))) return true;
  const mid = ME && ME.memberId;
  return !!mid && Object.values(ev.assignments || {})
    .some(raw => (Array.isArray(raw) ? raw : [raw]).some(p => p && p.id === mid));
}

async function loadMeetings() {
  try {
    const today = new Date().toISOString().split('T')[0];
    const snap = await db.collection('events').where('date', '>=', today).orderBy('date').limit(150).get();
    UPCOMING = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(ev => !ev.archived);
    MEETINGS = UPCOMING.slice()
      /* Section 21: a members' meeting does not appear for an Attender. */
      .filter(ev => !ev.archived && videoRoomFor(ev) && meetingForMe(ev)
                    && EGBCAuth.mayJoinRoom(videoRoomFor(ev)))
      .sort((a, b) => (a.date + (a.startTime || '')).localeCompare(b.date + (b.startTime || '')));
  } catch (e) {
    console.error('Meetings load failed', e);
    MEETINGS = [];
  }
  renderMeetings();
  try { renderServing(); } catch (e) {}
  /* console.error, not warn: a card that fails to draw is a card nobody sees,
     and the checks here treat an error as a failure and a warning as noise.
     This one drew nothing at all for a while because its icon helper was out
     of scope, and the warning said so to an empty room. */
  renderPinBoardCard().catch(e => console.error('Pin board card failed', e && e.message));
}

function renderMeetings() {
  const box = document.getElementById('meetingsCard');
  if (!box) return;
  const today = new Date().toISOString().split('T')[0];
  const I = (n, s) => `<i data-lucide="${n}" style="width:${s || 14}px;height:${s || 14}px"></i>`;
  /* 17b: "Video meetings is a single row unless one is coming up." Normally
     the next one is all anybody needs; when something is today or tomorrow
     the card opens out and shows all of them, because that is when it
     matters. "All rooms" in the header is still the way to everything. */
  const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
  const soon = MEETINGS.filter(ev => ev.date <= tomorrow);
  const shown = soon.length ? soon.slice(0, 5) : MEETINGS.slice(0, 1);
  const more = MEETINGS.length - shown.length;
  const rows = shown.map(ev => {
    const link = `meeting.html?room=${encodeURIComponent(videoRoomFor(ev))}&event=${encodeURIComponent(ev.id)}`;
    const d = new Date(ev.date + 'T12:00');
    const mon = d.toLocaleDateString('en-GB', { month: 'short' });
    const dow = d.toLocaleDateString('en-GB', { weekday: 'short' });
    const time = ev.startTime ? `${esc(ev.startTime)}${ev.endTime ? '&ndash;' + esc(ev.endTime) : ''}` : '';
    return `<div class="meet">
        <div class="dt"><div class="m">${mon}</div><div class="d">${d.getDate()}</div></div>
        <div style="flex:1;min-width:0">
          <div class="t">${esc(ev.type)}${ev.description ? ' &middot; ' + esc(ev.description) : ''}</div>
          <div class="s">${I('clock')}${dow}${time ? ' ' + time : ''} <span>&middot;</span> ${I('video')}${esc(VIDEO_ROOM_LABELS[videoRoomFor(ev)] || videoRoomFor(ev))}</div>
        </div>
        ${ev.date === today ? '<span class="pill">Today</span>' : ''}
        <a class="btn sm primary" href="${link}">Join</a>
      </div>`;
  }).join('');
  const none = MEETINGS.length ? ''
    : '<div style="font-size:14px;color:var(--muted);padding:6px 0">No online meetings coming up for your teams.</div>';
  box.innerHTML = `<div class="card flush">
      <div class="ch">
        <div class="ic">${I('video', 18)}</div>
        <h2>Video meetings</h2>
        <div class="sp">
          <a class="btn sm" href="meeting.html?new=1">${I('plus', 15)}<span class="hide-sm">New meeting</span></a>
          <a class="btn sm ghost" href="meeting.html">All rooms</a>
        </div>
      </div>
      <div class="cb" style="padding-top:6px;padding-bottom:14px">
        ${rows}${none}
        ${more > 0 ? `<a href="meeting.html" style="display:block;font-size:13px;color:var(--brand);text-decoration:none;padding:6px 0">${more} more coming up</a>` : ''}
        <div class="note">Type your name and knock &mdash; the host will let you in.</div>
      </div>
    </div>`;
}

/* ---- the pin board, on the landing page (Step N) --------------------
   Martin: "It is actually important but buried." It was one line in the Menu
   and nothing on the page anybody actually lands on.

   This reads the same document stickynotes.html reads and changes nothing
   about the pin board itself - no writing, no archiving, no reordering. Which
   board depends on the team, exactly as the pin board decides it: Worship
   Team, AV Team and Choir share one, Kids Church and Youth Worship have their
   own. */
const PIN_BOARDS = [
  { doc: 'state', title: 'Worship', teams: ['Worship Team', 'AV Team', 'Choir'] },
  { doc: 'kids-church', title: 'Kids Church', teams: ['Kids Church'] },
  { doc: 'youth', title: 'Youth', teams: ['Youth Worship'] }
];

function myPinBoard() {
  const mine = myTeams();
  return PIN_BOARDS.find(b => b.teams.some(t => mine.includes(t))) || PIN_BOARDS[0];
}

async function renderPinBoardCard() {
  const box = document.getElementById('pinBoardCard');
  if (!box) return;
  /* Every card builder in this file keeps its own, at its own size. */
  const I = (n, s) => `<i data-lucide="${n}" style="width:${s || 14}px;height:${s || 14}px"></i>`;
  const board = myPinBoard();
  let notes = [];
  try {
    const snap = await db.collection('worshipBoardState').doc(board.doc).get();
    notes = ((snap.exists && snap.data().notes) || [])
      .filter(n => n && !n.archived)
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
      .slice(0, 3);
  } catch (e) {
    /* Not being able to read the board is not a reason to lose the card: the
       two buttons are the point of it. */
    console.warn('Pin board card: could not read the board', e && e.message);
  }

  const rows = notes.map(n => {
    /* A note is a title and a body; some have only a body. Either way what
       goes here is the first line, not the whole thing. */
    const line = (n.title || (n.body || '').replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
    const when = n.createdAt ? new Date(n.createdAt).toLocaleDateString('en-GB',
      { day: 'numeric', month: 'short' }) : '';
    return `<a class="row" href="stickynotes.html" style="display:flex;gap:10px;align-items:baseline;padding:7px 0;text-decoration:none;color:inherit">
        <span style="flex:1;min-width:0;font-size:14px;color:var(--ink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(line.slice(0, 90) || '(no title)')}</span>
        <span style="font-size:12px;color:var(--muted);flex:none">${esc(n.author || 'Anonymous')}${when ? ' &middot; ' + when : ''}</span>
      </a>`;
  }).join('');

  box.innerHTML = `<div class="card flush">
      <div class="ch">
        <div class="ic">${I('sticky-note', 18)}</div>
        <h2>Pin board</h2>
        <div class="sub">${esc(board.title)} &middot; anything anybody wants to raise</div>
        <div class="sp">
          <a class="btn sm" href="stickynotes.html?add=1">${I('plus', 15)}<span class="hide-sm">Add an idea</span></a>
          <a class="btn sm ghost" href="stickynotes.html">Open the pin board</a>
        </div>
      </div>
      <div class="cb" style="padding-top:6px;padding-bottom:14px">
        ${rows || '<div style="font-size:14px;color:var(--muted);padding:6px 0">Nothing on the board yet. Be the first.</div>'}
      </div>
    </div>`;
  if (window.EGBCUI && EGBCUI.icons) EGBCUI.icons();
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
      '<div class="empty"><div class="i"><i data-lucide="megaphone" style="width:28px;height:28px"></i></div><div class="t">No news yet</div></div>';
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

/* â”€â”€ My events â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
   The events brief says every chunk that gives a person something of
   their own adds it to this one dashboard rather than building a "my
   something" page of its own. This is that slot for sign-ups.

   It asks for sign-ups where memberUid is this person, which is exactly
   what the rules allow a member to ask: the query names the person, so
   every document that comes back is theirs. Asking for the collection
   without that is refused, and should be.

   Sorted here rather than in the query. An orderBy drops every document
   missing the field, silently, and these are written by a public page
   that has changed twice already. */
/* â”€â”€ Getting about â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
   Home, Calendar, Meet, My serving, More - as a tab bar on a phone and a
   sidebar on a computer, from one list so they cannot drift apart.

   A tab whose page this person cannot open is left out rather than shown
   dead: the brief asks for hidden, not greyed. Whether they can open it is
   the registry's answer, not a guess here - PAGES is what the hub already
   filters everything else by. */
/* The few places that get a tab of their own at the bottom of a phone, and a
   shortcut at the top of the sidebar. Short labels on purpose - "My serving"
   is clearer on a tab than "Rota" - but WHETHER each one appears is decided by
   egbc-menu.js, the same structure the Menu uses, so a page cannot be in one
   and not the other. It used to be decided by the registry, which is about
   what exists rather than where anything belongs. */
function navPlaces() {
  const inTheMenu = {};
  EGBCMenu.forPerson(EGBCMenu.who()).length;        /* throws early if the structure is broken */
  EGBCMenu.allPages().forEach(p => { inTheMenu[String(p.url).toLowerCase()] = true; });
  const visibleNow = {};
  (function walk(nodes) {
    nodes.forEach(n => { if (n.url) visibleNow[String(n.url).toLowerCase()] = true; if (n.children) walk(n.children); });
  })(EGBCMenu.forPerson(EGBCMenu.who()));

  const places = [
    { url: 'hub.html', label: 'Home', icon: 'house', always: true },
    { url: 'whatson.html', label: "What's on", icon: 'calendar-days' },
    { url: 'meeting.html', label: 'Meet', icon: 'video' },
    { url: 'view-only-rota.html', label: 'My serving', icon: 'calendar-check' }
  ];
  /* Switched off in the registry still means switched off. */
  const switchedOff = url => PAGES.some(p =>
    decodeURIComponent(String(p.url || '')).toLowerCase() === url && p.enabled === false);
  return places.filter(p => p.always || (visibleNow[p.url] && !switchedOff(p.url)));
}

/* The hub has its own Menu; every other page gets the shell's. More
   opens whichever this page actually has, rather than assuming. */
function openMenuHere() {
  if (typeof openTools === 'function') { openTools(); return; }
  if (window.EGBCShell && EGBCShell.openMenu) { openMenuHere(); return; }
}

function renderNavigation() {
  const here = (location.pathname.split('/').pop() || 'hub.html').toLowerCase();
  const I = (n, s) => `<i data-lucide="${n}" style="width:${s || 17}px;height:${s || 17}px"></i>`;
  const places = navPlaces();

  const bar = document.getElementById('egbc-tabbar');
  if (bar) {
    bar.innerHTML = '<div class="tbs">' +
      places.map(p => `<a href="${p.url}" class="${p.url.toLowerCase() === here ? 'on' : ''}">${I(p.icon, 20)}<span>${esc(p.label)}</span></a>`).join('') +
      `<button onclick="openMenuHere()">${I('menu', 20)}<span>More</span></button>` +
      '</div>';
  }

  /* The sidebar is the same list, then the sections this person
     administers - which is the whole of "role-based, not realm-based":
     same app, same sign-in, more doors. */
  const side = document.getElementById('sidebar');
  if (side) {
    /* The sections this person administers, from egbc-menu.js and IN THE
       ORDER THE MENU HAS THEM - not the registry, sorted alphabetically.
       Alphabetical was a second arrangement of the same pages, which is the
       thing Step N exists to stop: Events, Places and Backup & Restore read
       one way in the Menu and another here. */
    const admin = [];
    (function walk(nodes) {
      nodes.forEach(n => {
        /* `bookings` as well as `admin`: Room bookings is the one thing a
           site's bookings admin looks after, and they administer no team. */
        if (n.url && (n.admin || n.bookings)) admin.push({ url: n.url, title: n.title, icon: n.icon });
        if (n.children) walk(n.children);
      });
    })(EGBCMenu.forPerson(EGBCMenu.who()));
    side.innerHTML =
      places.map(p => `<a href="${p.url}" class="${p.url.toLowerCase() === here ? 'on' : ''}">${I(p.icon)}<span>${esc(p.label)}</span></a>`).join('') +
      `<button onclick="openMenuHere()">${I('menu')}<span>Everything else</span></button>` +
      (admin.length
        ? '<div class="sgrp">What you look after</div>' +
          admin.map(p => `<a href="${esc(p.url)}">${I(p.icon || 'file-text')}<span>${esc(p.title)}</span></a>`).join('')
        : '');
  }

  /* The view-as strip is fixed to the bottom too. Measure it rather than
     assume a height, because it wraps onto two lines on a narrow phone. */
  const va = document.getElementById('egbc-viewas');
  const h = va && va.offsetHeight ? va.offsetHeight : 0;
  if (bar) bar.style.bottom = h + 'px';
  if (window.matchMedia('(max-width:1100px)').matches) {
    document.body.style.paddingBottom = (72 + h) + 'px';
  }
  if (window.EGBCUI && EGBCUI.icons) EGBCUI.icons();
}
window.addEventListener('resize', () => { try { renderNavigation(); } catch (e) {} });

/* â”€â”€ Waiting for you â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
   The top card of the personal home: the things that need this person
   rather than the things that exist.

   Today there is one kind of item - a notice that has to be confirmed as
   read. Rota accept/decline was in the brief for this card and Martin has
   since said not to build it (NEXT-BRIEF Â§10), so it is not here. Forms,
   approvals and payments arrive with their own chunks; each adds to the
   list below rather than to a page of its own. */
function waitingItems() {
  const out = [];
  NEWS.filter(n => n.requireAck && !ACKED.has(n.id)).forEach(n => {
    out.push({
      icon: 'megaphone',
      what: esc(n.title || 'A notice'),
      why: 'Confirm you have read it',
      go: `<button class="btn sm" onclick="ackNews('${esc(n.id)}')">Confirm</button>`
    });
  });
  return out;
}

function renderWaiting() {
  const box = document.getElementById('waitingCard');
  if (!box) return;
  const items = waitingItems();
  /* Nothing waiting is the normal state, and a card saying so every day
     teaches people to ignore the card. */
  if (!items.length) { box.innerHTML = ''; return; }
  const I = (n, s) => `<i data-lucide="${n}" style="width:${s || 16}px;height:${s || 16}px"></i>`;
  box.innerHTML = `<div class="card flush">
      <div class="ch">
        <div class="ic">${I('inbox', 18)}</div>
        <h2>Waiting for you</h2>
        <div class="sp"><span class="sub">${items.length}</span></div>
      </div>
      <div class="cb" style="padding-top:6px;padding-bottom:14px">
        ${items.map(it => `<div class="meet">
          <div style="width:36px;height:36px;border-radius:8px;background:var(--tint);color:var(--brand);
            display:flex;align-items:center;justify-content:center;flex:none">${I(it.icon)}</div>
          <div style="flex:1;min-width:0"><div class="t">${it.what}</div><div class="s">${it.why}</div></div>
          ${it.go}
        </div>`).join('')}
      </div>
    </div>`;
  if (window.EGBCUI && EGBCUI.icons) EGBCUI.icons();
}

/* â”€â”€ My serving â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
   The next dates this person is on the rota for, with the role and the
   time, and a way through to the whole rota.

   Read-only on purpose. The brief's version of this card had "can't do
   it" on each date; Martin's answer to F-018 is that accept/decline is
   not wanted, so the card says what is coming and nothing more. */
function myServing() {
  const mid = ME && ME.memberId;
  if (!mid) return [];
  const out = [];
  UPCOMING.forEach(ev => {
    Object.keys(ev.assignments || {}).forEach(role => {
      const raw = ev.assignments[role];
      const people = Array.isArray(raw) ? raw : (raw ? [raw] : []);
      if (people.some(p => p && p.id === mid)) out.push({ ev, role });
    });
  });
  /* 17b: the next three. "The whole rota" in the card's header is how you
     get the rest, and it was always there. */
  return out.sort((a, b) => (a.ev.date + (a.ev.startTime || '')).localeCompare(b.ev.date + (b.ev.startTime || '')))
    .slice(0, 3);
}

function renderServing() {
  const box = document.getElementById('servingCard');
  if (!box) return;
  const rows = myServing();
  if (!rows.length) { box.innerHTML = ''; return; }
  const I = (n, s) => `<i data-lucide="${n}" style="width:${s || 14}px;height:${s || 14}px"></i>`;
  const today = new Date().toISOString().split('T')[0];
  box.innerHTML = `<div class="card flush">
      <div class="ch">
        <div class="ic">${I('calendar-check', 18)}</div>
        <h2>My serving</h2>
        <div class="sp"><a class="btn sm ghost" href="view-only-rota.html">The whole rota</a></div>
      </div>
      <div class="cb" style="padding-top:6px;padding-bottom:14px">
        ${rows.map(({ ev, role }) => {
          const d = new Date(ev.date + 'T12:00');
          return `<div class="meet">
            <div class="dt"><div class="m">${d.toLocaleDateString('en-GB', { month: 'short' })}</div><div class="d">${d.getDate()}</div></div>
            <div style="flex:1;min-width:0">
              <div class="t">${esc(role)}</div>
              <div class="s">${I('clock')}${d.toLocaleDateString('en-GB', { weekday: 'short' })}${ev.startTime ? ' ' + esc(ev.startTime) : ''}
                <span>&middot;</span> ${esc(ev.type || 'Service')}</div>
            </div>
            ${ev.date === today ? '<span class="pill">Today</span>' : ''}
          </div>`;
        }).join('')}
      </div>
    </div>`;
  if (window.EGBCUI && EGBCUI.icons) EGBCUI.icons();
}

async function renderMyEvents() {
  const box = document.getElementById('myEventsCard');
  if (!box) return;
  box.innerHTML = '';
  const uid = (EGBCAuth.user() || {}).uid;
  if (!uid) return;
  const I = (n, s) => `<i data-lucide="${n}" style="width:${s || 14}px;height:${s || 14}px"></i>`;

  let mine = [], featured = [];
  try {
    const snap = await EGBCAuth.db.collection('signups').where('memberUid', '==', uid).get();
    mine = snap.docs.map(d => ({ key: d.id, ...d.data() })).filter(s => s.status !== 'cancelled');
  } catch (e) { mine = []; }

  /* The events those sign-ups are for, and anything featured coming up. */
  const ids = [...new Set(mine.map(s => s.calEventId))];
  const evs = {};
  await Promise.all(ids.map(id => EGBCAuth.db.collection('calEvents').doc(id).get()
    .then(s => { if (s.exists) evs[id] = { id: s.id, ...s.data() }; }).catch(() => {})));

  try {
    const aud = ['public', 'members'].concat(myTeams() || []).slice(0, 30);
    const fs2 = await EGBCAuth.db.collection('calEvents')
      .where('audience', 'array-contains-any', aud).where('featured', '==', true).get();
    featured = fs2.docs.map(d => ({ id: d.id, ...d.data() }))
      .filter(e => (e.startUtc || 0) > Date.now() && e.status === 'confirmed')
      .sort((a, b) => a.startUtc - b.startUtc).slice(0, 3);
  } catch (e) { featured = []; }

  const soon = mine
    .map(s => ({ s, e: evs[s.calEventId] }))
    .filter(x => x.e && (x.e.endUtc || x.e.startUtc || 0) > Date.now())
    .sort((a, b) => (a.e.startUtc || 0) - (b.e.startUtc || 0));

  /* A card with nothing in it is noise, so it only appears when there is
     something to say. */
  if (!soon.length && !featured.length) return;

  const when = e => {
    const d = new Date(e.startLocal || e.startUtc);
    return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }) +
      (e.allDay ? '' : ', ' + d.toTimeString().slice(0, 5));
  };

  const rows = soon.map(({ s, e }) => `<div class="meet">
      <div class="dt"><div class="m">${new Date(e.startLocal || e.startUtc).toLocaleDateString('en-GB', { month: 'short' })}</div>
      <div class="d">${new Date(e.startLocal || e.startUtc).getDate()}</div></div>
      <div style="flex:1;min-width:0">
        <div class="t">${esc(e.title || 'Event')}</div>
        <div class="s">${I('clock')}${esc(when(e))} <span>&middot;</span> ${s.status === 'waiting' ? 'on the waiting list' : (s.places || 1) + ' place' + ((s.places || 1) === 1 ? '' : 's')}</div>
      </div>
      <a class="btn sm" href="my-signup.html?key=${encodeURIComponent(s.key)}">Your place</a>
    </div>`).join('');

  const feat = featured.length ? `<div class="note" style="margin-top:10px">
      ${featured.map(e => `<a href="signup.html?event=${encodeURIComponent(e.id)}" style="color:var(--brand);text-decoration:none">${esc(e.title)}</a> &middot; ${esc(when(e))}`).join('<br>')}
    </div>` : '';

  box.innerHTML = `<div class="card flush">
      <div class="ch">
        <div class="ic">${I('ticket', 18)}</div>
        <h2>${soon.length ? 'My events' : "What's coming up"}</h2>
        <div class="sp"><a class="btn sm ghost" href="whatson.html">What's on</a></div>
      </div>
      <div class="cb" style="padding-top:6px;padding-bottom:14px">
        ${rows}
        ${soon.length ? '' : '<div style="font-size:14px;color:var(--muted);padding:6px 0">Nothing booked yet.</div>'}
        ${feat}
      </div>
    </div>`;
  if (window.EGBCUI && EGBCUI.icons) EGBCUI.icons();
}

function renderNews() {
  /* NEWS keeps the expired ones so the Notices list can still manage them;
     nothing on the page shows them. */
  const live = NEWS.filter(n => !isNewsExpired(n));
  const pinned = live.filter(n => n.pinned && !(n.requireAck && ACKED.has(n.id)));
  const rest = live.filter(n => !pinned.includes(n));

  document.getElementById('pinned').innerHTML = pinned.map(n => {
    const seen = (n.ackedBy || []).length;
    return `<div class="pin">
      <div style="display:flex;align-items:center;gap:8px">
        <div class="tag"><i data-lucide="pin" style="width:14px;height:14px"></i>Please read</div>
        ${EDITING && canEditNews(n) ? `<button class="btn sm ghost" style="margin-left:auto" onclick="openNewsEditor('${n.id}')"><i data-lucide="pencil" style="width:14px;height:14px"></i>Edit</button>` : ''}
      </div>
      <h3>${esc(n.title)}</h3>
      <div class="bd">${safeHtml(n.body)}</div>
      ${n.requireAck ? `<button class="btn gold sm" onclick="ackNews('${n.id}')"><i data-lucide="check" style="width:15px;height:15px"></i>I've read it</button>
        ${EDITING && canEditNews(n) ? `<span class="seen">${seen} so far</span>` : ''}` : ''}
    </div>`;
  }).join('');

  const track = document.getElementById('newsTrack');

  if (!rest.length) {
    track.innerHTML = '<div class="empty"><div class="i"><i data-lucide="megaphone" style="width:28px;height:28px"></i></div><div class="t">Nothing new</div></div>';
    stopNewsScroll();
    renderLatestCount();
    return;
  }

  /* Notices for the team in context lead, then the rest. */
  const ordered = rest.slice().sort((a, b) => {
    const mine = n => (n.teams || []).includes(TEAM) ? 0 : 1;
    return mine(a) - mine(b);
  });

  track.innerHTML = ordered.map(n => newsCard(n)).join('');
  renderLatestCount();
  /* The panel is closed to begin with, so the scroller has no height to
     measure. It starts when the panel opens. */
  if (document.getElementById('latestPanel').classList.contains('on')) startNewsScroll();
}

/* 17b: Latest is a pop-out now, with a count of what this person has not
   opened. The count is kept in this browser, not in the database: it is a
   convenience, not a record, and putting it in users/{uid} would mean a rules
   change on the document that controls who can sign in at all.

   A notice with "ask people to confirm they have read it" has its own,
   stronger record (ackedBy) and that is untouched by this. */
const NEWS_SEEN_KEY = 'egbc-hub-news-seen';

function newsSeenAt() {
  try { return Number(localStorage.getItem(NEWS_SEEN_KEY) || 0) || 0; } catch (e) { return 0; }
}

function newsMillis(n) {
  const c = n && n.createdAt;
  if (!c) return 0;
  if (typeof c.toMillis === 'function') return c.toMillis();
  if (c.seconds) return c.seconds * 1000;
  return Number(c) || 0;
}

function unreadNews() {
  const since = newsSeenAt();
  return NEWS.filter(n => !isNewsExpired(n) && newsMillis(n) > since).length;
}

function renderLatestCount() {
  const el = document.getElementById('latestCount');
  if (!el) return;
  const n = unreadNews();
  el.textContent = n > 9 ? '9+' : String(n);
  el.style.display = n ? '' : 'none';
}

function openLatest() {
  document.getElementById('latestPanel').classList.add('on');
  document.getElementById('latestScrim').classList.add('on');
  /* Opened is read. The newest notice decides the mark, so a notice posted
     while the panel is open still counts as unread next time. */
  const newest = NEWS.reduce((m, n) => Math.max(m, newsMillis(n)), 0);
  try { localStorage.setItem(NEWS_SEEN_KEY, String(Math.max(newest, newsSeenAt()))); } catch (e) {}
  renderLatestCount();
  startNewsScroll();
}

function closeLatest() {
  document.getElementById('latestPanel').classList.remove('on');
  document.getElementById('latestScrim').classList.remove('on');
  stopNewsScroll();
}

function newsCard(n) {
  const tags = (n.teams || []).map(t => {
    const c = EGBCAuth.TEAMS[t] || { label: t, colour: '#6b7280' };
    return `<span class="t"><span class="dot" style="background:${c.colour}"></span>${esc(c.label)}</span>`;
  }).join('');
  return `<div class="nw">
    <div class="m">
      ${tags || '<span class="t"><span class="dot" style="background:#9ca3af"></span>Everyone</span>'}
      <span class="d">&middot; ${n.date ? esc(n.date) : when(n.createdAt)}</span>
      ${EDITING && canEditNews(n) ? `<span class="acts">
        <button onclick="openNewsEditor('${n.id}')" title="Edit"><i data-lucide="pencil" style="width:13px;height:13px"></i>Edit</button>
        <button class="del" onclick="deleteNews('${n.id}')" title="Remove"><i data-lucide="trash-2" style="width:13px;height:13px"></i></button>
      </span>` : ''}
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

  const tag = (label, colour) => `<span style="display:inline-flex;align-items:center;gap:6px;font-size:13px;font-weight:500;color:var(--body)">
      <span style="width:8px;height:8px;border-radius:50%;background:${colour}"></span>${esc(label)}</span>`;
  document.getElementById('rdMeta').innerHTML =
    ((n.teams || []).map(t => {
      const c = EGBCAuth.TEAMS[t] || { label: t, colour: '#6b7280' };
      return tag(c.label, c.colour);
    }).join('') || tag('Everyone', '#9ca3af')) +
    `<span style="font-size:13px;color:var(--faint)">&middot; ${when(n.createdAt)}</span>`;

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
    /* The same acknowledgement is what "Waiting for you" counts, so that
       card has to be redrawn too - otherwise it keeps asking for something
       already done. */
    try { renderWaiting(); } catch (e) {}
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
  newsEditor().setHTML(n ? n.body : '');
  document.getElementById('nwDate').value = n ? (n.date || '') : '';
  document.getElementById('nwUntil').value = n ? (n.until || '') : '';
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

/* Notices are written in a proper editor (egbc-editor.js): toolbar buttons,
   and a pasted email is cleaned to plain formatting on the way in. Pictures
   go to the banners folder, which signed-in people may already write to. */
let NEWS_ED = null;
function newsEditor() {
  if (NEWS_ED) return NEWS_ED;
  NEWS_ED = EGBCEditor.mount(document.getElementById('nwBody'), {
    placeholder: 'What do people need to know? You can paste an email straight in.',
    upload: async file => {
      const path = `banners/notice-${Date.now()}-${file.name.replace(/[^\w.-]+/g, '_')}`;
      await storage.ref(path).put(file, { contentType: file.type, cacheControl: 'public,max-age=31536000' });
      return storage.ref(path).getDownloadURL();
    }
  });
  return NEWS_ED;
}

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
  const body = newsEditor().getHTML();
  if (!title) { alert('It needs a title.'); return; }

  const teams = Array.from(document.querySelectorAll('#nwTeams .chip.on'))
    .map(c => c.dataset.team).filter(Boolean);

  if (!teams.length && !confirm('This will go to everyone in the church, on every team.\n\nPost it church-wide?')) return;

  const data = {
    title, body, teams,
    date: document.getElementById('nwDate').value.trim(),
    until: document.getElementById('nwUntil').value,
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

/* Does this person look after any site's room bookings?

   It is a list of member ids inside bookingSettings, so it takes a read, and
   the Menu needs the answer before it draws - "Room bookings" is under Core
   Team > Events and rooms, and the person it is for is often on neither.
   EGBCMenu.who() reads the flag this sets. Unset means "not one", so a read
   that fails hides the entry rather than offering a page that will turn them
   away. (F-067, from the events window.) */
async function loadBookingsAdmin() {
  window.EGBC_BOOKINGS_ADMIN = false;
  try {
    if (EGBCAuth.isAdmin()) { window.EGBC_BOOKINGS_ADMIN = true; return; }
    const mid = ME && ME.memberId;
    if (!mid) return;
    const snap = await db.collection('bookingSettings').get();
    window.EGBC_BOOKINGS_ADMIN = snap.docs
      .some(d => ((d.data() || {}).bookingsAdmins || []).includes(mid));
  } catch (e) {
    console.error('Bookings admin check failed', e);
  }
}

async function loadPages() {
  try {
    const snap = await db.collection('hubPages').orderBy('order').get();
    PAGES = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (e) { console.error('Pages load failed', e); PAGES = []; }
}

/* Pages built for a phone or tablet. They are installed from the home screen
   and are not much use in a desktop tools list. They are downloaded from
   hubresources.html ("Apps and downloads"), which is why they need no tiles.

   Performancenotes.html is the exception worth knowing about: nothing links
   to it, so it is registered - but it stays out of the tools list while it
   is named here. Take it out of this list if it should be a tile. */
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

  /* -- the live menu, as it actually is ------------------------------
     Read off portal/menuItems in the browser rather than reconstructed
     from filenames. "worship" in that data means everyone signed in, not
     the Worship Team, which is why almost all of these are `everyone`. */

  { url: 'view-only-rota.html', title: 'Rota', icon: '\u{1F4C5}', team: 'Worship Team', everyone: true,
    description: 'Who is on, and when' },
  { url: 'Worshipteamcharter.html', title: 'Worship & AV', icon: '\u{1F4DC}', team: 'Worship Team', everyone: true,
    description: 'How we serve together' },
  { url: 'EGBC-PlayThrough.html', title: 'Play-Through', icon: '\u{1F3AC}', team: 'Worship Team', everyone: true,
    description: 'Practice videos' },
  { url: 'EGBC-Training-Worship.html', title: 'Worship Training', icon: '\u{1F4D8}', team: 'Worship Team', everyone: true,
    description: 'Training material for the worship team' },
  /* The one visibility change you asked for: the song library goes to
     Worship and AV rather than everyone. AV need the lyrics. */
  { url: 'Library.html', title: 'Music Database', icon: '\u{1F3B5}', team: 'Worship Team', teams: WORSHIP_AV,
    description: 'Every song, with keys and usage' },
  { url: 'batchupload.html', title: 'Music Uploader', icon: '\u{1F4E4}', team: 'Worship Team', everyone: true,
    description: 'Add music to the library' },
  { url: 'EGBC-HowTo-AV.html', title: 'How-To AV', icon: '\u{1F4D8}', team: 'AV Team', everyone: true,
    description: 'Running the desk, step by step' },
  { url: 'EGBC-Troubleshoot-AV.html', title: 'AV Troubleshoot', icon: '\u{1F6E0}', team: 'AV Team', everyone: true,
    description: 'When something is not working' },
  { url: 'Youthcharter.html', title: 'Youth', icon: '\u{1F4DC}', team: 'Youth Worship', everyone: true,
    description: 'How the youth team serve' },
  { url: 'youthserviceplanner.html', title: 'Youth Service Planner', icon: 'â›ª', team: 'Youth Worship', everyone: true,
    description: 'Planning a youth-led service' },
  { url: 'stickynotes.html', title: "Idea's pin board", icon: '\u{1F4CC}', team: 'Worship Team', everyone: true,
    description: 'Song suggestions and ideas' },
  /* Not superseded by resources.html - this is where the phone apps are
     downloaded from, which is why worshiphubapp, CoreTeamApp, youthapp2
     and Performancenotes need no tiles of their own. */
  { url: 'hubresources.html', title: 'Apps and downloads', icon: '\u{1F4F2}', team: 'Worship Team', everyone: true,
    description: 'Get the apps on your phone or tablet' },

  { url: 'Coreteamcharter.html', title: 'Core Team', icon: '\u{1F4DC}', team: 'Core Team',
    description: 'How the core team work' },
  { url: 'EmailBuilder2.html', title: 'Email Compiler', icon: 'âœ‰', team: 'Core Team',
    description: 'Write and send to a team' },
  /* One file holds every department's rota, so it belongs to all of them.
     adminOnly keeps it off an ordinary member's hub - it sends email. */
  { url: 'Planner.html', title: 'Rota Planner', icon: '\u{1F4C5}', team: 'Core Team',
    teams: ['Core Team', 'Worship Team', 'Kids Church', 'Youth Worship'], adminOnly: true,
    description: 'Build and send the rota' },
  { url: 'SundayServicePlanner.html', title: 'Sunday Service Planner', icon: 'â›ª', team: 'Core Team',
    description: 'Plan the running order' },
  { url: 'addressbook.html', title: 'Address Book', icon: '\u{1F465}', team: 'Core Team', adminOnly: true,
    description: 'People, households and teams' },
  /* Sites, rooms, bookable kit and outside venues. adminOnly because it is
     where a room is taken out of use, which changes what everybody else can
     book. Any team admin may open it, which matches isAdmin() in the rules. */
  { url: 'places-admin.html', title: 'Places', icon: '\u{1F3E0}', team: 'Core Team', adminOnly: true,
    description: 'Sites, rooms, kit and venues' },

  /* Events. What's on carries `everyone`, because it is the one page a
     visitor with no account is meant to reach - the tile is there for a
     member who wants to see what is coming up, and the same page is what a
     poster or a WhatsApp message links to. The admin side is adminOnly,
     like the other tools that send email on the church's behalf. */
  { url: 'whatson.html', title: "What's on", icon: 'calendar-days', team: 'Core Team', everyone: true,
    description: 'Church events, and signing up to them' },
  { url: 'events-admin.html', title: 'Events', icon: 'calendar-plus', team: 'Core Team',
    teams: ['Core Team', 'Worship Team', 'Kids Church', 'Youth Worship'], adminOnly: true,
    description: 'Create events, open sign-ups, see who is coming' },

  /* -- reachable only from SharePoint today --------------------------
     Nothing in the repo links to these, and they are not in the menu.
     They are the pages that genuinely disappear when the old site goes,
     which is the whole point of the registry. */

  { url: 'inventory-system-2.html', title: 'EGBC Inventory', icon: '\u{1F4E6}', team: 'AV Team',
    description: 'Equipment and where it lives' },
  { url: 'schematic.html', title: 'AV Infrastructure Mapper', icon: '\u{1F50C}', team: 'AV Team',
    description: 'What is plugged into what' },
  { url: 'MonitorStageMap.html', title: 'Monitor Setup', icon: '\u{1F39A}', team: 'AV Team',
    description: 'Stage monitor positions and mixes' },
  { url: 'AVteamlandingpage.html', title: 'AV Team Charter', icon: '\u{1F4DC}', team: 'AV Team',
    description: 'Shared with the worship team' },
  /* Listed so it is not lost, but it will not show as a tile while it is
     in MOBILE_APPS - see the note there. */
  { url: 'Performancenotes.html', title: 'Performance Notes', icon: '\u{1F4DD}', team: 'Worship Team',
    description: 'On-stage view: your part, your monitor mix' },
  /* A whole shadow copy of the site, so someone can learn the rota planner
     without touching live data. Nothing points at it while the real tools
     are still being finished, so it is registered but hidden - `hidden`
     writes enabled:false, which keeps it off both the hub and the Where to?
     menu without losing the entry. Turn it back on when the rest is done. */
  { url: 'trainingportalhub.html', title: 'Training Portal', icon: '\u{1F4DA}', team: 'Core Team', hidden: true,
    description: 'Practice copies of the main tools' },
  /* EGBCWorship&AV.html was here and is not registered any more (17a). The
     hub does everything it did - its news (with "show until"), its banner,
     its welcome words and its team panels - so nothing in v2 should offer a
     second way in. Do not put it back.

     The file itself stays. The phone app still opens it until that app is
     updated, and no app is being retired. A hubPages row for it may still
     exist in the live database from before: it draws nothing now, and it is
     Martin's to delete from Administration, Pages. */
  { url: 'index.html', title: 'Availability Form', icon: '\u{1F4CB}', team: 'Core Team',
    description: 'The public form - this is the link to send out' },

  /* -- shipped in the hub package, never registered ------------------- */

  { url: 'resources.html', title: 'Team Resources', icon: '\u{1F4C1}', team: 'Worship Team', everyone: true,
    description: 'Documents and links for your teams' },
  { url: 'videos.html', title: 'Team Videos', icon: '\u{1F3AC}', team: 'Worship Team', everyone: true,
    description: 'Watch your team\'s videos, and search inside them' },
  { url: 'data-tools.html', title: 'Backup & Restore', icon: '\u{1F4BE}', team: 'Core Team', adminOnly: true,
    description: 'Take a copy of everything, or put one back' },
  { url: 'meeting.html', title: 'Meetings', icon: '\u{1F4F9}', team: 'Core Team', everyone: true,
    description: 'Video meetings - your upcoming calls and every meeting room' }
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
      bad.map(u => 'â€¢ ' + u).join('\n') +
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
           bad.map(u => 'â€¢ ' + u).join('\n') +
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
        enabled: !r.hidden
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

/* ---- My calendar (Step R) ------------------------------------------
   The rota, in a person's own calendar, kept up to date without another
   email. The link carries a long random key, which is the whole of what
   protects it - a calendar app cannot sign in - so this treats it as a
   password: it is fetched only when asked for, never put in the page source,
   and "Reset my calendar link" stops the old one working that moment.

   The link and the reset both come from the myCalendarLink function. The page
   never invents the key: if it could, it could point a key at somebody else.
*/
const FEED_BASE = location.hostname === 'localhost' || location.hostname === '127.0.0.1'
  ? 'http://localhost:5101/egbc-worship-planner/europe-west2/rotaFeed'
  : 'https://europe-west2-egbc-worship-planner.cloudfunctions.net/rotaFeed';

function renderCalendarRow() {
  const el = document.getElementById('panelCalendar');
  if (!el) return;
  /* Only somebody on a team has a rota to put in a calendar. EGBCAuth has no
     isActive(); the status lives on the profile, and that is what the rules
     read too. */
  const p = EGBCAuth.profile && EGBCAuth.profile();
  if (!EGBCAuth.user() || !p || p.status !== 'active' || !p.memberId) {
    el.innerHTML = '';
    return;
  }
  el.innerHTML = `
    <button class="switch-row" onclick="openMyCalendar()" style="width:100%">
      <i data-lucide="calendar-plus" style="width:16px;height:16px;flex:none"></i>
      <span style="flex:1;text-align:left">
        <span class="lbl">My rota</span><br>
        <span class="val">In your own calendar</span>
      </span>
      <i data-lucide="chevron-right" style="width:15px;height:15px"></i>
    </button>`;
  if (window.EGBCUI && EGBCUI.icons) EGBCUI.icons();
}

window.openMyCalendar = async function () {
  const box = document.getElementById('calendarModal');
  if (box) box.classList.add('on');
  const out = document.getElementById('calendarBody');
  if (out) out.innerHTML = '<p style="font-size:13px;color:var(--muted)">Looking up your links...</p>';
  try {
    /* 18: three feeds now, each with its own link. Which ones this person
       already has is asked for once, here - a link is made only when
       somebody asks for one, because every address that exists is an
       address that can get out. */
    await loadCalendarKeys();
    showCalendarChoices();
  } catch (e) {
    if (out) out.innerHTML = `<p style="font-size:13px;color:var(--danger)">${esc(calendarProblem(e))}</p>`;
  }
};

/* What went wrong, in words. Firebase's own messages are things like
   "internal" and "unauthenticated", which tell somebody standing in a church
   hall nothing at all. */
function calendarProblem(e) {
  const code = String((e && e.code) || '').replace(/^functions\//, '');
  if (code === 'unauthenticated') return 'Sign in again and then try this.';
  if (code === 'permission-denied') return 'Only someone on a team has a rota to put in a calendar.';
  if (code === 'failed-precondition') return (e && e.message) ||
    'Your account is not linked to the address book yet, so there is no rota to show.';
  return 'Could not get your link just now. Try again in a moment.';
}

/* London, and it has to be said out loud. The functions are deployed to
   europe-west2; the SDK, asked for none, uses us-central1 and calls a region
   with nothing in it. What comes back is the word "internal", which says
   nothing about what is wrong - and the hub showed the link as simply not
   arriving. */
const FUNCTIONS_REGION = 'europe-west2';

/* ---- WHICH FEED (NEXT-BRIEF 18) ------------------------------------

   Martin: "we need to let them choose. for example we need a feed for the
   whole family, or for the full rota if they prefer. Karen as an example
   needs to know if Oliver is on."

   Three choices in plain words. The full rota asks which team as well,
   because "the full rota" means something different to Karen than it does to
   a guitarist, and a link has to mean one thing for ever - so each team
   choice is its own link rather than a setting on one.

   The ids match FEEDS in functions/index.js. They are what is stored, so
   renaming one stops every link of that kind working. */
const CALENDAR_FEEDS = [
  { id: 'me', title: 'Just me',
    blurb: 'The services and meetings you are on. Nobody else is named in it.' },
  { id: 'household', title: 'My household',
    blurb: 'Everyone in your house, with who is doing what: "Oliver: Drums". ' +
           'It follows the household, so somebody joining or leaving changes it by itself.' },
  { id: 'full:worship', title: 'The full rota \u2014 Worship & AV', full: true,
    blurb: 'Every service, with the whole Worship and AV team on each one.' },
  { id: 'full:kids', title: 'The full rota \u2014 Kids Church', full: true,
    blurb: 'Every service, with the whole Kids Church team on each one.' },
  { id: 'full:all', title: 'The full rota \u2014 Everything', full: true,
    blurb: 'Every service, with everybody you are allowed to see on the rota.' }
];

/* Which links this person already has. Asked for once when the panel opens:
   a link is made only when somebody asks for one, because every address that
   exists is an address that can get out. */
let CALENDAR_KEYS = {};

function calendarFns() {
  const fns = (firebase && firebase.functions)
    ? firebase.app(EGBCAuth.app.name).functions(FUNCTIONS_REGION)
    : null;
  if (!fns) throw new Error('The calendar service is not loaded on this page.');
  if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
    try { fns.useEmulator('localhost', 5101); } catch (e) { /* already pointed there */ }
  }
  return fns;
}

async function askForCalendarLink(feedId, reset) {
  const res = await calendarFns().httpsCallable('myCalendarLink')({
    feed: feedId || 'me', reset: !!reset
  });
  const key = res && res.data && res.data.key;
  if (!key) throw new Error('No link came back.');
  return key;
}

async function loadCalendarKeys() {
  try {
    const res = await calendarFns().httpsCallable('myCalendarLinks')({});
    CALENDAR_KEYS = (res && res.data && res.data.feeds) || {};
  } catch (e) {
    /* Not knowing which links exist is not a reason to show nothing: every
       choice still offers to make one. */
    console.error('Could not read which calendar links exist', e);
    CALENDAR_KEYS = {};
  }
}

const calendarUrlFor = (key) => FEED_BASE + '?k=' + encodeURIComponent(key);

/* The whole panel: the three choices, and for each the buttons that matter
   once a link exists. */
function showCalendarChoices() {
  const out = document.getElementById('calendarBody');
  if (!out) return;

  out.innerHTML = `
    <p style="font-size:13px;color:var(--body);line-height:1.6;margin-bottom:16px">
      Add one of these once and it stays up to date in your calendar. When the
      rota changes, your calendar follows, with no new email.
    </p>
    ${CALENDAR_FEEDS.map(f => calendarChoiceRow(f)).join('')}
    <p style="font-size:12px;color:var(--muted);line-height:1.6;margin-top:16px">
      Treat these addresses like passwords: anyone who has one can see that
      rota. Each has its own link, so resetting one leaves the others working.
    </p>`;
  if (window.EGBCUI && EGBCUI.icons) EGBCUI.icons();
}

function calendarChoiceRow(f) {
  const I = (n, s) => `<i data-lucide="${n}" style="width:${s || 15}px;height:${s || 15}px"></i>`;
  const key = CALENDAR_KEYS[f.id];
  const url = key ? calendarUrlFor(key) : '';
  /* webcal:// is what makes Apple and Outlook offer to subscribe rather than
     download the file once. Google wants the https address. */
  const webcal = url.replace(/^https?:\/\//, 'webcal://');
  const google = 'https://calendar.google.com/calendar/r?cid=' + encodeURIComponent(webcal);

  return `<div style="border:1px solid var(--line);border-radius:12px;padding:14px 16px;margin-bottom:10px">
    <div style="font-size:14px;font-weight:600;color:var(--ink)">${esc(f.title)}</div>
    <div style="font-size:12px;color:var(--muted);line-height:1.55;margin:3px 0 10px">${esc(f.blurb)}</div>
    ${!key ? `<button class="btn sm solid" onclick="makeCalendarLink('${f.id}')">${I('plus')} Add to my calendar</button>`
    : `<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px">
        <a class="btn sm" href="${esc(google)}" target="_blank" rel="noopener">${I('calendar')} Google</a>
        <a class="btn sm" href="${esc(webcal)}">${I('apple')} Apple / iPhone</a>
        <a class="btn sm" href="${esc(webcal)}">${I('mail')} Outlook</a>
      </div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">
        <input readonly value="${esc(url)}" id="calurl-${esc(f.id)}"
               style="flex:1;min-width:150px;font-size:12px;padding:6px 8px;border:1px solid var(--hairline-strong);border-radius:8px">
        <button class="btn sm" onclick="copyCalendarUrl('${f.id}')">${I('copy')} Copy link</button>
        <button class="btn sm" style="color:var(--danger)" onclick="resetCalendarLink('${f.id}')">${I('rotate-ccw')} Reset this link</button>
      </div>`}
  </div>`;
}

window.makeCalendarLink = async function (feedId) {
  const out = document.getElementById('calendarBody');
  if (out) out.innerHTML = '<p style="font-size:13px;color:var(--muted)">Making your link\u2026</p>';
  try {
    CALENDAR_KEYS[feedId] = await askForCalendarLink(feedId, false);
    showCalendarChoices();
  } catch (e) {
    if (out) out.innerHTML = `<p style="font-size:13px;color:var(--danger)">${esc(calendarProblem(e))}</p>
      <button class="btn sm" style="margin-top:10px" onclick="openMyCalendar()">Back</button>`;
  }
};

window.resetCalendarLink = async function (feedId) {
  const f = CALENDAR_FEEDS.find(x => x.id === feedId) || { title: 'this' };
  /* Said plainly, because no server can reach into somebody's phone: the old
     address stops working at once, but entries already downloaded stay until
     they remove the old subscription themselves. */
  if (!confirm('Reset the link for "' + f.title + '"?\n\n' +
               'The old address stops working straight away. Anything already in your ' +
               'calendar from it stays there until you remove that subscription on your ' +
               'phone or computer, and add the new one.\n\nYour other calendar links ' +
               'are not affected.')) return;
  const out = document.getElementById('calendarBody');
  if (out) out.innerHTML = '<p style="font-size:13px;color:var(--muted)">Making a new link\u2026</p>';
  try {
    CALENDAR_KEYS[feedId] = await askForCalendarLink(feedId, true);
    showCalendarChoices();
  } catch (e) {
    if (out) out.innerHTML = `<p style="font-size:13px;color:var(--danger)">${esc(calendarProblem(e))}</p>
      <button class="btn sm" style="margin-top:10px" onclick="openMyCalendar()">Back</button>`;
  }
};

window.copyCalendarUrl = function (feedId) {
  const i = document.getElementById('calurl-' + feedId);
  if (!i) return;
  i.select();
  navigator.clipboard.writeText(i.value).catch(() => document.execCommand('copy'));
};


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
      ? `<button class="switch-row" onclick="openTeamPicker()">
           <span style="width:10px;height:10px;border-radius:50%;background:${c.colour};flex-shrink:0;margin:0 2px"></span>
           <span style="flex:1">
             <span class="lbl">Team</span><br>
             <span class="val">${esc(c.label)}</span>
           </span>
           <span style="display:inline-flex;align-items:center;gap:4px;font-size:13px;font-weight:500;color:var(--brand)">Switch<i data-lucide="chevron-right" style="width:15px;height:15px"></i></span>
         </button>`
      : '';
  }

  const bd = document.getElementById('panelBuild');
  if (bd) bd.textContent = `build ${HUB_BUILD}`;

  renderCalendarRow();

  const q = (document.getElementById('toolSearch').value || '').toLowerCase();

  /* ONE MENU, DRAWN ONE WAY. The markup and the look are in egbc-menu.js and
     egbc-shell.js draws from the same function, so the Menu is the same here
     as it is on every other page. It used not to be: this panel drew the
     structure Martin approved while the shell built its own groups out of the
     registry, and he found the difference on the live site.

     The registry still decides what is switched ON. It does not decide where
     anything sits - that is the structure, and the structure is the file. */
  const registry = {};
  PAGES.forEach(p => { if (p.url) registry[String(p.url).toLowerCase()] = p; });

  EGBCMenu.paint(document.getElementById('toolList'), {
    who: EGBCMenu.who(),
    query: q,
    here: (location.pathname.split('/').pop() || '').toLowerCase(),
    switchedOff: (url) => {
      const p = registry[String(url || '').toLowerCase()];
      return !!(p && p.enabled === false);
    }
  });
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
          <div style="font-size:13px;font-weight:600;color:var(--ink)">${n.pinned ? '&#9733; ' : ''}${esc(n.title)}</div>
          <div style="font-size:12px;color:var(--faint);font-weight:600;margin-top:2px">
            ${(n.teams || []).length ? esc(n.teams.join(', ')) : 'Everyone'} &middot; ${(n.date ? esc(n.date) : when(n.createdAt))}
            ${n.requireAck ? ` &middot; ${acks} confirmed` : ''}
            ${n.until ? (isNewsExpired(n)
              ? ` &middot; <span style="color:#b0392c">Expired ${esc(n.until)} (hidden)</span>`
              : ` &middot; Showing until ${esc(n.until)}`) : ''}
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
  list.innerHTML='<div class="text-sm opacity-50 italic py-4">Loadingâ€¦</div>';
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
    banner.querySelector('span').textContent=bits.join(' Â· ')+'.';
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
          <option value="">Choose a personâ€¦</option>
          ${BOOK.map(m=>`<option value="${m.id}">${esc(m.name||'(no name)')}${Array.isArray(m.markers)&&m.markers.includes('Core Team')?' [ADMIN]':''}${m.email?' â€” '+esc(m.email):''}</option>`).join('')}
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
      : 'Nothing registered - the menu will be empty.';
  }
  const mine=PAGES.filter(p=>teams.includes(p.team));
  if(!mine.length){list.innerHTML='<div class="empty"><div class="t">Nothing registered yet</div><div style="font-size:12px;font-weight:600;margin-top:6px">Use <strong>Bring across the old menu</strong> to start from the menu people already know.</div></div>';return;}
  list.innerHTML=mine.map(p=>{
    const cfg=EGBCAuth.TEAMS[p.team]||{label:p.team,colour:'#3d6263'};
    /* Say who sees it and why it might not be a tile, so an entry that looks
       missing from the menu explains itself here. */
    const seen = p.everyone ? 'everyone'
      : (Array.isArray(p.teams) && p.teams.length>1
          ? p.teams.map(t=>(EGBCAuth.TEAMS[t]||{label:t}).label).join(' + ')
          : cfg.label);
    const why = p.helpFor ? ` Â· help for ${p.helpFor}`
      : (isCharterPage(p.url) ? ' Â· on the landing page'
      : (MOBILE_APPS.includes((p.url||'').toLowerCase()) ? ' Â· phone app' : ''));
    return `<div class="flex items-center gap-3 flex-wrap bg-[#f0f6f6] rounded-[1rem] px-5 py-3 border border-[#dde7e6] ${p.enabled===false?'opacity-50':''}">
      <span class="text-lg">${esc(p.icon||'ðŸ“„')}</span>
      <div class="flex-grow min-w-0">
        <div class="font-bold text-sm truncate">${esc(p.title)}</div>
        <div class="text-[10px] opacity-50">${esc(p.url)} Â· ${esc(seen)}${p.adminOnly?' Â· admin only':''}${esc(why)}${p.enabled===false?' Â· hidden':''}</div>
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
    icon:document.getElementById('pgIcon').value.trim()||'ðŸ“„',
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
  list.innerHTML='<div class="text-sm opacity-50 italic py-4">Loadingâ€¦</div>';
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
  sel.innerHTML='<option value="">Choose a young personâ€¦</option>'+people.map(m=>{
    const p=parentFor(m);
    return `<option value="${m.id}"${p?'':' disabled'}>${esc(m.name||'(no name)')}${p?'':' â€” no parent email'}</option>`;
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
        <div class="text-[10px] opacity-50">${g.redeemedAt?'Used':'Sent'} Â· to ${esc(g.sentTo||'')}</div>
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
    <p style="font-size:12px;font-weight:600;color:#3d6263;margin:0 0 18px">Esher Green Baptist Church</p>
    <p style="font-size:15px;color:#3a4d4c;line-height:1.6">Hi${parentName?' '+esc(parentName):''},</p>
    <p style="font-size:15px;color:#3a4d4c;line-height:1.6">Here is an access code so ${esc(name)} can use the Youth Hub on their phone. It works once, on one device, and lasts six weeks - we will send a new one after that.</p>
    <div style="background:#f0f6f6;border:1px solid #dde7e6;border-radius:16px;padding:24px;text-align:center;margin:24px 0">
      <div style="font-size:12px;font-weight:600;color:#6b8281;margin-bottom:10px">Access code</div>
      <div style="font-size:26px;font-weight:600;color:#14201f">${code}</div>
    </div>
    <p style="text-align:center;margin:24px 0">
      <a href="https://esherchurch.github.io/availability-form/v2/youth-access.html" style="background:#5f7a4a;color:#fff;padding:14px 32px;border-radius:8px;font-size:12px;font-weight:600;text-decoration:none">Enter the code</a>
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

  const btn=document.getElementById('sendCodeBtn');btn.disabled=true;btn.textContent='Sendingâ€¦';
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
        <span style="font-size:12px;font-weight:600;color:var(--gold-ink)"></span>
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
          What appears in the menu, and who sees it.
          <span id="pagesCount" style="display:block;margin-top:4px;font-weight:600"></span>
        </p>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn solid" id="btnSeed" onclick="seedRegistry()">Add the missing pages</button>
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
          <span style="font-size:12px;font-weight:600;color:var(--muted)">Admins only</span>
        </label>
        <label style="display:flex;gap:9px;align-items:center;cursor:pointer;margin-bottom:14px">
          <input type="checkbox" id="pgEnabled" checked style="width:16px;height:16px;accent-color:var(--brand)">
          <span style="font-size:12px;font-weight:600;color:var(--muted)">Visible</span>
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
        <div style="font-size:12px;font-weight:600;color:var(--gold-ink);margin-bottom:9px"></div>
        <button class="btn gold" onclick="renewExpiring()">Send renewals</button>
      </div>
      <div style="background:var(--surface-2);border:1px solid var(--line);border-radius:16px;padding:17px;margin-bottom:18px">
        <div class="lab">Send a code</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <select id="youthWho" class="fld" style="flex:1;min-width:210px;margin:0"></select>
          <button class="btn solid" id="sendCodeBtn" onclick="sendCode()">Send</button>
        </div>
        <div id="youthTo" style="font-size:12px;color:var(--muted);margin-top:10px;font-weight:600"></div>
      </div>
      <div id="youthList"></div>`;
  }
  loadYouth();
}
