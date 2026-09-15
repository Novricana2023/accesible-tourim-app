import { describe, expect, it } from "vitest";
import type { DetectedObject } from "@mara/shared";
import {
  filterPathRelevant,
  isPathRelevant,
  pathObstaclePriority,
  prioritizePathObstacles,
} from "@/modules/navigation/pathFilter";

function object(overrides: Partial<DetectedObject> = {}): DetectedObject {
  return {
    trackId: "1",
    label: "person",
    confidence: 0.8,
    box: { x: 0.35, y: 0.2, w: 0.3, h: 0.5 },
    zone: "center",
    depth: "near",
    motion: "stationary",
    firstSeenMs: 0,
    lastSeenMs: 200,
    ...overrides,
  };
}

describe("path-relevant filter", () => {
  it("keeps center near and mid objects", () => {
    expect(isPathRelevant(object({ zone: "center", depth: "near" }))).toBe(true);
    expect(isPathRelevant(object({ zone: "center", depth: "mid" }))).toBe(true);
  });

  it("drops far-side clutter", () => {
    expect(
      isPathRelevant(object({ zone: "left", depth: "far", motion: "stationary" })),
    ).toBe(false);
    expect(
      isPathRelevant(object({ zone: "right", depth: "far", motion: "approaching" })),
    ).toBe(false);
    expect(
      isPathRelevant(object({ zone: "center", depth: "far", motion: "stationary" })),
    ).toBe(false);
    expect(
      isPathRelevant(object({ zone: "left", depth: "mid", motion: "stationary" })),
    ).toBe(false);
  });

  it("keeps approaching or crossing objects in near or mid", () => {
    expect(
      isPathRelevant(object({ zone: "left", depth: "mid", motion: "approaching" })),
    ).toBe(true);
    expect(
      isPathRelevant(object({ zone: "right", depth: "near", motion: "crossing" })),
    ).toBe(true);
  });

  it("keeps near objects on the sides", () => {
    expect(
      isPathRelevant(object({ zone: "left", depth: "near", motion: "stationary" })),
    ).toBe(true);
  });

  it("filters a mixed scene down to path-relevant tracks", () => {
    const kept = filterPathRelevant([
      object({ trackId: "a", zone: "center", depth: "near" }),
      object({
        trackId: "b",
        label: "cup",
        zone: "right",
        depth: "far",
        box: { x: 0.8, y: 0.8, w: 0.05, h: 0.05 },
      }),
      object({
        trackId: "c",
        label: "car",
        zone: "left",
        depth: "mid",
        motion: "approaching",
      }),
    ]);
    expect(kept.map((item) => item.trackId)).toEqual(["a", "c"]);
    expect(kept.every((item) => item.depthSource === "bbox-area")).toBe(true);
    expect(kept.every((item) => item.distanceMeters === null)).toBe(true);
  });
});

describe("path obstacle priority", () => {
  it("ranks person, then vehicle, then large obstacles", () => {
    expect(pathObstaclePriority(object({ label: "person" }))).toBe("person");
    expect(pathObstaclePriority(object({ label: "car" }))).toBe("vehicle");
    expect(pathObstaclePriority(object({ label: "truck" }))).toBe("vehicle");
    expect(
      pathObstaclePriority(
        object({
          label: "chair",
          box: { x: 0.2, y: 0.2, w: 0.4, h: 0.4 },
        }),
      ),
    ).toBe("large");
    expect(
      pathObstaclePriority(
        object({
          label: "cup",
          box: { x: 0.4, y: 0.4, w: 0.05, h: 0.05 },
        }),
      ),
    ).toBe("other");
  });

  it("sorts person and vehicles ahead of clutter", () => {
    const ranked = prioritizePathObstacles(
      filterPathRelevant([
        object({
          trackId: "cup",
          label: "cup",
          zone: "center",
          depth: "near",
          box: { x: 0.4, y: 0.4, w: 0.05, h: 0.08 },
        }),
        object({
          trackId: "car",
          label: "car",
          zone: "center",
          depth: "mid",
        }),
        object({
          trackId: "person",
          label: "person",
          zone: "center",
          depth: "near",
        }),
      ]),
    );
    expect(ranked.map((item) => item.trackId)).toEqual(["person", "car", "cup"]);
  });
});
