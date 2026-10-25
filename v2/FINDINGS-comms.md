# FINDINGS-comms: the e-news, Val's card maker and Canva (comms window)

Started 19 Oct 2026 from Martin's brief. **This is the plan only. Nothing is built yet and no app page has changed.**
Feature names: `enews`, `cardMaker`, `canva`. All three stay **off** until Martin turns them on.

---

## PLAN, 20 Oct late: the e-news, approved 20 Oct (Martin): build in order E

One plan from the reviewing window's messages of 20 Oct: the editor (A), the email (B), the draft (C), proof (D), order (E), one-off emails (F), templates (G), Facebook and Instagram (H). Two parts are already built: **Add a meeting** (C-35) and **no emails to under-18s** (C-36). Everything below waits for your yes. Nothing in sections A to D is built yet.

**It works the same way as Mailchimp's new email builder, but never looks like it** (Martin, 20 Oct).
- **The same steps,** so Val's habits carry over.
- **The hub's own look:**
  - Lucide icons, as the rest of the hub;
  - Church HQ's colours, font (Inter) and styling;
  - our own words wherever theirs are distinctive.
- **No Mailchimp names, logos, colours or screenshots** anywhere in the product or the repo. The comparison pictures stay in OneDrive only.

**Mock-ups in the hub's own look** (the email in them is drawn by the real e-news code; the content is made up), in `design-mocks/comms/editor/`:

