import { useState } from "react";
import { Plus, Edit, Trash2, Calendar, Clock, Users, Download } from "lucide-react";

export default function TimetableModule() {
  const [selectedDay, setSelectedDay] = useState("Monday");
  const [selectedClass, setSelectedClass] = useState("All Classes");
  const [showAddModal, setShowAddModal] = useState(false);

  const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];

  // Sample Timetable Data
  const [timetable, setTimetable] = useState([
    {
      id: 1,
      day: "Monday",
      className: "Form 3A",
      time: "07:30 - 08:20",
      subject: "Mathematics",
      teacher: "Mr. James Mwale",
      room: "Block B - Rm 12",
    },
    {
      id: 2,
      day: "Monday",
      className: "Form 3A",
      time: "08:30 - 09:20",
      subject: "English",
      teacher: "Mrs. Esther Phiri",
      room: "Block A - Rm 05",
    },
    {
      id: 3,
      day: "Monday",
      className: "Form 2B",
      time: "07:30 - 08:20",
      subject: "Biology",
      teacher: "Miss Grace Kumwenda",
      room: "Science Lab",
    },
    {
      id: 4,
      day: "Tuesday",
      className: "Form 3A",
      time: "09:30 - 10:20",
      subject: "History",
      teacher: "Mr. Kondwani Banda",
      room: "Block C - Rm 08",
    },
    {
      id: 5,
      day: "Wednesday",
      className: "Form 4A",
      time: "07:30 - 08:20",
      subject: "Chemistry",
      teacher: "Mr. Peter Mwale",
      room: "Science Lab",
    },
  ]);

  const filteredTimetable = timetable.filter(item => 
    (selectedClass === "All Classes" || item.className === selectedClass) &&
    item.day === selectedDay
  );

  const handleDelete = (id) => {
    if (window.confirm("Delete this timetable entry?")) {
      setTimetable(timetable.filter(item => item.id !== id));
    }
  };

  const handleSaveEntry = (newEntry) => {
    setTimetable([...timetable, { ...newEntry, id: Date.now() }]);
    setShowAddModal(false);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold text-app-text" style={{ fontFamily: "'Playfair Display', serif" }}>
            School Timetable
          </h2>
          <p className="text-app-text/60">Manage daily class schedules and periods</p>
        </div>

        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 bg-app-primary hover:bg-[#1a3366] text-white px-6 py-3 rounded-2xl font-medium transition-all shadow-lg"
        >
          <Plus className="w-5 h-5" />
          Add Schedule
        </button>
      </div>

      {/* Filters */}
      <div className="bg-app-surface rounded-3xl p-5 border border-app-border flex flex-wrap gap-4">
        <div>
          <label className="text-xs font-bold tracking-widest uppercase text-app-text/60 block mb-1">Day</label>
          <div className="flex gap-1 bg-[#FAFAF8] p-1 rounded-2xl">
            {days.map(day => (
              <button
                key={day}
                onClick={() => setSelectedDay(day)}
                className={`px-5 py-2 text-sm font-medium rounded-xl transition-all ${
                  selectedDay === day 
                    ? "bg-app-primary text-white shadow" 
                    : "hover:bg-app-surface"
                }`}
              >
                {day}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="text-xs font-bold tracking-widest uppercase text-app-text/60 block mb-1">Class</label>
          <select
            value={selectedClass}
            onChange={(e) => setSelectedClass(e.target.value)}
            className="px-5 py-3 bg-[#FAFAF8] border border-app-border rounded-2xl focus:border-[#F4B400] outline-none"
          >
            <option value="All Classes">All Classes</option>
            <option value="Form 3A">Form 3A</option>
            <option value="Form 2B">Form 2B</option>
            <option value="Form 4A">Form 4A</option>
          </select>
        </div>

        <button className="ml-auto flex items-center gap-2 px-6 py-3 border border-app-border hover:border-[#0F2044]/40 rounded-2xl text-sm font-medium">
          <Download className="w-5 h-5" />
          Export PDF
        </button>
      </div>

      {/* Timetable Table */}
      <div className="bg-app-surface rounded-3xl border border-app-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-app-bg">
              <tr>
                <th className="px-6 py-4 text-left text-xs font-bold tracking-widest text-app-text/60">TIME</th>
                <th className="px-6 py-4 text-left text-xs font-bold tracking-widest text-app-text/60">CLASS</th>
                <th className="px-6 py-4 text-left text-xs font-bold tracking-widest text-app-text/60">SUBJECT</th>
                <th className="px-6 py-4 text-left text-xs font-bold tracking-widest text-app-text/60">TEACHER</th>
                <th className="px-6 py-4 text-left text-xs font-bold tracking-widest text-app-text/60">ROOM</th>
                <th className="px-6 py-4 text-center text-xs font-bold tracking-widest text-app-text/60">ACTIONS</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#0F2044]/5">
              {filteredTimetable.length > 0 ? (
                filteredTimetable.map((entry) => (
                  <tr key={entry.id} className="hover:bg-[#FAFAF8] transition-colors">
                    <td className="px-6 py-5 font-medium text-sm">{entry.time}</td>
                    <td className="px-6 py-5">
                      <div className="font-medium">{entry.className}</div>
                    </td>
                    <td className="px-6 py-5">
                      <div className="font-medium text-app-text">{entry.subject}</div>
                    </td>
                    <td className="px-6 py-5 text-sm text-app-text/70">{entry.teacher}</td>
                    <td className="px-6 py-5 text-sm font-mono text-app-text/70">{entry.room}</td>
                    <td className="px-6 py-5">
                      <div className="flex items-center justify-center gap-2">
                        <button className="p-2 hover:bg-blue-100 text-blue-600 rounded-xl transition-colors">
                          <Edit className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={() => handleDelete(entry.id)}
                          className="p-2 hover:bg-red-100 text-red-600 rounded-xl transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="6" className="py-20 text-center text-app-text/50">
                    No timetable entries found for {selectedDay} in {selectedClass}.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add New Timetable Entry Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-app-surface rounded-3xl w-full max-w-lg p-8">
            <h3 className="text-2xl font-bold text-app-text mb-6">Add New Timetable Entry</h3>
            
            <TimetableForm 
              onSave={handleSaveEntry} 
              onCancel={() => setShowAddModal(false)} 
            />
          </div>
        </div>
      )}
    </div>
  );
}

// Reusable Form for Adding Timetable Entry
function TimetableForm({ onSave, onCancel }) {
  const [form, setForm] = useState({
    day: "Monday",
    className: "Form 3A",
    time: "",
    subject: "",
    teacher: "",
    room: "",
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(form);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-xs font-bold tracking-widest uppercase text-app-text/60 block mb-1">Day</label>
          <select
            value={form.day}
            onChange={(e) => setForm({ ...form, day: e.target.value })}
            className="w-full px-4 py-3 border border-app-border rounded-2xl focus:border-[#F4B400]"
          >
            {["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"].map(d => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-xs font-bold tracking-widest uppercase text-app-text/60 block mb-1">Class</label>
          <select
            value={form.className}
            onChange={(e) => setForm({ ...form, className: e.target.value })}
            className="w-full px-4 py-3 border border-app-border rounded-2xl focus:border-[#F4B400]"
          >
            <option value="Form 1A">Form 1A</option>
            <option value="Form 2B">Form 2B</option>
            <option value="Form 3A">Form 3A</option>
            <option value="Form 4A">Form 4A</option>
          </select>
        </div>
      </div>

      <div>
        <label className="text-xs font-bold tracking-widest uppercase text-app-text/60 block mb-1">Time Slot</label>
        <input
          type="text"
          value={form.time}
          onChange={(e) => setForm({ ...form, time: e.target.value })}
          placeholder="07:30 - 08:20"
          className="w-full px-4 py-3 border border-app-border rounded-2xl focus:border-[#F4B400]"
          required
        />
      </div>

      <div>
        <label className="text-xs font-bold tracking-widest uppercase text-app-text/60 block mb-1">Subject</label>
        <input
          type="text"
          value={form.subject}
          onChange={(e) => setForm({ ...form, subject: e.target.value })}
          placeholder="e.g. Mathematics"
          className="w-full px-4 py-3 border border-app-border rounded-2xl focus:border-[#F4B400]"
          required
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-xs font-bold tracking-widest uppercase text-app-text/60 block mb-1">Teacher</label>
          <input
            type="text"
            value={form.teacher}
            onChange={(e) => setForm({ ...form, teacher: e.target.value })}
            placeholder="Teacher Name"
            className="w-full px-4 py-3 border border-app-border rounded-2xl focus:border-[#F4B400]"
            required
          />
        </div>
        <div>
          <label className="text-xs font-bold tracking-widest uppercase text-app-text/60 block mb-1">Room</label>
          <input
            type="text"
            value={form.room}
            onChange={(e) => setForm({ ...form, room: e.target.value })}
            placeholder="e.g. Block B - Rm 12"
            className="w-full px-4 py-3 border border-app-border rounded-2xl focus:border-[#F4B400]"
          />
        </div>
      </div>

      <div className="flex gap-3 pt-6">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 py-3 border border-app-border rounded-2xl font-medium hover:bg-app-bg"
        >
          Cancel
        </button>
        <button
          type="submit"
          className="flex-1 py-3 bg-app-primary text-white rounded-2xl font-medium hover:bg-[#1a3366]"
        >
          Add to Timetable
        </button>
      </div>
    </form>
  );
}