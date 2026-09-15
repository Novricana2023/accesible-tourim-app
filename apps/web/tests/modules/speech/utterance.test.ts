import { describe, expect, it } from "vitest";
import type { DetectedObject } from "@mara/shared";
import {
  formatDetectionUtterance,
  isAccessClassLabel,
  spokenName,
} from "@/modules/speech/utterance";

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

describe("formatDetectionUtterance", () => {
  it("says Person ahead for a near person in the center", () => {
    expect(formatDetectionUtterance(object())).toBe("Person ahead.");
  });

  it("says Chair slightly left for a mid chair on the left", () => {
    expect(
      formatDetectionUtterance(
        object({ label: "chair", zone: "left", depth: "mid" }),
      ),
    ).toBe("Chair slightly left.");
  });

  it("says Vehicle approaching from the right for a car", () => {
    expect(
      formatDetectionUtterance(
        object({
          label: "car",
          zone: "right",
          depth: "mid",
          motion: "approaching",
        }),
      ),
    ).toBe("Vehicle approaching from the right.");
  });

  it("says Door ahead only when the label is a door", () => {
    expect(
      formatDetectionUtterance(object({ label: "door", zone: "center", depth: "near" })),
    ).toBe("Door ahead.");
  });

  it("never emits Door unless the detection label is a door", () => {
    const spoken = formatDetectionUtterance(
      object({ label: "chair", zone: "center", depth: "near" }),
    );
    expect(spoken).toBe("Chair ahead.");
    expect(spoken).not.toMatch(/door/i);
    expect(isAccessClassLabel("chair")).toBe(false);
    expect(spokenName("person")).not.toMatch(/door/i);
  });
});
