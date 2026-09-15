export type CameraStatus =
  | "idle"
  | "requesting"
  | "live"
  | "denied"
  | "unavailable"
  | "error";

export type FacingMode = "environment" | "user";

export interface CameraRequestOptions {
  facingMode: FacingMode;
  width: number;
  height: number;
  fps: number;
  deviceId?: string;
}

export type CameraErrorCode =
  | "denied"
  | "unavailable"
  | "insecure"
  | "overconstrained"
  | "track-ended"
  | "unknown";

export interface CameraError {
  code: CameraErrorCode;
  message: string;
  recovery: string;
}

export interface CameraDeviceInfo {
  deviceId: string;
  label: string;
  facing: FacingMode | "unknown";
}

export interface FrameEcho {
  frameId: number;
  timestampMs: number;
  meanLuma: number;
}

export type CameraStatusListener = (
  status: CameraStatus,
  error: CameraError | null,
) => void;
