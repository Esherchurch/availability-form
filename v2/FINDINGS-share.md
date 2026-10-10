# Share to WhatsApp — findings

`SHARE-NOTIFY-BRIEF.md` Part 1. One helper, `v2/egbc-share.js`; the notice
card, the pinned notice, the read view, meetings and the events window all
use it, and there is deliberately no second one.

---

## S-001 — built: the formatter, the preview, and the three ways out

**The formatter** turns the notice editor's HTML into WhatsApp's own markup:
headings and `<b>` to `*bold*`, `<i>` to `_italic_`, `<s>` to `~strike~`,
lists to `- ` and `1. ` lines, `<blockquote>` to `> `, and **a link on a
line of its own**, which is what makes WhatsApp draw its preview card.
`[words](url)` is markdown, and WhatsApp shows it exactly like that, as
punctuation.

**It walks the DOM, not a regular expression.** The editor's output is real
HTML - nested lists, attributes, entities - and a pattern that strips tags
turns `&amp;` into an ampersand it can no longer tell from one the person
typed, and loses the structure the formatting depends on.

**Three small things that are easy to get wrong, and are tested:**
- `* bold *` does not render in WhatsApp. An editor leaves the spaces inside
  the tag all the time, so the helper moves them outside the stars.
- A long notice is cut **at a line break**, not mid-word, with "Read more:"
  and the link. A message cut mid-sentence reads as a fault; one cut at a
  paragraph reads as a summary, which is what it is.
- A `javascript:` link is dropped rather than passed on.

**The preview is not optional.** It shows exactly what will be sent, as
editable plain text, with Share and Copy. This goes to a WhatsApp group of
real people, and the last chance to change it belongs before the share sheet
rather than after it.

**Proof:** `tests/check-share-format.mjs`, **23/23**, on the notice the brief
describes - a heading, bold, a list and a link. The break the brief names -
list handling dropped - fails exactly two assertions: *"A LIST BECOMES '- '
LINES"* and *"a numbered list counts"*.

That test also caught itself first. It pasted `egbc-share.js` into a
`<script>` block, and the file's own usage comment contains the characters
`</script>` - which ended the block on line 11, so nothing after it ran and
`EGBCShare` was never defined. **It reported 6 of 22 passing** against the
words "ReferenceError: EGBCShare is not defined", because half the
assertions are "this is not in the output" and an error message satisfies
them all. It serves the file properly now, and stops with one clear failure
if the formatter throws.

---

## S-002 — NOT ESTABLISHED: no real device has been tried

The brief asks for Android, iPhone, a Windows PC with WhatsApp Desktop from
the Microsoft Store, and WhatsApp Web - for text alone and text with a
picture - and says **"Do not claim a case works without trying it."**

**None of that has been done.** This window has a headless Chrome on a
Windows machine and no WhatsApp installed, so it cannot. What is tested is
the formatter, which is the part that is testable here.

What is written but **unproven on a device**:

| Way in | Used when | Unproven |
|---|---|---|
| `navigator.share` | a phone, or any browser with the Web Share API | whether the share sheet offers WhatsApp, and whether it takes a picture |
| `wa.me/?text=` | a computer | whether WhatsApp Desktop opens rather than WhatsApp Web |
| Copy | always | the least likely to surprise, and still untried on a device |

**In particular**, the brief asks whether the Windows share sheet offers
WhatsApp Desktop **with a picture**. That question is open.

**For Martin:** this needs ten minutes on a phone and ten on the PC. Until
then the button is written and not witnessed.

---

## S-003 — the link preview card will be the generic one, and that is expected

WhatsApp builds its card by fetching the link **without signing in**. Hub
pages need a sign-in, so every shared link will show whatever the generic
EGBC card says, not the notice's own title and picture.

The brief's answer is to make that generic card good: `og:title`,
`og:description`, `og:image` (the EGBC logo) and `og:site_name` on the v2
entry pages. **That is not done yet** and is the next piece of this part.

Per-item public share pages, made by a server function so each notice gets
its own picture in the card, are explicitly **later** and not this build.
