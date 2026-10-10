# EGBC Hub on the phone: the app design

Martin approved this design on 9 October 2026, after tapping through a clickable mock-up as four example people. **Open `v2/design/app-mockup.html` in a browser**: it is the agreed design. It's reference only, not a live page, so leave it out of the page checks.

This brief replaces the phone parts of ONE-APP-BRIEF where they differ. Rules in NEXT-BRIEF §0, §4, §15 and §21 still apply. **Structure on existing pages never changes.** This is about how the app is arranged, not what the pages do.

---

## 1. Why

Martin compared the ChurchSuite phone app (43 screenshots in his OneDrive) and found it overwhelming for anyone who isn't confident with technology:
- two different apps with confusing names
- everything behind a ☰ menu, up to three levels deep
- jargon
- actions hidden behind "…" menus
- help panels pushing content off the screen
- room booking only possible by logging into the admin app

Our app must be usable by someone who has never used a church app.

## 2. The shape

**One app, one login, several spaces.**

- **"Me and my family"**, for everyone, always first. Bottom tabs: **Home · What's on · Listen · Me**.
- **One space per team the person is on**, e.g. Worship & AV, Kids Church, Welcome, Tea & Coffee, Maintenance.
  - A person only ever sees **their own** teams. Someone on no team sees no row of spaces at all.
  - Simple teams get three tabs: **Rota · This Sunday · Team**.
  - Bigger teams get four, as in the mock-up:
    - Worship & AV: Rota · Sunday · Learn · Team
    - Kids Church: Today · Children · Rota · Team
- **"Running things"**, for office and admins: **Today · People · Bookings · Send**. The full tools still open on a computer; this is the phone view of "what needs me".
- The spaces sit as a **row of pills under the header**. Each team has its own colour, with the tab bar and highlights following the space's colour.
- **Never more than four bottom tabs**, and no ☰ menu inside the app. Nothing is hidden behind "…".

## 3. Home (Me and my family)

Answers "what do I need to know this week?" In this order, each section shown only when it has something:
1. **You are serving**: the next date or dates, role and arrival time, with a link to that Sunday's plan.
2. **This Sunday, for parents**: the family check-in QR code and a **"Check in Ada and Ben"** button.
3. **Your family this week** (the family rule, §4).
4. **Your events**: what they've booked or signed up to.
5. **Notices**: two or three short ones.
6. **Your groups**: the next meeting.

## 4. The family rule (Martin)

"The person logging in should only see the teams relevant to them and their family."
- **Their own teams** become spaces, with tools.
- **Their family's serving and groups** appear on their Home under **"Your family this week"**, with when and where only and no team tools. For example, *Oliver · drums, Sun 15 Nov, arrive 9.30*, or *Lazers · Ben, Friday 6.30pm, bring a torch*.
- "Family" is the household the rota PDFs and the household calendar feed already use (`EGBCRotaPdf.householdIds`). Don't make a second household model.
- **Young people have no accounts and no emails** (YOUTH-ACCESS). A parent sees their child's youth groups through the household.

## 5. Don't double up (Martin)

