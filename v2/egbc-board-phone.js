/* ===================================================================
   EGBC — a pin board on a phone: small post-its, and one note filling
   the screen (APP-DESIGN-BRIEF §7f)
   ===================================================================

   Martin: "you have a small version of whatever the card is, but when
   you press on it it fills the phone screen so you can read it or add to
   it etc. So keep post-its but you can make them much smaller and as
   people tap they get bigger."

   WHY THIS IS A FILE AND NOT TWO COPIES. §7f asks for this in two
   places - stickynotes.html under 700px, and the phone app's board sheet
   - and says why: "so the app and the phone website match". Two copies
   of a screen do not match for long; they match on the day they are
   written. This is the same move as egbc-core-planner.js, which was
   lifted out so CoreTeamApp and the app run one planner rather than two
   that drift.

   WHAT A HOST PROVIDES. The module knows how to draw a board and
   nothing about where the notes live, who the person is, or how a note
   is saved. All of that comes in through mount():

     EGBCBoardPhone.mount({
       grid, sheet, sheetInner,   // elements it draws into
       db,                        // a firestore handle, for comments
       boardId,                   // 'state', 'kids-church', ...
       notes,                     // () => the notes to show, in order
       canPost, isLeader,         // () => boolean
       me,                        // () => ({ uid, name }) or null
       onReact, onEdit,           // (noteId[, key])
       onArchive, onRemove,       // (noteId, on) / (noteId)
       afterChange,               // () => the host redraws itself
       confirmRemove,             // optional, () => boolean
     })

   The host keeps its own idea of what a note is and what may be done to
   one; this draws it and reports taps back.
   =================================================================== */

