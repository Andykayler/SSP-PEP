// src/components/setup/SetupSchoolDetails.jsx
// Step 2 of setting a school up: everything School Settings holds that step 1
// doesn't — the classes and their subjects, the school's contact details, how
// families are reached, and where online fee payments go. Nobody uses the
// dashboard until this is done, because a school with no classes can't enrol
// a student, bill a fee or take a register.
import { useMemo, useState } from "react";
import { doc, setDoc, updateDoc, writeBatch, serverTimestamp } from "firebase/firestore";
import { Check, ArrowRight, Plus, X, MessageCircle, MessageSquare, Sparkles } from "lucide-react";
import { db } from "../../firebase";
import { Btn, Input, Select, Notice } from "../ui/ModuleKit";
import { PRIMARY_SUBJECTS, SECONDARY_SUBJECTS } from "../../pages/admin/modules/constants";
import { normalisePhone } from "../../services/phone";
import { completeSetup, schoolLevelOf } from "../../services/schoolProfile";
import { setEnabledModules } from "../../services/modules";
import { planClasses, LEVEL_CLASSES, DEFAULT_SELECTION } from "../../services/classSetupCore";

const DEFAULT_SUBJECTS = { Secondary: SECONDARY_SUBJECTS, Primary: PRIMARY_SUBJECTS };

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
  const [level, setLevel] = useState(schoolLevelOf(settings));
  // form number → stream count; a form missing from the map isn't offered.
  const [forms, setForms] = useState(() => Object.fromEntries(DEFAULT_SELECTION[schoolLevelOf(settings)].map((n) => [n, 0])));
  const [subjects, setSubjects] = useState(() => [...DEFAULT_SUBJECTS[schoolLevelOf(settings)]]);
  const [newSubject, setNewSubject] = useState("");

  const [address, setAddress] = useState(school?.address || "");
  const [phone, setPhone] = useState(school?.phone || "");
  const [email, setEmail] = useState(school?.email || "");

  const [channel, setChannel] = useState("whatsapp");
  const [aiInsights, setAiInsights] = useState(false);
  const [payoutMobile, setPayoutMobile] = useState(school?.payoutMobile || "");
  const [payoutOperator, setPayoutOperator] = useState(school?.payoutOperator || "airtel");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const plan = useMemo(() => planClasses({ schoolCode, level, forms, subjects }), [schoolCode, level, forms, subjects]);
  const ready = plan.length > 0 && subjects.length > 0;

  function switchLevel(next) {
    setLevel(next);
    setForms(Object.fromEntries(DEFAULT_SELECTION[next].map((n) => [n, 0])));
    setSubjects([...DEFAULT_SUBJECTS[next]]);
  }

  function toggleForm(n) {
    setForms((prev) => {
      const next = { ...prev };
      if (n in next) delete next[n]; else next[n] = 0;
      return next;
    });
  }

  function addSubject() {
    const s = newSubject.trim();
    if (s && !subjects.some((x) => x.toLowerCase() === s.toLowerCase())) setSubjects([...subjects, s]);
    setNewSubject("");
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

      // 4. The level lives beside the term and school type.
      await setDoc(doc(db, "school_settings", schoolCode), {
        schoolCode, schoolLevel: level, whatsappEnabled: true, updatedAt: serverTimestamp(),
      }, { merge: true });

      // Last, so the dashboard only opens once everything above exists.
      const done = await completeSetup({ schoolCode, actorId });
      if (!done.ok) throw new Error(done.error);
      onDone?.({ schoolLevel: level, setupCompletedAt: new Date() });
    } catch (err) {
      console.error("[setup] step 2 failed:", err);
      setError(err.message || "Setup couldn't be saved. Please try again.");
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      {error && <Notice tone="danger">{error}</Notice>}

      <Section n={1} title="Classes" hint="Tick the classes the school runs. Add streams where a class is split (Form 1A, Form 1B…).">
        <div className="flex gap-2" style={{ flexWrap: "wrap" }}>
          {["Secondary", "Primary"].map((l) => (
            <button key={l} type="button" className={`choice-btn ${level === l ? "choice-btn--active" : ""}`} onClick={() => switchLevel(l)}>
              {l} {l === "Secondary" ? "(Forms)" : "(Standards)"}
            </button>
          ))}
        </div>
        <div className="space-y-2">
          {LEVEL_CLASSES[level].map((label, i) => {
            const n = i + 1;
            const on = n in forms;
            return (
              <div key={label} className="flex items-center justify-between" style={{ gap: 12, padding: "6px 0", borderBottom: "1px dashed var(--border-color)" }}>
                <label className="flex items-center gap-2" style={{ cursor: "pointer", fontWeight: 600 }}>
                  <input type="checkbox" checked={on} onChange={() => toggleForm(n)} />
                  {label}
                </label>
                {on && (
                  <label className="flex items-center gap-2 text-muted" style={{ fontSize: 12.5 }}>
                    Streams
                    <select className="field__select" style={{ width: 90 }} value={forms[n]}
                      onChange={(e) => setForms((prev) => ({ ...prev, [n]: Number(e.target.value) }))}>
                      <option value={0}>None</option>
                      {[2, 3, 4, 5, 6].map((k) => <option key={k} value={k}>{k} (A–{String.fromCharCode(64 + k)})</option>)}
                    </select>
                  </label>
                )}
              </div>
            );
          })}
        </div>
        <p className="text-muted" style={{ fontSize: 12.5 }}>
          {plan.length ? <>Creates <strong>{plan.length}</strong> class{plan.length === 1 ? "" : "es"}: {plan.map((c) => c.data.name).join(", ")}.</> : "Pick at least one class."}
        </p>
      </Section>

      <Section n={2} title="Subjects" hint="Every class starts with these. The head teacher can adjust any class's subjects later.">
        <div className="flex gap-2" style={{ flexWrap: "wrap" }}>
          {subjects.map((s) => (
            <span key={s} className="tag tag--blue" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              {s}
              <button type="button" aria-label={`Remove ${s}`} onClick={() => setSubjects(subjects.filter((x) => x !== s))}
                style={{ border: "none", background: "none", cursor: "pointer", color: "inherit", padding: 0, display: "inline-flex" }}>
                <X size={12} />
              </button>
            </span>
          ))}
        </div>
        <div className="flex gap-2" style={{ alignItems: "flex-end" }}>
          <div style={{ flex: 1 }}>
            <Input label="Add a subject" value={newSubject} onChange={(e) => setNewSubject(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addSubject(); } }} placeholder="e.g. Computer Studies" />
          </div>
          <Btn variant="ghost" icon={<Plus size={14} />} onClick={addSubject} disabled={!newSubject.trim()}>Add</Btn>
        </div>
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
