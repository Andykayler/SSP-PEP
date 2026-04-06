import { useState } from "react";
import { Clock, Calendar, Download, Eye, Edit2 } from "lucide-react";

export default function TimetableModule() {
  const [selectedDay, setSelectedDay] = useState("Monday");

  const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];

  // Teacher's personal timetable (only Mr. Martin Khumbata's classes)
  const [myTimetable] = useState([
    {
      id: 1,
      day: "Monday",
      time: "07:30 - 08:20",
      subject: "Mathematics",
      className: "Form 3A",
      room: "Block B - Rm 12",
      notes: "Chapter 7 - Quadratic Equations",
    },
    {
      id: 2,
      day: "Monday",
      time: "09:30 - 10:20",
      subject: "Mathematics",
      className: "Form 4B",
      room: "Block A - Rm 07",
      notes: "Revision for Mid-term",
    },
    {
      id: 3,
      day: "Tuesday",
      time: "08:30 - 09:20",
      subject: "Physics",
      className: "Form 3A",
      room: "Science Lab",
      notes: "Practical: Motion",
    },
    {
      id: 4,
      day: "Tuesday",
      time: "11:30 - 12:20",
      subject: "Mathematics",
      className: "Form 4B",
      room: "Block B - Rm 12",
      notes: "",
    },
    {
      id: 5,
      day: "Wednesday",
      time: "07:30 - 08:20",
      subject: "Physics",
      className: "Form 3A",
      room: "Science Lab",
      notes: "Theory + Practical",
    },
    {
      id: 6,
      day: "Thursday",
      time: "08:30 - 09:20",
      subject: "Mathematics",
      className: "Form 3A",
      room: "Block B - Rm 12",
      notes: "",
    },
  ]);

  const filteredTimetable = myTimetable.filter(item => item.day === selectedDay);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold text-[#0F2044]" style={{ fontFamily: "'Playfair Display', serif" }}>
            My Timetable
          </h2>
          <p className="text-[#0F2044]/60">Mr. Martin Khumbata • Mathematics & Physics Teacher</p>
        </div>

        <button className="flex items-center gap-2 px-6 py-3 border border-[#0F2044]/20 hover:bg-[#F7F5F0] rounded-2xl text-sm font-medium transition-colors">
          <Download className="w-5 h-5" /> Download Weekly Schedule
        </button>
      </div>

      {/* Day Selector */}
      <div className="bg-white rounded-3xl p-2 border border-[#0F2044]/8 inline-flex">
        {days.map(day => (
          <button
            key={day}
            onClick={() => setSelectedDay(day)}
            className={`px-6 py-3 text-sm font-medium rounded-2xl transition-all ${
              selectedDay === day 
                ? "bg-[#0F2044] text-white shadow-md" 
                : "hover:bg-[#FAFAF8] text-[#0F2044]/70"
            }`}
          >
            {day}
          </button>
        ))}
      </div>

      {/* Timetable */}
      <div className="bg-white rounded-3xl border border-[#0F2044]/8 overflow-hidden">
        <div className="px-6 py-4 bg-[#F7F5F0] border-b flex items-center justify-between">
          <div className="font-semibold text-[#0F2044]">{selectedDay}'s Schedule</div>
          <div className="text-xs text-[#0F2044]/50">
            {filteredTimetable.length} period{filteredTimetable.length !== 1 ? 's' : ''}
          </div>
        </div>

        {filteredTimetable.length > 0 ? (
          <div className="divide-y">
            {filteredTimetable.map((entry) => (
              <div key={entry.id} className="p-6 hover:bg-[#FAFAF8] transition-colors flex flex-col md:flex-row md:items-center gap-6">
                <div className="flex-shrink-0">
                  <div className="flex items-center gap-3">
                    <Clock className="w-5 h-5 text-[#0F2044]/60" />
                    <div className="font-mono text-lg font-semibold text-[#0F2044]">{entry.time}</div>
                  </div>
                </div>

                <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <p className="text-xs text-[#0F2044]/60">CLASS</p>
                    <p className="font-medium">{entry.className}</p>
                  </div>
                  <div>
                    <p className="text-xs text-[#0F2044]/60">SUBJECT</p>
                    <p className="font-medium text-[#0F2044]">{entry.subject}</p>
                  </div>
                  <div>
                    <p className="text-xs text-[#0F2044]/60">ROOM</p>
                    <p className="font-medium font-mono">{entry.room}</p>
                  </div>
                </div>

                {entry.notes && (
                  <div className="md:w-64 text-sm text-[#0F2044]/70 italic">
                    {entry.notes}
                  </div>
                )}

                <div className="flex gap-2 md:ml-auto">
                  <button className="p-3 hover:bg-blue-50 text-blue-600 rounded-2xl transition-colors">
                    <Eye className="w-4 h-4" />
                  </button>
                  <button className="p-3 hover:bg-amber-50 text-amber-600 rounded-2xl transition-colors">
                    <Edit2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="py-20 text-center text-[#0F2044]/50">
            No classes scheduled for {selectedDay}.
          </div>
        )}
      </div>

      <div className="text-center text-xs text-[#0F2044]/50">
        This is your personal teaching schedule. Changes should be requested through the School Administrator.
      </div>
    </div>
  );
}