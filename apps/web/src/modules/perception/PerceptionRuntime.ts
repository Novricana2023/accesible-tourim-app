import type {
  CameraFrame,
  DetectionResult,
  EventBus,
  OcrResult,
  SpeechRequest,
} from "@mara/shared";
import { createId } from "@/lib/utils";
import type { CameraService } from "@/modules/camera/CameraService";
import type { DetectionProvider } from "./DetectionProvider";
import { createDetectionProvider } from "./providers";
import { IoUTracker } from "./tracker";
import {
  fpsFromInterval,
  nextSmallerInputSize,
  startingInputSize,
  targetDetectionIntervalMs,
  type DetectionInputSize,
  type DeviceClass,
  type PerformanceProfile,
} from "./adaptiveScheduler";

export type PerceptionStatus = "idle" | "loading" | "live" | "paused" | "unavailable";

export interface VisionLoopState {
  status: PerceptionStatus;
  running: boolean;
  paused: boolean;
  framesProcessed: number;
  backend: "webgpu" | "wasm" | null;
  inputSize: DetectionInputSize;
  targetFps: number;
  lastInferenceMs: number | null;
  objectCount: number;
  powerSave: boolean;
}

export interface VisibilitySource {
  hidden(): boolean;
  subscribe(listener: () => void): () => void;
}

export interface PerceptionRuntimeDeps {
  bus: EventBus;
  createProvider?: (
    backend: "webgpu" | "wasm",
  ) => Promise<DetectionProvider>;
  now?: () => number;
  visibility?: VisibilitySource;
}

export interface PerceptionStartOptions {
  profile?: PerformanceProfile;
  backgroundWarnings?: boolean;
  isSpeakingSafety?: () => boolean;
  deviceClass?: DeviceClass;
}

const CONSUMER_ID = "perception";
const SLOW_INFER_MS = 300;
const SLOW_HOLD_MS = 5000;
const FAIL_BEFORE_ANNOUNCE = 3;

function defaultVisibility(): VisibilitySource {
  return {
    hidden: () => typeof document !== "undefined" && document.hidden,
    subscribe: (listener) => {
      if (typeof document === "undefined") {
        return () => {
          /* no document */
        };
      }
      document.addEventListener("visibilitychange", listener);
      return () => document.removeEventListener("visibilitychange", listener);
    },
  };
}

export class PerceptionRuntime {
  private readonly bus: EventBus;
  private readonly createProvider: (
    backend: "webgpu" | "wasm",
  ) => Promise<DetectionProvider>;
  private readonly now: () => number;
  private readonly visibility: VisibilitySource;
  private readonly tracker = new IoUTracker();
  private readonly resultListeners = new Set<(result: DetectionResult) => void>();
  private readonly statusListeners = new Set<(status: PerceptionStatus) => void>();
  private readonly loopListeners = new Set<(state: VisionLoopState) => void>();
  private provider: DetectionProvider | null = null;
  private unsubscribe: (() => void) | null = null;
  private unsubVisibility: (() => void) | null = null;
  private camera: CameraService | null = null;
  private status: PerceptionStatus = "idle";
  private backend: "webgpu" | "wasm" = "wasm";
  private lastResult: DetectionResult | null = null;
  private ocrEnabled = true;
  private readNowHandler: (() => Promise<OcrResult>) | null = null;
  private unavailableReason: string | null = null;
  private profile: PerformanceProfile = "balanced";
  private deviceClass: DeviceClass = "desktop";
  private backgroundWarnings = false;
  private isSpeakingSafety: () => boolean = () => false;
  private inputSize: DetectionInputSize = 640;
  private startedInputSize: DetectionInputSize = 640;
  private targetIntervalMs = 1000 / 12;
  private framesProcessed = 0;
  private slowSinceMs: number | null = null;
  private droppedInputSize = false;
  private floorAnnounced = false;
  private consecutiveFailures = 0;
  private failureAnnounced = false;
  private scoreThreshold = 0.45;

