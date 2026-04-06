import { useState, useEffect, useRef } from "react";

// Mock Header component (since we can't import from ../components/header.jsx)
const Header = () => {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled ? "bg-white shadow-md py-3" : "bg-transparent py-5"
      }`}
    >
      <div className="max-w-7xl mx-auto px-6 flex items-center justify-between">
        <div className="flex items-center gap-2">
         <div className="w-8 h-8 rounded-lg bg-white/10 border border-white/20 flex items-center justify-center flex-shrink-0">
            <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4 text-[#F4B400]">
              <path d="M12 3L2 8l10 5 10-5-10-5z" fill="currentColor" opacity="0.8"/>
              <path d="M2 13l10 5 10-5" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/>
              <path d="M2 18l10 5 10-5" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" opacity="0.5"/>
            </svg>
          </div>
          <span
            className={`font-bold text-xl tracking-tight ${
              scrolled ? "text-blue-900" : "text-white"
            }`}
          >
            Academix
          </span>
        </div>

        {/* Desktop Nav */}
        <nav className="hidden md:flex items-center gap-8">
          {["Features", "Stats", "Screenshots", "Pricing"].map((item) => (
            <a
              key={item}
              href={`#${item.toLowerCase()}`}
              className={`text-sm font-medium transition-colors hover:text-yellow-400 ${
                scrolled ? "text-gray-600" : "text-white/80"
              }`}
            >
              {item}
            </a>
          ))}
        </nav>

        <div className="hidden md:flex items-center gap-3">
          <a href="/signin"
            className={`text-sm font-medium px-4 py-2 rounded-lg transition-colors ${
              scrolled
                ? "text-blue-800 hover:bg-blue-50"
                : "text-white hover:bg-white/10"
            }`}
          >
            Sign In
          </a>
          <a href="/register" className="text-sm font-semibold px-5 py-2 rounded-lg bg-yellow-400 text-blue-900 hover:bg-yellow-300 transition-all shadow-md hover:shadow-lg hover:-translate-y-0.5 transform">
            Get Started
          </a>
        </div>

        {/* Mobile menu toggle */}
        <button
          className={`md:hidden p-2 ${scrolled ? "text-blue-900" : "text-white"}`}
          onClick={() => setMenuOpen(!menuOpen)}
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            {menuOpen ? (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            )}
          </svg>
        </button>
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <div className="md:hidden bg-white shadow-xl px-6 py-4 flex flex-col gap-4">
          {["Features", "Stats", "Screenshots", "Pricing"].map((item) => (
            <a
              key={item}
              href={`#${item.toLowerCase()}`}
              className="text-gray-700 font-medium hover:text-blue-800"
              onClick={() => setMenuOpen(false)}
            >
              {item}
            </a>
          ))}
          <button className="w-full text-sm font-semibold px-5 py-2.5 rounded-lg bg-blue-800 text-white hover:bg-blue-700 transition-all">
            Get Started Free
          </button>
        </div>
      )}
    </header>
  );
};

// Hook for scroll-triggered animations
const useInView = (threshold = 0.15) => {
  const ref = useRef(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setInView(true); },
      { threshold }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [threshold]);

  return [ref, inView];
};

// Animated counter
const Counter = ({ end, suffix = "", duration = 2000 }) => {
  const [count, setCount] = useState(0);
  const [ref, inView] = useInView(0.3);

  useEffect(() => {
    if (!inView) return;
    let start = 0;
    const step = end / (duration / 16);
    const timer = setInterval(() => {
      start += step;
      if (start >= end) { setCount(end); clearInterval(timer); }
      else setCount(Math.floor(start));
    }, 16);
    return () => clearInterval(timer);
  }, [inView, end, duration]);

  return <span ref={ref}>{count.toLocaleString()}{suffix}</span>;
};

// Feature card
const FeatureCard = ({ icon, title, desc, delay }) => {
  const [ref, inView] = useInView();
  return (
    <div
      ref={ref}
      className="group bg-white rounded-2xl p-7 shadow-sm border border-gray-100 hover:shadow-xl hover:-translate-y-1 transition-all duration-300"
      style={{
        opacity: inView ? 1 : 0,
        transform: inView ? "translateY(0)" : "translateY(32px)",
        transition: `opacity 0.6s ease ${delay}ms, transform 0.6s ease ${delay}ms, box-shadow 0.3s, translate 0.3s`,
      }}
    >
      <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center mb-5 group-hover:bg-blue-100 transition-colors">
        {icon}
      </div>
      <h3 className="text-blue-900 font-bold text-lg mb-2">{title}</h3>
      <p className="text-gray-500 text-sm leading-relaxed">{desc}</p>
    </div>
  );
};

