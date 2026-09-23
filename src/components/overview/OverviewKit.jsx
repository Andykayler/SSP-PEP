// Building blocks for a dashboard overview in the paper skin (styles/paper-skin.css,
// tp-* classes): the greeting hero, the exercise-book "today's list", stat
// cards, quick actions and titled panels. Used by the teacher and head
// teacher overviews so the two stay the same.
import { ArrowRight, CalendarDays, Check } from "lucide-react";
import { greeting, todayLabel } from "./overviewText";

export function Skeleton({ lines = 3, widths = ["100%", "80%", "65%"] }) {
  return (
    <div style={{ padding: "10px 0" }} aria-hidden="true">
      {Array.from({ length: lines }, (_, i) => (
        <div key={i} className="tp-skel" style={{ width: widths[i % widths.length] }} />
      ))}
    </div>
  );
}

/** Greeting on the left, `aside` (usually a TodoSheet) on the right. */
export function OverviewHero({ name, lead, chips = [], aside }) {
  return (
    <section className="tp-hero" aria-labelledby="tp-greeting">
      <div>
        <span className="tp-eyebrow"><CalendarDays size={14} aria-hidden="true" /> {todayLabel()}</span>
        <h1 id="tp-greeting" className="tp-hero__title">
          {greeting()}, <span className="tp-mark">{name}</span>.
        </h1>
        <p className="tp-hero__lead">{lead}</p>
        {chips.length > 0 && (
          <div className="tp-chips">
            {chips.filter(Boolean).map((c) => (
              <span key={c.label} className={`tp-chip${c.mono ? " tp-chip--mono" : ""}`} title={c.title}>
                {c.icon} {c.label}
              </span>
            ))}
          </div>
        )}
      </div>
      {aside}
    </section>
  );
}

/**
 * A checklist on a ruled sheet. Each todo is { key, text, done, urgent, tab };
 * clicking a line calls onOpen(tab).
 */
export function TodoSheet({ title = "Today's list", todos, loading, emptyText, onOpen }) {
  const left = todos.filter((t) => !t.done).length;
  return (
    <div className="tp-sheet" role="region" aria-label={title}>
      <div className="tp-sheet__head">
        <strong>{title}</strong>
        <span>{new Date().toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}</span>
      </div>
      {loading ? (
        <Skeleton widths={["80%", "65%", "72%"]} />
      ) : todos.length === 0 ? (
        <p className="tp-sheet__empty">{emptyText}</p>
      ) : (
        <>
          <ul className="tp-todo">
            {todos.map((t) => (
              <li key={t.key} className={t.done ? "is-done" : t.urgent ? "is-urgent" : ""}>
                <button type="button" onClick={() => onOpen(t.tab)}>
                  <span className="tp-todo__box" aria-hidden="true">
                    {t.done && <Check size={13} strokeWidth={3} />}
                  </span>
                  <span className="tp-todo__text">
                    <span className="tp-sr">{t.done ? "Done: " : "To do: "}</span>
                    {t.text}
                  </span>
                  <ArrowRight size={15} className="tp-todo__go" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
          <p className="tp-pen">{left === 0 ? "All caught up — well done!" : `${left} to go today`}</p>
        </>
      )}
    </div>
  );
}

export function SectionTitle({ id, children }) {
  return <div className="tp-section-title"><h2 id={id}>{children}</h2></div>;
}

/** stats: [{ label, value, sub, icon, tone, meter? }] — meter is 0–100 or null. */
export function StatGrid({ stats, loading }) {
  return (
    <div className="tp-stats">
      {stats.map((stat) => (
        <div key={stat.label} className={`tp-stat${stat.tone ? ` tp-stat--${stat.tone}` : ""}`}>
          <div className="tp-stat__top">
            <span className="tp-stat__label">{stat.label}</span>
            <span className="tp-stat__icon" aria-hidden="true">{stat.icon}</span>
          </div>
          {loading ? (
            <>
              <div className="tp-skel" style={{ height: 30, width: "45%", marginTop: 6 }} />
              <div className="tp-skel" style={{ width: "70%" }} />
            </>
          ) : (
            <>
              <div className="tp-stat__value">{stat.value}</div>
              <div className="tp-stat__sub" title={stat.sub}>{stat.sub}</div>
              {stat.meter != null && (
                <div className="tp-meter" role="progressbar" aria-valuenow={stat.meter} aria-valuemin={0} aria-valuemax={100} aria-label={stat.label}>
                  <span style={{ width: `${stat.meter}%` }} />
                </div>
              )}
            </>
          )}
        </div>
      ))}
    </div>
  );
}

/** actions: [{ label, hint, icon, tab, tone }] */
export function QuickActions({ actions, onOpen }) {
  return (
    <div className="tp-actions">
      {actions.map((action) => (
        <button
          key={action.tab + action.label}
          type="button"
          className={`tp-action${action.tone ? ` tp-action--${action.tone}` : ""}`}
          onClick={() => onOpen(action.tab)}
        >
          <span className="tp-action__icon" aria-hidden="true">{action.icon}</span>
          <span className="tp-action__text">
            <span className="tp-action__label">{action.label}</span>
            <span className="tp-action__hint">{action.hint}</span>
          </span>
          <ArrowRight size={18} className="tp-action__arrow" aria-hidden="true" />
        </button>
      ))}
    </div>
  );
}

export function Panel({ id, icon, title, linkLabel, onLink, children }) {
  return (
    <section className="tp-panel" aria-labelledby={id}>
      <div className="tp-panel__head">
        <div className="tp-panel__title">
          {icon}
          <h3 id={id}>{title}</h3>
        </div>
        {linkLabel && (
          <button type="button" className="tp-link" onClick={onLink}>
            {linkLabel} <ArrowRight size={14} aria-hidden="true" />
          </button>
        )}
      </div>
      <div className="tp-panel__body">{children}</div>
    </section>
  );
}

export function EmptyNote({ icon, title, children, actionLabel, onAction }) {
  return (
    <div className="tp-empty">
      <span className="tp-empty__icon" aria-hidden="true">{icon}</span>
      <strong>{title}</strong>
      <p>{children}</p>
      {actionLabel && (
        <button type="button" className="tp-link" onClick={onAction}>
          {actionLabel} <ArrowRight size={14} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

export function Banner({ tone = "warn", icon, children }) {
  return (
    <div className={`tp-banner tp-banner--${tone}`} role={tone === "error" ? "alert" : undefined}>
      {icon}
      <span>{children}</span>
    </div>
  );
}
