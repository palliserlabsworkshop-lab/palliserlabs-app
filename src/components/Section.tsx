/**
 * Section icons, iOS Settings–style: a small rounded tile in a brand colour with a white glyph.
 * Decoration only — the heading carries the meaning.
 */
const SECTION_ICONS = {
  review: {
    tile: "bg-orange",
    glyph: <path d="M5 10.5l3.2 3.2L15 6.8" strokeLinecap="round" strokeLinejoin="round" />,
  },
  tasks: {
    tile: "bg-yellow",
    glyph: (
      <>
        <path d="M8.5 6h7M8.5 10h7M8.5 14h7" strokeLinecap="round" />
        <circle cx="5" cy="6" r="0.9" fill="currentColor" stroke="none" />
        <circle cx="5" cy="10" r="0.9" fill="currentColor" stroke="none" />
        <circle cx="5" cy="14" r="0.9" fill="currentColor" stroke="none" />
      </>
    ),
  },
  newProject: { tile: "bg-primary", glyph: <path d="M10 4.5v11M4.5 10h11" strokeLinecap="round" /> },
  documents: {
    tile: "bg-[#3a3a40]",
    glyph: (
      <>
        <path d="M6 3.5h5.5L14.5 6.5V16.5H6Z" strokeLinejoin="round" />
        <path d="M11.5 3.5v3h3" strokeLinejoin="round" />
      </>
    ),
  },
  messages: {
    tile: "bg-accent",
    glyph: (
      <path
        d="M10 4C6.1 4 3.5 6.4 3.5 9.3c0 1.6.8 3 2.1 4L5 16l3-1.5c.6.2 1.3.3 2 .3 3.9 0 6.5-2.4 6.5-5.5S13.9 4 10 4Z"
        strokeLinejoin="round"
      />
    ),
  },
} satisfies Record<string, { tile: string; glyph: React.ReactNode }>;

function SectionIcon({ icon }: { icon: keyof typeof SECTION_ICONS }) {
  const { tile, glyph } = SECTION_ICONS[icon];
  return (
    <span
      aria-hidden
      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-[0.55rem] text-white shadow-[inset_0_0_0_0.5px_rgb(0_0_0/0.08)] sm:h-8 sm:w-8 sm:rounded-[0.6rem] ${tile}`}
    >
      <svg viewBox="0 0 20 20" className="h-[17px] w-[17px] sm:h-[19px] sm:w-[19px]" fill="none" stroke="currentColor" strokeWidth="2">
        {glyph}
      </svg>
    </span>
  );
}

export function Section({
  id,
  title,
  icon,
  children,
  aside,
  delay = 0,
  subtitle,
}: {
  id: string;
  title: string;
  icon: keyof typeof SECTION_ICONS;
  children: React.ReactNode;
  aside?: string;
  delay?: number;
  subtitle?: string;
}) {
  return (
    <section id={id} className="mt-14 animate-rise sm:mt-16" style={{ animationDelay: `${delay}ms` }}>
      <div className="mb-4 flex items-center justify-between gap-4 px-1">
        <h2 className="flex items-center gap-2.5 font-display text-[1.4rem] font-medium tracking-[-0.01em] sm:text-[1.6rem]">
          <SectionIcon icon={icon} />
          {title}
        </h2>
        {aside && <span className="text-[0.75rem] text-muted">{aside}</span>}
      </div>
      {subtitle && <p className="-mt-2 mb-4 px-1 text-[0.85rem] text-muted">{subtitle}</p>}
      {children}
    </section>
  );
}
