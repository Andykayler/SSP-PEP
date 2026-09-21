// A guided walkthrough for the dashboards.
//
// It spotlights one thing at a time (a sidebar module, a button in the top
// bar), says what it is and when to press it, and glides to the next. Where a
// step belongs to a module it also opens that module behind the spotlight, so
// the person sees the page as well as reading about it.
//
// Rendered through a portal into <body>: the dashboards restyle every button
// inside `.dashboard-shell` (polish.css), and the tour's controls must not
// inherit that. The steps find their targets by `data-tour` attributes, which
// keeps the tour decoupled from class names that change for visual reasons.
import { useState, useEffect, useLayoutEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { markTourSeen } from "./tourSteps";
import "./tour.css";

const isMobile = () => window.matchMedia("(max-width: 1023px)").matches;

/* ── Placement ──────────────────────────────────────────────────────────── */

const MARGIN = 12;
const GAP = 18;
const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), Math.max(lo, hi));

// Puts the card beside the spotlight where there is room, otherwise centres it.
// Returns the side the card sits on so the arrow can point back at the target.
function placeCard(rect, size, vp) {
  const w = Math.min(size.w, vp.w - MARGIN * 2);
  const h = size.h;
  if (!rect) {
    return { left: (vp.w - w) / 2, top: Math.max(MARGIN, (vp.h - h) / 2), width: w, side: "center" };
  }

  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const fits = {
    right: rect.left + rect.width + GAP + w <= vp.w - MARGIN,
    left: rect.left - GAP - w >= MARGIN,
    below: rect.top + rect.height + GAP + h <= vp.h - MARGIN,
    above: rect.top - GAP - h >= MARGIN,
  };
  // On a phone the card is nearly full width, so only above/below make sense.
  const order = vp.w < 640 ? ["below", "above"] : ["right", "below", "above", "left"];
  const side = order.find((s) => fits[s]);

  if (!side) {
    // The target is too big to sit beside: dock the card to the bottom edge.
    return { left: (vp.w - w) / 2, top: vp.h - h - MARGIN, width: w, side: "center" };
  }
  if (side === "right" || side === "left") {
    const top = clamp(cy - h / 2, MARGIN, vp.h - h - MARGIN);
    return {
      left: side === "right" ? rect.left + rect.width + GAP : rect.left - GAP - w,
      top, width: w, side,
      arrow: clamp(cy - top, 24, h - 24),
    };
  }
  const left = clamp(cx - w / 2, MARGIN, vp.w - w - MARGIN);
  return {
    left,
    top: side === "below" ? rect.top + rect.height + GAP : rect.top - GAP - h,
    width: w, side,
    arrow: clamp(cx - left, 24, w - 24),
  };
}

/* ── Help button ────────────────────────────────────────────────────────── */

const HELP_ICON = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} width={18} height={18} aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z" />
  </svg>
);

// Same look as the theme toggle beside it. Until the person has taken the tour
// once it carries a gentle ring, so a first-time user notices it exists.
export function TourHelpButton({ onClick, seen }) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-tour="help"
      title="Take a tour of this dashboard"
      aria-label="Start the guided tour"
      className={`theme-toggle-btn tour-help-btn${seen ? "" : " tour-help-btn--new"}`}
    >
      {HELP_ICON}
    </button>
  );
}

/* ── Tour ───────────────────────────────────────────────────────────────── */

