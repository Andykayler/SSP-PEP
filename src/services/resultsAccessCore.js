// Whether a family may see a child's results. Pure, shared by the parent
// results endpoint (api/parent/results.js), report-card issuing and the
// bursar's screens, so all three always agree.
//
// The rule: results stay hidden while the family owes fees, unless the bursar
// has released them for that term. A head teacher's clearance decision that
// withholds the report card (fee_clearance) is honoured on top of that.

export const RELEASES = "results_release";

export function releaseId(schoolCode, studentId, term) {
  return `${schoolCode}__${studentId}__${String(term).replace(/\s+/g, "_")}`;
}

/** Clearance statuses (src/services/feeClearance.js) that withhold the report card. */
const REPORT_BLOCKING = ["exams_only", "blocked"];

export function releaseActive(release, term) {
  return Boolean(release && release.status === "approved" && (!term || release.term === term));
}

/**
 * @param {{ balance: number, release?: object, clearance?: object, term?: string }} input
 * @returns {{ visible: boolean, reason: null|"clearance"|"balance" }}
 */
export function resultsAccess({ balance = 0, release = null, clearance = null, term = "" }) {
  if (clearance && REPORT_BLOCKING.includes(clearance.status)) {
    return { visible: false, reason: "clearance" };
  }
  if (Number(balance) > 0 && !releaseActive(release, term)) {
    return { visible: false, reason: "balance" };
  }
  return { visible: true, reason: null };
}

/** What the family is told, in words they can act on. */
export function withheldMessage({ reason, balance = 0, term = "", clearance = null, currency = "MK" }) {
  if (reason === "clearance") {
    return clearance?.reason
      ? String(clearance.reason)
      : `The school has withheld ${term || "this term's"} results. Please contact the school office.`;
  }
  const owed = `${currency} ${Number(balance || 0).toLocaleString("en-GB")}`;
  return `Results for ${term || "this term"} will show once the outstanding fee balance of ${owed} is cleared, `
    + "or the bursar releases them. Please contact the finance office.";
}
