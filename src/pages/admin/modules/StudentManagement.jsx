import { useState, useEffect } from "react";
import { db, auth } from "../../../firebase";
import {
  doc, collection, getDocs, deleteDoc, query, where, serverTimestamp, addDoc, limit,
} from "firebase/firestore";

import { IC } from "./icons";
import { GENDERS, DISTRICTS } from "./constants";
import { generatePassword, generateStudentCode, normalisePhone, initials, fmtDate } from "./helpers";
import { sendSms, sendEmail, EMAILJS_GUARDIAN_TEMPLATE_ID, APP_URL } from "./notifications";
import {
  StatusPill, Modal, Input, Select, Btn, Spinner, EmptyState, ActionBtn, StudentCodeBadge, NotifStatus,
} from "./ui";

// Base URL of the Express backend (server.js). Update this when you deploy
// (e.g. to your production API domain) — it's used for the transfer
// approve/reject endpoints, which run with the Admin SDK server-side.
const API_URL = "http://localhost:3001";

// ─── MODULE 2: Student Management ─────────────────────────────────────────────
export default function StudentManagement({ schoolCode, schoolName }) {
  const [activeTab, setActiveTab]             = useState("list");
  const [students, setStudents]               = useState([]);
  const [classes, setClasses]                 = useState([]);
  const [loading, setLoading]                 = useState(true);
  const [search, setSearch]                   = useState("");
  const [classFilter, setClassFilter]         = useState("all");
  const [showDetail, setShowDetail]           = useState(null);
  const [showDelete, setShowDelete]           = useState(null);
  const [actionLoading, setActionLoading]     = useState(false);
  const [error, setError]                     = useState("");

  const EMPTY_REG = {
    firstName: "", lastName: "", dob: "", gender: "",
    nationalId: "", guardianName: "", guardianPhone: "",
    guardianEmail: "", guardianRelation: "",
    district: "", village: "", classId: "",
  };
  const [regForm, setRegForm]                         = useState(EMPTY_REG);
  const [regErrors, setRegErrors]                     = useState({});
  const [newStudentResult, setNewStudentResult]       = useState(null);

  // ── Transfer OUT lookup/request state ──
  const [transferCode, setTransferCode]         = useState("");
  const [transferFound, setTransferFound]       = useState(null);
  const [transferLoading, setTransferLoading]   = useState(false);
  const [transferError, setTransferError]       = useState("");
  const [transferSuccess, setTransferSuccess]   = useState("");
  const [transferClassId, setTransferClassId]   = useState("");

  // ── Transfer Requests tab state ──
  const [incomingRequests, setIncomingRequests] = useState([]); // students currently at MY school being requested by another
  const [outgoingRequests, setOutgoingRequests] = useState([]); // requests MY school has sent to pull students in
  const [requestsLoading, setRequestsLoading]   = useState(true);
  const [rejectTarget, setRejectTarget]         = useState(null); // request being rejected (opens reason modal)
  const [rejectReason, setRejectReason]         = useState("");
  const [requestActionId, setRequestActionId]   = useState(null); // id of request currently being approved/rejected
  const [requestsError, setRequestsError]       = useState("");

  useEffect(() => { fetchStudents(); fetchClasses(); fetchTransferRequests(); }, []);

  async function fetchStudents() {
    setLoading(true);
    try {
      const q = query(collection(db, "students"), where("schoolCode", "==", schoolCode));
      const snap = await getDocs(q);
      setStudents(snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (a.lastName||"").localeCompare(b.lastName||"")));
    } catch (e) { console.error(e); }
    setLoading(false);
  }

  async function fetchClasses() {
    try {
      const q = query(collection(db, "school_classes"), where("schoolCode", "==", schoolCode));
      const snap = await getDocs(q);
      setClasses(snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => a.order - b.order));
    } catch (e) { setClasses([]); }
  }

  async function fetchTransferRequests() {
    setRequestsLoading(true);
    try {
      const inQ = query(
        collection(db, "transfer_requests"),
        where("fromSchoolCode", "==", schoolCode),
        where("status", "==", "pending")
      );
      const inSnap = await getDocs(inQ);
      setIncomingRequests(
        inSnap.docs.map(d => ({ id: d.id, ...d.data() }))
          .sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0))
      );

      const outQ = query(collection(db, "transfer_requests"), where("toSchoolCode", "==", schoolCode));
      const outSnap = await getDocs(outQ);
      setOutgoingRequests(
        outSnap.docs.map(d => ({ id: d.id, ...d.data() }))
          .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))
      );
    } catch (e) { console.error(e); }
    setRequestsLoading(false);
  }

  function validateReg(f) {
    const e = {};
    if (!f.firstName.trim())     e.firstName    = "First name required.";
    if (!f.lastName.trim())      e.lastName     = "Last name required.";
    if (!f.dob)                  e.dob          = "Date of birth required.";
    if (!f.gender)               e.gender       = "Select gender.";
    if (!f.guardianName.trim())  e.guardianName = "Guardian name required.";
    if (!f.guardianPhone.trim()) e.guardianPhone = "Guardian phone required.";
    if (!f.classId)              e.classId      = "Select a class.";
    if (f.guardianEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.guardianEmail)) e.guardianEmail = "Enter a valid email.";
    return e;
  }

  async function handleRegister(e) {
    e.preventDefault();
    const errs = validateReg(regForm);
    if (Object.keys(errs).length) { setRegErrors(errs); return; }
    setActionLoading(true); setError("");

    const studentCode    = generateStudentCode();
    const fullName       = `${regForm.firstName.trim()} ${regForm.lastName.trim()}`;
    const cls            = classes.find(c => c.id === regForm.classId);
    const parentPassword = generatePassword();
    const guardianPhone  = normalisePhone(regForm.guardianPhone);

    try {
      const studentData = {
        studentCode,
        firstName: regForm.firstName.trim(), lastName: regForm.lastName.trim(),
        fullName, dob: regForm.dob, gender: regForm.gender,
        nationalId: regForm.nationalId.trim() || "",
        guardianName: regForm.guardianName.trim(),
        guardianPhone,
        guardianEmail: regForm.guardianEmail.trim() || "",
        guardianRelation: regForm.guardianRelation.trim() || "Parent/Guardian",
        district: regForm.district, village: regForm.village.trim() || "",
        classId: regForm.classId, className: cls?.name || "",
        schoolCode, schoolName, status: "active",
        parentPortalPassword: parentPassword,
        transferHistory: [{ schoolCode, schoolName, joinedAt: new Date().toISOString(), action: "enrolled" }],
        createdAt: serverTimestamp(),
      };
      await addDoc(collection(db, "students"), studentData);

      // ── Email to guardian ──
      let emailSent = false;
      if (regForm.guardianEmail.trim()) {
        emailSent = await sendEmail({
          templateId: EMAILJS_GUARDIAN_TEMPLATE_ID,
          toEmail: regForm.guardianEmail.trim(),
          toName:  regForm.guardianName.trim(),
          params: {
            student_name:   fullName,
            student_code:   studentCode,
            school_name:    schoolName,
            class_name:     cls?.name || "",
            parent_password: parentPassword,
            portal_url:     `${APP_URL}/parent-portal`,
            login_note:     `Use Student Code: ${studentCode} and the password above to log into the parent portal.`,
          },
        });
      }

      // ── SMS to guardian ──
      let smsSent = false;
      if (guardianPhone) {
        const smsResult = await sendSms(
          guardianPhone,
          `${schoolName}: ${fullName} has been enrolled in ${cls?.name || "school"}.\nStudent Code: ${studentCode}\nParent Portal: ${APP_URL}/parent-portal\nPassword: ${parentPassword}\nKeep this code safe — it's used for transfers too.`
        );
        smsSent = smsResult.success;
      }

      setNewStudentResult({
        code: studentCode,
        guardianEmail: regForm.guardianEmail.trim(),
        guardianPhone,
        emailSent,
        smsSent,
      });
      setRegForm(EMPTY_REG); setRegErrors({});
      fetchStudents();
    } catch (err) { setError("Registration failed: " + err.message); }
    setActionLoading(false);
  }

  async function handleTransferLookup() {
    setTransferLoading(true); setTransferError(""); setTransferFound(null);
    const code = transferCode.trim().toUpperCase();
    if (!code) { setTransferError("Enter a student code."); setTransferLoading(false); return; }
    try {
      const q = query(collection(db, "students"), where("studentCode", "==", code), limit(1));
      const snap = await getDocs(q);
      if (snap.empty) {
        setTransferError(`No student found with code ${code}.`);
      } else {
        const st = { id: snap.docs[0].id, ...snap.docs[0].data() };
        if (st.schoolCode === schoolCode) {
          setTransferError("This student is already enrolled here.");
        } else {
          // Check for an existing pending request for this student → this school
          const dupQ = query(
            collection(db, "transfer_requests"),
            where("studentCode", "==", code),
            where("toSchoolCode", "==", schoolCode),
            where("status", "==", "pending"),
            limit(1)
          );
          const dupSnap = await getDocs(dupQ);
          if (!dupSnap.empty) {
            setTransferError(`A transfer request for ${st.fullName} is already pending approval.`);
          } else {
            setTransferFound(st);
          }
        }
      }
    } catch (e) { setTransferError("Lookup failed: " + e.message); }
    setTransferLoading(false);
  }

  // Sends a transfer request to the student's CURRENT school for approval.
  // No student data is modified here — the actual move happens only after
  // the current school approves via handleApproveRequest.
  async function handleTransferRequest() {
    if (!transferFound || !transferClassId) { setTransferError("Please select a class."); return; }
    setTransferLoading(true); setTransferError(""); setTransferSuccess("");
    try {
      const cls = classes.find(c => c.id === transferClassId);

      await addDoc(collection(db, "transfer_requests"), {
        studentId: transferFound.id,
        studentCode: transferFound.studentCode,
        studentName: transferFound.fullName,
        fromSchoolCode: transferFound.schoolCode,
        fromSchoolName: transferFound.schoolName || transferFound.schoolCode,
        toSchoolCode: schoolCode,
        toSchoolName: schoolName,
        requestedClassId: transferClassId,
        requestedClassName: cls?.name || "",
        status: "pending",
        requestedByUid: auth.currentUser?.uid || null,
        createdAt: serverTimestamp(),
      });

      setTransferSuccess(
        `Transfer request sent for ${transferFound.fullName} to ${transferFound.schoolName || transferFound.schoolCode}. ` +
        `The student will move once that school approves the request.`
      );
      setTransferFound(null); setTransferCode(""); setTransferClassId("");
      fetchTransferRequests();
    } catch (e) { setTransferError("Request failed: " + e.message); }
    setTransferLoading(false);
  }

  // Approve a transfer request FOR one of our own students (we are fromSchoolCode).
  // Calls the backend (server.js), which runs the student-doc + request-doc
  // update as a single Firestore transaction via the Admin SDK. This runs
  // server-side (not directly from the client) because it needs to write to
  // a student doc that's about to belong to a *different* school — that
  // cross-school write is intentionally not something client Firestore
  // rules allow directly.
  async function handleApproveRequest(req) {
    setRequestActionId(req.id); setRequestsError("");
    try {
      const idToken = await auth.currentUser?.getIdToken();
      if (!idToken) throw new Error("Not signed in.");

      const res = await fetch(`${API_URL}/api/transfers/${req.id}/approve`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Approval failed.");

      fetchTransferRequests();
      fetchStudents();
    } catch (e) { setRequestsError(e.message); }
    setRequestActionId(null);
  }

  // Reject a transfer request FOR one of our own students. No student data
  // is touched — just marks the request rejected with an optional reason.
  // Also runs server-side via server.js for consistent auth/authorisation
  // checks (role + fromSchoolCode match) with the approve flow.
  async function handleRejectRequest() {
    if (!rejectTarget) return;
    setRequestActionId(rejectTarget.id); setRequestsError("");
    try {
      const idToken = await auth.currentUser?.getIdToken();
      if (!idToken) throw new Error("Not signed in.");

      const res = await fetch(`${API_URL}/api/transfers/${rejectTarget.id}/reject`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ reason: rejectReason.trim() || "No reason given" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Rejection failed.");

      setRejectTarget(null); setRejectReason("");
      fetchTransferRequests();
    } catch (e) { setRequestsError(e.message); }
    setRequestActionId(null);
  }

  async function handleDeleteStudent() {
    setActionLoading(true);
    try { await deleteDoc(doc(db, "students", showDelete.id)); setShowDelete(null); fetchStudents(); }
    catch (err) { console.error(err); }
    setActionLoading(false);
  }

  const filtered = students.filter(s => {
    const ms = !search || s.fullName?.toLowerCase().includes(search.toLowerCase()) || s.studentCode?.toLowerCase().includes(search.toLowerCase());
    const mc = classFilter === "all" || s.classId === classFilter;
    return ms && mc;
  });

  const tabs = [
    { id: "list",     label: "Student List",     icon: IC.users    },
    { id: "register", label: "Register Student", icon: IC.plus     },
    { id: "transfer", label: "Transfer In",       icon: IC.transfer },
    { id: "requests", label: "Transfer Requests", icon: IC.transfer, badge: incomingRequests.length || undefined },
  ];

  function resetTabState() {
    setError(""); setNewStudentResult(null);
    setTransferSuccess(""); setTransferError("");
    setRequestsError("");
  }

  function reqStatusLabel(status) {
    if (status === "approved") return { text: "Approved", color: "#4ade80" };
    if (status === "rejected") return { text: "Rejected", color: "#f87171" };
    return { text: "Pending", color: "#facc15" };
  }

  return (
    <div className="space-y-6">
      <div className="flex-between" style={{ flexWrap: "wrap", gap: 12 }}>
        <div>
          <h2 className="module-title">Student Management</h2>
          <p className="module-sub">{students.length} students enrolled — {schoolName}</p>
        </div>
      </div>

      <div className="sub-tabs" style={{ overflowX: "auto" }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => { setActiveTab(t.id); resetTabState(); }}
            className={`sub-tab${activeTab === t.id ? " sub-tab--active" : ""}`}
            style={{ position: "relative" }}>
            {t.icon}<span>{t.label}</span>
            {!!t.badge && (
              <span style={{
                position: "absolute", top: 2, right: 2, minWidth: 16, height: 16, borderRadius: 8,
                background: "#ef4444", color: "#fff", fontSize: 10, fontWeight: 700,
                display: "flex", alignItems: "center", justifyContent: "center", padding: "0 4px",
              }}>{t.badge}</span>
            )}
          </button>
        ))}
      </div>

      {/* ── LIST TAB ── */}
      {activeTab === "list" && (
        <div className="space-y-4">
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <div className="search-wrap" style={{ flex: 1, minWidth: 200 }}>
              <span className="search-wrap__icon">{IC.search}</span>
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name or code…" className="search-wrap__input" />
            </div>
            <select value={classFilter} onChange={e => setClassFilter(e.target.value)} className="field__select" style={{ width: "auto", minWidth: 140 }}>
              <option value="all">All Classes</option>
              {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          <div className="card">
            {loading ? (
              <div style={{ padding: 48, display: "flex", justifyContent: "center" }}><Spinner /></div>
            ) : filtered.length === 0 ? (
              <EmptyState icon={IC.students} title="No students found"
                sub={search ? "Try a different search" : "Register your first student"}
                action={<Btn onClick={() => setActiveTab("register")} variant="gold" size="sm">{IC.plus} Register</Btn>}
              />
            ) : (
              <div className="data-table-wrap">
                <table className="data-table data-table--stack">
                  <thead>
                    <tr>
                      <th>Student</th><th>Code</th><th>Class</th><th>Guardian</th><th>Status</th>
                      <th style={{ textAlign: "right" }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map(s => (
                      <tr key={s.id}>
                        <td data-label="Student">
                          <div className="flex-gap-3">
                            <div className={`avatar ${s.gender === "Female" ? "avatar--pink" : "avatar--blue"}`}>{initials(s.fullName)}</div>
                            <div>
                              <div className="data-table__primary">{s.fullName}</div>
                              <div className="data-table__meta">{s.gender} · {s.dob || "—"}</div>
                            </div>
                          </div>
                        </td>
                        <td data-label="Code"><StudentCodeBadge code={s.studentCode} /></td>
                        <td style={{ fontSize: 13, color: "var(--text2)" }} data-label="Class">{s.className || "—"}</td>
                        <td data-label="Guardian">
                          <div style={{ fontSize: 12, color: "var(--text2)" }}>{s.guardianName || "—"}</div>
                          <div style={{ fontSize: 11, color: "var(--text3)" }}>{s.guardianPhone || ""}</div>
                        </td>
                        <td data-label="Status"><StatusPill active={s.status !== "suspended"} /></td>
                        <td data-label="Actions">
                          <div className="data-table__actions" style={{ display: "flex", justifyContent: "flex-end", gap: 2 }}>
                            <ActionBtn onClick={() => setShowDetail(s)} icon={IC.eye} title="View profile" />
                            <ActionBtn onClick={() => setShowDelete(s)} icon={IC.trash} title="Remove" hoverBg="rgba(239,68,68,0.1)" />
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── REGISTER TAB ── */}
      {activeTab === "register" && (
        <div style={{ maxWidth: 680 }}>
          {newStudentResult ? (
            <div className="card" style={{ padding: 40, textAlign: "center" }}>
              <div style={{ width: 56, height: 56, background: "rgba(34,197,94,0.15)", borderRadius: 18, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px", color: "#4ade80" }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width={28} height={28}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5"/></svg>
              </div>
              <h3 style={{ fontFamily: "var(--font-display)", fontSize: "1.3rem", color: "var(--text)", marginBottom: 6 }}>Student Registered!</h3>
              <p style={{ fontSize: 13, color: "var(--text3)", marginBottom: 20 }}>This student code is the unique identifier across all schools.</p>
              <div style={{ background: "var(--accent-pale)", borderRadius: 16, padding: "16px 24px", display: "inline-flex", flexDirection: "column", alignItems: "center", gap: 8, marginBottom: 20 }}>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: 2, textTransform: "uppercase", color: "var(--accent-lt)", opacity: 0.7 }}>Student Code</span>
                <StudentCodeBadge code={newStudentResult.code} />
                <span style={{ fontSize: 11, color: "var(--text3)" }}>Used for transfers and parent portal login</span>
              </div>

              {/* Notification delivery summary */}
              <div style={{ marginBottom: 16 }}>
                <p style={{ fontSize: 12, color: "var(--text3)", marginBottom: 8 }}>Guardian notifications:</p>
                <NotifStatus
                  email={newStudentResult.guardianEmail ? newStudentResult.emailSent : undefined}
                  sms={newStudentResult.guardianPhone ? newStudentResult.smsSent : undefined}
                />
                {!newStudentResult.guardianEmail && !newStudentResult.guardianPhone && (
                  <div className="alert alert--info" style={{ marginTop: 8 }}>
                    {IC.info}<span>No contact details provided. Share the student code manually.</span>
                  </div>
                )}
              </div>

              <div style={{ display: "flex", justifyContent: "center", gap: 10, marginTop: 20 }}>
                <Btn variant="ghost" onClick={() => { setNewStudentResult(null); setActiveTab("list"); }}>View Students</Btn>
                <Btn variant="gold" onClick={() => setNewStudentResult(null)}>Register Another</Btn>
              </div>
            </div>
          ) : (
            <form onSubmit={handleRegister} className="card" style={{ padding: 28 }}>
              {error && <div className="alert alert--error" style={{ marginBottom: 16 }}>{IC.warning}<span>{error}</span></div>}

              {/* Personal Info */}
              <div style={{ marginBottom: 24 }}>
                <span className="section-tag">Personal Information</span>
                <div className="grid-2" style={{ marginTop: 12 }}>
                  <Input label="First Name" required value={regForm.firstName} onChange={e => setRegForm(p => ({...p, firstName: e.target.value}))} placeholder="Chisomo" error={regErrors.firstName} />
                  <Input label="Last Name" required value={regForm.lastName} onChange={e => setRegForm(p => ({...p, lastName: e.target.value}))} placeholder="Banda" error={regErrors.lastName} />
                  <Input label="Date of Birth" required type="date" value={regForm.dob} onChange={e => setRegForm(p => ({...p, dob: e.target.value}))} error={regErrors.dob} />
                  <Select label="Gender" required value={regForm.gender} onChange={e => setRegForm(p => ({...p, gender: e.target.value}))} error={regErrors.gender}>
                    <option value="">Select…</option>
                    {GENDERS.map(g => <option key={g} value={g}>{g}</option>)}
                  </Select>
                  <Input label="National ID (optional)" value={regForm.nationalId} onChange={e => setRegForm(p => ({...p, nationalId: e.target.value}))} placeholder="Optional" />
                  <Select label="District of Origin" value={regForm.district} onChange={e => setRegForm(p => ({...p, district: e.target.value}))}>
                    <option value="">Select…</option>
                    {DISTRICTS.map(d => <option key={d} value={d}>{d}</option>)}
                  </Select>
                </div>
                <div style={{ marginTop: 16 }}>
                  <Input label="Village / Area" value={regForm.village} onChange={e => setRegForm(p => ({...p, village: e.target.value}))} placeholder="Home village or area" />
                </div>
              </div>

              {/* Guardian Info */}
              <div style={{ marginBottom: 24 }}>
                <span className="section-tag">Guardian / Parent Information</span>
                <div className="grid-2" style={{ marginTop: 12 }}>
                  <Input label="Guardian Full Name" required value={regForm.guardianName} onChange={e => setRegForm(p => ({...p, guardianName: e.target.value}))} placeholder="John Banda" error={regErrors.guardianName} />
                  <div>
                    <Input
                      label="Guardian Phone (for SMS)"
                      required
                      value={regForm.guardianPhone}
                      onChange={e => setRegForm(p => ({...p, guardianPhone: e.target.value}))}
                      placeholder="+265 9xx xxx xxx or 09xxxxxxxx"
                      error={regErrors.guardianPhone}
                    />
                    <p style={{ fontSize: 11, color: "var(--text3)", marginTop: 4, display: "flex", gap: 5, alignItems: "center" }}>
                      {IC.sms} Student code and portal credentials sent via SMS.
                    </p>
                  </div>
                  <Input label="Relationship" value={regForm.guardianRelation} onChange={e => setRegForm(p => ({...p, guardianRelation: e.target.value}))} placeholder="Father / Mother / Uncle…" />
                </div>
                <div style={{ marginTop: 16 }}>
                  <Input
                    label="Guardian Email (optional — for parent portal email)"
                    type="email"
                    value={regForm.guardianEmail}
                    onChange={e => setRegForm(p => ({...p, guardianEmail: e.target.value}))}
                    placeholder="guardian@example.com"
                    error={regErrors.guardianEmail}
                  />
                  <p style={{ fontSize: 11, color: "var(--text3)", marginTop: 5, display: "flex", gap: 6, alignItems: "center" }}>
                    {IC.mail} If provided, guardian also receives credentials by email.
                  </p>
                </div>
              </div>

              {/* Class */}
              <div style={{ marginBottom: 24 }}>
                <span className="section-tag">Academic Placement</span>
                <div style={{ marginTop: 12 }}>
                  <Select label="Assign to Class" required value={regForm.classId} onChange={e => setRegForm(p => ({...p, classId: e.target.value}))} error={regErrors.classId}>
                    <option value="">Select class…</option>
                    {classes.length === 0 && <option disabled>No classes — add in School Settings</option>}
                    {classes.map(c => <option key={c.id} value={c.id}>{c.name} ({c.level})</option>)}
                  </Select>
                </div>
              </div>

              <div className="data-table__actions" style={{ display: "flex", justifyContent: "flex-end", gap: 8, paddingTop: 8 }}>
                <Btn type="button" variant="ghost" onClick={() => setRegForm(EMPTY_REG)}>Clear Form</Btn>
                <Btn type="submit" variant="gold" loading={actionLoading}>{IC.students} Register &amp; Notify</Btn>
              </div>
            </form>
          )}
        </div>
      )}

      {/* ── TRANSFER IN TAB (lookup + send request) ── */}
      {activeTab === "transfer" && (
        <div style={{ maxWidth: 680 }} className="space-y-5">
          <div className="alert alert--info">
            {IC.info}
            <div style={{ fontSize: 12, lineHeight: 1.6 }}>
              <strong>How transfers work:</strong> Enter the student's code (STU-XXXX-XXXX). Their record is
              retrieved, and a <strong>transfer request</strong> is sent to their current school. The student
              only moves to this school once that school approves the request — check the{" "}
              <strong>Transfer Requests</strong> tab for status.
            </div>
          </div>
          {transferSuccess ? (
            <div className="card" style={{ padding: 40, textAlign: "center" }}>
              <div style={{ width: 56, height: 56, background: "rgba(250,204,21,0.15)", borderRadius: 18, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px", color: "#facc15" }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width={28} height={28}><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6l4 2M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
              </div>
              <p style={{ fontFamily: "var(--font-display)", fontSize: "1.1rem", color: "var(--text)", marginBottom: 8 }}>Request Sent</p>
              <p style={{ fontSize: 13, color: "var(--text3)", marginBottom: 20 }}>{transferSuccess}</p>
              <div style={{ display: "flex", justifyContent: "center", gap: 10 }}>
                <Btn variant="ghost" onClick={() => { setTransferSuccess(""); setActiveTab("requests"); }}>View Requests</Btn>
                <Btn variant="gold" onClick={() => setTransferSuccess("")}>Send Another</Btn>
              </div>
            </div>
          ) : (
            <div className="card space-y-5" style={{ padding: 24 }}>
              <div>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <input
                    value={transferCode}
                    onChange={e => { setTransferCode(e.target.value.toUpperCase()); setTransferFound(null); setTransferError(""); }}
                    placeholder="STU-XXXX-XXXX"
                    className="field__input"
                    style={{ fontFamily: "var(--font-mono)", letterSpacing: 2, flex: 1, minWidth: 180 }}
                  />
                  <Btn onClick={handleTransferLookup} loading={transferLoading} variant="accent">Look Up</Btn>
                </div>
                {transferError && <p style={{ fontSize: 12, color: "#f87171", marginTop: 6 }}>{transferError}</p>}
              </div>
              {transferFound && (
                <div style={{ borderTop: "1px solid var(--border)", paddingTop: 20 }} className="space-y-4">
                  <span className="section-tag">Confirm &amp; Assign Class</span>
                  <div style={{ background: "var(--bg2)", borderRadius: 16, padding: 16, border: "1px solid var(--border)" }}>
                    <div className="flex-gap-3" style={{ marginBottom: 14 }}>
                      <div className={`avatar ${transferFound.gender === "Female" ? "avatar--pink" : "avatar--blue"}`} style={{ width: 44, height: 44 }}>{initials(transferFound.fullName)}</div>
                      <div>
                        <p style={{ fontWeight: 700, fontSize: 14, color: "var(--text)" }}>{transferFound.fullName}</p>
                        <StudentCodeBadge code={transferFound.studentCode} />
                      </div>
                    </div>
                    <div className="grid-2" style={{ fontSize: 12, gap: 8 }}>
                      {[
                        ["Gender", transferFound.gender],
                        ["DOB", transferFound.dob||"—"],
                        ["Guardian", transferFound.guardianName],
                        ["Phone", transferFound.guardianPhone||"—"],
                        ["Current School", transferFound.schoolName||transferFound.schoolCode],
                        ["Current Class", transferFound.className||"—"],
                      ].map(([k, v]) => (
                        <div key={k}><span style={{ color: "var(--text3)" }}>{k}: </span><strong style={{ color: "var(--text)" }}>{v}</strong></div>
                      ))}
                    </div>
                    <p style={{ fontSize: 11, color: "var(--teal-lt)", marginTop: 12, display: "flex", gap: 5, alignItems: "center" }}>
                      {IC.info} This will send a transfer request to {transferFound.schoolName || transferFound.schoolCode} for approval — the student won't move until they approve it.
                    </p>
                  </div>
                  <Select label="Assign to Class at This School" required value={transferClassId} onChange={e => setTransferClassId(e.target.value)}>
                    <option value="">Select class…</option>
                    {classes.map(c => <option key={c.id} value={c.id}>{c.name} ({c.level})</option>)}
                  </Select>
                  <div className="data-table__actions" style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                    <Btn variant="ghost" onClick={() => { setTransferFound(null); setTransferCode(""); }}>Cancel</Btn>
                    <Btn variant="teal" onClick={handleTransferRequest} loading={transferLoading}>{IC.transfer} Send Transfer Request</Btn>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── TRANSFER REQUESTS TAB ── */}
      {activeTab === "requests" && (
        <div className="space-y-6">
          {requestsError && <div className="alert alert--error">{IC.warning}<span>{requestsError}</span></div>}

          {/* Incoming: students at MY school being requested by another — I approve/reject */}
          <div>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: "var(--text)", marginBottom: 4 }}>
              Incoming Requests <span style={{ color: "var(--text3)", fontWeight: 400 }}>— students from {schoolName} requested by other schools</span>
            </h3>
            <div className="card" style={{ marginTop: 10 }}>
              {requestsLoading ? (
                <div style={{ padding: 32, display: "flex", justifyContent: "center" }}><Spinner /></div>
              ) : incomingRequests.length === 0 ? (
                <EmptyState icon={IC.transfer} title="No pending incoming requests" sub="You'll see requests here when another school wants to transfer in one of your students." />
              ) : (
                <div className="data-table-wrap">
                  <table className="data-table data-table--stack">
                    <thead>
                      <tr>
                        <th>Student</th><th>Requesting School</th><th>Requested Class</th><th>Requested</th>
                        <th style={{ textAlign: "right" }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {incomingRequests.map(r => (
                        <tr key={r.id}>
                          <td data-label="Student">
                            <div className="data-table__primary">{r.studentName}</div>
                            <StudentCodeBadge code={r.studentCode} />
                          </td>
                          <td data-label="Requesting School" style={{ fontSize: 13, color: "var(--text2)" }}>{r.toSchoolName || r.toSchoolCode}</td>
                          <td data-label="Requested Class" style={{ fontSize: 13, color: "var(--text2)" }}>{r.requestedClassName || "—"}</td>
                          <td data-label="Requested" style={{ fontSize: 12, color: "var(--text3)" }}>{fmtDate(r.createdAt)}</td>
                          <td data-label="Actions">
                            <div className="data-table__actions" style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                              <Btn size="sm" variant="ghost" onClick={() => setRejectTarget(r)} loading={requestActionId === r.id}>Reject</Btn>
                              <Btn size="sm" variant="gold" onClick={() => handleApproveRequest(r)} loading={requestActionId === r.id}>Approve</Btn>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          {/* Outgoing: requests MY school sent to pull a student in — read-only status */}
          <div>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: "var(--text)", marginBottom: 4 }}>
              Outgoing Requests <span style={{ color: "var(--text3)", fontWeight: 400 }}>— transfers you've requested into {schoolName}</span>
            </h3>
            <div className="card" style={{ marginTop: 10 }}>
              {requestsLoading ? (
                <div style={{ padding: 32, display: "flex", justifyContent: "center" }}><Spinner /></div>
              ) : outgoingRequests.length === 0 ? (
                <EmptyState icon={IC.transfer} title="No transfer requests sent" sub="Requests you send from the Transfer In tab will show up here." />
              ) : (
                <div className="data-table-wrap">
                  <table className="data-table data-table--stack">
                    <thead>
                      <tr>
                        <th>Student</th><th>Current School</th><th>Requested Class</th><th>Status</th><th>Requested</th>
                      </tr>
                    </thead>
                    <tbody>
                      {outgoingRequests.map(r => {
                        const st = reqStatusLabel(r.status);
                        return (
                          <tr key={r.id}>
                            <td data-label="Student">
                              <div className="data-table__primary">{r.studentName}</div>
                              <StudentCodeBadge code={r.studentCode} />
                            </td>
                            <td data-label="Current School" style={{ fontSize: 13, color: "var(--text2)" }}>{r.fromSchoolName || r.fromSchoolCode}</td>
                            <td data-label="Requested Class" style={{ fontSize: 13, color: "var(--text2)" }}>{r.requestedClassName || "—"}</td>
                            <td data-label="Status">
                              <span style={{ fontSize: 12, fontWeight: 700, color: st.color }}>{st.text}</span>
                              {r.status === "rejected" && r.rejectionReason && (
                                <div style={{ fontSize: 11, color: "var(--text3)", marginTop: 2 }}>{r.rejectionReason}</div>
                              )}
                            </td>
                            <td data-label="Requested" style={{ fontSize: 12, color: "var(--text3)" }}>{fmtDate(r.createdAt)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Student Profile Modal ── */}
      {showDetail && (
        <Modal title="Student Profile" onClose={() => setShowDetail(null)} size="lg">
          <div className="space-y-5">
            <div className="flex-gap-4">
              <div className={`avatar ${showDetail.gender === "Female" ? "avatar--pink" : "avatar--blue"}`} style={{ width: 56, height: 56, borderRadius: 16, fontSize: 18 }}>{initials(showDetail.fullName)}</div>
              <div>
                <h3 style={{ fontFamily: "var(--font-display)", fontSize: "1.3rem", color: "var(--text)" }}>{showDetail.fullName}</h3>
                <StudentCodeBadge code={showDetail.studentCode} />
                <p style={{ fontSize: 11.5, color: "var(--text3)", marginTop: 4 }}>{showDetail.className} · {showDetail.gender} · {showDetail.status}</p>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 2, borderRadius: 14, overflow: "hidden" }}>
              {[
                ["Date of Birth",   showDetail.dob||"—"],
                ["National ID",     showDetail.nationalId||"—"],
                ["District",        showDetail.district||"—"],
                ["Village",         showDetail.village||"—"],
                ["Guardian",        showDetail.guardianName||"—"],
                ["Relationship",    showDetail.guardianRelation||"—"],
                ["Guardian Phone",  showDetail.guardianPhone||"—"],
                ["Guardian Email",  showDetail.guardianEmail||"—"],
                ["Enrolled",        fmtDate(showDetail.createdAt)],
                ["Notifications",   [showDetail.guardianEmail && "Email", showDetail.guardianPhone && "SMS"].filter(Boolean).join(" + ") || "None on record"],
              ].map(([k, v]) => (
                <div key={k} style={{ background: "var(--bg-card)", padding: "10px 16px", border: "1px solid var(--border)" }}>
                  <p style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: 2, textTransform: "uppercase", color: "var(--text3)", marginBottom: 3 }}>{k}</p>
                  <p style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>{v}</p>
                </div>
              ))}
            </div>
          </div>
        </Modal>
      )}

      {/* ── Delete Student Modal ── */}
      {showDelete && (
        <Modal title="Remove Student" onClose={() => setShowDelete(null)} size="md">
          <div className="space-y-4">
            <div className="alert alert--error">
              {IC.warning}
              <div>
                <p style={{ fontWeight: 600, fontSize: 13, marginBottom: 3 }}>Remove from this school?</p>
                <p style={{ fontSize: 12 }}><strong>{showDelete.fullName}</strong>'s record will be removed from {schoolName}. Their student code stays valid for future enrolment elsewhere.</p>
              </div>
            </div>
            <div className="data-table__actions" style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <Btn variant="ghost" onClick={() => setShowDelete(null)}>Cancel</Btn>
              <Btn variant="danger" loading={actionLoading} onClick={handleDeleteStudent}>Remove Student</Btn>
            </div>
          </div>
        </Modal>
      )}

      {/* ── Reject Transfer Request Modal ── */}
      {rejectTarget && (
        <Modal title="Reject Transfer Request" onClose={() => { setRejectTarget(null); setRejectReason(""); }} size="md">
          <div className="space-y-4">
            <p style={{ fontSize: 13, color: "var(--text2)" }}>
              Reject the request from <strong>{rejectTarget.toSchoolName || rejectTarget.toSchoolCode}</strong> to transfer{" "}
              <strong>{rejectTarget.studentName}</strong>? This student will remain at {schoolName}.
            </p>
            <Input
              label="Reason (optional, shown to requesting school)"
              value={rejectReason}
              onChange={e => setRejectReason(e.target.value)}
              placeholder="e.g. Outstanding fees, records incomplete…"
            />
            <div className="data-table__actions" style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <Btn variant="ghost" onClick={() => { setRejectTarget(null); setRejectReason(""); }}>Cancel</Btn>
              <Btn variant="danger" loading={requestActionId === rejectTarget.id} onClick={handleRejectRequest}>Reject Request</Btn>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}