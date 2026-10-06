# EGBC Team Hub — design guide (v108)

Every v2 page should look like one product. Reference pages: `hub.html` (home, cards, menu, modals) and `meeting.html` (lists, forms). When in doubt, copy what they do.

## Load these
```html
<script src="egbc-shell.js?v=…" data-title="Page name"></script>   <!-- bar + menu; also loads egbc-ui.js -->
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
```
- `egbc-ui.js` — Inter + Lucide icons. Write `<i data-lucide="calendar-days" style="width:18px;height:18px"></i>`; it is drawn automatically, even when added later with `innerHTML`. `EGBCUI.pageIcon(page)` gives a registry page its icon.
- `egbc-editor.js` — rich-text editor for anything people write that needs formatting (notices, descriptions). **Never ask anyone to type HTML.**

## Colour
| Token | Value | Use |
|---|---|---|
| brand | `#3d6263` | primary buttons, icons, links, focus ring |
| brand-dark | `#2a4a4b` | primary hover |
| tint | `#eef5f4` | icon badges, selected rows |
| ink | `#111827` | headings, names |
| body | `#374151` | text |
| muted | `#6b7280` | secondary text |
| faint | `#9ca3af` | placeholders, counts |
| line | `#e5e7eb` | card borders, dividers |
| line-2 | `#d1d5db` | input and button borders |
| canvas | `#f6f7f7` | page background |
| ok | `#15803d` on `#ecfdf3` | "Today", success |
| gold | `#b07d2e` on `#fdf8ee` | pinned / must-read only |

Team colours (from `EGBCAuth.TEAMS`) appear only as an **8px dot** beside the team name — never as fills or thick borders.

## Type
Inter throughout. Page title 22–28px/700. Card title 15px/600. Body 14px/400, line-height 1.5. Secondary 12–13px. **Sentence case everywhere** — no all-capitals labels, no wide letter-spacing, no weight 800/900.

## Shapes
- Cards: white, 1px `line` border, radius 14px, shadow `0 1px 2px rgba(16,24,40,.05)`. Card header: 32px tinted icon badge + title + actions on the right, divider below.
- Buttons: height 36px (32px small), radius 8px, 13px/500. Primary = brand fill. Secondary = white with `line-2` border. Ghost = no border, muted text. Icon + label, icon 15–16px.
- Inputs: height 40px, radius 8px, `line-2` border, focus = brand border + `0 0 0 3px rgba(61,98,99,.15)`. A visible label above every field.
- Lists: rows with a 34–36px icon box, name (14px/500–600) and one muted line. Hover `#f3f4f6`.
- Modals: radius 14px, title 17px/600, close is an `x` icon button, Cancel then primary on the right.

## Icons
Lucide only, line style, stroke 1.75. **No emoji in the interface.** Common: `calendar-days`, `calendar-range`, `video`, `users`, `mail`, `megaphone`, `book-open`, `folder-open`, `upload`, `settings`, `pencil`, `trash-2`, `plus`, `search`, `x`, `chevron-right`, `check`, `link`, `circle-help`.

## Don't
Pill-shaped (99px) buttons or inputs · uppercase labels · emoji icons · Montserrat · thick coloured left borders · text on busy photos without a dark overlay · raw HTML in a textarea.
