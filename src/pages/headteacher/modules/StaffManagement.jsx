// modules/StaffManagement.jsx
import { useState } from "react";
import { UserPlus, Edit2, Trash2, Eye, BookOpen, X, Check } from "lucide-react";

const FORMS = ["Form 1", "Form 2", "Form 3", "Form 4"];
const SUBJECTS = [
  "Mathematics", "Physics", "Chemistry", "Biology",
  "English", "History", "Geography", "Chichewa",
  "Computer Studies", "Religious Education",
];
const DEPARTMENTS = ["Sciences", "Languages", "Humanities", "Administration"];

const initialStaff = [
  {
    id: "T001",
    name: "Mr. Martin Khumbata",
    role: "Mathematics & Physics Teacher",
    department: "Sciences",
    phone: "0999123456",
    email: "martin.khumbata@school.mw",
    status: "Active",
    joinDate: "2023-01-15",
    subjects: ["Mathematics", "Physics"],
    classes: ["Form 3", "Form 4"],
  },
  {
    id: "T002",
    name: "Mrs. Esther Chirwa",
    role: "English Teacher",
    department: "Languages",
    phone: "0888456789",
    email: "esther.chirwa@school.mw",
    status: "Active",
    joinDate: "2022-09-01",
    subjects: ["English"],
    classes: ["Form 1", "Form 2", "Form 3", "Form 4"],
  },
  {
    id: "T003",
    name: "Mr. Patrick Banda",
    role: "Chemistry Teacher",
    department: "Sciences",
    phone: "0999876543",
    email: "patrick.banda@school.mw",
    status: "Active",
    joinDate: "2024-01-10",
    subjects: ["Chemistry"],
    classes: ["Form 3", "Form 4"],
  },
  {
    id: "S001",
    name: "Mrs. Grace Manda",
    role: "Boarding Matron",
    department: "Administration",
    phone: "0999765432",
    email: "grace.manda@school.mw",
    status: "Active",
    joinDate: "2021-06-01",
    subjects: [],
    classes: [],
  },
  {
    id: "T004",
    name: "Mr. Joseph Phiri",
    role: "History Teacher",
    department: "Humanities",
    phone: "0888123456",
    email: "joseph.phiri@school.mw",
    status: "On Leave",
    joinDate: "2023-03-20",
    subjects: ["History"],
    classes: ["Form 2", "Form 3"],
  },
];

const emptyForm = {
  name: "",
  role: "",
  department: "Sciences",
  phone: "",
  email: "",
  status: "Active",
  subjects: [],
  classes: [],
};

// ─── Sub-components ──────────────────────────────────────────────────────────

function StatusBadge({ status }) {
  const isActive = status === "Active";
  return (
    <span
      className={`inline-block px-4 py-1 rounded-full text-xs font-medium
        ${isActive ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}
    >
      {status}
    </span>
  );
}

function ClassTag({ label }) {
  return (
    <span className="inline-block px-2 py-0.5 rounded text-xs bg-[#0F2044]/8 text-[#0F2044]/70 border border-[#0F2044]/10 mr-1 mb-1">
      {label}
    </span>
  );
}

function CheckboxGrid({ items, selected, onChange, columns = 3 }) {
  const toggle = (item) =>
    onChange(
      selected.includes(item) ? selected.filter((x) => x !== item) : [...selected, item]
    );
  return (
    <div className={`grid gap-2`} style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` }}>
      {items.map((item) => {
        const checked = selected.includes(item);
        return (
          <label
            key={item}
            className={`flex items-center gap-2 px-3 py-2 rounded-xl border cursor-pointer text-sm transition-colors
              ${checked
                ? "border-[#0F2044] bg-[#0F2044]/5 text-[#0F2044] font-medium"
                : "border-[#0F2044]/10 text-[#0F2044]/70 hover:border-[#0F2044]/30"
              }`}
          >
            <div
              className={`w-4 h-4 rounded flex items-center justify-center flex-shrink-0
                ${checked ? "bg-[#0F2044]" : "border border-[#0F2044]/20 bg-white"}`}
            >
              {checked && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
            </div>
            <span className="leading-tight">{item}</span>
          </label>
        );
      })}
    </div>
  );
}

