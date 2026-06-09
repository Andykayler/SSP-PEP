import { useState } from "react";
import { 
  Plus, Calendar, Clock, BookOpen, Users, Edit2, Eye, 
  Trash2, Download, CheckCircle, AlertCircle, Target, X, Save 
} from "lucide-react";

// ========================
// 1. LESSON PLAN CARD COMPONENT
// ========================
function LessonPlanCard({ plan, onView, onEdit, onDelete }) {
  const statusStyles = {
    planned: "bg-amber-100 text-amber-700",
    "in-progress": "bg-blue-100 text-blue-700",
    completed: "bg-green-100 text-green-700"
  };

  const statusText = {
    planned: "Planned",
    "in-progress": "In Progress",
    completed: "Completed"
  };

  return (
    <div className="bg-app-surface rounded-3xl border border-app-border overflow-hidden hover:shadow-md transition-all">
      <div className="px-6 py-5 border-b bg-app-bg flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="px-4 py-1.5 bg-app-surface border border-app-border rounded-2xl text-sm font-medium">
            {plan.className} • {plan.subject}
          </div>
          <div className={`px-4 py-1 text-xs font-medium rounded-2xl ${statusStyles[plan.status]}`}>
            {statusText[plan.status]}
          </div>
        </div>

        <div className="text-xs text-app-text/60 font-mono">
          Week {plan.week} • {plan.term}
        </div>
      </div>

      <div className="p-6 space-y-5">
        <div>
          <h3 className="font-semibold text-2xl text-app-text leading-tight">{plan.topic}</h3>
          <p className="text-app-text/70 mt-2 text-[15px]">{plan.objectives}</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 text-sm">
          <div>
            <p className="text-xs text-app-text/60 mb-1">DATE & PERIOD</p>
            <div className="flex items-center gap-2 font-medium">
              <Calendar className="w-4 h-4 text-app-text/70" />
              {new Date(plan.date).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}
              <span className="text-app-text/50">•</span>
              <Clock className="w-4 h-4 text-app-text/70" />
              {plan.period}
            </div>
          </div>

          <div>
            <p className="text-xs text-app-text/60 mb-1">RESOURCES</p>
            <p className="font-medium text-app-text">{plan.resources}</p>
          </div>

          <div>
            <p className="text-xs text-app-text/60 mb-1">ASSESSMENT</p>
            <p className="font-medium text-app-text">{plan.assessment}</p>
          </div>
        </div>

        <div className="flex gap-3 pt-2">
          <button
            onClick={() => onView(plan)}
            className="flex-1 flex items-center justify-center gap-2 py-3 border border-app-border hover:bg-app-bg rounded-2xl text-sm font-medium transition-colors"
          >
            <Eye className="w-4 h-4" /> View Full Plan
          </button>
          <button
            onClick={() => onEdit(plan)}
            className="flex-1 flex items-center justify-center gap-2 py-3 border border-app-border hover:bg-app-bg rounded-2xl text-sm font-medium transition-colors"
          >
            <Edit2 className="w-4 h-4" /> Edit
          </button>
          <button
            onClick={() => onDelete(plan.id)}
            className="p-3 text-red-600 hover:bg-red-50 border border-red-200 rounded-2xl transition-colors"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

// ========================
// 2. NEW LESSON PLAN MODAL
// ========================
function NewLessonPlanModal({ isOpen, onClose, onSave }) {
  const [formData, setFormData] = useState({
    className: "Form 3A",
    subject: "Mathematics",
    date: "2026-04-14",
    period: "Period 2 (08:30 - 09:20)",
    topic: "",
    objectives: "",
    resources: "Textbook, Graph paper, Scientific calculator",
    assessment: "Class exercise + Homework questions",
    week: "12",
    term: "Term 2",
    status: "planned"
  });

  const classes = ["Form 3A", "Form 3B", "Form 4A", "Form 4B"];
  const subjects = ["Mathematics", "Physics", "Chemistry", "Biology", "English"];

  if (!isOpen) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    const newPlan = {
      id: Date.now(),
      ...formData,
    };
    onSave(newPlan);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-app-surface rounded-3xl w-full max-w-2xl max-h-[95vh] overflow-hidden shadow-2xl">
        {/* Modal Header */}
        <div className="px-6 py-5 border-b bg-app-bg flex items-center justify-between">
          <h3 className="text-2xl font-semibold text-app-text">New Lesson Plan</h3>
          <button onClick={onClose} className="p-2 hover:bg-app-surface rounded-2xl transition-colors">
            <X className="w-6 h-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6 overflow-y-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className="text-xs font-medium text-app-text/60 mb-1 block">CLASS</label>
              <select
                value={formData.className}
                onChange={(e) => setFormData({ ...formData, className: e.target.value })}
                className="w-full px-4 py-3 border border-app-border rounded-2xl focus:outline-none focus:border-[#0F2044]"
              >
                {classes.map(cls => <option key={cls} value={cls}>{cls}</option>)}
              </select>
            </div>

            <div>
              <label className="text-xs font-medium text-app-text/60 mb-1 block">SUBJECT</label>
              <select
                value={formData.subject}
                onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                className="w-full px-4 py-3 border border-app-border rounded-2xl focus:outline-none focus:border-[#0F2044]"
              >
                {subjects.map(sub => <option key={sub} value={sub}>{sub}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className="text-xs font-medium text-app-text/60 mb-1 block">DATE</label>
              <input
                type="date"
                value={formData.date}
                onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                className="w-full px-4 py-3 border border-app-border rounded-2xl"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-app-text/60 mb-1 block">PERIOD</label>
              <input
                type="text"
                value={formData.period}
                onChange={(e) => setFormData({ ...formData, period: e.target.value })}
                placeholder="e.g. Period 3 (10:30 - 11:20)"
                className="w-full px-4 py-3 border border-app-border rounded-2xl"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-app-text/60 mb-1 block">TOPIC / CHAPTER</label>
            <input
              type="text"
              placeholder="e.g. Solving Simultaneous Equations"
              value={formData.topic}
              onChange={(e) => setFormData({ ...formData, topic: e.target.value })}
              className="w-full px-4 py-3 border border-app-border rounded-2xl"
              required
            />
          </div>

          <div>
            <label className="text-xs font-medium text-app-text/60 mb-1 block">LEARNING OBJECTIVES</label>
            <textarea
              rows={4}
              placeholder="Students should be able to..."
              value={formData.objectives}
              onChange={(e) => setFormData({ ...formData, objectives: e.target.value })}
              className="w-full px-4 py-3 border border-app-border rounded-3xl resize-y min-h-[100px]"
              required
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className="text-xs font-medium text-app-text/60 mb-1 block">RESOURCES / TEACHING AIDS</label>
              <input
                type="text"
                value={formData.resources}
                onChange={(e) => setFormData({ ...formData, resources: e.target.value })}
                className="w-full px-4 py-3 border border-app-border rounded-2xl"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-app-text/60 mb-1 block">ASSESSMENT METHOD</label>
              <input
                type="text"
                value={formData.assessment}
                onChange={(e) => setFormData({ ...formData, assessment: e.target.value })}
                className="w-full px-4 py-3 border border-app-border rounded-2xl"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-5">
            <div>
              <label className="text-xs font-medium text-app-text/60 mb-1 block">WEEK</label>
              <input
                type="text"
                value={formData.week}
                onChange={(e) => setFormData({ ...formData, week: e.target.value })}
                className="w-full px-4 py-3 border border-app-border rounded-2xl"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-app-text/60 mb-1 block">TERM</label>
              <input
                type="text"
                value={formData.term}
                onChange={(e) => setFormData({ ...formData, term: e.target.value })}
                className="w-full px-4 py-3 border border-app-border rounded-2xl"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-app-text/60 mb-1 block">STATUS</label>
              <select
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                className="w-full px-4 py-3 border border-app-border rounded-2xl"
              >
                <option value="planned">Planned</option>
                <option value="in-progress">In Progress</option>
                <option value="completed">Completed</option>
              </select>
            </div>
          </div>

          <div className="flex gap-4 pt-6">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-4 text-sm font-medium border border-app-border rounded-2xl hover:bg-app-bg"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 py-4 bg-app-primary hover:bg-[#1A2F5C] text-white rounded-2xl font-medium flex items-center justify-center gap-2"
            >
              <Save className="w-5 h-5" /> Save Lesson Plan
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ========================
// 3. FULL LESSON PLAN VIEW MODAL
// ========================
function ViewLessonPlanModal({ plan, onClose }) {
  if (!plan) return null;

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-app-surface rounded-3xl w-full max-w-2xl overflow-hidden">
        <div className="px-6 py-5 border-b bg-app-bg flex justify-between items-center">
          <h3 className="text-2xl font-semibold text-app-text">Lesson Plan Details</h3>
          <button onClick={onClose} className="p-2 hover:bg-app-surface rounded-2xl">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="p-8 space-y-8">
          <div>
            <div className="text-xs text-app-text/60">CLASS & SUBJECT</div>
            <div className="text-2xl font-medium">{plan.className} — {plan.subject}</div>
          </div>

          <div>
            <div className="text-xs text-app-text/60">TOPIC</div>
            <div className="text-2xl font-semibold text-app-text">{plan.topic}</div>
          </div>

          <div>
            <div className="text-xs text-app-text/60 mb-2">LEARNING OBJECTIVES</div>
            <div className="bg-app-bg p-5 rounded-3xl text-[15px] leading-relaxed">
              {plan.objectives}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-8">
            <div>
              <div className="text-xs text-app-text/60 mb-1">DATE & PERIOD</div>
              <div className="font-medium">
                {new Date(plan.date).toLocaleDateString('en-GB')} • {plan.period}
              </div>
            </div>
            <div>
              <div className="text-xs text-app-text/60 mb-1">WEEK / TERM</div>
              <div className="font-medium">Week {plan.week} • {plan.term}</div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-8">
            <div>
              <div className="text-xs text-app-text/60 mb-2">RESOURCES</div>
              <div className="text-app-text">{plan.resources}</div>
            </div>
            <div>
              <div className="text-xs text-app-text/60 mb-2">ASSESSMENT</div>
              <div className="text-app-text">{plan.assessment}</div>
            </div>
          </div>

          <div className="pt-4 border-t flex justify-end">
            <button
              onClick={onClose}
              className="px-10 py-3 border border-app-border rounded-2xl hover:bg-app-bg font-medium"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ========================
// 4. MAIN CLASS PLANNING MODULE
// ========================
export default function ClassPlanningModule() {
  const [activeFilter, setActiveFilter] = useState("all");
  const [showNewModal, setShowNewModal] = useState(false);
  const [viewingPlan, setViewingPlan] = useState(null);
  const [editingPlan, setEditingPlan] = useState(null);

  const [lessonPlans, setLessonPlans] = useState([
    {
      id: 1,
      className: "Form 3A",
      subject: "Mathematics",
      date: "2026-04-14",
      period: "Period 2 (08:30 - 09:20)",
      topic: "Factorisation of Quadratic Expressions",
      objectives: "By the end of the lesson, students will be able to factorise quadratic expressions using different methods and apply them to solve real-life problems.",
      resources: "Textbook (Chapter 8), Graph boards, Whiteboard markers",
      assessment: "Class exercise (10 questions) + Homework from past MANEB papers",
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
    if (activeFilter === "completed") return plan.status === "completed";
    if (activeFilter === "this-week") return true; // You can enhance this logic later
    return true;
  });

  const handleSavePlan = (newPlan) => {
    setLessonPlans(prev => [newPlan, ...prev]);
  };

  const handleDelete = (id) => {
    if (window.confirm("Are you sure you want to delete this lesson plan?")) {
      setLessonPlans(prev => prev.filter(p => p.id !== id));
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold text-app-text" style={{ fontFamily: "'Playfair Display', serif" }}>
            Class Planning & Lesson Plans
          </h2>
          <p className="text-app-text/60">Mr. Martin Khumbata • Mathematics & Physics Teacher</p>
        </div>

        <button
          onClick={() => setShowNewModal(true)}
          className="flex items-center gap-2 px-6 py-3 bg-app-primary hover:bg-[#1A2F5C] text-white rounded-2xl font-medium transition-colors"
        >
          <Plus className="w-5 h-5" /> New Lesson Plan
        </button>
      </div>

      {/* Filter Tabs */}
      <div className="bg-app-surface rounded-3xl p-1 border border-app-border inline-flex">
        {[
          { id: "all", label: "All Lesson Plans" },
          { id: "this-week", label: "This Week" },
          { id: "completed", label: "Completed" },
        ].map((filter) => (
          <button
            key={filter.id}
            onClick={() => setActiveFilter(filter.id)}
            className={`px-7 py-3 text-sm font-medium rounded-2xl transition-all ${
              activeFilter === filter.id 
                ? "bg-app-primary text-white shadow-md" 
                : "hover:bg-[#FAFAF8] text-app-text/70"
            }`}
          >
            {filter.label}
          </button>
        ))}
      </div>

      {/* Lesson Plans List */}
      <div className="space-y-6">
        {filteredPlans.length > 0 ? (
          filteredPlans.map((plan) => (
            <LessonPlanCard
              key={plan.id}
              plan={plan}
              onView={setViewingPlan}
              onEdit={(p) => alert(`Edit functionality for plan "${p.topic}" can be expanded here`)}
              onDelete={handleDelete}
            />
          ))
        ) : (
          <div className="bg-app-surface rounded-3xl py-24 text-center text-app-text/50">
            No lesson plans found.
          </div>
        )}
      </div>

      <div className="text-center text-xs text-app-text/50 pt-4">
        All lesson plans are automatically considered for termly curriculum coverage reports and MANEB compliance.
      </div>

      {/* Modals */}
      <NewLessonPlanModal
        isOpen={showNewModal}
        onClose={() => setShowNewModal(false)}
        onSave={handleSavePlan}
      />

      <ViewLessonPlanModal
        plan={viewingPlan}
        onClose={() => setViewingPlan(null)}
      />
    </div>
  );
}