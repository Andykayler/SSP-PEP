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

function Spinner({ size = 20 }) {
  return <Loader2 size={size} className="animate-spin text-[#0F2044]/40 inline-block" />;
}

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

// ─── Component ───────────────────────────────────────────────────────────────

export default function Studentmodule({ userId, schoolCode }) {
  const [students,      setStudents]      = useState([]);
  const [classes,       setClasses]       = useState([]);
  const [filterClassId, setFilterClassId] = useState("");
  const [searchTerm,    setSearchTerm]    = useState("");
  const [viewStudent,   setViewStudent]   = useState(null);
  const [error,         setError]         = useState("");

  // Unified loading state — true until BOTH classes and students are resolved
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
      setStudentsReady(false); // reset students too; we'll refetch once classId is set
      setClasses([]);
      setError("");

      try {
        // 1a. Fetch assigned class names from user profile
        const userSnap = await getDoc(doc(db, "users", userId));
        if (cancelled) return;

        const assignedNames = userSnap.exists()
          ? userSnap.data().assignedClasses ?? []
          : [];

        if (assignedNames.length === 0) {
          setClasses([]);
          setClassesReady(true);
          setStudentsReady(true); // nothing to fetch
          return;
        }

        // 1b. Resolve names → school_classes documents
        const snap = await getDocs(
          query(collection(db, "school_classes"), where("schoolCode", "==", schoolCode))
        );
        if (cancelled) return;

        const myClasses = snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .filter((c) => assignedNames.includes(c.name));

        setClasses(myClasses);
        setClassesReady(true);

        // Set default selected class (triggers student fetch via separate effect)
        if (myClasses.length > 0) {
          setFilterClassId(myClasses[0].id);
        } else {
          // No matching classes — nothing more to load
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

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2
            className="text-3xl font-bold text-[#0F2044]"
            style={{ fontFamily: "'Playfair Display', serif" }}
          >
            My Students
          </h2>
          <p className="text-[#0F2044]/60 mt-1">
            {isLoading
              ? "Loading your assignments…"
              : noAssignment
              ? "No classes assigned yet"
              : `${classes.map((c) => c.name).join(" · ")} · ${filtered.length} student${filtered.length !== 1 ? "s" : ""} shown`}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={fetchStudents}
            disabled={isLoading}
            className="p-2.5 bg-white border border-[#0F2044]/10 rounded-xl hover:bg-[#F7F5F0] transition-colors text-[#0F2044]/60 disabled:opacity-40 disabled:cursor-not-allowed"
            title="Refresh"
          >
            <RefreshCw size={16} />
          </button>
        
        </div>
      </div>

      {/* ── No assignments warning ─────────────────────────────────────────── */}
      {noAssignment && (
        <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 text-amber-800 p-4 rounded-2xl text-sm">
          <AlertCircle size={16} className="shrink-0 mt-0.5" />
          No classes have been assigned to you yet. Ask your head teacher to assign
          classes from the Staff Management page.
        </div>
      )}

      {/* ── Error ─────────────────────────────────────────────────────────── */}
      {error && (
        <div className="flex items-start gap-3 bg-red-50 border border-red-200 text-red-700 p-4 rounded-2xl text-sm">
          <AlertCircle size={16} className="shrink-0 mt-0.5" />
          {error}
        </div>
      )}

      {/* ── Filters (only shown when classes exist) ────────────────────────── */}
      {!noAssignment && (
        <div className="bg-white rounded-3xl p-5 border border-[#0F2044]/8 flex flex-col md:flex-row gap-4">
          {/* Search */}
          <div className="flex-1 relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-[#0F2044]/40 w-4 h-4" />
            <input
              type="text"
              placeholder="Search by name or student code…"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-11 pr-4 py-3 bg-[#FAFAF8] border border-[#0F2044]/10 rounded-2xl text-sm focus:outline-none focus:border-[#0F2044]/30"
            />
          </div>

          {/* Class selector */}
          <div className="relative">
            <select
              value={filterClassId}
              onChange={(e) => setFilterClassId(e.target.value)}
              disabled={isLoading || classes.length === 0}
              className="appearance-none pl-4 pr-10 py-3 bg-white border border-[#0F2044]/15 rounded-2xl text-sm focus:outline-none focus:border-[#0F2044]/40 text-[#0F2044] min-w-[160px] disabled:opacity-50"
            >
              {classes.length === 0 && <option value="">No classes</option>}
              {classes.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#0F2044]/40 pointer-events-none" />
          </div>

          {/* Export */}
          <button
            onClick={handleExport}
            disabled={filtered.length === 0 || isLoading}
            className="flex items-center gap-2 px-5 py-3 border border-[#0F2044]/20 hover:border-[#0F2044] rounded-2xl text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Download size={15} /> Export CSV
          </button>
        </div>
      )}

      {/* ── Table ─────────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-3xl border border-[#0F2044]/8 overflow-hidden">
        {isLoading ? (
          <div className="py-24 flex flex-col items-center gap-3 text-[#0F2044]/40">
            <Spinner size={28} />
            <p className="text-sm">Loading students…</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-24 flex flex-col items-center gap-3 text-[#0F2044]/30">
            <Users size={36} />
            <p className="text-sm font-medium text-[#0F2044]/40">
              {students.length === 0
                ? `No students enrolled in ${selectedClass?.name || "this class"} yet.`
                : "No students match your search."}
            </p>
          </div>
        ) : (
          <table className="w-full">
            <thead className="bg-[#F7F5F0] border-b border-[#0F2044]/8">
              <tr>
                {[
                  ["Student",      "text-left",   ""],
                  ["Student Code", "text-left",   "hidden md:table-cell"],
                  ["Gender",       "text-center", "hidden sm:table-cell"],
                  ["Guardian",     "text-left",   "hidden lg:table-cell"],
                  ["Status",       "text-center", "hidden lg:table-cell"],
                  ["Actions",      "text-center", ""],
                ].map(([label, align, hidden]) => (
                  <th
                    key={label}
                    className={`px-6 py-4 ${align} text-[10px] font-bold tracking-widest uppercase text-[#0F2044]/40 ${hidden}`}
                  >
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#0F2044]/5">
              {filtered.map((student) => {
                const name      = fullName(student);
                const isFemale  = student.gender === "Female";
                const suspended = student.status === "suspended";

                return (
                  <tr key={student.id} className="hover:bg-[#FAFAF8] transition-colors">
                    {/* Name + avatar */}
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-xs font-bold flex-shrink-0 ${isFemale ? "bg-pink-100 text-pink-700" : "bg-blue-100 text-blue-700"}`}>
                          {initials(name)}
                        </div>
                        <div>
                          <div className="text-sm font-semibold text-[#0F2044]">{name}</div>
                          <div className="text-xs text-[#0F2044]/40">{student.dob || "—"}</div>
                        </div>
                      </div>
                    </td>

                    {/* Student code */}
                    <td className="px-6 py-4 hidden md:table-cell">
                      <span className="font-mono text-xs font-bold text-[#0F2044]/70 bg-[#F7F5F0] px-2.5 py-1 rounded-lg border border-[#0F2044]/10 tracking-widest">
                        {student.studentCode}
                      </span>
                    </td>

                    {/* Gender */}
                    <td className="px-6 py-4 text-center hidden sm:table-cell">
                      <span className={`text-xs font-medium px-2.5 py-1 rounded-lg ${isFemale ? "bg-pink-50 text-pink-700" : "bg-blue-50 text-blue-700"}`}>
                        {student.gender || "—"}
                      </span>
                    </td>

                    {/* Guardian */}
                    <td className="px-6 py-4 hidden lg:table-cell">
                      <div className="text-xs text-[#0F2044]/70 font-medium">{student.guardianName || "—"}</div>
                      <div className="text-xs text-[#0F2044]/40">{student.guardianPhone || ""}</div>
                    </td>

                    {/* Status */}
                    <td className="px-6 py-4 text-center hidden lg:table-cell">
                      <span className={`text-xs font-semibold px-2.5 py-1 rounded-lg ${suspended ? "bg-red-100 text-red-700" : "bg-emerald-100 text-emerald-700"}`}>
                        {suspended ? "Suspended" : "Active"}
                      </span>
                    </td>

                    {/* Actions */}
                    <td className="px-6 py-4">
                      <div className="flex justify-center gap-2">
                        <button
                          onClick={() => setViewStudent(student)}
                          className="flex items-center gap-1 text-xs bg-[#0F2044]/5 hover:bg-[#0F2044]/10 text-[#0F2044]/70 hover:text-[#0F2044] px-3 py-2 rounded-xl transition-colors"
                        >
                          <TrendingUp size={13} /> View
                        </button>
                        <button
                          className="flex items-center gap-1 text-xs bg-amber-50 hover:bg-amber-100 text-amber-700 px-3 py-2 rounded-xl transition-colors"
                          title="Marks — coming soon"
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
        )}
      </div>

      <p className="text-center text-xs text-[#0F2044]/40 pt-1">
        Showing students enrolled in your assigned classes only. To enrol or transfer
        a student, contact the School Administrator.
      </p>

      {/* ── Student detail modal ───────────────────────────────────────────── */}
      {viewStudent && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={(e) => e.target === e.currentTarget && setViewStudent(null)}
        >
          <div className="bg-white rounded-3xl w-full max-w-md overflow-hidden shadow-2xl">
            {/* Modal header */}
            <div className="bg-[#0F2044] px-7 py-5 flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-sm font-bold ${viewStudent.gender === "Female" ? "bg-pink-200 text-pink-800" : "bg-blue-200 text-blue-800"}`}>
                  {initials(fullName(viewStudent))}
                </div>
                <div>
                  <h3 className="text-white font-bold text-lg leading-tight">
                    {fullName(viewStudent)}
                  </h3>
                  <p className="text-white/50 text-xs mt-0.5">
                    {viewStudent.className} · {viewStudent.gender}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setViewStudent(null)}
                className="text-white/50 hover:text-white transition-colors p-1"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-7 space-y-5">
              {/* Student code + status */}
              <div className="flex items-center justify-between p-4 bg-[#F7F5F0] rounded-2xl border border-[#0F2044]/8">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-[#0F2044]/40 mb-1">
                    Student Code
                  </p>
                  <span className="font-mono text-sm font-bold text-[#0F2044] tracking-widest">
                    {viewStudent.studentCode}
                  </span>
                </div>
                <span className={`text-xs font-semibold px-3 py-1.5 rounded-xl ${viewStudent.status === "suspended" ? "bg-red-100 text-red-700" : "bg-emerald-100 text-emerald-700"}`}>
                  {viewStudent.status === "suspended" ? "Suspended" : "Active"}
                </span>
              </div>

              {/* Details grid */}
              <div className="grid grid-cols-2 gap-px bg-[#0F2044]/5 rounded-2xl overflow-hidden text-sm">
                {[
                  ["Date of Birth", viewStudent.dob        || "—"],
                  ["District",      viewStudent.district   || "—"],
                  ["Village",       viewStudent.village    || "—"],
                  ["National ID",   viewStudent.nationalId || "—"],
                ].map(([k, v]) => (
                  <div key={k} className="bg-white px-4 py-3">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-[#0F2044]/40 mb-0.5">{k}</p>
                    <p className="font-medium text-[#0F2044]">{v}</p>
                  </div>
                ))}
              </div>

              {/* Guardian */}
              <div className="p-4 bg-[#F7F5F0] rounded-2xl border border-[#0F2044]/8 space-y-1">
                <p className="text-[10px] font-bold uppercase tracking-widest text-[#0F2044]/40">
                  Guardian / Parent
                </p>
                <p className="text-sm font-semibold text-[#0F2044]">
                  {viewStudent.guardianName || "—"}
                </p>
                <p className="text-xs text-[#0F2044]/50">
                  {viewStudent.guardianRelation || "Parent/Guardian"} · {viewStudent.guardianPhone || "—"}
                </p>
              </div>

              <div className="flex justify-end pt-1">
                <button
                  onClick={() => setViewStudent(null)}
                  className="px-6 py-2.5 border border-[#0F2044]/15 rounded-xl hover:bg-[#F7F5F0] text-sm font-medium transition-colors text-[#0F2044]/70"
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