// CTA Button variants
const CTAButton = ({ children, variant = "primary", className = "" }) => {
  const base =
    "inline-flex items-center gap-2.5 px-6 py-3.5 rounded-xl font-semibold text-sm transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 select-none cursor-pointer";
  const variants = {
    primary:
      "bg-yellow-400 text-blue-900 hover:bg-yellow-300 shadow-lg hover:shadow-xl hover:-translate-y-0.5 focus:ring-yellow-400",
    secondary:
      "bg-white/10 text-white border border-white/30 hover:bg-white/20 hover:-translate-y-0.5",
    outline:
      "bg-transparent text-blue-800 border-2 border-blue-800 hover:bg-blue-800 hover:text-white",
    ghost:
      "bg-blue-800 text-white hover:bg-blue-700 shadow-lg hover:shadow-xl hover:-translate-y-0.5 focus:ring-blue-800",
  };

  return (
    <button className={`${base} ${variants[variant]} ${className}`}>
      {children}
    </button>
  );
};

// Icons
const Icons = {
  graduation: (
    <svg className="w-6 h-6 text-blue-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 14l9-5-9-5-9 5 9 5z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 14l6.16-3.422A12.083 12.083 0 0121 21H3a12.083 12.083 0 012.84-10.422L12 14z" />
    </svg>
  ),
  bell: (
    <svg className="w-6 h-6 text-blue-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
    </svg>
  ),
  chart: (
    <svg className="w-6 h-6 text-blue-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
    </svg>
  ),
  chat: (
    <svg className="w-6 h-6 text-blue-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
    </svg>
  ),
  shield: (
    <svg className="w-6 h-6 text-blue-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
    </svg>
  ),
  google: (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
      <path d="M3.18 23.76c-.36-.2-.63-.49-.8-.87L2 22.5l.01-21 .38-.39c.18-.19.44-.36.7-.44L3.5 1h17l.41.17c.26.1.49.27.67.48l.38.44.01 21-.38.4c-.19.2-.44.36-.7.44l-.39.07H3.5l-.32-.24zM12.12 4.5l-7.62.01L4.5 12l-.01 7.5 7.63.01 7.63-.01-.01-3.38h-7.38v-2.5h9.88l.01-5.5-.01-.62h-9.88V5.12l7.38-.01V4.5h-7.5z"/>
    </svg>
  ),
  apple: (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
      <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
    </svg>
  ),
  desktop: (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
    </svg>
  ),
};

// Phone mockup SVG
const PhoneMockup = ({ color = "#1E3A8A", screen }) => (
  <svg viewBox="0 0 160 320" className="w-full h-full drop-shadow-2xl" fill="none">
    <rect x="8" y="2" width="144" height="316" rx="24" fill={color} />
    <rect x="12" y="6" width="136" height="308" rx="21" fill="#0f1f4d" />
    <rect x="16" y="10" width="128" height="300" rx="18" fill="#f8fafc" />
    {/* Notch */}
    <rect x="55" y="10" width="50" height="12" rx="6" fill={color} />
    {/* Screen content */}
    {screen}
    {/* Home indicator */}
    <rect x="60" y="306" width="40" height="4" rx="2" fill="#94a3b8" />
  </svg>
);

