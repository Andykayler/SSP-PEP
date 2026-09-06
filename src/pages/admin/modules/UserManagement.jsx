import { useState, useEffect } from "react";
import { auth, db } from "../../../firebase";
import {
  doc, getDoc, collection, getDocs, setDoc, updateDoc, deleteDoc, query, where, serverTimestamp,
} from "firebase/firestore";
import { createUserWithEmailAndPassword, getAuth, signOut as secondarySignOut } from "firebase/auth";
import { initializeApp, deleteApp } from "firebase/app";

import { IC } from "./icons";
import { ROLES, roleMap } from "./constants";
import { generatePassword, normalisePhone, fmtDate, initials } from "./helpers";
import { notifyStaffAdded } from "../../../services/notificationHooks";
import { pushNotification } from "../../../services/notifications";
import { sendSms, sendEmail, EMAILJS_STAFF_TEMPLATE_ID, APP_URL } from "./notifications";
import {
  RoleBadge, StatusPill, Modal, Input, Select, Btn, Spinner, EmptyState, ActionBtn,
} from "./ui";
import BulkImportModal from "../../../components/import/BulkImportModal";
import {
  STAFF_COLUMNS, STAFF_SAMPLE, validateStaffRows, importStaff,
} from "../../../services/bulkImport";
import { downloadCsv } from "../../../services/csv";

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
  const [showDelete, setShowDelete]       = useState(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError]                 = useState("");
  const [successMsg, setSuccessMsg]       = useState("");
  // form includes phone for SMS
  const [form, setForm]       = useState({ name: "", email: "", role: "", phone: "" });
  const [formErrors, setFormErrors] = useState({});
  const [showBulk, setShowBulk]     = useState(false);

  useEffect(() => { fetchUsers(); }, []);

  async function fetchUsers() {
    setLoading(true);
    try {
      const q = query(collection(db, "users"), where("schoolCode", "==", schoolCode));
      const snap = await getDocs(q);
      setUsers(snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(u => u.role !== "admin" && u.role !== "student"));
    } catch (e) { console.error(e); }
    setLoading(false);
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
        status: "active",
        mustChangePassword: true,
        createdAt: serverTimestamp(),
      });

      // ── Email notification ──
      const emailSent = await sendEmail({
        templateId: EMAILJS_STAFF_TEMPLATE_ID,
        toEmail: form.email.trim(),
        toName:  form.name.trim(),
        params: {
          school_name: schoolName,
          user_role:   roleMap[form.role]?.label || form.role,
          login_email: form.email.trim(),
          password:    autoPassword,
          login_url:   `${APP_URL}/login`,
        },
      });

      // ── SMS notification (if phone provided) ──
      let smsSent = false;
      if (phone) {
        const smsResult = await sendSms(
          phone,
          `Welcome to ${schoolName}!\nYour account has been created.\nRole: ${roleMap[form.role]?.label || form.role}\nEmail: ${form.email.trim()}\nPassword: ${autoPassword}\nLogin: ${APP_URL}/login\n\nChange your password after first login.`
        );
        smsSent = smsResult.success;
      }

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
      setForm({ name: "", email: "", role: "", phone: "" });

      const channels = [emailSent && "email", smsSent && "SMS"].filter(Boolean).join(" & ");
      setSuccessMsg(`Account created! Credentials sent via ${channels || "— check manually"}.`);
      fetchUsers();
    } catch (err) {
      setError(err.code === "auth/email-already-in-use"
        ? "This email is already registered."
        : "Failed: " + err.message);
    }
    setActionLoading(false);
  }

  async function handleEdit(e) {
    e.preventDefault();
    setActionLoading(true); setError("");
    try {
      await updateDoc(doc(db, "users", showEdit.id), {
        name:  form.name.trim(),
        role:  form.role,
        phone: normalisePhone(form.phone),
      });
      setShowEdit(null); fetchUsers();
    } catch (err) { setError("Update failed: " + err.message); }
    setActionLoading(false);
  }

  async function toggleStatus(user) {
    try {
      await updateDoc(doc(db, "users", user.id), {
        status: user.status === "active" ? "suspended" : "active",
      });
      fetchUsers();
    } catch (err) { console.error(err); }
  }

  async function handleDelete() {
    setActionLoading(true);
    // Fetch both docs to compare schoolCodes
    const adminDoc = await getDoc(doc(db, "users", auth.currentUser.uid));
    const targetDoc = await getDoc(doc(db, "users", showDelete.id));

    console.log("Admin schoolCode :", adminDoc.data()?.schoolCode);
    console.log("Target schoolCode:", targetDoc.data()?.schoolCode);
    console.log("Match:", adminDoc.data()?.schoolCode === targetDoc.data()?.schoolCode);
    try {
      const res = await fetch("/api/delete-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uid: showDelete.id }),
      });
      const data = await res.json();
      console.log("Delete response:", res.status, data);
      if (!res.ok) throw new Error(data.error || "Auth deletion failed");
      await deleteDoc(doc(db, "users", showDelete.id));
      setShowDelete(null);
      fetchUsers();
    } catch (err) {
      console.error("Delete error:", err);
      setError("Delete failed: " + err.message);
    }
    setActionLoading(false);
  }

  function openEdit(user) {
    setForm({ name: user.name||"", email: user.email||"", role: user.role||"", phone: user.phone||"" });
    setFormErrors({}); setError(""); setShowEdit(user);
  }
  function openAdd() {
    setForm({ name: "", email: "", role: "", phone: "" });
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
                  <th>User</th><th>Role</th><th>Status</th><th>Added</th>
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
                    <td data-label="Status"><StatusPill active={u.status !== "suspended"} /></td>
                    <td style={{ fontSize: 12, color: "var(--text3)" }} data-label="Added">{fmtDate(u.createdAt)}</td>
                    <td data-label="Actions">
                      <div className="data-table__actions" style={{ display: "flex", justifyContent: "flex-end", gap: 2 }}>
                        <ActionBtn onClick={() => openEdit(u)} icon={IC.edit} title="Edit" />
                        <ActionBtn onClick={() => toggleStatus(u)} icon={IC.shield} title={u.status === "suspended" ? "Activate" : "Suspend"} hoverBg="rgba(251,191,36,0.12)" />
                        <ActionBtn onClick={() => setShowDelete(u)} icon={IC.trash} title="Delete" hoverBg="rgba(239,68,68,0.1)" />
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
              <span>A secure auto-generated password will be sent to the user by email and/or SMS upon account creation.</span>
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
            <p style={{ fontSize: 11, color: "var(--text3)" }}>Email and password changes must be done through Firebase Console.</p>
            <div className="data-table__actions" style={{ display: "flex", justifyContent: "flex-end", gap: 8, paddingTop: 8 }}>
              <Btn type="button" variant="ghost" onClick={() => setShowEdit(null)}>Cancel</Btn>
              <Btn type="submit" variant="accent" loading={actionLoading}>Save Changes</Btn>
            </div>
          </form>
        </Modal>
      )}

      {/* ── Delete User Modal ── */}
      {showDelete && (
        <Modal title="Delete User" onClose={() => setShowDelete(null)} size="md">
          <div className="space-y-4">
            <div className="alert alert--error">
              {IC.warning}
              <div>
                <p style={{ fontWeight: 600, fontSize: 13, marginBottom: 3 }}>This cannot be undone.</p>
                <p style={{ fontSize: 12 }}>The Firestore record for <strong>{showDelete.name}</strong> will be permanently deleted. Their Firebase Auth account must be removed separately.</p>
              </div>
            </div>
            <div className="data-table__actions" style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <Btn variant="ghost" onClick={() => setShowDelete(null)}>Cancel</Btn>
              <Btn variant="danger" loading={actionLoading} onClick={handleDelete}>Delete User</Btn>
            </div>
          </div>
        </Modal>
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
              sendSms, sendEmail,
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