import type { SignLanguagePackId } from "@mara/shared";
import { APP_NAME } from "@/app/brand";
import type { CameraService } from "@/modules/camera/CameraService";

export interface SignVocabEntry {
  gloss: string;
  spokenText: string;
}

export interface SignPackManifest {
  packId: SignLanguagePackId;
  label: string;
  experimental: true;
  description: string;
  vocabulary: SignVocabEntry[];
}

export type SignUncertainty =
  | "none"
  | "uncertain"
  | "not-recognized"
  | "pack-not-loaded";

export type SignRuntimeStatus = "idle" | "loading" | "live" | "unavailable";

export interface LandmarkFrame {
  timestampMs: number;
  hands: number[][];
  handedness: Array<"Left" | "Right" | "unknown">;
}

export interface SignClassifierResult {
  gloss: string;
  confidence: number;
}

export interface SignClassifier {
  readonly id: string;
  load(): Promise<{ ok: true } | { ok: false; reason: string }>;
  predict(sequence: LandmarkFrame[]): Promise<SignClassifierResult | null>;
  dispose(): Promise<void>;
}

export interface LandmarkExtractor {
  start(
    onLandmarks: (frame: LandmarkFrame) => void,
    onError: (reason: string) => void,
  ): Promise<void>;
  attachCamera?(camera: CameraService): void;
  ingestBitmap?(
    bitmap: ImageBitmap,
    frameId: number,
    timestampMs: number,
  ): Promise<void>;
  setTargetFps?(fps: number): void;
  stop(): Promise<void>;
}

export const SPEAK_CONFIDENCE = 0.75;
export const UNCERTAIN_CONFIDENCE = 0.5;
export const HOLD_MS = 400;
export const SEQUENCE_FRAMES = 24;
export const CLASSIFY_EVERY = 2;

export const CLASSIFIER_MISSING_REASON =
  `Sign-language pack is not loaded. No trained classifier weights were found. ${APP_NAME} will not guess signs.`;

export const LANDMARKS_MISSING_REASON =
  `Hand tracking is unavailable. MediaPipe assets failed to load. ${APP_NAME} will not guess signs.`;

export const EXPERIMENTAL_BANNER =
  "Experimental. One sign at a time from the vocabulary list only — not full sentence translation. When trained weights are missing, Tasfiri uses basic hand-shape detection for ASL (HELP works best: closed fist on flat palm, both hands visible).";

export const SIGN_SPOKEN_OUTPUT_HINT =
  "For the partner to hear words aloud: Settings → Spoken output → Device voice or Both, and turn volume up on the phone.";
