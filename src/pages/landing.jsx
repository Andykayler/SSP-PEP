import { useState, useEffect, useRef, useCallback } from "react";
import { Link } from "react-router-dom";
import "./landing.css";

/* ─── helpers ───────────────────────────────────────── */
const useInView = (threshold = 0.12) => {
  const ref = useRef(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) setInView(true); },
      { threshold }
    );
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, [threshold]);
  return [ref, inView];
};

const Counter = ({ end, suffix = "", duration = 1800, active }) => {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!active) return;
    let cur = 0;
    const step = end / (duration / 16);
    const t = setInterval(() => {
      cur += step;
      if (cur >= end) { setCount(end); clearInterval(t); }
      else setCount(Math.floor(cur));
    }, 16);
    return () => clearInterval(t);
  }, [active, end, duration]);
  return (
    <span>
      {end >= 1000000 ? `${(count / 1000000).toFixed(1)}M`
        : end >= 1000 ? `${(count / 1000).toFixed(0)}K`
        : count % 1 !== 0 ? count.toFixed(1)
        : count.toLocaleString()}
      {suffix}
    </span>
  );
};

/* ─── SLIDES CONFIG ─────────────────────────────────── */
const SLIDES = ["Home", "Features", "Stats", "Pricing", "Launch", "About"];
const TOTAL = SLIDES.length;

/* ─── TOP NAV ───────────────────────────────────────── */
const TopNav = ({ goTo, menuOpen, setMenuOpen }) => (
  <>
    <header className="top-nav">
      <div className="nav-logo">
        <div className="nav-logo-mark">A</div>
        Academix
      </div>
      <nav>
        <ul className="nav-links">
          {SLIDES.map((s, i) => (
            <li key={s}>
              <button onClick={() => goTo(i)}>{s}</button>
            </li>
          ))}
        </ul>
      </nav>
      <div className="nav-actions">
        <Link to="/signin">
          <button className="btn-nav-in">Sign In</button>
        </Link>
        <Link to="/register">
          <button className="btn-nav-cta">Get Started</button>
        </Link>
      </div>
      <button className="nav-toggle" onClick={() => setMenuOpen(o => !o)} aria-label="Toggle menu">
        <i className={`ti ${menuOpen ? "ti-x" : "ti-menu-2"}`} style={{ fontSize: 22 }} aria-hidden="true" />
      </button>
    </header>

    {/* Mobile menu */}
    <div id="mobile-menu" className={menuOpen ? "open" : ""}>
      {SLIDES.map((s, i) => (
        <button key={s} className="mobile-nav-link" onClick={() => { goTo(i); setMenuOpen(false); }}>
          {s}
        </button>
      ))}
      <Link to="/signin" onClick={() => setMenuOpen(false)} style={{ display: "block" }}>
        <button className="btn-nav-in mobile-btn">Sign In</button>
      </Link>
      <Link to="/register" onClick={() => setMenuOpen(false)} style={{ display: "block", marginTop: 6 }}>
        <button className="btn-nav-cta mobile-btn">Get Started</button>
      </Link>
    </div>
  </>
);

