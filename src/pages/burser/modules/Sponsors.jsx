// src/pages/burser/modules/Sponsors.jsx
// Sponsors, and the students they pay for.
//
// Two tabs because they are two jobs: keeping the sponsor's details, and
// keeping the agreements. The agreements tab is the one the bursar lives in —
// it answers "is this child's fee covered, and has the money arrived", which
// is what stops a sponsored student being sent home over a debt somebody else
// had already agreed to settle.
import { useState, useEffect, useCallback, useMemo } from "react";
import { db } from "../../../firebase";
import { collection, query, where, getDocs } from "firebase/firestore";
import {
  HeartHandshake, Plus, Pencil, Trash2, RefreshCw, Users, Search,
} from "lucide-react";
import {
  fetchSponsors, saveSponsor, deleteSponsor, fetchSponsorships,
  saveSponsorship, deleteSponsorship, SPONSOR_TYPES, COVERAGE_TYPES,
  sponsorshipStatus, expectedContribution, coverageLabel, sponsorTypeLabel,
} from "../../../services/sponsorships";
import { subscribeSchoolSettings, termOptions, termsMatch } from "../../../services/academicTerm";
import {
  Modal, Btn, IconBtn, Input, Textarea, Select, Pill, EmptyState, StatGrid,
  StatCard, ModuleHeader, Notice, LoadingState, TableWrap,
} from "../../../components/ui/ModuleKit";
import "./staff-management.css";
import useLoader from "../../../hooks/useLoader";
import { money } from "../../../components/ui/format";

const BLANK_SPONSOR = {
  name: "", type: "church", contactName: "", phone: "", email: "", notes: "", active: true,
};

