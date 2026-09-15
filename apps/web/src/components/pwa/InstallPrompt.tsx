import { APP_NAME } from "@/app/brand";
import { Button } from "@/components/ui/button";
import { Download, X } from "lucide-react";
import { useEffect, useState } from "react";

const DISMISS_KEY = "inclusive-tourism-pwa-install-dismissed";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

function isStandalone(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [hidden, setHidden] = useState(true);

  useEffect(() => {
    if (isStandalone()) {
      return;
    }
    if (localStorage.getItem(DISMISS_KEY) === "1") {
      return;
    }

    const onPrompt = (event: Event) => {
      event.preventDefault();
      setDeferred(event as BeforeInstallPromptEvent);
      setHidden(false);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  if (hidden || !deferred) {
    return null;
  }

  return (
    <div className="border-b border-border bg-primary-muted px-4 py-4">
      <div className="mx-auto flex max-w-5xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 space-y-1">
          <p className="text-lg font-semibold text-fg">Install {APP_NAME}</p>
          <p className="text-base text-fg-muted">
            Add this app to your home screen for quick access. Works from any HTTPS URL; large
            AI models download separately when you first use each feature.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Button
            variant="primary"
            onClick={() => {
              void deferred.prompt().then(() => {
                setHidden(true);
                setDeferred(null);
              });
            }}
          >
            <Download className="size-5" aria-hidden />
            Install app
          </Button>
          <Button
            variant="secondary"
            aria-label="Dismiss install suggestion"
            onClick={() => {
              localStorage.setItem(DISMISS_KEY, "1");
              setHidden(true);
            }}
          >
            <X className="size-5" aria-hidden />
            Not now
          </Button>
        </div>
      </div>
    </div>
  );
}
