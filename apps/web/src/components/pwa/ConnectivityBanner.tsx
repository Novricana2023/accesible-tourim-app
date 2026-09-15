import { describeOfflineAiLimits, probeLocalAiReadiness } from "@/lib/pwa/localAiReadiness";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";
import { useMaraSession } from "@/app/runtime";
import { WifiOff } from "lucide-react";
import { useEffect, useState } from "react";

export function ConnectivityBanner() {
  const { online } = useNetworkStatus();
  const { capabilities, prefs } = useMaraSession();
  const [lines, setLines] = useState<string[] | null>(null);

  useEffect(() => {
    if (online) {
      setLines(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      const readiness = await probeLocalAiReadiness(prefs.signPackId ?? "asl");
      if (cancelled) {
        return;
      }
      setLines(
        describeOfflineAiLimits(readiness, {
          speechRecognition: capabilities?.available["speech-recognition"] ?? false,
        }),
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [online, capabilities, prefs.signPackId]);

  if (online) {
    return null;
  }

  return (
    <div
      className="border-b border-warning-border bg-warning-bg px-4 py-4 text-fg"
      role="status"
      aria-live="polite"
    >
      <div className="mx-auto flex max-w-5xl gap-3">
        <WifiOff className="mt-0.5 size-6 shrink-0 text-warning" aria-hidden />
        <div className="min-w-0 space-y-2">
          <p className="text-lg font-semibold">You are offline</p>
          <p className="text-base leading-relaxed text-fg-muted">
            The installed app shell still opens. Camera and microphone access still follow
            your browser rules on this device.
          </p>
          {lines ? (
            <ul className="list-disc space-y-1.5 ps-5 text-base leading-relaxed text-fg-muted">
              {lines.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          ) : (
            <p className="text-base text-fg-muted">Checking which AI assets are on this device…</p>
          )}
        </div>
      </div>
    </div>
  );
}
