# Payments

This page connects the church's own Stripe and GoCardless accounts to the hub, so people can pay for tickets by card or from their bank, and give regularly by Direct Debit. The money goes straight into the church's accounts.

## Who can use it
- Master admins and the church's money team can open it.
- Anyone else is told "This page is for master admins and the church's money team."

## Turn on card payments (Stripe)
1. Under **Card payments, through your own Stripe account**, open **Set it up, step by step**.
2. Sign in to the church's Stripe dashboard. Make a restricted key named "Church hub", with only the permissions the page lists.
3. Paste it into **Paste the key here** and press **Check and save the key**.
4. The card then shows **Connected**, with the account name and whether it is **live** (real money) or **test** (no real money).

## Turn on bank payments and Direct Debit (GoCardless)
1. Under **Bank payments and Direct Debit, through your own GoCardless account**, open **Set it up, step by step**.
2. Sign in to the church's GoCardless dashboard. Make an access token named "Church hub", with read-write access.
3. Paste it into **Paste the token here** and press **Check and save the token**.
4. It then shows **Connected**.

## Make payments show straight away (optional)
1. Without this, the hub checks with Stripe or GoCardless itself every few minutes, so everything still works.
2. To add it, follow step 3 in the guide: add the web address shown on the page in your Stripe or GoCardless dashboard.
3. Copy the secret they give you, paste it in, and press **Save the signing secret** (Stripe) or **Save the webhook secret** (GoCardless).

## Change or remove an account
1. When connected, open **Replace the key, or add the optional webhook** (or the token, for GoCardless), and paste a new one.
2. To stop, press **Remove card payments** or **Remove bank payments and Direct Debit**, and say yes.
3. Payments already made are kept. Gifts already running in GoCardless keep running there.

## Regular giving and Gift Aid
1. **Regular giving** shows how many gifts are running, about how much a month, and how many gifts have Gift Aid.
2. Press **Download the Gift Aid gifts (CSV)** for the name, house, postcode, date and amount of each gift with Gift Aid. This is what the claim to HMRC needs.

## Choose the money team
1. **Who can set this up** names the money team.
2. A master admin can type a new team name and press **Save**.
3. If Church settings says who does the finance job, it is changed there instead.

## Good to know
- The hub never sees card numbers or bank details, and takes nothing. Stripe and GoCardless charge their normal fees.
- A key or secret goes to the hub's server once and is never shown again, to anyone.
- Which tickets can be paid by card or bank is chosen in Events, under "How people can pay".
- Refunds are made in the Stripe or GoCardless dashboard. The hub shows them by itself.

## Who to ask
- The church's treasurer or money team.
- A master admin, if you cannot open the page.
