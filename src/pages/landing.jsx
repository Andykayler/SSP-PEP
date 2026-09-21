// Public landing page.
//
// Organised around the school day rather than a feature list: the timeline
// walks from the morning register to the term-end report, and each stop names
// who does it. Everything on the page is something the product does — there
// are deliberately no invented user counts or testimonials.
import { useState, useEffect, useRef, useCallback } from "react";
import { Link } from "react-router-dom";
import { getInitialTheme, applyTheme, toggleTheme as toggleThemeUtil } from "../utils/theme";
import {
  Sun, Moon, X, Menu, LogIn, School, ArrowRight, Check, Minus, Star,
  ClipboardCheck, BookOpen, Clock, Wallet, MessageCircle, Award,
  Users, Building2, GraduationCap, UserCheck, Bell, Pencil,
} from "lucide-react";
import { BANDS, MIN_PLATFORM_PER_TERM, CADENCES, TERMS_PER_YEAR } from "../services/pricing";
import { BRAND } from "../components/brand";
import "./landing.css";


/* ─── helpers ───────────────────────────────────────── */

// Fades a block in the first time it scrolls into view. Reduced-motion users
// skip the fade in CSS, and browsers without IntersectionObserver show it at once.
function Reveal({ as: Tag = "div", delay = 0, className = "", children, ...rest }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    if (!("IntersectionObserver" in window)) { el.classList.add("is-in"); return undefined; }
    const io = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { el.classList.add("is-in"); io.disconnect(); }
    }, { threshold: 0.12 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <Tag ref={ref} className={`lp-reveal ${className}`} style={{ transitionDelay: `${delay}ms` }} {...rest}>
      {children}
    </Tag>
  );
}

const NAV = [
  { id: "day", label: "A school day" },
  { id: "roles", label: "Who it's for" },
  { id: "parents", label: "Parents" },
  { id: "pricing", label: "Pricing" },
];

/* ─── NAV ───────────────────────────────────────────── */
function TopNav({ scrolled, go, menuOpen, setMenuOpen, theme, onToggleTheme }) {
  return (
    <header className={`lp-nav${scrolled ? " is-scrolled" : ""}`}>
      <div className="lp-nav__inner">
        <a href="/" className="lp-brand" aria-label={`${BRAND} home`}>
          <span className="lp-brand__mark"><GraduationCap size={18} aria-hidden="true" /></span>
          {BRAND}
        </a>

        <nav className="lp-nav__links" aria-label="Sections">
          {NAV.map((n) => (
            <button key={n.id} type="button" onClick={() => go(n.id)}>{n.label}</button>
          ))}
        </nav>

        <div className="lp-nav__actions">
          <button
            type="button"
            className="lp-icon-btn"
            onClick={onToggleTheme}
            aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
          >
            {theme === "dark" ? <Sun size={18} aria-hidden="true" /> : <Moon size={18} aria-hidden="true" />}
          </button>
          <Link to="/signin" className="lp-btn lp-btn--ghost lp-hide-sm">Sign in</Link>
          <Link to="/register" className="lp-btn lp-btn--primary lp-hide-sm">Register your school</Link>
          <button
            type="button"
            className="lp-icon-btn lp-nav__toggle"
            onClick={() => setMenuOpen((o) => !o)}
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            aria-expanded={menuOpen}
          >
            {menuOpen ? <X size={20} aria-hidden="true" /> : <Menu size={20} aria-hidden="true" />}
          </button>
        </div>
      </div>

      <div className={`lp-menu${menuOpen ? " is-open" : ""}`}>
        {NAV.map((n) => (
          <button key={n.id} type="button" onClick={() => { go(n.id); setMenuOpen(false); }}>{n.label}</button>
        ))}
        <Link to="/signin" className="lp-btn lp-btn--ghost" onClick={() => setMenuOpen(false)}>Sign in</Link>
        <Link to="/register" className="lp-btn lp-btn--primary" onClick={() => setMenuOpen(false)}>Register your school</Link>
      </div>
    </header>
  );
}

/* ─── HERO ──────────────────────────────────────────── */

