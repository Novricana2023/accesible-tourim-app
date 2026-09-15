import { describe, expect, it, vi } from "vitest";
import type { CameraFrame, DetectionResult, EventBus, RuntimeEvent } from "@mara/shared";
import { createEventBus } from "@/app/EventBus";
import type { CameraService } from "@/modules/camera/CameraService";
import type { DetectionProvider, RawDetection } from "@/modules/perception/DetectionProvider";
import { PerceptionRuntime } from "@/modules/perception/PerceptionRuntime";

const visible = {
  hidden: () => false,
  subscribe: () => () => {
    /* noop */
  },
};

function providerWith(
  detections: RawDetection[],
  extras: {
    inferMs?: number;
    inferCount?: { value: number };
    disposed?: { value: boolean };
    configureInputSize?: (size: 320 | 416 | 640) => void;
    fail?: boolean | (() => boolean);
  } = {},
): DetectionProvider {
  return {
    id: "scripted-test",
    inputSize: 640,
    labels: detections.map((item) => item.label),
    async load() {
      return { backend: "wasm" };
    },
    async infer(frame: CameraFrame) {
      extras.inferCount && (extras.inferCount.value += 1);
      try {
        frame.bitmap.close();
      } catch {
        /* ignore */
      }
      const shouldFail = typeof extras.fail === "function" ? extras.fail() : extras.fail;
      if (shouldFail) {
        throw new Error("ort failed");
      }
      return {
        detections,
        inferenceMs: extras.inferMs ?? 12,
        backend: "wasm",
      };
    },
    configureInputSize: extras.configureInputSize,
    async dispose() {
      if (extras.disposed) {
        extras.disposed.value = true;
      }
    },
  };
}

function mockCamera(onSubscribe: (cb: (frame: CameraFrame) => Promise<void>) => void) {
  let unsubscribed = false;
  return {
    subscribe(_id: string, _fps: number, onFrame: (frame: CameraFrame) => Promise<void>) {
      unsubscribed = false;
      onSubscribe(onFrame);
      return () => {
        unsubscribed = true;
      };
    },
    setSubscriberFps: vi.fn(),
    wasUnsubscribed: () => unsubscribed,
  } as unknown as CameraService & { wasUnsubscribed: () => boolean };
}

function frame(id: number): CameraFrame {
  return {
    frameId: id,
    timestampMs: id * 16,
    width: 640,
    height: 480,
    bitmap: { close: vi.fn() } as unknown as ImageBitmap,
  };
}

