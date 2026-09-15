import { describe, expect, it } from "vitest";
import { IoUTracker } from "@/modules/perception/tracker";

const person = {
  label: "person",
  confidence: 0.9,
  box: { x: 0.2, y: 0.2, w: 0.2, h: 0.4 },
};

describe("IoUTracker", () => {
  it("keeps the same trackId across a short occlusion", () => {
    const tracker = new IoUTracker({ maxLostMs: 300 });
    const first = tracker.update([person], 0);
    const duringGap = tracker.update([], 200);
    const again = tracker.update(
      [{ ...person, box: { x: 0.22, y: 0.21, w: 0.2, h: 0.4 } }],
      280,
    );

    expect(first[0]?.trackId).toBe("1");
    expect(duringGap[0]?.trackId).toBe("1");
    expect(again[0]?.trackId).toBe("1");
  });

  it("opens a new track after the lost window", () => {
    const tracker = new IoUTracker({ maxLostMs: 300 });
    tracker.update([person], 0);
    tracker.update([], 400);
    const next = tracker.update([person], 410);
    expect(next[0]?.trackId).toBe("2");
  });

  it("changes zone when the box walks left to center", () => {
    const tracker = new IoUTracker();
    const left = tracker.update(
      [{ ...person, box: { x: 0, y: 0.2, w: 0.4, h: 0.3 } }],
      0,
    );
    tracker.update(
      [{ ...person, box: { x: 0.2, y: 0.2, w: 0.4, h: 0.3 } }],
      100,
    );
    const center = tracker.update(
      [{ ...person, box: { x: 0.35, y: 0.2, w: 0.4, h: 0.3 } }],
      200,
    );
    expect(left[0]?.zone).toBe("left");
    expect(center[0]?.zone).toBe("center");
    expect(center[0]?.trackId).toBe(left[0]?.trackId);
  });
});
