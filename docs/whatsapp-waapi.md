# Taking payments over WhatsApp

A parent messages the school's WhatsApp number, says they want to pay, and the
bot pushes a PayChangu mobile-money PIN prompt straight to their phone — no
link, nothing to leave the chat for. This is a *different* PayChangu
integration from the hosted checkout in
[`payments-paychangu.md`](./payments-paychangu.md) (the bursar's "Collect
Online" and the parent app both still use that one) — see "Two different
PayChangu integrations" below for why.

## Why there's no "Flow" here

The usual way to do this is Meta's official WhatsApp Business Platform, which
has a "Flows" feature — an in-chat form, submitted as an encrypted payload the
business decrypts and answers. **This integration does not use that.** It
uses [waapi.app](https://waapi.app), an unofficial gateway that pairs a real
WhatsApp number by QR code and exposes plain send/receive HTTP calls. WaAPI
has no concept of Flows, templates, or a 24-hour messaging window — a message
is just a message. So the "payment checkpoint" is a short text conversation
instead of a native form. If this product later moves to Meta's official
platform, `api/_lib/waapi.js` and `api/whatsapp/webhook.js` are the two files
that would be replaced; nothing else in this document's pipeline changes.

## The pieces

```
api/_lib/waapi.js              the gateway: send a message, address a chat, no signing
api/_lib/feeBalance.js         "what does this student owe" — same rule as the bursar's Arrears screen
api/_lib/waSession.js          the bot's one-question-at-a-time conversation state (Firestore)
api/_lib/waFeeCheckout.js      pushes a direct PayChangu mobile-money charge for a WhatsApp-agreed amount
api/_lib/paychangu.js          now also wraps PayChangu's direct-charge endpoints (see below)
api/_lib/settle.js             settles either kind of transaction through one idempotent path
api/whatsapp/webhook.js        POST — every inbound WhatsApp message lands here; also polls a direct charge
api/whatsapp/send-reminders.js POST — the bursar's "send WhatsApp reminders now" button
api/payments/webhook.js        the hosted-checkout pipeline (portal/parent app); untouched by the above
src/services/academicTermCore.js   pure term parsing, shared by browser and serverless code
src/services/feeAllocationCore.js  pure balance allocation, shared the same way
src/services/feeReminderCore.js    pure reminder wording (3 escalation stages), shared the same way
src/services/whatsappReminders.js  browser half of the "Send WhatsApp reminders" button
src/components/fees/ArrearsModule.jsx  where that button lives, next to the existing "Send reminders"
```

## Two different PayChangu integrations

`api/_lib/paychangu.js` now wraps two distinct PayChangu products, because
they're built for different situations:

| | Hosted checkout (`createCheckout`/`verifyTransaction`) | Direct mobile-money charge (`initiateMobileMoneyCharge`/`verifyDirectCharge`) |
|---|---|---|
| Used by | Bursar "Collect Online", parent app | WhatsApp bot only |
| Payer experience | Opens a link in a browser | PIN prompt pushed straight to their phone |
| Needs to know the network? | No — PayChangu's checkout page handles it | Yes — `mobileMoneyOperatorRef()` looks up Airtel/TNM's ref_id first |
| How we learn the result | PayChangu calls `callback_url` (`api/payments/webhook.js`) | **No callback at all** — we have to ask, via `verifyDirectCharge()` |

That last row is why the WhatsApp bot's `pollAndReport()` exists:
`api/payments/webhook.js` will never be invoked for a direct charge, so
`api/whatsapp/webhook.js` polls PayChangu itself for up to ~40 seconds after
initiating one, and a parent can reply **"CHECK"** any time afterward to ask
again — both paths call `settleTransaction()` (`api/_lib/settle.js`), which
picks the right verification endpoint via each transaction's `chargeMethod`
field and settles it exactly once either way.

`feeAllocationCore.js` and `academicTermCore.js` are extractions of logic that
already existed in `src/services/feeClearance.js` and
`src/services/academicTerm.js` — nothing about how a balance is calculated
changed; it was split out so `api/_lib/feeBalance.js` (running in a serverless
function, Admin SDK) can compute it identically to the bursar's own Arrears
screen instead of re-implementing it.

## The transaction fee

Every WhatsApp payment carries the same 4.5% processing surcharge as every
other channel — see "The transaction fee" in `payments-paychangu.md` for the
full breakdown. The confirm step shows the family the fee and total before
anything is charged; the amount credited to the student's balance is always
the fee-free figure they agreed to pay.

## The phone number check

The spec for a Meta Flow calls for comparing a *submitted* phone number
against the student's record. There is no submitted number here — the number
is whichever WhatsApp account the message came from, exactly as WaAPI reports
it (`data.message.from`). That is matched directly against
`students.guardianPhone` (normalised the same way everywhere else in the
product, via `src/services/phone.js`). A payment is only ever opened for a
student whose guardian number equals the sender's, re-checked immediately
before the charge is opened as well as when the conversation starts. Every
attempt — matched or not — is logged to the `wa_payment_attempts` collection.

**Deferred:** a secondary "authorized payer" number per student (e.g. a
parent's number distinct from `guardianPhone`) is not implemented yet. Today
only the number already on file as `guardianPhone` can trigger a payment. Add
it by extending `findStudentsByGuardianPhone` in `api/_lib/feeBalance.js` to
also query an `authorizedPayerPhones` array field, once that field exists on
the student record.

## Bursar-triggered reminders (why the bot needs one)

A parent has no reason to message a WhatsApp number they've never messaged
before, so the conversation above needs something to start it. That's the
**"WhatsApp"** button next to **Send reminders** on the Arrears screen (bursar
and head teacher) — `api/whatsapp/send-reminders.js`, wired up via
`src/services/whatsappReminders.js`.

It sends the same three-stage escalation wording the existing in-app "Send
reminders" button uses (`src/services/feeReminderCore.js` — gentle, firm,
final notice, chosen by how many terms the debt is carried), with one line
appended: an invitation to reply "Make Payment" right there in the chat, which
hands off into the conversation flow above. The button respects whatever the
bursar has filtered the Arrears list down to (bucket, search) by passing those
students' ids; the server still recomputes each one's actual balance and
wording independently rather than trusting anything from the browser.

**Throttled deliberately.** WaAPI rides a real, personal-feeling WhatsApp
account rather than Meta's bulk-messaging-aware Business Platform — sending a
burst of near-identical messages in a few seconds is exactly the pattern
WhatsApp's spam detection looks for, and a banned number takes down every
channel this integration has. Sends go out roughly two a second, capped at 60
per click (`MAX_PER_CALL` in `api/whatsapp/send-reminders.js`); a school with
more families in arrears than that gets told how many are left and needs a
second click.

**Still deferred:** the *scheduled* half of the original spec — a bursar
picking a day-of-month and the reminders firing automatically via a cron job,
with per-school on/off configuration. Today, sending is always a manual click.
Everything the manual button needed (balance computation, wording, throttled
sending) is now in place, so wiring a Vercel Cron job to call the same logic
on a schedule is the natural next step once this manual path has been used for
real.

**Also deferred:** a secondary "authorized payer" number per student (e.g. a
parent's number distinct from `guardianPhone`). Today only the number already
on file as `guardianPhone` can trigger or receive a payment prompt. Add it by
extending `findStudentsByGuardianPhone` in `api/_lib/feeBalance.js` (and the
arrears/reminder queries) to also check an `authorizedPayerPhones` array
field, once that field exists on the student record.

## The conversation

```
Parent: "I'd like to make a payment"
Bot:    looks up guardianPhone == sender's number
          → no student found:      "not registered as a contact... contact the school office"
          → found, but MK 0 owing: "no outstanding balance"
          → one student owing:     asks for an amount, or "YES" for the full balance
          → several children owing: numbered list, parent replies with a number
Parent: "20000"  (or "YES")
Bot:    "Confirm: pay MK 20,000 for <name>'s school fees?
         Fees: MK 20,000
         Transaction fee: MK 700
         Total to pay: MK 20,700
         Reply YES to confirm or CANCEL to stop."
Parent: "YES"
Bot:    "How would you like to pay?\n\n1) Airtel Money\n2) TNM Mpamba\n3) Card or bank transfer"
Parent: "1"
Bot:    initiates a direct PayChangu charge, replies "Sending a request... enter your PIN"
        [parent approves the prompt on their phone]
Bot:    "Payment received — thank you!" (from pollAndReport() in api/whatsapp/webhook.js,
        having asked PayChangu itself — there is no callback for this kind of charge)
Parent: "CHECK"  (if the poll window closed before an answer came back)
Bot:    re-checks the same way and reports the outcome

  — or, having replied "3" instead —

Bot:    "Tap this secure link to pay MK 20,000: <checkout link>"
        [parent pays by card/bank in their browser]
Bot:    "Payment received — thank you!" (sent from api/payments/webhook.js, same as the
        portal's hosted checkout — a card number is never something this bot collects itself)
```

State between messages lives in `wa_sessions/{phone}` and expires after 10
minutes of inactivity, so an old "YES" from a forgotten conversation can't be
replayed against a new one.

## Environment variables

Set in **Vercel → Project → Settings → Environment Variables** (none carry a
`VITE_` prefix, so none reach the browser bundle):

| Variable | Where it comes from |
|---|---|
| `WAAPI_API_TOKEN` | waapi.app → your instance → API token |
| `WAAPI_INSTANCE_ID` | waapi.app → your instance → instance id |
| `WAAPI_WEBHOOK_TOKEN` | One you invent — a long random string. Never reused anywhere else. |

Plus everything `payments-paychangu.md` already lists (`PAYCHANGU_SECRET_KEY`,
`FIREBASE_ADMIN_*`, `APP_URL`) — the WhatsApp bot reuses that same gateway.

## Wiring it up

1. In waapi.app, create an instance and pair it to the school's WhatsApp
   number (scan the QR code).
2. Copy the API token and instance id into `WAAPI_API_TOKEN` /
   `WAAPI_INSTANCE_ID` in Vercel, redeploy.
3. Invent a random string for `WAAPI_WEBHOOK_TOKEN` and set it in Vercel too.
4. In waapi.app's instance settings, set the webhook URL to:

   ```
   https://ssp-pep.vercel.app/api/whatsapp/webhook?token=<WAAPI_WEBHOOK_TOKEN>
   ```

   (subscribe to the `message` event — that's the only one this endpoint acts
   on; everything else is ignored.)

## Testing it end to end

1. Use a `sec-test-…` PayChangu key first (see `payments-paychangu.md`).
2. From the WhatsApp number of an account that matches a student's
   `guardianPhone`, message the connected number: "make payment".
3. Follow the prompts through amount, confirm, and network — approve the PIN
   prompt on the payer's phone.
4. Confirm a `payments` row appears with `source: 'paychangu'`, `status:
   'verified'`, and `note: 'Paid via WhatsApp'` — and that a "Payment
   received" message arrives back in the chat within the poll window. If it
   doesn't, reply "CHECK" and confirm that resolves it instead.
5. Message from a number that is *not* on any student's record and confirm
   you get the "not registered" reply, and that a `wa_payment_attempts` row
   was written with `outcome: 'no_student_for_number'`.
6. On the Arrears screen, click **WhatsApp** — confirm the test student
   receives the escalation-worded reminder ending with the "Make Payment"
   invitation, and that a `wa_reminders_sent` row was written. Reply "Make
   Payment" from that same chat and confirm step 2 of the conversation above
   picks up from there.
