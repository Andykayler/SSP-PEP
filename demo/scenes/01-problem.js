// demo/scenes/01-problem.js
// Static problem card. No app, no login — a single photo and a single line.
//
// PHOTO PLACEHOLDER — put your photo at exactly:
//   demo/assets/scene01-problem-photo.jpg
// Landscape, at least 1920x1080 (it's shown full-bleed, cropped to fill via
// object-fit: cover, so anything wider/taller than 16:9 just gets center-
// cropped — no need to pre-crop). JPG or PNG both work. Until that file
// exists, this scene renders a clearly-labelled placeholder in its place so
// `npm run scene 01` still produces something watchable.
import path from "node:path";
import fs from "node:fs";
import { DEMO_ROOT } from "../lib/env.js";
import { openRoleContext } from "../lib/browser.js";

const PHOTO_PATH = path.join(DEMO_ROOT, "assets", "scene01-problem-photo.jpg");
const HOLD_MS = 21_000;

function html(photoUrl) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@400;500&display=swap');
    * { margin:0; padding:0; box-sizing:border-box; }
    html,body { width:1920px; height:1080px; background:#0d1427; overflow:hidden; }
    .photo {
      position:absolute; inset:0; width:1920px; height:1080px;
      object-fit: cover; filter: grayscale(35%) contrast(1.05);
    }
    .placeholder {
      position:absolute; inset:0; width:1920px; height:1080px;
      background:
        repeating-linear-gradient(45deg, #16203f, #16203f 40px, #111d35 40px, #111d35 80px);
      display:flex; align-items:center; justify-content:center; flex-direction:column; gap:18px;
      color:rgba(255,255,255,0.55); font-family:'DM Sans',sans-serif; text-align:center;
    }
    .placeholder b { color:#fff; font-size:30px; }
    .placeholder span { font-family:'DM Mono',monospace; font-size:20px; }
    .overlay {
      position:absolute; inset:0;
      background: linear-gradient(0deg, rgba(8,12,24,0.94) 10%, rgba(8,12,24,0.55) 45%, rgba(8,12,24,0.15) 75%);
    }
    .content { position:absolute; left:130px; right:130px; bottom:110px; }
    .line {
      font-family:'Bebas Neue', Georgia, serif; font-weight:400; color:#fff;
      font-size:86px; line-height:1.08; letter-spacing:0.5px; max-width:1550px;
    }
    .badge { position:absolute; top:64px; left:130px; display:flex; align-items:center; gap:14px; }
    .badge .l { width:34px; height:3px; background:#4f6ef7; }
    .badge .t { font-family:'DM Mono',monospace; font-size:20px; letter-spacing:6px; color:rgba(255,255,255,0.7); text-transform:uppercase; }
  </style></head>
  <body>
    <img class="photo" src="${photoUrl}" onerror="this.style.display='none'; document.getElementById('ph').style.display='flex';" />
    <div id="ph" class="placeholder" style="display:none">
      <b>PHOTO PLACEHOLDER</b>
      <span>demo/assets/scene01-problem-photo.jpg — 1920×1080 landscape, JPG/PNG</span>
      <span>Paper register or a stack of handwritten reports</span>
    </div>
    <div class="overlay"></div>
    <div class="badge"><div class="l"></div><div class="t">Acalink</div></div>
    <div class="content">
      <div class="line">A term's worth of marks lives in one exercise book —<br/>until it's lost, copied wrong, or simply never read.</div>
    </div>
  </body></html>`;
}

export async function run({ browser, sceneDir }) {
  const exists = fs.existsSync(PHOTO_PATH);
  const url = exists ? `file:///${PHOTO_PATH.replace(/\\/g, "/")}` : "about:blank#missing";
  if (!exists) {
    console.warn(`  [scene 01] No photo at ${PHOTO_PATH} — rendering placeholder. See file header for spec.`);
  }

  const { page, finish } = await openRoleContext(browser, { sceneDir, segmentName: "01-card" });
  await page.setContent(html(url), { waitUntil: "networkidle" });
  await page.waitForTimeout(400);
  await page.waitForTimeout(HOLD_MS);
  const p = await finish();
  return [p];
}
