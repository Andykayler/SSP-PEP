// src/pages/headteacher/modules/TransportModule.jsx
// ─────────────────────────────────────────────────────────────────────────────
// School buses: routes, stops, who rides where — and the message that saves the
// office a phone call per family when a bus is running late.
//
// One route is one document (stops and riders inside it), so the manifest a
// driver carries and the list a delay alert goes out to can never disagree.
import { useState, useMemo, useCallback } from "react";
import { db } from "../../../firebase";
import { collection, query, where, getDocs } from "firebase/firestore";
import { Bus, Plus, Trash2, Printer, BellRing, RefreshCw, ArrowLeft, UserPlus, MapPin } from "lucide-react";
import {
  fetchRoutes, createRoute, updateRoute, deleteRoute, manifest, currentRouteOf, newId,
} from "../../../services/transport";
import { notifyTransportDelay } from "../../../services/notificationHooks";
import useLoader from "../../../hooks/useLoader";
import PrintSheet from "../../../components/ui/PrintSheet";
import {
  Modal, Btn, IconBtn, Input, Select, Textarea, Pill, EmptyState, StatGrid, StatCard,
  ModuleHeader, Notice, LoadingState, TableWrap,
} from "../../../components/ui/ModuleKit";
import "./staff-management.css";

const BLANK = { name: "", vehicle: "", plate: "", driverName: "", driverPhone: "", capacity: "30", morningDeparture: "06:30", afternoonDeparture: "16:00" };

