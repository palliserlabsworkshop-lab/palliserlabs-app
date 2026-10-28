import { statusKind, type StatusKind } from "@/lib/status";

/** Status colours — one colour per meaning, always paired with a text label. */
export const STATUS_STYLES: Record<StatusKind, { chip: string; rail: string; label?: string }> = {
  queued: { chip: "bg-yellow/25 text-yellow-ink", rail: "bg-yellow", label: "Queued" },
  in_progress: { chip: "bg-accent/15 text-accent-ink", rail: "bg-accent", label: "In Progress" },
  done: { chip: "bg-primary/10 text-primary-ink", rail: "bg-primary", label: "Done" },
  other: { chip: "bg-surface text-muted", rail: "bg-line" },
};

export function StatusChip({ status, done, size = "sm" }: { status: string; done?: boolean; size?: "sm" | "md" }) {
  const kind = statusKind(status, done);
  const style = STATUS_STYLES[kind];
  const text = style.label ?? status;
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full font-bold ${style.chip} ${
        size === "md" ? "px-3 py-1 text-[0.75rem]" : "px-2 py-0.5 text-[0.66rem] tracking-wide"
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${style.rail}`} aria-hidden />
      {text}
    </span>
  );
}
