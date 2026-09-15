import { CameraPreview } from "@/components/CameraPreview";
import { ReadingDisplay } from "@/components/ReadingDisplay";
import { ModeScreen } from "@/components/modes/ModeScreen";
import { ProcessingState } from "@/components/modes/ProcessingState";
import { Button } from "@/components/ui/button";
import { APP_NAME, appDocumentTitle } from "@/app/brand";
import { useMara } from "@/app/runtime";
import { useDocumentTitle } from "@/lib/useDocumentTitle";
import { readAvailability } from "@/lib/featureAvailability";

export function ReadPage() {
  const {
    mode,
    capabilities,
    prefs,
    camera,
    cameraStatus,
    ocrStatus,
    ocrResult,
    ocrAssetsOk,
    ocrAssetsReason,
    ocrUnavailableReason,
    startReading,
    stopReading,
    stop,
  } = useMara();
  useDocumentTitle(appDocumentTitle("Read"));

  const readingRunning =
    ocrStatus === "live" || ocrStatus === "paused" || ocrStatus === "loading";
  const active = mode === "assist" && readingRunning;
  const availability = readAvailability({
    capabilities,
    prefs,
    ocrStatus,
    ocrAssetsOk,
    ocrAssetsReason,
  });
  const uiStatus = readingRunning ? "active" : availability.status;

  return (
    <ModeScreen
      title="Read"
      subtitle={`Point the rear camera at printed text. ${APP_NAME} reads stable text aloud using on-device OCR.`}
      status={uiStatus}
      statusText={readStatusText(ocrStatus, ocrUnavailableReason, active)}
      actions={
        <div className="flex flex-col gap-3">
          {readingRunning ? (
            <>
              <Button
                variant="danger"
                size="large"
                onClick={() => {
                  void stopReading();
                }}
              >
                Stop reading
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
                void startReading();
              }}
            >
              Start reading
            </Button>
          )}
        </div>
      }
    >
      {ocrStatus === "loading" ? <ProcessingState label="Starting the reading engine." /> : null}

      {active || cameraStatus === "live" ? (
        <CameraPreview
          service={camera}
          visualOverlay={false}
          preferredFacingLabel="rear"
          userFriendly
        />
      ) : null}

      {readingRunning || ocrStatus === "unavailable" ? (
        <ReadingDisplay
          status={ocrStatus}
          result={ocrResult}
          unavailableReason={ocrUnavailableReason}
        />
      ) : (
        <p className="text-lg text-fg-muted">
          Start reading to capture text from the camera. Reading is slower than object
          detection.
        </p>
      )}
    </ModeScreen>
  );
}

function readStatusText(
  ocrStatus: string,
  unavailableReason: string | null,
  active: boolean,
): string {
  if (ocrStatus === "loading") {
    return "Starting reading.";
  }
  if (ocrStatus === "unavailable") {
    return unavailableReason ?? "Reading is unavailable.";
  }
  if (ocrStatus === "paused") {
    return "Reading is paused.";
  }
  if (active) {
    return "Reading is active. Hold steady on printed text.";
  }
  return "Reading is not running.";
}
