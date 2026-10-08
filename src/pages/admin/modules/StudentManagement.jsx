import { useState, useEffect, useRef } from "react";
import { db, auth } from "../../../firebase";
import {
  doc, collection, getDocs, deleteDoc, query, where, serverTimestamp, addDoc, limit,
} from "firebase/firestore";

import { IC } from "./icons";
import { GENDERS, DISTRICTS } from "./constants";
import { generateStudentCode, normalisePhone, initials, fmtDate } from "./helpers";
import { guardianFields, guardiansOf } from "../../../services/guardians";
import { sendPaced } from "../../../services/sms";
import { sendSms, sendEmail, EMAILJS_GUARDIAN_TEMPLATE_ID, APP_URL, messageChannel } from "./notifications";
import { subscribeSchoolSettings } from "../../../services/academicTerm";
import {
  StatusPill, Modal, Input, Select, Btn, Spinner, EmptyState, ActionBtn, StudentCodeBadge, NotifStatus,
} from "./ui";
import {
  resolveGuardianLink, notifyGuardianOfPendingLink, enrolmentSms, guardianWelcomeSms, loginLinkSms, credentialsSms, isLinkPending,
  LINK_ACTIVE, LINK_PENDING,
} from "../../../services/guardianLink";
import BulkImportModal from "../../../components/import/BulkImportModal";
import {
  STUDENT_COLUMNS, STUDENT_SAMPLE, validateStudentRows, importStudents,
} from "../../../services/bulkImport";
import {
  subscribeCampuses, requestCampusTransfer, campusName as campusLabel,
} from "../../../services/campuses";
import { lookupStudentByCode } from "../../../services/studentLookup";

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
    guardian2Name: "", guardian2Phone: "", guardian2Relation: "",
    district: "", village: "", classId: "", campusId: "",
  };
  const [regForm, setRegForm]                         = useState(EMPTY_REG);
  const [regErrors, setRegErrors]                     = useState({});
  const [newStudentResult, setNewStudentResult]       = useState(null);
  const [bulkLink, setBulkLink]                   = useState(null);   // null | { stage: "confirm"|"sending"|"done", ... }
  const [linkSending, setLinkSending]                 = useState(false);
  const [linkSent, setLinkSent]                       = useState(false);
  const [showBulk, setShowBulk]                       = useState(false);

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

  // ── Campus state ──
  const [campuses, setCampuses]                 = useState([]);
  const [campusFilter, setCampusFilter]         = useState("all");
  const [movingStudent, setMovingStudent]       = useState(null);
  const [moveTo, setMoveTo]                     = useState("");
  const [moveReason, setMoveReason]             = useState("");
  const [moveError, setMoveError]               = useState("");
  const [moveSuccess, setMoveSuccess]           = useState("");

  useEffect(() => { fetchStudents(); fetchClasses(); fetchTransferRequests(); }, []);
  useEffect(() => subscribeCampuses(schoolCode, setCampuses), [schoolCode]);
  // For the guardian's login message: SMS if the school has SMS on, else WhatsApp.
  const [schoolSettings, setSchoolSettings] = useState(null);
  useEffect(() => subscribeSchoolSettings(schoolCode, setSchoolSettings), [schoolCode]);

  const activeCampuses = campuses.filter(c => c.status !== "archived");
  // The picker only earns its space once a school actually runs two sites.
  // A single-campus school never sees any of this.
  const multiCampus = activeCampuses.length > 1;
  const primaryCampus = activeCampuses.find(c => c.isPrimary) || activeCampuses[0] || null;

  // Enrol onto the main campus unless told otherwise, so the field is a
  // correction rather than another mandatory question. Derived rather than
  // written into the form on mount: the campus list arrives asynchronously,
  // and an effect that back-fills the form would re-render every registration
  // screen a beat after it painted.
  const enrolCampusId = regForm.campusId || primaryCampus?.id || "";

  async function submitCampusMove() {
    setMoveError("");
    const target = activeCampuses.find(c => c.id === moveTo);
    const res = await requestCampusTransfer({
      schoolCode,
      student: movingStudent,
      toCampusId: moveTo,
      toCampusName: target?.name || "",
      reason: moveReason,
      requestedBy: { id: auth.currentUser?.uid || "", name: "Administrator", role: "admin" },
    });
    if (!res.ok) { setMoveError(res.error); return; }
    setMovingStudent(null); setMoveTo(""); setMoveReason("");
    setMoveSuccess("Transfer requested. It appears under Campus Transfers for a decision — the student stays where they are until then.");
  }

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
    const guardianPhone  = normalisePhone(regForm.guardianPhone);
    // Everyone listed gets the school's WhatsApp messages, not only the first.
    const guardianSet = guardianFields([
      { name: regForm.guardianName.trim(), phone: guardianPhone, relation: regForm.guardianRelation.trim() || "Parent/Guardian" },
      { name: regForm.guardian2Name.trim(), phone: regForm.guardian2Phone, relation: regForm.guardian2Relation.trim() },
    ]);

    try {
      // Does this guardian already exist on ACALink? If so the child joins the
      // account they already have — same password, no second credential — but
      // only once they have confirmed it. See services/guardianLink.js.
      const link = await resolveGuardianLink({ phone: guardianPhone });
      const parentPassword = link.password;

      const studentData = {
        studentCode,
        firstName: regForm.firstName.trim(), lastName: regForm.lastName.trim(),
        fullName, dob: regForm.dob, gender: regForm.gender,
        nationalId: regForm.nationalId.trim() || "",
        guardianName: regForm.guardianName.trim(),
        guardianPhone,
        guardianEmail: regForm.guardianEmail.trim() || "",
        guardianRelation: regForm.guardianRelation.trim() || "Parent/Guardian",
        guardians: guardianSet.guardians,
        guardianPhones: guardianSet.guardianPhones,
        district: regForm.district, village: regForm.village.trim() || "",
        classId: regForm.classId, className: cls?.name || "",
        // The campus the child actually attends. Written even for a
        // single-campus school so nothing has to guess later, and so a school
        // that adds a second site does not have to backfill a whole roll.
        campusId: enrolCampusId,
        campusName: campusLabel(campuses, enrolCampusId),
        schoolCode, schoolName, status: "active",
        parentPortalPassword: parentPassword,
        guardianLinkStatus: link.isNewGuardian ? LINK_ACTIVE : LINK_PENDING,
        guardianLinkRequestedAt: serverTimestamp(),
        transferHistory: [{ schoolCode, schoolName, joinedAt: new Date().toISOString(), action: "enrolled" }],
        createdAt: serverTimestamp(),
      };
      const studentRef = await addDoc(collection(db, "students"), studentData);

      // An existing guardian is told in-app as well as by SMS, because the
      // notice has to reach the account the child was attached to — that is
      // where the confirmation happens.
      if (!link.isNewGuardian) {
        await notifyGuardianOfPendingLink({
          schoolCode, schoolName,
          studentId: studentRef.id,
          studentName: fullName,
          phone: guardianPhone,
        });
      }

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
            // An existing guardian already has a password; sending another
            // would tell them to change something that has not changed.
            parent_password: link.isNewGuardian ? parentPassword : "(your existing ACALink password)",
            portal_url:     APP_URL,
            login_note:     link.isNewGuardian
              ? `Sign in to the ACALink app with your phone number ${guardianPhone} and the password above. One password covers all your children.`
              : `${fullName} has been added to your existing ACALink account. Open the app and confirm with your current password to see their records.`,
          },
        });
      }

      // ── SMS to guardian ──
      let smsSent = false;
      if (guardianPhone) {
        const smsResult = await sendSms(
          guardianPhone,
          enrolmentSms({
            link, schoolName,
            studentName: fullName,
            className: cls?.name || "",
            studentCode,
            appUrl: APP_URL,
            whatsapp: messageChannel(schoolSettings) === "whatsapp",
          }),
          { channel: messageChannel(schoolSettings) },
        );
        smsSent = smsResult.success;
      }

      // Second guardian: hears about the child too, with no login of their own.
      const second = guardianSet.guardians.find((g) => g.phone !== guardianPhone);
      if (second) {
        await sendSms(
          second.phone,
          guardianWelcomeSms({
            schoolName, studentName: fullName, className: cls?.name || "",
            whatsapp: messageChannel(schoolSettings) === "whatsapp",
          }),
          { channel: messageChannel(schoolSettings) },
        );
      }

      setNewStudentResult({
        code: studentCode,
        guardianEmail: regForm.guardianEmail.trim(),
        guardianPhone,
        guardianNumbers: guardianSet.guardians.map((g) => g.phone),
        studentName: fullName,
        emailSent,
        smsSent,
        link,
      });
      setRegForm(EMPTY_REG); setRegErrors({}); setLinkSent(false);
      fetchStudents();
    } catch (err) { setError("Registration failed: " + err.message); }
    setActionLoading(false);
  }

  /** One message per phone number across every active student, so a parent
   *  with three children (or a number listed twice) is messaged once. */
  function loginLinkAudience() {
    const channel = messageChannel(schoolSettings);
    const whatsapp = channel === "whatsapp";
    const byPhone = new Map();     // phone -> { primaryOf: [students], any: true }
    for (const st of students) {
      if (st.status && st.status !== "active") continue;
      guardiansOf(st).forEach((g, i) => {
        if (!g.phone) return;
        if (!byPhone.has(g.phone)) byPhone.set(g.phone, { primaryOf: [] });
        // The first guardian owns the app account, so only they are given the
        // password. A child still waiting for the guardian to confirm in the
        // app has no password to give out yet.
        if (i === 0 && st.parentPortalPassword && st.guardianLinkStatus !== "pending") {
          byPhone.get(g.phone).primaryOf.push(st);
        }
      });
    }
    return [...byPhone].map(([to, { primaryOf }]) => {
      const withPassword = primaryOf.length > 0;
      const message = withPassword
        ? credentialsSms({
            schoolName, phone: to, password: primaryOf[0].parentPortalPassword, whatsapp,
            studentNames: primaryOf.map((s) => s.fullName).join(", "),
          })
        : loginLinkSms({ schoolName, studentName: "your child", whatsapp });
      return { to, message, withPassword };
    });
  }

  // Who has already been sent the link, remembered in this browser so a
  // stopped or rate-limited run can be resumed without messaging anyone twice.
  const sentKey = `loginLinkSent:${schoolCode}`;
  const readSent = () => { try { return new Set(JSON.parse(localStorage.getItem(sentKey) || "[]")); } catch { return new Set(); } };
  const stopLinkRef = useRef(false);
  // WhatsApp let 27 new conversations through before its send protection kicked in,
  // so messages go out fast in batches a little under that, with a 10s pause between.
  const LINK_BATCH = 25;
  // One-off: families who already have their login, so they are left out this time.
  // Editable in the box below; delete this default once the rollout is done.
  const [skipText, setSkipText] = useState("0991686188,0995139560, 0884250111, 0882370942,0885560860,0884131413,0884166834,0881970059,0882644674,0888184151,0993910842,0884095769,0999678833,0996492204,0996440274,0888552700,0991375780,0991613795,0999541085,0993558292,0881199606,0992625701,0995446298,0996401893");
  const parseSkip = (t) => new Set(String(t || "").split(/[\s,;]+/).map((x) => normalisePhone(x)).filter(Boolean));

  async function sendLoginLinkToAll() {
    const channel = messageChannel(schoolSettings);
    const list = loginLinkAudience();
    const already = readSent();
    // The skipped numbers count as already sent from now on, so a later run leaves them out too.
    parseSkip(skipText).forEach((p) => already.add(p));
    try { localStorage.setItem(sentKey, JSON.stringify([...already])); } catch { /* ignore */ }
    stopLinkRef.current = false;
    const pending = list.filter((r) => !already.has(r.to)).length;
    const todo = pending;
    setBulkLink({ stage: "sending", done: 0, total: todo });
    const res = await sendPaced(list, {
      channel,
      gapMs: 250,
      batchSize: channel === "whatsapp" ? LINK_BATCH : Infinity,
      batchPauseMs: 10_000,
      isDone: (to) => already.has(to),
      onSent: (to) => {
        already.add(to);
        try { localStorage.setItem(sentKey, JSON.stringify([...already])); } catch { /* resume just won't remember */ }
      },
      onProgress: (done, total) => setBulkLink({ stage: "sending", done, total }),
      onWait: (secs, _n, kind) => {
        setBulkLink((b) => ({ ...b, waiting: secs, waitKind: kind }));
        setTimeout(() => setBulkLink((b) => (b?.stage === "sending" ? { ...b, waiting: 0 } : b)), secs * 1000);
      },
      shouldStop: () => stopLinkRef.current,
    });
    setBulkLink({ stage: "done", ...res, total: todo, alreadyDone: list.length - pending, left: pending - res.sent - res.failed });
  }

  async function sendLoginLink() {
    const r = newStudentResult;
    if (!r?.guardianNumbers?.length) return;
    setLinkSending(true);
    try {
      const channel = messageChannel(schoolSettings);
      const text = loginLinkSms({ schoolName, studentName: r.studentName, whatsapp: channel === "whatsapp" });
      await Promise.all(r.guardianNumbers.map((to) => sendSms(to, text, { channel })));
      setLinkSent(true);
    } catch (err) { setError("Could not send the login link: " + err.message); }
    setLinkSending(false);
  }

  async function handleTransferLookup() {
    setTransferLoading(true); setTransferError(""); setTransferFound(null);
    const code = transferCode.trim().toUpperCase();
    if (!code) { setTransferError("Enter a student code."); setTransferLoading(false); return; }
    try {
      // Server-side: this search spans every school, and permitting it from
      // the client meant permitting a blanket cross-school read of every child
      // on the platform. The endpoint returns only what a transfer needs.
      // See api/students/lookup.js.
      const st = await lookupStudentByCode(code);
      if (!st) {
        setTransferError(`No student found with code ${code}.`);
      } else {
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
    // A student enrolled before campuses existed has no campusId; they belong
    // to the main campus, which is what every other screen assumes too.
    const campusOf = s.campusId || primaryCampus?.id || "";
    const mcamp = campusFilter === "all" || campusOf === campusFilter;
    return ms && mc && mcamp;
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
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Btn variant="ghost" onClick={() => setBulkLink((() => {
            const all = loginLinkAudience(); const done = readSent();
            const todo = all.filter((r) => !done.has(r.to));
            return { stage: "confirm", total: todo.length, withPassword: todo.filter((r) => r.withPassword).length, skipped: all.length - todo.length };
          })())}>
            Send login link to all parents
          </Btn>
          <Btn variant="primary" onClick={() => setShowBulk(true)}>
            {IC.plus}<span style={{ marginLeft: 6 }}>Import from CSV</span>
          </Btn>
        </div>
      </div>

      {bulkLink && (
        <div className="alert alert--info" style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          {bulkLink.stage === "confirm" && (<>
            {(() => {
              const all = loginLinkAudience();
              const done = readSent();
              const skip = parseSkip(skipText);
              const todo = all.filter((r) => !done.has(r.to) && !skip.has(r.to));
              const known = new Set(all.map((r) => r.to));
              const unmatched = [...skip].filter((p) => !known.has(p));
              return (<>
                <span style={{ flex: "1 1 100%" }}>
                  Send the parent login link (parents.acalinks.com) to <strong>{todo.length}</strong> guardian numbers, in batches of {LINK_BATCH} with a 10-second pause between batches.
                  {" "}<strong>{todo.filter((r) => r.withPassword).length}</strong> of them also get their login phone and password.
                  {" "}Leaving out {all.length - todo.length} already sent or listed below.
                  {unmatched.length ? ` (${unmatched.length} listed number${unmatched.length === 1 ? "" : "s"} matched no guardian: ${unmatched.join(", ")}.)` : ""}
                </span>
                <textarea
                  value={skipText} onChange={(e) => setSkipText(e.target.value)} rows={3}
                  placeholder="Numbers to leave out this time, separated by commas"
                  style={{ flex: "1 1 100%", fontSize: 12, padding: 8, borderRadius: 8 }}
                />
                <Btn variant="gold" size="sm" disabled={!todo.length} onClick={sendLoginLinkToAll}>Yes, send</Btn>
              </>);
            })()}
            <Btn variant="ghost" size="sm" onClick={() => setBulkLink(null)}>Cancel</Btn>
          </>)}
          {bulkLink.stage === "sending" && (<>
            <span>
              Sending… {bulkLink.done} of {bulkLink.total}, in batches of {LINK_BATCH} with a short pause between. Keep this page open.
              {bulkLink.waiting ? (bulkLink.waitKind === "limit" ? ` WhatsApp asked us to slow down — pausing ${bulkLink.waiting}s then retrying.` : ` Pausing ${bulkLink.waiting}s before the next batch.`) : ""}
            </span>
            <Btn variant="ghost" size="sm" onClick={() => { stopLinkRef.current = true; }}>Stop</Btn>
          </>)}
          {bulkLink.stage === "done" && (<>
            <span>
              Sent to {bulkLink.sent} of {bulkLink.total} numbers
              {bulkLink.alreadyDone ? ` (${bulkLink.alreadyDone} had it from an earlier run)` : ""}
              {bulkLink.failed ? ` — ${bulkLink.failed} failed${bulkLink.failures?.[0]?.reason ? ` (${bulkLink.failures[0].reason})` : ""}` : ""}.
              {bulkLink.left > 0 && !bulkLink.stopped ? ` ${bulkLink.left} still to go — click the button again for the next batch.` : ""}
              {bulkLink.stopped === "limit" ? ` WhatsApp's new-conversation limit is on, so it stopped. ${bulkLink.retryAfter ? `WhatsApp says try again in about ${bulkLink.retryAfter >= 3600 ? Math.round(bulkLink.retryAfter / 3600) + " hour(s)" : Math.ceil(bulkLink.retryAfter / 60) + " minute(s)"}.` : "It didn't say how long."} Click the button again then and it carries on with the rest — nobody is messaged twice.` : ""}
              {bulkLink.stopped === "user" ? " Stopped. Click the button again to carry on with the rest." : ""}
            </span>
            <Btn variant="ghost" size="sm" onClick={() => setBulkLink(null)}>Close</Btn>
          </>)}
        </div>
      )}

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
            {multiCampus && (
              <select value={campusFilter} onChange={e => setCampusFilter(e.target.value)} className="field__select" style={{ width: "auto", minWidth: 160 }}>
                <option value="all">All Campuses</option>
                {activeCampuses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            )}
          </div>

          {moveSuccess && (
            <div className="alert alert--success">{IC.check}<span>{moveSuccess}</span></div>
          )}

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
                      <th>Student</th><th>Code</th><th>Class</th>
                      {multiCampus && <th>Campus</th>}
                      <th>Guardian</th><th>Status</th>
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
                        {multiCampus && (
                          <td style={{ fontSize: 13, color: "var(--text2)" }} data-label="Campus">
                            {campusLabel(campuses, s.campusId || primaryCampus?.id || "")}
                          </td>
                        )}
                        <td data-label="Guardian">
                          <div style={{ fontSize: 12, color: "var(--text2)" }}>{s.guardianName || "—"}</div>
                          <div style={{ fontSize: 11, color: "var(--text3)" }}>{s.guardianPhone || ""}</div>
                        </td>
                        <td data-label="Status">
                          <StatusPill active={s.status !== "suspended"} />
                          {isLinkPending(s) && (
                            <div
                              title="The guardian has not yet confirmed this child in the app, so they cannot see the records."
                              style={{
                                marginTop: 4, fontSize: 10, fontWeight: 700, letterSpacing: 0.4,
                                textTransform: "uppercase", color: "#b45309",
                                background: "rgba(232,168,0,0.14)", borderRadius: 6,
                                padding: "2px 6px", display: "inline-block",
                              }}
                            >
                              Awaiting guardian
                            </div>
                          )}
                        </td>
                        <td data-label="Actions">
                          <div className="data-table__actions" style={{ display: "flex", justifyContent: "flex-end", gap: 2 }}>
                            <ActionBtn onClick={() => setShowDetail(s)} icon={IC.eye} title="View profile" />
                            {multiCampus && (
                              <ActionBtn
                                onClick={() => {
                                  setMovingStudent(s); setMoveTo(""); setMoveReason("");
                                  setMoveError(""); setMoveSuccess("");
                                }}
                                icon={IC.transfer}
                                title="Request a move to another campus"
                                hoverBg="rgba(251,191,36,0.12)"
                              />
                            )}
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

              {/* What happened to the guardian's account — the clerk needs to
                  know whether credentials went out or a confirmation is owed,
                  because the two produce very different phone calls later. */}
              {newStudentResult.link && (
                <div
                  className={`alert alert--${newStudentResult.link.isNewGuardian ? "info" : "warning"}`}
                  style={{ marginBottom: 16, textAlign: "left" }}
                >
                  {newStudentResult.link.isNewGuardian ? IC.info : IC.warning}
                  <span>
                    {newStudentResult.link.isNewGuardian ? (
                      <>
                        New guardian account created for {newStudentResult.guardianPhone}.
                        Their password has been sent — it covers every child they enrol,
                        at any school.
                      </>
                    ) : (
                      <>
                        This number already belongs to a guardian with{" "}
                        {newStudentResult.link.siblingCount} child
                        {newStudentResult.link.siblingCount === 1 ? "" : "ren"} on ACALink
                        {newStudentResult.link.guardianName ? ` (${newStudentResult.link.guardianName})` : ""}.
                        No new password was issued. The student stays hidden until the
                        guardian confirms in the app. <strong>If that is not the right
                        guardian, remove this student and check the number.</strong>
                      </>
                    )}
                  </span>
                </div>
              )}

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

              {newStudentResult.guardianNumbers?.length > 0 && (
                <div style={{ marginBottom: 8 }}>
                  <Btn variant="ghost" disabled={linkSending || linkSent} onClick={sendLoginLink}>
                    {linkSent ? "Login link sent" : linkSending ? "Sending…" : "Send login link (parents.acalinks.com)"}
                  </Btn>
                  <p style={{ fontSize: 11, color: "var(--text3)", marginTop: 6 }}>
                    Sends the parent login link to every guardian listed for this student.
                  </p>
                </div>
              )}

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
                <div className="grid-2" style={{ marginTop: 16 }}>
                  <Input label="Second Guardian Name (optional)" value={regForm.guardian2Name} onChange={e => setRegForm(p => ({...p, guardian2Name: e.target.value}))} placeholder="Mary Banda" />
                  <Input label="Second Guardian Phone" value={regForm.guardian2Phone} onChange={e => setRegForm(p => ({...p, guardian2Phone: e.target.value}))} placeholder="09xxxxxxxx" />
                  <Input label="Second Guardian Relationship" value={regForm.guardian2Relation} onChange={e => setRegForm(p => ({...p, guardian2Relation: e.target.value}))} placeholder="Mother / Uncle…" />
                </div>
                <p style={{ fontSize: 11, color: "var(--text3)", marginTop: 4 }}>
                  Every guardian listed receives the school's WhatsApp messages about this child.
                </p>
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
                  {multiCampus && (
                    <>
                      <Select
                        label="Campus"
                        required
                        value={enrolCampusId}
                        onChange={e => setRegForm(p => ({ ...p, campusId: e.target.value }))}
                      >
                        {activeCampuses.map(c => (
                          <option key={c.id} value={c.id}>{c.name}{c.isPrimary ? " (main)" : ""}</option>
                        ))}
                      </Select>
                      <p style={{ fontSize: 11, color: "var(--text3)", margin: "-8px 0 12px" }}>
                        Get this right now. Moving a student to another campus afterwards needs an
                        approved transfer, and clears their class placement.
                      </p>
                    </>
                  )}
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

      {/* ── Bulk import ── */}
      {showBulk && (
        <BulkImportModal
          title="Import students from a spreadsheet"
          noun="student"
          columns={STUDENT_COLUMNS}
          sample={STUDENT_SAMPLE}
          templateName="acalink-students-template.csv"
          previewColumns={[
            { label: "Name",     get: (r) => r.data.fullName },
            { label: "Class",    get: (r) => r.data.className },
            { label: "Guardians", get: (r) => (r.data.guardians || []).map((g) => g.name).join(", ") },
            { label: "Phones",    get: (r) => (r.data.guardians || []).map((g) => g.phone).join(", ") },
          ]}
          onValidate={(rows) =>
            validateStudentRows({ rows, classes, existingStudents: students })
          }
          onImport={(validated, onProgress) =>
            importStudents({
              rows: validated,
              schoolCode, schoolName,
              sendSms: (to, message) => sendSms(to, message, { channel: messageChannel(schoolSettings) }),
              appUrl: APP_URL, onProgress,
              whatsapp: messageChannel(schoolSettings) === "whatsapp",
            })
          }
          renderResult={(res) => (
            <div className="space-y-3">
              <div className="alert alert--success">
                {IC.check}
                <span>
                  {res.created} student{res.created === 1 ? "" : "s"} enrolled across{" "}
                  {res.families} guardian account{res.families === 1 ? "" : "s"}.
                </span>
              </div>
              {res.pending > 0 && (
                <div className="alert alert--warning">
                  {IC.warning}
                  <span>
                    {res.pending} of them joined a guardian who was already on ACALink.
                    Those records stay hidden until the guardian confirms in the app —
                    they show as <strong>Awaiting guardian</strong> in the list.
                  </span>
                </div>
              )}
              {res.failed.length > 0 && (
                <div className="alert alert--error">
                  {IC.warning}
                  <span>
                    {res.failed.length} row{res.failed.length === 1 ? "" : "s"} failed to
                    save: lines {res.failed.map((f) => f.line).join(", ")}. Nothing else
                    was affected — re-upload just those rows.
                  </span>
                </div>
              )}
            </div>
          )}
          onClose={() => setShowBulk(false)}
          onDone={() => fetchStudents()}
        />
      )}

      {/* ── Request a move to another campus ──
          A request, not a move. Nothing about the student changes here — the
          decision belongs to whoever has sight of both campuses, and the
          consequence (a cleared class placement) is stated before it is made
          rather than discovered afterwards by the receiving campus. */}
      {movingStudent && (
        <Modal title="Move to another campus" onClose={() => setMovingStudent(null)} size="md">
          <div className="space-y-4">
            {moveError && <div className="alert alert--error">{IC.warning}<span>{moveError}</span></div>}

            <div className="alert alert--info">
              {IC.transfer}
              <div>
                <p style={{ fontWeight: 600, fontSize: 13, marginBottom: 3 }}>
                  {movingStudent.fullName} stays on {campusLabel(campuses, movingStudent.campusId || primaryCampus?.id || "")} until this is approved.
                </p>
                <p style={{ fontSize: 12 }}>
                  On approval their class placement is cleared, because class names repeat across
                  campuses — the receiving campus places them.
                </p>
              </div>
            </div>

            <Select label="Move to" required value={moveTo} onChange={e => setMoveTo(e.target.value)}>
              <option value="">Select campus…</option>
              {activeCampuses
                .filter(c => c.id !== (movingStudent.campusId || primaryCampus?.id))
                .map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>

            <Input
              label="Reason"
              value={moveReason}
              onChange={e => setMoveReason(e.target.value)}
              placeholder="Family has moved to Zomba"
            />

            <div className="data-table__actions" style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <Btn variant="ghost" onClick={() => setMovingStudent(null)}>Cancel</Btn>
              <Btn variant="accent" disabled={!moveTo} onClick={submitCampusMove}>Request transfer</Btn>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}