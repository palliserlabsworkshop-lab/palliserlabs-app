import type { Task } from "@/lib/notion";
import { projectSteps } from "@/lib/review";
import { taskDisplay } from "@/lib/stage";
import { STATUS_STYLES } from "./StatusChip";

/**
 * Small progress line for a project: Script → Footage → Editing → Review → Done.
 * Thin capsules filled up to the current step in the project's own status colour
 * (matching its chip and side bar), with the step named underneath.
 */
export function ProjectSteps({ task, size = "sm" }: { task: Task; size?: "sm" | "md" }) {
  const progress = projectSteps(task);
  if (!progress) return null;
  const { steps, current } = progress;
  const tone = STATUS_STYLES[taskDisplay(task).kind].rail;
  const finished = steps[current] === "Done";
  const filled = (i: number) => finished || i <= current;

  return (
    <div className={size === "md" ? "max-w-sm" : ""}>
      <div
        className={`flex ${size === "md" ? "gap-1.5" : "gap-[3px]"}`}
        role="img"
        aria-label={`Step ${current + 1} of ${steps.length}: ${steps[current]}. Steps: ${steps.join(", ")}.`}
      >
        {steps.map((step, i) => (
          <span
            key={step}
            className={`flex-1 rounded-full transition-colors duration-500 ${size === "md" ? "h-1.5" : "h-[3px]"} ${
              filled(i) ? tone : "bg-foreground/[0.08]"
            }`}
          />
        ))}
      </div>
      {size === "md" ? (
        <ol className="mt-2.5 flex justify-between gap-1 text-[0.7rem]">
          {steps.map((step, i) => (
            <li key={step} className={i === current ? "font-bold text-foreground" : filled(i) ? "text-foreground/70" : "text-muted/70"}>
              {step}
            </li>
          ))}
        </ol>
      ) : (
        <p className="mt-1.5 flex items-baseline justify-between gap-2 text-[0.68rem]">
          <span className="font-bold text-foreground">{steps[current]}</span>
          <span className="tabular-nums text-muted">
            {current + 1} of {steps.length}
          </span>
        </p>
      )}
    </div>
  );
}
