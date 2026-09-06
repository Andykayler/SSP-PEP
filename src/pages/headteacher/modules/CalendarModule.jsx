// src/pages/headteacher/modules/CalendarModule.jsx
// The school year, as a list families can read.
//
// Grouped into what is coming and what has passed rather than shown as a month
// grid: a school year is a few dozen dated things, and a grid would spend most
// of its space on empty squares while burying the two events anyone is looking
// for. Announcing is a separate action from saving, so drafting next year's
// calendar does not send forty notifications.
import { useState, useEffect, useCallback, useMemo } from "react";
import {
  CalendarDays, Plus, Pencil, Trash2, Megaphone, RefreshCw, CheckCircle2,
} from "lucide-react";
import {
  fetchEvents, saveEvent, deleteEvent, announceEvent, EVENT_CATEGORIES,
  AUDIENCES, categoryMeta, formatWhen, daysUntil, isPast, today,
} from "../../../services/schoolCalendar";
import { subscribeSchoolSettings } from "../../../services/academicTerm";
import {
  Modal, Btn, IconBtn, Input, Textarea, Select, Pill, EmptyState,
  ModuleHeader, Notice, LoadingState, FilterBar,
} from "../../../components/ui/ModuleKit";
import "./staff-management.css";
import useLoader from "../../../hooks/useLoader";

const BLANK = {
  title: "", description: "", category: "term",
  startDate: today(), endDate: "", audience: "everyone",
};

