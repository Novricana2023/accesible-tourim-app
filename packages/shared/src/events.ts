export type Mode = "assist" | "communicate" | "idle";

export type Capability =
  | "webgpu"
  | "wasm-simd"
  | "camera"
  | "mic"
  | "speech-recognition"
  | "speech-synthesis"
  | "geolocation"
  | "orientation";

export type DeviceClass = "desktop" | "mobile";

export interface CapabilityReport {
  available: Record<Capability, boolean>;
  inferenceBackend: "webgpu" | "wasm" | "unavailable";
  speechInEngine: "webspeech" | "whisper-tiny" | "unavailable";
  notes: string[];
  deviceClass?: DeviceClass;
}

export interface CameraFrame {
  frameId: number;
  timestampMs: number;
  width: number;
  height: number;
  bitmap: ImageBitmap;
}

export type HorizontalZone = "left" | "center" | "right";
export type DepthBand = "near" | "mid" | "far";
export type MotionHint =
  | "approaching"
  | "receding"
  | "crossing"
  | "stationary"
  | "unknown";

export interface DetectedObject {
  trackId: string;
  label: string;
  confidence: number;
  box: { x: number; y: number; w: number; h: number };
  zone: HorizontalZone;
  depth: DepthBand;
  motion: MotionHint;
  firstSeenMs: number;
  lastSeenMs: number;
}

export interface DetectionResult {
  frameId: number;
  timestampMs: number;
  objects: DetectedObject[];
  inferenceMs: number;
  backend: "webgpu" | "wasm";
  inputSize?: 320 | 416 | 640;
}

export type WarningSeverity = 0 | 1 | 2;

export interface WarningEvent {
  id: string;
  trackId: string;
  severity: WarningSeverity;
  code: "obstacle-near" | "obstacle-approaching" | "crossing-path" | "lost-track";
  label: string;
  zone: HorizontalZone;
  depth: DepthBand;
  utterance: string;
  createdMs: number;
}

export interface OcrRegion {
  id: string;
  box: { x: number; y: number; w: number; h: number };
  text: string;
  confidence: number;
  stableFrames: number;
}

export interface OcrResult {
  frameId: number;
  regions: OcrRegion[];
  source: "onnx-continuous" | "onnx-demand" | "tesseract-continuous" | "tesseract-demand" | "backend-document";
  inferenceMs?: number;
}

export type SpeechPriority = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/** User-facing Assist ranks. 1 is immediate safety; 5 is informational. */
export type SpeechRank = 1 | 2 | 3 | 4 | 5;

export interface SpeechRequest {
  id: string;
  priority: SpeechPriority;
  text: string;
  interrupt: boolean;
  category: "hazard" | "safety" | "user" | "nav" | "scene" | "sign" | "system";
  dedupeKey: string;
  cooldownMs: number;
  createdMs: number;
  rank?: SpeechRank;
}

export interface NavigationState {
  active: boolean;
  destinationLabel: string;
  nextInstruction: string;
  distanceMetersToStep: number | null;
  bearingDegrees: number | null;
  rerouteRequired: boolean;
}

export type SignLanguagePackId = "asl" | "sasl" | "bsl";

/** BCP-47 tag for partner speech recognition. Independent of the sign pack. */
export type SpokenSttLocale = string;

export const SIGN_LANGUAGE_PACK_IDS = ["asl", "sasl", "bsl"] as const satisfies readonly SignLanguagePackId[];

export const SUPPORTED_SPEECH_IN_LOCALES = ["en-US", "en-GB", "en-ZA"] as const;

export const DEFAULT_SPEECH_IN_LOCALE: SpokenSttLocale = "en-US";

/**
 * Adding a language later is a new sign pack plus an STT locale.
 * It is not a rewrite of Communicate.
 */
export interface CommunicationLanguageConfig {
  signPackId: SignLanguagePackId;
  spokenSttLocale: SpokenSttLocale;
}

export interface SignPrediction {
  packId: SignLanguagePackId;
  gloss: string;
  spokenText: string;
  confidence: number;
  kind: "isolated" | "fingerspell";
  startedMs: number;
  endedMs: number;
}

export interface CommunicationTurn {
  id: string;
  from: "signer" | "speaker";
  text: string;
  createdMs: number;
}

export type AssistCommandName =
  | "start-vision"
  | "stop"
  | "start-reading"
  | "stop-reading"
  | "start-navigation"
  | "stop-navigation";

export interface AssistCommand {
  name: AssistCommandName;
  rawTranscript: string;
  confidence: number;
}

export type RuntimeEvent =
  | { type: "capabilities"; report: CapabilityReport }
  | { type: "tracks"; objects: DetectedObject[] }
  | { type: "warning"; warning: WarningEvent }
  | { type: "ocr"; result: OcrResult }
  | { type: "speech-request"; request: SpeechRequest }
  | { type: "speech-started"; id: string }
  | { type: "speech-ended"; id: string }
  | { type: "navigation"; state: NavigationState }
  | { type: "sign"; prediction: SignPrediction }
  | { type: "communication-turn"; turn: CommunicationTurn }
  | { type: "assist-command"; command: AssistCommand }
  | { type: "feature-unavailable"; feature: string; reason: string };

export interface EventBus {
  emit(event: RuntimeEvent): void;
  subscribe(handler: (event: RuntimeEvent) => void): () => void;
}
