import { useState, useEffect, useRef } from "react";
import "./landing.css";
import { Link } from 'react-router-dom';
/* ─── useInView hook (scroll-triggered animations) ─────────── */
const useInView = (threshold = 0.12) => {
  const ref = useRef(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setInView(true); },
      { threshold }
    );
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, [threshold]);
  return [ref, inView];
};

/* ─── Animated counter ──────────────────────────────────────── */
const Counter = ({ end, suffix = "", duration = 1800 }) => {
  const [count, setCount] = useState(0);
  const [ref, inView] = useInView(0.3);
  useEffect(() => {
    if (!inView) return;
    let current = 0;
    const step = end / (duration / 16);
    const timer = setInterval(() => {
      current += step;
      if (current >= end) { setCount(end); clearInterval(timer); }
      else setCount(Math.floor(current));
    }, 16);
    return () => clearInterval(timer);
  }, [inView, end, duration]);
  return (
    <span ref={ref}>
      {end >= 1000000
        ? `${(count / 1000000).toFixed(1)}M`
        : end >= 1000
        ? `${(count / 1000).toFixed(0)}K`
        : count % 1 !== 0
        ? count.toFixed(1)
        : count.toLocaleString()}
      {suffix}
    </span>
  );
};

/* ─── Reveal wrapper (fade-up on scroll) ────────────────────── */
const Reveal = ({ children, delay = 0, className = "" }) => {
  const [ref, inView] = useInView();
  return (
    <div
      ref={ref}
      className={`reveal ${inView ? "is-visible" : ""} ${className}`}
      style={{ transitionDelay: `${delay}s` }}
    >
      {children}
    </div>
  );
};

/* ─── Feature data ──────────────────────────────────────────── */
const features = [
  {
    icon: "ti-school",
    variant: "fi-teal",
    title: "Academic Tracking",
    desc: "Monitor student performance, grades, and attendance in real-time with intuitive dashboards.",
  },
  {
    icon: "ti-bell",
    variant: "fi-accent",
    title: "Instant Notifications",
    desc: "Parents receive real-time alerts for attendance, results, and announcements directly on their phones.",
  },
  {
    icon: "ti-chart-bar",
    variant: "fi-teal",
    title: "Analytics & Reports",
    desc: "Visual charts help administrators identify trends and make data-driven decisions effortlessly.",
  },
  {
    icon: "ti-message-circle",
    variant: "fi-accent",
    title: "Parent–Teacher Chat",
    desc: "Secure messaging bridges the gap between school and home for meaningful conversations.",
  },
  {
    icon: "ti-shield-check",
    variant: "fi-teal",
    title: "Secure & Reliable",
    desc: "Enterprise-grade encryption and 99.9% uptime keeps your school's data safe and accessible.",
  },
  {
    icon: "ti-calendar",
    variant: "fi-accent",
    title: "Timetable Management",
    desc: "Build and share class schedules, exam timetables, and event calendars with everyone instantly.",
  },
];

/* ─── Stats data ────────────────────────────────────────────── */
const stats = [
  { end: 1200,    suffix: "+", label: "Schools Onboarded", pct: 38,  teal: false },
  { end: 850000,  suffix: "+", label: "Students Tracked",  pct: 72,  teal: true  },
  { end: 99.9,    suffix: "%", label: "Platform Uptime",   pct: 99,  teal: false },
  { end: 3200000, suffix: "+", label: "Parents Engaged",   pct: 85,  teal: true  },
];

/* ─── Footer columns ────────────────────────────────────────── */
const footerCols = [
  { title: "Product", links: ["Features", "Pricing", "Screenshots", "Changelog"] },
  { title: "Company", links: ["About Us", "Blog", "Careers", "Press Kit"] },
  { title: "Support", links: ["Contact", "Documentation", "Terms", "Privacy"] },
];
/* ─── NAV ───────────────────────────────────────────────────── */

