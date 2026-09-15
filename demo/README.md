# Acalink competition demo — pipeline

Standalone npm workspace. **Never imported by, built with, or shipped as part
of** the app in `src/` or `acalink/` — it only drives them from the outside via
Playwright. Safe to delete this whole folder and the app is unaffected.

Everything here is Playwright's own built-in video recording (headed Chromium,
1920x1080, one browser **context** per role) — no screen-recording software
anywhere in the pipeline, including the title cards, which are real HTML pages
rendered and recorded the same way as everything else.

## Setup

```bash
cd demo
npm install
npx playwright install chromium
cp .env.example .env      # then fill in passwords — see below
npm run seed               # creates the fictional demo tenant
npm run titles              # renders the 4 title cards once
npm run scene 01             # run one scene
npm run scene all             # run every scene
npm run stitch                 # assemble acalink-demo.mp4 from what exists
npm run all                     # titles + all scenes + stitch, in one go
```

For CostWorth's vertical (9:16) reshoots — see "CostWorth vertical reshoot"
below — set `RECORD_PROFILE=vertical` in `.env` first, then
`npm run scene v04` (or whichever vertical scene id).

`npm run scene <id>` re-records only that scene and re-runs `npm run stitch`
whenever you want the final file rebuilt — stitching never re-records
anything, it only needs `output/scenes/*.mp4` and `output/clips/titles/*.webm`
to already exist.

### `.env`

Copy `.env.example` → `.env`. It is read by **both** `seed/seed.js` (creates
the Firebase Auth accounts with these exact passwords) and every scene script
(logs in as them) — change a password here, then re-run `npm run seed`.

The four staff emails are fixed by the brief; I generated random passwords for
this run (already in `demo/.env`, gitignored). The guardian phone/password
(`PARENT_PHONE`/`PARENT_PASSWORD`) were supplied directly by you mid-session
and point at an **existing** guardian account on the live Firebase project —
seeding only attaches the fictional demo learner to it, nothing about your
other test profiles on that number is touched.

**CostWorth SPEC.md's blocking prerequisite, resolved 2026-09-14:** SPEC.md
requires a fully fictional guardian, and this number initially read as a real
third party's. Andy confirmed directly it's his own development/test line
(other profiles at other schools, no real child's data — same note as
above), not a real guardian — so `GUARDIAN_ACCOUNT_CONFIRMED_FICTIONAL=true`
is now set in `.env`. `lib/preflight.js` still enforces this gate in code for
every future `npm run seed` / `npm run scene <any>` — if `PARENT_PHONE`/
`PARENT_PASSWORD` ever change again, flip it back to confirm before
recording, don't assume the old confirmation still applies.

## Demo tenant — confirm before recording

**School:** Chikho Community Day Secondary School, `schoolCode: CHIKHO-DEMO`
— entirely fictional, isolated by `schoolCode` in the same Firestore project
the real app uses (there's no separate Firebase project; every write the seed
script makes is scoped to this one tenant and never touches another school's
data). Not Modern Haven Academy, not any tenant with a real child's data.

