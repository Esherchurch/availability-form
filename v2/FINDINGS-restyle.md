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
