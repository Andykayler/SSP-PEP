// src/components/setup/SchoolSetupGate.jsx
// The one question that has to be answered before the rest of the system means
// anything: does this school board its students?
//
// It gates rather than nags because the answer changes what other people see.
// A day school shown dormitory allocation and a sign-out register learns to
// scroll past modules, and that habit costs more than the thirty seconds this
// screen takes. A boarding school that never answers gets the reverse: the
// tools that would tell them which children are on site stay hidden behind a
// setting nobody knew existed.
//
// Shown only to the administrator, who sets the school up. Everyone else works
// with whatever answer they gave.
import { useState } from "react";
import { School, Check, ArrowRight } from "lucide-react";
import { SCHOOL_TYPES, setSchoolType } from "../../services/schoolProfile";
import { setCurrentTerm, termOptions, defaultTerm } from "../../services/academicTerm";
import { Btn, Select, Notice } from "../ui/ModuleKit";

export default function SchoolSetupGate({ schoolCode, schoolName, actorId, onDone }) {
  const [type, setType] = useState("");
  const [term, setTerm] = useState(defaultTerm());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const save = async () => {
    setBusy(true);
    setError("");
    const a = await setSchoolType({ schoolCode, schoolType: type, actorId });
    if (!a.ok) { setError(a.error); setBusy(false); return; }
    // The term is set here too because the two answers together are what make
    // the system usable: without a term, published marks never reach families.
    const b = await setCurrentTerm({ schoolCode, term, actorId });
    setBusy(false);
    if (!b.ok) { setError(b.error); return; }
    onDone?.({ schoolType: type, currentTerm: term });
  };

  return (
    <div className="space-y-6" style={{ maxWidth: 640, margin: "0 auto", paddingTop: 24 }}>
      <div style={{ textAlign: "center" }}>
        <div className="empty-state__icon" style={{ margin: "0 auto 16px" }}>
          <School size={30} />
        </div>
        <h2 className="module-title">Set up {schoolName || "your school"}</h2>
        <p className="module-sub">
          Two answers, once. They decide what the rest of the school sees.
        </p>
      </div>

      {error && <Notice tone="danger">{error}</Notice>}

      <div className="card p-6 space-y-5">
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

        <Select
          label="Which term is running now?"
          required
          value={term}
          hint="Marks, fees and attendance are all tracked against this. Nothing reaches families without it."
          onChange={(e) => setTerm(e.target.value)}
        >
          {termOptions(term).map((t) => <option key={t} value={t}>{t}</option>)}
        </Select>

        <div className="flex justify-end">
          <Btn
            variant="accent"
            loading={busy}
            disabled={!type}
            icon={<ArrowRight size={15} />}
            onClick={save}
          >
            Finish setup
          </Btn>
        </div>
      </div>

      <p className="text-muted" style={{ fontSize: 12, textAlign: "center" }}>
        Both can be changed later in School Settings, and the head teacher moves the term on from
        their dashboard at the end of each one.
      </p>
    </div>
  );
}