// A desk with three things a school runs on. Decorative: the sample names and
// marks are made up, and the caption says so.
function DeskScene() {
  const periods = [
    { n: "P1", t: "07:30", s: "Mathematics" },
    { n: "P2", t: "08:30", s: "English" },
    { n: "P3", t: "09:30", s: "Biology", now: true },
    { n: "P4", t: "10:30", s: "Chichewa" },
    { n: "P5", t: "11:30", s: "Physics" },
  ];
  const learners = [
    { name: "Chikondi Mwale", here: true },
    { name: "Tiyamike Phiri", here: true },
    { name: "Memory Banda", here: false },
    { name: "Yamikani Kachale", here: true },
    { name: "Limbani Chirwa", here: true },
  ];
  const marks = [
    { s: "Mathematics", m: 82, g: "G1 · Distinction" },
    { s: "English", m: 74, g: "G2 · Distinction" },
    { s: "Biology", m: 68, g: "G3 · Credit" },
  ];

  return (
    <figure className="lp-desk" aria-hidden="true">
      <div className="lp-sheet lp-sheet--time">
        <div className="lp-sheet__head">
          <strong>Form 3A</strong><span>Monday</span>
        </div>
        <ul className="lp-time">
          {periods.map((p) => (
            <li key={p.n} className={p.now ? "is-now" : ""}>
              <span className="lp-time__p">{p.n}</span>
              <span className="lp-time__t">{p.t}</span>
              <span className="lp-time__s">{p.s}</span>
              {p.now && <em>now</em>}
            </li>
          ))}
        </ul>
      </div>

      <div className="lp-sheet lp-sheet--reg">
        <div className="lp-sheet__head">
          <strong>Register</strong><span>Form 3A</span>
        </div>
        <ul className="lp-reg">
          {learners.map((l) => (
            <li key={l.name} className={l.here ? "" : "is-absent"}>
              <span className="lp-reg__box">
                {l.here ? <Check size={13} strokeWidth={3} /> : <X size={13} strokeWidth={3} />}
              </span>
              {l.name}
            </li>
          ))}
        </ul>
        <div className="lp-reg__foot">4 present · 1 absent</div>
      </div>

      <div className="lp-sheet lp-sheet--card">
        <span className="lp-sticker"><Star size={22} fill="currentColor" strokeWidth={0} /></span>
        <div className="lp-sheet__head">
          <strong>Term 2 report</strong><span>Form 3A</span>
        </div>
        <p className="lp-card__name">Chikondi Mwale</p>
        <table className="lp-marks">
          <tbody>
            {marks.map((r) => (
              <tr key={r.s}><td>{r.s}</td><td>{r.m}</td><td>{r.g}</td></tr>
            ))}
          </tbody>
        </table>
        <p className="lp-pen">Well done, Chikondi!</p>
      </div>
      <figcaption>Sample data</figcaption>
    </figure>
  );
}

function Hero() {
  return (
    <section className="lp-hero" aria-labelledby="lp-hero-title">
      <div className="lp-wrap lp-hero__grid">
        <div className="lp-hero__copy">
          <p className="lp-eyebrow"><School size={14} aria-hidden="true" /> Built for secondary schools in Malawi</p>
          <h1 id="lp-hero-title" className="lp-h1">
            From the <span className="lp-mark">first bell</span> to the last report card.
          </h1>
          <p className="lp-lead">
            {BRAND} keeps registers, lesson plans, marks, fees and parent messages in one place, so
            head teachers can see the whole school and teachers can get back to teaching.
          </p>
          <div className="lp-hero__cta">
            <Link to="/register" className="lp-btn lp-btn--primary lp-btn--lg">
              <School size={18} aria-hidden="true" /> Register your school
            </Link>
            <Link to="/signin" className="lp-btn lp-btn--ghost lp-btn--lg">
              <LogIn size={18} aria-hidden="true" /> Staff sign in
            </Link>
          </div>
          <ul className="lp-facts">
            <li><Check size={15} aria-hidden="true" /> MANEB grade scale built in</li>
            <li><Check size={15} aria-hidden="true" /> Three-term school year</li>
            <li><Check size={15} aria-hidden="true" /> Priced in kwacha</li>
          </ul>
        </div>
        <DeskScene />
      </div>
    </section>
  );
}

