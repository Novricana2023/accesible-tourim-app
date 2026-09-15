import { cva, type VariantProps } from "class-variance-authority";
import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1 text-sm font-semibold",
  {
    variants: {
      tone: {
        ready: "border border-success-border bg-success-bg text-success",
        active: "border border-primary bg-primary-muted text-primary",
        unavailable: "border border-border bg-surface-inset text-fg-muted",
        checking: "border border-warning-border bg-warning-bg text-warning",
        neutral: "border border-border bg-surface-inset text-fg-muted",
      },
    },
    defaultVariants: {
      tone: "neutral",
    },
  },
);

export interface BadgeProps
  extends HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, tone, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}

export function statusToBadgeTone(
  status: "checking" | "ready" | "active" | "unavailable",
): NonNullable<BadgeProps["tone"]> {
  if (status === "checking") {
    return "checking";
  }
  if (status === "ready") {
    return "ready";
  }
  if (status === "active") {
    return "active";
  }
  return "unavailable";
}

export function statusLabel(status: "checking" | "ready" | "active" | "unavailable"): string {
  switch (status) {
    case "checking":
      return "Checking";
    case "ready":
      return "Ready";
    case "active":
      return "Active";
    case "unavailable":
      return "Unavailable";
  }
}
