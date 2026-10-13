/* ===================================================================
   EGBC — the Sunday Service Planner, on a phone
   ===================================================================

   APP-DESIGN-BRIEF §7b. Martin, 10 Oct 2026: "why isnt there a core team
   area in the phone app? They will be doing the sunday service plans from
   the phone app. Look at the current core team phone app!"

   MOVED, NOT COPIED, AND NOT REWRITTEN. This is CoreTeamApp.html's own
   service planner - spInit and everything it calls - lifted out of that
   page unchanged, so that the installed Core Team app and the new phone
   app run THE SAME CODE. §7b says so in those words, and the reason is
   plain: two copies is how a fix looks finished and is not. A song search
   corrected in one of them would quietly stay wrong in the other, and
   nobody would know which one the person in front of you was using.

   WHAT CHANGED IN THE MOVE, and nothing else did:
     - db, toast and loader come from the host rather than from
       CoreTeamApp's globals, because the new app has its own.
     - spAutoFit measured '#screen-service textarea', which is an id in
       CoreTeamApp's markup. It measures inside the mounted root now.
     - personName, personId and isWorshipRole came with it. CoreTeamApp
       uses them in its rota code too, so it takes them back from here
       rather than keeping a second definition.
   The sp* functions still go on window, because the markup this builds
   carries inline onclick handlers and those look for them there. That is
   how the planner already worked; changing it would be a rewrite.

   HOW TO USE IT. One host per page:

     EGBCCorePlanner.mount({
       into: someElement,          // the planner's markup goes in here
       db: EGBCAuth.db,            // optional, defaults to EGBCAuth.db
       toast: fn, loader: fn       // optional
     });

   mount() is safe to call again on the same element - it leaves what is
   on screen alone and simply re-runs spInit, which is what happens every
   time somebody comes back to the tab.

   NEEDS, loaded before it: firebase compat, egbc-auth.js, and Sortable
   (the drag handle). Without Sortable the planner still works; the order
   is then changed by removing and re-adding, which is what CoreTeamApp
   did whenever the CDN was slow.
   =================================================================== */

