import { useState, useEffect } from "react";
import { auth, db } from "../../../firebase";
import {
  doc, collection, getDocs, setDoc, updateDoc, query, where, serverTimestamp,
} from "firebase/firestore";
import { createUserWithEmailAndPassword, getAuth, signOut as secondarySignOut } from "firebase/auth";
import { initializeApp, deleteApp } from "firebase/app";

import { IC } from "./icons";
import { ROLES, roleMap } from "./constants";
import { generatePassword, normalisePhone, fmtDate, initials } from "./helpers";
import { notifyStaffAdded } from "../../../services/notificationHooks";
import { pushNotification } from "../../../services/notifications";
import { sendSms, sendEmail, EMAILJS_STAFF_TEMPLATE_ID, APP_URL, messageChannel, channelLabel } from "./notifications";
import {
  RoleBadge, StatusPill, Modal, Input, Select, Btn, Spinner, EmptyState, ActionBtn,
} from "./ui";
import BulkImportModal from "../../../components/import/BulkImportModal";
import {
  STAFF_COLUMNS, STAFF_SAMPLE, validateStaffRows, importStaff,
} from "../../../services/bulkImport";
import { downloadCsv } from "../../../services/csv";
import { subscribeCampuses, describeScope, isMultiCampus } from "../../../services/campuses";
import { subscribeSchoolSettings } from "../../../services/academicTerm";
import { apiPost } from "../../../services/api";
import { isDeactivated } from "../../../services/staffAccountCore";

// Roles that are school-wide by their nature. A director oversees every
// campus — that is what the job is — so offering to restrict one to a single
// site would be offering to break it. Everyone else is scoped, and the default
// is the narrowest thing that still lets them work.
const SCHOOL_WIDE_ROLES = ["director"];

