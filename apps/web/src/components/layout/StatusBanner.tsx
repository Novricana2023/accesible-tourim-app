import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

export function StatusBanner({
  children,
  tone = "neutral",
  className,
}: {
  children: ReactNode;
  tone?: "neutral" | "note" | "warning";
  className?: string;
}) {
  return (
    <p
      role="status"
      className={cn(
        "border-s-4 px-4 py-3 text-base leading-relaxed text-fg",
        tone === "neutral" && "border-primary bg-surface-inset",
        tone === "note" && "border-accent bg-accent-muted",
        tone === "warning" && "border-warning bg-warning-bg text-fg",
        className,
      )}
    >
      {children}
    </p>
  );
}