// Desktop mockup SVG
const DesktopMockup = () => (
  <svg viewBox="0 0 420 280" className="w-full drop-shadow-2xl" fill="none">
    {/* Monitor */}
    <rect x="10" y="10" width="400" height="240" rx="12" fill="#1e293b" />
    <rect x="16" y="16" width="388" height="228" rx="8" fill="#f1f5f9" />
    {/* Top bar */}
    <rect x="16" y="16" width="388" height="28" rx="8" fill="#1E3A8A" />
    <circle cx="32" cy="30" r="5" fill="#ef4444" opacity="0.8" />
    <circle cx="46" cy="30" r="5" fill="#f59e0b" opacity="0.8" />
    <circle cx="60" cy="30" r="5" fill="#22c55e" opacity="0.8" />
    {/* URL bar */}
    <rect x="80" y="22" width="260" height="16" rx="8" fill="white" opacity="0.15" />
    {/* Sidebar */}
    <rect x="16" y="44" width="72" height="200" fill="#1E3A8A" opacity="0.08" />
    {/* Sidebar items */}
    {[0, 1, 2, 3, 4].map((i) => (
      <rect key={i} x="24" y={60 + i * 28} width="56" height="18" rx="6" fill="#1E3A8A" opacity={i === 0 ? 0.3 : 0.1} />
    ))}
    {/* Main content */}
    <rect x="96" y="52" width="140" height="20" rx="4" fill="#1E3A8A" opacity="0.15" />
    {/* Stat cards */}
    {[0, 1, 2].map((i) => (
      <rect key={i} x={96 + i * 100} y="84" width="88" height="56" rx="8" fill="white" stroke="#e2e8f0" strokeWidth="1" />
    ))}
    <rect x="96" y="152" width="296" height="12" rx="4" fill="#e2e8f0" />
    <rect x="96" y="172" width="200" height="8" rx="4" fill="#e2e8f0" />
    <rect x="96" y="188" width="250" height="8" rx="4" fill="#e2e8f0" />
    {/* Chart area */}
    <rect x="96" y="204" width="180" height="32" rx="8" fill="white" stroke="#e2e8f0" strokeWidth="1" />
    <rect x="288" y="204" width="104" height="32" rx="8" fill="#1E3A8A" opacity="0.08" />
    {/* Stand */}
    <rect x="195" y="250" width="30" height="20" rx="2" fill="#94a3b8" />
    <rect x="160" y="268" width="100" height="8" rx="4" fill="#64748b" />
  </svg>
);

