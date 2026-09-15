import { CameraPreview } from "@/components/CameraPreview";
import { PathAssistanceDisplay } from "@/components/PathAssistanceDisplay";
import { ModeScreen } from "@/components/modes/ModeScreen";
import { Button } from "@/components/ui/button";
import { appDocumentTitle } from "@/app/brand";
import { useMara } from "@/app/runtime";
import { useDocumentTitle } from "@/lib/useDocumentTitle";
import { navigateAvailability } from "@/lib/featureAvailability";

export function NavigatePage() {
  const {
    mode,
    capabilities,
    prefs,
    camera,
    tracks,
    detection,
    perceptionStatus,
    navigationStatus,
    pathObstacles,
    pathInstruction,
    perceptionUnavailableReason,
    startNavigation,
    stopNavigation,
    stop,
  } = useMara();
  useDocumentTitle(appDocumentTitle("Navigate"));

  const navigationRunning = navigationStatus === "live";
  const visionOn =
    mode === "assist" &&
    (perceptionStatus === "live" ||
      perceptionStatus === "paused" ||
      perceptionStatus === "loading");
  const availability = navigateAvailability({ capabilities, navigationStatus });
  const uiStatus = navigationRunning ? "active" : availability.status;

  return (
    <ModeScreen
      title="Navigate"
      subtitle="Camera path assistance from object detection. This is not collision avoidance and does not use GPS turn-by-turn routing."
      status={uiStatus}
      statusText={navStatusText(navigationRunning, pathInstruction, visionOn)}
      actions={
        <div className="flex flex-col gap-3">
          {navigationRunning ? (
            <>
              <Button
                variant="danger"
                size="large"
                onClick={() => {
                  void stopNavigation();
                }}
              >
                Stop navigation
              </Button>
              <Button
                variant="secondary"
                size="large"
                onClick={() => {
                  void stop();
                }}
              >
                Stop everything
              </Button>
            </>
          ) : (
            <Button
              variant="primary"
              size="large"
              disabled={availability.status === "unavailable" || availability.status === "checking"}
              onClick={() => {
                void startNavigation();
              }}
            >
              Start navigation
            </Button>
          )}
        </div>
      }
    >
      {navigationRunning ? (
        <>
          <PathAssistanceDisplay
            status={navigationStatus}
            obstacles={pathObstacles}
            lastInstruction={pathInstruction}
          />
          {visionOn ? (
            <CameraPreview
              service={camera}
              visualOverlay={prefs.visualOverlay}
              preferredFacingLabel="rear"
              tracks={tracks}
              detection={detection}
              perceptionStatus={perceptionStatus}
              perceptionUnavailableReason={perceptionUnavailableReason}
              userFriendly
            />
          ) : (
            <p className="text-lg text-fg-muted" role="status">
              Path assistance needs continuous vision. Start navigation from home if vision
              did not start automatically.
            </p>
          )}
        </>
      ) : (
        <p className="text-lg text-fg-muted">
          Start navigation to enable path assistance. Continuous vision will start if it is
          not already running.
        </p>
      )}
    </ModeScreen>
  );
}

function navStatusText(
  navigationRunning: boolean,
  lastInstruction: string,
  visionOn: boolean,
): string {
  if (!navigationRunning) {
    return "Navigation assistance is off.";
  }
  if (lastInstruction) {
    return lastInstruction;
  }
  if (!visionOn) {
    return "Path assistance is on, waiting for continuous vision.";
  }
  return "Path assistance is on. Listening for obstacles ahead.";
}
