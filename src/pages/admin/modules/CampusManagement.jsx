// src/pages/admin/modules/CampusManagement.jsx
// ─────────────────────────────────────────────────────────────────────────────
// Where a school's sites are created and named.
//
// This is the screen the rest of the campus feature depends on: a campus that
// does not exist here cannot be assigned to a member of staff, cannot hold a
// student, and does not appear on the director's comparison. So it is also the
// screen that has to be honest about consequences — creating a campus is
// cheap, but moving people onto it is not, and archiving one strands nobody
// only because archiving deliberately does not delete.
//
// Deletion is not offered at all. Attendance, marks, fee assignments and
// payments all carry a campusId; removing the document those point at turns
// years of records into rows labelled "Unknown campus" with no way back.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useState } from "react";
import { Building2, Star, Archive, Pencil, Plus, RotateCcw } from "lucide-react";
import {
  subscribeCampuses, createCampus, updateCampus, setPrimaryCampus,
  archiveCampus, restoreCampus, setCampusMode, isMultiCampus,
} from "../../../services/campuses";
import { subscribeSchoolSettings } from "../../../services/academicTerm";
import {
  ModuleHeader, Modal, Btn, Input, Select, Notice, EmptyState, TableWrap,
  LoadingState, Pill, IconBtn,
} from "../../../components/ui/ModuleKit";
import { DISTRICTS } from "./constants";
import "../../burser/modules/staff-management.css";

const EMPTY = { name: "", district: "", address: "", phone: "" };