/* ─── A SCHOOL DAY ──────────────────────────────────── */
const DAY = [
  { time: "07:30", who: "Class teacher", icon: ClipboardCheck, title: "The register",
    text: "Mark each learner present or absent in a few taps. The head teacher sees attendance for every class without asking." },
  { time: "08:30", who: "Teacher", icon: BookOpen, title: "The lesson",
    text: "Lesson plans are written in the system, and an assistant can draft the objectives, resources and assessment from just a topic. Head teachers can read every plan." },
  { time: "10:30", who: "Head teacher", icon: Clock, title: "Are lessons happening?",
    text: "Class Monitor sets the timetable beside teachers' clock-ins, so you can tell which lessons are being taken as scheduled." },
  { time: "13:00", who: "Bursar", icon: Wallet, title: "Fees come in",
    text: "Record payments, print receipts, and keep arrears, sponsors and bursaries in order. The head teacher decides who may sit exams." },
  { time: "15:00", who: "Parents", icon: MessageCircle, title: "Home hears about it",
    text: "Homework, notices and messages reach guardians on their phones, and fee reminders go out on WhatsApp." },
  { time: "Term end", who: "Everyone", icon: Award, title: "Marks and reports",
    text: "Scores are entered against the MANEB grade scale (G1 to G9), with each assessment weighted into the term grade." },
];

function SchoolDay() {
  return (
    <section id="day" className="lp-section lp-section--alt" aria-labelledby="lp-day-title">
      <div className="lp-wrap lp-day">
        <Reveal className="lp-day__intro">
          <p className="lp-eyebrow">A school day</p>
          <h2 id="lp-day-title" className="lp-h2">Follow one day through the school.</h2>
          <p className="lp-body">
            Every part of the day leaves a record, and every record reaches the person who needs it,
            without the paper trail or the phone calls.
          </p>
          <p className="lp-pen lp-pen--side">no more chasing registers!</p>
        </Reveal>

        <ol className="lp-timeline">
          {DAY.map((d, i) => (
            <Reveal as="li" key={d.time} delay={i * 50} className="lp-stop">
              <div className="lp-stop__time">{d.time}</div>
              <div className="lp-stop__dot" aria-hidden="true"><d.icon size={16} /></div>
              <div className="lp-stop__card">
                <span className="lp-tag">{d.who}</span>
                <h3>{d.title}</h3>
                <p>{d.text}</p>
              </div>
            </Reveal>
          ))}
        </ol>
      </div>
    </section>
  );
}

/* ─── ROLES ─────────────────────────────────────────── */
const ROLES = [
  { name: "Head teacher", icon: Users, tone: "blue", line: "Runs the school day to day",
    points: ["Reads lesson plans and watches class sessions", "Attendance, discipline and results in one view", "Decides fee clearance for exams"] },
  { name: "Teacher", icon: BookOpen, tone: "green", line: "Plans, teaches, records",
    points: ["Takes the register in seconds", "Enters marks on the MANEB scale", "Sets homework that parents can see"] },
  { name: "Bursar", icon: Wallet, tone: "gold", line: "Keeps the money straight",
    points: ["Fee structures, payments and printed receipts", "Arrears, sponsors and bursaries", "Expenses set beside collections"] },
  { name: "Director", icon: Building2, tone: "teal", line: "Sees every campus",
    points: ["Group overview and campus comparison", "Fee position across every campus", "Approves learners moving between campuses"] },
  { name: "Administrator", icon: UserCheck, tone: "red", line: "Sets the school up",
    points: ["Staff accounts, roles and campuses", "Terms, settings and announcements", "An audit log of who changed what"] },
];

