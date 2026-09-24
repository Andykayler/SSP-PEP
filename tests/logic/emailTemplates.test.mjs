// Acalink's transactional emails: each has a subject, an HTML body and a
// plain-text part (mail without one is more likely to be filed as spam), the
// right link, and nothing a school typed can inject HTML.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  verificationEmail, newRegistrationEmail, approvedEmail, rejectedEmail, escapeHtml,
} from "../../api/_lib/emailTemplates.js";

const APP = "https://ssp-pep.vercel.app";

function wellFormed(mail) {
  assert.ok(mail.subject.length > 5);
  assert.match(mail.html, /^<!doctype html>/i);
  assert.ok(mail.text.length > 20, "has a plain-text part");
}

describe("emailTemplates", () => {
  it("verification: branded, with our own link in both parts", () => {
    const link = `${APP}/verify-email?code=abc123`;
    const m = verificationEmail({ name: "Chikho Secondary", link, appUrl: APP });
    wellFormed(m);
    assert.ok(m.html.includes(escapeHtml(link)));
    assert.ok(m.text.includes(link));
    assert.match(m.html, /Acalink/);
  });

  it("new registration: tells the owner which school, and links to the back office", () => {
    const m = newRegistrationEmail({
      school: { name: "Lakeview Academy", code: "MWI-MANG-2026-1234", district: "Mangochi", phone: "+265991000000" },
      adminEmail: "head@lakeview.mw",
      consoleUrl: `${APP}/platform`,
      appUrl: APP,
    });
    wellFormed(m);
    assert.match(m.subject, /Lakeview Academy/);
    assert.ok(m.html.includes(`${APP}/platform`));
    assert.match(m.text, /MWI-MANG-2026-1234/);
  });

  it("approved: states the trial end date", () => {
    const ends = Date.UTC(2026, 10, 1, 12);
    const m = approvedEmail({ school: { name: "Lakeview", code: "X" }, trialEndsMs: ends, signinUrl: `${APP}/signin`, appUrl: APP });
    wellFormed(m);
    assert.match(m.html, /1 November 2026/);
    assert.match(m.text, /1 November 2026/);
    assert.match(m.html, /two-step setup/);
  });

  it("rejected: includes the reason", () => {
    const m = rejectedEmail({ school: { name: "Lakeview", code: "X" }, reason: "Duplicate registration", appUrl: APP });
    wellFormed(m);
    assert.match(m.html, /Duplicate registration/);
  });

  it("escapes anything a school typed", () => {
    const m = newRegistrationEmail({
      school: { name: "<script>alert(1)</script>", code: "X" },
      adminEmail: "a@b.c", consoleUrl: APP, appUrl: APP,
    });
    assert.ok(!m.html.includes("<script>"));
    assert.ok(m.html.includes("&lt;script&gt;"));
  });
});
