import type { DetectionInputSize } from "@/modules/perception/adaptiveScheduler";

export type DeviceClass = "desktop" | "mobile";
export type FormFactor = "phone" | "tablet" | "desktop";

export interface DevicePerfProfile {
  class: DeviceClass;
  formFactor: FormFactor;
  ios: boolean;
  android: boolean;
  captureWidth: number;
  captureHeight: number;
  captureFps: number;
  communicateFps: number;
  startingInputSize: DetectionInputSize;
  uiHz: number;
  signFps: number;
  ocrFps: number;
  hardwareConcurrency: number;
  deviceMemoryGiB: number | null;
  constrained: boolean;
}

export interface DeviceHints {
  userAgent?: string;
  platform?: string;
  maxTouchPoints?: number;
  hardwareConcurrency?: number;
  deviceMemory?: number;
  coarsePointer?: boolean;
  minScreenEdge?: number;
}

const DESKTOP: DevicePerfProfile = {
  class: "desktop",
  formFactor: "desktop",
  ios: false,
  android: false,
  captureWidth: 1280,
  captureHeight: 720,
  captureFps: 24,
  communicateFps: 24,
  startingInputSize: 640,
  uiHz: 8,
  signFps: 16,
  ocrFps: 1.5,
  hardwareConcurrency: 8,
  deviceMemoryGiB: null,
  constrained: false,
};

export function probeDeviceProfile(hints: DeviceHints = {}): DevicePerfProfile {
  const userAgent =
    hints.userAgent ??
    (typeof navigator !== "undefined" ? navigator.userAgent : "");
  const platform =
    hints.platform ??
    (typeof navigator !== "undefined" ? navigator.platform : "");
  const maxTouchPoints =
    hints.maxTouchPoints ??
    (typeof navigator !== "undefined" ? navigator.maxTouchPoints : 0);
  const hardwareConcurrency =
    hints.hardwareConcurrency ??
    (typeof navigator !== "undefined" ? navigator.hardwareConcurrency || 4 : 4);
  const deviceMemory =
    hints.deviceMemory ??
    (typeof navigator !== "undefined"
      ? (navigator as Navigator & { deviceMemory?: number }).deviceMemory
      : undefined);
  const coarsePointer =
    hints.coarsePointer ??
    (typeof window !== "undefined" && typeof window.matchMedia === "function"
      ? window.matchMedia("(pointer: coarse)").matches
      : false);
  const minScreenEdge =
    hints.minScreenEdge ??
    (typeof window !== "undefined"
      ? Math.min(window.screen.width || 0, window.screen.height || 0)
      : 0);

  const ios =
    /iPad|iPhone|iPod/.test(userAgent) ||
    (platform === "MacIntel" && maxTouchPoints > 1);
  const android = /Android/i.test(userAgent);
  const tablet =
    (ios && /iPad/.test(userAgent)) ||
    (android && /Tablet|Pad/i.test(userAgent)) ||
    (coarsePointer && minScreenEdge >= 600 && !/Mobile/i.test(userAgent));
  const mobileUa = ios || android || /Mobi|Mobile/i.test(userAgent);
  const mobile = mobileUa || (coarsePointer && (deviceMemory !== undefined && deviceMemory <= 4));

  if (!mobile) {
    return {
      ...DESKTOP,
      hardwareConcurrency,
      deviceMemoryGiB: deviceMemory ?? null,
    };
  }

  const constrained =
    ios ||
    (deviceMemory !== undefined && deviceMemory <= 4) ||
    hardwareConcurrency <= 4;
  const phone = !tablet;

  return {
    class: "mobile",
    formFactor: tablet ? "tablet" : phone ? "phone" : "tablet",
    ios,
    android,
    captureWidth: constrained ? 960 : 1280,
    captureHeight: constrained ? 720 : 720,
    captureFps: constrained ? 12 : 15,
    communicateFps: constrained ? 12 : 16,
    startingInputSize: constrained ? 320 : 416,
    uiHz: constrained ? 5 : 6,
    signFps: constrained ? 8 : 12,
    ocrFps: 1,
    hardwareConcurrency,
    deviceMemoryGiB: deviceMemory ?? null,
    constrained,
  };
}

export function cameraRequestFor(
  mode: "assist" | "communicate",
  profile: DevicePerfProfile,
): {
  facingMode: "environment" | "user";
  width: number;
  height: number;
  fps: number;
} {
  return {
    facingMode: mode === "communicate" ? "user" : "environment",
    width: profile.captureWidth,
    height: profile.captureHeight,
    fps: mode === "communicate" ? profile.communicateFps : profile.captureFps,
  };
}