**Named learner carried through scenes 02-06:** Chisomo Banda, Form 3A —
28-student class, realistic Malawian names, 6 real MANEB secondary subjects
(English, Mathematics, Biology, Chemistry, Agriculture, Life Skills), a full
CA1→CA2→Mid-Term→End-of-Term mark set for a completed term ("Term 2 2026",
Jan-Apr — deliberately in the past relative to any recording date so the term
is actually finished, unlike "today"'s real term). Chisomo's story is
deliberate: weak-but-rising in Mathematics (41→63 across the term), strong
and steady in Biology — the shape that gives the AI insight something
specific to say.

Re-run `npm run seed` shortly before recording scene 04 — it re-picks
whichever timetable period brackets the actual time you record, so the
clock-in doesn't show "+7 hours late" against a fixed 07:30 slot.

## Feature verification (why the scene list looks like this)

Verified in the codebase before anything was recorded, per the brief's own
instruction not to fabricate a feature.

| # | Feature | Status | Notes |
|---|---|---|---|
| 1 | AI lesson-plan generation | **Built, but was unreachable** | `api/ai-lesson-plan.js` is a real, tested Groq call (~4.5s live). It was wired only into `teacher/modules/classplanning.jsx`, a prototype **never imported by any dashboard menu** — dead code. Ported the same "Generate with AI" flow into the real, Firestore-backed lesson-plan form in `ClassModule.jsx` ("My Classes" tab), which had no AI affordance at all. See commit on branch `demo/ai-lesson-plan-wiring`. |
| 2 | AI report-comment generation, teacher-facing, editable | **Doesn't exist as scripted** | The only AI-insight code (`api/ai-insight.js`, real Groq call) is a **head-teacher-only bulk "Issue to parents"** action on `reports.jsx` — no per-student trigger, no edit-before-save step anywhere for this text. Rather than fabricate an edit box, the edit beat moved to scene 02 (which genuinely has one), and scene 03 shows the head teacher releasing one learner's card, then the parent app displaying the real generated analysis, read-only. |
| 3 | Teacher lesson clock-in | **Built** | Real geolocated clock-in/out, `TimetableModule.jsx` → `lesson_sessions`. Playwright supplies real (not faked) browser geolocation via `context.setGeolocation`, matched to the seeded `school_geofences` doc — the app's own distance check runs for real. |
| 4 | Headteacher dashboard reflecting it, live | **Partial — app-wide pattern, not a one-off** | `ClassSessionsModule.jsx` ("Class Monitor") reads it correctly but via one-shot `getDocs` behind a manual refresh button. Checked every screen scenes 04/06 touch (bursar's `Payments.jsx`/`StudentFees.jsx` included) — **none** use `onSnapshot`. Shown honestly: one manual refresh click, not a fabricated live push. |
| 5 | Predictive AI insight on headteacher dashboard | **Doesn't exist — cut** | Everything that looks like this (`ExamReadiness.jsx`, the "at-risk" tabs in `reports.jsx`/`PerformanceModule.jsx`) is a rule-based threshold; `ExamReadiness.jsx` says on-screen *"a projection... not a prediction."* No LLM touches the headteacher dashboard. Cut per your decision; the 45s went to strengthening 02/03/06. |
| 6 | Fee payment, parent → bursar | **Built, real, with two bugs found and fixed** | Flutter parent app supports Airtel Money and TNM Mpamba as a genuine "I have already paid" report (separate from a real PayChangu gateway transaction, which this demo deliberately never triggers — see below). Found via testing, not guessing: (a) the seed script's fee docs used `.add()` instead of a deterministic id, so every re-seed **duplicated** the fee assignment — 5 re-seeds produced a 425,000 "balance" instead of 85,000; fixed. (b) The bursar's `Payments.jsx` ledger does **not** visually distinguish a parent's unverified self-report (`status: 'unverified', source: 'parent_app'`) from a bursar-confirmed payment — it renders identically. Not fixed (a bigger, financial-trust-surface change I didn't make unilaterally) — flagging it here because it's a real gap independent of this demo. |

### Also found and fixed while testing (not in the original 5-feature list)

- **`acalink/lib/services/attendance_service.dart`** crashed the parent
  dashboard (`type 'String' is not a subtype of type 'Map<String, dynamic>?'`)
  for any attendance register written as a bare status string — a shape the
  web app's own `termSummary.js` explicitly says exists in real data, but this
  Flutter service didn't tolerate. Fixed to match the web side's parsing.
  `attendance_detail_service.dart` had the same gap silently *undercounting*
  (not crashing) a child's attendance history for the same reason — also
  fixed. You surfaced this live, on Chisomo Banda's own account, while I was
  recording scene 03.
- **`ClassModule.jsx`'s "TEACHER" column in Reports & Exports** shows "Unknown
  Teacher" — a cosmetic gap in resolving `ca_marks.teacherId` to a display
  name. Not fixed (out of scope for what was asked), just noting it's visible
  in scene 03's headteacher footage.

## Is the AI fast enough to record live?

Tested directly against the deployed routes before writing any scene script:

| Route | Measured latency | Held on screen |
|---|---|---|
| `POST /api/ai-lesson-plan` | ~4.5s | Yes — visible "Drafting…" spinner, no cut |
| `POST /api/ai-insight` (1 student) | ~8-13s (varies; includes the attendance/history reads it's grounded in, not just the model call) | Yes — "Preparing insights…" text, no cut |

Both are genuinely live, not stubbed — confirmed by reading the actual
generated Firestore documents after each test run, e.g. Chisomo Banda's real
insight: *"Chisomo's term average jumped from 50% to 61%... English is the
closest to the class level... Spend 10-15 minutes each evening reading an
English story together..."* — grounded in the real seeded marks/attendance,
not boilerplate.

## Real side effects — read before repeated test runs

- **Scene 03 sends a real SMS** to the seeded guardian's real phone number
  every time it runs (Twilio, ~2 billable parts) — the app's actual
  guardian-notification path, triggered for real by the head teacher's
  "Issue to parents" action. Disable the `sms` module in `school_settings` for
  rehearsal runs if you want to avoid repeated texts; re-enable for the final
  take.
- **Scene 06 never triggers a real money movement** — it uses the app's
  "I have already paid" report path on purpose, not "Pay now" (which hands a
  real phone to PayChangu's live mobile-money prompt).

## Parent app: how it's actually driven

Flutter's web build (this Flutter version ships CanvasKit only, no HTML
renderer — confirmed by inspecting `build/web/flutter_bootstrap.js`) renders
to a single `<canvas>`, so there's no DOM to click. `lib/parentApp.js` enables
Flutter's own accessibility bridge (the same mechanism a screen reader uses)
by calling the hidden `flt-semantics-placeholder` element's `.click()`
directly, which turns every real widget into a real, queryable ARIA element —
`getByRole`, `getByText`, all of it, exactly like a normal web page from that
point on. `lib/serveParent.js` also wraps the app in a phone-shaped frame
(`/frame` route) so the recording looks like footage of a handset rather than
a bare desktop browser window, per your note.

Scrolling inside the app needed a real wheel gesture (`scrollAppDown`), not
`scrollIntoViewIfNeeded` — Flutter virtualizes its scrollables, so off-screen
content has no semantics node (doesn't exist for Playwright) until it's
actually been scrolled into Flutter's built range.

`chooseLearner()` always types a search filter before picking Chisomo Banda —
this guardian phone number has other test profiles at other schools linked to
it (yours, not real children's data, per your note), and the demo should stay
visibly about one learner regardless.

## Placeholders you need to fill in before the final recording

- **`demo/assets/scene01-problem-photo.jpg`** — landscape, 1920x1080 or
  larger (shown full-bleed, cropped to fill via `object-fit: cover`). Until
  this file exists, scene 01 renders a clearly-labelled placeholder instead of
  failing.
- **`demo/scenes/07-closing.js`**, `ADOPTION_LINE` and `PRICING_LINE` — I have
  no real adoption or pricing figures, and inventing them for a competition
  video is exactly the kind of claim this whole exercise is built to avoid.
  The rendered card flags this in red text until you edit them. No specific
  school is named on this card, per your instruction.

## Scene status and measured runtime

| Scene | What | Status | Measured | Target |
|---|---|---|---|---|
| 01 | Problem card | ✅ Recorded | 0:27 | 0:22 |
| 02 | AI lesson plan + edit | ⏳ **Blocked** — needs a deployment URL with the `ClassModule.jsx` fix + `ACALINK_AI_API` both live (see below) | — | 1:10 |
| 03 | AI report comment → parent app | ✅ Recorded | 1:05 | 1:05 |
| 04 | Clock-in → headteacher dashboard | ✅ Recorded | 0:45 | 0:46 |
| 06 | Fee payment → bursar dashboard | ✅ Recorded | 1:00 | 0:42 |
| 07 | Closing card | ✅ Recorded | 0:29 | 0:30 |

**Total so far (excluding 02):** 4:06 of content + title cards (~14s: four
cards at 3.4-3.6s each). **With scene 02 at its 1:10 target: ~5:20 — over the
5:00 cap.** Per the brief's own fallback rule, trim 04 and 06 first (both
already ran long against their targets — 04 by ~0, 06 by ~18s over) before
touching 02 or 03. A first pass at trimming: shorten the holds in
`04-clock-in.js` and `06-fee-payment.js` by ~2s each (they're generous by
design) and re-run just those two scenes plus `npm run stitch`.

**Weakest scene:** 06, on runtime alone — it's the longest relative to its
target (60s vs. 42s), mostly the phone-app form-filling (amount, method,
phone, reference) taking longer at human typing speed than estimated. Also
worth knowing: the bursar's ledger not distinguishing "reported" from
"confirmed" payments (see Feature verification above) means the visual payoff
("it lands!") is real but slightly overstates the payment's status — the app
itself doesn't flag that nuance, so the video can't either without narration.

## CostWorth vertical (9:16) reshoot — Phase 1A

CostWorth's content pipeline (`../../costworth` — the separate content &
outreach repo this recorder now feeds) needs 9:16 clips of single workflows,
not the stitched 5-minute competition reel above. Per its SPEC.md: **a
reshoot, not a crop** — framing and pacing differ from the scenes above, not
just the output dimensions.

**What actually differs, mechanically:**

- **Recording viewport is 810x1440**, not a vertically-cropped 1920x1080.
  810px sits below the app's own 1024px responsive breakpoint
  (`src/styles/dashboard-layout.css`), so Playwright drives the app's real
  mobile layout — off-canvas hamburger sidebar (`lib/nav.js`
  `goToTabMobile`/`openMobileMenu`) instead of the desktop sidebar that's
  always open. That's the actual "reshoot": a different real interaction, not
  a viewport number. 810x1440 is exact 9:16, so the final deliverable
  (1080x1920, set via `RECORD_PROFILE=vertical`'s `deliver` size in
  `lib/env.js`) is a clean 4:3 upscale in `stitch`/`concatToMp4` — no
  letterboxing.
- **Pacing is a single short beat**, not two segments held long enough for a
  competition judge. `CLIP_SECONDS` (15/30/45/60, `lib/env.js`) picks a
  hand-tuned pacing table per scene — see `scenes/vertical/v04-clock-in.js`'s
  `PACING` — rather than linearly scaling every hold, which reads as
  "sped up," not "shot for the format." 15s cuts a whole beat (the
  headteacher confirmation) rather than rushing through both.
- **Spotlight colour** defaults to CostWorth's Primary Navy (`#1F3352`,
  CostWorth's brand guide) instead of the competition reel's blue —
  `lib/humanize.js` `spotlight(locator, color)` takes an override; the
  original scenes above don't pass one, so they're unaffected.

**Scenes so far:**

| Scene | What | Status |
|---|---|---|
| `v04` (`clock-in-vertical`) | Reshoot of scene 04 — teacher clocks in (real geolocation/geofence check), cut to the head teacher's Class Monitor confirming it | ✅ Recorded 2026-09-14, 0:42, 1080x1920 → `output/scenes/v04-clock-in-vertical.mp4` |

**Bug found and fixed while recording it:** `seedTimetable()` never cleared
old timetable docs before writing new ones, and doc ids include the period
number (`${day}_${p.number}`) — re-seeding at a different time of day than a
previous run left a *second*, stale period for today instead of replacing
the first. The first recording take clocked into that stale 08:30 slot at
the real (10:30) time, on screen as "08:30–09:20 · Clocked in 10:30 AM" — an
honest-looking but false "+2h late." Fixed in `seed/seed.js` `seedTimetable`
(clears the class's whole timetable before reseeding); re-seeded and
re-recorded clean: "10:30–11:20 · Clocked in 10:35 AM" on the teacher side,
"P4 · 10:30–11:20 · Clock In 10:35 AM +6m late" on the head teacher's Class
Monitor — a genuinely late start, not a fabricated one.

**Verification (CLAUDE.md, run before keeping this clip):** reviewed frames
across the full 42s at ~2s intervals. Tenant, class, roster, and both staff
display names (Beatrice Kumwenda, Foster Chirwa) are all fictional — no real
school/learner/guardian data in frame, and no parent-app/guardian screen
appears at all. **Staff emails in frame — confirmed OK by Andy (2026-09-14):** the sign-in
step for each segment briefly shows the full staff login email in the email
field before submitting (`claude@dyuni.ac.mw`, `milesknd@gmail.com`) — real,
working addresses tied to accounts created for this pipeline, not invented
placeholders. Flagged because this clip (unlike scenes 01-07's landscape
footage) is headed for public social posting, not an internal competition
entry. Andy confirmed fine as-is — no change needed, here or for future
vertical clips using the same staff sign-in flow.

Only one scene exists on purpose — CostWorth SPEC.md Phase 1A asks for one
watchable clip of one workflow, not the full vertical scene library or a
batch runner. More vertical beats (a single fee payment, a single AI insight
reveal) are future work, described in SPEC.md but not built here.

**To actually record `v04` once the guardian prerequisite is resolved:**

```bash
# in demo/.env: RECORD_PROFILE=vertical, GUARDIAN_ACCOUNT_CONFIRMED_FICTIONAL=true
npm run seed        # re-seed so the (now-fictional) guardian + today's timetable are fresh
npm run scene v04   # -> output/scenes/v04-clock-in-vertical.mp4, 1080x1920
```

Then run the verification step CLAUDE.md requires before keeping any clip:
confirm no real person's name, phone number, or email appears anywhere in
frame — sidebar, toast, autofill, browser chrome, all of it.

## Scene 02 — what's needed to unblock it

`api/ai-lesson-plan.js` and `api/ai-insight.js` only exist as Vercel
serverless functions — `npm run dev` + `node server.js` doesn't serve them, so
recording has to target a real deployment. The `ClassModule.jsx` fix that
makes scene 02 possible is on branch `demo/ai-lesson-plan-wiring`, pushed but
not merged. I need either:

1. A Vercel **preview URL** for that branch, with `ACALINK_AI_API` set on
   Preview environments (not just Production) — fastest, keeps `main` untouched.
2. Or the branch merged to `main` so it deploys to production.
3. Or you run it locally via `vercel dev` (needs the Vercel CLI linked to this
   project) and give me the localhost port.

Once you give me a URL, set `BASE_URL` in `demo/.env` to it and run
`npm run scene 02`.

## Files

```
demo/
  .env / .env.example         credentials + config (see above)
  package.json                 npm run seed / scene / titles / stitch / all
  lib/                           shared helpers
    env.js                        loads + validates .env; resolves RECORD_PROFILE (landscape/vertical) + CLIP_SECONDS
    preflight.js                   assertGuardianAccountSafe() — blocks seed/record until the guardian account is confirmed fictional
    browser.js                    launches Chromium, opens video-recording contexts (viewport follows env.video.record)
    humanize.js                    human-speed type/click/pause/spotlight (spotlight colour overridable)
    webAuth.js                     signs into the React app as a given role (mobile-aware "ready" wait)
    nav.js                         clicks a sidebar tab; goToTabMobile/openMobileMenu drive the off-canvas hamburger menu
    parentApp.js                   drives the Flutter app (semantics bridge, scroll, tap)
    serveParent.js                  builds+serves acalink/build/web, plus the phone-frame wrapper
    ffmpeg.js                        concat + duration probing (delivers at env.video.deliver size)
  seed/
    roster.js                     Malawian names, MANEB subjects, deterministic mark generation
    admin.js                       firebase-admin bootstrap
    seed.js / unseed.js           create / tear down the demo tenant (seed.js is preflight-gated)
  scenes/
    manifest.js                    SCENES (landscape) + VERTICAL_SCENES + target durations
    run-scene.js                   CLI: npm run scene <id|all> (preflight-gated, profile-checked)
    01-problem.js ... 07-closing.js
    vertical/
      v04-clock-in.js               CostWorth's 9:16 reshoot of scene 04 — see "CostWorth vertical reshoot" above
  titles/
    template.js, cards.js          the 4 connective title cards (brand tokens from src/styles/design-system.css)
    render-titles.js               renders them to clips
  stitch.js                        assembles output/acalink-demo.mp4 from existing clips
  assets/                          scene01's photo goes here
  output/                          gitignored — clips/ (raw per-role segments), scenes/ (per-scene mp4s), acalink-demo.mp4
```