function Roles() {
  return (
    <section id="roles" className="lp-section" aria-labelledby="lp-roles-title">
      <div className="lp-wrap">
        <Reveal className="lp-head">
          <p className="lp-eyebrow">Who it's for</p>
          <h2 id="lp-roles-title" className="lp-h2">Everyone gets their own desk.</h2>
          <p className="lp-body">
            Each person signs in to a dashboard made for their job, and each dashboard has a built-in
            guided tour: press the <span className="lp-inline-icon" aria-label="question mark">?</span> in the top bar
            and it walks you through every module.
          </p>
        </Reveal>

        <div className="lp-roles">
          {ROLES.map((r, i) => (
            <Reveal as="article" key={r.name} delay={i * 60} className={`lp-badge lp-badge--${r.tone}`}>
              <span className="lp-badge__slot" aria-hidden="true" />
              <div className="lp-badge__icon"><r.icon size={22} aria-hidden="true" /></div>
              <h3>{r.name}</h3>
              <p className="lp-badge__line">{r.line}</p>
              <ul>
                {r.points.map((p) => <li key={p}><Check size={14} aria-hidden="true" />{p}</li>)}
              </ul>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─── PARENTS ───────────────────────────────────────── */
function Parents() {
  const items = [
    { icon: BookOpen, tag: "Homework · Mathematics", text: "Exercise 4.2, due Thursday" },
    { icon: MessageCircle, tag: "Message from school", text: "Term 2 fees: a reminder that the balance is due on 14 October." },
    { icon: Bell, tag: "Notice", text: "Parents' day is this Saturday at 9:00." },
  ];
  return (
    <section id="parents" className="lp-section lp-section--alt" aria-labelledby="lp-parents-title">
      <div className="lp-wrap lp-parents">
        <Reveal>
          <p className="lp-eyebrow">Parents and guardians</p>
          <h2 id="lp-parents-title" className="lp-h2">Parents hear it from the school first.</h2>
          <p className="lp-body">
            Guardians get their own mobile app. They see the homework that was set, read notices, message
            the school, and get fee reminders on WhatsApp, so a child's homework never arrives as a rumour.
          </p>
          <ul className="lp-checks">
            <li><Check size={16} aria-hidden="true" /> Homework and due dates</li>
            <li><Check size={16} aria-hidden="true" /> Notices and messages from the school</li>
            <li><Check size={16} aria-hidden="true" /> Fee reminders on WhatsApp</li>
          </ul>
        </Reveal>

        <Reveal delay={100} className="lp-phone-wrap">
          <div className="lp-phone" aria-hidden="true">
            <div className="lp-phone__bar"><span className="lp-phone__notch" /></div>
            <div className="lp-phone__title">Chikondi's school</div>
            {items.map((it) => (
              <div key={it.tag} className="lp-note">
                <span className="lp-note__icon"><it.icon size={16} /></span>
                <div><strong>{it.tag}</strong><p>{it.text}</p></div>
              </div>
            ))}
          </div>
          <p className="lp-caption">Sample screen</p>
        </Reveal>
      </div>
    </section>
  );
}

/* ─── PRICING ───────────────────────────────────────── */
/* Rates come from services/pricing.js so this page can never drift away from
   what the billing screen actually invoices. Cards are grouped by school size
   because that is how a head teacher identifies their own school — the bands
   themselves are marginal, so a school spanning two of them pays each rate on
   the learners that fall in it. */
const rate = (id) => (BANDS.find((b) => b.id === id) || {}).rate;
const mk = (n) => `MK ${Number(n).toLocaleString("en-US")}`;

const PLANS = [
  {
    name: "Small school",
    range: "Up to 250 learners",
    price: mk(rate("A")),
    desc: "Everything included from day one. No module is locked behind a tier.",
    accent: false,
    features: [
      { label: "Every module included", yes: true },
      { label: "Guardian mobile app", yes: true },
      { label: "Fees, receipts & arrears", yes: true },
      { label: "Attendance, grades & reports", yes: true },
      { label: "SMS wallet, pay as you use", yes: true },
      { label: `Minimum ${mk(MIN_PLATFORM_PER_TERM)} per term`, yes: true },
      { label: "Priority support", yes: false },
      { label: "Dedicated account manager", yes: false },
    ],
  },
  {
    name: "Growing school",
    range: "251–1,200 learners",
    tag: "Most popular",
    price: `from ${mk(rate("C"))}`,
    desc: "Your rate drops as your roll grows, automatically.",
    accent: true,
    features: [
      { label: "Everything in Small school", yes: true },
      { label: `${mk(rate("B"))} per learner from 251`, yes: true },
      { label: `${mk(rate("C"))} per learner from 601`, yes: true },
      { label: "Boarding & inventory modules", yes: true },
      { label: "Bulk import & data migration", yes: true },
      { label: "Admissions & exam readiness", yes: true },
      { label: "Priority support", yes: true },
      { label: "Dedicated account manager", yes: false },
    ],
  },
  {
    name: "Large school",
    range: "1,201+ learners",
    price: `from ${mk(rate("D"))}`,
    desc: "For the largest schools and multi-school groups. Volume terms by agreement.",
    accent: false,
    features: [
      { label: "Everything in Growing school", yes: true },
      { label: `${mk(rate("D"))} per learner from 1,201`, yes: true },
      { label: "Volume terms by agreement", yes: true },
      { label: "Group billing arrangements", yes: true },
      { label: "Custom reporting", yes: true },
      { label: "Guided onboarding & training", yes: true },
      { label: "Priority support", yes: true },
      { label: "Dedicated account manager", yes: true },
    ],
  },
];

function Pricing() {
  return (
    <section id="pricing" className="lp-section" aria-labelledby="lp-pricing-title">
      <div className="lp-wrap">
        <Reveal className="lp-head lp-head--center">
          <p className="lp-eyebrow">Pricing</p>
          <h2 id="lp-pricing-title" className="lp-h2">Simple, priced per learner.</h2>
          <p className="lp-body">
            You pay per learner, per term: {TERMS_PER_YEAR} terms a year, invoiced when schools collect
            fees. Prepay the year and save {Math.round((1 - CADENCES.annual.multiplier) * 100)}%. Every plan
            starts with a 30-day free trial.
          </p>
        </Reveal>

        <div className="lp-plans">
          {PLANS.map((plan, i) => (
            <Reveal as="article" key={plan.name} delay={i * 80} className={`lp-plan${plan.accent ? " lp-plan--accent" : ""}`}>
              {plan.accent && (
                <span className="lp-plan__flag"><Star size={11} fill="currentColor" aria-hidden="true" /> {plan.tag}</span>
              )}
              <span className="lp-plan__tag">{plan.range}</span>
              <h3>{plan.name}</h3>
              <p className="lp-plan__price">{plan.price}<small> / learner / term</small></p>
              <p className="lp-plan__desc">{plan.desc}</p>
              <ul>
                {plan.features.map((f) => (
                  <li key={f.label} className={f.yes ? "" : "is-no"}>
                    {f.yes ? <Check size={15} aria-hidden="true" /> : <Minus size={15} aria-hidden="true" />}
                    {f.label}
                  </li>
                ))}
              </ul>
              <Link to="/register" className={`lp-btn lp-btn--block ${plan.accent ? "lp-btn--primary" : "lp-btn--ghost"}`}>
                Start 30-day trial <ArrowRight size={16} aria-hidden="true" />
              </Link>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─── CLOSING CALL ──────────────────────────────────── */
function Closing() {
  return (
    <section className="lp-closing">
      <Reveal className="lp-wrap lp-closing__inner">
        <Pencil size={28} aria-hidden="true" className="lp-closing__pencil" />
        <h2 className="lp-h2">A new term is a good time to start.</h2>
        <p className="lp-body">
          Register your school, add your classes and staff, and your first register can be taken this week.
        </p>
        <div className="lp-hero__cta lp-hero__cta--center">
          <Link to="/register" className="lp-btn lp-btn--gold lp-btn--lg">
            <School size={18} aria-hidden="true" /> Register your school
          </Link>
          <Link to="/signin" className="lp-btn lp-btn--light lp-btn--lg">
            <LogIn size={18} aria-hidden="true" /> Staff sign in
          </Link>
        </div>
      </Reveal>
    </section>
  );
}

/* ─── FOOTER ────────────────────────────────────────── */
function Footer({ go }) {
  return (
    <footer className="lp-footer">
      <div className="lp-wrap lp-footer__grid">
        <div>
          <div className="lp-brand lp-brand--footer">
            <span className="lp-brand__mark"><GraduationCap size={18} aria-hidden="true" /></span>
            {BRAND}
          </div>
          <p className="lp-footer__tag">School management for secondary schools in Malawi.</p>
        </div>
        <div>
          <h4>On this page</h4>
          {NAV.map((n) => <button key={n.id} type="button" onClick={() => go(n.id)}>{n.label}</button>)}
        </div>
        <div>
          <h4>Account</h4>
          <Link to="/signin">Sign in</Link>
          <Link to="/register">Register your school</Link>
        </div>
      </div>
      <div className="lp-wrap lp-footer__base">© {new Date().getFullYear()} {BRAND}. All rights reserved.</div>
    </footer>
  );
}

/* ─── PAGE ──────────────────────────────────────────── */
export default function AcademixLanding() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [theme, setTheme] = useState(getInitialTheme);

  useEffect(() => { applyTheme(theme); }, [theme]);

  const onToggleTheme = useCallback(() => setTheme((prev) => toggleThemeUtil(prev)), []);
  const go = useCallback((id) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  return (
    // The page scrolls inside this box, not the window: the app's shared
    // stylesheet pins html/body to the viewport for the dashboards.
    <div className="lp lp-js" onScroll={(e) => setScrolled(e.currentTarget.scrollTop > 8)}>
      <TopNav
        scrolled={scrolled}
        go={go}
        menuOpen={menuOpen}
        setMenuOpen={setMenuOpen}
        theme={theme}
        onToggleTheme={onToggleTheme}
      />
      <main>
        <Hero />
        <SchoolDay />
        <Roles />
        <Parents />
        <Pricing />
        <Closing />
      </main>
      <Footer go={go} />
    </div>
  );
}
