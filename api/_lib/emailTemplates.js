// api/_lib/emailTemplates.js
// ─────────────────────────────────────────────────────────────────────────────
// Acalink's transactional emails, in the landing page's look: paper
// background, navy ink, the blue button, a serif heading.
//
// Written for how email clients actually behave, which also happens to be
// what keeps mail out of spam folders:
//   • table layout and inline styles only — Gmail and Outlook strip <style>
//     blocks and ignore flex/grid;
//   • every message ships a plain-text part alongside the HTML;
//   • links are written out in full on our own domain — no link shorteners,
//     no tracking redirects, no URL that doesn't match the sender;
//   • one clear call to action, a real signature, and a line saying why the
//     recipient is getting this.
// Pure functions: tests/logic/emailTemplates.test.mjs renders them.
// ─────────────────────────────────────────────────────────────────────────────

const INK = "#16213e";
const INK_2 = "#4a5470";
const PAPER = "#faf6ec";
const CARD = "#fffdf8";
const BLUE = "#3b56d9";
const LINE = "#e8e0cc";
const SERIF = "Georgia, 'Times New Roman', serif";
const SANS = "'Segoe UI', Helvetica, Arial, sans-serif";

export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const fmtDate = (ms) =>
  new Date(ms).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Africa/Blantyre" });

/** One paragraph of body text. */
const p = (html) =>
  `<p style="margin:0 0 16px;font-family:${SANS};font-size:15px;line-height:1.65;color:${INK_2};">${html}</p>`;

/** A bulletproof button: a table cell, so it renders even where CSS doesn't. */
function button(label, href) {
  return `
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 24px;">
  <tr><td style="border-radius:12px;background:${BLUE};">
    <a href="${escapeHtml(href)}" style="display:inline-block;padding:14px 28px;font-family:${SANS};font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:12px;">${escapeHtml(label)}</a>
  </td></tr>
</table>`;
}

/** A small ruled "exercise book" panel for key facts. */
function factSheet(rows) {
  const body = rows.map(([k, v]) => `
    <tr>
      <td style="padding:9px 0;border-bottom:1px solid ${LINE};font-family:${SANS};font-size:13px;color:${INK_2};width:42%;">${escapeHtml(k)}</td>
      <td style="padding:9px 0;border-bottom:1px solid ${LINE};font-family:${SANS};font-size:14px;font-weight:600;color:${INK};">${escapeHtml(v)}</td>
    </tr>`).join("");
  return `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 24px;border-left:2px solid #e3a598;padding-left:14px;">
  <tr><td style="padding-left:14px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${body}</table>
  </td></tr>
</table>`;
}

/**
 * The frame every Acalink email shares.
 * `preheader` is the grey preview line an inbox shows under the subject.
 */
function layout({ preheader, eyebrow, heading, bodyHtml, footnote, appUrl }) {
  const site = appUrl ? appUrl.replace(/\/$/, "") : "";
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light only">
<title>${escapeHtml(heading)}</title>
</head>
<body style="margin:0;padding:0;background:${PAPER};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${PAPER};">
  <tr><td align="center" style="padding:32px 16px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;">
      <tr><td style="padding:0 4px 20px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
          <td style="width:34px;height:34px;border-radius:10px;background:${BLUE};text-align:center;vertical-align:middle;font-family:${SERIF};font-size:18px;font-weight:700;color:#ffffff;">A</td>
          <td style="padding-left:10px;font-family:${SERIF};font-size:21px;font-weight:700;color:${INK};">Acalink</td>
        </tr></table>
      </td></tr>
      <tr><td style="background:${CARD};border:1px solid ${LINE};border-radius:18px;padding:36px 32px;">
        <p style="margin:0 0 10px;font-family:'Courier New',monospace;font-size:12px;letter-spacing:1.5px;text-transform:uppercase;color:${BLUE};">${escapeHtml(eyebrow)}</p>
        <h1 style="margin:0 0 18px;font-family:${SERIF};font-size:27px;line-height:1.2;font-weight:700;color:${INK};">${escapeHtml(heading)}</h1>
        ${bodyHtml}
      </td></tr>
      <tr><td style="padding:22px 8px 0;font-family:${SANS};font-size:12px;line-height:1.6;color:#7a8199;">
        ${footnote}<br>
        Acalink — school management for Malawi${site ? ` · <a href="${escapeHtml(site)}" style="color:#7a8199;">${escapeHtml(site.replace(/^https?:\/\//, ""))}</a>` : ""}
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;
}

// ─── The emails ─────────────────────────────────────────────────────────────

