import { CameraPreview } from "@/components/CameraPreview";
import { PathAssistanceDisplay } from "@/components/PathAssistanceDisplay";
import { ModeScreen } from "@/components/modes/ModeScreen";
import { Button } from "@/components/ui/button";
import { appDocumentTitle } from "@/app/brand";
import { useMara } from "@/app/runtime";
import { useDocumentTitle } from "@/lib/useDocumentTitle";
import { navigateAvailability } from "@/lib/featureAvailability";
import { PATH_ASSISTANCE_DISCLAIMER } from "@/modules/navigation/types";

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
    visionLoop,
    startNavigation,
    stopNavigation,
    stop,
  } = useMara();
  useDocumentTitle(appDocumentTitle("Navigation & vision"));

  const navigationRunning = navigationStatus === "live";
  const perceptionOn =
    mode === "assist" &&
    (perceptionStatus === "live" ||
      perceptionStatus === "paused" ||
      perceptionStatus === "loading");
  const availability = navigateAvailability({
    capabilities,
    mode,
    navigationStatus,
    perceptionStatus,
  });
  const uiStatus = navigationRunning || perceptionOn ? "active" : availability.status;

  return (
    <ModeScreen
      title="Navigation & vision assistance"
      subtitle={PATH_ASSISTANCE_DISCLAIMER}
      status={uiStatus}
      statusText={navStatusText(navigationRunning, pathInstruction, perceptionOn)}
      actions={
        <div className="flex flex-col gap-3">
          {navigationRunning || perceptionOn ? (
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
      {navigationRunning || perceptionOn ? (
        <>
          {navigationRunning ? (
            <PathAssistanceDisplay
              status={navigationStatus}
              obstacles={pathObstacles}
              lastInstruction={pathInstruction}
            />
          ) : null}
          {perceptionOn ? (
            <CameraPreview
              service={camera}
              visualOverlay={prefs.visualOverlay}
              preferredFacingLabel="rear"
              tracks={tracks}
              detection={detection}
              perceptionStatus={perceptionStatus}
              perceptionUnavailableReason={perceptionUnavailableReason}
              visionLoop={visionLoop}
              userFriendly
            />
          ) : (
            <p className="text-lg text-fg-muted" role="status">
              Waiting for the camera and object detection to start.
            </p>
          )}
        </>
      ) : (
        <p className="text-lg text-fg-muted">
          Start navigation to open the rear camera, detect objects in view, and hear prioritized
          guidance about people, obstacles, and other items the model can reliably see.
        </p>
      )}
    </ModeScreen>
  );
}

function navStatusText(
  navigationRunning: boolean,
  lastInstruction: string,
  perceptionOn: boolean,
): string {
  if (!navigationRunning && !perceptionOn) {
    return "Navigation and vision assistance is off.";
  }
  if (lastInstruction) {
    return lastInstruction;
  }
  if (!perceptionOn) {
    return "Starting camera and object detection.";
  }
  if (!navigationRunning) {
    return "Object detection is running. Starting path guidance.";
  }
  return "Listening for obstacles and important objects ahead.";
}
