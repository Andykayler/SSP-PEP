// demo/scenes/07-closing.js
// Closing card. Generated HTML, Acalink brand, per the brief.
//
// No specific school named here (explicit instruction — do not reference
// Modern Haven Academy yet). ADOPTION_LINE and PRICING_LINE are placeholders;
// I don't have real figures, and inventing them for a competition video is
// exactly the kind of claim this whole demo is built to avoid. Edit both
// before the final recording. USSD is correctly marked ROADMAP — verified:
// no USSD gateway integration exists anywhere in this repo.
import { openRoleContext } from "../lib/browser.js";

const ADOPTION_LINE = "PLACEHOLDER — your real adoption/traction stat goes here";
const PRICING_LINE = "PLACEHOLDER — e.g. \"MWK X,XXX per learner, per term\"";

// The full run-through, recapped — everything this video actually showed,
// each one real and verified against the codebase (see README).
const RECAP = [
  ["Live AI", "Lesson plans drafted from a topic, in seconds"],
  ["Live AI", "A personalised term comment, written per learner"],
  ["Real-time, linked", "A teacher's clock-in reaches the head teacher's dashboard"],
  ["Mobile money", "A parent's payment, reported and reconciled"],
];

const HOLD_MS = 27_000;

function html() {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@400;500;700&family=DM+Mono:wght@400;500&display=swap');
    * { margin:0; padding:0; box-sizing:border-box; }
    html,body { width:1920px; height:1080px; overflow:hidden;
      background: linear-gradient(135deg, #0f1629 0%, #162040 55%, #0f1d38 100%);
      font-family:'DM Sans',sans-serif; color:#fff; }
    .frame { position:relative; width:1920px; height:1080px; padding:100px 160px; }
    .badge { display:flex; align-items:center; gap:14px; }
    .badge .l { width:34px; height:3px; background:#4f6ef7; }
    .badge .t { font-family:'DM Mono',monospace; font-size:22px; letter-spacing:6px; color:rgba(255,255,255,0.7); text-transform:uppercase; }
    h1 { font-family:'Bebas Neue', Georgia, serif; font-weight:400; font-size:80px;
      margin: 32px 0 40px 0; letter-spacing:0.5px; }
    .cols { display:flex; gap:48px; }
    .recap { flex:1.1; display:flex; flex-direction:column; gap:16px; }
    .recap .item { display:flex; gap:16px; align-items:flex-start; }
    .recap .dot { width:10px; height:10px; border-radius:50%; background:#4f6ef7; margin-top:8px; flex-shrink:0; }
    .recap .kicker { font-family:'DM Mono',monospace; font-size:14px; letter-spacing:2px; color:#7b96ff; text-transform:uppercase; }
    .recap .txt { font-size:23px; color:rgba(255,255,255,0.9); font-weight:500; line-height:1.35; }
    .side { flex:1; display:flex; flex-direction:column; gap:22px; }
    .card {
      background:rgba(255,255,255,0.04); border:1px solid rgba(79,110,247,0.22);
      border-radius:18px; padding:26px 30px;
    }
    .card .kicker { font-family:'DM Mono',monospace; font-size:15px; letter-spacing:3px;
      color:#7b96ff; text-transform:uppercase; margin-bottom:10px; }
    .card .body { font-size:21px; line-height:1.45; color:rgba(255,255,255,0.9); font-weight:500; }
    .roadmap { border-color:rgba(232,168,0,0.35); background:rgba(232,168,0,0.06); }
    .roadmap .kicker { color:#f5c842; }
    .roadmap .pill {
      display:inline-block; font-family:'DM Mono',monospace; font-size:13px; letter-spacing:2px;
      color:#1a1200; background:#e8a800; padding:3px 11px; border-radius:999px; margin-left:10px;
      vertical-align:middle;
    }
    .placeholder-flag { color:#ff8a8a; font-size:15px; font-family:'DM Mono',monospace; margin-top:6px; }
    .footer-line {
      position:absolute; bottom:56px; left:160px; right:160px;
      display:flex; justify-content:space-between; align-items:center;
      font-family:'DM Mono',monospace; font-size:20px; color:rgba(255,255,255,0.4);
      letter-spacing:2px; text-transform:uppercase;
    }
  </style></head>
  <body>
    <div class="frame">
      <div class="badge"><div class="l"></div><div class="t">Acalink</div></div>
      <h1>Everything you just saw was live.</h1>

      <div class="cols">
        <div class="recap">
          ${RECAP.map(([kicker, txt]) => `
            <div class="item">
              <div class="dot"></div>
              <div>
                <div class="kicker">${kicker}</div>
                <div class="txt">${txt}</div>
              </div>
            </div>
          `).join("")}
        </div>

        <div class="side">
          <div class="card">
            <div class="kicker">Adoption</div>
            <div class="body">${ADOPTION_LINE}</div>
          </div>
          <div class="card">
            <div class="kicker">Pricing</div>
            <div class="body">${PRICING_LINE}</div>
          </div>
          <div class="card roadmap">
            <div class="kicker">On the roadmap<span class="pill">NOT YET BUILT</span></div>
            <div class="body">USSD access for guardians without a smartphone.</div>
          </div>
        </div>
      </div>

      <div class="placeholder-flag">⚠ Adoption and pricing are placeholders — replace before the final recording.</div>
    </div>
    <div class="footer-line"><span>Acalink</span><span>acalink.app</span></div>
  </body></html>`;
}

export async function run({ browser, sceneDir }) {
  const { page, finish } = await openRoleContext(browser, { sceneDir, segmentName: "07-card" });
  await page.setContent(html(), { waitUntil: "networkidle" });
  await page.waitForTimeout(400);
  await page.waitForTimeout(HOLD_MS);
  return [await finish()];
}
