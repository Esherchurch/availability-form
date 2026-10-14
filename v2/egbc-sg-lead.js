/* ===================================================================
   EGBC — who is the safeguarding lead (and deputy), in one place
   ===================================================================

   Martin, 14 Oct 2026: "my app still says no safeguarding lead set, even
   though it is". It wasn't: the lead could only be set on a building in
   Places, and Safeguarding settings - where anybody would look - had no box
   for it at all. So nothing wrote safeguardingSettings/defaults.leadSiteId,
   and without that the rules (sgLeadSet, sgLeadOrDeputy) and the status
   note say there is no lead.

   This draws the three choices - the building, the lead, the deputy (adults
   in the address book) - and saving writes all of it:
     bookingSettings/<site>  safeguardingLead, safeguardingDeputy  (what Places
                             shows too, so both pages show the same values)
     safeguardingSettings/defaults  leadSiteId, leadName, leadPhone
   The server's careStatusFrom* triggers then update careRouting/status.

     EGBCSgLead.mount(el, { toast })

   Used on Church settings > Who gets told; offered to the events window for
   Safeguarding settings (FINDINGS-events F-180). An admin's to save, as the
   rules say.
   =================================================================== */

(function (global) {
  'use strict';

  function db() { return global.EGBCAuth && EGBCAuth.db; }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function load() {
    return Promise.all([
      db().collection('sites').get(),
      db().collection('addressBook').get(),
      db().collection('safeguardingSettings').doc('defaults').get().catch(function () { return null; })
    ]).then(function (x) {
      var sites = x[0].docs.map(function (d) { return { id: d.id, name: String((d.data() || {}).name || d.id) }; })
        .sort(function (a, b) { return a.name.localeCompare(b.name); });
      var people = x[1].docs.map(function (d) { var b = d.data() || {}; return { id: d.id, name: String(b.name || b.fullName || ''), phone: String(b.phone || b.mobile || ''), minor: b.isMinor === true, archived: b.archived === true }; })
        .filter(function (p) { return p.name && !p.minor && !p.archived; })
        .sort(function (a, b) { return a.name.localeCompare(b.name); });
      var def = x[2] && x[2].exists ? (x[2].data() || {}) : {};
      var site = String(def.leadSiteId || '') || (sites.length === 1 ? sites[0].id : '');
      return (site ? db().collection('bookingSettings').doc(site).get().catch(function () { return null; }) : Promise.resolve(null))
        .then(function (b) {
          var s = b && b.exists ? (b.data() || {}) : {};
          return { sites: sites, people: people, site: site, lead: s.safeguardingLead || '', deputy: s.safeguardingDeputy || '' };
        });
    });
  }

  function draw(el, S, o) {
    var opts = function (sel) {
      return '<option value="">Nobody chosen</option>' + S.people.map(function (p) {
        return '<option value="' + esc(p.id) + '"' + (p.id === sel ? ' selected' : '') + '>' + esc(p.name) + '</option>';
      }).join('');
    };
    el.innerHTML =
      (S.sites.length ? '' : '<p class="hint">There are no buildings yet. Add the church’s building in Places first.</p>') +
      '<div class="field"><label for="sgl-site">The building they cover</label><select class="inp" id="sgl-site">' +
        S.sites.map(function (s) { return '<option value="' + esc(s.id) + '"' + (s.id === S.site ? ' selected' : '') + '>' + esc(s.name) + '</option>'; }).join('') +
      '</select></div>' +
      '<div class="field"><label for="sgl-lead">Safeguarding lead</label><select class="inp" id="sgl-lead">' + opts(S.lead) + '</select></div>' +
      '<div class="field"><label for="sgl-deputy">Deputy</label><select class="inp" id="sgl-deputy">' + opts(S.deputy) + '</select></div>' +
      '<button type="button" class="btn" id="sgl-save">Save the safeguarding lead</button>';
    var site = el.querySelector('#sgl-site');
    if (site) site.onchange = function () {
      /* A different building: show who it already has. */
      db().collection('bookingSettings').doc(site.value).get().then(function (b) {
        var s = b.exists ? (b.data() || {}) : {};
        S.site = site.value; S.lead = s.safeguardingLead || ''; S.deputy = s.safeguardingDeputy || '';
        draw(el, S, o);
      });
    };
    el.querySelector('#sgl-save').onclick = function () { save(el, S, o); };
  }

  function save(el, S, o) {
    var site = (el.querySelector('#sgl-site') || {}).value || '';
    var lead = el.querySelector('#sgl-lead').value, deputy = el.querySelector('#sgl-deputy').value;
    var say = o.toast || function () {};
    if (!site) { say('Add the building in Places first.'); return; }
    if (lead && lead === deputy) { say('The deputy needs to be somebody else.'); return; }
    var who = S.people.filter(function (p) { return p.id === lead; })[0] || {};
    var u = (global.EGBCAuth && EGBCAuth.user && EGBCAuth.user()) || {};
    var b = el.querySelector('#sgl-save'); b.disabled = true;
    db().collection('bookingSettings').doc(site).set({ safeguardingLead: lead, safeguardingDeputy: deputy }, { merge: true })
      .then(function () {
        return db().collection('safeguardingSettings').doc('defaults').set({
          leadSiteId: site, leadName: who.name || '', leadPhone: who.phone || '',
          updatedAt: new Date().toISOString(), updatedBy: u.uid || ''
        }, { merge: true });
      })
      .then(function () { S.site = site; S.lead = lead; S.deputy = deputy; say(lead ? 'Saved. ' + who.name + ' is the safeguarding lead.' : 'Saved.'); draw(el, S, o); if (o.saved) o.saved(); })
      .catch(function (e) { b.disabled = false; say('Could not save: ' + (e.message || e)); });
  }

  function mount(el, o) {
    o = o || {};
    if (!el) return;
    el.innerHTML = '<p class="hint">Loading…</p>';
    load().then(function (S) { draw(el, S, o); }, function (e) {
      el.innerHTML = '<p class="hint">Could not load the safeguarding lead: ' + esc(e.message || e) + '</p>';
    });
  }

  global.EGBCSgLead = { mount: mount };
})(window);
