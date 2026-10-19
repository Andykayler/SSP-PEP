// The Connect webhook is record-only; what it records must never contain a secret.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { redact, verifyConnectSignature } from "../../api/_lib/connectWebhook.js";

describe("redact", () => {
  it("hides secret-looking fields at any depth", () => {
    const out = redact({ event: "connected", access_token: "abc", data: { client_secret: "x", name: "School", nested: [{ apiKey: "k" }] } });
    assert.equal(out.event, "connected");
    assert.equal(out.access_token, "[redacted]");
    assert.equal(out.data.client_secret, "[redacted]");
    assert.equal(out.data.name, "School");
    assert.equal(out.data.nested[0].apiKey, "[redacted]");
  });
  it("cuts very long strings", () => {
    assert.ok(redact({ a: "x".repeat(500) }).a.length < 300);
  });
});

describe("verifyConnectSignature", () => {
  it("accepts a matching HMAC and rejects anything else", () => {
    process.env.PAYCHANGU_CONNECT_WEBHOOK_SECRET = "s3cret";
    const body = '{"a":1}';
    const sig = crypto.createHmac("sha256", "s3cret").update(body).digest("hex");
    assert.equal(verifyConnectSignature(body, sig), true);
    assert.equal(verifyConnectSignature(body, "deadbeef"), false);
    assert.equal(verifyConnectSignature(body, ""), false);
  });
});