describe("PerceptionRuntime", () => {
  it("emits tracked objects from a real provider result, not a canned scene", async () => {
    const bus: EventBus = createEventBus();
    const events: RuntimeEvent[] = [];
    bus.subscribe((event) => events.push(event));

    let deliver!: (frame: CameraFrame) => Promise<void>;
    const camera = mockCamera((cb) => {
      deliver = cb;
    });

    const runtime = new PerceptionRuntime({
      bus,
      createProvider: async () =>
        providerWith([
          {
            label: "person",
            confidence: 0.88,
            box: { x: 0.1, y: 0.1, w: 0.2, h: 0.4 },
          },
        ]),
    });

    await runtime.start(camera, "wasm");
    const results: DetectionResult[] = [];
    runtime.subscribeResults((result) => results.push(result));

    await deliver({
      frameId: 7,
      timestampMs: 70,
      width: 640,
      height: 480,
      bitmap: { close: vi.fn() } as unknown as ImageBitmap,
    });

    const tracks = events.find((event) => event.type === "tracks");
    expect(tracks && tracks.type === "tracks" ? tracks.objects[0]?.label : null).toBe(
      "person",
    );
    expect(results.at(-1)?.backend).toBe("wasm");
    expect(results.at(-1)?.objects[0]?.trackId).toBe("1");
    await runtime.stop();
  });

  it("emits feature-unavailable when the provider cannot load", async () => {
    const bus: EventBus = createEventBus();
    const events: RuntimeEvent[] = [];
    bus.subscribe((event) => events.push(event));
    const runtime = new PerceptionRuntime({
      bus,
      createProvider: async () => {
        throw new Error("weights missing");
      },
    });

    await expect(
      runtime.start({ subscribe: vi.fn(), setSubscriberFps: vi.fn() } as unknown as CameraService, "wasm"),
    ).rejects.toThrow("weights missing");
    expect(events.some((event) => event.type === "feature-unavailable")).toBe(true);
  });

  it("starts a loop that processes multiple frames and stop() ends infer", async () => {
    const inferCount = { value: 0 };
    const disposed = { value: false };
    let deliver!: (next: CameraFrame) => Promise<void>;
    const camera = mockCamera((cb) => {
      deliver = cb;
    });
    const runtime = new PerceptionRuntime({
      bus: createEventBus(),
      visibility: visible,
      createProvider: async () => providerWith([], { inferCount, disposed }),
    });

    await runtime.start(camera, "wasm");
    await deliver(frame(1));
    await deliver(frame(2));
    await deliver(frame(3));
    expect(inferCount.value).toBe(3);
    expect(runtime.getFramesProcessed()).toBe(3);

    await runtime.stop();
    expect(disposed.value).toBe(true);
    expect(camera.wasUnsubscribed()).toBe(true);
    expect(runtime.getStatus()).toBe("idle");
    expect(runtime.getFramesProcessed()).toBe(0);

    await deliver(frame(4));
    expect(inferCount.value).toBe(3);
  });

  it("does not invent detections when the provider returns none", async () => {
    let deliver!: (next: CameraFrame) => Promise<void>;
    const camera = mockCamera((cb) => {
      deliver = cb;
    });
    const runtime = new PerceptionRuntime({
      bus: createEventBus(),
      visibility: visible,
      createProvider: async () => providerWith([]),
    });

    await runtime.start(camera, "wasm");
    await deliver(frame(1));
    expect(runtime.getLastResult()?.objects).toEqual([]);
    await runtime.stop();
  });

  it("raises the detection interval when inferMs is high", async () => {
    let deliver!: (next: CameraFrame) => Promise<void>;
    const camera = mockCamera((cb) => {
      deliver = cb;
    });
    const runtime = new PerceptionRuntime({
      bus: createEventBus(),
      visibility: visible,
      createProvider: async () => providerWith([], { inferMs: 200 }),
    });

    await runtime.start(camera, "wasm");
    const before = runtime.getTargetIntervalMs();
    await deliver(frame(1));
    expect(runtime.getTargetIntervalMs()).toBeGreaterThan(before);
    expect(runtime.getTargetIntervalMs()).toBe(240);
    expect(camera.setSubscriberFps).toHaveBeenCalled();
    await runtime.stop();
  });

  it("starts at 416 on a mobile balanced profile without inventing detections", async () => {
    const sizes: Array<320 | 416 | 640> = [];
    const camera = mockCamera(() => {
      /* no frames */
    });
    const runtime = new PerceptionRuntime({
      bus: createEventBus(),
      visibility: visible,
      createProvider: async () =>
        providerWith([], {
          configureInputSize: (size) => {
            sizes.push(size);
          },
        }),
    });

    await runtime.start(camera, "wasm", { deviceClass: "mobile", profile: "balanced" });
    expect(runtime.getLoopState().inputSize).toBe(416);
    expect(sizes).toContain(416);
    await runtime.stop();
  });

  it("drops input size after sustained slow inference and announces power-save", async () => {
    let now = 0;
    const sizes: Array<320 | 416 | 640> = [];
    const events: RuntimeEvent[] = [];
    const bus = createEventBus();
    bus.subscribe((event) => events.push(event));
    let deliver!: (next: CameraFrame) => Promise<void>;
    const camera = mockCamera((cb) => {
      deliver = cb;
    });
    const runtime = new PerceptionRuntime({
      bus,
      now: () => now,
      visibility: visible,
      createProvider: async () =>
        providerWith([], {
          inferMs: 400,
          configureInputSize: (size) => {
            sizes.push(size);
          },
        }),
    });

    await runtime.start(camera, "wasm");
    await deliver(frame(1));
    now = 5100;
    await deliver(frame(2));
    expect(sizes).toContain(416);
    expect(
      events.some(
        (event) =>
          event.type === "speech-request" &&
          event.request.text.includes("Input size dropped to 416"),
      ),
    ).toBe(true);
    await runtime.stop();
  });

  it("pauses inference when the document is hidden", async () => {
    let hidden = false;
    const listeners = new Set<() => void>();
    const inferCount = { value: 0 };
    let deliver!: (next: CameraFrame) => Promise<void>;
    const camera = mockCamera((cb) => {
      deliver = cb;
    });
    const runtime = new PerceptionRuntime({
      bus: createEventBus(),
      visibility: {
        hidden: () => hidden,
        subscribe: (listener) => {
          listeners.add(listener);
          return () => listeners.delete(listener);
        },
      },
      createProvider: async () => providerWith([], { inferCount }),
    });

    await runtime.start(camera, "wasm");
    hidden = true;
    for (const listener of listeners) {
      listener();
    }
    expect(runtime.getStatus()).toBe("paused");
    await deliver(frame(1));
    expect(inferCount.value).toBe(0);

    hidden = false;
    for (const listener of listeners) {
      listener();
    }
    expect(runtime.getStatus()).toBe("live");
    await runtime.stop();
  });

  it("marks detection unavailable after repeated infer failures and does not invent boxes", async () => {
    const events: RuntimeEvent[] = [];
    const bus = createEventBus();
    bus.subscribe((event) => events.push(event));
    let deliver!: (next: CameraFrame) => Promise<void>;
    const camera = mockCamera((cb) => {
      deliver = cb;
    });
    const runtime = new PerceptionRuntime({
      bus,
      visibility: visible,
      createProvider: async () => providerWith([], { fail: true }),
    });

    await runtime.start(camera, "wasm");
    await deliver(frame(1));
    await deliver(frame(2));
    expect(runtime.getStatus()).toBe("live");
    await deliver(frame(3));
    expect(runtime.getStatus()).toBe("unavailable");
    expect(runtime.getLastResult()).toBeNull();
    expect(
      events.some(
        (event) =>
          event.type === "feature-unavailable" &&
          event.feature === "detection" &&
          event.reason.includes("ort failed"),
      ),
    ).toBe(true);
    await runtime.stop();
  });
});
