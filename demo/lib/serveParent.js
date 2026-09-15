// demo/lib/serveParent.js
// Serves the Flutter parent app's web build locally so Playwright can record
// it — there is no hosted URL for it (no Firebase Hosting config in this
// repo). Builds fresh each time `npm run scene 03`/`06` runs unless the build
// already exists and { rebuild: false } is passed.
import { spawnSync } from "node:child_process";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ACALINK_DIR = path.resolve(__dirname, "..", "..", "acalink");
const WEB_BUILD_DIR = path.join(ACALINK_DIR, "build", "web");

const MIME = {
  ".html": "text/html", ".js": "application/javascript", ".mjs": "application/javascript",
  ".json": "application/json", ".css": "text/css", ".png": "image/png", ".jpg": "image/jpeg",
  ".svg": "image/svg+xml", ".wasm": "application/wasm", ".ico": "image/x-icon",
  ".woff2": "font/woff2", ".ttf": "font/ttf",
};

export function buildParentWeb({ force = false } = {}) {
  if (!force && fs.existsSync(path.join(WEB_BUILD_DIR, "main.dart.js"))) {
    console.log("  parent app: using existing build/web (pass --rebuild to force a fresh build)");
    return;
  }
  console.log("  parent app: running `flutter build web --release` (this can take a minute or two)…");
  const res = spawnSync("flutter", ["build", "web", "--release"], { cwd: ACALINK_DIR, stdio: "inherit" });
  if (res.status !== 0) throw new Error("flutter build web failed");
}

// A phone-shaped frame around the app iframe, rendered at the recording's
// full 1920x1080 so the video looks like footage of a handset rather than a
// bare desktop browser window — the app itself still renders at true mobile
// width inside it. Served from this same origin (not a separate file:// page)
// so the iframe has no cross-origin restrictions talking to Firebase.
function frameHtml() {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Mono:wght@400;500&display=swap');
    * { margin:0; padding:0; box-sizing:border-box; }
    html,body { width:1920px; height:1080px; background:
      linear-gradient(135deg, #0f1629 0%, #162040 55%, #0f1d38 100%); overflow:hidden; }
    .badge { position:absolute; top:64px; left:130px; display:flex; align-items:center; gap:14px; }
    .badge .l { width:34px; height:3px; background:#4f6ef7; }
    .badge .t { font-family:'DM Mono',monospace; font-size:20px; letter-spacing:6px; color:rgba(255,255,255,0.7); text-transform:uppercase; }
    .caption {
      position:absolute; left:130px; top:130px; max-width:480px;
      font-family:'Bebas Neue', Georgia, serif; font-size:52px; color:#fff; line-height:1.05;
    }
    .device {
      position:absolute; left:50%; top:50%; transform:translate(-50%,-50%);
      width:454px; height:960px; background:#05070d; border-radius:54px;
      padding:16px; box-shadow: 0 40px 100px rgba(0,0,0,0.55), 0 0 0 2px rgba(255,255,255,0.06);
    }
    .notch {
      position:absolute; left:50%; top:16px; transform:translateX(-50%);
      width:150px; height:26px; background:#05070d; border-radius:0 0 18px 18px; z-index:2;
    }
    .screen {
      width:100%; height:100%; border-radius:38px; overflow:hidden; background:#0d1427;
    }
    iframe { width:422px; height:928px; border:0; display:block; }
  </style></head>
  <body>
    <div class="badge"><div class="l"></div><div class="t">Acalink</div></div>
    <div class="caption">Parent<br/>app</div>
    <div class="device">
      <div class="notch"></div>
      <div class="screen"><iframe src="/"></iframe></div>
    </div>
  </body></html>`;
}

export function startParentServer(port) {
  const server = http.createServer((req, res) => {
    let reqPath = decodeURIComponent(req.url.split("?")[0]);
    if (reqPath === "/frame") {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(frameHtml());
      return;
    }
    if (reqPath === "/") reqPath = "/index.html";
    let filePath = path.join(WEB_BUILD_DIR, reqPath);
    if (!filePath.startsWith(WEB_BUILD_DIR)) { res.writeHead(403); res.end(); return; }
    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      filePath = path.join(WEB_BUILD_DIR, "index.html"); // SPA fallback
    }
    const ext = path.extname(filePath);
    fs.readFile(filePath, (err, data) => {
      if (err) { res.writeHead(404); res.end("Not found"); return; }
      res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
      res.end(data);
    });
  });
  return new Promise((resolve) => server.listen(port, () => resolve(server)));
}
