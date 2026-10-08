// src/pages/platform/modules/GuardianLookup.jsx
// ─────────────────────────────────────────────────────────────────────────────
// For a parent whose login never reached them: search their phone number, read
// the password out (or open WhatsApp with the message ready). Each lookup is
// recorded in the Activity log.
// ─────────────────────────────────────────────────────────────────────────────
import { useState } from "react";
import { Search, Copy, Check, MessageCircle, KeyRound } from "lucide-react";
import { lookupGuardian } from "../../../services/platform";
import { credentialsSms } from "../../../services/guardianLink";
import { ModuleHeader, Btn, Notice, EmptyState, Pill, TableWrap } from "../../../components/ui/ModuleKit";
import "../../headteacher/modules/staff-management.css";

function Guardian({ g }) {
  const [copied, setCopied] = useState("");
  const copy = (text) => {
    navigator.clipboard?.writeText(text).then(() => { setCopied(text); setTimeout(() => setCopied(""), 1500); }).catch(() => {});
  };
  const school = g.children[0]?.schoolName || "ACALink";
  const names = g.children.map((c) => c.name).filter(Boolean).join(", ");
  const wa = g.phone.replace(/\D/g, "");

  return (
    <div className="card" style={{ padding: 16, marginBottom: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <strong>{g.name || "(no name)"}</strong>
          <div className="text-muted" style={{ fontSize: 13, fontFamily: "var(--font-mono)" }}>{g.phone}</div>
        </div>
        <div style={{ textAlign: "right" }}>
          {g.passwords.length === 0 && <span className="text-muted" style={{ fontSize: 13 }}>No password on record</span>}
          {g.passwords.map((pw) => (
            <div key={pw} style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "flex-end", marginBottom: 4, flexWrap: "wrap" }}>
              <KeyRound size={14} />
              <code style={{ fontSize: 16, fontWeight: 600, letterSpacing: 0.5 }}>{pw}</code>
              <Btn size="sm" variant="secondary" icon={copied === pw ? <Check size={14} /> : <Copy size={14} />} onClick={() => copy(pw)}>
                {copied === pw ? "Copied" : "Copy"}
              </Btn>
              {wa && (
                <a
                  className="btn btn--secondary btn--sm"
                  target="_blank" rel="noreferrer"
                  href={`https://wa.me/${wa}?text=${encodeURIComponent(credentialsSms({ schoolName: school, phone: g.phone, password: pw, studentNames: names || "your children" }))}`}
                >
                  <MessageCircle size={14} /> WhatsApp
                </a>
              )}
            </div>
          ))}
          {g.passwords.length > 1 && <div className="text-muted" style={{ fontSize: 11 }}>Different children have different passwords — try the first.</div>}
        </div>
      </div>
      <div style={{ marginTop: 12 }}>
        <TableWrap>
          <table className="data-table">
            <thead><tr><th>Child</th><th>Class</th><th>School</th><th>Link</th></tr></thead>
            <tbody>
              {g.children.map((c) => (
                <tr key={c.id}>
                  <td>{c.name}</td>
                  <td>{c.className || "—"}</td>
                  <td>{c.schoolName || c.schoolCode}</td>
                  <td><Pill tone={c.confirmed ? "success" : "warning"}>{c.confirmed ? "Confirmed" : "Awaiting confirmation"}</Pill></td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      </div>
    </div>
  );
}

export default function GuardianLookup() {
  const [phone, setPhone] = useState("");
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const search = async (e) => {
    e.preventDefault();
    if (!phone.trim()) return;
    setBusy(true); setError(""); setResult(null);
    try {
      setResult(await lookupGuardian(phone));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <ModuleHeader title="Guardians" subtitle="Find a parent by phone number to give them their app password" />
      <Notice tone="warning">Passwords are private. Each lookup is recorded in Activity with your name.</Notice>
      <form onSubmit={search} className="flex items-center gap-3 mb-4" style={{ flexWrap: "wrap" }}>
        <input
          className="search-input" style={{ maxWidth: 300 }} inputMode="tel" autoFocus
          placeholder="Phone, e.g. 0999 123 456"
          value={phone} onChange={(e) => setPhone(e.target.value)}
        />
        <Btn type="submit" variant="accent" icon={<Search size={14} />} loading={busy} disabled={!phone.trim()}>Search</Btn>
      </form>
      {error && <Notice tone="danger">{error}</Notice>}
      {result && result.length === 0 && (
        <EmptyState icon={<Search size={28} />} title="No guardian with that number" sub="Check the number, or try it with and without the country code." />
      )}
      {result?.map((g) => <Guardian key={g.phone} g={g} />)}
    </div>
  );
}
