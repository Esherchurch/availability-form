/* ===================================================================
   EGBC — what the e-news and the card maker share (comms window)
   ===================================================================

     EGBCComms.eventsBetween(from, to, limit) -> Promise of calEvents
        What's On between two times (ms), asked the way What's On asks
        (the rules only answer a list that names its audiences): public
        and members' events, and church members' events for those who
        may read them. Team and not-listed events are never asked for.
     EGBCComms.ready()       the person's jobs, read (a Promise)
     EGBCComms.mayOffice()   the office job or a master admin (after ready)
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

  /* THE OFFICE (H-9): master admins, and the church's own teams for the
     office job (EGBCAuth.myJobs: churchSettings/teamJobs; EGBC's Church
     office when nothing is stored). Ask after ready(): the jobs are read
     with the person's permissions. */
  function ready() { return Promise.resolve(EGBCAuth.loadPerms ? EGBCAuth.loadPerms() : null).catch(function () {}); }
  function mayOffice() {
    return !!(EGBCAuth.isMaster && EGBCAuth.isMaster()) || !!(EGBCAuth.myJobs && EGBCAuth.myJobs().indexOf('office') >= 0);
  }
  /* The hub's web address: this page's own folder. Each church's hub is
     served at its own address (<slug>.churchhq.co.uk, made at setup, never
     typed; main's hub-address.js), so the page is already there. The old
     churchSettings/details.hubUrl is read by nothing (main, 26 Oct). */
  function hubBase() { return location.href.replace(/[?#].*$/, '').replace(/\/[^\/]*$/, ''); }

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

  global.EGBCComms = { eventsBetween: eventsBetween, ready: ready, mayOffice: mayOffice, hubBase: hubBase, showMore: showMore, allDocs: allDocs };
})(window);
