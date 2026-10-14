/* ===================================================================
   EGBC — the picture library (Martin, 14 Oct 2026)
   ===================================================================
   One shared store of pictures for the church (Film Club, Cafe Club,
   Carol Service...), each with a name and tags, so a picture is uploaded
   once and used again. For any church: nothing about one church is here.

   THE ONE IDEA: AN EVENT POINTS TO A LIBRARY PICTURE, IT DOES NOT COPY IT.
   calEvents.imageLibId names the picture; calEvents.image keeps its web
   address, so every page that shows an event's picture works as before.
   Repeating events and copies carry both, so no file is uploaded twice.
   - Replacing a picture updates every event that uses it.
   - Deleting one says first how many events use it; they then show no
     picture (the plain card) until somebody picks another.

   pictureLibrary/<id>: { name, tags, url, path, width, height,
   createdAt, createdBy, updatedAt, updatedBy }. The files live under
   library/<id>/ in storage (storage.rules, events section).

   Feature name (rule 12): pictureLibrary.
   =================================================================== */

(function (global) {
  'use strict';

  var EDGE = 1600;
  function db() { return EGBCAuth.db; }
  function storage() { return EGBCAuth.storage(); }
  function uid() { var u = (EGBCAuth.user && EGBCAuth.user()) || {}; return u.uid || ''; }
  function now() { return new Date().toISOString(); }
  function key(n) { return global.EGBCEvents && EGBCEvents.key ? EGBCEvents.key(n) : Math.random().toString(36).slice(2, 2 + n); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function on() { return !(global.EGBCChurch && EGBCChurch.uses) || EGBCChurch.uses('pictureLibrary') !== false; }
  function tagsOf(s) {
    return (Array.isArray(s) ? s : String(s || '').split(',')).map(function (t) { return String(t).trim().slice(0, 40); })
      .filter(function (t, i, a) { return t && a.indexOf(t) === i; }).slice(0, 12);
  }

  /* No bigger than 1600 pixels on its longest side, as a JPEG. */
  function shrink(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file), img = new Image();
      img.onload = function () {
        var w = img.naturalWidth, h = img.naturalHeight, s = Math.min(1, EDGE / Math.max(w, h));
        var c = document.createElement('canvas');
        c.width = Math.round(w * s); c.height = Math.round(h * s);
        var x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        c.toBlob(function (b) { b ? resolve({ blob: b, width: c.width, height: c.height }) : reject(new Error('The picture could not be made smaller.')); }, 'image/jpeg', 0.85);
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error((file && file.name || 'That picture') + ' could not be opened here. Save it as a JPEG or PNG first.')); };
      img.src = url;
    });
  }
  function store(id, file) {
    return shrink(file).then(function (img) {
      var path = 'library/' + id + '/' + Date.now() + '.jpg', ref = storage().ref(path);
      return ref.put(img.blob, { contentType: 'image/jpeg' }).then(function () { return ref.getDownloadURL(); })
        .then(function (url) { return { url: url, path: path, width: img.width, height: img.height }; });
    });
  }

  function list() {
    return db().collection('pictureLibrary').get().then(function (s) {
      return s.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); })
        .sort(function (a, b) { return String(a.name).localeCompare(String(b.name)); });
    });
  }
  /* A new picture. o: { name, tags }. Resolves with the picture. */
  function add(file, o) {
    o = o || {};
    var id = 'pic_' + key(14);
    return store(id, file).then(function (f) {
      var d = { name: String(o.name || (file && file.name) || 'Picture').trim().slice(0, 80) || 'Picture', tags: tagsOf(o.tags),
        url: f.url, path: f.path, width: f.width, height: f.height, createdAt: now(), createdBy: uid(), updatedAt: now(), updatedBy: uid() };
      return db().collection('pictureLibrary').doc(id).set(d).then(function () { return Object.assign({ id: id }, d); });
    });
  }
  function rename(id, name, tags) {
    var n = String(name || '').trim().slice(0, 80);
    if (!n) return Promise.reject(new Error('A picture needs a name.'));
    return db().collection('pictureLibrary').doc(id).update({ name: n, tags: tagsOf(tags), updatedAt: now(), updatedBy: uid() });
  }
  /* The events that use a picture. */
  function usedBy(id) {
    return db().collection('calEvents').where('imageLibId', '==', id).get().then(function (s) {
      return s.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); });
    });
  }
  function eachBatch(list, fn) {
    var jobs = [];
    for (var i = 0; i < list.length; i += 400) { var b = db().batch(); list.slice(i, i + 400).forEach(function (x) { fn(b, x); }); jobs.push(b.commit()); }
    return Promise.all(jobs);
  }
  /* A new file for the same picture: every event that uses it shows the new
     one. The old file is removed. Resolves with how many events changed. */
  function replace(id, file) {
    var ref = db().collection('pictureLibrary').doc(id), old = null, got = null;
    return ref.get().then(function (s) {
      if (!s.exists) throw new Error('That picture is no longer in the library.');
      old = s.data();
      return store(id, file);
    }).then(function (f) {
      got = f;
      return ref.update({ url: f.url, path: f.path, width: f.width, height: f.height, updatedAt: now(), updatedBy: uid() });
    }).then(function () { return usedBy(id); }).then(function (evs) {
      return eachBatch(evs, function (b, ev) { b.update(db().collection('calEvents').doc(ev.id), { image: got.url, updatedAt: now() }); }).then(function () {
        if (old && old.path) storage().ref(old.path).delete().catch(function () {});
        return evs.length;
      });
    });
  }
  /* Gone from the library. The events that used it show no picture until
     someone picks another. Resolves with how many events that was. */
  function remove(id) {
    var ref = db().collection('pictureLibrary').doc(id), old = null;
    return ref.get().then(function (s) { old = s.exists ? s.data() : null; return usedBy(id); }).then(function (evs) {
      return eachBatch(evs, function (b, ev) { b.update(db().collection('calEvents').doc(ev.id), { image: '', imageLibId: '', updatedAt: now() }); })
        .then(function () { return ref.delete(); })
        .then(function () { if (old && old.path) storage().ref(old.path).delete().catch(function () {}); return evs.length; });
    });
  }

  /* "Choose from library": a sheet of the pictures, searched by name or
     tag. onPick({ id, url, name }). Phone-friendly. */
  function picker(onPick) {
    var back = document.createElement('div');
    back.id = 'pl-picker';
    back.setAttribute('role', 'dialog'); back.setAttribute('aria-label', 'Choose a picture from the library');
    back.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(17,24,39,.45);display:flex;align-items:flex-end;justify-content:center;';
    back.innerHTML = '<div style="background:#fff;width:100%;max-width:720px;max-height:88vh;border-radius:16px 16px 0 0;padding:16px;box-sizing:border-box;display:flex;flex-direction:column;gap:10px">' +
      '<div style="display:flex;gap:8px;align-items:center"><b style="font:600 16px Inter,system-ui,sans-serif;flex:1">Picture library</b>' +
      '<button type="button" id="pl-close" style="border:1px solid #d1d5db;background:#fff;border-radius:8px;height:36px;padding:0 14px;font:500 13px Inter,sans-serif;cursor:pointer">Cancel</button></div>' +
      '<input id="pl-q" type="search" placeholder="Search by name or tag" aria-label="Search the picture library" style="height:40px;border:1px solid #d1d5db;border-radius:8px;padding:0 12px;font:400 15px Inter,sans-serif;width:100%;box-sizing:border-box">' +
      '<div id="pl-grid" style="overflow:auto;display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:10px;padding-bottom:8px"><p style="color:#6b7280">Loading…</p></div></div>';
    document.body.appendChild(back);
    var all = [];
    var close = function () { if (back.parentNode) back.parentNode.removeChild(back); };
    var draw = function () {
      var q = String(document.getElementById('pl-q').value || '').toLowerCase().trim();
      var l = all.filter(function (p) { return !q || String(p.name).toLowerCase().indexOf(q) >= 0 || (p.tags || []).some(function (t) { return String(t).toLowerCase().indexOf(q) >= 0; }); });
      document.getElementById('pl-grid').innerHTML = l.length ? l.map(function (p) {
        return '<button type="button" data-pick="' + esc(p.id) + '" style="border:1px solid #e5e7eb;border-radius:10px;background:#fff;padding:6px;text-align:left;cursor:pointer;min-width:0">' +
          '<img src="' + esc(p.url) + '" alt="" loading="lazy" style="width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:6px;display:block">' +
          '<span style="display:block;font:500 13px Inter,sans-serif;margin-top:6px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(p.name) + '</span></button>';
      }).join('') : '<p style="color:#6b7280">' + (all.length ? 'Nothing matches.' : 'The library is empty. Upload a picture with "Save to library" ticked.') + '</p>';
    };
    back.addEventListener('click', function (e) {
      if (e.target === back || (e.target.closest && e.target.closest('#pl-close'))) { close(); return; }
      var b = e.target.closest && e.target.closest('[data-pick]');
      if (b) { var p = all.filter(function (x) { return x.id === b.getAttribute('data-pick'); })[0]; close(); if (p && onPick) onPick({ id: p.id, url: p.url, name: p.name }); }
    });
    document.getElementById('pl-q').addEventListener('input', draw);
    list().then(function (l) { all = l; draw(); }).catch(function (e) { document.getElementById('pl-grid').innerHTML = '<p style="color:#b0392c">Could not open the library: ' + esc(e.message || e) + '</p>'; });
    return { close: close };
  }

  global.EGBCPictures = { on: on, list: list, add: add, rename: rename, replace: replace, remove: remove, usedBy: usedBy, picker: picker, tagsOf: tagsOf, shrink: shrink };
})(window);
