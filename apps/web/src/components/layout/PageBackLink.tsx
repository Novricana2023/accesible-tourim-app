import { ChevronLeft } from "lucide-react";
import { Link } from "react-router-dom";

export function PageBackLink({ to = "/" }: { to?: string }) {
  return (
    <Link
      to={to}
      className="inline-flex min-h-12 items-center gap-1.5 text-base font-semibold text-primary no-underline underline-offset-4 [@media(hover:hover)]:hover:underline"
    >
      <ChevronLeft className="size-5 shrink-0" aria-hidden />
      Back to home
    </Link>
  );
}
