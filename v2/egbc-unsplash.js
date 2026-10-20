/* ===================================================================
   EGBC — the Unsplash picker (comms window), for the card maker and the
   e-news editor. The searching is the server's (functions/unsplash.js:
   the key, the day-long cache, Demo mode's 50 an hour); this is the sheet.

     EGBCUnsplash.pick({ shape })  -> Promise<photo | null>
         photo: { id, alt, regular, small, thumb, name, profile, unsplash,
                  downloadLocation } - shown from Unsplash (hotlinked)
     EGBCUnsplash.used(photo)      the download ping, when it is used
     EGBCUnsplash.credit(photo)    { name, profile, url } to keep with it
     EGBCUnsplash.creditText(c)    "Photo by <name> on Unsplash"

   Every picture in the sheet shows its photographer, as Unsplash asks.
   =================================================================== */
(function (root) {
  'use strict';
  var UTM = 'utm_source=church_hq&utm_medium=referral';
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var img = function (u) { return /^https:\/\/images\.unsplash\.com\//.test(String(u || '')) ? String(u) : ''; };
  var prof = function (u) { return /^https:\/\/unsplash\.com\/@[A-Za-z0-9_.-]{1,60}\?utm_source=church_hq&utm_medium=referral$/.test(String(u || '')) ? String(u) : ''; };

  function call(name, data) {
    return root.EGBCAuth.call(name, data || {}).then(function (r) { return (r && r.data !== undefined) ? r.data : r; });
  }
  function credit(p) { return { name: String(p.name || '').slice(0, 80), profile: prof(p.profile), url: img(p.regular) }; }
  function creditText(c) { return c && c.name ? 'Photo by ' + c.name + ' on Unsplash' : ''; }
  function used(p) { return p && p.downloadLocation ? call('unsplashUsed', { downloadLocation: p.downloadLocation }).catch(function () {}) : Promise.resolve(); }

  var CSS = '.us-back{position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:2000;display:flex;align-items:center;justify-content:center;padding:16px}' +
    '.us{background:var(--card,#fff);color:var(--ink,#1f2937);border-radius:14px;width:min(880px,100%);max-height:calc(100vh - 32px);display:flex;flex-direction:column;box-shadow:0 12px 40px rgba(0,0,0,.25)}' +
    '.us header{display:flex;gap:8px;align-items:center;padding:14px 16px;border-bottom:1px solid var(--line,#e5e7eb)}' +
    '.us header h2{margin:0;font-size:17px;flex:1}' +
    '.us form{display:flex;gap:8px;padding:12px 16px 0}.us input[type=search]{flex:1;min-height:44px;font:inherit;padding:0 12px;border:1px solid var(--line,#d1d5db);border-radius:10px;background:var(--card,#fff);color:inherit}' +
    '.us select{min-height:44px;font:inherit;border:1px solid var(--line,#d1d5db);border-radius:10px;background:var(--card,#fff);color:inherit;padding:0 8px}' +
    '.us .us-msg{padding:8px 16px 0;margin:0;color:var(--muted,#6b7280);font-size:14px}' +
    '.us .us-grid{overflow:auto;padding:12px 16px 16px;display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:10px}' +
    '.us figure{margin:0;display:flex;flex-direction:column;gap:4px}' +
    '.us figure button{display:block;width:100%;aspect-ratio:4/3;border:2px solid transparent;border-radius:10px;background:#ddd center/cover no-repeat;cursor:pointer;padding:0}' +
    '.us figure button:hover,.us figure button:focus-visible{border-color:var(--brand,#3d6263)}' +
    '.us figcaption{font-size:12px;color:var(--muted,#6b7280);line-height:1.3}.us figcaption a{color:inherit}' +
    '.us .us-x,.us .us-go{min-height:44px;min-width:44px;border-radius:10px;font:inherit;cursor:pointer}' +
    '.us .us-x{border:0;background:transparent;color:inherit;font-size:22px}.us .us-go{border:0;background:var(--brand,#3d6263);color:#fff;padding:0 16px;font-weight:600}' +
    '.us .us-more{grid-column:1/-1;justify-self:center;min-height:44px;padding:0 18px;border-radius:10px;border:1px solid var(--line,#d1d5db);background:transparent;color:inherit;font:inherit;cursor:pointer}' +
    '.us footer{padding:10px 16px;border-top:1px solid var(--line,#e5e7eb);font-size:12px;color:var(--muted,#6b7280)}.us footer a{color:inherit}';

  function pick(opts) {
    opts = opts || {};
    if (!document.getElementById('us-css')) { var st = document.createElement('style'); st.id = 'us-css'; st.textContent = CSS; document.head.appendChild(st); }
    return new Promise(function (done) {
      var back = document.createElement('div'); back.className = 'us-back';
      back.innerHTML = '<div class="us" role="dialog" aria-modal="true" aria-labelledby="us-h"><header><h2 id="us-h">Pictures from Unsplash</h2><button type="button" class="us-x" aria-label="Close">×</button></header>' +
        '<form><input type="search" id="us-q" placeholder="Search, for example: autumn, harvest, candles" aria-label="Search Unsplash" maxlength="60" value="' + esc(opts.q || '') + '">' +
        '<select id="us-shape" aria-label="Shape"><option value="">Any shape</option><option value="landscape">Wide</option><option value="portrait">Tall</option><option value="squarish">Square</option></select>' +
        '<button class="us-go" type="submit">Search</button></form><p class="us-msg" role="status" id="us-msg">Free pictures from Unsplash. Each is credited to its photographer wherever it is used.</p>' +
        '<div class="us-grid" id="us-grid"></div><footer>Pictures shown from <a href="https://unsplash.com/?' + UTM + '" target="_blank" rel="noopener">Unsplash</a>, under the <a href="https://unsplash.com/license?' + UTM + '" target="_blank" rel="noopener">Unsplash License</a>.</footer></div>';
      document.body.appendChild(back);
      var $ = function (id) { return back.querySelector('#' + id); };
      if (opts.shape) $('us-shape').value = opts.shape;
      var page = 1, shown = [];
      var close = function (p) { back.remove(); document.removeEventListener('keydown', key); done(p || null); };
      var key = function (e) { if (e.key === 'Escape') close(null); };
      document.addEventListener('keydown', key);
      back.querySelector('.us-x').onclick = function () { close(null); };
      back.addEventListener('click', function (e) { if (e.target === back) close(null); });
      var draw = function (more) {
        var g = $('us-grid');
        g.innerHTML = shown.map(function (p, i) {
          return '<figure><button type="button" data-i="' + i + '" aria-label="' + esc((p.alt || 'Picture') + ', by ' + p.name) + '" style="background-image:url(\'' + esc(img(p.small) || img(p.thumb)) + '\');' + (p.color ? 'background-color:' + esc(p.color) : '') + '"></button>' +
            '<figcaption>Photo by <a href="' + esc(prof(p.profile)) + '" target="_blank" rel="noopener">' + esc(p.name) + '</a> on <a href="https://unsplash.com/?' + UTM + '" target="_blank" rel="noopener">Unsplash</a></figcaption></figure>';
        }).join('') + (more ? '<button type="button" class="us-more" id="us-more">More pictures</button>' : '');
        Array.prototype.forEach.call(g.querySelectorAll('[data-i]'), function (b) { b.onclick = function () { close(shown[+b.getAttribute('data-i')]); }; });
        var m = $('us-more'); if (m) m.onclick = function () { page++; search(true); };
      };
      var search = function (add) {
        var q = $('us-q').value.trim();
        if (q.length < 2) { $('us-msg').textContent = 'Type a word or two to search.'; return; }
        $('us-msg').textContent = 'Searching…';
        call('unsplashSearch', { q: q, page: page, shape: $('us-shape').value }).then(function (r) {
          r = r || {};
          if (r.busy) { $('us-msg').textContent = 'Unsplash has had all our searches for this hour. Try again after ' + (r.again || 'the hour') + ', or use the picture library.'; if (!add) { shown = []; draw(false); } return; }
          shown = (add ? shown : []).concat((r.photos || []).filter(function (p) { return img(p.regular) && prof(p.profile); }));
          $('us-msg').textContent = shown.length ? (r.total || shown.length) + ' pictures for “' + (r.words || q) + '”. Tap one to use it.' : 'Nothing found for “' + q + '”. Try other words.';
          draw(page < (r.pages || 0) && page < 10);
        }, function (e) { $('us-msg').textContent = 'Unsplash couldn’t be reached: ' + ((e && e.message) || e); });
      };
      back.querySelector('form').onsubmit = function (e) { e.preventDefault(); page = 1; search(false); };
      $('us-q').focus();
      if (opts.q) search(false);
    });
  }

  root.EGBCUnsplash = { pick: pick, used: used, credit: credit, creditText: creditText, UTM: UTM, isImage: function (u) { return !!img(u); }, isProfile: function (u) { return !!prof(u); } };
})(typeof window !== 'undefined' ? window : this);
