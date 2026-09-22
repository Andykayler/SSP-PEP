// A live view of one school's access state.
//
// Subscribes to `schools/{code}` rather than reading it once, so a school
// sitting on the "awaiting approval" screen is let in the moment the platform
// owner approves it, and a suspension takes effect without a refresh.
import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "../../firebase";
import { schoolAccess } from "../../services/subscriptionState";

export default function useSchoolAccess(schoolCode) {
  const [school, setSchool] = useState(null);

  useEffect(() => {
    if (!schoolCode) return undefined;
    return onSnapshot(
      doc(db, "schools", schoolCode),
      (snap) => setSchool(snap.exists() ? { id: snap.id, ...snap.data() } : null),
      // A read failure must never lock a school out.
      () => setSchool(null),
    );
  }, [schoolCode]);

  return { school, access: schoolAccess(school) };
}
