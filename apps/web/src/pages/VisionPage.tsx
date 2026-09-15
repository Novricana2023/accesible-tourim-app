import { CameraPreview } from "@/components/CameraPreview";
import { ModeScreen } from "@/components/modes/ModeScreen";
import { ProcessingState } from "@/components/modes/ProcessingState";
import { SpeechRateControl } from "@/components/modes/SpeechRateControl";
import { Button } from "@/components/ui/button";
import { appDocumentTitle } from "@/app/brand";
import { useMara } from "@/app/runtime";
import { useDocumentTitle } from "@/lib/useDocumentTitle";
import { visionAvailability } from "@/lib/featureAvailability";

export function VisionPage() {
  const {
    mode,
    capabilities,
    prefs,
    updatePrefs,
    camera,
    cameraStatus,
    tracks,
    detection,
    perceptionStatus,
    visionLoop,
    perceptionUnavailableReason,
    startVision,
    stop,
  } = useMara();
  useDocumentTitle(appDocumentTitle("Vision"));

  const active = mode === "assist";
  const visionRunning =
    active &&
    (perceptionStatus === "live" ||
      perceptionStatus === "paused" ||
      perceptionStatus === "loading");
  const availability = visionAvailability({ capabilities, mode, perceptionStatus });
  const uiStatus = visionRunning ? "active" : availability.status;

  return (
    <ModeScreen
      title="Vision"
      subtitle="Continuous environmental assistance using the rear camera and on-device object detection."
      status={uiStatus}
      statusText={visionStatusText(
        active,
        perceptionStatus,
        cameraStatus,
        perceptionUnavailableReason,
        tracks.length,
      )}
      actions={
        <div className="flex flex-col gap-3">
          {!visionRunning ? (
            <Button
              variant="primary"
              size="large"
              disabled={availability.status === "unavailable"}
              onClick={() => {
                void startVision();
              }}
            >
              Start vision
            </Button>
          ) : (
            <Button
              variant="danger"
              size="large"
              onClick={() => {
                void stop();
              }}
            >
              Stop vision
            </Button>
          )}
        </div>
      }
    >
      {perceptionStatus === "loading" ? (
        <ProcessingState label="Loading object detection." />
      ) : null}

      {active ? (
        <CameraPreview
          service={camera}
          visualOverlay={prefs.visualOverlay}
          preferredFacingLabel="rear"
          tracks={tracks}
          detection={detection}
          perceptionStatus={perceptionStatus}
          visionLoop={visionLoop}
          perceptionUnavailableReason={perceptionUnavailableReason}
          userFriendly
        />
      ) : (
        <p className="text-lg text-fg-muted">
          Start vision to open the camera and begin continuous assistance.
        </p>
      )}

      <SpeechRateControl
        rate={prefs.speechRate}
        onChange={(rate) => {
          void updatePrefs({ speechRate: rate });
        }}
      />
    </ModeScreen>
  );
}

function visionStatusText(
  active: boolean,
  perceptionStatus: string,
  cameraStatus: string,
  unavailableReason: string | null,
  objectCount: number,
): string {
  if (!active) {
    return "Vision is not running.";
  }
  if (perceptionStatus === "loading") {
    return "Starting continuous vision.";
  }
  if (perceptionStatus === "unavailable") {
    return unavailableReason ?? "Object detection is unavailable.";
  }
  if (perceptionStatus === "paused") {
    return "Vision is paused while the tab is in the background.";
  }
  if (perceptionStatus === "live" && cameraStatus === "live") {
    if (objectCount === 0) {
      return "Vision is active. No notable objects in view right now.";
    }
    return `Vision is active. ${objectCount} ${objectCount === 1 ? "object" : "objects"} in view.`;
  }
  return "Waiting for the camera.";
}