export function verificationEmail({ name, link, appUrl }) {
  const who = name ? `Hello ${escapeHtml(name)},` : "Hello,";
  return {
    subject: "Confirm your email for Acalink",
    html: layout({
      appUrl,
      preheader: "One click to confirm your email and finish setting up your school on Acalink.",
      eyebrow: "Confirm your email",
      heading: "One click and you're in.",
      bodyHtml:
        p(who) +
        p("Thanks for registering your school on Acalink. Please confirm this is your email address, so we can reach you about your school's approval and account.") +
        button("Confirm my email", link) +
        p(`If the button doesn't work, copy this link into your browser:<br><a href="${escapeHtml(link)}" style="color:${BLUE};word-break:break-all;">${escapeHtml(link)}</a>`),
      footnote: "You're receiving this because this address was used to register a school on Acalink. If that wasn't you, you can ignore this email.",
    }),
    text: [
      name ? `Hello ${name},` : "Hello,",
      "",
      "Thanks for registering your school on Acalink. Please confirm your email address:",
      link,
      "",
      "If you didn't register, you can ignore this email.",
      "— Acalink",
    ].join("\n"),
  };
}

export function newRegistrationEmail({ school, adminEmail, consoleUrl, appUrl }) {
  const rows = [
    ["School", school.name || school.code],
    ["School code", school.code],
    ["District", school.district || "—"],
    ["Contact", [adminEmail, school.phone].filter(Boolean).join(" · ") || "—"],
  ];
  return {
    subject: `New school awaiting approval: ${school.name || school.code}`,
    html: layout({
      appUrl,
      preheader: `${school.name || school.code} has registered and is waiting for your approval.`,
      eyebrow: "Pending approval",
      heading: `${school.name || "A new school"} has registered.`,
      bodyHtml:
        p("A new school has signed up on Acalink and is waiting for your approval. Their staff can't use the platform until you approve it.") +
        factSheet(rows) +
        button("Review in the back office", consoleUrl),
      footnote: "You're receiving this because you're an Acalink platform owner.",
    }),
    text: [
      `${school.name || school.code} has registered on Acalink and is waiting for approval.`,
      "",
      ...rows.map(([k, v]) => `${k}: ${v}`),
      "",
      `Review it: ${consoleUrl}`,
    ].join("\n"),
  };
}

export function approvedEmail({ school, trialEndsMs, signinUrl, appUrl }) {
  const trial = trialEndsMs ? fmtDate(trialEndsMs) : "";
  const days = trialEndsMs ? Math.max(0, Math.round((trialEndsMs - Date.now()) / 86_400_000)) : 0;
  const rows = [
    ["School", school.name || school.code],
    ["School code", school.code],
    ...(trial ? [["Free trial", `${days} days, until ${trial}`]] : []),
  ];
  return {
    subject: `${school.name || "Your school"} is approved — welcome to Acalink`,
    html: layout({
      appUrl,
      preheader: trial
        ? `Your school is approved. Your free trial runs until ${trial}.`
        : "Your school is approved and ready to use.",
      eyebrow: "Approved",
      heading: `Welcome aboard, ${school.name || "your school"}.`,
      bodyHtml:
        p("Good news — your school has been approved and your Acalink account is ready.") +
        factSheet(rows) +
        p(trial
          ? `Everything is included during your free trial. We'll remind you before it ends on <strong style="color:${INK};">${escapeHtml(trial)}</strong>, and you can subscribe any time from <strong style="color:${INK};">Billing</strong>.`
          : "You can start setting up your school straight away.") +
        p("When you sign in, a short two-step setup gets your school ready: first the basics, then your classes, subjects and settings.") +
        button("Sign in and set up", signinUrl),
      footnote: "You're receiving this because you registered this school on Acalink.",
    }),
    text: [
      `${school.name || "Your school"} is approved — welcome to Acalink.`,
      "",
      ...rows.map(([k, v]) => `${k}: ${v}`),
      "",
      trial ? `Your free trial runs until ${trial}.` : "",
      "Sign in to set up your school (two short steps):",
      signinUrl,
    ].filter((l) => l !== undefined).join("\n"),
  };
}

export function rejectedEmail({ school, reason, appUrl }) {
  return {
    subject: `About your Acalink registration: ${school.name || school.code}`,
    html: layout({
      appUrl,
      preheader: "An update on your school's registration.",
      eyebrow: "Registration update",
      heading: "We couldn't approve this registration.",
      bodyHtml:
        p(`Thank you for registering <strong style="color:${INK};">${escapeHtml(school.name || school.code)}</strong> on Acalink. We weren't able to approve it this time.`) +
        (reason ? factSheet([["Reason", reason]]) : "") +
        p("If you think this is a mistake, simply reply to this email and we'll help."),
      footnote: "You're receiving this because you registered this school on Acalink.",
    }),
    text: [
      `We couldn't approve the registration for ${school.name || school.code}.`,
      reason ? `Reason: ${reason}` : "",
      "Reply to this email if you think this is a mistake.",
    ].filter(Boolean).join("\n"),
  };
}
