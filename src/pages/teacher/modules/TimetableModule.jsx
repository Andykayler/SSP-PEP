import { useState } from "react";
import { Clock, Calendar, Download, Eye, Edit2 } from "lucide-react";

const iconBtnStyle = {
  display: "flex", alignItems: "center", justifyContent: "center",
  width: 34, height: 34, padding: 0, background: "var(--surface)",
  border: "1px solid var(--border-color)", borderRadius: "var(--radius-md)",
  color: "var(--text-muted)", cursor: "pointer", flexShrink: 0,
  transition: "all var(--transition-base)",
};

export default function TimetableModule() {
  const [selectedDay, setSelectedDay] = useState("Monday");
  const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];

  // Teacher's personal timetable (only Mr. Martin Khumbata's classes)
  // NOTE: still static demo data, same as before — this module isn't wired to
  // Firestore yet. Happy to hook it up to a `timetable` collection (mirroring
  // the teacherId/schoolCode pattern used in Homework and Lesson Plans) if
  // you want it live.
  const [myTimetable] = useState([
    { id: 1, day: "Monday",    time: "07:30 - 08:20", subject: "Mathematics", className: "Form 3A", room: "Block B - Rm 12", notes: "Chapter 7 - Quadratic Equations" },
    { id: 2, day: "Monday",    time: "09:30 - 10:20", subject: "Mathematics", className: "Form 4B", room: "Block A - Rm 07", notes: "Revision for Mid-term" },
    { id: 3, day: "Tuesday",   time: "08:30 - 09:20", subject: "Physics",     className: "Form 3A", room: "Science Lab",     notes: "Practical: Motion" },
    { id: 4, day: "Tuesday",   time: "11:30 - 12:20", subject: "Mathematics", className: "Form 4B", room: "Block B - Rm 12", notes: "" },
    { id: 5, day: "Wednesday", time: "07:30 - 08:20", subject: "Physics",     className: "Form 3A", room: "Science Lab",     notes: "Theory + Practical" },
    { id: 6, day: "Thursday",  time: "08:30 - 09:20", subject: "Mathematics", className: "Form 3A", room: "Block B - Rm 12", notes: "" },
  ]);

  const filteredTimetable = myTimetable.filter(item => item.day === selectedDay);

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="module-title">My Timetable</h2>
          <p className="module-sub">Mr. Martin Khumbata · Mathematics &amp; Physics Teacher</p>
        </div>

        <button style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "10px 20px", borderRadius: "var(--radius-md)",
          background: "var(--surface)", border: "1px solid var(--border-color)",
          color: "var(--text-secondary)", fontSize: 13, fontWeight: 500,
          cursor: "pointer", transition: "all var(--transition-base)",
        }}>
          <Download size={15} /> Download Weekly Schedule
        </button>
      </div>

      {/* ── Day selector ── */}
      <div className="filter-pills">
        {days.map(day => (
          <button
            key={day}
            onClick={() => setSelectedDay(day)}
            className={`filter-pill ${selectedDay === day ? "filter-pill--active" : "filter-pill--inactive"}`}
          >
            {day}
          </button>
        ))}
      </div>

      {/* ── Timetable ── */}
      <div className="cc">
        <div className="cc__head">
          <div className="cc__head-left">
            <Calendar width={18} height={18} />
            <h3>{selectedDay}'s Schedule</h3>
          </div>
          <span className="module-sub" style={{ margin: 0 }}>
            {filteredTimetable.length} period{filteredTimetable.length !== 1 ? "s" : ""}
          </span>
        </div>

        <div className="cc__body" style={{ padding: 0 }}>
          {filteredTimetable.length > 0 ? (
            filteredTimetable.map((entry) => (
              <div key={entry.id} className="cc-row" style={{ alignItems: "flex-start" }}>
                <div style={{
                  width: 56, borderRadius: "var(--radius-md)", background: "var(--primary-pale)",
                  border: "1px solid var(--border-color)", display: "flex", flexDirection: "column",
                  alignItems: "center", justifyContent: "center", padding: "10px 4px", minHeight: 62, flexShrink: 0,
                }}>
                  <Clock size={14} style={{ color: "var(--primary-light)" }} />
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, marginTop: 4, color: "var(--primary-light)", fontWeight: 700 }}>
                    {entry.time.split(" - ")[0]}
                  </span>
                  <span style={{ fontSize: 9, color: "var(--primary-light)", opacity: 0.7 }}>
                    {entry.time.split(" - ")[1]}
                  </span>
                </div>

                <div className="cc-row__info">
                  <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6, marginBottom: 6 }}>
                    <span className="badge badge--blue">{entry.className}</span>
                    <span className="badge badge--teal">{entry.subject}</span>
                  </div>

                  <div className="cc-row__name" style={{ fontSize: 14, fontFamily: "var(--font-display)", letterSpacing: "0.3px" }}>
                    {entry.room}
                  </div>

                  {entry.notes && (
                    <p className="cc-row__meta" style={{ whiteSpace: "normal", marginTop: 4, lineHeight: 1.55, maxWidth: 480 }}>
                      {entry.notes}
                    </p>
                  )}
                </div>

                <div style={{ display: "flex", gap: 6, flexShrink: 0, marginTop: 2 }}>
                  <button style={iconBtnStyle} title="View"><Eye size={14} /></button>
                  <button style={iconBtnStyle} title="Edit"><Edit2 size={14} /></button>
                </div>
              </div>
            ))
          ) : (
            <div className="empty-state">
              <div className="empty-state__icon"><Calendar size={22} /></div>
              <div className="empty-state__title">No classes scheduled</div>
              <p className="empty-state__sub">Nothing on your timetable for {selectedDay}.</p>
            </div>
          )}
        </div>
      </div>

      <p className="module-sub" style={{ textAlign: "center" }}>
        This is your personal teaching schedule. Changes should be requested through the School Administrator.
      </p>
    </div>
  );
}