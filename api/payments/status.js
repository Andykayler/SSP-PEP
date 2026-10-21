// api/payments/status.js
// ─────────────────────────────────────────────────────────────────────────────
// What happened to a checkout. GET /api/payments/status?tx_ref=ACL-FEE-...
//
// The browser polls this after the payer returns from PayChangu. It is not
// merely a read: if the transaction is still pending it runs the same
// verify-and-settle path the webhook uses, so a webhook that never arrives —
// a misconfigured callback URL, a cold start that timed out, a school on a
// connection that dropped mid-request — does not leave a paid family looking
// at an unpaid balance. Whichever of the two gets there first settles it; the
// other finds it already done.
//
// Requires the caller's Firebase ID token, and answers only for a transaction
// that caller is entitled to see: the person who started it, a member of staff
// at the school it belongs to, or the guardian session paying for it.
// ─────────────────────────────────────────────────────────────────────────────
import { cors } from "../_lib/cors.js";
import { adminAuth, adminDb } from "../_lib/firebaseAdmin.js";
import { settleTransaction, TX_COLLECTION } from "../_lib/settle.js";

/** Only the fields the payer's screen needs — never the gateway's raw payload. */
function publicView(tx) {
  return {
    txRef: tx.txRef,
    purpose: tx.purpose,
    status: tx.status,
    amount: tx.amount,
    currency: tx.currency,
    receiptNo: tx.receiptNo || null,
    studentName: tx.studentName || null,
    schoolCode: tx.schoolCode || null,
    periodLabel: tx.periodLabel || null,
  };
}

export default async function handler(req, res) {
  if (cors(req, res)) return;
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const txRef = String(req.query?.tx_ref || req.query?.txRef || "");
  if (!txRef) return res.status(400).json({ error: "Missing tx_ref." });

  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) return res.status(401).json({ error: "Sign in to check a payment." });

  let decoded;
  try {
    decoded = await adminAuth.verifyIdToken(token);
  } catch {
    return res.status(401).json({ error: "Your session has expired." });
  }

  try {
    const snap = await adminDb.collection(TX_COLLECTION).doc(txRef).get();
    if (!snap.exists) return res.status(404).json({ error: "No such payment." });
    const tx = snap.data();

    // Entitlement. The person who opened the checkout always qualifies; a
    // staff member of the same school qualifies because they are the ones who
    // chase a payment that stalled.
    let entitled = tx.initiatedById === decoded.uid;
    if (!entitled && decoded.firebase?.sign_in_provider !== "anonymous") {
      const userSnap = await adminDb.collection("users").doc(decoded.uid).get();
      entitled = userSnap.exists && userSnap.data().schoolCode === tx.schoolCode;
    }
    if (!entitled) return res.status(403).json({ error: "This payment belongs to someone else." });

    if (tx.status === "pending") {
      try {
        await settleTransaction(txRef);
      } catch (err) {
        // Still pending, and the caller will poll again. Reporting the
        // gateway's outage as a payment failure would be worse than silence.
        console.error("[payments] status settlement failed for", txRef, err);
      }
      const after = await adminDb.collection(TX_COLLECTION).doc(txRef).get();
      return res.status(200).json(publicView(after.data()));
    }

    return res.status(200).json(publicView(tx));
  } catch (err) {
    console.error("[payments] status failed:", err);
    return res.status(500).json({ error: "Could not check the payment." });
  }
}
