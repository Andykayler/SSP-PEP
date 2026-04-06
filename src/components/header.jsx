function Header() {
  return (
    <div>
      <header className="bg-[#1E3A8A] border-b border-[#1e40af]/40 px-6 py-3 flex items-center justify-between anim-fade">
        <div className="flex items-center gap-3">
          {/* Logo Mark */}
          <div className="w-8 h-8 rounded-lg bg-white/10 border border-white/20 flex items-center justify-center flex-shrink-0">
            <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4 text-[#F4B400]">
              <path d="M12 3L2 8l10 5 10-5-10-5z" fill="currentColor" opacity="0.8"/>
              <path d="M2 13l10 5 10-5" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/>
              <path d="M2 18l10 5 10-5" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" opacity="0.5"/>
            </svg>
          </div>

          <div>
            <span className="text-white font-bold text-sm tracking-tight">
              Academix
            </span>
            <span className="hidden sm:inline text-white/40 text-xs ml-2">
              Secondary School Portal & Parent Engagement Platform
            </span>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <span className="hidden md:flex items-center gap-1.5 text-white/60 text-xs">
            <span className="w-1.5 h-1.5 rounded-full bg-[#10B981] animate-pulse"></span>
           Contact
          </span>

          <a
            href="/signin"
            className="text-white/70 hover:text-white text-xs font-medium transition-colors"
          >
            Sign In
          </a>
        </div>
      </header>
    </div>
  );
}

export default Header;