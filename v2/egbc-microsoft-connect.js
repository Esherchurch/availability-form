/* ===================================================================
   "Connect Microsoft 365" - the card for Church settings (F-253)
   ===================================================================
   For Church settings (main window's page), master admins:
     <div id="m365"></div>
     <script src="egbc-microsoft-connect.js?v=..."></script>
     ... EGBCMicrosoft.mount(document.getElementById('m365'))
   It needs egbc-auth.js (EGBCAuth.call). Connected: Present's PowerPoint
   slides are drawn by Microsoft's own PowerPoint (exact fonts and layouts);
   not connected: by LibreOffice, as now. The work is done by the hub's
   functions (functions/microsoft.js); this card only starts it and says
   how it went (Microsoft sends the admin back here with ?m365=...).
   =================================================================== */
(function (global) {
  'use strict';
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  var CSS = '.m365{border:1px solid var(--line,#d9e2e7);border-radius:14px;padding:16px;background:var(--panel,#fff);color:inherit;font:400 15px/1.5 Inter,system-ui,sans-serif}' +
    '.m365 h3{margin:0 0 6px;font-size:17px}.m365 p{margin:0 0 10px}.m365 .ok{color:#166534;font-weight:600}.m365 .bad{color:#991b1b;font-weight:600}.m365 .muted{color:var(--mute,#64748b);font-size:13.5px}' +
    '.m365 button{min-height:44px;padding:0 16px;border-radius:12px;font:600 14.5px Inter,sans-serif;cursor:pointer;border:1px solid #5c8a8b;background:#5c8a8b;color:#fff}.m365 button.sec{background:transparent;color:inherit;border-color:#94a3b8}' +
    '.m365 ul{margin:0 0 10px 18px;padding:0}';
  function mount(el) {
    if (!document.getElementById('m365-css')) { var s = document.createElement('style'); s.id = 'm365-css'; s.textContent = CSS; document.head.appendChild(s); }
    el.className = 'm365';
    var q = new URLSearchParams(location.search), came = q.get('m365'), why = q.get('why') || '';
    var draw = function (st, note) {
      var head = '<h3>Microsoft 365 for Present</h3>';
      if (st && st.connected) {
        el.innerHTML = head + '<p class="ok">Connected' + (st.domain ? ': ' + esc(st.domain) : '') + '</p>' +
          '<p>PowerPoint slides in Present are drawn by Microsoft’s own PowerPoint, so fonts and layouts look exactly as they do in PowerPoint.</p>' +
          '<p class="muted">Connected by ' + esc(st.by || 'a master admin') + (st.at ? ' on ' + esc(String(st.at).slice(0, 10)) : '') + '. A copy of each PowerPoint is put in ' + esc(st.siteUrl || 'your SharePoint') + ' for a moment while it is drawn, then deleted.</p>' +
          (note || '') + '<button class="sec" data-off>Disconnect</button>';
      } else {
        el.innerHTML = head + (note || '') +
          '<p>If your church has Microsoft 365, connect it and Present’s PowerPoint slides are drawn by Microsoft’s own PowerPoint: the exact fonts (including Aptos) and layouts. Without it, Present draws them itself, which is close but not always exact.</p>' +
          '<ul><li>You need to be a <b>Global administrator</b> of your church’s Microsoft 365.</li><li>Microsoft will ask you to approve “Church HQ slides”. It can only use one SharePoint site, and only to draw slides.</li></ul>' +
          (st && st.available === false ? '<p class="muted">Not available yet: Church HQ is still setting this up.</p>' : '<button data-on>Connect Microsoft 365</button>');
      }
      var on = el.querySelector('[data-on]'), off = el.querySelector('[data-off]');
      if (on) on.onclick = function () {
        on.disabled = true; on.textContent = 'Opening Microsoft…';
        EGBCAuth.call('m365Start', {}).then(function (r) { r = r && r.data !== undefined ? r.data : r; location.href = r.url; },
          function (e) { on.disabled = false; on.textContent = 'Connect Microsoft 365'; draw(st, '<p class="bad">' + esc((e && e.message) || e) + '</p>'); });
      };
      if (off) off.onclick = function () {
        if (!confirm('Disconnect Microsoft 365? Present will draw slides itself again. To remove Church HQ slides from Microsoft 365 completely, delete it in Entra, Enterprise applications.')) return;
        EGBCAuth.call('m365Disconnect', {}).then(load, function (e) { draw(st, '<p class="bad">' + esc((e && e.message) || e) + '</p>'); });
      };
    };
    var note = came === 'connected' ? '<p class="ok">Microsoft 365 is connected.</p>' : came === 'failed' ? '<p class="bad">Not connected: ' + esc(why || 'please try again.') + '</p>' : '';
    function load() {
      el.innerHTML = '<p class="muted">Checking Microsoft 365…</p>';
      return EGBCAuth.call('m365Status', {}).then(function (r) { draw(r && r.data !== undefined ? r.data : r, note); note = ''; },
        function (e) { draw(null, '<p class="bad">' + esc((e && e.message) || e) + '</p>'); });
    }
    load();
    if (came && history.replaceState) history.replaceState(null, '', location.pathname + location.hash);
  }
  global.EGBCMicrosoft = { mount: mount };
})(window);
