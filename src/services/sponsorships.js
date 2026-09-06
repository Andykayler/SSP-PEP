// src/services/sponsorships.js
// ─────────────────────────────────────────────────────────────────────────────
// Who is paying for this child, and how much of it.
//
// Mission and grant-aided schools are full of part-funded students — a diocese
// covering tuition but not boarding, an NGO paying half, a district bursary
// that lapses if nobody renews it. None of that fits a model where fees are
// owed by one guardian, so schools keep it in a separate exercise book and the
// two never reconcile. The visible cost is a sponsored child sent home for
// fees a sponsor had already paid.
//
// Two collections, because sponsors outlive sponsorships: `sponsors` is the
// organisation or person, `sponsorships` is one agreement covering one student
// for a stretch of terms.
// ─────────────────────────────────────────────────────────────────────────────
import { db } from "../firebase";
import {
  collection, query, where, getDocs, doc, setDoc, addDoc, updateDoc,
  deleteDoc, serverTimestamp,
} from "firebase/firestore";
import { termRank, compareTerms } from "./feeClearance";

export const SPONSORS = "sponsors";
export const SPONSORSHIPS = "sponsorships";

export const SPONSOR_TYPES = [
  { id: "church",       label: "Church or mission" },
  { id: "ngo",          label: "NGO or charity" },
  { id: "government",   label: "Government bursary" },
  { id: "company",      label: "Company" },
  { id: "individual",   label: "Individual" },
];

export const COVERAGE_TYPES = [
  { id: "full",       label: "Full fees",   hint: "The sponsor covers everything charged." },
  { id: "percentage", label: "Percentage",  hint: "A share of whatever is charged." },
  { id: "fixed",      label: "Fixed amount", hint: "A set sum per term, whatever the fee." },
];

export function sponsorTypeLabel(id) {
  return SPONSOR_TYPES.find((t) => t.id === id)?.label || "Sponsor";
}

// ─── Sponsors ────────────────────────────────────────────────────────────────

export async function fetchSponsors(schoolCode) {
  if (!schoolCode) return [];
  try {
    const snap = await getDocs(query(
      collection(db, SPONSORS),
      where("schoolCode", "==", schoolCode),
    ));
    return snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  } catch (err) {
    console.error("[sponsors] could not read sponsors:", err);
    return [];
  }
}

export async function saveSponsor({ schoolCode, sponsor, actor }) {
  const name = String(sponsor?.name || "").trim();
  if (!schoolCode || !name) return { ok: false, error: "A sponsor needs a name." };

  const payload = {
    schoolCode,
    name,
    type: sponsor.type || "individual",
    contactName: String(sponsor.contactName || "").trim(),
    phone: String(sponsor.phone || "").trim(),
    email: String(sponsor.email || "").trim(),
    notes: String(sponsor.notes || "").trim(),
    active: sponsor.active !== false,
    updatedAt: serverTimestamp(),
    updatedBy: actor?.id || "",
  };

  try {
    if (sponsor.id) {
      await updateDoc(doc(db, SPONSORS, sponsor.id), payload);
      return { ok: true, id: sponsor.id };
    }
    const ref = await addDoc(collection(db, SPONSORS), {
      ...payload,
      createdAt: serverTimestamp(),
      createdBy: actor?.id || "",
    });
    return { ok: true, id: ref.id };
  } catch (err) {
    console.error("[sponsors] could not save sponsor:", err);
    return { ok: false, error: err.message };
  }
}

