// src/services/transport.js
// ─────────────────────────────────────────────────────────────────────────────
// School buses: which route a learner rides, where they get on, and how a
// guardian finds out the bus is late.
//
// A route is one document holding its stops and riders together (a bus carries
// tens of children, well within a document), so the manifest a driver carries
// and the list a guardian is told from can never disagree. Delays are the
// point: "the bus is 20 minutes late" is the message a parent standing at a
// roadside actually wants, and the one that costs the school a phone call per
// family when it is not sent.
// ─────────────────────────────────────────────────────────────────────────────
import { db } from "../firebase";
import {
  collection, doc, query, where, getDocs, addDoc, updateDoc, deleteDoc, serverTimestamp,
} from "firebase/firestore";

export const ROUTES = "transport_routes";
export const newId = () => Math.random().toString(36).slice(2, 10);

export async function fetchRoutes(schoolCode) {
  const snap = await getDocs(query(collection(db, ROUTES), where("schoolCode", "==", schoolCode)));
  return snap.docs
    .map((d) => ({ id: d.id, stops: [], riders: [], ...d.data() }))
    .sort((a, b) => (a.name || "").localeCompare(b.name || ""));
}

export async function createRoute({ schoolCode, data, actor }) {
  const ref = await addDoc(collection(db, ROUTES), {
    schoolCode,
    name: data.name.trim(),
    vehicle: (data.vehicle || "").trim(),
    plate: (data.plate || "").trim(),
    driverName: (data.driverName || "").trim(),
    driverPhone: (data.driverPhone || "").trim(),
    capacity: Math.max(1, Number(data.capacity) || 30),
    morningDeparture: data.morningDeparture || "06:30",
    afternoonDeparture: data.afternoonDeparture || "16:00",
    stops: [], riders: [],
    createdBy: actor?.id || "",
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

export const updateRoute = (id, patch) => updateDoc(doc(db, ROUTES, id), { ...patch, updatedAt: serverTimestamp() });
export const deleteRoute = (id) => deleteDoc(doc(db, ROUTES, id));

/** Riders grouped by stop, in stop order, with anyone unassigned last. */
export function manifest(route) {
  const groups = [...route.stops].map((s) => ({ stop: s, riders: [] }));
  const orphans = [];
  route.riders.forEach((r) => {
    const g = groups.find((x) => x.stop.id === r.stopId);
    (g ? g.riders : orphans).push(r);
  });
  groups.forEach((g) => g.riders.sort((a, b) => (a.name || "").localeCompare(b.name || "")));
  if (orphans.length) groups.push({ stop: { id: "", name: "No stop chosen" }, riders: orphans });
  return groups;
}

/** Is another route already carrying this learner? A child rides one bus. */
export function currentRouteOf(routes, studentId, exceptRouteId = "") {
  return routes.find((r) => r.id !== exceptRouteId && r.riders.some((x) => x.studentId === studentId)) || null;
}
