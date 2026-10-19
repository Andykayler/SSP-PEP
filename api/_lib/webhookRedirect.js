// api/_lib/webhookRedirect.js
// ─────────────────────────────────────────────────────────────────────────────
// PayChangu sometimes sends the PAYER'S BROWSER to the webhook address after a
// payment (a GET carrying ?tx_ref=…), not just its server (a POST). This works
// out where that browser should go instead of a JSON error: the result page.
// Only one of our own references is ever passed on, so the address cannot be
// used to bounce someone anywhere else.
// ─────────────────────────────────────────────────────────────────────────────

// Our own references only: ACL-FEE-… / ACL-SUB-….
const TX_REF = /^ACL-[A-Z]{3}-[A-Z0-9]+-[A-Z0-9]+$/;

/** The result-page URL for a browser GET to the webhook, or "" if it should not be redirected. */
export function payerReturnUrl(requestUrl, origin) {
  const ref = new URL(requestUrl || "/", "http://localhost").searchParams.get("tx_ref") || "";
  return TX_REF.test(ref) ? `${origin}/pay/return?tx_ref=${encodeURIComponent(ref)}` : "";
}
