// src/components/notifications/NotificationProvider.jsx
// Holds one live subscription to the signed-in user's inbox and shares it with
// the bell, the toast stack and anything else that needs an unread count.
// Mounted once per dashboard, just inside the auth gate.
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import {
  subscribeNotifications, markNotificationRead, markAllNotificationsRead,
  deleteNotification,
} from "../../services/notifications";
import { NotificationContext } from "./notificationContext";

const TOAST_MS = 6500;

export default function NotificationProvider({
  recipientId,
  schoolCode = "",
  onNavigate,
  children,
}) {
  const [notifications, setNotifications] = useState([]);
  const [toasts, setToasts] = useState([]);

  // Ids already on screen when the subscription first resolved. Without this
  // the whole existing inbox would pop as toasts on every page load.
  const knownIds = useRef(null);

  useEffect(() => {
    // No recipient means nothing to show; the initial state is already empty,
    // and a sign-out unmounts the whole dashboard anyway.
    if (!recipientId) return undefined;
    knownIds.current = null;
    const unsub = subscribeNotifications(recipientId, (rows) => {
      setNotifications(rows);

      if (knownIds.current === null) {
        knownIds.current = new Set(rows.map((r) => r.id));
        return;
      }
      const fresh = rows.filter((r) => !knownIds.current.has(r.id) && !r.read);
      fresh.forEach((r) => knownIds.current.add(r.id));
      if (fresh.length) {
        setToasts((prev) => [...fresh.slice(0, 3), ...prev].slice(0, 4));
      }
    });
    return () => unsub();
  }, [recipientId]);

  // Auto-dismiss the oldest toast on a timer. One timer per render pass is
  // enough because the effect re-runs whenever the stack changes.
  useEffect(() => {
    if (toasts.length === 0) return undefined;
    const t = setTimeout(() => setToasts((prev) => prev.slice(0, -1)), TOAST_MS);
    return () => clearTimeout(t);
  }, [toasts]);

  const unreadCount = useMemo(
    () => notifications.filter((n) => !n.read).length,
    [notifications],
  );

  const markRead = useCallback((id) => {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
    markNotificationRead(id);
  }, []);

  const markAllRead = useCallback(() => {
    const ids = notifications.filter((n) => !n.read).map((n) => n.id);
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    markAllNotificationsRead(ids);
  }, [notifications]);

  const dismiss = useCallback((id) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
    deleteNotification(id);
  }, []);

  const dismissToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const value = useMemo(() => ({
    notifications, unreadCount, toasts, recipientId, schoolCode,
    markRead, markAllRead, dismiss, dismissToast,
    onNavigate: onNavigate || (() => {}),
  }), [notifications, unreadCount, toasts, recipientId, schoolCode,
       markRead, markAllRead, dismiss, dismissToast, onNavigate]);

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
}
