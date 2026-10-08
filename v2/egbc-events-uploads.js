/* ===================================================================
   EGBC — one-off upload links (events window, E4; NEXT-BRIEF §11)
   ===================================================================

   An admin makes a link for an event; anyone with it can upload photos
   without signing in - pictures from a party. upload.html is the page
   they use; the review queue is on the event's Photos tab in
   events-admin.html.

   THREE THINGS WORTH KNOWING BEFORE CHANGING ANY OF IT

   1. NOTHING IS SHOWN ANYWHERE UNTIL AN ADMIN APPROVES IT. Photos may
      show children. Only admins can read the files or the records, and
      the records start as 'pending'.

   2. THE LIMIT ON FILES IS COUNTED IN THE DATABASE. The rules cannot count
      files, so each upload first takes a numbered place on the link
      (count goes up by exactly one, never past maxFiles) and the file is
      stored under that number: uploads/<link>/<number>. Storage accepts a
      number only if it has been taken, and only once. Two phones uploading
      at the same moment get different numbers.

   3. CODE NEVER DELETES A PHOTO. Rejected photos are marked rejected and
      stay stored until Martin deletes them by hand (FINDINGS-events.md
      F-053). The rules refuse deletion from the pages.
   =================================================================== */

(function (global) {
  'use strict';

  var TYPES = ['image/jpeg', 'image/png', 'image/heic', 'image/heif', 'image/webp'];
  var MAX_BYTES = 15 * 1024 * 1024;

  function db() { return EGBCAuth.db; }
  function base() { return location.origin + location.pathname.replace(/[^/]*$/, ''); }
  function linkUrl(id) { return base() + 'upload.html?k=' + id; }

  function millis(t) { return t && t.toMillis ? t.toMillis() : (t && t.seconds ? t.seconds * 1000 : new Date(t || 0).getTime()); }

  /* 'off', 'expired', 'full' or 'open'. */
  function state(link) {
    if (!link || link.active !== true) return 'off';
    if (millis(link.expiresAt) <= Date.now()) return 'expired';
    if ((link.count || 0) >= (link.maxFiles || 0)) return 'full';
    return 'open';
  }

  /* Some phones say nothing about a HEIC file's type; go by its name. */
  function typeOf(file) {
    if (file.type) return file.type.toLowerCase();
    var ext = String(file.name || '').split('.').pop().toLowerCase();
    return { heic: 'image/heic', heif: 'image/heif', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' }[ext] || '';
  }

  /* Why a file cannot go, or '' if it can. */
  function refuse(file) {
    if (TYPES.indexOf(typeOf(file)) < 0) return 'not a photo (JPEG, PNG, HEIC or WebP)';
    if (file.size >= MAX_BYTES) return 'too big (photos must be under 15 MB)';
    return '';
  }

  function makeLink(ev, o) {
    var u = (EGBCAuth.user && EGBCAuth.user()) || {}, p = (EGBCAuth.profile && EGBCAuth.profile()) || {};
    var id = 'up_' + EGBCEvents.key(28);
    var days = Math.max(1, Math.min(90, parseInt(o.days, 10) || 14));
    var d = {
      calEventId: ev.id, eventTitle: ev.title || '', createdBy: u.uid || '', createdByName: p.name || '',
      createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + days * 864e5),
      maxFiles: Math.max(1, Math.min(200, parseInt(o.maxFiles, 10) || 50)), active: true, count: 0
    };
    return db().collection('uploadLinks').doc(id).set(d).then(function () { return Object.assign({ id: id }, d); });
  }

  /* Take the next numbered place on the link. A transaction, so two
     phones at once cannot take the same number. */
  function claim(linkId) {
    var ref = db().collection('uploadLinks').doc(linkId);
    return db().runTransaction(function (tx) {
      return tx.get(ref).then(function (s) {
        if (!s.exists) throw new Error('This link is not right.');
        var l = s.data(), st = state(l);
        if (st !== 'open') throw new Error(st === 'full' ? 'This link has taken all the photos it can.' : st === 'expired' ? 'This link has run out.' : 'This link has been switched off.');
        tx.update(ref, { count: (l.count || 0) + 1 });
        return l.count || 0;
      });
    });
  }

  /* One photo: a place, the file under that number, then its record for
     the review queue. */
  function uploadOne(link, file, uploaderName, onProgress) {
    var why = refuse(file);
    if (why) return Promise.resolve({ ok: false, name: file.name, reason: why });
    var type = typeOf(file);
    return claim(link.id).then(function (slot) {
      var path = 'uploads/' + link.id + '/' + slot;
      var task = EGBCAuth.storage().ref(path).put(file, { contentType: type, customMetadata: { originalName: String(file.name).slice(0, 200) } });
      if (onProgress) task.on('state_changed', function (s) { onProgress(s.bytesTransferred / (s.totalBytes || 1)); });
      return task.then(function () {
        return db().collection('uploadItems').doc(link.id + '__' + slot).set({
          linkId: link.id, slot: slot, calEventId: link.calEventId, path: path,
          name: String(file.name || 'photo').slice(0, 200), type: type, size: file.size,
          uploaderName: String(uploaderName || '').trim().slice(0, 80), at: new Date().toISOString(), status: 'pending'
        });
      }).then(function () { return { ok: true, name: file.name, slot: slot }; });
    }).catch(function (e) { return { ok: false, name: file.name, reason: (e && e.message) || String(e) }; });
  }

  var api = { TYPES: TYPES, MAX_BYTES: MAX_BYTES, linkUrl: linkUrl, state: state, millis: millis, typeOf: typeOf, refuse: refuse,
              makeLink: makeLink, claim: claim, uploadOne: uploadOne };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else global.EGBCUploads = api;

})(typeof window !== 'undefined' ? window : this);