export default function Sponsors({ schoolCode, currentUser }) {
  const [tab, setTab] = useState("agreements");
  const [sponsors, setSponsors] = useState(null);
  const [agreements, setAgreements] = useState([]);
  const [students, setStudents] = useState([]);
  const [charges, setCharges] = useState([]);
  const [payments, setPayments] = useState([]);
  const [term, setTerm] = useState("");
  const [search, setSearch] = useState("");
  const [sponsorForm, setSponsorForm] = useState(null);
  const [agreementForm, setAgreementForm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);

  const load = useCallback(async () => {
    if (!schoolCode) return;
    try {
      const [sp, ag, studentSnap, chargeSnap, paySnap] = await Promise.all([
        fetchSponsors(schoolCode),
        fetchSponsorships(schoolCode),
        getDocs(query(collection(db, "students"), where("schoolCode", "==", schoolCode))),
        getDocs(query(collection(db, "fee_assignments"), where("schoolCode", "==", schoolCode))),
        getDocs(query(collection(db, "payments"), where("schoolCode", "==", schoolCode))),
      ]);
      setSponsors(sp);
      setAgreements(ag);
      setStudents(studentSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setCharges(chargeSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setPayments(paySnap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (err) {
      console.error("[sponsors] load failed:", err);
      setNotice({ tone: "danger", text: "Could not load sponsorships: " + err.message });
      setSponsors([]);
    }
  }, [schoolCode]);

  useLoader(load);

  useEffect(() => {
    if (!schoolCode) return;
    return subscribeSchoolSettings(schoolCode, (s) => setTerm(s?.currentTerm || ""));
  }, [schoolCode]);

  // Charges for the running term decide what a sponsor is expected to cover.
  // termsMatch rather than equality: fee_assignments store "Term 1" (and
  // "Full Year") while this screen knows "Term 1 2026".
  const chargedFor = useCallback((studentId) => charges
    .filter((c) => c.studentId === studentId && !c.optional && (!term || termsMatch(c.term, term)))
    .reduce((s, c) => s + (Number(c.amount) || 0), 0), [charges, term]);

  const sponsorPaidFor = useCallback((studentId, sponsorId) => payments
    .filter((p) => p.studentId === studentId
      && p.sponsorId === sponsorId
      && p.status === "verified"
      && (!term || termsMatch(p.term, term)))
    .reduce((s, p) => s + (Number(p.amount) || 0), 0), [payments, term]);

  const enriched = useMemo(() => agreements.map((a) => {
    const charged = chargedFor(a.studentId);
    const expected = expectedContribution(a, charged);
    const received = sponsorPaidFor(a.studentId, a.sponsorId);
    return {
      ...a,
      charged,
      expected,
      received,
      shortfall: Math.max(0, expected - received),
      status: sponsorshipStatus(a, term),
    };
  }), [agreements, chargedFor, sponsorPaidFor, term]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return enriched
      .filter((a) => !q
        || a.studentName?.toLowerCase().includes(q)
        || a.sponsorName?.toLowerCase().includes(q))
      .sort((a, b) => b.shortfall - a.shortfall
        || (a.studentName || "").localeCompare(b.studentName || ""));
  }, [enriched, search]);

  const totals = useMemo(() => ({
    students: new Set(enriched.map((a) => a.studentId)).size,
    expected: enriched.reduce((s, a) => s + a.expected, 0),
    received: enriched.reduce((s, a) => s + a.received, 0),
    lapsing: enriched.filter((a) => ["expired", "ending"].includes(a.status.id)).length,
  }), [enriched]);

  // ── Actions ────────────────────────────────────────────────────────────────
  const submitSponsor = async () => {
    setBusy(true);
    const res = await saveSponsor({ schoolCode, sponsor: sponsorForm, actor: currentUser });
    setBusy(false);
    if (!res.ok) { setNotice({ tone: "danger", text: res.error }); return; }
    setSponsorForm(null);
    setNotice({ tone: "success", text: "Sponsor saved." });
    load();
  };

  const submitAgreement = async () => {
    const sponsor = sponsors.find((s) => s.id === agreementForm.sponsorId);
    const student = students.find((s) => s.id === agreementForm.studentId);
    setBusy(true);
    const res = await saveSponsorship({
      schoolCode, sponsorship: agreementForm, sponsor, student, actor: currentUser,
    });
    setBusy(false);
    if (!res.ok) { setNotice({ tone: "danger", text: res.error }); return; }
    setAgreementForm(null);
    setNotice({ tone: "success", text: "Sponsorship saved." });
    load();
  };

  const removeSponsor = async (s) => {
    const linked = agreements.filter((a) => a.sponsorId === s.id).length;
    if (linked > 0) {
      setNotice({
        tone: "warning",
        text: `${s.name} still has ${linked} sponsorship${linked === 1 ? "" : "s"}. Remove those first.`,
      });
      return;
    }
    if (!window.confirm(`Remove ${s.name}?`)) return;
    await deleteSponsor(s.id);
    load();
  };

  const removeAgreement = async (a) => {
    if (!window.confirm(`End ${a.sponsorName}'s sponsorship of ${a.studentName}?`)) return;
    await deleteSponsorship(a.id);
    load();
  };

  if (sponsors === null) return <LoadingState label="Loading sponsorships…" />;

  return (
    <div className="space-y-6">
      <ModuleHeader
        title="Sponsors & Bursaries"
        subtitle={`Who pays for whom${term ? ` · ${term}` : ""}`}
        actions={[
          <IconBtn key="r" icon={<RefreshCw size={15} />} title="Refresh" onClick={load} />,
          <Btn
            key="a" variant="accent" icon={<Plus size={15} />}
            onClick={() => (tab === "sponsors"
              ? setSponsorForm({ ...BLANK_SPONSOR })
              : setAgreementForm({
                sponsorId: "", studentId: "", coverageType: "full",
                coverageValue: "", startTerm: term, endTerm: "", reference: "", notes: "",
              }))}
            disabled={tab === "agreements" && sponsors.length === 0}
          >
            {tab === "sponsors" ? "Add Sponsor" : "Add Sponsorship"}
          </Btn>,
        ]}
      />

      {notice && <Notice tone={notice.tone} onDismiss={() => setNotice(null)}>{notice.text}</Notice>}

      <StatGrid>
        <StatCard label="Sponsored students" value={totals.students} tone="success"
          sub={`${sponsors.length} sponsor${sponsors.length === 1 ? "" : "s"}`} />
        <StatCard label="Expected this term" value={money(totals.expected)} />
        <StatCard label="Received this term" value={money(totals.received)}
          tone={totals.received >= totals.expected ? "success" : "warning"} />
        <StatCard label="Ending or expired" value={totals.lapsing}
          tone={totals.lapsing ? "danger" : "success"} sub="Need renewing with the sponsor" />
      </StatGrid>

      <div className="tab-bar">
        <button type="button" className={`tab ${tab === "agreements" ? "tab--active" : ""}`}
          onClick={() => setTab("agreements")}>
          Sponsorships ({agreements.length})
        </button>
        <button type="button" className={`tab ${tab === "sponsors" ? "tab--active" : ""}`}
          onClick={() => setTab("sponsors")}>
          Sponsors ({sponsors.length})
        </button>
      </div>

      {tab === "agreements" ? (
        <>
          <div className="search-wrapper">
            <Search size={15} className="search-icon" />
            <input className="search-input" placeholder="Search by student or sponsor…"
              value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>

          {visible.length === 0 ? (
            <EmptyState
              icon={<HeartHandshake size={28} />}
              title="No sponsorships recorded"
              sub={sponsors.length === 0
                ? "Add a sponsor first, then link the students they pay for."
                : "Link a sponsor to the students they pay for."}
            />
          ) : (
            <TableWrap>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Student</th><th>Sponsor</th><th>Covers</th>
                    <th>Expected</th><th>Received</th><th>Status</th>
                    <th style={{ textAlign: "right" }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((a) => (
                    <tr key={a.id}>
                      <td>
                        <strong>{a.studentName}</strong>
                        <div className="text-muted" style={{ fontSize: 11 }}>{a.className}</div>
                      </td>
                      <td>
                        {a.sponsorName}
                        <div className="text-muted" style={{ fontSize: 11 }}>
                          {sponsorTypeLabel(a.sponsorType)}
                        </div>
                      </td>
                      <td className="text-muted">{coverageLabel(a)}</td>
                      <td>{money(a.expected)}</td>
                      <td>
                        {money(a.received)}
                        {a.shortfall > 0 && (
                          <div className="text-warning" style={{ fontSize: 11 }}>
                            {money(a.shortfall)} short
                          </div>
                        )}
                      </td>
                      <td><Pill tone={a.status.tone}>{a.status.label}</Pill></td>
                      <td style={{ textAlign: "right" }}>
                        <div className="flex gap-2 justify-end">
                          <IconBtn icon={<Pencil size={15} />} title="Edit"
                            onClick={() => setAgreementForm({ ...a })} />
                          <IconBtn icon={<Trash2 size={15} />} title="End sponsorship" danger
                            onClick={() => removeAgreement(a)} />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          )}
        </>
      ) : sponsors.length === 0 ? (
        <EmptyState
          icon={<Users size={28} />}
          title="No sponsors yet"
          sub="A diocese, an NGO, a company or an individual who pays fees for one or more students."
          action={<Btn variant="accent" icon={<Plus size={15} />}
            onClick={() => setSponsorForm({ ...BLANK_SPONSOR })}>Add Sponsor</Btn>}
        />
      ) : (
        <div className="space-y-2">
          {sponsors.map((s) => {
            const count = agreements.filter((a) => a.sponsorId === s.id).length;
            return (
              <div key={s.id} className="card p-5 flex items-center justify-between"
                style={{ flexWrap: "wrap", gap: 12 }}>
                <div>
                  <div className="flex items-center gap-2 mb-1" style={{ flexWrap: "wrap" }}>
                    <strong>{s.name}</strong>
                    <span className="tag tag--neutral">{sponsorTypeLabel(s.type)}</span>
                    {!s.active && <Pill tone="warning">Inactive</Pill>}
                  </div>
                  <div className="text-muted" style={{ fontSize: 12 }}>
                    {[s.contactName, s.phone, s.email].filter(Boolean).join(" · ") || "No contact details"}
                    {` · ${count} student${count === 1 ? "" : "s"}`}
                  </div>
                </div>
                <div className="flex gap-2">
                  <IconBtn icon={<Pencil size={15} />} title="Edit"
                    onClick={() => setSponsorForm({ ...s })} />
                  <IconBtn icon={<Trash2 size={15} />} title="Remove" danger
                    onClick={() => removeSponsor(s)} />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Sponsor form ───────────────────────────────────────────────────── */}
      {sponsorForm && (
        <Modal
          title={sponsorForm.id ? "Edit sponsor" : "Add a sponsor"}
          onClose={() => setSponsorForm(null)}
          footer={(
            <>
              <Btn variant="secondary" onClick={() => setSponsorForm(null)}>Cancel</Btn>
              <Btn variant="accent" loading={busy} onClick={submitSponsor}>Save</Btn>
            </>
          )}
        >
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Input label="Name" required value={sponsorForm.name}
                placeholder="Blantyre Synod Education Fund"
                onChange={(e) => setSponsorForm((p) => ({ ...p, name: e.target.value }))} />
              <Select label="Type" value={sponsorForm.type}
                onChange={(e) => setSponsorForm((p) => ({ ...p, type: e.target.value }))}>
                {SPONSOR_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Input label="Contact person" value={sponsorForm.contactName}
                onChange={(e) => setSponsorForm((p) => ({ ...p, contactName: e.target.value }))} />
              <Input label="Phone" value={sponsorForm.phone}
                onChange={(e) => setSponsorForm((p) => ({ ...p, phone: e.target.value }))} />
            </div>
            <Input label="Email" type="email" value={sponsorForm.email}
              onChange={(e) => setSponsorForm((p) => ({ ...p, email: e.target.value }))} />
            <Textarea label="Notes" value={sponsorForm.notes}
              hint="Renewal terms, who to chase, how they prefer to pay."
              onChange={(e) => setSponsorForm((p) => ({ ...p, notes: e.target.value }))} />
          </div>
        </Modal>
      )}

      {/* ── Sponsorship form ───────────────────────────────────────────────── */}
      {agreementForm && (
        <Modal
          title={agreementForm.id ? "Edit sponsorship" : "Add a sponsorship"}
          subtitle="One sponsor, one student, for a stretch of terms."
          onClose={() => setAgreementForm(null)}
          footer={(
            <>
              <Btn variant="secondary" onClick={() => setAgreementForm(null)}>Cancel</Btn>
              <Btn variant="accent" loading={busy} onClick={submitAgreement}>Save</Btn>
            </>
          )}
        >
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Select label="Sponsor" required value={agreementForm.sponsorId}
                onChange={(e) => setAgreementForm((p) => ({ ...p, sponsorId: e.target.value }))}>
                <option value="">Choose a sponsor…</option>
                {sponsors.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </Select>
              <Select label="Student" required value={agreementForm.studentId}
                onChange={(e) => setAgreementForm((p) => ({ ...p, studentId: e.target.value }))}>
                <option value="">Choose a student…</option>
                {students
                  .slice()
                  .sort((a, b) => (a.fullName || "").localeCompare(b.fullName || ""))
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.fullName}{s.className ? ` — ${s.className}` : ""}
                    </option>
                  ))}
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Select label="Coverage" required value={agreementForm.coverageType}
                hint={COVERAGE_TYPES.find((c) => c.id === agreementForm.coverageType)?.hint}
                onChange={(e) => setAgreementForm((p) => ({ ...p, coverageType: e.target.value }))}>
                {COVERAGE_TYPES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
              </Select>
              {agreementForm.coverageType !== "full" && (
                <Input
                  label={agreementForm.coverageType === "percentage" ? "Percentage" : "Amount per term"}
                  required type="number" min="0"
                  value={agreementForm.coverageValue}
                  onChange={(e) => setAgreementForm((p) => ({ ...p, coverageValue: e.target.value }))}
                />
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Select label="Starts" required value={agreementForm.startTerm}
                onChange={(e) => setAgreementForm((p) => ({ ...p, startTerm: e.target.value }))}>
                <option value="">Choose a term…</option>
                {termOptions(term).map((t) => <option key={t} value={t}>{t}</option>)}
              </Select>
              <Select label="Ends" value={agreementForm.endTerm}
                hint="Leave open if the sponsor has not named an end."
                onChange={(e) => setAgreementForm((p) => ({ ...p, endTerm: e.target.value }))}>
                <option value="">Open-ended</option>
                {termOptions(term).map((t) => <option key={t} value={t}>{t}</option>)}
              </Select>
            </div>

            <Input label="Sponsor reference" value={agreementForm.reference}
              hint="Their file number, so payments can be matched."
              onChange={(e) => setAgreementForm((p) => ({ ...p, reference: e.target.value }))} />
            <Textarea label="Notes" value={agreementForm.notes}
              onChange={(e) => setAgreementForm((p) => ({ ...p, notes: e.target.value }))} />

            <p className="text-muted" style={{ fontSize: 12 }}>
              Record the sponsor&rsquo;s money as an ordinary payment against the student, tagging it
              with this sponsor, so it flows through the same receipts and balances as a parent&rsquo;s.
            </p>
          </div>
        </Modal>
      )}
    </div>
  );
}
