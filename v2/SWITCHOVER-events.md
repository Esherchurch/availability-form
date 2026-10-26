# Switch-over: the events window's parts

For Martin, Val, the church office and the safeguarding lead.
Step Q copies these into the launch checklist (NEXT-BRIEF §26).

**What this covers:** events and What's on, room bookings and hire, Kids
Church, safeguarding, small groups, forms, sermons, maintenance and
notifications.

**How to read it:**
- Do the parts **in order**. Some things need an earlier one done first.
- Each line says **who**, **which page**, and **what to do**.
- **Default** means what happens if nobody changes it.

---

## Part 1. With the rules deploy (Martin)

Nothing in this part is new data. It's the order things go live in.

1. **The hub functions go first**, before the rules (§26 item 1). Mine are
   in there: the notification senders (N-4) and the sermon feed reader
   (`sermonFeedSync`, F-139).
2. **Both rules files go together:** `firestore.rules` **and**
   `storage.rules`. Storage holds the photos guests send, maintenance
   photos and sermon audio.
3. **Indexes:** nothing new is needed for my pages (F-149). The one they
   need, for What's on, has been live since 8 October.
4. **Each event's leaders kept by member id** (F-287), at the same moment
   as the Firestore rules (the reviewing window):
   `node tools/migrate-leader-info.mjs` lists what it would change; check
   the list, then run it again with `--write`. Anything it lists "for a
   person" (the same member named twice) is put right by hand on the
   event's safeguarding page.

## Part 2. Straight after the deploy (Martin, about 10 minutes)

These two change who can see things the moment the rules are live.

| What | Page | Why it can't wait |
|---|---|---|
| Give **each existing form** a Team | `forms-admin.html`: open each form, pick its Team, Save | Until then, only master admins and the safeguarding lead can use those forms (F-092) |
| Press **Save once** on Accounts | Room bookings → **Accounts** → Save | Until then, a bookings admin who isn't an admin can't read the Accounts setting. Their invoices still carry the bank details from Church details, but not any wording typed in Accounts (F-108, F-161) |

**Also worth one look:** sign in as an admin who has never signed in
before. F-011 says a first sign-in might be refused under the new rules.

---

## Part 3. Setting things up, in this order

### 3.1 Church details (office or Martin)
**Page:** `church-settings.html`
- **Church name**, **Enquiry email** and **Logo**.
- **The enquiry email is office@esherchurch.org** (Martin, F-058). It must
  be typed here, because no page has it built in.
- **Church settings > enquiry email -> the church office address.** Until
  switch-over it is Martin's own address, on purpose, for testing (Martin,
  20 Oct). Change it to office@esherchurch.org on the day.
- **If it's left blank:**
  - public room requests email nobody
  - maintenance emails have nowhere to fall back to
  - emails go out with no reply address

### 3.2 The site and its rooms (office or Martin)
**Page:** `places-admin.html`
1. **Sites tab:** add the site, or press **"Seed the starting rooms"**.
   - It makes the site, Online, and seven rooms with starting sizes: Main
     Sanctuary 200, Creche Room 15, Upper Main Room 1, 2 and 3 at 30 each,
     Pastors Office 6, Garden 80.
   - The names are only a start, so change them freely.
   - **Nothing else works without a site.** Kids Church says "Not set up
     yet" until there is one.
2. **Each room's profile:** photos, how many it holds, the fire-safety
   maximum, facilities and house rules.
3. **"Who approves" tab, for each site:**
   - **Safeguarding lead** and **deputy.** **This one matters:** without a
     lead, a safeguarding concern can't be sent at all (F-048).
   - **Bookings admins.** They get the app's Bookings tab automatically.
   - Default: "Nobody set": only Core Team can approve.
4. **Bookings tab, for each site:**
   - **Members' bookings:** "confirmed straight away" (default) or "wait
     for the office".
   - **Where booking emails go:** blank means the enquiry email. Use an
     office address, not a person's own.
   - **Sunday services that keep rooms busy:** "Add a service" starts at
     09:30 to 12:30. **Default: none,** so rooms show free on Sunday morning
     until this is set.
   - **The day's setup sheet by email:** off by default.

### 3.3 Safeguarding (the safeguarding lead)
**Page:** `safeguarding-settings.html`

| Setting | Now | To do |
|---|---|---|
| **How long a DBS check counts** | **3 years** | **The safeguarding lead sets it.** If they choose annual, change it to 1. It's a setting, not code. |
| **How long training counts** | **3 years** | The same |
| **Leaders per child** | 1 to 5, and 1 to 4 for under-8s | The lead confirms (§26 item 9) |
| Every leader must have checks | Off | The lead decides |
| How long each form's answers last, and are kept | A year, kept 12 months | The lead confirms |

