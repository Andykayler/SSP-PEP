# WhatsApp-first notifications

Every alert the school raises — an absence, a mark published, a fee received,
a leave decision, a late bus — is one document in `notifications`
(`src/services/notifications.js`). What used to be push-then-SMS is now:

```
1. WHATSAPP   primary channel, guardians AND staff
2. PUSH       free, still sent to any guardian who has the app
3. SMS        fallback only — where WhatsApp could not carry the message
```

All the delivery logic lives in `functions/index.js` (the `pushNotification`
trigger) plus `functions/whatsapp.js`. `api/_lib/waapi.js` / `api/whatsapp/
webhook.js` are the separate, older WhatsApp *payment bot* integration
(`docs/whatsapp-waapi.md`) — related but not the same code path.

## Why an outbox, not a direct send

WaAPI pairs a real WhatsApp number by QR code; it is not Meta's Business
Platform, and a burst of near-identical messages is exactly what gets a real
number banned. So a guardian-facing message is queued in `wa_outbox` and
drained by a scheduled function (`drainWhatsAppOutbox`, every minute, ~2/sec,
capped per run) rather than sent inline. Only `priority: "urgent"` skips the
queue and sends immediately.

A message that fails permanently (three attempts, or the gateway rejects it
outright — wrong number, not configured) falls back to SMS if the school has
that category opted in (`src/services/smsFallback.js`, unchanged).

## Per-school settings (`school_settings/{schoolCode}`)

| Field | Default | Meaning |
|---|---|---|
| `whatsappEnabled` | `true` | Master switch for guardian WhatsApp |
| `whatsappCategories` | every guardian category | Which alert types go to WhatsApp |
| `whatsappStaffAlerts` | `true` | Whether staff get WhatsApp at all |
| `defaultLanguage` | `"en"` | Falls back when a guardian has no language set |
| `smsFallbackCategories` | `[]` | Unchanged — see smsFallback.js |

A guardian's own `students.guardianLanguage` (`"en"` \| `"ny"`) overrides the
school default. A guardian can stop all WhatsApp alerts by replying **STOP**
to any message (recorded in `wa_optouts`), and restart with **START**.

## Staff WhatsApp

Staff always have the portal and its bell; WhatsApp is the *out-of-app*
channel. A staff notification reaches WhatsApp only if it is `priority: "high"`
or `"urgent"`, OR its category is one of `leave, review, cover, exam, health,
risk, security` (`STAFF_WHATSAPP_CATEGORIES` in `notifications.js`) — the ones
where someone is waiting on a decision. Each person turns this on for
themselves from the account panel (the avatar in the top bar), which requires
confirming their number with a WhatsApp code first — see below.

## Bilingual wording

`src/services/messageTemplates.js` holds English/Chichewa pairs for every
guardian-facing event. `notificationHooks.js` spreads the right pair onto each
notification (`titleNy`/`bodyNy`); the in-app inbox always shows English, the
WhatsApp/SMS text picks by language. **The Chichewa was drafted by an English
speaker and should be reviewed by a Chichewa speaker before launch** — the
`tpl.*` functions in that file are the only place to fix it.

## Two-step sign-in and account verification (`api/auth/otp.js`)

A six-digit code sent over WhatsApp, used for:

- **login** — the second step for an account that has turned on two-step sign-in
- **enable_2fa** / **disable_2fa** — turning that on/off (requires the code first)
- **verify_phone** — confirming a number so alerts can be sent to it

The code is generated, hashed (`OTP_PEPPER` env var, see `.env.example`),
rate-limited and checked server-side; `users.phone` and `users.twoFactor` are
**not** client-writable (see `firestore.rules`) — they change only through this
endpoint, after proof of the phone.

**Caveat:** this is a strong second factor for the sign-in page, not
enforcement inside Firebase Auth itself (that needs the Identity Platform
upgrade). A caller that bypassed the sign-in page and used the Firebase SDK
directly would not be stopped by it.

## School approval and subscription messages

`onSchoolStatusChange` (Cloud Function) tells a school's registered phone on
WhatsApp when it is approved, rejected, suspended or reinstated.
`subscriptionReminders` (daily, 08:00 Africa/Blantyre) warns a school at 7, 3,
1 and 0 days before its trial or paid period lapses. Both go through the same
outbox as everything else.

## Deploying

```
firebase functions:secrets:set WAAPI_API_TOKEN
firebase functions:secrets:set WAAPI_INSTANCE_ID
firebase functions:secrets:set TWILIO_ACC_SID        # SMS fallback, optional
firebase functions:secrets:set TWILIO_AUTH_TOKEN
firebase functions:secrets:set TWILIO_PHONE_NUMBER
firebase deploy --only functions,firestore:rules
```

`APP_URL` (a Firebase Functions config string, not a secret) is used to build
the sign-in link in approval messages — set it if you want that link included:

```
firebase functions:config:set app.url="https://your-domain"
```

(if unset, the message simply omits the link).

On Vercel, set `OTP_PEPPER` and the existing `WAAPI_*` / `TWILIO_*` vars (see
`.env.example`) for the `api/auth/otp.js` and `api/whatsapp/*` endpoints —
those run as Vercel functions, separately from the Firebase Functions above.

## The platform owner

`/platform` (approve/reject/suspend schools, extend trials) is gated on
`users.role == "superadmin"`, which nothing in the product can grant. Create
the first one by hand:

```
node scripts/make-platform-owner.mjs you@example.com
```

The Firebase Auth account must already exist (create it in the Firebase
Console, or have the person register normally and tell you their email).
