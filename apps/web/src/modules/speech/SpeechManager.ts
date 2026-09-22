import type {
  AnnouncementFrequency,
  DetectionResult,
  EventBus,
  OcrResult,
  SignPrediction,
  SpeechRequest,
  UserPrefs,
  WarningEvent,
} from "@mara/shared";
import { clampSpeechRate, clampSpeechVolume } from "@mara/shared";
import { resolveSpeechVoice } from "@/lib/speech/voices";
import { createId } from "@/lib/utils";
import { SceneSpeechPolicy, type SceneSpeechOptions } from "./speechPolicy";
import { OcrSpeechPolicy } from "@/modules/ocr/ocrSpeech";
import {
  SpeechPriorityQueue,
  type AnnounceHandler,
  type SpeechLifecycleHandler,
} from "./SpeechPriorityQueue";
import type { SpeechOutput } from "./TtsAdapter";
import { TtsAdapter } from "./TtsAdapter";

export interface SpeechManagerDeps {
  tts?: SpeechOutput;
  getPrefs: () => UserPrefs;
  onAnnounce: AnnounceHandler;
  policy?: SceneSpeechPolicy;
  onLifecycle?: SpeechLifecycleHandler;
}

export class SpeechManager {
  private readonly queue: SpeechPriorityQueue;
  private readonly policy: SceneSpeechPolicy;
  private readonly ocrPolicy: OcrSpeechPolicy;
  private readonly getPrefs: () => UserPrefs;
  private bus: EventBus | null = null;
  private pathAssistanceActive = false;

  constructor(deps: SpeechManagerDeps) {
    this.policy = deps.policy ?? new SceneSpeechPolicy();
    this.ocrPolicy = new OcrSpeechPolicy();
    this.getPrefs = deps.getPrefs;
    this.queue = new SpeechPriorityQueue(
      deps.tts ?? new TtsAdapter(),
      deps.getPrefs,
      deps.onAnnounce,
      deps.onLifecycle ?? ((type, id) => this.emitLifecycle(type, id)),
    );
  }

  enqueue(request: SpeechRequest): void {
    this.queue.enqueue(request);
  }

  setPathAssistanceActive(active: boolean): void {
    this.pathAssistanceActive = active;
  }

  isPathAssistanceActive(): boolean {
    return this.pathAssistanceActive;
  }

  ingestDetections(result: DetectionResult, now = result.timestampMs): void {
    if (this.pathAssistanceActive) {
      return;
    }
    if (result.objects.length === 0) {
      return;
    }
    const requests = this.policy.requestsFromTracks(result.objects, now);
    for (const request of requests) {
      this.queue.enqueue(request);
    }
  }

  ingestWarning(warning: WarningEvent): void {
    this.queue.enqueue(this.policy.requestFromWarning(warning));
  }

  cancel(category?: SpeechRequest["category"]): void {
    this.queue.cancel(category);
  }

  pause(): void {
    this.queue.pause();
  }

  pauseForBargeIn(): void {
    this.queue.pauseNonSafety();
  }

  resume(): void {
    this.queue.resume();
  }

  isSpeaking(): boolean {
    return this.queue.isSpeaking();
  }

  getLastSpokenText(): string {
    return this.queue.getLastSpokenText();
  }

  setRate(rate: number): void {
    this.queue.setRate(clampSpeechRate(rate));
  }

  setVolume(volume: number): void {
    this.queue.setVolume(clampSpeechVolume(volume));
  }

  setVoiceUri(uri: string | null, languageHint: string): void {
    this.queue.setVoice(resolveSpeechVoice(uri, languageHint));
  }