export default function CalendarModule({ schoolCode, currentUser }) {
  const [events, setEvents] = useState(null);
  const [term, setTerm] = useState("");
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);
  const [filter, setFilter] = useState("upcoming");

  const load = useCallback(async () => {
    if (!schoolCode) return;
    setEvents(await fetchEvents(schoolCode));
  }, [schoolCode]);


  useLoader(load);

  useEffect(() => {
    if (!schoolCode) return;
    return subscribeSchoolSettings(schoolCode, (s) => setTerm(s?.currentTerm || ""));
  }, [schoolCode]);

  const { upcomingList, pastList } = useMemo(() => {
    const all = events || [];
    return {
      upcomingList: all.filter((e) => !isPast(e)),
      pastList: all.filter((e) => isPast(e)).reverse(),
    };
  }, [events]);

  const visible = filter === "upcoming" ? upcomingList
    : filter === "past" ? pastList
      : (events || []);

  const submit = async () => {
    setBusy(true);
    const res = await saveEvent({
      schoolCode,
      event: { ...form, term: form.term || term },
      actor: currentUser,
    });
    setBusy(false);
    if (!res.ok) { setNotice({ tone: "danger", text: res.error }); return; }
    setForm(null);
    setNotice({ tone: "success", text: form.id ? "Event updated." : "Event added to the calendar." });
    load();
  };

  const announce = async (event) => {
    const who = event.audience === "staff" ? "staff"
      : event.audience === "parents" ? "families" : "families and staff";
    if (event.announcedAt && !window.confirm(
      `"${event.title}" has already been announced. Tell ${who} again?`)) return;
    if (!event.announcedAt && !window.confirm(`Announce "${event.title}" to ${who}?`)) return;

    setBusy(true);
    const res = await announceEvent({ schoolCode, event, actor: currentUser });
    setBusy(false);
    setNotice(res.ok
      ? { tone: "success", text: `Announced to ${who}.` }
      : { tone: "danger", text: res.error });
    if (res.ok) load();
  };

  const remove = async (event) => {
    if (!window.confirm(`Remove "${event.title}" from the calendar?`)) return;
    await deleteEvent(event.id);
    setNotice({ tone: "success", text: "Event removed." });
    load();
  };

  if (events === null) return <LoadingState label="Loading the school calendar…" />;

  return (
    <div className="space-y-6">
      <ModuleHeader
        title="School Calendar"
        subtitle={`Term dates, examinations, holidays and meetings${term ? ` · ${term}` : ""}`}
        actions={[
          <IconBtn key="r" icon={<RefreshCw size={15} />} title="Refresh" onClick={load} />,
          <Btn key="a" variant="accent" icon={<Plus size={15} />} onClick={() => setForm({ ...BLANK })}>
            Add Event
          </Btn>,
        ]}
      />

      {notice && (
        <Notice tone={notice.tone} onDismiss={() => setNotice(null)}>{notice.text}</Notice>
      )}

      <FilterBar
        value={filter}
        onChange={setFilter}
        options={[
          { id: "upcoming", label: "Coming up", count: upcomingList.length },
          { id: "past", label: "Past", count: pastList.length },
          { id: "all", label: "All", count: events.length },
        ]}
      />

      {visible.length === 0 ? (
        <EmptyState
          icon={<CalendarDays size={28} />}
          title={filter === "past" ? "Nothing has passed yet" : "No events on the calendar"}
          sub="Add the term's opening and closing dates first — families ask about those before anything else."
          action={<Btn variant="accent" icon={<Plus size={15} />} onClick={() => setForm({ ...BLANK })}>Add Event</Btn>}
        />
      ) : (
        <div className="space-y-2">
          {visible.map((e) => {
            const meta = categoryMeta(e.category);
            const days = daysUntil(e);
            return (
              <div key={e.id} className="card p-5">
                <div className="flex items-center justify-between" style={{ flexWrap: "wrap", gap: 12 }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div className="flex items-center gap-2 mb-2" style={{ flexWrap: "wrap" }}>
                      <Pill tone={meta.tone}>{meta.label}</Pill>
                      <strong style={{ fontSize: 15 }}>{e.title}</strong>
                      {e.audience !== "everyone" && (
                        <span className="tag tag--neutral">
                          {AUDIENCES.find((a) => a.id === e.audience)?.label}
                        </span>
                      )}
                      {e.announcedAt && (
                        <span className="text-success" title="Families have been told" style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11 }}>
                          <CheckCircle2 size={12} /> announced
                        </span>
                      )}
                    </div>
                    <div className="text-muted" style={{ fontSize: 13 }}>
                      {formatWhen(e)}
                      {days !== null && days > 0 && days <= 30 && ` · in ${days} day${days === 1 ? "" : "s"}`}
                      {days === 0 && " · today"}
                    </div>
                    {e.description && (
                      <p className="text-muted mt-2" style={{ fontSize: 13 }}>{e.description}</p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <IconBtn
                      icon={<Megaphone size={15} />}
                      title={e.announcedAt ? "Announce again" : "Announce to families"}
                      onClick={() => announce(e)}
                      disabled={busy}
                    />
                    <IconBtn icon={<Pencil size={15} />} title="Edit" onClick={() => setForm({ ...e })} />
                    <IconBtn icon={<Trash2 size={15} />} title="Remove" danger onClick={() => remove(e)} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {form && (
        <Modal
          title={form.id ? "Edit event" : "Add an event"}
          subtitle="Families see the title, the dates and the description."
          onClose={() => setForm(null)}
          footer={(
            <>
              <Btn variant="secondary" onClick={() => setForm(null)}>Cancel</Btn>
              <Btn variant="accent" loading={busy} onClick={submit}>
                {form.id ? "Save changes" : "Add to calendar"}
              </Btn>
            </>
          )}
        >
          <div className="space-y-4">
            <Input
              label="Title" required
              value={form.title}
              onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
              placeholder="Term 1 opens"
            />
            <div className="grid grid-cols-2 gap-4">
              <Select
                label="Category" required
                value={form.category}
                onChange={(e) => setForm((p) => ({ ...p, category: e.target.value }))}
              >
                {EVENT_CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
              </Select>
              <Select
                label="Who sees it"
                value={form.audience}
                onChange={(e) => setForm((p) => ({ ...p, audience: e.target.value }))}
              >
                {AUDIENCES.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Starts" required type="date"
                value={form.startDate}
                onChange={(e) => setForm((p) => ({ ...p, startDate: e.target.value }))}
              />
              <Input
                label="Ends" type="date"
                hint="Leave blank for a single day."
                value={form.endDate}
                onChange={(e) => setForm((p) => ({ ...p, endDate: e.target.value }))}
              />
            </div>
            <Textarea
              label="Description"
              hint="What a parent needs to know — times, what to bring, who it is for."
              value={form.description}
              onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
            />
            <p className="text-muted" style={{ fontSize: 12 }}>
              Adding an event does not tell anyone. Use the megaphone on the event to announce it
              when the calendar is ready.
            </p>
          </div>
        </Modal>
      )}
    </div>
  );
}
