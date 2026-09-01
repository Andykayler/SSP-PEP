// src/components/notifications/NotificationBell.jsx
// Topbar bell + dropdown inbox, and the floating toast stack that announces
// notifications arriving while the user is already on the page.
import { useEffect, useRef, useState } from "react";
import {
  Bell, Megaphone, UserCheck, Award, AlertTriangle, BookOpen, Wallet,
  MessageSquare, AtSign, MessagesSquare, Users, Check, X, Inbox,
} from "lucide-react";
import { useNotifications } from "./notificationContext";
import { relativeTime } from "../../services/notifications";
import "./notifications.css";

const ICONS = {
  announcement: Megaphone,
  attendance:   UserCheck,
  performance:  Award,
  discipline:   AlertTriangle,
  homework:     BookOpen,
  fees:         Wallet,
  message:      MessageSquare,
  mention:      AtSign,
  thread:       MessagesSquare,
  staff:        Users,
  system:       Bell,
};

const TONES = {
  announcement: "info",
  attendance:   "warning",
  performance:  "success",
  discipline:   "danger",
  homework:     "info",
  fees:         "warning",
  message:      "info",
  mention:      "accent",
  thread:       "neutral",
  staff:        "neutral",
  system:       "neutral",
};

function NotificationIcon({ category, size = 16 }) {
  const Icon = ICONS[category] || Bell;
  return (
    <span className={`notif-icon notif-icon--${TONES[category] || "neutral"}`}>
      <Icon size={size} />
    </span>
  );
}

const FILTERS = [
  { id: "all", label: "All" },
  { id: "unread", label: "Unread" },
  { id: "mention", label: "Mentions" },
];

export function NotificationBell() {
  const {
    notifications, unreadCount, markRead, markAllRead, dismiss, onNavigate,
  } = useNotifications();
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("all");
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDocClick = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    const onEsc = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  const visible = notifications.filter((n) => {
    if (filter === "unread") return !n.read;
    if (filter === "mention") return n.category === "mention" || n.category === "message";
    return true;
  });

  const handleOpen = (n) => {
    if (!n.read) markRead(n.id);
    setOpen(false);
    onNavigate(n.tab, n);
  };

  return (
    <div className="notif-wrap" ref={wrapRef}>
      <button
        type="button"
        className={`notif-bell ${unreadCount > 0 ? "notif-bell--active" : ""}`}
        onClick={() => setOpen((v) => !v)}
        aria-label={unreadCount ? `Notifications, ${unreadCount} unread` : "Notifications"}
        aria-expanded={open}
      >
        <Bell size={18} />
        {unreadCount > 0 && (
          <span className="notif-badge">{unreadCount > 99 ? "99+" : unreadCount}</span>
        )}
      </button>

      {open && (
        <div className="notif-panel" role="dialog" aria-label="Notifications">
          <div className="notif-panel__head">
            <div className="notif-panel__title">
              Notifications
              {unreadCount > 0 && <span className="notif-panel__count">{unreadCount} new</span>}
            </div>
            <button
              type="button"
              className="notif-panel__action"
              onClick={markAllRead}
              disabled={unreadCount === 0}
            >
              <Check size={13} /> Mark all read
            </button>
          </div>

          <div className="notif-tabs">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                className={`notif-tab ${filter === f.id ? "notif-tab--on" : ""}`}
                onClick={() => setFilter(f.id)}
              >
                {f.label}
              </button>
            ))}
          </div>

          <div className="notif-list">
            {visible.length === 0 ? (
              <div className="notif-empty">
                <Inbox size={26} />
                <p className="notif-empty__title">
                  {filter === "unread" ? "You are all caught up" : "Nothing here yet"}
                </p>
                <p className="notif-empty__sub">
                  Announcements, mentions and replies land here in real time.
                </p>
              </div>
            ) : (
              visible.map((n) => (
                <div
                  key={n.id}
                  className={`notif-item ${n.read ? "" : "notif-item--unread"}`}
                  role="button"
                  tabIndex={0}
                  onClick={() => handleOpen(n)}
                  onKeyDown={(e) => { if (e.key === "Enter") handleOpen(n); }}
                >
                  <NotificationIcon category={n.category} />
                  <div className="notif-item__body">
                    <div className="notif-item__title">{n.title}</div>
                    {n.body && <div className="notif-item__text">{n.body}</div>}
                    <div className="notif-item__meta">
                      <span>{relativeTime(n.createdAtDate)}</span>
                      {n.studentName && <span>· {n.studentName}</span>}
                      {n.priority === "urgent" && (
                        <span className="notif-item__flag">Urgent</span>
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="notif-item__x"
                    aria-label="Dismiss notification"
                    onClick={(e) => { e.stopPropagation(); dismiss(n.id); }}
                  >
                    <X size={13} />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function NotificationToasts() {
  const { toasts, dismissToast, markRead, onNavigate } = useNotifications();
  if (toasts.length === 0) return null;

  return (
    <div className="notif-toasts" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`notif-toast notif-toast--${TONES[t.category] || "neutral"}`}>
          <NotificationIcon category={t.category} size={15} />
          <div className="notif-toast__body">
            <div className="notif-toast__title">{t.title}</div>
            {t.body && <div className="notif-toast__text">{t.body}</div>}
            <button
              type="button"
              className="notif-toast__link"
              onClick={() => { markRead(t.id); dismissToast(t.id); onNavigate(t.tab, t); }}
            >
              View
            </button>
          </div>
          <button
            type="button"
            className="notif-toast__x"
            aria-label="Dismiss"
            onClick={() => dismissToast(t.id)}
          >
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}

export default NotificationBell;
