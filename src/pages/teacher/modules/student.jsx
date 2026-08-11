import { useState, useEffect, useCallback } from "react";
import { db } from "../../../firebase";
import {
  collection, query, where, getDocs, doc, getDoc,
} from "firebase/firestore";
import {
  Users, Search, Download, TrendingUp, Award,
  RefreshCw, AlertCircle, Loader2, ChevronDown, X,
} from "lucide-react";

// ─── Helpers ────────────────────────────────────────────────────────────────

function initials(name = "") {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");
}

function fullName(s) {
  return s.fullName || `${s.firstName ?? ""} ${s.lastName ?? ""}`.trim() || "—";
}

// ─── shared inline style helpers ──────────────────────────────────────────────
const iconBtnStyle = {
  display: "flex", alignItems: "center", justifyContent: "center",
  width: 34, height: 34, padding: 0, background: "var(--surface)",
  border: "1px solid var(--border-color)", borderRadius: "var(--radius-md)",
  color: "var(--text-muted)", cursor: "pointer", flexShrink: 0,
  transition: "all var(--transition-base)",
};

const inputStyle = {
  padding: "11px 14px", borderRadius: "var(--radius-md)",
  border: "1px solid var(--border-color)", background: "var(--input-bg)",
  color: "var(--text-primary)", fontSize: 13, outline: "none",
  fontFamily: "var(--font-body)", boxSizing: "border-box",
};

const labelStyle = {
  fontFamily: "var(--font-mono)", fontSize: 9.5, letterSpacing: "1.5px",
  color: "var(--text-muted)", textTransform: "uppercase",
  marginBottom: 6, display: "block", fontWeight: 600,
};

function Spinner({ size = 20 }) {
  return <Loader2 size={size} style={{ animation: "spin 0.65s linear infinite", color: "var(--text-muted)" }} />;
}

const avatarStyle = (isFemale) => ({
  width: 36, height: 36, borderRadius: "var(--radius-md)", flexShrink: 0,
  display: "flex", alignItems: "center", justifyContent: "center",
  fontSize: 12, fontWeight: 700,
  background: isFemale ? "rgba(219,39,119,0.10)" : "var(--primary-pale)",
  color: isFemale ? "#be185d" : "var(--primary-light)",
});

// ─── Component ───────────────────────────────────────────────────────────────