// ─── Assign Classes Modal ─────────────────────────────────────────────────────

function AssignClassesModal({ member, onSave, onClose }) {
  const [selected, setSelected] = useState(member.classes);

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-3xl w-full max-w-md p-8">
        <div className="flex items-start justify-between mb-1">
          <h3 className="text-xl font-bold text-[#0F2044]">Assign classes</h3>
          <button onClick={onClose} className="p-1 hover:bg-[#F7F5F0] rounded-xl">
            <X className="w-5 h-5 text-[#0F2044]/50" />
          </button>
        </div>
        <p className="text-sm text-[#0F2044]/50 mb-6">{member.name}</p>

        <CheckboxGrid items={FORMS} selected={selected} onChange={setSelected} columns={2} />

        <div className="flex gap-4 mt-8">
          <button
            onClick={onClose}
            className="flex-1 py-3.5 border border-[#0F2044]/20 rounded-2xl text-sm font-medium hover:bg-[#F7F5F0]"
          >
            Cancel
          </button>
          <button
            onClick={() => { onSave(selected); onClose(); }}
            className="flex-1 py-3.5 bg-[#0F2044] text-white rounded-2xl text-sm font-medium hover:bg-[#1a3060]"
          >
            Save assignments
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Add / Edit Staff Modal ───────────────────────────────────────────────────

function StaffModal({ member, onSave, onClose }) {
  const isEdit = !!member?.id;
  const [form, setForm] = useState(member || emptyForm);

  const set = (key, val) => setForm((f) => ({ ...f, [key]: val }));

  const handleSave = () => {
    if (!form.name.trim()) { alert("Full name is required."); return; }
    if (!form.role.trim()) { alert("Role is required."); return; }
    onSave(form);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl w-full max-w-lg p-8 my-4">
        <div className="flex items-start justify-between mb-6">
          <h3 className="text-xl font-bold text-[#0F2044]">
            {isEdit ? "Edit staff member" : "Add new staff member"}
          </h3>
          <button onClick={onClose} className="p-1 hover:bg-[#F7F5F0] rounded-xl">
            <X className="w-5 h-5 text-[#0F2044]/50" />
          </button>
        </div>

        <div className="space-y-5">
          {/* Name */}
          <div>
            <label className="text-xs text-[#0F2044]/50 block mb-1.5">Full name</label>
            <input
              type="text"
              className="w-full px-4 py-3 border border-[#0F2044]/10 rounded-xl focus:outline-none focus:border-[#0F2044]/40 text-sm"
              placeholder="e.g. Mrs. Mary Kamanga"
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
            />
          </div>

          {/* Role + Department */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-[#0F2044]/50 block mb-1.5">Role</label>
              <input
                type="text"
                className="w-full px-4 py-3 border border-[#0F2044]/10 rounded-xl focus:outline-none focus:border-[#0F2044]/40 text-sm"
                placeholder="e.g. Biology Teacher"
                value={form.role}
                onChange={(e) => set("role", e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs text-[#0F2044]/50 block mb-1.5">Department</label>
              <select
                className="w-full px-4 py-3 border border-[#0F2044]/10 rounded-xl focus:outline-none focus:border-[#0F2044]/40 text-sm bg-white"
                value={form.department}
                onChange={(e) => set("department", e.target.value)}
              >
                {DEPARTMENTS.map((d) => <option key={d}>{d}</option>)}
              </select>
            </div>
          </div>

          {/* Subjects */}
          <div>
            <label className="text-xs text-[#0F2044]/50 block mb-2">Subjects taught</label>
            <CheckboxGrid
              items={SUBJECTS}
              selected={form.subjects}
              onChange={(v) => set("subjects", v)}
              columns={3}
            />
          </div>

          {/* Classes */}
          <div>
            <label className="text-xs text-[#0F2044]/50 block mb-2">Classes assigned</label>
            <CheckboxGrid
              items={FORMS}
              selected={form.classes}
              onChange={(v) => set("classes", v)}
              columns={4}
            />
          </div>

          {/* Phone + Status */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-[#0F2044]/50 block mb-1.5">Phone number</label>
              <input
                type="tel"
                className="w-full px-4 py-3 border border-[#0F2044]/10 rounded-xl focus:outline-none focus:border-[#0F2044]/40 text-sm"
                placeholder="0999 123 456"
                value={form.phone}
                onChange={(e) => set("phone", e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs text-[#0F2044]/50 block mb-1.5">Status</label>
              <select
                className="w-full px-4 py-3 border border-[#0F2044]/10 rounded-xl focus:outline-none focus:border-[#0F2044]/40 text-sm bg-white"
                value={form.status}
                onChange={(e) => set("status", e.target.value)}
              >
                <option>Active</option>
                <option>On Leave</option>
              </select>
            </div>
          </div>
        </div>

        <div className="flex gap-4 mt-8">
          <button
            onClick={onClose}
            className="flex-1 py-3.5 border border-[#0F2044]/20 rounded-2xl text-sm font-medium hover:bg-[#F7F5F0]"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="flex-1 py-3.5 bg-[#0F2044] text-white rounded-2xl text-sm font-medium hover:bg-[#1a3060]"
          >
            {isEdit ? "Save changes" : "Add staff member"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── View Profile Modal ───────────────────────────────────────────────────────

function ViewModal({ member, onClose }) {
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-3xl w-full max-w-md p-8">
        <div className="flex items-start justify-between mb-6">
          <div>
            <h3 className="text-xl font-bold text-[#0F2044]">{member.name}</h3>
            <p className="text-sm text-[#0F2044]/50 mt-0.5">{member.id} • {member.department}</p>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-[#F7F5F0] rounded-xl">
            <X className="w-5 h-5 text-[#0F2044]/50" />
          </button>
        </div>

        <div className="space-y-4">
          <Row label="Role" value={member.role} />
          <Row label="Phone" value={member.phone} />
          <Row label="Email" value={member.email} />
          <Row label="Status" value={<StatusBadge status={member.status} />} />
          <Row label="Join date" value={member.joinDate} />
          {member.subjects.length > 0 && (
            <Row label="Subjects" value={member.subjects.join(", ")} />
          )}
          {member.classes.length > 0 && (
            <div>
              <p className="text-xs text-[#0F2044]/50 mb-1.5">Classes assigned</p>
              <div className="flex flex-wrap">
                {member.classes.map((c) => <ClassTag key={c} label={c} />)}
              </div>
            </div>
          )}
        </div>

        <button
          onClick={onClose}
          className="mt-8 w-full py-3.5 border border-[#0F2044]/20 rounded-2xl text-sm font-medium hover:bg-[#F7F5F0]"
        >
          Close
        </button>
      </div>
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex justify-between items-start gap-4 border-b border-[#0F2044]/5 pb-3">
      <span className="text-xs text-[#0F2044]/50 min-w-20">{label}</span>
      <span className="text-sm text-[#0F2044] text-right">{value}</span>
    </div>
  );
}

// ─── Class Assignments Tab ────────────────────────────────────────────────────

function ClassAssignmentsTab({ staff, onUpdateClasses }) {
  const [assigningForm, setAssigningForm] = useState(null);

  const teachers = staff.filter((s) => s.role.toLowerCase().includes("teacher"));

  const assignedTo = (form) => teachers.filter((t) => t.classes.includes(form));
  const unassignedTo = (form) => teachers.filter((t) => !t.classes.includes(form));

  const handleAssign = (teacherId, form) => {
    const teacher = staff.find((s) => s.id === teacherId);
    if (!teacher) return;
    onUpdateClasses(teacherId, [...teacher.classes, form]);
    setAssigningForm(null);
  };

  const handleRemove = (teacherId, form) => {
    const teacher = staff.find((s) => s.id === teacherId);
    if (!teacher) return;
    onUpdateClasses(teacherId, teacher.classes.filter((c) => c !== form));
  };

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {FORMS.map((form) => {
          const assigned = assignedTo(form);
          const unassigned = unassignedTo(form);
          return (
            <div key={form} className="bg-white rounded-3xl p-6 border border-[#0F2044]/8">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-[#0F2044]">{form}</h3>
                <span className="text-xs bg-blue-50 text-blue-700 px-3 py-1 rounded-full font-medium">
                  {assigned.length} teacher{assigned.length !== 1 ? "s" : ""}
                </span>
              </div>

              <div className="space-y-2 mb-4">
                {assigned.length === 0 ? (
                  <p className="text-sm text-[#0F2044]/40 italic">No teachers assigned yet</p>
                ) : (
                  assigned.map((t) => (
                    <div
                      key={t.id}
                      className="flex items-center justify-between bg-[#F7F5F0] rounded-2xl px-4 py-3"
                    >
                      <div>
                        <p className="text-sm font-medium text-[#0F2044]">{t.name}</p>
                        <p className="text-xs text-[#0F2044]/50">
                          {t.subjects.length ? t.subjects.join(", ") : t.role}
                        </p>
                      </div>
                      <button
                        onClick={() => handleRemove(t.id, form)}
                        className="p-1.5 hover:bg-red-50 rounded-xl text-red-500/70 hover:text-red-600 transition-colors"
                        title="Remove from this class"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))
                )}
              </div>

              {unassigned.length > 0 && (
                assigningForm === form ? (
                  <div className="space-y-2">
                    <p className="text-xs text-[#0F2044]/50 mb-2">Select a teacher to assign:</p>
                    {unassigned.map((t) => (
                      <button
                        key={t.id}
                        onClick={() => handleAssign(t.id, form)}
                        className="w-full text-left px-4 py-2.5 rounded-2xl border border-[#0F2044]/10 hover:border-[#0F2044]/30 hover:bg-[#F7F5F0] text-sm transition-colors"
                      >
                        <span className="font-medium text-[#0F2044]">{t.name}</span>
                        {t.subjects.length > 0 && (
                          <span className="text-xs text-[#0F2044]/50 ml-2">
                            {t.subjects.join(", ")}
                          </span>
                        )}
                      </button>
                    ))}
                    <button
                      onClick={() => setAssigningForm(null)}
                      className="w-full text-center py-2 text-xs text-[#0F2044]/40 hover:text-[#0F2044]/70"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setAssigningForm(form)}
                    className="w-full py-2.5 border border-dashed border-[#0F2044]/20 rounded-2xl text-sm text-[#0F2044]/50 hover:border-[#0F2044]/40 hover:text-[#0F2044]/70 hover:bg-[#F7F5F0] transition-colors"
                  >
                    + Assign teacher
                  </button>
                )
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function StaffManagement() {
  const [staff, setStaff] = useState(initialStaff);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterDepartment, setFilterDepartment] = useState("All");
  const [activeTab, setActiveTab] = useState("staff"); // "staff" | "assignments"

  // Modal state: null | { mode: "add" | "edit" | "view" | "assign", member }
  const [modal, setModal] = useState(null);

  // ── Derived ──
  const filteredStaff = staff.filter((m) => {
    const matchSearch =
      m.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      m.id.toLowerCase().includes(searchTerm.toLowerCase());
    const matchDept = filterDepartment === "All" || m.department === filterDepartment;
    return matchSearch && matchDept;
  });

  const activeCount = staff.filter((s) => s.status === "Active").length;
  const teacherCount = staff.filter((s) => s.role.toLowerCase().includes("teacher")).length;
  const supportCount = staff.length - teacherCount;
  const onLeaveCount = staff.filter((s) => s.status === "On Leave").length;
  const coveredClasses = new Set(staff.flatMap((s) => s.classes)).size;

  // ── Handlers ──
  const generateId = (role) => {
    const isTeacher = role.toLowerCase().includes("teacher");
    const prefix = isTeacher ? "T" : "S";
    const existing = staff.filter((s) =>
      isTeacher
        ? s.id.startsWith("T")
        : !s.id.startsWith("T")
    );
    return `${prefix}${String(existing.length + 1).padStart(3, "0")}`;
  };

  const handleAdd = (formData) => {
    const newMember = {
      ...formData,
      id: generateId(formData.role),
      joinDate: new Date().toISOString().split("T")[0],
      email:
        formData.email ||
        formData.name
          .toLowerCase()
          .replace(/[^a-z ]/g, "")
          .trim()
          .split(" ")
          .join(".") + "@school.mw",
    };
    setStaff((prev) => [...prev, newMember]);
  };

  const handleEdit = (formData) => {
    setStaff((prev) =>
      prev.map((m) => (m.id === modal.member.id ? { ...m, ...formData } : m))
    );
  };

  const handleDelete = (id) => {
    if (!window.confirm("Remove this staff member? This cannot be undone.")) return;
    setStaff((prev) => prev.filter((m) => m.id !== id));
  };

  const handleUpdateClasses = (id, newClasses) => {
    setStaff((prev) =>
      prev.map((m) => (m.id === id ? { ...m, classes: newClasses } : m))
    );
  };

  const handleAssignClasses = (newClasses) => {
    setStaff((prev) =>
      prev.map((m) => (m.id === modal.member.id ? { ...m, classes: newClasses } : m))
    );
  };

  const closeModal = () => setModal(null);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2
            className="text-3xl font-bold text-[#0F2044]"
            style={{ fontFamily: "'Playfair Display', serif" }}
          >
            Staff Management
          </h2>
          <p className="text-[#0F2044]/60 mt-1">
            Total staff: {staff.length} &bull; Active: {activeCount}
          </p>
        </div>
        <button
          onClick={() => setModal({ mode: "add", member: null })}
          className="flex items-center gap-3 bg-[#0F2044] text-white px-6 py-3.5 rounded-2xl hover:bg-[#1a3060] transition-colors"
        >
          <UserPlus className="w-5 h-5" />
          Add new staff
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
        {[
          { label: "Teaching staff", value: teacherCount, color: "text-[#0F2044]" },
          { label: "Support staff", value: supportCount, color: "text-[#0F2044]" },
          { label: "On leave", value: onLeaveCount, color: "text-amber-600" },
          { label: "Classes covered", value: coveredClasses, color: "text-emerald-600" },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-white rounded-3xl p-6 border border-[#0F2044]/8">
            <p className="text-sm text-[#0F2044]/60">{label}</p>
            <p className={`text-4xl font-bold mt-2 ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-[#F7F5F0] p-1 rounded-2xl w-fit">
        {[
          { key: "staff", label: "Staff list" },
          { key: "assignments", label: "Class assignments" },
        ].map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`px-5 py-2.5 rounded-xl text-sm font-medium transition-colors
              ${activeTab === key
                ? "bg-white text-[#0F2044] shadow-sm"
                : "text-[#0F2044]/60 hover:text-[#0F2044]"
              }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Staff List Tab */}
      {activeTab === "staff" && (
        <>
          {/* Filters */}
          <div className="bg-white rounded-3xl p-6 border border-[#0F2044]/8 flex flex-col sm:flex-row gap-4">
            <input
              type="text"
              placeholder="Search by name or staff ID…"
              className="flex-1 px-6 py-3.5 bg-[#F7F5F0] border border-[#0F2044]/10 rounded-2xl focus:outline-none focus:border-[#0F2044]/30 text-sm"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            <select
              value={filterDepartment}
              onChange={(e) => setFilterDepartment(e.target.value)}
              className="px-6 py-3.5 bg-white border border-[#0F2044]/10 rounded-2xl focus:outline-none text-sm"
            >
              <option value="All">All departments</option>
              {DEPARTMENTS.map((d) => <option key={d}>{d}</option>)}
            </select>
          </div>

          {/* Table */}
          <div className="bg-white rounded-3xl overflow-hidden border border-[#0F2044]/8">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-[#F7F5F0]">
                  <tr>
                    <th className="text-left p-5 text-xs font-medium text-[#0F2044]/60 uppercase tracking-wide">ID</th>
                    <th className="text-left p-5 text-xs font-medium text-[#0F2044]/60 uppercase tracking-wide">Name</th>
                    <th className="text-left p-5 text-xs font-medium text-[#0F2044]/60 uppercase tracking-wide">Role</th>
                    <th className="text-left p-5 text-xs font-medium text-[#0F2044]/60 uppercase tracking-wide">Dept</th>
                    <th className="text-left p-5 text-xs font-medium text-[#0F2044]/60 uppercase tracking-wide">Classes assigned</th>
                    <th className="text-left p-5 text-xs font-medium text-[#0F2044]/60 uppercase tracking-wide">Contact</th>
                    <th className="text-center p-5 text-xs font-medium text-[#0F2044]/60 uppercase tracking-wide">Status</th>
                    <th className="text-center p-5 text-xs font-medium text-[#0F2044]/60 uppercase tracking-wide">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#0F2044]/5">
                  {filteredStaff.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="text-center py-12 text-[#0F2044]/40 text-sm">
                        No staff members match your search.
                      </td>
                    </tr>
                  ) : (
                    filteredStaff.map((member) => (
                      <tr key={member.id} className="hover:bg-[#F7F5F0]/70 transition-colors">
                        <td className="p-5 font-mono text-xs text-[#0F2044]/60">{member.id}</td>
                        <td className="p-5">
                          <p className="font-medium text-[#0F2044] text-sm">{member.name}</p>
                        </td>
                        <td className="p-5">
                          <p className="text-sm text-[#0F2044]">{member.role}</p>
                          {member.subjects.length > 0 && (
                            <p className="text-xs text-[#0F2044]/50 mt-0.5">
                              {member.subjects.join(", ")}
                            </p>
                          )}
                        </td>
                        <td className="p-5 text-sm text-[#0F2044]/70">{member.department}</td>
                        <td className="p-5">
                          {member.classes.length > 0 ? (
                            <div className="flex flex-wrap">
                              {member.classes.map((c) => <ClassTag key={c} label={c} />)}
                            </div>
                          ) : (
                            <span className="text-xs text-[#0F2044]/30 italic">None</span>
                          )}
                          {member.role.toLowerCase().includes("teacher") && (
                            <button
                              onClick={() => setModal({ mode: "assign", member })}
                              className="mt-1.5 flex items-center gap-1 text-xs text-[#0F2044]/50 hover:text-[#0F2044] transition-colors"
                            >
                              <BookOpen className="w-3 h-3" />
                              Edit classes
                            </button>
                          )}
                        </td>
                        <td className="p-5">
                          <p className="text-sm text-[#0F2044]">{member.phone}</p>
                          <p className="text-xs text-[#0F2044]/50">{member.email}</p>
                        </td>
                        <td className="p-5 text-center">
                          <StatusBadge status={member.status} />
                        </td>
                        <td className="p-5">
                          <div className="flex items-center justify-center gap-2">
                            <button
                              onClick={() => setModal({ mode: "view", member })}
                              className="p-2 hover:bg-[#F7F5F0] rounded-xl text-[#0F2044]/50 hover:text-[#0F2044] transition-colors"
                              title="View profile"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => setModal({ mode: "edit", member })}
                              className="p-2 hover:bg-[#F7F5F0] rounded-xl text-[#0F2044]/50 hover:text-[#0F2044] transition-colors"
                              title="Edit"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDelete(member.id)}
                              className="p-2 hover:bg-red-50 rounded-xl text-red-400 hover:text-red-600 transition-colors"
                              title="Delete"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Class Assignments Tab */}
      {activeTab === "assignments" && (
        <ClassAssignmentsTab staff={staff} onUpdateClasses={handleUpdateClasses} />
      )}

      {/* Modals */}
      {modal?.mode === "view" && (
        <ViewModal member={modal.member} onClose={closeModal} />
      )}

      {modal?.mode === "assign" && (
        <AssignClassesModal
          member={modal.member}
          onSave={handleAssignClasses}
          onClose={closeModal}
        />
      )}

      {(modal?.mode === "add" || modal?.mode === "edit") && (
        <StaffModal
          member={modal.mode === "edit" ? modal.member : null}
          onSave={modal.mode === "add" ? handleAdd : handleEdit}
          onClose={closeModal}
        />
      )}
    </div>
  );
}