export default function AcademixLanding() {
  const [heroVisible, setHeroVisible] = useState(false);
  const [featuresRef, featuresInView] = useInView();
  const [statsRef, statsInView] = useInView();
  const [screensRef, screensInView] = useInView();
  const [ctaRef, ctaInView] = useInView();

  useEffect(() => {
    const t = setTimeout(() => setHeroVisible(true), 100);
    return () => clearTimeout(t);
  }, []);

  const features = [
    {
      icon: Icons.graduation,
      title: "Academic Tracking",
      desc: "Monitor student performance, grades, attendance, and academic progress in real-time with intuitive dashboards for teachers and parents.",
    },
    {
      icon: Icons.bell,
      title: "Instant Notifications",
      desc: "Parents receive real-time alerts for attendance, results, fee reminders, school announcements, and important events directly on their phones.",
    },
    {
      icon: Icons.chart,
      title: "Analytics & Reports",
      desc: "Comprehensive performance analytics with visual charts help administrators identify trends and make data-driven decisions effortlessly.",
    },
    {
      icon: Icons.chat,
      title: "Parent-Teacher Communication",
      desc: "Secure in-app messaging bridges the gap between school and home, enabling meaningful conversations about student progress.",
    },
    {
      icon: Icons.shield,
      title: "Secure & Reliable",
      desc: "Enterprise-grade encryption and 99.9% uptime guarantee ensures your school's sensitive data is always safe and accessible.",
    },
  ];

  const stats = [
    { value: 1200, suffix: "+", label: "Schools Onboarded" },
    { value: 850000, suffix: "+", label: "Students Tracked" },
    { value: 99.9, suffix: "%", label: "Platform Uptime" },
    { value: 3200000, suffix: "+", label: "Parents Engaged" },
  ];

  return (
    <div className="font-sans bg-slate-50 overflow-x-hidden">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,wght@0,300;0,400;0,500;0,600;0,700;0,800;1,400&family=Sora:wght@600;700;800&display=swap');
        body { font-family: 'DM Sans', sans-serif; }
        h1, h2, h3 { font-family: 'Sora', sans-serif; }
        @keyframes float { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-12px)} }
        @keyframes pulse-ring { 0%{transform:scale(1);opacity:0.6} 100%{transform:scale(1.4);opacity:0} }
        @keyframes shimmer { 0%{background-position:-200% center} 100%{background-position:200% center} }
        .float { animation: float 4s ease-in-out infinite; }
        .float-delay { animation: float 4s ease-in-out 1.5s infinite; }
        .pulse-ring::before {
          content:''; position:absolute; inset:-4px; border-radius:inherit;
          border:2px solid #F4B400; animation: pulse-ring 2s ease-out infinite;
        }
        .shimmer-btn {
          background: linear-gradient(90deg, #F4B400 0%, #ffd54f 50%, #F4B400 100%);
          background-size: 200% auto;
          animation: shimmer 3s linear infinite;
        }
        .hero-gradient { background: linear-gradient(135deg, #0c1e6e 0%, #1E3A8A 50%, #1a4db8 100%); }
        .mesh-bg {
          background-image: radial-gradient(circle at 20% 50%, rgba(244,180,0,0.08) 0%, transparent 60%),
            radial-gradient(circle at 80% 20%, rgba(99,135,255,0.1) 0%, transparent 50%),
            radial-gradient(circle at 60% 80%, rgba(30,58,138,0.05) 0%, transparent 50%);
        }
        .card-hover { transition: all 0.3s cubic-bezier(0.4,0,0.2,1); }
        .card-hover:hover { transform: translateY(-4px); }
      `}</style>

      {/* ─── HEADER ─── */}
      <Header />

      {/* ─── HERO ─── */}
      <section className="hero-gradient relative min-h-screen flex items-center overflow-hidden pt-20">
        {/* Background grid */}
        <div className="absolute inset-0 opacity-5">
          <div className="w-full h-full" style={{
            backgroundImage: "linear-gradient(rgba(255,255,255,0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.3) 1px, transparent 1px)",
            backgroundSize: "40px 40px"
          }} />
        </div>

        {/* Floating orbs */}
        <div className="absolute top-1/4 right-1/4 w-72 h-72 rounded-full bg-yellow-400 opacity-5 blur-3xl float" />
        <div className="absolute bottom-1/4 left-1/4 w-96 h-96 rounded-full bg-blue-400 opacity-8 blur-3xl float-delay" />

        <div className="max-w-7xl mx-auto px-6 py-20 grid lg:grid-cols-2 gap-16 items-center">
          {/* Left: Text */}
          <div
            style={{
              opacity: heroVisible ? 1 : 0,
              transform: heroVisible ? "translateX(0)" : "translateX(-40px)",
              transition: "opacity 0.8s ease, transform 0.8s ease",
            }}
          >
            

           

            <p className="text-white/70 text-lg md:text-xl leading-relaxed mb-10 max-w-xl">
              Academix connects schools, teachers, and parents in one seamless
              platform — track grades, attendance, and communicate
              effortlessly, all from your phone or desktop.
            </p>

            {/* CTA Buttons */}
            <div className="flex flex-wrap gap-4">
              <button className="shimmer-btn relative pulse-ring inline-flex items-center gap-2.5 px-6 py-3.5 rounded-xl font-bold text-blue-900 text-sm shadow-xl transition-transform hover:-translate-y-1">
                {Icons.google}
                Google Play
              </button>
              <button className="inline-flex items-center gap-2.5 px-6 py-3.5 rounded-xl font-semibold text-white text-sm bg-white/10 border border-white/30 hover:bg-white/20 transition-all hover:-translate-y-0.5 backdrop-blur-sm">
                {Icons.apple}
                App Store
              </button>
              <button className="inline-flex items-center gap-2.5 px-6 py-3.5 rounded-xl font-semibold text-blue-900 text-sm bg-white hover:bg-gray-50 transition-all hover:-translate-y-0.5 shadow-lg">
                {Icons.desktop}
                Web Access
              </button>
            </div>

            <p className="mt-6 text-white/40 text-xs">
              Free for schools · No credit card required · Setup in minutes
            </p>
          </div>

          {/* Right: Device mockups */}
          <div
            className="relative flex items-center justify-center"
            style={{
              opacity: heroVisible ? 1 : 0,
              transform: heroVisible ? "translateY(0)" : "translateY(40px)",
              transition: "opacity 0.9s ease 0.2s, transform 0.9s ease 0.2s",
            }}
          >
            {/* Desktop */}
            <div className="w-full max-w-lg float">
              <DesktopMockup />
            </div>
            {/* Phone overlay */}
            <div className="absolute -right-4 bottom-0 w-28 float-delay">
              <PhoneMockup
                color="#1E3A8A"
                screen={
                  <g>
                    <rect x="20" y="30" width="120" height="16" rx="4" fill="#1E3A8A" opacity="0.15" />
                    {[0, 1, 2].map((i) => (
                      <rect key={i} x="20" y={56 + i * 40} width="120" height="32" rx="6" fill="white" stroke="#e2e8f0" strokeWidth="1" />
                    ))}
                    <rect x="20" y="180" width="80" height="8" rx="4" fill="#e2e8f0" />
                    <rect x="20" y="196" width="100" height="8" rx="4" fill="#e2e8f0" />
                    <rect x="20" y="220" width="120" height="32" rx="8" fill="#1E3A8A" opacity="0.12" />
                    <rect x="20" y="260" width="120" height="32" rx="8" fill="#F4B400" opacity="0.2" />
                  </g>
                }
              />
            </div>
          </div>
        </div>

        {/* Wave */}
        <div className="absolute bottom-0 left-0 right-0">
          <svg viewBox="0 0 1440 80" fill="none" className="w-full">
            <path d="M0 40 C360 80 1080 0 1440 40 L1440 80 L0 80 Z" fill="#f8fafc" />
          </svg>
        </div>
      </section>

      {/* ─── FEATURES ─── */}
      <section id="features" className="py-24 bg-slate-50 mesh-bg">
        <div className="max-w-7xl mx-auto px-6">
          <div ref={featuresRef} className="text-center mb-16"
            style={{
              opacity: featuresInView ? 1 : 0,
              transform: featuresInView ? "translateY(0)" : "translateY(24px)",
              transition: "opacity 0.7s ease, transform 0.7s ease",
            }}
          >
            <span className="inline-block text-yellow-500 font-semibold text-sm uppercase tracking-widest mb-3">
              Why Academix
            </span>
            <h2 className="text-3xl md:text-4xl font-extrabold text-blue-900 mb-4">
              Everything Your School Needs
            </h2>
            <p className="text-gray-500 max-w-2xl mx-auto text-lg">
              Designed with HCI principles at the core — simple, powerful, and
              accessible for administrators, teachers, and parents alike.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((f, i) => (
              <FeatureCard key={f.title} {...f} delay={i * 100} />
            ))}
          </div>
        </div>
      </section>

      {/* ─── STATS ─── */}
      <section id="stats" className="py-24 bg-blue-900 relative overflow-hidden">
        <div className="absolute inset-0 opacity-5">
          <div className="w-full h-full" style={{
            backgroundImage: "radial-gradient(circle, white 1px, transparent 1px)",
            backgroundSize: "32px 32px"
          }} />
        </div>
        <div className="max-w-7xl mx-auto px-6">
          <div
            ref={statsRef}
            className="text-center mb-16"
            style={{
              opacity: statsInView ? 1 : 0,
              transform: statsInView ? "translateY(0)" : "translateY(24px)",
              transition: "opacity 0.7s ease, transform 0.7s ease",
            }}
          >
            <h2 className="text-3xl md:text-4xl font-extrabold text-white mb-4">
              Trusted by Schools Nationwide
            </h2>
            <p className="text-blue-200 text-lg">
              Numbers that reflect our commitment to education and excellence.
            </p>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
            {stats.map((s, i) => (
              <div
                key={s.label}
                className="bg-white/10 backdrop-blur-sm border border-white/10 rounded-2xl p-8 text-center hover:bg-white/15 transition-colors card-hover"
                style={{
                  opacity: statsInView ? 1 : 0,
                  transform: statsInView ? "translateY(0)" : "translateY(32px)",
                  transition: `opacity 0.6s ease ${i * 100}ms, transform 0.6s ease ${i * 100}ms, background 0.3s`,
                }}
              >
                <div className="text-3xl md:text-4xl font-extrabold text-yellow-400 mb-2 font-mono">
                  <Counter end={s.value} suffix={s.suffix} />
                </div>
                <div className="text-blue-200 text-sm font-medium">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── SCREENSHOTS ─── */}
      <section id="screenshots" className="py-24 bg-white">
        <div className="max-w-7xl mx-auto px-6">
          <div
            ref={screensRef}
            className="text-center mb-16"
            style={{
              opacity: screensInView ? 1 : 0,
              transform: screensInView ? "translateY(0)" : "translateY(24px)",
              transition: "opacity 0.7s ease, transform 0.7s ease",
            }}
          >
            <span className="inline-block text-yellow-500 font-semibold text-sm uppercase tracking-widest mb-3">
              See It In Action
            </span>
            <h2 className="text-3xl md:text-4xl font-extrabold text-blue-900 mb-4">
              Beautiful on Every Device
            </h2>
            <p className="text-gray-500 max-w-xl mx-auto text-lg">
              From mobile app to full desktop dashboard — Academix delivers a
              seamless experience wherever you are.
            </p>
          </div>

          <div className="grid lg:grid-cols-3 gap-10 items-end">
            {/* iOS phone */}
            <div
              className="flex flex-col items-center gap-4"
              style={{
                opacity: screensInView ? 1 : 0,
                transform: screensInView ? "translateY(0)" : "translateY(48px)",
                transition: "opacity 0.7s ease 0.1s, transform 0.7s ease 0.1s",
              }}
            >
              <div className="w-44">
                <PhoneMockup
                  color="#1E3A8A"
                  screen={
                    <g>
                      <rect x="20" y="32" width="120" height="18" rx="6" fill="#1E3A8A" opacity="0.15" />
                      <rect x="20" y="56" width="50" height="50" rx="10" fill="#1E3A8A" opacity="0.1" />
                      <rect x="78" y="56" width="62" height="22" rx="6" fill="#e2e8f0" />
                      <rect x="78" y="84" width="40" height="12" rx="4" fill="#F4B400" opacity="0.6" />
                      {[0,1,2,3].map(i => (
                        <rect key={i} x="20" y={120+i*32} width="120" height="24" rx="6" fill={i===0?"#1E3A8A":"#f1f5f9"} opacity={i===0?0.12:1} />
                      ))}
                      <rect x="20" y="252" width="120" height="36" rx="10" fill="#1E3A8A" opacity="0.12" />
                    </g>
                  }
                />
              </div>
              <div className="text-center">
                <p className="font-semibold text-blue-900">iOS App</p>
                <p className="text-gray-400 text-sm">iPhone 15 Pro</p>
              </div>
            </div>

            {/* Desktop — center and larger */}
            <div
              className="flex flex-col items-center gap-4"
              style={{
                opacity: screensInView ? 1 : 0,
                transform: screensInView ? "translateY(0)" : "translateY(48px)",
                transition: "opacity 0.7s ease 0.2s, transform 0.7s ease 0.2s",
              }}
            >
              <div className="w-full">
                <DesktopMockup />
              </div>
              <div className="text-center">
                <p className="font-semibold text-blue-900">Web Dashboard</p>
                <p className="text-gray-400 text-sm">Full desktop experience</p>
              </div>
            </div>

            {/* Android phone */}
            <div
              className="flex flex-col items-center gap-4"
              style={{
                opacity: screensInView ? 1 : 0,
                transform: screensInView ? "translateY(0)" : "translateY(48px)",
                transition: "opacity 0.7s ease 0.3s, transform 0.7s ease 0.3s",
              }}
            >
              <div className="w-44">
                <PhoneMockup
                  color="#0f172a"
                  screen={
                    <g>
                      <rect x="20" y="32" width="70" height="14" rx="4" fill="#1E3A8A" opacity="0.2" />
                      <rect x="20" y="56" width="120" height="64" rx="10" fill="#1E3A8A" opacity="0.1" />
                      <rect x="32" y="68" width="60" height="10" rx="3" fill="#1E3A8A" opacity="0.3" />
                      <rect x="32" y="84" width="80" height="8" rx="3" fill="#e2e8f0" />
                      <rect x="32" y="98" width="40" height="12" rx="6" fill="#F4B400" opacity="0.7" />
                      {[0,1,2].map(i => (
                        <rect key={i} x="20" y={134+i*36} width="120" height="28" rx="8" fill={i===1?"#F4B400":"#f1f5f9"} opacity={i===1?0.2:1} />
                      ))}
                      <rect x="20" y="246" width="120" height="40" rx="10" fill="#1E3A8A" opacity="0.1" />
                    </g>
                  }
                />
              </div>
              <div className="text-center">
                <p className="font-semibold text-blue-900">Android App</p>
                <p className="text-gray-400 text-sm">Material Design 3</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── CTA DOWNLOAD ─── */}
      <section className="py-24 bg-gradient-to-br from-slate-900 via-blue-950 to-blue-900 relative overflow-hidden">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[600px] rounded-full bg-yellow-400 opacity-5 blur-3xl" />

        <div
          ref={ctaRef}
          className="max-w-3xl mx-auto px-6 text-center relative z-10"
          style={{
            opacity: ctaInView ? 1 : 0,
            transform: ctaInView ? "translateY(0)" : "translateY(32px)",
            transition: "opacity 0.8s ease, transform 0.8s ease",
          }}
        >
          <div className="w-16 h-16 rounded-2xl bg-yellow-400 flex items-center justify-center mx-auto mb-6 shadow-lg shadow-yellow-400/30">
            <svg className="w-8 h-8 text-blue-900" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
          </div>

          <h2 className="text-3xl md:text-5xl font-extrabold text-white mb-5 leading-tight">
            Start Your School's Digital Transformation Today
          </h2>
          <p className="text-blue-200 text-lg mb-10">
            Join over 1,200 schools already using Academix. Get set up in
            minutes — free forever for small schools.
          </p>

          <div className="flex flex-wrap justify-center gap-4 mb-6">
            <button className="shimmer-btn relative pulse-ring inline-flex items-center gap-2.5 px-7 py-4 rounded-xl font-bold text-blue-900 text-base shadow-2xl hover:-translate-y-1 transition-transform">
              {Icons.google}
              Download on Google Play
            </button>
            <button className="inline-flex items-center gap-2.5 px-7 py-4 rounded-xl font-semibold text-white text-base bg-white/10 border border-white/20 hover:bg-white/20 transition-all hover:-translate-y-1 backdrop-blur-sm">
              {Icons.apple}
              Download on App Store
            </button>
            <button className="inline-flex items-center gap-2.5 px-7 py-4 rounded-xl font-semibold text-blue-900 text-base bg-white hover:bg-gray-50 transition-all hover:-translate-y-1 shadow-xl">
              {Icons.desktop}
              Access on Desktop
            </button>
          </div>

          <p className="text-blue-300/60 text-sm">
            Available on iOS 14+, Android 8+, and all modern browsers.
          </p>
        </div>
      </section>

      {/* ─── FOOTER ─── */}
      <footer className="bg-slate-900 text-gray-400 pt-16 pb-8">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid md:grid-cols-4 gap-10 mb-12">
            {/* Brand */}
            <div className="md:col-span-1">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-9 h-9 rounded-lg bg-blue-700 flex items-center justify-center">
                  <span className="text-yellow-400 font-bold text-lg">A</span>
                </div>
                <span className="text-white font-bold text-xl tracking-tight">Academix</span>
              </div>
              <p className="text-sm leading-relaxed text-gray-500 mb-5">
                The all-in-one school management and parent engagement platform
                built for modern secondary education.
              </p>
              {/* Social icons */}
              <div className="flex gap-3">
                {["twitter", "linkedin", "facebook", "instagram"].map((s) => (
                  <a
                    key={s}
                    href="#"
                    className="w-9 h-9 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center transition-colors"
                  >
                    <span className="sr-only">{s}</span>
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                      <circle cx="12" cy="12" r="10" opacity="0.3" />
                    </svg>
                  </a>
                ))}
              </div>
            </div>

            {/* Links */}
            {[
              {
                title: "Product",
                links: ["Features", "Pricing", "Screenshots", "Changelog"],
              },
              {
                title: "Company",
                links: ["About Us", "Blog", "Careers", "Press Kit"],
              },
              {
                title: "Support",
                links: [
                  "Contact Support",
                  "Documentation",
                  "Terms of Service",
                  "Privacy Policy",
                ],
              },
            ].map((col) => (
              <div key={col.title}>
                <h4 className="text-white font-semibold text-sm mb-4 uppercase tracking-wider">
                  {col.title}
                </h4>
                <ul className="space-y-3">
                  {col.links.map((link) => (
                    <li key={link}>
                      <a
                        href="#"
                        className="text-gray-500 hover:text-yellow-400 text-sm transition-colors"
                      >
                        {link}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <div className="border-t border-white/5 pt-8 flex flex-col md:flex-row justify-between items-center gap-4">
            <p className="text-gray-600 text-sm">
              © {new Date().getFullYear()} Academix. All rights reserved.
            </p>
            <div className="flex gap-4">
              {["Terms", "Privacy", "Cookies"].map((l) => (
                <a
                  key={l}
                  href="#"
                  className="text-gray-600 hover:text-gray-400 text-sm transition-colors"
                >
                  {l}
                </a>
              ))}
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}