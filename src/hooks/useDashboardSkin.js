import { useLayoutEffect } from "react";

// Puts a `skin-<name>` class on <html> while the calling dashboard is mounted.
// It sits on <html> rather than the shell so portalled UI (the account panel,
// the guided tour, print sheets) picks up the same skin as the page.
export default function useDashboardSkin(name) {
  useLayoutEffect(() => {
    if (!name) return undefined;
    const cls = `skin-${name}`;
    document.documentElement.classList.add(cls);
    return () => document.documentElement.classList.remove(cls);
  }, [name]);
}