  constructor(deps: PerceptionRuntimeDeps) {
    this.bus = deps.bus;
    this.createProvider = deps.createProvider ?? createDetectionProvider;
    this.now = deps.now ?? (() => performance.now());
    this.visibility = deps.visibility ?? defaultVisibility();
  }

  getStatus(): PerceptionStatus {
    return this.status;
  }

  getLastResult(): DetectionResult | null {
    return this.lastResult;
  }

  getUnavailableReason(): string | null {
    return this.unavailableReason;
  }

  getLoopState(): VisionLoopState {
    const paused = this.status === "paused";
    return {
      status: this.status,
      running: this.status === "live" || this.status === "loading" || paused,
      paused,
      framesProcessed: this.framesProcessed,
      backend: this.lastResult?.backend ?? (this.provider ? this.backend : null),
      inputSize: this.inputSize,
      targetFps: fpsFromInterval(this.targetIntervalMs),
      lastInferenceMs: this.lastResult?.inferenceMs ?? null,
      objectCount: this.lastResult?.objects.length ?? 0,
      powerSave:
        this.profile === "power-save" ||
        this.droppedInputSize ||
        this.inputSize < this.startedInputSize,
    };
  }

  getFramesProcessed(): number {
    return this.framesProcessed;
  }

  getTargetIntervalMs(): number {
    return this.targetIntervalMs;
  }

  subscribeResults(listener: (result: DetectionResult) => void): () => void {
    this.resultListeners.add(listener);
    if (this.lastResult) {
      listener(this.lastResult);
    }
    return () => {
      this.resultListeners.delete(listener);
    };
  }

  subscribeStatus(listener: (status: PerceptionStatus) => void): () => void {
    this.statusListeners.add(listener);
    listener(this.status);
    return () => {
      this.statusListeners.delete(listener);
    };
  }

  subscribeLoop(listener: (state: VisionLoopState) => void): () => void {
    this.loopListeners.add(listener);
    listener(this.getLoopState());
    return () => {
      this.loopListeners.delete(listener);
    };
  }

  setOcrEnabled(enabled: boolean): void {
    this.ocrEnabled = enabled;
  }

  setScoreThreshold(threshold: number): void {
    if (!Number.isFinite(threshold)) {
      return;
    }
    this.scoreThreshold = Math.min(0.9, Math.max(0.15, threshold));
    this.provider?.configureScoreThreshold?.(this.scoreThreshold);
  }

  setReadNowHandler(handler: (() => Promise<OcrResult>) | null): void {
    this.readNowHandler = handler;
  }

  setProfile(profile: PerformanceProfile): void {
    this.profile = profile;
    if (this.status === "live" || this.status === "paused") {
      const nextSize = startingInputSize(profile, this.startedInputSize, this.deviceClass);
      if (nextSize !== this.inputSize) {
        this.applyInputSize(
          nextSize,
          nextSize < this.startedInputSize
            ? `Detection input size is ${nextSize} for this device profile.`
            : `Power-save profile is on. Detection input size is ${nextSize}.`,
        );
      }
      if (this.lastResult) {
        this.adaptInterval(this.lastResult.inferenceMs, false);
      }
      this.emitLoop();
    }
  }

  setDeviceClass(deviceClass: DeviceClass): void {
    this.deviceClass = deviceClass;
  }

  setBackgroundWarnings(enabled: boolean): void {
    this.backgroundWarnings = enabled;
    this.syncVisibility();
  }

  setSpeakingSafety(isSpeakingSafety: () => boolean): void {
    this.isSpeakingSafety = isSpeakingSafety;
  }

  async readNow(): Promise<OcrResult> {
    if (!this.ocrEnabled) {
      this.bus.emit({
        type: "feature-unavailable",
        feature: "ocr",
        reason: "Reading is turned off in Settings.",
      });
      throw new Error("Reading is turned off.");
    }
    if (!this.readNowHandler) {
      this.bus.emit({
        type: "feature-unavailable",
        feature: "ocr",
        reason: "Reading is not running. Start reading first.",
      });
      throw new Error("Reading is not running.");
    }
    return this.readNowHandler();
  }