**Two more for the lead** (§26 item 9):
- **Who reads each kind of "I'm worried about someone" concern.**
- **How long concerns and incidents are kept.** Until the lead decides,
  nothing is deleted automatically (F-047).

**Then, before anyone is named on a children's group or event:**
- **Record each leader's DBS check and training** on the Safeguarding page.
- The rules refuse an uncleared leader on an under-18s group, or on an event
  ticked "Works with under-18s". The way round is an exception, recorded
  with a reason by a master admin or the safeguarding lead.
- **Doing the checks first means no refusals on the day.**

**Event admins:** on `events-admin.html`, tick **"Works with under-18s"** on
Kids Film Club, Puppet practice, youth events, and anything else with
children. The teams tick (Kids Church, Creche, Youth Worship, Lazers, ReNu)
is the main window's.

**The form wording:** the five safeguarding form templates still have
placeholder words (F-036). The lead supplies the real ones.

### 3.4 Kids Church (master admin, then the Kids Church leads)
**Page:** `kids-admin.html`. Needs the site from 3.2 first.
1. **Settings tab:**
   - **Choose the children's teams.** Their admins become the leads.
   - Press **"Set up the registration form"**.
2. **Settings tab:** the **three terms** for the year. Until they're set, the
   registers guess September to December, January to March and April to
   August.
3. **Groups tab:** each group with its name, school years, room, day, times
   and **leaders**.
   - **Leaders must have signed in to the hub once** before they can be
     picked.
4. **Registration tab:** send the form to each family. A completed form
   joins the register with "Add to the register".
   - **There is no import from ChurchSuite.** Families come in this way, or
     through "First time here" at the door.

**In switch-over week:** pair ChurchShow on the projection PC (§26 item 8),
so "Show on screen" can call a parent.

### 3.5 Small groups (master admin, then groups admins)
**Page:** `groups-admin.html`
1. **Settings:** tick which teams' admins look after groups. Until then, it
   says "Not set up yet".
2. **The groups:** each group, its leaders, "Who can come", and whether it
   is for under-18s.
   - An under-18s group needs leaders with in-date checks (3.3).

### 3.6 Maintenance (main window, then the office)
- **A "Maintenance" team** must exist in the teams list (§26 item 10).
  - Put its people on it in the address book.
- **Until then:**
  - only admins and the office can mark jobs done
  - new-job emails go to the enquiry email instead (F-129)

### 3.7 Sermons (Martin, with Val)
**Page:** `sermons-admin.html`
1. **The podcast's RSS address**, from Val: Spotify for Creators →
   Settings.
   - **Until it's in, no sermons come in.**
   - Val carries on uploading to Spotify as now. The hub reads the show, and
     nothing on Spotify changes.
2. **"Who can look after sermons":** add Val, and anyone else. Master admins
   always can.
   - This list becomes a "Sermons" tick in the address book once the main
     window adds it.
3. **Optional:** add each sermon's series and Bible passage.
4. **The past sermons missing from Val's show (Martin, 11 Oct: some are
   missing, so the ChurchSuite downloads are needed).** This is done
   once the RSS address is in and the feed has come in.
   1. **The events window compares** what the feed holds with Martin's
      ChurchSuite downloads.
      - **They're matched on playing time** (to within a few seconds),
        because the file names and the titles inside the files can't be
        trusted.
      - File size isn't used either, because Spotify re-saves the audio.
   2. **Martin gets the list first:** the ChurchSuite sermons with no match
      on the show, and any that are unsure (two of the same length).
      **Nothing is uploaded until Martin has seen it.**
   3. **Only the missing ones are uploaded,** as backup audio on
      `sermons-admin.html`, each with its **title, speaker, date and
      series**. Martin, or Val, confirms these from the list.
   4. **Check:** each one plays in the app's Listen, and none appears twice
      beside a feed episode.

### 3.7b Watch: the live service and the church's videos (Martin, with Val)
**Page:** `watch-admin.html` (Watch), for the same people as Sermons.
1. **The channel's id:** YouTube Studio → Settings → Channel → Advanced settings. It starts UC. **EGBC: UCf7lMnb24HfNJKGpMeYdQXQ.** Until it's in, no channel videos come in.
2. **The live card, every week:** EGBC's is set already as the default: it goes at **4pm on Sunday**, then **disappears**. Change it here if wanted.
3. **Each week:** paste the live link (unlisted on YouTube). It shows to people signed in only, never on a public page.
4. **Full services for the church:** add any as unlisted links. A private video can't be shared this way.

### 3.7c The public What's on, on the church website (the office, then whoever edits the website)
1. **Check every event marked "Everyone"** on `events-admin.html`: those, and only those, will show on the church website. A church meeting, a refugee group, AA or anything private should be **Not listed** (new events start that way) or members only.
2. **Copy the two codes** from events-admin, under "On the church website": a "coming up" list and a month calendar.
3. **On esherchurch.org/whats_on,** replace the two ChurchSuite iframes with them (in WordPress, a Custom HTML block each). Do this when the hub's events are ready, at the switch from ChurchSuite.