| Step | Ours |
|---|---|
| Adding blocks | [editor-1-add.png](design-mocks/comms/editor/editor-1-add.png) |
| A block selected | [editor-2-block-selected.png](design-mocks/comms/editor/editor-2-block-selected.png) |
| A word selected | [editor-3-word-selected.png](design-mocks/comms/editor/editor-3-word-selected.png) (the church's colours open too) |
| The whole email's look | [editor-4-look.png](design-mocks/comms/editor/editor-4-look.png) |
| Phone | [editor-5-phone-375.png](design-mocks/comms/editor/editor-5-phone-375.png) |

**Same step, different look:** Martin's Mailchimp screenshots above ours, in `OneDrive\Documents\New hub\mocks\mailchimp-editor\compare\compare-1.png` to `compare-5.png`, on this PC only.

### A. The editor: the same steps, the hub's look

- **Top bar:**
  - ‹ E-news, then the issue's name;
  - **Saved** (it saves as you go);
  - **Send me a test**;
  - **Done**, whose arrow gives Schedule. Send stays shut until go-live.
- **Under the top bar:**
  - the **computer/phone switch**;
  - **undo/redo** and **Preview**.
- **Left rail: Add, Look, Check.** Check lists links that don't work, missing pictures, events missing a write-up, and "Pick the meeting".
- **Add** is a grid of blocks you **drag onto the email**:
  - Picture, Heading, Words, Button, Line, Space, Video, Social links, Logo, Footer;
  - **From the hub:** Event, Bible verse, This Sunday, Meeting, Dates for the diary, Notices;
  - **Layouts:** 1, 2 or 3 columns; "Picture and words" (Val's event card), "Words and picture", "Two pictures".
  - No shop blocks, and no raw-HTML block.
- **The email in the middle.** Click a block and you get:
  - an outline in the hub's teal;
  - a **"⋮⋮ Words"** handle to drag it;
  - **Move / Copy / Delete** beside it;
  - **typing on the email itself**.
- **Editing words: the toolbar runs across the top.**
  - **Tools:** style of words, font, size, colour, highlight, **B I U S**, link, picture, emoji, align, list, line height, letter spacing.
  - **Selecting a word** offers **Make it a link**.
  - **Colour** is the church's palette only, kept as an inline style when sending.
- **The left panel becomes the block's settings,** with **‹ Back to blocks**.
  - **Style** tab: background, border, corners, space around, and "Same on phone and computer".
  - **Reset** and **Use on all words**.
  - **Who sees it** tab: computer/phone, and **church members only**. Meetings start ticked; the CMM can't be unticked.
- **Look** is the whole email's design:
  - page and background, words, links, buttons, lines, pictures, logo;
  - **The church:** footer details, social links, section bar.
  - Today's "Look and footer" moves here.
- **Every card's words are full rich text** (paragraphs, bold, links, emoji, lists).
- **Reordering:** drag. Keyboard and phone keep up and down arrows.
- **Phone (375):** one column.
  - The email is full width, and the toolbar sits above the keyboard.
  - A dock at the bottom has **Add, Look, This block, Check**.

### B. The email itself (egbc-mailblocks.js)

1. **Card titles teal and bold,** as Val's: the card's first bold line is teal (#008080), and so is the block's title.
2. **Card spacing to Val's measurements:**
   - the picture inset with a white margin and rounded corners;
   - the words further in (about 38px each side on a phone);
   - measured from her page at 375 and 600, and **checked by computed style, not by eye**.
3. **Line height and paragraph spacing exactly Val's,** measured and checked the same way.
4. **Text colour:**
   - a colour button in the editor, with the church's palette (the look's teal, orange, green and dark, plus a few);
   - sent as an inline style on a span, and only palette colours are kept, so nothing breaks in Outlook or dark mode;
   - bold, italic, underline, links and lists work as now;
   - the test: colour a word teal, and it is teal in the sent copy and the web version.
5. **Footer, as Val's:**
   - **Social icons** from a church setting: Facebook, YouTube, website and Instagram, and any church can add others. Small white icons on the dark footer, as PNG pictures (not fonts or SVG) so Outlook shows them.
   - **"Dates for the diary for the coming weeks"** opens the church's public What's On page. No PDF to upload each week, unlike Val's Dates.275.pdf.
   - An optional **Dates for the diary** block lists the coming weeks' public events (date and title) from What's On, by itself.
   - Both are in the EGBC template by default, in Val's style.

### C. The weekly draft

6. **Each event card uses its What's On picture, full write-up and links.** The live draft looked poor because ChurchSuite's events have none, so the cards were bare titles.
7. **An event with no picture or write-up becomes a tidy, finished card:** date, title and a **More details** link to its page. It never looks like a gap.
8. **"Events missing a picture or write-up"**: a list at the top of the draft, so the office can add them in What's On before sending.

### D. Proof

9. **The side-by-side check, kept for good** (`tests/check-enews-side-by-side.mjs`):
   - Val's real 15 Oct issue drawn by our code, measured against her page at 375 and 600 by computed style. The measures are font sizes, line heights, paragraph spacing, card insets and corners, title colours, the footer button and the social icons.
   - **Her page's measurements are kept in the repo as numbers** (`tests/fixtures/val-15oct26-measure.json`). Her page itself and the pictures of both are not.
   - The pictures go to `OneDrive\Documents\New hub\mocks\val-side-by-side\` when her saved page is on the PC. No Mailchimp page or screenshot is in the repo.
10. **The ease test:**
    - Someone who knows Mailchimp makes this week's issue without help, and we record the time and every place they hesitate.
    - **Ready when a normal week's e-news takes under 30 minutes,** by someone who knows Mailchimp, without help (Martin, 20 Oct).

### E. Order of work (approved by Martin, 20 Oct)

1. **B and C first** (the email and the draft: smaller, and they show at once in what people receive), with the side-by-side check (D9) growing as each lands.
2. **Then A, the editor** (the large piece), built behind the e-news switch on the existing page, so nothing changes for anyone until it's ready.
3. **Then the ease test (D10),** before the editor replaces today's.
4. **Social posts, step 1 (H)**: small, it reuses the card maker, and can go alongside B and C.
5. **Then templates (G) and one-off emails (F).**
6. **Social posts, step 2 (H)**, only if Martin decides to set up Meta.

### F. One-off emails and templates

The main window's plan for these is in [design-mocks/mailings/PLAN.md](design-mocks/mailings/PLAN.md). It gives this window templates (section 2) and one-off emails (section 3), after the e-news work. The **Church members' meeting** starter here (C-35) becomes that plan's "Church members' meeting" template, filling in from the main window's members' meeting page once it exists. The plan's "never under-18s" uses the under-18 rule built here (C-36: Under 16 or Under 18).

### G. Starter templates for any church (the reviewing window went through all 382 of Mailchimp's)

Generic wording that any church can edit. Each one follows a Mailchimp template, named in brackets, so its layout is one people already know. These replace the six starters in the mailings plan (design-mocks/mailings/PLAN.md, section 2); everything else in that plan stands: templates keep blocks, look, audience, subject pattern and "must fill before Send".

| Starter | Follows Mailchimp's | Notes |
|---|---|---|
| Weekly news | (Val's layout) | EGBC's is Val's exactly |
| Monthly news | Monthly newsletter | |
| Letter from the minister | Simple Text | |
| Story / ministry update | Tell a story | |
| Meet our team | Meet the team | |
| Event invitation, with RSVP | Event invitation | the What's On event's Sign up button |
| What's on this month | Event calendar | fills itself from What's On |
| Holiday club / weekend away | Multi-day event | |
| Carol service / concert | Performance invite | |
| Guest speaker | Event speakers | |
| Church members' meeting | Event Agenda | agenda and documents, plus the Meeting block; members only |
| After the event | Thanks for attending | |
| Service change | Short service update | |
| Sermon video | Video service update | |
| Gift day / appeal | Fundraising Letter | |
| Thank you | Thanks for your support | |
| New subscriber welcome | (automatic, after sign-up) | sent by itself once someone confirms |
| Newcomer welcome | Friendly welcome | linked to "I'm new here" |
| Course welcome | Class welcome | |
| Reminder | (reminder) | |

**What Mailchimp hasn't got: the church year.** Advent & Christmas, Lent & Easter, Harvest, Remembrance Sunday, Mothering Sunday.

Mailchimp's shop templates (sales, products, baskets) are left out.

### H. Facebook and Instagram posts, in two steps

Martin thinks Val may use Mailchimp's social posts. In Mailchimp (his screenshots 6 and 7) the steps are Network → Design → Customize → Schedule & Confirm. Ours follow the same steps.

**The two kinds of post the church makes** (the reviewing window looked at @esherchurch). Both use the same two steps: now, copy, share or download; later, post and schedule directly once Meta approves.

**1. Event countdowns** (for example Kids Film Club): the same card, posted each day in the run-up ("3 days to go", "2 days", "TOMORROW!", sometimes on the day).
- **"Countdown" from a What's On event:**
  - pick the days;
  - the hub writes each day's caption, and every part can be edited:
    - a different opening line each day;
    - then the fixed details block, taken from the event:

      📅 Saturday 10th October
      🕝 2:30pm
      📍 Esher Green Baptist Church
      🎟 Book your FREE places here:
      👉 the event's booking link

    - then the event's saved hashtags.
- **The picture:** the card maker's, portrait 4:5 (1080 × 1350), as the church posts. It can be a still or a short animated version.
- **Each day the hub reminds the office** with that day's post ready: Copy caption, then Share or Download. After step 2 it can post by itself instead.
- **Hashtag sets** are saved per event or series (e.g. #KidsFilmClub #FreeFamilyFun #SaturdayFun), plus the church's usual ones (#Esher #WhatsOnElmbridge #EsherMums #FamilyDayOut #esherchurch). They are added to every caption and can be edited.

**2. Verse of the day:** posted daily, with the caption just "Verse of the day". Martin thinks the pictures come from a daily devotional service (for example UCB's Word for Today), so they are someone else's designs.
- **A daily "Verse of the day" slot:**
  - bring in the day's picture: upload it, or take it from Canva;
  - a **credit line**, shown in the caption when filled in. The church sets its usual credit once (e.g. the service's name);
  - the caption is remembered from day to day;
  - **a daily reminder** with the ready post: Copy caption, then Share or Download. After step 2, it is scheduled instead.
- **For a church without a service:** make one from the same Bible picker as the e-news, with a few typographic designs in the card maker, in the church's fonts and colours. Sizes 1080 × 1350 and Story 1080 × 1920. The version's copyright line goes on it, small, where the version needs it.
- **No service's designs are copied.** The hub's own designs are its own.

**YouVersion's Verse of the Day: checked 20 Oct, before building anything.** Martin thinks the church's daily images are YouVersion's.
- **The hub can't fetch them automatically.**
  - **YouVersion's developer platform** (developers.youversion.com) is free, with an app key. Its Verse of the Day calls give only **the day and a reference** (e.g. `JHN.3.16`). There is **no picture**, and no picture call anywhere in it.
  - **It is for non-commercial apps only:** "no advertisements/paywalls/subscriptions", or the app is removed. Church HQ is a paid subscription, so it doesn't qualify unless YouVersion agrees in writing.
  - **The Bible App's own terms** (bible.com/terms) forbid any "robot, spider, or other automatic device … to access YouVersion … including … copying any of the material". Content is Life.Church's (and its licensors'), for personal, non-commercial or a non-profit church's internal use. The YouVersion name and logo need Life.Church's written permission.
  - **So the hub must not copy YouVersion's verse images, by any route.**
- **What is fine:** the person who posts each day uses the Bible App's own Share button on their phone, as they do now. Or they save the image and bring it into the manual slot, with a credit line such as "Verse image: YouVersion Bible App".
  - YouVersion's terms don't spell out the credit, so it is the church's to set once.
  - The translation's own rules still apply (e.g. the NIV's).
- **So the manual slot stays** (the picture brought in, a credit line, a daily reminder), and the automatic one below is the hub's own.
- **Plus the hub's own, for any church:** a year of verse references chosen by the hub (a list of references copies nobody), the text from a free Bible (BSB) or the church's API.Bible versions, in the hub's own designs. That one can fill itself each morning.
- **If Martin wants YouVersion's verse itself:** write to YouVersion's platform team (platform.youversion.com/support) and ask whether a church-management subscription may use the platform. Nothing is built for that.

**Verse of the day, automatic and our own** (Martin, 20 Oct; YouVersion is out). Ready each morning with its caption. The manual slot is still there.
- **The text:**
  - **BSB**: public domain since 30 April 2023 (berean.bible/terms.htm), so any use, no licence;
  - **KJV**;
  - or the NIV and others through the church's API.Bible key, with that version's copyright line.
- **The verse:** from a curated list of 365, or from the current sermon series.
- **The picture:**
  - from the church's picture library; or
  - from **Unsplash** through its API, following its guidelines (help.unsplash.com/api-guidelines):
    - the credit "Photo by <name> on Unsplash", with Unsplash's tracking links;
    - the picture shown from the address Unsplash returns (hotlinked, never copied to our storage);
    - Unsplash's `download_location` called when a picture is used.
  - Unsplash needs Church HQ's own Unsplash app key, kept on the server like the others.
- **Designs:** several typographic styles in the card maker, in the church's colours, at 1080 × 1350 and Story 1080 × 1920.

**Step 1, now (does not wait for Meta): "Make a social post"** from an event or an e-news item.
- **The picture** comes from the card maker, in each size:

  | For | Size |
  |---|---|
  | Instagram square | 1080 × 1080 |
  | Instagram portrait | 1080 × 1350 |
  | Facebook | 1200 × 630 |
  | Story | 1080 × 1920 |

  The words are fitted to each size, as the card maker already does.
- **A caption** is written from the event (what, when, where, the link), and can be edited.
- **Copy caption**, then **Share** (the phone's own share sheet, straight into Facebook or Instagram) or **Download** (all the sizes).
- Nothing connects to Meta. The person posts from their own phone or computer, as they do now.

**Step 2, later: post and schedule straight to the church's own Facebook Page and Instagram.** You'd connect once, like Canva. This needs Church HQ's own Meta app to pass Meta's app review.

What Martin would have to set up, so he can decide. Meta changes these rules; I'll check each one against Meta's documents again before we start.
1. **A Meta Business account (Business Portfolio) for Church HQ**, with **business verification**: the company's legal name, address and phone, a document that shows them, and a website on Church HQ's domain.
2. **A Meta developer account** (Martin's own Facebook login, with two-step sign-in), and in it **an app of the Business type** for Church HQ.
3. **On the app:** Facebook Login for Business, and the Instagram API (with Facebook Login).
4. **Permissions that need Meta's app review** (Advanced Access):
   - `pages_show_list`
   - `pages_read_engagement`
   - `pages_manage_posts`
   - `instagram_basic`
   - `instagram_content_publish`
   - possibly `business_management`
5. **For the review itself**, Martin submits:
   - a privacy policy page;
   - terms of service;
   - a data-deletion page or callback;
   - an app icon;
   - for each permission, a short screen recording of the hub using it, with written steps a reviewer can follow, and a test login.

   Reviews usually take days to a few weeks, and can come back asking for changes.
6. **Each church, once:**
   - a Facebook **Page**;
   - an Instagram **professional** account (Business or Creator) linked to that Page;
   - the person connecting must be an admin of the Page.
7. **What the hub then does:**
   - keeps the Page's token on the server only (like Canva's);
   - posts the picture and caption;
   - for scheduled posts, Facebook schedules them itself, but Instagram's API has no scheduling, so the hub holds the post and publishes it at the time.

   Instagram also has a daily limit on posts made this way.
8. **Every year,** Meta's "data use checkup" for the app.

**Martin, 20 Oct: step 1 only. Step 2 (Meta) not now.**

---

## ANY CHURCH, 23 Oct: the comms area against the synthetic parish test. For review

The reviewing window, for Martin: the going-live test is a made-up Church of England parish ("St Aidan's with St Hild, Testbury (synthetic)"), set up through the screens only. It fails on:
- any EGBC name, word, logo, address or Baptist habit;
- anything the parish can't set up for itself;
- a limit that cuts off its data;
- either church seeing the other's.

From today, nothing EGBC-specific goes into this window's code. I went through every comms page and function for this.

### Fixed now (this commit)

| What the parish would have seen | Now |
|---|---|
| The e-news Look panel: "Short name for the top line (e.g. EGBC)" (twice: enews.html and the editor) | "(the church's initials, say)" |
| The Weekly news starter: "EGBC's is Val's layout." | Gone |
| The editor's hint: "Make the first line bold for a title, as Val does." | "…for a title." |
| The e-news design: "Classic (as the e-news looks today)" | "Classic" |
| The card maker's hashtags box: "#esherchurch" | "#yourchurch" |
| **The Email Compiler's emails carried EGBC's logo**, typed into the page, with "EGBC" as its words | The church's own logo from Church settings, with the church's name; with none set, no logo |
| "…opens at switch-over" (the subscriber list, Canva, twice) | "…when the church goes live" |

**For EGBC:** the Compiler now takes EGBC's logo from Church settings > Church details, like the home page does. If that's empty, the Compiler's emails go out without a logo until it's added there.

**A guard, `tests/check-comms-any-church.mjs`** (no emulator). It goes through every comms page and function with the comments taken out, and fails on EGBC, Esher, Val, EGBC's logo file, "switch-over" or "Baptist". Two things are allowed for now, each listed below with the step that removes it: the hub's own address and "Church office". Breaks: the word put back, the logo put back.

### Still to fix: what would fail the test, and the step that fixes it

1. **Each church's data (fail: "either church can see the other's").**
   - The comms functions still read EGBC's top-level data: enews*, hqMailEvents, hqMailKey*, socialMorning, canva* and unsplash*.
   - **Step:** H-5 batch 8, using main's `church-scope.js` and its mc-alpha/mc-beta harness. Main asked whether to do it or ask this window. I'm ready to do it, as one test at a time like the other batches.
   - The comms pages read top-level data too. **Step:** main's page step (each page on `churches/{cid}`).
2. **The hub's address is EGBC's** (`esherchurch.github.io`), in every e-news link (web version, unsubscribe, sign-up), the social icons' pictures and the functions' allowed sites.
   - The files: egbc-mailblocks.js, functions/enews.js, enews-send.js, enews-preview.js, social.js and canva.js.
   - **Step:** Church HQ's own address, when Martin chooses it. It becomes one setting in one file, and the guard then refuses the old one.
3. **"Church office"** in 9 comms files (H-9's table). **Step:** H-9 stage 2, once main has built the jobs mapping: `onJob('office')`, and the words from `jobLabel('office')`.
4. **The weekly draft takes one Sunday service** (`data.sunday`) and leaves out every rota service.
   - The parish's 8am, 10am Parish Eucharist, Evensong and its midweek services would not be in its e-news. The chapel's monthly service would not be either.
   - **Step C-51 (this window):** a Sunday block for each service on the rota, across every building, with its place. Midweek services go into "Coming up". The office can untick any of them.
5. **Limits that cut off data.**
   - **The subscriber list shows the first 1,000** (enews.html). It must show every subscriber, a page at a time.
   - **The Email Compiler holds 10 drafts at most.** That becomes a setting, or goes.
   - **Cut short without saying so:**
     - the weekly draft's diary: 30 events in a fortnight, and a parish with a daily hall would pass that;
     - the issue list: 30;
     - the public web archive: 30;
     - the next meetings: 5;
     - the news picker: 30;
     - the picture library: 48;
     - the card maker's events: 200.
   - **Step C-52 (this window):** no cap on the diary or the subscribers; the rest say "Showing the latest N" and offer more, as H-9 asks.
6. **A Baptist habit: the members' meeting.**
   - What a parish would see:
     - the "Church members' meeting" starter;
     - the members-only room "CMM" (`MEMBERS_ONLY_ROOMS` in egbc-mailblocks.js);
     - the papers emails' "members' meeting".
   - A parish has the APCM and PCC meetings, and its word for members is the electoral roll.
   - **Step (with main):** the meeting's own name from Members' meetings (church-meeting.html); members-only rooms from each room's own setting, not a list in code; and the "Church member" word from main's access-level label, if main makes it a setting. **Question for main and the reviewing window:** is "Church member" staying the hub's word for every church, or a church setting?
7. **The hourly email cap (2,000).** Since batch 2, hubSend counts it per church (its database is the church's), but Church HQ's Resend limit is for the whole account. Two churches could pass it together, or the cap could hold one church back for another's.
   - **Step (with batch 8):** one counter for Church HQ, and a fair share for each church, set by Church HQ.
8. **Starter words.** "Letter from the minister": a parish says vicar or rector.
   - **Step C-53 (this window, small):** the title of the church's minister as a church setting (vicar, rector, minister, pastor), with "minister" as the default.

### How it would work for the synthetic parish today

- **The e-news, emails and posts already take from the parish's own settings:**
  - the name, logo, colours, address, charity number and footer;
  - the welcome emails' words;
  - the card maker's hashtags, Bible verses and pictures (Unsplash);
  - the sign-up, confirm and unsubscribe pages.
- **Under-18s:** they're never emailed. Junior Church children come from the parish's own address book (Under 16 / Under 18), not from team names.
- **Members-only words and blocks** work the same for any church.
- **It fails today on items 1 to 6.** The steps above are in this window's order: C-51 and C-52 first, then batch 8 and H-9 stage 2 when main is ready.

### Checks (one test at a time, more than 3 GB free, private TEMP, emulators stopped after each)

| Check | Result |
|---|---|
| check-comms-any-church (new) | 2/2. **Break word** ("e.g. EGBC" back) → red. **Break logo** (EGBC's logo back) → red. On its first run it found a second "(e.g. EGBC)", in the editor, now fixed |
| check-enews-meeting | 19/19. New: the Compiler's email has no logo and nothing of EGBC's when Church settings has none, and the church's own logo, named for the church, when it has one. **Break logo** → 2 red |
| check-enews-emails | 36/36 (the 25 starters) |
| check-cardmaker | 35/35. The first run stopped after 6 while memory was tight (2 GB free); alone, all green |
| Also | enews-page 61/61, enews-editor 50/50, enews-subscribe 58/58, canva 20/20, canva-page 9/9, enews-blocks 89/89 (27/27 breaks), check-stamps 11/11 |

**Not run:** tests/audit-everything.mjs. It needs the dev or events emulators, and this window uses its own.

**v2 only:** every changed path is under v2/. No original page was looked at for this.

---

## BUILT, 22 Oct: members-only words counted in Check and on the Send page (reviewing window, idea 3). For review

The sender now sees what everyone else won't get, for marked words as well as whole blocks.

- **The editor's Check panel**, below the members-only blocks line:
  "3 members-only bits of words, in: Sunday, Prayer on Zoom. Everyone else won't get them." "Go to it" picks the first of those blocks.
- **The Send page's summary**, a gold pill beside "1 members-only":
  "3 members-only bits of words, in: Sunday, Prayer on Zoom".
- **How they're counted** (`egbc-mailblocks.js membersWords`, one helper for both pages):
  - only blocks that go to everyone. A whole members-only block is counted as a block, as before;
  - a bit is a run of marked words, as `render()` draws the members' copy. An empty mark isn't counted;
  - a block's name is its title, or its first line (the card's "Prayer on Zoom"). The Sunday block is "Sunday".
- **Idea 2 skipped**, as asked: compiled emails go to team members only.
- **Also in this commit:** the out-of-date "for the main window" notes are cleared. The main window's part is done (sendOne, hubSend, PLAN-hub-send.md), and the events window's public-mail test parts are now a note to pass on.

### Checks (one test at a time, more than 3 GB free, private TEMP, emulators stopped after each)

| Check | Result |
|---|---|
| check-enews-blocks | 89/89; 27/27 breaks red. New: 3 bits, in Sunday and Prayer on Zoom; an empty mark and a whole members-only block not counted. **Break:** marks not counted → red |
| check-enews-editor | 50/50: Check says "3 members-only bits of words, in: Sunday, Prayer on Zoom", beside "1 block is for church members only". **Break wordcount** → red |
| check-enews-page | 61/61: the Send page's summary shows the count and the names, and fits 375px. **Break wordcount** → red |
| check-stamps | 6/6 |

---

## FIXED, 22 Oct: two card maker bugs from the live site, and the editor's joining-details warning. For review

**1. The Search Unsplash box was see-through.**
- **The cause:** the card maker uses `--card` for a shadow (`0 1px 2px …`), not a colour, so the box's `background: var(--card, #fff)` was invalid and came out transparent. The page and the card's canvas showed through behind the pictures.
- **The fix:** the box now has its own colours, never a page's variables: white, rounded corners, and above everything on the page wherever it's scrolled (`egbc-unsplash.js`, styles only).
- **Unchanged for Unsplash's production review:** the "Photo by … on Unsplash" credits and the download ping. Their checks and breaks are as before.

**2. The social post caption said "📍 [object Object]".**
- **The cause:** an event's place is an object (rooms on a site, an outside venue, or online).
- **The fix:** the caption now uses the hub's own `EGBCEvents.locationText`, with the room and site names, for example "Main hall, Synthetic Green site". The card maker now loads egbc-events.js and its room and site names.
- **With no place there's no 📍 line.** Before, it fell back to the church's name.

**3. The editor's joining-details warning** (reviewing window). Unticking "Church members only" on a block whose words still show Zoom joining details asks first, listing them. Cancel keeps it members-only.
- **The details are found as everyone else would get the block**, using egbc-mailblocks' own render (`exposedJoining`):
  - meeting IDs, passcodes and zoom.us links;
  - a link with joining words ("Click here to join"…);
  - any link from the card's joining lines, whatever its address: the list items holding the ID or passcode, and joining lines with the links next to them. Val's join link is a Mailchimp redirect.
- **The same rules as the test-issue script** (`fix-test-issue-members-words.mjs`, in this window's scratchpad), which refuses to save while any of them would be public, and prints what everyone would see.

### Checks (one test at a time, private TEMP, emulators stopped after each)

| Check | Result |
|---|---|
| check-cardmaker | 35/35: the place is the room and the site, in words; with no place, no 📍 line. **Break place** (the object written out) → red. Breaks details, fade, switch, nofit, versefit red |
| check-unsplash-pages | 18/18: the box has its own white background and rounded corners and is on top, at the top of the page and scrolled down, at a computer's width and a phone's. **Break boxbg** (the page's `--card` again) → red. Breaks credit, ping red |
| check-enews-blocks | 87/87; 26/26 breaks red. New: joining details in Val's card's list (ID, passcode, the redirect "Click here to join") are found; marked members-only, none are left. Break: details not looked for |
| check-enews-editor | 49/49: unticking asks first, listing the ID, passcode and "Click here to join"; only when told to is the card made for everyone. **Break joinguard** → red. Break memwords red |
| Also | unsplash 22/22, page 60/60, preview 18/18, send 48/48 |

**The test-issue script, tested offline:** 11/11, including a card built like Val's and the YouTube check, which looks only for the private link.

---

## BUILT, 22 Oct: "Members only" for selected words inside a block (Martin). For review

Val puts private details inside a card: the Zoom ID, passcode and join link, or the private YouTube link in Sunday's words. Until now members-only was a whole block, which meant either making the whole card members-only or giving the details a block of their own, full width under the card.

- **In the editor:** select the words, then press **Members only** in the words toolbar. They show in gold on the email. Press it again inside them to make them for everyone again.
  - Words spanning several lines work.
  - A link chosen whole is marked whole, so its address goes with it.
- **In the members' copy** the words are exactly as typed, with no mark visible.
- **In everyone else's copy and the web version** they are taken out (`egbc-mailblocks.js stripMembers`), along with:
  - any link they are in;
  - a line left with nothing in it.
  - **Nothing else moves:** the card's layout is as if the words were never there (checked against exactly that).
- **Kept safe when cleaned:** the mark survives cleaning, and nothing else written on it is kept.
- **The preview of the web version** also refuses a copy holding marked words or their links (`enews-preview.js`).
- **Sunday's own words** can now be typed on the email in the editor, as a card's can, so a private link can go back inside them.

**The test issue** (Val's 15 Oct) is in the live database, which this window doesn't write to. So I've written a script for you to run with Martin: `fix-test-issue-members-words.mjs`, in this window's scratchpad. I'll send its path.
- **Without `--apply`** it only shows each change: the Zoom card made for everyone, with its Meeting ID, Passcode and zoom.us lines marked members-only; the separate private YouTube block moved into the Sunday words, members-only.
- **With `--apply`** it saves, keeping the old blocks in `enewsBackups/<issueId>_membersWords`.
- **If it doesn't find exactly one Zoom card, one private YouTube block and one Sunday block,** it changes nothing and says so.
- **Or by hand in the editor,** about a minute:
  - the Zoom card: Who sees it → untick, then select the ID, passcode and link → **Members only**;
  - Sunday: paste the private link into its words, select it → **Members only**, then delete the separate YouTube block.

**Checks** (on 99fde3d5, then 1b510b71 after the rebase; one test at a time, private TEMP, emulators stopped after each):
- **The full run:** 65 runs, every check green and all 36 deliberate breaks red.
- **check-enews-blocks 85/85**, 25/25 breaks red:
  - everyone's copy never has the words or their links;
  - the rest of the card is left as it is, and an emptied line goes;
  - the layout is unchanged;
  - the members' copy keeps them;
  - the mark survives cleaning.
  - **Breaks:** words left in everyone's copy; the mark lost when cleaned.
- **check-enews-editor 47/47:** the button marks the words; they show gold; church members see them and everyone else doesn't; pressed again they're for everyone. **Break memwords** (the button does nothing) → red.
- **check-enews-preview 18/18**, including **break: members-only words let through** → red.
- **After the rebase** onto multi-church step 2: rules 68/68 (18 breaks), page 60/60, editor 47/47, meeting 17/17, preview 18/18, and upstream's check-top-level 4/4.

---

## BUILT, 22 Oct: "Preview web version" and Share to WhatsApp on a draft (Martin: the newsletter link working now, before going live). For review

- **On a draft's Send page**, and from the editor's Done menu ("Preview web version and share it"): **Preview web version** makes a link to the draft's **public copy** at an **unguessable** address, `enews-web.html?preview=<24 random characters>`. Beside it:
  - **Open**;
  - **Copy link**;
  - **Share to WhatsApp**, with the hub's own share (`EGBCShare.open`), the same as the rest of the hub, so WhatsApp opens with the link ready.
- **The public page** shows it marked **"Preview: not sent yet. It may still change before it goes out."**
  - Its "View this email in your browser" points to the preview itself.
  - It is never in the archive of past issues, and it tells search engines to keep out.
- **The same link, kept up to date:** pressing the button again updates that one preview, so a link already shared shows the draft as it is now.
- **When the issue is sent,** the preview's words are taken out and the link opens the real web version instead (`enews-send.js`; the page follows `sentIssueId`).
- **Never the members-only parts:**
  - the page sends everybody else's copy only;
  - **the server checks as well** (`functions/enews-preview.js enewsPreviewWeb`). It refuses a copy holding any members-only block's words (line by line), its links (including links inside its words) or its names, and says which block.
- **Refused:**
  - an email to church members, a team or people picked, which has no public web version;
  - an issue already sent: share its web version instead;
  - anyone but the church office.
- **Rules:** `enewsPreview/{token}` can be read with its link by anyone, never **listed**, and never written from a page.
- **One fix on the way:** the Send page said "Send" twice, a leftover of the editor switch. Its yellow-note hints now say "in the editor", not "on Build".

### To deploy, and when

- **`firebase deploy --only functions:hub`:** the new `enewsPreviewWeb`, and `enewsSendDue`, which sends previews on to the web version.
- **functions/index.js:** its export line is in (deployed 22 Oct).
- **The rules** for `enewsPreview` go live at switch-over. Until then the live database's own rules apply. A preview holds only the public copy either way, but before switch-over anyone could list the previews, as with any data in the live database now.

### Checks (one test at a time, more than 3 GB free, private TEMP, emulators stopped after each)

| Check | Result |
|---|---|
| check-enews-preview (new) | 16/16, including 3 breaks: members-only blocks let through, an email to members previewed, anyone may make one. It first found that one copied line of a members-only block, or a link inside its words, got past the leak check; both fixed |
| check-enews-page (the preview on the Send page) | 60/60: an unguessable link; Share to WhatsApp opens with it ready; Copy link; opened **signed out** it is marked Preview, with the public parts and none of the members-only ones. **Break leak** (the page hands over the members' copy) → red: the server refuses it |
| check-enews-rules | 68/68; 18/18 breaks red (new: previews listed) |
| check-enews-send, check-enews-editor | 48/48, 43/43 |

---

## BUILT, 22 Oct: the new e-news editor replaces the old one (Martin: now, tweaks after; not waiting for the ease test). For review

- **Every way in opens the new editor** (`enews-edit.html`):
  - opening an issue from the list;
  - this week's draft, which makes itself and says "This week's e-news is drafted for you";
  - the members' meeting button, New email, and Templates.
- **The E-news page keeps** the list, Look and footer, Subscribers, Welcome emails and each issue's **Send page**:
  - Schedule, who it goes to, Send me a test, Share;
  - the yellow "not ready" note and the "events missing a picture or write-up" note;
  - **Back to the editor**.
- **A sent issue** opens on its Send page.
- **The old Build, Phone and Computer views are gone,** and so is their code: about 280 lines, including the old block sheets. Nothing reaches them.

**Nothing lost: every part of the old editor, against the new one.**
- **Already in the new editor:**
  - subject and top line;
  - every block's fields;
  - "Church members only" on any block (Who sees it);
  - move and remove;
  - an event from What's On, a meeting from the Meetings list, Dates for the diary with how far ahead, and notices to untick;
  - the verse from the hub's Bibles;
  - the previews as members and as everyone else see it;
  - the "not ready" and "missing" notes (Check).
- **Missing, and added:**
  - tiles for **the week's picture** and **the section bar**, the two blocks the old editor could add and the new one couldn't;
  - **a title under the week's picture**;
  - **the NIV as the first Bible** when the church's key has it and no usual version is saved, otherwise the BSB, as the old verse sheet chose.

**Checks** (on e571f946, then the check fixes; one test at a time, more than 3 GB free, this window's emulators in a private TEMP folder and stopped after each):
- **The full run:** 62 runs, every check green and all 34 deliberate breaks red, apart from two checks that still used the old view, now fixed and rerun.
- **check-enews-page:** every step it did in the old Build view is now done in the new editor, under the same names (one only extended), plus 8 new ones. 55/55; breaks switch, office, weekly, missing and colour each red. Colour now targets the new editor's colour button.
- **check-enews-meeting:** adding a meeting, the gold members-only edge, and the members' meeting tick that can't be taken off are now in the editor. 17/17; breaks old and notice red.
- **check-enews-editor:** "Open the editor" is on the Send page. 43/43; breaks typing, undo and drop red.

---

## FIXED, 21 Oct (urgent): a parent who shares an address with their child gets the hub's email

Reviewing window: Martin's son is in the address book with Martin's address, so the under-18 rule refused Martin. His own "Send me a test" was refused, and so was every email to every parent of a child in the address book.

- **The rule now** (functions/under18.js):
  - **an address** is an under-18's only when **every** address-book record with it is under 18, so no adult shares it (`under18Emails`, compared ignoring case);
  - **a chosen person** who is under 18 is never sent to, whatever their address (`isUnder18Record`). The same address held by an adult still gets that adult's own emails.
- **Where a person is chosen,** the record itself is now refused:
  - a one-off email to members, a team or people picked (enews-send `recipientsFor`);
  - the office adding a subscriber from the address book (enews.js).
- **Everything else** asks the same function, so it follows the new rule: the mail route (every email, and hubSend), the e-news, welcomes, the members' meeting papers and the social reminder.

| Check | Result |
|---|---|
| check-mail-route | 25/25: a parent sharing an address with their child gets the email; an address held only by an under-18 (Under 16 or Under 18) is refused; **break: the old rule back → red** |
| check-enews-send | 48/48: a child chosen by name is never sent to, even with a parent's address; that parent still gets the members' email once; **break: a child's own record sent to → red** |
| Also passing | subscribe 58/58, welcome-mail 26/26, meeting-papers 21/21, social 13/13, addressbook 18/18 (breaks minor, seventeen red), compiler-send 12/12, and the main window's check-hub-send 25/25 (on this window's emulators) |

---

## BUILT, 21 Oct: v2 sends everything through Church HQ's Resend, with the key in Google Secret Manager. For review

Martin, through the reviewing window: "v2 doesn't use Calla at all." There are three parts.

### 1. No Calla, not even as a fallback

- **`public-mail.js makeSender`**, the sender every server email goes through:
  - always uses Church HQ's Resend (mail-route.js);
  - if Resend fails, the email is **not sent**, and `emailOutbox` says why. It never goes to Calla's sendEmail;
  - without the key, nothing is sent, and the row says "HQ_RESEND_API_KEY in Google Secret Manager".
- **The route's old gates are gone:**
  - the switch-over gate;
  - Martin's list of kinds (`churchSettings/mailRoute`);
  - the key-box key.
- **Calla's protections stay, on this side:**
  - known recipients only;
  - never an under-18;
  - the 2,000-an-hour cap;
  - no body kept for a Safeguarding email.
- **`SEND_EMAIL_URL`** (Calla's address) is gone from every server file. The check confirms this.

### 2. The Resend key and signing secret: Google Secret Manager

**The two names, to set with Martin before deploying:**

    firebase functions:secrets:set HQ_RESEND_API_KEY          (re_..., a FRESH key from Church HQ's Resend, Resend → API Keys, sending access)
    firebase functions:secrets:set HQ_RESEND_WEBHOOK_SECRET   (whsec_..., Resend → Webhooks → the hqMailEvents endpoint)

- **Corrected 21 Oct (reviewing window): RESEND_API_KEY in this project is CALLA'S key.** The original site's sendEmail lists it. So Church HQ's are **HQ_RESEND_API_KEY** and **HQ_RESEND_WEBHOOK_SECRET**, everywhere, and the hub never reads, sets or deletes RESEND_API_KEY:
  - `secretValue` refuses the bare names without asking Secret Manager;
  - a check proves it, with a break.
- **What happened before the rename:** my functions emulator, with no stand-ins yet, fetched RESEND_API_KEY (Calla's key) into its own memory during check runs on 21 Oct. Nothing was sent, as the emulator never sends. The value was never displayed, written down or kept, and it was gone when the emulator stopped. Nothing was ever set or deleted.
- **How every sender gets the key** (functions/resend-secrets.js). A secret reaches only the functions that list it, and about thirty functions in several windows' files send email. So:
  - this window's senders list both secrets (`SENDING_SECRETS`). Deploying them gives the functions' runtime service account access to both;
  - `secretValue()` uses the listed value where there is one. Otherwise it asks Secret Manager directly, with the same account, and keeps the answer for ten minutes;
  - `setGlobalOptions` can't do this here: firebase-functions 7.4 reads global options when each function is defined, before index.js sets them.
- **If a sender ever reports "HQ_RESEND_API_KEY" while the secret is set**, the account lacks access, which a deploy normally grants. One command fixes it:
  `gcloud secrets add-iam-policy-binding HQ_RESEND_API_KEY --project egbc-worship-planner --member serviceAccount:199442060489-compute@developer.gserviceaccount.com --role roles/secretmanager.secretAccessor`
  (and the same for HQ_RESEND_WEBHOOK_SECRET).
- **The webhook** (`hqMailEvents`) checks Resend's signature with HQ_RESEND_WEBHOOK_SECRET.
- **The key box** (Church settings → Email and Canva keys) no longer takes Resend keys:
  - it says whether each secret is **set**, by name, never the value;
  - it refuses a Resend key pasted into it;
  - it keeps Canva's two keys, which still wait for switch-over;
  - an old Resend key left in the database is removed at the next save and never used.
- **The e-news gate (`ENEWS_LIVE`) still holds the subscriber side until switch-over:**
  - the sign-up;
  - the e-news to subscribers;
  - the welcome emails.
  - Until the rules deploy, a subscriber list saved now would be readable by anybody. **Everything else sends as soon as the key is set**, including "Send me a test".
  - **Martin may want this differently.** Say if the welcome emails should open now too; they can't be switched on until the rules are live anyway.
- **The emulator and the real secrets.** A functions emulator with no `functions/.secret.local` fetches the **real** secrets from Secret Manager, using the signed-in CLI. That's how it read Calla's RESEND_API_KEY (above).
  - My checks and the ease test now use test stand-ins in `functions/.secret.local`. The ease test writes it if it's missing.
  - `v2/functions/.secret.local` is added to `.gitignore`, so it can never be committed.
  - **Other windows' emulators:** create that file with test values, or they will hold the live key while they run. The emulator never sends, but it would have it.
- **CHURCHHQ-EMAIL-SETUP.md** parts D and E are rewritten for Secret Manager, to do now rather than at switch-over.

### 3. The main window's part: done (checked by the reviewing window, 22 Oct)

- `functions/index.js` sendOne sends through `makeSender`: no Calla sendEmail.
- `mail-route.js` and every page send through hubSend.
- `PLAN-hub-send.md` names **HQ_RESEND_API_KEY**.
- Small group members (`smallGroupMembers.email`) are in KNOWN_SOURCES, so "Message the group" reaches them.

### Note for the events window (to pass on)

`screenshots/events/public-mail.test.mjs`:
- **A2** (public-mail sends to the same sendEmail as index.js) no longer applies: there is no `SEND_EMAIL_URL` any more.
- **B** (the identity token to sendEmail) no longer applies: `makeSender` takes only `{ db, emulator, route, resendFetch }`.
- **C** (the seven triggers send) should still pass on the emulator: each lands in emailOutbox with `via: 'churchhq'`.

### To deploy, and when

1. **Set the two secrets first** (above). Functions that list a secret won't deploy while it's missing.
2. **`firebase deploy --only functions:hub`.**
3. **Resend → Webhooks:** the endpoint `https://europe-west2-egbc-worship-planner.cloudfunctions.net/hqMailEvents`, its signing secret into HQ_RESEND_WEBHOOK_SECRET (CHURCHHQ-EMAIL-SETUP part E).

### Checks (this window's own emulators)

The full run was on 72ea597e: every check green and all 34 deliberate breaks red, apart from two.
- **The page check** still expected "Send me a test" to go by Calla's. It now expects Church HQ's: 47/47.
- **The card maker's "a long verse fits" check failed on main too, without this change.** It tripled *today's* verse, so it passed or failed by the date, and 21 Oct's didn't fit the band design. That uncovered two real bugs, fixed in 24d7b654:
  - the fit was measured before rounding the size, so text could spill a few pixels;
  - the band design left room under the words for a reference that sits in the band.
  - The check now uses a fixed 110 words, longer than any verse in the Bible: 33/33, and its versefit break is still red.

| Check | Result |
|---|---|
| check-mail-route (rewritten: Resend always, no Calla) | 22/22, including 5 breaks: under-18s let through, the protections switched off, Calla brought back as a fallback, a Safeguarding body kept, a key from the database |
| check-hqmail-key (rewritten: Secret Manager, Canva in the box) | 28/28, including 5 breaks: a key sent back, saving before switch-over, the office let in, a Resend key taken into the box, an old key left in the database |
| check-keybox-page | 9/9; break refill red |
| check-enews-subscribe (the webhook's secret from Secret Manager; one left in the old box never used) | 58/58 |
| check-enews-page (Send me a test through Resend) | 47/47; 5 breaks red |
| check-cardmaker (the verse fix) | 33/33; 5 breaks red |
| Also passing on 72ea597e | send 45/45, emails 36/36 (3 breaks), welcome-mail 26/26, meeting-papers 21/21, unsplash 22/22, unsplash-pages 14/14 (2), blocks 78/78 (23), editor 43/43 (3), layout 11/11 (3), side-by-side 5/5 (3), social 13/13, votd 5/5 (1), meeting 17/17 (2), addressbook 18/18 (5), import 22/22, canva 20/20, canva-page 9/9, rules 64/64 (17), stamps 6/6, features-agree 18, compiler-send 12/12, ease self-check 12/12 (2) |

With `functions/.secret.local` in place, my functions emulator made **no** request to the real Secret Manager in any run (its log shows none).

---

## BUILT, 21 Oct: the welcome emails, the event invitation from What's On, letter spacing and {date}. For review

The reviewing window's order: 1, then 2, then 3.

### 1. The welcome emails, sent by themselves (plan G)

- **Where:** E-news → **Welcome emails**. There are two, each written in the editor from its starter ("Write it" / "Edit the words") and each switched on by its own tick, "Send it by itself".
  - **The tick stays greyed out** until the words are complete: the editor keeps the finished email only while nothing is left to fill in. If the words become unfinished while it is on, the sheet says "On, but NOT sending" and the server sends nothing.
  - The words are kept as two fixed drafts (`enewsIssues/auto_subscriber`, `auto_newcomer`), hidden from the list of e-news and emails.
  - Their Done menu goes back to Welcome emails, never to Schedule.
  - The switches are in `enewsSettings/welcomes`, apart from the look's document, so saving the look can't wipe them.
- **New subscriber welcome** (`welcomeSubscriber`):
  - **When:** a sign-up changes from pending to subscribed, *confirmed by email*. Not for the office adding someone, an edit or an unsubscribe.
  - **What:** their first name, their own unsubscribe link and the one-click header, as the e-news.
- **Newcomer welcome** (`welcomeNewcomer`), when someone says hello on "I'm new here", as you set out:
  - **only to the address the person gave.** Nothing is sent if they gave none (never to a phone number), and it goes to nobody else, with no copy;
  - **never to an under-18** (under18.js);
  - **a welcome, never a care referral.** It reads the hello's name and email and nothing else: never the message, the phone number or "please contact me". It writes nothing to the hello or to any care, pastoral or safeguarding record. The welcomers and the church still hear of a hello exactly as now (notify.js `onHello`, public-mail.js `newHere`, both untouched);
  - only while "I'm new here" is switched on;
  - the sheet says all this in plain words.
- **Both:**
  - once per person (`welcomeSent`, server only);
  - Church HQ's sender, like the e-news;
  - **shut until go-live** with the e-news (enews-gate.js).

### 2. Event invitation, filled from a What's On event

- **"Event invitation"** under New email first asks **which event**:
  - the next four months of What's On, everyone's and members' events only;
  - never a not-listed or team event, nor a cancelled or unconfirmed one;
  - or **Choose later**.
- **It fills in:**
  - the event's picture (or no empty picture block), title and own words;
  - the day and time (e.g. "Friday 23 October, 6:30pm") and the place;
  - **Sign up here** to its sign-up, or **Find out more** to its What's On page when it takes no sign-ups;
  - the subject "You're invited: <title>".
- **A members' event** is for church members, every block members-only.
- **Anything the event lacks** stays a [part to fill in].
- It is `fillInvite` in egbc-mailblocks.js: pure, shared, checked in Node.

### 3. Small gaps

- **Letter spacing** in the words toolbar: Normal (our look), 0.5px, 1px, 1.5px, 2px or 3px.
  - It goes on the chosen words only, across paragraphs, keeping their size and font.
  - Only these steps survive into the email.
  - "Back to our look" takes it off.
- **"Back to our look" fix:** it now finds everything selected *before* changing anything. Before, taking off an outer style could leave an inner one (the new check found this).
- **`{date}` in a template's subject** becomes the date when an email is started from it:
  - the event's (invitation);
  - the meeting's (the members' meeting starter now uses `{date}`, not a [date] to fill in);
  - otherwise that day.
  - The Templates sheet says so.

### To deploy, and when

- **`firebase deploy --only functions:hub`:**
  - the new `welcomeSubscriber` and `welcomeNewcomer` triggers. They send nothing until go-live (the e-news gate), until each is switched on, and until its words are finished.
  - **functions/index.js:** the export line is in.
- **The rules** (`enewsSettings/welcomes`, `welcomeSent`) go live at switch-over with the rest.

### Checks (this window's own emulators)

The full run was on 1db08c2c. Every check was green and all 34 deliberate breaks were red, except one emails step. That step waited a fixed 1.8s for the sheet to save and redraw, which wasn't always enough under load. It now waits for the result: 36/36 twice, and its autocopy break is still red.

| Check | Result |
|---|---|
| check-welcome-mail (new) | 26/26, including 6 breaks: the message put in the welcome, a copy to the church, an under-18 welcomed, sent twice, every change to a subscriber welcomed, sent though switched off |
| check-enews-emails (Welcome emails, the event picker, {date}) | 36/36; breaks autocopy, fill, audience each red |
| check-enews-blocks (fillInvite, letter spacing) | 78/78; 23/23 breaks red (new: an invitation to a members' event for everyone, an invitation without its sign-up, any letter spacing kept) |
| check-enews-editor (letter spacing, Our look) | 43/43; breaks typing, undo, drop each red |
| check-enews-rules | 64/64; 17/17 breaks red (new: anything on the welcome switches) |
| Also passing | send 45/45, meeting-papers 21/21, unsplash 22/22, unsplash-pages 14/14, page 47/47, layout 11/11, side-by-side 5/5, social 13/13, votd 5/5, meeting 17/17, addressbook 18/18, subscribe 58/58, import 22/22, mail-route 27/27, canva 20/20, hqmail-key 22/22, cardmaker 33/33, canva-page 9/9, keybox-page 8/8, stamps 6/6, features-agree 18, compiler-send 12/12, ease self-check 12/12; every break red |

---

## BUILT, 20 Oct late: a members' meeting's papers for members without a hub account (mailings plan 3.3). For review

The main window's note of 21 Oct asked for this. Many members have no hub account, so the members' meeting email now gives each of them their own link to the papers.

- **The email** (the "Church members' meeting" starter, filled from Members' meetings): "See the agenda and minutes" is now **members only** and points at `church-meeting.html?meeting=<id>`.
- **At send** (enews-send.js with the new functions/meeting-papers.js):
  - A church member **with** a hub account keeps that link and signs in, as before.
  - A church member **without** one gets that address swapped in their own copy for `meetingPapers?t=<token>`.
  - The token is random (24 bytes) and stored only as its SHA-256, in `meetingPaperLinks/<hash>`, with the meeting, the person and the expiry.
  - It expires **30 days after the meeting**, at the end of that day.
  - A meeting already more than 30 days gone gets no new links.
- **`meetingPapers`** (a public function, GET) shows a plain page in the church's name:
  - the meeting, its day, time and place;
  - its papers, each served from Storage (`churchMeetings/<id>/papers/…`) with its own type and name;
  - "No papers yet" if there are none, saying when the link ends, so papers added later still reach people.
- **`meetingPapers` refuses:**
  - an unknown or malformed link (404);
  - a link more than 30 days after the meeting (410), pointing people to the church office;
  - anyone no longer a church member, archived or under 18 (403);
  - a meeting that has been taken away;
  - a paper number that isn't there;
  - any paper stored outside that meeting's own folder, including a path climbing out of it.
- **No public file address** exists. The page and files are sent with `no-store`, `noindex` and `no-referrer`.
- **Rules:** `meetingPaperLinks` is the server's alone.
- **Dates:** the meeting's date now reads "Sunday 8 November", without the comma, in the email and on the page.

### For the main window

- **functions/index.js:** the `meetingPapers` export line is in.
- **church-meeting.html** is now opened with `?meeting=<id>` from the email. It ignores this and shows the meetings as usual, which is fine. Opening that meeting straight away would be a small kindness, if you want to.

### To deploy, and when

- **`firebase deploy --only functions:hub`:** the new `meetingPapers`, and `enewsSendDue` with the links.
- **Before any members' meeting email goes out live:**
  - the rules (switch-over), so the office can save a one-off email at all;
  - Storage rules for the papers, the main window's (live with theirs).
  - The function reads Storage with admin rights, so it doesn't wait on those rules.

### Checks (on 837af81b, this window's own emulators; the full run, every check and break green/red as it should be, check-stamps 6/6, the ease self-check 12/12 with its 2 breaks)

| Check | Result |
|---|---|
| check-meeting-papers (new) | 21/21, including 4 breaks: links that never expire, anyone with a link, papers from any folder, account holders given tokens |
| check-enews-send (the papers added) | 45/45, including break "no personal link to the papers" |
| check-enews-rules | 59/59; 16/16 breaks red (new: the office reading the paper links) |
| check-enews-emails (the button: members only, `?meeting=`) | 23/23; breaks fill, audience each red |

---

## READY, 20 Oct late: the ease test on this PC (for the reviewing window to run for Martin)

**One command, from the repo's `v2` folder:** `node ease-test/run.mjs`. The full steps are in [ease-test/README.md](ease-test/README.md).

- **Its own emulator** (`firebase.ease.json`: Firestore 8392, Auth 9392, functions 5393), so no other window's emulator or check is disturbed.
- **A made-up church week:**
  - four What's On events, two with pictures;
  - Sunday's service and a notice;
  - six drawn pictures in the picture library.
- **This week's e-news drafted** as the hub does it.
- **Chrome** opens with a fresh profile of its own, signed in as the church office on the hub's home page.
- **"Inbox (this PC)",** a second tab, where "Send me a test" arrives. Nothing leaves the PC.
- **Test login,** if it ever asks: `tester@example.invalid`, password `ease-test-only`. It exists only in that emulator.
- **The person watching** opens http://localhost:5701/ease-test/observer.html in their own browser. Their notes stay there after the test stops.
- **Ctrl+C or closing Chrome stops everything,** including the emulator's Java, which can outlive its parent. Run the command again for the next tester: it starts afresh.
- **The tester's sheet** now says the test email arrives in the Inbox tab on this PC.

**Checked:**
- `node ease-test/run.mjs --self-check` gives 12/12:
  - the draft is made from What's On, Sunday and the notices;
  - the hub opens signed in, with E-news offered;
  - the editor opens the draft, with the six pictures offered;
  - the Bible loads, for the verse;
  - a test email reaches this PC's functions and lands in the Inbox, and the Inbox page shows it;
  - the sheets are served;
  - no errors are thrown.
- **Deliberate breaks:** `--break=fn` (the page not pointed at this emulator's functions) and `--break=draft` (no draft made) each turn it red.
- **The visible mode, tried end to end:** Chrome opened with the hub and Inbox tabs, and closing Chrome stopped Chrome, the emulator and the server, leaving no port or process behind.

### What's left in the plan (20 Oct)

1. **Papers for members without a hub account** (mailings plan §3.3; the main window's note of 21 Oct): each member's email carries their own link, expiring 30 days after the meeting, served by a function, with no public file address. **Built: see above.**
2. **(Built 21 Oct.) The automatic welcomes:** "New subscriber welcome" sent by itself when someone confirms, and "Newcomer welcome" linked to "I'm new here". Today they are starters only.
3. **(Built 21 Oct.) Event invitation filled from a What's On event:** its picture, day and time, place, and the Sign up button.
4. **(Built 21 Oct.) Small gaps:** letter spacing in the toolbar (plan A), and a `{date}` subject pattern for templates.
5. **(Done 22 Oct, without waiting for the ease test.)** The new editor replaces today's (E3).
6. **Social posts step 2:** only if Martin sets up Meta.

---

## BUILT, stage 3 (20–21 Oct): toolbar styles, the ease test's papers, one-off emails and templates (F, G), pictures from Unsplash. For review

### Toolbar styles (Martin: "as Mailchimp's, starting from the church's Look")

- **Words toolbar:** font, size, line height and highlight, beside colour.
  - Font: seven fonts that work in email.
  - Size: 12 to 36px.
  - Line height: 100% to 200%.
  - Highlight: six light tints.
- Each list starts from the church's Look and shows what the selected words are now.
- **"Our look"** takes the selected words back to the church's Look: font, size, line height, highlight and colour.
- **Only email-safe styles are kept** (egbc-editor.js, egbc-mailblocks.js `cleanHtml`, `styleRules`).
  - Each property is read separately, so a highlight is never taken for the words' colour.
  - Anything not on the lists is dropped when it is saved.

### The ease test (plan D10): for whoever Martin asks

- **v2/ease-test/task-sheet.html (the tester):** seven tasks, aiming for under 30 minutes. Make this week's issue from the draft: a picture, the verse, two events, a coloured word, a link and a test send.
- **v2/ease-test/observer.html (the person watching):**
  - a timer, a Done time per task, and hesitation, help and "helped" buttons with notes;
  - the closing questions;
  - "Copy the results" and Print.
  - Notes are kept in the browser.
- **Where to run it:** the editor must be able to save. So run it on the PC with the emulator, or after switch-over.

### One-off emails and templates (plan F and G)

- **New email** (e-news list) offers:
  - the church's own templates first, under "Ours";
  - then 25 starters (egbc-starters.js): 20 everyday ones and five for the church year (Advent and Christmas, Easter, Harvest, Remembrance, Mothering Sunday).
  - Choosing one makes a **one-off email** (`kind: 'oneoff'`) and opens it in the editor.
  - "What's on this month" fills its diary from What's On.
- **The members' meeting starter** fills itself from **Members' meetings**, following the main window's note of 21 Oct (`churchMeetings`, next by date):
  - the day, time and place;
  - "See the agenda and minutes" → church-meeting.html.
  - For a Zoom meeting: Join on Zoom with its meeting ID and passcode, in the members-only block alone. It is never in everyone's copy or the web version (checked).
  - With no Members' meeting, it uses the next CMM meeting from Meetings, as before.
- **[Parts to fill in]:** Check lists each `[bracketed part]` still left, with Go to it, and holds Send me a test and Schedule until they are done.
  - `Dear {{first_name}}` stays as written. The server puts each person's first name in, or "friend".
  - The preview shows "(their first name)".
- **Save as a template** (editor, Done menu): keeps the blocks, look, subject and audience for the church (`emailTemplates`). **Templates** on the list page offers Use, Rename, Copy and Archive.
- **Who it goes to** (Send tab): subscribers, church members, a team or group, or people picked.
  - The count shows as it is chosen. An under-18 is never offered or counted.
  - **The server works the list out** (enews-send.js `recipientsFor`). A page never hands it addresses.
  - Archived people and under-18s are left out, and each address is sent to once.
  - Church members get the members' copy.
  - Someone who isn't a subscriber gets "Please leave me out of these emails", a mailto link to the office, instead of the one-click unsubscribe.
  - An email to members, a team or people picked has **no public web version** and no Share.
- **Rules:**
  - The one-off keys (`kind`, `audience`, `team`, `picked` ≤300, `templateId`), each checked.
  - `emailTemplates` is for the office only, with known keys.
- **Two faults the new check found, both fixed before commit:**
  - The list page's save dropped who an email goes to.
  - The editor saved "(their first name)" over `{{first_name}}`.

### Pictures from Unsplash (Martin: the server side, within Demo mode)

- **functions/unsplash.js:** `unsplashSearch` and `unsplashUsed`, callables for the office and master admins.
  - **The key** is read from Secret Manager, `UNSPLASH_ACCESS_KEY`, and sent only as Unsplash's `Authorization: Client-ID` header. A page never sees it (checked).
  - **Hotlinked:** each picture is the `urls` Unsplash returns (images.unsplash.com, ixid kept). A picture from anywhere else is dropped. Nothing is copied into our storage.
  - **The download ping:** choosing a picture for a card or an email calls its `links.download_location`. Only an api.unsplash.com download address is ever called. If the ping can't go now, it waits and goes with the next call.
  - **The credit:** "Photo by <name> on Unsplash", appearing in three places:
    - in the picker;
    - under the picture in the email (both linked, `?utm_source=church_hq&utm_medium=referral`);
    - at the end of the card maker's caption, and of each countdown post's caption.
  - The email credit is dropped if the picture is changed to one of ours.
  - **Within Demo mode's 50 an hour:**
    - each search (its words, page and shape) is kept a day in `unsplashCache`;
    - the hour's calls are counted, stopping at 45 (5 spare);
    - past that, the last saved answer is served, or "try again after 11:00";
    - Unsplash's own `X-Ratelimit-Remaining` is believed when it is lower.
  - `content_filter=high`.
- **The picker** (egbc-unsplash.js):
  - **In the e-news editor:** Search Unsplash by the week's picture and a Picture block.
  - **In the card maker:** Search Unsplash under Words → Photo.
  - Search, a shape (wide, tall, square), and More pictures.
  - Each picture is shown with its photographer's credit.
- **Rules:** `unsplashCache` is the server's alone (no page reads or writes it).
- **Screenshots for the Production application:**
  - `v2/design-mocks/comms/unsplash/` holds five screenshots, with a README that maps each one to Unsplash's guidelines and suggests the application wording.
  - They were made with a pretend Unsplash: drawn pictures and made-up photographer names.
  - Once the key is set, take them again on the live hub with real photos for the application.

### To deploy, and when

- **The key:** `firebase functions:secrets:set UNSPLASH_ACCESS_KEY`. The reviewing window sets it with Martin.
- **`firebase deploy --only functions:hub`:**
  - the new `unsplashSearch` and `unsplashUsed`;
  - `enewsSendDue` and `enewsTest`, now with one-off emails and first names.
- **The rules** go live at **switch-over** with the rest: the one-off keys, `emailTemplates`, `unsplashCache`. Until then, the live site refuses to save:
  - a one-off email, so New email can't start one;
  - a template.
- **Search Unsplash works as soon as the functions are deployed and the key is set.** The server keeps its own cache with admin rights, so no rule needs to change for it. The new rule only keeps pages out.

### Checks (on fc9db439, this window's own emulators)

| Check | Result |
|---|---|
| check-enews-emails (new: New email, [parts], Save as a template, Rename / Copy / Archive, who it goes to, the members' meeting from Members' meetings) | 23/23; breaks fill, audience each red |
| check-unsplash (new: the server, a pretend Unsplash) | 22/22, including 5 breaks (no cache, no hourly limit, UTM left off, pictures from anywhere, a failed ping forgotten) |
| check-unsplash-pages (new: the picker in the editor and the card maker; writes the screenshots) | 14/14; breaks credit, ping each red |
| check-enews-send (one-off: members, a team, people picked, first names, leave me out, no web version) | 39/39, including breaks |
| check-enews-rules | 57/57; 15/15 breaks red (new: any audience on an email, church members reading templates, the office reading the Unsplash cache) |
| check-enews-blocks (toolbar styles) | 69/69; 20/20 breaks red |
| check-enews-editor (toolbar styles, Our look) | 41/41; breaks typing, undo, drop each red |
| check-cardmaker | 33/33; breaks fade, switch, nofit, details, versefit each red |
| Also passing | layout 11/11 (3 breaks), page 47/47 (5), side-by-side 5/5 (3), social 13/13, votd 5/5 (1), meeting 17/17 (2), addressbook 18/18 (5), subscribe 58/58, import 22/22, mail-route 27/27, canva 20/20, hqmail-key 22/22, canva-page 9/9, keybox-page 8/8, stamps 6/6, features-agree 18, compiler-send 12/12 |

**Not run:** tests/audit-everything.mjs. It runs only against the dev emulators (8181/9099) or the events window's. This window uses its own, firebase.comms.json, as agreed, so the audit wasn't run.

---

## BUILT, stage 2 of the plan (20 Oct): the editor (A), and social posts step 1 (H). For review

**Same step, different look:** Martin's Mailchimp screenshots above the editor as built, at `OneDrive\Documents\New hub\mocks\mailchimp-editor\built\built-1.png` (adding blocks) and `built-2.png` (typing on the email, a word selected). They are on this PC only.

### The editor (enews-edit.html), the same steps as Mailchimp's in the hub's own look

- **How you get there:** E-news → an issue → **Open the editor**. Today's Build view stays until the ease test is passed (plan D10).
- **The screen:**
  - **Top bar:** ‹ E-news, the subject (typed in place), **Saved** (it saves as you go), **Send me a test** (held until Check is clear), **Done**. Done offers: Schedule it (the E-news page's Send tab), Back to this e-news, All e-news.
  - **Under the top bar:** computer/phone, **undo / redo** (also Ctrl+Z / Ctrl+Y), **Preview**. Preview shows "Church members see" and "Everyone else sees", on a computer or a phone.
  - **Left rail:** **Add**, **Look**, **Check**.
- **Add:**
  - **The blocks:** Picture, Heading, Words, Button, Line, Space, Video, Social links, Logo, Footer.
  - **From the hub:** Event (What's On), Bible verse, This Sunday (from the rota), Meeting, Dates for the diary, Notices.
  - **Layouts:** 1, 2 and 3 columns, Picture and words (Val's card), Words and picture, Two pictures.
  - **Drag** a block onto the email where you want it, or **tap** it: it goes after the block you picked.
  - **Footer** opens Look, because the footer belongs to the church, not to each email.
- **On the email:**
  - Tap a block: a teal outline, a **"⠿ Words"** handle to drag it, and **Move up, Move down, Copy, Delete** beside it. Deleting says "Undo brings it back".
  - **Type on the words where they are.**
  - Gold edge: a block for church members only.
- **The words toolbar** runs across the top while typing:
  - normal words, heading or small heading;
  - **B I U S**;
  - **colour** (the church's palette only);
  - **link**;
  - **emoji**;
  - bullet and numbered lists;
  - plain words.
  - Selecting a word offers **Make it a link**.
- **The block's settings** (left, with ‹ Back to blocks):
  - **Content:** picture (a link or the picture library), button, title, the Bible picker for the verse, the meeting, how far ahead for the diary, and so on.
  - **Style:** background (the church's tints and colours), border, corners, space around, **Reset**, **Use on all**.
  - **Who sees it:** church members only. The CMM always is.
- **Look:**
  - this issue's top line;
  - the starting look and colours, footer details, social links and the diary button. These are shared by every issue.
- **Check:**
  - the week's picture or verse still missing;
  - a meeting not picked;
  - events missing a picture or write-up;
  - links that don't work;
  - empty pictures or videos;
  - how many blocks are members-only.
  - Each has **Go to it**.
- **Phone (375):** one column. A dock has **Add, Look, This block, Check**. Tap a block, then **This block** for its settings: the sheet stays closed while you type, so the email is never covered.
- **One difference from the mock-up, on purpose:** the toolbar has no font, size, line height, letter spacing or highlight. Those are set once for the whole email in Look, so every issue keeps Val's measured look (stage 1) and nothing in an inbox breaks. Say if you want them per word.
- **What's kept:** the same issue document and rules as the E-news page. Scheduling and subscribers stay on the E-news page.

### Social posts, step 1 (in the card maker, behind the card maker's switch)

- **Sizes:** **Instagram** is now the church's portrait **1080 × 1350**, plus square, Facebook and **Story 1080 × 1920**. Every style fits its words in every size (checked).
- **Social post:**
  - **The caption is written the church's way:**
    - a first line;
    - then 📅 the day ("Saturday 10th October"), 🕝 the time, 📍 where, 🎟 Book your place here: (or ℹ️ More details:), 👉 the link;
    - then the hashtags.
  - All of it can be changed.
  - **Hashtags** are kept per event (or series), and as the church's usual set.
  - **Copy caption**.
  - **Share** opens the phone's own share sheet with the picture (Instagram, Facebook, WhatsApp). Where a browser can't share a picture, the caption is copied and the picture downloads.
  - **Download the pictures** gives all four sizes.
- **Countdown:**
  - tick the days (a week before, 3 days, 2 days, the day before, on the day), each with its own first line ("One week to go!", "TOMORROW!"…);
  - **Save the countdown**: each day's post waits in **Today's posts** on its day, ready to Copy, Share or Download, then **Posted ✓**.
- **A Bible verse:**
  - the same Bible picker as the e-news (BSB and KJV free, the church's API.Bible versions with their copyright line);
  - four designs of the hub's own (plain colour, on a photo, framed, a band), in the church's colour;
  - the version's copyright on the picture where the version needs one.
- **Verse of the day:**
  - the hub's own list of 366 verses, one for each day, every one checked in the BSB (`egbc-votd.js`, check-votd);
  - Christmas Day is Luke 2:10-11, and Advent leads up to it;
  - turned on, it is ready in Today's posts each morning: the BSB (or the church's version), the chosen design, a library picture (a different one each day), a credit line if wanted.
- **The 7am reminder** (`functions/social.js`):
  - one short email, only to people who ticked **Email me each morning** themselves, only if they are the church office (never an under-18), and only when there is something to post;
  - through the hub's ordinary email path.
- **Not built yet, and why:**
  - **Unsplash pictures** need Church HQ's own Unsplash app key. It would go in the key box, with its credit and download rules as in the plan. Shall I add it next?
  - **"A verse from the current sermon series"**: the rota doesn't store a sermon's passage yet.
  - **Step 2** (posting straight to the church's Page): not now (Martin).

### To deploy, and when

- **`firebase deploy --only functions:hub`**: the new `socialMorning` timer. It sends nothing until someone ticks the reminder.
- **The rules** (`socialPosts`, `socialSettings`, the e-news footer settings) go live at **switch-over** with the rest. Until then, saving a countdown, hashtags or the verse of the day's settings will be refused on the live site. Making, copying, sharing and downloading posts work now.

### Checks (on b51fb878, this window's own emulators)

| Check | Result |
|---|---|
| check-enews-editor (new) | 37/37 at a computer's width and at 375; breaks typing, undo, drop each red |
| check-cardmaker (social added) | 33/33; breaks fade, switch, nofit, details, versefit each red |
| check-social (new: the 7am reminder) | 13/13, including 3 breaks |
| check-votd (new: 366 verses, all in the BSB) | 5/5; break typo red |
| check-enews-rules | 42/42; 12/12 breaks red (new: anyone may read the social posts) |
| Also passing | blocks 66/66 (18 breaks), side-by-side 5/5 (3 breaks), layout 11/11 (3), page 47/47 (5), meeting 17/17 (2), addressbook 18/18 (5), subscribe 58/58, send 29/29, import 22/22, mail-route 27/27 (now 18 kinds, with "social reminder"), canva 20/20, hqmail-key 22/22, canva-page 9/9, keybox-page 8/8, stamps 6/6, features-agree 18, compiler-send 12/12 |

**Next, if you agree:** the ease test (plan D10). Someone who knows Mailchimp makes a normal week's e-news in the editor without help, in under 30 minutes, and we write down every place they hesitate. Then templates and one-off emails.

---

## BUILT, stage 1 of the plan (20 Oct): the email and the weekly draft (B and C), with the side-by-side check (D9). For review

**Side by side, Val's page and ours** (her own words and pictures through our code), at 375 and 600, top and end: `OneDrive\Documents\New hub\mocks\val-side-by-side\side-375-top.png`, `side-375-end.png`, `side-600-top.png`, `side-600-end.png`. They are on this PC only, not in the repo.

**Measured against hers by computed style:** 25 measures at each width, all the same as hers to within a pixel (`tests/check-enews-side-by-side.mjs`; her numbers in `tests/fixtures/val-15oct26-measure.json`). They are:
- **card pictures:** position, width, corners (3%);
- **card words:** how far in they sit (36px each side on a phone), 14px at 125% on a computer and 18px at 125% on a phone, paragraphs 10px apart;
- **titles:** the teal bold first line;
- **the verse:** 18px, bold, centred, 34px / 28px below the picture;
- **Sunday:** 15px at 150%;
- **the top bar and footer:** their sizes;
- **the footer:** the green "Dates for the diary for the coming weeks" button, and the social icons (48px, 10px apart, centred).

**What changed:**
- **B1. Card titles teal and bold.** A card's title is teal. With no title, the card's first bold line is teal, as Val writes hers.
- **B2, B3. Val's spacing.** Card words at 125% on a computer, paragraphs 10px apart, pictures with 3% corners. Words in a card without a picture sit as far in as hers. The verse is in her 24px line, so its lines are spaced as hers.
- **B4. The church's colours for words.** The text editor has a colour button with the church's palette: the look's teal, green, orange, dark and button colours, plus black, red, grey, blue and purple.
  - A coloured word goes out as `<span style="color:#008080;">`.
  - A colour not in the palette, or anything else on a span, is dropped.
  - Tested: "dish" coloured teal in a card's editor is teal in the copy that is sent, and the web version is made from that copy.
  - The editor (`egbc-editor.js`) is shared. The colour button appears only where a page asks for it, so hub.html and events-admin.html are unchanged.
- **Every card's words are full rich text** (from plan A): an event card's "A line about it" is now the same editor as the Text block.
- **B5. The footer, as Val's.**
  - **"Dates for the diary for the coming weeks"** opens the church's public What's On page. It is on by default and can be turned off in Look and footer.
  - **Social links** are a church setting (Look and footer): Facebook, Instagram, YouTube, website, email, X, TikTok, WhatsApp, LinkedIn.
  - They show as 48px round icons, each in its network's colour with a white mark, as Val's. They are PNG pictures the hub serves (`img/social/`, made by `tools/make-social-icons.mjs`), so Outlook shows them.
  - Only those networks, and only safe links.
- **"Dates for the diary" block** (Add a block): the coming 4 to 12 weeks' public events from What's On, a date and a title each. Never members' or not-listed events.
- **C6. The draft already took each What's On event's picture and full write-up and links.** ChurchSuite's events simply have none.
- **C7. A bare event is a finished card:** its title and day, and **More details** to its page on What's On.
- **C8. "Events missing a picture or write-up"** is listed at the top of the draft. It is a note, not a hold.

**One difference from the brief, on purpose:** the brief said "small white icons". Val's footer actually has coloured round icons with white marks, so ours match hers.

**Checks** (on 52d57f35, this window's own emulators):

| Check | Result |
|---|---|
| check-enews-blocks | 66/66; 18/18 breaks red (new: card titles left black, any colour kept, bare events left bare, members' events in the diary, any network's icon) |
| check-enews-side-by-side (new) | 5/5; breaks lineheight, inset, icons each red |
| check-enews-layout | 11/11; breaks img, fixed, stack red |
| check-enews-page | 47/47; breaks switch, office, weekly, colour, missing each red |
| check-enews-rules | 37/37; 11/11 breaks red (new: any number of social links) |
| Also passing | meeting 17/17 (2 breaks red), addressbook 18/18 (5 breaks red), subscribe 58/58, send 29/29, import 22/22, mail-route 27/27, canva 20/20, hqmail-key 22/22, cardmaker 18/18, canva-page 9/9, keybox-page 8/8, stamps 6/6, features-agree 18, compiler-send 12/12 |

**Next, if you agree:** stage 2 is the editor (plan A), with social posts step 1 (plan H) alongside.

---

## FOR THE MAIN WINDOW: the comms window's edits to your files (20 Oct)

Small and self-contained. Please keep them when you edit these files:
- **functions/index.js:** one export line, `socialMorning` from social.js (stage 2).
  - Stage 3 adds a second line under it: `unsplashSearch, unsplashUsed` from unsplash.js.
- **EmailBuilder2.html:** only the `?v=` stamp on the egbc-mailblocks.js script tag (stage 3).
- **Members' meetings:** thank you for the note of 21 Oct. The members' meeting starter now reads `churchMeetings` and `private/join` as you described (enews.html `nextChurchMeeting`). It doesn't write to them.
- **addressbook.html:**
  - one script tag after egbc-guard: `egbc-enews-ab.js` ("Gets the e-news" on each person, for the office; C-30);
  - the **UNDER 18** tick under UNDER 16, with its note;
  - in `editMember`, it is loaded (ticked for an under-16 as well);
  - in the save, `under18` is stored only for a 16 or 17 year old, because Under 16 already counts;
  - it is added to the master-only list beside isMinor (C-36).
  - The rule for it (leaders can't change it, like isMinor) is in firestore.rules `bookLeaderOk`.
- **EmailBuilder2.html (the Compiler):**
  - three script tags under the omggif one: egbc-mailblocks.js, egbc-core-meetings.js, egbc-meeting-pick.js;
  - one `+ Insert` option, "A meeting (Join button)";
  - one branch at the top of `insertBlock` (`kind === 'meeting'`). C-35.
  - Your version stamps at the top of the file were not touched.
- **The under-18 rule everywhere:** `functions/under18.js` (ticked Under 16 or Under 18). The shared mail route (`functions/mail-route.js` checkRecipients) uses it, so every v2 email kind refuses under-18s.

---

## DECIDED (19 Oct 2026; plan bebcbd9e accepted by the reviewing window and Martin)

These replace anything below that disagrees.

1. **The e-news is a new page** that shares the Email Compiler's blocks.
2. **Sending is one Church HQ Resend account for every church.**
   - Martin sets it up and pays for it inside the subscription.
   - Each church sends as `"<Church name>" <news@mail.churchhq.co.uk>`, with Reply-To set to the church's own address.
   - Unsubscribe, bounces and complaints are handled **per church**.
   - A church's own domain is an optional extra later, never required.
   - Martin's steps are in `CHURCHHQ-EMAIL-SETUP.md`.
   - **Updated 19 Oct:** the key goes into the **key box** in Church settings. Martin pastes it there himself. It is kept in `privateSettings/churchHqMail`, which no page can read, and is never shown again (`functions/hq-mail-key.js`). Sending is held by `functions/enews-gate.js` (`ENEWS_LIVE = false`) until switch-over.
   - The unsubscribe header and bounce handling live in the **hub's own** sending path, not Calla's.
   - **This replaces C-2, C-12 and C-13 below.** Calla's sendEmail is not changed for the e-news.
3. **Canva is tested on Martin's own FREE Canva account.**
   - The page shows "Connect Canva" and Martin signs in himself. Nobody asks for a password.
   - **No Autofill**: Canva's docs contradict each other on which plan it needs.
   - The fallback is download from Canva, then drag in.
   - What a free account can do is in C-21.
4. **Both looks as templates** (the Mailchimp look and the hub's green). The colours are a **church setting**, so any church can set its own.
5. **A new hub card maker.** Calla Design's files are not touched.
6. **Build and test now.** Running alongside Mailchimp starts on switch-over day (C-1).

### C-20. Moving hub email off Calla's sendEmail, later (plan; e-news first)

**Done (22 Oct):** v2 no longer uses Calla at all. Every server email and every page sends through Church HQ's Resend (see "v2 sends everything through Church HQ's Resend", above). What follows is the original plan.

- **Stage 1 (now): the e-news only.**
  - A new hub module, `functions/hq-mail.js`, sends through Church HQ's Resend with the key from the key box.
  - It has `List-Unsubscribe` and `List-Unsubscribe-Post` headers, a `tags` entry carrying the church id and subscriber id (so a bounce report knows whose it is), and an `Idempotency-Key` per person per issue (so a retry never sends twice).
  - It writes the same `emailOutbox` rows as `makeSender` does today, so "Emails sent" (comms.html) shows e-news sends too.
  - A webhook function, `hqMailEvents`, checks Resend's signature (svix, raw body) and ignores repeats (`svix-id`). It then marks that church's subscriber `bounced` or `complained`.
- **Stage 2 (after switch-over, Martin decides when): the server's own emails.**
  - These are the reminders, notifications, public-page mail (§26 item 14) and `compilerSend`. Each moves from `makeSender` to `hq-mail.js`, one at a time.
  - `makeSender` gets the same shape so each move is a one-line change, with a check for each.
  - Transactional mail has **no** unsubscribe header, but still the church's name and Reply-To.
- **Stage 3: the browser senders.**
  - `egbc-email.js` (rotas, Planner, Sunday plans) today posts straight to Calla's sendEmail.
  - These move to a hub callable that checks who's signed in, then sends through `hq-mail.js`. That also closes the email lock (§26 item 4).
- **Calla's sendEmail keeps working throughout.** It's retired only when nothing calls it: check `emailOutbox` and Calla's logs for 4 weeks of silence.
- **Rotas and the rest stay on Calla's for now**, as Martin said.

### C-21. Canva on a FREE account (what to expect; Martin's test confirms)

| Part | Free account? | Source |
|---|---|---|
| Making the integration (Developer Portal) | Yes. Any account can, but **two-step sign-in must be on** for the REST APIs. | canva.dev authentication docs (the research's reading) |
| Using it before Canva reviews it | **Very likely yes, for the account that made it.** Canva's own quickstart has you sign in to your unreviewed integration on your own account. Others can't use it until reviewed. | canva.dev/docs/connect/quickstart |
| A **private** (our-church-only) integration | **No.** Enterprise only. So it's a "public" integration we never submit for review while only Martin and Val use it. If Val needs it on her own account, it's submitted then. | canva.dev creating-integrations |
| List your designs | Yes | List designs API, no plan noted |
| Export PNG, JPG, PDF | Yes | Export API |
| Export **GIF** and **MP4** | Yes. Not limited to Pro. A design with **paid (Pro) elements** may refuse to export at top quality ("license_required"). | Export API |
| Bigger-than-design exports | Limited on free (×1.125) | Export API |
| Autofill and brand templates | Not planned (decision 3) | |

**Martin's test, when the page is ready:**
1. Turn on two-step sign-in in Canva.
2. Make the integration in the Developer Portal. I'll write those clicks then, with the exact redirect address.
3. Open the hub page and press "Connect Canva".
4. Sign in to Canva yourself.
5. Check that your designs appear.
6. Import one animated design.

That one test answers every "very likely" above.

---

## DECIDED, 19 Oct 2026 late (Martin and the reviewing window)

- **Church HQ's Resend is set up and verified** (`CHURCHHQ-EMAIL-SETUP.md`, parts A-C done).
- **The original site stays on Calla's sendEmail. v2 uses Church HQ's Resend:** the e-news first, then the hub's other emails one kind at a time, with Calla's as a fallback for a few weeks. Everything is moved by switch-over (C-20 brought forward: stage 2 and 3 before switch-over, not after).
- **The key goes into a key box, never a chat.** Built: Church settings → **Email and Canva keys** (master admins). It holds the Resend key, its webhook signing secret, and the Canva client ID and secret. It refuses to save until switch-over (`ENEWS_LIVE`), and never sends a key back to a page. check-hqmail-key 22/22, 4/4 breaks; check-keybox-page 8/8 at 375, break refill red.

## C-28. Moving v2's emails to Church HQ's Resend, one kind at a time (built 19 Oct late; nothing moved yet)

**What's built.** `functions/mail-route.js`, and one change to `public-mail.js` `makeSender` (no other window had edits to it, pushed or not). Calla's sendEmail is not touched, and the original site keeps using it.

**When an email goes to Church HQ's Resend.** Only when all three are true:
1. Its kind (or its source) is on Martin's list, `churchSettings/mailRoute.kinds`. The list is **empty** to start.
2. The key is in the key box.
3. The switch is open (`ENEWS_LIVE`, shut until switch-over).

Otherwise it goes to Calla's exactly as today.

**Protections on the Resend path** (Calla's, kept on this side):
- Known recipients only, from the same 17 sources. The check compares the list with Calla's own file.
- **No under-18 address.** An address on an address-book record ticked isMinor is refused. Calla's sendEmail doesn't check this; hub rule 7 says it must never happen.
- A cap of 2,000 recipients an hour across all instances.
- outlineOnly: a Safeguarding team's email keeps no body in the outbox.

A refusal is final: it is **not** passed to Calla's.

**Who it comes from.** `"<church name from Church settings>" <hub@mail.churchhq.co.uk>`, with Reply-To the sender's chosen address, else the church's enquiry email.

**If Resend fails,** the same email goes to Calla's, and both attempts are in the outbox (`via: 'churchhq'`, then `via: 'calla'` with `fallbackFrom`). Every outbox row now says `via`.

**Checks:** check-mail-route 26/26, 5/5 breaks:
- every kind counted as listed;
- under-18 addresses let through;
- the protections switched off;
- no fallback on failure;
- a Safeguarding body kept.

**Not yet routed, and needs one more step:**
- **`index.js` `sendOne`** (reminders and notifications) is the main window's file, with unpushed edits. Moving it is a one-line change, `sendOne` calling `makeSender`. I'll raise it once the main window has pushed.
- **The browser senders** (stage 3) go through Calla's legacy path until a hub callable takes them.
- **There's no page yet for Martin's list.** Server side only, as asked. A switch per kind can go in the key box section when wanted.

### Every kind of email v2 sends, and a suggested order to move them

Each kind is moved by adding it to the list. Safeguarding and care go last. A kind written with a variable part (e.g. `checklist due`) can be listed exactly, or all at once by its source (`checklist`).

| # | Kind (or source) | Sent by | What it is |
|---|---|---|---|
| 1 | `calendar link` | events-feed.js (makeSender) | The person's own calendar link, sent when they ask |
| 2 | `session plan` | planner.js (makeSender) | A session plan to a plan group |
| 3 | `compliance due`, `compliance summary` (source `compliance`) | compliance.js (makeSender) | Building checks, to the people responsible |
| 4 | `checklist …` (source `checklist`) | checklist-reminders.js (makeSender) | Checklist reminders |
| 5 | `regular gift set up`, `regular gift changed` (source `regular-giving`) | gocardless.js (makeSender) | Giving confirmations |
| 6 | `signup` | public-mail.js | Event sign-up confirmation, with the calendar file |
| 7 | `booking waiting`, `booking request`, `cancel ask` | public-mail.js | Room hire: to the hirer, and to the office |
| 8 | `form received` | public-mail.js | A form done |
| 9 | `group ask`, `group ask leaders` | public-mail.js | Asking to join a small group |
| 10 | `new here` | public-mail.js | A visitor's hello, to the address the church chose |
| 11 | source `emailCompiler` | compiler-send.js (makeSender) | The Email Compiler (up to 50 people) |
| 12 | `team email`, `team email copy` (not the Safeguarding team) | team-mail.js (makeSender) | Sending as a team |
| 13 | `booking-reminder`, `document-expiry`, `document-expiry-office` | index.js **sendOne** (needs the one-line step) | Hire reminders |
| 14 | `notify-rota`, `notify-booking`, `notify-maintJob`, `notify-maintJob-office`, `notify-urgent`, `notify-callParent` | notify.js through index.js **sendOne** | The email copy of a notification, for people without the app |
| 15 | The browser senders: Planner and Core Team rota emails, the Sunday and Youth service planners, events-admin ("email everyone", cancellations), bookings-admin, forms-admin, groups-admin, kids-admin and kids-checkin, egbc-events-money receipts, hub-app, youthapp2 | pages through egbc-email.js (Calla's legacy path) | Stage 3: a hub callable first, then the same list |
| **16 (last)** | `notify-care-address` | notify.js through sendOne | Care & support, worries, prayer: "something has come in", to the address the church chose |
| **17 (last)** | `notify-checks-lead` | notify.js through sendOne | DBS and training reminders, to the safeguarding lead |
| **18 (last)** | `team email` for the **Safeguarding** team (outlineOnly) | team-mail.js | Safeguarding team email, no body kept |
| **19 (last)** | safeguarding.html's emails | browser | Safeguarding, from its page |

Already on Church HQ's Resend, through its own sender (hq-mail.js), not this list: `enews`, `enews confirm`, `enews test`.

## BUILT, 20 Oct 2026 (comms window): the e-news looks like Val's

Martin, 20 Oct: the e-news "does not look right at all… looks really poor". It must look exactly like Val's Mailchimp (`mailchi.mp/esherchurch/15oct26`) on a phone and a computer, and never like a downgrade.

### C-29. Val's template, measured from her page

The e-news is now drawn the way Val's Mailchimp page is. Every number below was measured from her 15 Oct page in a browser, at 375 and 600 wide.

| Part | Val's (and now ours) |
|---|---|
| Width | 100% up to 600px; a fixed 600 table only for Outlook (inside `<!--[if mso]>`) |
| Page behind | #dee0e2 |
| Top bar | #222222. The top line on the left, "View this email in your browser" on the right. 11px on a computer, 14px on a phone |
| Picture at the top | Full width (600) |
| Verse | 18px, bold, centred; the reference and version after it; the version's copyright line under it at 11px |
| Section bar | Orange #fe7e07, "Coming up this week" |
| Words | Helvetica/Arial, 15px / 150%, #202020. 18px on a phone (below 480px) |
| Titles and dates | Teal #008080, bold |
| Links | Green #17a809 |
| Events, on a computer | Picture 176px wide at x18, words beside it at x230, 14px |
| Events, on a phone | Picture full width (339px at x18), words under it |
| Between events | A 2px #eaeaea line |
| Sign-up button | Green #07a47d pill, "Sign up here" |
| Footer | #202020. Copyright in italics, the church's name and address, charity number, office hours in bold, email and phone, then "Want to change how you receive these emails? You can update your preferences or unsubscribe from this list." |

- **Each event card carries the event's full description and its links**, not just a title and time.
- **The order is Val's:** picture, verse, "Coming up this week", Sunday, events, notices.
- **The colours are still a church setting** (E-news page → **Look and footer**). EGBC's starts as Val's ("Classic"). "Green" has the same layout in the hub's colours.
- **Outlook-safe:** tables and inline styles only, no flex or grid.

**Side by side, the same week (15 Oct), ours on the left, Val's on the right:**
- In `OneDrive\Documents\New hub\mocks\val-side-by-side\` (375 and 600, top and end). They were in the repo; Martin, 20 Oct: no Mailchimp screenshots in the repo, so they moved there.

Val's Zoom details, her personal email and phone number are blocked out in those pictures.

**Where ours still differs, and why (content, not layout):**
- **Val picks the events by hand; the draft takes every public What's On event in the next fortnight.** The office removes the ones they don't want, as before.
- **Most events imported from ChurchSuite have no picture and no description**, so a draft looks wordier than Val's until the events get pictures. Once an event has them, its card looks like hers.
- **Val's footer has a "Dates for the diary" button and social icons; ours doesn't yet.** The button can be added as a Button block now. Social icons need a setting for the church's links; not built.

**For Martin to change:** the live church settings' **enquiry email** is your personal business address. It would be the Reply-To and the footer address on every e-news. Change **Enquiry email** at the top of **Church settings** to the office address before the first real send. (The comparison pictures use office@esherchurch.org instead.)

### C-31. A new week never goes out with an empty top

- A new week's draft opens with **"Add this week's picture"** and **"Add this week's verse"** in the preview, as dashed boxes.
- **Schedule and "Send me a test" stay greyed out until both are filled in, or deliberately removed.** A gold note under the subject says what is missing.
- The placeholders are only ever in the preview, never in a copy that is sent (checked both ways).

### C-32. The verse comes from the hub's Bible

- The verse block opens **This week's verse**: type a reference (e.g. "Col 3:23-24"), choose the version, press **Bring it in**.
  - The verse, the full reference and **the version's copyright line** fill in.
  - Typing or pasting the verse by hand always works.
- It is the hub's own Bible code (`egbc-bible.js`, as in the session planner):
  - **the free Bibles now** (BSB, KJV, NHEB…);
  - **API.Bible versions such as the NIV once the church's API.Bible key is saved.**
- **The church's usual version is remembered** (`enewsSettings/main.bible`): the NIV when the church's key allows it, otherwise the BSB. Choosing another version once makes that the usual one.

### C-30. "Gets the e-news" in the address book, and adding from it

**In the address book** (office and master admins only, when the e-news is on):
- Each person's row says **"Gets the e-news"** or **"Unsubscribed from the e-news"**.
- Their form shows:
  - **if they get it:** how they said yes and when, and a **Stop sending it** button. They are kept as unsubscribed, with who stopped it.
  - **if they don't:** **How did they say yes?** (told the office / paper form / by email / by phone / signed up themselves) and **Add to the e-news**. Nobody is added without the answer.
  - **if they unsubscribed:** "They can only come back themselves, from the e-news sign-up page." There is nothing to press.
  - **if they are under 16:** never offered.
- It is an add-on (`egbc-enews-ab.js`), loaded by **one script tag** in `addressbook.html`. The address book's own code is not changed.

**On the E-news page, Subscribers → Add from the address book:**
- Search and tick people, or choose a whole team or group to tick everyone in it.
- One "How did they say yes?" covers everybody ticked, and is recorded with each person.
- Under-16s and archived people aren't listed. People who already get it, or who unsubscribed, are shown greyed out with the reason.

**The server checks all of it again** (`enewsSubscriberSave`), whatever a page sends:
- an under-16 is refused;
- someone who unsubscribed or marked it as spam can't be added from the address book, even with "they asked again";
- every add records who, when, how and from where.

### C-33. Share to WhatsApp, and the go-live words

- **A sent issue has Share to WhatsApp.** It opens the hub's share sheet (`egbc-share.js`: the WhatsApp app, Desktop or Web) with a short line and the **web version's link**. The web version never has the members-only parts.
- **The Send tab says plainly:** "Sending to subscribers opens when the church goes live on the new hub. Until then, "Send me a test" sends it to you only."

### C-34. "Send me a test" works now

- It sends the e-news to **the signed-in office person's own address only**, through the hub's existing email service: Calla's, the same route as the hub's other emails today.
- The subject starts **[Test]**, and its unsubscribe links go nowhere.
- **Church HQ's Resend stays shut** until go-live (`ENEWS_LIVE = false`), and so does sending to subscribers.

**To deploy (the reviewing window or Martin): `firebase deploy --only functions:hub`.** This puts up `enewsTest` and this round's changes to `enewsSubscriberSave`; `enewsTest` is not deployed yet. **The rules (`firestore.rules`) go live at switch-over only**, as before.

### C-35. "Add a meeting" in the e-news and the Email Compiler (20 Oct, later)

- **Pick a meeting from the hub's Meetings list** (rota meetings from today on, with a video room; never past, archived or no-call ones). It fills the name, the day and time, and a **Join the meeting** button.
  - Join goes to the hub's meeting page (`meeting.html?room=…&event=…`): people type their name and knock, and the host lets them in. It is never a host link.
  - Copying a room's own link from Meetings works as before; nothing there changed.
- **E-news:** Build → Add a block → **A meeting**.
  - **Church members only by default:** the meeting is in the members' copy, never in everyone else's copy, the web version or a share.
  - The office can untick it for an ordinary room. **The CMM room is always members-only**; its tick can't be taken off.
  - An unpicked meeting holds Send ("Pick the meeting" in the preview only).
- **The CMM starter:** **Church members' meeting** beside New e-news.
  - It makes a notice with a short letter and the next CMM meeting already picked, members-only.
  - It is marked as a notice, so it never stops the week's e-news making itself.
- **Email Compiler ("Send an email"):** **+ Insert → A meeting (Join button)** puts the same card into the email.
  - A one-off email has no members' copy, so the picker marks CMM as "Church members only" and says to send that one to church members. The room itself only lets church members in.
  - In EmailBuilder2.html (the main window's file), this is three script tags under the GIF library, one option and one branch in `insertBlock`. Nothing else there changed.
- Shared code: `egbc-meeting-pick.js` (the picker); `egbc-mailblocks.js` meeting block, `snippet.meeting`, `meetingFrom` and `membersOnly`.
- **Checks:**
  - check-enews-blocks 49/49, 13/13 breaks (new: meetings let into everyone's copy; the CMM let out when unticked);
  - check-enews-meeting (new) 17/17 at 375, breaks old and notice red.

**The CMM template:** the main window's mailings plan (design-mocks/mailings/PLAN.md) has a "Church members' meeting" template that fills in from its members' meeting page. This starter becomes that template when it is built (PLAN, section F).

### C-36. No emails to anyone under 18 (reviewing window, 20 Oct)

The hub's rule is under 18, not under 16 (YOUTH-ACCESS.md: "No email addresses for under-18s, ever").
- **The address book had no way to mark a 16 or 17 year old.** It only had the "UNDER 16" tick, and its note said 16 and 17 year olds use their own email. It now has an **UNDER 18** tick under UNDER 16. Under 16 counts as under 18 too.
  - A 16 or 17 year old still signs in with their own email; they are just never emailed.
  - Like Under 16, only the office and master admins can change it; the rules stop team leaders. The rules go live at switch-over.
- **One rule on the server** (`functions/under18.js`, ticked Under 16 or Under 18), used everywhere:
  - **adding** to the e-news, by hand or from the address book: refused, with "under 18";
  - **sending**: someone on the list who was ticked later is skipped, and counted;
  - **the Mailchimp import**: not brought in;
  - **the hub's mail route** (every v2 email kind): refused.
- **Never offered:** the address book's e-news panel, and the E-news page's "Add from the address book" list.
- **Tested with a 17-year-old** (ticked Under 18, not Under 16):
  - check-enews-subscribe 58/58;
  - check-enews-send 29/29, new break "an under-18 sent the e-news" red;
  - check-import-mailchimp 22/22, new break "under-18s imported" red;
  - check-mail-route 27/27;
  - check-enews-addressbook 18/18, new break "seventeen" red.

### Checks (this window's own emulators; run on exactly what is pushed)

| Check | Result |
|---|---|
| check-enews-blocks | 42/42; 11/11 breaks red |
| check-enews-layout (new): nothing wider than the screen at 320, 375, 414, 600; Val's phone and computer layout | 10/10; breaks img, fixed, stack each red |
| check-enews-page (picture and verse held; the Bible; "Send me a test" pressed for real; Share) | 38/38 at 375; breaks switch, office, weekly each red |
| check-enews-subscribe (adding from the address book, skips, Stop) | 56/56; 4/4 breaks |
| check-enews-addressbook (new) | 17/17 at 375; breaks office, unsub, minor, silent each red |
| Also run on the pushed commit | check-enews-send 27/27, check-enews-rules 30/30 (9/9 breaks), check-import-mailchimp 20/20, check-canva 20/20, check-hqmail-key 22/22, check-mail-route 26/26, check-cardmaker 18/18 (breaks fade, switch, nofit red), check-canva-page 9/9, check-keybox-page 8/8, check-stamps 6/6, check-features-agree 12/12 |

Pictures (made by the checks, not committed): `tests/shots/enews-375-send-held.png`, `enews-375-verse-sheet.png`, `enews-375-share.png`, `enews-ab-375-rows.png`, `enews-ab-375-form-add.png`, `enews-ab-375-form-stopped.png`.

---

## BUILT, 19 Oct 2026 evening (comms window)

All eight steps of the plan are built and checked, on emulators of this window's own (never another window's, never live). **They are held on this window's computer, not pushed**, until the main window pushes its "What does your church use?" switches (F-230) and its new Menu by job: the Menu entries for these pages belong inside that Menu, and until those switches are live a Menu entry would show on the live site even though the pages themselves say "switched off".

| What | Files | Check (all on this window's own emulators) |
|---|---|---|
| The e-news's blocks and both looks | `egbc-mailblocks.js` | check-enews-blocks 30/30, 7/7 breaks |
| The e-news page: draft, edit, previews, schedule, test, subscribers | `enews.html`, `egbc-comms.js` | check-enews-page 26/26 at 375; breaks switch, office, weekly each red |
| This week's draft makes itself (rule 13) | `enews.html` | in check-enews-page |
| Sign-up, confirm, unsubscribe, bounces | `functions/enews.js`, `functions/hq-mail.js`, `functions/enews-gate.js`, `enews-signup/confirm/unsubscribe.html`, `egbc-enews-public.*` | check-enews-subscribe 47/47, 4/4 breaks |
| Sending, once, the right copy to each person; the web version | `functions/enews-send.js`, `enews-web.html` | check-enews-send 23/23, 4/4 breaks |
| The rules (go live at switch-over) | `firestore.rules` | check-enews-rules 30/30, 9/9 breaks |
| The Mailchimp import | `tools/import-mailchimp.mjs` | check-import-mailchimp 20/20, 3/3 breaks |
| Card maker | `cardmaker.html`, `egbc-gif.js` | check-cardmaker 18/18 at 375; breaks fade, switch, nofit each red |
| Canva | `functions/canva-core.js`, `functions/canva.js`, `canva.html` | check-canva 20/20 (a pretend Canva), 3/3 breaks; check-canva-page 9/9 |

**Changes from the plan, found while building:**

- **C-22. The card maker's movements move the photo or the button, never the words** (gentle zoom, slow pan, button pulse). The mock-up's "Fade in" and "Slide up" would leave Outlook readers (who see only a GIF's first frame) with no words.
- **C-23. The weekly draft has no timer.** The first time the office opens E-news in a week, the draft makes itself (rule 13).
- **C-24. Who gets the members-only blocks (Martin, 19 Oct): church members AND team members.** That means anyone in the address book (not archived) with the church-member tick, or on at least one team. Pending and Attender never; nor anyone not in the address book (`functions/enews-send.js` getsMembersCopy). check-enews-send 27/27, with breaks "team members left out" and "archived people let in" both red.
- **C-25. The unsubscribe page unsubscribes as soon as it opens.** That's one tap from the email, as the mock-up showed, and its own script does it, so link-checkers that don't run scripts can't. Re-subscribe is one tap on the same page.
- **C-26. Saving to the picture library is PNGs only for now.** GIFs and videos download, until the library keeps them whole (C-16). The library's rules let admins write; the Church office group may need adding (part of the C-16 request).
- **C-27. The Email Compiler's GIF maker is now shared as `egbc-gif.js`**, but the Compiler still has its own copy until it's switched over. That's one small commit once the main window's pending edits to EmailBuilder2.html are pushed.

**Waiting on others:**
- the main window's push, which unblocks the Menu entries and the check-menu lines for the four public pages (reached from email and the website);
- the C-16 request to the events window, raised once its file is free of the main window's pending edits;
- Calla's nothing: the e-news no longer uses sendEmail.

### Martin's Canva test (C-21), click by click

You do the clicks and sign in yourself. Nobody asks for your password.

1. Sign in at **canva.com** with your own free account. Turn on two-step sign-in: your picture → **Settings** → **Login & security** → **Two-step verification** → on. Canva requires this for anyone making an integration.
2. Go to **canva.dev** → **Developer Portal** → **Integrations** → **Create an integration**.
   - Choose **Public**. "Private" is Enterprise only.
   - Name: `Church HQ`.
   - Agree to the terms.
3. **Scopes:** tick only **design:meta → Read** and **design:content → Read**. Nothing else.
4. **Authentication → Redirect URLs.** Add both:
   - `https://europe-west2-egbc-worship-planner.cloudfunctions.net/canvaCallback`
   - `http://127.0.0.1:5101/egbc-worship-planner/europe-west2/canvaCallback` (for a test on a PC before switch-over)
5. **Configuration:** copy the **Client ID**. Press **Generate secret** and copy it; it is shown once. **Don't press "Submit for review".**
6. Paste both into **Church settings → Email and Canva keys** (Canva client ID, Canva client secret), then press **Save**. The box takes them from switch-over; before then, on a test PC, the reviewing window puts them in the emulator's `functions/.env.local`.
7. **The test itself.**
   - **Before switch-over:** on a PC running the emulators (the reviewing window sets that up), open **From Canva**, press **Connect Canva**, sign in to Canva, check your designs appear, and import one animated design.
   - **After switch-over:** `CANVA_LIVE = true` in `functions/canva.js`, deploy functions:hub, and do the same on the live site.

---

## Part 1: for Martin, in plain words

### What you'd get

1. **The e-news is built in the hub.** Each Monday the hub drafts the week's e-news for Val:
   - Sunday's service and preacher, from the rota
   - this week's events from What's On, each as an event card
   - the notices
   - the sign-ups

   Val adds the Bible verse and anything else, checks it on a phone view and a computer view, sends herself a test, and picks a time. It sends itself.
2. **There are two versions of every e-news.**
   - **Church members** get the full one, including the YouTube live link and the Zoom passcode.
   - **Everyone else**, and the web version, get it with those parts left out.
3. **A sign-up page** goes on the church website, and **every e-news has an unsubscribe link**. One tap unsubscribes, with no signing in.
4. **Val's card maker.** She picks an event, a style and a movement. She gets the card in every size in one go: e-news, Instagram, Facebook, the screens and A5. A moving GIF goes in the e-news, and a short video goes to social media and the screens.
5. **Canva.** Val connects her Canva once. The hub lists her designs, and "Import" brings a finished one into the picture library as a GIF, PNG or video.

### Pictures (375px, a phone)

| | |
|---|---|
| The e-news editor | `design-mocks/comms/enews-editor-375.png` |
| An event card (real words on the photo, from What's On) | `design-mocks/comms/event-card-375.png` |
| Sign-up page | `design-mocks/comms/signup-375.png` |
| After signing up ("check your email") | `design-mocks/comms/signup-done-375.png` |
| Unsubscribe page | `design-mocks/comms/unsubscribe-375.png` |
| Card maker | `design-mocks/comms/card-maker-375.png` |
| Canva designs | `design-mocks/comms/canva-375.png` |

Remake them with `node design-mocks/comms/shoot.mjs` (from `v2/`). Made-up names only.

### Five things I found that change the plan

- **C-1. The e-news can't really start before switch-over.**
  - Until the locked rules go on, anyone can read every collection in the live database without signing in (checked 14 Oct, §26 item 15). A subscriber list stored there today would expose hundreds of people's email addresses.
  - So the list, the sign-up page and the Mailchimp import stay shut until the rules deploy, the same way the private forms are held (§26 item 16).
  - **"Running alongside Mailchimp for a few weeks" starts on switch-over day, not before.** Everything else gets built and tested on the emulator now.
- **C-2. Today's sending can't take a weekly e-news.**
  - Calla's `sendEmail` sends from `EGBCWorship@callasuite.uk`.
  - It has **no unsubscribe header** and **no bounce handling**.
  - It takes at most 50 people per request and 2,000 per hour.
  - Resend's **free** plan stops at **100 emails a day**. If that is Calla's plan, a 400-person e-news fails partway through.
  - Fixes: **Resend Pro at $20 a month** (50,000 a month), or a separate church Resend account. See C-12 and Decision 2.
- **C-3. Canva: Canva's rules are stricter than the brief assumed.**
  - A **private** integration (only for our church) is **only allowed for Canva Enterprise teams**.
  - Otherwise it has to be a **public** integration, which Canva reviews before anyone else can use it.
  - Canva's docs don't say whether the person who created it can use it before review. **We need a 10-minute test with Val's account** (Decision 3).
  - Canva's developer terms bar an app "primarily intended to export designs into a third-party design platform". The hub is not a design platform, but **someone should read clauses 4(b) and 5(a) before we rely on this** (C-15).
  - **The fallback always works:** Val downloads the GIF from Canva and drags it into the picture library.
- **C-4. Canva Autofill no longer needs Enterprise.**
  - Canva's Autofill page now says it works on **Pro, Teams, and Canva for Nonprofits** (checked 19 Oct).
  - As a registered charity, the church can probably get **Canva for Nonprofits free**.
  - If Val is on one of those, Canva could fill her own templates from What's On, which may be better than our card maker. **The brief said "not Autofill", so I've planned without it.** Say if you want it looked at.
- **C-5. Today's Mailchimp web version shows the Zoom passcode and the private YouTube link to the whole internet.**
  - 15 Oct shows the prayer meeting's Zoom ID and bold passcode.
  - 8 Oct shows the "private" YouTube live link.
  - Both are on the public mailchi.mp page. Worth Val knowing now, before any of this is built.

### Decisions only you can make

1. **Where the e-news lives** (I recommend **a**):
   - **a.** A new "E-news" page that shares its building blocks and GIF maker with the Email Compiler, so nothing is written twice.
   - **b.** An "E-news" mode inside the Email Compiler (`EmailBuilder2.html`). The e-news needs subscribers, scheduling, an archive and consent records that the Compiler doesn't, so **b** makes one big page bigger.
2. **Sending** (ask Calla which Resend plan is in use). Either:
   - Resend Pro ($20 a month) on Calla's account, with the e-news counted separately from the hourly cap; or
   - a church Resend account just for the e-news.
   
   Either way, the sending address `news@esherchurch.org` needs a few DNS records added by **whoever looks after esherchurch.org's domain** (who is that?).
3. **Canva:** is Val's Canva Free, Pro, Teams or Nonprofits? And may I set up a test integration on her account (she has to turn on two-step sign-in in Canva first)?
4. **The look:** do you want the first template to look like today's Mailchimp (orange "Coming up this week" bar, teal titles), the hub's green, or both?
5. **The card maker and Calla Design:** the brief says to reuse Social Media Maker and Calla Photo. But they are Calla Design, which the briefs put out of scope ("do not touch"). They have no sign-in, so they can't read What's On. **My plan:** a new hub page that copies their *method* (the same video-recording technique) without changing their files, and shares the Email Compiler's existing GIF maker. Say if Calla Design should change instead.

---

## Part 2: the plan (for the reviewing window)

### What exists already (survey, 19 Oct)

- **`EmailBuilder2.html` (the Email Compiler)**
  - Blocks: button, heading, divider, spacer, two columns (`insertBlock` :676-700).
  - Picture upload to Storage `email_assets/` (:1125).
  - **A GIF maker**: bundled `GifWriter`, median-cut palette, up to 8 frames (:1141-1220).
  - `buildEmailHtml` (:609-665) builds 620px nested tables with inline styles.
  - It sends through the `compilerSend` callable (`functions/compiler-send.js`), one request per person, at most 50.
  - No saved templates; drafts only (`emailDrafts`, at most 10).
- **`egbc-email.js`**: `EGBCEmail.send` posts to sendEmail **without a token** (the legacy path). It stubs on localhost.
- **`functions/public-mail.js` `makeSender`**: the server path. It uses a Google identity token (`id-token.js`), logs every send to `emailOutbox`, and stubs on the emulator. **The e-news sends through this.**
- **`socialmaker.html` and `photoeditor.html` (Calla Design, out of scope)**
  - Single files, with no Firebase.
  - socialmaker has 7 social sizes and records WebM with MediaRecorder + `canvas.captureStream` (:729-763). **No GIF.**
  - photoeditor exports PNG, JPG or WebP only.
- **The picture library (events window, F-176)**
  - `pictureLibrary/{id}`. Files go to `library/<id>/<ts>.jpg`, **shrunk to a 1600px JPEG**, so an animated GIF would be flattened.
  - The Storage rule allows `image/*` up to 8 MB, so no video.
- **Data the e-news reads**
  - `calEvents`: title, start, image/imageLibId, `visibility`, `signupOn`, which links to `signup.html?event=`.
  - `news`: notices.
  - `events` (rota): date, serviceTime, speaker, publicTitle.
  - Sign-ups.
- **Feature switches**: `EGBCChurch.uses(name)` **always returns true** today (`egbc-church.js:160-169`). There is no "off until turned on".
- **Calla's sendEmail** (`C:\Users\marti\egbc-email\functions\index.js`)
  - `KNOWN_SOURCES` :93-111 (17 collection/field pairs).
  - Limits: 50 recipients, 2 MB html, a 2,000 per hour cap held in memory.
  - From `EGBCWorship@callasuite.uk` (:313).
  - **No `headers` field, no List-Unsubscribe, no webhook.**
- **Mailchimp issues (8 and 15 Oct)**
  - A 600px column with a header image and the verse as a centred bold line.
  - An orange `#FE7E07` "Coming up this week" bar.
  - About 10 cards per issue: Val's 940×788 GIF at 176px on the left, text on the right, teal `#008080` titles.
  - A green `#07A47D` "Dates for the diary" PDF button.
  - Social icons, and a dark footer with: 6 Park Road, Esher KT10 8NP · Registered Charity No 1133504 · office hours · office@esherchurch.org · 01372 468255.
  - Card pictures have empty alt text.

### Findings

- **C-1** (above): the subscriber data is held until the rules deploy. The gate is the same `churchSettings/launch.rulesLocked` as the private forms. The sign-up page shows "opening soon", and the import tool refuses `--write` until then.
- **C-2** (above): sending capacity, the headers and bounces need Calla (C-12).
- **C-3, C-4, C-5** (above).
- **C-6. Feature switches that start OFF.**
  - `EGBCChurch.uses()` treats everything as on.
  - Add a short "off until turned on" list (`enews`, `cardMaker`, `canva`), read from `churchSettings/features`. Only an explicit `true` turns these on, and master admin sets it in Church settings.
  - This touches the shared `egbc-church.js`, so it gets one small commit with its own check: the three are hidden for everyone until set, and appear once set.
- **C-7. Members-only blocks, decided per person, not per issue.**
  - Any block can be marked "members only". It shows in gold, as in the mock.
  - The sender builds two HTML versions:
    - **members:** the subscriber's email matches an active address-book person at Church member or above (§21);
    - **everyone else.**
  - The web version and archive are always the "everyone" one.
  - Test: a subscriber who isn't in the address book never gets the Zoom passcode, and the web page never has it. Deliberate break: mark the passcode block public and the check must go red.
- **C-8. Event cards are real text, not a picture.**
  - In email, the photo is a cell background with the words as HTML on top. A VML fallback lets old Outlook show it, and a dark solid colour shows if pictures are blocked.
  - The words stay readable with pictures off, can be searched, and the card updates if the time changes before sending.
  - **Val's Canva GIFs** (words baked in) go in as a "picture card" block instead, with alt text filled in automatically from the event title (today it's empty).
  - Old Outlook on Windows shows only the GIF's first frame, so the card maker always puts the words in frame 1.
- **C-9. Event visibility decides what goes in.**
  - The automatic draft takes `calEvents` from the next 14 days whose `visibility` is `public`, as a normal block.
  - It takes `members` / `churchMembers` events as members-only blocks.
  - It never takes `team` or `unlisted` events.
  - Test with deliberate break: an `unlisted` event (the AA case) must never appear in any version.
- **C-10. Subscribers: one record per email address, with consent.**
  - `enewsSubscribers/{random id}`, never keyed by email.
  - Fields:
    - `email`, `firstName`
    - `status`: pending, subscribed, unsubscribed, bounced or complained
    - `lists`: `{weekly, special}`
    - `consent`: `{at, how: 'web form (confirmed by email)' | 'Mailchimp import' | 'office, paper form', wording: <version id of the exact sign-up text>, confirmedAt, source}`
    - `history[]`: every change, with date
    - `token`: a long random string for unsubscribe links
  - Someone who unsubscribes is **kept as unsubscribed** (a do-not-contact record), never deleted and never re-imported.
  - Office view: list, search, add by hand (with a "how did they agree?" choice), CSV download.
  - Rules: only the office and master admin read it. The public can only *create* a `pending` record of the exact shape (the `welcomes` pattern, firestore.rules :3927). Changes after that go through functions only.
- **C-11. Sign-up and unsubscribe.**
  - **Sign-up (`enews-signup.html`)**: a public page, no sign-in. It can be embedded on esherchurch.org.
    - **Double opt-in**: a trigger on the pending record emails a confirm link. Only confirmed records are sent the e-news.
    - Against abuse (someone typing other people's emails in): at most one confirm email per address per 24 hours, a hidden honeypot field, and pending records that are never confirmed are deleted after 14 days.
  - **Unsubscribe (`enews-unsubscribe.html?t=<token>`)**: the page's own script posts to a hub function (`enewsUnsubscribe`). Link-checkers that open links but don't run scripts can't unsubscribe someone by accident.
  - **One-click from the mail app**: every e-news also carries `List-Unsubscribe: <https://…/enewsUnsubscribe?t=…>` and `List-Unsubscribe-Post: List-Unsubscribe=One-Click`. The function accepts that POST and returns a blank 200 (RFC 8058).
  - Unsubscribing takes effect at once (Gmail and Yahoo require within 2 days).
  - The page offers re-subscribe and "special notices only".
- **C-12. What Calla's sendEmail needs** (planned here; Calla's window writes it, the reviewing window and Martin deploy `--only functions:sendEmail` from `C:\Users\marti\egbc-email`):
  1. `KNOWN_SOURCES` += `['enewsSubscribers','email']`, but **only addresses with status `subscribed` or `pending`**. Today's check only asks "is the address in the collection?", so an unsubscribed address would still count as known. That needs a status filter on this one source.
  2. Accept a `headers` object (List-Unsubscribe and List-Unsubscribe-Post only) on the **server path only**.
  3. A per-request `from` chosen from an allowed list (`news@esherchurch.org` once verified), server path only.
  4. The e-news counted outside the 2,000-an-hour cap, or the cap raised for the server path. A send of about 400 is 400 requests, one per person, because each person's unsubscribe link is different.
  5. A **Resend webhook** (bounced, complained, suppressed). Verify the svix signature on the raw body, dedupe on `svix-id`, and post to a hub function that marks the subscriber `bounced`/`complained`. After a hard bounce they're never sent again.
  6. **Resend plan:** free is 100 a day, so the weekly send needs Pro ($20 a month) or a separate account. **Calla to check which plan is live.** Resend's Batch endpoint (100 per call, an `Idempotency-Key` per send) is gentler than 400 single calls. Worth Calla's view.
- **C-13. The sending domain** (plan only, nothing done).
  - Use a subdomain, **`news.esherchurch.org`**, so a bad week can't harm normal office email from esherchurch.org.
  - In Resend: add the domain. Resend shows the exact records: a DKIM TXT at `resend._domainkey.news`, and an SPF TXT plus MX on `send.news`.
  - Add `_dmarc.news.esherchurch.org` `v=DMARC1; p=none; rua=mailto:<office>`.
  - Send from `EGBC e-news <news@news.esherchurch.org>`, with reply-to `office@esherchurch.org`.
  - Whoever holds the esherchurch.org DNS adds the records. They take effect within hours.
- **C-14. Mailchimp import with consent.**
  - `tools/import-mailchimp.mjs`, the same shape as the other import tools: Admin SDK, `--live` looks first and writes nothing, `--live --write` writes, and a second run says "0 written".
  - It reads Mailchimp's export ZIP (separate subscribed, unsubscribed and cleaned files):
    - **subscribed** → `subscribed`, with `consent.how = 'Mailchimp import'` and Mailchimp's own `OPTIN_TIME`/`CONFIRM_TIME`;
    - **unsubscribed** → kept as `unsubscribed` (so they're never emailed);
    - **cleaned** (bounced) → `bounced`.
  - It never touches the address book.
  - **The law, simply:** people on the Mailchimp list already agreed to the e-news, so that agreement carries over and we keep the record of it. The new charity "soft opt-in" (in force 5 Feb 2026) doesn't apply to them, and we don't need it: everyone new signs up on the form.
  - Items promoting *another* charity (e.g. a cake sale for Dignify) are fine for people who signed up, because they agreed to the e-news itself.
  - **It runs only after the rules deploy (C-1).** Martin exports the ZIP from Mailchimp: Audience → Export, all contacts.
- **C-15. Canva, built carefully.**
  - **Connect:** OAuth with PKCE. The code exchange happens in a hub function (it needs the client secret, and Canva blocks it from browsers).
  - **Storage:** the refresh token and client secret go in a server-only document (`integrationSecrets/canva`, denied to every page, like `paymentSecrets`).
  - **Gate:** `functions/canva-gate.js` (`CANVA_LIVE = false`), exactly like `payments-gate.js`. Until switch-over, the live functions refuse, because the open database would expose the token.
  - **Refresh:** access tokens last 4 hours and refresh tokens are single-use, so each refresh saves the new one in a transaction.
  - **Scopes:** `design:meta:read` (list designs) and `design:content:read` (export) only. We never write to Canva.
  - **List:** `GET /v1/designs`, 25 at a time. Thumbnails expire after 15 minutes, so they are fetched fresh and never stored.
  - **Import:** `POST /v1/exports` with gif, png or mp4, then poll. The download link lasts 24 hours, so the function copies the file straight into Storage and adds it to the picture library.
  - **Limits:** 20 exports a minute and 500 a day per user, far above what Val needs.
  - **Terms:** before building, someone reads Canva Developer Terms 4(b)(vii) (a clause reportedly about deleting media within 5 minutes, which may only cover media-processing apps) and 5(a)(viii). I couldn't confirm the exact wording.
  - **Fallback if Canva won't approve:** drag-and-drop import of the downloaded GIF or MP4, which needs nothing from Canva.
- **C-16. The picture library must keep GIFs and videos whole.**
  - Today it shrinks everything to a 1600px JPEG, so an animated GIF loses its movement, and its Storage rule has no video.
  - It's the events window's file (F-176), so this goes in as a **request in FINDINGS-events.md**:
    - keep GIF and MP4 originals (GIF up to 8 MB, MP4 up to 50 MB, `video/mp4`);
    - make a still JPEG thumbnail for lists;
    - add a `kind` field (still, animated or video).
  - The card maker and the Canva import both wait for it.
- **C-17. The card maker (`cardmaker.html`, feature `cardMaker`).**
  - A hub page, signed in, for the office and the comms team. It **doesn't change Calla Design** (Decision 5).
  - Reuse:
    - the Email Compiler's `GifWriter` moves to a shared `egbc-gif.js`, used by both. EmailBuilder2 is changed only to load it, and its existing GIF check has to stay green;
    - video uses the same MediaRecorder method as socialmaker: MP4 where the browser can (Chrome, Safari), WebM otherwise.
  - Sizes:

    | Use | Size |
    |---|---|
    | E-news | 940×788 (Val's size) |
    | Instagram | 1080×1080 |
    | Facebook | 1200×630 |
    | Screen | 1920×1080 |
    | A5 print | PNG at 1748×2480 |
  - Templates: 4 to start, **drawn from Val's real Canva cards once she sends 3 or 4 samples** (the colours in the mocks are placeholders).
  - Movement: none, fade in, slide up, gentle zoom. The words are in the first frame.
  - Output: "Save to library" saves every size, tagged with the event, so the e-news, the event page, the app and the screens can pick it up.
- **C-18. Scheduling and the archive.**
  - `enewsIssues/{id}`: blocks, status (draft, scheduled, sending, sent), `sendAt`, and counts.
  - A hub function runs **every 5 minutes** (onSchedule, Europe/London). It picks up due issues, marks them `sending` in a transaction (so the issue can't be sent twice), and sends with `makeSender`. Each person's result goes to `emailOutbox`.
  - The **Monday draft**: onSchedule `0 7 * * 1` creates the week's draft if none exists (rule 13: nothing to press).
  - **Web version / archive**: `enews.html?issue=` is public, and shows only the "everyone" HTML, saved when the issue was sent.
  - **Test send**: "Send me a test" goes only to the signed-in person.
- **C-19. Who can use it.** The e-news and subscribers are the church office (§25: Val, Ryan) and master admin. The card maker and Canva are the office plus whoever the office adds to a "Comms" group. Each gets a Menu entry with the feature name (rule 14), under "People and messages" in the new by-job Menu.

### Order of work (each step: checks, deliberate breaks, the audit, a report)

1. **Switches (C-6)** and an empty E-news page behind `enews`, with its Menu entry.
2. **Blocks and preview**: the shared block code from the Email Compiler, plus the new blocks (event card, verse, picture card, members-only marking, footer). Phone and computer preview. Templates.
3. **Automatic Monday draft** (C-9, C-18) from What's On, the rota, notices and sign-ups.
4. **Subscribers, sign-up, confirm, unsubscribe** (C-10, C-11). Emulator only, with the rules written but not deployed.
5. **Sending through the server**, the two versions (C-7), scheduling, the archive. Proven on the emulator with sendEmail stubbed. **The real send waits for Calla's C-12 changes and the domain (C-13).**
6. **The Mailchimp import tool** (C-14). The dry run can be tried on a synthetic export. The live run happens on switch-over day.
7. **Card maker** (C-17), after the picture-library request (C-16).
8. **Canva** (C-15), after Decision 3 and the terms check.

### New lines for §26 (switch-over checklist)

- After the rules deploy:
  - Martin turns on `enews` in Church settings;
  - runs `tools/import-mailchimp.mjs --live`, then `--live --write`;
  - checks the sign-up page on esherchurch.org.
- Church HQ's Resend is set up (`CHURCHHQ-EMAIL-SETUP.md`, parts A-E): `mail.churchhq.co.uk` verified; the Resend key and signing secret pasted into the key box (parts D and E); the webhook pointing at `hqMailEvents`. Then `ENEWS_LIVE = true` in `functions/enews-gate.js`, and deploy functions:hub.
- `CANVA_LIVE = true` in `functions/canva-gate.js`, then deploy functions:hub, then Val connects Canva.
- E-news and Mailchimp run side by side for 3-4 weeks. Retire Mailchimp only when the hub's sends show no bounce or complaint problems (Resend: bounces under 4%, complaints under 0.08%).

### Not verified (said plainly)

- Whether an unreviewed public Canva integration works for its creator's own account.
- The exact wording of Canva's developer terms.
- Which Resend plan Calla's account is on.
- Resend's exact DNS records (they're shown in its dashboard).
- The full Mailchimp export column list.

## From the main window, 21 Oct 2026: the members' meeting page is built (for your one-off emails)

`church-meeting.html` (Members' meetings) is live in the repo, as in design-mocks/members-meeting.
Your "Church members' meeting" template can fill itself from it.
- **The next meeting:** `churchMeetings`. Order by `date`, then take the first on or after today.
  Fields: `title`, `date` (YYYY-MM-DD), `time`, `place`, `joinKind` (`room` | `zoom`), `room`
  (`CMM`), `papers: [{ name, path }]`.
- **The Zoom details:** `churchMeetings/{id}/private/join` → `{ zoomUrl, zoomId, passcode }`.
  Members only; for your members-only block, never the web version.
- **The button:** "See the agenda and minutes" →
  `https://esherchurch.github.io/availability-form/v2/church-meeting.html`. It asks members to sign in.
- **Papers** are in Storage at `churchMeetings/{id}/papers/…`. The rules let church members and
  whoever runs the meetings read them; there is no public address. Your per-person, 30-day links for
  members without an account would serve these paths through your function.
- **Who runs it** (papers, votes): the Church office, the Elders and master admins. The rules call
  them `meetingRunner()`.

## From the main window, 21 Oct 2026: enews-edit.html and the Menu (rule 14) — please confirm

check-menu found enews-edit.html with no way in from the Menu. Your page answers it: E-news's "Open the editor" opens it for one issue (`enews-edit.html?issue=<id>`), and the editor is built round that issue. So I have listed it in check-menu's REACHED_ELSEWHERE as **"opened from E-news, 'Open the editor' on one issue"**, with no Menu entry.

- **If that's right:** nothing to do.
- **If you want a Menu entry anyway** (for example, one that opens the latest draft): say so here. I'll add it, and take the line out of REACHED_ELSEWHERE.

## From the main window, 21 Oct 2026: v2 email moves wholly to Church HQ's Resend — plan for your review

Martin's correction (through the reviewing window): **v2 doesn't use Calla at all.** Only the original site does. So every v2 sender moves to one hub callable (`hubSend`), and the Calla fallback and URLs go from v2 entirely. The plan is in **PLAN-hub-send.md**, waiting for review. It builds on your C-28 `mail-route.js`: checkRecipients, under-18, reserve and sendViaResend (with attachments).

**What it needs from you** (or I'll do it, if you prefer):
1. **`makeSender` and `mail-route.js` to Resend only.** No route list, no "shut" gate, no Calla fallback. Every kind goes through Church HQ's Resend.
2. **`smallGroupMembers.email` added to KNOWN_SOURCES.** Without it, "Message the group" and small-group invitations are refused. The list no longer has to match Calla's.
3. **enews-send:** `via || 'calla'` → `'churchhq'`.
4. **The key before switch-over.** The plan recommends `RESEND_API_KEY` in Secret Manager (only functions can read it), with your key box showing "saved" from the server. That's Martin's choice; see the plan.

## From the main window, 21 Oct 2026: hubSend built on your makeSender; one line in your mail-route.js

- **Built.** Every v2 page sends through `hubSend` (functions/hub-send.js), which uses your `makeSender` and `mail-route`. It checks recipients and reserves the hour once per call, then sends one email per recipient. Outbox rows show `source: 'hub:<kind>'`.
- **`sendOne` in index.js** is now `makeSender`.
- **I added to your KNOWN_SOURCES:** `['kidsFamilies', 'email']` and `['kidsFamilies', 'email2']`.
  - **Why:** "Call the parent" (notify.js `callParent`) emails the parent with no phone, at the kidsFamilies address. Once `sendOne` used `makeSender`, that email was refused as unknown (check-notify-send went red; now 82/82).
  - Calla's path never checked recipients, so nobody had noticed. Please keep the two lines, or move them as you prefer.
- **check-mail-route** excludes `index.js` and `public-mail-pages.cjs` from its "names Calla" scan. Neither names Calla now, so you could drop the exclusions.

## From the main window, 22 Oct 2026: two audit reds on enews.html, and a stale comment

- **Sheets with no visible close once scrolled** (full audit, master at 375): "New email" and "Look and footer" open a sheet whose close isn't on screen after scrolling it.
  - On SundayServicePlanner.html I fixed the same thing with a ✕ inside the box: `position:sticky; top:0`, `aria-label="Close"`, 44px. It stays in sight however far the box scrolls.
- **functions/team-mail.js:7** still says the From line is `<EGBCWorship@callasuite.uk>`. v2's mail now comes from `hub@mail.churchhq.co.uk` in the church's name, through `makeSender`.
  - check-no-calla now fails on "callasuite" in any page or script.
  - It doesn't look in functions, so your comment isn't red. Please reword it.

## From the main window, 22 Oct 2026: "when the hub goes live"

- **hq-mail-key.js:78** now says Canva's keys can be saved "when the hub goes live" (the reviewing window: Val may never switch over).
- **Your checks:** I widened check-hqmail-key.mjs:102 and check-keybox-page.mjs:149–150 to accept `/goes live|switches over/`.
- **Still saying "switch-over" on screen, please reword:**
  - canva.js:70 and :93 ("Canva connects at switch-over.");
  - enews.js:311 ("The subscriber list opens at switch-over");
  - ease-test/observer.html:45.

## From the main window, 22 Oct 2026: a new stamp for egbc-share.js on enews.html

- **egbc-share.js** changed: the Share sheet's message box was dark text on dark grey in the app's dark theme (the reviewing window). It is now kept light.
- **Please change** `egbc-share.js?v=202610212300` on **enews.html** to `?v=202610221610`, so browsers fetch the new one. app.html and hub.html are done.

## From the main window, 22 Oct 2026: multi-church step 3 in your functions (batch 8, via the reviewing window)

Every function must take the church from the sign-in's claim or the document's path, never from the page. EGBC (no claim) keeps working exactly as today. The full rules are under H-5 in FINDINGS-churchhq.md. Please change these; I won't touch your files.

- **Callables:** enewsTest, enewsSubscriberSave, enewsPreviewWeb, hqMailKeySave, hqMailKeyStatus, canvaStatus/Start/Designs/Import/Disconnect, unsplashSearch, unsplashUsed.
  - Use `churchOf(request, getFirestore()).db` from `functions/church-scope.js` in place of `getFirestore()`, and pass it on.
- **Triggers:** welcomeNewcomer, welcomeSubscriber.
  - Keep each, and add a twin on `churches/{cid}/<same path>`, named `<name>Church`, using `churchFromPath(event, db)`.
  - index.js `twins()` is the pattern.
  - `makeHqSender` is cached once per instance with EGBC's db. Make one per church, or pass the church's db per send.
- **Scheduled jobs:** enewsSendDue, socialMorning.
  - Wrap the body in `eachChurch(db, (ch) => run(ch.db))`.
- **Links with no sign-in:**
  - enewsSignup, enewsConfirm, enewsUnsubscribe tokens, and canvaCallback state.
  - After a church writes a token, call `indexCode(db, kind, hash)` from `functions/hq-codes.js`. The endpoint uses `dbForCode(root, kind, hash)`; no entry means EGBC.
  - Add your kinds to `KINDS` in hq-codes.js and tell me which.
  - **hqMailEvents (Resend's webhook):** find the church from the message's tags or id that you stored when sending, never from the body alone.
  - **enewsSignup on a public page:** has no church until step 4 gives each church its own address. Leave it EGBC's for now, as findMe is.
- **Already done in mine:** `personalise` (meeting papers links) indexes a church's link, so enewsSendDue only needs to pass the church's db.
- **The check:** extend `tests/check-church-calls.mjs`, or copy its pattern:
  - Ann (mc-alpha) gets alpha's answer;
  - naming beta, or giving beta's ids or tokens, is refused or finds nothing, and nothing is written in beta;
  - Eve (no claim) gets EGBC's answer as today;
  - a break (the helper bypassed) turns it red.
  - Run it on the spare emulators: `FUNCTIONS_EMULATOR_PORT=5191`, `--config firebase.spare.json --only firestore,auth,functions`.

## From the main window, 22 Oct 2026: the emulators now load firestore.build.rules (FINDINGS-churchhq H-7)

- **Why:** firestore.rules is 341 KB, and Firebase refuses a ruleset over 256 KB. The deployed ruleset is now built from it with the comments and spare whitespace taken out: `firestore.build.rules`, 177 KB.
- **Keep editing firestore.rules,** comments and all. After any rules change, run `node tools/rules-build.mjs` from v2.
- **Every config now names the built file:** firebase.json, firebase.spare.json, firebase.events.json (yours; the reviewing window asked me to change it), firebase.ease.json and firebase.tmp.json.
  - If you forget the build, your emulator tests run the old rules.
  - `tests/check-rules-build.mjs` fails when the built file is out of date, too big (over 230 KB), or not the same rules.
- **Your rules-engine tests:** any test that passes `fs.readFileSync('firestore.rules')` to initializeTestEnvironment should load `cfg.firestore.rules` instead, from the config it already reads. I've changed firestore-rules.test.mjs, church-scope-rules.test.mjs and storage-rules.test.mjs.
  - **Comms:** tests/check-enews-rules.mjs loads firestore.rules.
  - Static checks that read the source text, such as check-access-levels, can stay as they are.
