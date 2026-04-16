import { useState } from "react";
import { 
  Plus, Clock, Calendar, Eye, Edit2, Trash2, 
  CheckCircle, AlertCircle, Users, Send, Download,
  BookOpen, FileText, X, Save
} from "lucide-react";

// ========================
// 1. REUSABLE HOMEWORK CARD
// ========================
function HomeworkCard({ homework, onViewDetails, onEdit, onRemindParents }) {
  const today = new Date().toISOString().split('T')[0];
  const daysLeft = Math.ceil((new Date(homework.dueDate) - new Date(today)) / (1000 * 60 * 60 * 24));
  
  const submissionRate = Math.round((homework.submitted / homework.totalStudents) * 100);

  return (
    <div className="bg-white rounded-3xl border border-[#0F2044]/8 overflow-hidden hover:shadow-md transition-all">
      <div className="px-6 py-5 border-b flex flex-col md:flex-row md:items-center justify-between gap-4 bg-[#F7F5F0]">
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <div className="font-semibold text-xl text-[#0F2044]">{homework.title}</div>
            <div className="px-3 py-1 text-xs font-medium bg-white rounded-2xl border border-[#0F2044]/20 flex items-center gap-1">
              <BookOpen className="w-3 h-3" />
              {homework.className} • {homework.subject}
            </div>
          </div>
          <p className="text-sm text-[#0F2044]/70 mt-2 line-clamp-2">{homework.description}</p>
        </div>

        <div className="flex items-center gap-8">
          <div>
            <p className="text-xs text-[#0F2044]/60">DUE</p>
            <div className={`flex items-center gap-1.5 font-medium ${daysLeft <= 2 ? 'text-red-600' : 'text-[#0F2044]'}`}>
              <Calendar className="w-4 h-4" />
              {new Date(homework.dueDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
            </div>
          </div>

          <div>
            <p className="text-xs text-[#0F2044]/60">SUBMITTED</p>
            <div className="flex items-center gap-2">
              <div className="font-semibold text-lg">{homework.submitted}/{homework.totalStudents}</div>
              <div className="text-xs px-3 py-1 bg-green-100 text-green-700 rounded-2xl font-medium">
                {submissionRate}%
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="p-6 flex items-center justify-between">
        <div className="flex items-center gap-4 text-sm text-[#0F2044]/60">
          <div className="flex items-center gap-1">
            <Clock className="w-4 h-4" />
            Assigned {new Date(homework.dateAssigned).toLocaleDateString('en-GB')}
          </div>
          {homework.notSubmitted > 0 && (
            <div className="flex items-center gap-1 text-amber-600">
              <AlertCircle className="w-4 h-4" />
              {homework.notSubmitted} unsubmitted
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => onViewDetails(homework)}
            className="flex items-center gap-2 px-5 py-2.5 text-sm font-medium border border-[#0F2044]/20 hover:bg-[#F7F5F0] rounded-2xl transition-colors"
          >
            <Eye className="w-4 h-4" /> Details
          </button>
          
          <button
            onClick={() => onEdit(homework)}
            className="flex items-center gap-2 px-5 py-2.5 text-sm font-medium border border-[#0F2044]/20 hover:bg-[#F7F5F0] rounded-2xl transition-colors"
          >
            <Edit2 className="w-4 h-4" /> Edit
          </button>

          {homework.notSubmitted > 0 && (
            <button
              onClick={() => onRemindParents(homework)}
              className="flex items-center gap-2 px-5 py-2.5 bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium rounded-2xl transition-colors"
            >
              <Send className="w-4 h-4" /> Remind Parents
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ========================
// 2. NEW HOMEWORK MODAL
// ========================
function NewHomeworkModal({ isOpen, onClose, onSave }) {
  const [formData, setFormData] = useState({
    className: "Form 3A",
    subject: "Mathematics",
    title: "",
    description: "",
    dueDate: "2026-04-20",
    dueTime: "23:59",
    totalStudents: 42,
  });

  const classes = ["Form 3A", "Form 3B", "Form 4A", "Form 4B"];
  const subjects = ["Mathematics", "Physics", "Chemistry", "Biology", "English", "History"];

  if (!isOpen) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    const newHomework = {
      id: Date.now(),
      ...formData,
      submitted: 0,
      notSubmitted: formData.totalStudents,
      status: "active",
      dateAssigned: new Date().toISOString().split('T')[0],
    };
    onSave(newHomework);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-3xl max-w-lg w-full max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="px-6 py-5 border-b flex items-center justify-between bg-[#F7F5F0]">
          <h3 className="text-2xl font-semibold text-[#0F2044]">Assign New Homework</h3>
          <button onClick={onClose} className="p-2 hover:bg-white rounded-2xl">
            <X className="w-6 h-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-[#0F2044]/60 block mb-1">CLASS</label>
              <select
                value={formData.className}
                onChange={(e) => setFormData({ ...formData, className: e.target.value })}
                className="w-full px-4 py-3 border border-[#0F2044]/10 rounded-2xl focus:outline-none focus:border-[#0F2044]"
              >
                {classes.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            <div>
              <label className="text-xs font-medium text-[#0F2044]/60 block mb-1">SUBJECT</label>
              <select
                value={formData.subject}
                onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                className="w-full px-4 py-3 border border-[#0F2044]/10 rounded-2xl focus:outline-none focus:border-[#0F2044]"
              >
                {subjects.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-[#0F2044]/60 block mb-1">HOMEWORK TITLE</label>
            <input
              type="text"
              placeholder="e.g. Quadratic Equations Exercise"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              className="w-full px-4 py-3 border border-[#0F2044]/10 rounded-2xl focus:outline-none focus:border-[#0F2044]"
              required
            />
          </div>

          <div>
            <label className="text-xs font-medium text-[#0F2044]/60 block mb-1">DESCRIPTION / INSTRUCTIONS</label>
            <textarea
              rows={4}
              placeholder="Detailed instructions, page numbers, MANEB-style requirements..."
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="w-full px-4 py-3 border border-[#0F2044]/10 rounded-3xl focus:outline-none focus:border-[#0F2044] resize-none"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-[#0F2044]/60 block mb-1">DUE DATE</label>
              <input
                type="date"
                value={formData.dueDate}
                onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
                className="w-full px-4 py-3 border border-[#0F2044]/10 rounded-2xl focus:outline-none focus:border-[#0F2044]"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-[#0F2044]/60 block mb-1">TOTAL STUDENTS</label>
              <input
                type="number"
                value={formData.totalStudents}
                onChange={(e) => setFormData({ ...formData, totalStudents: parseInt(e.target.value) })}
                className="w-full px-4 py-3 border border-[#0F2044]/10 rounded-2xl focus:outline-none focus:border-[#0F2044]"
              />
            </div>
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-4 text-sm font-medium border border-[#0F2044]/20 rounded-2xl hover:bg-[#F7F5F0]"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 py-4 bg-[#0F2044] text-white rounded-2xl hover:bg-[#1A2F5C] font-medium flex items-center justify-center gap-2"
            >
              <Save className="w-5 h-5" />
              Assign Homework
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ========================
// 3. SUBMISSION TRACKING TABLE
// ========================
function SubmissionTable({ homework, submissions, onMarkSubmitted, onClose }) {
  // Fake student submissions for demo
  const [studentSubmissions, setStudentSubmissions] = useState(submissions || [
    { id: 1, studentName: "Chisomo Banda", admissionNo: "F3A-023", submitted: true, submittedDate: "2026-04-08", score: 18 },
    { id: 2, studentName: "Tawonga Phiri", admissionNo: "F3A-014", submitted: true, submittedDate: "2026-04-09", score: null },
    { id: 3, studentName: "Amina Mwale", admissionNo: "F3A-037", submitted: false, submittedDate: null, score: null },
    { id: 4, studentName: "Kelvin Manda", admissionNo: "F3A-009", submitted: true, submittedDate: "2026-04-07", score: 15 },
    { id: 5, studentName: "Grace Kumwenda", admissionNo: "F3A-045", submitted: false, submittedDate: null, score: null },
  ]);

  const handleToggleSubmission = (id) => {
    setStudentSubmissions(prev =>
      prev.map(student =>
        student.id === id
          ? { ...student, submitted: !student.submitted, submittedDate: !student.submitted ? new Date().toISOString().split('T')[0] : null }
          : student
      )
    );
    onMarkSubmitted(id);
  };

  return (
    <div className="bg-white rounded-3xl border border-[#0F2044]/8 p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="font-semibold text-xl">{homework.title}</h3>
          <p className="text-[#0F2044]/60">{homework.className} • {homework.subject}</p>
        </div>
        <button onClick={onClose} className="text-[#0F2044]/50 hover:text-[#0F2044]">
          ✕
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#0F2044]/10">
              <th className="py-4 text-left font-medium text-[#0F2044]/60">ADMISSION NO.</th>
              <th className="py-4 text-left font-medium text-[#0F2044]/60">STUDENT NAME</th>
              <th className="py-4 text-center font-medium text-[#0F2044]/60">STATUS</th>
              <th className="py-4 text-center font-medium text-[#0F2044]/60">SUBMITTED ON</th>
              <th className="py-4 text-center font-medium text-[#0F2044]/60">ACTION</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {studentSubmissions.map(student => (
              <tr key={student.id} className="hover:bg-[#FAFAF8]">
                <td className="py-5 font-mono text-[#0F2044]/70">{student.admissionNo}</td>
                <td className="py-5 font-medium">{student.studentName}</td>
                <td className="py-5 text-center">
                  {student.submitted ? (
                    <span className="inline-flex items-center gap-1 text-green-600 bg-green-100 px-4 py-1 rounded-2xl text-xs font-medium">
                      <CheckCircle className="w-3 h-3" /> Submitted
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-amber-600 bg-amber-100 px-4 py-1 rounded-2xl text-xs font-medium">
                      <AlertCircle className="w-3 h-3" /> Pending
                    </span>
                  )}
                </td>
                <td className="py-5 text-center text-[#0F2044]/60">
                  {student.submittedDate || "—"}
                </td>
                <td className="py-5 text-center">
                  <button
                    onClick={() => handleToggleSubmission(student.id)}
                    className={`px-5 py-2 text-xs font-medium rounded-2xl transition-colors ${
                      student.submitted 
                        ? "bg-green-100 text-green-700 hover:bg-green-200" 
                        : "bg-amber-100 text-amber-700 hover:bg-amber-200"
                    }`}
                  >
                    {student.submitted ? "Mark Unsubmitted" : "Mark Submitted"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-6 flex justify-end gap-3">
        <button
          onClick={onClose}
          className="px-8 py-3 text-sm font-medium border border-[#0F2044]/20 rounded-2xl hover:bg-[#F7F5F0]"
        >
          Close
        </button>
        <button
          onClick={() => alert("Submission report exported as PDF")}
          className="px-8 py-3 bg-[#0F2044] text-white rounded-2xl text-sm font-medium flex items-center gap-2"
        >
          <Download className="w-4 h-4" /> Export Report
        </button>
      </div>
    </div>
  );
}

// ========================
// 4. MAIN HOMEWORK MODULE (Teacher Portal)
// ========================
export default function HomeworkModule() {
  const [activeTab, setActiveTab] = useState("assigned");
  const [showNewModal, setShowNewModal] = useState(false);
  const [selectedHomework, setSelectedHomework] = useState(null);
  const [showSubmissionModal, setShowSubmissionModal] = useState(false);

  // Initial homework data
  const [homeworkList, setHomeworkList] = useState([
    {
      id: 1,
      className: "Form 3A",
      subject: "Mathematics",
      title: "Quadratic Equations Exercise",
      description: "Solve questions 1-15 from page 87. Show all working steps clearly.",
      dueDate: "2026-04-15",
      dueTime: "23:59",
      totalStudents: 42,
      submitted: 28,
      notSubmitted: 14,
      status: "active",
      dateAssigned: "2026-04-08",
    },
    {
      id: 2,
      className: "Form 4B",
      subject: "Mathematics",
      title: "Trigonometry Revision (MANEB Style)",
      description: "Complete past paper questions 1-10 from 2023 MANEB Paper 2.",
      dueDate: "2026-04-12",
      dueTime: "23:59",
      totalStudents: 38,
      submitted: 35,
      notSubmitted: 3,
      status: "active",
      dateAssigned: "2026-04-05",
    },
    {
      id: 3,
      className: "Form 3A",
      subject: "Physics",
      title: "Motion and Forces Worksheet",
      description: "Draw velocity-time graphs for the 5 scenarios provided.",
      dueDate: "2026-04-10",
      dueTime: "23:59",
      totalStudents: 42,
      submitted: 19,
      notSubmitted: 23,
      status: "overdue",
      dateAssigned: "2026-04-03",
    },
  ]);

  const assignedHomework = homeworkList.filter(hw => hw.status === "active");
  const overdueHomework = homeworkList.filter(hw => hw.status === "overdue");

  const handleSaveNewHomework = (newHw) => {
    setHomeworkList(prev => [...prev, newHw]);
  };

  const handleRemindParents = (hw) => {
    alert(`✅ Reminder SMS + Push notifications sent to ${hw.notSubmitted} parents regarding "${hw.title}"`);
  };

  const handleViewDetails = (hw) => {
    setSelectedHomework(hw);
    setShowSubmissionModal(true);
  };

  return (
    <div className="space-y-6">
      {/* HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold text-[#0F2044]" style={{ fontFamily: "'Playfair Display', serif" }}>
            Homework &amp; Assignments
          </h2>
          <p className="text-[#0F2044]/60">Mr. Martin Khumbata • Mathematics &amp; Physics Teacher</p>
        </div>

        <button
          onClick={() => setShowNewModal(true)}
          className="flex items-center gap-2 px-6 py-3 bg-[#0F2044] hover:bg-[#1A2F5C] text-white rounded-2xl font-medium transition-colors"
        >
          <Plus className="w-5 h-5" />
          Assign New Homework
        </button>
      </div>

      {/* TABS */}
      <div className="bg-white rounded-3xl p-1 border border-[#0F2044]/8 inline-flex">
        {[
          { id: "assigned", label: "Assigned", count: assignedHomework.length },
          { id: "overdue", label: "Overdue", count: overdueHomework.length },
          { id: "submissions", label: "All Submissions" }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-7 py-3 text-sm font-medium rounded-2xl transition-all flex items-center gap-2 ${
              activeTab === tab.id 
                ? "bg-[#0F2044] text-white shadow-md" 
                : "hover:bg-[#FAFAF8] text-[#0F2044]/70"
            }`}
          >
            {tab.label}
            {tab.count !== undefined && (
              <span className={`text-xs px-2.5 py-0.5 rounded-full ${activeTab === tab.id ? 'bg-white/20' : 'bg-[#0F2044]/10'}`}>
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ASSIGNED TAB */}
      {activeTab === "assigned" && (
        <div className="space-y-6">
          {assignedHomework.length > 0 ? (
            assignedHomework.map(hw => (
              <HomeworkCard
                key={hw.id}
                homework={hw}
                onViewDetails={handleViewDetails}
                onEdit={() => alert(`Editing homework #${hw.id}`)}
                onRemindParents={handleRemindParents}
              />
            ))
          ) : (
            <div className="bg-white rounded-3xl py-20 text-center text-[#0F2044]/50">
              No homework assigned yet. Click “Assign New Homework” above.
            </div>
          )}
        </div>
      )}

      {/* OVERDUE TAB */}
      {activeTab === "overdue" && (
        <div className="bg-white rounded-3xl border border-red-200 overflow-hidden">
          <div className="px-6 py-4 bg-red-50 border-b flex items-center justify-between">
            <div className="font-semibold flex items-center gap-2 text-red-700">
              <AlertCircle className="w-5 h-5" /> Overdue Assignments
            </div>
            <div className="text-red-600 text-sm">{overdueHomework.length} homework(s)</div>
          </div>
          <div className="divide-y">
            {overdueHomework.map(hw => (
              <HomeworkCard
                key={hw.id}
                homework={hw}
                onViewDetails={handleViewDetails}
                onEdit={() => alert(`Editing overdue homework`)}
                onRemindParents={handleRemindParents}
              />
            ))}
          </div>
        </div>
      )}

      {/* ALL SUBMISSIONS TAB */}
      {activeTab === "submissions" && (
        <div className="bg-white rounded-3xl p-8 text-center">
          <FileText className="w-12 h-12 mx-auto text-[#0F2044]/30 mb-4" />
          <h3 className="font-semibold text-xl mb-2">All Submissions Overview</h3>
          <p className="text-[#0F2044]/60 max-w-md mx-auto">
            This tab shows a combined view of all homework submissions across classes. 
            You can filter by class or student and export full reports.
          </p>
          <button 
            onClick={() => alert("Full submission report would open here in production")}
            className="mt-8 px-8 py-3 bg-[#0F2044] text-white rounded-2xl font-medium"
          >
            View Complete Submission Dashboard
          </button>
        </div>
      )}

      {/* FOOTER NOTE */}
      <div className="text-center text-xs text-[#0F2044]/50">
        Parents receive automatic push notifications and optional SMS when homework is assigned or becomes overdue.
        <br />
        All data is stored securely and follows MANEB record-keeping standards.
      </div>

      {/* MODALS */}
      <NewHomeworkModal
        isOpen={showNewModal}
        onClose={() => setShowNewModal(false)}
        onSave={handleSaveNewHomework}
      />

      {showSubmissionModal && selectedHomework && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="max-w-4xl w-full">
            <SubmissionTable
              homework={selectedHomework}
              onMarkSubmitted={(studentId) => console.log("Marked student", studentId)}
              onClose={() => setShowSubmissionModal(false)}
            />
          </div>
        </div>
      )}
    </div>
  );
}