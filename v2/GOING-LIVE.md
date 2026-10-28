# Going live: the one list

Everything that waits for the hub to go live, in the order it has to
happen, with who does it and how to tell it worked. Where a window keeps
its own detail, this links to it rather than copying it:

- the events window: [SWITCHOVER-events.md](SWITCHOVER-events.md)
- the launch checklist as collected: [NEXT-BRIEF.md §26](NEXT-BRIEF.md)
- Comms: [FINDINGS-comms.md](FINDINGS-comms.md)
- Church HQ (main window): [FINDINGS-churchhq.md](FINDINGS-churchhq.md)

**Never before the day:** the Firestore and Storage rules. The original
site still reads and writes the same database without signing in.

---

## A. Before the day (any time beforehand, in this order)

1. **ChurchShow signs in by pairing** (NEXT-BRIEF §26 item 8).
   - **Why first:** ChurchShow used to read `services`, `songs`, `addressBook` and `events` through the REST API with the web key and no sign-in. Under the locked rules every one of those reads is refused, and every church computer goes blank.
   - **Built:** the hub's side (`churchShowPairingCode`, `churchShowRedeem` issuing the device's sign-in; read-only rules for a device). ChurchShow's side is built to the same contract (tests/check-churchshow-pairing.mjs).
   - **Who:** Martin at the projection PC (Church settings › ChurchShow, then the code on the PC). The ChurchShow window confirms its reads all go through that sign-in.
   - **Check:** before the day, on the emulator with the locked rules: `node tests/check-churchshow-pairing.mjs` (see its header) is all green. On the day, after the rules (C-11): the PC shows the next service's plan and songs.
2. **Public pages send email through the hub's server** (§26 item 14).
   - **Who:** the events window and Comms, each for their own pages (the public-mail functions are built).
   - **Check:** on the emulator with sendEmail's open path switched off, each public form's email still arrives (newhere, event sign-ups, room-hire requests and receipts, form emails to parents).
