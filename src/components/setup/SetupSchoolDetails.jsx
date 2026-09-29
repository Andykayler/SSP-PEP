// src/components/setup/SetupSchoolDetails.jsx
// Step 2 of setting a school up: everything School Settings holds that step 1
// doesn't — the sections and curriculum, the classes and their subjects (see
// services/curriculumCore.js), the school's contact details, how
// families are reached, and where online fee payments go. Nobody uses the
// dashboard until this is done, because a school with no classes can't enrol
// a student, bill a fee or take a register.
import { useMemo, useState } from "react";
import { doc, setDoc, updateDoc, writeBatch, serverTimestamp } from "firebase/firestore";
import { Check, ArrowRight, Plus, X, MessageCircle, MessageSquare, Sparkles } from "lucide-react";
import { db } from "../../firebase";
import { Btn, Input, Select, Notice } from "../ui/ModuleKit";
import { normalisePhone } from "../../services/phone";
import { completeSetup } from "../../services/schoolProfile";
import { setEnabledModules } from "../../services/modules";
import {
  SECTIONS, CURRICULA, DEFAULT_RUNGS, sectionsOf, defaultSection, ladderFor,
  planSectionClasses, sectionName, sectionKey, sectionOrder, saveSections,
} from "../../services/curriculum";

/** Pre-ticked classes for a section: ladder position → stream count. */
const defaultRungs = (section) => Object.fromEntries(DEFAULT_RUNGS[section.id][section.curriculum].map((n) => [n, 0]));

function Section({ n, title, hint, children }) {
  return (
    <section className="card p-6 space-y-4">
      <div>
        <p className="field__label" style={{ marginBottom: 4 }}>{n}. {title}</p>
        {hint && <p className="text-muted" style={{ fontSize: 12.5 }}>{hint}</p>}
      </div>
      {children}
    </section>
  );
}

