import { applyAccessibilityPrefs } from "@/lib/prefs/applyAccessibilityPrefs";
import { useMaraSession } from "@/app/runtime";
import type { ReactNode } from "react";
import { useEffect } from "react";

export function AccessibilityRoot({ children }: { children: ReactNode }) {
  const { prefs } = useMaraSession();

  useEffect(() => {
    applyAccessibilityPrefs(prefs);
  }, [prefs]);

  return children;
}
