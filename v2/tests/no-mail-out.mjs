/* NOTHING LEAVES THE TEST BROWSER FOR ANOTHER APP (7 Nov 2026).
 *
 * The first-view run opened Martin's Outlook: the training Sunday planner's
 * Email and the Core Team app's mail buttons go to a mailto: address, and a
 * headless Chrome hands a mailto:, tel:, sms: or webcal: navigation straight
 * to Windows. The pages are not changed for this (the Core Team app's sends go
 * through hubSend, as Martin decided; the training planner's waits for him).
 * The test browsers stop it instead.
 *
 * Used by tests/stage2/harness.mjs (every puppeteer browser it makes) and
 * tests/audit-everything.mjs (its own CDP browser). Proved by
 * tests/stage3/no-mail-out.mjs.
 *
 * HOW. Chrome has no switch or profile setting that blocks mailto: (it is one
 * of the schemes it always lets through), so the stop is in the page, put in
 * before any of the page's own scripts, in every frame:
 *   - a press on a link (<a>, <area>) to anything but a web address: the
 *     default stopped, before the page's own handlers see it;
 *   - location.href = / assign / replace, and a link's own navigation: the
 *     Navigation API's "navigate" event, cancelled;
 *   - window.open(mailto:...), a form whose action is one (submit, or
 *     form.submit()): refused.
 * Each is written down in window.__mailOut as { to, how }, and said in the
 * console as "[no-mail-out] opened a mail link to ...", so a run records
 * "opened a mail link to ..." for the control that did it.
 *
 * And a tripwire behind it: any request for such an address that still
 * reaches the browser (CDP Page.frameRequestedNavigation) is reported as
 * escaped, so a way round the stop is seen at once rather than in Outlook.
 */

/** A web address the test browser may go to; anything else would leave it. */
export const WEB = /^(https?|about|data|blob|javascript|chrome-error|devtools):/i;

/** Put in every frame before the page's scripts (Page.addScriptToEvaluateOnNewDocument). */
export const NO_MAIL_OUT_JS = `(function () {
  if (window.__mailOutGuard) return; window.__mailOutGuard = true;
  var out = window.__mailOut = window.__mailOut || [];
  var WEB = ${WEB.toString()};
  function away(u) { if (u == null || u === '') return null; try { var x = new URL(String(u), location.href); return WEB.test(x.protocol) ? null : x.href; } catch (e) { return null; } }
  function note(u, how) { out.push({ to: String(u).slice(0, 300), how: how }); try { console.warn('[no-mail-out] opened a mail link to ' + String(u).slice(0, 200) + ' (' + how + ')'); } catch (e) {} }
  function onPress(e) {
    var a = e.target && e.target.closest ? e.target.closest('a[href],area[href]') : null; if (!a) return;
    var u = away(a.getAttribute('href')); if (u) { e.preventDefault(); note(u, 'link'); }
  }
  window.addEventListener('click', onPress, true);
  window.addEventListener('auxclick', onPress, true);
  window.addEventListener('submit', function (e) {
    var f = e.target, act = f && f.getAttribute && f.getAttribute('action'); var u = act ? away(act) : null;
    if (u) { e.preventDefault(); note(u, 'form'); }
  }, true);
  var submit = HTMLFormElement.prototype.submit;
  HTMLFormElement.prototype.submit = function () { var act = this.getAttribute('action'); var u = act ? away(act) : null; if (u) { note(u, 'form'); return; } return submit.apply(this, arguments); };
  var open = window.open;
  window.open = function (u) { var x = away(u); if (x) { note(x, 'window.open'); return null; } return open.apply(this, arguments); };
  if (window.navigation && navigation.addEventListener) navigation.addEventListener('navigate', function (e) {
    var x = e.destination ? away(e.destination.url) : null;
    if (x && e.cancelable) { e.preventDefault(); note(x, 'navigation'); }
  });
})();`;

/** True when a requested navigation would leave the browser for another app. */
export const leavesBrowser = (url) => !!url && !WEB.test(String(url));

/**
 * The stop and the tripwire on one puppeteer page. Escaped addresses are kept
 * on page.mailEscaped and printed loudly.
 * @param {import('puppeteer-core').Page} page
 */
export async function guardPage(page) {
  await page.evaluateOnNewDocument(NO_MAIL_OUT_JS);
  page.mailEscaped = [];
  try {
    const cdp = await page.createCDPSession();
    await cdp.send('Page.enable');
    cdp.on('Page.frameRequestedNavigation', (e) => {
      if (leavesBrowser(e.url)) { page.mailEscaped.push(e.url); console.log('  NO-MAIL-OUT: a navigation to ' + String(e.url).slice(0, 120) + ' reached the browser (' + e.reason + ')'); }
    });
  } catch (e) { /* the stop itself is in place; only the tripwire is missing */ }
  return page;
}

/** What a page has been stopped from opening so far: [{ to, how }]. */
export const mailOutOf = (page) => page.evaluate(() => (window.__mailOut || []).slice()).catch(() => []);