  async start(
    camera: CameraService,
    preferredBackend: "webgpu" | "wasm",
    options: PerceptionStartOptions = {},
  ): Promise<void> {
    await this.stop();
    this.setStatus("loading");
    this.camera = camera;
    this.tracker.reset();
    this.profile = options.profile ?? "balanced";
    this.deviceClass = options.deviceClass ?? "desktop";
    this.backgroundWarnings = options.backgroundWarnings ?? false;
    this.isSpeakingSafety = options.isSpeakingSafety ?? (() => false);
    this.framesProcessed = 0;
    this.slowSinceMs = null;
    this.droppedInputSize = false;
    this.floorAnnounced = false;
    this.consecutiveFailures = 0;
    this.failureAnnounced = false;

    try {
      this.provider = await this.createProvider(preferredBackend);
      const loaded = await this.provider.load();
      this.backend = loaded.backend;
      this.startedInputSize = this.provider.inputSize;
      this.inputSize = startingInputSize(
        this.profile,
        this.provider.inputSize,
        this.deviceClass,
      );
      if (this.inputSize !== this.provider.inputSize) {
        this.provider.configureInputSize?.(this.inputSize);
        this.announceSystem(
          this.deviceClass === "mobile"
            ? `Mobile profile is on. Detection input size is ${this.inputSize}.`
            : `Power-save profile is on. Detection input size is ${this.inputSize}.`,
        );
      }
      this.syncCaptureBudget();
      const interval = targetDetectionIntervalMs(
        0,
        this.profile,
        this.backend,
        this.deviceClass,
      );
      this.applyInterval(interval);
      this.subscribeFrames();
      this.unsubVisibility = this.visibility.subscribe(() => this.syncVisibility());
      this.setStatus("live");
      this.syncVisibility();
    } catch (error) {
      this.unavailableReason =
        error instanceof Error
          ? error.message
          : "Object detection failed to start.";
      this.setStatus("unavailable");
      this.bus.emit({
        type: "feature-unavailable",
        feature: "detection",
        reason: this.unavailableReason,
      });
      throw error;
    }
  }

  async stop(): Promise<void> {
    this.unsubVisibility?.();
    this.unsubVisibility = null;
    this.unsubscribeFrames();
    this.camera?.setCaptureBudget?.("perception", null);
    this.camera = null;
    if (this.provider) {
      await this.provider.dispose();
      this.provider = null;
    }
    this.tracker.reset();
    this.lastResult = null;
    this.unavailableReason = null;
    this.framesProcessed = 0;
    this.slowSinceMs = null;
    this.droppedInputSize = false;
    this.floorAnnounced = false;
    this.consecutiveFailures = 0;
    this.failureAnnounced = false;
    this.setStatus("idle");
  }

  pauseInference(reason?: string): void {
    if (this.status !== "live" || !this.provider) {
      return;
    }
    this.unsubscribeFrames();
    this.setStatus("paused");
    if (reason) {
      this.announceSystem(reason);
    }
  }

  resumeInference(): void {
    if (this.status !== "paused" || !this.provider || !this.camera) {
      return;
    }
    this.subscribeFrames();
    this.setStatus("live");
  }

  private subscribeFrames(): void {
    if (!this.camera || this.unsubscribe) {
      return;
    }
    this.unsubscribe = this.camera.subscribe(
      CONSUMER_ID,
      fpsFromInterval(this.targetIntervalMs),
      (frame) => this.onFrame(frame),
    );
  }

  private unsubscribeFrames(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
  }

  private syncVisibility(): void {
    if (!this.provider) {
      return;
    }
    const hidden = this.visibility.hidden();
    if (hidden && !this.backgroundWarnings && this.status === "live") {
      this.pauseInference(
        "The tab is in the background. Object detection is paused to save power.",
      );
      return;
    }
    if (!hidden && this.status === "paused") {
      this.resumeInference();
    }
  }

