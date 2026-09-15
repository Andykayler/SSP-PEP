// demo/lib/preflight.js
// A code-enforced copy of CostWorth SPEC.md's blocking pre-recording
// checklist, so it doesn't depend on whoever's running the pipeline (a
// person, or a future Claude session) re-deriving the rule from memory each
// time. Called by seed/seed.js and scenes/run-scene.js before either does
// anything — seeding counts as "recording against this pipeline" too, since
// it's the step that writes the guardian's phone/password into Firestore.
//
// SPEC.md, verbatim: "No CostWorth recording happens against this pipeline
// until: 1. A fully fictional guardian account is seeded for the CostWorth
// demo tenant, and 2. .env no longer references any real account (phone,
// password, or otherwise) — verified by reading the file, not assumed from
// memory."
import { env } from "./env.js";

export function assertGuardianAccountSafe() {
  if (env.guardianAccountConfirmedFictional) return;

  throw new Error(
    "\n" +
    "BLOCKED — demo/.env's guardian account is not confirmed fictional.\n\n" +
    "PARENT_PHONE/PARENT_PASSWORD in demo/.env currently need to point at a\n" +
    "fully fictional guardian seeded fresh for the CHIKHO-DEMO tenant, not the\n" +
    "real, existing guardian account this pipeline shipped with (see\n" +
    "demo/README.md's \"Setup\" section and CostWorth's SPEC.md \"Demo Recorder\"\n" +
    "prerequisite — this applies to seeding as much as to recording, since\n" +
    "seeding is what writes the phone number into Firestore).\n\n" +
    "To unblock:\n" +
    "  1. Replace PARENT_PHONE and PARENT_PASSWORD in demo/.env with fictional\n" +
    "     values (same convention as the other 27 seeded guardians in\n" +
    "     seed/roster.js — a plausible Malawian mobile number, made up, not\n" +
    "     anyone's real phone).\n" +
    "  2. Re-run `npm run seed`.\n" +
    "  3. Set GUARDIAN_ACCOUNT_CONFIRMED_FICTIONAL=true in demo/.env.\n\n" +
    "This check exists so no recording — vertical or landscape, whether or not\n" +
    "a given scene touches the parent app — runs while that's still unresolved.\n",
  );
}