(function (global) {
  'use strict';

  /* The categories and reactions a board uses. Held here so both hosts
     label a note the same way - a note that says "Song" on a computer
     and "Other" on a phone is the same note described twice. */
  var CAT_META = {
    song:    { label: 'Song',    icon: 'music',          cls: 'note-song' },
    event:   { label: 'Event',   icon: 'calendar-days',  cls: 'note-event' },
    av:      { label: 'AV/Tech', icon: 'clapperboard',   cls: 'note-av' },
    prayer:  { label: 'Prayer',  icon: 'heart',          cls: 'note-prayer' },
    general: { label: 'General', icon: 'lightbulb',      cls: 'note-general' },
    other:   { label: 'Other',   icon: 'paperclip',      cls: 'note-other' }
  };
  var REACTIONS = [
    { key: 'love',    icon: 'heart',        label: 'Love it' },
    { key: 'like',    icon: 'thumbs-up',    label: 'Like' },
    { key: 'dislike', icon: 'thumbs-down',  label: 'Not sure' },
    { key: 'pray',    icon: 'sparkles',     label: 'Amen' }
  ];

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function ic(name, size) {
    var s = size || 14;
    return '<i data-lucide="' + name + '" style="width:' + s + 'px;height:' + s
      + 'px;vertical-align:-2px"></i>';
  }
  function icons() { if (global.EGBCUI && EGBCUI.icons) EGBCUI.icons(); }

  function ytId(url) {
    var m = String(url || '').match(
      /(?:youtube\.com\/(?:watch\?v=|embed\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{6,})/);
    return m ? m[1] : '';
  }
  function ytThumb(url) {
    var id = ytId(url);
    return id ? 'https://i.ytimg.com/vi/' + id + '/mqdefault.jpg' : '';
  }
  function whenText(ms) {
    if (!ms) return '';
    var d = new Date(ms);
    return isNaN(d) ? '' : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  }

  /* THE LOOK TRAVELS WITH THE CODE. §7f wants this screen to be the same
     in the app and on the phone website; shipping the drawing in one file
     and the styling in two would have them drift apart a rule at a time.
     Injected once, and only the post-it and note-sheet rules - how a page
     decides to SHOW this (which widths, what it hides) stays with the
     page, because that is the page's business. */
  var STYLE = [
    /* THE HANDWRITING IS PART OF IT. A post-it in Inter is a card; what
       makes it a post-it is the colour, the tilt, the pin and the hand.
       The default is named here rather than left to each page, because
       the app had no --font-hand and its titles came out in the body
       font - the two screens were "the same" in structure and visibly
       different, which is the drift this file exists to stop. Caveat is
       loaded by both pages. */
    ':root{--egbc-hand:\'Caveat\',cursive}',
    '.pb-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;align-items:start}',
    '.pb-grid *,.pb-note *{min-width:0;max-width:100%;box-sizing:border-box}',
    '.pb-note{position:relative;display:block;width:100%;text-align:left;border:none;',
      'padding:16px 10px 10px;border-radius:3px;font-family:var(--font,Inter,system-ui,sans-serif);',
      'cursor:pointer;overflow:hidden;box-shadow:0 2px 7px rgba(0,0,0,.18)}',
    /* A small deterministic tilt off the place in the grid, so a board
       still reads as a board and not as a table of results. */
    '.pb-note:nth-child(4n+1){transform:rotate(-1.4deg)}',
    '.pb-note:nth-child(4n+2){transform:rotate(1.1deg)}',
    '.pb-note:nth-child(4n+3){transform:rotate(.8deg)}',
    '.pb-note:nth-child(4n){transform:rotate(-.7deg)}',
    '.pb-note:active{transform:scale(.98)}',
    '.pb-pin{position:absolute;top:-8px;left:50%;transform:translateX(-50%);width:14px;height:14px;',
      'border-radius:50%;background:radial-gradient(circle at 35% 35%,#e74c3c,#8b0000);',
      'box-shadow:0 2px 5px rgba(0,0,0,.35);z-index:2}',
    '.pb-cat{font-size:12px;font-weight:600;color:rgba(0,0,0,.5);display:flex;align-items:center;',
      'gap:4px;margin-bottom:4px}',
    '.pb-title{font-family:var(--font-hand,var(--egbc-hand));font-size:17px;font-weight:600;color:#1a0a00;',
      'line-height:1.25;margin-bottom:5px;display:-webkit-box;-webkit-line-clamp:3;',
      '-webkit-box-orient:vertical;overflow:hidden;max-height:4em;overflow-wrap:anywhere}',
    '.pb-thumb{width:100%;height:auto;aspect-ratio:16/9;object-fit:cover;border-radius:3px;',
      'display:block;margin:0 0 6px;background:rgba(0,0,0,.12)}',
    '.pb-foot{display:flex;align-items:center;justify-content:space-between;gap:6px;',
      'font-size:12px;font-weight:600;color:rgba(0,0,0,.58)}',
    '.pb-who{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}',
    '.pb-counts{display:flex;gap:6px;flex:none}',
    '.pb-counts span{display:flex;align-items:center;gap:2px}',
    /* The categories' colours, so a Song is the same yellow in both. */
    '.pb-note.note-song{background:linear-gradient(135deg,#fff9c4,#fff176)}',
    '.pb-note.note-event{background:linear-gradient(135deg,#ffcdd2,#ef9a9a)}',
    '.pb-note.note-av{background:linear-gradient(135deg,#bbdefb,#90caf9)}',
    '.pb-note.note-prayer{background:linear-gradient(135deg,#e1bee7,#ce93d8)}',
    '.pb-note.note-general{background:linear-gradient(135deg,#c8e6c9,#a5d6a7)}',
    '.pb-note.note-other{background:linear-gradient(135deg,#ffe0b2,#ffcc80)}',

    /* ---- one note, filling the screen ---- */
    /* Above the shared site bar (z-index 9000, egbc-shell.js) and the
       app shell, because "fills the phone screen" means fills it. */
    '#noteSheet,[data-bp-sheet]{position:fixed;inset:0;z-index:9100;',
      'background:var(--canvas,#eef4f3);overflow-y:auto;-webkit-overflow-scrolling:touch;',
      'overscroll-behavior:contain;touch-action:pan-y}',
    '[data-bp-sheet] *,#noteSheet *{min-width:0;max-width:100%;box-sizing:border-box}',
    '.ns-inner{padding:14px 14px 40px;max-width:640px;margin:0 auto}',
    '.ns-bar{position:sticky;top:0;z-index:2;display:flex;align-items:center;gap:8px;',
      'background:var(--canvas,#eef4f3);padding:4px 0 10px}',
    '.ns-close{display:flex;align-items:center;gap:6px;min-height:44px;padding:0 14px;',
      'background:#fff;color:var(--teal,#3d6263);border:1px solid var(--border,#d9e4e3);',
      'border-radius:10px;font-family:inherit;font-size:14px;font-weight:600;cursor:pointer}',
    '.ns-step{display:flex;align-items:center;justify-content:center;width:44px;height:44px;',
      'background:#fff;color:var(--teal,#3d6263);border:1px solid var(--border,#d9e4e3);',
      'border-radius:10px;cursor:pointer}',
    '.ns-step[disabled]{opacity:.4;cursor:default}',
    '.ns-card{background:#fff;border-radius:12px;padding:16px;box-shadow:0 2px 8px rgba(16,24,40,.06)}',
    '.ns-title{font-family:var(--font-hand,var(--egbc-hand));font-size:24px;font-weight:600;',
      'color:var(--ink,#14201f);line-height:1.2;margin:0 0 8px;overflow-wrap:anywhere}',
    '.ns-body{font-size:15px;line-height:1.55;color:var(--body,#3a4d4c);white-space:pre-wrap;',
      'overflow-wrap:anywhere}',
    '.ns-meta{font-size:12.5px;color:var(--muted,#6b8281);font-weight:600;margin:10px 0 0}',
    '.ns-yt{width:100%;aspect-ratio:16/9;border:0;border-radius:10px;display:block;margin:12px 0 0}',
    '.ns-link{display:flex;align-items:center;justify-content:center;gap:8px;min-height:48px;',
      'margin:12px 0 0;background:var(--teal,#3d6263);color:#fff;border-radius:12px;font-size:15px;',
      'font-weight:600;text-decoration:none;padding:0 14px;overflow-wrap:anywhere}',
    '.ns-sec{font-size:13px;font-weight:600;color:var(--muted,#6b8281);margin:18px 0 8px}',
    '.ns-react{display:flex;gap:8px;flex-wrap:wrap;margin:14px 0 0}',
    '.ns-react button{display:flex;align-items:center;gap:6px;min-height:44px;padding:0 14px;',
      'background:#fff;border:1px solid var(--border,#d9e4e3);border-radius:12px;',
      'font-family:inherit;font-size:14px;font-weight:600;color:var(--teal,#3d6263);cursor:pointer}',
    '.ns-react button.on{background:var(--teal-light,#e3eeed);border-color:var(--teal,#3d6263)}',
    '.ns-acts{display:flex;gap:8px;flex-wrap:wrap;margin:16px 0 0}',
    '.ns-acts button{display:flex;align-items:center;gap:6px;min-height:44px;padding:0 14px;',
      'background:#fff;border:1px solid var(--border,#d9e4e3);border-radius:10px;',
      'font-family:inherit;font-size:14px;font-weight:600;color:var(--teal,#3d6263);cursor:pointer}',
    '.ns-acts button.danger{color:#a3321f;border-color:#e7c3bb}',
    '.ns-cmt{background:#fff;border-radius:10px;padding:11px 13px;margin:0 0 8px}',
    '.ns-cmt-who{font-size:12.5px;font-weight:600;color:var(--muted,#6b8281);display:flex;gap:8px;',
      'align-items:baseline}',
    '.ns-cmt-text{font-size:14.5px;line-height:1.5;color:var(--body,#3a4d4c);margin:3px 0 0;',
      'white-space:pre-wrap;overflow-wrap:anywhere}',
    '.ns-cmt-del{background:none;border:none;color:#a3321f;font-family:inherit;font-size:12.5px;',
      'font-weight:600;cursor:pointer;padding:4px 0 0}',
    '.ns-cmt-box{width:100%;min-height:76px;border:1px solid var(--border,#d9e4e3);border-radius:10px;',
      'padding:10px 12px;font-family:inherit;font-size:15px;color:var(--ink,#14201f);background:#fff;',
      'resize:vertical}',
    '.ns-cmt-send{display:flex;align-items:center;gap:6px;min-height:44px;padding:0 16px;margin:8px 0 0;',
      'background:var(--teal,#3d6263);color:#fff;border:none;border-radius:10px;font-family:inherit;',
      'font-size:14px;font-weight:600;cursor:pointer}',
    '.ns-cmt-send[disabled]{opacity:.5}',
    '.ns-note{font-size:13px;color:var(--muted,#6b8281)}'
  ].join('');

  function addStyle() {
    if (document.getElementById('egbc-board-phone-css')) return;
    var s = document.createElement('style');
    s.id = 'egbc-board-phone-css';
    s.textContent = STYLE;
    (document.head || document.documentElement).appendChild(s);
  }

  /* An element, or a function returning one. The app's shell redraws its
     sheets, so the nodes it hands over are replaced under us; looking
     them up each time is what survives that. */
  function el(x) {
    if (typeof x === 'function') { try { return x(); } catch (e) { return null; } }
    return x || null;
  }

  function mount(o) {
    addStyle();
    var api = {};
    var counts = {};          /* noteId -> how many comments */
    var openId = null;        /* the note filling the screen, if any */
    var commentsFor = null;   /* which note the loaded comments belong to */

    function notes() { return (o.notes && o.notes()) || []; }
    function isLeader() { return !!(o.isLeader && o.isLeader()); }
    function canPost() { return !!(o.canPost && o.canPost()); }
    function me() { return (o.me && o.me()) || null; }

    /* ---- the small post-its ------------------------------------- */

    function buildSmall(note) {
      var meta = CAT_META[note.cat] || CAT_META.other;
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'pb-note ' + meta.cls;
      b.id = 'pbnote_' + note.id;
      b.setAttribute('data-note', note.id);
      b.onclick = function () { api.open(note.id); };

      var thumb = ytThumb(note.ytUrl);
      var c = counts[note.id] || 0;
      var tally = REACTIONS.map(function (r) {
        return { r: r, n: (note.reactions || {})[r.key] || 0 };
      }).filter(function (x) { return x.n > 0; })
        .map(function (x) { return '<span>' + ic(x.r.icon) + x.n + '</span>'; })
        .join('')
        /* Only when there are any: a row of zeroes tells nobody
           anything and takes the space the name needs. */
        + (c ? '<span>' + ic('message-square') + c + '</span>' : '');

      b.innerHTML = '<span class="pb-pin"></span>'
        + '<span class="pb-cat">' + ic(meta.icon) + ' ' + esc(meta.label) + '</span>'
        + (thumb ? '<img class="pb-thumb" src="' + esc(thumb) + '" alt="" loading="lazy"'
            + ' onerror="this.style.display=\'none\'">' : '')
        + '<span class="pb-title">' + esc(note.title || note.body || '(no title)') + '</span>'
        + '<span class="pb-foot"><span class="pb-who">' + esc(note.author || 'Anonymous')
        + '</span><span class="pb-counts">' + tally + '</span></span>';
      return b;
    }

    api.render = function () {
      var grid = el(o.grid);
      if (!grid) return;
      grid.innerHTML = '';
      var list = notes();
      for (var i = 0; i < list.length; i++) grid.appendChild(buildSmall(list[i]));
      var empty = el(o.empty); if (empty) empty.hidden = list.length > 0;
      var add = el(o.addBtn); if (add) add.hidden = !canPost();
      icons();
    };

    /* ---- one note, filling the screen ---------------------------- */

    function noteById(id) {
      var list = notes();
      for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
      return null;
    }

    api.open = function (id) {
      var sheet = el(o.sheet);
      if (!noteById(id) || !sheet) return;
      openId = id;
      sheet.hidden = false;
      document.body.style.overflow = 'hidden';
      /* THE PHONE'S BACK BUTTON AND BACK GESTURE CLOSE IT. A pushed
         history entry is what makes that work. */
      try { history.pushState({ egbcNote: id }, ''); } catch (e) {}
      api.paint();
      { var sh = el(o.sheet); if (sh) sh.scrollTop = 0; }
      loadComments(id);
    };

    api.close = function (fromHistory) {
      var sheet = el(o.sheet);
      if (!sheet || sheet.hidden) return;
      sheet.hidden = true;
      openId = null;
      document.body.style.overflow = '';
      if (!fromHistory) {
        try { if (history.state && history.state.egbcNote) history.back(); } catch (e) {}
      }
    };

    api.openId = function () { return openId; };

    api.step = function (dir) {
      var list = notes();
      var at = -1;
      for (var i = 0; i < list.length; i++) if (list[i].id === openId) { at = i; break; }
      if (at === -1) return;
      var next = list[at + dir];
      if (!next) return;
      openId = next.id;
      api.paint();
      { var sh = el(o.sheet); if (sh) sh.scrollTop = 0; }
      loadComments(next.id);
    };

    api.paint = function () {
      var note = noteById(openId);
      var inner = el(o.sheetInner);
      if (!note || !inner) return;
      /* THE GUTTER IS THE MODULE'S JOB, not the host's. This padding
         used to be a rule in stickynotes.html keyed to its own id; when
         the styling moved in here it became .ns-inner, and the website's
         div never had that class - so on the phone the Comments heading,
         the box and the Post button ran edge to edge while the note card
         kept its own inset padding and looked right. Martin measured
         them at 0..372 in a 372px screen. Adding the class here means no
         host can forget it. */
      inner.classList.add('ns-inner');
      var meta = CAT_META[note.cat] || CAT_META.other;
      var list = notes();
      var at = -1;
      for (var i = 0; i < list.length; i++) if (list[i].id === note.id) { at = i; break; }

      var vid = ytId(note.ytUrl || '');
      var link = String(note.link || '').trim();
      var mine = note.myReactions || {};
      var mayEdit = isLeader() || sameAuthor(note);

      inner.innerHTML =
        '<div class="ns-bar">'
        + '<button class="ns-close" data-bp="close">' + ic('arrow-left') + ' Close</button>'
        + '<div style="margin-left:auto;display:flex;gap:8px">'
        + '<button class="ns-step" data-bp="prev" aria-label="The note before this one"'
          + (at <= 0 ? ' disabled' : '') + '>' + ic('chevron-left') + '</button>'
        + '<button class="ns-step" data-bp="next" aria-label="The next note"'
          + (at === -1 || at >= list.length - 1 ? ' disabled' : '') + '>'
          + ic('chevron-right') + '</button>'
        + '</div></div>'

        + '<div class="ns-card">'
        + '<div class="pb-cat">' + ic(meta.icon) + ' ' + esc(meta.label)
          + (note.archived ? ' &middot; Archived' : '') + '</div>'
        + (note.title ? '<h2 class="ns-title">' + esc(note.title) + '</h2>' : '')
        + (note.body ? '<div class="ns-body">' + esc(note.body) + '</div>' : '')
        /* THE VIDEO PLAYS IN PLACE, not on YouTube's website. */
        + (vid ? '<iframe class="ns-yt" src="https://www.youtube.com/embed/' + esc(vid)
            + '?rel=0" allow="accelerometer; autoplay; encrypted-media; picture-in-picture"'
            + ' allowfullscreen title="Video on this note"></iframe>' : '')
        + (note.imgUrl ? '<img class="ns-yt" style="aspect-ratio:auto" src="' + esc(note.imgUrl)
            + '" alt="" onerror="this.style.display=\'none\'">' : '')
        + (!vid && /^https?:\/\//i.test(link)
            ? '<a class="ns-link" href="' + esc(link) + '" target="_blank" rel="noopener">'
              + ic('link') + ' ' + esc(note.linkLabel || link) + '</a>' : '')
        + '<p class="ns-meta">' + esc(note.author || 'Anonymous')
          + (note.createdAt ? ' &middot; ' + whenText(note.createdAt) : '') + '</p>'

        + '<div class="ns-react">'
        + REACTIONS.map(function (r) {
            return '<button class="' + (mine[r.key] ? 'on' : '') + '" data-bp="react"'
              + ' data-key="' + r.key + '">' + ic(r.icon) + ' ' + esc(r.label)
              + ((note.reactions || {})[r.key] ? ' ' + note.reactions[r.key] : '') + '</button>';
          }).join('')
        + '</div>'

        /* EDIT for whoever posted it and for leaders; ARCHIVE and REMOVE
           for leaders, as small VISIBLE buttons - "never behind '...'",
           which is the brief's wording. */
        + '<div class="ns-acts">'
        + (mayEdit ? '<button data-bp="edit">' + ic('pencil') + ' Edit</button>' : '')
        + (isLeader() ? (note.archived
            ? '<button data-bp="unarchive">' + ic('upload') + ' Put back</button>'
            : '<button data-bp="archive">' + ic('archive') + ' Archive</button>')
          + '<button class="danger" data-bp="remove">' + ic('trash-2') + ' Remove</button>' : '')
        + '</div>'
        + '</div>'

        + '<div class="ns-sec">Comments</div>'
        /* id AND the data attribute: the module finds it by the data
           attribute (a host may have more than one board on a page one
           day), and the id is what a person inspecting the page, or a
           check, can reasonably reach for. */
        + '<div id="nsComments" data-bp-comments><p class="ns-note">Loading&hellip;</p></div>'
        + (canPost()
            ? '<textarea class="ns-cmt-box" data-bp-box maxlength="500"'
              + ' placeholder="Add a comment&hellip;"></textarea>'
              + '<button class="ns-cmt-send" data-bp="send">' + ic('send') + ' Post</button>'
            : '<p class="ns-note">Only people on this team can comment.</p>');

      icons();
    };

    /* The note carries a typed author name, not a uid, so this is the
       only comparison there is - and it is why Edit is OFFERED rather
       than assumed: a leader can always edit. */
    function sameAuthor(note) {
      var p = me();
      return !!(p && p.name && note.author && String(note.author).trim() === String(p.name).trim());
    }

    /* ---- comments: their own collection, never inside the board ---- */

    function commentsRef() { return o.db.collection('boardComments'); }

    function loadComments(noteId) {
      commentsFor = noteId;
      var inner = el(o.sheetInner);
      var host = inner && inner.querySelector('[data-bp-comments]');
      commentsRef().where('boardId', '==', o.boardId).where('noteId', '==', noteId).get()
        .then(function (snap) {
          var rows = [];
          snap.forEach(function (d) {
            var r = d.data() || {};
            r.id = d.id;
            rows.push(r);
          });
          /* Oldest first, which is how a conversation reads. Sorted here
             rather than in the query so there is no index to deploy. */
          rows.sort(function (a, b) {
            return String(a.createdAt || '').localeCompare(String(b.createdAt || ''));
          });
          if (commentsFor !== noteId) return;   /* they swiped on */
          paintComments(rows);
        })
        .catch(function () {
          if (commentsFor !== noteId || !host) return;
          host.innerHTML = '<p class="ns-note">Could not load the comments.</p>';
        });
    }

    function paintComments(rows) {
      var inner = el(o.sheetInner);
      var host = inner && inner.querySelector('[data-bp-comments]');
      if (!host) return;
      var p = me();
      var myUid = p ? p.uid : '';
      if (!rows.length) { host.innerHTML = '<p class="ns-note">No comments yet.</p>'; return; }
      host.innerHTML = rows.map(function (c) {
        var ours = myUid && c.byUid === myUid;
        var when = c.createdAt ? whenText(Date.parse(c.createdAt)) : '';
        return '<div class="ns-cmt">'
          + '<div class="ns-cmt-who"><span>' + esc(c.byName || 'Someone') + '</span>'
          + (when ? '<span>' + esc(when) + '</span>' : '') + '</div>'
          + '<div class="ns-cmt-text">' + esc(c.text || '') + '</div>'
          + ((ours || isLeader())
              ? '<button class="ns-cmt-del" data-bp="del" data-id="' + esc(c.id) + '">Delete</button>'
              : '')
          + '</div>';
      }).join('');
      icons();
    }

    api.counts = function () { return counts; };

    /* One query for the whole board, not one per note: thirty notes
       would otherwise be thirty requests every time it drew. */
    api.loadCounts = function () {
      return commentsRef().where('boardId', '==', o.boardId).get().then(function (snap) {
        var tally = {};
        snap.forEach(function (d) {
          var n = (d.data() || {}).noteId;
          if (n) tally[n] = (tally[n] || 0) + 1;
        });
        counts = tally;
        if (o.afterChange) o.afterChange();
      }).catch(function () { /* a board whose comments are refused shows none */ });
    };

    function send() {
      var inner = el(o.sheetInner);
      var box = inner && inner.querySelector('[data-bp-box]');
      var btn = inner && inner.querySelector('[data-bp="send"]');
      if (!box || !openId) return;
      var text = box.value.trim();
      if (!text) { if (o.toast) o.toast('Type something first'); return; }
      var p = me();
      if (!p || !p.uid) { if (o.toast) o.toast('You need to be signed in'); return; }
      if (btn) btn.disabled = true;
      commentsRef().add({
        boardId: o.boardId, noteId: openId, text: text.slice(0, 500),
        byUid: p.uid, byName: p.name || 'Someone',
        createdAt: new Date().toISOString()
      }).then(function () {
        box.value = '';
        loadComments(openId);
        api.loadCounts();
      }).catch(function () {
        if (o.toast) o.toast('Could not post that comment');
      }).then(function () { if (btn) btn.disabled = false; });
    }

    function del(id) {
      if (!global.confirm('Delete this comment?')) return;
      commentsRef().doc(id).delete().then(function () {
        if (openId) loadComments(openId);
        api.loadCounts();
      }).catch(function () { if (o.toast) o.toast('Could not delete that comment'); });
    }

    /* ---- what a tap on the sheet means --------------------------- */

    /* ON THE DOCUMENT, not on the sheet. The app's shell redraws its
       sheets, which replaces the node a listener was bound to and takes
       the listener with it - the buttons would stop working the first
       time anything else on the screen changed. Every tap is checked for
       being inside THIS board's sheet before it is acted on. */
    {
      document.addEventListener('click', function (e) {
        var sheetNow = el(o.sheet);
        if (!sheetNow || sheetNow.hidden) return;
        var b = e.target.closest && e.target.closest('[data-bp]');
        if (!b || !sheetNow.contains(b)) return;
        var what = b.getAttribute('data-bp');
        var id = openId;
        if (what === 'close')      { api.close(); return; }
        if (what === 'prev')       { api.step(-1); return; }
        if (what === 'next')       { api.step(1); return; }
        if (what === 'send')       { send(); return; }
        if (what === 'del')        { del(b.getAttribute('data-id')); return; }
        if (what === 'react')      {
          if (o.onReact) o.onReact(id, b.getAttribute('data-key'));
          api.paint(); if (o.afterChange) o.afterChange(); return;
        }
        if (what === 'edit')       { api.close(); if (o.onEdit) o.onEdit(id); return; }
        if (what === 'archive')    { if (o.onArchive) o.onArchive(id, true); api.close(); return; }
        if (what === 'unarchive')  { if (o.onArchive) o.onArchive(id, false); api.close(); return; }
        if (what === 'remove')     {
          var ask = o.confirmRemove || function () {
            return global.confirm('Remove this note for everybody?');
          };
          if (!ask()) return;
          if (o.onRemove) o.onRemove(id);
          api.close();
          return;
        }
      });
    }

    /* THE PHONE'S BACK BUTTON closes the note. */
    global.addEventListener('popstate', function () {
      var sh = el(o.sheet);
      if (sh && !sh.hidden) api.close(true);
    });

    /* SWIPE LEFT OR RIGHT goes to the next or previous note. Strict on
       purpose: mostly sideways, far enough to be meant, and never from a
       finger that landed on a control - or tapping "Love it" would turn
       into a swipe. The LAST place the finger was is kept as it moves,
       because touchend does not always carry it. */
    (function () {
      var sx = 0, sy = 0, lx = 0, ly = 0, tracking = false;
      document.addEventListener('touchstart', function (e) {
        var sh = el(o.sheet);
        if (!sh || sh.hidden || e.touches.length !== 1) { tracking = false; return; }
        if (e.target.closest && e.target.closest('iframe, textarea, a, button')) {
          tracking = false; return;
        }
        sx = lx = e.touches[0].clientX; sy = ly = e.touches[0].clientY; tracking = true;
      }, { passive: true });
      document.addEventListener('touchmove', function (e) {
        if (!tracking || !e.touches.length) return;
        lx = e.touches[0].clientX; ly = e.touches[0].clientY;
      }, { passive: true });
      document.addEventListener('touchend', function (e) {
        if (!tracking) return;
        tracking = false;
        var t = (e.changedTouches && e.changedTouches[0]) || { clientX: lx, clientY: ly };
        var dx = t.clientX - sx, dy = t.clientY - sy;
        if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
        api.step(dx < 0 ? 1 : -1);
      }, { passive: true });
    })();

    return api;
  }

  global.EGBCBoardPhone = {
    mount: mount,
    CAT_META: CAT_META,
    REACTIONS: REACTIONS,
    ytId: ytId,
    ytThumb: ytThumb
  };
})(window);