  setAnnouncementFrequency(level: AnnouncementFrequency): void {
    const presets: Record<AnnouncementFrequency, SceneSpeechOptions> = {
      minimal: {
        safetyCooldownMs: 6000,
        personVehicleCooldownMs: 12000,
        accessCooldownMs: 12000,
        sceneCooldownMs: 20000,
        infoCooldownMs: 24000,
        sceneRateLimitMs: 8000,
      },
      balanced: {},
      frequent: {
        safetyCooldownMs: 2500,
        personVehicleCooldownMs: 5000,
        accessCooldownMs: 5000,
        sceneCooldownMs: 6000,
        infoCooldownMs: 8000,
        sceneRateLimitMs: 2000,
      },
    };
    this.policy.updateOptions(presets[level]);
  }

  primeAudio(): void {
    const prefs = this.getPrefs();
    if (prefs.ttsMode === "aria-live") {
      return;
    }
    this.queue.getTts().prime?.();
  }

  testSignSpeechOutput(): void {
    this.primeAudio();
    this.announceSystem(
      "Tasfiri speech is working. Signed words will be spoken like this.",
      false,
    );
  }

  ingestSign(prediction: SignPrediction): void {
    if (!prediction.spokenText.trim()) {
      return;
    }
    if (prediction.confidence < 0.65) {
      return;
    }
    this.enqueue({
      id: createId(),
      priority: 5,
      text: prediction.spokenText,
      interrupt: false,
      category: "sign",
      dedupeKey: `sign:${prediction.packId}:${prediction.gloss}`,
      cooldownMs: 2500,
      createdMs: prediction.endedMs,
      rank: 5,
    });
  }

  ingestOcr(result: OcrResult, now = Date.now()): void {
    this.ocrPolicy.setEmptyAnnounceMs(this.getEmptyMs());
    const requests = this.ocrPolicy.requestsFromResult(result, now);
    for (const request of requests) {
      this.queue.enqueue(request);
    }
  }

  resetOcr(): void {
    this.ocrPolicy.reset();
  }

  reset(): void {
    this.policy.reset();
    this.ocrPolicy.reset();
  }

  resetScene(): void {
    this.reset();
  }

  attach(bus: EventBus): () => void {
    this.bus = bus;
    return bus.subscribe((event) => {
      if (event.type === "feature-unavailable") {
        this.announceSystem(event.reason, false);
        return;
      }
      if (event.type === "speech-request") {
        this.enqueue(event.request);
        return;
      }
      if (event.type === "warning") {
        this.ingestWarning(event.warning);
        return;
      }
      if (event.type === "ocr") {
        this.ingestOcr(event.result);
        return;
      }
      if (event.type === "sign") {
        this.ingestSign(event.prediction);
        return;
      }
      if (event.type === "tracks") {
        this.ingestDetections({
          frameId: 0,
          timestampMs: Date.now(),
          objects: event.objects,
          inferenceMs: 0,
          backend: "wasm",
        });
      }
    });
  }

  announceSystem(text: string, interrupt = false): SpeechRequest {
    const request: SpeechRequest = {
      id: createId(),
      priority: 6,
      text,
      interrupt,
      category: "system",
      dedupeKey: `system:${text}`,
      cooldownMs: 0,
      createdMs: Date.now(),
    };
    this.enqueue(request);
    return request;
  }

  announceUser(text: string): SpeechRequest {
    const request: SpeechRequest = {
      id: createId(),
      priority: 2,
      text,
      interrupt: false,
      category: "user",
      dedupeKey: `user:${text}`,
      cooldownMs: 0,
      createdMs: Date.now(),
    };
    this.enqueue(request);
    return request;
  }

  getQueue(): SpeechPriorityQueue {
    return this.queue;
  }

  isSpeakingSafety(): boolean {
    const current = this.queue.getCurrent();
    if (!current) {
      return false;
    }
    return (
      current.rank === 1 ||
      current.priority === 0 ||
      current.category === "hazard"
    );
  }

  private emitLifecycle(type: "speech-started" | "speech-ended", id: string): void {
    this.bus?.emit({ type, id });
  }

  private getEmptyMs(): number {
    return this.getPrefs().ocrEmptyAnnounceMs;
  }
}
