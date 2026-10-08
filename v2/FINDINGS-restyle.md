# Restyle — found and not fixed

Numbered so they can be scheduled. Nothing here blocks anything.

## R-020 — 40 emoji are built in JavaScript, not written in the markup

Step H replaced every emoji that sits in a control or a heading **in the
markup** — 112 of them — with the Lucide icon that means the same thing.
Forty are left, and they are left because they are not in the markup:

| Where | How many | What they are |
|---|---|---|
| `stickynotes.html` | 32 | `REACTIONS` and `CAT_META`, two JavaScript tables with an `emoji:` field, rendered into the reaction buttons (❤ 👍 👎 🙌) and the category chips (🎵 📅 🎬 🙏 💡 📎) |
| `EmailBuilder2.html` | 6 | labels built into `innerHTML` strings |
| `EGBC-PlayThrough.html` | 2 | **B♭** — a musical flat. Notation, not an icon, and it should stay |

**Why they were not swept up with the rest.** Changing them means editing a
data table and every place that renders it, not a label. On the pin board the
category mark also appears on notes people have already written, so it is
arguably their content rather than the interface — and RESTYLE-BRIEF is
explicit that user content keeps its emoji. That is a decision worth making
deliberately rather than at the end of a long pass.

**It is measured.** The style check now has an emoji rule (see R-021), so the
number cannot drift upward without something saying so, and it will go to zero
the day somebody converts those two tables.

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
