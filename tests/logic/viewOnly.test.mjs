// The director's view-only wrapper decides, from a control's label, whether to
// take it away. Too eager and a director loses filters and tabs; too lax and
// they are offered buttons that can only fail.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { looksLikeWrite, isDismissal } from "../../src/components/ui/viewOnlyCore.js";

describe("looksLikeWrite", () => {
  it("catches the verbs that change records", () => {
    for (const label of ["Add class", "+ New student", "Edit", "Delete", "Save changes",
      "Approve", "Decline", "Send reminder", "Enrol student", "Issue report card", "Import CSV"]) {
      assert.equal(looksLikeWrite(label), true, label);
    }
  });

  it("leaves tabs, filters and exports alone", () => {
    for (const label of ["Records", "Sent", "All", "Export CSV", "Print", "View", "Next",
      "Clear filters", "Apply", "Search", "Address book", "Today", "Download PDF"]) {
      assert.equal(looksLikeWrite(label), false, label);
    }
  });

  it("ignores sentences and cards, which are not button labels", () => {
    assert.equal(looksLikeWrite("Add a student to the school roll and place them in a class"), false);
    assert.equal(looksLikeWrite(""), false);
    assert.equal(looksLikeWrite(null), false);
  });
});

describe("isDismissal", () => {
  it("keeps close and cancel usable", () => {
    assert.equal(isDismissal("Cancel"), true);
    assert.equal(isDismissal("Close"), true);
    assert.equal(isDismissal("Edit"), false);
  });
});
