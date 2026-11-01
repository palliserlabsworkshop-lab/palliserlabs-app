import type { Task } from "@/lib/notion";
import { projectSteps } from "@/lib/review";

/**
 * Small progress line for a project: Script → Footage → Editing → Review → Done.
 * One rounded segment per step, filled up to where the project is, with the current step named.
 */
export function ProjectSteps({ task, size = "sm" }: { task: Task; size?: "sm" | "md" }) {
  const progress = projectSteps(task);
  if (!progress) return null;
  const { steps, current } = progress;
  const finished = steps[current] === "Done";
  return (
    <div className={size === "md" ? "max-w-sm" : ""}>
      <div
        className="flex gap-1"
        role="img"
        aria-label={`Step ${current + 1} of ${steps.length}: ${steps[current]}. Steps: ${steps.join(", ")}.`}
      >
        {steps.map((step, i) => (
          <span
            key={step}
            className={`h-1 flex-1 rounded-full ${
              i < current || finished ? "bg-primary" : i === current ? "bg-foreground" : "bg-line"
            } ${size === "md" ? "h-1.5" : ""}`}
          />
        ))}
      </div>
      {size === "md" ? (
        <ol className="mt-2 flex justify-between gap-1 text-[0.7rem] font-bold">
          {steps.map((step, i) => (
            <li key={step} className={i === current ? "text-foreground" : i < current || finished ? "text-primary-ink" : "text-muted"}>
              {i < current || finished ? "✓ " : ""}
              {step}
            </li>
          ))}
        </ol>
      ) : (
        <p className="mt-1.5 text-[0.66rem] text-muted">
          <span className="font-bold text-foreground">{steps[current]}</span> · {current + 1} of {steps.length}
        </p>
      )}
    </div>
  );
}
