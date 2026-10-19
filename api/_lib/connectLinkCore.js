// api/_lib/connectLinkCore.js
// ─────────────────────────────────────────────────────────────────────────────
// The pure parts of PayChangu Connect: building the authorize-link request,
// finding the link in the reply, and the per-school webhook secret. No network,
// so tests/logic can check them.
//
// Connect Link, from PayChangu's reference:
//   POST https://api.paychangu.com/connect/authorize-link   (Authorization header)
//   query: client_id, redirect_uri, scope, mode (live|test), wh_url, wh_secret
// ─────────────────────────────────────────────────────────────────────────────
import crypto from "node:crypto";

export const CONNECT_SCOPE = "payments:write payments:read";

/** How long a school has to come back from PayChangu after clicking Connect. */
export const LINK_TTL_MS = 30 * 60 * 1000;

/** "live" or "test", read off the key in use — a test key must never mint a live link. */
export function connectMode(secretKey = "") {
  return /^sec-test/i.test(secretKey) ? "test" : "live";
}

/** The query string for the authorize-link call. Optional webhook fields are left out when absent. */
export function buildAuthorizeQuery({ clientId, redirectUri, scope = CONNECT_SCOPE, mode, whUrl, whSecret }) {
  const q = new URLSearchParams({ client_id: clientId, redirect_uri: redirectUri, scope, mode });
  if (whUrl && whSecret) { q.set("wh_url", whUrl); q.set("wh_secret", whSecret); }
  return q.toString();
}

/**
 * The authorization URL in PayChangu's reply. The reference does not show the
 * response body, so named fields are tried first and then the first https URL
 * anywhere in it, rather than assuming one shape.
 */
export function extractConnectUrl(data) {
  const named = ["authorize_url", "authorization_url", "connect_url", "connect_link", "link", "url", "redirect_url"];
  const walk = (node, depth = 0) => {
    if (depth > 4 || node == null) return "";
    if (typeof node === "string") return /^https:\/\//i.test(node) ? node : "";
    if (Array.isArray(node)) { for (const n of node) { const f = walk(n, depth + 1); if (f) return f; } return ""; }
    if (typeof node === "object") {
      for (const k of named) { const f = walk(node[k], depth + 1); if (f) return f; }
      for (const v of Object.values(node)) { const f = walk(v, depth + 1); if (f) return f; }
    }
    return "";
  };
  return walk(data);
}

/** A webhook secret unique to each school, so one school's cannot sign another's events. */
export function deriveSchoolWebhookSecret(master, schoolCode) {
  if (!master || !schoolCode) return "";
  return crypto.createHmac("sha256", master).update(`connect:${schoolCode}`).digest("hex");
}

/** Whether a link started at `startedAtMs` can still be completed. */
export function isFreshLink(startedAtMs, now = Date.now()) {
  return Number.isFinite(startedAtMs) && now - startedAtMs >= 0 && now - startedAtMs <= LINK_TTL_MS;
}
