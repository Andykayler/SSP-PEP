// src/components/setup/SchoolSetupGate.jsx
// The questions that have to be answered before the rest of the system means
// anything: does this school board its students, which term is running, and
// how many sites does it teach from?
//
// It gates rather than nags because the answers change what other people see.
// A day school shown dormitory allocation and a sign-out register learns to
// scroll past modules, and that habit costs more than the minute this screen
// takes. A boarding school that never answers gets the reverse: the tools that
// would tell them which children are on site stay hidden behind a setting
// nobody knew existed.
//
// The campus question is here rather than in settings for the same reason and
// one more: campuses have to exist before a single student is enrolled. A
// school that registers eight hundred children and only then splits into two
// sites has to move eight hundred records, each one through an approval —
// which is exactly the work this question, asked once, avoids.
//
// Shown only to the administrator, who sets the school up. Everyone else works
// with whatever answer they gave.
import { useState } from "react";
import { School, Check, ArrowRight, Plus, X } from "lucide-react";
import { SCHOOL_TYPES, setSchoolType } from "../../services/schoolProfile";
import { setCurrentTerm, termOptions, defaultTerm } from "../../services/academicTerm";
import { createCampus, setCampusMode } from "../../services/campuses";
import { Btn, Select, Input, Notice } from "../ui/ModuleKit";
import { isSetUp } from "../../services/schoolProfile";
import SetupSchoolDetails from "./SetupSchoolDetails";

/** "Step 1 of 2" — which part of setup this is, and what's still to come. */
function SetupSteps({ step }) {
  const steps = ["School basics", "Classes & settings"];
  return (
    <ol style={{ display: "flex", gap: 10, justifyContent: "center", listStyle: "none", margin: "0 0 4px", padding: 0, flexWrap: "wrap" }}>
      {steps.map((label, i) => {
        const n = i + 1;
        const state = n < step ? "done" : n === step ? "now" : "next";
        return (
          <li key={label} aria-current={state === "now" ? "step" : undefined}
            style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "6px 12px", borderRadius: 999,
              border: "1px solid var(--border-color)", fontSize: 12.5, fontWeight: state === "now" ? 700 : 500,
              background: state === "now" ? "var(--card-bg)" : "transparent",
              color: state === "next" ? "var(--text-muted)" : "var(--text-primary)" }}>
            <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 20, height: 20, borderRadius: "50%",
              background: state === "next" ? "var(--bg-secondary)" : "var(--primary)", color: state === "next" ? "var(--text-muted)" : "#fff", fontSize: 11 }}>
              {state === "done" ? <Check size={12} /> : n}
            </span>
            {label}
          </li>
        );
      })}
    </ol>
  );
}

/**
 * Two steps, in order: the basics below (type, term, campuses), then classes,
 * subjects, contact details, how families are reached and where fee payments
 * go (SetupSchoolDetails). The dashboard opens only when both are done —
 * `setupCompletedAt` on school_settings, written at the very end.
 */
export default function SchoolSetupGate({ schoolCode, schoolName, actorId, settings, school, onDone }) {
  if (isSetUp(settings)) {
    return (
      <div className="space-y-6" style={{ maxWidth: 720, margin: "0 auto", paddingTop: 24 }}>
        <div style={{ textAlign: "center" }}>
          <SetupSteps step={2} />
          <h2 className="module-title" style={{ marginTop: 14 }}>Classes and school settings</h2>
          <p className="module-sub">The last step. Your dashboard opens as soon as this is saved.</p>
        </div>
        <SetupSchoolDetails schoolCode={schoolCode} schoolName={schoolName} school={school}
          settings={settings} actorId={actorId} onDone={onDone} />
      </div>
    );
  }
  return <SetupBasics schoolCode={schoolCode} schoolName={schoolName} actorId={actorId} onDone={onDone} />;
}

