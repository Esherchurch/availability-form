# The members' meeting page, with votes: plan for review

Main window, 21 Oct 2026. Nothing in this plan is built yet. Martin's answers (20 Oct): votes **now**,
members only, one per member, secret or open per vote (the church's choice), results when closed, who
voted kept, how they voted never shown for a secret vote. A meeting uses **our own room (with a host)
or a pasted Zoom link**, the church's choice per meeting; EGBC tries our own.

The mock-ups are in this folder:
- meeting-375.png: a member, with a vote open.
- voted-375.png: after voting, and the results of a secret vote and an open vote.
- chair-1440.png: running the meeting on a computer.

## The page: `church-meeting.html` ("Members' meetings" in the Menu)

- **For members** (the address book's tick) and those who run it. Its switch is `meetings`.
- **It shows** the next meeting (when, where, how to join), its papers (uploaded to the hub), tonight's
  votes, and past meetings.
- **How to join, per meeting:**
  - **Our own room** (EGBC's choice): the CMM room. The chair starts it as host (this round's work) and
    lets people in.
  - **Or a Zoom link and passcode**, shown to members only and never on a public page.
- **Who runs it** (adds papers, opens and closes votes): the Church office, the Elders and master
  admins. (Decision 1 below.)

## Votes

- **One vote per member:** a ballot's id is the member's address book id, so a second is refused by
  the rules and by the server.
- **Cast through the hub** (`castVote`, a callable), never written by a page:
  - **Secret vote:** the server records **that** you voted (who voted is kept, so a person can't vote
    twice and the chair can see the count) and adds your choice to a tally that no page can read. Your
    choice is never written down next to your name, anywhere. Not even the office or a master admin
    can find out how anyone voted, because it isn't stored.
  - **Open vote:** your ballot keeps your choice. Members see who voted which way once it closes.
- **While open:** the chair sees how many have voted, and who. Nobody sees the tally.
- **Closed:** the server writes the results (counts) onto the vote. Everyone with the tick sees them.
  Votes can't be cast after closing; that's enforced on the server.
- **Can a vote be changed once cast?** No (decision 2).
- **Votes go with the meeting.** Someone joining from the call opens the page and votes there (phone or
  computer). The call itself is not involved.

## The data

- `churchMeetings/{id}`: title, date, time, place, `join: { kind: 'room' | 'zoom', room }`, papers
  (Storage, members only), status.
- `churchMeetings/{id}/private/join`: the Zoom link and passcode. Members only.
- `churchMeetings/{id}/votes/{voteId}`: question, choices, `secret`, status (draft / open / closed),
  opened and closed times, the voter count, and the `results` once closed (written by the server).
- `.../votes/{voteId}/ballots/{memberId}`:
  - secret: `{ at }` only;
  - open: `{ at, choice, name }`.
  - No page writes it; the server does, once.
- `.../votes/{voteId}/tally/count`: the running counts. **No page reads it**; the server turns it into
  `results` on close.

## Checks (each with a deliberate break)

- A member votes once; a second vote is refused.
- A non-member is refused.
- A secret vote stores no choice anywhere a page or master admin can read.
- The tally is unreadable before close, and the results are right after.
- An open vote shows names after close.
- Voting after close is refused.
- 375px and 1440px, no sideways scroll.

## Decisions for Martin

1. **Who runs a members' meeting** (papers, votes): the Church office, the Elders and master admins? Or
   name a "chair" per meeting?
2. **Can a member change their vote before it closes?** Recommended: no (simpler, and the count is
   final as it goes).
3. **Proxy votes** (someone voting for an absent member): no, for now?
4. **Is a majority worked out** ("Agreed" when Yes beats No), or are the counts just shown and the
   chair says what was decided? Recommended: just the counts, and the chair types the outcome.
