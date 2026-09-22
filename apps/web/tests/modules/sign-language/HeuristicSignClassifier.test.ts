import { describe, expect, it } from "vitest";
import { HeuristicSignClassifier } from "@/modules/sign-language/HeuristicSignClassifier";

function makeHand(extended: boolean): number[] {
  const hand = new Array(21 * 3).fill(0);
  const set = (index: number, x: number, y: number) => {
    hand[index * 3] = x;
    hand[index * 3 + 1] = y;
  };
  set(0, 0.5, 0.75);
  const pairs: Array<[number, number]> = [
    [4, 3],
    [8, 6],
    [12, 10],
    [16, 14],
    [20, 18],
  ];
  for (const [tip, pip] of pairs) {
    set(pip, 0.5, 0.72);
    set(tip, 0.5, extended ? 0.25 : 0.71);
  }
  return hand;
}

describe("HeuristicSignClassifier", () => {
  it("loads without ONNX weights", async () => {
    const classifier = new HeuristicSignClassifier();
    await expect(classifier.load()).resolves.toEqual({ ok: true });
  });

  it("scores HELP with fist on flat palm", async () => {
    const classifier = new HeuristicSignClassifier();
    await classifier.load();
    const frame = {
      timestampMs: 0,
      hands: [makeHand(false), makeHand(true)],
      handedness: ["Left", "Right"] as const,
    };
    const result = await classifier.predict([frame]);
    expect(result?.gloss).toBe("HELP");
    expect(result?.confidence).toBeGreaterThanOrEqual(0.75);
  });
});
