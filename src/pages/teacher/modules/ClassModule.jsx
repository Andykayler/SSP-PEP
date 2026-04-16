import { useState } from "react";
import { 
  Plus, Calendar, Clock, BookOpen, Edit2, Eye, Trash2, 
  Download, CheckCircle, AlertCircle, X, Save 
} from "lucide-react";

export default function ClassPlanningModule() {
  const [activeFilter, setActiveFilter] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [showNewModal, setShowNewModal] = useState(false);
  const [viewingPlan, setViewingPlan] = useState(null);

  const [lessonPlans, setLessonPlans] = useState([
    {
      id: 1,
      className: "Form 3A",
      subject: "Mathematics",
      date: "2026-04-14",
      period: "Period 2 (08:30 - 09:20)",
      topic: "Factorisation of Quadratic Expressions",
      objectives: "By the end of the lesson, students will factorise quadratic expressions using different methods and apply them to solve real-life problems.",
      resources: "Textbook Chapter 8, Graph boards, Whiteboard markers",
      assessment: "Class exercise + Homework from past MANEB papers",
      week: "12",
      term: "Term 2",
      status: "planned"
    },
    {
      id: 2,
      className: "Form 4B",
      subject: "Physics",
      date: "2026-04-15",
      period: "Period 4 (11:30 - 12:20)",
      topic: "Applications of Newton's Laws of Motion",
      objectives: "Students will apply Newton's three laws to solve numerical problems and explain everyday phenomena.",
      resources: "Demo trolley, weights, Past papers",
      assessment: "Group activity + Short quiz",
      week: "12",
      term: "Term 2",
      status: "in-progress"
    },
    {
      id: 3,
      className: "Form 3A",
      subject: "Mathematics",
      date: "2026-04-10",
      period: "Period 1 (07:30 - 08:20)",
      topic: "Introduction to Quadratic Equations",
      objectives: "Understand the standard form ax² + bx + c = 0 and identify coefficients.",
      resources: "Whiteboard, Textbook pg 85-90",
      assessment: "Oral questions and board work",
      week: "11",
      term: "Term 2",
      status: "completed"
    },
  ]);

  const filteredPlans = lessonPlans.filter(plan => {
    const matchesSearch = 
      plan.topic.toLowerCase().includes(searchTerm.toLowerCase()) ||
      plan.className.toLowerCase().includes(searchTerm.toLowerCase()) ||
      plan.subject.toLowerCase().includes(searchTerm.toLowerCase());

    if (activeFilter === "completed") return matchesSearch && plan.status === "completed";
    if (activeFilter === "this-week") return matchesSearch;
    return matchesSearch;
  });

  const handleSaveNewPlan = (newPlan) => {
    setLessonPlans(prev => [newPlan, ...prev]);
    setShowNewModal(false);
    alert("✅ Lesson plan created successfully!");
  };

  const handleDelete = (id) => {
    if (window.confirm("Delete this lesson plan?")) {
      setLessonPlans(prev => prev.filter(plan => plan.id !== id));
      alert("✅ Lesson plan deleted successfully.");
    }
  };

  const handleEdit = (plan) => {
    alert(`Editing lesson plan: "${plan.topic}"\n\n(Edit form will be implemented in future updates)`);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold text-[#0F2044]" style={{ fontFamily: "'Playfair Display', serif" }}>
            Class Planning & Lesson Plans
          </h2>
          <p className="text-[#0F2044]/60">
            My Teaching Plans • {filteredPlans.length} lesson plans
          </p>
        </div>

        <button 
          onClick={() => setShowNewModal(true)}
          className="flex items-center gap-2 px-6 py-3 bg-[#0F2044] text-white rounded-2xl hover:bg-[#1A2F5C] transition-colors font-medium"
        >
          <Plus className="w-5 h-5" /> New Lesson Plan
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-3xl p-5 border border-[#0F2044]/8 flex flex-col md:flex-row gap-4">
        <div className="flex-1 relative">
          <BookOpen className="absolute left-4 top-1/2 -translate-y-1/2 text-[#0F2044]/40 w-5 h-5" />
          <input
            type="text"
            placeholder="Search by topic, class or subject..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-11 pr-4 py-3 bg-[#FAFAF8] border border-[#0F2044]/10 rounded-2xl focus:border-[#F4B400] focus:outline-none"
          />
        </div>

        <div className="flex gap-3">
          {[
            { id: "all", label: "All Plans" },
            { id: "this-week", label: "This Week" },
            { id: "completed", label: "Completed" }
          ].map((filter) => (
            <button
              key={filter.id}
              onClick={() => setActiveFilter(filter.id)}
              className={`px-6 py-3 text-sm font-medium rounded-2xl transition-all whitespace-nowrap ${
                activeFilter === filter.id 
                  ? "bg-[#0F2044] text-white shadow-md" 
                  : "border border-[#0F2044]/15 hover:bg-[#F7F5F0]"
              }`}
            >
              {filter.label}
            </button>
          ))}
        </div>

        <button className="flex items-center gap-2 px-6 py-3 border border-[#0F2044]/20 hover:bg-[#F7F5F0] rounded-2xl transition-colors whitespace-nowrap">
          <Download className="w-5 h-5" /> Export Plans
        </button>
      </div>

      {/* Lesson Plans List */}
      <div className="bg-white rounded-3xl border border-[#0F2044]/8 overflow-hidden">
        {filteredPlans.length > 0 ? (
          <div className="divide-y divide-[#0F2044]/5">
            {filteredPlans.map((plan) => {
              const statusStyle = 
                plan.status === "completed" ? "bg-green-100 text-green-700" :
                plan.status === "in-progress" ? "bg-blue-100 text-blue-700" :
                "bg-amber-100 text-amber-700";

              return (
                <div key={plan.id} className="p-6 hover:bg-[#FAFAF8] transition-colors">
                  <div className="flex flex-col lg:flex-row lg:items-center gap-6">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-3">
                        <div className="px-4 py-1.5 bg-[#F7F5F0] border border-[#0F2044]/10 rounded-2xl text-sm font-medium">
                          {plan.className} • {plan.subject}
                        </div>
                        <div className={`px-4 py-1 text-xs font-medium rounded-2xl ${statusStyle}`}>
                          {plan.status === "completed" ? "✓ Completed" : 
                           plan.status === "in-progress" ? "In Progress" : "Planned"}
                        </div>
                      </div>

                      <h3 className="font-semibold text-xl text-[#0F2044] mb-2">{plan.topic}</h3>
                      <p className="text-[#0F2044]/70 text-[15px] leading-relaxed line-clamp-2">
                        {plan.objectives}
                      </p>
                    </div>

                    <div className="grid grid-cols-2 lg:grid-cols-1 gap-x-8 gap-y-4 text-sm lg:w-80">
                      <div>
                        <p className="text-xs text-[#0F2044]/60">DATE</p>
                        <p className="font-medium flex items-center gap-1.5">
                          <Calendar className="w-4 h-4" />
                          {new Date(plan.date).toLocaleDateString('en-GB')}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-[#0F2044]/60">PERIOD</p>
                        <p className="font-medium flex items-center gap-1.5">
                          <Clock className="w-4 h-4" /> {plan.period}
                        </p>
                      </div>
                      <div className="col-span-2 lg:col-span-1">
                        <p className="text-xs text-[#0F2044]/60">ASSESSMENT</p>
                        <p className="font-medium text-[#0F2044]">{plan.assessment}</p>
                      </div>
                    </div>

                    <div className="flex gap-2 lg:ml-auto">
                      <button 
                        onClick={() => setViewingPlan(plan)}
                        className="p-3 hover:bg-blue-50 text-blue-600 rounded-2xl transition-colors"
                        title="View Full Plan"
                      >
                        <Eye className="w-5 h-5" />
                      </button>
                      <button 
                        onClick={() => handleEdit(plan)}
                        className="p-3 hover:bg-amber-50 text-amber-600 rounded-2xl transition-colors"
                        title="Edit Plan"
                      >
                        <Edit2 className="w-5 h-5" />
                      </button>
                      <button 
                        onClick={() => handleDelete(plan.id)}
                        className="p-3 hover:bg-red-50 text-red-600 rounded-2xl transition-colors"
                        title="Delete Plan"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="py-20 text-center text-[#0F2044]/50">
            No lesson plans found matching your criteria.
          </div>
        )}
      </div>

      <div className="text-center text-xs text-[#0F2044]/50 pt-4">
        Lesson plans help track curriculum coverage and support MANEB syllabus requirements. 
        Completed plans are automatically included in term reports.
      </div>

      {/* Modals */}
      <NewLessonPlanModal 
        isOpen={showNewModal} 
        onClose={() => setShowNewModal(false)} 
        onSave={handleSaveNewPlan} 
      />

      <ViewLessonPlanModal 
        plan={viewingPlan} 
        onClose={() => setViewingPlan(null)} 
      />
    </div>
  );
}

// ======================== NEW LESSON PLAN MODAL ========================
function NewLessonPlanModal({ isOpen, onClose, onSave }) {
  const [formData, setFormData] = useState({
    className: "Form 3A",
    subject: "Mathematics",
    date: "2026-04-14",
    period: "Period 2 (08:30 - 09:20)",
    topic: "",
    objectives: "",
    resources: "Textbook, Graph boards",
    assessment: "Class exercise + Homework",
    week: "12",
    term: "Term 2",
    status: "planned"
  });

  const classes = ["Form 3A", "Form 3B", "Form 4A", "Form 4B"];
  const subjects = ["Mathematics", "Physics", "Chemistry", "Biology", "English"];

  if (!isOpen) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!formData.topic.trim() || !formData.objectives.trim()) {
      alert("Please fill in Topic and Learning Objectives");
      return;
    }
    const newPlan = {
      id: Date.now(),
      ...formData,
    };
    onSave(newPlan);
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-3xl w-full max-w-lg max-h-[92vh] overflow-hidden shadow-2xl">
        <div className="px-6 py-5 border-b bg-[#F7F5F0] flex items-center justify-between">
          <h3 className="text-2xl font-semibold text-[#0F2044]">Create New Lesson Plan</h3>
          <button onClick={onClose} className="p-2 hover:bg-white rounded-2xl transition-colors">
            <X className="w-6 h-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6 overflow-y-auto">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-[#0F2044]/60 mb-1 block">CLASS</label>
              <select
                value={formData.className}
                onChange={(e) => setFormData({ ...formData, className: e.target.value })}
                className="w-full px-4 py-3 border border-[#0F2044]/10 rounded-2xl focus:outline-none focus:border-[#0F2044]"
              >
                {classes.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-[#0F2044]/60 mb-1 block">SUBJECT</label>
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
            <label className="text-xs font-medium text-[#0F2044]/60 mb-1 block">TOPIC / CHAPTER</label>
            <input
              type="text"
              placeholder="e.g. Factorisation of Quadratic Expressions"
              value={formData.topic}
              onChange={(e) => setFormData({ ...formData, topic: e.target.value })}
              className="w-full px-4 py-3 border border-[#0F2044]/10 rounded-2xl focus:outline-none focus:border-[#0F2044]"
              required
            />
          </div>

          <div>
            <label className="text-xs font-medium text-[#0F2044]/60 mb-1 block">LEARNING OBJECTIVES</label>
            <textarea
              rows={4}
              placeholder="By the end of the lesson, students should be able to..."
              value={formData.objectives}
              onChange={(e) => setFormData({ ...formData, objectives: e.target.value })}
              className="w-full px-4 py-3 border border-[#0F2044]/10 rounded-3xl resize-y focus:outline-none focus:border-[#0F2044]"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-[#0F2044]/60 mb-1 block">DATE</label>
              <input
                type="date"
                value={formData.date}
                onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                className="w-full px-4 py-3 border border-[#0F2044]/10 rounded-2xl focus:outline-none focus:border-[#0F2044]"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-[#0F2044]/60 mb-1 block">PERIOD</label>
              <input
                type="text"
                value={formData.period}
                onChange={(e) => setFormData({ ...formData, period: e.target.value })}
                placeholder="e.g. Period 2 (08:30 - 09:20)"
                className="w-full px-4 py-3 border border-[#0F2044]/10 rounded-2xl focus:outline-none focus:border-[#0F2044]"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-[#0F2044]/60 mb-1 block">RESOURCES</label>
              <input
                type="text"
                value={formData.resources}
                onChange={(e) => setFormData({ ...formData, resources: e.target.value })}
                className="w-full px-4 py-3 border border-[#0F2044]/10 rounded-2xl focus:outline-none focus:border-[#0F2044]"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-[#0F2044]/60 mb-1 block">ASSESSMENT</label>
              <input
                type="text"
                value={formData.assessment}
                onChange={(e) => setFormData({ ...formData, assessment: e.target.value })}
                className="w-full px-4 py-3 border border-[#0F2044]/10 rounded-2xl focus:outline-none focus:border-[#0F2044]"
              />
            </div>
          </div>

          <div className="flex gap-4 pt-6">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-4 text-sm font-medium border border-[#0F2044]/20 rounded-2xl hover:bg-[#F7F5F0]"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 py-4 bg-[#0F2044] text-white rounded-2xl font-medium hover:bg-[#1A2F5C] flex items-center justify-center gap-2"
            >
              <Save className="w-5 h-5" /> Save Lesson Plan
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ======================== VIEW LESSON PLAN MODAL ========================
function ViewLessonPlanModal({ plan, onClose }) {
  if (!plan) return null;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-3xl w-full max-w-2xl overflow-hidden shadow-2xl">
        <div className="px-6 py-5 border-b bg-[#F7F5F0] flex justify-between items-center">
          <h3 className="text-2xl font-semibold text-[#0F2044]">Lesson Plan Details</h3>
          <button onClick={onClose} className="p-2 hover:bg-white rounded-2xl transition-colors">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="p-8 space-y-8">
          <div className="flex justify-between">
            <div>
              <div className="text-xs text-[#0F2044]/60">CLASS & SUBJECT</div>
              <div className="text-2xl font-medium">{plan.className} — {plan.subject}</div>
            </div>
            <div className="text-right">
              <div className="text-xs text-[#0F2044]/60">DATE</div>
              <div className="font-medium">{new Date(plan.date).toLocaleDateString('en-GB')}</div>
            </div>
          </div>

          <div>
            <div className="text-xs text-[#0F2044]/60 mb-2">TOPIC</div>
            <div className="text-2xl font-semibold text-[#0F2044]">{plan.topic}</div>
          </div>

          <div>
            <div className="text-xs text-[#0F2044]/60 mb-2">LEARNING OBJECTIVES</div>
            <div className="bg-[#F7F5F0] p-6 rounded-3xl text-[15px] leading-relaxed border border-[#0F2044]/5">
              {plan.objectives}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-8">
            <div>
              <div className="text-xs text-[#0F2044]/60 mb-1">PERIOD</div>
              <div className="font-medium">{plan.period}</div>
            </div>
            <div>
              <div className="text-xs text-[#0F2044]/60 mb-1">WEEK / TERM</div>
              <div className="font-medium">Week {plan.week} • {plan.term}</div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-8">
            <div>
              <div className="text-xs text-[#0F2044]/60 mb-2">RESOURCES</div>
              <div className="font-medium text-[#0F2044]">{plan.resources}</div>
            </div>
            <div>
              <div className="text-xs text-[#0F2044]/60 mb-2">ASSESSMENT</div>
              <div className="font-medium text-[#0F2044]">{plan.assessment}</div>
            </div>
          </div>

          <div className="pt-6 border-t flex justify-end">
            <button
              onClick={onClose}
              className="px-10 py-3 border border-[#0F2044]/20 rounded-2xl hover:bg-[#F7F5F0] font-medium transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}