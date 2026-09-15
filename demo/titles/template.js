// demo/titles/template.js
// One HTML template for every title/closing card, built from the app's own
// design tokens (src/styles/design-system.css) rather than invented colors —
// same Bebas Neue / DM Sans / DM Mono stack, same navy/indigo palette, so the
// cards look like they belong to the product being demoed.
export function brandShell({ bodyHtml, extraCss = "" }) {
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<style>
  @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,500;0,9..40,700;1,9..40,400&family=DM+Mono:wght@400;500&display=swap');
  :root {
    --bg-primary:   #0d1427;
    --bg-secondary: #111d35;
    --hero-bg: linear-gradient(135deg, #0f1629 0%, #162040 55%, #0f1d38 100%);
    --primary:      #4f6ef7;
    --primary-light:#7b96ff;
    --secondary:    #0ea5b0;
    --warning:      #e8a800;
    --danger:       #ef4444;
    --success:      #22c55e;
    --text-primary: #ffffff;
    --text-secondary: rgba(255,255,255,0.62);
    --text-muted:   rgba(255,255,255,0.38);
    --border-color: rgba(79,110,247,0.22);
    --font-display: 'Bebas Neue', Georgia, serif;
    --font-body:    'DM Sans', 'Helvetica Neue', sans-serif;
    --font-mono:    'DM Mono', monospace;
  }
  * { box-sizing: border-box; }
  html, body {
    margin: 0; padding: 0; width: 1920px; height: 1080px;
    background: var(--hero-bg);
    color: var(--text-primary);
    font-family: var(--font-body);
    overflow: hidden;
  }
  .frame {
    position: relative;
    width: 1920px; height: 1080px;
    display: flex; flex-direction: column;
    justify-content: center; align-items: flex-start;
    padding: 120px 160px;
  }
  .badge {
    display: flex; align-items: center; gap: 14px;
    position: absolute; top: 72px; left: 160px;
  }
  .badge .line { width: 34px; height: 3px; background: var(--primary); }
  .badge .label {
    font-family: var(--font-mono); font-size: 22px; letter-spacing: 6px;
    text-transform: uppercase; color: var(--text-secondary);
  }
  .kicker {
    font-family: var(--font-mono); font-size: 24px; letter-spacing: 4px;
    text-transform: uppercase; color: var(--secondary); margin-bottom: 22px;
  }
  h1 {
    font-family: var(--font-display); font-weight: 400;
    font-size: 108px; line-height: 1.02; margin: 0 0 28px 0;
    letter-spacing: 0.5px; max-width: 1500px;
  }
  h1 .accent { color: var(--primary-light); }
  p.sub {
    font-family: var(--font-body); font-size: 34px; font-weight: 400;
    color: var(--text-secondary); max-width: 1300px; line-height: 1.4; margin: 0;
  }
  .footer-line {
    position: absolute; bottom: 72px; left: 160px; right: 160px;
    display: flex; justify-content: space-between; align-items: center;
    font-family: var(--font-mono); font-size: 20px; color: var(--text-muted);
    letter-spacing: 2px; text-transform: uppercase;
  }
  .rail { position: absolute; left: 0; top: 0; bottom: 0; width: 10px; background: var(--primary); }
  ${extraCss}
</style>
</head>
<body>
  <div class="frame">
    <div class="rail"></div>
    <div class="badge"><div class="line"></div><div class="label">Acalink</div></div>
    ${bodyHtml}
    <div class="footer-line"><span>Emerging Technologies Demo</span><span>2026</span></div>
  </div>
</body>
</html>`;
}
