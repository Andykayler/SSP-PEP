// modules/ClassSessionsModule.jsx — "Class Monitor"
// Cross-references the timetable (what should be happening) against
// lesson_sessions (teacher clock-in/out records) so the head teacher can see,
// at a glance, whether classes are being taken as scheduled.
import { useState, useEffect, useMemo } from "react";
import { auth, db } from "../../../firebase";
import { collection, query, where, getDocs, doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import {
  Calendar, RefreshCw, Download, Users, CheckCircle, Clock,
  XCircle, AlertTriangle, BarChart3, Search, Radio, MapPin, Loader2, Save,
} from "lucide-react";
import "./staff-management.css";

const DEFAULT_RADIUS_METERS = 150;

const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const GRACE_MINUTES = 5;

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function weekdayName(dateStr) {
  const d = new Date(`${dateStr}T00:00:00`);
  return WEEKDAY_NAMES[d.getDay()];
}

function periodDateTime(dateStr, hhmm) {
  return new Date(`${dateStr}T${hhmm}:00`);
}

function fmtClock(ts) {
  if (!ts) return "—";
  const d = typeof ts.toDate === "function" ? ts.toDate() : new Date(ts);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function Spinner({ size = 20 }) {
  return <div className="spinner" style={{ width: size, height: size }} />;
}

function KpiCard({ label, value, sub, icon: Icon, accent = "neutral", loading }) {
  let valueClass = "stat-card__value";
  if (accent === "success") valueClass += " stat-card__value--success";
  if (accent === "warning") valueClass += " stat-card__value--warning";
  if (accent === "danger") valueClass += " stat-card__value--danger";
  if (accent === "info") valueClass += " stat-card__value--accent";
  return (
    <div className="stat-card">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="stat-card__label">{label}</div>
          <div className={valueClass}>{loading ? <Spinner size={22} /> : value}</div>
          {sub && <div className="stat-card__sub">{sub}</div>}
        </div>
        {Icon && <Icon size={24} className="text-muted shrink-0" />}
      </div>
    </div>
  );
}

const STATUS_STYLE = {
  Completed:            { bg: "var(--success-pale)", color: "var(--success-light)", border: "1px solid rgba(34,197,94,0.22)" },
  "In progress":        { bg: "var(--primary-pale)",  color: "var(--primary-light)",  border: "1px solid var(--border-color)" },
  "Awaiting clock-in":  { bg: "var(--warning-pale)",  color: "var(--warning-light)",  border: "1px solid rgba(232,168,0,0.2)" },
  Missed:               { bg: "var(--danger-pale)",   color: "var(--danger-light)",   border: "1px solid rgba(239,68,68,0.2)" },
  Upcoming:              { bg: "var(--surface)",        color: "var(--text-muted)",     border: "1px solid var(--border-color)" },
  Scheduled:             { bg: "var(--surface)",        color: "var(--text-muted)",     border: "1px solid var(--border-color)" },
};

function exportToCsv(rows, filename) {
  const columns = [
    { key: "periodNumber", label: "Period" },
    { key: "className", label: "Class" },
    { key: "subject", label: "Subject" },
    { key: "teacherName", label: "Teacher" },
    { key: "scheduled", label: "Scheduled" },
    { key: "clockInLabel", label: "Clock in" },
    { key: "clockOutLabel", label: "Clock out" },
    { key: "status", label: "Status" },
  ];
  const csvRows = [columns.map((c) => c.label).join(",")];
  rows.forEach((row) => {
    csvRows.push(columns.map((c) => `"${String(row[c.key] ?? "").replace(/"/g, '""')}"`).join(","));
  });
  const blob = new Blob([csvRows.join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── School Location (geofence) card ───────────────────────────────────────
// Teachers' Clock In/Out is verified against this location, mirroring the
// GPS + geofence check used in limu's HR time-sheet.
function SchoolLocationCard({ schoolCode }) {
  const [geofence, setGeofence] = useState(null);
  const [ready, setReady] = useState(false);
  const [radiusInput, setRadiusInput] = useState(DEFAULT_RADIUS_METERS);
  const [captured, setCaptured] = useState(null); // { lat, lng, accuracy }
  const [capturing, setCapturing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState(""); // { type, message }

  useEffect(() => {
    if (!schoolCode) return;
    let cancelled = false;
    (async () => {
      setReady(false);
      try {
        const snap = await getDoc(doc(db, "school_geofences", schoolCode));
        if (cancelled) return;
        if (snap.exists()) {
          const data = snap.data();
          setGeofence(data);
          setRadiusInput(data.radiusMeters || DEFAULT_RADIUS_METERS);
        }
      } catch (err) {
        console.error("Failed to load school geofence:", err);
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => { cancelled = true; };
  }, [schoolCode]);

  const captureLocation = () => {
    if (!navigator.geolocation) {
      setStatus({ type: "error", message: "Geolocation is not supported by this browser." });
      return;
    }
    setCapturing(true);
    setStatus("");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCaptured({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        });
        setStatus({ type: "success", message: `Location captured (±${Math.round(pos.coords.accuracy)}m). Review and save below.` });
        setCapturing(false);
      },
      (err) => {
        setStatus({ type: "error", message: `Could not get location: ${err.message}` });
        setCapturing(false);
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
    );
  };

  const save = async () => {
    if (!captured) {
      setStatus({ type: "error", message: "Capture the current location first — stand at the school premises and click \"Use my current location\"." });
      return;
    }
    const radius = Number(radiusInput);
    if (!Number.isFinite(radius) || radius < 25 || radius > 2000) {
      setStatus({ type: "error", message: "Radius must be between 25 and 2000 meters." });
      return;
    }
    setSaving(true);
    try {
      const payload = {
        schoolCode,
        latitude: captured.lat,
        longitude: captured.lng,
        radiusMeters: Math.round(radius),
        updatedAt: serverTimestamp(),
        updatedBy: auth.currentUser?.uid || null,
      };
      await setDoc(doc(db, "school_geofences", schoolCode), payload, { merge: true });
      setGeofence(payload);
      setCaptured(null);
      setStatus({ type: "success", message: "School location saved. Teachers can now clock in from this area." });
    } catch (err) {
      console.error("Failed to save school geofence:", err);
      setStatus({ type: "error", message: "Failed to save location. Please try again." });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="card p-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <MapPin size={16} className="text-muted" />
          <span style={{ fontWeight: 600, fontSize: 13.5 }}>School Location (Geofence)</span>
        </div>
        {ready && geofence && (
          <span className="text-muted text-xs">
            Radius {geofence.radiusMeters}m · {geofence.latitude?.toFixed(5)}, {geofence.longitude?.toFixed(5)}
          </span>
        )}
      </div>

      {ready && !geofence && (
        <div className="alert alert--warning" style={{ marginTop: 10 }}>
          <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: 1 }} />
          Not configured yet — teachers cannot clock in until the school location is set. Stand on the school premises and capture it below.
        </div>
      )}

      {status && (
        <div className={`alert alert--${status.type === "error" ? "error" : "success"}`} style={{ marginTop: 10 }}>
          {status.type === "error" ? <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: 1 }} /> : <CheckCircle size={15} style={{ flexShrink: 0, marginTop: 1 }} />}
          {status.message}
        </div>
      )}

      <div className="flex items-end gap-3 flex-wrap" style={{ marginTop: 12 }}>
        <button onClick={captureLocation} disabled={capturing} className="btn-refresh">
          {capturing ? <Loader2 size={14} style={{ animation: "spin 0.65s linear infinite" }} /> : <MapPin size={14} />}
          {capturing ? "Getting location…" : "Use my current location"}
        </button>
        <div>
          <label className="text-muted" style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: 600, display: "block", marginBottom: 4 }}>
            Radius (meters)
          </label>
          <input
            type="number" min={25} max={2000} value={radiusInput}
            onChange={(e) => setRadiusInput(e.target.value)}
            className="search-input" style={{ width: 110 }}
          />
        </div>
        <button onClick={save} disabled={saving || !captured} className="btn-save" style={{ flex: "none", padding: "10px 18px" }}>
          {saving ? <Loader2 size={14} style={{ animation: "spin 0.65s linear infinite" }} /> : <Save size={14} />} Save location
        </button>
      </div>
      {captured && (
        <p className="text-muted text-xs" style={{ marginTop: 8 }}>
          Captured: {captured.lat.toFixed(5)}, {captured.lng.toFixed(5)} (±{Math.round(captured.accuracy)}m) — not saved yet.
        </p>
      )}
    </div>
  );
}

export default function ClassSessionsModule({ schoolCode }) {
  const [classes, setClasses] = useState([]);
  const [timetable, setTimetable] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedDate, setSelectedDate] = useState(todayISO());
  const [classFilter, setClassFilter] = useState("all");
  const [search, setSearch] = useState("");

  const fetchData = async () => {
    if (!schoolCode) return;
    setLoading(true);
    setError("");
    try {
      const [classSnap, ttSnap, sessSnap] = await Promise.all([
        getDocs(query(collection(db, "school_classes"), where("schoolCode", "==", schoolCode))),
        getDocs(query(collection(db, "timetable"), where("schoolCode", "==", schoolCode))),
        getDocs(query(
          collection(db, "lesson_sessions"),
          where("schoolCode", "==", schoolCode),
          where("date", "==", selectedDate)
        )),
      ]);
      setClasses(
        classSnap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      );
      setTimetable(ttSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setSessions(sessSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (err) {
      console.error("ClassSessionsModule fetch:", err);
      setError(`Could not load class monitor data: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schoolCode, selectedDate]);

  const rows = useMemo(() => {
    const day = weekdayName(selectedDate);
    const today = todayISO();
    const now = new Date();

    const scheduledToday = timetable
      .filter((slot) => slot.day === day)
      .sort((a, b) => (a.periodNumber || 0) - (b.periodNumber || 0) || (a.className || "").localeCompare(b.className || ""));

    return scheduledToday.map((slot) => {
      const session = sessions.find((s) => s.classId === slot.classId && s.periodNumber === slot.periodNumber);
      const scheduledStart = periodDateTime(selectedDate, slot.startTime);
      const scheduledEnd = periodDateTime(selectedDate, slot.endTime);

      let status = "Scheduled";
      let late = false;
      let lateMinutes = 0;

      if (session) {
        status = session.status === "completed" ? "Completed" : "In progress";
        if (session.clockInAt?.toDate) {
          const clockInDate = session.clockInAt.toDate();
          const diffMin = Math.round((clockInDate - scheduledStart) / 60000);
          if (diffMin > GRACE_MINUTES) { late = true; lateMinutes = diffMin; }
        }
      } else if (selectedDate > today) {
        status = "Scheduled";
      } else if (selectedDate === today) {
        if (now < scheduledStart) status = "Upcoming";
        else if (now <= scheduledEnd) status = "Awaiting clock-in";
        else status = "Missed";
      } else {
        status = "Missed";
      }

      return {
        ...slot,
        status,
        late,
        lateMinutes,
        scheduled: `${slot.startTime} – ${slot.endTime}`,
        clockInLabel: fmtClock(session?.clockInAt),
        clockOutLabel: fmtClock(session?.clockOutAt),
        session,
      };
    });
  }, [timetable, sessions, selectedDate]);

  const filteredRows = useMemo(() => {
    return rows.filter((r) => {
      const matchClass = classFilter === "all" || r.classId === classFilter;
      const q = search.trim().toLowerCase();
      const matchSearch = !q ||
        r.teacherName?.toLowerCase().includes(q) ||
        r.subject?.toLowerCase().includes(q) ||
        r.className?.toLowerCase().includes(q);
      return matchClass && matchSearch;
    });
  }, [rows, classFilter, search]);

  const totalScheduled = rows.length;
  const clockedIn = rows.filter((r) => r.session).length;
  const missed = rows.filter((r) => r.status === "Missed").length;
  const late = rows.filter((r) => r.late).length;
  const complianceRate = totalScheduled > 0 ? Math.round((clockedIn / totalScheduled) * 100) : 0;

  const dateLabel = new Date(`${selectedDate}T12:00:00`).toLocaleDateString("en-GB", {
    weekday: "long", month: "long", day: "numeric", year: "numeric",
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center flex-wrap gap-3">
        <div>
          <h2 style={{ fontFamily: "'Playfair Display', serif" }}>Class Monitor</h2>
          <p className="text-muted">Is every scheduled class actually being taken? · {dateLabel}</p>
        </div>
        <div className="flex gap-2">
          <div className="search-wrapper" style={{ margin: 0, width: "auto" }}>
            <Calendar size={14} className="search-icon" />
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="search-input"
              style={{ padding: "8px 12px 8px 36px", width: "160px" }}
            />
          </div>
          <button onClick={fetchData} disabled={loading} className="icon-btn" title="Refresh">
            <RefreshCw size={16} className={loading ? "spin" : ""} />
          </button>
          <button
            onClick={() => exportToCsv(filteredRows, `class-monitor-${selectedDate}.csv`)}
            disabled={loading || filteredRows.length === 0}
            className="btn-refresh"
          >
            <Download size={14} /> Export
          </button>
        </div>
      </div>

      {error && <div className="error-message">{error}</div>}

      <SchoolLocationCard schoolCode={schoolCode} />

      {/* KPI Cards */}
      <div className="stats-grid">
        <KpiCard label="Classes Scheduled" value={totalScheduled} icon={Calendar} accent="neutral" loading={loading} />
        <KpiCard label="Clocked In" value={clockedIn} icon={Radio} accent="info" loading={loading} />
        <KpiCard label="Late Starts" value={late} icon={Clock} accent="warning" loading={loading} />
        <KpiCard label="Missed" value={missed} icon={XCircle} accent="danger" loading={loading} />
        <KpiCard label="Compliance" value={`${complianceRate}%`} sub="Scheduled periods clocked in" icon={BarChart3} accent="success" loading={loading} />
      </div>

      {!loading && totalScheduled > 0 && (missed > 0 || late > 0) && (
        <div className="alert alert--warning">
          <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
          {missed > 0 && `${missed} class${missed !== 1 ? "es" : ""} on ${dateLabel} ${missed !== 1 ? "were" : "was"} never clocked in. `}
          {late > 0 && `${late} class${late !== 1 ? "es" : ""} started more than ${GRACE_MINUTES} minutes late.`}
        </div>
      )}

      {/* Filters */}
      <div className="card p-4">
        <div className="filter-bar">
          <div className="search-wrapper">
            <Search className="search-icon" size={14} />
            <input
              type="text"
              placeholder="Search by teacher, subject or class…"
              className="search-input"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <select
            value={classFilter}
            onChange={(e) => setClassFilter(e.target.value)}
            className="search-input"
            style={{ width: "auto", minWidth: 160 }}
          >
            <option value="all">All classes</option>
            {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <div className="text-muted text-xs ml-auto">{filteredRows.length} period{filteredRows.length !== 1 ? "s" : ""}</div>
        </div>
      </div>

      {/* Table */}
      <div className="card">
        <div className="cc__head">
          <div className="cc__head-left">
            <Users size={18} />
            <h3>Scheduled Periods</h3>
          </div>
        </div>
        <div className="data-table-wrap">
          {loading ? (
            <div className="empty-state py-12"><Spinner size={28} /><p className="empty-state__sub">Loading class monitor…</p></div>
          ) : filteredRows.length === 0 ? (
            <div className="empty-state py-12">
              <Calendar size={32} className="text-muted" />
              <p className="empty-state__title">No classes scheduled</p>
              <p className="empty-state__sub">
                {rows.length === 0
                  ? `No timetable periods are set for ${weekdayName(selectedDate)}. Build the timetable in the Timetable module.`
                  : "No periods match your filters."}
              </p>
            </div>
          ) : (
            <table className="data-table data-table--stack">
              <thead>
                <tr>
                  <th>Period</th><th>Class</th><th>Subject</th><th>Teacher</th>
                  <th>Scheduled</th><th>Clock in</th><th>Clock out</th><th>Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((r) => {
                  const cfg = STATUS_STYLE[r.status] || STATUS_STYLE.Scheduled;
                  return (
                    <tr key={r.id}>
                      <td data-label="Period" className="font-semibold">P{r.periodNumber}</td>
                      <td data-label="Class">{r.className}</td>
                      <td data-label="Subject">{r.subject}</td>
                      <td data-label="Teacher">{r.teacherName || "—"}</td>
                      <td data-label="Scheduled" style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}>{r.scheduled}</td>
                      <td data-label="Clock in">
                        {r.clockInLabel}
                        {r.late && <span style={{ color: "var(--warning-light)", fontSize: 10.5, marginLeft: 6 }}>+{r.lateMinutes}m late</span>}
                      </td>
                      <td data-label="Clock out">{r.clockOutLabel}</td>
                      <td data-label="Status">
                        <span className="status-pill" style={{ background: cfg.bg, color: cfg.color, border: cfg.border }}>
                          <span className="status-pill__dot" />
                          {r.status}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
        <div className="cc__head border-t">
          <p className="text-muted text-[10px]">
            Status is computed from clock-in/out records against the timetable. "Missed" means the period ended with no clock-in.
          </p>
        </div>
      </div>
    </div>
  );
}