// ─── Campus scope picker ─────────────────────────────────────────────────────
// Two questions, not one: "all campuses" and "these campuses" are different
// claims. Someone marked all-campuses keeps sight of a campus opened next
// year; someone listed against three campus ids should not silently gain a
// fourth. Collapsing them into a multi-select with everything ticked loses
// that distinction the first time a school expands.
function CampusScope({ campuses, allCampuses, campusIds, onChange, role }) {
  const forced = SCHOOL_WIDE_ROLES.includes(role);
  const active = campuses.filter((c) => c.status !== "archived");

  if (active.length <= 1) return null;

  return (
    <div className="field">
      <label className="field__label">Campus access</label>
      <p style={{ fontSize: 11.5, color: "var(--text3)", marginBottom: 8 }}>
        {forced
          ? "A director sees every campus. That is the role."
          : "They see students, classes and registers only for the campuses ticked here."}
      </p>

      <label className="checkbox-label" style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <input
          type="checkbox"
          checked={forced || allCampuses}
          disabled={forced}
          onChange={(e) => onChange({ allCampuses: e.target.checked, campusIds: [] })}
        />
        <span>All campuses, including any added later</span>
      </label>

      {!forced && !allCampuses && (
        <div className="space-y-2" style={{ marginTop: 8 }}>
          {active.map((c) => {
            const on = campusIds.includes(c.id);
            return (
              <label
                key={c.id}
                className={`checkbox-label${on ? " checkbox-label--selected" : ""}`}
                style={{ display: "flex", gap: 8, alignItems: "center" }}
              >
                <input
                  type="checkbox"
                  checked={on}
                  onChange={() =>
                    onChange({
                      allCampuses: false,
                      campusIds: on ? campusIds.filter((id) => id !== c.id) : [...campusIds, c.id],
                    })
                  }
                />
                <span>{c.name}{c.isPrimary ? " (main)" : ""}</span>
              </label>
            );
          })}
          {campusIds.length === 0 && (
            <p style={{ fontSize: 11.5, color: "var(--text3)" }}>
              Nobody assigned a campus falls back to the main one, so they can still work —
              but pick deliberately if this school runs more than one site.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Create a user WITHOUT hijacking the admin's current session ─────────────
// createUserWithEmailAndPassword on the primary `auth` instance signs the app
// into the newly created user, kicking the admin out of their own session.
// Spinning up a short-lived secondary app instance avoids that entirely.
async function createStaffUserWithoutSignIn(email, password) {
  const secondaryApp = initializeApp(auth.app.options, `Secondary-${Date.now()}`);
  const secondaryAuth = getAuth(secondaryApp);
  try {
    const cred = await createUserWithEmailAndPassword(secondaryAuth, email, password);
    return cred.user;
  } finally {
    await secondarySignOut(secondaryAuth).catch(() => {});
    await deleteApp(secondaryApp).catch(() => {});
  }
}

// ─── MODULE 1: User Management ────────────────────────────────────────────────
export default function UserManagement({ schoolCode, schoolName }) {
  const [users, setUsers]                 = useState([]);
  const [loading, setLoading]             = useState(true);
  const [search, setSearch]               = useState("");
  const [roleFilter, setRoleFilter]       = useState("all");
  const [showAdd, setShowAdd]             = useState(false);
  const [showEdit, setShowEdit]           = useState(null);
  // The account being deactivated, while the confirmation is open.
  const [confirmDeactivate, setConfirmDeactivate] = useState(null);
  // People who left this school for another one (former_staff). They can be
  // taken back, which restores the profile they had here.
  const [formerStaff, setFormerStaff]     = useState([]);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError]                 = useState("");
  const [successMsg, setSuccessMsg]       = useState("");
  // form includes phone for SMS, and the campus scope this account works under
  const [form, setForm]       = useState({ name: "", email: "", role: "", phone: "", allCampuses: false, campusIds: [] });
  const [formErrors, setFormErrors] = useState({});
  const [showBulk, setShowBulk]     = useState(false);
  const [campuses, setCampuses]     = useState([]);
  const [settings, setSettings]     = useState(null);

  useEffect(() => { fetchUsers(); }, []);
  useEffect(() => subscribeCampuses(schoolCode, setCampuses), [schoolCode]);
  useEffect(() => subscribeSchoolSettings(schoolCode, setSettings), [schoolCode]);

  const multiCampus = isMultiCampus(settings, campuses);

  async function fetchUsers() {
    setLoading(true);
    try {
      const q = query(collection(db, "users"), where("schoolCode", "==", schoolCode));
      const snap = await getDocs(q);
      setUsers(snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(u => u.role !== "admin" && u.role !== "student"));
    } catch (e) { console.error(e); }
    try {
      const former = await getDocs(query(collection(db, "former_staff"), where("schoolCode", "==", schoolCode)));
      setFormerStaff(former.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) { console.error("former staff:", e); }
    setLoading(false);
  }

  // Email + SMS with the sign-in details. Shared by a brand-new account and a
  // person taken on from another school (who gets a fresh password too).
  async function sendCredentials({ name, email, role, phone, password }) {
    const emailSent = await sendEmail({
      templateId: EMAILJS_STAFF_TEMPLATE_ID,
      toEmail: email,
      toName:  name,
      params: {
        school_name: schoolName,
        user_role:   roleMap[role]?.label || role,
        login_email: email,
        password,
        login_url:   `${APP_URL}/signin`,
      },
    });
    // SMS if the school has switched SMS on, otherwise WhatsApp.
    const channel = messageChannel(settings);
    let phoneSent = false;
    if (phone) {
      const result = await sendSms(
        phone,
        `Welcome to ${schoolName}!\nYour account has been created.\nRole: ${roleMap[role]?.label || role}\nEmail: ${email}\nPassword: ${password}\nLogin: ${APP_URL}/signin\n\nChange your password after first login.`,
        { channel },
      );
      phoneSent = result.success;
    }
    return [emailSent && "email", phoneSent && channelLabel(channel)].filter(Boolean).join(" & ");
  }

  // The email already has a login: someone who worked at a school on Acalink
  // before. The server decides whether they can join (they must have been
  // deactivated wherever they were) and starts them here as new staff.
  async function hireExisting(phone) {
    const res = await apiPost("/api/staff/account", {
      action: "hire",
      email: form.email.trim(),
      name: form.name.trim(),
      role: form.role,
      phone,
      allCampuses: form.allCampuses,
      campusIds: form.campusIds,
    });
    const channels = await sendCredentials({
      name: form.name.trim(), email: form.email.trim(), role: form.role, phone, password: res.password,
    });
    setShowAdd(false);
    setForm({ name: "", email: "", role: "", phone: "", allCampuses: false, campusIds: [] });
    setSuccessMsg(res.returning
      ? `Welcome back — ${form.name.trim()}'s previous record at this school has been restored. New sign-in details sent via ${channels || "— check manually"}.`
      : `${form.name.trim()} has joined as new staff. Nothing from their previous school carries over. Sign-in details sent via ${channels || "— check manually"}.`);
    fetchUsers();
  }

  function validateForm(f) {
    const e = {};
    if (!f.name.trim() || f.name.trim().length < 2) e.name = "Full name required.";
    if (!f.email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email)) e.email = "Valid email required.";
    if (!f.role) e.role = "Select a role.";
    return e;
  }

  async function handleAdd(e) {
    e.preventDefault();
    const errs = validateForm(form);
    if (Object.keys(errs).length) { setFormErrors(errs); return; }
    setActionLoading(true); setError(""); setSuccessMsg("");

    const autoPassword = generatePassword();
    const phone        = normalisePhone(form.phone);

    try {
      const newUser = await createStaffUserWithoutSignIn(form.email.trim(), autoPassword);
      await setDoc(doc(db, "users", newUser.uid), {
        uid: newUser.uid,
        name: form.name.trim(),
        email: form.email.trim(),
        role: form.role,
        phone,
        schoolCode,
        // A director is school-wide whatever the form said; everyone else gets
        // exactly the campuses they were given. Both fields are always written
        // so a later read never has to distinguish "false" from "never set".
        allCampuses: SCHOOL_WIDE_ROLES.includes(form.role) || form.allCampuses,
        campusIds: SCHOOL_WIDE_ROLES.includes(form.role) || form.allCampuses ? [] : form.campusIds,
        status: "active",
        mustChangePassword: true,
        createdAt: serverTimestamp(),
      });

      const channels = await sendCredentials({
        name: form.name.trim(), email: form.email.trim(), role: form.role, phone, password: autoPassword,
      });

      // In-app notices: leadership sees the new colleague, and the colleague
      // has something waiting the first time they sign in.
      const roleLabel = roleMap[form.role]?.label || form.role;
      await notifyStaffAdded({
        schoolCode,
        staffName: form.name.trim(),
        role: roleLabel,
        actor: { name: "Administrator", role: "admin" },
      });
      await pushNotification({
        schoolCode,
        recipientId: newUser.uid,
        recipientName: form.name.trim(),
        title: `Welcome to ${schoolName}`,
        body: `Your ${roleLabel} account is ready. Change your password from your profile after signing in.`,
        category: "system",
        actorName: "Administrator",
        tab: "overview",
      });

      setShowAdd(false);
      setForm({ name: "", email: "", role: "", phone: "", allCampuses: false, campusIds: [] });
      setSuccessMsg(`Account created! Credentials sent via ${channels || "— check manually"}.`);
      fetchUsers();
    } catch (err) {
      if (err.code === "auth/email-already-in-use") {
        try {
          await hireExisting(phone);
        } catch (hireErr) {
          setError(hireErr.message);
        }
      } else {
        setError("Failed: " + err.message);
      }
    }
    setActionLoading(false);
  }

  async function handleEdit(e) {
    e.preventDefault();
    setActionLoading(true); setError("");
    try {
      const wide = SCHOOL_WIDE_ROLES.includes(form.role) || form.allCampuses;
      await updateDoc(doc(db, "users", showEdit.id), {
        name:  form.name.trim(),
        role:  form.role,
        phone: normalisePhone(form.phone),
        allCampuses: wide,
        campusIds: wide ? [] : form.campusIds,
      });
      setShowEdit(null); fetchUsers();
    } catch (err) { setError("Update failed: " + err.message); }
    setActionLoading(false);
  }

  // Accounts are never deleted. Deactivating keeps the profile and every
  // record the person made, disables their login, and signs them out.
  async function setActive(user, active) {
    setActionLoading(true); setError(""); setSuccessMsg("");
    try {
      await apiPost("/api/staff/account", { action: active ? "reactivate" : "deactivate", uid: user.id });
      setConfirmDeactivate(null);
      setSuccessMsg(active
        ? `${user.name} is active again. Their records at this school carry on as before.`
        : `${user.name} has been deactivated and signed out. Their records stay with the school.`);
      fetchUsers();
    } catch (err) {
      setError(err.message);
    }
    setActionLoading(false);
  }

  // Taking back someone who left for another school: the Add form, prefilled.
  // The server finds their old record here and restores it.
  function openRehire(person) {
    setForm({
      name: person.name || "", email: person.email || "", role: person.role || "", phone: person.phone || "",
      allCampuses: Boolean(person.profile?.allCampuses), campusIds: person.profile?.campusIds || [],
    });
    setFormErrors({}); setError(""); setShowAdd(true);
  }

  function openEdit(user) {
    setForm({
      name: user.name||"", email: user.email||"", role: user.role||"", phone: user.phone||"",
      allCampuses: Boolean(user.allCampuses), campusIds: user.campusIds || [],
    });
    setFormErrors({}); setError(""); setShowEdit(user);
  }
  function openAdd() {
    setForm({ name: "", email: "", role: "", phone: "", allCampuses: false, campusIds: [] });
    setFormErrors({}); setError(""); setShowAdd(true);
  }

  const filtered = users.filter(u => {
    const ms = !search || u.name?.toLowerCase().includes(search.toLowerCase()) || u.email?.toLowerCase().includes(search.toLowerCase());
    const mr = roleFilter === "all" || u.role === roleFilter;
    return ms && mr;
  });

  const roleCounts = ROLES.map(r => ({ ...r, count: users.filter(u => u.role === r.value).length }));

  return (
    <div className="space-y-6">
      <div className="flex-between" style={{ flexWrap: "wrap", gap: 12 }}>
        <div>
          <h2 className="module-title">User Management</h2>
          <p className="module-sub">{users.length} staff accounts — {schoolName}</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Btn onClick={() => setShowBulk(true)} variant="primary" size="sm">
            {IC.plus} Import from CSV
          </Btn>
          <Btn onClick={openAdd} variant="gold" size="sm">{IC.plus} Add User</Btn>
        </div>
      </div>

      {successMsg && (
        <div className="alert alert--success">{IC.mail}<span>{successMsg}</span></div>
      )}
      {error && !showAdd && !showEdit && !confirmDeactivate && (
        <div className="alert alert--error">{IC.warning}<span>{error}</span></div>
      )}

      <div className="filter-pills">
        <button onClick={() => setRoleFilter("all")} className={`filter-pill ${roleFilter === "all" ? "filter-pill--active" : "filter-pill--inactive"}`}>
          All ({users.length})
        </button>
        {roleCounts.map(r => (
          <button key={r.value} onClick={() => setRoleFilter(r.value)} className={`filter-pill ${roleFilter === r.value ? "filter-pill--active" : "filter-pill--inactive"}`}>
            {r.label} ({r.count})
          </button>
        ))}
      </div>

      <div className="search-wrap">
        <span className="search-wrap__icon">{IC.search}</span>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name or email…" className="search-wrap__input" />
      </div>

      <div className="card">
        {loading ? (
          <div style={{ padding: "48px", display: "flex", justifyContent: "center" }}><Spinner /></div>
        ) : filtered.length === 0 ? (
          <EmptyState icon={IC.users} title="No users found"
            sub={search ? "Try a different search" : "Add your first staff member"}
            action={<Btn onClick={openAdd} variant="gold" size="sm">{IC.plus} Add User</Btn>}
          />
        ) : (
          <div className="data-table-wrap">
            <table className="data-table data-table--stack">
              <thead>
                <tr>
                  <th>User</th><th>Role</th>
                  {multiCampus && <th>Campus</th>}
                  <th>Status</th><th>Added</th>
                  <th style={{ textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(u => (
                  <tr key={u.id}>
                    <td data-label="User">
                      <div className="flex-gap-3">
                        <div className="avatar avatar--navy">{initials(u.name)}</div>
                        <div>
                          <div className="data-table__primary">{u.name}</div>
                          <div className="data-table__meta">{u.email}</div>
                          {u.phone && <div className="data-table__meta" style={{ display: "flex", gap: 4, alignItems: "center" }}>{IC.phone} {u.phone}</div>}
                        </div>
                      </div>
                    </td>
                    <td data-label="Role"><RoleBadge role={u.role} /></td>
                    {multiCampus && (
                      <td data-label="Campus" style={{ fontSize: 12.5 }}>
                        {describeScope(u, campuses)}
                      </td>
                    )}
                    <td data-label="Status">
                      <StatusPill active={!isDeactivated(u)} label={isDeactivated(u) ? "Deactivated" : "Active"} />
                    </td>
                    <td style={{ fontSize: 12, color: "var(--text3)" }} data-label="Added">{fmtDate(u.createdAt)}</td>
                    <td data-label="Actions">
                      <div className="data-table__actions" style={{ display: "flex", justifyContent: "flex-end", gap: 2 }}>
                        <ActionBtn onClick={() => openEdit(u)} icon={IC.edit} title="Edit" />
                        {isDeactivated(u) ? (
                          <ActionBtn onClick={() => setActive(u, true)} icon={IC.shield} title="Reactivate" hoverBg="rgba(34,197,94,0.12)" />
                        ) : (
                          <ActionBtn onClick={() => { setError(""); setConfirmDeactivate(u); }} icon={IC.shield} title="Deactivate" hoverBg="rgba(251,191,36,0.12)" />
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Add User Modal ── */}
      {showAdd && (
        <Modal title="Add New Staff User" onClose={() => setShowAdd(false)} size="lg">
          <form onSubmit={handleAdd} className="space-y-4">
            {error && <div className="alert alert--error">{IC.warning}<span>{error}</span></div>}
            <div className="alert alert--info">
              {IC.mail}
              <span>A secure auto-generated password will be sent to the user by email and/or SMS. If they already have an Acalink account from another school, it must be deactivated there first; they join you as new staff and nothing from that school carries over.</span>
            </div>
            <div className="grid-2">
              <Input label="Full Name" required value={form.name} onChange={e => setForm(p => ({...p, name: e.target.value}))} placeholder="Jane Mwale" error={formErrors.name} />
              <Select label="Role" required value={form.role} onChange={e => setForm(p => ({...p, role: e.target.value}))} error={formErrors.role}>
                <option value="">Select role…</option>
                {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
              </Select>
            </div>
            <Input label="Email Address" required type="email" value={form.email} onChange={e => setForm(p => ({...p, email: e.target.value}))} placeholder="jane@school.mw" error={formErrors.email} />
            {/* Phone is now clearly labelled for SMS */}
            <div>
              <Input
                label="Phone Number (for SMS notification)"
                type="tel"
                value={form.phone}
                onChange={e => setForm(p => ({...p, phone: e.target.value}))}
                placeholder="+265 9xx xxx xxx or 09xxxxxxxx"
              />
              <p style={{ fontSize: 11, color: "var(--text3)", marginTop: 4, display: "flex", gap: 5, alignItems: "center" }}>
                {IC.sms} If provided, login credentials will also be sent via SMS.
              </p>
            </div>
            <CampusScope
              campuses={campuses}
              role={form.role}
              allCampuses={form.allCampuses}
              campusIds={form.campusIds}
              onChange={(patch) => setForm(p => ({ ...p, ...patch }))}
            />
            <div className="data-table__actions" style={{ display: "flex", justifyContent: "flex-end", gap: 8, paddingTop: 8 }}>
              <Btn type="button" variant="ghost" onClick={() => setShowAdd(false)}>Cancel</Btn>
              <Btn type="submit" variant="gold" loading={actionLoading}>{IC.mail} Create &amp; Notify</Btn>
            </div>
          </form>
        </Modal>
      )}

      {/* ── Edit User Modal ── */}
      {showEdit && (
        <Modal title="Edit User" onClose={() => setShowEdit(null)} size="md">
          <form onSubmit={handleEdit} className="space-y-4">
            {error && <div className="alert alert--error">{IC.warning}<span>{error}</span></div>}
            <Input label="Full Name" required value={form.name} onChange={e => setForm(p => ({...p, name: e.target.value}))} />
            <Select label="Role" required value={form.role} onChange={e => setForm(p => ({...p, role: e.target.value}))}>
              <option value="">Select role…</option>
              {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
            </Select>
            <div>
              <Input label="Phone Number" type="tel" value={form.phone} onChange={e => setForm(p => ({...p, phone: e.target.value}))} placeholder="+265 9xx xxx xxx" />
              <p style={{ fontSize: 11, color: "var(--text3)", marginTop: 4, display: "flex", gap: 5, alignItems: "center" }}>{IC.sms} Used for future SMS notifications.</p>
            </div>
            <CampusScope
              campuses={campuses}
              role={form.role}
              allCampuses={form.allCampuses}
              campusIds={form.campusIds}
              onChange={(patch) => setForm(p => ({ ...p, ...patch }))}
            />
            <p style={{ fontSize: 11, color: "var(--text3)" }}>Email and password changes must be done through Firebase Console.</p>
            <div className="data-table__actions" style={{ display: "flex", justifyContent: "flex-end", gap: 8, paddingTop: 8 }}>
              <Btn type="button" variant="ghost" onClick={() => setShowEdit(null)}>Cancel</Btn>
              <Btn type="submit" variant="accent" loading={actionLoading}>Save Changes</Btn>
            </div>
          </form>
        </Modal>
      )}

      {/* ── Deactivate confirmation ── */}
      {confirmDeactivate && (
        <Modal title="Deactivate account" onClose={() => setConfirmDeactivate(null)} size="md">
          <div className="space-y-4">
            {error && <div className="alert alert--error">{IC.warning}<span>{error}</span></div>}
            <div className="alert alert--warning">
              {IC.warning}
              <div>
                <p style={{ fontWeight: 600, fontSize: 13, marginBottom: 3 }}>
                  {confirmDeactivate.name} will be signed out and won&apos;t be able to sign in.
                </p>
                <p style={{ fontSize: 12 }}>
                  Their registers, marks, lesson plans and messages stay with {schoolName}. You can reactivate them at
                  any time and everything carries on. Once deactivated, another school can take them on as new staff —
                  none of this school&apos;s records go with them.
                </p>
              </div>
            </div>
            <div className="data-table__actions" style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <Btn variant="ghost" onClick={() => setConfirmDeactivate(null)}>Cancel</Btn>
              <Btn variant="danger" loading={actionLoading} onClick={() => setActive(confirmDeactivate, false)}>Deactivate</Btn>
            </div>
          </div>
        </Modal>
      )}

      {/* ── Former staff: moved to another school ── */}
      {formerStaff.length > 0 && (
        <div className="card">
          <div className="cc__head">
            <div className="cc__head-left"><h3>Former staff</h3></div>
          </div>
          <p className="module-sub" style={{ padding: "12px 20px 0" }}>
            People who left for another school. Taking them back restores the record they had here.
          </p>
          <div className="data-table-wrap">
            <table className="data-table data-table--stack">
              <thead>
                <tr><th>Name</th><th>Role here</th><th>Left</th><th style={{ textAlign: "right" }}>Actions</th></tr>
              </thead>
              <tbody>
                {formerStaff.map((f) => (
                  <tr key={f.id}>
                    <td data-label="Name">
                      <div className="data-table__primary">{f.name}</div>
                      <div className="data-table__meta">{f.email}</div>
                    </td>
                    <td data-label="Role here"><RoleBadge role={f.role} /></td>
                    <td data-label="Left" style={{ fontSize: 12, color: "var(--text3)" }}>{fmtDate(f.leftAt)}</td>
                    <td data-label="Actions" style={{ textAlign: "right" }}>
                      <Btn size="sm" variant="primary" onClick={() => openRehire(f)}>Take back</Btn>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Bulk import ── */}
      {showBulk && (
        <BulkImportModal
          title="Import staff from a spreadsheet"
          noun="staff member"
          columns={STAFF_COLUMNS}
          sample={STAFF_SAMPLE}
          templateName="acalink-staff-template.csv"
          previewColumns={[
            { label: "Name",  get: (r) => r.data.name },
            { label: "Email", get: (r) => r.data.email },
            { label: "Role",  get: (r) => roleMap[r.data.role]?.label || r.data.role },
            { label: "Phone", get: (r) => r.data.phone },
          ]}
          onValidate={(rows) => validateStaffRows({ rows, existingUsers: users })}
          onImport={(validated, onProgress) =>
            importStaff({
              rows: validated,
              schoolCode, schoolName,
              sendSms: (to, message) => sendSms(to, message, { channel: messageChannel(settings) }),
              sendEmail,
              emailTemplateId: EMAILJS_STAFF_TEMPLATE_ID,
              appUrl: APP_URL,
              onProgress,
            })
          }
          renderResult={(res) => (
            <div className="space-y-3">
              <div className="alert alert--success">
                {IC.check}
                <span>
                  {res.created} account{res.created === 1 ? "" : "s"} created. Each person
                  must change their password on first sign-in.
                </span>
              </div>
              {res.failed.length > 0 && (
                <div className="alert alert--error">
                  {IC.warning}
                  <div>
                    <p style={{ fontWeight: 600, fontSize: 13, marginBottom: 3 }}>
                      {res.failed.length} account{res.failed.length === 1 ? "" : "s"} could not be created
                    </p>
                    {res.failed.map((f) => (
                      <p key={f.line} style={{ fontSize: 12 }}>
                        Line {f.line} ({f.email}): {f.error}
                      </p>
                    ))}
                  </div>
                </div>
              )}
              {res.credentials.length > 0 && (
                <>
                  <div className="alert alert--warning">
                    {IC.warning}
                    <span>
                      Passwords are shown once and cannot be retrieved afterwards. Download
                      the list if anyone's email or SMS does not arrive.
                    </span>
                  </div>
                  <Btn
                    variant="ghost"
                    onClick={() =>
                      downloadCsv(
                        "acalink-staff-credentials.csv",
                        ["Name", "Email", "Role", "Phone", "Password"],
                        res.credentials.map((c) => [c.name, c.email, c.role, c.phone, c.password])
                      )
                    }
                  >
                    Download credentials
                  </Btn>
                </>
              )}
            </div>
          )}
          onClose={() => setShowBulk(false)}
          onDone={() => fetchUsers()}
        />
      )}
    </div>
  );
}