/* ─── SLIDE 1 — HERO ────────────────────────────────── */
const SlideHero = ({ goTo }) => (
  <div className="slide-inner">
    <div className="hero-content">
      <div>
        <div className="hero-badge">
          <div className="hero-badge-dot" />
          Now serving 1,200+ schools
        </div>
        <h1 className="hero-headline">
          The <em>complete</em><br />
          <span className="outline-text">platform</span> for<br />
          modern schools
        </h1>
        <p className="hero-sub">
          Academix connects schools, teachers, and parents — track grades,
          attendance, and communicate effortlessly from any device.
        </p>
        <div className="hero-ctas">
          <button className="btn-primary">
            <i className="ti ti-brand-google-play" aria-hidden="true" /> Google Play
          </button>
          <button className="btn-outline">
            <i className="ti ti-brand-apple" aria-hidden="true" /> App Store
          </button>
          <button className="btn-outline">
            <i className="ti ti-device-desktop" aria-hidden="true" /> Web Access
          </button>
        </div>
        <div className="hero-ctas" style={{ marginBottom: 0 }}>
          <Link to="/signin">
            <button className="btn-primary" style={{ background: "transparent", border: "1px solid rgba(79,110,247,0.4)", color: "var(--accent-lt)" }}>
              <i className="ti ti-login" aria-hidden="true" /> Sign In
            </button>
          </Link>
          <Link to="/register">
            <button className="btn-primary">
              <i className="ti ti-school" aria-hidden="true" /> Register Your School
            </button>
          </Link>
        </div>
        <div className="hero-trust" style={{ marginTop: 20 }}>
          <div className="hero-trust-avatars">
            <div className="hero-trust-avatar">AO</div>
            <div className="hero-trust-avatar teal">TM</div>
            <div className="hero-trust-avatar slate">FA</div>
            <div className="hero-trust-avatar">+</div>
          </div>
          <div className="hero-trust-text">
            <strong>Trusted by 1,200+ school admins</strong>
            Free forever for small schools · No credit card
          </div>
        </div>
      </div>

      {/* Desktop mockup */}
      <div className="hero-visual float">
        <div className="mock-desktop">
          <div className="mock-bar">
            <div className="mock-dot" style={{ background: "#ef4444", opacity: 0.7 }} />
            <div className="mock-dot" style={{ background: "#f59e0b", opacity: 0.7 }} />
            <div className="mock-dot" style={{ background: "#22c55e", opacity: 0.7 }} />
          </div>
          <div className="mock-content">
            <div className="mock-row">
              <div className="mock-sidebar">
                <div className="mock-sidebar-item active" />
                <div className="mock-sidebar-item" />
                <div className="mock-sidebar-item" />
                <div className="mock-sidebar-item" />
              </div>
              <div className="mock-main">
                <div className="mock-stat-row">
                  <div className="mock-stat"><div className="mock-stat-num">2,841</div><div className="mock-stat-lbl">Students</div></div>
                  <div className="mock-stat"><div className="mock-stat-num">94.3%</div><div className="mock-stat-lbl">Attend.</div></div>
                  <div className="mock-stat"><div className="mock-stat-num">318</div><div className="mock-stat-lbl">Assign.</div></div>
                </div>
                <div className="mock-table">
                  <div className="mock-th"><span>Student</span><span>Grade</span><span>Status</span></div>
                  <div className="mock-tr"><span>Amara O.</span><span>98.4</span><span className="hi">Excellent</span></div>
                  <div className="mock-tr"><span>Tendai M.</span><span>96.1</span><span className="hi">Excellent</span></div>
                  <div className="mock-tr"><span>Fatima A.</span><span>91.2</span><span style={{ color: "rgba(255,255,255,0.38)" }}>Good</span></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
);

