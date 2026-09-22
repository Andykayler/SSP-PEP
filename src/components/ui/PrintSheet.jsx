// A full-screen preview of something meant for paper: a seating list to pin on a
// hall door, an invigilation roster, a register.
//
// Rendered through a portal into <body> as a direct child, so the print
// stylesheet can hide everything else on the page with one selector — the
// dashboards wrap their content in several nested scroll containers, and
// printing from inside them clips whatever overflows. Always black on white,
// whichever theme the screen is in, because nobody wants a dark-mode hall list.
import { useEffect } from "react";
import { createPortal } from "react-dom";
import { Printer, X } from "lucide-react";

const CSS = `
#print-sheet-root { position: fixed; inset: 0; z-index: 9500; overflow: auto; background: #e9ecf3; font-family: 'DM Sans', system-ui, sans-serif; color: #111; }
#print-sheet-root .ps-bar { position: sticky; top: 0; display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 10px 18px; background: #14213d; color: #fff; }
#print-sheet-root .ps-bar button { display: inline-flex; align-items: center; gap: 6px; min-height: 36px; padding: 0 14px; border: 1px solid rgba(255,255,255,.35); border-radius: 8px; background: transparent; color: #fff; font-weight: 600; cursor: pointer; }
#print-sheet-root .ps-bar .ps-primary { background: #4f6ef7; border-color: transparent; }
#print-sheet-root .ps-page { max-width: 820px; margin: 18px auto; padding: 28px 34px; background: #fff; box-shadow: 0 6px 24px rgba(0,0,0,.18); }
#print-sheet-root h1 { margin: 0 0 2px; font-size: 20px; }
#print-sheet-root h2 { margin: 22px 0 6px; font-size: 15px; page-break-after: avoid; }
#print-sheet-root p.ps-sub { margin: 0 0 14px; color: #555; font-size: 12.5px; }
#print-sheet-root table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
#print-sheet-root th, #print-sheet-root td { padding: 5px 8px; border: 1px solid #bbb; text-align: left; }
#print-sheet-root th { background: #f0f0f0; }
#print-sheet-root .ps-room { page-break-inside: avoid; }
#print-sheet-root .ps-break { page-break-before: always; }
@media print {
  body > *:not(#print-sheet-root) { display: none !important; }
  html, body { overflow: visible !important; height: auto !important; }
  #print-sheet-root { position: static; overflow: visible; background: #fff; }
  #print-sheet-root .ps-bar { display: none; }
  #print-sheet-root .ps-page { max-width: none; margin: 0; padding: 0; box-shadow: none; }
}
`;

export default function PrintSheet({ title, onClose, children }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return createPortal(
    <div id="print-sheet-root">
      <style>{CSS}</style>
      <div className="ps-bar">
        <strong>{title}</strong>
        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" className="ps-primary" onClick={() => window.print()}><Printer size={16} /> Print</button>
          <button type="button" onClick={onClose}><X size={16} /> Close</button>
        </div>
      </div>
      <div className="ps-page">{children}</div>
    </div>,
    document.body,
  );
}
