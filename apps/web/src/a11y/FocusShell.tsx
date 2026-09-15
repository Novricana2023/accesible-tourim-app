import { useEffect, type ReactNode } from "react";
import { useLocation } from "react-router-dom";

export function FocusShell({ children }: { children: ReactNode }) {
  const location = useLocation();

  useEffect(() => {
    const heading = document.getElementById("main-heading");
    if (heading instanceof HTMLElement) {
      heading.tabIndex = -1;
      heading.focus();
    }
  }, [location.pathname]);

  return <>{children}</>;
}
