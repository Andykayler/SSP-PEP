// demo/seed/roster.js
// The demo tenant's Form 3A class: realistic Malawian learner names, real
// MANEB secondary subjects, and plausible marks generated with a fixed seed
// so re-running `npm run seed` produces the same tenant, not a new random one.
// Every name here is invented — no relation to any real learner in this or
// any other tenant.
import { env } from "../lib/env.js";

// src/pages/admin/modules/constants.js — SECONDARY_SUBJECTS. Using a 6-subject
// slice (one teacher's realistic load) rather than the full 12, so the seed
// stays fast and the report card still has substance.
export const SUBJECTS = ["English", "Mathematics", "Biology", "Chemistry", "Agriculture", "Life Skills"];

export const ASSESSMENT_TYPES = [
  { id: "CA1", weight: 0.10 },
  { id: "CA2", weight: 0.10 },
  { id: "MidTerm", weight: 0.20 },
  { id: "EndTerm", weight: 0.60 },
];

const FIRST_NAMES = [
  "Chisomo", "Thandizo", "Mphatso", "Chikondi", "Tadala", "Blessings", "Yamikani",
  "Takondwa", "Limbani", "Chifundo", "Zione", "Alinafe", "Precious", "Patuma",
  "Esnart", "Loveness", "Enelesi", "Memory", "Beatrice", "Kondwani", "Dalitso",
  "Innocent", "Gift", "Foster", "Davie", "Rodrick", "Cliff", "Ndaziona", "Vitumbiko",
  "Grace",
];

const SURNAMES = [
  "Phiri", "Mvula", "Nyirenda", "Kachingwe", "Mbewe", "Chirwa", "Gondwe",
  "Zimba", "Chunga", "Kanyenda", "Msukwa", "Chilenga", "Tembo", "Sakala",
  "Chapola", "Kumwenda", "Nkhoma", "Chimwendo", "Mangani", "Chisale", "Longwe",
  "Kachale", "Banda",
];

/** Small deterministic PRNG (mulberry32) so the roster is stable across re-seeds. */
function rng(seed) {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = rng(20260910);
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

/** Builds the class roster. The named learner (env.learnerName) is inserted
 * with a deliberately tellable story: weak-but-rising in Mathematics, strong
 * and steady in Biology — the shape that makes the AI insight worth reading
 * on camera rather than a generic "doing fine" line. */
export function buildRoster() {
  const used = new Set();
  const students = [];

  const [learnerFirst, learnerLast] = env.learnerName.split(" ");

  const makeName = () => {
    let name;
    do {
      name = `${pick(FIRST_NAMES)} ${pick(SURNAMES)}`;
    } while (used.has(name));
    used.add(name);
    return name;
  };
  used.add(env.learnerName);

  const COUNT = 27; // + the named learner = 28, a believable Form 3A size

  for (let i = 0; i < COUNT; i++) {
    const [firstName, lastName] = makeName().split(" ");
    // Each student gets a per-subject baseline ability so marks aren't noise —
    // a student strong in English is plausibly strong in Life Skills too, and
    // weak in the sciences, the way real cohorts cluster.
    const base = clamp(Math.round(rand() * 55 + 30), 25, 92); // 25-92
    const spread = {};
    SUBJECTS.forEach((s) => {
      spread[s] = clamp(Math.round(base + (rand() - 0.5) * 30), 15, 98);
    });
    students.push({
      id: `S${String(i + 1).padStart(3, "0")}`,
      firstName, lastName,
      fullName: `${firstName} ${lastName}`,
      gender: rand() > 0.5 ? "Female" : "Male",
      guardianName: `${pick(["Agnes", "Joseph", "Esther", "Peter", "Ruth", "Samuel", "Mary", "James"])} ${lastName}`,
      guardianPhone: `+2659${String(90000000 + Math.floor(rand() * 9999999)).slice(0, 8)}`,
      subjectBaselines: spread,
      trend: 0, // flat: CA1..EndTerm hover around baseline with small jitter
    });
  }

  // The named learner: rising Mathematics (41 -> 63 across the term), strong
  // steady Biology (~70s), mid-pack everywhere else. Matches the story scene
  // 03's AI insight is meant to tell.
  students.splice(9, 0, {
    id: "S000",
    firstName: learnerFirst,
    lastName: learnerLast || "Banda",
    fullName: env.learnerName,
    gender: "Male",
    guardianName: "Agnes Banda",
    guardianPhone: env.parent.phone,
    parentPortalPassword: env.parent.password,
    subjectBaselines: {
      English: 60, Mathematics: 41, Biology: 70, Chemistry: 58, Agriculture: 62, "Life Skills": 66,
    },
    trend: { Mathematics: [50, 55, 60, 63] }, // explicit CA1..EndTerm override
  });

  return students;
}

/** Marks for one student across the four assessments of the term. */
export function marksForStudent(student) {
  const out = {};
  SUBJECTS.forEach((subject) => {
    const explicit = student.trend?.[subject];
    if (explicit) {
      out[subject] = ASSESSMENT_TYPES.map((a, i) => explicit[i]);
      return;
    }
    const base = student.subjectBaselines[subject];
    out[subject] = ASSESSMENT_TYPES.map(() => clamp(Math.round(base + (rand() - 0.5) * 14), 10, 99));
  });
  return out; // { subject: [CA1, CA2, MidTerm, EndTerm] }
}