(function (global) {
  'use strict';

  /* ---- the planner's own styles, from CoreTeamApp's <style> ----------
     Kept as one string and written once per page, so the two hosts
     cannot drift apart on spacing either. The colours are var()s that
     both pages define: --teal/--brand, --bg, --border, --white, --font.
     The app defines the aliases this needs beside its own tokens. */
  var CSS = [
    '.sp-input{width:100%;background:var(--bg);border:1px solid var(--border);border-radius:10px;',
    'padding:10px 12px;font-family:var(--font);font-size:14px;font-weight:600;color:var(--teal);outline:none}',
    '.sp-input:focus{border-color:var(--teal);box-shadow:0 0 0 3px rgba(61,98,99,.28)}',
    '.sp-top{padding:12px;display:flex;flex-direction:column;gap:10px;background:var(--white);',
    'border-bottom:1px solid var(--border)}',
    '.sp-date-row{display:flex;gap:8px}',
    '.sp-date-row input,.sp-date-row select{flex:1;min-width:0}',
    '.sp-leader{font-size:13px;font-weight:600;color:var(--teal);opacity:.6;padding:0 2px}',
    '.sp-leader span{font-weight:600;opacity:1}',
    '.sp-section-header{display:flex;align-items:center;justify-content:space-between;',
    'padding:14px 12px 8px;flex-wrap:wrap;gap:8px}',
    '.sp-section-header h2{font-size:15px;font-weight:600;color:var(--teal);margin:0}',
    '.sp-btn-row{display:flex;gap:6px;flex-wrap:wrap}',
    '.sp-btn{padding:10px 14px;border-radius:12px;font-family:var(--font);font-size:12px;font-weight:600;',
    'cursor:pointer;border:1px solid var(--border);background:var(--teal-light);color:var(--teal);',
    'text-decoration:none;display:inline-flex;align-items:center;min-height:44px}',
    '.song-block{background:var(--white);border:1px solid var(--border);border-radius:1.5rem;margin:0 12px 10px}',
    '.song-block-header{display:flex;align-items:center;gap:8px;padding:12px 14px}',
    '.sp-drag-handle{cursor:grab;color:var(--border);font-size:1.2rem;display:flex;align-items:center;',
    'flex-shrink:0;touch-action:none}',
    '.sp-song-number{font-size:13px;font-weight:600;color:var(--muted);white-space:nowrap;min-width:48px}',
    '.sp-title-wrap{flex:1;position:relative;min-width:0}',
    '.song-title{width:100%;background:var(--bg);border:1px solid var(--border);border-radius:.5rem;',
    'padding:8px 10px;font-family:var(--font);font-weight:600;font-size:13px;color:var(--teal);outline:none}',
    '.song-title:focus{border-color:var(--teal)}',
    '.sp-suggest-box{position:absolute;top:100%;left:0;right:0;background:var(--white);',
    'border:1px solid var(--border);border-radius:.75rem;box-shadow:0 8px 24px rgba(61,98,99,.15);',
    'z-index:300;overflow:hidden;margin-top:2px;display:none}',
    '.sp-suggest-item{padding:12px 14px;font-size:13px;font-weight:600;color:var(--teal);cursor:pointer;',
    'border-bottom:1px solid var(--bg)}',
    '.sp-suggest-item:last-child{border-bottom:none}',
    '.sp-suggest-item:hover{background:var(--bg)}',
    '.sp-collapse-btn{width:44px;height:44px;border:none;background:none;font-size:13px;color:var(--teal);',
    'cursor:pointer;border-radius:50%;display:flex;align-items:center;justify-content:center;',
    'flex-shrink:0;transition:transform .2s}',
    '.is-collapsed .sp-collapse-btn{transform:rotate(-90deg)}',
    '.sp-remove-btn{width:44px;height:44px;border:none;background:none;font-size:1.3rem;color:var(--border);',
    'cursor:pointer;border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0}',
    '.sp-remove-btn:hover{color:#b22222}',
    '.song-content{padding:0 14px 14px;border-top:1px solid var(--bg)}',
    '.song-content.hidden{display:none}',
    '.sp-keys-row{display:flex;gap:6px;margin-top:10px}',
    '.song-key{flex:1;min-width:0;font-size:12px;padding:10px 6px;background:var(--bg);',
    'border:1px solid var(--border);border-radius:8px;font-family:var(--font);font-weight:600;',
    'color:var(--teal);outline:none}',
    '.song-note{margin-top:8px;width:100%;background:var(--white);border:1px solid var(--border);',
    'border-radius:.75rem;padding:.75rem 1rem;font-family:var(--font);font-weight:600;color:var(--teal);',
    'outline:none;font-size:14px;resize:none;overflow:hidden}',
    '.song-note:focus{border-color:var(--teal)}',
    '.sp-key-info{margin-top:8px;padding:8px 10px;background:var(--bg);border-radius:8px;font-size:13px;',
    'font-weight:600;color:var(--teal);line-height:1.5}',
    '.sp-files-box{margin-top:8px;padding:10px 12px;background:var(--bg);border-radius:10px;font-size:13px}',
    '.sp-files-box a{display:inline-block;background:var(--teal);color:#fff;padding:8px 12px;',
    'border-radius:6px;font-size:13px;font-weight:600;text-decoration:none;margin:2px 2px 0 0}',
    '.sp-serve-badge{display:inline-flex;align-items:center;justify-content:center;min-width:2rem;',
    'height:2rem;border-radius:999px;font-size:12px;font-weight:600;padding:0 .5rem;',
    'background:var(--teal-light);color:var(--teal);border:1px solid var(--border);flex-shrink:0}',
    '.sp-serve-badge.is-peak{background:var(--teal);color:#fff;border-color:var(--teal)}',
    '.sp-serve-badge.hidden-badge{visibility:hidden}',
    '.item-block{background:var(--bg);border:1px solid transparent;border-radius:1rem;margin:0 12px 8px;',
    'display:flex;align-items:center;gap:8px;padding:12px 14px}',
    '.item-block:hover{border-color:var(--border)}',
    '.item-title{flex:1;background:transparent;border:none;font-family:var(--font);font-weight:600;',
    'font-size:15px;color:var(--teal);outline:none;min-width:0}',
    '.sp-rota-table{width:100%;border-collapse:collapse}',
    '.sp-rota-table th{text-align:left;padding:8px 12px;font-size:13px;color:var(--muted);',
    'font-weight:600;border-bottom:1px solid var(--border)}',
    '.sp-rota-table td{padding:10px 12px;font-size:13px;font-weight:600;color:var(--body);',
    'border-bottom:1px solid var(--border)}',
    '.sp-rota-table td:first-child{font-weight:600;color:var(--teal)}',
    '.sp-rota-table textarea{width:100%;background:var(--bg);border:1px solid var(--border);',
    'border-radius:8px;padding:6px 8px;font-family:var(--font);font-size:12px;font-weight:600;',
    'color:var(--teal);outline:none;resize:none;overflow:hidden}',
    '.sp-actions{display:flex;gap:10px;padding:16px 12px;flex-wrap:wrap}',
    '.sp-actions button{flex:1;min-width:120px;padding:14px;border:none;border-radius:12px;',
    'font-family:var(--font);font-size:14px;font-weight:600;cursor:pointer;min-height:48px}'
  ].join('');

  /* ---- the planner's markup, from CoreTeamApp's #screen-service ------
     The outer .screen div is the HOST's, not this module's: in
     CoreTeamApp it is a screen, in the app it is a tab. Everything
     inside is the same. */
  var HTML = ''
    + '<div class="sp-top">'
    +   '<div class="sp-date-row">'
    +     '<input type="date" id="spDate" onchange="spLoadRota()" class="sp-input">'
    +     '<select id="spEventSelect" onchange="spSelectEvent()" class="sp-input">'
    +       '<option value="">Select Service…</option>'
    +     '</select>'
    +   '</div>'
    +   '<input id="spTypeNotes" class="sp-input" placeholder="General Notes">'
    +   '<div class="sp-leader">Leader: <span id="spLeaderName">None</span></div>'
    + '</div>'
    + '<div style="padding:10px 12px 0;">'
    +   '<textarea id="spIntro" class="sp-input" placeholder="Opening remarks (appears in team email)…" rows="2"></textarea>'
    + '</div>'
    + '<div class="sp-section-header">'
    +   '<h2>Order of Service</h2>'
    +   '<div class="sp-btn-row">'
    +     '<button class="sp-btn" onclick="spAddSong()">+ Song</button>'
    +     '<button class="sp-btn" onclick="spAddItem()">+ Item</button>'
    +     '<a href="sundayplannersonglibrary.html" target="_blank" class="sp-btn">Songs DB</a>'
    +   '</div>'
    + '</div>'
    + '<div id="sp-order"></div>'
    + '<div style="padding:0 12px;">'
    +   '<div style="background:var(--white);border-radius:16px;border:1px solid var(--border);padding:16px;margin-bottom:12px;">'
    +     '<div style="font-size:13px;font-weight:600;color:var(--teal);margin-bottom:12px;">Service Team &amp; Roles</div>'
    +     '<div style="overflow-x:auto;">'
    +       '<table class="sp-rota-table">'
    +         '<thead><tr><th>Role</th><th>Person</th><th>Notes</th></tr></thead>'
    +         '<tbody id="spTeamBody"></tbody>'
    +       '</table>'
    +     '</div>'
    +   '</div>'
    +   '<textarea id="spOutro" class="sp-input" placeholder="Closing remarks (appears at end of team email)…" rows="2" style="margin-bottom:12px;"></textarea>'
    +   '<div class="sp-actions">'
    +     '<button onclick="spSave()" style="background:var(--teal);color:white;">Save</button>'
    +     '<input id="spSenderEmail" type="email" placeholder="Your email..." style="border:1px solid var(--border);border-radius:8px;padding:10px 12px;font-size:12px;font-weight:500;color:var(--teal);font-family:var(--font);outline:none;margin-bottom:6px;width:100%;min-height:44px" oninput="localStorage.setItem(\'egbc-sender-email\',this.value)">'
    +     '<button onclick="spEmail()" style="background:var(--bg);color:var(--teal);border:1.5px solid var(--border);">Email Team</button>'
    +   '</div>'
    + '</div>';

  /* ---- the host ------------------------------------------------------
     One per page. db, toast and loader were CoreTeamApp's globals; the
     app has its own, so they are handed in. The fallbacks are there so a
     page that passes nothing still works rather than throwing from
     inside a save. */
  var H = {
    root: null,
    db: null,
    toast: function (m) { try { console.log('[planner] ' + m); } catch (e) {} },
    loader: function () {}
  };
  function db() { return H.db || (global.EGBCAuth && EGBCAuth.db); }
  function toast(m) { H.toast(m); }
  function loader(show, msg) { H.loader(show, msg); }

  /* ---- helpers that came with it -------------------------------------
     CoreTeamApp's rota code uses these too, so it takes them from here
     rather than keeping a second copy that could drift. */
  var personName = function (raw) {
    return Array.isArray(raw) ? raw.map(function (p) { return p.name; }).join(', ')
                              : ((raw && raw.name) || '');
  };
  var personId = function (raw) {
    return Array.isArray(raw) ? ((raw[0] && raw[0].id) || '') : ((raw && raw.id) || '');
  };
  var isWorshipRole = function (r) {
    if (typeof global.EGBCAuth !== 'undefined' && EGBCAuth.roleTeam) {
      return EGBCAuth.roleTeam(r) !== 'Kids Church';
    }
    return !(r === 'Session Leader' || r.indexOf('Helper ') === 0
             || r.indexOf('Leader (') === 0 || r.indexOf('Assistant (') === 0);
  };

  /* ══ SERVICE PLANNER ══ verbatim from CoreTeamApp.html ══════════════ */

  var SP_ALL_KEYS = ["Ab","A","Am","A#","A#m","Bb","B","Bm","C","Cm","C#","C#m","Db","D","Dm","D#","D#m","Eb","E","Em","F","Fm","F#","F#m","Gb","G","Gm","G#","G#m"];
  var spEventsForDay = [];
  var spLeader = '';
  var spAddressBook = [];
  var _spSortableInit = false;
  var _spDefaultLoaded = false;
  var _spInputWired = false;
  /* The planner's markup, built once and moved between hosts - see mount(). */
  var PANEL = null;

  function spInit() {
    var order = document.getElementById('sp-order');
    if (!order) return;
    if (!_spSortableInit && typeof global.Sortable !== 'undefined') {
      global.Sortable.create(order, {
        animation: 150, handle: '.sp-drag-handle',
        onEnd: function () { spUpdateNumbers(); }
      });
      _spSortableInit = true;
    }
    /* Wired ONCE, not on every visit to the tab. In CoreTeamApp spInit
       ran on each showScreen('service') and added another listener each
       time, so the longer somebody stayed in the app the more times a
       keystroke re-measured the box. Harmless there and worse in a tab
       bar, where coming back is one tap. */
    if (!_spInputWired) {
      order.addEventListener('input', function (e) {
        if (e.target.tagName.toLowerCase() === 'textarea') spAutoFit();
      });
      _spInputWired = true;
    }
    /* OPEN ON THE COMING SUNDAY (Martin, 11 Oct 2026). It opened on a
       blank date, so the first thing anybody did was pick the date they
       were always going to pick. The planner is for this Sunday far more
       often than for any other day.
       In the module rather than in either host, so the Core Team app and
       the phone app open the same way - which is the whole reason the
       planner lives here. */
    if (!_spDefaultLoaded) {
      _spDefaultLoaded = true;
      var dateBox = document.getElementById('spDate');
      if (dateBox && !dateBox.value) {
        dateBox.value = comingSunday();
        /* And the service on it, IF THERE IS EXACTLY ONE. Two means a
           choice - a morning service and an evening one, say - and
           choosing for somebody is how you plan the wrong service
           without noticing. */
        spLoadRota().then(function () {
          var sel = document.getElementById('spEventSelect');
          if (sel && sel.options.length === 2) {
            sel.value = sel.options[1].value;
            return spSelectEvent();
          }
          /* Nothing on the rota that day, or more than one: the default
             order, as before. */
          spSetupDefaultOrder();
          spAutoFit();
        }).catch(function () { spSetupDefaultOrder(); spAutoFit(); });
        return;
      }
      // Pre-populate default order on first open, exactly like the desktop planner
      spSetupDefaultOrder();
      spAutoFit();
    }
  }

  /* The next Sunday, or today when today IS Sunday - a plan is most often
     worked on during the week before, and on the morning itself. Local
     time throughout: new Date() is the phone's own day, and the date box
     wants yyyy-mm-dd in that same day, so toISOString() (which is UTC)
     would hand somebody in a British summer evening the day before. */
  function comingSunday() {
    var d = new Date();
    d.setHours(12, 0, 0, 0);
    while (d.getDay() !== 0) d.setDate(d.getDate() + 1);
    var m = String(d.getMonth() + 1), day = String(d.getDate());
    return d.getFullYear() + '-' + (m.length < 2 ? '0' + m : m)
                           + '-' + (day.length < 2 ? '0' + day : day);
  }

  function spSetupDefaultOrder() {
    spAddSong(); spAddSong(); spAddSong();
    spAddItem('Welcome and Notices');
    spAddSong();
    spAddItem('Message');
    spAddSong(); spAddSong(); spAddSong();
  }

  function spAutoFit() {
    /* Scoped to the mounted root. It said '#screen-service textarea',
       which is an id that exists only in CoreTeamApp. */
    var root = H.root || document;
    root.querySelectorAll('textarea').forEach(function (t) {
      t.style.height = 'auto'; t.style.height = t.scrollHeight + 'px';
    });
  }

  function spUpdateNumbers() {
    document.querySelectorAll('#sp-order .song-block').forEach(function (b, i) {
      var lbl = b.querySelector('.sp-song-number');
      if (lbl) lbl.textContent = 'Song ' + (i + 1);
    });
  }

  function spToggle(btn) {
    var block = btn.closest('.song-block');
    var content = block.querySelector('.song-content');
    block.classList.toggle('is-collapsed');
    content.classList.toggle('hidden');
    btn.textContent = content.classList.contains('hidden') ? '<i data-lucide=\'chevron-right\' style=\'width:14px;height:14px\'></i>' : '<i data-lucide=\'chevron-down\' style=\'width:14px;height:14px\'></i>';
    if (!content.classList.contains('hidden')) spAutoFit();
  }

  function spAddSong() {
    var container = document.getElementById('sp-order');
    var id = Math.random().toString(36).substr(2, 9);
    var isFirst = container.querySelectorAll('.song-block').length === 0;
    var div = document.createElement('div');
    div.className = 'service-block song-block' + (isFirst ? '' : ' is-collapsed');
    div.innerHTML = ''
      + '<div class="song-block-header">'
      +   '<div class="sp-drag-handle">⠿</div>'
      +   '<button onclick="spToggle(this)" class="sp-collapse-btn">' + (isFirst ? '<i data-lucide=\'chevron-down\' style=\'width:14px;height:14px\'></i>' : '<i data-lucide=\'chevron-right\' style=\'width:14px;height:14px\'></i>') + '</button>'
      +   '<span class="sp-song-number">Song</span>'
      +   '<div class="sp-title-wrap">'
      +     '<input class="song-title" oninput="spSearch(this,\'' + id + '\')" placeholder="Song title">'
      +     '<div id="sp-suggest-' + id + '" class="sp-suggest-box"></div>'
      +   '</div>'
      +   '<div id="sp-serve-' + id + '" class="sp-serve-badge hidden-badge"></div>'
      +   '<button onclick="this.closest(\'.song-block\').remove();spUpdateNumbers();" class="sp-remove-btn">&times;</button>'
      + '</div>'
      + '<div class="song-content ' + (isFirst ? '' : 'hidden') + '">'
      +   '<div class="sp-keys-row">'
      +     '<select onchange="spKeyChanged(\'' + id + '\')" class="song-key"><option value="">Key 1</option>' + SP_ALL_KEYS.map(function (k) { return '<option>' + k + '</option>'; }).join('') + '</select>'
      +     '<select onchange="spKeyChanged(\'' + id + '\')" class="song-key"><option value="">Key 2</option>' + SP_ALL_KEYS.map(function (k) { return '<option>' + k + '</option>'; }).join('') + '</select>'
      +     '<select onchange="spKeyChanged(\'' + id + '\')" class="song-key"><option value="">Key 3</option>' + SP_ALL_KEYS.map(function (k) { return '<option>' + k + '</option>'; }).join('') + '</select>'
      +   '</div>'
      +   '<textarea class="song-note" placeholder="Notes for the band..." rows="1"></textarea>'
      +   '<div id="sp-keyinfo-' + id + '" class="sp-key-info" style="display:none;"></div>'
      +   '<div id="sp-files-' + id + '"></div>'
      + '</div>';
    container.appendChild(div);
    spUpdateNumbers();
    return id;
  }

  function spAddItem(val) {
    val = typeof val === 'string' ? val : '';
    var div = document.createElement('div');
    div.className = 'service-block item-block';
    div.innerHTML = ''
      + '<div class="sp-drag-handle">⠿</div>'
      + '<div style="width:28px;"></div>'
      + '<input value="' + String(val).replace(/"/g, '&quot;') + '" class="item-title" placeholder="Service Item Name...">'
      + '<button onclick="this.parentElement.remove()" class="sp-remove-btn">&times;</button>';
    document.getElementById('sp-order').appendChild(div);
  }

  async function spShowKeyInfo(id, title) {
    if (!title) return;
    var docId = title.toLowerCase().replace(/\s+/g, '-');
    var snap = await db().collection('songs').doc(docId).get();
    if (!snap.exists) return;
    var data = snap.data();
    var chordKeys = (data.files || []).filter(function (f) { return f.type === 'Chord Sheet' && f.key; }).map(function (f) { return f.key; });
    var unique = [...new Set(chordKeys)];
    var missing = SP_ALL_KEYS.filter(function (k) { return !unique.includes(k); });
    var box = document.getElementById('sp-keyinfo-' + id);
    if (!box) return;
    box.style.display = 'block';
    box.innerHTML = '<span style="font-weight:600;color:var(--teal);">Available:</span> ' + (unique.sort().join(', ') || 'None') + ' &nbsp;·&nbsp; <span style="font-weight:600;color:#b22222;">Missing:</span> <span style="opacity:0.6;">' + missing.join(', ') + '</span>';
    var sundayHistory = (data.servingHistory || []).filter(function (s) { return s.day && s.day.toLowerCase() === 'sunday'; });
    var badge = document.getElementById('sp-serve-' + id);
    if (sundayHistory.length) {
      var counts = sundayHistory.map(function (s) { return s.count || 0; });
      var latest = sundayHistory[0].count || 0;
      var max = Math.max.apply(null, counts);
      badge.textContent = latest;
      badge.classList.remove('hidden-badge');
      latest === max ? badge.classList.add('is-peak') : badge.classList.remove('is-peak');
    } else { badge.textContent = ''; badge.classList.add('hidden-badge'); }
  }

  async function spSearch(input, id) {
    var val = input.value.toLowerCase().trim();
    var box = document.getElementById('sp-suggest-' + id);
    if (val.length < 2) { box.style.display = 'none'; return; }
    var snap = await db().collection('songs').get();
    var words = val.split(' ');
    var matches = snap.docs.map(function (d) { return d.data(); }).filter(function (s) {
      var t = (s.title || '').toLowerCase();
      var n = (s.normalized || '').toLowerCase();
      return words.every(function (w) { return t.includes(w) || n.includes(w); });
    }).slice(0, 10);
    if (!matches.length) {
      var enc = encodeURIComponent(input.value);
      box.innerHTML = '<div class="sp-suggest-item" style="color:#b22222;">Not in library</div>'
        + '<div style="padding:8px 14px;font-size:13px;display:flex;gap:12px;background:var(--white);">'
        + '<a href="https://songselect.ccli.com/search/results?search=' + enc + '" target="_blank" style="color:var(--teal);font-weight:500;"><i data-lucide="search" style="width:14px;height:14px"></i> SongSelect</a>'
        + '<a href="https://www.youtube.com/results?search_query=' + enc + '" target="_blank" style="color:var(--teal);font-weight:600;"><i data-lucide="play" style="width:14px;height:14px"></i> YouTube</a>'
        + '</div>';
    } else {
      box.innerHTML = matches.map(function (s) {
        return '<div class="sp-suggest-item" onclick="spSelectSong(\'' + s.title.replace(/'/g, "\\'") + '\',\'' + id + '\')">' + s.title + '</div>';
      }).join('');
    }
    box.style.display = 'block';
  }

  async function spSelectSong(title, id) {
    var block = document.getElementById('sp-suggest-' + id).closest('.song-block');
    block.querySelector('.song-title').value = title;
    document.getElementById('sp-suggest-' + id).style.display = 'none';
    document.getElementById('sp-keyinfo-' + id).style.display = 'none';
    document.getElementById('sp-files-' + id).innerHTML = '';
    await spShowKeyInfo(id, title);
    spKeyChanged(id);
  }

  async function spKeyChanged(id) {
    var block = document.getElementById('sp-files-' + id).closest('.song-block');
    var title = block.querySelector('.song-title').value;
    var keys = Array.from(block.querySelectorAll('.song-key')).map(function (s) { return s.value; }).filter(function (v) { return v; });
    var container = document.getElementById('sp-files-' + id);
    if (!title) { container.innerHTML = ''; return; }
    var docId = title.toLowerCase().replace(/\s+/g, '-');
    var snap = await db().collection('songs').doc(docId).get();
    if (!snap.exists) { container.innerHTML = ''; return; }
    var data = snap.data();
    var youtube = data.youtube || '';
    var ccli = data.ccli || '';
    var ssLink = ccli ? 'https://songselect.ccli.com/Songs/' + ccli : 'https://songselect.ccli.com/search/results?search=' + encodeURIComponent(title);
    var html = '<div class="sp-files-box"><div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:8px;font-size:13px;font-weight:500;">'
      + (youtube ? '<a href="' + youtube + '" target="_blank" style="color:#b22222;text-decoration:none;">YouTube</a>' : '')
      + '<a href="' + ssLink + '" target="_blank" style="color:var(--teal);text-decoration:none;"><i data-lucide="search" style="width:14px;height:14px"></i> SongSelect</a>'
      + (ccli ? '<span style="color:var(--teal);opacity:0.5;">CCLI: ' + ccli + '</span>' : '')
      + '</div>';
    if (keys.length) {
      keys.forEach(function (k) {
        var kFiles = (data.files || []).filter(function (f) { return f.key && f.key.trim().toLowerCase() === k.trim().toLowerCase(); });
        html += '<div style="margin-top:6px;"><div style="font-size:13px;font-weight:600;text-transform:none;color:var(--teal);opacity:0.5;margin-bottom:4px;">Key: ' + k + '</div>';
        if (!kFiles.length) { html += '<span style="font-size:13px;opacity:0.5;font-weight:600;">No files for ' + k + '</span>'; }
        else {
          var g = {}; kFiles.forEach(function (f) { if (!g[f.type]) g[f.type] = []; g[f.type].push(f); });
          Object.keys(g).forEach(function (t) {
            html += '<div style="font-size:13px;font-weight:600;text-transform:none;color:var(--teal);opacity:0.4;margin-top:4px;">' + t + '</div>';
            g[t].forEach(function (f) { html += '<a href="' + f.url + '" target="_blank">Open File</a>'; });
          });
        }
        html += '</div>';
      });
    } else { html += '<div style="font-size:13px;opacity:0.5;font-weight:600;">Select keys to see sheet music</div>'; }
    html += '</div>';
    container.innerHTML = html;
  }

  async function spLoadRota() {
    var date = document.getElementById('spDate').value;
    var snap = await db().collection('events').get();
    spEventsForDay = [];
    var seen = {};
    snap.forEach(function (d) {
      var ev = d.data();
      if (ev.date !== date || ev.archived) return;
      var key = ev.type || 'Unknown';
      if (!seen[key]) seen[key] = ev;
    });
    spEventsForDay = Object.values(seen);
    var select = document.getElementById('spEventSelect');
    select.innerHTML = '<option value="">Select Service…</option>';
    spEventsForDay.forEach(function (ev, i) {
      select.innerHTML += '<option value="' + i + '">' + ev.type + '</option>';
    });
  }

  function spSortAssignments(arr) {
    var tech = ['Sound', 'Words', 'Camera', 'Cameras'];
    return arr.sort(function (a, b) {
      var tA = tech.includes(a[0]), tB = tech.includes(b[0]);
      if (tA && !tB) return 1; if (!tA && tB) return -1;
      if (tA && tB) return tech.indexOf(a[0]) - tech.indexOf(b[0]);
      return a[0].localeCompare(b[0]);
    });
  }

  var NOTE_CELL = '<td><textarea class="sp-instr-note" placeholder="Notes..." rows="1" style="width:100%;background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:6px 8px;font-family:var(--font);font-size:12px;font-weight:600;color:var(--teal);outline:none;resize:none;overflow:hidden;"></textarea></td>';

  async function spSelectEvent() {
    var index = document.getElementById('spEventSelect').value;
    if (index === '') return;
    var data = spEventsForDay[index];
    document.getElementById('spTypeNotes').value = data.description || '';
    spLeader = personName(data.assignments && data.assignments['Worship Leader']) || 'None';
    document.getElementById('spLeaderName').textContent = spLeader;

    var teamBody = document.getElementById('spTeamBody');
    teamBody.innerHTML = '';
    /* Service Leader and Speaker are typed into the Rota Planner as fields on
       the event (serviceLeader / speaker), not rota roles, so they are not in
       assignments - bring them in from the event itself. */
    [['Service Leader', data.serviceLeader], ['Speaker', data.speaker]].forEach(function (pair) {
      if (pair[1]) teamBody.innerHTML += '<tr><td>' + pair[0] + '</td><td>' + pair[1] + '</td>' + NOTE_CELL + '</tr>';
    });
    spSortAssignments(Object.entries(data.assignments || {}).filter(function (e) { return isWorshipRole(e[0]); })).forEach(function (e) {
      teamBody.innerHTML += '<tr><td>' + e[0] + '</td><td>' + personName(e[1]) + '</td>' + NOTE_CELL + '</tr>';
    });

    /* NO SAVED SCHEDULE BUT THE PLAN WAS EMAILED: show the emailed order
       rather than an empty one (Martin, 12 Oct 2026). 11 Oct was sent but
       never saved - Send writes songSummaries/{date}, Save writes
       services - so ChurchShow, which falls back to songSummaries, showed
       the plan while both planners showed the leaders and no songs.
       Nothing had deleted anything.

       BOTH READS AT ONCE, not one after the other. Asking for the
       emailed plan only after the services query came back empty put a
       second round trip in front of every fresh date, and the planner
       drew its default order that much later - enough that
       check-core-planner caught the phone app with an empty order of
       service. Concurrently, the fallback costs nothing in time. The
       emailed plan is read whether or not it is needed, which is one
       small document and the honest price of not being slower. */
    var q = db().collection('services').where('date', '==', data.date);
    var both = await Promise.all([
      q.get(),
      db().collection('songSummaries').doc(data.date).get()
        .catch(function (e) { console.warn('Could not read the emailed plan', e); return null; })
    ]);
    var snap = both[0], ss = both[1];
    document.getElementById('sp-order').innerHTML = '';
    var saved = !snap.empty ? snap.docs[0].data() : null;
    if (!saved && ss && ss.exists && (ss.data().items || []).length) {
      saved = { order: (ss.data().items || []).map(function (it) {
        return { type: it.type, title: it.title || '',
                 keys: it.keys || [], notes: it.notes || '' };
      }) };
    }
    if (saved) {
      document.getElementById('spIntro').value = saved.introText || '';
      document.getElementById('spOutro').value = saved.outroText || '';
      document.getElementById('spTypeNotes').value = saved.serviceNotes || data.description || '';
      if (saved.roleNotes) {
        document.querySelectorAll('#spTeamBody tr').forEach(function (row) {
          var role = row.children[0].textContent;
          if (saved.roleNotes[role]) row.querySelector('.sp-instr-note').value = saved.roleNotes[role];
        });
      }
      (saved.order || []).forEach(function (item) {
        if (item.type === 'song') {
          var id = spAddSong();
          var last = document.getElementById('sp-order').lastChild;
          last.querySelector('.song-title').value = item.title;
          var keyInputs = last.querySelectorAll('.song-key');
          var ks = Array.isArray(item.keys) ? item.keys : [item.key || ''];
          ks.forEach(function (k, i) { if (keyInputs[i]) keyInputs[i].value = k; });
          last.querySelector('.song-note').value = item.notes || '';
          spShowKeyInfo(id, item.title);
          spKeyChanged(id);
          last.querySelector('.song-content').classList.remove('hidden');
          last.classList.remove('is-collapsed');
          last.querySelector('.sp-collapse-btn').textContent = '<i data-lucide=\'chevron-down\' style=\'width:14px;height:14px\'></i>';
        } else { spAddItem(item.title); }
      });
    } else {
      // No saved service — load fresh default order, just like the desktop
      document.getElementById('spIntro').value = '';
      document.getElementById('spOutro').value = '';
      spSetupDefaultOrder();
    }
    spUpdateNumbers();
    spAutoFit();
  }

  /* The audience for a date, with this host's two lookups. The policy -
     who counts, and what "did not resolve" means - is in
     egbc-plan-audience.js, because SundayServicePlanner.html has to do
     exactly the same thing with a different SDK. */
  async function spAudienceFor(date) {
    var empty = { audience: [], unresolved: [], withoutAccount: [] };
    try {
      var ev = spEventsForDay.filter(function (e) { return e && e.date === date; });
      /* Every service that day, not just the chosen one: a Sunday with a
         morning and an evening sends one email between them. */
      return await EGBCPlanAudience.build(EGBCPlanAudience.mergeDay(ev), {
        findMemberIdsByNames: async function (names) {
          var out = {};
          for (var i = 0; i < names.length; i++) {
            var s = await db().collection('addressBook').where('name', '==', names[i]).limit(2).get();
            /* ONE MATCH ONLY. Two people with the same name is exactly
               when a guess is dangerous, so it is left unresolved and
               reported rather than picking the first. */
            if (s.size === 1) out[names[i]] = s.docs[0].id;
          }
          return out;
        },
        findUidsByMemberIds: async function (ids) {
          var out = {};
          for (var i = 0; i < ids.length; i++) {
            var s = await db().collection('users').where('memberId', '==', ids[i]).limit(1).get();
            if (!s.empty) out[ids[i]] = s.docs[0].id;
          }
          return out;
        }
      });
    } catch (e) {
      /* A plan that cannot work out its audience still saves. Losing the
         plan because a lookup failed would be a far worse fault than a
         preacher having to ask for the link. */
      console.warn('Could not work out who the plan is for', e);
      return empty;
    }
  }

  async function spSave(quiet) {
    var date = document.getElementById('spDate').value;
    if (!date) { toast('Please select a date first'); return; }
    var roleNotes = {};
    document.querySelectorAll('#spTeamBody tr').forEach(function (row) {
      var role = row.children[0].textContent;
      var cell = row.querySelector('.sp-instr-note');
      var note = cell && cell.value;
      if (note) roleNotes[role] = note;
    });
    var order = [];
    document.querySelectorAll('#sp-order .service-block').forEach(function (b) {
      if (b.classList.contains('song-block')) {
        order.push({ type: 'song', title: b.querySelector('.song-title').value, keys: Array.from(b.querySelectorAll('.song-key')).map(function (s) { return s.value; }).filter(function (v) { return v; }), notes: b.querySelector('.song-note').value });
      } else { order.push({ type: 'item', title: b.querySelector('.item-title').value }); }
    });
    var serviceData = { date: date, worshipLeader: spLeader, serviceNotes: document.getElementById('spTypeNotes').value, introText: document.getElementById('spIntro').value, outroText: document.getElementById('spOutro').value, roleNotes: roleNotes, order: order };
    /* WHO THE PLAN IS FOR, written onto it (Martin, 12 Oct 2026:
       "EVERYONE ON THE SUNDAY PLAN EMAIL CAN SEE THE PLAN — that
       includes the preachers and service leader"). Without this a
       preacher on no team opens the link in their own email and is told
       "No access". */
    var aud = await spAudienceFor(date);
    serviceData.audience = aud.audience;
    serviceData.audienceUnresolved = aud.unresolved;
    loader(true, 'Saving...');
    try {
      var snap = await db().collection('services').where('date', '==', date).get();
      if (!snap.empty) await db().collection('services').doc(snap.docs[0].id).update(serviceData);
      else await db().collection('services').add(serviceData);
      /* QUIET WHEN SENDING, because Email calls this first and two
         toasts for one button teaches people to ignore both. A FAILURE
         still speaks either way: the point of saving on send is that a
         plan which has gone out is never lost, so a silent failed save
         would be the original fault in a smaller window. */
      if (!quiet) toast('Service saved');
    } catch (e) { toast('Error saving'); }
    loader(false);
  }

  async function spEmail() {
    var date = document.getElementById('spDate').value || 'TBC';
    /* SENDING SAVES THE SCHEDULE FIRST, so a plan that has gone to the
       team is never missing from the planners (Martin, 12 Oct 2026).
       TBC is skipped: a services document is keyed by a real date. */
    if (date !== 'TBC') await spSave(true);
    var serviceNotes = document.getElementById('spTypeNotes').value || '';
    var introText = document.getElementById('spIntro').value || '';
    var outroText = document.getElementById('spOutro').value || '';

    var html = '<div style="font-family:Inter, system-ui, sans-serif;color:#3d6263;max-width:650px;padding:30px;background:#fff;margin:auto;">'
      + '<h1 style="color:#3d6263;font-size:24px;font-weight:600;text-align:center;">Service Plan</h1>'
      + '<p style="text-transform:none;font-weight:600;color:#3d6263;opacity:.6;letter-spacing:1.5px;font-size:13px;text-align:center;">' + date + ' · Leader: ' + spLeader + '</p>'
      + (serviceNotes ? '<div style="background:#f0f6f6;border-left:4px solid #3d6263;padding:15px;margin:16px 0;font-size:13px;">' + serviceNotes.replace(/\n/g, '<br>') + '</div>' : '')
      + (introText ? '<div style="font-size:14px;margin:16px 0;">' + introText.replace(/\n/g, '<br>') + '</div>' : '')
      + '<h2 style="border-bottom:3px solid #3d6263;padding-bottom:8px;text-transform:none;font-size:13px;letter-spacing:1px;margin:16px 0;">Order of Service</h2>'
      + '<table style="width:100%;border-collapse:collapse;margin-bottom:16px;">'
      + '<thead style="background:#f0f6f6;"><tr>'
      + '<th style="text-align:left;padding:8px;font-size:13px;text-transform:none;color:#3d6263;border-bottom:1px solid #d1dfdf;">Title</th>'
      + '<th style="text-align:center;padding:8px;font-size:13px;text-transform:none;color:#3d6263;border-bottom:1px solid #d1dfdf;">Key</th>'
      + '<th style="text-align:center;padding:8px;font-size:13px;text-transform:none;color:#3d6263;border-bottom:1px solid #d1dfdf;">Resources</th>'
      + '</tr></thead><tbody>';

    var blocks = document.querySelectorAll('#sp-order .service-block');
    var songIdx = 1;
    for (const b of blocks) {
      if (b.classList.contains('song-block')) {
        var title = b.querySelector('.song-title').value;
        var keys = Array.from(b.querySelectorAll('.song-key')).map(function (s) { return s.value; }).filter(function (v) { return v; });
        var notes = b.querySelector('.song-note').value;
        if (!title) continue;
        var docId = title.toLowerCase().replace(/\s+/g, '-');
        var snap = await db().collection('songs').doc(docId).get();
        var res = '';
        if (snap.exists) {
          var d = snap.data();
          var ss = d.ccli ? 'https://songselect.ccli.com/Songs/' + d.ccli : 'https://songselect.ccli.com/search/results?search=' + encodeURIComponent(title);
          res = '<div style="margin-bottom:6px;">' + (d.youtube ? '<a href="' + d.youtube + '" style="color:#3d6263;font-weight:500;font-size:13px;padding:0 5px;text-decoration:none;">YouTube</a><span style="color:#cbd5e1;">&nbsp;|&nbsp;</span>' : '') + '<a href="' + ss + '" style="color:#3d6263;font-weight:500;font-size:13px;padding:0 5px;text-decoration:none;">SongSelect</a></div>';
          keys.forEach(function (k) {
            var kf = (d.files || []).filter(function (f) { return f.key && f.key.trim().toLowerCase() === k.trim().toLowerCase(); });
            if (kf.length) { res += '<div style="font-size:13px;color:#3d6263;font-weight:600;margin-top:4px;">Key: ' + k + '</div>'; kf.forEach(function (f) { res += '<div><a href="' + f.url + '" style="color:#3d6263;text-decoration:underline;font-size:13px;">Download ' + f.type + '</a></div>'; }); }
          });
        }
        html += '<tr>'
          + '<td style="padding:12px 8px;border-bottom:1px solid #f1f5f9;vertical-align:top;"><p style="font-weight:600;font-size:14px;color:#1e293b;margin:0;">' + songIdx + '. ' + title + '</p>' + (notes ? '<p style="font-style:italic;font-size:13px;color:#64748b;margin:4px 0 0;">' + notes + '</p>' : '') + '</td>'
          + '<td style="padding:12px 8px;border-bottom:1px solid #f1f5f9;text-align:center;font-weight:600;color:#3d6263;">' + (keys.join(', ') || '-') + '</td>'
          + '<td style="padding:12px 8px;border-bottom:1px solid #f1f5f9;text-align:center;">' + res + '</td>'
          + '</tr>';
        songIdx++;
      } else {
        var itemEl = b.querySelector('.item-title');
        var item = itemEl && itemEl.value;
        if (item) html += '<tr><td colspan="3" style="padding:10px 8px;background:#f8fafc;border-left:4px solid #3d6263;font-weight:600;font-size:12px;color:#3d6263;text-transform:none;">' + item + '</td></tr>';
      }
    }
    html += '</tbody></table>';

    var teamRows = Array.from(document.querySelectorAll('#spTeamBody tr'));
    var rosterNames = [];
    html += '<p style="font-weight:600;font-size:13px;margin:16px 0 8px;">Team for this service:</p><table style="width:100%;border-collapse:collapse;"><tbody>';
    spSortAssignments(teamRows.map(function (r) {
      var n = r.querySelector('.sp-instr-note');
      return [r.children[0].textContent, r.children[1].textContent, (n && n.value) || ''];
    })).forEach(function (row) {
      var role = row[0], name = row[1], note = row[2];
      if (name && name !== 'None') rosterNames.push(name.trim());
      html += '<tr><td style="padding:8px 0;border-bottom:1px solid #f0f4f8;font-size:13px;width:35%;color:#3d6263;font-weight:600;">' + role + '</td><td style="padding:8px 0;border-bottom:1px solid #f0f4f8;font-size:13px;">' + name + (note ? '<br><i style="font-size:13px;color:#666;">Note: ' + note + '</i>' : '') + '</td></tr>';
    });
    html += '</tbody></table>';
    if (outroText) html += '<div style="font-size:14px;color:#444;margin-top:16px;">' + outroText.replace(/\n/g, '<br>') + '</div>';
    html += '</div>';

    if (!spAddressBook.length) {
      try { var s = await db().collection('addressBook').get(); s.forEach(function (d2) { var r = d2.data(); if (r.email) spAddressBook.push(r); }); } catch (e) {}
    }
    var spRecipients = [...new Set(spAddressBook.filter(function (p) { return rosterNames.includes(p.name && p.name.trim()) && p.email; }).map(function (p) { return p.email; }))];
    var spSubject = 'Service Plan: ' + date;
    var senderBox = document.getElementById('spSenderEmail');
    var senderEmail = (senderBox && senderBox.value) || localStorage.getItem('egbc-sender-email') || 'worship@esherchurch.org';

    if (spRecipients.length > 0) {
      toast('Sending plan...');
      try {
        var resp = await fetch('https://sendemail-irkwdhx3xq-uc.a.run.app', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ to: spRecipients, subject: spSubject, html: html, replyTo: senderEmail })
        });
        var result = await resp.json();
        if (result.ok) toast('Plan sent to ' + spRecipients.length + ' people');
        else toast('Could not send: ' + (result.error || 'unknown error'));
      } catch (e) { toast('Could not send: no connection'); }
    } else { toast('No recipients found'); }
  }

  /* ---- mounting ------------------------------------------------------ */

  function mount(opts) {
    opts = opts || {};
    var into = opts.into;
    if (!into) return null;
    if (opts.db) H.db = opts.db;
    if (opts.toast) H.toast = opts.toast;
    if (opts.loader) H.loader = opts.loader;
    H.root = into;

    if (!document.getElementById('egbc-core-planner-css')) {
      var s = document.createElement('style');
      s.id = 'egbc-core-planner-css';
      s.textContent = CSS;
      document.head.appendChild(s);
    }
    /* THE PLANNER OWNS ITS OWN NODE, and is moved into whatever is
       hosting it rather than rebuilt there.
       The first version wrote the markup into the host unless it was
       already present, which sounds like the same thing and is not: the
       phone app's shell rebuilds a tab's HTML on every draw, so the host
       is a NEW empty element each time, the markup looked absent, and
       coming back to Plan threw away the order of service somebody had
       just typed. The check caught it - "coming back to Plan still has
       what was typed" said "(gone)".
       Keeping the node means a half-written plan survives leaving the
       tab, going to another space, and coming back. */
    if (!PANEL) {
      PANEL = document.createElement('div');
      PANEL.className = 'sp-panel';
      PANEL.innerHTML = HTML;
    }
    if (PANEL.parentNode !== into) into.appendChild(PANEL);
    H.root = PANEL;
    spInit();
    if (global.EGBCUI && EGBCUI.icons) EGBCUI.icons();
    return into;
  }

  /* The inline onclick handlers in the markup above look for these on
     window. That is how the planner already worked in CoreTeamApp;
     making it anything else would be the rewrite §7b forbids. */
  global.spInit = spInit;
  global.spSetupDefaultOrder = spSetupDefaultOrder;
  global.spAutoFit = spAutoFit;
  global.spUpdateNumbers = spUpdateNumbers;
  global.spToggle = spToggle;
  global.spAddSong = spAddSong;
  global.spAddItem = spAddItem;
  global.spShowKeyInfo = spShowKeyInfo;
  global.spSearch = spSearch;
  global.spSelectSong = spSelectSong;
  global.spKeyChanged = spKeyChanged;
  global.spLoadRota = spLoadRota;
  global.spSelectEvent = spSelectEvent;
  global.spSave = spSave;
  global.spEmail = spEmail;

  global.EGBCCorePlanner = {
    mount: mount,
    html: function () { return HTML; },
    css: function () { return CSS; },
    personName: personName,
    personId: personId,
    isWorshipRole: isWorshipRole,
    spSortAssignments: spSortAssignments
  };
})(window);
