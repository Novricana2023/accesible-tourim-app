import { describe, expect, it } from "vitest";
import { describeOfflineAiLimits } from "@/lib/pwa/localAiReadiness";

describe("describeOfflineAiLimits", () => {
  it("does not claim inference when assets are missing", () => {
    const lines = describeOfflineAiLimits(
      {
        detection: false,
        ocr: false,
        handLandmarks: false,
        signClassifier: false,
      },
      { speechRecognition: true },
    );
    expect(lines.some((line) => line.includes("not on this device"))).toBe(true);
    expect(lines.join(" ")).not.toMatch(/works offline|will work/i);
  });

  it("states stored files without guaranteeing inference", () => {
    const lines = describeOfflineAiLimits(
      {
        detection: true,
        ocr: true,
        handLandmarks: true,
        signClassifier: true,
      },
      { speechRecognition: false },
    );
    expect(lines.join(" ")).toContain("stored on this device");
    expect(lines.join(" ")).not.toMatch(/guaranteed|always works/i);
  });
});
