import { describe, expect, it, vi } from "vitest";
import type { CameraFrame, EventBus, OcrResult, RuntimeEvent } from "@mara/shared";
import { createEventBus } from "@/app/EventBus";
import type { CameraService } from "@/modules/camera/CameraService";
import { OcrRuntime } from "@/modules/ocr/OcrRuntime";
import type { OcrProvider, OcrRecognizeResult } from "@/modules/ocr/TesseractOcrProvider";
import type { OcrBox } from "@/modules/ocr/ocrGeometry";

const visible = {
  hidden: () => false,
  subscribe: () => () => {
    /* noop */
  },
};

function providerWith(
  regions: OcrBox[] | (() => OcrBox[]),
  extras: {
    inferCount?: { value: number };
    disposed?: { value: boolean };
    fail?: boolean | (() => boolean);
  } = {},
): OcrProvider {
  return {
    id: "scripted-test",
    async load() {
      return { engine: "tesseract", language: "eng" };
    },
    async recognize(frame: CameraFrame): Promise<OcrRecognizeResult> {
      extras.inferCount && (extras.inferCount.value += 1);
      try {
        frame.bitmap.close();
      } catch {
        /* ignore */
      }
      const shouldFail = typeof extras.fail === "function" ? extras.fail() : extras.fail;
      if (shouldFail) {
        throw new Error("engine down");
      }
      const next = typeof regions === "function" ? regions() : regions;
      return {
        regions: next,
        inferenceMs: 12,
        engine: "tesseract",
      };
    },
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

describe("OcrRuntime", () => {
  it("emits recognized regions from the provider and does not invent text", async () => {
    const bus: EventBus = createEventBus();
    const events: RuntimeEvent[] = [];
    bus.subscribe((event) => events.push(event));
    let deliver!: (next: CameraFrame) => Promise<void>;
    const camera = mockCamera((cb) => {
      deliver = cb;
    });
    const runtime = new OcrRuntime({
      bus,
      visibility: visible,
      createProvider: () =>
        providerWith([
          {
            text: "EXIT",
            confidence: 0.93,
            box: { x: 0.1, y: 0.2, w: 0.4, h: 0.08 },
          },
        ]),
    });

    await runtime.start(camera);
    await deliver(frame(1));
    const ocr = events.find((event) => event.type === "ocr");
    const result: OcrResult | null =
      ocr && ocr.type === "ocr" ? ocr.result : null;
    expect(result?.regions[0]?.text).toBe("EXIT");
    expect(result?.source).toBe("tesseract-continuous");
    expect(JSON.stringify(events)).not.toMatch(/hello world/i);
    await runtime.stop();
  });

  it("returns empty regions when the engine finds nothing, and does not invent text", async () => {
    const bus: EventBus = createEventBus();
    const events: RuntimeEvent[] = [];
    bus.subscribe((event) => events.push(event));
    let deliver!: (next: CameraFrame) => Promise<void>;
    const camera = mockCamera((cb) => {
      deliver = cb;
    });
    const runtime = new OcrRuntime({
      bus,
      visibility: visible,
      createProvider: () => providerWith([]),
    });

    await runtime.start(camera);
    await deliver(frame(1));
    const ocr = events.find((event) => event.type === "ocr");
    expect(ocr && ocr.type === "ocr" ? ocr.result.regions : null).toEqual([]);
    expect(JSON.stringify(events)).not.toMatch(/hello world/i);
    await runtime.stop();
  });

  it("does not invent text when the engine fails, and announces after repeated failures", async () => {
    const bus: EventBus = createEventBus();
    const events: RuntimeEvent[] = [];
    bus.subscribe((event) => events.push(event));
    let deliver!: (next: CameraFrame) => Promise<void>;
    const camera = mockCamera((cb) => {
      deliver = cb;
    });
    const runtime = new OcrRuntime({
      bus,
      visibility: visible,
      createProvider: () => providerWith([], { fail: true }),
    });

    await runtime.start(camera);
    await deliver(frame(1));
    await deliver(frame(2));
    await deliver(frame(3));
    expect(events.some((event) => event.type === "ocr")).toBe(false);
    expect(runtime.getLastResult()).toBeNull();
    expect(
      events.some(
        (event) =>
          event.type === "feature-unavailable" && event.feature === "ocr",
      ),
    ).toBe(true);
    expect(JSON.stringify(events)).not.toMatch(/hello world/i);
    await runtime.stop();
  });

  it("unsubscribes on stop and does not run further OCR", async () => {
    const inferCount = { value: 0 };
    const disposed = { value: false };
    let deliver!: (next: CameraFrame) => Promise<void>;
    const camera = mockCamera((cb) => {
      deliver = cb;
    });
    const bus = createEventBus();
    const spoken: string[] = [];
    bus.subscribe((event) => {
      if (event.type === "ocr") {
        spoken.push(event.result.regions.map((region) => region.text).join(" "));
      }
    });
    const runtime = new OcrRuntime({
      bus,
      visibility: visible,
      createProvider: () =>
        providerWith(
          [
            {
              text: "GATE",
              confidence: 0.9,
              box: { x: 0.1, y: 0.2, w: 0.4, h: 0.08 },
            },
          ],
          { inferCount, disposed },
        ),
    });

    await runtime.start(camera);
    await deliver(frame(1));
    expect(inferCount.value).toBe(1);
    expect(spoken).toEqual(["GATE"]);

    await runtime.stop();
    expect(disposed.value).toBe(true);
    expect(camera.wasUnsubscribed()).toBe(true);
    expect(runtime.getStatus()).toBe("idle");

    await deliver(frame(2));
    expect(inferCount.value).toBe(1);
    expect(spoken).toEqual(["GATE"]);
  });

  it("skips frames while a hazard pause is active", async () => {
    const inferCount = { value: 0 };
    let pause = true;
    let deliver!: (next: CameraFrame) => Promise<void>;
    const camera = mockCamera((cb) => {
      deliver = cb;
    });
    const runtime = new OcrRuntime({
      bus: createEventBus(),
      visibility: visible,
      createProvider: () => providerWith([], { inferCount }),
    });

    await runtime.start(camera, { shouldPause: () => pause });
    await deliver(frame(1));
    expect(inferCount.value).toBe(0);
    pause = false;
    await deliver(frame(2));
    expect(inferCount.value).toBe(1);
    await runtime.stop();
  });

  it("announces the real start error, not a canned missing-assets line", async () => {
    const events: RuntimeEvent[] = [];
    const bus = createEventBus();
    bus.subscribe((event) => events.push(event));
    const runtime = new OcrRuntime({
      bus,
      visibility: visible,
      createProvider: () => ({
        id: "failing",
        async load() {
          throw new Error("Tesseract worker crashed.");
        },
        async recognize() {
          throw new Error("should not run");
        },
        async dispose() {
          /* unused */
        },
      }),
    });

    await expect(runtime.start(mockCamera(() => undefined))).rejects.toThrow(
      "Tesseract worker crashed.",
    );
    expect(runtime.getStatus()).toBe("unavailable");
    expect(runtime.getUnavailableReason()).toBe("Tesseract worker crashed.");
    expect(
      events.some(
        (event) =>
          event.type === "feature-unavailable" &&
          event.reason === "Tesseract worker crashed.",
      ),
    ).toBe(true);
  });
});
