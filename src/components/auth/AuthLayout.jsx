// The frame around the pages a visitor reaches from the landing page
// (sign-in, registration): same paper-and-ink look, brand, theme toggle and
// way back home, so moving from one to the next does not feel like leaving.
//
// With `title`/`sheet` it shows a side panel on wide screens; without them the
// form sits alone in the middle (used by the set-password screen). `stickySide`
// pins the panel to the top for tall forms, so it stays in view while they scroll.
import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Sun, Moon, GraduationCap, ArrowLeft } from "lucide-react";
import { getInitialTheme, applyTheme, toggleTheme as flipTheme } from "../../utils/theme";
import { BRAND } from "../brand";
import "./auth.css";

export default function AuthLayout({
  eyebrow, title, lead, sheet, stickySide = false,
  switchText, switchLabel, switchTo,
  children,
}) {
  const [theme, setTheme] = useState(getInitialTheme);
  useEffect(() => { applyTheme(theme); }, [theme]);

  const hasSide = Boolean(title || sheet);

  return (
    <div className="lp-auth">
      <div className="la-bg" aria-hidden="true" />

      <header className="la-top">
        <div className="la-top__inner">
          <Link to="/" className="lp-brand" aria-label={`${BRAND} home`}>
            <span className="lp-brand__mark"><GraduationCap size={18} aria-hidden="true" /></span>
            {BRAND}
          </Link>
          <div className="la-top__right">
            <Link to="/" className="la-back"><ArrowLeft size={15} aria-hidden="true" /> Back to home</Link>
            <button
              type="button"
              className="lp-icon-btn"
              onClick={() => setTheme((t) => flipTheme(t))}
              aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
            >
              {theme === "dark" ? <Sun size={18} aria-hidden="true" /> : <Moon size={18} aria-hidden="true" />}
            </button>
          </div>
        </div>
      </header>

      <div className={`la-stage${hasSide ? "" : " la-stage--solo"}`}>
        {hasSide && (
          <aside className={`la-side${stickySide ? " la-side--sticky" : ""}`}>
            {eyebrow && <p className="lp-eyebrow">{eyebrow}</p>}
            {title && <h2 className="la-side__title">{title}</h2>}
            {lead && <p className="la-side__lead">{lead}</p>}
            {sheet}
          </aside>
        )}
        <main className="la-main">{children}</main>
      </div>

      <footer className="la-foot">
        <span>© {new Date().getFullYear()} {BRAND}</span>
        {switchTo && (
          <span>{switchText} <Link to={switchTo}>{switchLabel}</Link></span>
        )}
      </footer>
    </div>
  );
}
