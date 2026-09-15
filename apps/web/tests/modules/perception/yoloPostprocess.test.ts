import { describe, expect, it } from "vitest";
import { decodeYoloOutput } from "@/modules/perception/yoloPostprocess";

describe("decodeYoloOutput", () => {
  it("maps class scores to the labels supplied at init", () => {
    const count = 1;
    const data = new Float32Array(84 * count);
    data[0] = 320;
    data[count] = 320;
    data[2 * count] = 80;
    data[3 * count] = 80;
    data[4 * count] = 0.2;
    data[5 * count] = 0.91;

    const detections = decodeYoloOutput(
      data,
      [1, 84, 1],
      ["person", "bicycle"],
      0.45,
      {
        scale: 1,
        padX: 0,
        padY: 0,
        inputSize: 640,
        sourceWidth: 640,
        sourceHeight: 640,
      },
    );

    expect(detections).toHaveLength(1);
    expect(detections[0]?.label).toBe("bicycle");
    expect(detections[0]?.confidence).toBeGreaterThan(0.9);
  });

  it("returns an empty list when nothing is above threshold", () => {
    const data = new Float32Array(84);
    const detections = decodeYoloOutput(data, [1, 84, 1], ["person"], 0.45, {
      scale: 1,
      padX: 0,
      padY: 0,
      inputSize: 640,
      sourceWidth: 640,
      sourceHeight: 640,
    });
    expect(detections).toEqual([]);
  });
});
