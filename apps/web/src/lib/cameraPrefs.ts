import type { UserPrefs } from "@mara/shared";
import type { CameraRequestOptions } from "@/modules/camera/types";
import { cameraRequestFor, type DevicePerfProfile } from "@/lib/deviceProfile";

export function cameraRequestWithPrefs(
  mode: "assist" | "communicate",
  profile: DevicePerfProfile,
  prefs: UserPrefs,
): CameraRequestOptions {
  const base = cameraRequestFor(mode, profile);
  const facingMode =
    mode === "communicate" ? "user" : prefs.preferredCameraFacingAssist;
  return {
    facingMode,
    width: base.width,
    height: base.height,
    fps: base.fps,
    deviceId: prefs.preferredCameraDeviceId ?? undefined,
  };
}
