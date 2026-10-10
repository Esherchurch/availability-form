# Restyle — found and not fixed

Numbered so they can be scheduled. Nothing here blocks anything.

## R-020 — WITHDRAWN: the last 40 were done too

This said 40 emoji were left in JavaScript-built markup and should be
scheduled. They are done.

- **The pin board’s reaction buttons** (32): `REACTIONS` keeps its `emoji`
  field, because the plain-text report people paste into an email still uses
  it and a text file is not the interface, and gains an `icon` field that the
  button shows. Same four reactions, same order, same labels, same keys in
  the database.
- **The Email Compiler’s six**: swapped with the rest.
- **Play-Through’s two** were **B♭** — a musical flat. That is notation a
  musician reads, not a picture standing in for an icon, so the emoji rule now
  excludes U+2669 to U+266F and the key buttons are left alone.

**0 across every screen.**

## R-021 — the style check now measures emoji, and did not before

DESIGN.md says "no emoji in the interface" and `check-style-every-screen.mjs`
did not test it. 152 emoji were sitting in controls and headings across eight
pages, on top of the 882 weight, case, size and pill faults — and one of them
was on `CoreTeamApp.html`, a **Group 1** page that had been reported clean.

The rule flags an emoji only inside a control, a heading, a table header or an
option — the chrome. An emoji in a notice somebody wrote, or in a song note,
is their content and stays, which is what RESTYLE-BRIEF asks for. Judging it
by the element rather than by the character is what keeps those apart without
a list of exceptions.

Decorative emoji in plain `<div>`s — the pin board's cross in its header, an
empty-state picture, a panel title — are **not** flagged. Widening the rule to
every `<div>` would catch user content and make the gate unreliable, so they
are deliberately out of scope. There are about a dozen.

## R-022 — the three AV pages' two-tab switch had an invisible half

On How-To AV, AV Troubleshoot, Worship Training and Play-Through, the pair at
the top (e.g. "Troubleshoot | How To") fills in the page you are on and left
the other as plain text — no border, no fill, no icon. It read as a label, not
as something to press, on both the original and v2.

Fixed in Step H: the unselected half now has a `line-2` border, which is
DESIGN.md's secondary button. The filled half still says which page you are
on. This also retired the one entry in the icon check's `JUDGED` list, which
had excused exactly this pattern on Play-Through.

## R-023 — Step M: youth and kids, three pages, 242 problems to nil

Group 3 is three pages, not the brief's four: NEXT-BRIEF §4 takes the Worship
Hub out of scope and says so in those words, overriding the Group 3 list.

| Page | Before | After |
|---|---|---|
| `youthapp2.html` | 188 across 11 screens, 28 emoji in the source | 0 |
| `youthserviceplanner.html` | 29 across 3 screens, 11 emoji in the source | 0 |
| `youth-access.html` | 25 across 4 screens, 1 emoji in the source | 0 |

**None of the three was on the style check's list**, so the number above had
never been taken. That is the same shape as the Group 2 note further up this
file and as A-023: a page nothing opens scores nothing, and nothing scores
reads exactly like nothing wrong. They were added to `tests/group1-screens.mjs`
with their screens read off the page - eleven on the youth app, including the
tour, which is the first thing a young person sees and which the set-up
dismisses before anything measures it.

### What changed, and what deliberately did not

Inter for Montserrat; every weight of 700 and above down to 600; the small
wide-spaced capitals to sentence case; nothing below 12px; the pill radius on
**controls** to 8px; and every emoji in the interface to its Lucide line
icon. Structure, order, labels and copy are untouched.

**The pill rule applies to controls, not to chips.** `.filter-pill`,
`.page-pill`, `.planner-btn`, `.kb-quick-tag`, `.reaction-btn` and
`.tour-next` are buttons and came down to 8px. `.serve-count-badge`,
`.kb-card-type`, `.song-meta-badge` and the key badges are `<span>`s - chips,
which DESIGN.md allows and the check does not flag.

**The emoji were doing work, so they were replaced rather than removed.** Six
home tiles without their pictures are a wall of text. Each one became the
line icon that means the same thing, in the same place at the same size:
`clipboard-list`, `pin`, `guitar`, `music`, `library`, `megaphone`. Two
places cannot hold an icon at all - an `<option>`, which the operating system
draws, and an `alert()` or toast string - and there the character went and
the words carry it alone.

### The email templates were held back, and that was a second thought

The first pass restyled the Youth Service Plan email along with the page: its
Arial, its 10px capital column headings, its weights. **An email is not a
screen.** The style check never measures one, mail clients want the styling
inline and absolute, and small capitals in a table heading are a fair choice
there. It is also a visible change to something that goes out to the whole
team, asked for by nobody. The transform now holds back every line carrying
`Arial`, which is the marker those templates share and nothing in the
interface uses - 21 lines on the planner, 1 on the youth app.

### Open, not fixed: R-024, the youth green

`youth-access.html` is green (`#5f7a4a`) where the suite is `#3d6263`, and
DESIGN.md says every v2 page should look like one product. The green reads as
deliberate - it is the youth identity, and the youth app carries a teal of
its own - so **it has been left exactly as it was**, because changing the
colour of a thing young people recognise is Martin's call and not a style
rule. The style check does not measure colour either way.

### Proof

`check-youth-access.mjs` **34/34** after the restyle: a code redeemed end to
end, the youth app opened on it, a youth service chosen, saving refused with
a reason, a used code refused, three refusals straight at the function, and
no parent's address anywhere. That check is the one that matters here, because
a restyle that leaves a page looking right and working wrongly is the failure
to fear - and it exercises two of the three pages all the way through.
