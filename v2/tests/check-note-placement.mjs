/* ONE PIECE OF CODE DECIDES WHERE A NOTE GOES ON THE CORKBOARD.
 *
 *   node tests/check-note-placement.mjs      (a second, no browser)
 *
 * APP-DESIGN-BRIEF 7f, in Martin's terms: "The new note gets a free spot
 * on the corkboard using stickynotes' own placement code (one piece of
 * code decides where notes go)."
 *
 * WHY THIS IS A CHECK AND NOT A COMMENT. There were THREE ways to add a
 * note to a board before today - typing one in, a leader putting up a
 * young person's suggestion, and now the phone - and the first two each
 * had their own copy of the arithmetic. They had already drifted: the
 * approve path counted every note on the board rather than the ones on
 * this page that are not archived, and left out the jitter and the tilt.
 * So a note from a suggestion sat square and could land on top of
 * another page's note, while one typed by hand never did, and nobody
 * could have guessed why from looking at the board.
 *
 * Two things are asserted:
 *   1. the arithmetic exists in exactly ONE place, and every way of
 *      adding a note goes through it;
 *   2. moving it did not change where notes land - the formula is
 *      evaluated here against the numbers that were inline before.
 *
 * The second is the one that matters on the day: an extraction that
 * quietly shifts every note by 20 pixels is not a refactor, it is a
 * rearrangement of somebody's board.
 */
import fs from 'node:fs';
import path from 'node:path';

const V2 = path.resolve('.');
const SRC = fs.readFileSync(path.join(V2, 'stickynotes.html'), 'utf8');

const R = [];
const ok = (n, v, x) => {
  R.push(v);
  console.log('  ' + (v ? 'PASS  ' : 'FAIL  ') + n
    + (v ? '' : (x !== undefined ? '\n          ' + String(x).slice(0, 400) : '')));
};

console.log('\nthe page still parses');

/* THIS ONE IS HERE BECAUSE I BROKE IT. Moving the placement code in, I
   closed the explaining comment above it and then wrote six more lines
   of prose after the close - leaving plain English sitting where
   code goes and a stray terminator after it. stickynotes.html would
   not have run at all. Nothing I had to hand said so: the emulators'
   auth had gone down, so the checks that open the page could not, and a
   grep for the function found it perfectly happily.

   Parsing the page costs nothing and needs no browser, so it goes first:
   everything below is about where a note lands, and none of it means
   anything if the file does not run. */
{
  const blocks = [...SRC.matchAll(/<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/g)];
  const broken = [];
  for (const [i, m] of blocks.entries()) {
    try { new Function(m[1]); } catch (e) { broken.push('inline script ' + i + ': ' + e.message); }
  }
  ok('every inline script in stickynotes.html parses',
    blocks.length > 0 && broken.length === 0,
    blocks.length === 0 ? 'no inline scripts found - has the page changed shape?'
      : broken.join(' | '));
}

console.log('\nwhere a new note goes');

/* ---- 1. one place, and everybody uses it ------------------------- */

/* The arithmetic itself: a multiple of 310 across. Counted on source
   lines, not on the whole file as one string, so a line is a site. */
const lines = SRC.split(/\r?\n/);
const sites = lines
  .map((l, i) => ({ n: i + 1, l }))
  .filter(x => /\* *310/.test(x.l) || /310 *\*/.test(x.l) || /% *5\) *\* *310/.test(x.l));
ok('the arithmetic for a note\u2019s place is in exactly one place',
  sites.length === 1, sites.map(s => s.n + ': ' + s.l.trim()).join(' | ') || 'none found at all');

/* AND THAT PLACE IS noteSpotAt(). The first version of this assertion
   was gibberish - it compared a string index against itself plus the
   file length, which is true for anything - and it still "failed", for
   the unrelated reason that noteSpot did not exist yet. A green from it
   would have meant nothing. So it now asks the two things it meant:
   that the function exists, and that the one arithmetic line is inside
   it rather than somewhere else entirely. */
const atFn = /function noteSpotAt\s*\(\s*i\s*\)\s*\{([\s\S]*?)\n\}/.exec(SRC);
ok('and that place is noteSpotAt()',
  !!atFn && /\* *310/.test(atFn[1]),
  atFn ? 'noteSpotAt() does not contain the arithmetic' : 'noteSpotAt() not found');
