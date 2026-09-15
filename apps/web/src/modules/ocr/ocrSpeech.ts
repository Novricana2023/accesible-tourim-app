import type { OcrResult, SpeechRequest } from "@mara/shared";
import { createId } from "@/lib/utils";
import { ocrDedupeKey, selectReadableText } from "./ocrGeometry";

export const OCR_EMPTY_UTTERANCE = "Nothing to read. Please move the camera.";

export interface OcrSpeechOptions {
  speakCooldownMs?: number;
  emptyAnnounceMs?: number;
  emptyCooldownMs?: number;
  minStableFrames?: number;
}

const DEFAULTS = {
  speakCooldownMs: 16000,
  emptyAnnounceMs: 10000,
  emptyCooldownMs: 10000,
  minStableFrames: 1,
};

export class OcrSpeechPolicy {
  private readonly options: Required<OcrSpeechOptions>;
  private lastSpokenKey = "";
  private lastSpokenAt = Number.NEGATIVE_INFINITY;
  private emptySince = Number.NEGATIVE_INFINITY;
  private lastEmptyAt = Number.NEGATIVE_INFINITY;

  constructor(options: OcrSpeechOptions = {}) {
    this.options = { ...DEFAULTS, ...options };
  }

  reset(): void {
    this.lastSpokenKey = "";
    this.lastSpokenAt = Number.NEGATIVE_INFINITY;
    this.emptySince = Number.NEGATIVE_INFINITY;
    this.lastEmptyAt = Number.NEGATIVE_INFINITY;
  }

  setEmptyAnnounceMs(value: number): void {
    this.options.emptyAnnounceMs = value;
    this.options.emptyCooldownMs = value;
  }

  requestsFromResult(result: OcrResult, now: number): SpeechRequest[] {
    const stable = result.regions.filter(
      (region) => region.stableFrames >= this.options.minStableFrames,
    );
    const pendingText = selectReadableText(
      result.regions.map((region) => ({
        text: region.text,
        confidence: region.confidence,
        box: region.box,
      })),
    );
    const text = selectReadableText(
      stable.map((region) => ({
        text: region.text,
        confidence: region.confidence,
        box: region.box,
      })),
    );
    const key = ocrDedupeKey(text);

    if (key) {
      this.emptySince = Number.NEGATIVE_INFINITY;
      if (
        key === this.lastSpokenKey &&
        now - this.lastSpokenAt < this.options.speakCooldownMs
      ) {
        return [];
      }
      this.lastSpokenKey = key;
      this.lastSpokenAt = now;
      return [
        {
          id: createId(),
          priority: 2,
          text,
          interrupt: false,
          category: "user",
          dedupeKey: `ocr:${key}`,
          cooldownMs: 0,
          createdMs: now,
        },
      ];
    }

    if (pendingText) {
      this.emptySince = Number.NEGATIVE_INFINITY;
      return [];
    }

    if (!Number.isFinite(this.emptySince) || this.emptySince < 0) {
      this.emptySince = now;
      return [];
    }
    if (now - this.emptySince < this.options.emptyAnnounceMs) {
      return [];
    }
    if (
      Number.isFinite(this.lastEmptyAt) &&
      this.lastEmptyAt >= 0 &&
      now - this.lastEmptyAt < this.options.emptyCooldownMs
    ) {
      return [];
    }
    this.lastEmptyAt = now;
    return [
      {
        id: createId(),
        priority: 2,
        text: OCR_EMPTY_UTTERANCE,
        interrupt: false,
        category: "user",
        dedupeKey: "ocr:empty",
        cooldownMs: 0,
        createdMs: now,
      },
    ];
  }
}
