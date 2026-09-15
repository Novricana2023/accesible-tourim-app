import { Loader2 } from "lucide-react";

export function ProcessingState({ label }: { label: string }) {
  return (
    <p className="flex items-center gap-2 text-lg text-fg-muted" role="status">
      <Loader2 className="size-5 animate-spin text-primary" aria-hidden />
      {label}
    </p>
  );
}