export default function GuidedTour({
  open, steps: allSteps, role, startTab, onClose, onTabChange, setSidebarOpen,
}) {
  const [steps, setSteps] = useState([]);
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState(null);
  const [size, setSize] = useState({ w: 380, h: 250 });
  const [vp, setVp] = useState(() => ({ w: window.innerWidth, h: window.innerHeight }));
  const cardRef = useRef(null);
  const nextRef = useRef(null);
  const startTabRef = useRef(startTab);

  const step = steps[index];
  const last = index === steps.length - 1;

  // Freeze the step list when the tour opens. Steps whose target is not on the
  // page (no notification bell for this user, say) are dropped rather than
  // shown pointing at nothing.
  useEffect(() => {
    if (!open) return;
    startTabRef.current = startTab;
    setSteps(allSteps.filter((s) => !s.target || document.querySelector(s.target)));
    setIndex(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const finish = useCallback(() => {
    markTourSeen(role);
    if (isMobile()) setSidebarOpen?.(false);
    if (startTabRef.current) onTabChange?.(startTabRef.current);
    onClose?.();
  }, [role, onClose, onTabChange, setSidebarOpen]);

  const next = useCallback(() => {
    if (last) finish(); else setIndex((i) => i + 1);
  }, [last, finish]);
  const back = useCallback(() => setIndex((i) => Math.max(0, i - 1)), []);

  // Open the module the step is about, and the mobile drawer if it holds the
  // target. On desktop the sidebar is always there, so it is left alone.
  useEffect(() => {
    if (!open || !step) return;
    if (step.tab) onTabChange?.(step.tab);
    if (isMobile()) setSidebarOpen?.(Boolean(step.sidebar));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, step]);

  // Follow the target every frame. It can move under us: the mobile drawer is
  // still sliding in when the step starts, the sidebar can scroll, the window
  // can resize. Polling a rect is cheap and beats chasing every cause.
  useEffect(() => {
    if (!open || !step) return undefined;
    if (!step.target) { setRect(null); return undefined; }

    document.querySelector(step.target)?.scrollIntoView?.({ block: "nearest", inline: "nearest" });

    let raf;
    let lastKey = "";
    const tick = () => {
      const node = document.querySelector(step.target);
      if (node) {
        const r = node.getBoundingClientRect();
        const key = `${Math.round(r.left)},${Math.round(r.top)},${Math.round(r.width)},${Math.round(r.height)}`;
        if (key !== lastKey) {
          lastKey = key;
          setRect({ left: r.left, top: r.top, width: r.width, height: r.height });
        }
      }
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [open, step]);

  useEffect(() => {
    if (!open) return undefined;
    const onResize = () => setVp({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [open]);

  useLayoutEffect(() => {
    if (!open || !cardRef.current) return;
    const w = cardRef.current.offsetWidth;
    const h = cardRef.current.offsetHeight;
    setSize((s) => (s.w === w && s.h === h ? s : { w, h }));
  }, [open, index, steps, vp.w]);

  useEffect(() => {
    if (open && step) nextRef.current?.focus({ preventScroll: true });
  }, [open, step]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === "ArrowRight") { e.preventDefault(); next(); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); back(); }
      else if (e.key === "Escape") { e.preventDefault(); finish(); }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, next, back, finish]);

  if (!open || !step) return null;

  const pos = placeCard(step.target ? rect : null, size, vp);
  const pad = 6;
  const pct = ((index + 1) / steps.length) * 100;

  return createPortal(
    <div className="tour-root" role="dialog" aria-modal="true" aria-label="Guided tour">
      {/* Swallows clicks so the page underneath cannot be used mid-tour. */}
      <div className="tour-block" />

      {step.target && rect ? (
        // Clicking the highlighted thing is the same as pressing Next: the
        // "press this" in the card is meant literally.
        <div
          className="tour-spot"
          onClick={next}
          title="Press to continue"
          style={{
            left: rect.left - pad,
            top: rect.top - pad,
            width: rect.width + pad * 2,
            height: rect.height + pad * 2,
          }}
        />
      ) : (
        <div className="tour-dim" />
      )}

      <div
        ref={cardRef}
        className="tour-card"
        data-side={pos.side}
        style={{
          left: pos.left,
          top: pos.top,
          width: pos.width,
          "--tour-arrow": `${pos.arrow ?? 0}px`,
        }}
      >
        <div className="tour-progress" aria-hidden="true">
          <div className="tour-progress__bar" style={{ width: `${pct}%` }} />
        </div>

        <div key={step.id} className="tour-card__inner">
          <div className="tour-card__meta">
            <span className="tour-card__count">Step {index + 1} of {steps.length}</span>
            <button type="button" className="tour-link" onClick={finish}>Skip tour</button>
          </div>

          <h3 className="tour-card__title" aria-live="polite">{step.title}</h3>
          <p className="tour-card__body">{step.body}</p>

          {step.press && (
            <div className="tour-press">
              <span className="tour-press__icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width={16} height={16}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.042 21.672L13.684 16.6m0 0l-2.51 2.225.569-9.47 5.227 7.917-3.286-.672zM12 2.25V4.5m5.834.166l-1.591 1.591M20.25 10.5H18M7.757 14.743l-1.59 1.59M6 10.5H3.75m4.007-4.243l-1.59-1.59" />
                </svg>
              </span>
              <span>
                Press <kbd className="tour-key">{step.pressLabel}</kbd> {step.press}
              </span>
            </div>
          )}
          {step.note && <p className="tour-card__note">{step.note}</p>}
        </div>

        <div className="tour-card__actions">
          <button type="button" className="tour-btn" onClick={back} disabled={index === 0}>Back</button>
          <button type="button" className="tour-btn tour-btn--primary" onClick={next} ref={nextRef}>
            {last ? "Finish" : index === 0 ? "Start tour" : "Next"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
