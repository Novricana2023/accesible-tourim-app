import { memo } from "react";
import type { DetectedObject, DetectionResult } from "@mara/shared";
import { DetectionBoxes, TrackList } from "@/components/DetectionOverlay";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useCamera } from "@/modules/camera/useCamera";
import type { CameraService } from "@/modules/camera/CameraService";
import type {
  PerceptionStatus,
  VisionLoopState,
} from "@/modules/perception/PerceptionRuntime";

export const CameraPreview = memo(function CameraPreview({
  service,
  visualOverlay,
  preferredFacingLabel,
  tracks,
  detection,
  perceptionStatus,
  visionLoop,
  perceptionUnavailableReason,
  userFriendly = false,
}: {
  service: CameraService;
  visualOverlay: boolean;
  preferredFacingLabel: string;
  tracks?: DetectedObject[];
  detection?: DetectionResult | null;
  perceptionStatus?: PerceptionStatus;
  visionLoop?: VisionLoopState | null;
  perceptionUnavailableReason?: string | null;
  userFriendly?: boolean;
}) {
  const {
    status,
    error,
    devices,
    previewRef,
    facingMode,
    deviceId,
    switchFacing,
    selectDevice,
  } = useCamera(service, { stopOnUnmount: false });

  const currentTracks = tracks ?? [];
  const currentDetection = detection ?? null;
  const currentPerception = perceptionStatus ?? "idle";
  const labeledDevices = devices.filter((device) => device.deviceId);
  const showDeviceSelect = labeledDevices.length > 1;
  const otherFacing = facingMode === "user" ? "rear" : "front";

  return (
    <section
      aria-labelledby="camera-heading"
      className="space-y-4 rounded-lg border border-border bg-surface p-4 sm:p-5"
    >
      <h2 id="camera-heading" className="text-xl font-bold">
        Camera
      </h2>

      <p className="text-lg font-bold" role="status">
        {statusLabel(status, preferredFacingLabel)}
      </p>

      {error ? (
        <div
          className="space-y-2 rounded-lg border border-danger-border bg-danger-bg px-4 py-3"
          role="alert"
        >
          <p className="text-lg">{error.message}</p>
          <p className="text-base text-fg-muted">{error.recovery}</p>
        </div>
      ) : null}

      {status === "live" ? (
        <div className="space-y-3">
          <div className="relative w-full overflow-hidden rounded-lg bg-surface-inset">
            <video
              ref={previewRef}
              className="h-auto max-h-[70dvh] w-full object-contain"
              muted
              playsInline
              autoPlay
              aria-hidden={visualOverlay ? undefined : true}
              aria-label={visualOverlay ? "Live camera preview" : undefined}
            />
            <DetectionBoxes tracks={currentTracks} enabled={visualOverlay} />
          </div>
          <p className="text-base text-fg-muted">
            {perceptionMessage(
              currentPerception,
              currentDetection,
              currentTracks.length,
              visionLoop ?? null,
              perceptionUnavailableReason ?? null,
              userFriendly,
            )}
          </p>
          {visualOverlay ? <TrackList tracks={currentTracks} /> : null}
        </div>
      ) : null}

      {status === "live" || status === "error" ? (
        <div className="flex flex-col gap-3 sm:flex-row">
          <Button
            variant="secondary"
            onClick={() => {
              void switchFacing();
            }}
          >
            Use {otherFacing} camera
          </Button>
        </div>
      ) : null}

      {showDeviceSelect && (status === "live" || status === "error") ? (
        <div className="space-y-2">
          <Label htmlFor="camera-device">Camera</Label>
          <select
            id="camera-device"
            className="min-h-12 w-full rounded-lg border border-border bg-surface px-4 text-lg text-fg"
            value={deviceId ?? ""}
            onChange={(event) => {
              if (event.target.value) {
                void selectDevice(event.target.value);
              }
            }}
          >
            <option value="">Default for this facing mode</option>
            {labeledDevices.map((device) => (
              <option key={device.deviceId} value={device.deviceId}>
                {device.label}
              </option>
            ))}
          </select>
        </div>
      ) : null}
    </section>
  );
});

function statusLabel(
  status: ReturnType<typeof useCamera>["status"],
  preferredFacingLabel: string,
): string {
  switch (status) {
    case "requesting":
      return `Requesting the ${preferredFacingLabel} camera.`;
    case "live":
      return "Camera is live.";
    case "denied":
      return "Camera permission was denied.";
    case "unavailable":
      return "No camera is available.";
    case "error":
      return "The camera reported an error.";
    default:
      return "Camera is off.";
  }
}

function perceptionMessage(
  status: PerceptionStatus,
  result: DetectionResult | null,
  count: number,
  loop: VisionLoopState | null,
  unavailableReason: string | null,
  userFriendly: boolean,
): string {
  if (status === "loading") {
    return "Loading the object detector.";
  }
  if (status === "unavailable") {
    return unavailableReason ?? "Object detection is unavailable.";
  }
  if (status === "paused") {
    return "Continuous vision is paused. The tab is in the background.";
  }
  if (status === "live" && result) {
    if (userFriendly) {
      if (count === 0) {
        return "Analyzing the scene.";
      }
      return `${count} ${count === 1 ? "object" : "objects"} detected in view.`;
    }
    const size = result.inputSize ?? loop?.inputSize;
    const sizeNote = size ? ` Input ${size}.` : "";
    const fpsNote =
      loop && Number.isFinite(loop.targetFps)
        ? ` About ${loop.targetFps.toFixed(1)} detections per second.`
        : "";
    const saveNote = loop?.powerSave ? " Power-save quality is on." : "";
    return `Continuous vision is running (${result.backend}). Last inference ${Math.round(result.inferenceMs)} ms. ${count} ${count === 1 ? "object" : "objects"} above threshold.${sizeNote}${fpsNote}${saveNote}`;
  }
  if (status === "live") {
    return "Continuous vision is running. Waiting for the first inference.";
  }
  return "Object detection is off.";
}
