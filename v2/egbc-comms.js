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
      return db().collection('calEvents').where('audience', 'array-contains-any', aud)
        .where('startUtc', '>=', from).where('startUtc', '<', to).orderBy('startUtc').limit(limit || 200).get()
        .then(function (s) { return s.docs.map(function (x) { return Object.assign({ id: x.id }, x.data()); }); }, function () { return []; });
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
  function hubBase() { return location.href.replace(/[?#].*$/, '').replace(/\/[^\/]*$/, ''); }

  global.EGBCComms = { eventsBetween: eventsBetween, mayOffice: mayOffice, hubBase: hubBase };
})(window);