const Nav = () => {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", fn);
    return () => window.removeEventListener("scroll", fn);
  }, []);

  return (
    <header className={`nav${scrolled ? " scrolled" : ""}`}>
      <div className="nav-inner">
        <div className="nav-logo">
          <div className="nav-logo-mark">A</div>
          Academix
        </div>

        <nav>
          <ul className="nav-links">
            {["Features", "Stats", "Pricing", "Contact"].map((item) => (
              <li key={item}>
                <a href={`#${item.toLowerCase()}`}>{item}</a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="nav-actions">
          <Link to="/signin">
            <button className="btn-nav-in">Sign In</button>
          </Link>
          <Link to="/register-school">
            <button className="btn-nav-cta">Get Started</button>
          </Link>
        </div>

        <button
          className="nav-toggle"
          onClick={() => setMenuOpen(!menuOpen)}
          aria-label="Toggle menu"
        >
          <i className={`ti ${menuOpen ? "ti-x" : "ti-menu-2"}`} style={{ fontSize: 22 }} />
        </button>
      </div>

      {menuOpen && (
        <div style={{
          background: "#0f1629",
          borderTop: "1px solid rgba(79,110,247,0.12)",
          padding: "16px 28px",
          display: "flex",
          flexDirection: "column",
          gap: "4px",
        }}>
          {["Features", "Stats", "Pricing", "Contact"].map((item) => (
            <a
              key={item}
              href={`#${item.toLowerCase()}`}
              onClick={() => setMenuOpen(false)}
              style={{
                fontSize: "15px",
                fontWeight: 500,
                color: "rgba(255,255,255,0.65)",
                padding: "10px 0",
                borderBottom: "1px solid rgba(255,255,255,0.05)",
              }}
            >
              {item}
            </a>
          ))}
          
          <Link to="/signin" onClick={() => setMenuOpen(false)} style={{ marginTop: 12 }}>
            <button className="btn-nav-in" style={{ width: "100%", padding: "11px" }}>
              Sign In
            </button>
          </Link>

          <Link to="/register-school" onClick={() => setMenuOpen(false)} style={{ marginTop: 8 }}>
            <button className="btn-nav-cta" style={{ width: "100%", padding: "11px" }}>
              Get Started
            </button>
          </Link>
        </div>
      )}
    </header>
  );
};
/* ─── HERO ──────────────────────────────────────────────────── */
const Hero = () => {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 80);
    return () => clearTimeout(t);
  }, []);

  return (
    <section className="hero">
      <div className="hero-glow" />
      <div className="hero-glow-2" />

      <div className="hero-inner">
        {/* Copy */}
        <div
          style={{
            opacity: visible ? 1 : 0,
            transform: visible ? "translateX(0)" : "translateX(-28px)",
            transition: "opacity 0.8s ease, transform 0.8s ease",
          }}
        >
          <div className="hero-badge">
            <div className="hero-badge-dot" />
            Now serving 1,200+ schools
          </div>

          <h1 className="hero-headline">
            The <em>complete</em>
            <br />platform for
            <br />modern schools
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

          <p className="hero-note">Free for schools · No credit card · Setup in minutes</p>
        </div>

        {/* Mockup */}
        <div
          className="hero-visual float"
          style={{
            opacity: visible ? 1 : 0,
            transform: visible ? "translateY(0)" : "translateY(28px)",
            transition: "opacity 0.9s ease 0.2s, transform 0.9s ease 0.2s",
          }}
        >
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
                    <div className="mock-stat">
                      <div className="mock-stat-num">2,841</div>
                      <div className="mock-stat-lbl">Students</div>
                    </div>
                    <div className="mock-stat">
                      <div className="mock-stat-num">94.3%</div>
                      <div className="mock-stat-lbl">Attendance</div>
                    </div>
                    <div className="mock-stat">
                      <div className="mock-stat-num">318</div>
                      <div className="mock-stat-lbl">Assignments</div>
                    </div>
                  </div>
                  <div className="mock-table">
                    <div className="mock-th">
                      <span>Student</span>
                      <span>Grade</span>
                      <span>Status</span>
                    </div>
                    <div className="mock-tr">
                      <span>Amara O.</span>
                      <span>98.4</span>
                      <span className="hi">Excellent</span>
                    </div>
                    <div className="mock-tr">
                      <span>Tendai M.</span>
                      <span>96.1</span>
                      <span className="hi">Excellent</span>
                    </div>
                    <div className="mock-tr">
                      <span>Fatima A.</span>
                      <span>91.2</span>
                      <span style={{ color: "rgba(255,255,255,0.38)" }}>Good</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="mock-phone float-delay">
            <div className="phone-notch" />
            <div className="phone-card">
              <div className="phone-card-num">94.3%</div>
              <div className="phone-card-lbl">Attendance</div>
            </div>
            <div className="phone-row" />
            <div className="phone-row" style={{ width: "80%" }} />
            <div className="phone-row" style={{ width: "60%", background: "rgba(14,165,176,0.3)" }} />
            <div style={{ height: 6 }} />
            <div className="phone-row" />
            <div className="phone-row" style={{ width: "70%" }} />
          </div>
        </div>
      </div>
    </section>
  );
};

