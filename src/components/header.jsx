function Header() {
  return (
    <div>
      <header
        className="flex items-center justify-between px-6 py-3 border-b"
        style={{ background: "var(--topbar-bg)", backdropFilter: "blur(20px)" }}
      >
        <div className="flex items-center gap-3">
          {/* Logo Mark */}
          <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: "var(--primary-dim)", border: "1px solid var(--border-color)" }}>
            <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4" style={{ color: "var(--warning)" }}>
              <path d="M12 3L2 8l10 5 10-5-10-5z" fill="currentColor" opacity="0.8"/>
              <path d="M2 13l10 5 10-5" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/>
              <path d="M2 18l10 5 10-5" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" opacity="0.5"/>
            </svg>
          </div>

          <div>
            <span className="font-bold text-sm" style={{ color: "var(--text-primary)" }}>
              Academix
            </span>
            <span className="hidden sm:inline text-xs ml-2" style={{ color: "var(--text-muted)" }}>
              Secondary School Portal & Parent Engagement Platform
            </span>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <span className="hidden md:flex items-center gap-1.5 text-xs" style={{ color: "var(--text-secondary)" }}>
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: "var(--success)" }}></span>
            Contact
          </span>

          <a
            href="/signin"
            className="text-xs font-medium transition-colors"
            style={{ color: "var(--text-secondary)" }}
          >
            Sign In
          </a>
        </div>
      </header>
    </div>
  );
}

export default Header;
