// src/components/notifications/notificationContext.js
// The context object and its hook live apart from the provider component so
// that file keeps a component-only export (React Fast Refresh requirement).
import { createContext, useContext } from "react";

export const NotificationContext = createContext(null);

// Modules can render outside a provider (in isolation, or in a portal that has
// not wired notifications yet) — degrade to a no-op rather than crashing.
const INERT = {
  notifications: [], unreadCount: 0, toasts: [], recipientId: "", schoolCode: "",
  markRead: () => {}, markAllRead: () => {}, dismiss: () => {},
  dismissToast: () => {}, onNavigate: () => {},
};

export function useNotifications() {
  return useContext(NotificationContext) || INERT;
}
