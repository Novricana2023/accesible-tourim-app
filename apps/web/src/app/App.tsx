import { FocusShell } from "@/a11y/FocusShell";
import { AccessibilityRoot } from "@/components/AccessibilityRoot";
import { AppShell } from "@/components/layout/AppShell";
import { AppRoutes } from "@/app/routes";
import { MaraRuntimeProvider } from "@/app/runtime";

export function App() {
  return (
    <MaraRuntimeProvider>
      <AccessibilityRoot>
        <FocusShell>
          <AppShell>
            <AppRoutes />
          </AppShell>
        </FocusShell>
      </AccessibilityRoot>
    </MaraRuntimeProvider>
  );
}
