import Link from "next/link";

/**
 * Brand pills under the welcome heading: All · Natty · B · Liam – Personal …
 * Only shown when a person has more than one brand. Selection lives in the URL (?brand=),
 * and the server checks it against the viewer's own brands.
 */
export function BrandSwitcher({ brands, active }: { brands: { id: string; name: string }[]; active: string | null }) {
  const pill = (selected: boolean) =>
    `pressable inline-flex min-h-10 shrink-0 items-center rounded-full border px-4 text-[0.8rem] font-bold ${
      selected ? "border-foreground bg-foreground text-on-ink" : "border-line bg-card text-foreground hover:border-foreground/30"
    }`;
  return (
    <nav aria-label="Brands" className="-mx-5 mt-5 overflow-x-auto px-5 [scrollbar-width:none] sm:-mx-8 sm:px-8">
      <div className="flex w-max gap-2 pb-1">
        <Link href="/dashboard" scroll={false} aria-current={active ? undefined : "page"} className={pill(!active)}>
          All
        </Link>
        {brands.map((b) => (
          <Link
            key={b.id}
            href={`/dashboard?brand=${b.id.replace(/-/g, "")}`}
            scroll={false}
            aria-current={active === b.id ? "page" : undefined}
            className={pill(active === b.id)}
          >
            {b.name || "Untitled brand"}
          </Link>
        ))}
      </div>
    </nav>
  );
}
