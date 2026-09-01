// src/components/messaging/MessagesModule.jsx
// Staff side of parent messaging: an inbox of guardian conversations, each one
// anchored to a student, plus a picker for starting a new one. The parent side
// of the same `conversations` collection lives in the ACALink mobile app.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { db } from "../../firebase";
import { collection, query, where, getDocs } from "firebase/firestore";
import {
  MessageSquare, Send, Search, Plus, Loader2, ArrowLeft, User,
  Phone, GraduationCap, X, CheckCheck, Inbox,
} from "lucide-react";
import {
  subscribeConversations, subscribeMessages, sendMessage,
  markConversationRead, startConversationWithGuardian,
} from "../../services/messaging";
import { relativeTime } from "../../services/notifications";
import "./messaging.css";

function initials(name = "") {
  return name.split(" ").filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join("") || "?";
}

const TINTS = ["#4f6ef7", "#8b5cf6", "#0ea5e9", "#10b981", "#f59e0b", "#ef4444", "#ec4899", "#14b8a6"];
function tintFor(id = "") {
  let sum = 0;
  for (let i = 0; i < id.length; i += 1) sum += id.charCodeAt(i);
  return TINTS[sum % TINTS.length];
}

function dayLabel(date) {
  if (!date) return "";
  const today = new Date();
  const isSameDay = (a, b) => a.toDateString() === b.toDateString();
  if (isSameDay(date, today)) return "Today";
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (isSameDay(date, yesterday)) return "Yesterday";
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

// ─── New conversation ────────────────────────────────────────────────────────
function NewConversationModal({ schoolCode, currentUser, onClose, onStarted }) {
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState(null);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const snap = await getDocs(query(
          collection(db, "students"),
          where("schoolCode", "==", schoolCode),
        ));
        if (cancelled) return;
        setStudents(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      } catch (err) {
        if (!cancelled) setError(`Could not load students: ${err.message}`);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [schoolCode]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const withGuardian = students.filter((s) => s.guardianPhone);
    if (!q) return withGuardian.slice(0, 40);
    return withGuardian.filter((s) =>
      (s.fullName || "").toLowerCase().includes(q)
      || (s.guardianName || "").toLowerCase().includes(q)
      || (s.className || "").toLowerCase().includes(q),
    ).slice(0, 40);
  }, [students, search]);

  const start = async () => {
    if (!picked || !body.trim()) return;
    setSending(true);
    setError("");
    const res = await startConversationWithGuardian({
      schoolCode,
      student: picked,
      staff: currentUser,
      body: body.trim(),
    });
    setSending(false);
    if (!res.ok) { setError(res.error); return; }
    onStarted(res.id);
  };

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-container" style={{ maxWidth: 520 }}>
        <div className="modal-header">
          <h3>Message a guardian</h3>
          <button type="button" onClick={onClose} className="modal-close">×</button>
        </div>
        <div className="modal-body msg-new">
          {error && <div className="alert alert--error">{error}</div>}

          {picked ? (
            <div className="msg-new__picked">
              <span className="msg-avatar" style={{ background: tintFor(picked.id) }}>
                {initials(picked.guardianName || picked.fullName)}
              </span>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div className="msg-new__name">{picked.guardianName || "Guardian"}</div>
                <div className="msg-new__meta">
                  <GraduationCap size={11} /> {picked.fullName} · {picked.className || "No class"}
                </div>
                <div className="msg-new__meta"><Phone size={11} /> {picked.guardianPhone}</div>
              </div>
              <button type="button" className="act-tool" onClick={() => setPicked(null)} aria-label="Change">
                <X size={14} />
              </button>
            </div>
          ) : (
            <>
              <div className="search-wrapper">
                <Search className="search-icon" size={14} />
                <input
                  className="search-input"
                  placeholder="Search student, guardian or class…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  autoFocus
                />
              </div>
              <div className="msg-new__list">
                {loading ? (
                  <div className="msg-state"><Loader2 size={16} className="msg-spin" /> Loading students…</div>
                ) : filtered.length === 0 ? (
                  <div className="msg-state">No students with a guardian phone number on file.</div>
                ) : filtered.map((s) => (
                  <button key={s.id} type="button" className="msg-new__opt" onClick={() => setPicked(s)}>
                    <span className="msg-avatar msg-avatar--sm" style={{ background: tintFor(s.id) }}>
                      {initials(s.fullName)}
                    </span>
                    <div style={{ minWidth: 0, flex: 1, textAlign: "left" }}>
                      <div className="msg-new__name">{s.fullName}</div>
                      <div className="msg-new__meta">
                        {s.className || "No class"} · {s.guardianName || "Guardian"}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </>
          )}

          {picked && (
            <>
              <textarea
                className="msg-input msg-input--block"
                rows={4}
                placeholder={`Write to ${picked.guardianName || "the guardian"}…`}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                autoFocus
              />
              <button
                type="button"
                className="btn btn--accent btn--md"
                style={{ width: "100%" }}
                onClick={start}
                disabled={!body.trim() || sending}
              >
                {sending ? <Loader2 size={14} className="msg-spin" /> : <Send size={14} />}
                Send message
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Transcript ──────────────────────────────────────────────────────────────
function Transcript({ conversation, currentUser, onBack }) {
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const endRef = useRef(null);

  const conversationId = conversation?.id;
  const myId = currentUser.id;

  useEffect(() => {
    if (!conversationId) return undefined;
    const unsub = subscribeMessages(conversationId, myId, setMessages);
    markConversationRead(conversationId, myId);
    return () => unsub();
  }, [conversationId, myId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length]);

  const send = async () => {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    setDraft("");
    await sendMessage({
      conversationId: conversation.id,
      sender: { ...currentUser, type: "staff" },
      body: text,
    });
    setSending(false);
  };

  // Each message carries the day heading it should print above itself, if any.
  const rows = [];
  let lastDay = "";
  messages.forEach((m) => {
    const day = dayLabel(m.createdAtDate);
    rows.push({ message: m, day: day === lastDay ? null : day });
    lastDay = day;
  });

  if (!conversation) {
    return (
      <div className="msg-pane msg-pane--empty">
        <Inbox size={30} />
        <p className="msg-state__title">Pick a conversation</p>
        <p className="msg-state__sub">
          Guardian replies from the ACALink mobile app land here in real time.
        </p>
      </div>
    );
  }

  return (
    <div className="msg-pane">
      <header className="msg-pane__head">
        <button type="button" className="msg-back" onClick={onBack} aria-label="Back to inbox">
          <ArrowLeft size={16} />
        </button>
        <span className="msg-avatar" style={{ background: tintFor(conversation.parentId) }}>
          {initials(conversation.parentName)}
        </span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="msg-pane__name">{conversation.parentName || "Guardian"}</div>
          <div className="msg-pane__meta">
            <GraduationCap size={11} /> {conversation.studentName}
            {conversation.className && ` · ${conversation.className}`}
            {conversation.parentPhone && ` · ${conversation.parentPhone}`}
          </div>
        </div>
      </header>

      <div className="msg-scroll">
        {messages.length === 0 && (
          <div className="msg-state">No messages yet — say hello.</div>
        )}
        {rows.map(({ message: m, day }) => {
          const mine = m.senderId === currentUser.id;
          return (
            <div key={m.id}>
              {day && <div className="msg-day">{day}</div>}
              <div className={`msg-row ${mine ? "msg-row--mine" : ""}`}>
                {!mine && (
                  <span className="msg-avatar msg-avatar--xs" style={{ background: tintFor(m.senderId) }}>
                    {initials(m.senderName)}
                  </span>
                )}
                <div className={`msg-bubble ${mine ? "msg-bubble--mine" : ""}`}>
                  {!mine && <div className="msg-bubble__who">{m.senderName}</div>}
                  <div className="msg-bubble__text">{m.body}</div>
                  <div className="msg-bubble__time">
                    {m.createdAtDate?.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) || "…"}
                    {mine && <CheckCheck size={12} />}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>

      <div className="msg-composer">
        <textarea
          className="msg-input"
          rows={1}
          placeholder="Write a reply…  (Enter to send, Shift+Enter for a new line)"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
          }}
        />
        <button
          type="button"
          className="msg-send"
          onClick={send}
          disabled={!draft.trim() || sending}
          aria-label="Send message"
        >
          {sending ? <Loader2 size={16} className="msg-spin" /> : <Send size={16} />}
        </button>
      </div>
    </div>
  );
}

// ─── Module ──────────────────────────────────────────────────────────────────
/**
 * `initialConversationId` opens one thread straight away — a notification
 * deep-link. Callers pass it together with a matching `key` so a second
 * deep-link remounts the module rather than needing an effect to re-sync.
 */
export default function MessagesModule({ schoolCode, currentUser, initialConversationId }) {
  const myId = currentUser?.id || "";
  const [conversations, setConversations] = useState(null);
  const [activeId, setActiveId] = useState(initialConversationId || null);
  const [search, setSearch] = useState("");
  const [composing, setComposing] = useState(false);

  useEffect(() => {
    if (!myId) return undefined;
    const unsub = subscribeConversations(myId, setConversations);
    return () => unsub();
  }, [myId]);

  const loading = myId ? conversations === null : false;

  const filtered = useMemo(() => {
    const rows = conversations || [];
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((c) =>
      (c.parentName || "").toLowerCase().includes(q)
      || (c.studentName || "").toLowerCase().includes(q)
      || (c.lastMessage || "").toLowerCase().includes(q),
    );
  }, [conversations, search]);

  const active = (conversations || []).find((c) => c.id === activeId) || null;
  const totalUnread = (conversations || []).reduce(
    (n, c) => n + (c.unread?.[myId] || 0), 0,
  );

  const open = useCallback((id) => {
    setActiveId(id);
    markConversationRead(id, myId);
  }, [myId]);

  return (
    <div className="msg-module">
      <div className="msg-module__head">
        <div>
          <h2 className="msg-module__title">Messages</h2>
          <p className="msg-module__sub">
            Direct conversations with guardians
            {totalUnread > 0 && ` · ${totalUnread} unread`}
          </p>
        </div>
        <button type="button" className="btn btn--accent btn--md" onClick={() => setComposing(true)}>
          <Plus size={14} /> New message
        </button>
      </div>

      <div className={`msg-layout ${active ? "msg-layout--open" : ""}`}>
        <aside className="msg-list">
          <div className="msg-list__search">
            <div className="search-wrapper">
              <Search className="search-icon" size={14} />
              <input
                className="search-input"
                placeholder="Search conversations…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>

          <div className="msg-list__scroll">
            {loading ? (
              <div className="msg-state"><Loader2 size={16} className="msg-spin" /> Loading…</div>
            ) : filtered.length === 0 ? (
              <div className="msg-state msg-state--col">
                <MessageSquare size={24} />
                <p className="msg-state__title">No conversations yet</p>
                <p className="msg-state__sub">Start one with “New message”.</p>
              </div>
            ) : filtered.map((c) => {
              const unread = c.unread?.[myId] || 0;
              return (
                <button
                  key={c.id}
                  type="button"
                  className={`msg-card ${activeId === c.id ? "msg-card--on" : ""} ${unread ? "msg-card--unread" : ""}`}
                  onClick={() => open(c.id)}
                >
                  <span className="msg-avatar" style={{ background: tintFor(c.parentId) }}>
                    {initials(c.parentName)}
                  </span>
                  <div className="msg-card__body">
                    <div className="msg-card__top">
                      <span className="msg-card__name">{c.parentName || "Guardian"}</span>
                      <span className="msg-card__time">{relativeTime(c.lastMessageDate)}</span>
                    </div>
                    <div className="msg-card__student">
                      <User size={10} /> {c.studentName}
                    </div>
                    <div className="msg-card__preview">
                      {c.lastSenderId === currentUser.id && <span className="msg-card__you">You: </span>}
                      {c.lastMessage || "No messages yet"}
                    </div>
                  </div>
                  {unread > 0 && <span className="msg-card__badge">{unread}</span>}
                </button>
              );
            })}
          </div>
        </aside>

        <Transcript
          conversation={active}
          currentUser={currentUser}
          onBack={() => setActiveId(null)}
        />
      </div>

      {composing && (
        <NewConversationModal
          schoolCode={schoolCode}
          currentUser={currentUser}
          onClose={() => setComposing(false)}
          onStarted={(id) => { setComposing(false); open(id); }}
        />
      )}
    </div>
  );
}