/* ─── SLIDE 2 — FEATURES ────────────────────────────── */
const SlideFeatures = () => (
  <div className="slide-inner">
    <div className="slide-features-inner">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: "1rem", marginBottom: 20 }}>
        <div>
          <div className="section-tag">Why Academix</div>
          <h2 className="section-title">Built for every <em>role in school</em></h2>
        </div>
        <p style={{ fontSize: "12px", color: "var(--dark-soft)", opacity: 0.7, maxWidth: 240, textAlign: "right", lineHeight: 1.7 }}>
          One platform. Admins, teachers, parents — all in sync.
        </p>
      </div>

      <div className="bento-grid">
        <div className="bento-cell span-7">
          <div style={{ display: "flex", gap: 20, alignItems: "flex-start" }}>
            <div style={{ flex: 1 }}>
              <div className="bento-icon bi-teal"><i className="ti ti-chart-bar" aria-hidden="true" /></div>
              <h3>Analytics & Reports</h3>
              <p>Visual charts help administrators identify performance trends and make data-driven decisions. Export PDF reports in one click.</p>
            </div>
            <div style={{ flexShrink: 0, width: 140, background: "rgba(15,22,41,0.04)", border: "1px solid rgba(15,22,41,0.07)", borderRadius: "var(--radius-md)", padding: 10 }}>
              <div style={{ height: 5, background: "rgba(79,110,247,0.25)", borderRadius: 3, marginBottom: 4 }} />
              <div style={{ height: 5, background: "rgba(15,22,41,0.08)", borderRadius: 3, marginBottom: 4, width: "60%" }} />
              <div style={{ height: 5, background: "rgba(14,165,176,0.25)", borderRadius: 3, width: "70%", marginBottom: 8 }} />
              <div className="mini-chart">
                {[40, 65, 50, 80, 60, 90, 75].map((h, i) => (
                  <div key={i} className={`mini-bar${i === 5 ? " hi" : i === 2 ? " teal" : ""}`} style={{ height: `${h}%` }} />
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="bento-cell span-5 teal-cell">
          <div className="bento-icon bi-accent"><i className="ti ti-school" aria-hidden="true" /></div>
          <h3>Academic Tracking</h3>
          <p>Monitor grades and attendance in real-time with intuitive dashboards for every teacher.</p>
        </div>

        <div className="bento-cell span-4">
          <div className="bento-number">99.9<span style={{ fontSize: "1.4rem" }}>%</span></div>
          <div className="bento-num-label">Platform Uptime</div>
          <p style={{ marginTop: 8 }}>Enterprise-grade infrastructure keeps your school data always accessible.</p>
        </div>

        <div className="bento-cell span-4">
          <div className="bento-number teal">3.2<span style={{ fontSize: "1.4rem" }}>M</span></div>
          <div className="bento-num-label">Parents Engaged</div>
          <p style={{ marginTop: 8 }}>Parents stay informed with push alerts the moment a grade or absence is recorded.</p>
        </div>

        <div className="bento-cell span-4">
          <div className="bento-icon bi-dark"><i className="ti ti-message-circle" aria-hidden="true" /></div>
          <h3>Parent–Teacher Chat</h3>
          <p>Secure, threaded messaging bridges the gap between school and home instantly.</p>
        </div>
      </div>
    </div>
  </div>
);

/* ─── SLIDE 3 — STATS ───────────────────────────────── */
const SlideStats = ({ active }) => {
  const stats = [
    { end: 1200,    suffix: "+", label: "Schools Onboarded", pct: 38,  teal: false },
    { end: 850000,  suffix: "+", label: "Students Tracked",  pct: 72,  teal: true  },
    { end: 99.9,    suffix: "%", label: "Platform Uptime",   pct: 99,  teal: false },
    { end: 3200000, suffix: "+", label: "Parents Engaged",   pct: 85,  teal: true  },
  ];
  return (
    <div className="slide-inner">
      <div className="stats-layout">
        <div>
          <div className="stats-tag">By the numbers</div>
          <h2 className="section-title light">
            Trusted by schools<br /><em>across the nation</em>
          </h2>
          <p className="section-body light" style={{ marginTop: 10, maxWidth: 320 }}>
            Real schools, real results. These numbers represent educators and families who depend on Academix every day.
          </p>
        </div>

        <div className="stats-grid">
          {stats.map((s, i) => (
            <div key={s.label} className={`stat-card${s.teal ? " teal-bar" : ""}`}
              style={{
                opacity: active ? 1 : 0,
                transform: active ? "translateY(0)" : "translateY(20px)",
                transition: `opacity 0.6s ease ${i * 0.1}s, transform 0.6s ease ${i * 0.1}s`,
              }}>
              <div className={`stat-number${s.teal ? " teal" : ""}`}>
                <Counter end={s.end} suffix={s.suffix} active={active} />
              </div>
              <div className="stat-label">{s.label}</div>
              <div className="stat-bar">
                <div className={`stat-bar-fill${s.teal ? " teal" : ""}`}
                  style={{ width: active ? `${s.pct}%` : "0%" }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

/* ─── SLIDE 4 — PRICING ─────────────────────────────── */
const PLANS = [
  {
    name: "Starter",
    tag: "Free forever",
    price: "MK 0",
    period: "/ month",
    desc: "Perfect for small schools just getting started.",
    accent: false,
    features: [
      { label: "Up to 200 students",        yes: true  },
      { label: "1 admin account",           yes: true  },
      { label: "Grade & attendance tracking",yes: true  },
      { label: "Parent notifications",      yes: true  },
      { label: "PDF report export",         yes: false },
      { label: "Parent–teacher chat",       yes: false },
      { label: "Multi-campus support",      yes: false },
      { label: "Priority support",          yes: false },
    ],
    cta: "Get Started Free",
    ctaLink: "/register",
  },
  {
    name: "Growth",
    tag: "Most popular",
    price: "MK 12,500",
    period: "/ month",
    desc: "For growing schools that need the full toolkit.",
    accent: true,
    features: [
      { label: "Up to 1,500 students",      yes: true  },
      { label: "5 staff accounts",          yes: true  },
      { label: "Grade & attendance tracking",yes: true  },
      { label: "Parent notifications",      yes: true  },
      { label: "PDF report export",         yes: true  },
      { label: "Parent–teacher chat",       yes: true  },
      { label: "Multi-campus support",      yes: false },
      { label: "Priority support",          yes: false },
    ],
    cta: "Start 30-Day Trial",
    ctaLink: "/register",
  },
  {
    name: "Enterprise",
    tag: "Unlimited scale",
    price: "Custom",
    period: "",
    desc: "For large districts and multi-school networks.",
    accent: false,
    features: [
      { label: "Unlimited students",        yes: true  },
      { label: "Unlimited staff accounts",  yes: true  },
      { label: "Grade & attendance tracking",yes: true  },
      { label: "Parent notifications",      yes: true  },
      { label: "PDF report export",         yes: true  },
      { label: "Parent–teacher chat",       yes: true  },
      { label: "Multi-campus support",      yes: true  },
      { label: "Priority support",          yes: true  },
    ],
    cta: "Contact Sales",
    ctaLink: "/signin",
  },
];

const SlidePricing = ({ active }) => (
  <div className="slide-inner" style={{ background: "var(--bg)" }}>
    <div style={{ width: "100%", position: "relative", zIndex: 2 }}>
      <div style={{ marginBottom: 24, textAlign: "center" }}>
        <div className="section-tag" style={{ justifyContent: "center" }}>Pricing</div>
        <h2 className="section-title" style={{ textAlign: "center" }}>
          Simple, <em>transparent pricing</em>
        </h2>
        <p style={{ fontSize: 12, color: "var(--dark-soft)", opacity: 0.65, maxWidth: 380, margin: "0 auto" }}>
          No hidden fees. Cancel anytime. All plans include a 30-day free trial.
        </p>
      </div>

      <div className="pricing-grid">
        {PLANS.map((plan, i) => (
          <div
            key={plan.name}
            className={`pricing-card${plan.accent ? " pricing-card--accent" : ""}`}
            style={{
              opacity: active ? 1 : 0,
              transform: active ? "translateY(0)" : "translateY(24px)",
              transition: `opacity 0.55s ease ${i * 0.1}s, transform 0.55s ease ${i * 0.1}s`,
            }}
          >
            {plan.accent && (
              <div className="pricing-popular-badge">
                <i className="ti ti-star-filled" style={{ fontSize: 10 }} aria-hidden="true" /> {plan.tag}
              </div>
            )}
            {!plan.accent && (
              <div className="pricing-tag">{plan.tag}</div>
            )}

            <div className="pricing-name">{plan.name}</div>
            <div className="pricing-price">
              {plan.price}
              {plan.period && <span className="pricing-period">{plan.period}</span>}
            </div>
            <p className="pricing-desc">{plan.desc}</p>

            <ul className="pricing-features">
              {plan.features.map(f => (
                <li key={f.label} className={`pricing-feature${f.yes ? "" : " pricing-feature--no"}`}>
                  <span className="pricing-feature-icon">
                    {f.yes
                      ? <i className="ti ti-check" aria-hidden="true" />
                      : <i className="ti ti-minus" aria-hidden="true" />}
                  </span>
                  {f.label}
                </li>
              ))}
            </ul>

            <Link to={plan.ctaLink} style={{ display: "block", marginTop: "auto", paddingTop: 16 }}>
              <button className={`pricing-cta${plan.accent ? " pricing-cta--accent" : ""}`}>
                {plan.cta} <i className="ti ti-arrow-right" aria-hidden="true" />
              </button>
            </Link>
          </div>
        ))}
      </div>
    </div>
  </div>
);

/* ─── SLIDE 5 — CTA ─────────────────────────────────── */
const SlideCTA = () => (
  <div className="slide-inner">
    <div className="cta-glow" />
    <div className="cta-layout">
      <div>
        <div className="cta-tag">Get started today</div>
        <h2 className="cta-title">Start your school's<br /><em>digital journey</em></h2>
        <p className="cta-body">
          Join over 1,200 schools already using Academix. Free forever for small schools — no credit card required, up and running in minutes.
        </p>
        <div className="cta-buttons">
          <button className="btn-primary"><i className="ti ti-brand-google-play" aria-hidden="true" /> Google Play</button>
          <button className="btn-outline"><i className="ti ti-brand-apple" aria-hidden="true" /> App Store</button>
        </div>
        <div className="cta-buttons" style={{ marginBottom: 14 }}>
          <Link to="/signin">
            <button className="btn-outline" style={{ borderColor: "rgba(34,211,222,0.3)", color: "var(--teal-lt)" }}>
              <i className="ti ti-login" aria-hidden="true" /> Staff Sign In
            </button>
          </Link>
          <Link to="/register">
            <button className="btn-primary" style={{ background: "var(--teal)", boxShadow: "0 2px 16px rgba(14,165,176,0.25)" }}>
              <i className="ti ti-school" aria-hidden="true" /> Register School
            </button>
          </Link>
        </div>
        <p className="cta-fine">iOS 14+ · Android 8+ · All modern browsers</p>
      </div>

      <div className="cta-cards">
        {[
          { icon: "ti-brand-google-play", cls: "cta-card-icon", title: "Android App", sub: "Available on Google Play — free download", to: null },
          { icon: "ti-brand-apple",       cls: "cta-card-icon teal", title: "iOS App", sub: "Available on the App Store for iPhone & iPad", to: null },
          { icon: "ti-login",             cls: "cta-card-icon dark", title: "Staff Portal", sub: "Sign in to your school dashboard", to: "/signin" },
          { icon: "ti-school",            cls: "cta-card-icon", title: "Register School", sub: "Create your institution account now", to: "/register" },
        ].map(c => (
          c.to ? (
            <Link key={c.title} to={c.to} style={{ textDecoration: "none" }}>
              <div className="cta-card">
                <div className={c.cls}><i className={`ti ${c.icon}`} aria-hidden="true" /></div>
                <div className="cta-card-text">
                  <div className="cta-card-title">{c.title}</div>
                  <div className="cta-card-sub">{c.sub}</div>
                </div>
                <i className="ti ti-arrow-right cta-card-arrow" aria-hidden="true" />
              </div>
            </Link>
          ) : (
            <div key={c.title} className="cta-card">
              <div className={c.cls}><i className={`ti ${c.icon}`} aria-hidden="true" /></div>
              <div className="cta-card-text">
                <div className="cta-card-title">{c.title}</div>
                <div className="cta-card-sub">{c.sub}</div>
              </div>
              <i className="ti ti-arrow-right cta-card-arrow" aria-hidden="true" />
            </div>
          )
        ))}
      </div>
    </div>
  </div>
);

/* ─── SLIDE 6 — FOOTER ──────────────────────────────── */
const footerCols = [
  { title: "Product", links: [{ label: "Features" }, { label: "Pricing" }, { label: "Screenshots" }, { label: "Changelog" }] },
  { title: "Company", links: [{ label: "About Us" }, { label: "Blog" }, { label: "Careers" }, { label: "Press Kit" }] },
  { title: "Support",  links: [{ label: "Contact" }, { label: "Documentation" }, { label: "Terms" }, { label: "Privacy" }] },
];

const SlideFooter = () => (
  <div className="slide-inner">
    <div className="footer-layout">
      <div className="footer-grid">
        <div>
          <div className="footer-brand-name">
            <span className="footer-brand-mark">A</span>Academix
          </div>
          <p className="footer-tagline">The all-in-one school management platform built for modern secondary education.</p>
          <div className="footer-socials">
            {["ti-brand-twitter", "ti-brand-linkedin", "ti-brand-facebook", "ti-brand-instagram"].map(icon => (
              <div key={icon} className="footer-social-btn">
                <i className={`ti ${icon}`} aria-hidden="true" />
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
            <Link to="/signin">
              <button className="btn-nav-in" style={{ fontSize: 12, padding: "7px 14px" }}>
                <i className="ti ti-login" style={{ marginRight: 5, fontSize: 13 }} aria-hidden="true" />Sign In
              </button>
            </Link>
            <Link to="/register">
              <button className="btn-nav-cta" style={{ fontSize: 12, padding: "7px 14px" }}>
                <i className="ti ti-school" style={{ marginRight: 5, fontSize: 13 }} aria-hidden="true" />Register
              </button>
            </Link>
          </div>
        </div>
        {footerCols.map(col => (
          <div key={col.title}>
            <div className="footer-col-title">{col.title}</div>
            {col.links.map(link => <a key={link.label} href="#" className="footer-link">{link.label}</a>)}
          </div>
        ))}
      </div>
      <hr className="footer-divider" />
      <div className="footer-bottom">
        <span className="footer-copy">© {new Date().getFullYear()} Academix. All rights reserved.</span>
        <div className="footer-legal">
          {["Terms", "Privacy", "Cookies"].map(l => <a key={l} href="#" className="footer-legal-link">{l}</a>)}
        </div>
      </div>
    </div>
  </div>
);

/* ─── MAIN APP ──────────────────────────────────────── */
export default function AcademixLanding() {
  const [current, setCurrent] = useState(0);
  const [exiting, setExiting] = useState(-1);
  const [menuOpen, setMenuOpen] = useState(false);
  const transitioning = useRef(false);

  const goTo = useCallback((idx) => {
    if (idx === current || transitioning.current) return;
    if (idx < 0 || idx >= TOTAL) return;
    transitioning.current = true;
    setExiting(current);
    setCurrent(idx);
    setTimeout(() => {
      setExiting(-1);
      transitioning.current = false;
    }, 550);
  }, [current]);

  // keyboard navigation
  useEffect(() => {
    const handler = (e) => {
      if (e.key === "ArrowDown" || e.key === "ArrowRight") goTo(current + 1);
      if (e.key === "ArrowUp"   || e.key === "ArrowLeft")  goTo(current - 1);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [current, goTo]);

  // touch swipe
  useEffect(() => {
    let startY = 0;
    const onStart = (e) => { startY = e.touches[0].clientY; };
    const onEnd   = (e) => {
      const dy = startY - e.changedTouches[0].clientY;
      if (Math.abs(dy) > 50) goTo(dy > 0 ? current + 1 : current - 1);
    };
    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchend",   onEnd,   { passive: true });
    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchend",   onEnd);
    };
  }, [current, goTo]);

  // mouse wheel
  useEffect(() => {
    let lastWheel = 0;
    const onWheel = (e) => {
      e.preventDefault();
      const now = Date.now();
      if (now - lastWheel < 700) return;
      lastWheel = now;
      goTo(e.deltaY > 0 ? current + 1 : current - 1);
    };
    window.addEventListener("wheel", onWheel, { passive: false });
    return () => window.removeEventListener("wheel", onWheel);
  }, [current, goTo]);

  const slideBgs = [
    "var(--dark)",
    "var(--bg)",
    "var(--dark-mid)",
    "var(--bg)",
    "var(--dark)",
    "#080d1a",
  ];

  const slideComponents = [
    <SlideHero    key="hero"     goTo={goTo} />,
    <SlideFeatures key="features" />,
    <SlideStats   key="stats"    active={current === 2} />,
    <SlidePricing key="pricing"  active={current === 3} />,
    <SlideCTA     key="cta"      />,
    <SlideFooter  key="footer"   />,
  ];

  return (
    <>
      <TopNav goTo={goTo} menuOpen={menuOpen} setMenuOpen={setMenuOpen} />

      {/* slide container */}
      <div id="slide-container">
        {slideComponents.map((comp, i) => (
          <div
            key={i}
            className={`slide${current === i ? " active" : ""}${exiting === i ? " exit-up" : ""}`}
            style={{ background: slideBgs[i] }}
          >
            {comp}
          </div>
        ))}
      </div>

      {/* nav dots */}
      <div id="nav-dots">
        {SLIDES.map((label, i) => (
          <div
            key={i}
            className={`nav-dot${current === i ? " active" : ""}`}
            data-label={label}
            onClick={() => goTo(i)}
            role="button"
            aria-label={`Go to ${label}`}
          />
        ))}
      </div>

      {/* arrow controls */}
      <div id="slide-arrows">
        <button
          className="slide-arrow"
          onClick={() => goTo(current - 1)}
          disabled={current === 0}
          aria-label="Previous slide"
        >
          <i className="ti ti-chevron-up" aria-hidden="true" />
        </button>
        <span className="slide-counter">{current + 1} / {TOTAL}</span>
        <button
          className="slide-arrow"
          onClick={() => goTo(current + 1)}
          disabled={current === TOTAL - 1}
          aria-label="Next slide"
        >
          <i className="ti ti-chevron-down" aria-hidden="true" />
        </button>
      </div>
    </>
  );
}