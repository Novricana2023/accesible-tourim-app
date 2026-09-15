export type DetectionInputSize = 320 | 416 | 640;
export type PerformanceProfile = "balanced" | "power-save";
export type DeviceClass = "desktop" | "mobile";

export interface FpsLimits {
  maxFps: number;
  minIntervalMs: number;
  maxIntervalMs: number;
}

export function detectionIntervalMs(inferMs: number, minIntervalMs: number): number {
  const infer = Number.isFinite(inferMs) && inferMs > 0 ? inferMs : 0;
  return Math.max(minIntervalMs, infer * 1.2);
}

export function clampIntervalMs(intervalMs: number, maxIntervalMs: number): number {
  return Math.min(maxIntervalMs, intervalMs);
}

export function fpsFromInterval(intervalMs: number): number {
  if (!Number.isFinite(intervalMs) || intervalMs <= 0) {
    return 1;
  }
  return 1000 / intervalMs;
}

export function profileFpsLimits(
  profile: PerformanceProfile,
  backend: "webgpu" | "wasm",
  deviceClass: DeviceClass = "desktop",
): FpsLimits {
  if (deviceClass === "mobile") {
    if (profile === "power-save") {
      const maxFps = backend === "webgpu" ? 5 : 3;
      return { maxFps, minIntervalMs: 1000 / maxFps, maxIntervalMs: 2000 };
    }
    const maxFps = backend === "webgpu" ? 8 : 4;
    return { maxFps, minIntervalMs: 1000 / maxFps, maxIntervalMs: 1500 };
  }
  if (profile === "power-save") {
    const maxFps = backend === "webgpu" ? 8 : 4;
    return { maxFps, minIntervalMs: 1000 / maxFps, maxIntervalMs: 1500 };
  }
  const maxFps = backend === "webgpu" ? 15 : 8;
  return { maxFps, minIntervalMs: 1000 / maxFps, maxIntervalMs: 1000 };
}

export function startingInputSize(
  profile: PerformanceProfile,
  current: DetectionInputSize,
  deviceClass: DeviceClass = "desktop",
): DetectionInputSize {
  if (deviceClass === "mobile") {
    if (profile === "power-save") {
      return 320;
    }
    if (current === 640) {
      return 416;
    }
    return current;
  }
  if (profile === "power-save" && current === 640) {
    return 416;
  }
  return current;
}

export function nextSmallerInputSize(
  current: DetectionInputSize,
): DetectionInputSize | null {
  if (current === 640) {
    return 416;
  }
  if (current === 416) {
    return 320;
  }
  return null;
}

export function captureMaxEdge(inputSize: DetectionInputSize, ocrActive: boolean): number {
  if (ocrActive) {
    return Math.max(inputSize, 960);
  }
  return inputSize;
}

export function targetDetectionIntervalMs(
  inferMs: number,
  profile: PerformanceProfile,
  backend: "webgpu" | "wasm",
  deviceClass: DeviceClass = "desktop",
): number {
  const limits = profileFpsLimits(profile, backend, deviceClass);
  return clampIntervalMs(
    detectionIntervalMs(inferMs, limits.minIntervalMs),
    limits.maxIntervalMs,
  );
}
