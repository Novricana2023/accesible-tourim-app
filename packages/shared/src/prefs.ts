import type {
  SignLanguagePackId,
  SpeechRequest,
  SpokenSttLocale,
} from "./events.ts";
import { DEFAULT_SPEECH_IN_LOCALE } from "./events.ts";

export const DEFAULT_SPEECH_RATE = 1;
export const MIN_SPEECH_RATE = 0.5;
export const MAX_SPEECH_RATE = 2;

export function sanitizePerformanceProfile(
  value: unknown,
): "balanced" | "power-save" {
  return value === "power-save" ? "power-save" : "balanced";
}

export function clampSpeechRate(value: number): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_SPEECH_RATE;
  }
  return Math.min(MAX_SPEECH_RATE, Math.max(MIN_SPEECH_RATE, value));
}

export const DEFAULT_OCR_EMPTY_MS = 10000;
export const MIN_OCR_EMPTY_MS = 8000;
export const MAX_OCR_EMPTY_MS = 12000;

export function clampOcrEmptyAnnounceMs(value: number): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_OCR_EMPTY_MS;
  }
  return Math.min(MAX_OCR_EMPTY_MS, Math.max(MIN_OCR_EMPTY_MS, value));
}

const BCP47 = /^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*$/;

export type TextScale = "default" | "large" | "xlarge";
export type AnnouncementFrequency = "minimal" | "balanced" | "frequent";

export const DEFAULT_SPEECH_VOLUME = 1;
export const MIN_SPEECH_VOLUME = 0;
export const MAX_SPEECH_VOLUME = 1;

export function clampSpeechVolume(value: number): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_SPEECH_VOLUME;
  }
  return Math.min(MAX_SPEECH_VOLUME, Math.max(MIN_SPEECH_VOLUME, value));
}

export const DEFAULT_DETECTION_SENSITIVITY = 50;
export const MIN_DETECTION_SENSITIVITY = 0;
export const MAX_DETECTION_SENSITIVITY = 100;

export function clampDetectionSensitivity(value: number): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_DETECTION_SENSITIVITY;
  }
  return Math.min(
    MAX_DETECTION_SENSITIVITY,
    Math.max(MIN_DETECTION_SENSITIVITY, Math.round(value)),
  );
}

/** Higher sensitivity → lower score threshold → more detections. */
export function scoreThresholdFromSensitivity(sensitivity: number): number {
  const s = clampDetectionSensitivity(sensitivity) / 100;
  return 0.65 - s * 0.4;
}

export function sanitizeTextScale(value: unknown): TextScale {
  if (value === "large" || value === "xlarge") {
    return value;
  }
  return "default";
}

export function sanitizeAnnouncementFrequency(value: unknown): AnnouncementFrequency {
  if (value === "minimal" || value === "frequent") {
    return value;
  }
  return "balanced";
}

export function sanitizeSpeechInLocale(value: unknown): SpokenSttLocale {
  if (typeof value !== "string") {
    return DEFAULT_SPEECH_IN_LOCALE;
  }
  const trimmed = value.trim();
  if (!trimmed || !BCP47.test(trimmed)) {
    return DEFAULT_SPEECH_IN_LOCALE;
  }
  return trimmed;
}

export interface UserPrefs {
  ttsMode: "aria-live" | "speechSynthesis" | "both";
  mutedCategories: Array<SpeechRequest["category"]>;
  ocrEnabled: boolean;
  visualOverlay: boolean;
  signPackId: SignLanguagePackId | null;
  speechInEnginePreference: "auto" | "webspeech" | "whisper-tiny";
  /** Partner STT locale for Communicate Mode B. Separate from signPackId. */
  speechInLocale: SpokenSttLocale;
  backgroundWarnings: boolean;
  language: string;
  speechRate: number;
  /** speechSynthesis volume; browsers may ignore or clamp. */
  speechVolume: number;
  textScale: TextScale;
  highContrast: boolean;
  /** App-level motion reduction; also respects prefers-reduced-motion. */
  reduceMotion: boolean;
  announcementFrequency: AnnouncementFrequency;
  /** 0–100 UI sensitivity mapped to detector score threshold. */
  detectionSensitivity: number;
  performanceProfile: "balanced" | "power-save";
  ocrEmptyAnnounceMs: number;
  /** speechSynthesis voice URI; null = browser default for language. */
  speechVoiceUri: string | null;
  /** Default rear camera for assist modes when no device id is set. */
  preferredCameraFacingAssist: "environment" | "user";
  preferredCameraDeviceId: string | null;
}
