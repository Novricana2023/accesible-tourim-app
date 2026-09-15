import { describe, expect, it } from "vitest";
import { motionFromHistory } from "@/modules/perception/motion";

describe("motion", () => {
  it("marks growing boxes as approaching", () => {
    const hint = motionFromHistory(
      [
        { t: 0, cx: 0.5, cy: 0.5, area: 0.04 },
        { t: 1000, cx: 0.5, cy: 0.5, area: 0.08 },
      ],
      1000,
    );
    expect(hint).toBe("approaching");
  });

  it("marks shrinking boxes as receding", () => {
    const hint = motionFromHistory(
      [
        { t: 0, cx: 0.5, cy: 0.5, area: 0.1 },
        { t: 1000, cx: 0.5, cy: 0.5, area: 0.05 },
      ],
      1000,
    );
    expect(hint).toBe("receding");
  });

  it("marks a left-to-right centroid move as crossing", () => {
    const hint = motionFromHistory(
      [
        { t: 0, cx: 0.2, cy: 0.5, area: 0.05 },
        { t: 1000, cx: 0.8, cy: 0.5, area: 0.05 },
      ],
      1000,
    );
    expect(hint).toBe("crossing");
  });
});
