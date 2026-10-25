/* ===================================================================
   EGBC — what the e-news and the card maker share (comms window)
   ===================================================================

     EGBCComms.eventsBetween(from, to, limit) -> Promise of calEvents
        What's On between two times (ms), asked the way What's On asks
        (the rules only answer a list that names its audiences): public
        and members' events, and church members' events for those who
        may read them. Team and not-listed events are never asked for.
     EGBCComms.mayOffice()   the church office or a master admin
     EGBCComms.hubBase()     this page's folder, for links
   =================================================================== */
(function (global) {
  'use strict';
  function db() { return EGBCAuth.db; }

  function eventsBetween(from, to, limit) {
    var ask = function (aud) {
      var q = db().collection('calEvents').where('audience', 'array-contains-any', aud)
        .where('startUtc', '>=', from).where('startUtc', '<', to).orderBy('startUtc');
      /* Every event in the range unless a limit is asked for (C-52). */
      return (limit ? q.limit(limit).get().then(function (s) { return s.docs; }) : allDocs(q))
        .then(function (docs) { return docs.map(function (x) { return Object.assign({ id: x.id }, x.data()); }); }, function () { return []; });
    };
    var p = (EGBCAuth.profile && EGBCAuth.profile()) || {};
    var cm = p.churchMember === true || (EGBCAuth.isAdmin && EGBCAuth.isAdmin()) || (EGBCAuth.isMaster && EGBCAuth.isMaster());
    return Promise.all([ask(['public', 'members']), cm ? ask(['churchMembers']) : []]).then(function (r) {
      var seen = {}, out = [];
      r[0].concat(r[1]).forEach(function (e) { if (!seen[e.id]) { seen[e.id] = 1; out.push(e); } });
      return out.sort(function (a, b) { return (a.startUtc || 0) - (b.startUtc || 0); });
    });
  }

  function mayOffice() {
    return !!(EGBCAuth.isMaster && EGBCAuth.isMaster()) || !!(EGBCAuth.inTeam && EGBCAuth.inTeam('Church office'));
  }
  /* The hub's web address: the church setting (churchSettings/details.hubUrl)
     once read, otherwise this page's own folder - today the same address. */
  var HUB_SET = '';
  function hubBase() { return HUB_SET || location.href.replace(/[?#].*$/, '').replace(/\/[^\/]*$/, ''); }
  function readHub() {
    return EGBCAuth.db.collection('churchSettings').doc('details').get().then(function (d) {
      var u = d.exists ? String((d.data() || {}).hubUrl || '') : '';
      if (/^https:\/\//.test(u)) HUB_SET = u.replace(/\/+$/, '');
    }, function () {});
  }
  document.addEventListener('egbc-ready', readHub);

  /* NO HIDDEN CAPS (C-52; CLAUDE.md section 3). A list cut short on purpose
     shows the latest few and says so, with "Show more":
       showMore(box, { query, size, first, row, filter, wire, what })
     query: the ordered query; first: its first page (query.limit(size));
     row(doc) -> html; filter(doc) -> false to leave one out; wire(box)
     after rows are added; what: "issues" for the words. */
  function showMore(box, o) {
    var shown = 0, last = null;
    function add(s) {
      var docs = s.docs.filter(function (d) { return !o.filter || o.filter(d); });
      shown += docs.length; last = s.docs[s.docs.length - 1] || last;
      var old = box.querySelector('.cm-more'); if (old) old.remove();
      box.insertAdjacentHTML('beforeend', docs.map(o.row).join(''));
      if (s.size >= o.size) {
        box.insertAdjacentHTML('beforeend', '<div class="cm-more" style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:10px 0"><span class="m">Showing the latest ' + shown + ' ' + (o.what || '') + '.</span><button type="button" class="btn sec" style="min-height:44px">Show more</button></div>');
        box.querySelector('.cm-more button').onclick = function () {
          this.disabled = true;
          o.query.startAfter(last).limit(o.size).get().then(add, function () { box.querySelector('.cm-more span').textContent = 'Could not load more.'; });
        };
      }
      if (o.wire) o.wire(box);
    }
    add(o.first);
  }
  /* Every document of a query, a page at a time (no cap). */
  function allDocs(query, size) {
    size = size || 500;
    var out = [];
    function next(after) {
      return (after ? query.startAfter(after) : query).limit(size).get().then(function (s) {
        out = out.concat(s.docs);
        return s.size < size ? out : next(s.docs[s.docs.length - 1]);
      });
    }
    return next(null);
  }

  global.EGBCComms = { eventsBetween: eventsBetween, mayOffice: mayOffice, hubBase: hubBase, showMore: showMore, allDocs: allDocs };
})(window);
