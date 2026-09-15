import { PageBackLink } from "@/components/layout/PageBackLink";
import { StatusBanner } from "@/components/layout/StatusBanner";
import { Badge, statusLabel, statusToBadgeTone } from "@/components/ui/badge";
import type { ReactNode } from "react";

export function ModeScreen({
  title,
  subtitle,
  status,
  statusText,
  children,
  actions,
}: {
  title: string;
  subtitle: string;
  status: "checking" | "ready" | "active" | "unavailable";
  statusText: string;
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="space-y-8 pb-[max(1rem,env(safe-area-inset-bottom))]">
      <div className="space-y-5">
        <PageBackLink />
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
          <div className="min-w-0 max-w-prose space-y-2">
            <h1 id="main-heading" className="text-3xl font-bold tracking-tight text-fg sm:text-4xl">
              {title}
            </h1>
            <p className="text-lg leading-relaxed text-fg-muted">{subtitle}</p>
          </div>
          {status !== "ready" ? (
            <Badge tone={statusToBadgeTone(status)}>{statusLabel(status)}</Badge>
          ) : null}
        </div>
        <StatusBanner>{statusText}</StatusBanner>
      </div>

      <div className="space-y-6">{children}</div>

      {actions ? (
        <div className="sticky bottom-0 z-10 -mx-4 max-w-[100vw] border-t border-border bg-bg/95 px-4 py-4 backdrop-blur-sm sm:static sm:mx-0 sm:max-w-none sm:border-0 sm:bg-transparent sm:p-0 sm:backdrop-blur-none">
          <div className="mx-auto flex max-w-5xl flex-col gap-3">{actions}</div>
        </div>
      ) : null}
    </div>
  );
}
