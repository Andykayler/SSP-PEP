import { useState, useEffect, useCallback } from "react";
import { db } from "../../../firebase";
import {
  collection, query, where, getDocs, doc, getDoc, setDoc, updateDoc, serverTimestamp,
} from "firebase/firestore";
import {
  Clock, Calendar, LogIn, LogOut, CheckCircle, AlertCircle, Loader2, RefreshCw, MapPin,
} from "lucide-react";

// ─── Geofence helpers (mirrors limu's HR time-sheet: Haversine distance +
// grace margin + accuracy allowance, capped) ───────────────────────────────
const GEOFENCE_GRACE_METERS = 15;
const GEOFENCE_ACCURACY_CAP_METERS = 60;
const REQUIRED_ACCURACY_METERS = 150;

function haversineMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = (v) => (v * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function getCurrentPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Geolocation is not supported by your browser."));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve(pos.coords),
      (err) => reject(new Error(err.message || "Could not get your location.")),
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
    );
  });
}

// Throws a user-facing Error if the given coords aren't within the school
// geofence (with grace + accuracy allowance), or if the geofence isn't set up.
function assertWithinGeofence(geofence, coords) {
  if (!geofence) {
    throw new Error("School location hasn't been set yet. Ask your head teacher to set it from Class Monitor.");
  }
  if (coords.accuracy && coords.accuracy > REQUIRED_ACCURACY_METERS) {
    throw new Error(`Location accuracy is too low (±${Math.round(coords.accuracy)}m). Wait for a stronger GPS fix, or enable Precise Location.`);
  }
  const accuracyAllowance = coords.accuracy ? Math.min(GEOFENCE_ACCURACY_CAP_METERS, coords.accuracy) : 0;
  const effectiveRadius = (geofence.radiusMeters || 0) + GEOFENCE_GRACE_METERS + accuracyAllowance;
  const distance = haversineMeters(coords.latitude, coords.longitude, geofence.latitude, geofence.longitude);
  if (distance > effectiveRadius) {
    throw new Error(`You're not at the school premises (about ${Math.round(distance)}m away). Move closer and try again.`);
  }
}

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

// Mirrors the period table used across ClassModule / lesson plan / dashboard
// schedule widgets, so a period number means the same thing everywhere.
const PERIODS = [
  { number: 1, label: "P1", start: "07:30", end: "08:20" },
  { number: 2, label: "P2", start: "08:30", end: "09:20" },
  { number: 3, label: "P3", start: "09:30", end: "10:20" },
  { number: 4, label: "P4", start: "10:30", end: "11:20" },
  { number: 5, label: "P5", start: "11:30", end: "12:20" },
  { number: 6, label: "P6", start: "13:00", end: "13:50" },
  { number: 7, label: "P7", start: "14:00", end: "14:50" },
  { number: 8, label: "P8", start: "15:00", end: "15:50" },
];

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function todayWeekday() {
  return WEEKDAY_NAMES[new Date().getDay()];
}

