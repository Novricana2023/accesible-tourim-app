import { describe, expect, it } from "vitest";
import type { OcrResult } from "@mara/shared";
import {
  dropLowConfidence,
  mergeNearbyRegions,
  selectReadableText,
} from "@/modules/ocr/ocrGeometry";
import { OCR_EMPTY_UTTERANCE, OcrSpeechPolicy } from "@/modules/ocr/ocrSpeech";

function box(text: string, confidence: number, x: number, y: number, w = 0.2, h = 0.06) {
  return { text, confidence, box: { x, y, w, h } };
}

function result(regions: OcrResult["regions"], frameId = 1): OcrResult {
  return {
    frameId,
    regions,
    source: "tesseract-continuous",
  };
}

function region(
  text: string,
  extras: Partial<OcrResult["regions"][number]> = {},
): OcrResult["regions"][number] {
  return {
    id: extras.id ?? text,
    text,
    confidence: extras.confidence ?? 0.9,
    box: extras.box ?? { x: 0.1, y: 0.2, w: 0.5, h: 0.08 },
    stableFrames: extras.stableFrames ?? 1,
  };
}

describe("ocrGeometry", () => {
  it("merges nearby regions into one block", () => {
    const merged = mergeNearbyRegions([
      box("EXIT", 0.92, 0.1, 0.2, 0.18, 0.06),
      box("ONLY", 0.88, 0.3, 0.205, 0.2, 0.06),
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.text).toBe("EXIT ONLY");
  });

  it("drops low-confidence and tiny garbage", () => {
    const kept = dropLowConfidence([
      box("NOISE", 0.2, 0.1, 0.2, 0.4, 0.08),
      box("Hi", 0.9, 0.1, 0.1, 0.01, 0.005),
      box("STOP", 0.91, 0.2, 0.3, 0.3, 0.08),
    ]);
    expect(kept.map((item) => item.text)).toEqual(["STOP"]);
  });

  it("speaks the highest-scoring merged block, not every fragment", () => {
    const text = selectReadableText(
      mergeNearbyRegions([
        box("MAIN", 0.94, 0.1, 0.15, 0.4, 0.1),
        box("tiny", 0.7, 0.8, 0.8, 0.12, 0.04),
      ]),
    );
    expect(text).toBe("MAIN");
    expect(text).not.toMatch(/tiny/i);
  });
});

describe("OcrSpeechPolicy", () => {
  it("announces nothing to read once after the idle period, then cools down", () => {
    const policy = new OcrSpeechPolicy({
      emptyAnnounceMs: 1000,
      emptyCooldownMs: 4000,
      minStableFrames: 1,
    });
    const empty = result([]);

    expect(policy.requestsFromResult(empty, 0).map((item) => item.text)).toEqual([]);
    expect(policy.requestsFromResult(empty, 500).map((item) => item.text)).toEqual([]);
    expect(policy.requestsFromResult(empty, 999).map((item) => item.text)).toEqual([]);

    const first = policy.requestsFromResult(empty, 1000);
    expect(first.map((item) => item.text)).toEqual([OCR_EMPTY_UTTERANCE]);

    expect(policy.requestsFromResult(empty, 1001).map((item) => item.text)).toEqual([]);
    expect(policy.requestsFromResult(empty, 2500).map((item) => item.text)).toEqual([]);
    expect(policy.requestsFromResult(empty, 4999).map((item) => item.text)).toEqual([]);

    const second = policy.requestsFromResult(empty, 5000);
    expect(second.map((item) => item.text)).toEqual([OCR_EMPTY_UTTERANCE]);
  });

  it("does not re-speak identical text within the cooldown", () => {
    const policy = new OcrSpeechPolicy({
      speakCooldownMs: 8000,
      minStableFrames: 1,
    });
    const sign = result([region("Exit only")]);

    expect(policy.requestsFromResult(sign, 0).map((item) => item.text)).toEqual(["Exit only"]);
    expect(policy.requestsFromResult(sign, 100).map((item) => item.text)).toEqual([]);
    expect(policy.requestsFromResult(sign, 7999).map((item) => item.text)).toEqual([]);
    expect(policy.requestsFromResult(sign, 8000).map((item) => item.text)).toEqual(["Exit only"]);
  });

  it("does not invent text for an empty result", () => {
    const policy = new OcrSpeechPolicy({ minStableFrames: 1 });
    const spoken = policy.requestsFromResult(result([]), 0);
    expect(spoken).toEqual([]);
    expect(spoken.join(" ")).not.toMatch(/hello world/i);
  });
});
