// src/components/ui/ViewOnly.jsx
// ─────────────────────────────────────────────────────────────────────────────
// Lets the director look at a module the head teacher works in, without being
// handed its controls.
//
// The director monitors every module and changes none of them. Rebuilding two
// dozen screens as read-only twins would mean two copies of every table and
// chart drifting apart, so the real module is rendered and this wrapper takes
// the write controls away.
//
// What this is, and is not:
//
//   • It is a courtesy. Buttons that add, edit, delete, approve or send are
//     hidden and any form is refused, so a director is not offered an action
//     that would only fail.
//   • It is NOT the control. firestore.rules is: `isDirector()` is kept out of
//     every create/update/delete rule (see canOversee()), so a write attempted
//     around this wrapper is still refused by the server.
//
// Matching is on the start of a control's visible label, title or aria-label,
// so "Add class" and "Delete" are caught but a tab called "Records", or a
// filter called "Sent", is not.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useRef } from "react";
import { Eye } from "lucide-react";
import { looksLikeWrite, isDismissal } from "./viewOnlyCore";

const CONTROLS = "button, [role='button'], input[type='submit'], input[type='file']";

function labelOf(el) {
  return (
    el.getAttribute("aria-label") ||
    el.getAttribute("title") ||
    el.value ||
    el.textContent ||
    ""
  );
}

function lockControls(root) {
  root.querySelectorAll(CONTROLS).forEach((el) => {
    if (el.dataset.viewOnly || el.closest("[data-view-ok]")) return;
    const label = labelOf(el);
    if (isDismissal(label)) return;
    if (el.getAttribute("type") === "file" || looksLikeWrite(label)) {
      el.dataset.viewOnly = "hidden";
      el.hidden = true;
      el.setAttribute("aria-hidden", "true");
      el.tabIndex = -1;
      if ("disabled" in el) el.disabled = true;
    }
  });
}

export default function ViewOnly({ children, label = "View only" }) {
  const ref = useRef(null);

  useEffect(() => {
    const root = ref.current;
    if (!root) return undefined;

    lockControls(root);
    const observer = new MutationObserver(() => lockControls(root));
    observer.observe(root, { childList: true, subtree: true });

    // Pressing Enter in a field submits its form without touching a button.
    const refuse = (e) => {
      if (e.target instanceof HTMLFormElement && root.contains(e.target)) {
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    };
    document.addEventListener("submit", refuse, true);

    return () => {
      observer.disconnect();
      document.removeEventListener("submit", refuse, true);
    };
  }, []);

  return (
    <div ref={ref} className="view-only">
      <div
        role="note"
        style={{
          display: "flex", alignItems: "center", gap: 8, margin: "0 0 14px",
          padding: "8px 12px", borderRadius: 8, fontSize: 12.5,
          background: "var(--surface-2, rgba(0,0,0,0.04))",
          border: "1px solid var(--border-color, rgba(0,0,0,0.1))",
          color: "var(--text-secondary, inherit)",
        }}
      >
        <Eye size={14} aria-hidden="true" />
        <strong>{label}</strong>
        <span>— you are monitoring this module. Changes are made by the staff who run it.</span>
      </div>
      {children}
    </div>
  );
}
