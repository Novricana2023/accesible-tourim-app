import type { NavigationStatus, PathObstacle } from "@/modules/navigation";
import { PATH_ASSISTANCE_DISCLAIMER } from "@/modules/navigation";
import { Compass } from "lucide-react";

export function PathAssistanceDisplay({
  status,
  obstacles,
  lastInstruction,
}: {
  status: NavigationStatus;
  obstacles: PathObstacle[];
  lastInstruction: string;
}) {
  if (status === "idle") {
    return null;
  }

  return (
    <section
      aria-labelledby="path-heading"
      className="space-y-4 rounded-lg border border-border bg-surface p-4 sm:p-5"
    >
      <div className="flex items-center gap-3">
        <Compass className="size-6 text-primary" aria-hidden />
        <h2 id="path-heading" className="text-xl font-bold">
          Path assistance
        </h2>
      </div>
      <p className="max-w-prose text-base leading-relaxed text-fg-muted" role="note">
        {PATH_ASSISTANCE_DISCLAIMER}
      </p>
      <div className="border-s-4 border-primary bg-surface-inset px-4 py-4">
        <p className="text-sm font-semibold text-fg-muted">Current cue</p>
        <p className="mt-2 text-2xl font-bold leading-snug text-fg sm:text-3xl" role="status">
          {lastInstruction ||
            "No path cue yet. Silence does not mean the path is safe."}
        </p>
      </div>
      {obstacles.length > 0 ? (
        <ul className="space-y-2" aria-label="Obstacles in view">
          {obstacles.slice(0, 5).map((obstacle) => (
            <li
              key={obstacle.trackId}
              className="rounded-lg border border-border bg-surface-inset px-4 py-2 text-lg"
            >
              {obstacle.label}: {obstacle.zone}, {obstacle.depth}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-lg text-fg-muted">No path-relevant obstacles in the current view.</p>
      )}
    </section>
  );
}
