// src/hooks/useCampusScope.js
// ─────────────────────────────────────────────────────────────────────────────
// "Which campuses may this person see, and which one are they looking at?"
//
// Every module that lists campus-tagged records asks the same two questions, so
// they are answered once here rather than in each one. The alternative — each
// module doing its own filtering — is how a school ends up with a roll that is
// campus-scoped in Student Management and not in Attendance, which is worse
// than no scoping at all: staff learn the boundary is unreliable and stop
// trusting any of it.
//
// Returns `visible`, the campuses this user may work in, and `scope(rows)`,
// which narrows any array of campus-tagged records to what they should see —
// honouring the campus they have picked from the filter, if any.
//
// See the CAMPUS SCOPING note in firestore.rules for why this boundary is
// applied here and not in security rules.
// ─────────────────────────────────────────────────────────────────────────────
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  subscribeCampuses, visibleCampuses, scopeToCampus, canAccessCampus,
} from "../services/campuses";

export default function useCampusScope(schoolCode, viewer) {
  const [campuses, setCampuses] = useState([]);
  const [campusFilter, setCampusFilter] = useState("all");

  useEffect(() => subscribeCampuses(schoolCode, setCampuses), [schoolCode]);

  const visible = useMemo(() => visibleCampuses(viewer, campuses), [viewer, campuses]);

  // The picker only earns its space once there is a genuine choice to make. A
  // single-campus school, or a teacher attached to one site, never sees it.
  const multiCampus = visible.length > 1;

  const primaryId = useMemo(
    () => campuses.find((c) => c.isPrimary)?.id || campuses[0]?.id || "",
    [campuses],
  );

  // A filter left pointing at a campus this user no longer has access to — or
  // at one that has not loaded yet — would silently show an empty list, which
  // reads as data loss rather than as a permissions change. Corrected by
  // deriving rather than by an effect that writes state back: the campus list
  // arrives asynchronously, so an effect would fire on every load.
  const effectiveFilter =
    campusFilter !== "all" && visible.some((c) => c.id === campusFilter) ? campusFilter : "all";

  const scope = useCallback(
    (rows = []) => {
      if (!Array.isArray(rows)) return [];
      // Records written before campuses existed carry no campusId; they belong
      // to the primary site, which is what every other screen assumes too.
      const tagged = rows.map((r) => (r.campusId ? r : { ...r, campusId: primaryId }));
      return scopeToCampus(tagged, viewer, effectiveFilter === "all" ? null : effectiveFilter);
    },
    [viewer, effectiveFilter, primaryId],
  );

  const canSee = useCallback(
    (campusId) => canAccessCampus(viewer, campusId || primaryId),
    [viewer, primaryId],
  );

  return {
    campuses, visible, multiCampus, scope, canSee, primaryId,
    campusFilter: effectiveFilter, setCampusFilter,
  };
}