### 3.7d Prayer (Martin)
- **The pastoral team** is the Pastoral group in the address book. Check its people.
- **A prayer team (optional):** on `prayer.html`, a master admin names the church's prayer team (its team or group, as in the address book). Leave it empty for none.

### 3.7e "I'm new here" (Martin)
1. **Who the hellos go to:** on `newhere.html`, signed in as a master admin, add the welcomers (for example the welcome team or the office). Until then only master admins see them.
2. **The email address** they are copied to (empty means the church's enquiry address).
3. **Put the link where visitors are:** the welcome desk (a QR code), the church website, the notice sheet: `newhere.html`.

### 3.7f Gift Aid (Martin, Val, the treasurer)
1. **Who sees the declarations:** the Church office and Finance groups (and master admins). Check their members.
2. **The church's name** on the declaration comes from Church details: it should be the name HMRC knows the church by.
3. **Existing paper declarations:** Val records each on `giftaid.html` ("Record a declaration made on paper"), with the date on the form, keeping the paper.

### 3.8 Room hire and invoices (the office; can come after launch)
**Pages:** `places-admin.html` (Hire prices) and `bookings-admin.html`
(Accounts, Hirers)
- **Kinds of booking:** for example "Private hire". Default: none, so
  members are offered "Church or ministry use".
- **Price cards** per room and kind. VAT is off unless ticked.
- **Terms and conditions** for each kind.
- **Bank details** for "how to pay" on invoices: typed **once**, in Church details (the giving details). Every invoice uses them (F-161). Type in Room bookings → Accounts → "How to pay" **only** to say something different on invoices. Until they are in, an invoice says only when to pay.
- **Hirer records:** the charity rate needs the charity number checked.
- **Kit**, the **catering menu** and **outside venues.**
- **Until prices are set:** the hire page asks people to get in touch about
  prices.
- **On the church website:** links to `hire.html`, and each room's
  `room.html?id=…` and `book.html?room=…` (F-062).

### 3.9 Notifications (everyone; nothing to set up)
- **Each person chooses their own**, on `notifications.html`.
  - Quiet hours: **21:30 to 07:30**.
  - "Call a parent" is **on**.
- **Martin, once the main window's N-4 and N-5 are live:** the real-phone
  test (N-7, §26 item 6). I'll guide it, step by step.

### 3.10 Building compliance and health and safety (the reviewing window or Martin)
- **The building checks' templates** (version 4, with the duties of employing
  people, F-296): `node tools/seed-compliance.mjs --templates` (a dry run),
  then the same with `--live --write`. A template already at this version
  is left alone, so it is safe to run again.
- **Health and safety settings** (`hs-settings.html`, the office): how many
  the church employs, each building's health and safety lead, deputy and
  fire safety lead, and the insurance cover. The buildings' checks follow.

---

## Part 4. Proofs on real devices (§26 items 6 and 7)

- **Notifications on a real Android phone and a real iPhone** (N-7).
- **Share on WhatsApp** from Android, iPhone and the PC: a notice, and an
  event from its own page, with its poster.
- **The Sunday door:** scan a parent's code on a real phone, and print a
  label on the real printer.

## Part 5. Still to decide (with the default if nobody decides)

| Decision | Who | Default |
|---|---|---|
| DBS and training: 3 years or annual | Safeguarding lead | 3 years |
| Leaders per child | Safeguarding lead | 1 to 5, and 1 to 4 for under-8s |
| Who reads each kind of concern; how long they're kept | Safeguarding lead | Kept, nothing deleted |
| The real wording for the five safeguarding forms | Safeguarding lead | Placeholder words |
| Whether "first aid" answers stay private (F-038) | Martin | Private |
| Any team admin can rename or close rooms, or Core Team only? (F-008) | Martin | Any team admin |
| "Site admins" for children's records means master admins (F-087)? | Martin | Master admins only |
| Does the Session Leader get "Show on screen"? (F-101) | Martin | No |
| Which ChurchSuite sermons to upload (3.7, step 4) | Martin, from the list | Nothing uploaded until he has seen it |

## Part 6. What does NOT need doing

- **Events already on the hub stay as they are.**
  - An event with a room saved before rooms could be held (F-075) holds its
    room once it's next saved. Open and save any coming up.
- **No database indexes to add** (F-149).
- **The calendar ids that still say esherchurch.org stay** (Martin, F-068).
- **Kids families, rooms, prices, hirers and small groups aren't imported.**
  They're entered as above.
- **Guest photos that were rejected** stay stored until Martin deletes them
  in the console (F-053). That's upkeep, not switch-over.
