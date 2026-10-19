// The pure parts of linking a school's own PayChangu account.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  connectMode, buildAuthorizeQuery, extractConnectUrl, deriveSchoolWebhookSecret, isFreshLink, LINK_TTL_MS,
} from "../../api/_lib/connectLinkCore.js";

describe("connectMode", () => {
  it("never lets a test key mint a live link", () => {
    assert.equal(connectMode("sec-test-abc"), "test");
    assert.equal(connectMode("sec-live-abc"), "live");
  });
});

describe("buildAuthorizeQuery", () => {
  const base = { clientId: "ca_1", redirectUri: "https://x.test/pay/connected", mode: "live" };
  it("carries the documented parameters", () => {
    const q = new URLSearchParams(buildAuthorizeQuery(base));
    assert.equal(q.get("client_id"), "ca_1");
    assert.equal(q.get("redirect_uri"), "https://x.test/pay/connected");
    assert.equal(q.get("scope"), "payments:write payments:read");
    assert.equal(q.get("mode"), "live");
    assert.equal(q.has("wh_url"), false);
  });
  it("adds the webhook only when both halves are present", () => {
    assert.equal(new URLSearchParams(buildAuthorizeQuery({ ...base, whUrl: "https://x.test/w" })).has("wh_url"), false);
    const q = new URLSearchParams(buildAuthorizeQuery({ ...base, whUrl: "https://x.test/w", whSecret: "s" }));
    assert.equal(q.get("wh_secret"), "s");
  });
});

describe("extractConnectUrl", () => {
  it("finds a named field, then any https URL", () => {
    assert.equal(extractConnectUrl({ data: { authorize_url: "https://a.test/x" } }), "https://a.test/x");
    assert.equal(extractConnectUrl({ status: "success", data: { weird: ["https://b.test/y"] } }), "https://b.test/y");
  });
  it("returns nothing rather than guessing", () => {
    assert.equal(extractConnectUrl({ message: "ok", data: { id: 3 } }), "");
    assert.equal(extractConnectUrl(null), "");
  });
});

describe("deriveSchoolWebhookSecret", () => {
  it("is stable per school and differs between schools", () => {
    const a = deriveSchoolWebhookSecret("master", "SCH-1");
    assert.equal(a, deriveSchoolWebhookSecret("master", "SCH-1"));
    assert.notEqual(a, deriveSchoolWebhookSecret("master", "SCH-2"));
    assert.equal(deriveSchoolWebhookSecret("", "SCH-1"), "");
  });
});

describe("isFreshLink", () => {
  it("expires after the window and rejects nonsense", () => {
    const now = 1_000_000_000;
    assert.equal(isFreshLink(now - 1000, now), true);
    assert.equal(isFreshLink(now - LINK_TTL_MS - 1, now), false);
    assert.equal(isFreshLink(now + 5000, now), false);
    assert.equal(isFreshLink(undefined, now), false);
  });
});
