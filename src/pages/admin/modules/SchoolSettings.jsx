import { useState, useEffect, useMemo } from "react";
import { db } from "../../../firebase";
import {
  doc, collection, getDocs, getDoc, setDoc, updateDoc, deleteDoc, query, where, serverTimestamp, addDoc,
} from "firebase/firestore";

import { IC } from "./icons";
import { DISTRICTS } from "./constants";
import { normalisePhone } from "./helpers";
import { Modal, Input, Select, Textarea, Btn, EmptyState, ActionBtn } from "./ui";
import { SCHOOL_TYPES, setSchoolType, schoolTypeLabel } from "../../../services/schoolProfile";
import { subscribeSchoolSettings } from "../../../services/academicTerm";
import { syncAssignmentsWithClasses } from "../../../services/staffAssignments";
import {
  SECTIONS, CURRICULA, sectionsOf, sectionOfClass, sectionKeyOfClass, sectionName, sectionOrder, renameClass, ladderFor, classDocIdFor,
} from "../../../services/curriculum";
import CurriculumSettings from "../../../components/setup/CurriculumSettings";
import {
  SMS_ALWAYS_CATEGORIES, SMS_FALLBACK_CATEGORIES,
  smsFallbackCategories, setSmsFallbackCategories,
} from "../../../services/smsFallback";
import {
  MODULES, moduleById, enabledModules, nextModuleState, setEnabledModules,
} from "../../../services/modules";

const SECTION_COLOR = { kindergarten: "#f472b6", primary: "#3b82f6", secondary: "#14b8a6" };

const STREAMS = ["", "A", "B", "C", "D", "E", "F"];
const CUSTOM = "custom";

/**
 * The class form for a class, or a blank one for a section. A class whose
 * name is one of its section's class names (plus a stream letter) opens on
 * the dropdowns; anything else opens on "Other name".
 */
function classFormFor(section, cls = null) {
  const ladder = section ? ladderFor(section.id, section.curriculum) : [];
  if (!cls) return { sectionKey: section?.key || "", rung: 1, stream: "", customName: "", subjects: [...(section?.subjects || [])] };
  const stream = STREAMS.includes(cls.stream || "") ? cls.stream || "" : "";
  const rung = ladder.findIndex((n) => `${n}${stream}` === cls.name) + 1;
  return {
    sectionKey: section?.key || "",
    rung: rung > 0 ? rung : CUSTOM,
    stream: rung > 0 ? stream : "",
    customName: rung > 0 ? "" : cls.name || "",
    subjects: cls.subjects || [],
  };
}