ok('noteSpot() sits on top of it, for placing one new note',
  /function noteSpot\s*\(\s*\)\s*\{[\s\S]*?noteSpotAt\(/.test(SRC),
  'noteSpot() does not call noteSpotAt()');
/* The repair path in renderNotes() uses it too - that is the path a note
   added on a phone arrives by, since the phone never writes x and y. */
ok('and the note-with-no-place path uses it as well',
  /note\.x == null\)\s*\{[\s\S]{0,200}?noteSpotAt\(/.test(SRC),
  'renderNotes() still works out its own position for a placeless note');

/* Every way of adding a note calls it - counted in the CODE, with the
   comments taken out first.

   THE SIXTH TIME. My first version of this line skipped anything
   starting with //, * or /*, which is not what a comment looks like in
   the middle of one: the explanation above noteSpot() runs over several
   lines and four of them begin with ordinary words while talking about
   noteSpot(). It counted 6 calls where there are 2. Recognising a
   comment by the shape of its first characters does not work, and this
   is the sixth time in this project that a count has been fooled by a
   comment describing the thing it was looking for. So the comments go,
   and then the counting happens. */
const CODE = SRC
  .replace(/\/\*[\s\S]*?\*\//g, '')          // block comments
  .replace(/(^|[^:"'`])\/\/[^\n]*/g, '$1');  // line comments, sparing http://
const callLines = CODE.split(/\r?\n/)
  .filter(l => /noteSpot\(\)/.test(l) && !/function noteSpot/.test(l));
ok('both ways of adding a note call it', callLines.length === 2,
  callLines.length + ' calls: ' + callLines.map(l => l.trim()).join(' | '));

/* And neither of them sets x or y itself afterwards, which would put the
   decision back in two places by the back door. */
const addBlocks = SRC.split(/function (?:saveNote|approveSuggestion)\s*\(/).slice(1);
const ownXY = addBlocks.filter(b => /\n\s*x:\s/.test(b.slice(0, 1200)));
ok('and neither sets x or y of its own', ownXY.length === 0,
  ownXY.length + ' of the add paths still set x themselves');

/* ---- 2. the numbers did not move -------------------------------- */

/* Pull the body of noteSpot out of the page and run it, against the
   formula that was inline in saveNote() before this was extracted. If
   the extraction shifted anything, these disagree. */
/* BOTH functions are lifted out and run together: noteSpot() calls
   noteSpotAt(), so evaluating one without the other only proves that an
   undefined function throws. */
const spotFn = /function noteSpot\s*\(\s*\)\s*\{([\s\S]*?)\n\}/.exec(SRC);
const body = atFn;
ok('noteSpot() and noteSpotAt() can both be read out of the page',
  !!body && !!spotFn, 'could not find ' + (!body ? 'noteSpotAt' : 'noteSpot'));

if (body && spotFn) {
  /* They close over state and maxZ, so those are supplied. The count of
     notes on the page is what drives the position, so it is varied. */
  const run = (state) => {
    const maxZ = () => 10;
    // eslint-disable-next-line no-new-func
    const fn = new Function('state', 'maxZ',
      'function noteSpotAt(i) {' + body[1] + '\n}'
      + 'function noteSpot() {' + spotFn[1] + '\n}'
      + 'return noteSpot();');
    return fn(state, maxZ);
  };
  const make = (count) => run({
    currentPage: 'p1',
    notes: Array.from({ length: count }, () => ({ pageId: 'p1', archived: false })),
  });

  /* THE ORIGINAL, retyped from the version before the extraction, which
     is the only way this can disagree. Copying it out of noteSpot would
     make this prove that a thing equals itself. */
  const was = (i) => ({
    x: 60 + (i % 5) * 310 + (i * 37 % 40) - 20,
    y: 60 + Math.floor(i / 5) * 340 + (i * 53 % 40) - 20,
    rot: (i * 17 % 7) - 3.5,
    zIndex: 11,
  });

  const wrong = [];
  for (let i = 0; i <= 12; i++) {
    const got = make(i), want = was(i);
    if (got.x !== want.x || got.y !== want.y || got.rot !== want.rot
        || got.zIndex !== want.zIndex) {
      wrong.push(i + ': got ' + JSON.stringify(got) + ' wanted ' + JSON.stringify(want));
    }
  }
  ok('a note lands exactly where it did before the move',
    wrong.length === 0, wrong.join(' | '));

  /* And it does not stack everything in one corner, which is what a
     broken extraction would look like if the count never reached it. */
  const first = make(0), sixth = make(5);
  ok('the sixth note starts a new row rather than sitting on the first',
    sixth.y > first.y && sixth.x < first.x + 310,
    JSON.stringify({ first, sixth }));

  /* ARCHIVED NOTES AND OTHER PAGES DO NOT COUNT. This is the half the
     approve path had wrong, so it is asserted rather than assumed. */
  const mixed = run({
    currentPage: 'p1',
    notes: [
      { pageId: 'p1', archived: false },
      { pageId: 'p1', archived: true },
      { pageId: 'p2', archived: false },
    ],
  });
  ok('an archived note and another page\u2019s note do not take up a space',
    mixed.x === was(1).x && mixed.y === was(1).y,
    JSON.stringify({ got: mixed, wantedAsIfOne: was(1) }));
}

console.log('\n' + R.filter(Boolean).length + '/' + R.length + ' passed');
process.exit(R.some(v => !v) ? 1 : 0);
