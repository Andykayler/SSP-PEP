// Which bucket each school on Acalink falls into, for the platform owner.
// Shared by the Schools console and the platform overview so the two never
// disagree about how many schools are waiting.
import { schoolAccess } from "./subscriptionState";

/** "pending" | "trial" | "paying" | "attention" | "legacy" | "closed" */
export function bucketOf(school, access = schoolAccess(school)) {
  if (access.state === "legacy") return "legacy";
  if (school.status === "pending") return "pending";
  if (school.status === "rejected" || school.status === "suspended") return "closed";
  if (access.restricted || access.state === "trial_grace" || access.state === "past_due_grace") return "attention";
  if (school.subscription_status === "active") return "paying";
  return "trial";
}

export function countSchools(schools = []) {
  const c = { pending: 0, trial: 0, paying: 0, attention: 0, legacy: 0, closed: 0 };
  schools.forEach((s) => { c[bucketOf(s, s.access)] += 1; });
  return c;
}

/** Schools on trial whose trial ends within `days`. */
export function trialsEndingWithin(schools = [], days = 7) {
  return schools.filter((s) => {
    const a = s.access || schoolAccess(s);
    return bucketOf(s, a) === "trial" && a.daysLeft !== null && a.daysLeft <= days;
  });
}
