// src/components/ai/AiNoticeWriter.jsx
// Sits under an announcement's message box: rewrites the rough notes typed
// there into a clear notice for families, in English, Chichewa or both. The
// result replaces the message so it can still be edited before posting; facts,
// dates and amounts are kept as typed (the prompt forbids inventing any).
import { useState } from "react";
import { Sparkles, Loader2 } from "lucide-react";
import { draftAnnouncement } from "../../services/aiTools";

export default function AiNoticeWriter({ notes, title, audience, schoolName, onDraft }) {
  const [language, setLanguage] = useState("both");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const run = async () => {
    setBusy(true);
    setError("");
    const { data, error: err } = await draftAnnouncement({
      notes: [title, notes].filter(Boolean).join("\n"), language, audience, schoolName,
    });
    setBusy(false);
    if (err) { setError(err); return; }
    const message = [data.english, data.chichewa && (data.english ? `— Chichewa —\n${data.chichewa}` : data.chichewa)]
      .filter(Boolean).join("\n\n");
    onDraft({ title: data.title, message });
  };

  const tooShort = `${title || ""} ${notes || ""}`.trim().length < 5;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", fontSize: 12.5 }}>
      <button type="button" onClick={run} disabled={busy || tooShort} className="btn-cancel"
        title={tooShort ? "Type a few rough notes first" : "Rewrite the notes as a clear notice"}
        style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 12px" }}>
        {busy ? <Loader2 size={14} style={{ animation: "spin 0.65s linear infinite" }} /> : <Sparkles size={14} />}
        Write it for me
      </button>
      <select value={language} onChange={(e) => setLanguage(e.target.value)} className="field__select" style={{ width: "auto", padding: "4px 8px" }} aria-label="Language">
        <option value="both">English + Chichewa</option>
        <option value="english">English</option>
        <option value="chichewa">Chichewa</option>
      </select>
      <span className="text-muted">Type rough notes, then let AI tidy and translate them.</span>
      {error && <span style={{ color: "#ef4444", width: "100%" }}>{error}</span>}
    </div>
  );
}
