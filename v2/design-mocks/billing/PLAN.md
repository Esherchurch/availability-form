# Billing: Church HQ's subscription, and each church's accounts link (plan only, for review)

*Main window, 21 Oct 2026. For the reviewing window and Martin.*

Two separate things, kept apart on purpose:

1. **Church HQ's own subscription:** what a church pays Church HQ. This is Church HQ's money, in Church HQ's own Stripe account, synced to Church HQ's QuickBooks.
2. **A church's accounts link:** the church's own money (room hire, tickets, giving) sent to the church's own books: Calla Accounts, QuickBooks Online, Xero, or a spreadsheet.

The two never share an account or a key. A church's giving never passes through Church HQ's Stripe.

---

## 1. Church HQ's subscription: NOT DECIDED (will be GoCardless)

*Martin, 22 Oct 2026, through the reviewing window:* not built and not planned here. Martin hasn't looked at Church HQ's subscriptions yet, and they will be **GoCardless, not Stripe**.

- No Stripe Billing.
- No `HQ_STRIPE_*` secrets.
- Nothing in the directory about it.

This section is replaced when Martin decides.

---

## 2. A church's accounts link (hire, tickets, giving)

The hub already has the start of this:
- `egbc-accounts.js` and `accountsQueue`, with a "none / Calla" choice;
- invoices numbered by the hub (`egbc-events-money.js`).

The plan is **one adapter per accounting system** behind the same queue.

| Link | How a church connects | What goes across | Review needed |
|---|---|---|---|
| **Spreadsheet export** (first, for everyone) | Nothing: a button | A CSV per month or range, one line per hire charge, ticket, refund and giving gift, with date, who, account code, amount, VAT, Gift Aid flag and reference | None |
| **Calla Accounts** | A key from Calla Accounts, pasted by the church's office | The same lines, through Calla's API, written against Calla's own code (its own brief, as egbc-accounts.js says) | None (our own product) |
| **QuickBooks Online** | "Connect QuickBooks": OAuth 2.0 with the church's own login | Sales receipts or invoices for hire and tickets; deposits for giving; mapped to the church's accounts on a mapping screen | **Intuit production keys** (section 3) |
| **Xero** | "Connect Xero": OAuth 2.0 | Invoices or bank transactions as above, mapped to the church's account codes | **Xero app terms** (section 3) |

**Common to all four:**
- **One mapping screen per church:** which account code for room hire, tickets, each giving fund, Stripe/GoCardless fees.
- **The queue:** each line is sent once (an idempotency key per line), retried, and shown as "sent / waiting / failed" on the money page.
- **Names and amounts only.** No safeguarding or care data ever goes to an accounts system.
- **Gift Aid declarations stay in the hub.** Only the gift and its Gift Aid flag go across.

**Order:** spreadsheet → Calla Accounts → QuickBooks → Xero. The last two wait on the app reviews below.

---

## 3. What Intuit and Xero need from Martin

*These terms change. Check each provider's current developer terms before applying; this is what they have asked for so far.*

### Intuit (QuickBooks Online), for churches to connect their own books

1. **An Intuit Developer account**, in Church HQ's name.
2. **An app** with the Accounting scope (`com.intuit.quickbooks.accounting`). Development keys work at once against sandbox companies.
3. **Production keys.** These are what let real churches connect. Intuit asks Church HQ to complete its production questionnaire / app assessment:
   - **About Church HQ:**
     - company details;
     - a support contact.
   - **Links Intuit checks:**
     - a **privacy policy URL** and **end-user licence agreement URL** (pages on churchhq.co.uk);
     - the app's **host domain**, **launch** and **disconnect** URLs;
     - the **OAuth redirect URIs**.
   - **The app's listing:** a logo and description.
   - **A security and data questionnaire:**
     - where data is stored (Google Cloud, London region);
     - encryption in transit and at rest;
     - who has access;
     - how tokens are kept (Secret Manager or encrypted Firestore, never in a page);
     - the incident process.
4. **Optional, later:** a listing on the QuickBooks App Store. That's a separate, longer review with a demo.

### Xero, for churches to connect their own organisation

1. **A Xero Developer account and an app** (OAuth 2.0, the accounting scopes needed).
2. **Connection limits:** an app not in Xero's partner programme can connect only a limited number of organisations. Xero has also changed its developer pricing recently.
   - **Martin must check the current terms** for how many churches an uncertified app may connect, and what certification as a **Xero App Partner** requires and costs.
   - So far certification has asked for a security self-assessment, an app listing, a demo, and privacy and terms pages.
3. **The same pages as Intuit:** privacy policy, terms, support contact, logo, redirect URIs.

### Martin's to-do list for both

- Privacy policy and terms pages on churchhq.co.uk. **Needed for both reviews.**
- A support email address for Church HQ.
- Church HQ's logo.
- Answers to the security questionnaire. I can draft them from how the hub is built, for Martin to check.

---

## Decided (Martin, 22 Oct 2026)

- **Build part 2 only:** each church's own money (room bookings, tickets, giving), through the church's own Stripe, into the church's own books.
- **Order:** spreadsheet → Calla → QuickBooks → Xero.
- **When:** after the multi-church steps 1–2.
- **Part 1** (Church HQ's subscription): not decided; it will be GoCardless.
