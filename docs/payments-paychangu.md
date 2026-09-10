# Taking payments with PayChangu

Two kinds of money move through the same gateway, and they are not symmetrical.

| | School fees | Subscription |
|---|---|---|
| Who pays | A family, or the bursar collecting on their behalf | The school, to Acalink |
| Amount | Chosen by the payer — part-payment is normal | Recomputed server-side from the school's own roll |
| Where it lands | `payments`, alongside the bursar's own entries | `subscription_payments`, and flips `schools.subscription_status` |
| Started from | Bursar → Payments → **Collect Online** | Admin or Director → Billing → **Pay now** |

The subscription amount is never taken from the browser. It is recalculated in
`api/payments/initiate.js` using `src/services/pricing.js` — the same module the
Billing page renders from — because settling it marks the school as a paying
customer, and a client-set price would let a school subscribe for one kwacha.

## The rule the whole design rests on

**The browser never tells us what was paid.**

A checkout is opened server-side for an amount we computed. A payment is only
recorded after `verifyTransaction()` has asked PayChangu, over our own
authenticated connection, what actually happened. The webhook body is a *hint
that something changed*, never the fact itself — so a forged webhook and a
genuine one have identical effect: we go and ask.

This closes the hole documented at the foot of `firestore.rules`, where
parent-app payments were self-reported and a family could type any figure and
watch their balance drop. Gateway payments carry `source: 'paychangu'` and
`status: 'verified'`, written by the Admin SDK where no client can reach.

## The pieces

```
api/_lib/paychangu.js      the gateway: create checkout, verify, check signature
api/_lib/settle.js         verified transaction → the record it stands for (idempotent)
api/_lib/firebaseAdmin.js  Admin SDK (Auth + Firestore) for serverless functions
api/payments/initiate.js   POST — opens a checkout, returns checkout_url
api/payments/webhook.js    POST — PayChangu's callback; triggers settlement
api/payments/status.js     GET  — the browser polls; settles if the webhook is late
src/services/paychangu.js  the browser half: start, poll, open checkout
src/components/payments/PayChanguCheckout.jsx   the dialog both surfaces use
src/pages/PayReturn.jsx    /pay/return — where the payer's browser comes back
```

### Why both a webhook and a poll

Either can arrive first, and either can be missing. A webhook that never lands
— a cold start that timed out, a callback URL typo — would otherwise leave a
family who has paid staring at an unpaid balance. Both run the same
`settleTransaction()`, which claims the settlement inside a Firestore
transaction: whoever reads `status !== 'success'` and flips it wins, the other
finds it already done. A same-process lock would not do, because the two
usually land on different serverless instances.

### Why the signature check is advisory

Vercel's Node runtime parses the request body before a handler sees it, so the
exact bytes PayChangu signed are not always recoverable, and an HMAC over a
re-serialised object will not match. Rejecting genuine webhooks on that
technicality would be worse than useless — so the signature is checked when the
raw body *is* available and logged either way, while the money question is
settled by the API call regardless. A signature that never validates usually
means `PAYCHANGU_WEBHOOK_SECRET` is wrong; watch the function logs for
`webhook signature did not validate`.

## Environment variables

Set these in **Vercel → Project → Settings → Environment Variables**, ticked for
Production (and Preview if you test there). None carry a `VITE_` prefix, so none
of them reach the browser bundle — `vite.config.js` allowlists only `VITE_`,
`EMAILJS_` and `APP_URL`.

| Variable | Where it comes from |
|---|---|
| `PAYCHANGU_SECRET_KEY` | PayChangu dashboard → Settings → API Keys (`sec-live-…`) |
| `PAYCHANGU_WEBHOOK_SECRET` | Same screen — the webhook signing secret |
| `FIREBASE_ADMIN_PROJECT_ID` | Firebase service account |
| `FIREBASE_ADMIN_CLIENT_EMAIL` | Firebase service account |
| `FIREBASE_ADMIN_PRIVATE_KEY` | Firebase service account — the full PEM, newlines as `\n` |
| `APP_URL` | `https://ssp-pep.vercel.app` — used to build the callback and return URLs |

Optional: `PAYCHANGU_API_BASE` (defaults to `https://api.paychangu.com`).

