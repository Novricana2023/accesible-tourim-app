import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { DetectedObject, DetectionResult, RuntimeEvent } from "@mara/shared";
import { createEventBus } from "@/app/EventBus";
import { NavigationRuntime } from "@/modules/navigation/NavigationRuntime";
import {
  navigationNeedsVisionStart,
  visionIsReadyForNavigation,
} from "@/modules/navigation/lifecycle";

const MODULE_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../src/modules/navigation",
);

function walk(dir: string): string[] {
  const entries = readdirSync(dir);
  const files: string[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      files.push(...walk(full));
    } else if (full.endsWith(".ts") || full.endsWith(".tsx")) {
      files.push(full);
    }
  }
  return files;
}

function object(overrides: Partial<DetectedObject> = {}): DetectedObject {
  return {
    trackId: "1",
    label: "person",
    confidence: 0.88,
    box: { x: 0.3, y: 0.2, w: 0.35, h: 0.5 },
    zone: "center",
    depth: "near",
    motion: "approaching",
    firstSeenMs: 0,
    lastSeenMs: 220,
    ...overrides,
  };
}

function result(objects: DetectedObject[], timestampMs = 220): DetectionResult {
  return {
    frameId: 1,
    timestampMs,
    objects,
    inferenceMs: 12,
    backend: "wasm",
  };
}

describe("NavigationRuntime", () => {
  it("does not ingest detections until started", () => {
    const events: RuntimeEvent[] = [];
    const bus = createEventBus();
    bus.subscribe((event) => events.push(event));
    const nav = new NavigationRuntime({ bus });

    const obstacles = nav.ingest(result([object()]));
    expect(obstacles).toEqual([]);
    expect(nav.isActive()).toBe(false);
    expect(events.filter((event) => event.type === "speech-request")).toHaveLength(0);
  });

  it("consumes DetectionResult tracks and speaks a path cue without meters", () => {
    const spoken: string[] = [];
    const bus = createEventBus();
    bus.subscribe((event) => {
      if (event.type === "speech-request") {
        spoken.push(event.request.text);
      }
    });
    const nav = new NavigationRuntime({
      bus,
      speech: { minHitsMs: 0, rateLimitMs: 0 },
    });
    nav.start();
    expect(nav.isActive()).toBe(true);

    const obstacles = nav.ingest(
      result([
        object({
          trackId: "cup",
          label: "cup",
          zone: "right",
          depth: "far",
          motion: "stationary",
          box: { x: 0.8, y: 0.8, w: 0.04, h: 0.04 },
        }),
        object(),
      ]),
    );

    expect(obstacles.map((item) => item.label)).toEqual(["person"]);
    expect(spoken).toEqual(["Person approaching, center, near."]);
    expect(spoken[0]?.toLowerCase()).not.toContain("meter");
    expect(nav.getState().distanceMetersToStep).toBeNull();
    expect(nav.getState().kind).toBe("path-assistance");
  });

  it("stop() ends path assistance without requiring a detector shutdown", () => {
    const bus = createEventBus();
    const nav = new NavigationRuntime({
      bus,
      speech: { minHitsMs: 0, rateLimitMs: 0 },
    });
    nav.start();
    nav.ingest(result([object()]));
    nav.stop();
    expect(nav.isActive()).toBe(false);
    expect(nav.getObstacles()).toEqual([]);
    expect(nav.ingest(result([object()]))).toEqual([]);
  });

  it("does not say the path is safe when the scene is empty", () => {
    const spoken: string[] = [];
    const bus = createEventBus();
    bus.subscribe((event) => {
      if (event.type === "speech-request") {
        spoken.push(event.request.text);
      }
    });
    const nav = new NavigationRuntime({
      bus,
      speech: { minHitsMs: 0, rateLimitMs: 0 },
    });
    nav.start();
    nav.ingest(result([]));
    expect(spoken).toEqual([]);
    expect(nav.getObstacles()).toEqual([]);
  });
});

describe("navigation vision contract", () => {
  it("requires a live or paused continuous vision runtime", () => {
    expect(navigationNeedsVisionStart("idle")).toBe(true);
    expect(navigationNeedsVisionStart("unavailable")).toBe(true);
    expect(navigationNeedsVisionStart("live")).toBe(false);
    expect(visionIsReadyForNavigation("live")).toBe(true);
    expect(visionIsReadyForNavigation("paused")).toBe(true);
    expect(visionIsReadyForNavigation("idle")).toBe(false);
  });
});

describe("navigation module isolation", () => {
  it("does not import perception, YOLO, or OCR internals", () => {
    const files = walk(MODULE_ROOT);
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      expect(source, file).not.toMatch(/modules\/perception/);
      expect(source, file).not.toMatch(/OrtYolo|yoloPostprocess|detection\.worker/);
      expect(source, file).not.toMatch(/modules\/ocr/);
    }
  });
});
