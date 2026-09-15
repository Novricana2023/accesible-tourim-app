import { describe, expect, it } from "vitest";
import {
  dropLowConfidence,
  isUsefulOcrText,
  mergeNearbyRegions,
  ocrDedupeKey,
  selectReadableText,
} from "@/modules/ocr/ocrGeometry";

describe("ocrGeometry", () => {
  it("drops low-confidence text", () => {
    const kept = dropLowConfidence([
      { text: "Exit", confidence: 0.9, box: { x: 0.1, y: 0.1, w: 0.2, h: 0.05 } },
      { text: "zzz", confidence: 0.2, box: { x: 0.4, y: 0.1, w: 0.2, h: 0.05 } },
    ]);
    expect(kept.map((item) => item.text)).toEqual(["Exit"]);
    expect(isUsefulOcrText("zzz", 0.2)).toBe(false);
  });

  it("merges nearby boxes into one line", () => {
    const merged = mergeNearbyRegions([
      { text: "EXIT", confidence: 0.9, box: { x: 0.1, y: 0.2, w: 0.12, h: 0.04 } },
      { text: "LEFT", confidence: 0.88, box: { x: 0.24, y: 0.205, w: 0.12, h: 0.04 } },
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.text).toBe("EXIT LEFT");
  });

  it("normalizes duplicate keys", () => {
    expect(ocrDedupeKey("  Exit,\n  left! ")).toBe("exit left");
    expect(selectReadableText([
      { text: "A", confidence: 0.9, box: { x: 0, y: 0, w: 0.5, h: 0.2 } },
      { text: "B", confidence: 0.9, box: { x: 0, y: 0.3, w: 0.1, h: 0.05 } },
    ])).toContain("A");
  });
});