/* ─── FEATURES ──────────────────────────────────────────────── */
const Features = () => (
  <section id="features" className="features-section">
    <div className="container">
      <Reveal>
        <div className="section-center">
          <div className="section-eyebrow">Why Academix</div>
          <h2 className="section-title">
            Everything your school <em>needs</em>
          </h2>
          <p className="section-body">
            Simple, powerful, and accessible for administrators, teachers, and parents alike.
          </p>
        </div>
      </Reveal>

      <div className="features-grid">
        {features.map((f, i) => (
          <Reveal key={f.title} delay={i * 0.07}>
            <div className="feature-card">
              <div className={`feature-icon ${f.variant}`}>
                <i className={`ti ${f.icon}`} aria-hidden="true" />
              </div>
              <h3>{f.title}</h3>
              <p>{f.desc}</p>
            </div>
          </Reveal>
        ))}
      </div>
    </div>
  </section>
);

/* ─── STATS ─────────────────────────────────────────────────── */
const Stats = () => {
  const [ref, inView] = useInView(0.2);

  return (
    <section id="stats" className="stats-section">
      <div className="container">
        <Reveal>
          <div className="section-center">
            <div className="section-eyebrow">By the numbers</div>
            <h2 className="section-title">
              Trusted by schools <em>nationwide</em>
            </h2>
            <p className="section-body">
              Numbers that reflect our commitment to education and excellence.
            </p>
          </div>
        </Reveal>

        <div ref={ref} className="stats-grid">
          {stats.map((s, i) => (
            <div
              key={s.label}
              className="stat-card"
              style={{
                opacity: inView ? 1 : 0,
                transform: inView ? "translateY(0)" : "translateY(24px)",
                transition: `opacity 0.6s ease ${i * 0.1}s, transform 0.6s ease ${i * 0.1}s`,
              }}
            >
              <div className="stat-number">
                <Counter end={s.end} suffix={s.suffix} />
              </div>
              <div className="stat-label">{s.label}</div>
              <div className="stat-bar">
                <div
                  className={`stat-bar-fill${s.teal ? " teal" : ""}`}
                  style={{ width: inView ? `${s.pct}%` : "0%" }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

/* ─── CTA ───────────────────────────────────────────────────── */
const CTA = () => (
  <section className="cta-section">
    <div className="cta-glow" />
    <Reveal>
      <div className="cta-inner">
        <div className="cta-icon">
          <i className="ti ti-download" aria-hidden="true" />
        </div>
        <div className="section-eyebrow">Get started today</div>
        <h2 className="cta-title">
          Start your school's <em>digital transformation</em>
        </h2>
        <p className="cta-body">
          Join over 1,200 schools already using Academix. Free forever for small schools.
        </p>
        <div className="cta-buttons">
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
        <p className="cta-fine">Available on iOS 14+, Android 8+, and all modern browsers.</p>
      </div>
    </Reveal>
  </section>
);

/* ─── FOOTER ────────────────────────────────────────────────── */
const Footer = () => (
  <footer className="footer">
    <div className="container">
      <div className="footer-grid">
        <div>
          <div className="footer-brand-name">
            <span className="footer-brand-mark">A</span>
            Academix
          </div>
          <p className="footer-tagline">
            The all-in-one school management platform built for modern secondary education.
          </p>
          <div className="footer-socials">
            {["ti-brand-twitter", "ti-brand-linkedin", "ti-brand-facebook", "ti-brand-instagram"].map((icon) => (
              <div key={icon} className="footer-social-btn">
                <i className={`ti ${icon}`} style={{ fontSize: 15 }} aria-hidden="true" />
              </div>
            ))}
          </div>
        </div>

        {footerCols.map((col) => (
          <div key={col.title}>
            <div className="footer-col-title">{col.title}</div>
            {col.links.map((link) => (
              <a key={link} href="#" className="footer-link">{link}</a>
            ))}
          </div>
        ))}
      </div>

      <hr className="footer-divider" />

      <div className="footer-bottom">
        <span className="footer-copy">© {new Date().getFullYear()} Academix. All rights reserved.</span>
        <div className="footer-legal">
          {["Terms", "Privacy", "Cookies"].map((l) => (
            <a key={l} href="#" className="footer-legal-link">{l}</a>
          ))}
        </div>
      </div>
    </div>
  </footer>
);

/* ─── APP ───────────────────────────────────────────────────── */
export default function AcademixLanding() {
  return (
    <>
      <Nav />
      <Hero />
      <Features />
      <Stats />
      <CTA />
      <Footer />
    </>
  );
}