function SetupBasics({ schoolCode, schoolName, actorId, onDone }) {
  const [type, setType] = useState("");
  const [term, setTerm] = useState(defaultTerm());
  const [multi, setMulti] = useState(null);          // null until answered
  // Seeded with the school's own name, because a single-site school should be
  // able to accept the default without typing anything.
  const [campusNames, setCampusNames] = useState([schoolName || "Main Campus"]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const named = campusNames.map((n) => n.trim()).filter(Boolean);
  const campusesReady = multi === false ? named.length >= 1 : named.length >= 2;
  const ready = Boolean(type) && multi !== null && campusesReady;

  function setName(i, value) {
    setCampusNames((prev) => prev.map((n, idx) => (idx === i ? value : n)));
  }

  const save = async () => {
    setBusy(true);
    setError("");

    // Order matters. The dashboard watches school_settings live and drops this
    // gate the moment `schoolType` appears, so writing that first would unmount
    // this component mid-save and leave a school with a type, no term and no
    // campuses. The flag that closes the gate is therefore written LAST, once
    // everything it stands for actually exists.

    // Campuses are created in order, so the first one becomes the primary site
    // — the fallback every record with no campus is attributed to.
    const wanted = multi ? named : named.slice(0, 1);
    for (const name of wanted) {
      const res = await createCampus({ schoolCode, name, actorId });
      if (!res.ok) { setError(res.error); setBusy(false); return; }
    }
    const c = await setCampusMode({ schoolCode, multiCampus: Boolean(multi), actorId });
    if (!c.ok) { setError(c.error); setBusy(false); return; }

    // The term matters as much as the type: without one, published marks never
    // reach families.
    const b = await setCurrentTerm({ schoolCode, term, actorId });
    if (!b.ok) { setError(b.error); setBusy(false); return; }

    const a = await setSchoolType({ schoolCode, schoolType: type, actorId });
    if (!a.ok) { setError(a.error); setBusy(false); return; }

    setBusy(false);
    onDone?.({ schoolType: type, currentTerm: term, multiCampus: Boolean(multi) });
  };

  return (
    <div className="space-y-6" style={{ maxWidth: 640, margin: "0 auto", paddingTop: 24 }}>
      <div style={{ textAlign: "center" }}>
        <div className="empty-state__icon" style={{ margin: "0 auto 16px" }}>
          <School size={30} />
        </div>
        <SetupSteps step={1} />
        <h2 className="module-title" style={{ marginTop: 14 }}>Set up {schoolName || "your school"}</h2>
        <p className="module-sub">
          Three answers, once. They decide what the rest of the school sees. Next: your classes and settings.
        </p>
      </div>

      {error && <Notice tone="danger">{error}</Notice>}

      <div className="card p-6 space-y-5">
        {/* ── 1. Day or boarding ─────────────────────────────────────────── */}
        <div>
          <label className="field__label">Is this a day school or a boarding school?</label>
          <p className="text-muted mb-3" style={{ fontSize: 12 }}>
            Boarding tools — dormitories, the sign-out register, the sick bay — appear only if the
            school keeps students overnight.
          </p>
          <div className="space-y-2">
            {SCHOOL_TYPES.map((t) => (
              <button
                key={t.id}
                type="button"
                className={`choice-btn ${type === t.id ? "choice-btn--active" : ""}`}
                onClick={() => setType(t.id)}
                style={{ width: "100%", textAlign: "left" }}
              >
                <div className="flex items-center justify-between" style={{ gap: 12 }}>
                  <div>
                    <strong>{t.label}</strong>
                    <div className="text-muted" style={{ fontSize: 12 }}>{t.blurb}</div>
                  </div>
                  {type === t.id && <Check size={18} />}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* ── 2. Term ────────────────────────────────────────────────────── */}
        <Select
          label="Which term is running now?"
          required
          value={term}
          hint="Marks, fees and attendance are all tracked against this. Nothing reaches families without it."
          onChange={(e) => setTerm(e.target.value)}
        >
          {termOptions(term).map((t) => <option key={t} value={t}>{t}</option>)}
        </Select>

        {/* ── 3. Campuses ────────────────────────────────────────────────── */}
        <div>
          <label className="field__label">How many sites does the school teach from?</label>
          <p className="text-muted mb-3" style={{ fontSize: 12 }}>
            Campuses stay under this one school — one board, one subscription, one set of
            reports — but each keeps its own students, classes and registers. Staff see only the
            campuses they are attached to.
          </p>

          <div className="space-y-2">
            <button
              type="button"
              className={`choice-btn ${multi === false ? "choice-btn--active" : ""}`}
              onClick={() => { setMulti(false); setCampusNames([campusNames[0] || schoolName || "Main Campus"]); }}
              style={{ width: "100%", textAlign: "left" }}
            >
              <div className="flex items-center justify-between" style={{ gap: 12 }}>
                <div>
                  <strong>One site</strong>
                  <div className="text-muted" style={{ fontSize: 12 }}>
                    Nobody is ever shown a campus picker. You can add a second site later.
                  </div>
                </div>
                {multi === false && <Check size={18} />}
              </div>
            </button>

            <button
              type="button"
              className={`choice-btn ${multi === true ? "choice-btn--active" : ""}`}
              onClick={() => {
                setMulti(true);
                setCampusNames((prev) => (prev.length > 1 ? prev : [...prev, ""]));
              }}
              style={{ width: "100%", textAlign: "left" }}
            >
              <div className="flex items-center justify-between" style={{ gap: 12 }}>
                <div>
                  <strong>More than one site</strong>
                  <div className="text-muted" style={{ fontSize: 12 }}>
                    Each campus keeps its own roll. Moving a student between them needs approval.
                  </div>
                </div>
                {multi === true && <Check size={18} />}
              </div>
            </button>
          </div>

          {multi !== null && (
            <div className="space-y-2" style={{ marginTop: 14 }}>
              {campusNames.map((name, i) => (
                <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
                  <div style={{ flex: 1 }}>
                    <Input
                      label={i === 0 ? "Main campus name" : `Campus ${i + 1}`}
                      value={name}
                      onChange={(e) => setName(i, e.target.value)}
                      placeholder={i === 0 ? schoolName || "Main Campus" : "Zomba Campus"}
                      hint={i === 0 ? "Anything with no campus recorded counts against this one." : undefined}
                    />
                  </div>
                  {multi && i > 0 && (
                    <button
                      type="button"
                      className="icon-btn icon-btn--danger"
                      title="Remove"
                      onClick={() => setCampusNames((prev) => prev.filter((_, idx) => idx !== i))}
                      style={{ marginBottom: 4 }}
                    >
                      <X size={15} />
                    </button>
                  )}
                </div>
              ))}

              {multi && (
                <Btn
                  variant="ghost"
                  size="sm"
                  icon={<Plus size={14} />}
                  onClick={() => setCampusNames((prev) => [...prev, ""])}
                >
                  Add another campus
                </Btn>
              )}
            </div>
          )}
        </div>

        <div className="flex justify-end">
          <Btn
            variant="accent"
            loading={busy}
            disabled={!ready}
            icon={<ArrowRight size={15} />}
            onClick={save}
          >
            Continue to step 2
          </Btn>
        </div>
      </div>

      <p className="text-muted" style={{ fontSize: 12, textAlign: "center" }}>
        All three can be changed later — school type and campuses in School Settings, and the
        head teacher moves the term on from their dashboard at the end of each one.
      </p>
    </div>
  );
}
