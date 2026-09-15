// demo/titles/cards.js
// The five connective title cards between the numbered scenes. No scene
// numbers on screen — the internal 01-07 IDs are for re-editing, not for
// judges, and 05 was cut (no AI feature existed to show), so numbered labels
// would read as a gap. Editorial labels instead.
import { brandShell } from "./template.js";

const card = (kicker, title, sub) => brandShell({
  bodyHtml: `
    <div class="kicker">${kicker}</div>
    <h1>${title}</h1>
    <p class="sub">${sub}</p>
  `,
});

export const TITLE_CARDS = [
  {
    id: "into-02-lesson-plan",
    beforeScene: "02",
    holdMs: 3600,
    html: card(
      "Live AI",
      `Planning a lesson,<br/><span class="accent">in seconds</span>`,
      "A real MANEB syllabus topic. Real generation, on screen — not a recording of one.",
    ),
  },
  {
    id: "into-03-report-comment",
    beforeScene: "03",
    holdMs: 3600,
    html: card(
      "Live AI",
      `One learner,<br/><span class="accent">one comment</span>`,
      "Written for Chisomo Banda's own results, then released to the whole class.",
    ),
  },
  {
    id: "into-04-clockin",
    beforeScene: "04",
    holdMs: 3400,
    html: card(
      "Real-time, linked",
      `One clock-in,<br/><span class="accent">two dashboards</span>`,
      "A teacher starts a lesson. The head teacher's view updates from the same record.",
    ),
  },
  {
    id: "into-06-payment",
    beforeScene: "06",
    holdMs: 3400,
    html: card(
      "Mobile money",
      `A payment,<br/><span class="accent">parent to school</span>`,
      "Reported via TNM Mpamba from the parent app — reconciled by the bursar.",
    ),
  },
];
