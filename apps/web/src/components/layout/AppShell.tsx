import { LiveRegion } from "@/a11y/LiveRegion";
import { SkipLink } from "@/a11y/SkipLink";
import { ConnectivityBanner } from "@/components/pwa/ConnectivityBanner";
import { InstallPrompt } from "@/components/pwa/InstallPrompt";
import { SwUpdateBanner } from "@/components/pwa/SwUpdateBanner";
import { VoiceControl } from "@/components/VoiceControl";
import { Button } from "@/components/ui/button";
import { APP_HEADER_TITLE } from "@/app/brand";
import { useMaraSession, useMaraSpeechUi } from "@/app/runtime";
import { cn } from "@/lib/utils";
import { Bot, Settings } from "lucide-react";
import type { ReactNode } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";

const ASSIST_PATHS = new Set(["/vision", "/read", "/navigate"]);

function modeLabel(mode: "idle" | "assist" | "communicate"): string | null {
  if (mode === "assist") {
    return "Assist";
  }
  if (mode === "communicate") {
    return "Sign language";
  }
  return null;
}

export function AppShell({ children }: { children: ReactNode }) {
  const { mode, prefs, stop } = useMaraSession();
  const { assertiveMessage, politeMessage, assertiveNonce, politeNonce, lastAnnouncement } =
    useMaraSpeechUi();
  const location = useLocation();

  const liveEnabled = prefs.ttsMode === "aria-live" || prefs.ttsMode === "both";
  const showAssistVoice = ASSIST_PATHS.has(location.pathname);
  const runningLabel = modeLabel(mode);

  return (
    <div className="min-h-dvh overflow-x-hidden bg-bg text-fg">
      <SkipLink />
      <LiveRegion
        key={`assertive-${assertiveNonce}`}
        politeness="assertive"
        message={liveEnabled ? assertiveMessage : ""}
      />
      <LiveRegion
        key={`polite-${politeNonce}`}
        politeness="polite"
        message={liveEnabled ? politeMessage : ""}
      />

      <SwUpdateBanner />
      <InstallPrompt />
      <ConnectivityBanner />

      <header className="border-b border-border bg-surface pt-[max(0px,env(safe-area-inset-top))]">
        <div className="mx-auto flex max-w-5xl flex-col gap-4 px-4 py-3 ps-[max(1rem,env(safe-area-inset-left))] pe-[max(1rem,env(safe-area-inset-right))] sm:px-6 sm:py-4">
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
            <Link
              to="/"
              aria-label={`${APP_HEADER_TITLE} home`}
              className="inline-flex min-h-12 items-center gap-2 py-2 text-xl font-bold leading-tight tracking-tight text-primary no-underline sm:gap-2.5 sm:text-2xl"
            >
              <span className="text-lg leading-none sm:text-xl" aria-hidden>
                ✨
              </span>
              <span>{APP_HEADER_TITLE}</span>
              <Bot
                className="h-5 w-5 shrink-0 text-primary/90 sm:h-6 sm:w-6"
                strokeWidth={2}
                aria-hidden
              />
            </Link>
            <div className="flex flex-wrap items-center gap-2">
              {runningLabel ? (
                <span
                  className="rounded-md border border-primary/25 bg-active-bg px-3 py-2 text-sm font-semibold text-primary sm:text-base"
                  role="status"
                >
                  {runningLabel}
                </span>
              ) : null}
              <NavLink
                to="/settings"
                className={({ isActive }) =>
                  cn(
                    "inline-flex min-h-12 items-center justify-center gap-2 rounded-lg border border-border bg-surface px-4 text-base font-semibold text-fg no-underline",
                    isActive
                      ? "border-primary bg-primary-muted text-primary"
                      : "[@media(hover:hover)]:hover:bg-surface-hover",
                  )
                }
              >
                <Settings className="size-5 shrink-0" aria-hidden />
                Settings
              </NavLink>
              {mode !== "idle" ? (
                <Button
                  variant="danger"
                  disabled={false}
                  onClick={() => {
                    void stop();
                  }}
                >
                  Stop session
                </Button>
              ) : null}
            </div>
          </div>

          {showAssistVoice ? <VoiceControl /> : null}
          {location.pathname === "/sign" ? (
            <p className="text-base leading-relaxed text-fg-muted">
              Voice commands are off on this screen. Use{" "}
              <strong className="font-semibold text-fg">Start partner listening</strong> below
              for captions.
            </p>
          ) : null}
        </div>
      </header>

      <main
        id="main-content"
        className="mx-auto max-w-5xl px-4 py-8 ps-[max(1rem,env(safe-area-inset-left))] pe-[max(1rem,env(safe-area-inset-right))] sm:px-6 sm:py-10"
      >
        {children}
      </main>

      {lastAnnouncement ? (
        <footer className="border-t border-border bg-surface-inset pb-[max(1rem,env(safe-area-inset-bottom))]">
          <div className="mx-auto max-w-5xl px-4 py-4 sm:px-6">
            <p className="text-sm font-semibold text-fg-muted">Last spoken</p>
            <p className="mt-1 text-lg leading-relaxed text-fg" aria-live="off">
              {lastAnnouncement}
            </p>
          </div>
        </footer>
      ) : null}
    </div>
  );
}
