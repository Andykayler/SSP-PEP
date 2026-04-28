import { useState } from "react";
import {
  Calendar, Clock, BookOpen, Eye, Download,
  X, ChevronDown, Users, User
} from "lucide-react";

// ─── Data ─────────────────────────────────────────────────────────────────────

const TEACHERS = [
  { id: "T001", name: "Mr. Martin Khumbata", subjects: ["Mathematics", "Physics"] },
  { id: "T002", name: "Mrs. Esther Chirwa", subjects: ["English"] },
  { id: "T003", name: "Mr. Patrick Banda", subjects: ["Chemistry"] },
  { id: "T004", name: "Mr. Joseph Phiri", subjects: ["History"] },
];

const allLessonPlans = [
  {
    id: 1,
    teacherId: "T001",
    className: "Form 3A",
    subject: "Mathematics",
    date: "2026-04-14",
    period: "Period 2 (08:30 - 09:20)",
    topic: "Factorisation of Quadratic Expressions",
    objectives:
      "By the end of the lesson, students will factorise quadratic expressions using different methods and apply them to solve real-life problems.",
    resources: "Textbook Chapter 8, Graph boards, Whiteboard markers",
    assessment: "Class exercise + Homework from past MANEB papers",
    week: "12",
    term: "Term 2",
    status: "planned",
  },
  {
    id: 2,
    teacherId: "T001",
    className: "Form 4B",
    subject: "Physics",
    date: "2026-04-15",
    period: "Period 4 (11:30 - 12:20)",
    topic: "Applications of Newton's Laws of Motion",
    objectives:
      "Students will apply Newton's three laws to solve numerical problems and explain everyday phenomena.",
    resources: "Demo trolley, weights, Past papers",
    assessment: "Group activity + Short quiz",
    week: "12",
    term: "Term 2",
    status: "in-progress",
  },
  {
    id: 3,
    teacherId: "T001",
    className: "Form 3A",
    subject: "Mathematics",
    date: "2026-04-10",
    period: "Period 1 (07:30 - 08:20)",
    topic: "Introduction to Quadratic Equations",
    objectives:
      "Understand the standard form ax² + bx + c = 0 and identify coefficients.",
    resources: "Whiteboard, Textbook pg 85-90",
    assessment: "Oral questions and board work",
    week: "11",
    term: "Term 2",
    status: "completed",
  },
  {
    id: 4,
    teacherId: "T002",
    className: "Form 2B",
    subject: "English",
    date: "2026-04-14",
    period: "Period 3 (09:30 - 10:20)",
    topic: "Narrative Writing: Structure and Technique",
    objectives:
      "Students will identify the key elements of narrative writing and produce a structured short story with a clear beginning, climax, and resolution.",
    resources: "Sample narrative texts, Writing exercise sheets",
    assessment: "Draft short story submission",
    week: "12",
    term: "Term 2",
    status: "planned",
  },
  {
    id: 5,
    teacherId: "T002",
    className: "Form 1A",
    subject: "English",
    date: "2026-04-11",
    period: "Period 2 (08:30 - 09:20)",
    topic: "Parts of Speech: Nouns and Pronouns",
    objectives:
      "Identify and correctly use nouns and pronouns in written and spoken sentences.",
    resources: "Grammar workbook, Flashcards",
    assessment: "Fill-in-the-blanks worksheet",
    week: "11",
    term: "Term 2",
    status: "completed",
  },
  {
    id: 6,
    teacherId: "T003",
    className: "Form 4A",
    subject: "Chemistry",
    date: "2026-04-15",
    period: "Period 5 (12:30 - 13:20)",
    topic: "Electrolysis and Its Industrial Applications",
    objectives:
      "Students will explain the process of electrolysis and describe its applications in electroplating and extraction of metals.",
    resources: "Electrolysis apparatus, Copper sulphate solution, Textbook",
    assessment: "Practical report write-up",
    week: "12",
    term: "Term 2",
    status: "in-progress",
  },
  {
    id: 7,
    teacherId: "T004",
    className: "Form 2A",
    subject: "History",
    date: "2026-04-13",
    period: "Period 1 (07:30 - 08:20)",
    topic: "The Scramble for Africa",
    objectives:
      "Students will identify the causes of the Berlin Conference, explain how Africa was partitioned, and assess the impact on African societies.",
    resources: "Map of Africa 1884, Textbook Chapter 5",
    assessment: "Map labelling + Short essay",
    week: "12",
    term: "Term 2",
    status: "planned",
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_STYLES = {
  completed: "bg-emerald-100 text-emerald-700",
  "in-progress": "bg-blue-100 text-blue-700",
  planned: "bg-amber-100 text-amber-700",
};

const STATUS_LABELS = {
  completed: "Completed",
  "in-progress": "In progress",
  planned: "Planned",
};

function initials(name) {
  return name
    .split(" ")
    .filter((w) => /^[A-Z]/.test(w))
    .slice(0, 2)
    .map((w) => w[0])
    .join("");
}

function teacherById(id) {
  return TEACHERS.find((t) => t.id === id);
}

// ─── View Lesson Plan Modal ───────────────────────────────────────────────────

function ViewLessonPlanModal({ plan, onClose }) {
  if (!plan) return null;
  const teacher = teacherById(plan.teacherId);

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-3xl w-full max-w-2xl overflow-hidden shadow-2xl">
        <div className="px-6 py-5 border-b bg-[#F7F5F0] flex justify-between items-center">
          <h3 className="text-xl font-bold text-[#0F2044]">Lesson plan details</h3>
          <button onClick={onClose} className="p-2 hover:bg-white rounded-2xl transition-colors">
            <X className="w-5 h-5 text-[#0F2044]/60" />
          </button>
        </div>

        <div className="p-8 space-y-7 overflow-y-auto max-h-[80vh]">
          {/* Teacher pill */}
          <div className="flex items-center gap-3 px-4 py-3 bg-[#0F2044]/5 rounded-2xl w-fit">
            <div className="w-8 h-8 rounded-full bg-[#0F2044] flex items-center justify-center text-white text-xs font-bold">
              {initials(teacher?.name || "")}
            </div>
            <div>
              <p className="text-sm font-medium text-[#0F2044]">{teacher?.name}</p>
              <p className="text-xs text-[#0F2044]/50">{plan.subject}</p>
            </div>
          </div>

          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs text-[#0F2044]/50 mb-1">Class &amp; subject</p>
              <p className="text-xl font-bold text-[#0F2044]">{plan.className} — {plan.subject}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-[#0F2044]/50 mb-1">Date</p>
              <p className="font-medium text-[#0F2044]">
                {new Date(plan.date).toLocaleDateString("en-GB")}
              </p>
            </div>
          </div>

          <div>
            <p className="text-xs text-[#0F2044]/50 mb-1">Topic</p>
            <p className="text-2xl font-bold text-[#0F2044]">{plan.topic}</p>
          </div>

          <div>
            <p className="text-xs text-[#0F2044]/50 mb-2">Learning objectives</p>
            <div className="bg-[#F7F5F0] px-6 py-5 rounded-2xl text-sm leading-relaxed text-[#0F2044]/80 border border-[#0F2044]/5">
              {plan.objectives}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-6">
            <div>
              <p className="text-xs text-[#0F2044]/50 mb-1">Period</p>
              <p className="font-medium text-[#0F2044] text-sm">{plan.period}</p>
            </div>
            <div>
              <p className="text-xs text-[#0F2044]/50 mb-1">Week / Term</p>
              <p className="font-medium text-[#0F2044] text-sm">Week {plan.week} &bull; {plan.term}</p>
            </div>
            <div>
              <p className="text-xs text-[#0F2044]/50 mb-1">Resources</p>
              <p className="font-medium text-[#0F2044] text-sm">{plan.resources}</p>
            </div>
            <div>
              <p className="text-xs text-[#0F2044]/50 mb-1">Assessment</p>
              <p className="font-medium text-[#0F2044] text-sm">{plan.assessment}</p>
            </div>
          </div>

          <div>
            <p className="text-xs text-[#0F2044]/50 mb-1">Status</p>
            <span className={`inline-block px-4 py-1 rounded-full text-xs font-medium ${STATUS_STYLES[plan.status]}`}>
              {STATUS_LABELS[plan.status]}
            </span>
          </div>

          <div className="pt-4 border-t flex justify-end">
            <button
              onClick={onClose}
              className="px-8 py-3 border border-[#0F2044]/20 rounded-2xl hover:bg-[#F7F5F0] font-medium transition-colors text-sm"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function ClassPlanningModule() {
  const [selectedTeacher, setSelectedTeacher] = useState("all");
  const [selectedStatus, setSelectedStatus] = useState("all");
  const [selectedSubject, setSelectedSubject] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [viewingPlan, setViewingPlan] = useState(null);

  const allSubjects = [...new Set(allLessonPlans.map((p) => p.subject))].sort();

  const filtered = allLessonPlans.filter((plan) => {
    const q = searchTerm.toLowerCase();
    const matchSearch =
      plan.topic.toLowerCase().includes(q) ||
      plan.className.toLowerCase().includes(q) ||
      plan.subject.toLowerCase().includes(q) ||
      teacherById(plan.teacherId)?.name.toLowerCase().includes(q);
    const matchTeacher = selectedTeacher === "all" || plan.teacherId === selectedTeacher;
    const matchStatus = selectedStatus === "all" || plan.status === selectedStatus;
    const matchSubject = selectedSubject === "all" || plan.subject === selectedSubject;
    return matchSearch && matchTeacher && matchStatus && matchSubject;
  });

  // Summary stats
  const totalPlans = allLessonPlans.length;
  const completedCount = allLessonPlans.filter((p) => p.status === "completed").length;
  const inProgressCount = allLessonPlans.filter((p) => p.status === "in-progress").length;
  const plannedCount = allLessonPlans.filter((p) => p.status === "planned").length;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2
            className="text-3xl font-bold text-[#0F2044]"
            style={{ fontFamily: "'Playfair Display', serif" }}
          >
            Lesson Plans
          </h2>
          <p className="text-[#0F2044]/60 mt-1">
            All teaching staff &bull; Term 2, 2026 &bull; {totalPlans} plans total
          </p>
        </div>

        <button className="flex items-center gap-2 px-6 py-3.5 border border-[#0F2044]/20 rounded-2xl hover:bg-[#F7F5F0] transition-colors text-sm font-medium text-[#0F2044]">
          <Download className="w-4 h-4" />
          Export all plans
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
        {[
          { label: "Total plans", value: totalPlans, color: "text-[#0F2044]" },
          { label: "Completed", value: completedCount, color: "text-emerald-600" },
          { label: "In progress", value: inProgressCount, color: "text-blue-600" },
          { label: "Planned", value: plannedCount, color: "text-amber-600" },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-white rounded-3xl p-6 border border-[#0F2044]/8">
            <p className="text-sm text-[#0F2044]/60">{label}</p>
            <p className={`text-4xl font-bold mt-2 ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="bg-white rounded-3xl p-6 border border-[#0F2044]/8">
        <div className="flex flex-wrap gap-4">
          {/* Search */}
          <div className="flex-1 relative min-w-[220px]">
            <BookOpen className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#0F2044]/40" />
            <input
              type="text"
              placeholder="Search topic, class, subject or teacher…"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-11 pr-4 py-3.5 bg-[#F7F5F0] border border-[#0F2044]/10 rounded-2xl focus:outline-none focus:border-[#0F2044]/30 text-sm"
            />
          </div>

          {/* Teacher filter */}
          <select
            value={selectedTeacher}
            onChange={(e) => setSelectedTeacher(e.target.value)}
            className="px-5 py-3.5 bg-white border border-[#0F2044]/10 rounded-2xl focus:outline-none text-sm min-w-[180px]"
          >
            <option value="all">All teachers</option>
            {TEACHERS.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>

          {/* Subject filter */}
          <select
            value={selectedSubject}
            onChange={(e) => setSelectedSubject(e.target.value)}
            className="px-5 py-3.5 bg-white border border-[#0F2044]/10 rounded-2xl focus:outline-none text-sm min-w-[150px]"
          >
            <option value="all">All subjects</option>
            {allSubjects.map((s) => <option key={s}>{s}</option>)}
          </select>

          {/* Status filter */}
          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="px-5 py-3.5 bg-white border border-[#0F2044]/10 rounded-2xl focus:outline-none text-sm min-w-[140px]"
          >
            <option value="all">All statuses</option>
            <option value="planned">Planned</option>
            <option value="in-progress">In progress</option>
            <option value="completed">Completed</option>
          </select>
        </div>
      </div>

      {/* Teacher summary pills — quick jump */}
      <div className="flex flex-wrap gap-3">
        <button
          onClick={() => setSelectedTeacher("all")}
          className={`flex items-center gap-2 px-4 py-2 rounded-2xl border text-sm font-medium transition-colors
            ${selectedTeacher === "all"
              ? "bg-[#0F2044] text-white border-[#0F2044]"
              : "border-[#0F2044]/15 text-[#0F2044]/70 hover:border-[#0F2044]/30 hover:bg-[#F7F5F0]"
            }`}
        >
          <Users className="w-4 h-4" />
          All staff
        </button>
        {TEACHERS.map((t) => {
          const count = allLessonPlans.filter((p) => p.teacherId === t.id).length;
          const active = selectedTeacher === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setSelectedTeacher(active ? "all" : t.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-2xl border text-sm font-medium transition-colors
                ${active
                  ? "bg-[#0F2044] text-white border-[#0F2044]"
                  : "border-[#0F2044]/15 text-[#0F2044]/70 hover:border-[#0F2044]/30 hover:bg-[#F7F5F0]"
                }`}
            >
              <span>{t.name.split(" ").slice(-1)[0]}</span>
              <span className={`text-xs px-2 py-0.5 rounded-full ${active ? "bg-white/20" : "bg-[#0F2044]/8"}`}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Results label */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-[#0F2044]/50">
          Showing {filtered.length} of {totalPlans} plans
          {selectedTeacher !== "all" && ` for ${teacherById(selectedTeacher)?.name}`}
        </p>
      </div>

      {/* Plans List */}
      <div className="bg-white rounded-3xl border border-[#0F2044]/8 overflow-hidden">
        {filtered.length === 0 ? (
          <div className="py-20 text-center text-[#0F2044]/40 text-sm">
            No lesson plans match your filters.
          </div>
        ) : (
          <div className="divide-y divide-[#0F2044]/5">
            {filtered.map((plan) => {
              const teacher = teacherById(plan.teacherId);
              return (
                <div key={plan.id} className="p-6 hover:bg-[#FAFAF8] transition-colors">
                  <div className="flex flex-col lg:flex-row lg:items-start gap-5">
                    {/* Teacher avatar */}
                    <div className="flex-shrink-0 flex items-center gap-3 lg:flex-col lg:items-center lg:w-20 lg:pt-1">
                      <div className="w-10 h-10 rounded-full bg-[#0F2044] flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                        {initials(teacher?.name || "")}
                      </div>
                      <p className="text-xs text-[#0F2044]/50 text-center leading-tight hidden lg:block">
                        {teacher?.name.split(" ").slice(-1)[0]}
                      </p>
                      <p className="text-xs text-[#0F2044]/60 font-medium lg:hidden">{teacher?.name}</p>
                    </div>

                    {/* Main content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-2">
                        <span className="px-3 py-1 bg-[#F7F5F0] border border-[#0F2044]/10 rounded-xl text-xs font-medium text-[#0F2044]/70">
                          {plan.className} &bull; {plan.subject}
                        </span>
                        <span className={`px-3 py-1 text-xs font-medium rounded-xl ${STATUS_STYLES[plan.status]}`}>
                          {STATUS_LABELS[plan.status]}
                        </span>
                        <span className="text-xs text-[#0F2044]/40 hidden lg:inline">
                          Week {plan.week}
                        </span>
                      </div>

                      <h3 className="font-bold text-lg text-[#0F2044] mb-1 leading-snug">
                        {plan.topic}
                      </h3>
                      <p className="text-sm text-[#0F2044]/60 leading-relaxed line-clamp-2">
                        {plan.objectives}
                      </p>

                      <div className="flex flex-wrap gap-5 mt-3">
                        <span className="flex items-center gap-1.5 text-xs text-[#0F2044]/50">
                          <Calendar className="w-3.5 h-3.5" />
                          {new Date(plan.date).toLocaleDateString("en-GB")}
                        </span>
                        <span className="flex items-center gap-1.5 text-xs text-[#0F2044]/50">
                          <Clock className="w-3.5 h-3.5" />
                          {plan.period}
                        </span>
                      </div>
                    </div>

                    {/* View button */}
                    <div className="flex-shrink-0 flex items-start">
                      <button
                        onClick={() => setViewingPlan(plan)}
                        className="flex items-center gap-2 px-5 py-2.5 border border-[#0F2044]/15 rounded-2xl text-sm font-medium hover:bg-[#F7F5F0] hover:border-[#0F2044]/30 transition-colors text-[#0F2044]/70"
                      >
                        <Eye className="w-4 h-4" />
                        View plan
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <p className="text-center text-xs text-[#0F2044]/40 pt-2">
        Lesson plans are submitted by teaching staff and reviewed by the head teacher.
        Completed plans are automatically included in term reports.
      </p>

      {/* View Modal */}
      <ViewLessonPlanModal plan={viewingPlan} onClose={() => setViewingPlan(null)} />
    </div>
  );
}