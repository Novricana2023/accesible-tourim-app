import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Card({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-lg border border-border bg-surface",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  className,
  children,
  icon,
  imageSrc,
  imageAlt,
}: {
  className?: string;
  children: ReactNode;
  icon?: ReactNode;
  imageSrc?: string;
  imageAlt?: string;
}) {
  return (
    <div className={cn("flex gap-4 border-b border-border px-5 py-4", className)}>
      {imageSrc ? (
        <img
          src={imageSrc}
          alt={imageAlt ?? ""}
          width={72}
          height={72}
          className="size-[4.5rem] shrink-0 rounded-lg object-cover"
        />
      ) : icon ? (
        <div
          className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-primary-muted text-primary"
          aria-hidden
        >
          {icon}
        </div>
      ) : null}
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

export function CardBody({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("px-5 py-4", className)}>{children}</div>;
}