// ─── MODULE 3: School Settings ────────────────────────────────────────────────
export default function SchoolSettings({ schoolCode, schoolData, onUpdate }) {
  const [form, setForm]             = useState({ name: "", district: "", address: "", phone: "", email: "" });
  const [classes, setClasses]       = useState([]);
  const [loading, setLoading]       = useState(false);
  const [saved, setSaved]           = useState(false);
  const [error, setError]           = useState("");
  const [showClassModal, setShowClassModal] = useState(false);
  const [editingClass, setEditingClass]     = useState(null);
  const [classForm, setClassForm]   = useState(() => classFormFor(null));
  const [classError, setClassError] = useState("");
  const [levelFilter, setLevelFilter] = useState("all");
  // Held here as well as in the setup gate, because a school that starts as
  // day and opens a hostel two years later needs to be able to say so.
  const [settings, setSettings]     = useState(null);
  const [savingType, setSavingType] = useState(false);
  const [classSearch, setClassSearch] = useState("");
  const [payout, setPayout] = useState({ mobile: "", operator: "airtel" });
  const [savingPayout, setSavingPayout] = useState(false);
  const [payoutSaved, setPayoutSaved] = useState(false);

  useEffect(() => {
    if (schoolData) {
      setForm({ name: schoolData.name||"", district: schoolData.district||"", address: schoolData.address||"", phone: schoolData.phone||"", email: schoolData.email||"" });
      setPayout({ mobile: schoolData.payoutMobile || "", operator: schoolData.payoutOperator || "airtel" });
    }
    fetchClasses();
  }, [schoolData]);

  useEffect(() => {
    if (!schoolCode) return;
    return subscribeSchoolSettings(schoolCode, setSettings);
  }, [schoolCode]);

  const [savingSms, setSavingSms] = useState(false);

  // The sections the school runs, each with its curriculum and subjects.
  const sections = useMemo(() => sectionsOf(settings), [settings]);
  const sectionByKey = (key) => sections.find((x) => x.key === key) || sections[0];

  // The class being added or edited, as the dropdowns describe it.
  const formSection = sectionByKey(classForm.sectionKey);
  const formLadder = formSection ? ladderFor(formSection.id, formSection.curriculum) : [];
  const formName = classForm.rung === CUSTOM
    ? classForm.customName.trim()
    : `${formLadder[classForm.rung - 1] || ""}${classForm.stream}`;

  /**
   * Toggling one category writes the whole list, because the setting is stored
   * as an array rather than a field per category — a school adding a category
   * next term should not leave a document littered with dead booleans.
   */
  async function toggleSmsCategory(id) {
    const current = smsFallbackCategories(settings);
    const next = current.includes(id)
      ? current.filter((c) => c !== id)
      : [...current, id];

    setSavingSms(true);
    const res = await setSmsFallbackCategories({ schoolCode, categories: next, actorId: "" });
    setSavingSms(false);
    if (!res.ok) setError(res.error);
  }

  /**
   * Switching a module writes the whole list. Dependencies are resolved in
   * `nextModuleState` rather than here, so the rule that AI insights need SMS
   * is stated once and applies wherever a module is toggled.
   */
  async function toggleModule(id, on) {
    const next = nextModuleState(settings, id, on);
    setSavingSms(true);
    const res = await setEnabledModules({ schoolCode, modules: next, actorId: "" });
    setSavingSms(false);
    if (!res.ok) setError(res.error);
  }

  async function changeSchoolType(next) {
    if (next === settings?.schoolType) return;
    setSavingType(true);
    const res = await setSchoolType({ schoolCode, schoolType: next, actorId: "" });
    setSavingType(false);
    if (!res.ok) setError(res.error);
  }

  async function fetchClasses() {
    try {
      const q = query(collection(db, "school_classes"), where("schoolCode", "==", schoolCode));
      const snap = await getDocs(q);
      setClasses(snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => a.order - b.order));
    } catch (e) { setClasses([]); }
  }

  async function handleSaveSchool(e) {
    e.preventDefault(); setLoading(true); setError(""); setSaved(false);
    try {
      await updateDoc(doc(db, "schools", schoolCode), { ...form, name: form.name.trim(), address: form.address.trim(), phone: normalisePhone(form.phone), email: form.email.trim(), updatedAt: serverTimestamp() });
      setSaved(true); if (onUpdate) onUpdate({ ...schoolData, ...form });
      setTimeout(() => setSaved(false), 3000);
    } catch (err) { setError("Save failed: " + err.message); }
    setLoading(false);
  }

  /**
   * Where a family's fee payment is sent, moments after it settles — see
   * api/_lib/settle.js. A plain mobile money number, not a PayChangu account:
   * the school never signs up for anything to receive it.
   */
  async function savePayout(e) {
    e.preventDefault(); setSavingPayout(true); setError(""); setPayoutSaved(false);
    try {
      const payoutMobile = normalisePhone(payout.mobile);
      await updateDoc(doc(db, "schools", schoolCode), {
        payoutMobile, payoutOperator: payout.operator, updatedAt: serverTimestamp(),
      });
      setPayoutSaved(true); if (onUpdate) onUpdate({ ...schoolData, payoutMobile, payoutOperator: payout.operator });
      setTimeout(() => setPayoutSaved(false), 3000);
    } catch (err) { setError("Save failed: " + err.message); }
    setSavingPayout(false);
  }

  function openClassModal(cls = null) {
    setClassForm(classFormFor(cls ? sectionOfClass(cls, sections) : sections[0], cls));
    setEditingClass(cls);
    setClassError("");
    setShowClassModal(true);
  }

  /** A new section starts on its first class with all of its subjects. */
  function chooseSection(key) {
    setClassForm(classFormFor(sectionByKey(key)));
  }

  async function saveClass() {
    const name = formName;
    if (!name) { setClassError("Choose a class, or type a name."); return; }
    if (classes.some((c) => c.id !== editingClass?.id && (c.name || "").trim().toLowerCase() === name.toLowerCase())) {
      setClassError(`There is already a class called ${name}. Pick a stream to tell them apart.`);
      return;
    }
    setLoading(true);
    setClassError("");
    try {
      const section = formSection;
      const custom = classForm.rung === CUSTOM;
      const data = {
        section: section.id, curriculum: section.curriculum, sectionKey: section.key,
        // `level` is what older screens read.
        level: section.id,
        formLevel: custom ? null : classForm.rung,
        stream: custom ? null : classForm.stream || null,
        subjects: classForm.subjects.length > 0 ? classForm.subjects : section.subjects,
        schoolCode, updatedAt: serverTimestamp(),
      };
      const order = sectionOrder(section) * 1000 + (custom ? 990 : classForm.rung * 10 + Math.max(0, STREAMS.indexOf(classForm.stream) - 1));
      if (editingClass) {
        // A rename goes through the server so every learner, timetable period,
        // mark sheet and teacher assignment carrying the old name follows it.
        if (editingClass.name !== name) {
          const res = await renameClass(editingClass.id, name);
          if (!res.ok) { setClassError(res.error); setLoading(false); return; }
        }
        await updateDoc(doc(db, "school_classes", editingClass.id), data);
      } else if (custom) {
        await addDoc(collection(db, "school_classes"), { ...data, name, order, capacity: 45, createdAt: serverTimestamp() });
      } else {
        // The same id "Set up classes" would give it, so running that later
        // finds this class instead of making a second one.
        const ref = doc(db, "school_classes", classDocIdFor(schoolCode, section.id, section.curriculum, classForm.rung, classForm.stream));
        if ((await getDoc(ref)).exists()) {
          setClassError(`${name} already exists${section ? ` in ${sectionName(section)}` : ""}.`);
          setLoading(false);
          return;
        }
        await setDoc(ref, { ...data, name, order, capacity: 45, createdAt: serverTimestamp() });
      }
      // A dropped subject comes off its teachers' lists.
      await syncAssignmentsWithClasses(schoolCode).catch((e) => console.error("assignment sync failed:", e));
      setShowClassModal(false); fetchClasses();
    } catch (err) { console.error(err); setClassError("Failed to save class: " + err.message); }
    setLoading(false);
  }

  async function deleteClass(id) {
    if (!confirm("Delete this class? Teachers assigned to it will be unassigned.")) return;
    try {
      await deleteDoc(doc(db, "school_classes", id));
      await syncAssignmentsWithClasses(schoolCode).catch((e) => console.error("assignment sync failed:", e));
      fetchClasses();
    } catch (e) { console.error(e); }
  }

  function toggleSubject(subject) {
    setClassForm(prev => ({
      ...prev,
      subjects: prev.subjects.includes(subject) ? prev.subjects.filter(s => s !== subject) : [...prev.subjects, subject],
    }));
  }

  const stats = useMemo(() => {
    const uniqueSubjects = new Set(classes.flatMap(c => c.subjects || []));
    return {
      total: classes.length,
      bySection: sections.map((x) => ({ ...x, label: sectionName(x), count: classes.filter((c) => sectionKeyOfClass(c, sections) === x.key).length })),
      subjects: uniqueSubjects.size,
    };
  }, [classes, sections]);

  const filteredClasses = useMemo(() => {
    return classes.filter(c => {
      if (levelFilter !== "all" && sectionKeyOfClass(c, sections) !== levelFilter) return false;
      if (classSearch.trim() && !c.name?.toLowerCase().includes(classSearch.trim().toLowerCase())) return false;
      return true;
    });
  }, [classes, levelFilter, classSearch, sections]);

  return (
    <div className="space-y-8">
      <style>{`
        .ss-stat {
          position: relative; overflow: hidden; border-radius: 14px; padding: 18px 20px;
          background: linear-gradient(155deg, rgba(255,255,255,0.03), rgba(255,255,255,0));
          border: 1px solid rgba(255,255,255,0.08);
        }
        .ss-stat__accent { position:absolute; top:0; left:0; width:4px; height:100%; }
        .ss-stat__num { font-size: 26px; font-weight: 800; color: var(--text); line-height: 1; margin-bottom: 6px; }
        .ss-stat__label { font-family: var(--font-mono); font-size: 10px; letter-spacing: 1.2px; text-transform: uppercase; color: var(--text3); }

        .ss-toolbar {
          display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
          padding: 12px 14px; border-radius: 12px;
          background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.07);
        }
        .ss-search {
          flex: 1 1 200px; min-width: 160px;
          background: rgba(0,0,0,0.25); border: 1px solid rgba(255,255,255,0.09);
          border-radius: 9px; padding: 9px 12px; color: var(--text);
          font-size: 13px; outline: none; transition: border-color .15s ease;
        }
        .ss-search:focus { border-color: rgba(240,185,11,0.55); }
        .ss-search::placeholder { color: var(--text3); }

        .ss-pill {
          font-family: var(--font-mono); font-size: 10.5px; letter-spacing: 0.5px;
          padding: 7px 12px; border-radius: 20px; cursor: pointer; user-select: none;
          border: 1px solid rgba(255,255,255,0.1); color: var(--text2);
          background: rgba(255,255,255,0.02); transition: all .15s ease; white-space: nowrap;
        }
        .ss-pill:hover { border-color: rgba(255,255,255,0.25); color: var(--text); }
        .ss-pill--active { background: rgba(240,185,11,0.14); border-color: rgba(240,185,11,0.5); color: #f0b90b; }

        .ss-class-card {
          border-radius: 16px; padding: 20px; overflow: hidden; position: relative;
          border: 1px solid var(--border); transition: border-color .15s ease, transform .15s ease, background .15s ease;
        }
        .ss-class-card:hover { border-color: rgba(255,255,255,0.22); transform: translateY(-1px); }
        .ss-class-card__bar { position:absolute; top:0; left:0; width:4px; height:100%; }
      `}</style>

      <div>
        <h2 className="module-title">School Settings</h2>
        <p className="module-sub">Manage your institution's profile, contact details, and class structure</p>
      </div>

      <div className="card" style={{ padding: 28 }}>
        {error && <div className="alert alert--error" style={{ marginBottom: 16 }}>{IC.warning}<span>{error}</span></div>}
        {saved && <div className="alert alert--success" style={{ marginBottom: 16 }}>{IC.check}<span>Settings saved successfully.</span></div>}
        <div className="space-y-4">
          <div className="grid-2">
            <Input label="School Name" required value={form.name} onChange={e => setForm(p => ({...p, name: e.target.value}))} />
            <Select label="District" required value={form.district} onChange={e => setForm(p => ({...p, district: e.target.value}))}>
              <option value="">Select district…</option>
              {DISTRICTS.map(d => <option key={d} value={d}>{d}</option>)}
            </Select>
          </div>
          <div className="grid-2">
            <Input label="Phone Number" type="tel" value={form.phone} onChange={e => setForm(p => ({...p, phone: e.target.value}))} />
            <Input label="Email Address" type="email" value={form.email} onChange={e => setForm(p => ({...p, email: e.target.value}))} />
          </div>
          <Textarea label="Physical Address" value={form.address} onChange={e => setForm(p => ({...p, address: e.target.value}))} rows={2} />
          <div className="data-table__actions" style={{ display: "flex", justifyContent: "flex-end", paddingTop: 8 }}>
            <Btn onClick={handleSaveSchool} loading={loading} variant="accent">Save School Info</Btn>
          </div>
        </div>
      </div>

      <div className="card" style={{ padding: 28 }}>
        <p style={{ fontFamily: "var(--font-display)", fontSize: 16, color: "var(--text)", letterSpacing: 0.5 }}>
          Fee Payout Destination
        </p>
        <p style={{ fontSize: 12, color: "var(--text3)", marginTop: 2, marginBottom: 16 }}>
          Where the school's share of an online fee payment is sent automatically, within
          moments of a family paying. A mobile money number your bursar's office already uses —
          not a PayChangu account, nothing to sign up for.
        </p>
        {payoutSaved && <div className="alert alert--success" style={{ marginBottom: 16 }}>{IC.check}<span>Payout destination saved.</span></div>}
        <div className="grid-2">
          <Input
            label="Mobile Money Number" type="tel" required
            value={payout.mobile}
            onChange={e => setPayout(p => ({...p, mobile: e.target.value}))}
            placeholder="+265 9xx xxx xxx"
          />
          <Select
            label="Network" required
            value={payout.operator}
            onChange={e => setPayout(p => ({...p, operator: e.target.value}))}
          >
            <option value="airtel">Airtel Money</option>
            <option value="tnm">TNM Mpamba</option>
          </Select>
        </div>
        <div className="data-table__actions" style={{ display: "flex", justifyContent: "flex-end", paddingTop: 8 }}>
          <Btn onClick={savePayout} loading={savingPayout} variant="accent">Save Payout Destination</Btn>
        </div>
      </div>

      <div className="card" style={{ padding: 28 }}>
        <p style={{ fontFamily: "var(--font-display)", fontSize: 16, color: "var(--text)", letterSpacing: 0.5 }}>
          School Type
        </p>
        <p style={{ fontSize: 12, color: "var(--text3)", marginTop: 2, marginBottom: 16 }}>
          Currently <strong>{schoolTypeLabel(settings?.schoolType)}</strong>. Boarding tools —
          dormitories, the sign-out register and the sick bay — appear in the head teacher&rsquo;s
          portal only when the school keeps students overnight.
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 10 }}>
          {SCHOOL_TYPES.map((t) => (
            <button
              key={t.id}
              type="button"
              disabled={savingType}
              onClick={() => changeSchoolType(t.id)}
              className={`choice-btn ${settings?.schoolType === t.id ? "choice-btn--active" : ""}`}
              style={{ textAlign: "left" }}
            >
              <strong>{t.label}</strong>
              <div style={{ fontSize: 11, color: "var(--text3)", marginTop: 2 }}>{t.blurb}</div>
            </button>
          ))}
        </div>
      </div>

      <div className="card" style={{ padding: 28 }}>
        <p style={{ fontFamily: "var(--font-display)", fontSize: 16, color: "var(--text)", letterSpacing: 0.5 }}>
          Sections, Curriculum &amp; Grading
        </p>
        <p style={{ fontSize: 12, color: "var(--text3)", marginTop: 2, marginBottom: 16 }}>
          Which sections the school runs — Kindergarten, Primary, Secondary — and whether each
          follows the Malawian (MANEB), Cambridge or Abeka curriculum. Each section has its own
          subjects and grading scale.
        </p>
        <CurriculumSettings schoolCode={schoolCode} settings={settings} actorId="" />
      </div>

      {/* ── Modules ──
          Optional features, declared once in services/modules.js. Anything
          that costs the school money is off until someone switches it on, and
          the cost is stated next to the switch rather than left to be
          discovered on an invoice. Adding a module here means adding an entry
          to MODULES — this screen does not change. */}
      <div className="card" style={{ padding: 28 }}>
        <p style={{ fontFamily: "var(--font-display)", fontSize: 16, color: "var(--text)", letterSpacing: 0.5 }}>
          Modules
        </p>
        <p style={{ fontSize: 12, color: "var(--text3)", marginTop: 2, marginBottom: 18 }}>
          Optional features for this school. Everything here is off until you switch it on.
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {MODULES.map((m) => {
            const on = enabledModules(settings).includes(m.id);
            const blocked = m.requires && !enabledModules(settings).includes(m.requires);
            const requiredName = m.requires ? moduleById(m.requires)?.name : "";

            return (
              <div key={m.id}>
                <div
                  style={{
                    display: "flex", alignItems: "flex-start", gap: 14,
                    padding: "14px 16px",
                    border: "1px solid var(--line)",
                    borderLeft: `3px solid ${on && !blocked ? "var(--primary)" : "var(--line)"}`,
                    borderRadius: 8,
                    opacity: blocked ? 0.6 : 1,
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <strong style={{ fontSize: 13, color: "var(--text)" }}>{m.name}</strong>
                      {m.billing === "metered" && (
                        <span style={{
                          fontSize: 9, letterSpacing: 0.6, padding: "2px 6px", borderRadius: 3,
                          background: "var(--warning-pale, rgba(240,185,11,0.15))", color: "var(--text3)",
                        }}>
                          BILLED ON USE
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--text3)", marginTop: 4, lineHeight: 1.5 }}>
                      {m.summary}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--text3)", marginTop: 4 }}>
                      {m.cost}
                    </div>
                    {blocked && (
                      <div style={{ fontSize: 11, color: "var(--warning, #f0b90b)", marginTop: 6 }}>
                        Needs {requiredName} switched on first.
                      </div>
                    )}
                  </div>

                  <button
                    type="button"
                    disabled={savingSms}
                    onClick={() => toggleModule(m.id, !on)}
                    aria-pressed={on}
                    aria-label={`${on ? "Disable" : "Enable"} ${m.name}`}
                    className={`choice-btn ${on ? "choice-btn--active" : ""}`}
                    style={{ flex: "0 0 auto", minWidth: 74, textAlign: "center", padding: "8px 12px" }}
                  >
                    {on ? "ON" : "OFF"}
                  </button>
                </div>

                {/* With SMS off, the portal's direct messages (logins, report
                    cards) go by WhatsApp instead — say so, so switching SMS
                    off doesn't look like switching families off. */}
                {m.id === "sms" && !on && (
                  <div style={{ padding: "10px 16px 2px 19px", fontSize: 11.5, color: "var(--text2)" }}>
                    SMS is off, so families get logins, report cards and alerts on <strong>WhatsApp</strong> instead, at no cost per message.
                  </div>
                )}

                {/* The SMS module's own configuration — which notifications go
                    out. Only shown once SMS is on, because choosing categories
                    for a switched-off module is a decision with no effect. */}
                {m.id === "sms" && on && (
                  <div style={{ padding: "14px 16px 2px 19px" }}>
                    <p style={{ fontSize: 11, fontWeight: 700, color: "var(--text)", letterSpacing: 0.4, marginBottom: 8 }}>
                      SENT TO EVERY GUARDIAN
                    </p>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 10 }}>
                      {SMS_ALWAYS_CATEGORIES.map((c) => {
                        const catOn = smsFallbackCategories(settings).includes(c.id);
                        return (
                          <button
                            key={c.id}
                            type="button"
                            disabled={savingSms}
                            onClick={() => toggleSmsCategory(c.id)}
                            className={`choice-btn ${catOn ? "choice-btn--active" : ""}`}
                            style={{ textAlign: "left" }}
                            aria-pressed={catOn}
                          >
                            <strong>{c.label}</strong>
                            <div style={{ fontSize: 11, color: "var(--text3)", marginTop: 2 }}>{c.blurb}</div>
                            <div style={{ fontSize: 10, color: "var(--text3)", marginTop: 6, letterSpacing: 0.4 }}>
                              {catOn ? "SMS ON — ALL GUARDIANS" : "OFF"} · ~{c.perTerm}/guardian/term
                            </div>
                          </button>
                        );
                      })}
                    </div>

                    <p style={{ fontSize: 11, fontWeight: 700, color: "var(--text)", letterSpacing: 0.4, margin: "22px 0 4px" }}>
                      SENT ONLY TO GUARDIANS WITHOUT THE APP
                    </p>
                    <p style={{ fontSize: 11, color: "var(--text3)", marginBottom: 10 }}>
                      Guardians using ACALink are notified in the app, free. These reach the
                      families on feature phones so they are not left out — a guardian who
                      installs the app stops costing anything.
                    </p>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 10 }}>
                      {SMS_FALLBACK_CATEGORIES.map((c) => {
                        const catOn = smsFallbackCategories(settings).includes(c.id);
                        return (
                          <button
                            key={c.id}
                            type="button"
                            disabled={savingSms}
                            onClick={() => toggleSmsCategory(c.id)}
                            className={`choice-btn ${catOn ? "choice-btn--active" : ""}`}
                            style={{ textAlign: "left" }}
                            aria-pressed={catOn}
                          >
                            <strong>{c.label}</strong>
                            <div style={{ fontSize: 11, color: "var(--text3)", marginTop: 2 }}>{c.blurb}</div>
                            <div style={{ fontSize: 10, color: "var(--text3)", marginTop: 6, letterSpacing: 0.4 }}>
                              {catOn ? "SMS ON" : "APP ONLY"} · ~{c.perTerm}/guardian/term
                            </div>
                          </button>
                        );
                      })}
                    </div>

                    {smsFallbackCategories(settings).length === 0 && (
                      <p style={{ fontSize: 11, color: "var(--text3)", marginTop: 14 }}>
                        SMS is on but no notification is selected, so nothing will be sent.
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Class stats */}
      {classes.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 14 }}>
          <div className="ss-stat">
            <div className="ss-stat__accent" style={{ background: "#f0b90b" }} />
            <div className="ss-stat__num">{stats.total}</div>
            <div className="ss-stat__label">Total Classes</div>
          </div>
          {stats.bySection.map((x) => (
            <div key={x.key} className="ss-stat">
              <div className="ss-stat__accent" style={{ background: SECTION_COLOR[x.id] }} />
              <div className="ss-stat__num">{x.count}</div>
              <div className="ss-stat__label">{x.label}</div>
            </div>
          ))}
          <div className="ss-stat">
            <div className="ss-stat__accent" style={{ background: "#a855f7" }} />
            <div className="ss-stat__num">{stats.subjects}</div>
            <div className="ss-stat__label">Subjects Covered</div>
          </div>
        </div>
      )}

      <div className="card">
        <div style={{ padding: "20px 24px", borderBottom: "1px solid var(--border)", background: "var(--bg2)", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <div>
            <p style={{ fontFamily: "var(--font-display)", fontSize: 16, color: "var(--text)", letterSpacing: 0.5 }}>Classes &amp; Subjects</p>
            <p style={{ fontSize: 12, color: "var(--text3)", marginTop: 2 }}>
              {sections.map(sectionName).join(" · ")}. Edit a class to rename it or change its subjects.
            </p>
          </div>
          <Btn onClick={() => openClassModal()} variant="gold" size="sm">{IC.plus} Add Class</Btn>
        </div>

        {classes.length > 0 && (
          <div style={{ padding: "16px 24px 0" }}>
            <div className="ss-toolbar">
              <input
                className="ss-search"
                placeholder="Search classes…"
                value={classSearch}
                onChange={e => setClassSearch(e.target.value)}
              />
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {["all", ...stats.bySection.filter((x) => x.count > 0).map((x) => x.key)].map(key => (
                  <span
                    key={key}
                    className={`ss-pill ${levelFilter === key ? "ss-pill--active" : ""}`}
                    onClick={() => setLevelFilter(key)}
                  >
                    {key === "all" ? "All Sections" : stats.bySection.find((x) => x.key === key)?.label}
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}

        <div style={{ padding: 24 }}>
          {classes.length === 0 ? (
            <EmptyState icon={IC.school} title="No classes defined yet" sub="Add a class for each section the school runs"
              action={<Btn onClick={() => openClassModal()} variant="gold">{IC.plus} Add First Class</Btn>}
            />
          ) : filteredClasses.length === 0 ? (
            <EmptyState icon={IC.warning} title="No matches" sub="Try adjusting your search or filter" />
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: 16 }}>
              {filteredClasses.map(cls => (
                <div key={cls.id} className="ss-class-card">
                  <div className="ss-class-card__bar" style={{ background: SECTION_COLOR[sectionOfClass(cls, sections)?.id] }} />
                  <div className="flex-between" style={{ marginBottom: 14, flexWrap: "wrap", gap: 8 }}>
                    <div className="flex-gap-3">
                      <span style={{ background: "var(--accent-pale)", color: "var(--accent-lt)", border: "1px solid var(--border)", fontSize: 10, fontWeight: 700, padding: "3px 10px", borderRadius: 6, letterSpacing: 1, textTransform: "uppercase" }}>{sectionName(sectionOfClass(cls, sections))}</span>
                      <span style={{ fontFamily: "var(--font-display)", fontSize: 16, color: "var(--text)" }}>{cls.name}</span>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--text3)" }}>· {(cls.subjects || []).length} subjects</span>
                    </div>
                    <div style={{ display: "flex", gap: 6 }}>
                      <ActionBtn onClick={() => openClassModal(cls)} icon={IC.edit} title="Edit class" />
                      <ActionBtn onClick={() => deleteClass(cls.id)} icon={IC.trash} title="Delete class" hoverBg="rgba(239,68,68,0.1)" />
                    </div>
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {cls.subjects?.map((sub, i) => <span key={i} className="badge badge--teal">{sub}</span>)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {showClassModal && (
        <Modal title={editingClass ? "Edit Class" : "Add New Class"} onClose={() => setShowClassModal(false)} size="lg">
          <div className="space-y-5">
            {classError && <div className="alert alert--error">{IC.warning}<span>{classError}</span></div>}
            <div className="grid-2">
              {/* The level, then which of its ticked curricula this class follows. */}
              <Select label="Section" required value={formSection?.id || ""}
                onChange={e => chooseSection(sections.find((x) => x.id === e.target.value)?.key)}>
                {SECTIONS.filter((l) => sections.some((x) => x.id === l.id)).map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
              </Select>
              <Select label="Curriculum" required value={classForm.sectionKey} onChange={e => chooseSection(e.target.value)}>
                {sections.filter((x) => x.id === formSection?.id).map((x) => (
                  <option key={x.key} value={x.key}>{CURRICULA.find((c) => c.id === x.curriculum)?.label}</option>
                ))}
              </Select>
            </div>
            <div className="grid-2">
              <Select label="Class" required value={classForm.rung}
                onChange={e => setClassForm(p => ({ ...p, rung: e.target.value === CUSTOM ? CUSTOM : Number(e.target.value) }))}>
                {formLadder.map((n, i) => <option key={n} value={i + 1}>{n}</option>)}
                <option value={CUSTOM}>Other name…</option>
              </Select>
              {classForm.rung === CUSTOM ? (
                <Input label="Class name" required value={classForm.customName}
                  onChange={e => setClassForm(p => ({ ...p, customName: e.target.value }))} placeholder="e.g. Remedial Class" />
              ) : (
                <Select label="Stream" value={classForm.stream} onChange={e => setClassForm(p => ({ ...p, stream: e.target.value }))}>
                  {STREAMS.map((x) => <option key={x || "none"} value={x}>{x ? `Stream ${x}` : "No stream"}</option>)}
                </Select>
              )}
            </div>
            {formName && <p style={{ fontSize: 12, color: "var(--text3)", marginTop: -8 }}>Will be called <strong style={{ color: "var(--text)" }}>{formName}</strong>.</p>}
            <div>
              <label className="field__label">Subjects</label>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, maxHeight: 220, overflowY: "auto", padding: 12, border: "1px solid var(--border)", borderRadius: 12, background: "var(--bg)", marginTop: 6 }}>
                {[...new Set([...(formSection?.subjects || []), ...classForm.subjects])].map((subject, idx) => (
                  <label key={idx} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer", padding: "7px 10px", borderRadius: 8, color: "var(--text2)" }}>
                    <input type="checkbox" checked={classForm.subjects.includes(subject)} onChange={() => toggleSubject(subject)} style={{ accentColor: "var(--accent)" }} />
                    <span>{subject}</span>
                  </label>
                ))}
              </div>
              <p style={{ fontSize: 11, color: "var(--text3)", marginTop: 5 }}>
                {formSection ? `${sectionName(formSection)} subjects, all ticked to start. ` : ""}Untick any this class doesn&rsquo;t take.
                Add or rename subjects under Sections, Curriculum &amp; Grading.
                {editingClass && " Renaming the class updates its learners, timetable, marks and teachers too."}
              </p>
            </div>
            <div className="data-table__actions" style={{ display: "flex", justifyContent: "flex-end", gap: 8, paddingTop: 8, borderTop: "1px solid var(--border)" }}>
              <Btn variant="ghost" onClick={() => setShowClassModal(false)}>Cancel</Btn>
              <Btn onClick={saveClass} variant="gold" loading={loading}>{editingClass ? "Update Class" : "Add Class"}</Btn>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}