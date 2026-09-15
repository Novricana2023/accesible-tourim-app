import {
  clampDetectionSensitivity,
  clampOcrEmptyAnnounceMs,
  clampSpeechRate,
  clampSpeechVolume,
  sanitizeAnnouncementFrequency,
  sanitizePerformanceProfile,
  sanitizeSpeechInLocale,
  sanitizeTextScale,
  type UserPrefs,
} from "@mara/shared";
import { detectScreenReaderHint } from "@/a11y/ScreenReaderDetect";

export const PREFS_STORAGE_KEY = "inclusive-tourism:prefs:v2";
const LEGACY_PREFS_STORAGE_KEY = "mara:prefs:v1";

export function defaultPrefs(): UserPrefs {
  const language =
    typeof navigator !== "undefined" && navigator.language ? navigator.language : "en";
  const speechInLocale = sanitizeSpeechInLocale(
    typeof navigator !== "undefined" && navigator.language ? navigator.language : "en-US",
  );

  return {
    ttsMode: detectScreenReaderHint() ? "aria-live" : "both",
    mutedCategories: [],
    ocrEnabled: true,
    visualOverlay: false,
    signPackId: "asl",
    speechInEnginePreference: "auto",
    speechInLocale,
    backgroundWarnings: false,
    language,
    speechRate: 1,
    speechVolume: 1,
    textScale: "default",
    highContrast: false,
    reduceMotion: false,
    announcementFrequency: "balanced",
    detectionSensitivity: 50,
    performanceProfile: "balanced",
    ocrEmptyAnnounceMs: 10000,
    speechVoiceUri: null,
    preferredCameraFacingAssist: "environment",
    preferredCameraDeviceId: null,
  };
}

export interface PrefsStore {
  get(): Promise<UserPrefs>;
  set(patch: Partial<UserPrefs>): Promise<void>;
}

function normalize(raw: Partial<UserPrefs>): UserPrefs {
  const merged = { ...defaultPrefs(), ...raw };
  merged.speechRate = clampSpeechRate(merged.speechRate);
  merged.speechVolume = clampSpeechVolume(merged.speechVolume);
  merged.detectionSensitivity = clampDetectionSensitivity(merged.detectionSensitivity);
  merged.performanceProfile = sanitizePerformanceProfile(merged.performanceProfile);
  merged.ocrEmptyAnnounceMs = clampOcrEmptyAnnounceMs(merged.ocrEmptyAnnounceMs);
  merged.speechInLocale = sanitizeSpeechInLocale(merged.speechInLocale);
  merged.textScale = sanitizeTextScale(merged.textScale);
  merged.announcementFrequency = sanitizeAnnouncementFrequency(merged.announcementFrequency);
  if (merged.preferredCameraFacingAssist !== "user") {
    merged.preferredCameraFacingAssist = "environment";
  }
  if (merged.preferredCameraDeviceId === "") {
    merged.preferredCameraDeviceId = null;
  }
  return merged;
}

function readStored(): UserPrefs | null {
  try {
    let raw = localStorage.getItem(PREFS_STORAGE_KEY);
    if (!raw) {
      raw = localStorage.getItem(LEGACY_PREFS_STORAGE_KEY);
    }
    if (!raw) {
      return null;
    }
    return normalize(JSON.parse(raw) as Partial<UserPrefs>);
  } catch {
    return null;
  }
}

export function createPrefsStore(): PrefsStore {
  return {
    async get() {
      return readStored() ?? defaultPrefs();
    },
    async set(patch) {
      const next = normalize({ ...(readStored() ?? defaultPrefs()), ...patch });
      localStorage.setItem(PREFS_STORAGE_KEY, JSON.stringify(next));
    },
  };
}