export async function deleteSponsor(id) {
  try {
    await deleteDoc(doc(db, SPONSORS, id));
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

// ─── Sponsorships ────────────────────────────────────────────────────────────

export async function fetchSponsorships(schoolCode) {
  if (!schoolCode) return [];
  try {
    const snap = await getDocs(query(
      collection(db, SPONSORSHIPS),
      where("schoolCode", "==", schoolCode),
    ));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (err) {
    console.error("[sponsors] could not read sponsorships:", err);
    return [];
  }
}

export async function saveSponsorship({ schoolCode, sponsorship, sponsor, student, actor }) {
  if (!schoolCode || !sponsor?.id || !student?.id) {
    return { ok: false, error: "Pick both a sponsor and a student." };
  }
  const coverageType = sponsorship.coverageType || "full";
  const coverageValue = Number(sponsorship.coverageValue) || 0;
  if (coverageType === "percentage" && (coverageValue <= 0 || coverageValue > 100)) {
    return { ok: false, error: "A percentage must be between 1 and 100." };
  }
  if (coverageType === "fixed" && coverageValue <= 0) {
    return { ok: false, error: "Enter the amount the sponsor pays each term." };
  }
  if (!sponsorship.startTerm) return { ok: false, error: "Say which term the sponsorship starts." };
  if (sponsorship.endTerm && compareTerms(sponsorship.endTerm, sponsorship.startTerm) < 0) {
    return { ok: false, error: "The end term cannot come before the start term." };
  }

  const payload = {
    schoolCode,
    sponsorId: sponsor.id,
    sponsorName: sponsor.name || "",
    sponsorType: sponsor.type || "",
    studentId: student.id,
    studentName: student.fullName || "",
    classId: student.classId || "",
    className: student.className || "",
    coverageType,
    coverageValue,
    startTerm: sponsorship.startTerm,
    // An open-ended sponsorship is normal — a diocese does not usually name an
    // end term — so this stays empty rather than being invented.
    endTerm: sponsorship.endTerm || "",
    reference: String(sponsorship.reference || "").trim(),
    notes: String(sponsorship.notes || "").trim(),
    updatedAt: serverTimestamp(),
    updatedBy: actor?.id || "",
  };

  try {
    if (sponsorship.id) {
      await updateDoc(doc(db, SPONSORSHIPS, sponsorship.id), payload);
      return { ok: true, id: sponsorship.id };
    }
    // Deterministic id keeps one agreement per sponsor-student pair, so
    // re-adding the same pairing edits it rather than quietly duplicating it.
    const id = `${schoolCode}__${sponsor.id}__${student.id}`;
    await setDoc(doc(db, SPONSORSHIPS, id), {
      ...payload,
      createdAt: serverTimestamp(),
      createdBy: actor?.id || "",
    }, { merge: true });
    return { ok: true, id };
  } catch (err) {
    console.error("[sponsors] could not save sponsorship:", err);
    return { ok: false, error: err.message };
  }
}

export async function deleteSponsorship(id) {
  try {
    await deleteDoc(doc(db, SPONSORSHIPS, id));
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

// ─── Status ──────────────────────────────────────────────────────────────────

/**
 * Whether an agreement is live in a given term.
 *
 * "Expired" and "not yet started" are told apart because they need different
 * actions: one is a renewal conversation with the sponsor, the other is simply
 * a future arrangement and no cause for alarm.
 */
export function sponsorshipStatus(s, currentTerm) {
  if (!s?.startTerm || !currentTerm) return { id: "unknown", label: "Unknown", tone: "neutral" };
  const now = termRank(currentTerm);
  if (termRank(s.startTerm) > now) {
    return { id: "future", label: "Starts later", tone: "neutral" };
  }
  if (s.endTerm && termRank(s.endTerm) < now) {
    return { id: "expired", label: "Expired", tone: "danger" };
  }
  // An agreement whose last term is the one running now needs renewing before
  // the next one starts, and that is worth saying while there is time to act.
  if (s.endTerm && termRank(s.endTerm) === now) {
    return { id: "ending", label: "Ends this term", tone: "warning" };
  }
  return { id: "active", label: "Active", tone: "success" };
}

/**
 * What the sponsor is expected to cover of a given charge.
 * Never more than the charge itself — a fixed sponsorship larger than the fee
 * does not create a credit the school owes back.
 */
export function expectedContribution(sponsorship, totalCharged) {
  const charged = Number(totalCharged) || 0;
  if (!sponsorship || charged <= 0) return 0;
  switch (sponsorship.coverageType) {
    case "full":       return charged;
    case "percentage": return Math.round(charged * (Number(sponsorship.coverageValue) || 0) / 100);
    case "fixed":      return Math.min(charged, Number(sponsorship.coverageValue) || 0);
    default:           return 0;
  }
}

/** Describes coverage in words, for a table cell. */
export function coverageLabel(s) {
  if (!s) return "";
  if (s.coverageType === "full") return "Full fees";
  if (s.coverageType === "percentage") return `${s.coverageValue}% of fees`;
  return `MK ${Number(s.coverageValue || 0).toLocaleString("en-MW")} per term`;
}

/**
 * Money actually received from sponsors, matched to students.
 *
 * Sponsor payments are ordinary `payments` rows carrying a sponsorId, so they
 * flow through the same receipts and the same balance arithmetic as a parent's
 * cash. Nothing about a sponsored student's ledger is special — only who
 * handed the money over.
 */
export function sponsorPaymentsFor(payments, studentId) {
  return (payments || []).filter((p) => p.studentId === studentId && p.sponsorId);
}
