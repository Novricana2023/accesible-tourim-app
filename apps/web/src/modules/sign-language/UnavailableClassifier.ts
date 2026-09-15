import type { SignClassifier, SignClassifierResult, LandmarkFrame } from "./types";
import { CLASSIFIER_MISSING_REASON } from "./types";

/** Honest stand-in when no trained weights are present. Never invents a gloss. */
export class UnavailableClassifier implements SignClassifier {
  readonly id = "unavailable";

  async load(): Promise<{ ok: false; reason: string }> {
    return { ok: false, reason: CLASSIFIER_MISSING_REASON };
  }

  async predict(_sequence: LandmarkFrame[]): Promise<SignClassifierResult | null> {
    return null;
  }

  async dispose(): Promise<void> {
    /* nothing to release */
  }
}
