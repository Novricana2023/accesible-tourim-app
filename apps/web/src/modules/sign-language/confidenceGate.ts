import {
  HOLD_MS,
  SPEAK_CONFIDENCE,
  UNCERTAIN_CONFIDENCE,
  type SignClassifierResult,
  type SignUncertainty,
} from "./types";

export interface ConfidenceGateOptions {
  speakAt?: number;
  uncertainAt?: number;
  holdMs?: number;
}

export interface ConfidenceDecision {
  uncertainty: SignUncertainty;
  gloss: string | null;
  confidence: number | null;
  speak: boolean;
}

interface HoldState {
  gloss: string;
  sinceMs: number;
}

export class ConfidenceGate {
  private readonly speakAt: number;
  private readonly uncertainAt: number;
  private readonly holdMs: number;
  private hold: HoldState | null = null;
  private lastSpokenGloss: string | null = null;
  private lastSpokenAt = Number.NEGATIVE_INFINITY;

  constructor(options: ConfidenceGateOptions = {}) {
    this.speakAt = options.speakAt ?? SPEAK_CONFIDENCE;
    this.uncertainAt = options.uncertainAt ?? UNCERTAIN_CONFIDENCE;
    this.holdMs = options.holdMs ?? HOLD_MS;
  }

  reset(): void {
    this.hold = null;
    this.lastSpokenGloss = null;
    this.lastSpokenAt = Number.NEGATIVE_INFINITY;
  }

  decide(result: SignClassifierResult | null, now: number): ConfidenceDecision {
    if (!result || result.confidence < this.uncertainAt) {
      this.hold = null;
      return {
        uncertainty: "not-recognized",
        gloss: null,
        confidence: result?.confidence ?? null,
        speak: false,
      };
    }

    if (result.confidence < this.speakAt) {
      this.hold = null;
      return {
        uncertainty: "uncertain",
        gloss: result.gloss,
        confidence: result.confidence,
        speak: false,
      };
    }

    if (!this.hold || this.hold.gloss !== result.gloss) {
      this.hold = { gloss: result.gloss, sinceMs: now };
      return {
        uncertainty: "none",
        gloss: result.gloss,
        confidence: result.confidence,
        speak: false,
      };
    }

    if (now - this.hold.sinceMs < this.holdMs) {
      return {
        uncertainty: "none",
        gloss: result.gloss,
        confidence: result.confidence,
        speak: false,
      };
    }

    const cooldown = 2500;
    const already =
      this.lastSpokenGloss === result.gloss && now - this.lastSpokenAt < cooldown;
    if (already) {
      return {
        uncertainty: "none",
        gloss: result.gloss,
        confidence: result.confidence,
        speak: false,
      };
    }

    this.lastSpokenGloss = result.gloss;
    this.lastSpokenAt = now;
    this.hold = { gloss: result.gloss, sinceMs: now };
    return {
      uncertainty: "none",
      gloss: result.gloss,
      confidence: result.confidence,
      speak: true,
    };
  }
}