export default function TransportModule({ schoolCode, currentUser }) {
  const [routes, setRoutes] = useState(null);
  const [students, setStudents] = useState([]);
  const [openId, setOpenId] = useState(null);
  const [showNew, setShowNew] = useState(false);
  const [notice, setNotice] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!schoolCode) return;
    try {
      const [r, s] = await Promise.all([
        fetchRoutes(schoolCode),
        getDocs(query(collection(db, "students"), where("schoolCode", "==", schoolCode))),
      ]);
      setRoutes(r);
      setStudents(s.docs.map((d) => ({ id: d.id, ...d.data() })).filter((x) => x.status !== "withdrawn"));
    } catch (err) {
      console.error("[transport] load failed:", err);
      setNotice({ tone: "danger", text: `Could not load routes: ${err.message}` });
      setRoutes([]);
    }
  }, [schoolCode]);

  useLoader(load);

  const run = async (fn, ok) => {
    setBusy(true);
    try { await fn(); if (ok) setNotice({ tone: "success", text: ok }); await load(); }
    catch (err) { setNotice({ tone: "danger", text: err.message || "That didn't work." }); }
    finally { setBusy(false); }
  };

  if (routes === null) return <LoadingState label="Loading routes…" />;
  const route = routes.find((r) => r.id === openId);
  const riding = routes.reduce((n, r) => n + r.riders.length, 0);

  return (
    <div>
      {route ? (
        <RouteDetail
          route={route} routes={routes} students={students} busy={busy} currentUser={currentUser} schoolCode={schoolCode}
          say={(tone, text) => setNotice({ tone, text })}
          patch={(p) => run(() => updateRoute(route.id, p))}
          onBack={() => setOpenId(null)}
          onDelete={() => run(async () => { await deleteRoute(route.id); setOpenId(null); }, "Route deleted.")}
          notice={notice} clearNotice={() => setNotice(null)}
        />
      ) : (
        <>
          <ModuleHeader
            title="Transport"
            subtitle="Routes, stops, riders, and delay alerts to guardians"
            actions={
              <>
                <Btn variant="secondary" icon={<RefreshCw size={15} />} onClick={load}>Refresh</Btn>
                <Btn variant="accent" icon={<Plus size={15} />} onClick={() => setShowNew(true)}>New route</Btn>
              </>
            }
          />
          {notice && <Notice tone={notice.tone} onDismiss={() => setNotice(null)}>{notice.text}</Notice>}

          <StatGrid>
            <StatCard label="Routes" value={routes.length} />
            <StatCard label="Learners riding" value={riding} />
            <StatCard label="Seats free" value={routes.reduce((n, r) => n + Math.max(0, r.capacity - r.riders.length), 0)} />
          </StatGrid>

          {routes.length === 0 ? (
            <EmptyState icon={<Bus size={28} />} title="No routes yet" sub="Add a route, its stops and riders. Then a late bus is one press to announce."
              action={<Btn variant="accent" icon={<Plus size={15} />} onClick={() => setShowNew(true)}>New route</Btn>} />
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 16 }}>
              {routes.map((r) => (
                <button key={r.id} type="button" className="card" onClick={() => setOpenId(r.id)}
                  style={{ padding: 20, textAlign: "left", cursor: "pointer", border: "1px solid var(--border-color)", background: "var(--card-bg)", color: "inherit", display: "flex", flexDirection: "column", gap: 6 }}>
                  <strong style={{ fontFamily: "var(--font-display)", fontSize: "1.1rem", fontWeight: 400 }}>{r.name}</strong>
                  <span className="text-muted" style={{ fontSize: 12.5 }}>{[r.vehicle, r.plate].filter(Boolean).join(" · ") || "No vehicle recorded"}</span>
                  <span style={{ fontSize: 13 }}>{r.driverName ? `Driver: ${r.driverName}` : "No driver recorded"}</span>
                  <span style={{ fontSize: 13 }}>{r.stops.length} stop{r.stops.length === 1 ? "" : "s"} · departs {r.morningDeparture}</span>
                  <Pill tone={r.riders.length > r.capacity ? "danger" : r.riders.length >= r.capacity * 0.9 ? "warning" : "success"}>{r.riders.length} of {r.capacity} seats</Pill>
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {showNew && <NewRouteDialog onClose={() => setShowNew(false)} busy={busy}
        onCreate={(data) => run(async () => { const id = await createRoute({ schoolCode, data, actor: currentUser }); setShowNew(false); setOpenId(id); }, "Route created.")} />}
    </div>
  );
}

function NewRouteDialog({ onClose, onCreate, busy }) {
  const [f, setF] = useState(BLANK);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  return (
    <Modal title="New route" onClose={onClose}
      footer={<><Btn variant="secondary" onClick={onClose}>Cancel</Btn><Btn variant="accent" loading={busy} disabled={!f.name.trim()} onClick={() => onCreate(f)}>Create</Btn></>}>
      <Input label="Route name" required value={f.name} onChange={set("name")} placeholder="e.g. Chilomoni – Blantyre CBD" autoFocus />
      <div className="grid grid-cols-2 gap-4">
        <Input label="Vehicle" value={f.vehicle} onChange={set("vehicle")} placeholder="e.g. 30-seater bus" />
        <Input label="Number plate" value={f.plate} onChange={set("plate")} />
        <Input label="Driver" value={f.driverName} onChange={set("driverName")} />
        <Input label="Driver phone" type="tel" value={f.driverPhone} onChange={set("driverPhone")} />
        <Input label="Seats" type="number" min="1" value={f.capacity} onChange={set("capacity")} />
        <div />
        <Input label="Morning departure" type="time" value={f.morningDeparture} onChange={set("morningDeparture")} />
        <Input label="Afternoon departure" type="time" value={f.afternoonDeparture} onChange={set("afternoonDeparture")} />
      </div>
    </Modal>
  );
}

function RouteDetail({ route, routes, students, busy, currentUser, schoolCode, say, patch, onBack, onDelete, notice, clearNotice }) {
  const [stopName, setStopName] = useState("");
  const [term, setTerm] = useState("");
  const [stopId, setStopId] = useState(route.stops[0]?.id || "");
  const [print, setPrint] = useState(false);
  const [delay, setDelay] = useState(false);

  const groups = useMemo(() => manifest(route), [route]);
  const t = term.trim().toLowerCase();
  const matches = t ? students.filter((s) => `${s.fullName} ${s.className}`.toLowerCase().includes(t) && !route.riders.some((r) => r.studentId === s.id)).slice(0, 6) : [];
  const full = route.riders.length >= route.capacity;

  const addStop = () => {
    const stop = { id: newId(), name: stopName.trim(), morningTime: "", afternoonTime: "" };
    patch({ stops: [...route.stops, stop] });
    setStopName(""); if (!stopId) setStopId(stop.id);
  };
  const addRider = (s) => {
    const other = currentRouteOf(routes, s.id, route.id);
    if (other) return say("warning", `${s.fullName} already rides ${other.name}. Remove them there first.`);
    if (full) return say("warning", "This bus is full.");
    patch({ riders: [...route.riders, { studentId: s.id, name: s.fullName, className: s.className || "", stopId, guardianPhone: s.guardianPhone || "" }] });
    setTerm("");
  };

  return (
    <div>
      <ModuleHeader
        title={route.name}
        subtitle={[route.vehicle, route.plate, route.driverName && `Driver ${route.driverName} ${route.driverPhone}`].filter(Boolean).join(" · ")}
        actions={
          <>
            <Btn variant="secondary" icon={<ArrowLeft size={15} />} onClick={onBack}>All routes</Btn>
            <Btn variant="secondary" icon={<Printer size={15} />} onClick={() => setPrint(true)}>Manifest</Btn>
            <Btn variant="accent" icon={<BellRing size={15} />} disabled={route.riders.length === 0} onClick={() => setDelay(true)}>Bus is late</Btn>
            <IconBtn icon={<Trash2 size={16} />} title="Delete route" danger onClick={() => window.confirm(`Delete route "${route.name}"?`) && onDelete()} />
          </>
        }
      />
      {notice && <Notice tone={notice.tone} onDismiss={clearNotice}>{notice.text}</Notice>}

      <div className="grid grid-cols-2 gap-4" style={{ alignItems: "start" }}>
        <div className="card" style={{ padding: 18 }}>
          <h3 style={{ margin: "0 0 10px", fontSize: "1rem" }}><MapPin size={15} style={{ verticalAlign: "-2px" }} /> Stops</h3>
          {route.stops.map((s, i) => (
            <div key={s.id} style={{ display: "flex", gap: 8, alignItems: "flex-end", marginBottom: 8 }}>
              <span className="text-muted" style={{ width: 20, fontFamily: "var(--font-mono)", fontSize: 12, paddingBottom: 10 }}>{i + 1}</span>
              <div style={{ flex: 1 }}><Input label={i === 0 ? "Stop" : undefined} defaultValue={s.name} onBlur={(e) => e.target.value !== s.name && patch({ stops: route.stops.map((x) => (x.id === s.id ? { ...x, name: e.target.value } : x)) })} /></div>
              <div style={{ width: 96 }}><Input label={i === 0 ? "Morning" : undefined} type="time" defaultValue={s.morningTime} onBlur={(e) => e.target.value !== s.morningTime && patch({ stops: route.stops.map((x) => (x.id === s.id ? { ...x, morningTime: e.target.value } : x)) })} /></div>
              <IconBtn icon={<Trash2 size={14} />} title="Remove stop" danger onClick={() => patch({ stops: route.stops.filter((x) => x.id !== s.id), riders: route.riders.map((r) => (r.stopId === s.id ? { ...r, stopId: "" } : r)) })} />
            </div>
          ))}
          <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
            <input className="search-input" placeholder="Add a stop…" value={stopName} onChange={(e) => setStopName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && stopName.trim() && addStop()} />
            <Btn variant="secondary" icon={<Plus size={15} />} disabled={!stopName.trim() || busy} onClick={addStop}>Add</Btn>
          </div>
        </div>

        <div className="card" style={{ padding: 18 }}>
          <h3 style={{ margin: "0 0 10px", fontSize: "1rem" }}><UserPlus size={15} style={{ verticalAlign: "-2px" }} /> Riders ({route.riders.length} of {route.capacity})</h3>
          <div style={{ display: "flex", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
            <input className="search-input" style={{ flex: "1 1 180px" }} placeholder="Find a learner to add…" value={term} onChange={(e) => setTerm(e.target.value)} />
            <select className="search-input" style={{ width: 160 }} value={stopId} onChange={(e) => setStopId(e.target.value)}>
              {route.stops.length === 0 && <option value="">(no stops yet)</option>}
              {route.stops.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          {matches.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 10 }}>
              {matches.map((s) => <button key={s.id} type="button" className="btn btn--secondary btn--sm" style={{ justifyContent: "flex-start" }} onClick={() => addRider(s)}>{s.fullName} · {s.className}</button>)}
            </div>
          )}
          {route.riders.length === 0 && <p className="text-muted" style={{ fontSize: 13 }}>No riders yet.</p>}
        </div>
      </div>

      {route.riders.length > 0 && (
        <div style={{ marginTop: 18 }}>
          <TableWrap>
            <table className="data-table">
              <thead><tr><th>Stop</th><th>Learner</th><th>Class</th><th>Guardian</th><th /></tr></thead>
              <tbody>
                {groups.flatMap((g) => g.riders.map((r) => (
                  <tr key={r.studentId}>
                    <td style={{ fontSize: 13 }}>{g.stop.name}</td>
                    <td><strong>{r.name}</strong></td><td>{r.className}</td>
                    <td style={{ fontSize: 13 }}>{r.guardianPhone || <span className="text-danger">No phone</span>}</td>
                    <td style={{ textAlign: "right" }}><IconBtn icon={<Trash2 size={14} />} title="Remove from route" danger onClick={() => patch({ riders: route.riders.filter((x) => x.studentId !== r.studentId) })} /></td>
                  </tr>
                )))}
              </tbody>
            </table>
          </TableWrap>
        </div>
      )}

      {print && (
        <PrintSheet title="Route manifest" onClose={() => setPrint(false)}>
          <h1>{route.name}: manifest</h1>
          <p className="ps-sub">{[route.vehicle, route.plate, route.driverName && `Driver: ${route.driverName} (${route.driverPhone})`, `Departs ${route.morningDeparture}`].filter(Boolean).join(" · ")}</p>
          {groups.map((g) => (
            <div key={g.stop.id || "none"} className="ps-room">
              <h2>{g.stop.name}{g.stop.morningTime ? ` · ${g.stop.morningTime}` : ""} ({g.riders.length})</h2>
              <table>
                <thead><tr><th>Name</th><th>Class</th><th>Guardian phone</th><th>On</th><th>Off</th></tr></thead>
                <tbody>{g.riders.map((r) => <tr key={r.studentId}><td>{r.name}</td><td>{r.className}</td><td>{r.guardianPhone}</td><td style={{ width: 40 }} /><td style={{ width: 40 }} /></tr>)}</tbody>
              </table>
            </div>
          ))}
        </PrintSheet>
      )}

      {delay && (
        <DelayDialog
          route={route}
          onClose={() => setDelay(false)}
          onSend={async (minutes, note) => {
            const riders = students.filter((s) => route.riders.some((r) => r.studentId === s.id));
            await notifyTransportDelay({ schoolCode, route, students: riders, minutes, note, actor: currentUser });
            setDelay(false);
            say("success", `${riders.length} guardian${riders.length === 1 ? "" : "s"} told the bus is about ${minutes} minutes late.`);
          }}
        />
      )}
    </div>
  );
}

function DelayDialog({ route, onClose, onSend }) {
  const [minutes, setMinutes] = useState("20");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const withPhone = route.riders.filter((r) => r.guardianPhone).length;
  return (
    <Modal title="Bus is late" subtitle={route.name} onClose={onClose}
      footer={<><Btn variant="secondary" onClick={onClose}>Cancel</Btn>
        <Btn variant="accent" icon={<BellRing size={15} />} loading={busy} disabled={!(Number(minutes) > 0)} onClick={async () => { setBusy(true); await onSend(Number(minutes), note.trim()); }}>Tell {withPhone} guardian{withPhone === 1 ? "" : "s"}</Btn></>}>
      <Select label="About how late?" value={minutes} onChange={(e) => setMinutes(e.target.value)}>
        {["10", "15", "20", "30", "45", "60"].map((m) => <option key={m} value={m}>{m} minutes</option>)}
      </Select>
      <Textarea label="Reason (optional)" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Puncture on the Chileka road." />
      <p className="text-muted" style={{ fontSize: 12.5 }}>Sent on WhatsApp, in English or Chichewa by each guardian's language. Riders without a guardian phone number can't be reached.</p>
    </Modal>
  );
}
