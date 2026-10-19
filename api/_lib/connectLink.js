// api/_lib/connectLink.js
// ─────────────────────────────────────────────────────────────────────────────
// The two server steps of a school linking its own PayChangu account. Reached
// through api/payments/initiate.js (action: connect_start / connect_complete)
// because Vercel's plan caps the number of functions and this endpoint already
// carries the same authentication.
//
//   connect_start     an ADMINISTRATOR asks for a link. We note that they did
//                     (the redirect carries no `state`, so this note is what
//                     ties the browser coming back to a school), ask PayChangu
//                     for the authorization URL and hand it over.
//   connect_complete  the browser is back from PayChangu with whatever it was
//                     given. We keep it, untouched, where no browser can read
//                     it, and log the NAMES of what arrived — never the values.
//
// Nothing here spends or moves money, and nothing yet USES the token it keeps:
// how an access token is exchanged and used to charge on a school's behalf is
// a separate step. Storing is the part that cannot be done later, because the
// redirect only happens once.
// ─────────────────────────────────────────────────────────────────────────────
import { adminDb, FieldValue } from "./firebaseAdmin.js";
import { createConnectLink } from "./paychangu.js";
import {
  connectMode, deriveSchoolWebhookSecret, isFreshLink,
} from "./connectLinkCore.js";

export const LINKS = "connect_links";

function adminOf(auth) {
  if (auth.isAnonymous || auth.user?.role !== "admin" || !auth.user?.schoolCode) {
    return { error: "Only the school administrator can connect a PayChangu account.", status: 403 };
  }
  return { schoolCode: auth.user.schoolCode };
}

export async function startConnect({ auth, origin }) {
  const who = adminOf(auth);
  if (who.error) return who;

  const clientId = process.env.PAYCHANGU_CONNECT_CLIENT_ID;
  if (!clientId) return { error: "PayChangu Connect is not set up on this deployment yet.", status: 503 };

  const redirectUri = process.env.PAYCHANGU_CONNECT_REDIRECT_URI || `${origin}/pay/connected`;
  const mode = connectMode(process.env.PAYCHANGU_SECRET_KEY);
  const master = process.env.PAYCHANGU_CONNECT_WEBHOOK_SECRET;

  const { url } = await createConnectLink({
    clientId,
    redirectUri,
    mode,
    whUrl: master ? `${origin}/api/payments/webhook?source=connect&school=${encodeURIComponent(who.schoolCode)}` : "",
    whSecret: deriveSchoolWebhookSecret(master, who.schoolCode),
  });

  await adminDb.collection(LINKS).doc(who.schoolCode).set({
    schoolCode: who.schoolCode,
    status: "link_created",
    mode,
    startedById: auth.uid,
    startedAt: FieldValue.serverTimestamp(),
    startedAtMs: Date.now(),
  }, { merge: true });

  return { url };
}

export async function completeConnect({ auth, body }) {
  const who = adminOf(auth);
  if (who.error) return who;

  const ref = adminDb.collection(LINKS).doc(who.schoolCode);
  const snap = await ref.get();
  const note = snap.exists ? snap.data() : null;
  if (!note || note.startedById !== auth.uid || !isFreshLink(note.startedAtMs)) {
    return { error: "This connection was not started from here, or it has expired. Start again from School Settings.", status: 409 };
  }

  const params = body?.params && typeof body.params === "object" ? body.params : {};
  const names = Object.keys(params).slice(0, 20);
  const kept = Object.fromEntries(names.map((k) => [k, String(params[k]).slice(0, 4000)]));
  if (names.length === 0) return { error: "PayChangu sent nothing back.", status: 400 };

  await ref.set({
    status: "returned",
    returnedParams: kept,
    returnedAt: FieldValue.serverTimestamp(),
  }, { merge: true });

  console.log("[connect] returned to", who.schoolCode, "with", names.join(", "));
  return { ok: true, names };
}
