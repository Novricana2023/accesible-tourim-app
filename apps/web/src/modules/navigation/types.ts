import type {
  DepthBand,
  DetectedObject,
  HorizontalZone,
  MotionHint,
  NavigationState,
} from "@mara/shared";
import { APP_NAME } from "@/app/brand";

export type DepthSource = "bbox-area" | "depth-sensor" | "mono-depth";

export type PathObstaclePriority = "person" | "vehicle" | "large" | "other";

export type NavigationStatus = "idle" | "live";

export interface PathObstacle {
  trackId: string;
  label: string;
  confidence: number;
  zone: HorizontalZone;
  depth: DepthBand;
  motion: MotionHint;
  box: DetectedObject["box"];
  firstSeenMs: number;
  lastSeenMs: number;
  /** Reserved for a depth sensor or mono-depth model. Never spoken. */
  distanceMeters?: number | null;
  depthSource: DepthSource;
  priority: PathObstaclePriority;
}

export interface PathAssistanceState extends NavigationState {
  kind: "path-assistance";
  obstacles: PathObstacle[];
}

export const PATH_ASSISTANCE_DISCLAIMER =
  `Path assistance uses the camera and object detection. It is not collision avoidance and does not measure distance in meters. ${APP_NAME} will not say the path is safe.`;

export const PATH_ASSISTANCE_START_SPEECH =
  `Path assistance is on. This is not collision avoidance. ${APP_NAME} will not say the path is safe.`;

export const PATH_ASSISTANCE_STOP_SPEECH =
  "Path assistance is off. Continuous vision is still on.";

export const PATH_ASSISTANCE_NEEDS_VISION =
  "Path assistance needs continuous vision. Object detection did not start.";

export const PATH_ASSISTANCE_NEEDS_CAMERA =
  "Path assistance is unavailable. No camera was found on this device.";

export function emptyPathState(): PathAssistanceState {
  return {
    kind: "path-assistance",
    active: false,
    destinationLabel: "",
    nextInstruction: "",
    distanceMetersToStep: null,
    bearingDegrees: null,
    rerouteRequired: false,
    obstacles: [],
  };
}
