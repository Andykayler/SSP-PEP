// src/components/TermCard.jsx
// The head teacher's control for "which term is it". Everything that records
// a term — mark entry, reports, the parent app's grades card — reads what is
// set here, so it deliberately sits on the portal's landing page rather than
// being buried in a settings screen.
import { useEffect, useState } from "react";
import { CalendarRange, Check, ChevronRight, Loader2, AlertTriangle } from "lucide-react";
import {
  subscribeSchoolSettings, setCurrentTerm, termOptions, nextTerm,
  formatTerm, academicYearFor, defaultTerm,
} from "../services/academicTerm";

export default function TermCard({ schoolCode, actorId, onTermChange }) {
  const [settings, setSettings] = useState(undefined); // undefined = still loading
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState(null);

  useEffect(() => {
    if (!schoolCode) return undefined;
    const unsub = subscribeSchoolSettings(schoolCode, (data) => {
      setSettings(data);
      onTermChange?.(data?.currentTerm || "");
    });
    return () => unsub();
  }, [schoolCode, onTermChange]);

  const currentTerm = settings?.currentTerm || "";
  const loading = settings === undefined;
  const unset = !loading && !currentTerm;
  const upcoming = nextTerm(currentTerm || defaultTerm());

  const save = async (term) => {
    setSaving(true);
    setStatus(null);
    const res = await setCurrentTerm({ schoolCode, term, actorId });
    setSaving(false);
    setStatus(res.ok
      ? { type: "ok", message: `Now recording against ${term}.` }
      : { type: "error", message: res.error });
    if (res.ok) setDraft("");
  };

  if (loading) {
    return (
      <div className="card p-4 flex items-center gap-2 text-muted">
        <Loader2 size={15} className="act-spin" /> Loading academic term…
      </div>
    );
  }

  return (
    <div className="card term-card">
      <div className="term-card__main">
        <div className="term-card__icon"><CalendarRange size={19} /></div>

        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="sec-eyebrow" style={{ margin: 0 }}>Academic term</div>
          {unset ? (
            <>
              <div className="term-card__value term-card__value--unset">Not set</div>
              <p className="term-card__hint">
                <AlertTriangle size={12} /> Marks, reports and the parent app all record
                against the current term. Until one is set, grades a teacher enters may
                not reach families.
              </p>
            </>
          ) : (
            <>
              <div className="term-card__value">{currentTerm}</div>
              <p className="term-card__hint">
                Academic year {academicYearFor(currentTerm)} · everything recorded from
                now is filed under this term
              </p>
            </>
          )}
        </div>

        <div className="term-card__controls">
          <select
            className="field__select term-card__select"
            value={draft || currentTerm}
            onChange={(e) => setDraft(e.target.value)}
            disabled={saving}
            aria-label="Select the current academic term"
          >
            {!currentTerm && <option value="">Choose a term…</option>}
            {termOptions(currentTerm).map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>

          <button
            type="button"
            className="btn btn--accent btn--sm"
            disabled={saving || !draft || draft === currentTerm}
            onClick={() => save(draft)}
          >
            {saving ? <Loader2 size={13} className="act-spin" /> : <Check size={13} />}
            Set term
          </button>
        </div>
      </div>

      {currentTerm && upcoming && (
        <div className="term-card__advance">
          <div>
            <span className="term-card__advance-label">Next</span>
            <strong>{formatTerm(upcoming.number, upcoming.year)}</strong>
            {upcoming.startsNewYear && (
              <span className="term-card__badge">
                new academic year — run Promotion in Reports first
              </span>
            )}
          </div>
          <button
            type="button"
            className="btn btn--secondary btn--sm"
            disabled={saving}
            onClick={() => {
              const target = formatTerm(upcoming.number, upcoming.year);
              const warning = upcoming.startsNewYear
                ? `Advancing to ${target} starts a new academic year. Students are NOT promoted `
                  + `by this action — run Reports → Promotion to move them up a form first.\n\n`
                  + `Continue?`
                : `Move the school on to ${target}? New marks and reports will be filed `
                  + `under it; existing ${currentTerm} records are untouched.`;
              if (window.confirm(warning)) save(target);
            }}
          >
            Advance <ChevronRight size={13} />
          </button>
        </div>
      )}

      {status && (
        <div className={`term-card__status term-card__status--${status.type}`}>
          {status.message}
        </div>
      )}
    </div>
  );
}