export default function StudentModule({ userId, schoolCode }) {
  const [students,      setStudents]      = useState([]);
  const [classes,       setClasses]       = useState([]);
  const [filterClassId, setFilterClassId] = useState("");
  const [searchTerm,    setSearchTerm]    = useState("");
  const [viewStudent,   setViewStudent]   = useState(null);
  const [error,         setError]         = useState("");

  const [classesReady,  setClassesReady]  = useState(false);
  const [studentsReady, setStudentsReady] = useState(false);
  const isLoading    = !classesReady || !studentsReady;
  const noAssignment = classesReady && studentsReady && classes.length === 0;

  // ── Step 1 & 2: Load teacher's classes (user doc → resolve names → docs) ──
  useEffect(() => {
    if (!userId || !schoolCode) return;
    let cancelled = false;

    (async () => {
      setClassesReady(false);
      setStudentsReady(false);
      setClasses([]);
      setError("");

      try {
        const userSnap = await getDoc(doc(db, "users", userId));
        if (cancelled) return;

        const assignedNames = userSnap.exists()
          ? userSnap.data().assignedClasses ?? []
          : [];

        if (assignedNames.length === 0) {
          setClasses([]);
          setClassesReady(true);
          setStudentsReady(true);
          return;
        }

        const snap = await getDocs(
          query(collection(db, "school_classes"), where("schoolCode", "==", schoolCode))
        );
        if (cancelled) return;

        const myClasses = snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .filter((c) => assignedNames.includes(c.name));

        setClasses(myClasses);
        setClassesReady(true);

        if (myClasses.length > 0) {
          setFilterClassId(myClasses[0].id);
        } else {
          setStudentsReady(true);
        }
      } catch (err) {
        if (cancelled) return;
        console.error("Failed to load class assignments:", err);
        setError("Could not load your class assignments.");
        setClassesReady(true);
        setStudentsReady(true);
      }
    })();

    return () => { cancelled = true; };
  }, [userId, schoolCode]);

  // ── Step 3: Fetch students whenever the selected class changes ─────────────
  const fetchStudents = useCallback(async () => {
    if (!schoolCode || !filterClassId) return;

    setStudentsReady(false);
    setError("");

    try {
      const snap = await getDocs(
        query(
          collection(db, "students"),
          where("schoolCode", "==", schoolCode),
          where("classId",   "==", filterClassId)
        )
      );
      const list = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (a.lastName || "").localeCompare(b.lastName || ""));
      setStudents(list);
    } catch (err) {
      console.error("fetchStudents error:", err);
      setError(`Could not load students: ${err.message}`);
    } finally {
      setStudentsReady(true);
    }
  }, [schoolCode, filterClassId]);

  useEffect(() => {
    if (classesReady && filterClassId) fetchStudents();
  }, [fetchStudents, classesReady, filterClassId]);

  // ── Filtered list ─────────────────────────────────────────────────────────
  const filtered = students.filter((s) => {
    if (!searchTerm) return true;
    const q = searchTerm.toLowerCase();
    return (
      s.fullName?.toLowerCase().includes(q) ||
      s.firstName?.toLowerCase().includes(q) ||
      s.lastName?.toLowerCase().includes(q) ||
      s.studentCode?.toLowerCase().includes(q)
    );
  });

  const selectedClass = classes.find((c) => c.id === filterClassId);

  // ── CSV export ────────────────────────────────────────────────────────────
  function handleExport() {
    const rows = [
      ["Student Code", "Full Name", "Gender", "DOB", "Guardian", "Guardian Phone", "Status"],
      ...filtered.map((s) => [
        s.studentCode, fullName(s), s.gender, s.dob || "—",
        s.guardianName, s.guardianPhone, s.status,
      ]),
    ];
    const csv  = rows.map((r) => r.map((v) => `"${v ?? ""}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url  = URL.createObjectURL(blob);
    const a    = Object.assign(document.createElement("a"), {
      href: url, download: `${selectedClass?.name || "class"}_students.csv`,
    });
    a.click();
    URL.revokeObjectURL(url);
  }

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">

      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="module-title">My Students</h2>
          <p className="module-sub">
            {isLoading
              ? "Loading your assignments…"
              : noAssignment
              ? "No classes assigned yet"
              : `${classes.map((c) => c.name).join(" · ")} · ${filtered.length} student${filtered.length !== 1 ? "s" : ""} shown`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={fetchStudents} disabled={isLoading} style={{ ...iconBtnStyle, opacity: isLoading ? 0.4 : 1 }} title="Refresh">
            <RefreshCw size={16} />
          </button>
        </div>
      </div>

      {noAssignment && (
        <div className="alert alert--warning">
          <AlertCircle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
          No classes have been assigned to you yet. Ask your head teacher to assign classes from the Staff Management page.
        </div>
      )}

      {error && (
        <div className="alert alert--error">
          <AlertCircle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
          {error}
        </div>
      )}

      {/* ── Filters ── */}
      {!noAssignment && (
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="search-wrap" style={{ flex: 1 }}>
            <Search size={14} className="search-wrap__icon" />
            <input
              type="text"
              placeholder="Search by name or student code…"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="search-wrap__input"
            />
          </div>

          <div style={{ position: "relative", flexShrink: 0, minWidth: 160 }}>
            <select
              value={filterClassId}
              onChange={(e) => setFilterClassId(e.target.value)}
              disabled={isLoading || classes.length === 0}
              style={{ ...inputStyle, appearance: "none", paddingRight: 32, width: "100%", opacity: (isLoading || classes.length === 0) ? 0.5 : 1 }}
            >
              {classes.length === 0 && <option value="">No classes</option>}
              {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <ChevronDown size={13} style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)", pointerEvents: "none" }} />
          </div>

          <button
            onClick={handleExport}
            disabled={filtered.length === 0 || isLoading}
            style={{
              display: "flex", alignItems: "center", gap: 8, flexShrink: 0,
              padding: "0 20px", borderRadius: "var(--radius-md)",
              border: "1px solid var(--border-color)", background: "var(--surface)",
              color: "var(--text-secondary)", fontSize: 13, fontWeight: 500,
              cursor: (filtered.length === 0 || isLoading) ? "not-allowed" : "pointer",
              opacity: (filtered.length === 0 || isLoading) ? 0.4 : 1,
              transition: "all var(--transition-base)",
            }}
          >
            <Download size={15} /> Export CSV
          </button>
        </div>
      )}

      {/* ── Table ── */}
      <div className="cc">
        {isLoading ? (
          <div style={{ padding: "56px 20px", display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
            <div className="spinner" style={{ width: 28, height: 28, borderWidth: 3 }} />
            <p className="module-sub">Loading students…</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state__icon"><Users size={22} /></div>
            <div className="empty-state__title">
              {students.length === 0 ? "No students enrolled" : "No matches"}
            </div>
            <p className="empty-state__sub">
              {students.length === 0
                ? `No students enrolled in ${selectedClass?.name || "this class"} yet.`
                : "No students match your search."}
            </p>
          </div>
        ) : (
          <div className="cc__body" style={{ padding: 0, overflowX: "auto" }}>
            <table className="data-table data-table--stack" style={{ width: "100%" }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left", padding: "12px 20px" }}>Student</th>
                  <th style={{ textAlign: "left", padding: "12px" }} className="hidden md:table-cell">Student Code</th>
                  <th style={{ textAlign: "center", padding: "12px" }} className="hidden sm:table-cell">Gender</th>
                  <th style={{ textAlign: "left", padding: "12px" }} className="hidden lg:table-cell">Guardian</th>
                  <th style={{ textAlign: "center", padding: "12px" }} className="hidden lg:table-cell">Status</th>
                  <th style={{ textAlign: "center", padding: "12px" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((student) => {
                  const name      = fullName(student);
                  const isFemale  = student.gender === "Female";
                  const suspended = student.status === "suspended";

                  return (
                    <tr key={student.id}>
                      <td style={{ padding: "12px 20px" }} data-label="Student">
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <div style={avatarStyle(isFemale)}>{initials(name)}</div>
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>{name}</div>
                            <div style={{ fontSize: 10.5, color: "var(--text-muted)" }}>{student.dob || "—"}</div>
                          </div>
                        </div>
                      </td>

                      <td style={{ padding: 12 }} className="hidden md:table-cell" data-label="Student Code">
                        <span style={{
                          fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700,
                          color: "var(--text-secondary)", background: "var(--surface)",
                          padding: "4px 10px", borderRadius: "var(--radius-md)",
                          border: "1px solid var(--border-color)", letterSpacing: "0.5px",
                        }}>
                          {student.studentCode}
                        </span>
                      </td>

                      <td style={{ padding: 12, textAlign: "center" }} className="hidden sm:table-cell" data-label="Gender">
                        <span style={{
                          fontSize: 11, fontWeight: 600, padding: "4px 10px", borderRadius: "var(--radius-md)",
                          background: isFemale ? "rgba(219,39,119,0.08)" : "var(--primary-pale)",
                          color: isFemale ? "#be185d" : "var(--primary-light)",
                        }}>
                          {student.gender || "—"}
                        </span>
                      </td>

                      <td style={{ padding: 12 }} className="hidden lg:table-cell" data-label="Guardian">
                        <div style={{ fontSize: 11.5, color: "var(--text-secondary)", fontWeight: 500 }}>{student.guardianName || "—"}</div>
                        <div style={{ fontSize: 10.5, color: "var(--text-muted)" }}>{student.guardianPhone || ""}</div>
                      </td>

                      <td style={{ padding: 12, textAlign: "center" }} className="hidden lg:table-cell" data-label="Status">
                        <span className="status-pill" style={suspended
                          ? { background: "var(--danger-pale)", color: "var(--danger-light)", border: "1px solid rgba(239,68,68,0.2)" }
                          : { background: "var(--success-pale)", color: "var(--success-light)", border: "1px solid rgba(34,197,94,0.22)" }}>
                          <span className="status-pill__dot" /> {suspended ? "Suspended" : "Active"}
                        </span>
                      </td>

                      <td style={{ padding: 12, textAlign: "center" }} data-label="Actions">
                        <div style={{ display: "flex", justifyContent: "center", gap: 6 }}>
                          <button
                            onClick={() => setViewStudent(student)}
                            style={{
                              display: "flex", alignItems: "center", gap: 5, fontSize: 11.5, fontWeight: 500,
                              background: "var(--primary-pale)", color: "var(--primary-light)",
                              padding: "7px 12px", borderRadius: "var(--radius-md)", border: "none", cursor: "pointer",
                              transition: "all var(--transition-base)",
                            }}
                          >
                            <TrendingUp size={13} /> View
                          </button>
                          <button
                            title="Marks — see Performance"
                            style={{
                              display: "flex", alignItems: "center", gap: 5, fontSize: 11.5, fontWeight: 500,
                              background: "var(--warning-pale)", color: "var(--warning-light)",
                              padding: "7px 12px", borderRadius: "var(--radius-md)", border: "none", cursor: "pointer",
                              transition: "all var(--transition-base)",
                            }}
                          >
                            <Award size={13} /> Marks
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="module-sub" style={{ textAlign: "center" }}>
        Showing students enrolled in your assigned classes only. To enrol or transfer a student, contact the School Administrator.
      </p>

      {/* ── Student detail modal ── */}
      {viewStudent && (
        <div
          style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)",
            backdropFilter: "blur(4px)", WebkitBackdropFilter: "blur(4px)",
            display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, padding: 16,
          }}
          onClick={(e) => e.target === e.currentTarget && setViewStudent(null)}
        >
          <div style={{
            background: "var(--card-bg)", borderRadius: "var(--radius-xl)",
            width: "100%", maxWidth: 460, overflow: "hidden",
            boxShadow: "var(--shadow-lg)", border: "1px solid var(--border-strong)",
          }}>
            {/* Header */}
            <div style={{ background: "var(--hero-bg)", padding: "20px 26px", borderBottom: "1px solid var(--border-strong)", display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ ...avatarStyle(viewStudent.gender === "Female"), width: 46, height: 46, fontSize: 14 }}>
                  {initials(fullName(viewStudent))}
                </div>
                <div>
                  <h3 style={{ fontFamily: "var(--font-display)", fontSize: "1.1rem", color: "var(--text-primary)", lineHeight: 1.3 }}>
                    {fullName(viewStudent)}
                  </h3>
                  <p style={{ fontSize: 11.5, color: "var(--text-muted)", marginTop: 2 }}>
                    {viewStudent.className} · {viewStudent.gender}
                  </p>
                </div>
              </div>
              <button onClick={() => setViewStudent(null)} style={{ ...iconBtnStyle, background: "transparent", border: "none", flexShrink: 0 }}>
                <X size={18} />
              </button>
            </div>

            <div style={{ padding: 26, display: "flex", flexDirection: "column", gap: 18 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: 16, background: "var(--surface)", borderRadius: "var(--radius-md)", border: "1px solid var(--border-color)" }}>
                <div>
                  <p style={labelStyle}>Student Code</p>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 700, color: "var(--text-primary)", letterSpacing: "0.5px" }}>
                    {viewStudent.studentCode}
                  </span>
                </div>
                <span className="status-pill" style={viewStudent.status === "suspended"
                  ? { background: "var(--danger-pale)", color: "var(--danger-light)", border: "1px solid rgba(239,68,68,0.2)" }
                  : { background: "var(--success-pale)", color: "var(--success-light)", border: "1px solid rgba(34,197,94,0.22)" }}>
                  <span className="status-pill__dot" /> {viewStudent.status === "suspended" ? "Suspended" : "Active"}
                </span>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1, background: "var(--primary-dim)", borderRadius: "var(--radius-md)", overflow: "hidden" }}>
                {[
                  ["Date of Birth", viewStudent.dob        || "—"],
                  ["District",      viewStudent.district   || "—"],
                  ["Village",       viewStudent.village    || "—"],
                  ["National ID",   viewStudent.nationalId || "—"],
                ].map(([k, v]) => (
                  <div key={k} style={{ background: "var(--card-bg)", padding: "12px 16px" }}>
                    <p style={{ fontSize: 9.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: "1px", color: "var(--text-muted)", marginBottom: 2, fontFamily: "var(--font-mono)" }}>{k}</p>
                    <p style={{ fontSize: 13, fontWeight: 500, color: "var(--text-primary)" }}>{v}</p>
                  </div>
                ))}
              </div>

              <div style={{ padding: 16, background: "var(--surface)", borderRadius: "var(--radius-md)", border: "1px solid var(--border-color)" }}>
                <p style={labelStyle}>Guardian / Parent</p>
                <p style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>{viewStudent.guardianName || "—"}</p>
                <p style={{ fontSize: 11.5, color: "var(--text-muted)", marginTop: 2 }}>
                  {viewStudent.guardianRelation || "Parent/Guardian"} · {viewStudent.guardianPhone || "—"}
                </p>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <button
                  onClick={() => setViewStudent(null)}
                  style={{
                    padding: "10px 24px", borderRadius: "var(--radius-md)",
                    background: "var(--bg-primary)", border: "1px solid var(--border-color)",
                    color: "var(--text-secondary)", fontSize: 13, fontWeight: 500, cursor: "pointer",
                    transition: "all var(--transition-base)",
                  }}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}