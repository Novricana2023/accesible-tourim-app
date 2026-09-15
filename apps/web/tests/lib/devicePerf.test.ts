import { describe, expect, it, vi } from "vitest";
import { probeDeviceProfile } from "@/lib/deviceProfile";
import { fetchModelBytes } from "@/lib/modelCache";
import { createLatestWinsThrottle } from "@/lib/uiThrottle";
import { captureSize } from "@/modules/camera/CameraService";

describe("probeDeviceProfile", () => {
  it("uses a conservative capture size on a constrained phone", () => {
    const profile = probeDeviceProfile({
      userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)",
      platform: "iPhone",
      maxTouchPoints: 5,
      hardwareConcurrency: 4,
      deviceMemory: 3,
      coarsePointer: true,
      minScreenEdge: 390,
    });
    expect(profile.class).toBe("mobile");
    expect(profile.ios).toBe(true);
    expect(profile.constrained).toBe(true);
    expect(profile.startingInputSize).toBe(320);
    expect(profile.captureWidth).toBe(640);
    expect(profile.captureFps).toBeLessThan(24);
  });

  it("does not treat a desktop workstation as mobile", () => {
    const profile = probeDeviceProfile({
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/128.0.0.0",
      platform: "Win32",
      maxTouchPoints: 0,
      hardwareConcurrency: 12,
      deviceMemory: 8,
      coarsePointer: false,
      minScreenEdge: 1080,
    });
    expect(profile.class).toBe("desktop");
    expect(profile.startingInputSize).toBe(640);
    expect(profile.captureWidth).toBe(1280);
  });
});

describe("captureSize", () => {
  it("does not upscale a smaller source", () => {
    expect(captureSize(640, 480, 1280)).toEqual({ width: 640, height: 480 });
  });

  it("downscales a large source to the max edge", () => {
    expect(captureSize(1920, 1080, 640)).toEqual({ width: 640, height: 360 });
  });
});

describe("createLatestWinsThrottle", () => {
  it("delivers the latest value at the requested rate", () => {
    let now = 0;
    const scheduled: Array<{ fn: () => void; delay: number }> = [];
    const received: number[] = [];
    const throttle = createLatestWinsThrottle(
      10,
      (value: number) => {
        received.push(value);
      },
      {
        now: () => now,
        schedule: (fn, delay) => {
          scheduled.push({ fn, delay });
          return {
            cancel: () => {
              const index = scheduled.findIndex((item) => item.fn === fn);
              if (index >= 0) {
                scheduled.splice(index, 1);
              }
            },
          };
        },
      },
    );

    throttle.push(1);
    expect(received).toEqual([1]);
    now = 20;
    throttle.push(2);
    expect(received).toEqual([1]);
    now = 40;
    throttle.push(3);
    expect(scheduled).toHaveLength(1);
    scheduled[0]?.fn();
    expect(received).toEqual([1, 3]);
  });

  it("flushes immediately when asked", () => {
    const received: string[] = [];
    const throttle = createLatestWinsThrottle(1, (value: string) => {
      received.push(value);
    });
    throttle.push("a");
    throttle.push("b");
    throttle.flush();
    expect(received[0]).toBe("a");
    expect(received.at(-1)).toBe("b");
  });
});

describe("fetchModelBytes cache", () => {
  it("returns cached bytes without inventing a payload", async () => {
    const bytes = new Uint8Array([1, 2, 3]).buffer;
    const match = {
      ok: true,
      arrayBuffer: async () => bytes,
    };
    const cache = {
      match: vi.fn(async () => match),
      put: vi.fn(),
    };
    vi.stubGlobal("caches", {
      open: async () => cache,
    });
    const result = await fetchModelBytes("/models/yolo.onnx");
    expect(result).toBe(bytes);
    expect(cache.match).toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
