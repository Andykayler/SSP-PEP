// modules/TimetableModule.jsx
import { useState } from "react";
import { Calendar, Clock, Users, MapPin } from "lucide-react";

const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];

const schoolWideTimetable = {
  "Form 3A": {
    Monday: [
      { time: "07:30 - 08:20", subject: "Mathematics", teacher: "Mr. Martin Khumbata", venue: "Classroom 12" },
      { time: "08:30 - 09:20", subject: "English", teacher: "Mrs. Esther Chirwa", venue: "Classroom 12" },
      { time: "09:30 - 10:20", subject: "Physics", teacher: "Mr. Patrick Banda", venue: "Science Lab 2" },
      { time: "10:40 - 11:30", subject: "Biology", teacher: "Ms. Grace Manda", venue: "Classroom 12" },
      { time: "11:40 - 12:30", subject: "History", teacher: "Mr. Joseph Phiri", venue: "Classroom 12" },
      { time: "14:00 - 14:50", subject: "Physical Education", teacher: "Mr. Kelvin Mwase", venue: "Sports Field" },
    ],
    Tuesday: [
      { time: "07:30 - 08:20", subject: "Chemistry", teacher: "Mrs. Jane Mphande", venue: "Science Lab 1" },
      { time: "08:30 - 09:20", subject: "Mathematics", teacher: "Mr. Martin Khumbata", venue: "Classroom 12" },
      // ... more periods
    ],
  },
  "Form 4B": {
    Monday: [
      { time: "07:30 - 08:20", subject: "Mathematics", teacher: "Mr. Martin Khumbata", venue: "Classroom 8" },
      { time: "08:30 - 09:20", subject: "English", teacher: "Mrs. Esther Chirwa", venue: "Classroom 8" },
      { time: "09:30 - 10:20", subject: "Biology", teacher: "Ms. Grace Manda", venue: "Science Lab 2" },
    ],
  }
};

const myPersonalTimetable = [
  { day: "Monday", time: "07:30 - 08:20", subject: "Mathematics", class: "Form 3A", venue: "Classroom 12" },
  { day: "Monday", time: "08:30 - 09:20", subject: "Mathematics", class: "Form 4B", venue: "Classroom 8" },
  { day: "Tuesday", time: "07:30 - 08:20", subject: "Mathematics", class: "Form 3A", venue: "Classroom 12" },
  { day: "Wednesday", time: "09:30 - 10:20", subject: "Physics", class: "Form 3A", venue: "Science Lab 2" },
  { day: "Thursday", time: "11:40 - 12:30", subject: "Mathematics", class: "Form 4B", venue: "Classroom 8" },
  { day: "Friday", time: "14:00 - 14:50", subject: "Mathematics", class: "Form 3A", venue: "Classroom 12" },
];

