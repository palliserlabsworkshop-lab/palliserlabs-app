/** Palliser Labs mark + wordmark, drawn in SVG so it stays crisp at any size. */
export function LogoMark({ className = "h-7 w-auto" }: { className?: string }) {
  return (
    <svg viewBox="0 0 424 274" className={className} aria-hidden="true">
      <rect x="0" y="0" width="82" height="274" rx="26" fill="var(--brand-yellow)" />
      <rect x="98" y="0" width="82" height="112" rx="26" fill="var(--brand-orange)" />
      <rect x="244" y="0" width="82" height="274" rx="26" fill="var(--brand-accent)" />
      <rect x="342" y="162" width="82" height="112" rx="26" fill="var(--brand-primary)" />
    </svg>
  );
}

export function Logo({ size = "md" }: { size?: "md" | "lg" }) {
  const mark = size === "lg" ? "h-9 w-auto" : "h-6 w-auto";
  const text = size === "lg" ? "text-[1.35rem]" : "text-[0.95rem]";
  return (
    <span className="inline-flex items-center gap-3" aria-label="Palliser Labs">
      <LogoMark className={mark} />
      <span className={`font-display ${text} leading-none tracking-[0.04em] text-foreground`}>
        <span className="font-thin">PALLISER</span>
        <span className="font-sans font-extrabold tracking-[0.01em]">LABS</span>
      </span>
    </span>
  );
}
