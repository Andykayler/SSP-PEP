import { useState, useEffect } from "react";
import { db } from "../../../firebase";
import {
  collection, query, where, getDocs, doc, updateDoc, serverTimestamp,
} from "firebase/firestore";
import {
  BookOpen,
  Eye,
  X,
  Check,
  LayoutGrid,
  Search,
  RefreshCw,
} from "lucide-react";

function initials(name = "") {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");
}

function Spinner() {
  return (
    <svg className="animate-spin w-5 h-5 text-app-text/40" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

function Tag({ label, color = "bg-app-primary/8 text-app-text/70" }) {
  return (
    <span className={`inline-block px-2.5 py-0.5 rounded-lg text-xs font-medium border border-app-border ${color}`}>
      {label}
    </span>
  );
}

function StatusPill({ status = "active" }) {
  const isActive = status === "active";
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold
        ${isActive ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${isActive ? "bg-emerald-500" : "bg-red-400"}`} />
      {isActive ? "Active" : "Suspended"}
    </span>
  );
}

function CheckboxGroup({ items, selected = [], onChange }) {
  const toggle = (item) => {
    if (selected.includes(item)) {
      onChange(selected.filter((x) => x !== item));
    } else {
      onChange([...selected, item]);
    }
  };

  if (items.length === 0) {
    return (
      <p className="text-center text-app-text/40 py-8 italic">Nothing available to assign</p>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3 max-h-96 overflow-y-auto pr-2 py-1">
      {items.map((item) => {
        const isSelected = selected.includes(item);
        return (
          <label
            key={item}
            className={`flex items-center gap-3 px-4 py-3.5 rounded-2xl border cursor-pointer transition-all select-none
              ${isSelected
                ? "border-[#0F2044] bg-app-primary/5 text-app-text font-medium"
                : "border-app-border hover:border-[#0F2044]/30 hover:bg-app-bg text-app-text/70"
              }`}
          >
            <input
              type="checkbox"
              checked={isSelected}
              onChange={() => toggle(item)}
              className="w-5 h-5 accent-[#0F2044] cursor-pointer"
            />
            <span className="text-sm">{item}</span>
          </label>
        );
      })}
    </div>
  );
}

function AssignModal({ member, allClasses, onSave, onClose }) {
  const [assignedClasses, setAssignedClasses] = useState(member.assignedClasses || []);
  const [assignedSubjects, setAssignedSubjects] = useState(member.assignedSubjects || []);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [activeTab, setActiveTab] = useState("classes");

  const allSubjects = [...new Set(allClasses.flatMap((c) => c.subjects || []))];

  const handleSave = async () => {
    setSaving(true);
    setSaveError("");
    try {
      await onSave(member.id, assignedClasses, assignedSubjects);
      onClose();
    } catch (err) {
      console.error("Save error:", err);
      if (err.code === "permission-denied") {
        setSaveError(
          "Permission denied. Check that your Firestore security rules allow this role to update assignments."
        );
      } else {
        setSaveError("Failed to save assignments. Please try again.");
      }
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-app-surface rounded-3xl w-full max-w-2xl shadow-2xl overflow-hidden">
        <div className="bg-app-primary px-8 py-6 flex items-center justify-between">
          <div>
            <h3 className="text-white font-bold text-xl">Assign Classes & Subjects</h3>
            <p className="text-white/70 mt-1">{member.name}</p>
          </div>
          <button onClick={onClose} className="text-white/60 hover:text-white transition-colors">
            <X size={28} />
          </button>
        </div>

        <div className="flex border-b border-app-border">
          <button
            onClick={() => setActiveTab("classes")}
            className={`flex-1 py-4 text-sm font-semibold transition-colors ${
              activeTab === "classes"
                ? "border-b-4 border-[#0F2044] text-app-text"
                : "text-app-text/50 hover:text-app-text"
            }`}
          >
            Classes ({assignedClasses.length})
          </button>
          <button
            onClick={() => setActiveTab("subjects")}
            className={`flex-1 py-4 text-sm font-semibold transition-colors ${
              activeTab === "subjects"
                ? "border-b-4 border-[#0F2044] text-app-text"
                : "text-app-text/50 hover:text-app-text"
            }`}
          >
            Subjects ({assignedSubjects.length})
          </button>
        </div>

        <div className="p-8">
          {saveError && (
            <div className="mb-4 bg-red-50 border border-red-200 text-red-700 text-sm p-3 rounded-xl">
              {saveError}
            </div>
          )}
          {activeTab === "classes" ? (
            <div>
              <p className="text-sm text-app-text/60 mb-4">
                Select classes this staff member will be responsible for:
              </p>
              <CheckboxGroup
                items={allClasses.map((c) => c.name)}
                selected={assignedClasses}
                onChange={setAssignedClasses}
              />
            </div>
          ) : (
            <div>
              <p className="text-sm text-app-text/60 mb-4">
                Select subjects this staff member teaches:
              </p>
              <CheckboxGroup
                items={allSubjects}
                selected={assignedSubjects}
                onChange={setAssignedSubjects}
              />
            </div>
          )}
        </div>

        <div className="px-8 py-6 border-t flex gap-4">
          <button
            onClick={onClose}
            className="flex-1 py-3.5 border border-app-border rounded-2xl font-medium text-app-text/70 hover:bg-app-bg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 py-3.5 bg-app-warning hover:brightness-105 disabled:opacity-70 text-app-text font-bold rounded-2xl flex items-center justify-center gap-2 transition-all"
          >
            {saving ? <Spinner /> : <Check className="w-5 h-5" />}
            Save Assignments
          </button>
        </div>
      </div>
    </div>
  );
}

export default function StaffManagement({ schoolCode, schoolName = "Your School" }) {
  const [staff, setStaff] = useState([]);
  const [allClasses, setAllClasses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [activeTab, setActiveTab] = useState("staff");
  const [modal, setModal] = useState(null);

  useEffect(() => {
    if (schoolCode) {
      fetchAllData();
    } else {
      setError("School code is missing. Please sign out and sign back in.");
      setLoading(false);
    }
  }, [schoolCode]);

  async function fetchAllData() {
    setLoading(true);
    setError("");
    try {
      const staffSnap = await getDocs(
        query(
          collection(db, "users"),
          where("schoolCode", "==", schoolCode),
          where("role", "in", ["head_teacher", "class_teacher"])
        )
      );
      setStaff(staffSnap.docs.map((d) => ({ id: d.id, ...d.data() })));

      const classesSnap = await getDocs(
        query(collection(db, "school_classes"), where("schoolCode", "==", schoolCode))
      );
      setAllClasses(
        classesSnap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .sort((a, b) => (a.order || 0) - (b.order || 0))
      );
    } catch (err) {
      console.error("Fetch error:", err);
      if (err.code === "permission-denied") {
        setError("Permission denied loading staff data. Check your Firestore security rules.");
      } else {
        setError("Failed to load data. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  }

  const saveAssignments = async (userId, assignedClasses, assignedSubjects) => {
    await updateDoc(doc(db, "users", userId), {
      assignedClasses,
      assignedSubjects,
      updatedAt: serverTimestamp(),
    });
    setStaff((prev) =>
      prev.map((m) =>
        m.id === userId ? { ...m, assignedClasses, assignedSubjects } : m
      )
    );
  };

  const filteredStaff = staff.filter((m) => {
    const matchesSearch =
      !search ||
      m.name?.toLowerCase().includes(search.toLowerCase()) ||
      m.email?.toLowerCase().includes(search.toLowerCase());
    const matchesRole = roleFilter === "all" || m.role === roleFilter;
    return matchesSearch && matchesRole;
  });

  const stats = {
    total: staff.length,
    active: staff.filter((s) => s.status === "active").length,
    covered: new Set(staff.flatMap((s) => s.assignedClasses || [])).size,
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-app-text">Staff Management</h2>
          <p className="text-app-text/60">View staff and assign classes & subjects</p>
        </div>
        <button
          onClick={fetchAllData}
          className="flex items-center gap-2 px-5 py-2.5 bg-app-surface border border-app-border rounded-2xl hover:bg-app-bg transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total Staff", value: stats.total, color: "text-app-text" },
          { label: "Teachers", value: stats.total, color: "text-blue-600" },
          { label: "Active", value: stats.active, color: "text-emerald-600" },
          { label: "Forms Covered", value: stats.covered, color: "text-purple-600" },
        ].map((stat) => (
          <div key={stat.label} className="bg-app-surface rounded-2xl p-6 border border-app-border">
            <p className={`text-4xl font-bold ${stat.color}`}>{stat.value}</p>
            <p className="text-sm text-app-text/50 mt-1">{stat.label}</p>
          </div>
        ))}
      </div>

      <div className="flex bg-app-bg p-1 rounded-2xl w-fit">
        {["staff", "assignments"].map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-6 py-3 rounded-xl font-semibold transition-all ${
              activeTab === tab ? "bg-app-surface shadow-sm" : "text-app-text/60"
            }`}
          >
            {tab === "staff" ? "Staff List" : "Class Assignments"}
          </button>
        ))}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-2xl">{error}</div>
      )}
      {saveError && (
        <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-2xl">{saveError}</div>
      )}

      {activeTab === "staff" && (
        <>
          <div className="flex flex-wrap gap-2">
            {["all", "head_teacher", "class_teacher"].map((role) => (
              <button
                key={role}
                onClick={() => setRoleFilter(role)}
                className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                  roleFilter === role
                    ? "bg-app-primary text-white"
                    : "bg-app-surface border border-app-border text-app-text/70 hover:border-[#0F2044]/30"
                }`}
              >
                {role === "all" ? "All Staff" : role === "head_teacher" ? "Head Teachers" : "Class Teachers"}
                {" "}({role === "all" ? staff.length : staff.filter((s) => s.role === role).length})
              </button>
            ))}
          </div>

          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-app-text/40" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name or email..."
              className="w-full pl-12 pr-4 py-3.5 bg-app-surface border border-app-border rounded-2xl focus:border-[#0F2044]/40 outline-none"
            />
          </div>

          <div className="bg-app-surface rounded-3xl border border-app-border overflow-hidden">
            {loading ? (
              <div className="py-24 flex flex-col items-center gap-4">
                <Spinner />
                <p className="text-app-text/60">Loading staff...</p>
              </div>
            ) : filteredStaff.length === 0 ? (
              <div className="py-24 text-center text-app-text/50">No staff found</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b bg-app-bg">
                      <th className="px-6 py-5 text-left text-xs font-bold text-app-text/50">STAFF</th>
                      <th className="px-6 py-5 text-left text-xs font-bold text-app-text/50">ROLE</th>
                      <th className="px-6 py-5 text-left text-xs font-bold text-app-text/50">CLASSES</th>
                      <th className="px-6 py-5 text-left text-xs font-bold text-app-text/50">SUBJECTS</th>
                      <th className="px-6 py-5 text-left text-xs font-bold text-app-text/50">STATUS</th>
                      <th className="px-6 py-5 text-right text-xs font-bold text-app-text/50">ACTIONS</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#0F2044]/5">
                    {filteredStaff.map((member) => (
                      <tr key={member.id} className="hover:bg-app-bg/60 transition-colors">
                        <td className="px-6 py-5">
                          <div className="flex items-center gap-4">
                            <div className="w-10 h-10 bg-app-primary text-white rounded-2xl flex items-center justify-center font-bold text-sm">
                              {initials(member.name)}
                            </div>
                            <div>
                              <p className="font-semibold">{member.name}</p>
                              <p className="text-xs text-app-text/50">{member.email}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-5 text-sm">
                          {member.role === "head_teacher" ? "Head Teacher" : "Class Teacher"}
                        </td>
                        <td className="px-6 py-5">
                          {member.assignedClasses?.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {member.assignedClasses.map((c) => (
                                <Tag key={c} label={c} color="bg-blue-50 text-blue-700" />
                              ))}
                            </div>
                          ) : (
                            <span className="text-app-text/40">—</span>
                          )}
                        </td>
                        <td className="px-6 py-5">
                          {member.assignedSubjects?.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {member.assignedSubjects.slice(0, 3).map((s) => (
                                <Tag key={s} label={s} color="bg-emerald-50 text-emerald-700" />
                              ))}
                              {member.assignedSubjects.length > 3 && (
                                <Tag label={`+${member.assignedSubjects.length - 3}`} />
                              )}
                            </div>
                          ) : (
                            <span className="text-app-text/40">—</span>
                          )}
                        </td>
                        <td className="px-6 py-5">
                          <StatusPill status={member.status} />
                        </td>
                        <td className="px-6 py-5">
                          <div className="flex gap-2 justify-end">
                            <button
                              onClick={() => setModal({ mode: "view", member })}
                              className="p-2 hover:bg-app-bg rounded-xl text-app-text/60 hover:text-app-text"
                              title="View"
                            >
                              <Eye size={20} />
                            </button>
                            <button
                              onClick={() => setModal({ mode: "assign", member })}
                              className="p-2 hover:bg-blue-50 rounded-xl text-app-text/60 hover:text-blue-600"
                              title="Assign classes & subjects"
                            >
                              <BookOpen size={20} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {activeTab === "assignments" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {loading ? (
            <div className="col-span-2 py-24 flex flex-col items-center gap-4">
              <Spinner />
              <p className="text-app-text/60">Loading classes...</p>
            </div>
          ) : allClasses.length === 0 ? (
            <div className="col-span-2 bg-app-surface rounded-3xl p-16 text-center border border-app-border">
              <LayoutGrid className="w-16 h-16 mx-auto text-app-text/20 mb-4" />
              <p className="text-xl font-semibold">No classes found</p>
              <p className="text-app-text/60 mt-2">Create classes in the Admin Dashboard first</p>
            </div>
          ) : (
            allClasses.map((cls) => {
              const assigned = staff.filter((t) => t.assignedClasses?.includes(cls.name));
              return (
                <div key={cls.id} className="bg-app-surface rounded-3xl border border-app-border overflow-hidden">
                  <div className="px-6 py-5 bg-app-bg border-b flex justify-between items-center">
                    <div>
                      <h3 className="font-bold text-lg">{cls.name}</h3>
                      <p className="text-xs text-app-text/50">{cls.subjects?.length || 0} subjects</p>
                    </div>
                    <span className="text-blue-600 font-semibold text-sm">
                      {assigned.length} teacher{assigned.length !== 1 ? "s" : ""}
                    </span>
                  </div>
                  <div className="p-6">
                    {assigned.length > 0 ? (
                      assigned.map((teacher) => (
                        <div
                          key={teacher.id}
                          className="flex items-center justify-between py-4 border-b last:border-0 group"
                        >
                          <div className="flex items-center gap-4">
                            <div className="w-9 h-9 bg-app-primary text-white rounded-2xl flex items-center justify-center text-sm font-bold">
                              {initials(teacher.name)}
                            </div>
                            <div>
                              <p className="font-medium">{teacher.name}</p>
                              <p className="text-xs text-app-text/50">
                                {teacher.assignedSubjects?.length || 0} subjects
                              </p>
                            </div>
                          </div>
                          <button
                            onClick={() => setModal({ mode: "assign", member: teacher })}
                            className="opacity-0 group-hover:opacity-100 p-2 hover:bg-blue-50 rounded-xl transition-all"
                            title="Edit assignments"
                          >
                            <BookOpen className="w-5 h-5 text-blue-600" />
                          </button>
                        </div>
                      ))
                    ) : (
                      <p className="text-center py-12 text-app-text/40 italic">
                        No teachers assigned yet
                      </p>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {modal?.mode === "assign" && (
        <AssignModal
          member={modal.member}
          allClasses={allClasses}
          onSave={saveAssignments}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}