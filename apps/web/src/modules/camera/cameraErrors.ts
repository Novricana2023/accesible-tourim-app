import { APP_NAME } from "@/app/brand";
import type { CameraError, CameraErrorCode } from "./types";

function errorName(error: unknown): string {
  if (error && typeof error === "object" && "name" in error) {
    return String((error as { name: string }).name);
  }
  return "";
}

export function mapCameraError(error: unknown): CameraError {
  const name = errorName(error);
  const code = codeFromName(name);
  return messageFor(code);
}

function codeFromName(name: string): CameraErrorCode {
  if (
    name === "NotAllowedError" ||
    name === "PermissionDeniedError" ||
    name === "SecurityError"
  ) {
    return "denied";
  }
  if (name === "NotFoundError" || name === "DevicesNotFoundError") {
    return "unavailable";
  }
  if (name === "OverconstrainedError" || name === "ConstraintNotSatisfiedError") {
    return "overconstrained";
  }
  if (name === "InsecureContext") {
    return "insecure";
  }
  if (name === "TrackEnded") {
    return "track-ended";
  }
  return "unknown";
}

export function messageFor(code: CameraErrorCode): CameraError {
  switch (code) {
    case "denied":
      return {
        code,
        message: "Camera permission was denied.",
        recovery:
          "Allow the camera for this site in your browser settings, then start again.",
      };
    case "unavailable":
      return {
        code,
        message: "No camera was found on this device.",
        recovery: "Connect a camera and start again.",
      };
    case "insecure":
      return {
        code,
        message: "The camera requires a secure page (HTTPS or localhost).",
        recovery: `Open ${APP_NAME} on localhost or HTTPS, then start again.`,
      };
    case "overconstrained":
      return {
        code,
        message: "This camera could not start with the saved camera choice.",
        recovery:
          "Any camera resolution works. Clear the preferred camera in Settings, try the other camera, or reload and allow camera access again.",
      };
    case "track-ended":
      return {
        code,
        message: "The camera stopped unexpectedly.",
        recovery: "Start again, or choose another camera.",
      };
    default:
      return {
        code: "unknown",
        message: "The camera could not start.",
        recovery: "Start again. If it fails, reload the page.",
      };
  }
}

export function statusFor(code: CameraErrorCode): "denied" | "unavailable" | "error" {
  if (code === "denied" || code === "insecure") {
    return "denied";
  }
  if (code === "unavailable") {
    return "unavailable";
  }
  return "error";
}
