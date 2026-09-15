import { describe, expect, it } from "vitest";
import { depthFromBox, zoneFromBox } from "@/modules/perception/spatial";

describe("spatial", () => {
  it("assigns left, center, and right from box center", () => {
    expect(zoneFromBox({ x: 0.02, y: 0.2, w: 0.1, h: 0.2 })).toBe("left");
    expect(zoneFromBox({ x: 0.4, y: 0.2, w: 0.2, h: 0.2 })).toBe("center");
    expect(zoneFromBox({ x: 0.8, y: 0.2, w: 0.15, h: 0.2 })).toBe("right");
  });

  it("keeps zone hysteresis near the boundary", () => {
    expect(zoneFromBox({ x: 0.36, y: 0.2, w: 0.08, h: 0.2 }, "left")).toBe("left");
  });

  it("assigns depth from box area, not meters", () => {
    expect(depthFromBox({ x: 0.2, y: 0.2, w: 0.5, h: 0.5 })).toBe("near");
    expect(depthFromBox({ x: 0.4, y: 0.4, w: 0.25, h: 0.25 })).toBe("mid");
    expect(depthFromBox({ x: 0.45, y: 0.45, w: 0.08, h: 0.08 })).toBe("far");
  });

  it("does not chatter near/mid across the hysteresis band", () => {
    expect(depthFromBox({ x: 0.3, y: 0.3, w: 0.3, h: 0.32 }, "near")).toBe("near");
  });
});
