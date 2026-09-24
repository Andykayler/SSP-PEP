// src/components/ai/AiQuestionMaker.jsx
// Drafts syllabus-aligned questions for homework or a class exercise from the
// class, subject and topic (the homework title). The questions go into the
// instructions box for the teacher to edit; the marking key stays here, for the
// teacher only, since homework instructions are shown to pupils and families.
import { useState } from "react";
import { Sparkles, Loader2, Copy, Check } from "lucide-react";
import { generateQuiz, formatQuestions } from "../../services/aiTools";

export default function AiQuestionMaker({ className, subject, topic, onQuestions }) {
  const [count, setCount] = useState(5);
  const [kind, setKind] = useState("mixed");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [key, setKey] = useState("");
  const [copied, setCopied] = useState(false);

  const run = async () => {
    setBusy(true);
    setError("");
    const { data, error: err } = await generateQuiz({ className, subject, topic, count, kind });
    setBusy(false);
    if (err) { setError(err); return; }
    onQuestions(formatQuestions(data.questions));
    setKey(data.questions.map((q, i) => `${i + 1}. ${q.answer}`).join("\n"));
  };

  const copy = async () => {
    try { await navigator.clipboard.writeText(key); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* clipboard blocked */ }
  };

  const ready = subject && topic?.trim();

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 12.5 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <button type="button" onClick={run} disabled={busy || !ready} className="btn-cancel"
          title={ready ? "Draft questions on this topic" : "Choose a subject and type the topic as the title first"}
          style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 12px" }}>
          {busy ? <Loader2 size={14} style={{ animation: "spin 0.65s linear infinite" }} /> : <Sparkles size={14} />}
          Generate questions
        </button>
        <select value={count} onChange={(e) => setCount(Number(e.target.value))} className="field__select" style={{ width: "auto", padding: "4px 8px" }} aria-label="How many questions">
          {[3, 5, 8, 10, 15].map((n) => <option key={n} value={n}>{n} questions</option>)}
        </select>
        <select value={kind} onChange={(e) => setKind(e.target.value)} className="field__select" style={{ width: "auto", padding: "4px 8px" }} aria-label="Question type">
          <option value="mixed">Mixed</option>
          <option value="multiple-choice">Multiple choice</option>
          <option value="short-answer">Short answer</option>
        </select>
      </div>
      {error && <span style={{ color: "#ef4444" }}>{error}</span>}
      {key && (
        <details style={{ border: "1px dashed var(--border-color)", borderRadius: 8, padding: "6px 10px" }}>
          <summary style={{ cursor: "pointer", fontWeight: 600 }}>Marking key (only you see this)</summary>
          <pre style={{ whiteSpace: "pre-wrap", fontFamily: "inherit", margin: "8px 0" }}>{key}</pre>
          <button type="button" onClick={copy} className="btn-cancel" style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 10px" }}>
            {copied ? <Check size={13} /> : <Copy size={13} />} {copied ? "Copied" : "Copy key"}
          </button>
        </details>
      )}
    </div>
  );
}
