/* ===================================================================
   EGBC — the e-news editor (enews-edit.html; FINDINGS-comms plan A)
   ===================================================================

   The same steps as Mailchimp's email builder (Martin, 20 Oct: "it needs
   to work in the same way"), in the hub's own look and words:
     - top: ‹ E-news, the subject, Saved, Send me a test, Done;
     - computer / phone, undo / redo, Preview;
     - left: Add (drag a block onto the email, or tap it), Look (the whole
       email), Check (what still needs doing);
     - the email in the middle: tap a block to pick it (an outline, its
       "⠿" handle to drag it, Move up / down, Copy, Delete beside it);
       type on its words where they are, with the toolbar across the top;
       the block's settings on the left (Content, Style, Who sees it).
   The canvas is egbc-mailblocks.js's own email in its edit mode, so what
   is edited is what is sent. Saved as it goes, to the same enewsIssues
   document the E-news page uses; scheduling stays there ("Done").
   =================================================================== */
(function () {
  'use strict';
  var MB = window.EGBCMailBlocks, esc = MB.esc;
  var ed = document.getElementById('ed');
  var ISSUE = null, ISSUE_ID = '', SET = { template: 'classic', colours: {}, church: {} }, CHURCH = {}, PICS = null;
  var SEL = -1, PANEL = 'add', TAB = 'content', DEVICE = 'computer';
  var HIST = [], FUT = [], saveT = null, drawT = null, typingSnap = false, CV = null;
  var PHONE = function () { return window.matchMedia('(max-width:899px)').matches; };
  var db = function () { return EGBCAuth.db; };
  var hubBase = EGBCComms.hubBase;

  /* ---- small things -------------------------------------------------- */
  function I(n, s) { return '<i data-lucide="' + n + '" style="width:' + (s || 17) + 'px;height:' + (s || 17) + 'px"></i>'; }
  function icons(root) { if (window.lucide) try { lucide.createIcons({ root: root || document }); } catch (e) { try { lucide.createIcons(); } catch (e2) {} } }
  function toast(t) { var el = document.getElementById('toast'); el.textContent = t; el.className = 'on'; clearTimeout(toast.h); toast.h = setTimeout(function () { el.className = ''; }, 2800); }
  function stamp() { var u = EGBCAuth.user() || {}; return { updatedAt: new Date().toISOString(), updatedBy: u.uid || '' }; }
  function editable() { return !ISSUE.status || ISSUE.status === 'draft' || ISSUE.status === 'scheduled'; }
  function theme() { return MB.theme({ template: ISSUE.template || SET.template || 'classic', colours: SET.colours || {} }); }
  function palette() { return MB.palette(theme()); }
  function rules() { return MB.styleRules(theme()); }
  function field(id, lab, v, type, extra) { return '<label for="' + id + '">' + esc(lab) + '</label><input type="' + (type || 'text') + '" id="' + id + '" value="' + esc(v == null ? '' : v) + '"' + (extra || '') + '>'; }
  function val(id) { var el = document.getElementById(id); return el ? String(el.value || '').trim() : ''; }
  var NAMES = { header: 'The week’s picture', verse: 'Bible verse', section: 'Section bar', sunday: 'This Sunday', event: 'Picture and words', text: 'Words', heading: 'Heading',
    picture: 'Picture', button: 'Button', divider: 'Line', spacer: 'Space', notices: 'Notices', meeting: 'Meeting', diary: 'Dates for the diary', columns: 'Columns',
    pictures: 'Two pictures', video: 'Video', social: 'Social links', logo: 'Logo' };

  /* ---- saving: as it goes, the same document and fields as enews.html --- */
  function snapshot() { return JSON.stringify({ subject: ISSUE.subject || '', preheader: ISSUE.preheader || '', blocks: ISSUE.blocks || [] }); }
  function remember() { HIST.push(snapshot()); if (HIST.length > 60) HIST.shift(); FUT = []; undoState(); }
  function undoState() {
    var u = document.getElementById('undo'), r = document.getElementById('redo');
    if (u) u.disabled = !HIST.length; if (r) r.disabled = !FUT.length;
  }
  function restore(js) { var x = JSON.parse(js); ISSUE.subject = x.subject; ISSUE.preheader = x.preheader; ISSUE.blocks = x.blocks; var s = document.getElementById('subj'); if (s) s.value = ISSUE.subject; SEL = Math.min(SEL, ISSUE.blocks.length - 1); drawCanvas(); drawPanel(); saveSoon(); }
  function undo() { if (!HIST.length) return; FUT.push(snapshot()); restore(HIST.pop()); undoState(); }
  function redo() { if (!FUT.length) return; HIST.push(snapshot()); restore(FUT.pop()); undoState(); }
  function savedState(t, cls) { var el = document.getElementById('saved'); if (!el) return; el.className = 'saved ' + (cls || ''); el.innerHTML = (cls ? '' : I('check', 15)) + esc(t); icons(el); }
  function saveSoon() { if (!editable()) return; savedState('Saving…', 'busy'); clearTimeout(saveT); saveT = setTimeout(save, 700); }
  function finalCopy(version) {
    return MB.render(Object.assign({}, ISSUE, { colours: SET.colours || {} }), { version: version, church: CHURCH, unsubscribeUrl: MB.PLACEHOLDER,
      webUrl: hubBase() + '/enews-web.html?issue=' + encodeURIComponent(ISSUE_ID), assetBase: hubBase() });
  }
  function save() {
    clearTimeout(saveT);
    if (!ISSUE || !editable()) return Promise.resolve();
    var data = Object.assign({
      subject: String(ISSUE.subject || '').slice(0, 200), preheader: String(ISSUE.preheader || '').slice(0, 200),
      template: ISSUE.template === 'green' ? 'green' : 'classic', blocks: (ISSUE.blocks || []).slice(0, 80),
      status: ISSUE.status === 'scheduled' ? 'scheduled' : 'draft', sendAt: ISSUE.sendAt || '', week: String(ISSUE.week || '').slice(0, 10)
    }, stamp());
    /* A scheduled issue carries its two finished copies, made again on
       every save, so what is sent is what is on the screen. */
    data.htmlMembers = data.status === 'scheduled' ? finalCopy('members') : '';
    data.htmlEveryone = data.status === 'scheduled' ? finalCopy('everyone') : '';
    /* A welcome email's words (enews.html Welcome emails): its finished
       copy, kept only while nothing is left to fill in - the server sends
       this copy, and sends nothing while there is none. No web version. */
    if (/^auto_/.test(ISSUE_ID)) {
      data.htmlMembers = '';
      data.htmlEveryone = MB.readyToSend(ISSUE).ok ? MB.render(Object.assign({}, ISSUE, { colours: SET.colours || {} }), { version: 'everyone', church: CHURCH, unsubscribeUrl: MB.PLACEHOLDER, webUrl: '', assetBase: hubBase() }) : '';
    }
    return db().collection('enewsIssues').doc(ISSUE_ID).set(data, { merge: true }).then(function () { savedState('Saved'); },
      function (e) { savedState('Not saved', 'err'); toast('Not saved: ' + (e.message || e)); });
  }
  function change(fn, opts) {
    if (!editable()) return;
    remember(); fn(); saveSoon();
    if (!opts || opts.canvas !== false) drawCanvas();
    if (!opts || opts.panel !== false) drawPanel();
  }

  /* ---- the page -------------------------------------------------------- */
  function drawShell() {
    var back = 'enews.html?issue=' + encodeURIComponent(ISSUE_ID);
    ed.innerHTML =
      '<div class="top"><a class="back" href="' + back + '">' + I('chevron-left') + '<span class="wide">E-news</span></a>' +
        '<input id="subj" aria-label="Subject" value="' + esc(ISSUE.subject || '') + '"' + (editable() ? '' : ' disabled') + '>' +
        '<span class="sp"></span><span class="saved" id="saved">' + I('check', 15) + 'Saved</span>' +
        '<button class="b" id="test" type="button">' + I('send', 16) + '<span class="wide">Send me a test</span></button>' +
        '<button class="b p" id="done" type="button" aria-haspopup="true">Done ' + I('chevron-down', 16) + '</button></div>' +
      '<div class="body">' +
        '<nav class="rail" aria-label="Editor">' + [['add', 'plus-square', 'Add'], ['look', 'palette', 'Look'], ['check', 'list-checks', 'Check']].map(function (r) {
          return '<button type="button" data-panel="' + r[0] + '" aria-pressed="false">' + I(r[1], 20) + r[2] + '</button>'; }).join('') + '</nav>' +
        '<aside class="side" id="side"></aside>' +
        '<div class="main"><div class="sub"><div class="dev" role="group" aria-label="Computer or phone">' +
            '<button type="button" data-dev="computer" aria-pressed="true" aria-label="Computer">' + I('monitor') + '</button>' +
            '<button type="button" data-dev="phone" aria-pressed="false" aria-label="Phone">' + I('smartphone') + '</button></div>' +
          '<div class="r"><button class="b g" id="undo" type="button" aria-label="Undo" disabled>' + I('undo-2') + '</button><button class="b g" id="redo" type="button" aria-label="Redo" disabled>' + I('redo-2') + '</button>' +
          '<button class="b" id="preview" type="button">' + I('eye', 16) + '<span class="wide">Preview</span></button></div></div>' +
          toolbar() +
          '<div class="canvas" id="canvas"><iframe id="cv" title="The email"></iframe></div></div>' +
      '</div>' +
      '<nav class="dock" aria-label="Editor">' + [['add', 'plus-square', 'Add'], ['look', 'palette', 'Look'], ['block', 'sliders-horizontal', 'This block'], ['check', 'list-checks', 'Check']].map(function (r) {
        return '<button type="button" data-panel="' + r[0] + '" aria-pressed="false">' + I(r[1], 20) + r[2] + '</button>'; }).join('') + '</nav>';
    icons(ed);
    document.getElementById('subj').oninput = function () { if (!typingSnap) { remember(); typingSnap = true; } ISSUE.subject = this.value; saveSoon(); };
    document.getElementById('subj').onblur = function () { typingSnap = false; };
    Array.prototype.forEach.call(ed.querySelectorAll('[data-panel]'), function (b) {
      b.onclick = function () {
        var p = b.getAttribute('data-panel');
        if (PHONE() && PANEL === p && document.getElementById('side').classList.contains('on')) { document.getElementById('side').classList.remove('on'); markPanel(); return; }
        if (p === 'block' && SEL < 0) { toast('Tap a block on the email first.'); return; }
        PANEL = p; drawPanel(true);
      };
    });
    Array.prototype.forEach.call(ed.querySelectorAll('[data-dev]'), function (b) {
      b.onclick = function () { DEVICE = b.getAttribute('data-dev'); Array.prototype.forEach.call(ed.querySelectorAll('[data-dev]'), function (x) { x.setAttribute('aria-pressed', String(x === b)); }); drawCanvas(); };
    });
    document.getElementById('undo').onclick = undo; document.getElementById('redo').onclick = redo;
    document.getElementById('preview').onclick = preview;
    document.getElementById('test').onclick = sendTest;
    document.getElementById('done').onclick = doneMenu;
    wireToolbar();
    document.addEventListener('keydown', function (e) {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'z' && !isTyping(e)) { e.preventDefault(); undo(); }
      if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'y' || (e.shiftKey && e.key.toLowerCase() === 'z')) && !isTyping(e)) { e.preventDefault(); redo(); }
    });
    if (!editable()) toast('This e-news has been sent: it can be looked at, not changed.');
  }
  function isTyping(e) { var t = e.target; return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable); }
  function markPanel() {
    var open = !PHONE() || document.getElementById('side').classList.contains('on');
    Array.prototype.forEach.call(ed.querySelectorAll('[data-panel]'), function (b) { b.setAttribute('aria-pressed', String(open && b.getAttribute('data-panel') === PANEL)); });
  }

  /* ---- the canvas: the email itself, in its edit mode ------------------ */
  function drawCanvas() {
    clearTimeout(drawT);
    var cv = document.getElementById('cv'); if (!cv) return;
    var wrapEl = document.getElementById('canvas');
    wrapEl.classList.toggle('phone', DEVICE === 'phone' && !PHONE());
    var y = wrapEl.scrollTop;
    var html = MB.render(Object.assign({}, ISSUE, { colours: SET.colours || {} }), {
      version: 'members', church: CHURCH, unsubscribeUrl: '#', webUrl: '#', preview: true, edit: true
    });
    cv.onload = function () { wireCanvas(cv); wrapEl.scrollTop = y; };
    cv.srcdoc = html;
  }
  var CANVAS_CSS = '[data-b]{cursor:pointer}[data-b]:hover{outline:1px dashed #8fb0b0;outline-offset:-1px}' +
    '[data-b].on{outline:2px solid #3d6263;outline-offset:-2px}[data-b][data-mem="1"]{box-shadow:inset 4px 0 0 #b07d2e}span[data-members]{background:#fbf1dc;box-shadow:inset 0 -2px 0 #b07d2e;border-radius:2px}' +
    '[data-edit]{cursor:text;outline:none;min-height:1em}[data-edit]:focus{background:rgba(61,98,99,.05)}' +
    '.ed-chip{position:absolute;z-index:5;display:flex;align-items:center;gap:4px;background:#3d6263;color:#fff;font:600 12px Inter,Arial,sans-serif;padding:4px 8px 4px 6px;border-radius:6px 6px 0 0;cursor:grab;user-select:none}' +
    '.ed-tools{position:absolute;z-index:5;display:flex;flex-direction:column;gap:2px;background:#fff;border:1px solid #e5e7eb;border-radius:10px;padding:4px;box-shadow:0 2px 6px rgba(16,24,40,.12)}' +
    '.ed-tools.row{flex-direction:row}.ed-tools button{width:36px;height:36px;border:0;border-radius:8px;background:#fff;color:#374151;cursor:pointer;display:flex;align-items:center;justify-content:center}' +
    '.ed-tools button:hover{background:#eef5f4}.ed-tools button.del{color:#b0392c}.ed-tools svg{width:17px;height:17px}' +
    '.ed-drop{position:absolute;z-index:6;height:4px;background:#3d6263;border-radius:2px;pointer-events:none}' +
    '.ed-link{position:absolute;z-index:7;display:flex;align-items:center;gap:6px;background:#fff;border:1px solid #e5e7eb;border-radius:10px;box-shadow:0 4px 12px rgba(16,24,40,.14);padding:7px 11px;font:500 13px Inter,Arial,sans-serif;color:#2a4a4b;cursor:pointer}';
  function svg(name) { try { return lucide.createElement(lucide.icons[name.replace(/(^|-)([a-z0-9])/g, function (m, a, c) { return c.toUpperCase(); })]).outerHTML; } catch (e) { return ''; } }
  function wireCanvas(cv) {
    var doc = cv.contentDocument; if (!doc) return;
    CV = cv;
    var st = doc.createElement('style'); st.textContent = CANVAS_CSS; doc.head.appendChild(st);
    var fit = function () { try { cv.style.height = Math.max(400, doc.documentElement.scrollHeight) + 'px'; } catch (e) {} };
    fit(); Array.prototype.forEach.call(doc.images, function (im) { im.addEventListener('load', fit); });
    if (window.ResizeObserver) new ResizeObserver(fit).observe(doc.body);
    /* Links never leave the editor. */
    doc.addEventListener('click', function (e) { var a = e.target.closest && e.target.closest('a'); if (a) e.preventDefault(); }, true);
    Array.prototype.forEach.call(doc.querySelectorAll('[data-b]'), function (t) {
      t.addEventListener('click', function (e) { var i = +t.getAttribute('data-b'); if (i !== SEL) select(i); e.stopPropagation(); });
    });
    if (editable()) Array.prototype.forEach.call(doc.querySelectorAll('[data-edit]'), function (el) {
      el.setAttribute('contenteditable', 'true');
      el.addEventListener('focus', function () { typingSnap = false; showTool(el.getAttribute('data-edit') !== 'text' && el.getAttribute('data-edit') !== 'label'); });
      var words = el.getAttribute('data-edit') !== 'text' && el.getAttribute('data-edit') !== 'label';
      el.addEventListener('mousedown', function () { showTool(words); });
      el.addEventListener('input', function () {
        showTool(words);
        if (!typingSnap) { remember(); typingSnap = true; }
        syncEdit(el); saveSoon();
      });
      el.addEventListener('blur', function () { typingSnap = false; setTimeout(function () { if (!doc.activeElement || !doc.activeElement.isContentEditable) showTool(false); }, 150); });
      el.addEventListener('keydown', function (e) { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); makeLink(); } });
    });
    doc.addEventListener('selectionchange', function () { linkOffer(doc); syncToolState(doc); });
    /* Dragging blocks: onto the email from Add, or a block to a new place. */
    var line = doc.createElement('div'); line.className = 'ed-drop'; line.style.display = 'none'; doc.body.appendChild(line);
    var target = function (y) {
      var bs = Array.prototype.slice.call(doc.querySelectorAll('[data-b]'));
      if (!bs.length) return { at: (ISSUE.blocks || []).length, y: 60 };
      for (var k = 0; k < bs.length; k++) { var r = bs[k].getBoundingClientRect(); if (y < r.top + r.height / 2) return { at: +bs[k].getAttribute('data-b'), y: r.top + doc.defaultView.scrollY, x: r.left, w: r.width }; }
      var last = bs[bs.length - 1].getBoundingClientRect();
      return { at: +bs[bs.length - 1].getAttribute('data-b') + 1, y: last.bottom + doc.defaultView.scrollY, x: last.left, w: last.width };
    };
    doc.addEventListener('dragover', function (e) {
      e.preventDefault(); var tg = target(e.clientY);
      line.style.display = 'block'; line.style.top = (tg.y - 2) + 'px'; line.style.left = (tg.x || 0) + 'px'; line.style.width = (tg.w || 600) + 'px';
    });
    doc.addEventListener('dragleave', function (e) { if (!e.relatedTarget) line.style.display = 'none'; });
    doc.addEventListener('drop', function (e) {
      e.preventDefault(); line.style.display = 'none';
      var d = e.dataTransfer.getData('text/plain') || '', tg = target(e.clientY);
      if (d.indexOf('add:') === 0) addBlock(d.slice(4), tg.at);
      else if (d.indexOf('move:') === 0) moveTo(+d.slice(5), tg.at);
    });
    if (SEL >= 0) decorate();
  }
  function syncEdit(el) {
    var tb = el.closest('[data-b]'); if (!tb) return;
    var b = ISSUE.blocks[+tb.getAttribute('data-b')]; if (!b) return;
    var k = el.getAttribute('data-edit');
    if (k === 'html') b.html = EGBCEditor.clean(el.innerHTML, rules());
    else if (k === 'text') b.text = el.textContent.replace(/\s+/g, ' ').trim().slice(0, 200);
    else if (k === 'label') b.label = el.textContent.replace(/\s+/g, ' ').trim().slice(0, 120);
    else if (/^col\d$/.test(k)) { b.cols = b.cols || []; var n = +k.slice(3); b.cols[n] = Object.assign({}, b.cols[n] || {}, { html: EGBCEditor.clean(el.innerHTML, rules()) }); }
    b.auto = false;
  }

  /* ---- picking a block, and the things beside it ------------------------ */
  function select(i) {
    SEL = i; TAB = 'content';
    if (CV && CV.contentDocument) decorate();
    PANEL = 'block'; drawPanel(!PHONE());
  }
  function decorate() {
    var doc = CV.contentDocument; if (!doc) return;
    Array.prototype.forEach.call(doc.querySelectorAll('.ed-chip,.ed-tools'), function (x) { x.remove(); });
    Array.prototype.forEach.call(doc.querySelectorAll('[data-b].on'), function (x) { x.classList.remove('on'); });
    var t = doc.querySelector('[data-b="' + SEL + '"]'); if (!t) return;
    t.classList.add('on');
    var r = t.getBoundingClientRect(), sy = doc.defaultView.scrollY, W = doc.documentElement.clientWidth;
    var b = ISSUE.blocks[SEL];
    if (!editable()) return;
    var chip = doc.createElement('div'); chip.className = 'ed-chip'; chip.setAttribute('draggable', 'true');
    chip.innerHTML = svg('grip-vertical') + esc(NAMES[b.type] || b.type);
    chip.style.left = r.left + 'px'; chip.style.top = Math.max(0, r.top + sy - 24) + 'px';
    chip.addEventListener('dragstart', function (e) { e.dataTransfer.setData('text/plain', 'move:' + SEL); e.dataTransfer.effectAllowed = 'move'; });
    doc.body.appendChild(chip);
    var tools = doc.createElement('div'); tools.className = 'ed-tools';
    var room = W - r.right > 54;
    if (!room) tools.classList.add('row');
    tools.innerHTML = [['up', 'arrow-up', 'Move up'], ['down', 'arrow-down', 'Move down'], ['copy', 'copy', 'Copy'], ['del', 'trash-2', 'Delete']].map(function (x) {
      return '<button type="button" data-t="' + x[0] + '" title="' + x[2] + '" aria-label="' + x[2] + '"' + (x[0] === 'del' ? ' class="del"' : '') + '>' + svg(x[1]) + '</button>'; }).join('');
    if (room) { tools.style.left = (r.right + 8) + 'px'; tools.style.top = (r.top + sy) + 'px'; }
    else { tools.style.right = '6px'; tools.style.top = Math.max(0, r.top + sy - 46) + 'px'; }
    tools.addEventListener('click', function (e) {
      var x = e.target.closest('[data-t]'); if (!x) return; e.stopPropagation();
      var k = x.getAttribute('data-t');
      if (k === 'up') moveTo(SEL, SEL - 1); else if (k === 'down') moveTo(SEL, SEL + 2);
      else if (k === 'copy') change(function () { ISSUE.blocks.splice(SEL + 1, 0, JSON.parse(JSON.stringify(ISSUE.blocks[SEL]))); SEL = SEL + 1; });
      else if (k === 'del') { var gone = NAMES[ISSUE.blocks[SEL].type] || 'block'; change(function () { ISSUE.blocks.splice(SEL, 1); SEL = -1; PANEL = 'add'; }); toast(gone + ' removed. Undo brings it back.'); }
    });
    doc.body.appendChild(tools);
  }
  /* Move block `from` so it lands before index `at` (at = length: the end). */
  function moveTo(from, at) {
    var n = ISSUE.blocks.length; if (from < 0 || from >= n) return;
    at = Math.max(0, Math.min(n, at));
    if (at === from || at === from + 1) return;
    change(function () { var b = ISSUE.blocks.splice(from, 1)[0]; var to = at > from ? at - 1 : at; ISSUE.blocks.splice(to, 0, b); SEL = to; });
  }

  /* ---- the words toolbar ----------------------------------------------- */
  var EMOJI = ['😊', '🙏', '❤️', '🎉', '✨', '👍', '🙌', '😀', '📅', '⏰', '📍', '🎟', '👉', '☕', '🍰', '🥧', '🎵', '🎶', '📖', '✝️', '⛪', '🌿', '🍂', '🎄', '🕯', '🌸', '☀️', '🍪', '🧡', '💚', '⭐', '🎁'];
  function toolbar() {
    return '<div class="tool" id="tool" role="toolbar" aria-label="Words">' +
      '<select id="t-style" aria-label="Style of words"><option value="p">Normal words</option><option value="h2">Heading</option><option value="h3">Small heading</option></select>' +
      /* Font, size and line height start from the church's look (Look);
         "Our look" puts a selection back to it. */
      '<select id="t-font" aria-label="Font"></select><select id="t-size" aria-label="Size"></select><select id="t-lh" aria-label="Line height"></select><select id="t-ls" aria-label="Letter spacing"></select><span class="sep"></span>' +
      [['bold', 'bold', 'Bold'], ['italic', 'italic', 'Italic'], ['underline', 'underline', 'Underline'], ['strikeThrough', 'strikethrough', 'Crossed out'], '|',
        ['colour', 'baseline', 'Colour'], ['highlight', 'highlighter', 'Highlight'], ['link', 'link', 'Make it a link'], ['emoji', 'smile', 'Emoji'], '|',
        ['insertUnorderedList', 'list', 'Bullet list'], ['insertOrderedList', 'list-ordered', 'Numbered list'], ['members', 'lock', 'Members only: these words for church members only'], ['ourlook', 'rotate-ccw', 'Back to our look']].map(function (x) {
        return x === '|' ? '<span class="sep"></span>' : '<button type="button" data-cmd="' + x[0] + '" title="' + x[2] + '" aria-label="' + x[2] + '">' + I(x[1]) + (x[0] === 'members' ? '<span style="margin:0 4px;font-size:12px;font-weight:600">Members only</span>' : '') + (x[0] === 'ourlook' ? '<span style="margin:0 4px;font-size:12px;font-weight:600">Our look</span>' : '') + '</button>'; }).join('') +
      '</div><div class="pop" id="pop-colour" role="menu" aria-label="Colour"></div><div class="pop" id="pop-hl" role="menu" aria-label="Highlight"></div><div class="pop" id="pop-emoji"><div class="emo">' + EMOJI.map(function (e) { return '<button type="button" data-emo="' + e + '">' + e + '</button>'; }).join('') + '</div></div>';
  }
  function showTool(on) { var t = document.getElementById('tool'); if (t) t.classList.toggle('on', !!on && editable()); if (!on) Array.prototype.forEach.call(document.querySelectorAll('.pop'), function (p) { p.classList.remove('on'); }); }
  function cdoc() { return CV && CV.contentDocument; }
  function exec(c, v) {
    var d = cdoc(); if (!d) return;
    try { d.execCommand('styleWithCSS', false, /^(foreColor|hiliteColor|fontName|fontSize)$/.test(c)); } catch (e) {}
    d.execCommand(c, false, v === undefined ? null : v);
    var el = d.activeElement; if (el && el.getAttribute && el.getAttribute('data-edit')) { if (!typingSnap) { remember(); typingSnap = true; } syncEdit(el); saveSoon(); }
  }
  function wireToolbar() {
    var tool = document.getElementById('tool');
    tool.addEventListener('mousedown', function (e) { if (e.target.closest('button')) e.preventDefault(); });
    tool.addEventListener('click', function (e) {
      var b = e.target.closest('[data-cmd]'); if (!b) return;
      var c = b.getAttribute('data-cmd');
      if (c === 'colour') return popAt('pop-colour', b);
      if (c === 'emoji') return popAt('pop-emoji', b);
      if (c === 'link') return makeLink();
      if (c === 'highlight') return popAt('pop-hl', b);
      if (c === 'ourlook') return ourLook();
      if (c === 'members') return membersWords();
      exec(c);
    });
    document.getElementById('t-style').onchange = function () { exec('formatBlock', this.value); };
    fillLookLists();
    document.getElementById('t-font').onchange = function () { if (this.value) exec('fontName', this.value); fillLookLists(); };
    document.getElementById('t-size').onchange = function () { if (this.value) setSize(+this.value); fillLookLists(); };
    document.getElementById('t-lh').onchange = function () { if (this.value) setLineHeight(this.value); fillLookLists(); };
    document.getElementById('t-ls').onchange = function () { setLetterSpacing(this.value); fillLookLists(); };
    ['t-font', 't-size', 't-lh', 't-ls'].forEach(function (id) { document.getElementById(id).addEventListener('mousedown', function () { keepRange(); }); });
    var ph = document.getElementById('pop-hl');
    ph.addEventListener('mousedown', function (e) { e.preventDefault(); });
    ph.addEventListener('click', function (e) { var b = e.target.closest('[data-hl]'); if (!b) return; exec('hiliteColor', b.getAttribute('data-hl')); ph.classList.remove('on'); });
    var pc = document.getElementById('pop-colour');
    pc.addEventListener('mousedown', function (e) { e.preventDefault(); });
    pc.addEventListener('click', function (e) { var b = e.target.closest('[data-colour]'); if (!b) return; exec('foreColor', b.getAttribute('data-colour')); pc.classList.remove('on'); });
    var pe = document.getElementById('pop-emoji');
    pe.addEventListener('mousedown', function (e) { e.preventDefault(); });
    pe.addEventListener('click', function (e) { var b = e.target.closest('[data-emo]'); if (!b) return; exec('insertText', b.getAttribute('data-emo')); pe.classList.remove('on'); });
  }
  /* The look's own font, size and line height head each list. */
  function fillLookLists() {
    var t = theme(), lookFont = String(t.font || '').split(',')[0];
    var f = document.getElementById('t-font'), z = document.getElementById('t-size'), l = document.getElementById('t-lh');
    if (!f) return;
    f.innerHTML = '<option value="">' + esc(lookFont) + ' (our look)</option>' + Object.keys(MB.FONTS).map(function (n) { return '<option value="' + esc(n) + '">' + esc(n) + '</option>'; }).join('');
    z.innerHTML = '<option value="">15 (our look)</option>' + MB.SIZES.map(function (n) { return '<option value="' + n + '">' + n + '</option>'; }).join('');
    l.innerHTML = '<option value="">150% (our look)</option>' + MB.LINE_HEIGHTS.map(function (n) { return '<option value="' + n + '">' + n + ' lines</option>'; }).join('');
    var ls = document.getElementById('t-ls');
    if (ls) ls.innerHTML = '<option value="">Normal spacing (our look)</option>' + MB.LETTER_SPACINGS.map(function (n) { return '<option value="' + n + '">' + n + ' apart</option>'; }).join('');
  }
  /* Selects take the focus from the email: keep the selection, put it back. */
  var RANGE = null;
  function keepRange() { var d = cdoc(); if (!d) return; var s = d.getSelection(); if (s && s.rangeCount) RANGE = s.getRangeAt(0).cloneRange(); }
  function restoreRange() { var d = cdoc(); if (!d || !RANGE) return; var host = RANGE.startContainer.nodeType === 1 ? RANGE.startContainer : RANGE.startContainer.parentElement; var ed = host && host.closest && host.closest('[data-edit]'); if (ed) ed.focus(); var s = d.getSelection(); s.removeAllRanges(); s.addRange(RANGE); }
  function editHost() { var d = cdoc(); if (!d) return null; var s = d.getSelection(); if (!s || !s.rangeCount) return null; var n = s.getRangeAt(0).commonAncestorContainer; n = n.nodeType === 1 ? n : n.parentElement; return n && n.closest && n.closest('[data-edit]'); }
  function afterStyle(el) { if (!el) return; if (!typingSnap) { remember(); typingSnap = true; } syncEdit(el); saveSoon(); }
  /* Size: the browser's own size command, then the size in pixels. */
  function setSize(px) {
    restoreRange(); var d = cdoc(); var el = editHost(); if (!d || !el) return;
    try { d.execCommand('styleWithCSS', false, true); } catch (e) {}
    d.execCommand('fontSize', false, '7');
    Array.prototype.forEach.call(el.querySelectorAll('font[size="7"],span[style*="xxx-large"],span[style*="-webkit-xxx-large"]'), function (x) {
      if (x.tagName === 'FONT') { var sp = d.createElement('span'); sp.append.apply(sp, x.childNodes); x.replaceWith(sp); x = sp; }
      x.style.fontSize = px + 'px';
    });
    afterStyle(el);
  }
  /* Line height: the paragraphs the selection is in. */
  function setLineHeight(v) {
    restoreRange(); var d = cdoc(); var el = editHost(); if (!d || !el) return;
    var r = d.getSelection().getRangeAt(0);
    Array.prototype.forEach.call(el.querySelectorAll('p,li,h2,h3'), function (b) { if (r.intersectsNode(b)) b.style.lineHeight = v; });
    afterStyle(el);
  }
  /* Letter spacing: each piece of selected text gets its own span (so it
     works across paragraphs and keeps any size or font already there);
     "Normal" takes it off again. */
  function setLetterSpacing(v) {
    restoreRange(); var d = cdoc(); var el = editHost(); if (!d || !el) return;
    var r = d.getSelection().getRangeAt(0); if (r.collapsed) return;
    var w = d.createTreeWalker(el, NodeFilter.SHOW_TEXT), n, nodes = [];
    while ((n = w.nextNode())) if (n.nodeValue.length && r.intersectsNode(n)) nodes.push(n);
    var sc = r.startContainer, so = r.startOffset, ec = r.endContainer, eo = r.endOffset;
    nodes.forEach(function (t) {
      var a = t === sc ? so : 0, b = t === ec ? eo : t.nodeValue.length;
      if (b <= a) return;
      if (b < t.nodeValue.length) t.splitText(b);
      if (a > 0) t = t.splitText(a);
      for (var up = t.parentElement; up && up !== el; up = up.parentElement) if (up.style && up.style.letterSpacing && up.textContent === t.nodeValue) up.style.removeProperty('letter-spacing');
      if (!v) return;
      var sp = d.createElement('span'); sp.style.letterSpacing = v; t.replaceWith(sp); sp.appendChild(t);
    });
    if (!v) Array.prototype.forEach.call(el.querySelectorAll('span'), function (x) { if (r.intersectsNode(x)) x.style.removeProperty('letter-spacing'); if (!x.getAttribute('style')) x.removeAttribute('style'); if (!x.attributes.length && x.parentNode) { var f = d.createDocumentFragment(); while (x.firstChild) f.appendChild(x.firstChild); x.replaceWith(f); } });
    afterStyle(el);
  }
  /* MEMBERS ONLY, for selected words (Martin, 21 Oct): the Zoom ID and
     passcode inside a card, a private link in Sunday's words. They stay in
     the members' copy as they are, and leave everyone else's copy and the
     web version (egbc-mailblocks.js stripMembers) - nothing else moves.
     Gold on the email here. Pressed again inside them: for everyone again.
     A link chosen whole is marked whole, so its address goes with it. */
  function membersWords() {
    var d = cdoc(); var el = editHost(); if (!d || !el) { toast('Select the words first.'); return; }
    var sel = d.getSelection(), r = sel.rangeCount ? sel.getRangeAt(0) : null;
    var at = r && (r.commonAncestorContainer.nodeType === 1 ? r.commonAncestorContainer : r.commonAncestorContainer.parentElement);
    var inside = at && at.closest && at.closest('span[data-members]');
    if (inside && el.contains(inside)) {
      var f = d.createDocumentFragment(); while (inside.firstChild) f.appendChild(inside.firstChild); inside.replaceWith(f);
      afterStyle(el); toast('For everyone again.'); return;
    }
    if (!r || r.collapsed) { toast('Select the words first.'); return; }
    var w = d.createTreeWalker(el, NodeFilter.SHOW_TEXT), n, nodes = [];
    while ((n = w.nextNode())) if (n.nodeValue.length && r.intersectsNode(n)) nodes.push(n);
    var sc = r.startContainer, so = r.startOffset, ec = r.endContainer, eo = r.endOffset, done = [];
    nodes.forEach(function (t) {
      var a = t === sc ? so : 0, b = t === ec ? eo : t.nodeValue.length;
      if (b <= a) return;
      if (b < t.nodeValue.length) t.splitText(b);
      if (a > 0) t = t.splitText(a);
      var link = t.parentElement && t.parentElement.closest('a');
      var target = link && el.contains(link) && link.textContent === t.nodeValue ? link : t;
      var host = target.nodeType === 1 ? target : target.parentElement;
      if (done.indexOf(target) >= 0 || (host && host.closest('span[data-members]'))) return;
      var sp = d.createElement('span'); sp.setAttribute('data-members', '1'); target.replaceWith(sp); sp.appendChild(target); done.push(target);
    });
    afterStyle(el); toast('Members only: left out of everyone else’s copy and the web version.');
  }
  /* "Back to our look": the selection loses its font, size, line height,
     highlight and colour (bold, links and lists stay). */
  function ourLook() {
    var d = cdoc(); var el = editHost(); if (!d || !el) { toast('Select the words to put back to our look first.'); return; }
    var r = d.getSelection().getRangeAt(0);
    /* Everything in the selection, found BEFORE anything changes: taking a
       span away moves its words, and the selection would lose the rest. */
    var hit = Array.prototype.filter.call(el.querySelectorAll('span,p,li,h2,h3,font'), function (x) { return r.intersectsNode(x); });
    hit.forEach(function (x) {
      if (!x.isConnected) return;
      ['font-family', 'font-size', 'line-height', 'letter-spacing', 'background-color', 'color'].forEach(function (k) { x.style.removeProperty(k); });
      if (x.tagName === 'FONT') x.removeAttribute('color'), x.removeAttribute('face'), x.removeAttribute('size');
      if (!x.getAttribute('style')) x.removeAttribute('style');
      if ((x.tagName === 'SPAN' || x.tagName === 'FONT') && !x.attributes.length) { var f = d.createDocumentFragment(); while (x.firstChild) f.appendChild(x.firstChild); x.replaceWith(f); }
    });
    afterStyle(el); fillLookLists(); toast('Back to our look.');
  }
  function popAt(id, btn) {
    var p = document.getElementById(id);
    if (id === 'pop-hl') p.innerHTML = '<p class="m" style="margin:0 0 8px">Highlight</p><div class="sw">' + MB.HIGHLIGHTS.map(function (c) {
      return '<button type="button" data-hl="' + c + '" title="' + c + '" aria-label="Highlight ' + c + '" style="background:' + c + '"></button>'; }).join('') + '</div>';
    if (id === 'pop-colour') p.innerHTML = '<p class="m" style="margin:0 0 8px">Colour (the church’s)</p><div class="sw">' + palette().map(function (c) {
      return '<button type="button" data-colour="' + c + '" title="' + c + '" aria-label="Colour ' + c + '" style="background:' + c + '"></button>'; }).join('') + '</div>';
    var r = btn.getBoundingClientRect(), host = document.querySelector('.main').getBoundingClientRect();
    p.style.left = Math.max(4, r.left - host.left) + 'px'; p.style.top = (r.bottom - host.top + 4) + 'px';
    document.querySelector('.main').appendChild(p);
    var was = p.classList.contains('on');
    Array.prototype.forEach.call(document.querySelectorAll('.pop'), function (x) { x.classList.remove('on'); });
    p.classList.toggle('on', !was);
  }
  function syncToolState(doc) {
    var tool = document.getElementById('tool'); if (!tool || !tool.classList.contains('on')) return;
    ['bold', 'italic', 'underline', 'strikeThrough', 'insertUnorderedList', 'insertOrderedList'].forEach(function (c) {
      var b = tool.querySelector('[data-cmd="' + c + '"]'); try { if (b) b.classList.toggle('on', doc.queryCommandState(c)); } catch (e) {}
    });
    try { var v = (doc.queryCommandValue('formatBlock') || 'p').toLowerCase(); document.getElementById('t-style').value = /^h[23]$/.test(v) ? v : 'p'; } catch (e) {}
    try {
      var s = doc.getSelection(), n = s && s.anchorNode; n = n && (n.nodeType === 1 ? n : n.parentElement);
      var span = n && n.closest && n.closest('span[style]'), blk = n && n.closest && n.closest('p,li,h2,h3');
      var ff = span && span.style.fontFamily ? span.style.fontFamily.split(',')[0].replace(/["']/g, '').trim() : '';
      var fz = span && /^(\d+)px$/.exec(span.style.fontSize || '');
      document.getElementById('t-font').value = MB.FONTS[ff] ? ff : '';
      document.getElementById('t-size').value = fz && MB.SIZES.indexOf(+fz[1]) >= 0 ? fz[1] : '';
      document.getElementById('t-lh').value = blk && MB.LINE_HEIGHTS.indexOf(blk.style.lineHeight) >= 0 ? blk.style.lineHeight : '';
      var lsp = n && n.closest && n.closest('span[style*="letter-spacing"]');
      document.getElementById('t-ls').value = lsp && MB.LETTER_SPACINGS.indexOf(lsp.style.letterSpacing) >= 0 ? lsp.style.letterSpacing : '';
    } catch (e) {}
  }
  /* Selecting a word offers "Make it a link", beside it. */
  function linkOffer(doc) {
    var old = doc.querySelector('.ed-link'); if (old) old.remove();
    var s = doc.getSelection(); if (!s || s.isCollapsed || !s.rangeCount) return;
    var host = s.anchorNode && (s.anchorNode.nodeType === 1 ? s.anchorNode : s.anchorNode.parentElement);
    var ed2 = host && host.closest && host.closest('[data-edit="html"],[data-edit^="col"]'); if (!ed2) return;
    var r = s.getRangeAt(0).getBoundingClientRect();
    var b = doc.createElement('div'); b.className = 'ed-link'; b.innerHTML = svg('link') + 'Make it a link';
    b.style.left = r.left + 'px'; b.style.top = (r.bottom + doc.defaultView.scrollY + 6) + 'px';
    b.addEventListener('mousedown', function (e) { e.preventDefault(); });
    b.addEventListener('click', function () { b.remove(); makeLink(); });
    doc.body.appendChild(b);
  }
  function makeLink() {
    var doc = cdoc(); if (!doc) return;
    var s = doc.getSelection(); if (!s || s.isCollapsed) { toast('Select the words to make into a link first.'); return; }
    var range = s.getRangeAt(0).cloneRange();
    var url = prompt('Link to (a web address, or an email address):', 'https://');
    if (!url || url === 'https://') return;
    url = url.trim();
    if (/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(url)) url = 'mailto:' + url;
    else if (!/^(https?:|mailto:)/i.test(url)) url = 'https://' + url;
    if (!MB.safeUrl(url)) { toast('That doesn’t look like a web address.'); return; }
    s.removeAllRanges(); s.addRange(range);
    exec('createLink', url);
  }

  /* ---- the left panel ----------------------------------------------------- */
  function drawPanel(open) {
    var side = document.getElementById('side'); if (!side) return;
    if (PANEL === 'block' && (SEL < 0 || !ISSUE.blocks[SEL])) PANEL = 'add';
    if (PANEL === 'add') side.innerHTML = addPanel();
    else if (PANEL === 'look') side.innerHTML = lookPanel();
    else if (PANEL === 'check') side.innerHTML = checkPanel();
    else side.innerHTML = blockPanel();
    if (open && PHONE()) side.classList.add('on');
    if (PHONE()) side.insertAdjacentHTML('afterbegin', '<button type="button" class="b g" id="p-close" aria-label="Close" style="position:sticky;top:6px;float:right;margin:6px -8px 0 0;z-index:2">' + I('x', 18) + '</button>');
    icons(side); markPanel();
    var cl = document.getElementById('p-close'); if (cl) cl.onclick = function () { side.classList.remove('on'); markPanel(); };
    if (PANEL === 'add') wireAdd(); else if (PANEL === 'look') wireLook(); else if (PANEL === 'check') wireCheck(); else wireBlock();
  }

  /* Add: drag a block onto the email (or tap it: it goes after the one
     picked, or at the end). */
  var TILES = [['picture', 'image', 'Picture'], ['heading', 'heading', 'Heading'], ['text', 'pilcrow', 'Words'], ['button', 'mouse-pointer-click', 'Button'], ['divider', 'minus', 'Line'],
    ['spacer', 'move-vertical', 'Space'], ['video', 'youtube', 'Video'], ['social', 'share-2', 'Social links'], ['logo', 'badge', 'Logo'], ['footer', 'panel-bottom', 'Footer']];
  var HUB = [['header', 'image-plus', 'The week’s picture'], ['section', 'rectangle-horizontal', 'Section bar'], ['event', 'calendar', 'Event'], ['verse', 'book-open', 'Bible verse'], ['sunday', 'church', 'This Sunday'], ['meeting', 'video', 'Meeting'], ['diary', 'calendar-days', 'Dates for the diary'], ['notices', 'pin', 'Notices']];
  var LAYOUTS = [['text', 'square', '1 column'], ['columns2', 'columns-2', '2 columns'], ['columns3', 'columns-3', '3 columns'], ['card', 'layout-panel-left', 'Picture and words'], ['cardr', 'layout-panel-left', 'Words and picture'], ['pictures', 'images', 'Two pictures']];
  function tiles(list, hub) {
    return '<div class="grid">' + list.map(function (t) {
      return '<button type="button" class="tile' + (hub ? ' hub' : '') + '" draggable="' + (editable() ? 'true' : 'false') + '" data-add="' + t[0] + '">' + I(t[1], 20) + esc(t[2]) + '</button>'; }).join('') + '</div>';
  }
  function addPanel() {
    return '<h3>Blocks</h3><p class="s">Drag one onto the email, where you want it. Or tap it: it goes after the block you picked.</p>' + tiles(TILES) +
      '<h3>From the hub</h3><p class="s">Filled in for you.</p>' + tiles(HUB, true) +
      '<h3>Layouts</h3><p class="s">Columns, and ready-made rows.</p>' + tiles(LAYOUTS);
  }
  function wireAdd() {
    Array.prototype.forEach.call(document.querySelectorAll('[data-add]'), function (t) {
      t.addEventListener('dragstart', function (e) { e.dataTransfer.setData('text/plain', 'add:' + t.getAttribute('data-add')); e.dataTransfer.effectAllowed = 'copy'; });
      t.onclick = function () { addBlock(t.getAttribute('data-add'), SEL >= 0 ? SEL + 1 : (ISSUE.blocks || []).length); };
    });
  }
  function nextSunday() { var d = new Date(); var t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + ((7 - d.getUTCDay()) % 7), 12)); return t; }
  function clock12(hhmm) { var m = /^(\d{1,2}):(\d{2})/.exec(String(hhmm || '')); if (!m) return ''; var h = +m[1]; return (h % 12 || 12) + (+m[2] ? ':' + m[2] : '') + (h < 12 ? 'am' : 'pm'); }
  function addBlock(kind, at) {
    if (!editable()) return;
    if (kind === 'footer') { PANEL = 'look'; drawPanel(true); toast('The footer is the church’s: its details are in Look.'); return; }
    var put = function (b) { change(function () { ISSUE.blocks.splice(Math.max(0, Math.min(at, ISSUE.blocks.length)), 0, b); SEL = Math.max(0, Math.min(at, ISSUE.blocks.length - 1)); PANEL = 'block'; }); };
    var simple = {
      picture: { type: 'picture', url: '' }, heading: { type: 'heading', text: 'A heading' }, text: { type: 'text', html: '<p>Type your words here.</p>' },
      button: { type: 'button', label: 'Find out more', url: '' }, divider: { type: 'divider' }, spacer: { type: 'spacer' }, video: { type: 'video', url: '' },
      social: { type: 'social' }, logo: { type: 'logo', url: (window.EGBCChurch && EGBCChurch.logo && EGBCChurch.logo()) || '' }, verse: { type: 'verse', text: '', ref: '' },
      columns2: { type: 'columns', cols: [{ html: '<p>Left words.</p>' }, { html: '<p>Right words.</p>' }] },
      columns3: { type: 'columns', cols: [{ html: '<p>Words.</p>' }, { html: '<p>Words.</p>' }, { html: '<p>Words.</p>' }] },
      card: { type: 'event', imageUrl: '', html: '<p><strong>A title</strong><br>Type the words here.</p>' },
      cardr: { type: 'event', side: 'right', imageUrl: '', html: '<p><strong>A title</strong><br>Type the words here.</p>' },
      pictures: { type: 'pictures', urls: ['', ''] },
      /* The two the old editor also added (21 Oct: it is replaced by this one). */
      header: { type: 'header', imageUrl: '', alt: '', title: '' }, section: { type: 'section', label: 'Coming up this week' }
    };
    if (simple[kind]) return put(simple[kind]);
    if (kind === 'event') return pickEvent(put);
    if (kind === 'meeting') {
      if (!window.EGBCMeetingPick) { toast('The meetings list is not available here.'); return; }
      return EGBCMeetingPick.open({ base: hubBase(), onPick: function (m) { put(m); } });
    }
    if (kind === 'diary') {
      var now = Date.now();
      return EGBCComms.eventsBetween(now - 86400000, now + 6 * 7 * 86400000).then(function (all) {
        put({ type: 'diary', title: 'Dates for the diary', weeks: 6, items: MB.diaryItems({ now: new Date(now), weeks: 6, events: all, base: hubBase() }) });
      }, function (e) { toast('Could not read What’s On: ' + (e.message || e)); });
    }
    if (kind === 'sunday') {
      /* Every service that Sunday, in every building (C-51): main's
         EGBCPlanStore.dayServices decides which and in what order. */
      var d = nextSunday(), iso = d.toISOString().slice(0, 10), label = 'Sunday ' + d.getUTCDate() + ' ' + d.toLocaleString('en-GB', { month: 'long', timeZone: 'UTC' });
      return Promise.all([db().collection('events').where('date', '==', iso).get(),
        db().collection('sites').get().then(function (s) { var o = {}; s.docs.forEach(function (x) { if (x.data().active !== false) o[x.id] = x.data().name || ''; }); return o; }, function () { return {}; })]).then(function (r) {
        var list = MB.serviceBlocks(EGBCPlanStore.dayServices(r[0].docs.map(function (x) { return Object.assign({ id: x.id }, x.data()); }), iso), label, r[1]).map(function (b) { delete b.auto; return b; });
        if (!list.length) return put({ type: 'sunday', date: label, time: '', title: 'Sunday service', speaker: '' });
        change(function () { var i = Math.max(0, Math.min(at, ISSUE.blocks.length)); Array.prototype.splice.apply(ISSUE.blocks, [i, 0].concat(list)); SEL = i; PANEL = 'block'; });
      }, function () { put({ type: 'sunday', date: '', time: '', title: 'Sunday service', speaker: '' }); });
    }
    if (kind === 'notices') {
      return db().collection('news').orderBy('createdAt', 'desc').limit(30).get().then(function (s) {
        var ns = s.docs.map(function (x) { return Object.assign({ id: x.id }, x.data()); });
        var d = MB.draft({ now: new Date(), events: [], notices: ns, base: hubBase() }).filter(function (b) { return b.type === 'notices'; })[0];
        if (!d) { toast('No notices for everyone at the moment.'); return; }
        put(d);
      }, function (e) { toast('Could not read the notices: ' + (e.message || e)); });
    }
  }
  /* An event from What's On: the next 60 days, the same rules as the draft. */
  function pickEvent(put) {
    var side = document.getElementById('side');
    side.innerHTML = '<button type="button" class="pback" id="pk-back">' + I('chevron-left', 16) + 'Back to blocks</button><div class="ptitle">An event from What’s On</div><div class="pick" id="pk"><p class="m">Loading…</p></div>';
    icons(side); if (PHONE()) side.classList.add('on');
    document.getElementById('pk-back').onclick = function () { PANEL = 'add'; drawPanel(true); };
    var now = Date.now();
    EGBCComms.eventsBetween(now - 86400000, now + 60 * 86400000).then(function (all) {
      var evs = all.filter(function (e) { return MB.eventShare(e) && e.source !== 'rota'; });
      var el = document.getElementById('pk'); if (!el) return;
      if (!evs.length) { el.innerHTML = '<p class="m">Nothing in What’s On in the next two months.</p>'; return; }
      el.innerHTML = evs.map(function (e, k) {
        return '<a data-k="' + k + '"><span><b style="color:var(--ink)">' + esc(e.title || 'Untitled') + '</b><br><span class="m">' + esc(new Date(e.startUtc).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Europe/London' })) + '</span></span>' +
          (MB.eventShare(e) === 'members' ? '<span class="m" style="margin-left:auto;color:var(--gold)">Members</span>' : '') + '</a>'; }).join('');
      Array.prototype.forEach.call(el.querySelectorAll('[data-k]'), function (a) {
        a.onclick = function () {
          var e = evs[+a.getAttribute('data-k')];
          var one = MB.draft({ now: new Date(e.startUtc - 3600000), days: 1, events: [e], notices: [], base: hubBase() }).filter(function (b) { return b.type === 'event'; })[0];
          if (one) { one.auto = false; put(one); }
        };
      });
    }, function (e) { var el = document.getElementById('pk'); if (el) el.innerHTML = '<p class="m">Could not load: ' + esc(e.message || e) + '</p>'; });
  }

  /* The picked block's settings: Content, Style, Who sees it. */
  function picField(id, lab, v) { return field(id, lab + ' (a link, or choose one below)', v, 'url', ' placeholder="https://"') + '<div class="pics" id="pics-' + id + '"></div>'; }
  /* Pictures from Unsplash (egbc-unsplash.js; the server searches): the
     picture is shown from Unsplash, its credit kept with the block and put
     under it in the email, and Unsplash told it was used. */
  function unsplashBtn(b, cur) {
    if (!window.EGBCUnsplash) return '';
    var c = b.credit && b.credit.url === cur ? b.credit : null;
    return '<div style="margin-top:8px"><button type="button" class="b" id="f-unsplash">' + I('search', 16) + 'Search Unsplash</button></div>' +
      (c ? '<p class="m" id="f-credit">' + esc(EGBCUnsplash.creditText(c)) + ' (shown under it in the email)</p>' : '');
  }
  function loadPics() {
    if (PICS) return Promise.resolve(PICS);
    /* Every picture in the library (C-52: no cap), newest first. */
    return EGBCComms.allDocs(db().collection('pictureLibrary').orderBy('createdAt', 'desc'), 500).then(function (docs) {
      PICS = docs.map(function (d) { return { url: d.data().url || '', name: d.data().name || '' }; }).filter(function (p) { return MB.safeUrl(p.url); }); return PICS;
    }, function () { PICS = []; return PICS; });
  }
  function contentFields(b) {
    var t = b.type;
    if (t === 'header') return picField('f-img', 'The week’s picture', b.imageUrl) + unsplashBtn(b, b.imageUrl) + field('f-alt', 'Describe it (for people who can’t see it)', b.alt) + field('f-link', 'Link when tapped (optional)', b.link, 'url') +
      field('f-title', 'A title under it (optional)', b.title);
    if (t === 'picture') return picField('f-img', 'Picture', b.url) + unsplashBtn(b, b.url) + field('f-alt', 'Describe it', b.alt) + field('f-link', 'Link when tapped (optional)', b.link, 'url') + field('f-cap', 'Caption (optional)', b.caption);
    if (t === 'event') return '<p class="m">Type the words on the email. Make the first line bold for a title.</p>' + field('f-title', 'Title (optional)', b.title) + field('f-when', 'When and where (optional)', b.when) +
      picField('f-img', 'Picture', b.imageUrl) + '<label class="tick"><input type="checkbox" id="f-right"' + (b.side === 'right' ? ' checked' : '') + '> The picture on the right</label>' +
      field('f-blabel', 'Button words (optional)', b.buttonLabel, 'text', ' placeholder="Sign up here"') + field('f-burl', 'Button link', b.buttonUrl, 'url', ' placeholder="https://"');
    if (t === 'text') return '<p class="m">Type the words on the email.</p>' + field('f-title', 'Title above them (optional)', b.title);
    if (t === 'heading') return '<p class="m">Type the heading on the email.</p><label>Size</label><div class="seg2" data-opt="size">' + [['big', 'Big'], ['small', 'Smaller']].map(function (o) { return '<button type="button" data-v="' + o[0] + '" aria-pressed="' + ((b.size || 'big') === o[0]) + '">' + o[1] + '</button>'; }).join('') + '</div>' +
      '<label>Line up</label><div class="seg2" data-opt="align">' + [['center', 'Centre'], ['left', 'Left']].map(function (o) { return '<button type="button" data-v="' + o[0] + '" aria-pressed="' + ((b.align || 'center') === o[0]) + '">' + o[1] + '</button>'; }).join('') + '</div>';
    if (t === 'button') return field('f-blabel', 'Button words', b.label) + field('f-burl', 'Link', b.url, 'url', ' placeholder="https://"');
    if (t === 'section') return '<p class="m">Type the words on the bar on the email.</p>';
    if (t === 'sunday') return field('f-date', 'Date', b.date || b.when) + field('f-time', 'Time', b.time) + field('f-title', 'Service', b.title) + field('f-spk', 'Speaker', b.speaker) + field('f-place', 'Where (optional)', b.place) + '<label for="f-text">A line about it (optional)</label><textarea id="f-text">' + esc(b.text || '') + '</textarea>';
    if (t === 'verse') return '<label for="v-ref">Reference</label><input type="text" id="v-ref" placeholder="For example Col 3:23-24" value="' + esc(b.ref || '') + '">' +
      '<label for="v-ver">Version</label><select id="v-ver"><option value="">Loading the Bibles…</option></select>' +
      '<div style="margin-top:8px"><button type="button" class="b" id="v-get">' + I('book-open', 16) + 'Bring it in</button></div><p class="m" id="v-msg" role="status"></p>' +
      '<label for="f-vt">The verse (you can also type or paste it)</label><textarea id="f-vt">' + esc(b.text || '') + '</textarea>' + field('f-copy', 'Copyright line', b.copyright) + '<input type="hidden" id="f-version" value="' + esc(b.version || '') + '">';
    if (t === 'meeting') return (b.url ? '<p style="margin:6px 0"><b style="color:var(--brand)">' + esc(b.title || 'Meeting') + '</b><br><span class="m">' + esc(MB.meetingWhen(b)) + '</span></p>' : '<p class="m">No meeting picked yet.</p>') +
      '<button type="button" class="b" id="f-meet">' + I('video', 16) + (b.url ? 'Choose another meeting' : 'Pick the meeting') + '</button>';
    if (t === 'diary') return field('f-title', 'Heading', b.title || 'Dates for the diary') + '<label for="f-weeks">How far ahead</label><select id="f-weeks">' + [4, 6, 8, 12].map(function (w) { return '<option value="' + w + '"' + ((b.weeks || 6) === w ? ' selected' : '') + '>The next ' + w + ' weeks</option>'; }).join('') + '</select>' +
      '<p class="m">Public events from What’s On, a date and a title each.</p>';
    if (t === 'notices') return '<p class="m">This week’s notices. Untick any to leave out.</p>' + (b.items || []).map(function (n, k) { return '<label class="tick"><input type="checkbox" data-n="' + k + '" checked> ' + esc(n.title) + '</label>'; }).join('');
    if (t === 'video') return field('f-url', 'The video’s web address (YouTube or any)', b.url, 'url', ' placeholder="https://"') + picField('f-img', 'Its picture (optional: YouTube’s own is used)', b.imageUrl) + field('f-blabel', 'Words under it', b.label, 'text', ' placeholder="Watch the video"') +
      '<p class="m">An email can’t play a video, so people tap its picture to watch it.</p>';
    if (t === 'logo') return picField('f-img', 'Logo', b.url) + field('f-width', 'Width (pixels, up to 300)', b.width || 160, 'number');
    if (t === 'pictures') return picField('f-img', 'Left picture', (b.urls || [])[0]) + picField('f-img2', 'Right picture', (b.urls || [])[1]);
    if (t === 'columns') return '<p class="m">Type in each column on the email.</p>' + (b.cols || []).map(function (c, k) { return picField('f-col' + k, 'Column ' + (k + 1) + ' picture (optional)', c.imageUrl); }).join('');
    if (t === 'social') return '<p class="m">The church’s social links, from Look.</p><button type="button" class="b" id="f-tolook">' + I('palette', 16) + 'Change them in Look</button>';
    return '<p class="m">Nothing to set here.</p>';
  }
  function blockPanel() {
    var b = ISSUE.blocks[SEL], L = b.look || {};
    var locked = b.type === 'meeting' && MB.MEMBERS_ONLY_ROOMS.indexOf(String(b.room || '')) >= 0;
    var sw = [''].concat(MB.TINTS.slice(1), palette());
    var body = TAB === 'style'
      ? '<label>Background</label><div class="sw" data-look="bg">' + sw.map(function (c) { return '<button type="button" data-v="' + c + '" aria-pressed="' + ((L.bg || '') === c) + '" aria-label="' + (c || 'None') + '" title="' + (c || 'None') + '" style="background:' + (c || 'repeating-linear-gradient(45deg,#fff 0 6px,#e5e7eb 6px 8px)') + '"></button>'; }).join('') + '</div>' +
        '<label>Border</label><div class="seg2" data-look="border">' + [['', 'None'], ['line', 'A thin line']].map(function (o) { return '<button type="button" data-v="' + o[0] + '" aria-pressed="' + ((L.border || '') === o[0]) + '">' + o[1] + '</button>'; }).join('') + '</div>' +
        '<label>Corners</label><div class="seg2" data-look="radius">' + [['0', 'Square'], ['8', 'Rounded'], ['16', 'More rounded']].map(function (o) { return '<button type="button" data-v="' + o[0] + '" aria-pressed="' + (String(L.radius || 0) === o[0]) + '">' + o[1] + '</button>'; }).join('') + '</div>' +
        '<label>Space around</label><div class="seg2" data-look="space">' + [['less', 'Less'], ['', 'Normal'], ['more', 'More']].map(function (o) { return '<button type="button" data-v="' + o[0] + '" aria-pressed="' + ((L.space || '') === o[0]) + '">' + o[1] + '</button>'; }).join('') + '</div>' +
        '<p class="m">Words, links and buttons follow the whole email’s look (Look).</p>' +
        '<div class="row" style="display:flex;gap:8px;margin-top:14px"><button type="button" class="b" id="st-reset">' + I('rotate-ccw', 15) + 'Reset</button><button type="button" class="b" id="st-all">' + I('copy', 15) + 'Use on all ' + esc((NAMES[b.type] || 'these').toLowerCase()) + '</button></div>'
      : TAB === 'who'
        ? '<label class="tick"><input type="checkbox" id="w-mem"' + (MB.membersOnly(b) ? ' checked' : '') + (locked ? ' disabled' : '') + '> Church members only</label>' +
          '<p class="m">Left out of everyone else’s copy, the web version and shares' + (locked ? '. Always, for this room.' : '. Use it for the YouTube live link, Zoom passcodes and anything private.') + '</p>'
        : contentFields(b);
    return '<button type="button" class="pback" id="p-back">' + I('chevron-left', 16) + 'Back to blocks</button><div class="ptitle">' + esc(NAMES[b.type] || b.type) + '</div>' +
      '<div class="tabs" role="tablist">' + [['content', 'Content'], ['style', 'Style'], ['who', 'Who sees it']].map(function (x) { return '<button type="button" role="tab" data-tab="' + x[0] + '" aria-selected="' + (TAB === x[0]) + '">' + x[1] + '</button>'; }).join('') + '</div>' + body;
  }
  function wireBlock() {
    var b = ISSUE.blocks[SEL]; if (!b) return;
    document.getElementById('p-back').onclick = function () { PANEL = 'add'; SEL = -1; if (CV && CV.contentDocument) Array.prototype.forEach.call(CV.contentDocument.querySelectorAll('.ed-chip,.ed-tools,[data-b].on'), function (x) { if (x.classList.contains('on')) x.classList.remove('on'); else x.remove(); }); drawPanel(true); };
    Array.prototype.forEach.call(document.querySelectorAll('[data-tab]'), function (x) { x.onclick = function () { TAB = x.getAttribute('data-tab'); drawPanel(); }; });
    if (!editable()) { Array.prototype.forEach.call(document.querySelectorAll('#side input,#side select,#side textarea'), function (x) { x.disabled = true; }); return; }
    /* Content: each field saves as it is typed (one undo step per field). */
    var map = { 'f-img': function (v) { if (b.type === 'picture' || b.type === 'logo') b.url = v; else if (b.type === 'pictures') { b.urls = b.urls || ['', '']; b.urls[0] = v; } else b.imageUrl = v; },
      'f-img2': function (v) { b.urls = b.urls || ['', '']; b.urls[1] = v; }, 'f-alt': function (v) { b.alt = v; }, 'f-link': function (v) { b.link = v; }, 'f-cap': function (v) { b.caption = v; },
      'f-title': function (v) { b.title = v; }, 'f-when': function (v) { b.when = v; }, 'f-blabel': function (v) { if (b.type === 'button') b.label = v; else if (b.type === 'video') b.label = v; else b.buttonLabel = v; },
      'f-burl': function (v) { if (b.type === 'button') b.url = v; else b.buttonUrl = v; }, 'f-date': function (v) { b.date = v; }, 'f-time': function (v) { b.time = v; }, 'f-spk': function (v) { b.speaker = v; }, 'f-place': function (v) { b.place = v; },
      'f-text': function (v) { b.text = v; }, 'f-url': function (v) { b.url = v; }, 'f-width': function (v) { b.width = Math.max(40, Math.min(300, +v || 160)); }, 'f-vt': function (v) { b.text = v; }, 'f-copy': function (v) { b.copyright = v; }, 'v-ref': function (v) { b.ref = v; } };
    (b.cols || []).forEach(function (c, k) { map['f-col' + k] = function (v) { b.cols[k] = Object.assign({}, b.cols[k], { imageUrl: v }); }; });
    Object.keys(map).forEach(function (id) {
      var el = document.getElementById(id); if (!el) return;
      var first = true;
      el.addEventListener('input', function () {
        if (first) { remember(); first = false; }
        map[id](el.value.trim()); b.auto = false; saveSoon();
        clearTimeout(drawT); drawT = setTimeout(drawCanvas, 450);
      });
      el.addEventListener('change', function () { first = true; var u = el.type === 'url' && el.value.trim(); if (u && !MB.safeUrl(u)) toast('A link needs to start with https://'); });
    });
    Array.prototype.forEach.call(document.querySelectorAll('[id^="pics-"]'), function (host) {
      var id = host.id.slice(5), cur = (document.getElementById(id) || {}).value;
      loadPics().then(function (P) {
        if (!P.length) { host.outerHTML = '<p class="m">The picture library is empty: paste a picture’s link above.</p>'; return; }
        host.innerHTML = P.map(function (p) { return '<button type="button" data-url="' + esc(p.url) + '" aria-label="' + esc(p.name || 'Picture') + '" aria-pressed="' + (p.url === cur) + '" style="background-image:url(\'' + esc(p.url) + '\')"></button>'; }).join('');
        Array.prototype.forEach.call(host.querySelectorAll('button'), function (x) {
          x.onclick = function () { var inp = document.getElementById(id); inp.value = x.getAttribute('data-url'); inp.dispatchEvent(new Event('input')); inp.dispatchEvent(new Event('change'));
            Array.prototype.forEach.call(host.querySelectorAll('button'), function (y) { y.setAttribute('aria-pressed', String(y === x)); }); };
        });
      });
    });
    var us = document.getElementById('f-unsplash');
    if (us) us.onclick = function () {
      EGBCUnsplash.pick({ shape: 'landscape' }).then(function (p) {
        if (!p) return;
        change(function () {
          if (b.type === 'picture') b.url = p.regular; else b.imageUrl = p.regular;
          b.credit = EGBCUnsplash.credit(p);
          if (!b.alt) b.alt = String(p.alt || '').slice(0, 200);
        });
        EGBCUnsplash.used(p);
        toast('Picture from Unsplash added, credited to ' + p.name + '.');
      });
    };
    var right = document.getElementById('f-right'); if (right) right.onchange = function () { change(function () { b.side = right.checked ? 'right' : ''; }, { panel: false }); };
    Array.prototype.forEach.call(document.querySelectorAll('[data-opt] [data-v]'), function (x) {
      x.onclick = function () { var k = x.parentNode.getAttribute('data-opt'); change(function () { b[k] = x.getAttribute('data-v'); }); };
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-n]'), function (c) {
      c.onchange = function () { var keepN = []; Array.prototype.forEach.call(document.querySelectorAll('[data-n]'), function (x) { if (x.checked) keepN.push(b.items[+x.getAttribute('data-n')]); }); change(function () { b.items = keepN; }); };
    });
    var wk = document.getElementById('f-weeks');
    if (wk) wk.onchange = function () { var w = +wk.value || 6, now = Date.now(); EGBCComms.eventsBetween(now - 86400000, now + w * 7 * 86400000).then(function (all) { change(function () { b.weeks = w; b.items = MB.diaryItems({ now: new Date(now), weeks: w, events: all, base: hubBase() }); }); }); };
    var meet = document.getElementById('f-meet');
    if (meet) meet.onclick = function () { EGBCMeetingPick.open({ base: hubBase(), onPick: function (m) { change(function () { if (b.members === false && MB.MEMBERS_ONLY_ROOMS.indexOf(m.room) < 0) m.members = false; ISSUE.blocks[SEL] = m; }); } }); };
    var tl = document.getElementById('f-tolook'); if (tl) tl.onclick = function () { PANEL = 'look'; drawPanel(true); };
    if (b.type === 'verse') wireVerse(b);
    /* Style */
    Array.prototype.forEach.call(document.querySelectorAll('[data-look] [data-v]'), function (x) {
      x.onclick = function () { var k = x.parentNode.getAttribute('data-look'), v = x.getAttribute('data-v'); change(function () { b.look = Object.assign({}, b.look || {}); if (v) b.look[k] = k === 'radius' ? +v : v; else delete b.look[k]; }); };
    });
    var rs = document.getElementById('st-reset'); if (rs) rs.onclick = function () { change(function () { delete b.look; }); };
    var all = document.getElementById('st-all'); if (all) all.onclick = function () { var L = b.look ? JSON.parse(JSON.stringify(b.look)) : null; change(function () { ISSUE.blocks.forEach(function (x) { if (x.type === b.type) { if (L) x.look = JSON.parse(JSON.stringify(L)); else delete x.look; } }); }); toast('Used on all ' + (NAMES[b.type] || 'these').toLowerCase() + '.'); };
    /* Who sees it */
    var wm = document.getElementById('w-mem'); if (wm) wm.onchange = function () {
      /* For everyone: not while Zoom joining details in its words would go
         with it, unless the office says so (reviewing window, 22 Oct). */
      if (!wm.checked) {
        var left = MB.exposedJoining(b);
        if (left.length && !confirm('Everyone would see these joining details:\n\n' + left.slice(0, 5).join('\n') + '\n\nSelect them on the email and press \u201cMembers only\u201d first. Make this block for everyone anyway?')) { wm.checked = true; return; }
      }
      change(function () { b.members = wm.checked; });
    };
  }
  /* The verse, from the hub's Bible (the same as the E-news page). */
  function wireVerse(b) {
    var sel = document.getElementById('v-ver'), msg = document.getElementById('v-msg');
    if (!window.EGBCBible) { sel.innerHTML = '<option value="">The Bibles are not available here</option>'; return; }
    Promise.all([EGBCBible.versions().catch(function () { return []; }), EGBCBible.apiVersions().catch(function () { return []; })]).then(function (r) {
      sel.innerHTML = r[0].map(function (x) { return '<option value="bundled|' + esc(x.id) + '|' + esc(x.abbrev) + '">' + esc(x.name) + ' (free)</option>'; })
        .concat(r[1].map(function (x) { return '<option value="apibible|' + esc(x.id) + '|' + esc(String(x.abbrev || '').toUpperCase()) + '">' + esc(x.name) + ' (church key)</option>'; })).join('') || '<option value="">No Bibles found</option>';
      var u = SET.bible; var want = u && u.id ? u.source + '|' + u.id + '|' + u.abbrev : '';
      if (want && [].some.call(sel.options, function (o) { return o.value === want; })) sel.value = want;
      /* No usual yet: the NIV when the church's key has it, otherwise the
         BSB (as the old editor's verse sheet chose). */
      else { var first = [].filter.call(sel.options, function (o) { return /^apibible\|[^|]+\|NIV(UK)?$/.test(o.value); })[0] || [].filter.call(sel.options, function (o) { return /\|BSB\|/.test(o.value); })[0]; if (first) sel.value = first.value; }
    });
    document.getElementById('v-get').onclick = function () {
      var ref = val('v-ref'), parts = sel.value.split('|');
      if (!EGBCBible.parse(ref)) { msg.textContent = 'That reference was not understood. Try, for example, "Col 3:23-24".'; return; }
      msg.textContent = 'Bringing it in…';
      (parts[0] === 'apibible' ? EGBCBible.apiPassage(parts[1], ref, parts[2]) : EGBCBible.passage(parts[1], ref)).then(function (p) {
        change(function () {
          b.text = (p.verses || []).map(function (x) { return x.text; }).join(' ').replace(/\s+/g, ' ').trim() || p.text;
          b.ref = p.ref; b.version = p.version || parts[2] || ''; b.copyright = p.copyright || ''; b.auto = false;
        });
        var m2 = document.getElementById('v-msg'); if (m2) m2.textContent = 'Brought in. You can still change the words.';
        var next = { source: parts[0], id: parts[1], abbrev: parts[2] };
        if (!SET.bible || SET.bible.id !== next.id) { SET.bible = next; db().collection('enewsSettings').doc('main').set(Object.assign({ template: SET.template || 'classic', colours: SET.colours || {}, church: SET.church || {}, bible: next }, stamp())).catch(function () {}); }
      }, function (e) { msg.textContent = (e && e.message) || 'That did not work.'; });
    };
  }

  /* Look: the whole email. The church's look is shared by every issue. */
  var COLOUR_WORDS = { page: 'Page background', bar: 'Section bar', barText: 'Section bar words', title: 'Titles', link: 'Links', button: 'Buttons', footer: 'Footer', footerText: 'Footer words' };
  function lookPanel() {
    var base = MB.theme({ template: SET.template || 'classic', colours: SET.colours }), c = SET.church || {};
    var sec = function (ic, t, body, open) { return '<details' + (open ? ' open' : '') + ' style="border-bottom:1px solid var(--line);padding:4px 0 10px"><summary style="display:flex;align-items:center;gap:10px;min-height:46px;cursor:pointer;font-weight:500;color:var(--ink)">' + I(ic, 18) + esc(t) + '</summary>' + body + '</details>'; };
    return '<h3 style="font-size:16px">The email’s look</h3><p class="s">For the whole email, and every e-news after it. A block’s own style can differ.</p>' +
      sec('type', 'This issue: top line', field('l-pre', 'Top line (the first words people see in the inbox)', ISSUE.preheader), true) +
      sec('swatch-book', 'Starting look and colours', '<label for="l-tpl">Starting look</label><select id="l-tpl">' + Object.keys(MB.TEMPLATES).map(function (k) { return '<option value="' + k + '"' + (k === (SET.template || 'classic') ? ' selected' : '') + '>' + esc(MB.TEMPLATES[k].label) + '</option>'; }).join('') + '</select>' +
        Object.keys(COLOUR_WORDS).map(function (k) { return '<label style="display:flex;align-items:center;gap:8px;font-weight:400"><input type="color" data-c="' + k + '" value="' + esc(base[k]) + '" style="width:44px;height:34px;border:1px solid var(--line-2);border-radius:8px;padding:2px;background:#fff"> ' + esc(COLOUR_WORDS[k]) + '</label>'; }).join('')) +
      sec('building-2', 'Footer details', field('l-short', 'Short name for the top line (the church’s initials, say)', c.shortName) + field('l-addr', 'Address', c.address) + field('l-charity', 'Charity number', c.charityNo) + field('l-phone', 'Phone', c.phone) + field('l-hours', 'Office hours (optional)', c.hours) +
        '<label class="tick"><input type="checkbox" id="l-diary"' + (c.diaryButton === false ? '' : ' checked') + '> “Dates for the diary for the coming weeks” button</label>') +
      sec('share-2', 'Social links', Object.keys(MB.SOCIAL).map(function (k) { var cur = (c.social || []).filter(function (x) { return x.kind === k; })[0]; return field('l-s-' + k, MB.SOCIAL[k], cur ? cur.url : '', k === 'email' ? 'email' : 'url'); }).join('')) +
      '<div style="margin-top:14px"><button type="button" class="b p" id="l-save">' + I('check', 16) + 'Save the look</button></div>';
  }
  function wireLook() {
    var pre = document.getElementById('l-pre'), first = true;
    pre.oninput = function () { if (first) { remember(); first = false; } ISSUE.preheader = pre.value.slice(0, 200); saveSoon(); };
    document.getElementById('l-save').onclick = function () {
      var tplNew = val('l-tpl') || 'classic', look = MB.TEMPLATES[tplNew] || MB.TEMPLATES.classic, cols = {};
      Array.prototype.forEach.call(document.querySelectorAll('[data-c]'), function (i) { var k = i.getAttribute('data-c'); if (i.value.toLowerCase() !== String(look[k]).toLowerCase()) cols[k] = i.value.toLowerCase(); });
      var social = Object.keys(MB.SOCIAL).map(function (k) { return { kind: k, url: val('l-s-' + k).slice(0, 300) }; }).filter(function (x) { return x.url; });
      var bad = social.filter(function (x) { return x.kind === 'email' ? !/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(x.url) : !MB.safeUrl(x.url); })[0];
      if (bad) { toast(MB.SOCIAL[bad.kind] + ': that doesn’t look like a ' + (bad.kind === 'email' ? 'email address' : 'web address starting https://')); return; }
      var next = { template: tplNew, colours: cols, bible: SET.bible || null, church: { shortName: val('l-short').slice(0, 40), address: val('l-addr').slice(0, 200), charityNo: val('l-charity').slice(0, 30), phone: val('l-phone').slice(0, 40), hours: val('l-hours').slice(0, 200),
        diaryButton: document.getElementById('l-diary').checked, social: social } };
      db().collection('enewsSettings').doc('main').set(Object.assign({}, next, stamp())).then(function () {
        SET = next; churchFromSettings(); if (ISSUE.template !== tplNew) { ISSUE.template = tplNew; saveSoon(); } toast('The look is saved.'); drawCanvas();
      }, function (e) { toast('Not saved: ' + (e.message || e)); });
    };
  }

  /* Check: what still needs doing, each with a way to it. */
  function checks() {
    var out = [], bl = ISSUE.blocks || [];
    var ready = MB.readyToSend(ISSUE);
    var idx = function (fn) { for (var k = 0; k < bl.length; k++) if (fn(bl[k])) return k; return -1; };
    if (!String(ISSUE.subject || '').trim()) out.push({ lv: 'bad', t: 'It has no subject.', go: 'subj' });
    ready.missing.forEach(function (m) {
      if (m === 'picture') out.push({ lv: 'bad', t: 'Add this week’s picture (or remove that block).', i: idx(function (b) { return b.type === 'header' && !MB.safeUrl(b.imageUrl); }) });
      else if (m === 'verse') out.push({ lv: 'bad', t: 'Add this week’s verse (or remove that block).', i: idx(function (b) { return b.type === 'verse' && !String(b.text || '').trim(); }) });
      else if (m === 'meeting') out.push({ lv: 'bad', t: 'Pick the meeting.', i: idx(function (b) { return b.type === 'meeting' && !MB.safeUrl(b.url); }) });
      else if (m === 'fill') ready.prompts.forEach(function (w) {
        out.push({ lv: 'bad', t: 'Fill in \u201c[' + w + ']\u201d.', go: String(ISSUE.subject || '').indexOf('[' + w + ']') >= 0 ? 'subj' : '',
          i: idx(function (b) { return JSON.stringify([b.title, b.html, b.text, b.label, b.when, b.caption, b.cols]).indexOf('[' + w + ']') >= 0; }) });
      });
    });
    MB.missing(bl).forEach(function (x) { out.push({ lv: 'warn', t: x.title + ': needs a ' + x.need.join(' and a ') + ' (add it in What’s On).', i: idx(function (b) { return b.type === 'event' && (b.title || '(no title)') === x.title; }) }); });
    bl.forEach(function (b, k) {
      var links = [b.buttonUrl, b.link, b.type === 'button' ? b.url : '', b.type === 'video' ? b.url : ''].filter(Boolean);
      links.forEach(function (u) { if (!MB.safeUrl(u)) out.push({ lv: 'bad', t: (NAMES[b.type] || b.type) + ': the link “' + u.slice(0, 40) + '” doesn’t work (it needs https://).', i: k }); });
      if (b.type === 'button' && !MB.safeUrl(b.url)) out.push({ lv: 'bad', t: 'A button has no link.', i: k });
      if ((b.type === 'picture' && !MB.safeUrl(b.url)) || (b.type === 'video' && !MB.safeUrl(b.url))) out.push({ lv: 'warn', t: (NAMES[b.type]) + ' is empty, so it won’t show.', i: k });
    });
    var mem = bl.filter(function (b) { return MB.membersOnly(b); }).length;
    if (mem) out.push({ lv: 'ok', t: mem + ' block' + (mem > 1 ? 's are' : ' is') + ' for church members only (gold edge on the email).' });
    /* Members-only words in blocks that go to everyone (reviewing window, 22 Oct). */
    var mw = MB.membersWords(bl), bits = mw.reduce(function (n, x) { return n + x.n; }, 0);
    if (bits) out.push({ lv: 'ok', t: bits + ' members-only bit' + (bits > 1 ? 's' : '') + ' of words, in: ' + mw.map(function (x) { return x.name || NAMES[x.type] || x.type; }).join(', ') + '. Everyone else won’t get ' + (bits > 1 ? 'them' : 'it') + '.', i: mw[0].i });
    return out;
  }
  function checkPanel() {
    var c = checks(), bad = c.filter(function (x) { return x.lv !== 'ok'; }).length;
    return '<h3 style="font-size:16px">Check</h3><p class="s">' + (bad ? 'Before it can be sent or tested:' : 'Nothing to put right.') + '</p>' +
      (c.length ? c.map(function (x, k) { return '<div class="chk ' + x.lv + '">' + I(x.lv === 'ok' ? 'info' : x.lv === 'bad' ? 'circle-alert' : 'triangle-alert') + '<span>' + esc(x.t) + '</span>' + (x.i >= 0 || x.go ? '<button type="button" class="b" data-go="' + k + '">Go to it</button>' : '') + '</div>'; }).join('')
        : '<div class="chk ok">' + I('circle-check') + '<span>Everything is in place.</span></div>');
  }
  function wireCheck() {
    var c = checks();
    Array.prototype.forEach.call(document.querySelectorAll('[data-go]'), function (b) {
      b.onclick = function () { var x = c[+b.getAttribute('data-go')]; if (x.go === 'subj') { document.getElementById('subj').focus(); return; } if (x.i >= 0) { select(x.i); var t = cdoc() && cdoc().querySelector('[data-b="' + x.i + '"]'); if (t) t.scrollIntoView({ block: 'center' }); } };
    });
  }

  /* ---- Preview, Send me a test, Done ---------------------------------- */
  function preview() {
    var who = 'members', dev = DEVICE;
    var o = document.createElement('div'); o.className = 'over'; document.body.appendChild(o);
    var draw = function () {
      o.className = 'over' + (dev === 'phone' ? ' phone' : '');
      o.innerHTML = '<div class="hd"><div class="dev"><button type="button" data-d="computer" aria-pressed="' + (dev === 'computer') + '">' + I('monitor') + '</button><button type="button" data-d="phone" aria-pressed="' + (dev === 'phone') + '">' + I('smartphone') + '</button></div>' +
        '<div class="seg2"><button type="button" data-w="members" aria-pressed="' + (who === 'members') + '">Church members see</button><button type="button" data-w="everyone" aria-pressed="' + (who === 'everyone') + '">Everyone else sees</button></div>' +
        '<button type="button" class="b" data-x>' + I('x', 16) + 'Close</button></div><div class="bd"><iframe title="Preview" sandbox="allow-same-origin"></iframe></div>';
      icons(o);
      o.querySelector('iframe').srcdoc = MB.render(Object.assign({}, ISSUE, { colours: SET.colours || {} }), { version: who, church: CHURCH, unsubscribeUrl: '#', webUrl: '#', preview: true });
      Array.prototype.forEach.call(o.querySelectorAll('[data-d]'), function (b) { b.onclick = function () { dev = b.getAttribute('data-d'); draw(); }; });
      Array.prototype.forEach.call(o.querySelectorAll('[data-w]'), function (b) { b.onclick = function () { who = b.getAttribute('data-w'); draw(); }; });
      o.querySelector('[data-x]').onclick = function () { o.remove(); };
    };
    draw();
  }
  function sendTest() {
    var r = MB.readyToSend(ISSUE);
    if (!r.ok) { toast('First put right what Check lists.'); PANEL = 'check'; drawPanel(true); return; }
    var b = document.getElementById('test'); b.disabled = true; toast('Sending you a test…');
    save().then(function () { return EGBCAuth.call('enewsTest', { issueId: ISSUE_ID, html: finalCopy('members') }); })
      .then(function (res) { res = (res && res.data !== undefined) ? res.data : res; b.disabled = false; toast('Sent to ' + ((res && res.to) || 'you') + '.'); },
        function (e) { b.disabled = false; toast('Not sent: ' + (e.message || e)); });
  }
  function doneMenu(e) {
    e.stopPropagation();
    var old = document.querySelector('.menu'); if (old) { old.remove(); return; }
    var m = document.createElement('div'); m.className = 'menu';
    m.innerHTML = (/^auto_/.test(ISSUE_ID) ? '<a href="enews.html?welcomes=1">' + I('hand-heart', 17) + 'Back to the welcome emails</a>' :
      '<a href="enews.html?issue=' + encodeURIComponent(ISSUE_ID) + '&view=send">' + I('calendar-clock', 17) + 'Schedule it (sending opens at go-live)</a>' +
      (ISSUE.kind === 'oneoff' && (ISSUE.audience || 'subscribers') !== 'subscribers' ? '' : '<a href="enews.html?issue=' + encodeURIComponent(ISSUE_ID) + '&view=send#webprev">' + I('globe', 17) + 'Preview web version and share it</a>')) +
      '<a href="enews.html?issue=' + encodeURIComponent(ISSUE_ID) + '">' + I('chevron-left', 17) + 'Back to this ' + (ISSUE.kind === 'oneoff' ? 'email' : 'e-news') + '</a><a href="enews.html">' + I('list', 17) + 'All e-news and emails</a>' +
      '<button type="button" id="save-tpl">' + I('layout-template', 17) + 'Save as a template</button>';
    document.body.appendChild(m); icons(m);
    /* Save as a template: the blocks, the look and who it goes to, kept
       for the church (emailTemplates); New email offers it under "Ours". */
    document.getElementById('save-tpl').onclick = function () {
      var name = prompt('A name for this template:', String(ISSUE.subject || '').replace(/\s*\d{1,2}\s+\w+\s*$/, '').slice(0, 80));
      if (!name) return;
      var u = EGBCAuth.user() || {};
      db().collection('emailTemplates').doc().set(Object.assign({ name: name.trim().slice(0, 80), about: '', group: 'Ours', subject: String(ISSUE.subject || '').slice(0, 200), preheader: String(ISSUE.preheader || '').slice(0, 200),
        template: ISSUE.template === 'green' ? 'green' : 'classic', audience: ISSUE.audience || 'subscribers', blocks: (ISSUE.blocks || []).slice(0, 80), archived: false, createdAt: new Date().toISOString(), createdBy: u.uid || '' }, stamp()))
        .then(function () { toast('Saved as a template: \u201c' + name.trim() + '\u201d.'); }, function (e) { toast('Not saved: ' + (e.message || e)); });
      m.remove();
    };
    var links = m.querySelectorAll('a');
    Array.prototype.forEach.call(links, function (a) { a.addEventListener('click', function (ev) { ev.preventDefault(); var to = a.getAttribute('href'); save().then(function () { location.href = to; }); }); });
    setTimeout(function () { document.addEventListener('click', function close() { m.remove(); document.removeEventListener('click', close); }); }, 0);
  }

  function churchFromSettings() {
    var c = SET.church || {};
    CHURCH = { name: (window.EGBCChurch && EGBCChurch.name()) || '', email: (window.EGBCChurch && EGBCChurch.email()) || '',
      address: c.address || '', charityNo: c.charityNo || '', phone: c.phone || '', hours: c.hours || '',
      social: Array.isArray(c.social) ? c.social : [], diaryUrl: c.diaryButton === false ? '' : hubBase() + '/whatson.html' };
  }

  /* ---- start ---------------------------------------------------------- */
  EGBCAuth.require().then(EGBCComms.ready).then(function () {
    if (!EGBCComms.mayOffice()) { ed.innerHTML = '<div class="note"><b>E-news editor</b><p>This page is for the church office and master admins.</p></div>'; return; }
    if (!(EGBCAuth.uses && EGBCAuth.uses('enews'))) { ed.innerHTML = '<div class="note"><b>E-news editor</b><p>The e-news is switched off for this church. A master admin can turn it on in Church settings, under “What does your church use?”.</p></div>'; return; }
    var id = new URLSearchParams(location.search).get('issue');
    if (!id) { location.replace('enews.html'); return; }
    return Promise.all([
      window.EGBCChurch ? EGBCChurch.load() : null,
      db().collection('enewsSettings').doc('main').get().then(function (s) { if (s.exists) SET = Object.assign({ template: 'classic', colours: {}, church: {} }, s.data()); }, function () {}),
      db().collection('enewsIssues').doc(id).get()
    ]).then(function (r) {
      if (!r[2].exists) { ed.innerHTML = '<div class="note">That e-news is not there any more. <a href="enews.html">All e-news</a></div>'; return; }
      ISSUE = r[2].data(); ISSUE_ID = id; ISSUE.blocks = ISSUE.blocks || [];
      churchFromSettings();
      drawShell(); drawPanel(!PHONE()); drawCanvas();
      /* The week's draft made itself (enews.html, rule 13): say so here. */
      if (new URLSearchParams(location.search).get('drafted')) { toast('This week’s e-news is drafted for you.'); history.replaceState(null, '', '?issue=' + encodeURIComponent(ISSUE_ID)); }
      window.addEventListener('beforeunload', function () { if (saveT) save(); });
    });
  }).catch(function (e) { ed.innerHTML = '<div class="note">' + esc(e.message || e) + '</div>'; });
})();
