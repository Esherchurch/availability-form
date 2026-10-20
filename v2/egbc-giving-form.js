/* ===================================================================
   EGBC — the church's giving (bank) details: the one form
   (moved out of church-settings.html, 21 Oct 2026)
   ===================================================================

   WHY ITS OWN FILE. Church settings became master admins only (the
   reviewing window, 21 Oct 2026), and the Church office keep the bank
   details - they are the people who know them. So the same form is on
   two pages: Church settings (master admins) and Giving details
   (giving-details.html: the Church office and master admins). One file,
   so the two cannot drift.

     EGBCGivingForm.mount(el, { toast })  -> reads churchSettings/giving,
                                             draws the form into el,
                                             saves it when pressed

   WHO MAY SAVE is firestore.rules' answer (churchSettings/giving: a master
   admin or the Church office). A page only mounts this for them.

   NO VALUES IN THIS FILE. The repository is public. The fields start
   empty and Martin or Val type the real ones in once it is live.
   =================================================================== */

(function (global) {
  'use strict';
  function db() { return global.EGBCAuth.db; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  function mount(el, opts) {
    opts = opts || {};
    var toast = opts.toast || function (m) { try { console.log(m); } catch (e) {} };
    var G = {};

    function draw() {
      el.innerHTML =
        '<div class="field"><label for="g-name">Account name</label>' +
          '<input class="inp" id="g-name" maxlength="120" autocomplete="off" value="' + esc(G.accountName) + '"></div>' +
        '<div class="field"><label for="g-sort">Sort code</label>' +
          '<input class="inp" id="g-sort" maxlength="20" autocomplete="off" inputmode="numeric" value="' + esc(G.sortCode) + '">' +
          /* NO EXAMPLE DIGITS HERE, not even zeros (check-give.mjs looks for
             the shape in these pages, and an example is indistinguishable
             from somebody pasting the real one in). */
          '<p class="hint" style="margin:6px 0 0">Six digits, however you would write it on a form &mdash; with or without the dashes.</p></div>' +
        '<div class="field"><label for="g-acct">Account number</label>' +
          '<input class="inp" id="g-acct" maxlength="20" autocomplete="off" inputmode="numeric" value="' + esc(G.accountNumber) + '"></div>' +
        '<div class="field"><label for="g-ref">Suggested reference</label>' +
          '<input class="inp" id="g-ref" maxlength="60" autocomplete="off" value="' + esc(G.reference) + '">' +
          '<p class="hint" style="margin:6px 0 0">What to put in the reference box, so the treasurer can tell who it is from. For example: their own name.</p></div>' +
        '<div class="field"><label for="g-gastate">Gift Aid</label>' +
          '<select class="inp" id="g-gastate">' +
            '<option value="no"' + (G.giftAid ? '' : ' selected') + '>Do not mention Gift Aid</option>' +
            '<option value="yes"' + (G.giftAid ? ' selected' : '') + '>Mention Gift Aid, with a link to the form</option>' +
          '</select></div>' +
        '<div class="field" id="g-url-field"' + (G.giftAid ? '' : ' hidden') + '>' +
          '<label for="g-url">Link to the Gift Aid form</label>' +
          '<input class="inp" id="g-url" type="url" maxlength="300" placeholder="https://" value="' + esc(G.giftAidUrl) + '">' +
          '<p class="hint" style="margin:6px 0 0">Where the declaration form lives. Left empty, the Gift Aid line still appears but without a link.</p></div>' +
        '<div class="field"><label for="g-note">Anything else to say</label>' +
          '<input class="inp" id="g-note" maxlength="400" value="' + esc(G.note) + '">' +
          '<p class="hint" style="margin:6px 0 0">One line, shown under the details. Optional.</p></div>' +
        '<button class="btn" id="g-save">Save the giving details</button>';
      el.querySelector('#g-gastate').onchange = function () {
        el.querySelector('#g-url-field').hidden = this.value !== 'yes';
      };
      el.querySelector('#g-save').onclick = save;
    }

    function save() {
      var v = function (id) { return el.querySelector('#' + id).value.trim(); };
      var giftAid = el.querySelector('#g-gastate').value === 'yes';
      var url = giftAid ? v('g-url') : '';
      if (url && !/^https?:\/\/\S+$/.test(url)) { toast('That link does not look right. It should start with https://'); return; }
      var u = global.EGBCAuth.user() || {};
      var body = {
        accountName: v('g-name'), sortCode: v('g-sort'), accountNumber: v('g-acct'),
        reference: v('g-ref'), giftAid: giftAid, giftAidUrl: url, note: v('g-note'),
        updatedAt: new Date().toISOString(), updatedBy: u.uid || ''
      };
      el.querySelector('#g-save').disabled = true;
      db().collection('churchSettings').doc('giving').set(body).then(function () {
        G = body; toast('Saved.'); draw();
      }).catch(function (e) {
        el.querySelector('#g-save').disabled = false;
        toast('Could not save: ' + (e.message || e));
      });
    }

    return db().collection('churchSettings').doc('giving').get().then(function (g) {
      G = (g.exists && g.data()) || {}; draw();
    }, function () { draw(); });
  }

  global.EGBCGivingForm = { mount: mount };
})(window);
