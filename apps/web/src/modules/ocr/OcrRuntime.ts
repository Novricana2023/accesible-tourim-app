import type { CameraFrame, EventBus, OcrRegion, OcrResult } from "@mara/shared";
import { createId } from "@/lib/utils";
import type { CameraService } from "@/modules/camera/CameraService";
import {
  mergeNearbyRegions,
  ocrDedupeKey,
  selectReadableText,
  type OcrBox,
} from "./ocrGeometry";
import type { OcrProvider } from "./TesseractOcrProvider";
import { TesseractOcrProvider } from "./TesseractOcrProvider";

export type OcrStatus = "idle" | "loading" | "live" | "paused" | "unavailable";

export interface OcrRuntimeDeps {
  bus: EventBus;
  createProvider?: () => OcrProvider;
  visibility?: {
    hidden(): boolean;
    subscribe(listener: () => void): () => void;
  };
}

export interface OcrStartOptions {
  language?: string;
  fps?: number;
  backgroundWarnings?: boolean;
  shouldPause?: () => boolean;
}

const CONSUMER_ID = "ocr";
const FAIL_BEFORE_ANNOUNCE = 3;

function defaultVisibility() {
  return {
    hidden: () => typeof document !== "undefined" && document.hidden,
    subscribe: (listener: () => void) => {
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

export class OcrRuntime {
  private readonly bus: EventBus;
  private readonly createProvider: () => OcrProvider;
  private readonly visibility: NonNullable<OcrRuntimeDeps["visibility"]>;
  private readonly resultListeners = new Set<(result: OcrResult) => void>();
  private readonly statusListeners = new Set<(status: OcrStatus) => void>();
  private provider: OcrProvider | null = null;
  private camera: CameraService | null = null;
  private unsubscribe: (() => void) | null = null;
  private unsubVisibility: (() => void) | null = null;
  private status: OcrStatus = "idle";
  private lastResult: OcrResult | null = null;
  private unavailableReason: string | null = null;
  private backgroundWarnings = false;
  private shouldPause: () => boolean = () => false;
  private fps = 1.5;
  private lastKey = "";
  private stableFrames = 0;
  private framesProcessed = 0;
  private job = 0;
  private consecutiveFailures = 0;
  private failureAnnounced = false;
  private demandWaiters: Array<{
    resolve: (result: OcrResult) => void;
    reject: (error: Error) => void;
  }> = [];
  private language = "eng";

  constructor(deps: OcrRuntimeDeps) {
    this.bus = deps.bus;
    this.createProvider = deps.createProvider ?? (() => new TesseractOcrProvider());
    this.visibility = deps.visibility ?? defaultVisibility();
  }

  getStatus(): OcrStatus {
    return this.status;
  }

  getLastResult(): OcrResult | null {
    return this.lastResult;
  }

  getUnavailableReason(): string | null {
    return this.unavailableReason;
  }

  getLanguage(): string {
    return this.language;
  }

  getFramesProcessed(): number {
    return this.framesProcessed;
  }

  subscribeResults(listener: (result: OcrResult) => void): () => void {
    this.resultListeners.add(listener);
    if (this.lastResult) {
      listener(this.lastResult);
    }
    return () => {
      this.resultListeners.delete(listener);
    };
  }

  subscribeStatus(listener: (status: OcrStatus) => void): () => void {
    this.statusListeners.add(listener);
    listener(this.status);
    return () => {
      this.statusListeners.delete(listener);
    };
  }

  setBackgroundWarnings(enabled: boolean): void {
    this.backgroundWarnings = enabled;
    this.syncVisibility();
  }

  setShouldPause(shouldPause: () => boolean): void {
    this.shouldPause = shouldPause;
  }

  async start(camera: CameraService, options: OcrStartOptions = {}): Promise<void> {
    await this.stop();
    this.setStatus("loading");
    this.camera = camera;
    this.backgroundWarnings = options.backgroundWarnings ?? false;
    this.shouldPause = options.shouldPause ?? (() => false);
    this.fps = options.fps ?? 1.5;
    this.framesProcessed = 0;
    this.lastKey = "";
    this.stableFrames = 0;
    this.consecutiveFailures = 0;
    this.failureAnnounced = false;
    this.job += 1;
    const job = this.job;

    try {
      this.provider = this.createProvider();
      const loaded = await this.provider.load(options.language ?? "en");
      if (job !== this.job) {
        await this.provider.dispose();
        this.provider = null;
        return;
      }
      this.language = loaded.language;
      this.camera.setCaptureBudget?.("ocr", 960);
      this.subscribeFrames();
      this.unsubVisibility = this.visibility.subscribe(() => this.syncVisibility());
      this.setStatus("live");
      this.syncVisibility();
    } catch (error) {
      this.unavailableReason =
        error instanceof Error ? error.message : "Reading failed to start.";
      this.setStatus("unavailable");
      this.bus.emit({
        type: "feature-unavailable",
        feature: "ocr",
        reason: this.unavailableReason,
      });
      throw error;
    }
  }

  async stop(): Promise<void> {
    this.job += 1;
    this.unsubVisibility?.();
    this.unsubVisibility = null;
    this.unsubscribeFrames();
    this.camera?.setCaptureBudget?.("ocr", null);
    this.camera = null;
    this.failDemand(new Error("Reading was stopped."));
    if (this.provider) {
      await this.provider.dispose();
      this.provider = null;
    }
    this.lastResult = null;
    this.unavailableReason = null;
    this.framesProcessed = 0;
    this.lastKey = "";
    this.stableFrames = 0;
    this.consecutiveFailures = 0;
    this.failureAnnounced = false;
    this.setStatus("idle");
  }

  async readNow(): Promise<OcrResult> {
    if (this.status !== "live" && this.status !== "paused") {
      this.bus.emit({
        type: "feature-unavailable",
        feature: "ocr",
        reason: "Reading is not running. Start reading first.",
      });
      throw new Error("Reading is not running.");
    }
    return new Promise<OcrResult>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.demandWaiters = this.demandWaiters.filter((waiter) => waiter.resolve !== resolve);
        reject(new Error("Reading timed out."));
      }, 20000);
      this.demandWaiters.push({
        resolve: (result) => {
          clearTimeout(timeout);
          resolve(result);
        },
        reject: (error) => {
          clearTimeout(timeout);
          reject(error);
        },
      });
    });
  }

  private subscribeFrames(): void {
    if (!this.camera || this.unsubscribe) {
      return;
    }
    this.unsubscribe = this.camera.subscribe(CONSUMER_ID, this.fps, (frame) =>
      this.onFrame(frame),
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
      this.unsubscribeFrames();
      this.setStatus("paused");
      return;
    }
    if (!hidden && this.status === "paused") {
      this.subscribeFrames();
      this.setStatus("live");
    }
  }

  private async onFrame(frame: CameraFrame): Promise<void> {
    const job = this.job;
    if (!this.provider || this.status !== "live") {
      try {
        frame.bitmap.close();
      } catch {
        /* ignore */
      }
      return;
    }
    if (this.shouldPause()) {
      try {
        frame.bitmap.close();
      } catch {
        /* ignore */
      }
      return;
    }

    try {
      const inferred = await this.provider.recognize(frame);
      if (job !== this.job || !this.provider || this.status !== "live") {
        return;
      }
      this.consecutiveFailures = 0;
      const merged = mergeNearbyRegions(inferred.regions);
      const key = ocrDedupeKey(selectReadableText(merged));
      if (key && key === this.lastKey) {
        this.stableFrames += 1;
      } else {
        this.stableFrames = key ? 1 : 0;
        this.lastKey = key;
      }
      const regions: OcrRegion[] = merged.map((region) =>
        toRegion(region, this.stableFrames),
      );
      this.framesProcessed += 1;
      const result: OcrResult = {
        frameId: frame.frameId,
        regions,
        source: "tesseract-continuous",
        inferenceMs: inferred.inferenceMs,
      };
      this.lastResult = result;
      this.bus.emit({ type: "ocr", result });
      for (const listener of this.resultListeners) {
        listener(result);
      }
      const waiters = this.demandWaiters.splice(0);
      for (const waiter of waiters) {
        waiter.resolve(result);
      }
    } catch (error) {
      if (job !== this.job) {
        return;
      }
      this.consecutiveFailures += 1;
      if (this.consecutiveFailures >= FAIL_BEFORE_ANNOUNCE && !this.failureAnnounced) {
        this.failureAnnounced = true;
        const detail =
          error instanceof Error ? error.message : "The OCR engine reported an error.";
        this.bus.emit({
          type: "feature-unavailable",
          feature: "ocr",
          reason: `Reading failed. ${detail}`,
        });
      }
    }
  }

  private failDemand(error: Error): void {
    const waiters = this.demandWaiters.splice(0);
    for (const waiter of waiters) {
      waiter.reject(error);
    }
  }

  private setStatus(status: OcrStatus): void {
    this.status = status;
    for (const listener of this.statusListeners) {
      listener(status);
    }
  }
}

function toRegion(region: OcrBox, stableFrames: number): OcrRegion {
  return {
    id: createId(),
    box: region.box,
    text: region.text,
    confidence: region.confidence,
    stableFrames,
  };
}
