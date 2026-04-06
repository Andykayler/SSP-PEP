import { useState } from "react";
import { Plus, Edit, Trash2, Users, BookOpen, Calendar, Eye } from "lucide-react";

export default function ClassModule() {
  const [searchTerm, setSearchTerm] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingClass, setEditingClass] = useState(null);

  // Sample Data - In production this will come from your backend
  const [classes, setClasses] = useState([
    {
      id: "CLS-001",
      name: "Form 1A",
      stream: "A",
      level: "Form 1",
      capacity: 45,
      currentStudents: 42,
      classTeacher: "Mr. Kondwani Banda",
      subjects: 8,
      status: "Active",
    },
    {
      id: "CLS-002",
      name: "Form 2B",
      stream: "B",
      level: "Form 2",
      capacity: 40,
      currentStudents: 38,
      classTeacher: "Mrs. Esther Phiri",
      subjects: 9,
      status: "Active",
    },
    {
      id: "CLS-003",
      name: "Form 3A",
      stream: "A",
      level: "Form 3",
      capacity: 50,
      currentStudents: 47,
      classTeacher: "Mr. James Mwale",
      subjects: 10,
      status: "Active",
    },
    {
      id: "CLS-004",
      name: "Form 4C",
      stream: "C",
      level: "Form 4",
      capacity: 35,
      currentStudents: 33,
      classTeacher: "Miss Grace Kumwenda",
      subjects: 11,
      status: "Active",
    },
  ]);

  const filteredClasses = classes.filter(cls =>
    cls.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    cls.classTeacher.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleDelete = (id) => {
    if (window.confirm("Delete this class? All associated data will be affected.")) {
      setClasses(classes.filter(c => c.id !== id));
    }
  };

  const handleSaveClass = (newClass) => {
    if (editingClass) {
      setClasses(classes.map(c => c.id === editingClass.id ? { ...newClass, id: editingClass.id } : c));
    } else {
      const newId = `CLS-${String(classes.length + 101).padStart(3, '0')}`;
      setClasses([...classes, { ...newClass, id: newId }]);
    }
    setShowAddModal(false);
    setEditingClass(null);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold text-[#0F2044]" style={{ fontFamily: "'Playfair Display', serif" }}>
            Classes & Streams
          </h2>
          <p className="text-[#0F2044]/60">Manage academic classes and streams • Total Classes: {classes.length}</p>
        </div>

        <button
          onClick={() => {
            setEditingClass(null);
            setShowAddModal(true);
          }}
          className="flex items-center gap-2 bg-[#0F2044] hover:bg-[#1a3366] text-white px-6 py-3 rounded-2xl font-medium transition-all shadow-lg"
        >
          <Plus className="w-5 h-5" />
          Create New Class
        </button>
      </div>

      {/* Search & Stats */}
      <div className="bg-white rounded-3xl p-5 border border-[#0F2044]/8 flex flex-col md:flex-row gap-4 items-center">
        <div className="flex-1 relative">
          <input
            type="text"
            placeholder="Search classes or class teachers..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-5 pr-4 py-3 bg-[#FAFAF8] border border-[#0F2044]/10 rounded-2xl focus:border-[#F4B400] focus:ring-2 focus:ring-[#F4B400]/20 outline-none"
          />
        </div>

        <div className="flex gap-3 text-sm">
          <div className="bg-emerald-50 text-emerald-700 px-4 py-2 rounded-2xl font-medium">
            Active: {classes.filter(c => c.status === "Active").length}
          </div>
          <div className="bg-amber-50 text-amber-700 px-4 py-2 rounded-2xl font-medium">
            Total Students: {classes.reduce((sum, c) => sum + c.currentStudents, 0)}
          </div>
        </div>
      </div>

      {/* Classes Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredClasses.map((cls) => (
          <div key={cls.id} className="bg-white rounded-3xl border border-[#0F2044]/8 p-6 hover:shadow-md transition-all group">
            <div className="flex justify-between items-start mb-4">
              <div>
                <div className="text-2xl font-bold text-[#0F2044]">{cls.name}</div>
                <div className="text-sm text-[#0F2044]/60">Level: {cls.level}</div>
              </div>
              <span className="px-3 py-1 text-xs font-medium bg-emerald-100 text-emerald-700 rounded-full">
                {cls.status}
              </span>
            </div>

            <div className="space-y-3 text-sm mb-6">
              <div className="flex justify-between">
                <span className="text-[#0F2044]/60">Stream</span>
                <span className="font-medium">{cls.stream}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#0F2044]/60">Class Teacher</span>
                <span className="font-medium">{cls.classTeacher}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#0F2044]/60">Capacity</span>
                <span className="font-medium">{cls.currentStudents} / {cls.capacity}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#0F2044]/60">Subjects Offered</span>
                <span className="font-medium">{cls.subjects}</span>
              </div>
            </div>

            <div className="flex gap-2 pt-4 border-t border-[#0F2044]/10">
              <button className="flex-1 flex items-center justify-center gap-2 py-2.5 border border-[#0F2044]/20 hover:border-[#0F2044]/40 rounded-2xl text-sm font-medium transition-colors">
                <Eye className="w-4 h-4" /> View Students
              </button>
              <button 
                onClick={() => {
                  setEditingClass(cls);
                  setShowAddModal(true);
                }}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 border border-[#0F2044]/20 hover:border-blue-400 text-blue-600 rounded-2xl text-sm font-medium transition-colors"
              >
                <Edit className="w-4 h-4" /> Edit
              </button>
              <button 
                onClick={() => handleDelete(cls.id)}
                className="p-2.5 border border-red-200 hover:bg-red-50 text-red-600 rounded-2xl transition-colors"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Add / Edit Class Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl w-full max-w-md p-8">
            <h3 className="text-2xl font-bold text-[#0F2044] mb-1">
              {editingClass ? "Edit Class" : "Create New Class"}
            </h3>
            <p className="text-[#0F2044]/60 mb-6">
              {editingClass ? "Update class information" : "Set up a new class or stream"}
            </p>

            <ClassForm 
              initialData={editingClass} 
              onSave={handleSaveClass} 
              onCancel={() => {
                setShowAddModal(false);
                setEditingClass(null);
              }} 
            />
          </div>
        </div>
      )}
    </div>
  );
}

// Reusable Form Component
function ClassForm({ initialData, onSave, onCancel }) {
  const [form, setForm] = useState({
    name: initialData?.name || "",
    stream: initialData?.stream || "",
    level: initialData?.level || "Form 1",
    capacity: initialData?.capacity || 40,
    classTeacher: initialData?.classTeacher || "",
    subjects: initialData?.subjects || 8,
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(form);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <label className="text-xs font-bold tracking-widest uppercase text-[#0F2044]/60 block mb-1">Class Name</label>
        <input
          type="text"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          placeholder="e.g. Form 3A"
          className="w-full px-4 py-3 border border-[#0F2044]/15 rounded-2xl focus:border-[#F4B400]"
          required
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-xs font-bold tracking-widest uppercase text-[#0F2044]/60 block mb-1">Stream</label>
          <input
            type="text"
            value={form.stream}
            onChange={(e) => setForm({ ...form, stream: e.target.value })}
            placeholder="A, B, C..."
            className="w-full px-4 py-3 border border-[#0F2044]/15 rounded-2xl focus:border-[#F4B400]"
            required
          />
        </div>
        <div>
          <label className="text-xs font-bold tracking-widest uppercase text-[#0F2044]/60 block mb-1">Level</label>
          <select
            value={form.level}
            onChange={(e) => setForm({ ...form, level: e.target.value })}
            className="w-full px-4 py-3 border border-[#0F2044]/15 rounded-2xl focus:border-[#F4B400]"
          >
            <option value="Form 1">Form 1</option>
            <option value="Form 2">Form 2</option>
            <option value="Form 3">Form 3</option>
            <option value="Form 4">Form 4</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-xs font-bold tracking-widest uppercase text-[#0F2044]/60 block mb-1">Capacity</label>
          <input
            type="number"
            value={form.capacity}
            onChange={(e) => setForm({ ...form, capacity: parseInt(e.target.value) })}
            className="w-full px-4 py-3 border border-[#0F2044]/15 rounded-2xl focus:border-[#F4B400]"
            required
          />
        </div>
        <div>
          <label className="text-xs font-bold tracking-widest uppercase text-[#0F2044]/60 block mb-1">Subjects</label>
          <input
            type="number"
            value={form.subjects}
            onChange={(e) => setForm({ ...form, subjects: parseInt(e.target.value) })}
            className="w-full px-4 py-3 border border-[#0F2044]/15 rounded-2xl focus:border-[#F4B400]"
          />
        </div>
      </div>

      <div>
        <label className="text-xs font-bold tracking-widest uppercase text-[#0F2044]/60 block mb-1">Class Teacher</label>
        <input
          type="text"
          value={form.classTeacher}
          onChange={(e) => setForm({ ...form, classTeacher: e.target.value })}
          placeholder="Full name of class teacher"
          className="w-full px-4 py-3 border border-[#0F2044]/15 rounded-2xl focus:border-[#F4B400]"
          required
        />
      </div>

      <div className="flex gap-3 pt-4">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 py-3 border border-[#0F2044]/20 rounded-2xl font-medium hover:bg-[#F7F5F0]"
        >
          Cancel
        </button>
        <button
          type="submit"
          className="flex-1 py-3 bg-[#0F2044] text-white rounded-2xl font-medium hover:bg-[#1a3366]"
        >
          {initialData ? "Update Class" : "Create Class"}
        </button>
      </div>
    </form>
  );
}