**The availability form is already a mobile form.** The app links to it ("My availability", and "Open the availability form" on a team's Rota tab). It never rebuilds it.
- There is no "I can't make it", no accept/decline and no swaps (F-018).
- Check every other screen the same way: if a v2 page already does the job, the app opens that page.

## 6. New things the design adds

- **Listen** (sermons and podcast).
  - Sermons are stored in the hub, with series, speaker, date and Bible passage.
  - A player that remembers your place, and "carry on listening".
  - An admin upload page.
  - A public podcast RSS feed, so Val's existing Spotify show is **repointed** to it, keeping its artwork, name and followers. **Don't create a new Spotify show.**
  - About 25–48 past sermons will come from ChurchSuite, which Martin downloads.
- **Teams are data, not code.** The office adds, renames, recolours and removes teams. The current list comes from ChurchSuite and Martin; confirm it with him:
  - Worship · A/V · Kids Church · Creche · Lazers · ReNu
  - Welcome · Stewards · Tea & Coffee · Catering · Flowers · Garden · Police bakes
  - After Service Prayer · Pastoral · Preacher / Service Leader · Small Group Leaders
  - **Maintenance** (new)
  - **Elders, Finance and Safeguarding** are private user groups rather than rota teams.
- **Maintenance space:**
  - **Jobs**: things reported, which can be marked done. Anyone can "report a job".
  - **Rooms → "Close a room"**: pick the days and a reason. The room disappears from Book a room for those days, the office is told, and anyone already booked is warned. Built on the events window's bookings, as a blocking booking with a reason.
- **Kids Church "Today":**
  - who's in, not arrived, and leaders
  - **the needs in the room** (allergies and medical)
  - **Call a parent** (screen via ChurchShow, the parent's phone, or ring)
  - check-in desk and fire roll-call

## 7. The phone itself

- **Bottom tabs must clear the phone's own navigation.** Martin tapped Groups and closed the app instead.
  - `viewport-fit=cover`
  - bottom padding of `calc(12px + env(safe-area-inset-bottom))` or more
  - targets at least 48px high
  - Test on Android (gesture and 3-button navigation) and on an iPhone, installed and in the browser.
- Installed as an app it opens straight to Home, signed in.
- **Notifications are part of the launch** (NEXT-BRIEF §23), on Android and iPhone from day one. The plan is in `FINDINGS-notify.md`, with "call a parent" first.

## 7b. A Core Team space, and nothing the old phone apps do is lost (Martin, 10 Oct 2026)

Martin: *"why isnt there a core team area in the phone app? They will be doing the sunday service plans from the phone app. Look at the current core team phone app!"* The mock-up left Core Team out. That was the reviewing window's mistake, and the shell copied it.

**Core Team gets its own space**, for everyone on Core Team (not gated on §25 "Running things", which is the office's). Four tabs:
- **Plan:** the Sunday Service Planner on the phone, to build and manage the order of service. **Use CoreTeamApp's own phone planner screens** (`spInit`, the service list and service detail) rather than opening the desktop SundayServicePlanner page, which isn't made for a phone. Move or share that code; don't rewrite it, and don't lose anything it does (songs, YouTube and SongSelect buttons, notes, the order).
- **Rota:** the rota planner as CoreTeamApp has it on the phone (assign the team, + for a new service).
- **Meetings:** join video calls and see upcoming online meetings.
- **Team:** the Email Compiler, the **Core Team pin board**, the Core Team charter, and resources.

**And a parity check against every existing phone app**, because this one was missed. Before Stage 2 carries on, list every screen and action in each of these and say where it lives in the new app:
- `CoreTeamApp.html` (Core Team)
- `worshiphubapp.html` (Worship & AV)
- `youthapp2.html` (youth)
- `Performancenotes.html`

Anything with no home in the new app is a gap to fix before launch (NEXT-BRIEF §15: no lost functionality). The old apps stay installed and working until switch-over. **Never** retire them or change their manifest id, start_url or scope.

## 8. Who builds what

- **Main window:** the app shell (spaces, tabs, Home, Me, Running things, the family rule, the phone fixes) and **A-038** (what an Attender sees). It owns the hub and the shell.
- **Events window:** the screens inside spaces that are its own features (Kids Church Today, Children, bookings, Close a room, What's on), and Listen if the main window agrees.
- Each window lists anything it needs from the other as a request.

## 9. Order (Martin decides)

**Decided (Martin, 9 Oct 2026): (b), hold launch until this design is built.** The choice he was given:
- **(a)** launch on the current hub and switch to this design afterwards, or
- **(b)** hold launch until this design is built, since it's what members will see.

Then establish (what each space needs from existing pages, what's missing, and what the family rule needs from the data), stop and report, and build in stages.