export default function CampusManagement({ schoolCode, schoolName, actorId }) {
  const [campuses, setCampuses] = useState(null);
  const [settings, setSettings] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => subscribeCampuses(schoolCode, setCampuses), [schoolCode]);
  useEffect(() => subscribeSchoolSettings(schoolCode, setSettings), [schoolCode]);

  const active = (campuses || []).filter((c) => c.status !== "archived");
  const archived = (campuses || []).filter((c) => c.status === "archived");
  const multi = isMultiCampus(settings, campuses || []);

  async function save() {
    setBusy(true); setError("");
    const res = editing
      ? await updateCampus(editing.id, {
          name: form.name.trim(), district: form.district,
          address: form.address.trim(), phone: form.phone.trim(),
        })
      : await createCampus({ schoolCode, ...form, actorId });
    setBusy(false);

    if (!res.ok) { setError(res.error); return; }

    // The first campus makes the school single-site; the second is what turns
    // campus scoping on across the product, so the flag is set here rather
    // than asked for again.
    if (!editing && active.length >= 1) {
      await setCampusMode({ schoolCode, multiCampus: true, actorId });
    }

    setNotice(editing
      ? `${form.name} updated.`
      : `${form.name} added${res.code ? ` as ${res.code}` : ""}. Assign staff to it from User Management.`);
    setShowAdd(false); setEditing(null); setForm(EMPTY);
  }

  async function makePrimary(campus) {
    setBusy(true);
    const res = await setPrimaryCampus({ schoolCode, campusId: campus.id });
    setBusy(false);
    if (!res.ok) { setError(res.error); return; }
    setNotice(`${campus.name} is now the main campus. Records with no campus recorded count against it.`);
  }

  async function toggleArchive(campus) {
    if (campus.status === "archived") {
      await restoreCampus(campus.id);
      setNotice(`${campus.name} is active again.`);
      return;
    }
    if (campus.isPrimary) {
      setError("Make another campus the main one before archiving this one.");
      return;
    }
    await archiveCampus(campus.id);
    setNotice(`${campus.name} archived. Its records are untouched and still readable.`);
  }

  function openAdd() { setForm(EMPTY); setEditing(null); setError(""); setShowAdd(true); }
  function openEdit(c) {
    setForm({ name: c.name || "", district: c.district || "", address: c.address || "", phone: c.phone || "" });
    setEditing(c); setError(""); setShowAdd(true);
  }

  if (campuses === null) return <LoadingState label="Loading campuses…" />;

  return (
    <div className="space-y-5">
      <ModuleHeader
        title="Campuses"
        subtitle={
          active.length === 0
            ? "No sites recorded yet"
            : multi
              ? `${active.length} sites under ${schoolName}`
              : `One site — ${schoolName}`
        }
        actions={<Btn variant="accent" size="sm" icon={<Plus size={15} />} onClick={openAdd}>Add campus</Btn>}
      />

      {error && <Notice tone="danger" onDismiss={() => setError("")}>{error}</Notice>}
      {notice && <Notice tone="success" onDismiss={() => setNotice("")}>{notice}</Notice>}

      {active.length === 0 ? (
        <EmptyState
          icon={<Building2 size={28} />}
          title="No campuses yet"
          sub="Add the site the school runs from. Every student, class and register belongs to one, and a single-campus school never has to think about it again."
          action={<Btn variant="accent" onClick={openAdd}>Add the first campus</Btn>}
        />
      ) : (
        <>
          <Notice tone="info">
            {multi
              ? "Staff see only the campuses they are attached to, set in User Management. A student belongs to one campus and can only move to another with an approved transfer."
              : "One campus, so nobody is shown a campus picker anywhere. Add a second site and campus scoping switches on across the product."}
          </Notice>

          <TableWrap>
            <table className="data-table data-table--stack">
              <thead>
                <tr>
                  <th>Campus</th><th>Code</th><th>District</th><th>Contact</th>
                  <th style={{ textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {[...active, ...archived].map((c) => (
                  <tr key={c.id} style={c.status === "archived" ? { opacity: 0.55 } : undefined}>
                    <td data-label="Campus">
                      <div className="data-table__primary" style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                        {c.name}
                        {c.isPrimary && <Pill tone="success">Main</Pill>}
                        {c.status === "archived" && <Pill tone="neutral">Archived</Pill>}
                      </div>
                      {c.address && <div className="data-table__meta">{c.address}</div>}
                    </td>
                    <td data-label="Code" style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}>{c.code}</td>
                    <td data-label="District">{c.district || "—"}</td>
                    <td data-label="Contact">{c.phone || "—"}</td>
                    <td data-label="Actions">
                      <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
                        {!c.isPrimary && c.status !== "archived" && (
                          <IconBtn icon={<Star size={15} />} title="Make main campus"
                                   disabled={busy} onClick={() => makePrimary(c)} />
                        )}
                        <IconBtn icon={<Pencil size={15} />} title="Edit" onClick={() => openEdit(c)} />
                        <IconBtn
                          icon={c.status === "archived" ? <RotateCcw size={15} /> : <Archive size={15} />}
                          title={c.status === "archived" ? "Restore" : "Archive"}
                          danger={c.status !== "archived"}
                          onClick={() => toggleArchive(c)}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        </>
      )}

      {showAdd && (
        <Modal
          title={editing ? `Edit ${editing.name}` : "Add a campus"}
          subtitle={editing ? "" : "A site the school teaches from, under the same school code."}
          onClose={() => { setShowAdd(false); setEditing(null); }}
        >
          <div className="space-y-4">
            {error && <Notice tone="danger">{error}</Notice>}
            <Input
              label="Campus name" required
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Blantyre Campus"
              hint="What staff and parents call it. The short code is generated for you."
            />
            <Select
              label="District"
              value={form.district}
              onChange={(e) => setForm((f) => ({ ...f, district: e.target.value }))}
            >
              <option value="">Select district…</option>
              {DISTRICTS.map((d) => <option key={d} value={d}>{d}</option>)}
            </Select>
            <Input
              label="Address"
              value={form.address}
              onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
              placeholder="P.O. Box 123, Limbe"
            />
            <Input
              label="Phone"
              value={form.phone}
              onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
              placeholder="+265 1 234 567"
            />

            {!editing && active.length >= 1 && (
              <Notice tone="warning">
                Adding a second campus turns on campus scoping for the whole school. Existing
                students and staff stay on {active.find((c) => c.isPrimary)?.name || "the main campus"}
                {" "}until you move them, and moving a student needs an approved transfer.
              </Notice>
            )}

            <div className="flex justify-end" style={{ gap: 8 }}>
              <Btn variant="ghost" onClick={() => { setShowAdd(false); setEditing(null); }}>Cancel</Btn>
              <Btn variant="accent" loading={busy} disabled={!form.name.trim()} onClick={save}>
                {editing ? "Save changes" : "Add campus"}
              </Btn>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
