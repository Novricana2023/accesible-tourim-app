import { describe, expect, it } from "vitest";
import { teardownContinuousVision } from "@/modules/assist/teardownContinuousVision";

describe("teardownContinuousVision", () => {
  it("stops speech, inference, and camera tracks in that order", async () => {
    const order: string[] = [];
    await teardownContinuousVision({
      cancelSpeech: () => {
        order.push("speech-cancel");
      },
      resetScene: () => {
        order.push("speech-reset");
      },
      stopOcr: async () => {
        order.push("ocr-stop");
      },
      stopPerception: async () => {
        order.push("perception-stop");
      },
      stopCamera: async () => {
        order.push("camera-stop");
      },
    });
    expect(order).toEqual([
      "speech-cancel",
      "speech-reset",
      "ocr-stop",
      "perception-stop",
      "camera-stop",
    ]);
  });

  it("stops path assistance before perception when a nav runtime is provided", async () => {
    const order: string[] = [];
    await teardownContinuousVision({
      cancelSpeech: () => {
        order.push("speech-cancel");
      },
      resetScene: () => {
        order.push("speech-reset");
      },
      stopOcr: async () => {
        order.push("ocr-stop");
      },
      stopNavigation: () => {
        order.push("nav-stop");
      },
      stopPerception: async () => {
        order.push("perception-stop");
      },
      stopCamera: async () => {
        order.push("camera-stop");
      },
    });
    expect(order).toEqual([
      "speech-cancel",
      "speech-reset",
      "ocr-stop",
      "nav-stop",
      "perception-stop",
      "camera-stop",
    ]);
  });
});