function fmtClock(ts) {
  if (!ts) return "—";
  const d = typeof ts.toDate === "function" ? ts.toDate() : new Date(ts);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function sessionId(schoolCode, classId, date, periodNumber) {
  return `${schoolCode}_${classId}_${date}_${periodNumber}`;
}

const iconBtnStyle = {
  display: "flex", alignItems: "center", justifyContent: "center",
  width: 34, height: 34, padding: 0, background: "var(--surface)",
  border: "1px solid var(--border-color)", borderRadius: "var(--radius-md)",
  color: "var(--text-muted)", cursor: "pointer", flexShrink: 0,
  transition: "all var(--transition-base)",
};

const clockInBtnStyle = (disabled) => ({
  display: "flex", alignItems: "center", gap: 6,
  padding: "8px 14px", borderRadius: "var(--radius-md)",
  background: disabled ? "var(--border-color)" : "var(--success)",
  color: disabled ? "var(--text-muted)" : "#fff",
  border: "none", fontSize: 12, fontWeight: 600,
  cursor: disabled ? "not-allowed" : "pointer",
  opacity: disabled ? 0.6 : 1, whiteSpace: "nowrap",
});

const clockOutBtnStyle = (disabled) => ({
  display: "flex", alignItems: "center", gap: 6,
  padding: "8px 14px", borderRadius: "var(--radius-md)",
  background: disabled ? "var(--border-color)" : "var(--primary)",
  color: disabled ? "var(--text-muted)" : "#fff",
  border: "none", fontSize: 12, fontWeight: 600,
  cursor: disabled ? "not-allowed" : "pointer",
  opacity: disabled ? 0.6 : 1, whiteSpace: "nowrap",
});

function Spinner({ size = 13 }) {
  return <Loader2 size={size} style={{ animation: "spin 0.65s linear infinite" }} />;
}

export default function TimetableModule({ userId, schoolCode }) {
  const [myTimetable, setMyTimetable] = useState([]);
  const [todaySessions, setTodaySessions] = useState([]);
  const [geofence, setGeofence] = useState(null);
  const [geofenceReady, setGeofenceReady] = useState(false);
  const [ttReady, setTtReady] = useState(false);
  const [sessReady, setSessReady] = useState(false);
  const [error, setError] = useState("");
  const [busyKey, setBusyKey] = useState(null); // slot id currently being clocked in/out

  const [selectedDay, setSelectedDay] = useState(
    DAYS.includes(todayWeekday()) ? todayWeekday() : "Monday"
  );

  const isLoading = !ttReady || !sessReady || !geofenceReady;
  const today = todayISO();
  const isToday = selectedDay === todayWeekday();

  // ── Load this teacher's timetable slots ────────────────────────────────────
  const fetchTimetable = useCallback(async () => {
    if (!userId || !schoolCode) return;
    setTtReady(false);
    setError("");
    try {
      const snap = await getDocs(
        query(
          collection(db, "timetable"),
          where("schoolCode", "==", schoolCode),
          where("teacherId", "==", userId)
        )
      );
      const list = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (a.periodNumber || 0) - (b.periodNumber || 0));
      setMyTimetable(list);
    } catch (err) {
      console.error("fetchTimetable error:", err);
      setError(err.code === "permission-denied"
        ? "You don't have any timetable periods assigned yet. Ask your head teacher to build the timetable and assign your classes."
        : `Could not load your timetable: ${err.message}`);
    } finally {
      setTtReady(true);
    }
  }, [userId, schoolCode]);

  // ── Load today's clock-in/out sessions for this teacher ────────────────────
  const fetchSessions = useCallback(async () => {
    if (!userId || !schoolCode) return;
    setSessReady(false);
    try {
      const snap = await getDocs(
        query(
          collection(db, "lesson_sessions"),
          where("schoolCode", "==", schoolCode),
          where("teacherId", "==", userId),
          where("date", "==", today)
        )
      );
      setTodaySessions(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (err) {
      console.error("fetchSessions error:", err);
    } finally {
      setSessReady(true);
    }
  }, [userId, schoolCode, today]);

  // ── Load the school's geofence (used to verify Clock In/Out location) ──────
  useEffect(() => {
    if (!schoolCode) return;
    let cancelled = false;
    (async () => {
      setGeofenceReady(false);
      try {
        const snap = await getDoc(doc(db, "school_geofences", schoolCode));
        if (!cancelled && snap.exists()) setGeofence(snap.data());
      } catch (err) {
        console.error("Failed to load school geofence:", err);
      } finally {
        if (!cancelled) setGeofenceReady(true);
      }
    })();
    return () => { cancelled = true; };
  }, [schoolCode]);

  useEffect(() => { fetchTimetable(); }, [fetchTimetable]);
  useEffect(() => { fetchSessions(); }, [fetchSessions]);

  const refreshAll = () => { fetchTimetable(); fetchSessions(); };

  const sessionFor = (slot) => todaySessions.find(
    (s) => s.classId === slot.classId && s.periodNumber === slot.periodNumber
  );

  const clockIn = async (slot) => {
    const id = sessionId(schoolCode, slot.classId, today, slot.periodNumber);
    setBusyKey(id);
    setError("");
    try {
      const coords = await getCurrentPosition();
      assertWithinGeofence(geofence, coords);
      await setDoc(doc(db, "lesson_sessions", id), {
        schoolCode,
        classId: slot.classId,
        className: slot.className,
        date: today,
        day: slot.day,
        periodNumber: slot.periodNumber,
        subject: slot.subject,
        teacherId: userId,
        teacherName: slot.teacherName || "",
        venue: slot.venue || "",
        scheduledStart: slot.startTime,
        scheduledEnd: slot.endTime,
        status: "in-progress",
        clockInAt: serverTimestamp(),
        clockInLat: coords.latitude,
        clockInLng: coords.longitude,
        clockInAccuracy: coords.accuracy || null,
        updatedAt: serverTimestamp(),
      }, { merge: true });
      await fetchSessions();
    } catch (err) {
      console.error("clockIn error:", err);
      setError(err.message || "Could not clock in. Please try again.");
    } finally {
      setBusyKey(null);
    }
  };

  const clockOut = async (slot, session) => {
    if (!session) return;
    setBusyKey(session.id);
    setError("");
    try {
      const coords = await getCurrentPosition();
      assertWithinGeofence(geofence, coords);
      await updateDoc(doc(db, "lesson_sessions", session.id), {
        status: "completed",
        clockOutAt: serverTimestamp(),
        clockOutLat: coords.latitude,
        clockOutLng: coords.longitude,
        clockOutAccuracy: coords.accuracy || null,
        updatedAt: serverTimestamp(),
      });
      await fetchSessions();
    } catch (err) {
      console.error("clockOut error:", err);
      setError(err.message || "Could not clock out. Please try again.");
    } finally {
      setBusyKey(null);
    }
  };

  const filteredTimetable = myTimetable.filter((item) => item.day === selectedDay);
  const noAssignment = ttReady && myTimetable.length === 0;

  const todaySlots = myTimetable.filter((item) => item.day === todayWeekday());
  const clockedInToday = todaySlots.filter((slot) => Boolean(sessionFor(slot))).length;

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="module-title">My Timetable</h2>
          <p className="module-sub">
            {isLoading
              ? "Loading…"
              : noAssignment
              ? "No periods assigned to you yet"
              : `Today: ${clockedInToday}/${todaySlots.length} class${todaySlots.length !== 1 ? "es" : ""} clocked in`}
          </p>
        </div>

        <button onClick={refreshAll} disabled={isLoading} style={{ ...iconBtnStyle, opacity: isLoading ? 0.4 : 1 }} title="Refresh">
          <RefreshCw size={16} />
        </button>
      </div>

      {error && (
        <div className="alert alert--error">
          <AlertCircle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
          {error}
        </div>
      )}

      {noAssignment && (
        <div className="alert alert--warning">
          <AlertCircle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
          Your head teacher hasn&apos;t assigned you any timetable periods yet. Ask them to build the school timetable and assign your classes.
        </div>
      )}

      {!isLoading && !noAssignment && !geofence && (
        <div className="alert alert--warning">
          <MapPin size={16} style={{ flexShrink: 0, marginTop: 1 }} />
          The school&apos;s location hasn&apos;t been set yet, so Clock In/Out is disabled. Ask your head teacher to set it from Class Monitor.
        </div>
      )}

      {/* ── Day selector ── */}
      <div className="filter-pills">
        {DAYS.map((day) => (
          <button
            key={day}
            onClick={() => setSelectedDay(day)}
            className={`filter-pill ${selectedDay === day ? "filter-pill--active" : "filter-pill--inactive"}`}
          >
            {day}{day === todayWeekday() && " · Today"}
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
          {isLoading ? (
            <div style={{ padding: "56px 20px", display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
              <div className="spinner" style={{ width: 28, height: 28, borderWidth: 3 }} />
              <p className="module-sub">Loading timetable…</p>
            </div>
          ) : filteredTimetable.length > 0 ? (
            filteredTimetable.map((entry) => {
              const session = isToday ? sessionFor(entry) : null;
              const id = sessionId(schoolCode, entry.classId, today, entry.periodNumber);
              const busy = busyKey === id || busyKey === session?.id;

              return (
                <div key={entry.id} className="cc-row" style={{ alignItems: "flex-start" }}>
                  <div style={{
                    width: 56, borderRadius: "var(--radius-md)", background: "var(--primary-pale)",
                    border: "1px solid var(--border-color)", display: "flex", flexDirection: "column",
                    alignItems: "center", justifyContent: "center", padding: "10px 4px", minHeight: 62, flexShrink: 0,
                  }}>
                    <Clock size={14} style={{ color: "var(--primary-light)" }} />
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, marginTop: 4, color: "var(--primary-light)", fontWeight: 700 }}>
                      {entry.startTime}
                    </span>
                    <span style={{ fontSize: 9, color: "var(--primary-light)", opacity: 0.7 }}>
                      {entry.endTime}
                    </span>
                  </div>

                  <div className="cc-row__info">
                    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6, marginBottom: 6 }}>
                      <span className="badge badge--blue">{entry.className}</span>
                      <span className="badge badge--teal">{entry.subject}</span>
                      {session?.status === "completed" && (
                        <span className="status-pill" style={{ background: "var(--success-pale)", color: "var(--success-light)", border: "1px solid rgba(34,197,94,0.22)" }}>
                          <span className="status-pill__dot" /> Completed
                        </span>
                      )}
                      {session?.status === "in-progress" && (
                        <span className="status-pill" style={{ background: "var(--primary-pale)", color: "var(--primary-light)", border: "1px solid var(--border-color)" }}>
                          <span className="status-pill__dot" /> In progress
                        </span>
                      )}
                    </div>

                    <div className="cc-row__name" style={{ fontSize: 14, fontFamily: "var(--font-display)", letterSpacing: "0.3px" }}>
                      {entry.venue || "Venue not set"}
                    </div>

                    {session && (
                      <p className="cc-row__meta" style={{ marginTop: 4 }}>
                        Clocked in {fmtClock(session.clockInAt)}
                        {session.clockOutAt && ` · out ${fmtClock(session.clockOutAt)}`}
                      </p>
                    )}
                  </div>

                  <div style={{ display: "flex", gap: 6, flexShrink: 0, marginTop: 2 }}>
                    {!isToday ? (
                      <span className="module-sub" style={{ fontSize: 11 }}>Clock-in opens on {entry.day}</span>
                    ) : !session ? (
                      <button onClick={() => clockIn(entry)} disabled={busy || !geofence} style={clockInBtnStyle(busy || !geofence)} title={!geofence ? "School location not set yet" : undefined}>
                        {busy ? <Spinner /> : <LogIn size={13} />} Clock In
                      </button>
                    ) : session.status === "in-progress" ? (
                      <button onClick={() => clockOut(entry, session)} disabled={busy || !geofence} style={clockOutBtnStyle(busy || !geofence)} title={!geofence ? "School location not set yet" : undefined}>
                        {busy ? <Spinner /> : <LogOut size={13} />} Clock Out
                      </button>
                    ) : (
                      <span style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--success-light)", fontSize: 12, fontWeight: 600 }}>
                        <CheckCircle size={14} /> Done
                      </span>
                    )}
                  </div>
                </div>
              );
            })
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
        Clock in when you start a lesson and clock out when it ends — your head teacher can see this on Class Monitor.
        Changes to the schedule itself should be requested through the School Administrator.
      </p>
    </div>
  );
}
