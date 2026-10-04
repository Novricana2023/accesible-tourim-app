import { useEffect, useState } from "react";
import {
  collectRuntimeDiagnostics,
  type RuntimeDiagnosticsSnapshot,
} from "@/lib/diagnostics/collectRuntimeDiagnostics";
import { useMara } from "@/app/runtime";

const STORAGE_KEY = "tafsiri:show-diagnostics";

export function useDiagnosticsEnabled(): boolean {
  const [enabled, setEnabled] = useState(() => {
    if (typeof window === "undefined") {
      return false;
    }
    if (window.location.search.includes("debug=1")) {
      return true;
    }
    return sessionStorage.getItem(STORAGE_KEY) === "1";
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("debug") === "1") {
      sessionStorage.setItem(STORAGE_KEY, "1");
      setEnabled(true);
    }
  }, []);

  return enabled;
}

export function DiagnosticsPanel() {
  const enabled = useDiagnosticsEnabled();
  const {
    camera,
    signView,
    perceptionStatus,
    perceptionUnavailableReason,
    cameraStatus,
  } = useMara();
  const [snapshot, setSnapshot] = useState<RuntimeDiagnosticsSnapshot | null>(null);

  useEffect(() => {
    if (!enabled) {
      return;
    }
    const tick = () => {
      setSnapshot(
        collectRuntimeDiagnostics({
          camera,
          signView,
          perceptionStatus,
          perceptionUnavailable: perceptionUnavailableReason,
          speaking:
            typeof window !== "undefined" &&
            "speechSynthesis" in window &&
            window.speechSynthesis.speaking,
        }),
      );
    };
    tick();
    const id = window.setInterval(tick, 1500);
    return () => window.clearInterval(id);
  }, [
    enabled,
    camera,
    signView,
    perceptionStatus,
    perceptionUnavailableReason,
    cameraStatus,
  ]);

  if (!enabled || !snapshot) {
    return null;
  }

  return (
    <section
      className="mt-6 space-y-3 rounded-lg border border-dashed border-border bg-surface-inset p-4 font-mono text-xs text-fg-muted"
      aria-label="Developer diagnostics"
    >
      <h2 className="text-sm font-bold text-fg">Developer diagnostics</h2>
      <p>Add ?debug=1 to the URL to keep this panel visible this session.</p>
      <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-all">
        {JSON.stringify(snapshot, null, 2)}
      </pre>
    </section>
  );
}
