# Proxy votes at a members' meeting: short plan (main window, 21 Oct 2026)

*For the reviewing window and Martin.*

## Martin's rules

- A member can appoint another member to vote for them, for one meeting.
- The chair sees who is voting for whom ("Ann is voting for Bob").
- Each member can appoint **one** proxy.
- A secret vote stays secret.
- The hub records who holds which proxy.

## How it works

### For the member who can't come
church-meeting.html shows a card: **"Can't be there? Ask someone to vote for you."**
- Pick a church member, then **Appoint**. The card then says "Ann Smith will vote for you at this meeting", with a **Cancel** button.
- Appointing or cancelling is allowed only **until the first vote of that meeting opens**. After that the proxy is fixed.
- While a proxy is appointed, you can't vote yourself in that meeting. The page says "You asked Ann to vote for you".

### For the person holding a proxy
- Each open vote shows their own choices as now, plus a second set headed **"Voting for Bob Jones"**.
- That's one more vote, cast once, with no changing it, the same as a vote of your own.

### For the chair (the running panel)
- **"Proxies (2)"** lists each one: "Ann Smith is voting for Bob Jones".
- Each open vote's count shows how many ballots were cast by proxy.

### Limits

These are easy to change on Martin's word:
- **One proxy per member**, enforced by storage: one record per member who gives their vote.
- **A member can hold at most one proxy.** Most church constitutions cap this; one is the safe default.
- **The holder must be a church member**, adult and not archived, and not the person giving the vote.
- **Someone who has given their own vote away can't hold one.**

## Secrecy, and the record

- **Who holds which proxy** is kept in `churchMeetings/{meeting}/proxies/{givingMemberId}`:
  - `{ holderId, holderName, giverName, at, by }`
  - **Who can read it:** the chair's people (Church office, Elders, master admins), the giver and the holder.
  - **Nobody writes it from a page**: only the hub's `proxyAppoint` and `proxyCancel`.
- **A proxy ballot** is the giver's ballot (`ballots/{givingMemberId}`), with `castBy` set to the holder's name.
- **On a secret vote**, a proxy ballot holds no choice, exactly like any other. The choice goes only into the count, so a secret vote stays secret for proxies too.
- **On an open vote**, the ballot keeps the choice as now, and the results say "cast by Ann for Bob".

## Built as

- **`functions/meetings.js`:**
  - `proxyAppoint` and `proxyCancel` (new);
  - `castVote` gains `for: <givingMemberId>`, checked in the same transaction against the proxy record.
- **`firestore.rules`:** `proxies/{giverId}`, read as above, never written by a page. The holder may read the giver's ballot, to see "voted".
- **church-meeting.html:** the member card, the holder's second set of buttons, and the chair's list.
- **Checks:**
  - check-members-meeting gains the proxy cases, with a break: a proxy ballot carrying the choice on a secret vote → red;
  - the rules tests gain a page writing a proxy (denied) and the reads above.
