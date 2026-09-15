// demo/scenes/manifest.js
// The seven landscape scenes from the original competition brief, plus a
// separate, growing library of vertical (CostWorth, 9:16) beats. 05
// (predictive AI insight on the headteacher dashboard) is intentionally
// absent from the landscape list: no such AI feature exists in the app
// (verified — see demo/README.md "Feature verification"), and the brief's
// own instruction is to cut rather than fabricate one. Its numbering gap is
// internal only; no scene number appears on screen (see titles/cards.js).
export const SCENES = [
  { id: "01", slug: "problem", file: "01-problem.js", targetSeconds: 22, profile: "landscape" },
  { id: "02", slug: "lesson-plan", file: "02-lesson-plan.js", targetSeconds: 70, profile: "landscape" },
  { id: "03", slug: "report-comment", file: "03-report-comment.js", targetSeconds: 65, profile: "landscape" },
  { id: "04", slug: "clock-in", file: "04-clock-in.js", targetSeconds: 46, profile: "landscape" },
  { id: "06", slug: "fee-payment", file: "06-fee-payment.js", targetSeconds: 42, profile: "landscape" },
  { id: "07", slug: "closing", file: "07-closing.js", targetSeconds: 30, profile: "landscape" },
];

// CostWorth's vertical scene library (SPEC.md Phase 1A): short, independent
// beats — a single workflow each, not a stitched multi-scene reel — each
// trimmable to 15/30/45/60s via CLIP_SECONDS in demo/.env (see lib/env.js).
// A "v"-prefixed id and a slug distinct from its landscape counterpart avoid
// any ambiguity between e.g. `npm run scene clock-in` (landscape, unchanged)
// and `npm run scene v04` (vertical reshoot of the same workflow).
export const VERTICAL_SCENES = [
  { id: "v04", slug: "clock-in-vertical", file: "vertical/v04-clock-in.js", targetSeconds: null, profile: "vertical" },
];

export function findScene(idOrSlug) {
  return [...SCENES, ...VERTICAL_SCENES].find((s) => s.id === idOrSlug || s.slug === idOrSlug
    || `${s.id}-${s.slug}` === idOrSlug);
}
