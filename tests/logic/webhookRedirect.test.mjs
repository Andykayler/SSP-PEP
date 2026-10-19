// A payer's browser sent to the webhook address is passed on to the result page,
// but only for one of our own references.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { payerReturnUrl } from "../../api/_lib/webhookRedirect.js";

describe("payerReturnUrl", () => {
  it("sends a real reference on to the result page", () => {
    assert.equal(
      payerReturnUrl("/api/payments/webhook?tx_ref=ACL-FEE-MVFBJ9S7-5E790E8B", "https://app.test"),
      "https://app.test/pay/return?tx_ref=ACL-FEE-MVFBJ9S7-5E790E8B",
    );
    assert.ok(payerReturnUrl("/x?tx_ref=ACL-SUB-ABC123-DEF456", "https://a.test"));
  });
  it("does not redirect anything that is not one of our references", () => {
    assert.equal(payerReturnUrl("/x?tx_ref=https://evil.test", "https://a.test"), "");
    assert.equal(payerReturnUrl("/x?tx_ref=../../admin", "https://a.test"), "");
    assert.equal(payerReturnUrl("/x", "https://a.test"), "");
  });
});