export default function TimetableModule() {
  const [viewMode, setViewMode] = useState("personal"); // "personal" or "school"
  const [selectedClass, setSelectedClass] = useState("Form 3A");
  const [selectedDay, setSelectedDay] = useState("Monday");

  const currentSchoolTimetable = schoolWideTimetable[selectedClass] || schoolWideTimetable["Form 3A"];

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold text-[#0F2044]" style={{ fontFamily: "'Playfair Display', serif" }}>
            Timetable
          </h2>
          <p className="text-[#0F2044]/60">Term 2 • 2026 Academic Year</p>
        </div>

        <div className="flex border border-[#0F2044]/10 rounded-3xl p-1 bg-white">
          <button
            onClick={() => setViewMode("personal")}
            className={`px-8 py-3 rounded-3xl font-medium transition-all ${viewMode === "personal" ? "bg-[#0F2044] text-white" : "text-[#0F2044]/70"}`}
          >
            My Timetable
          </button>
          <button
            onClick={() => setViewMode("school")}
            className={`px-8 py-3 rounded-3xl font-medium transition-all ${viewMode === "school" ? "bg-[#0F2044] text-white" : "text-[#0F2044]/70"}`}
          >
            School-wide Timetable
          </button>
        </div>
      </div>

      {viewMode === "personal" && (
        <>
          <div className="bg-white rounded-3xl p-8 border border-[#0F2044]/8">
            <div className="flex items-center justify-between mb-8">
              <h3 className="text-2xl font-semibold text-[#0F2044]">Mr. Martin Khumbata - Personal Timetable</h3>
              <div className="text-sm text-[#0F2044]/60">Mathematics & Physics Teacher</div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
              {days.map((day) => (
                <div key={day} className="bg-[#F7F5F0] rounded-3xl p-6">
                  <div className="font-bold text-lg mb-6 text-center border-b border-[#0F2044]/10 pb-4">{day}</div>
                  
                  <div className="space-y-4">
                    {myPersonalTimetable
                      .filter(item => item.day === day)
                      .map((lesson, idx) => (
                        <div key={idx} className="bg-white rounded-2xl p-5 shadow-sm">
                          <div className="flex justify-between items-start">
                            <div>
                              <div className="font-semibold text-[#0F2044]">{lesson.subject}</div>
                              <div className="text-sm text-[#0F2044]/60 mt-1">{lesson.class}</div>
                            </div>
                            <div className="text-xs bg-[#F4B400]/10 text-[#F4B400] px-3 py-1 rounded-xl font-medium">
                              {lesson.time}
                            </div>
                          </div>
                          <div className="mt-4 flex items-center gap-2 text-xs text-[#0F2044]/60">
                            <MapPin className="w-4 h-4" /> {lesson.venue}
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {viewMode === "school" && (
        <>
          {/* Class & Day Selector */}
          <div className="bg-white rounded-3xl p-6 border border-[#0F2044]/8 flex flex-wrap gap-4 items-center">
            <div className="flex items-center gap-3">
              <Users className="w-6 h-6 text-[#F4B400]" />
              <select 
                value={selectedClass}
                onChange={(e) => setSelectedClass(e.target.value)}
                className="text-xl font-semibold bg-transparent focus:outline-none border border-[#0F2044]/10 rounded-2xl px-6 py-3"
              >
                <option value="Form 3A">Form 3A</option>
                <option value="Form 4B">Form 4B</option>
                <option value="Form 2C">Form 2C</option>
                <option value="Form 1A">Form 1A</option>
              </select>
            </div>

            <div className="flex gap-2 ml-auto">
              {days.map((day) => (
                <button
                  key={day}
                  onClick={() => setSelectedDay(day)}
                  className={`px-6 py-3 rounded-2xl font-medium transition-all ${selectedDay === day 
                    ? "bg-[#0F2044] text-white" 
                    : "bg-white border border-[#0F2044]/10 hover:bg-[#F7F5F0]"}`}
                >
                  {day}
                </button>
              ))}
            </div>
          </div>

          {/* Timetable Grid */}
          <div className="bg-white rounded-3xl overflow-hidden border border-[#0F2044]/8">
            <div className="p-8 border-b bg-[#F7F5F0]">
              <h3 className="text-2xl font-semibold">
                {selectedClass} • {selectedDay} Timetable
              </h3>
            </div>

            <div className="divide-y">
              {currentSchoolTimetable[selectedDay]?.map((period, index) => (
                <div key={index} className="p-8 flex flex-col md:flex-row gap-8 hover:bg-[#F7F5F0]/60 transition-colors">
                  <div className="md:w-48 flex-shrink-0">
                    <div className="flex items-center gap-3">
                      <Clock className="w-6 h-6 text-[#F4B400]" />
                      <div>
                        <div className="font-mono font-semibold text-lg">{period.time}</div>
                      </div>
                    </div>
                  </div>

                  <div className="flex-1">
                    <div className="text-2xl font-semibold text-[#0F2044]">{period.subject}</div>
                    <div className="text-[#0F2044]/70 mt-2">Taught by {period.teacher}</div>
                  </div>

                  <div className="md:w-64 flex items-center gap-3 text-sm text-[#0F2044]/60">
                    <MapPin className="w-5 h-5" />
                    {period.venue}
                  </div>
                </div>
              )) || (
                <div className="p-20 text-center text-[#0F2044]/50">
                  No timetable data available for this day.
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* Notes for Boarding Schools */}
      <div className="bg-amber-50 border border-amber-200 rounded-3xl p-8 text-sm">
        <strong>Note for Boarding Schools:</strong> Evening prep and roll-call slots (19:00 - 21:30) are managed separately in the Attendance Module. Morning assembly is scheduled daily at 07:00.
      </div>
    </div>
  );
}