/* ===================================================================
   THE "?" HELP ON EVERY PAGE (ENGINEERING.md 8a)
   ===================================================================
   Each page's help is written once, in plain words, in help/<page>.md
   (the page's file name, lower case, without .html). This script:
     - puts the "?" button in the bottom corner (or takes over a page's
       own #helpBtn), only when the page has a help file;
     - opens a panel showing that help;
     - under it, an "Ask" box: the helpAsk function answers from that
       help text only, never the church's data, and says who to ask when
       the help doesn't cover it. Signed-in people only.
   A page loads it with <script src="egbc-help.js"></script>, after
   egbc-auth.js. EGBCHelp.open() opens the panel from anywhere.
   =================================================================== */
(function () {
  'use strict';
  if (window.EGBCHelp) return;

  var file = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
  var PAGE = file.replace(/\.html?$/, '') || 'index';
  var stamp = (function () {
    var s = document.currentScript && document.currentScript.src.match(/[?&]v=([^&]+)/);
    return s ? s[1] : '';
  })();
  var text = null, panel = null, lastFocus = null;

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) { return '&#' + c.charCodeAt(0) + ';'; });
  }

  /* Just enough Markdown for help text: headings, lists, bold, links. */
  function inline(s) {
    return esc(s)
      .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
      .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, function (m, label, href) {
        var h = href.replace(/&#38;/g, '&');
        if (!/^(https:\/\/|[a-z0-9-]+\.html([?#].*)?$)/i.test(h)) return label;
        return '<a href="' + esc(h) + '"' + (/^https:/i.test(h) ? ' target="_blank" rel="noopener"' : '') + '>' + label + '</a>';
      });
  }
  function render(md) {
    var out = [], list = null, para = [];
    function flush() {
      if (para.length) { out.push('<p>' + inline(para.join(' ')) + '</p>'); para = []; }
      if (list) { out.push('</' + list + '>'); list = null; }
    }
    md.replace(/\r\n/g, '\n').split('\n').forEach(function (line) {
      var m;
      if (!line.trim()) { flush(); return; }
      if ((m = line.match(/^(#{1,3})\s+(.*)$/))) { flush(); var n = Math.min(4, m[1].length + 1); out.push('<h' + n + '>' + inline(m[2]) + '</h' + n + '>'); return; }
      if ((m = line.match(/^\s*(?:[-*]|(\d+)\.)\s+(.*)$/))) {
        var kind = m[1] ? 'ol' : 'ul';
        if (para.length) { out.push('<p>' + inline(para.join(' ')) + '</p>'); para = []; }
        if (list !== kind) { if (list) out.push('</' + list + '>'); out.push('<' + kind + '>'); list = kind; }
        out.push('<li>' + inline(m[2]) + '</li>');
        return;
      }
      if (list) { out.push('</' + list + '>'); list = null; }
      para.push(line.trim());
    });
    flush();
    return out.join('');
  }

  function css() {
    if (document.getElementById('egbc-help-css')) return;
    var el = document.createElement('style');
    el.id = 'egbc-help-css';
    el.textContent = [
      '#egbc-help-btn{position:fixed;bottom:24px;right:24px;z-index:900;width:40px;height:40px;border-radius:8px;background:#fff;border:1.5px solid #d1dfdf;',
      'color:#3d6263;font:600 16px Inter,system-ui,sans-serif;box-shadow:0 2px 12px rgba(61,98,99,.12);cursor:pointer}',
      'html[data-egbc-app-mode] #egbc-help-btn{bottom:calc(var(--am-bottom,64px) + 16px)}',
      '#egbc-help-bg{position:fixed;inset:0;background:rgba(17,24,39,.35);z-index:2000}',
      '#egbc-help{position:fixed;top:0;right:0;bottom:0;width:min(440px,100%);background:#fff;color:#374151;z-index:2001;display:flex;flex-direction:column;',
      'font:400 15px/1.55 Inter,system-ui,sans-serif;box-shadow:-4px 0 24px rgba(0,0,0,.15)}',
      '#egbc-help header{display:flex;align-items:center;justify-content:space-between;padding:14px 16px;border-bottom:1px solid #e5e7eb}',
      '#egbc-help header h2{margin:0;font-size:17px;color:#111827}',
      '#egbc-help .x{border:0;background:none;font-size:24px;line-height:1;color:#6b7280;cursor:pointer;min-width:44px;min-height:44px}',
      '#egbc-help .body{overflow:auto;padding:4px 16px 16px;flex:1}',
      '#egbc-help .body h2,#egbc-help .body h3,#egbc-help .body h4{color:#111827;margin:18px 0 6px;font-size:16px}',
      '#egbc-help .body h2{font-size:18px}',
      '#egbc-help .body ul,#egbc-help .body ol{padding-left:20px}',
      '#egbc-help .body a{color:#3d6263}',
      '#egbc-help .ask{border-top:1px solid #e5e7eb;padding:12px 16px calc(12px + env(safe-area-inset-bottom));background:#f6f7f7}',
      '#egbc-help .ask label{display:block;font-weight:600;color:#111827;margin-bottom:6px}',
      '#egbc-help .ask textarea{width:100%;box-sizing:border-box;min-height:64px;border:1px solid #d1d5db;border-radius:8px;padding:8px;font:inherit;resize:vertical}',
      '#egbc-help .ask .row{display:flex;gap:8px;align-items:center;justify-content:space-between;margin-top:8px}',
      '#egbc-help .ask small{color:#6b7280;font-size:12.5px}',
      '#egbc-help .ask button{background:#3d6263;color:#fff;border:0;border-radius:8px;padding:0 16px;min-height:40px;font:600 14px Inter,system-ui,sans-serif;cursor:pointer}',
      '#egbc-help .ask button[disabled]{opacity:.6;cursor:default}',
      '#egbc-help .answer{margin-top:10px;background:#fff;border:1px solid #e5e7eb;border-radius:8px;padding:10px 12px;white-space:pre-wrap}',
      '#egbc-help .answer:empty{display:none}'
    ].join('');
    document.head.appendChild(el);
  }

  function signedIn() {
    var A = window.EGBCAuth;
    return !!(A && A.user && A.user());
  }

  function ask(q, out, btn) {
    btn.disabled = true;
    out.textContent = 'Thinking…';
    window.EGBCAuth.call('helpAsk', { page: PAGE, question: q }, { timeoutMs: 60000 }).then(function (r) {
      out.textContent = (r && r.answer) || 'I don\'t know. Ask the church office.';
    }, function (e) {
      out.textContent = (e && e.message) || 'The help AI could not be reached just now. Try again in a minute.';
    }).then(function () { btn.disabled = false; });
  }

  function close() {
    if (!panel) return;
    panel.bg.remove();
    panel.el.remove();
    panel = null;
    document.removeEventListener('keydown', onKey);
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }
  function onKey(e) { if (e.key === 'Escape') close(); }

  function open() {
    if (panel || text == null) return;
    css();
    lastFocus = document.activeElement;
    var bg = document.createElement('div');
    bg.id = 'egbc-help-bg';
    bg.addEventListener('click', close);
    var el = document.createElement('div');
    el.id = 'egbc-help';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-labelledby', 'egbc-help-title');
    el.innerHTML = '<header><h2 id="egbc-help-title">Help</h2><button type="button" class="x" aria-label="Close help">×</button></header>'
      + '<div class="body">' + render(text) + '</div>'
      + (signedIn() && window.EGBCAuth.call
        ? '<form class="ask"><label for="egbc-help-q">Ask about this page</label>'
          + '<textarea id="egbc-help-q" maxlength="500" placeholder="For example: how do I change who it goes to?"></textarea>'
          + '<div class="row"><small>Answers come from this help only, not your church\'s records.</small><button type="submit">Ask</button></div>'
          + '<div class="answer" aria-live="polite"></div></form>'
        : '');
    document.body.appendChild(bg);
    document.body.appendChild(el);
    panel = { bg: bg, el: el };
    el.querySelector('.x').addEventListener('click', close);
    var form = el.querySelector('form.ask');
    if (form) form.addEventListener('submit', function (e) {
      e.preventDefault();
      var q = form.querySelector('textarea').value.trim();
      if (q) ask(q, form.querySelector('.answer'), form.querySelector('button'));
    });
    document.addEventListener('keydown', onKey);
    el.querySelector('.x').focus();
  }

  function button() {
    var own = document.getElementById('helpBtn');
    if (own) {
      own.addEventListener('click', function (e) { e.preventDefault(); open(); });
      own.removeAttribute('target');
      own.setAttribute('aria-label', 'Help for this page');
      return;
    }
    css();
    var b = document.createElement('button');
    b.id = 'egbc-help-btn';
    b.type = 'button';
    b.textContent = '?';
    b.setAttribute('aria-label', 'Help for this page');
    b.addEventListener('click', open);
    document.body.appendChild(b);
  }

  function start() {
    fetch('help/' + PAGE + '.md' + (stamp ? '?v=' + stamp : ''), { cache: 'no-cache' }).then(function (r) {
      return r.ok ? r.text() : null;
    }).then(function (md) {
      if (md == null || /^\s*<!doctype/i.test(md)) return;
      text = md;
      button();
    }, function () { /* no help file: the page has no "?" yet */ });
  }

  window.EGBCHelp = { open: open, close: close, page: PAGE, render: render };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