In the PayChangu dashboard, set the webhook URL to:

```
https://ssp-pep.vercel.app/api/payments/webhook
```

`callback_url` and `return_url` are also sent on every checkout, built from
`APP_URL`, so the dashboard setting is a backstop rather than the only path.

## Testing it end to end

1. Use a `sec-test-…` key and PayChangu's sandbox first.
2. Bursar → Payments → **Collect Online** → pick a student → enter an amount.
3. The checkout opens in a new tab; the dialog stays open and polls.
4. On success: a row appears in `payments` with `source: 'paychangu'`,
   `status: 'verified'` and a `gatewayTxRef`, and the student's balance moves.
5. Check `payment_transactions/{txRef}` — `status` should read `success` with a
   `settledAt` and a `paymentId`.

If a transaction sticks at `pending`, the gateway has not confirmed it. Open
`/pay/return?tx_ref=…` or reopen the dialog: the status endpoint re-verifies on
every poll, so a late confirmation settles itself without anyone intervening.

## The parent app

The Flutter app (`acalink/`) now uses the same endpoints, and the change there
was as much about honesty as about plumbing.

**What it used to do.** `FeesService.submitPayment` wrote straight to
`payments`, minted an `RCP-…` receipt number locally, and the sheet showed
"Payment Received" with a tick. The balance dropped. Nothing had checked that
any money moved — a parent could type a figure and watch what they owed fall.

**What it does now.** The sheet opens on a choice, because there are two
different acts underneath:

| | Pay now | I have already paid |
|---|---|---|
| Path | `/api/payments/initiate` → PayChangu in the device browser → poll `/api/payments/status` | `FeesService.reportOfflinePayment` |
| Writes | Nothing from the app; the webhook writes the receipt server-side | `source: 'parent_app'`, `status: 'unverified'`, **no receipt number** |
| Balance | Falls, once confirmed | Unchanged |
| Screen says | "Payment received · Receipt RCP-…" | "Sent to the school" |

Reporting stayed, because a family who paid at a bank counter genuinely needs
to tell the school. What went was the pretence that it was a receipt.

`fetchStudentFees` now sums only confirmed rows into the balance and returns
unconfirmed ones as `awaitingConfirmation`, shown as its own line on the balance
card and an hourglass in the history list. So a reported payment is visible —
hiding it would look like the report was lost — without reducing what is owed.

### Files

```
acalink/lib/core/api.dart                   base URL + Firebase ID token on every call
acalink/lib/services/paychangu_service.dart start checkout, open it, watch it
acalink/lib/services/fees_service.dart      verified vs reported; reportOfflinePayment
acalink/lib/widgets/payment_sheet.dart      the two paths
acalink/lib/screens/fees_screen.dart        awaiting-confirmation surfacing
```

The checkout opens in the device's own browser (`LaunchMode.externalApplication`),
not a webview: the payer should see the address bar and padlock on the page
where they approve money leaving their account, and an Airtel or Mpamba deep
link can be handled by the app that owns it. No PIN or card number is ever typed
into Acalink.

### Pointing the app at a different backend

The base URL is a compile-time constant defaulting to
`https://ssp-pep.vercel.app`:

```bash
flutter run --dart-define=ACALINK_API=http://10.0.2.2:3000
```

(`10.0.2.2` is how the Android emulator reaches the host; a real handset needs
the machine's LAN address.)

Pointing it at a **plain http** address also needs a network-security config —
Android blocks cleartext by default. That is a debug-only concern; production is
https and needs nothing.

`AndroidManifest.xml` gained two entries for this feature: an explicit
`INTERNET` permission, and a `<queries>` intent for `https` VIEW. Without the
second, Android 11+ hides every browser from `url_launcher` and the checkout
opens onto nothing — a failure that appears only on API 30 and above, which is
most handsets.

### Still open

Guardian sessions are anonymous, so a payment is bound to the student it names
rather than to a verified family — the KNOWN GAP at the foot of
`firestore.rules`. The exposure is narrow and one-way: the worst an unrelated
session can do is pay its own money into a child's fee account. It closes when
parents move to Firebase Phone Auth and the number is in the token.