export default function SetupSchoolDetails({ schoolCode, schoolName, school, settings, actorId, onDone }) {
  // The sections the school runs, each with its curriculum and subjects.
  const [sections, setSections] = useState(() => sectionsOf(settings));
  // section key → { ladder position → stream count }; a missing position isn't offered.
  const [rungs, setRungs] = useState(() => Object.fromEntries(sectionsOf(settings).map((s) => [s.key, defaultRungs(s)])));
  const [newSubject, setNewSubject] = useState({});

  const [address, setAddress] = useState(school?.address || "");
  const [phone, setPhone] = useState(school?.phone || "");
  const [email, setEmail] = useState(school?.email || "");

  const [channel, setChannel] = useState("whatsapp");
  const [aiInsights, setAiInsights] = useState(false);
  const [payoutMobile, setPayoutMobile] = useState(school?.payoutMobile || "");
  const [payoutOperator, setPayoutOperator] = useState(school?.payoutOperator || "airtel");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const plan = useMemo(
    () => sections.flatMap((section) => planSectionClasses({ schoolCode, section, rungs: rungs[section.key] || {} })),
    [schoolCode, sections, rungs],
  );
  const ready = plan.length > 0 && sections.every((s) => s.subjects.length > 0);

  /** Ticking a curriculum under a level adds that section; unticking removes it. */
  function toggle(level, curriculum) {
    const key = sectionKey(level, curriculum);
    if (sections.some((s) => s.key === key)) {
      if (sections.length > 1) setSections(sections.filter((s) => s.key !== key));
      return;
    }
    const added = defaultSection(level, curriculum);
    setSections([...sections, added].sort((a, b) => sectionOrder(a) - sectionOrder(b)));
    setRungs((prev) => ({ ...prev, [added.key]: defaultRungs(added) }));
  }

  function toggleRung(key, n) {
    setRungs((prev) => {
      const mine = { ...(prev[key] || {}) };
      if (n in mine) delete mine[n]; else mine[n] = 0;
      return { ...prev, [key]: mine };
    });
  }

  const setSubjects = (key, subjects) => setSections(sections.map((s) => (s.key === key ? { ...s, subjects } : s)));

  function addSubject(key) {
    const s = (newSubject[key] || "").trim();
    const list = sections.find((x) => x.key === key)?.subjects || [];
    if (s && !list.some((x) => x.toLowerCase() === s.toLowerCase())) setSubjects(key, [...list, s]);
    setNewSubject((prev) => ({ ...prev, [key]: "" }));
  }

  const save = async () => {
    setBusy(true);
    setError("");
    try {
      // 1. Classes — merged, with the same ids "Set up classes" uses, so
      //    nothing duplicates if either is run again later.
      const batch = writeBatch(db);
      plan.forEach((c) => batch.set(doc(db, "school_classes", c.id), {
        ...c.data, createdAt: serverTimestamp(), updatedAt: serverTimestamp(), updatedBy: actorId || "",
      }, { merge: true }));
      await batch.commit();

      // 2. The school's own details and where fee payments go.
      await updateDoc(doc(db, "schools", schoolCode), {
        address: address.trim(),
        phone: phone.trim(),
        email: email.trim(),
        ...(payoutMobile.trim() ? { payoutMobile: normalisePhone(payoutMobile), payoutOperator } : {}),
        updatedAt: serverTimestamp(),
      }).catch((err) => {
        // Only the account that registered the school may edit these; another
        // administrator finishes setup without them rather than being stuck.
        console.warn("[setup] school details not saved:", err.message);
      });

      // 3. How families are reached: WhatsApp (free) unless SMS is chosen.
      const modules = [...(channel === "sms" ? ["sms"] : []), ...(aiInsights ? ["ai_insights"] : [])];
      const m = await setEnabledModules({ schoolCode, modules, actorId });
      if (m && m.ok === false) throw new Error(m.error);

      // 4. The sections, their curriculum, subjects and grading.
      const saved = await saveSections({ schoolCode, sections, actorId });
      if (!saved.ok) throw new Error(saved.error);
      await setDoc(doc(db, "school_settings", schoolCode), {
        schoolCode, whatsappEnabled: true, updatedAt: serverTimestamp(),
      }, { merge: true });

      // Last, so the dashboard only opens once everything above exists.
      const done = await completeSetup({ schoolCode, actorId });
      if (!done.ok) throw new Error(done.error);
      onDone?.({ sections: saved.sections, setupCompletedAt: new Date() });
    } catch (err) {
      console.error("[setup] step 2 failed:", err);
      setError(err.message || "Setup couldn't be saved. Please try again.");
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      {error && <Notice tone="danger">{error}</Notice>}

      <Section n={1} title="Sections and curriculum" hint="Tick the curricula each level is taught to — as many as the school runs, e.g. both Malawian and Abeka for Primary. Grading and subjects can be changed later in School Settings.">
        <div style={{ border: "1px solid var(--border-color)", borderRadius: 12, overflow: "hidden" }}>
          {SECTIONS.map((level, i) => (
            <div key={level.id} className="flex items-center" style={{
              gap: 16, flexWrap: "wrap", padding: "12px 16px", borderTop: i ? "1px solid var(--border-color)" : "none",
            }}>
              <strong style={{ minWidth: 120 }}>{level.label}</strong>
              {CURRICULA.map((c) => (
                <label key={c.id} className="flex items-center gap-2" style={{ cursor: "pointer", fontSize: 13.5 }}>
                  <input type="checkbox" checked={sections.some((s) => s.key === sectionKey(level.id, c.id))}
                    onChange={() => toggle(level.id, c.id)} />
                  {c.label}
                </label>
              ))}
            </div>
          ))}
        </div>
      </Section>

      <Section n={2} title="Classes and subjects" hint="Tick the classes each section runs. Add streams where a class is split (Form 1A, Form 1B…). Every class starts with its section's subjects; the head teacher can adjust any class later.">
        {sections.map((section) => {
          const mine = rungs[section.key] || {};
          return (
            <div key={section.key} className="space-y-3" style={{ borderTop: "1px solid var(--border-color)", paddingTop: 12 }}>
              <p style={{ fontWeight: 700 }}>{sectionName(section)}</p>
              <div className="space-y-2">
                {ladderFor(section.id, section.curriculum).map((label, i) => {
                  const n = i + 1;
                  const on = n in mine;
                  return (
                    <div key={label} className="flex items-center justify-between" style={{ gap: 12, padding: "6px 0", borderBottom: "1px dashed var(--border-color)" }}>
                      <label className="flex items-center gap-2" style={{ cursor: "pointer", fontWeight: 600 }}>
                        <input type="checkbox" checked={on} onChange={() => toggleRung(section.key, n)} />
                        {label}
                      </label>
                      {on && (
                        <label className="flex items-center gap-2 text-muted" style={{ fontSize: 12.5 }}>
                          Streams
                          <select className="field__select" style={{ width: 90 }} value={mine[n]}
                            onChange={(e) => setRungs((prev) => ({ ...prev, [section.key]: { ...mine, [n]: Number(e.target.value) } }))}>
                            <option value={0}>None</option>
                            {[2, 3, 4, 5, 6].map((k) => <option key={k} value={k}>{k} (A–{String.fromCharCode(64 + k)})</option>)}
                          </select>
                        </label>
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="flex gap-2" style={{ flexWrap: "wrap" }}>
                {section.subjects.map((s) => (
                  <span key={s} className="tag tag--blue" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                    {s}
                    <button type="button" aria-label={`Remove ${s}`} onClick={() => setSubjects(section.key, section.subjects.filter((x) => x !== s))}
                      style={{ border: "none", background: "none", cursor: "pointer", color: "inherit", padding: 0, display: "inline-flex" }}>
                      <X size={12} />
                    </button>
                  </span>
                ))}
              </div>
              <div className="flex gap-2" style={{ alignItems: "flex-end" }}>
                <div style={{ flex: 1 }}>
                  <Input label={`Add a ${sectionName(section)} subject`} value={newSubject[section.key] || ""}
                    onChange={(e) => setNewSubject((prev) => ({ ...prev, [section.key]: e.target.value }))}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addSubject(section.key); } }} placeholder="e.g. Computer Studies" />
                </div>
                <Btn variant="ghost" icon={<Plus size={14} />} onClick={() => addSubject(section.key)} disabled={!(newSubject[section.key] || "").trim()}>Add</Btn>
              </div>
            </div>
          );
        })}
        <p className="text-muted" style={{ fontSize: 12.5 }}>
          {plan.length ? <>Creates <strong>{plan.length}</strong> class{plan.length === 1 ? "" : "es"}: {plan.map((c) => c.data.name).join(", ")}.</> : "Pick at least one class."}
        </p>
      </Section>

      <Section n={3} title="School contact details" hint="Shown on receipts and report cards, and used when families contact the school.">
        <Input label="Physical address" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="P.O. Box 12, Zomba" />
        <div className="grid grid-cols-2" style={{ gap: 12 }}>
          <Input label="Office phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+265 9xx xxx xxx" />
          <Input label="Office email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="office@school.mw" />
        </div>
      </Section>

      <Section n={4} title="How should families hear from the school?" hint="Logins, report cards, fee reminders and alerts. You can change this in School Settings.">
        <div className="space-y-2">
          {[
            { id: "whatsapp", icon: <MessageCircle size={18} />, title: "WhatsApp (recommended)", blurb: "Free per message. Most families already use it." },
            { id: "sms", icon: <MessageSquare size={18} />, title: "SMS", blurb: "Reaches basic phones too. Charged per message from your SMS balance." },
          ].map((o) => (
            <button key={o.id} type="button" className={`choice-btn ${channel === o.id ? "choice-btn--active" : ""}`}
              onClick={() => setChannel(o.id)} style={{ width: "100%", textAlign: "left" }}>
              <div className="flex items-center justify-between" style={{ gap: 12 }}>
                <div className="flex items-center gap-2">{o.icon}<div><strong>{o.title}</strong><div className="text-muted" style={{ fontSize: 12 }}>{o.blurb}</div></div></div>
                {channel === o.id && <Check size={18} />}
              </div>
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2" style={{ cursor: "pointer", fontSize: 13.5 }}>
          <input type="checkbox" checked={aiInsights} onChange={(e) => setAiInsights(e.target.checked)} />
          <Sparkles size={15} /> Add AI term insights to report cards <span className="text-muted">(billed per pupil per term)</span>
        </label>
      </Section>

      <Section n={5} title="Where online fee payments go (optional)" hint="When a family pays fees online, the money is sent straight to this mobile money number. You can add it later.">
        <div className="grid grid-cols-2" style={{ gap: 12 }}>
          <Input label="Mobile money number" value={payoutMobile} onChange={(e) => setPayoutMobile(e.target.value)} placeholder="+265 9xx xxx xxx" />
          <Select label="Network" value={payoutOperator} onChange={(e) => setPayoutOperator(e.target.value)}>
            <option value="airtel">Airtel Money</option>
            <option value="tnm">TNM Mpamba</option>
          </Select>
        </div>
      </Section>

      <div className="flex justify-end">
        <Btn variant="accent" loading={busy} disabled={!ready} icon={<ArrowRight size={15} />} onClick={save}>
          Finish setup and open {schoolName || "the dashboard"}
        </Btn>
      </div>
    </div>
  );
}
