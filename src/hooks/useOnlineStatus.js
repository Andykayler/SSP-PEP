// src/hooks/useOnlineStatus.js
// Whether the browser currently believes it has a network.
//
// navigator.onLine only reports whether an interface is up, not whether
// anything is reachable, so treat it as a hint for wording rather than proof
// of connectivity. Firestore's own write queue is what actually keeps data
// safe — this just lets the UI say something honest while that happens.
import { useEffect, useState } from "react";

export default function useOnlineStatus() {
  const [online, setOnline] = useState(
    () => (typeof navigator === "undefined" ? true : navigator.onLine),
  );

  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
    };
  }, []);

  return online;
}
