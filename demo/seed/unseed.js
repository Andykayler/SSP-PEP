// demo/seed/unseed.js
// Deletes everything the seed script wrote for env.schoolCode, and disables
// (does not delete) the four staff Auth accounts. Every query below filters
// on schoolCode — this cannot touch another tenant's data.
import { db, auth } from "./admin.js";
import { env } from "../lib/env.js";

const { schoolCode } = env;
const CLASS_ID = `${schoolCode}_form3A`;

async function deleteWhereSchoolCode(collection) {
  const snap = await db.collection(collection).where("schoolCode", "==", schoolCode).get();
  const batchSize = 400;
  for (let i = 0; i < snap.docs.length; i += batchSize) {
    const batch = db.batch();
    snap.docs.slice(i, i + batchSize).forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }
  console.log(`  ${collection}: deleted ${snap.size}`);
}

async function main() {
  console.log(`Removing demo tenant "${schoolCode}"…\n`);

  for (const c of [
    "students", "ca_marks", "attendance", "discipline_cases", "report_cards",
    "timetable", "lesson_sessions", "fee_structures", "fee_assignments",
    "payments", "school_classes", "users",
  ]) {
    await deleteWhereSchoolCode(c);
  }

  await db.collection("schools").doc(schoolCode).delete();
  await db.collection("school_settings").doc(schoolCode).delete();
  await db.collection("school_geofences").doc(schoolCode).delete();
  console.log("  schools / school_settings / school_geofences: deleted");

  for (const staff of [env.admin, env.headteacher, env.teacher, env.bursar]) {
    try {
      const u = await auth.getUserByEmail(staff.email);
      await auth.updateUser(u.uid, { disabled: true });
      console.log(`  disabled auth user: ${staff.email}`);
    } catch (err) {
      if (err.code !== "auth/user-not-found") throw err;
    }
  }

  console.log("\nDone.");
}

main().catch((err) => { console.error("Unseed failed:", err); process.exit(1); });