  private async onFrame(frame: CameraFrame): Promise<void> {
    if (!this.provider || this.status !== "live") {
      try {
        frame.bitmap.close();
      } catch {
        /* ignore */
      }
      return;
    }

    try {
      const inferred = await this.provider.infer(frame);
      if (!this.provider || this.status !== "live") {
        return;
      }
      this.consecutiveFailures = 0;
      this.backend = inferred.backend;
      const objects = this.tracker.update(inferred.detections, this.now());
      this.framesProcessed += 1;
      const result: DetectionResult = {
        frameId: frame.frameId,
        timestampMs: frame.timestampMs,
        objects,
        inferenceMs: inferred.inferenceMs,
        backend: inferred.backend,
        inputSize: this.inputSize,
      };
      this.lastResult = result;
      this.bus.emit({ type: "tracks", objects });
      for (const listener of this.resultListeners) {
        listener(result);
      }
      const speakingSafety = this.isSpeakingSafety();
      this.adaptInterval(inferred.inferenceMs, speakingSafety);
      if (!speakingSafety) {
        this.maybeReduceInputSize(inferred.inferenceMs);
      }
      this.emitLoop();
    } catch (error) {
      this.consecutiveFailures += 1;
      if (this.consecutiveFailures >= FAIL_BEFORE_ANNOUNCE && !this.failureAnnounced) {
        this.failureAnnounced = true;
        const detail =
          error instanceof Error ? error.message : "The detector reported an error.";
        this.unavailableReason = `Object detection failed. ${detail}`;
        this.bus.emit({
          type: "feature-unavailable",
          feature: "detection",
          reason: this.unavailableReason,
        });
        if (!this.lastResult) {
          this.unsubscribeFrames();
          this.setStatus("unavailable");
        }
      }
    }
  }

  private adaptInterval(inferMs: number, speakingSafety: boolean): void {
    if (!this.camera || speakingSafety) {
      return;
    }
    this.applyInterval(
      targetDetectionIntervalMs(inferMs, this.profile, this.backend, this.deviceClass),
    );
  }

  private applyInterval(intervalMs: number): void {
    this.targetIntervalMs = intervalMs;
    this.camera?.setSubscriberFps(CONSUMER_ID, fpsFromInterval(intervalMs));
  }

  private maybeReduceInputSize(inferMs: number): void {
    const now = this.now();
    if (inferMs > SLOW_INFER_MS) {
      this.slowSinceMs ??= now;
      if (now - this.slowSinceMs < SLOW_HOLD_MS) {
        return;
      }
      const next = nextSmallerInputSize(this.inputSize);
      if (next) {
        this.droppedInputSize = true;
        this.applyInputSize(
          next,
          `Inference is slow. Input size dropped to ${next} to save power.`,
        );
        this.slowSinceMs = now;
        return;
      }
      if (!this.floorAnnounced) {
        this.announceSystem(
          "Inference is still slow at the smallest input size. Detection will stay at a lower frame rate.",
        );
        this.floorAnnounced = true;
      }
      return;
    }
    this.slowSinceMs = null;
  }

  private applyInputSize(size: DetectionInputSize, announcement: string): void {
    if (this.inputSize === size) {
      return;
    }
    this.inputSize = size;
    this.provider?.configureInputSize?.(size);
    this.syncCaptureBudget();
    this.announceSystem(announcement);
  }

  private syncCaptureBudget(): void {
    this.camera?.setCaptureBudget?.("perception", this.inputSize);
  }

  private announceSystem(text: string): void {
    const request: SpeechRequest = {
      id: createId(),
      priority: 6,
      text,
      interrupt: false,
      category: "system",
      dedupeKey: `system:${text}`,
      cooldownMs: 8000,
      createdMs: Date.now(),
    };
    this.bus.emit({ type: "speech-request", request });
  }

  private setStatus(status: PerceptionStatus): void {
    this.status = status;
    for (const listener of this.statusListeners) {
      listener(status);
    }
    this.emitLoop();
  }

  private emitLoop(): void {
    const state = this.getLoopState();
    for (const listener of this.loopListeners) {
      listener(state);
    }
  }
}
