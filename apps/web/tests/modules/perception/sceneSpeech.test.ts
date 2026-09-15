import { describe, expect, it } from "vitest";
import type { DetectedObject } from "@mara/shared";
import { SceneSpeechPolicy } from "@/modules/perception/sceneSpeech";
import { rankDetection } from "@/modules/speech/speechPolicy";

function object(overrides: Partial<DetectedObject> = {}): DetectedObject {
  return {
    trackId: "1",
    label: "person",
    confidence: 0.8,
    box: { x: 0.2, y: 0.2, w: 0.4, h: 0.5 },
    zone: "center",
    depth: "near",
    motion: "stationary",
    firstSeenMs: 0,
    lastSeenMs: 200,
    ...overrides,
  };
}

describe("SceneSpeechPolicy", () => {
  it("speaks a new track once, then respects cooldown", () => {
    const policy = new SceneSpeechPolicy({
      minHitsMs: 100,
      safetyCooldownMs: 8000,
      personVehicleCooldownMs: 8000,
      sceneCooldownMs: 12000,
      sceneRateLimitMs: 4000,
    });
    const first = policy.requestsFromTracks([object()], 200);
    const again = policy.requestsFromTracks([object()], 400);
    expect(first).toHaveLength(1);
    expect(first[0]?.text).toBe("Person ahead.");
    expect(first[0]?.rank).toBe(2);
    expect(again).toHaveLength(0);
  });

  it("speaks again when zone or depth changes", () => {
    const policy = new SceneSpeechPolicy({ minHitsMs: 0 });
    policy.requestsFromTracks([object({ depth: "near" })], 200);
    const moved = policy.requestsFromTracks(
      [object({ depth: "mid", zone: "left" })],
      300,
    );
    expect(moved).toHaveLength(1);
    expect(moved[0]?.text).toBe("Person slightly left.");
  });

  it("does not invent speech for an empty scene", () => {
    const policy = new SceneSpeechPolicy();
    expect(policy.requestsFromTracks([], 1000)).toEqual([]);
  });

  it("rate-limits generic scene labels", () => {
    const policy = new SceneSpeechPolicy({
      minHitsMs: 0,
      sceneRateLimitMs: 4000,
    });
    const chair = policy.requestsFromTracks(
      [object({ trackId: "2", label: "chair", depth: "far" })],
      100,
    );
    const cup = policy.requestsFromTracks(
      [object({ trackId: "3", label: "cup", depth: "far" })],
      200,
    );
    expect(chair).toHaveLength(1);
    expect(chair[0]?.text).toBe("Chair ahead, far.");
    expect(cup).toHaveLength(0);
  });

  it("ranks immediate hazards above ordinary objects", () => {
    expect(
      rankDetection(
        object({
          label: "person",
          depth: "near",
          motion: "approaching",
        }),
      ),
    ).toBe(1);
    expect(rankDetection(object({ label: "chair", depth: "mid" }))).toBe(4);
    expect(rankDetection(object({ label: "bottle", depth: "far" }))).toBe(5);
    expect(rankDetection(object({ label: "door", depth: "near" }))).toBe(3);
    expect(rankDetection(object({ label: "chair", depth: "near" }))).not.toBe(3);
  });

  it("does not invent a door request without a door label", () => {
    const policy = new SceneSpeechPolicy({ minHitsMs: 0 });
    const spoken = policy.requestsFromTracks(
      [object({ label: "chair", zone: "center", depth: "near" })],
      200,
    );
    expect(spoken[0]?.text).toBe("Chair ahead.");
    expect(spoken.some((item) => /door/i.test(item.text))).toBe(false);
  });
});
