// Tagih mark: a heavy lowercase "t" on a lime tile. The stem sweeps forward (the follow-up keeps moving)
// and the right arm of the crossbar is a coin (the money that comes in). The coin moves on hover
// and pulses while the agent works (pass `live`).

export function Mark({ size = 28, live = false }: { size?: number; live?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" className={`tagih-mark${live ? " is-live" : ""}`}>
      <rect width="32" height="32" rx="8.5" fill="#C6F432" />
      <path d="M12.6 6.8v12.4a5.4 5.4 0 0 0 5.4 5.4h3.2" fill="none" stroke="#121212" strokeWidth="4.4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M7.6 12.6h9.2" fill="none" stroke="#121212" strokeWidth="4.4" strokeLinecap="round" />
      <circle className="tagih-coin" cx="23" cy="12.6" r="3.3" fill="#121212" />
    </svg>
  );
}

export function Logo({ size = 28, live = false }: { size?: number; live?: boolean }) {
  return (
    <span className="tagih-logo inline-flex items-center gap-2.5" aria-label="Tagih">
      <Mark size={size} live={live} />
      <span className="text-[20px] font-semibold tracking-[-0.055em] leading-none">tagih</span>
    </span>
  );
}