3. **Storage moves to the UK** (the bucket is in US-CENTRAL1; the spec sheet promises London).
   - **Who:** the main window writes the plan and the copy script; Martin makes the London (europe-west2) bucket in the console and runs it. It needs:
     - a new bucket, with the rules deployed to it on the day;
     - every file copied;
     - `storageBucket` changed in egbc-auth.js and the functions;
     - every stored download link in Firestore rewritten to the new bucket.
   - **Before the rules,** so the rules go on the bucket that stays.
   - **Check:** a new upload lands in the London bucket; a sample of old pictures, sermon audio and kb videos still open; nothing in Firestore still names the old bucket (the script's dry run says 0).
4. **Real-device proofs** (§26 items 6, 7): notifications on an Android phone and an iPhone added to the home screen, and Share to WhatsApp from each.
   - Also the **installed app's Google sign-in** (26 Oct 2026, Google Identity Services) on Android and an iPhone home-screen app.
   - **Who:** Martin.
   - **Check:** each arrives, or opens, on the phone.
5. **Teams and groups in place** (§26 item 18: `tools/seed-teams.mjs`; item 5: the "Church office" group has Val and Ryan; item 10: Martin confirms the list).
   - Then: **who does each job** (Teams & groups, H-9); **the core teams** (Worship Core Team; Kids & Youth Core Team with its people, H-15); **Permissions** (Church settings › Permissions, H-14).
   - **Who:** Martin and the office.
   - **Check:** signed in as Val, the Menu shows the four Running things tabs. A Kids & Youth Core Team member sees Kids Church's pages and not Worship's.
6. **Comms' preparations** ([FINDINGS-comms.md](FINDINGS-comms.md) C-1, C-14): the Resend key in Secret Manager; the Mailchimp import's dry run; Canva tried on the emulator.
   - **Who:** Martin with Comms.
   - **Check:** the key box says "saved" from the server. The dry run lists the subscribers it would import.

## B. The evening before

7. **The original site's planners stop.** The last Sunday plan is sent from the old site, and the team is told to use the hub from now on.
   - **Who:** Martin.
   - **Check:** nobody has the old planners open (the plan audience backfill, C-8, wipes nothing after this).

## C. The day, in this order

8. **Backfill each Sunday plan's audience** (§26 item 13; `tools/backfill-plan-audience.mjs`).
   - **After** the last plan from the old site; **before** the rules.
   - **Who:** Martin.
   - **Check:** `--live --write` ends "N written", and running it again says "0 written".
9. **The hub's functions first** (§26 items 1, 2): `--only functions:hub`, and the IAM role in SERVER-DEPLOY.md if not done.
   - **Who:** Martin or the reviewing window (never the main window).
   - **Check:** the console lists the hub's functions in europe-west2. "Send me a test" reaches a phone.
10. **The rules, both, together** (§26 item 3; [SWITCHOVER-events.md Part 1](SWITCHOVER-events.md)): `firestore.build.rules` and `storage.rules`, with the indexes.
    - **Who:** Martin.
    - **Just before deploying, one change in v2:** **`kb/` uploads only for those the Permissions screen allows** (H-13, H-14; Martin: "only admins and core team"). Today anyone can upload to `kb/` with no sign-in, because the original site's EGBC-Troubleshoot-AV.html does. Every other church already has the Permissions answer (storage.churches.rules).
      - In `storage.rules`, `function kbMayUpload() { return true; }` becomes `function kbMayUpload() { return request.auth != null && 'kbUpload' in request.auth.token.get('perms', {}).get('egbc', []); }`.
      - Set `KB_EGBC` in tools/rules-build.mjs to the same new line, then run `node tools/rules-build.mjs`.
      - The claim is already on everyone's sign-in (functions/permissions.js).
      - Nothing else in the rules changes on the day.
    - **At the same moment, each event's leaders by member id** (F-287): `node tools/migrate-leader-info.mjs`, check its list, then `--write` (the reviewing window). Not before the rules: the rules live today would refuse later saves of a migrated record.
    - **Check:**
      - signed out, a read of `addressBook` is refused;
      - signed in as a member, the hub loads with no "permission" errors;
      - an admin who has never signed in can sign in (F-011);
      - a kb/ upload from someone not allowed is refused;
      - the migration's second run lists nothing.
11. **ChurchShow, on the locked rules** (A-1).
    - **Who:** Martin at the projection PC.
    - **Check:** it shows the next service's plan and songs without a new pairing.
12. **Open the private forms** (§26 item 16): Church settings › Private forms › "Open the private forms".
    - **Straight after the rules,** never before.
    - **Who:** a master admin.
    - **Check:** a test prayer request saves, and the pastoral team is told.
    - **Then every other church counts as live too:** `node ../tools/hq-lock-churches.mjs` from v2/functions, check its list, then `--apply`. It sets each church's `churchSettings/launch.rulesLocked`, which its Present slides and private forms wait for. A church made after today gets it from `hq-create-church.mjs`.
      - **Who:** Martin or the reviewing window.
      - **Check:** the second run says "0 to do".
13. **The events window's straight-after steps** ([SWITCHOVER-events.md Part 2](SWITCHOVER-events.md)): each existing form gets its Team; Accounts is saved once.
    - **Who:** Martin.
    - **Check:** as listed there.
14. **The ChurchSuite import, private part** (§26 item 15; F-177): `--part private`.
    - **Only after the rules.**
    - **Who:** Martin.
    - **Check:** the room hires, members-only events, small groups and PAT tests appear, signed in. Signed out, none of them do.
15. **Email lock: sendEmail's open path removed** (§26 item 4). This is Calla's function.
    - **After A-2:** every public sender goes through the hub.
    - **Who:** Martin or the reviewing window deploys it, never the main window.
    - **Check:** the old open path is refused. A rota email from the hub's planner still arrives, and so does an event sign-up confirmation.
16. **Online payments on** (§26 item 17): `PAYMENTS_LIVE = true` in functions/payments-gate.js, then deploy functions:hub.
    - **Who:** Martin.
    - **Check:** a £1 test payment completes and shows in Payments.
17. **Real names in place of the test data.**
    - Each site's **safeguarding lead and deputy** (Safeguarding settings, [SWITCHOVER-events.md 3.3](SWITCHOVER-events.md)).
    - The real **roles** and admin areas in the address book.
    - **No test people left:** a search of the address book for "Synthetic", "test" and "example.invalid" finds nothing.
    - **Who:** Martin with the safeguarding lead.
    - **Check:** Safeguarding settings names real people on every site; the search is empty.
18. **The rest of the events window's set-up** ([SWITCHOVER-events.md Part 3](SWITCHOVER-events.md), in its own order): church details, sites and rooms, safeguarding, Kids Church, small groups, sermons, Watch, What's on, prayer, "I'm new here", Gift Aid, room hire.
    - **Who:** as named there.
    - **Includes the building checks' templates (version 4, F-296):** `node tools/seed-compliance.mjs --templates --live --write` ([SWITCHOVER-events.md](SWITCHOVER-events.md) 3.10), then Health and safety settings set up by the office.
19. **The Sundays from ChurchSuite onto the rota** (§26 item 19), if not done already.
    - **Who:** Martin.
    - **Check:** What's on shows the Sundays to 27 Dec.
20. **Comms' day-one steps** ([FINDINGS-comms.md](FINDINGS-comms.md) C-1, C-14): the e-news starts alongside Mailchimp; the Mailchimp import's live run; Canva connected.
    - **Who:** Martin with Comms.
    - **Check:** a test e-news reaches a test subscriber, and the import's count matches its dry run.

## D. After the day

21. **Installed apps open the new app** (§26 item 12), once the parity table is green.
    - **Who:** Martin decides; the main window switches it on.
    - **Check:** the old installed Core Team and Worship Hub apps open the hub app.
22. **Apps and downloads (`hub_resources`)**, once the original site has retired. The original page edits the list with a password written into its own page. v2's page lists the hub app and the web links only, and changes nothing. With the rules live, only master admins can change the list.
    - **Who:** the main window gives v2's page an editor for master admins and takes out the old app entries.
    - **Check:** a master admin adds a link; a member can't.
23. **Payments' and e-news' "a few weeks alongside"** end, as Comms' and the events window's lists say.

## Known gaps, to accept or fix before the day

- **Meetings: fixed (the meetings split, FINDINGS-churchhq).** A meeting's title, notes and organiser are in `meetings/{id}`, which only the people invited read. Two steps:
  - **Deploy** `meetingSplit` and `meetingSplitChurch` any time; from then on nothing private stays on a meeting's rota event.
  - **Then run** `node ../tools/split-meetings.mjs` (dry run) and `--apply` from v2/functions, for the meetings already there. **Who:** the reviewer or Martin (a live write).
- **Before the day, deploy `meetingOwnRoom` and `meetingOwnRoomChurch`** (H-17), so two meetings at once never share a room.
  - **Who:** the reviewer or Martin.
- **An insurance answer of "£5,000,000: " with nothing after it** passes the database. The rules can't test an answer's shape cheaply. The page refuses it, but a direct write wouldn't be (FINDINGS-events F-282).
  - **Who decides:** Martin, with the events window. Accept it (the page is the only writer), or have the server check it on save.
- **Original-site pages after the rules:** the original site connects without signing in, so under the locked rules its pages stop working. That's intended: going live is when the team moves to the hub (NEXT-BRIEF launch dependency).
