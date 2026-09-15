import { describe, expect, it } from "vitest";
import {
  detectionIntervalMs,
  nextSmallerInputSize,
  startingInputSize,
  targetDetectionIntervalMs,
} from "@/modules/perception/adaptiveScheduler";

describe("adaptiveScheduler", () => {
  it("sets the detection interval to max(minInterval, inferMs * 1.2)", () => {
    expect(detectionIntervalMs(50, 67)).toBe(67);
    expect(detectionIntervalMs(200, 67)).toBe(240);
  });

  it("increases the interval when inferMs is high", () => {
    const fast = targetDetectionIntervalMs(40, "balanced", "wasm");
    const slow = targetDetectionIntervalMs(200, "balanced", "wasm");
    expect(slow).toBeGreaterThan(fast);
    expect(slow).toBe(240);
  });

  it("lowers the starting input size for power-save", () => {
    expect(startingInputSize("power-save", 640)).toBe(416);
    expect(startingInputSize("balanced", 640)).toBe(640);
    expect(nextSmallerInputSize(640)).toBe(416);
    expect(nextSmallerInputSize(416)).toBe(320);
    expect(nextSmallerInputSize(320)).toBeNull();
  });

  it("uses a smaller starting size and lower FPS cap on mobile", () => {
    expect(startingInputSize("balanced", 640, "mobile")).toBe(416);
    expect(startingInputSize("power-save", 640, "mobile")).toBe(320);
    const desktop = targetDetectionIntervalMs(40, "balanced", "wasm", "desktop");
    const mobile = targetDetectionIntervalMs(40, "balanced", "wasm", "mobile");
    expect(mobile).toBeGreaterThan(desktop);
  });
});
