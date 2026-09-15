import { describe, expect, it } from "vitest";
import {
  formatPathUtterance,
  PathSpeechPolicy,
  utteranceContainsMeters,
} from "@/modules/navigation/pathSpeech";
import type { PathObstacle } from "@/modules/navigation/types";

function obstacle(overrides: Partial<PathObstacle> = {}): PathObstacle {
  return {
    trackId: "1",
    label: "person",
    confidence: 0.9,
    zone: "center",
    depth: "near",
    motion: "stationary",
    box: { x: 0.3, y: 0.2, w: 0.3, h: 0.5 },
    firstSeenMs: 0,
    lastSeenMs: 250,
    distanceMeters: null,
    depthSource: "bbox-area",
    priority: "person",
    ...overrides,
  };
}

describe("path speech", () => {
  it("uses zone and depth bands and never speaks meters", () => {
    const text = formatPathUtterance(
      obstacle({
        distanceMeters: 2.4,
        depthSource: "bbox-area",
      }),
    );
    expect(text).toBe("Person, center, near.");
    expect(utteranceContainsMeters(text)).toBe(false);
    expect(text).not.toMatch(/\d/);
    expect(text.toLowerCase()).not.toContain("meter");
    expect(text.toLowerCase()).not.toContain("safe");
  });

  it("does not invent a safe-path line for an empty filter result", () => {
    const policy = new PathSpeechPolicy({ minHitsMs: 0, rateLimitMs: 0 });
    expect(policy.requestsFromObstacles([], 1000)).toEqual([]);
  });

  it("speaks the highest-priority obstacle once, then respects cooldown", () => {
    const policy = new PathSpeechPolicy({
      minHitsMs: 0,
      personVehicleCooldownMs: 8000,
      rateLimitMs: 0,
    });
    const first = policy.requestsFromObstacles([obstacle()], 200);
    const again = policy.requestsFromObstacles([obstacle()], 400);
    expect(first).toHaveLength(1);
    expect(first[0]?.category).toBe("nav");
    expect(first[0]?.text).toBe("Person, center, near.");
    expect(again).toHaveLength(0);
  });

  it("does not speak flicker shorter than minHitsMs", () => {
    const policy = new PathSpeechPolicy({ minHitsMs: 120, rateLimitMs: 0 });
    expect(
      policy.requestsFromObstacles(
        [obstacle({ firstSeenMs: 0, lastSeenMs: 40 })],
        40,
      ),
    ).toHaveLength(0);
  });

  it("never includes meters even when a future depth field is populated", () => {
    const policy = new PathSpeechPolicy({ minHitsMs: 0, rateLimitMs: 0 });
    const spoken = policy.requestsFromObstacles(
      [obstacle({ distanceMeters: 1.75, depthSource: "mono-depth" })],
      300,
    );
    expect(spoken).toHaveLength(1);
    expect(utteranceContainsMeters(spoken[0]?.text ?? "")).toBe(false);
    expect(spoken[0]?.text).toBe("Person, center, near.");
  });
});
