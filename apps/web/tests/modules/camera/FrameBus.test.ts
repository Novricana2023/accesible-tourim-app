import { describe, expect, it, vi } from "vitest";
import type { CameraFrame } from "@mara/shared";
import { FrameBus } from "@/modules/camera/FrameBus";
import { createMockBitmap } from "./mocks";

function frame(id: number, bitmap: ImageBitmap): CameraFrame {
  return {
    frameId: id,
    timestampMs: id * 16,
    width: 4,
    height: 4,
    bitmap,
  };
}

describe("FrameBus", () => {
  it("throttles to the subscriber interval", async () => {
    let now = 0;
    const created: ImageBitmap[] = [];
    const bus = new FrameBus({
      now: () => now,
      createImageBitmap: async () => {
        const copy = createMockBitmap(`copy-${created.length}`);
        created.push(copy);
        return copy;
      },
    });

    const received: number[] = [];
    bus.subscribe("reader", 10, (next) => {
      received.push(next.frameId);
    });

    const sourceA = createMockBitmap("a");
    const sourceB = createMockBitmap("b");
    const sourceC = createMockBitmap("c");

    await bus.publish(frame(1, sourceA));
    now = 20;
    await bus.publish(frame(2, sourceB));
    now = 100;
    await bus.publish(frame(3, sourceC));
    await Promise.resolve();

    expect(received).toEqual([1, 3]);
    expect(bus.getStats().droppedInterval).toBe(1);
    expect(bus.getStats().delivered).toBe(2);
    expect(created).toHaveLength(0);
  });

  it("drops frames while a consumer is busy (latest-frame-wins)", async () => {
    let now = 0;
    const bus = new FrameBus({
      now: () => now,
      createImageBitmap: async () => createMockBitmap("copy"),
    });

    let release!: () => void;
    const hold = new Promise<void>((resolve) => {
      release = resolve;
    });
    let started = 0;
    let finished = 0;

    bus.subscribe("slow", 60, async () => {
      started += 1;
      await hold;
      finished += 1;
    });

    const sources = Array.from({ length: 200 }, (_, index) =>
      createMockBitmap(`src-${index}`),
    );

    await bus.publish(frame(0, sources[0]));
    for (let i = 1; i < 200; i += 1) {
      now += 20;
      await bus.publish(frame(i, sources[i]));
    }

    expect(started).toBe(1);
    expect(finished).toBe(0);
    expect(bus.getStats().droppedBusy).toBe(199);
    expect(bus.getStats().delivered).toBe(1);

    release();
    await Promise.resolve();
    await Promise.resolve();
    expect(finished).toBe(1);
  });

  it("closes the delivered bitmap after the consumer settles", async () => {
    const source = createMockBitmap("source");
    const bus = new FrameBus({
      now: () => 0,
      createImageBitmap: async () => createMockBitmap("copy"),
    });

    bus.subscribe("echo", 30, async (next) => {
      expect(next.bitmap).toBe(source);
    });

    await bus.publish(frame(1, source));
    await Promise.resolve();
    await Promise.resolve();

    expect(source.close).toHaveBeenCalled();
  });

  it("does not clone a frame that is dropped as busy", async () => {
    const createImageBitmap = vi.fn(async () => createMockBitmap("copy"));
    let now = 0;
    const bus = new FrameBus({
      now: () => now,
      createImageBitmap,
    });

    let release!: () => void;
    bus.subscribe("slow", 60, () => {
      return new Promise<void>((resolve) => {
        release = resolve;
      });
    });

    await bus.publish(frame(1, createMockBitmap("a")));
    now = 50;
    await bus.publish(frame(2, createMockBitmap("b")));

    expect(createImageBitmap).toHaveBeenCalledTimes(0);
    release();
  });

  it("clones when two subscribers are eligible", async () => {
    const createImageBitmap = vi.fn(async () => createMockBitmap("copy"));
    const bus = new FrameBus({
      now: () => 0,
      createImageBitmap,
    });
    bus.subscribe("a", 30, () => undefined);
    bus.subscribe("b", 30, () => undefined);
    await bus.publish(frame(1, createMockBitmap("source")));
    expect(createImageBitmap).toHaveBeenCalledTimes(2);
  });
});
