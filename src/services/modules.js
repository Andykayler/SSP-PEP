// src/services/modules.js
// ─────────────────────────────────────────────────────────────────────────────
// Optional features a school switches on, and the one place that says what
// they are.
//
// ── Why this exists ─────────────────────────────────────────────────────────
// Optional behaviour used to be a loose field per feature — `schoolType` for
// boarding, `smsFallbackCategories` for messaging — each read directly by the
// screen that cared. That works until there are four of them: nobody can
// answer "what is this school actually paying for", nothing warns that a
// feature costs money before it is switched on, and every new option means
// another bespoke settings card.
//
// So a module is declared once, here, with everything a settings screen needs
// to render it and everything the rest of the app needs to gate on it. Adding
// a module is adding an entry to MODULES — no new settings UI.
//
// ── Shape on the document ───────────────────────────────────────────────────
// `school_settings/{schoolCode}.enabledModules` is an array of module ids.
// Absent means nothing optional is on, which is the correct default for
// anything that bills.
//
// Per-module detail that is not simply on/off — which notification categories
// go to SMS, say — stays in its own field and is owned by that module's own
// service. This file answers "is it on", not "how is it configured".
// ─────────────────────────────────────────────────────────────────────────────
import { db } from "../firebase";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";

/** Field on the settings document. */
export const MODULES_FIELD = "enabledModules";

/**
 * Every optional module.
 *
 * `cost` is the honest answer to "what does this do to my bill", shown next to
 * the switch rather than buried in a contract — a head teacher turning on
 * per-pupil SMS deserves to see that before, not after.
 *
 * `requires` names another module id that must be on first. The AI insight is
 * only ever delivered inside a report SMS, so it is meaningless on its own.
 */
export const MODULES = [
  {
    id: "sms",
    name: "SMS notifications",
    summary:
      "Reach guardians by text message, not only inside the app. Choose which " +
      "notifications go out below once this is on.",
    cost: "Charged per message sent, from your SMS balance.",
    billing: "metered",
  },
  {
    id: "ai_insights",
    name: "AI term insights",
    summary:
      "Adds a short, plain-English summary to each report card — how the term " +
      "went across marks, attendance and conduct, and what to work on next term.",
    cost: "Adds roughly one extra SMS part per pupil per term, plus AI usage.",
    billing: "metered",
    requires: "sms",
  },
];

export function moduleById(id) {
  return MODULES.find((m) => m.id === id) || null;
}

/** The enabled module ids on a settings document, always an array. */
export function enabledModules(settings) {
  const raw = settings?.[MODULES_FIELD];
  if (!Array.isArray(raw)) return [];
  const known = new Set(MODULES.map((m) => m.id));
  return raw.filter((id) => known.has(id));
}

/**
 * Whether a module is usable — on, and with its prerequisite on too.
 *
 * Both halves matter. A school can switch off SMS while AI insights is still
 * ticked, and the insight has nowhere to go; rather than police that at write
 * time, the dependency is enforced on read, so the answer is right however the
 * document got into that state.
 */
export function isModuleOn(settings, id) {
  const on = enabledModules(settings);
  if (!on.includes(id)) return false;
  const requires = moduleById(id)?.requires;
  return !requires || on.includes(requires);
}

/**
 * Turns one module on or off, returning the new list.
 *
 * Switching a module off also switches off anything that depends on it — a
 * school turning off SMS has stopped paying for messages, and leaving a
 * dependent module looking active would misrepresent that.
 */
export function nextModuleState(settings, id, on) {
  const current = new Set(enabledModules(settings));

  if (on) {
    current.add(id);
    // Turning on a dependent module turns on what it needs, rather than
    // silently doing nothing and looking broken.
    const requires = moduleById(id)?.requires;
    if (requires) current.add(requires);
  } else {
    current.delete(id);
    MODULES.filter((m) => m.requires === id).forEach((m) => current.delete(m.id));
  }

  return [...current];
}

/** Persists the module list. Merged, so it cannot clobber other settings. */
export async function setEnabledModules({ schoolCode, modules, actorId = "" }) {
  if (!schoolCode) return { ok: false, error: "No school code." };

  const known = new Set(MODULES.map((m) => m.id));
  const clean = [...new Set((modules || []).filter((id) => known.has(id)))];

  try {
    await setDoc(
      doc(db, "school_settings", schoolCode),
      {
        [MODULES_FIELD]: clean,
        modulesUpdatedAt: serverTimestamp(),
        modulesUpdatedBy: actorId || "",
      },
      { merge: true },
    );
    return { ok: true, modules: clean };
  } catch (err) {
    console.error("[modules] save failed:", err);
    return { ok: false, error: err.message };
  }
}
