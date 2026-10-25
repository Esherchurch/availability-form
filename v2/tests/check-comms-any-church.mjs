/* The comms window's pages and functions say nothing of EGBC's to another
 * church (reviewing window, 23 Oct 2026: the synthetic parish test, "any
 * EGBC name, word, logo, address or Baptist habit showing" fails it).
 *
 *   node tests/check-comms-any-church.mjs        (from v2/; no emulator)
 *
 * Asks: with the comments taken out, none of the comms files has EGBC's
 * name, Esher, a person's name, EGBC's logo file or "switch-over" (it is
 * "going live") in what it shows or sends. Allowed, each with the step
 * that removes it (FINDINGS-comms, "Any church"): the hub's own address
 * (esherchurch.github.io) until Church HQ's own address; "Church office",
 * which becomes the office job (H-9).
 *
 * DELIBERATE BREAKS (each must turn this check red):
 *   --break=word  puts "(e.g. EGBC)" back in enews.html
 *   --break=logo  puts EGBC's logo back in EmailBuilder2.html
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const V2 = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILES = ['egbc-mailblocks.js', 'egbc-enews-editor.js', 'egbc-enews-ab.js', 'egbc-enews-public.js', 'egbc-unsplash.js', 'egbc-starters.js', 'egbc-comms.js',
  'cardmaker.html', 'comms.html', 'EmailBuilder2.html', 'enews.html', 'enews-edit.html', 'enews-web.html', 'enews-signup.html', 'enews-confirm.html', 'enews-unsubscribe.html',
  'functions/enews.js', 'functions/enews-send.js', 'functions/enews-preview.js', 'functions/enews-gate.js', 'functions/welcome-mail.js', 'functions/meeting-papers.js',
  'functions/unsplash.js', 'functions/social.js', 'functions/canva.js', 'functions/canva-core.js', 'functions/mail-route.js', 'functions/public-mail.js',
  'functions/resend-secrets.js', 'functions/under18.js', 'functions/hq-mail.js', 'functions/hq-mail-key.js'];
const BREAK = (process.argv.find(a => a.startsWith('--break=')) || '').slice(8);
const BREAKS = {
  word: ['enews.html', "'Short name for the top line (the church’s initials, say)'", "'Short name for the top line (e.g. EGBC)'"],
  logo: ['EmailBuilder2.html', '<div class="logo" style="display:none"><img src="" alt=""></div>', '<div class="logo"><img src="https://firebasestorage.googleapis.com/v0/b/egbc-worship-planner.firebasestorage.app/o/1774936285076.png" alt="EGBC"></div>']
};
if (BREAK && !BREAKS[BREAK]) { console.log('Unknown break: ' + BREAK); process.exit(2); }

const R = [];
const ok = (n, v, x) => { R.push(!!v); console.log('  ' + (v ? 'PASS  ' : 'FAIL  ') + n + (v || x === undefined ? '' : '\n          ' + JSON.stringify(x).slice(0, 600))); };

/* What a file shows or sends: its text with the comments taken out. A
   regex or string holding "//" (an address) is kept: only a // after
   space or the start of a line, not after ":" or a quote, is a comment. */
const shown = t => t.replace(/<!--[\s\S]*?-->/g, ' ').replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[\s;{}(),])\/\/[^\n]*/g, '$1');
/* Words that must never show, and what's allowed for now. */
const NEVER = [
  [/\bEGBC\b(?![A-Za-z_.-])/g, 'EGBC'],
  [/Esher(?!church\\?\.github\\?\.io)/gi, 'Esher'],
  [/\bVal(’s|'s)?\b(?![a-z])/g, 'Val'],
  [/1774936285076|egbc-worship-planner\.firebasestorage\.app\/o\//g, "EGBC's logo"],
  [/switch-?over/gi, '"switch-over" (it is "going live")'],
  [/Baptist/gi, 'Baptist']
];
/* The code's own names aren't shown: EGBCAuth, egbc-*.js, the project id. */
const NAMES = t => t.replace(/\bEGBC[A-Z][A-Za-z]*/g, '').replace(/egbc-[a-z0-9-]+(\.[a-z]+)?/gi, '').replace(/'EGBC'\s*:/g, '');

const found = [];
for (const f of FILES) {
  let t = fs.readFileSync(path.join(V2, f), 'utf8');
  if (BREAK && BREAKS[BREAK][0] === f) {
    if (!t.includes(BREAKS[BREAK][1])) { console.log('break "' + BREAK + '": that line is not in ' + f + ' any more - update the break'); process.exit(2); }
    t = t.replace(BREAKS[BREAK][1], BREAKS[BREAK][2]);
  }
  const s = NAMES(shown(t));
  for (const [re, what] of NEVER) {
    (s.match(re) || []).forEach(m => {
      const at = s.indexOf(m);
      found.push(f + ': ' + what + ' in "' + s.slice(Math.max(0, at - 50), at + 50).replace(/\s+/g, ' ') + '"');
    });
  }
}
ok('no EGBC name, Esher, person’s name, EGBC logo, "switch-over" or Baptist word in what the comms files show or send', found.length === 0, found);

/* The allowed-for-now list stays what FINDINGS-comms says, so it can only shrink. */
const hubAddr = FILES.filter(f => /esherchurch\\?\.github\\?\.io/.test(shown(fs.readFileSync(path.join(V2, f), 'utf8'))));
ok('the hub’s own address (esherchurch.github.io) only where FINDINGS-comms lists it, until Church HQ’s own address',
  hubAddr.every(f => ['egbc-mailblocks.js', 'functions/enews.js', 'functions/enews-send.js', 'functions/enews-preview.js', 'functions/social.js', 'functions/canva.js'].includes(f)), hubAddr);

const pass = R.filter(Boolean).length;
console.log('\n' + pass + '/' + R.length + ' passed' + (BREAK ? '   (deliberate break: ' + BREAK + ', so this run SHOULD be red)' : ''));
process.exit(pass === R.length ? 0 : 1);
