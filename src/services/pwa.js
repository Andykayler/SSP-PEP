// src/services/pwa.js
// Registers the service worker (public/sw.js) and offers a tiny hook for
// telling the user a new version is ready. Skipped entirely outside a secure
// context (service workers require HTTPS or localhost) and in dev, where
// Vite's own dev server already serves fresh modules and a cached shell would
// only get in the way.
let updateCallback = null;

export function onUpdateAvailable(cb) {
  updateCallback = cb;
}

export function registerServiceWorker() {
  if (import.meta.env.DEV) return;
  if (!("serviceWorker" in navigator)) return;

  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").then((reg) => {
      reg.addEventListener("updatefound", () => {
        const worker = reg.installing;
        if (!worker) return;
        worker.addEventListener("statechange", () => {
          // A worker taking over from an existing one (not the very first
          // install) means new code is ready and waiting for a reload.
          if (worker.state === "installed" && navigator.serviceWorker.controller) {
            updateCallback?.();
          }
        });
      });
    }).catch((err) => console.warn("[pwa] service worker registration failed:", err));
  });
}

export function applyUpdate() {
  window.location.reload();
}
